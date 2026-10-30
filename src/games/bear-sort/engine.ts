import { shuffle, type Rng } from '@/games/memory/random';
import type {
  Bear,
  BearBounceKind,
  BearCounts,
  BearKind,
  BearSortHintLevel,
  BearSortLevelConfig,
  BearSortPhaseConfig,
  BearSortRule,
  BearSortState,
  BearSortZone,
  BearSortZoneId,
  BearTraits,
  SortFeature,
} from './types';

/**
 * Moteur d'Attrape-Piège (FEAT-23) : fonctions pures, sans React ni DOM. Chaque action renvoie un
 * nouvel état sans modifier celui reçu ; une action ignorée renvoie l'état reçu lui-même (React n'a
 * rien à redessiner). Le hasard passe par `rng` (`Math.random` par défaut). Une partie ne se perd
 * jamais : un rebond rend l'ours à la réserve, et l'étoile s'obtient en finissant.
 */

/** Les quatre sortes d'ours, dans l'ordre où `addBears` les crée (avant mélange). */
export const BEAR_KINDS: readonly BearKind[] = [
  'blue-small',
  'blue-big',
  'yellow-small',
  'yellow-big',
];

const BEAR_KIND_TRAITS: Readonly<Record<BearKind, BearTraits>> = {
  'blue-small': { color: 'blue', size: 'small' },
  'blue-big': { color: 'blue', size: 'big' },
  'yellow-small': { color: 'yellow', size: 'small' },
  'yellow-big': { color: 'yellow', size: 'big' },
};

function getKindCount(counts: BearCounts, kind: BearKind): number {
  return counts[kind] ?? 0;
}

/** Nombre d'ours de `counts` qui vérifient `predicate` (tous par défaut). */
function countBears(
  counts: BearCounts,
  predicate: (traits: BearTraits) => boolean = () => true,
): number {
  return BEAR_KINDS.reduce(
    (total, kind) =>
      predicate(BEAR_KIND_TRAITS[kind]) ? total + getKindCount(counts, kind) : total,
    0,
  );
}

/** Boîte voulue par une règle de tri : celle qui partage la caractéristique de l'ours. */
function getSortZoneId(
  zones: BearSortLevelConfig['zones'],
  feature: SortFeature,
  bear: BearTraits,
): 'left' | 'right' {
  const [left] = zones;
  return left[feature] === bear[feature] ? 'left' : 'right';
}

/**
 * Ours en conflit : sa couleur et sa taille l'envoient dans deux boîtes différentes. C'est le seul
 * à exiger de l'enfant qu'il inhibe l'ancienne règle ; un ours sans conflit va dans la même boîte
 * quelle que soit la règle.
 */
export function isConflictBear(zones: BearSortLevelConfig['zones'], bear: BearTraits): boolean {
  return getSortZoneId(zones, 'color', bear) !== getSortZoneId(zones, 'size', bear);
}

/** Ours exclu par une règle `except` : il porte toutes les caractéristiques interdites. */
export function isBearForbidden(rule: BearSortRule, bear: BearTraits): boolean {
  if (rule.kind !== 'except') return false;
  const { color, size } = rule.forbidden;
  return (
    (color === undefined || color === bear.color) && (size === undefined || size === bear.size)
  );
}

/** Anomalies des boîtes : elles doivent s'opposer à la fois par la couleur et par la taille. */
function getZoneErrors([left, right]: BearSortLevelConfig['zones']): string[] {
  const errors: string[] = [];
  if (left.color === right.color) errors.push(`les deux boîtes sont de couleur ${left.color}`);
  if (left.size === right.size) errors.push(`les deux boîtes sont de taille ${left.size}`);
  return errors;
}

/** Anomalies du contenu d'une phase `sort` : deux boîtes à remplir, un conflit après un changement. */
function getSortPhaseErrors(
  phase: BearSortPhaseConfig,
  feature: SortFeature,
  zones: BearSortLevelConfig['zones'],
  previousRule: BearSortRule | null,
): string[] {
  const [left, right] = zones;
  const errors: string[] = [];
  const isInLeft = (bear: BearTraits) => bear[feature] === left[feature];
  const isInRight = (bear: BearTraits) => bear[feature] === right[feature];
  if (countBears(phase.addBears, isInLeft) === 0 || countBears(phase.addBears, isInRight) === 0) {
    errors.push(`les ours ajoutés ne remplissent pas les deux boîtes (tri par ${feature})`);
  }
  if (previousRule?.kind !== 'sort') return errors;
  if (previousRule.feature === feature) {
    errors.push(`même règle que la phase précédente (tri par ${feature})`);
  } else if (countBears(phase.addBears, (bear) => isConflictBear(zones, bear)) === 0) {
    errors.push('aucun ours en conflit après le changement de règle');
  }
  return errors;
}

/** Anomalies du contenu d'une phase `except` : il faut un ours permis et un ours interdit. */
function getExceptPhaseErrors(phase: BearSortPhaseConfig, isLast: boolean): string[] {
  const errors: string[] = [];
  if (!isLast) errors.push('une règle « sauf » termine toujours l’étoile');
  const forbidden = countBears(phase.addBears, (bear) => isBearForbidden(phase.rule, bear));
  if (forbidden === 0) errors.push('aucun ours interdit ajouté');
  if (forbidden === countBears(phase.addBears)) errors.push('aucun ours permis ajouté');
  return errors;
}

/** Anomalies de `placements`, `waiting` étant le nombre d'ours de la réserve au début de la phase. */
function getPlacementErrors({ placements }: BearSortPhaseConfig, isLast: boolean, waiting: number) {
  if (isLast) {
    return placements === null ? [] : ['la dernière phase se joue jusqu’au bout (placements null)'];
  }
  if (placements === null || !Number.isInteger(placements) || placements < 1) {
    return [`placements ${String(placements)} invalide (entier ≥ 1 attendu avant un STOP)`];
  }
  return placements < waiting
    ? []
    : [
        `placements ${String(placements)} : le STOP doit interrompre des ours qui attendent (${String(waiting)} dans la réserve)`,
      ];
}

/** Anomalies de chaque phase ; la réserve est suivie d'une phase à l'autre. */
function getPhaseErrors({ zones, phases }: BearSortLevelConfig): string[] {
  if (phases.length === 0) return ['aucune phase'];
  const errors: string[] = [];
  let waiting = 0;
  phases.forEach((phase, index) => {
    const isLast = index === phases.length - 1;
    const previousRule = phases[index - 1]?.rule ?? null;
    const name = `phase ${String(index + 1)}`;
    const phaseErrors: string[] = [];
    for (const kind of BEAR_KINDS) {
      const count = getKindCount(phase.addBears, kind);
      if (!Number.isInteger(count) || count < 0) {
        phaseErrors.push(`${kind} : ${String(count)} ours (entier ≥ 0 attendu)`);
      }
    }
    phaseErrors.push(
      ...(phase.rule.kind === 'sort'
        ? getSortPhaseErrors(phase, phase.rule.feature, zones, previousRule)
        : getExceptPhaseErrors(phase, isLast)),
    );
    waiting += countBears(phase.addBears);
    phaseErrors.push(...getPlacementErrors(phase, isLast, waiting));
    waiting -= phase.placements ?? 0;
    errors.push(...phaseErrors.map((error) => `${name} : ${error}`));
  });
  return errors;
}

/**
 * Anomalies d'une configuration de niveau, un message français par anomalie (liste vide : valide).
 * Reprise par `validateBearSortCatalog` (FEAT-25).
 */
export function getBearSortConfigErrors(config: BearSortLevelConfig): string[] {
  return [...getZoneErrors(config.zones), ...getPhaseErrors(config)];
}

function createZones(config: BearSortLevelConfig, rule: BearSortRule): BearSortZone[] {
  if (rule.kind === 'except') return [{ id: 'open', traits: null, bears: [] }];
  const [left, right] = config.zones;
  return [
    { id: 'left', traits: left, bears: [] },
    { id: 'right', traits: right, bears: [] },
  ];
}

/** Ours créés par une phase ; `phaseIndex` garde leur `uid` unique dans toute la partie. */
function createPhaseBears(phase: BearSortPhaseConfig, phaseIndex: number): Bear[] {
  const kinds = BEAR_KINDS.flatMap((kind) =>
    Array.from({ length: getKindCount(phase.addBears, kind) }, () => BEAR_KIND_TRAITS[kind]),
  );
  return kinds.map((traits, rank) => ({ ...traits, uid: `${String(phaseIndex)}-${String(rank)}` }));
}

/**
 * Nouvelle partie, à la première phase : son rythme est celui de l'habitude que la suite va briser.
 * Lève une `Error` listant les anomalies d'une configuration invalide (`getBearSortConfigErrors`).
 */
export function createBearSortGame(
  config: BearSortLevelConfig,
  rng: Rng = Math.random,
): BearSortState {
  const errors = getBearSortConfigErrors(config);
  const [phase] = config.phases;
  if (errors.length > 0 || !phase) {
    throw new Error(`Configuration Attrape-Piège invalide : ${errors.join(' ; ')}`);
  }
  return {
    config,
    status: 'playing',
    phaseIndex: 0,
    rule: phase.rule,
    previousRule: null,
    placementsLeft: phase.placements,
    reserve: shuffle(createPhaseBears(phase, 0), rng),
    zones: createZones(config, phase.rule),
    moves: 0,
    mistakes: 0,
    errorStreak: 0,
    lastBounce: null,
  };
}

/** Boîte voulue pour un ours par la règle en vigueur, `null` pour un ours interdit. */
export function getTargetZoneId(state: BearSortState, bear: BearTraits): BearSortZoneId | null {
  const { rule } = state;
  if (rule.kind === 'except') return isBearForbidden(rule, bear) ? null : 'open';
  return getSortZoneId(state.config.zones, rule.feature, bear);
}

function classifyBounce(state: BearSortState, bear: Bear, zoneId: BearSortZoneId): BearBounceKind {
  if (state.rule.kind === 'except') return 'forbidden';
  const { previousRule } = state;
  if (previousRule?.kind !== 'sort') return 'slip';
  return getSortZoneId(state.config.zones, previousRule.feature, bear) === zoneId
    ? 'old-rule'
    : 'slip';
}

/** Fin de phase : plus rien à ranger, ou assez d'ours rangés pour que le STOP les interrompe. */
function isPhaseComplete(state: BearSortState): boolean {
  const { rule } = state;
  if (rule.kind === 'except') return state.reserve.every((bear) => isBearForbidden(rule, bear));
  return state.placementsLeft === 0 || state.reserve.length === 0;
}

/**
 * Dépose un ours de la réserve dans une boîte de la phase. Bonne boîte : l'ours y reste et la phase
 * peut s'achever (panneau STOP, ou victoire à la dernière). Mauvaise boîte : l'ours rebondit, reste
 * dans la réserve, et le rebond fait monter l'échelle d'indices. Ignorée hors `playing`, et pour un
 * ours ou une boîte absents de la phase.
 */
export function dropBear(
  state: BearSortState,
  bearUid: string,
  zoneId: BearSortZoneId,
): BearSortState {
  const bear = state.reserve.find((candidate) => candidate.uid === bearUid);
  if (state.status !== 'playing' || !bear || !state.zones.some((zone) => zone.id === zoneId)) {
    return state;
  }

  if (getTargetZoneId(state, bear) !== zoneId) {
    return {
      ...state,
      moves: state.moves + 1,
      mistakes: state.mistakes + 1,
      errorStreak: state.errorStreak + 1,
      lastBounce: { bearUid, zoneId, kind: classifyBounce(state, bear, zoneId) },
    };
  }

  const placed: BearSortState = {
    ...state,
    reserve: state.reserve.filter((candidate) => candidate.uid !== bearUid),
    zones: state.zones.map((zone) =>
      zone.id === zoneId ? { ...zone, bears: [...zone.bears, bear] } : zone,
    ),
    placementsLeft: state.placementsLeft === null ? null : state.placementsLeft - 1,
    moves: state.moves + 1,
    errorStreak: 0,
    lastBounce: null,
  };
  if (!isPhaseComplete(placed)) return placed;
  return { ...placed, status: getUpcomingRule(placed) === null ? 'won' : 'stop' };
}

/** Règle de la phase suivante (annoncée pendant le panneau STOP), `null` à la dernière phase. */
export function getUpcomingRule(state: BearSortState): BearSortRule | null {
  return state.config.phases[state.phaseIndex + 1]?.rule ?? null;
}

/**
 * Sortie du panneau STOP : la phase suivante commence, les ours rangés sortent des boîtes et les
 * nouveaux ours rejoignent ceux qui attendaient, dans un nouvel ordre. Ignorée hors `stop`.
 */
export function continueAfterStop(state: BearSortState, rng: Rng = Math.random): BearSortState {
  const phaseIndex = state.phaseIndex + 1;
  const phase = state.config.phases[phaseIndex];
  if (state.status !== 'stop' || !phase) return state;
  return {
    ...state,
    status: 'playing',
    phaseIndex,
    rule: phase.rule,
    previousRule: state.rule,
    placementsLeft: phase.placements,
    reserve: shuffle([...state.reserve, ...createPhaseBears(phase, phaseIndex)], rng),
    zones: createZones(state.config, phase.rule),
    errorStreak: 0,
    lastBounce: null,
  };
}

/** Échelon d'indice : le nombre de rebonds d'affilée, plafonné à 3. */
export function getHintLevel({ errorStreak }: BearSortState): BearSortHintLevel {
  if (errorStreak >= 3) return 3;
  if (errorStreak === 2) return 2;
  return errorStreak === 1 ? 1 : 0;
}

/**
 * Caractéristique estompée à partir du 2ᵉ rebond d'affilée d'une phase de tri : celle que la règle
 * ignore (la couleur quand on trie par taille), le temps que le conflit disparaisse. `null` sinon.
 */
export function getFadedFeature(state: BearSortState): SortFeature | null {
  if (state.rule.kind !== 'sort' || getHintLevel(state) < 2) return null;
  return state.rule.feature === 'size' ? 'color' : 'size';
}

/** Ours suivant de la réserve à la télécommande (« laisser cet ours »), en boucle. */
export function getNextBearUid(state: BearSortState, bearUid: string): string | null {
  const { reserve } = state;
  const index = reserve.findIndex((bear) => bear.uid === bearUid);
  return reserve[(index + 1) % reserve.length]?.uid ?? null;
}

/** Victoire « Parfait » (couronne) : étoile finie sans aucun rebond. */
export function isPerfectWin(state: BearSortState): boolean {
  return state.status === 'won' && state.mistakes === 0;
}
