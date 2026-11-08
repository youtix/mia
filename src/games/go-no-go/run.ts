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
  Presentation,
  SubjectId,
} from './types';
import {
  getLureClipId,
  getRuleClipId,
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

export interface RunSnapshot {
  phase: RunPhase;
  /** État du moteur : la file, la cadence, les compteurs de l'étoile (perles allumées : `cleared`) */
  game: GoNoGoState;
  scene: Scene;
  /** Essai en cours (de 0 à 3) pendant `trial` */
  trial: number;
  isBuzzerPressed: boolean;
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
  /** Dit des clips (chemins) ; résolue à la fin de la voix, aussitôt son coupé */
  speak: (clips: readonly string[], mood?: 'talking' | 'flap') => Promise<void>;
  /** Charge des clips à l'avance */
  preload: (paths: readonly string[]) => void;
  /**
   * Un clip existe-t-il ? Défaut : tous. Un clip absent n'est ni dit ni chargé (aucune requête vers
   * un fichier qui n'existe pas) : la chouette est mimée, la voix s'active quand le clip existe.
   */
  isClipAvailable?: (path: string) => boolean;
  /** Étoile gagnée : à enregistrer (une seule fois par partie) */
  onWin: (result: RunResult) => void;
}

export interface Run {
  getSnapshot: () => RunSnapshot;
  subscribe: (listener: () => void) => () => void;
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
interface OnStage {
  appearance: Appearance;
  presentation: Presentation;
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
    isBuzzerPressed: false,
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

export function createRun(deps: RunDeps): Run {
  const { config } = deps;
  const rng = deps.rng ?? Math.random;
  const now = deps.now ?? (() => performance.now());
  const isAvailable = deps.isClipAvailable ?? (() => true);
  const isOwlRule = config.rule === 'owl-says';

  let hasWon = deps.hasWon;
  let onWin = deps.onWin;
  let snapshot = createInitialSnapshot(config, createGoNoGoGame(config, rng));
  const listeners = new Set<() => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  /** Change à chaque arrêt et à chaque nouvelle partie : une voix ou un film ancien ne reprend pas la main */
  let epoch = 0;
  let isStarted = false;
  let sceneKey = 0;
  let onStage: OnStage | null = null;
  let appearedAt = 0;
  let appearanceTimers: ReturnType<typeof setTimeout>[] = [];
  let trialPlan: Appearance[] = [];
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let mascotTimer: ReturnType<typeof setTimeout> | undefined;
  let nudgeTimer: ReturnType<typeof setInterval> | undefined;
  let nudgeCount = 0;
  /** Où reprendre après une pause */
  let resumeTo: 'demo' | 'trial' | 'live' = 'live';

  /** Dit les clips qui existent ; la voix est résolue aussitôt s'il n'en reste aucun, le mime dure quand même. */
  function say(clips: readonly string[], mood?: 'talking' | 'flap'): Promise<void> {
    return deps.speak(clips.filter(isAvailable), mood);
  }

  /** Charge à l'avance les clips qui existent. */
  function load(paths: readonly string[]): void {
    const available = paths.filter(isAvailable);
    if (available.length > 0) deps.preload(available);
  }

  function update(patch: Partial<RunSnapshot>): void {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
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
    if (nudgeTimer !== undefined) clearInterval(nudgeTimer);
    nudgeTimer = undefined;
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

  /** La mascotte prend `pose` un moment, puis revient à l'attente. */
  function poseMascot(pose: MascotPose, ms: number): void {
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

  /** Rappelle la règle ; au plus `MAX_NUDGES` fois, puis silence jusqu'au prochain appui. */
  function nudge(): void {
    if (nudgeCount >= MAX_NUDGES || snapshot.phase !== 'paused') return;
    nudgeCount += 1;
    void say([getVoiceClipPath(getRuleClipId(config))]);
  }

  /**
   * Pause : l'apparition sur scène retourne en tête de la file sans rien compter, la scène se vide, la
   * chouette est là et le buzzer pulse. `withVoice` : inaction (la chouette rappelle la règle) ; page
   * masquée, elle se tait.
   */
  function enterPause(withVoice: boolean): void {
    const { phase } = snapshot;
    if (phase === 'paused' || phase === 'won' || phase === 'starting') return;
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
    update({
      phase: 'paused',
      scene: { ...EMPTY_SCENE, key: sceneKey },
      hand: 'none',
      isBuzzerEnabled: true,
      isBuzzerPulsing: true,
      mascot: { isVisible: true, pose: 'idle' },
    });
    if (withVoice) {
      nudge();
      nudgeTimer = setInterval(nudge, IDLE_MS);
    }
  }

  function resume(): void {
    if (snapshot.phase !== 'paused') return;
    epoch += 1;
    clearAll();
    nudgeCount = 0;
    update({
      isBuzzerPulsing: false,
      mascot: { isVisible: !isOwlRule || resumeTo === 'demo', pose: 'idle' },
    });
    if (resumeTo === 'demo') {
      startDemo();
    } else if (resumeTo === 'trial') {
      update({ phase: 'trial' });
      after(BREATH_MS, beginTrial);
    } else {
      update({ phase: 'live' });
      armIdle();
      after(BREATH_MS, beginLive);
    }
  }

  // ---- Une apparition --------------------------------------------------------------------------

  function enterScene(
    appearance: Appearance,
    presentation: Presentation,
    source: 'trial' | 'live',
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
      // La chouette bat des ailes à chaque image et la nomme : « Vache vole ! » (§4.2). Seule l'image décide.
      poseMascot('flap', LURE_FLAP_MS);
      void say([getVoiceClipPath(getLureClipId(appearance.subject))], 'flap');
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
    } else {
      outcome = judgeAppearance(stage.appearance.kind, pressedAtMs, stage.presentation.stopAtMs);
    }
    stage.isResolved = true;
    for (const timer of appearanceTimers) cancel(timer);
    appearanceTimers = [];
    showOutcome(stage, outcome, help);
  }

  function showOutcome(stage: OnStage, outcome: GoNoGoOutcome, help: HelpStage): void {
    setScene({ moment: outcome });
    update({ hand: 'none', isBuzzerPulsing: false });
    if (outcome === 'trapped') {
      // Le rythme s'interrompt : le buzzer se grise, la chouette parle, aucune sanction (§6.2).
      deps.playEffect('oops');
      update({
        isBuzzerEnabled: false,
        mascot: { isVisible: true, pose: 'idle' },
      });
      const voice = say(getTrappedClips(help));
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
  function settle(stage: OnStage): void {
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
    const { current, presentation } = next;
    if (!current || !presentation) return;
    update({ game: next });
    enterScene(current, presentation, 'live');
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

  function win(): void {
    const { game } = snapshot;
    emptyStage();
    update({ phase: 'won' });
    cancel(idleTimer);
    const isPerfect = isPerfectWin(game);
    deps.playEffect('victory');
    void say(isPerfect ? [SHARED_CLIPS.starWon, SHARED_CLIPS.crownWon] : [SHARED_CLIPS.starWon]);
    onWin({ moves: game.trapped, timeSeconds: getHeldSpeedSeconds(game), isPerfect });
    hasWon = true;
    after(END_SCREEN_DELAY_MS, () => {
      update({ isEndOpen: true });
    });
  }

  function startLive(): void {
    update({ phase: 'live', trial: 0 });
    emptyStage();
    nudgeCount = 0;
    armIdle();
    after(BREATH_MS, beginLive);
  }

  function startTrials(): void {
    update({ phase: 'trial', trial: 0 });
    emptyStage();
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
        return wait(action.minMs, say(action.clips, action.mood));
      case 'wait':
        return wait(action.ms);
    }
    return Promise.resolve(true);
  }

  /** Joue le film de la démo, étape après étape, puis les essais guidés. */
  function startDemo(): void {
    update({ phase: 'demo' });
    emptyStage();
    const mine = epoch;
    const script = getDemoScript(config);
    load(getDemoClipPaths(config));
    void (async () => {
      for (const action of script) {
        if (mine !== epoch) return;
        if (!(await performDemo(action))) return;
      }
      if (mine === epoch) startTrials();
    })();
  }

  /** Phrase de rappel de la règle, puis la suite : au plus tôt `START_DELAY_MS` plus tard. */
  function startReminder(): void {
    update({ phase: 'starting' });
    const voice = say([getVoiceClipPath(getRuleClipId(config))]);
    void wait(START_DELAY_MS, voice).then((isCurrent) => {
      if (isCurrent && snapshot.phase === 'starting') goOn();
    });
  }

  function boot(): void {
    const { game } = snapshot;
    // Les essais guidés sont tirés ici, avec la file : leurs images sont chargées avec les autres.
    trialPlan = config.intro === null ? [] : createTrialPlan(config, rng);
    load([getVoiceClipPath(getRuleClipId(config))]);
    load(
      getStarClipPaths(
        config,
        [...game.queue, ...trialPlan].map((entry) => entry.subject),
      ),
    );
    if (config.intro !== null && !hasWon) startDemo();
    else startReminder();
  }

  // ---- Les gestes ------------------------------------------------------------------------------

  /** Le buzzer s'enfonce visuellement, même quand rien n'est compté. */
  function flash(): void {
    cancel(flashTimer);
    update({ isBuzzerPressed: true });
    flashTimer = after(PRESS_FLASH_MS, () => {
      update({ isBuzzerPressed: false });
    });
  }

  function press(eventTime?: number): void {
    const { phase, isBuzzerEnabled } = snapshot;
    if (phase === 'paused') {
      // L'appui qui relance ne compte pas.
      flash();
      resume();
      return;
    }
    // La démo conduit seule le buzzer ; une fois gagnée, l'étoile ne compte plus rien.
    if (phase === 'won' || phase === 'demo') return;
    if (isBuzzerEnabled) flash();
    if (phase === 'live') armIdle();
    const stage = onStage;
    if (!stage || stage.isResolved || !isBuzzerEnabled) return;
    const elapsed = Math.max(0, (eventTime ?? now()) - appearedAt);
    const { windowMs } = stage.presentation;
    // Hors de la fenêtre : un appui en retard sur la fin de la fenêtre ne compte pas.
    if (windowMs !== null && elapsed >= windowMs) return;
    nudgeCount = 0;
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
    start: () => {
      if (isStarted) return;
      isStarted = true;
      // Un minuteur plutôt qu'un appel direct : l'effet rejoué sous StrictMode ne parle qu'une fois.
      after(0, boot);
    },
    dispose: () => {
      isStarted = false;
      epoch += 1;
      clearAll();
    },
    press,
    pause: () => {
      enterPause(false);
    },
    replayRule: () => {
      if (snapshot.phase === 'paused') void say([getVoiceClipPath(getRuleClipId(config))]);
    },
    setOnWin: (handler) => {
      onWin = handler;
    },
    restart: () => {
      epoch += 1;
      clearAll();
      onStage = null;
      hasWon = true;
      isStarted = true;
      snapshot = createInitialSnapshot(config, createGoNoGoGame(config, rng));
      for (const listener of listeners) listener();
      after(0, boot);
    },
  };
}
