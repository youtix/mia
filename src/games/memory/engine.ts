import { shuffle, type Rng } from './random';
import { buildCardGroups, getMemoryModeCapacity, isMemoryVisualMode } from './symbols';
import type { MemoryCard, MemoryGameState, MemoryLevelConfig } from './types';

/**
 * Moteur de Memory (FEAT-09) : fonctions pures, sans React ni DOM. Chaque action renvoie un nouvel
 * état sans modifier celui reçu ; une action ignorée renvoie l'état reçu lui-même (React n'a rien
 * à redessiner). Le hasard passe par `rng` (`Math.random` par défaut).
 */

const MATCH_SIZES: readonly number[] = [2, 3];

function isWholeNumber(value: number, min: number): boolean {
  return Number.isInteger(value) && value >= min;
}

/** Anomalies de la grille et du mode visuel, sans message en cascade d'une valeur invalide. */
function getGridErrors(config: MemoryLevelConfig): string[] {
  const { cols, rows } = config;
  const matchSize: number = config.matchSize;
  const mode: string = config.visualMode;
  const errors: string[] = [];

  const isGridValid = isWholeNumber(cols, 1) && isWholeNumber(rows, 1);
  if (!isWholeNumber(cols, 1)) errors.push(`cols ${String(cols)} invalide (entier ≥ 1 attendu)`);
  if (!isWholeNumber(rows, 1)) errors.push(`rows ${String(rows)} invalide (entier ≥ 1 attendu)`);
  const isMatchSizeValid = MATCH_SIZES.includes(matchSize);
  if (!isMatchSizeValid) {
    errors.push(`matchSize ${String(matchSize)} invalide (2 ou 3 attendu)`);
  }
  const isModeValid = isMemoryVisualMode(mode);
  if (!isModeValid) errors.push(`visualMode « ${mode} » inconnu`);
  if (!isGridValid || !isMatchSizeValid) return errors;

  const grid = `${String(cols)} × ${String(rows)}`;
  const cardCount = cols * rows;
  const isDivisible = cardCount % matchSize === 0;
  if (!isDivisible) {
    errors.push(`grille ${grid} non divisible en groupes de ${String(matchSize)} cartes`);
  }
  if (cardCount < 2 * matchSize) {
    errors.push(`grille ${grid} trop petite (au moins 2 groupes de ${String(matchSize)} cartes)`);
  } else if (isDivisible && isModeValid) {
    const groups = cardCount / matchSize;
    const capacity = getMemoryModeCapacity(mode);
    if (groups > capacity) {
      errors.push(
        `grille ${grid} : ${String(groups)} groupes, le mode « ${mode} » en accepte ${String(capacity)} au plus`,
      );
    }
  }
  return errors;
}

/** Anomalies des règles de la partie (aperçu, erreurs, permutation, couronne) et de leur cohérence. */
function getRuleErrors(config: MemoryLevelConfig): string[] {
  const { previewSeconds, maxMistakes, swapEveryNMistakes, perfectMaxMistakes } = config;
  const errors: string[] = [];

  if (!(Number.isFinite(previewSeconds) && previewSeconds >= 0)) {
    errors.push(`previewSeconds ${String(previewSeconds)} invalide (nombre fini ≥ 0 attendu)`);
  }
  const isMaxValid = maxMistakes === null || isWholeNumber(maxMistakes, 0);
  if (!isMaxValid) {
    errors.push(`maxMistakes ${String(maxMistakes)} invalide (null ou entier ≥ 0 attendu)`);
  }
  const isSwapValid = swapEveryNMistakes === null || isWholeNumber(swapEveryNMistakes, 1);
  if (!isSwapValid) {
    errors.push(
      `swapEveryNMistakes ${String(swapEveryNMistakes)} invalide (null ou entier ≥ 1 attendu)`,
    );
  }
  const isPerfectValid = isWholeNumber(perfectMaxMistakes, 0);
  if (!isPerfectValid) {
    errors.push(`perfectMaxMistakes ${String(perfectMaxMistakes)} invalide (entier ≥ 0 attendu)`);
  }

  if (maxMistakes === null || !isMaxValid) return errors;
  const max = String(maxMistakes);
  if (isPerfectValid && perfectMaxMistakes > maxMistakes) {
    errors.push(
      `perfectMaxMistakes ${String(perfectMaxMistakes)} supérieur à maxMistakes ${max} : chaque victoire serait couronnée`,
    );
  }
  if (swapEveryNMistakes !== null && isSwapValid && swapEveryNMistakes > maxMistakes) {
    errors.push(
      `swapEveryNMistakes ${String(swapEveryNMistakes)} supérieur à maxMistakes ${max} : aucune permutation avant la défaite`,
    );
  }
  return errors;
}

/**
 * Anomalies d'une configuration de niveau, un message français par anomalie (liste vide : valide).
 * Grille découpée en au moins 2 groupes de `matchSize` cartes, dans la capacité du mode visuel ;
 * règles entières et positives ; couronne jamais plus permissive que la défaite et permutation
 * toujours possible avant elle. Reprise par `validateMemoryCatalog` (FEAT-11).
 */
export function getMemoryConfigErrors(config: MemoryLevelConfig): string[] {
  return [...getGridErrors(config), ...getRuleErrors(config)];
}

/**
 * Nouvelle partie : `(cols × rows) / matchSize` groupes de `matchSize` cartes identiques, mélangées
 * par Fisher-Yates. Avec un aperçu (`previewSeconds > 0`), la partie s'ouvre en phase `preview`,
 * cartes visibles (et donc vues) ; sinon en phase `playing`, cartes cachées. Lève une `Error`
 * listant les anomalies d'une configuration invalide (`getMemoryConfigErrors`).
 */
export function createMemoryGame(
  config: MemoryLevelConfig,
  rng: Rng = Math.random,
): MemoryGameState {
  const errors = getMemoryConfigErrors(config);
  if (errors.length > 0) throw new Error(`Configuration Memory invalide : ${errors.join(' ; ')}`);

  const totalGroups = (config.cols * config.rows) / config.matchSize;
  const isPreview = config.previewSeconds > 0;
  const cards = buildCardGroups(config, totalGroups, rng).flatMap((group) =>
    Array.from({ length: config.matchSize }, (_, copy): MemoryCard => ({
      uid: `${group.groupId}#${String(copy + 1)}`,
      ...group,
      state: isPreview ? 'flipped' : 'hidden',
      seen: isPreview,
    })),
  );

  return {
    config,
    phase: isPreview ? 'preview' : 'playing',
    cards: shuffle(cards, rng),
    flippedIndices: [],
    moves: 0,
    mistakes: 0,
    matchedGroups: 0,
    totalGroups,
    lastSwappedPair: null,
  };
}

/** Fin de l'aperçu : toutes les cartes se cachent et la partie commence. Ignorée hors `preview`. */
export function endPreviewPhase(state: MemoryGameState): MemoryGameState {
  if (state.phase !== 'preview') return state;
  return {
    ...state,
    phase: 'playing',
    cards: state.cards.map((card): MemoryCard => ({ ...card, state: 'hidden' })),
  };
}

/**
 * Retourne la carte `index` (désormais vue). Au `matchSize`-ième retournement, le coup est compté
 * et la partie passe en `evaluating` : même avec des triplets dont les deux premières cartes
 * diffèrent, le joueur retourne toujours la troisième. Ignorée hors `playing`, sur une carte qui
 * n'est pas cachée ou hors du plateau, et quand le coup est déjà complet.
 */
export function selectCard(state: MemoryGameState, index: number): MemoryGameState {
  const card = state.cards[index];
  if (
    state.phase !== 'playing' ||
    card?.state !== 'hidden' ||
    state.flippedIndices.length >= state.config.matchSize
  ) {
    return state;
  }

  const flippedIndices = [...state.flippedIndices, index];
  const isMoveComplete = flippedIndices.length === state.config.matchSize;
  return {
    ...state,
    phase: isMoveComplete ? 'evaluating' : 'playing',
    cards: state.cards.map((current, position): MemoryCard =>
      position === index ? { ...card, state: 'flipped', seen: true } : current,
    ),
    flippedIndices,
    moves: isMoveComplete ? state.moves + 1 : state.moves,
  };
}

/**
 * Le coup en cours forme un groupe (cartes retournées toutes du même `groupId`). FEAT-10 en déduit
 * le délai d'affichage avant `resolveEvaluation` (350 ms pour un groupe, 900 ms pour une erreur).
 * Toujours faux hors `evaluating`.
 */
export function isEvaluationMatch(state: MemoryGameState): boolean {
  if (state.phase !== 'evaluating') return false;
  const groupIds = new Set(state.flippedIndices.map((index) => state.cards[index]?.groupId));
  return groupIds.size === 1 && !groupIds.has(undefined);
}

/**
 * Échange deux cartes cachées de groupes différents, déjà vues de préférence : après une erreur,
 * les cartes de cette erreur le sont toujours, donc la permutation touche des cartes que le joueur
 * a pu mémoriser. Sans paire possible (état incohérent), l'état est renvoyé tel quel.
 */
function swapHiddenCards(state: MemoryGameState, rng: Rng): MemoryGameState {
  const hidden = state.cards.flatMap((card, index) =>
    card.state === 'hidden' ? [{ card, index }] : [],
  );
  const seen = hidden.filter(({ card }) => card.seen);
  const unseen = hidden.filter(({ card }) => !card.seen);
  const candidates = [...shuffle(seen, rng), ...shuffle(unseen, rng)];
  const [first] = candidates;
  if (first === undefined) return state;
  const second = candidates.find(({ card }) => card.groupId !== first.card.groupId);
  if (second === undefined) return state;

  const cards = [...state.cards];
  cards[first.index] = second.card;
  cards[second.index] = first.card;
  return {
    ...state,
    cards,
    lastSwappedPair: [Math.min(first.index, second.index), Math.max(first.index, second.index)],
  };
}

/**
 * Résout le coup en cours (`evaluating`), ignorée dans les autres phases.
 * - Groupe trouvé : ses cartes passent à `matched` ; partie gagnée au dernier groupe.
 * - Erreur : les cartes se cachent et l'erreur est comptée. Au-delà de `maxMistakes` erreurs, la
 *   partie est perdue ; sinon, toutes les `swapEveryNMistakes` erreurs, deux cartes cachées de
 *   groupes différents s'échangent (`lastSwappedPair`).
 *
 * `lastSwappedPair` ne décrit que la permutation de cette résolution (`null` sinon).
 */
export function resolveEvaluation(state: MemoryGameState, rng: Rng = Math.random): MemoryGameState {
  if (state.phase !== 'evaluating') return state;
  const flipped = new Set(state.flippedIndices);

  if (isEvaluationMatch(state)) {
    const matchedGroups = state.matchedGroups + 1;
    return {
      ...state,
      phase: matchedGroups === state.totalGroups ? 'won' : 'playing',
      cards: state.cards.map((card, index): MemoryCard =>
        flipped.has(index) ? { ...card, state: 'matched' } : card,
      ),
      flippedIndices: [],
      matchedGroups,
      lastSwappedPair: null,
    };
  }

  const mistakes = state.mistakes + 1;
  const next: MemoryGameState = {
    ...state,
    phase: 'playing',
    cards: state.cards.map((card, index): MemoryCard =>
      flipped.has(index) ? { ...card, state: 'hidden' } : card,
    ),
    flippedIndices: [],
    mistakes,
    lastSwappedPair: null,
  };
  const { maxMistakes, swapEveryNMistakes } = state.config;
  if (maxMistakes !== null && mistakes > maxMistakes) return { ...next, phase: 'lost' };
  if (swapEveryNMistakes !== null && mistakes % swapEveryNMistakes === 0) {
    return swapHiddenCards(next, rng);
  }
  return next;
}

/** Victoire « Parfait » (couronne) : partie gagnée avec au plus `perfectMaxMistakes` erreurs. */
export function isPerfectWin(state: MemoryGameState): boolean {
  return state.phase === 'won' && state.mistakes <= state.config.perfectMaxMistakes;
}
