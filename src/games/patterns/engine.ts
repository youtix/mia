import type { SoundBeat } from '@/core/audio/types';
// Module pur de Memory : réutilisé tel quel plutôt que dupliqué (générateur injectable, mélange).
import { shuffle, type Rng } from '@/games/memory/random';
import { DISTINCT_ITEM_COLORS, PATTERN_ITEMS, SAME_ITEM_COLOR } from './items';
import type {
  PatternChoice,
  PatternGameState,
  PatternItem,
  PatternLevelConfig,
  PatternRole,
  PatternRound,
  PatternRule,
} from './types';

/**
 * Moteur de Suites Logiques (FEAT-21) : fonctions pures, sans React ni DOM. Chaque action renvoie un
 * nouvel état sans modifier celui reçu ; une action ignorée renvoie l'état reçu lui-même (React n'a
 * rien à redessiner). Le hasard passe par `rng` (`Math.random` par défaut) et le temps par `nowMs`
 * (horloge de l'appelant, `performance.now()` dans le plateau) : aucune minuterie ici.
 */

/** Propositions de chaque défi. */
export const CHOICE_COUNT = 3;

/** Longueur maximale de la ligne de lecture : elle tient sur une ligne, même sur un téléphone. */
export const MAX_VISIBLE_ITEMS = 6;

/**
 * Une mauvaise réponse donnée moins de 1,2 s après le déverrouillage déclenche un STOP : elle ferme
 * le chemin « je tape tout », sans jamais pénaliser une bonne réponse rapide.
 */
export const TOO_FAST_MS = 1200;

const UNIT_LENGTHS: Readonly<Record<PatternRule, number>> = { ab: 2, abb: 3 };

/**
 * Mauvaises réponses d'un défi sonore, par règle et nombre de temps : mêmes sons, même durée, seul
 * l'ordre change. La bonne réponse est la suite elle-même (A-B-A-B, A-B-B, A-B-B-A-B-B).
 */
const SOUND_DISTRACTORS: Readonly<
  Record<PatternRule, Readonly<Record<number, readonly (readonly PatternRole[])[]>>>
> = {
  ab: {
    4: [
      ['A', 'A', 'B', 'B'],
      ['A', 'B', 'B', 'A'],
    ],
  },
  abb: {
    3: [
      ['A', 'A', 'B'],
      ['A', 'B', 'A'],
    ],
    6: [
      ['A', 'A', 'B', 'A', 'A', 'B'],
      ['A', 'B', 'A', 'A', 'B', 'A'],
    ],
  },
};

const FAMILIES: readonly string[] = ['animals', 'shapes'];
const COLOR_MODES: readonly string[] = ['distinct', 'same'];
const SOUND_PAIRINGS: readonly string[] = ['fixed', 'varied'];

function isWholeNumber(value: number, min: number): boolean {
  return Number.isInteger(value) && value >= min;
}

function isPatternRule(value: string): value is PatternRule {
  return Object.hasOwn(UNIT_LENGTHS, value);
}

/** Longueur de l'unité répétée (A-B : 2, A-B-B : 3) : la ligne se découpe ainsi pour l'aide. */
export function getUnitLength(rule: PatternRule): number {
  return UNIT_LENGTHS[rule];
}

/** Rôle de la position `position` : A ouvre chaque unité, B la complète (règles A-B et A-B-B). */
function getRoleAt(rule: PatternRule, position: number): PatternRole {
  return position % getUnitLength(rule) === 0 ? 'A' : 'B';
}

/** Anomalies de la ligne de lecture et des réponses, sans message en cascade d'une valeur invalide. */
function getAnswerErrors(config: PatternLevelConfig): string[] {
  const { visibleItems, answerMode, soundPairing } = config;
  const mode: string = answerMode;
  const rule: string = config.rule;
  const errors: string[] = [];

  if (mode !== 'visual' && mode !== 'sound') errors.push(`answerMode « ${mode} » inconnu`);
  if (mode === 'visual' && soundPairing !== null) {
    errors.push('soundPairing invalide (null attendu pour des réponses en pièces)');
  }
  if (mode === 'sound' && (soundPairing === null || !SOUND_PAIRINGS.includes(soundPairing))) {
    errors.push('soundPairing invalide (fixed ou varied attendu pour des réponses en sons)');
  }
  if (!isPatternRule(rule)) return errors;

  if (mode === 'sound') {
    const beats = Object.keys(SOUND_DISTRACTORS[rule]);
    if (!beats.includes(String(visibleItems))) {
      errors.push(
        `visibleItems ${String(visibleItems)} invalide pour la règle « ${rule} » en sons (${beats.join(' ou ')} attendu)`,
      );
    }
  } else if (mode === 'visual') {
    const min = getUnitLength(rule) + 2;
    if (!isWholeNumber(visibleItems, min) || visibleItems > MAX_VISIBLE_ITEMS) {
      errors.push(
        `visibleItems ${String(visibleItems)} invalide pour la règle « ${rule} » en pièces (entier de ${String(min)} à ${String(MAX_VISIBLE_ITEMS)} attendu)`,
      );
    }
  }
  return errors;
}

/**
 * Anomalies d'une configuration de niveau, un message français par anomalie (liste vide : valide).
 * Reprise par `validatePatternsCatalog`.
 */
export function getPatternsConfigErrors(config: PatternLevelConfig): string[] {
  const { rounds, stopRounds, stopSeconds } = config;
  const rule: string = config.rule;
  const family: string = config.family;
  const colorMode: string = config.colorMode;
  const errors: string[] = [];

  if (!isPatternRule(rule)) errors.push(`rule « ${rule} » inconnue`);
  if (!FAMILIES.includes(family)) errors.push(`family « ${family} » inconnue`);
  if (!COLOR_MODES.includes(colorMode)) errors.push(`colorMode « ${colorMode} » inconnu`);
  errors.push(...getAnswerErrors(config));

  const isRoundsValid = isWholeNumber(rounds, 1);
  if (!isRoundsValid) errors.push(`rounds ${String(rounds)} invalide (entier ≥ 1 attendu)`);
  if (!isWholeNumber(stopRounds, 0)) {
    errors.push(`stopRounds ${String(stopRounds)} invalide (entier ≥ 0 attendu)`);
  } else if (isRoundsValid && stopRounds > rounds) {
    errors.push(`stopRounds ${String(stopRounds)} supérieur à rounds ${String(rounds)}`);
  }
  if (!(Number.isFinite(stopSeconds) && stopSeconds > 0)) {
    errors.push(`stopSeconds ${String(stopSeconds)} invalide (nombre fini > 0 attendu)`);
  }
  return errors;
}

type PatternTrio = [PatternItem, PatternItem, PatternItem];

/** Trois éléments distincts de la famille : A, B et, pour les pièces, l'intrus. */
function drawTrio(config: PatternLevelConfig, rng: Rng): PatternTrio {
  const colors = shuffle(DISTINCT_ITEM_COLORS, rng);
  return shuffle(PATTERN_ITEMS[config.family], rng)
    .slice(0, 3)
    .map((id, index): PatternItem => ({
      id,
      colorClass:
        config.colorMode === 'same' ? SAME_ITEM_COLOR : (colors[index] ?? SAME_ITEM_COLOR),
    })) as PatternTrio;
}

/** Ligne de lecture : les `visibleItems` premiers éléments de la suite. */
function buildRow(config: PatternLevelConfig, itemA: PatternItem, itemB: PatternItem) {
  return Array.from({ length: config.visibleItems }, (_, position) =>
    getRoleAt(config.rule, position) === 'A' ? itemA : itemB,
  );
}

/** Défi en pièces : la suite s'arrête avant sa dernière pièce, à retrouver parmi A, B et l'intrus. */
function createItemRound(
  config: PatternLevelConfig,
  startsWithStop: boolean,
  rng: Rng,
): PatternRound {
  const [itemA, itemB, intruder] = drawTrio(config, rng);
  const answer = getRoleAt(config.rule, config.visibleItems) === 'A' ? itemA : itemB;
  const items = shuffle([itemA, itemB, intruder], rng);
  return {
    row: buildRow(config, itemA, itemB),
    choices: items.map((item): PatternChoice => ({ kind: 'item', item })),
    correctIndex: items.indexOf(answer),
    startsWithStop,
  };
}

/** Défi en sons : la bonne réponse suit la structure de la ligne, les autres en changent l'ordre. */
function createSoundRound(
  config: PatternLevelConfig,
  pair: {
    itemA: PatternItem;
    itemB: PatternItem;
    soundA: SoundBeat;
    soundB: SoundBeat;
  },
  startsWithStop: boolean,
  rng: Rng,
): PatternRound {
  const { rule, visibleItems } = config;
  const answer = Array.from({ length: visibleItems }, (_, position) => getRoleAt(rule, position));
  const patterns = shuffle([answer, ...(SOUND_DISTRACTORS[rule][visibleItems] ?? [])], rng);
  return {
    row: buildRow(config, pair.itemA, pair.itemB),
    choices: patterns.map((pattern): PatternChoice => ({
      kind: 'sound',
      beats: pattern.map((role) => (role === 'A' ? pair.soundA : pair.soundB)),
    })),
    correctIndex: patterns.indexOf(answer),
    startsWithStop,
  };
}

/**
 * Fabrique les défis d'une étoile. Sons : A change de son (et, pour `fixed`, d'élément) à chaque
 * défi. `fixed` garde les deux mêmes éléments, chacun avec son son, pendant toute l'étoile ; `varied`
 * tire de nouveaux éléments à chaque défi : un élément n'annonce jamais son son.
 */
function createRoundFactory(config: PatternLevelConfig, rng: Rng) {
  const stopIndices = new Set(
    shuffle(
      Array.from({ length: config.rounds }, (_, index) => index),
      rng,
    ).slice(0, config.stopRounds),
  );
  const starTrio = drawTrio(config, rng);
  const swapOffset = rng() < 0.5 ? 0 : 1;

  return (index: number): PatternRound => {
    const startsWithStop = stopIndices.has(index);
    if (config.answerMode === 'visual') return createItemRound(config, startsWithStop, rng);

    const [bellItem, drumItem] = config.soundPairing === 'fixed' ? starTrio : drawTrio(config, rng);
    const isSwapped = (index + swapOffset) % 2 === 1;
    return createSoundRound(
      config,
      isSwapped
        ? { itemA: drumItem, itemB: bellItem, soundA: 'drum', soundB: 'bell' }
        : { itemA: bellItem, itemB: drumItem, soundA: 'bell', soundB: 'drum' },
      startsWithStop,
      rng,
    );
  };
}

/**
 * Nouvelle partie : les `rounds` défis de l'étoile sont tirés d'un coup et la partie s'ouvre en
 * `intro`. Lève une `Error` listant les anomalies d'une configuration invalide
 * (`getPatternsConfigErrors`).
 */
export function createPatternsGame(
  config: PatternLevelConfig,
  rng: Rng = Math.random,
): PatternGameState {
  const errors = getPatternsConfigErrors(config);
  if (errors.length > 0) {
    throw new Error(`Configuration Suites Logiques invalide : ${errors.join(' ; ')}`);
  }

  const createRound = createRoundFactory(config, rng);
  const round = createRound(0);
  return {
    config,
    phase: 'intro',
    rounds: [
      round,
      ...Array.from({ length: config.rounds - 1 }, (_, index) => createRound(index + 1)),
    ],
    round,
    roundIndex: 0,
    armedIndex: null,
    roundMistakes: 0,
    mistakes: 0,
    impulsiveTaps: 0,
    moves: 0,
    unlockedAtMs: 0,
    lastWrongIndex: null,
    wrongTick: 0,
  };
}

/** Fin de l'apparition du défi : STOP s'il en a un, sinon propositions déverrouillées. */
export function beginRound(state: PatternGameState, nowMs: number): PatternGameState {
  if (state.phase !== 'intro') return state;
  return {
    ...state,
    phase: state.round.startsWithStop ? 'stop' : 'choosing',
    unlockedAtMs: nowMs,
  };
}

/** Fin du STOP : propositions déverrouillées. Ignorée hors `stop`. */
export function endStop(state: PatternGameState, nowMs: number): PatternGameState {
  if (state.phase !== 'stop') return state;
  return { ...state, phase: 'choosing', unlockedAtMs: nowMs };
}

/** Fin de l'écoute d'une proposition : elle reste prête à être validée. Ignorée hors `listening`. */
export function endListening(state: PatternGameState, nowMs: number): PatternGameState {
  if (state.phase !== 'listening') return state;
  return { ...state, phase: 'choosing', unlockedAtMs: nowMs };
}

/** Bonne réponse : place au succès. Mauvaise : elle rebondit, et un STOP suit si elle était trop rapide. */
function validateChoice(state: PatternGameState, index: number, nowMs: number): PatternGameState {
  const moves = state.moves + 1;
  if (index === state.round.correctIndex) {
    return { ...state, phase: 'success', armedIndex: null, moves };
  }
  return {
    ...state,
    phase: nowMs - state.unlockedAtMs < TOO_FAST_MS ? 'stop' : 'choosing',
    armedIndex: null,
    moves,
    roundMistakes: state.roundMistakes + 1,
    mistakes: state.mistakes + 1,
    unlockedAtMs: nowMs,
    lastWrongIndex: index,
    wrongTick: state.wrongTick + 1,
  };
}

/**
 * Tap, clic ou OK sur la proposition `index`.
 * - `stop` : compté comme un geste impulsif (la couronne est perdue), le STOP continue tel quel.
 * - `choosing`, pièces : la réponse est validée.
 * - `choosing`, sons : une proposition nouvelle est écoutée (`listening`) ; celle qui est déjà prête
 *   est validée. Une réponse n'est donc jamais donnée sans avoir été entendue.
 * - Ignorée dans les autres phases (`listening` compris : un double tap ne valide jamais) et hors
 *   des propositions.
 */
export function tapChoice(state: PatternGameState, index: number, nowMs: number): PatternGameState {
  if (!Number.isInteger(index) || index < 0 || index >= state.round.choices.length) return state;
  if (state.phase === 'stop') return { ...state, impulsiveTaps: state.impulsiveTaps + 1 };
  if (state.phase !== 'choosing') return state;
  if (state.config.answerMode === 'sound' && state.armedIndex !== index) {
    return { ...state, phase: 'listening', armedIndex: index };
  }
  return validateChoice(state, index, nowMs);
}

/** Fin du succès : défi suivant, ou étoile gagnée après le dernier. Ignorée hors `success`. */
export function advanceRound(state: PatternGameState): PatternGameState {
  if (state.phase !== 'success') return state;
  const roundIndex = state.roundIndex + 1;
  const round = state.rounds[roundIndex];
  if (!round) return { ...state, phase: 'won' };
  return {
    ...state,
    phase: 'intro',
    round,
    roundIndex,
    armedIndex: null,
    roundMistakes: 0,
    lastWrongIndex: null,
  };
}

/**
 * Échelle d'aide du défi en cours : 0 (aucune), 1 après 2 mauvaises réponses (la ligne montre son
 * unité répétée), 2 après 3 (la bonne proposition luit) : un enfant bloqué finit toujours le défi.
 */
export function getHelpLevel(state: PatternGameState): 0 | 1 | 2 {
  if (state.roundMistakes >= 3) return 2;
  return state.roundMistakes === 2 ? 1 : 0;
}

/** Victoire « Parfait » (couronne) : aucune mauvaise réponse, aucune tape pendant un STOP. */
export function isPerfectWin(state: PatternGameState): boolean {
  return state.phase === 'won' && state.mistakes === 0 && state.impulsiveTaps === 0;
}
