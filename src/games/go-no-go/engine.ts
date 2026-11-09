// Module pur de Memory : réutilisé tel quel plutôt que dupliqué (générateur injectable).
import { randomInt, shuffle, type Rng } from '@/games/memory/random';
import { DECOY_IDS, FLYING_IMAGES, GROUNDED_IMAGES } from './subjects';
import type {
  Appearance,
  AppearanceKind,
  AppearanceResult,
  GoNoGoLevelConfig,
  GoNoGoOutcome,
  GoNoGoState,
  HelpStage,
  Presentation,
  SubjectId,
} from './types';

/**
 * Moteur de Pas si vite ! (FEAT-28) : fonctions pures, sans React ni DOM ni minuterie. Chaque action
 * renvoie un nouvel état sans modifier celui reçu ; une action ignorée renvoie l'état reçu lui-même.
 * Le temps n'y entre que sous forme de millisecondes passées en argument (`pressedAtMs`, depuis
 * l'entrée de l'apparition) : c'est le plateau qui cadence les minuteurs et date les appuis. Le hasard
 * passe par `rng` (`Math.random` par défaut).
 */

/** La fenêtre la plus lente, partout : n'importe quelle enfant peut alors attraper une cible (§5.1). */
export const MAX_WINDOW_MS = 3000;

/** Réussites d'affilée qui raccourcissent la fenêtre, et part de ce raccourcissement (§5.1). */
export const SPEED_UP_STREAK = 3;
export const SPEED_UP_FACTOR = 0.9;

/** Ralentissement d'une cible ratée et d'un piège touché : +10 % et +15 % (§5.1). */
export const MISS_SLOWDOWN = 1.1;
export const TRAP_SLOWDOWN = 1.15;

/** Délai du STOP tardif : départ, plancher, pas d'un STOP réussi et d'un STOP manqué (§5.2). */
export const START_STOP_DELAY_MS = 150;
export const MIN_STOP_DELAY_MS = 100;
export const STOP_SUCCESS_STEP_MS = 50;
export const STOP_FAILURE_STEP_MS = 100;

/** Le STOP arrive au moins ce temps avant la fin de la fenêtre (§5.2). */
export const STOP_MARGIN_MS = 300;

/** Réussites d'affilée dont la fenêtre devient la vitesse tenue (§11.2). */
export const HELD_RUN = 8;

/** Apparitions du début sans aucun piège (§3.3). */
export const TRAP_FREE_APPEARANCES = 3;

/** Une apparition remise revient entre 2 et 4 apparitions plus tard (§3.3). */
export const MIN_RETRY_GAP = 2;
export const MAX_RETRY_GAP = 4;

/** Garde-fou : au-delà de 1,5 fois la longueur prévue, tout passe à l'échelon 3 de l'aide (§3.3). */
export const OVERRUN_FACTOR = 1.5;

/** La fenêtre d'un piège à l'échelon 2 de l'aide : « plus longue » (§6.4). */
export const SLOW_TRAP_FACTOR = 1.5;

/** Essais guidés : à fenêtre longue, sans conséquence (§9). */
export const TRIAL_WINDOW_MS = MAX_WINDOW_MS;
export const TRIAL_STOP_DELAY_MS = 300;

const RULES: readonly string[] = ['owl-says', 'flies', 'late-stop'];

/** Au plus 40 perles : elles tiennent sur une ou deux rangées de la guirlande. */
export const MAX_APPEARANCES = 40;

/** Apparitions à partir desquelles le garde-fou de durée s'applique : 1,5 fois la longueur prévue. */
export function getShownLimit(appearances: number): number {
  return Math.ceil(appearances * OVERRUN_FACTOR);
}

/** Échelon d'aide d'une série d'erreurs d'affilée : 0 à 3 (§6.4). */
export function getHelpStage(streak: number): HelpStage {
  if (streak >= 3) return 3;
  if (streak === 2) return 2;
  return streak === 1 ? 1 : 0;
}

/** Une apparition demande-t-elle de se retenir ? Le piège et le STOP tardif. */
function isNoGo(kind: AppearanceKind): boolean {
  return kind !== 'target';
}

/** Pièges (ou STOP) consécutifs que créerait une apparition de ce genre posée à l'emplacement `slot`. */
function getRunLength(flags: readonly boolean[], slot: number): number {
  let run = 1;
  for (let left = slot - 1; left >= 0 && flags[left]; left -= 1) run += 1;
  for (let right = slot + 1; right < flags.length && flags[right]; right += 1) run += 1;
  return run;
}

/**
 * Pièges au plus que `freeSlots` emplacements reçoivent sans en aligner plus de `maxRun` : un piège
 * tous les `maxRun + 1` emplacements, au mieux.
 */
function getMaxNoGo(freeSlots: number, maxRun: number): number {
  return freeSlots - Math.floor(freeSlots / (maxRun + 1));
}

/**
 * Anomalies d'une configuration de niveau, un message français par anomalie (liste vide : valide).
 * Reprise par `validateGoNoGoCatalog`.
 */
export function getGoNoGoConfigErrors(config: GoNoGoLevelConfig): string[] {
  const errors: string[] = [];
  const rule: string = config.rule;
  const { appearances, traps, stops, startWindowMs, fastestWindowMs } = config;
  // Typés `1 | 3` et `1 | 2` : lus comme des nombres, ils se contrôlent aussi sur une donnée venue d'ailleurs.
  const hideouts: number = config.hideouts;
  const maxTrapRun: number = config.maxTrapRun;
  const isInt = (value: number) => Number.isInteger(value);

  if (!RULES.includes(rule)) errors.push(`rule « ${rule} » inconnue`);
  if (
    !isInt(appearances) ||
    appearances < TRAP_FREE_APPEARANCES + 1 ||
    appearances > MAX_APPEARANCES
  ) {
    errors.push(
      `appearances ${String(appearances)} invalide (entier de ${String(TRAP_FREE_APPEARANCES + 1)} à ${String(MAX_APPEARANCES)} attendu)`,
    );
  }
  if (!isInt(traps) || traps < 0)
    errors.push(`traps ${String(traps)} invalide (entier ≥ 0 attendu)`);
  if (!isInt(stops) || stops < 0)
    errors.push(`stops ${String(stops)} invalide (entier ≥ 0 attendu)`);
  if (traps + stops < 1) errors.push('aucun piège ni STOP tardif : il n’y aurait rien à retenir');
  if (rule === 'late-stop' ? stops < 1 : stops > 0) {
    errors.push(
      rule === 'late-stop'
        ? 'règle « late-stop » sans STOP tardif (stops ≥ 1 attendu)'
        : `stops ${String(stops)} hors de la règle « late-stop »`,
    );
  }
  if (maxTrapRun !== 1 && maxTrapRun !== 2) {
    errors.push(`maxTrapRun ${String(maxTrapRun)} invalide (1 ou 2 attendu)`);
  } else if (isInt(appearances) && isInt(traps) && isInt(stops)) {
    const freeSlots = appearances - TRAP_FREE_APPEARANCES;
    if (traps + stops > getMaxNoGo(freeSlots, maxTrapRun)) {
      errors.push(
        `${String(traps + stops)} pièges ne tiennent pas dans ${String(appearances)} apparitions (jamais plus de ${String(maxTrapRun)} d’affilée, aucun dans les ${String(TRAP_FREE_APPEARANCES)} premières)`,
      );
    }
  }

  if (!isInt(startWindowMs) || !isInt(fastestWindowMs) || fastestWindowMs < 1) {
    errors.push('fenêtres : entiers en ms attendus');
  } else {
    if (startWindowMs > MAX_WINDOW_MS) {
      errors.push(`startWindowMs ${String(startWindowMs)} au-delà de ${String(MAX_WINDOW_MS)} ms`);
    }
    if (fastestWindowMs > startWindowMs) {
      errors.push(
        `fastestWindowMs ${String(fastestWindowMs)} plus lente que la fenêtre de départ ${String(startWindowMs)}`,
      );
    }
  }

  if (hideouts !== 1 && hideouts !== 3) {
    errors.push(`hideouts ${String(hideouts)} invalide (1 ou 3 attendu)`);
  } else if (hideouts === 3 && rule !== 'owl-says') {
    errors.push('hideouts : les cachettes sont celles du castelet (règle « owl-says »)');
  }

  const decoys: readonly string[] = config.decoys;
  if (rule === 'owl-says') {
    if (decoys.length < 1) errors.push('decoys vide (au moins un imposteur attendu)');
    for (const decoy of decoys) {
      if (!(DECOY_IDS as readonly string[]).includes(decoy)) {
        errors.push(`decoys : imposteur « ${decoy} » inconnu`);
      }
    }
    if (new Set(decoys).size !== decoys.length) errors.push('decoys : imposteur en double');
  } else if (decoys.length > 0) {
    errors.push('decoys : les imposteurs sont ceux du castelet (règle « owl-says »)');
  }
  if (rule === 'owl-says' && traps < 1)
    errors.push('règle « owl-says » sans imposteur (traps ≥ 1)');

  if (config.hasLure && rule !== 'flies') {
    errors.push('hasLure : le leurre de la chouette est celui de la règle « flies »');
  }

  const ceiling = config.stopDelayCeilingMs;
  if (rule === 'late-stop') {
    if (ceiling === null || !isInt(ceiling) || ceiling < MIN_STOP_DELAY_MS) {
      errors.push(`stopDelayCeilingMs invalide (entier ≥ ${String(MIN_STOP_DELAY_MS)} ms attendu)`);
    } else if (isInt(fastestWindowMs) && ceiling > fastestWindowMs - STOP_MARGIN_MS) {
      errors.push(
        `stopDelayCeilingMs ${String(ceiling)} au-delà de la vitesse maximale moins ${String(STOP_MARGIN_MS)} ms`,
      );
    }
  } else if (ceiling !== null) {
    errors.push('stopDelayCeilingMs hors de la règle « late-stop »');
  }

  const intro: string | null = config.intro;
  if (intro !== null && intro !== 'full' && intro !== 'lure') {
    errors.push(`intro « ${intro} » inconnue`);
  }
  if (intro === 'lure' && !config.hasLure) errors.push('intro « lure » sans leurre (hasLure)');
  return errors;
}

/**
 * Emplacements des pièges (et STOP tardifs), aucun dans les 3 premières apparitions et jamais plus de
 * `maxTrapRun` d'affilée. Construits plutôt que tirés au hasard puis rejetés : une configuration qui
 * passe `getGoNoGoConfigErrors` aboutit toujours, même avec un générateur qui renvoie toujours 0. Les
 * pièges forment `runs` séries de 1 ou 2, séparées par au moins une cible ; les cibles en trop sont
 * réparties au hasard entre les séries.
 */
function pickNoGoSlots(config: GoNoGoLevelConfig, rng: Rng): number[] {
  const count = config.traps + config.stops;
  const freeSlots = config.appearances - TRAP_FREE_APPEARANCES;
  const minRuns = Math.ceil(count / config.maxTrapRun);
  const maxRuns = Math.max(minRuns, Math.min(count, freeSlots - count + 1));
  const runs = minRuns + randomInt(maxRuns - minRuns + 1, rng);
  const doubles = count - runs;
  const lengths = shuffle(
    [
      ...Array.from({ length: doubles }, () => 2),
      ...Array.from({ length: runs - doubles }, () => 1),
    ],
    rng,
  );
  // Cibles avant la première série, entre deux séries (au moins une), et après la dernière.
  const gaps: number[] = Array.from({ length: runs + 1 }, (_, index) =>
    index === 0 || index === runs ? 0 : 1,
  );
  for (let spare = freeSlots - count - (runs - 1); spare > 0; spare -= 1) {
    const gap = randomInt(gaps.length, rng);
    gaps[gap] = (gaps[gap] ?? 0) + 1;
  }
  const slots: number[] = [];
  let cursor = TRAP_FREE_APPEARANCES + (gaps[0] ?? 0);
  for (const [index, length] of lengths.entries()) {
    for (let offset = 0; offset < length; offset += 1) slots.push(cursor + offset);
    cursor += length + (gaps[index + 1] ?? 0);
  }
  return slots;
}

/** Un élément de `pool` absent de `excluded` quand c'est possible, `undefined` si `pool` est vide. */
function pickDifferent<T>(
  pool: readonly T[],
  excluded: readonly (T | null)[],
  rng: Rng,
): T | undefined {
  const candidates = pool.filter((item) => !excluded.includes(item));
  const choices = candidates.length > 0 ? candidates : pool;
  return choices[randomInt(choices.length, rng)];
}

/** Les cachettes du castelet à trois fenêtres. */
const HIDEOUTS: readonly number[] = [0, 1, 2];

/** Ce qui entre pour une apparition de ce genre : un personnage ou une image, jamais deux fois de suite. */
function pickSubject(
  config: GoNoGoLevelConfig,
  kind: AppearanceKind,
  previous: SubjectId | null,
  rng: Rng,
): SubjectId {
  if (config.rule === 'owl-says') {
    if (kind === 'target') return 'owl';
    return pickDifferent<SubjectId>(config.decoys, [previous], rng) ?? 'fox';
  }
  return kind === 'trap'
    ? (pickDifferent<SubjectId>(GROUNDED_IMAGES, [previous], rng) ?? 'cow')
    : (pickDifferent<SubjectId>(FLYING_IMAGES, [previous], rng) ?? 'pigeon');
}

/**
 * File d'une étoile : `appearances` apparitions dont `traps` pièges et `stops` STOP tardifs, aucun dans
 * les 3 premières, jamais plus de `maxTrapRun` d'affilée. Chaque image ou personnage est tiré sans
 * répétition immédiate, et la cachette change d'une apparition à l'autre.
 */
function planQueue(config: GoNoGoLevelConfig, rng: Rng): Appearance[] {
  const slots = pickNoGoSlots(config, rng);
  const kinds = shuffle<AppearanceKind>(
    [
      ...Array.from({ length: config.stops }, (): AppearanceKind => 'stop'),
      ...Array.from({ length: config.traps }, (): AppearanceKind => 'trap'),
    ],
    rng,
  );
  const kindAt = new Map(slots.map((slot, index) => [slot, kinds[index] ?? 'trap'] as const));
  const queue: Appearance[] = [];
  let previousSubject: SubjectId | null = null;
  let previousHideout = -1;
  for (let slot = 0; slot < config.appearances; slot += 1) {
    const kind: AppearanceKind = kindAt.get(slot) ?? 'target';
    const subject = pickSubject(config, kind, previousSubject, rng);
    const hideout =
      config.hideouts === 3 ? (pickDifferent(HIDEOUTS, [previousHideout], rng) ?? 0) : 0;
    queue.push({ id: slot + 1, kind, subject, hideout });
    previousSubject = subject;
    previousHideout = hideout;
  }
  return queue;
}

/**
 * Nouvelle partie : la file de l'étoile est tirée d'un coup, la cadence part de la fenêtre de départ.
 * Lève une `Error` listant les anomalies d'une configuration invalide (`getGoNoGoConfigErrors`).
 */
export function createGoNoGoGame(config: GoNoGoLevelConfig, rng: Rng = Math.random): GoNoGoState {
  const errors = getGoNoGoConfigErrors(config);
  if (errors.length > 0)
    throw new Error(`Configuration Pas si vite ! invalide : ${errors.join(' ; ')}`);
  return {
    config,
    status: 'between',
    queue: planQueue(config, rng),
    onStage: null,
    windowMs: config.startWindowMs,
    stopDelayMs: Math.min(START_STOP_DELAY_MS, config.stopDelayCeilingMs ?? START_STOP_DELAY_MS),
    runLength: 0,
    heldWindowMs: null,
    trapStreak: 0,
    missStreak: 0,
    shown: 0,
    cleared: 0,
    trapped: 0,
    missed: 0,
    lastResult: null,
  };
}

/**
 * Essais guidés (§9) : cible, cible, piège (ou STOP tardif), cible. Rien n'y est compté ni remis dans
 * la file : le plateau les joue sans passer par l'état de la partie, à `TRIAL_WINDOW_MS`.
 */
export function createTrialPlan(config: GoNoGoLevelConfig, rng: Rng = Math.random): Appearance[] {
  const kinds: AppearanceKind[] = [
    'target',
    'target',
    config.stops > 0 ? 'stop' : 'trap',
    'target',
  ];
  let previousSubject: SubjectId | null = null;
  return kinds.map((kind, index) => {
    const subject = pickSubject(config, kind, previousSubject, rng);
    previousSubject = subject;
    return { id: index + 1, kind, subject, hideout: config.hideouts === 3 ? index % 3 : 0 };
  });
}

/**
 * Issue d'une apparition. `pressedAtMs` : l'appui qui a eu lieu pendant la fenêtre, en ms depuis
 * l'entrée, ou `null` si la fenêtre s'est écoulée sans appui. Pour un STOP tardif, un appui avant
 * l'arrivée du STOP (`stopAtMs`) attrape la cible sans erreur ; après, c'est un piège touché.
 */
export function judgeAppearance(
  kind: AppearanceKind,
  pressedAtMs: number | null,
  stopAtMs: number | null,
): GoNoGoOutcome {
  if (pressedAtMs === null) return kind === 'target' ? 'missed' : 'passed';
  if (kind === 'target') return 'caught';
  if (kind === 'trap') return 'trapped';
  return stopAtMs !== null && pressedAtMs < stopAtMs ? 'caught' : 'trapped';
}

/** Délai du STOP d'une apparition : celui de la cadence, borné par la fenêtre moins `STOP_MARGIN_MS`. */
function getStopAtMs(state: GoNoGoState, windowMs: number): number {
  const ceiling = state.config.stopDelayCeilingMs ?? state.stopDelayMs;
  return Math.max(
    MIN_STOP_DELAY_MS,
    Math.min(state.stopDelayMs, ceiling, windowMs - STOP_MARGIN_MS),
  );
}

/** Garde-fou de durée : l'étoile a dépassé 1,5 fois sa longueur prévue, tout passe à l'échelon 3. */
export function isOverrun(state: GoNoGoState): boolean {
  return state.shown >= getShownLimit(state.config.appearances);
}

/** Paramètres de l'apparition qui entre, d'après l'échelle d'aide de sa famille d'erreurs (§6.4). */
function describePresentation(state: GoNoGoState, appearance: Appearance): Presentation {
  const isForced = isOverrun(state);
  if (appearance.kind === 'target') {
    const help = isForced ? 3 : getHelpStage(state.missStreak);
    return {
      // Échelon 3 : la cible attend sur la scène, sans limite de temps.
      windowMs: help === 3 ? null : state.windowMs,
      stopAtMs: null,
      help,
      isSlow: false,
      hasNoBadge: false,
      pulsesBuzzer: help >= 2,
      showsHand: help === 3,
    };
  }
  const help = isForced ? 3 : getHelpStage(state.trapStreak);
  const isSlow = help >= 2;
  const windowMs = isSlow
    ? Math.min(MAX_WINDOW_MS, Math.round(state.windowMs * SLOW_TRAP_FACTOR))
    : state.windowMs;
  return {
    windowMs,
    // Échelon 3 : un STOP presque immédiat, facile comme un piège ordinaire (§5.2).
    stopAtMs:
      appearance.kind === 'stop'
        ? help === 3
          ? MIN_STOP_DELAY_MS
          : getStopAtMs(state, windowMs)
        : null,
    help,
    isSlow,
    hasNoBadge: appearance.kind === 'trap' && help === 3,
    pulsesBuzzer: false,
    showsHand: false,
  };
}

/**
 * Fait entrer l'apparition suivante de la file. Ignorée si une apparition est déjà sur scène, si
 * l'étoile est gagnée, ou si la file est vide.
 */
export function startAppearance(state: GoNoGoState): GoNoGoState {
  if (state.status !== 'between') return state;
  const [next, ...queue] = state.queue;
  if (!next) return state;
  return {
    ...state,
    status: 'window',
    queue,
    onStage: { appearance: next, presentation: describePresentation(state, next) },
    shown: state.shown + 1,
  };
}

/**
 * Un piège remis à l'index `index` de la file reste-t-il dans `maxRun` pièges d'affilée ? Celui qui
 * vient d'être montré, juste avant la file, compte aussi : l'enfant vient de le voir.
 */
function fitsAt(queue: readonly Appearance[], index: number, maxRun: number): boolean {
  const flags = [true, ...queue.map((entry) => isNoGo(entry.kind))];
  flags.splice(index + 1, 0, true);
  return getRunLength(flags, index + 1) <= maxRun;
}

/**
 * Voisines d'une remise posée à l'index `index` : celle qui la précède (à l'index 0, l'apparition qui
 * vient d'être montrée) et celle qui la suit, s'il y en a une.
 */
function getNeighbours(
  queue: readonly Appearance[],
  index: number,
  shown: Appearance,
): Appearance[] {
  const before = index === 0 ? shown : queue[index - 1];
  return [before, queue[index]].filter((entry): entry is Appearance => entry !== undefined);
}

/** La même image deux fois de suite ; la chouette, seule cible de la règle 1, revient par nature. */
function isSameImage(left: Appearance, right: Appearance): boolean {
  return left.subject === right.subject && left.subject !== 'owl';
}

/**
 * Remet une apparition dans la file, 2 à 4 apparitions plus tard (index 1 à 3), selon les règles de la
 * file (§3.3, §14.2.2) : un piège ne s'aligne pas au-delà de `maxTrapRun` avec ses voisins, celui qui
 * vient d'être montré compris, et l'image ne côtoie pas la même image. La remise glisse vers la fin,
 * puis vers le début (jamais à l'index 0 : elle reviendrait aussitôt) ; à défaut d'une place qui
 * respecte tout, la première qui respecte les pièges, sinon tout à la fin. Avec trois cachettes, elle
 * change de cachette si l'une de ses voisines a la sienne.
 */
function insertRetry(
  queue: readonly Appearance[],
  appearance: Appearance,
  config: GoNoGoLevelConfig,
  rng: Rng,
): Appearance[] {
  const gap = MIN_RETRY_GAP + randomInt(MAX_RETRY_GAP - MIN_RETRY_GAP + 1, rng);
  const wanted = Math.min(gap - 1, queue.length);
  const order = [
    ...Array.from({ length: queue.length - wanted + 1 }, (_, offset) => wanted + offset),
    ...Array.from({ length: Math.max(0, wanted - 1) }, (_, offset) => wanted - 1 - offset),
  ];
  const fitsTraps = (index: number) =>
    !isNoGo(appearance.kind) || fitsAt(queue, index, config.maxTrapRun);
  const index =
    order.find(
      (candidate) =>
        fitsTraps(candidate) &&
        getNeighbours(queue, candidate, appearance).every(
          (neighbour) => !isSameImage(neighbour, appearance),
        ),
    ) ??
    order.find(fitsTraps) ??
    queue.length;
  let retry = appearance;
  if (config.hideouts === 3) {
    const taken = getNeighbours(queue, index, appearance).map((neighbour) => neighbour.hideout);
    if (taken.includes(appearance.hideout)) {
      retry = { ...appearance, hideout: pickDifferent(HIDEOUTS, taken, rng) ?? 0 };
    }
  }
  return [...queue.slice(0, index), retry, ...queue.slice(index)];
}

/**
 * Résout l'apparition sur scène : `pressedAtMs` est l'appui de la fenêtre (en ms depuis l'entrée),
 * `null` si elle s'est écoulée sans appui. Une cible ratée ou un piège touché est remis dans la file ;
 * la cadence s'adapte (§5) ; l'étoile est gagnée quand la file est vide après une réussite. Un appui
 * hors de la fenêtre est ignoré comme une fenêtre écoulée, et une cible qui attend (échelon 3) ne
 * s'écoule pas : sans appui, l'état reçu est renvoyé tel quel. Attrapée, cette cible qui attendait
 * remet l'échelle d'aide à zéro, mais ne dit rien de la vitesse : elle interrompt la série de réussites
 * sans toucher à la fenêtre (§14.2.1). La réussite qui gagne l'étoile n'accélère rien : la fenêtre de
 * fin de partie est celle que l'enfant vient de jouer.
 */
export function resolveAppearance(
  state: GoNoGoState,
  pressedAtMs: number | null,
  rng: Rng = Math.random,
): GoNoGoState {
  const { onStage, config } = state;
  if (state.status !== 'window' || !onStage) return state;
  const { appearance: current, presentation } = onStage;
  const isLate =
    pressedAtMs !== null && presentation.windowMs !== null && pressedAtMs >= presentation.windowMs;
  const press = isLate ? null : pressedAtMs;
  if (press === null && presentation.windowMs === null) return state;

  const outcome = judgeAppearance(current.kind, press, presentation.stopAtMs);
  const isSuccess = outcome === 'caught' || outcome === 'passed';
  const isWon = isSuccess && state.queue.length === 0;
  let { windowMs, runLength, heldWindowMs, trapStreak, missStreak, stopDelayMs } = state;

  if (isSuccess && presentation.windowMs === null) {
    // La cible attendait : rien n'a été joué contre le temps.
    runLength = 0;
    missStreak = 0;
  } else if (isSuccess) {
    runLength += 1;
    if (runLength >= HELD_RUN)
      heldWindowMs = Math.min(heldWindowMs ?? state.windowMs, state.windowMs);
    if (runLength % SPEED_UP_STREAK === 0 && !isWon) {
      windowMs = Math.max(config.fastestWindowMs, Math.round(windowMs * SPEED_UP_FACTOR));
    }
    if (outcome === 'caught') missStreak = 0;
    else trapStreak = 0;
  } else {
    runLength = 0;
    windowMs = Math.min(
      MAX_WINDOW_MS,
      Math.round(windowMs * (outcome === 'missed' ? MISS_SLOWDOWN : TRAP_SLOWDOWN)),
    );
    if (outcome === 'missed') missStreak += 1;
    else trapStreak += 1;
  }

  if (current.kind === 'stop') {
    // Un STOP réussi laisse le suivant arriver plus tard ; manqué, ou devancé par un appui, plus tôt.
    stopDelayMs =
      outcome === 'passed'
        ? Math.min(config.stopDelayCeilingMs ?? stopDelayMs, stopDelayMs + STOP_SUCCESS_STEP_MS)
        : Math.max(MIN_STOP_DELAY_MS, stopDelayMs - STOP_FAILURE_STEP_MS);
  }

  const queue = isSuccess ? state.queue : insertRetry(state.queue, current, config, rng);
  let help: HelpStage = 0;
  if (outcome === 'missed') help = getHelpStage(missStreak);
  else if (outcome === 'trapped') help = getHelpStage(trapStreak);
  const lastResult: AppearanceResult = { appearance: current, outcome, help };

  return {
    ...state,
    status: isWon ? 'won' : 'between',
    queue,
    onStage: null,
    windowMs,
    stopDelayMs,
    runLength,
    heldWindowMs,
    trapStreak,
    missStreak,
    cleared: state.cleared + (isSuccess ? 1 : 0),
    trapped: state.trapped + (outcome === 'trapped' ? 1 : 0),
    missed: state.missed + (outcome === 'missed' ? 1 : 0),
    lastResult,
  };
}

/**
 * Interrompt l'apparition sur scène sans conséquence (inaction, page masquée, §6.5) : elle retourne
 * en tête de la file, n'est pas comptée parmi les apparitions montrées, et la cadence ne bouge pas.
 */
export function interruptAppearance(state: GoNoGoState): GoNoGoState {
  const { onStage } = state;
  if (state.status !== 'window' || !onStage) return state;
  return {
    ...state,
    status: 'between',
    queue: [onStage.appearance, ...state.queue],
    onStage: null,
    shown: state.shown - 1,
  };
}

/** Couronne : aucun piège touché de toute l'étoile, STOP tardifs compris ; une cible ratée ne la fait pas perdre. */
export function isPerfectWin(state: GoNoGoState): boolean {
  return state.status === 'won' && state.trapped === 0;
}

/**
 * Vitesse tenue, en ms : la fenêtre la plus courte sur laquelle l'enfant a enchaîné 8 réussites dans le
 * temps, à défaut la fenêtre de fin de partie, celle de la dernière apparition (§11.2, §14.2.1).
 */
export function getHeldWindowMs(state: GoNoGoState): number {
  return state.heldWindowMs ?? state.windowMs;
}

/** Vitesse tenue enregistrée comme `timeSeconds` : en secondes, au centième près. */
export function getHeldSpeedSeconds(state: GoNoGoState): number {
  return Math.round(getHeldWindowMs(state) / 10) / 100;
}
