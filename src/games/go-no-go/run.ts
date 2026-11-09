import type { SoundEffect } from '@/core/audio/types';
import type { Rng } from '@/games/memory/random';
import { getDemoClipPaths, getDemoScript, type DemoAction, type DemoHand } from './demo';
import {
  createGoNoGoGame,
  createTrialPlan,
  getHeldSpeedSeconds,
  interruptAppearance,
  isPerfectWin,
  judgeAppearance,
  resolveAppearance,
  startAppearance,
  TRIAL_STOP_DELAY_MS,
  TRIAL_WINDOW_MS,
} from './engine';
import { isImageId } from './subjects';
import type {
  Appearance,
  AppearanceKind,
  GoNoGoLevelConfig,
  GoNoGoOutcome,
  GoNoGoState,
  HelpStage,
  OnStage,
  Presentation,
  SubjectId,
  VoiceMood,
} from './types';
import {
  getLureClipId,
  getRuleClipPaths,
  getStarClipPaths,
  getVoiceClipPath,
  SHARED_CLIPS,
} from './voice-script';

/**
 * Déroulé en temps réel d'une étoile de Pas si vite ! (FEAT-28 §3, §6.5, §9) : sans React ni DOM, il
 * cadence les minuteurs au-dessus du moteur pur. Il date chaque appui (l'horodatage de l'évènement,
 * jamais l'image suivante), ferme la fenêtre, fait arriver le STOP, joue la démo, les essais guidés et
 * la partie, met en pause sur inaction ou page masquée, et enregistre la victoire. Le plateau
 * (`GoNoGoBoard`) n'en affiche que l'instantané et lui transmet les gestes.
 */

/** La scène reste vide ce temps entre deux apparitions : le rythme régulier installe l'automatisme. */
export const BREATH_MS = 700;

/** Animations de fin d'une apparition (§6.1, §6.3) : attrapée, ratée, gag d'un piège laissé passer. */
export const CAUGHT_MS = 400;
export const MISSED_MS = 600;
export const PASSED_MS = 900;

/** Pause d'un piège touché : le rythme s'interrompt environ 2 s, plus si la voix est plus longue (§6.2). */
export const TRAPPED_PAUSE_MS = 2000;

/** Inaction : après tant de temps sans aucun appui, le défilement se met en pause (§6.5). */
export const IDLE_MS = 12_000;

/** Relances d'une pause, puis silence jusqu'au prochain appui : un écran laissé allumé finit par se taire. */
export const MAX_NUDGES = 3;

/** Au départ, la phrase de rappel a au moins ce temps pour être dite avant la première apparition. */
export const START_DELAY_MS = 1200;

/** Un appui daté dans la fenêtre mais traité un peu après sa fin compte encore (évènement en retard). */
export const WINDOW_GRACE_MS = 40;

/** Le buzzer reste enfoncé ce temps après un appui. */
export const PRESS_FLASH_MS = 160;

/** Entre la victoire et l'écran de fin : le dernier retour se voit. */
export const END_SCREEN_DELAY_MS = 900;

/** La mascotte contente après une cible attrapée, et ses ailes qui battent pour le leurre. */
export const HAPPY_MS = 700;
export const LURE_FLAP_MS = 1100;

export type SceneMoment = 'entering' | 'caught' | 'missed' | 'trapped' | 'passed';

/** Ce qui est sur la scène. `subject` nul : la scène est vide. */
export interface Scene {
  /** Change à chaque entrée : les animations CSS repartent à zéro */
  key: number;
  subject: SubjectId | null;
  kind: AppearanceKind;
  hideout: number;
  moment: SceneMoment;
  /** Le panneau STOP a surgi sur l'apparition (règle 3) */
  hasStop: boolean;
  /** Entrée lente (aide, essais, démo) */
  isSlow: boolean;
  /** Le piège porte le signe « non » (échelon 3) */
  hasNoBadge: boolean;
}

export const EMPTY_SCENE: Scene = {
  key: 0,
  subject: null,
  kind: 'target',
  hideout: 0,
  moment: 'entering',
  hasStop: false,
  isSlow: false,
  hasNoBadge: false,
};

/**
 * `starting` : phrase de rappel avant le premier plan ; `demo` : le film de la première étoile d'une
 * règle ; `trial` : les quatre essais guidés ; `live` : la partie ; `paused` : en attente d'un appui
 * (inaction, page masquée) ; `won` : étoile gagnée.
 */
export type RunPhase = 'starting' | 'demo' | 'trial' | 'live' | 'paused' | 'won';

export type MascotPose = 'idle' | 'happy' | 'flap';

/**
 * Instantané que le plateau affiche. L'état enfoncé du buzzer n'y est pas : il change à chaque appui
 * et 160 ms plus tard, et vit à part (`isBuzzerPressed`, `subscribeBuzzer`) pour ne redessiner que le
 * buzzer.
 */
export interface RunSnapshot {
  phase: RunPhase;
  /** État du moteur : la file, la cadence, les compteurs de l'étoile (perles allumées : `cleared`) */
  game: GoNoGoState;
  scene: Scene;
  /** Essai en cours (de 0 à 3) pendant `trial` */
  trial: number;
  /**
   * Numéro de l'annonce de la phase pour les lecteurs d'écran : il change à chaque entrée dans une
   * phase, rappel de départ compris ; 0 tant que rien n'est annoncé (le contenu initial d'une région
   * `role="status"` n'est pas lu)
   */
  statusKey: number;
  /** Grisé pendant la pause d'un piège touché : rien n'y est compté */
  isBuzzerEnabled: boolean;
  /** Le buzzer pulse : il attend un appui (pause, cible qui l'appelle à l'échelon 2) */
  isBuzzerPulsing: boolean;
  hand: DemoHand;
  mascot: { isVisible: boolean; pose: MascotPose };
  /** L'écran de fin est ouvert (un instant après la victoire) */
  isEndOpen: boolean;
}

export interface RunResult {
  /** Pièges touchés de toute l'étoile */
  moves: number;
  /** Vitesse tenue, en secondes (§11.2) */
  timeSeconds: number;
  isPerfect: boolean;
}

export interface RunDeps {
  config: GoNoGoLevelConfig;
  /** L'étoile est déjà gagnée : la démo ne se rejoue pas, les essais et le rappel oui (§9) */
  hasWon: boolean;
  rng?: Rng;
  /** Horloge monotone (`performance.now`) ; injectable en test */
  now?: () => number;
  playEffect: (effect: SoundEffect) => void;
  /**
   * Dit des clips (chemins) ; résolue à la fin de la voix, aussitôt son coupé. La chouette mime la voix
   * (`talking` par défaut) ; `null` : la voix seule, le déroulé anime lui-même la mascotte.
   */
  speak: (clips: readonly string[], mood?: VoiceMood | null) => Promise<void>;
  /** Fait taire la voix en cours, et celle que le navigateur retient jusqu'au premier geste */
  stopVoice: () => void;
  /** Charge des clips à l'avance ; résolue quand ils sont prêts (ou qu'ils ont échoué) */
  preload: (paths: readonly string[]) => Promise<void>;
  /** Page masquée : un rappel de la règle ne s'y dépense pas, personne ne l'entendrait. Défaut : jamais */
  isHidden?: () => boolean;
  /** Étoile gagnée : à enregistrer (une seule fois par partie), dès la réussite qui la gagne */
  onWin: (result: RunResult) => void;
}

export interface Run {
  getSnapshot: () => RunSnapshot;
  subscribe: (listener: () => void) => () => void;
  /** Le buzzer est enfoncé : un contact vient d'être posé (même quand rien n'est compté) */
  isBuzzerPressed: () => boolean;
  /** Abonnement au seul état enfoncé du buzzer */
  subscribeBuzzer: (listener: () => void) => () => void;
  /** Lance la partie (rejouable après `dispose`, comme un effet sous StrictMode) */
  start: () => void;
  /** Arrête tous les minuteurs ; la voix en cours n'est plus attendue */
  dispose: () => void;
  /** Un contact posé (au doigt), `OK` (télécommande) ; `eventTime` : l'horodatage de l'évènement */
  press: (eventTime?: number) => void;
  /** Page masquée, ou tout autre arrêt immédiat : rien n'est compté, un appui relance */
  pause: () => void;
  /** Mascotte touchée pendant une pause : la chouette répète la règle sans relancer le jeu */
  replayRule: () => void;
  /** Rejouer : nouvelle file, même étoile */
  restart: () => void;
  /**
   * Remplace ce qui enregistre la victoire : le plateau le renouvelle à chaque rendu, la partie lit
   * toujours le dernier (`controls.recordVictory` change à chaque rendu de `GameScreen`).
   */
  setOnWin: (handler: (result: RunResult) => void) => void;
}

/** Apparition sur scène, avec ce qui la fait finir. */
interface ActiveStage extends OnStage {
  source: 'trial' | 'live';
  isResolved: boolean;
}

/** Paramètres d'un essai guidé : fenêtre longue, entrée lente, STOP tardif à 300 ms (§9). */
function getTrialPresentation(appearance: Appearance, isFirst: boolean): Presentation {
  return {
    windowMs: TRIAL_WINDOW_MS,
    stopAtMs: appearance.kind === 'stop' ? TRIAL_STOP_DELAY_MS : null,
    help: 0,
    isSlow: true,
    hasNoBadge: false,
    pulsesBuzzer: isFirst,
    // La main fantôme montre le premier appui (§9).
    showsHand: isFirst,
  };
}

function createInitialSnapshot(config: GoNoGoLevelConfig, game: GoNoGoState): RunSnapshot {
  return {
    phase: 'starting',
    game,
    scene: EMPTY_SCENE,
    trial: 0,
    statusKey: 0,
    isBuzzerEnabled: true,
    isBuzzerPulsing: false,
    hand: 'none',
    // Règle 1 : une seconde chouette à l'écran serait elle-même un signal, la mascotte se cache.
    mascot: { isVisible: config.rule !== 'owl-says', pose: 'idle' },
    isEndOpen: false,
  };
}

/** Phrases dites à un piège touché : l'erreur, puis « Regarde bien. » à partir de la 2ᵉ d'affilée (§6.4). */
function getTrappedClips(help: HelpStage): string[] {
  return help >= 2 ? [SHARED_CLIPS.trapped, SHARED_CLIPS.lookCarefully] : [SHARED_CLIPS.trapped];
}

/** Même valeur, ou même objet champ à champ (la scène, la mascotte) : rien à redessiner. */
function isSameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  const leftEntries = Object.entries(left);
  return (
    leftEntries.length === Object.keys(right).length &&
    leftEntries.every(([key, value]) => Object.is(value, (right as Record<string, unknown>)[key]))
  );
}

export function createRun(deps: RunDeps): Run {
  const { config } = deps;
  const rng = deps.rng ?? Math.random;
  const now = deps.now ?? (() => performance.now());
  const isHidden = deps.isHidden ?? (() => false);
  const isOwlRule = config.rule === 'owl-says';
  const ruleClips = getRuleClipPaths(config);

  let hasWon = deps.hasWon;
  let onWin = deps.onWin;
  let snapshot = createInitialSnapshot(config, createGoNoGoGame(config, rng));
  const listeners = new Set<() => void>();
  let isPressed = false;
  const pressListeners = new Set<() => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  /** Change à chaque arrêt et à chaque nouvelle partie : une voix ou un film ancien ne reprend pas la main */
  let epoch = 0;
  let isStarted = false;
  let sceneKey = 0;
  let onStage: ActiveStage | null = null;
  let appearedAt = 0;
  let appearanceTimers: ReturnType<typeof setTimeout>[] = [];
  let trialPlan: Appearance[] = [];
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let mascotTimer: ReturnType<typeof setTimeout> | undefined;
  let nudgeCount = 0;
  /** Où reprendre après une pause */
  let resumeTo: 'demo' | 'trial' | 'live' = 'live';
  /** Page masquée pendant le rappel de la règle : la pause part dès qu'il est fini (§6.5) */
  let isPausePending = false;

  /** Un patch qui ne change rien ne redessine rien. */
  function update(patch: Partial<RunSnapshot>): void {
    const keys = Object.keys(patch) as (keyof RunSnapshot)[];
    if (keys.every((key) => isSameValue(snapshot[key], patch[key]))) return;
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  }

  /** Entre dans une phase, et l'annonce aux lecteurs d'écran (une annonce par entrée). */
  function setPhase(phase: RunPhase, patch: Partial<RunSnapshot> = {}): void {
    update({ ...patch, phase, statusKey: snapshot.statusKey + 1 });
  }

  function setPressed(value: boolean): void {
    if (isPressed === value) return;
    isPressed = value;
    for (const listener of pressListeners) listener();
  }

  function after(ms: number, callback: () => void): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, ms);
    timers.add(timer);
    return timer;
  }

  function cancel(timer: ReturnType<typeof setTimeout> | undefined): void {
    if (timer === undefined) return;
    clearTimeout(timer);
    timers.delete(timer);
  }

  function clearAll(): void {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    appearanceTimers = [];
    idleTimer = undefined;
    flashTimer = undefined;
    mascotTimer = undefined;
  }

  /** Attend `ms`, ou une voix qui dure plus longtemps ; `false` si la partie a changé entre-temps. */
  function wait(ms: number, voice: Promise<void> | null = null): Promise<boolean> {
    const mine = epoch;
    const timer = new Promise<void>((resolve) => {
      after(ms, resolve);
    });
    return Promise.all([timer, voice ?? Promise.resolve()]).then(() => mine === epoch);
  }

  function setMascot(pose: MascotPose, isVisible = snapshot.mascot.isVisible): void {
    update({ mascot: { isVisible, pose } });
  }

  /** La mascotte prend `pose` un moment, puis revient à l'attente ; cachée, il n'y a rien à montrer. */
  function poseMascot(pose: MascotPose, ms: number): void {
    if (!snapshot.mascot.isVisible) return;
    cancel(mascotTimer);
    setMascot(pose);
    mascotTimer = after(ms, () => {
      setMascot('idle');
    });
  }

  function setScene(patch: Partial<Scene>): void {
    update({ scene: { ...snapshot.scene, ...patch } });
  }

  function emptyStage(): void {
    onStage = null;
    update({
      scene: { ...EMPTY_SCENE, key: sceneKey },
      hand: 'none',
      isBuzzerEnabled: true,
      isBuzzerPulsing: false,
    });
  }

  // ---- Inaction (§6.5) -------------------------------------------------------------------------

  function armIdle(): void {
    cancel(idleTimer);
    if (snapshot.phase !== 'live') return;
    idleTimer = after(IDLE_MS, () => {
      enterPause(true);
    });
  }

  /**
   * Rappelle la règle, puis toutes les `IDLE_MS`, au plus `MAX_NUDGES` fois : silence ensuite jusqu'au
   * prochain appui. Page masquée, le rappel n'est pas dépensé (personne ne l'entendrait) : l'enfant qui
   * revient ne trouve pas une chouette muette.
   */
  function nudge(): void {
    if (snapshot.phase !== 'paused') return;
    if (!isHidden()) {
      nudgeCount += 1;
      void deps.speak(ruleClips);
    }
    if (nudgeCount < MAX_NUDGES) after(IDLE_MS, nudge);
  }

  /**
   * Pause : l'apparition sur scène retourne en tête de la file sans rien compter, la scène se vide, la
   * chouette est là et le buzzer pulse. `withVoice` : inaction (la chouette rappelle la règle) ; page
   * masquée, elle se tait.
   */
  function enterPause(withVoice: boolean): void {
    const { phase } = snapshot;
    if (phase === 'starting') {
      // Le rappel de la règle va jusqu'au bout, puis la partie attend un appui au lieu de se jouer
      // sans personne. Avant le départ (`start`), il n'y a rien à retenir.
      isPausePending = isStarted;
      return;
    }
    if (phase === 'paused' || phase === 'won') return;
    // Une victoire est acquise : l'étoile se termine, même si l'enfant ne touche plus à rien.
    if (phase === 'live' && snapshot.game.status === 'won') return;
    epoch += 1;
    clearAll();
    resumeTo = phase;
    if (phase === 'live' && onStage && !onStage.isResolved) {
      update({ game: interruptAppearance(snapshot.game) });
    }
    onStage = null;
    nudgeCount = 0;
    // `clearAll` vient d'effacer le minuteur de relâchement du buzzer : il ne doit pas rester enfoncé.
    setPressed(false);
    setPhase('paused', {
      scene: { ...EMPTY_SCENE, key: sceneKey },
      hand: 'none',
      isBuzzerEnabled: true,
      isBuzzerPulsing: true,
      mascot: { isVisible: true, pose: 'idle' },
    });
    if (withVoice) nudge();
  }

  function resume(): void {
    if (snapshot.phase !== 'paused') return;
    epoch += 1;
    clearAll();
    setPressed(false);
    // Règle 1 : la chouette du coin se cache pour la partie et les essais, et la démo repart sans elle.
    update({
      isBuzzerPulsing: false,
      mascot: { isVisible: !isOwlRule, pose: 'idle' },
    });
    if (resumeTo === 'demo') {
      startDemo();
    } else if (resumeTo === 'trial') {
      setPhase('trial');
      after(BREATH_MS, beginTrial);
    } else {
      setPhase('live');
      armIdle();
      after(BREATH_MS, beginLive);
    }
  }

  // ---- Une apparition --------------------------------------------------------------------------

  function enterScene(
    appearance: Appearance,
    presentation: Presentation,
    source: ActiveStage['source'],
  ): void {
    sceneKey += 1;
    appearedAt = now();
    onStage = { appearance, presentation, source, isResolved: false };
    update({
      scene: {
        key: sceneKey,
        subject: appearance.subject,
        kind: appearance.kind,
        hideout: appearance.hideout,
        moment: 'entering',
        hasStop: false,
        isSlow: presentation.isSlow,
        hasNoBadge: presentation.hasNoBadge,
      },
      isBuzzerEnabled: true,
      isBuzzerPulsing: presentation.pulsesBuzzer,
      hand: presentation.showsHand ? 'tap' : 'none',
    });
    if (isOwlRule) deps.playEffect('signal');
    if (config.hasLure && isImageId(appearance.subject)) {
      // La chouette bat des ailes à chaque image et la nomme : « Vache vole ! » (§4.2). Seule l'image
      // décide. Le battement dure `LURE_FLAP_MS`, la voix ne le prolonge pas : une cible attrapée doit
      // encore pouvoir rendre la chouette contente.
      poseMascot('flap', LURE_FLAP_MS);
      void deps.speak([getVoiceClipPath(getLureClipId(appearance.subject))], null);
    }
    appearanceTimers = [];
    if (presentation.windowMs !== null) {
      appearanceTimers.push(after(presentation.windowMs + WINDOW_GRACE_MS, expire));
    }
    if (presentation.stopAtMs !== null) {
      appearanceTimers.push(after(presentation.stopAtMs, showStop));
    }
  }

  function showStop(): void {
    if (!onStage || onStage.isResolved) return;
    setScene({ hasStop: true });
    deps.playEffect('stop');
  }

  function expire(): void {
    resolveStage(null);
  }

  /** Issue de l'apparition sur scène : `pressedAtMs` depuis son entrée, `null` si la fenêtre s'est écoulée. */
  function resolveStage(pressedAtMs: number | null): void {
    const stage = onStage;
    if (!stage || stage.isResolved) return;
    let outcome: GoNoGoOutcome;
    let help: HelpStage = 0;
    if (stage.source === 'live') {
      const next = resolveAppearance(snapshot.game, pressedAtMs, rng);
      // Une cible qui attend ne s'écoule pas : seul un appui la résout.
      if (next === snapshot.game || !next.lastResult) return;
      outcome = next.lastResult.outcome;
      help = next.lastResult.help;
      update({ game: next });
      // Enregistrée dès la réussite qui gagne : l'enfant qui quitte pendant l'animation garde son étoile.
      if (next.status === 'won') recordWin(next);
    } else {
      outcome = judgeAppearance(stage.appearance.kind, pressedAtMs, stage.presentation.stopAtMs);
    }
    stage.isResolved = true;
    for (const timer of appearanceTimers) cancel(timer);
    appearanceTimers = [];
    showOutcome(stage, outcome, help);
  }

  function showOutcome(stage: ActiveStage, outcome: GoNoGoOutcome, help: HelpStage): void {
    setScene({ moment: outcome });
    update({ hand: 'none', isBuzzerPulsing: false });
    if (outcome === 'trapped') {
      // Le rythme s'interrompt : le buzzer se grise, la chouette parle, aucune sanction (§6.2).
      deps.playEffect('oops');
      update({
        isBuzzerEnabled: false,
        mascot: { isVisible: true, pose: 'idle' },
      });
      const voice = deps.speak(getTrappedClips(help));
      void wait(TRAPPED_PAUSE_MS, voice).then((isCurrent) => {
        if (isCurrent) settle(stage);
      });
      return;
    }
    if (outcome === 'caught') {
      deps.playEffect('success');
      poseMascot('happy', HAPPY_MS);
      after(CAUGHT_MS, () => {
        settle(stage);
      });
    } else if (outcome === 'missed') {
      deps.playEffect('neutral');
      after(MISSED_MS, () => {
        settle(stage);
      });
    } else {
      deps.playEffect('gag');
      after(PASSED_MS, () => {
        settle(stage);
      });
    }
  }

  /** Fin des animations d'une apparition : la scène se vide, puis la respiration, puis la suivante. */
  function settle(stage: ActiveStage): void {
    if (onStage !== stage) return;
    if (stage.source === 'live' && snapshot.game.status === 'won') {
      win();
      return;
    }
    emptyStage();
    if (isOwlRule) setMascot('idle', false);
    if (stage.source === 'trial') {
      const next = snapshot.trial + 1;
      update({ trial: next });
      if (next >= trialPlan.length) startLive();
      else after(BREATH_MS, beginTrial);
    } else {
      after(BREATH_MS, beginLive);
    }
  }

  function beginLive(): void {
    if (snapshot.phase !== 'live') return;
    const next = startAppearance(snapshot.game);
    if (!next.onStage) return;
    update({ game: next });
    enterScene(next.onStage.appearance, next.onStage.presentation, 'live');
  }

  function beginTrial(): void {
    if (snapshot.phase !== 'trial') return;
    const appearance = trialPlan[snapshot.trial];
    if (!appearance) {
      startLive();
      return;
    }
    enterScene(appearance, getTrialPresentation(appearance, snapshot.trial === 0), 'trial');
  }

  // ---- Les phases ------------------------------------------------------------------------------

  /** Enregistre la victoire : pièges touchés, vitesse tenue, couronne (§14.9). */
  function recordWin(game: GoNoGoState): void {
    onWin({
      moves: game.trapped,
      timeSeconds: getHeldSpeedSeconds(game),
      isPerfect: isPerfectWin(game),
    });
    hasWon = true;
  }

  /** Après l'animation de la dernière réussite : la fanfare, puis l'écran de fin. */
  function win(): void {
    emptyStage();
    setPhase('won');
    cancel(idleTimer);
    deps.playEffect('victory');
    void deps.speak(
      isPerfectWin(snapshot.game)
        ? [SHARED_CLIPS.starWon, SHARED_CLIPS.crownWon]
        : [SHARED_CLIPS.starWon],
    );
    after(END_SCREEN_DELAY_MS, () => {
      update({ isEndOpen: true });
    });
  }

  function startLive(): void {
    setPhase('live', { trial: 0 });
    emptyStage();
    armIdle();
    after(BREATH_MS, beginLive);
  }

  function startTrials(): void {
    setPhase('trial', { trial: 0 });
    emptyStage();
    // La démo laisse la chouette dans son coin ; au premier essai, une seconde chouette serait un signal.
    if (isOwlRule) setMascot('idle', false);
    after(BREATH_MS, beginTrial);
  }

  /** Après la phrase de rappel (ou la démo) : les essais guidés d'une règle nouvelle, sinon la partie. */
  function goOn(): void {
    if (config.intro === null) startLive();
    else startTrials();
  }

  function performDemo(action: DemoAction): Promise<boolean> {
    switch (action.do) {
      case 'enter':
        sceneKey += 1;
        update({
          scene: {
            ...EMPTY_SCENE,
            key: sceneKey,
            subject: action.subject,
            kind: action.kind,
            isSlow: true,
          },
        });
        break;
      case 'moment':
        setScene({ moment: action.moment });
        break;
      case 'stop':
        setScene({ hasStop: true });
        deps.playEffect('stop');
        break;
      case 'clear':
        emptyStage();
        break;
      case 'hand':
        update({ hand: action.hand });
        break;
      case 'press':
        flash();
        break;
      case 'effect':
        deps.playEffect(action.effect);
        break;
      case 'mascot':
        setMascot(action.mood, action.isVisible);
        break;
      case 'say':
        return wait(action.minMs, deps.speak(action.clips, action.mood));
      case 'wait':
        return wait(action.ms);
    }
    return Promise.resolve(true);
  }

  /**
   * Joue le film de la démo, du premier plan (la mascotte à sa place de départ : cachée à la règle 1),
   * étape après étape, puis les essais guidés. Une voix que le navigateur retenait faute de geste ne
   * déborde pas sur les essais : la mise en garde partirait au premier appui, par-dessus eux.
   */
  function startDemo(): void {
    setPhase('demo', { mascot: { isVisible: !isOwlRule, pose: 'idle' } });
    emptyStage();
    const mine = epoch;
    const script = getDemoScript(config);
    void (async () => {
      for (const action of script) {
        if (mine !== epoch) return;
        if (!(await performDemo(action))) return;
      }
      if (mine !== epoch) return;
      deps.stopVoice();
      startTrials();
    })();
  }

  /** Phrase de rappel de la règle, puis la suite : au plus tôt `START_DELAY_MS` plus tard. */
  function startReminder(): void {
    setPhase('starting');
    const voice = deps.speak(ruleClips);
    void wait(START_DELAY_MS, voice).then((isCurrent) => {
      if (!isCurrent || snapshot.phase !== 'starting') return;
      goOn();
      if (isPausePending) {
        isPausePending = false;
        enterPause(false);
      }
    });
  }

  /**
   * Premier tour d'horloge : tire les essais guidés, charge les clips (la phrase de rappel d'abord,
   * comme Attrape-Piège : sur un réseau lent, elle n'attend pas les autres), puis lance la démo ou le
   * rappel. Une pause demandée avant (page déjà masquée au montage) part dès le début de la démo, ou à
   * la fin du rappel.
   */
  function boot(): void {
    const { game } = snapshot;
    const hasDemo = config.intro !== null && !hasWon;
    // Les essais guidés sont tirés ici, avec la file : leurs images sont chargées avec les autres.
    trialPlan = config.intro === null ? [] : createTrialPlan(config, rng);
    const others = [
      ...(hasDemo ? getDemoClipPaths(config) : []),
      ...getStarClipPaths(
        config,
        [...game.queue, ...trialPlan].map((entry) => entry.subject),
      ),
    ].filter((path) => !ruleClips.includes(path));
    void deps.preload(ruleClips).then(() => deps.preload([...new Set(others)]));
    if (!hasDemo) {
      startReminder();
      return;
    }
    startDemo();
    if (isPausePending) {
      isPausePending = false;
      enterPause(false);
    }
  }

  // ---- Les gestes ------------------------------------------------------------------------------

  /** Le buzzer s'enfonce visuellement, même quand rien n'est compté. */
  function flash(): void {
    cancel(flashTimer);
    setPressed(true);
    flashTimer = after(PRESS_FLASH_MS, () => {
      setPressed(false);
    });
  }

  function press(eventTime?: number): void {
    const { phase, isBuzzerEnabled } = snapshot;
    if (phase === 'paused') {
      // L'appui qui relance ne compte pas, mais le buzzer s'enfonce : la reprise efface d'abord tous
      // les minuteurs, puis l'appui arme celui qui le relâche.
      resume();
      flash();
      return;
    }
    // La démo conduit seule le buzzer ; une fois gagnée, l'étoile ne compte plus rien.
    if (phase === 'won' || phase === 'demo') return;
    if (isBuzzerEnabled) flash();
    if (phase === 'live') armIdle();
    const stage = onStage;
    if (!stage || stage.isResolved || !isBuzzerEnabled) return;
    const pressedAt = eventTime ?? now();
    // Un contact posé avant l'entrée de l'image (pendant la respiration), mais traité après, ne compte
    // pas pour elle : seul un contact posé pendant la fenêtre compte (§3.2).
    if (pressedAt < appearedAt) return;
    const elapsed = pressedAt - appearedAt;
    const { windowMs } = stage.presentation;
    // Hors de la fenêtre : un appui en retard sur la fin de la fenêtre ne compte pas.
    if (windowMs !== null && elapsed >= windowMs) return;
    resolveStage(elapsed);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isBuzzerPressed: () => isPressed,
    subscribeBuzzer: (listener) => {
      pressListeners.add(listener);
      return () => {
        pressListeners.delete(listener);
      };
    },
    start: () => {
      if (isStarted) return;
      isStarted = true;
      // Un minuteur plutôt qu'un appel direct : l'effet rejoué sous StrictMode ne parle qu'une fois.
      after(0, boot);
    },
    dispose: () => {
      isStarted = false;
      isPausePending = false;
      epoch += 1;
      clearAll();
    },
    press,
    pause: () => {
      enterPause(false);
    },
    replayRule: () => {
      if (snapshot.phase === 'paused') void deps.speak(ruleClips);
    },
    setOnWin: (handler) => {
      onWin = handler;
    },
    restart: () => {
      epoch += 1;
      clearAll();
      onStage = null;
      isPausePending = false;
      hasWon = true;
      isStarted = true;
      setPressed(false);
      snapshot = createInitialSnapshot(config, createGoNoGoGame(config, rng));
      for (const listener of listeners) listener();
      after(0, boot);
    },
  };
}
