// Module pur de Memory : réutilisé tel quel plutôt que dupliqué (générateur injectable).
import type { Rng } from '@/games/memory/random';
import { getCluePieces, isClueSatisfied } from './clues';
import { generatePuzzle } from './generator';
import { CELL_COUNT, isCell } from './grid';
import { getReasoningRank } from './solver';
import type {
  Board,
  Clue,
  ClueKind,
  LogicGridFocus,
  LogicGridGameState,
  LogicGridLevelConfig,
  LogicGridPuzzle,
  PieceId,
  Reasoning,
  SolveStep,
} from './types';

/**
 * Moteur de Chacun sa Place (FEAT-27) : fonctions pures, sans React ni DOM. Chaque action renvoie un
 * nouvel état sans modifier celui reçu ; une action ignorée renvoie l'état reçu lui-même (React n'a
 * rien à redessiner). Le hasard passe par `rng` (`Math.random` par défaut) : aucune minuterie ici.
 */

/** Pièces à placer, au moins : en deçà, il n'y aurait rien à déduire. */
export const MIN_FREE_PIECES = 3;

/**
 * Pièces à placer, au plus : une pièce reste posée d'avance. Un puzzle aux neuf pièces libres tient
 * rarement en six cartes, et le tirer prendrait plusieurs secondes à un téléviseur modeste.
 */
export const MAX_FREE_PIECES = 8;

/** Vérification ratée à partir de laquelle l'aide met une pièce à sa place (échelon 3). */
export const HELP_LOCK_CHECK = 3;

const CLUE_KINDS: readonly string[] = ['cell', 'line', 'pair', 'next'];
const REASONINGS: readonly string[] = ['direct', 'combine', 'exclude'];
const FOCUSES: readonly string[] = ['next', 'line', 'pair', 'not', 'group', 'combine', 'exclude'];

/** Sorte de carte qu'une exigence suppose permise. */
const FOCUS_KINDS: Readonly<Partial<Record<LogicGridFocus, ClueKind>>> = {
  next: 'next',
  line: 'line',
  pair: 'pair',
};

/** Raisonnement qu'une exigence suppose permis. */
const FOCUS_REASONINGS: Readonly<Partial<Record<LogicGridFocus, Reasoning>>> = {
  combine: 'combine',
  exclude: 'exclude',
};

/**
 * Puzzles d'une étoile, selon les pièces à placer : 3 puzzles à 3 pièces, 2 à 4, puis 1. Sur un petit
 * plateau, un essai au hasard réussit la première vérification une fois sur 6 (3 pièces) : la
 * couronne exige alors trois puzzles réussis du premier coup, une chance sur 216.
 */
export function getSeriesLength(freePieces: number): number {
  if (freePieces <= MIN_FREE_PIECES) return 3;
  return freePieces === MIN_FREE_PIECES + 1 ? 2 : 1;
}

/** Anomalies des exigences, une par exigence incohérente avec le reste de la configuration. */
function getFocusErrors(config: LogicGridLevelConfig): string[] {
  const errors: string[] = [];
  const focuses: readonly string[] = config.focus;
  const kinds: readonly string[] = config.clueKinds;
  const reasoning: string = config.reasoning;
  for (const focus of focuses) {
    if (!FOCUSES.includes(focus)) {
      errors.push(`focus « ${focus} » inconnu`);
      continue;
    }
    const known = focus as LogicGridFocus;
    const kind = FOCUS_KINDS[known];
    if (kind && !kinds.includes(kind)) {
      errors.push(`focus « ${focus} » sans la sorte de carte « ${kind} » dans clueKinds`);
    }
    if (known === 'not' && !config.allowsNegation) {
      errors.push('focus « not » sans allowsNegation');
    }
    if (known === 'group' && !config.allowsGroups) {
      errors.push('focus « group » sans allowsGroups');
    }
    const needed = FOCUS_REASONINGS[known];
    if (
      needed &&
      REASONINGS.includes(reasoning) &&
      getReasoningRank(config.reasoning) < getReasoningRank(needed)
    ) {
      errors.push(`focus « ${focus} » au-delà du raisonnement « ${reasoning} »`);
    }
  }
  if (new Set(focuses).size !== focuses.length) errors.push('focus en double');
  return errors;
}

/**
 * Anomalies d'une configuration de niveau, un message français par anomalie (liste vide : valide).
 * Reprise par `validateLogicGridCatalog`.
 */
export function getLogicGridConfigErrors(config: LogicGridLevelConfig): string[] {
  const { freePieces, allowsGroups } = config;
  const kinds: readonly string[] = config.clueKinds;
  const reasoning: string = config.reasoning;
  const errors: string[] = [];

  if (
    !Number.isInteger(freePieces) ||
    freePieces < MIN_FREE_PIECES ||
    freePieces > MAX_FREE_PIECES
  ) {
    errors.push(
      `freePieces ${String(freePieces)} invalide (entier de ${String(MIN_FREE_PIECES)} à ${String(MAX_FREE_PIECES)} attendu)`,
    );
  }
  if (kinds.length === 0) errors.push('clueKinds vide (au moins une sorte de carte attendue)');
  for (const kind of kinds) {
    if (!CLUE_KINDS.includes(kind)) errors.push(`clueKinds : sorte « ${kind} » inconnue`);
  }
  if (new Set(kinds).size !== kinds.length) errors.push('clueKinds : sorte en double');
  if (allowsGroups && !kinds.includes('line')) {
    errors.push('allowsGroups sans la sorte « line » (une famille se place dans une ligne)');
  }
  if (!REASONINGS.includes(reasoning)) errors.push(`reasoning « ${reasoning} » inconnu`);
  errors.push(...getFocusErrors(config));
  return errors;
}

/** Plateau d'un puzzle au départ : seules les pièces verrouillées sont posées. */
function getStartBoard(puzzle: LogicGridPuzzle): Board {
  return Array.from({ length: CELL_COUNT }, (_, cell) =>
    puzzle.lockedCells.includes(cell) ? (puzzle.solution[cell] ?? null) : null,
  );
}

/** État au début du puzzle `puzzleIndex` ; les compteurs de l'étoile sont repris de `previous`. */
function startPuzzle(
  config: LogicGridLevelConfig,
  puzzles: readonly LogicGridPuzzle[],
  puzzle: LogicGridPuzzle,
  puzzleIndex: number,
  previous: LogicGridGameState | null,
): LogicGridGameState {
  return {
    config,
    puzzles,
    puzzle,
    puzzleIndex,
    board: getStartBoard(puzzle),
    lockedCells: puzzle.lockedCells,
    phase: 'placing',
    failedChecks: 0,
    totalFailedChecks: previous?.totalFailedChecks ?? 0,
    unmetClueIndex: null,
    checkTick: previous?.checkTick ?? 0,
    helpedPiece: null,
    moves: previous?.moves ?? 0,
  };
}

/**
 * Nouvelle partie : les puzzles de l'étoile (`getSeriesLength`) sont tirés d'un coup et le premier
 * commence. Lève une `Error` listant les anomalies d'une configuration invalide
 * (`getLogicGridConfigErrors`), ou si aucun puzzle n'a pu être tiré.
 */
export function createLogicGridGame(
  config: LogicGridLevelConfig,
  rng: Rng = Math.random,
): LogicGridGameState {
  const errors = getLogicGridConfigErrors(config);
  if (errors.length > 0) {
    throw new Error(`Configuration Chacun sa Place invalide : ${errors.join(' ; ')}`);
  }
  const [first, ...others] = Array.from({ length: getSeriesLength(config.freePieces) }, () =>
    generatePuzzle(config, rng),
  );
  if (!first) throw new Error('Chacun sa Place : étoile sans puzzle');
  return startPuzzle(config, [first, ...others], first, 0, null);
}

/** Pièces de la réserve : celles à placer qui ne sont pas sur le plateau, dans l'ordre du puzzle. */
export function getReservePieces(state: LogicGridGameState): PieceId[] {
  return state.puzzle.freePieces.filter((piece) => !state.board.includes(piece));
}

/** Toutes les pièces sont posées : la cloche peut sonner. */
export function isBoardFull(state: LogicGridGameState): boolean {
  return state.board.every((piece) => piece !== null);
}

/** La case est figée (pièce posée d'avance, ou mise en place par l'aide) ? */
export function isCellLocked(state: LogicGridGameState, cell: number): boolean {
  return state.lockedCells.includes(cell);
}

/** La pièce est-elle à l'enfant : une pièce à placer, ni verrouillée ni mise en place par l'aide ? */
export function isPieceMovable(state: LogicGridGameState, piece: PieceId): boolean {
  if (!state.puzzle.freePieces.includes(piece)) return false;
  const cell = state.board.indexOf(piece);
  return cell < 0 || !isCellLocked(state, cell);
}

/**
 * Pose `piece` (de la réserve ou d'une autre case) sur `cell`. Une pièce déjà là change de place
 * avec elle : elle retourne à la réserve si `piece` en venait, sinon elle prend la case quittée.
 * Ignorée hors `placing`, sur une case figée, pour une pièce verrouillée ou déjà sur `cell`.
 */
export function movePiece(
  state: LogicGridGameState,
  piece: PieceId,
  cell: number,
): LogicGridGameState {
  if (state.phase !== 'placing' || !isCell(cell) || isCellLocked(state, cell)) return state;
  if (!isPieceMovable(state, piece)) return state;
  const from = state.board.indexOf(piece);
  if (from === cell) return state;
  const board = [...state.board];
  const occupant = board[cell] ?? null;
  board[cell] = piece;
  if (from >= 0) board[from] = occupant;
  return { ...state, board, moves: state.moves + 1, helpedPiece: null };
}

/** Rend une pièce posée à la réserve. Ignorée hors `placing` et pour une pièce verrouillée. */
export function returnPiece(state: LogicGridGameState, piece: PieceId): LogicGridGameState {
  const from = state.board.indexOf(piece);
  if (state.phase !== 'placing' || from < 0 || !isPieceMovable(state, piece)) return state;
  const board = [...state.board];
  board[from] = null;
  return { ...state, board, moves: state.moves + 1, helpedPiece: null };
}

/** Rang de la pièce dans le raisonnement d'un enfant : l'aide commence par les premières trouvées. */
function getStepRank(puzzle: LogicGridPuzzle, piece: PieceId): number {
  const rank = puzzle.steps.findIndex((step) => step.piece === piece);
  return rank < 0 ? puzzle.steps.length : rank;
}

/**
 * Échelon 3 : une pièce mal placée de la carte non respectée rejoint sa case et s'y fige (une carte
 * contredite a toujours une pièce mal placée). La pièce qui l'occupait prend la case quittée.
 */
function lockHelpedPiece(state: LogicGridGameState, clue: Clue): LogicGridGameState {
  const { puzzle, board } = state;
  const isMisplaced = (piece: PieceId) =>
    isPieceMovable(state, piece) && board[puzzle.solution.indexOf(piece)] !== piece;
  const byStep = (a: PieceId, b: PieceId) => getStepRank(puzzle, a) - getStepRank(puzzle, b);
  const [helped] = [
    ...getCluePieces(clue).filter(isMisplaced).sort(byStep),
    ...puzzle.freePieces.filter(isMisplaced).sort(byStep),
  ];
  if (!helped) return state;
  const target = puzzle.solution.indexOf(helped);
  const from = board.indexOf(helped);
  const next = [...board];
  next[from] = next[target] ?? null;
  next[target] = helped;
  return {
    ...state,
    board: next,
    lockedCells: [...state.lockedCells, target],
    helpedPiece: helped,
  };
}

/**
 * Vérification (la cloche), une fois toutes les pièces posées : réussite si chaque carte est
 * respectée. Sinon la première carte non respectée, dans l'ordre d'affichage, est désignée ; à partir
 * de la `HELP_LOCK_CHECK`-ième vérification ratée du puzzle, une pièce rejoint aussi sa case. Ignorée
 * hors `placing` et tant qu'une pièce attend dans la réserve.
 */
export function checkBoard(state: LogicGridGameState): LogicGridGameState {
  if (state.phase !== 'placing' || !isBoardFull(state)) return state;
  const unmetClueIndex = state.puzzle.clues.findIndex(
    (clue) => !isClueSatisfied(clue, state.board),
  );
  const unmet = state.puzzle.clues[unmetClueIndex];
  if (!unmet) {
    return { ...state, phase: 'success', unmetClueIndex: null, helpedPiece: null };
  }
  const failed: LogicGridGameState = {
    ...state,
    failedChecks: state.failedChecks + 1,
    totalFailedChecks: state.totalFailedChecks + 1,
    unmetClueIndex,
    checkTick: state.checkTick + 1,
    helpedPiece: null,
  };
  return failed.failedChecks >= HELP_LOCK_CHECK ? lockHelpedPiece(failed, unmet) : failed;
}

/** Fin de la célébration : puzzle suivant, ou étoile gagnée après le dernier. Ignorée hors `success`. */
export function advancePuzzle(state: LogicGridGameState): LogicGridGameState {
  if (state.phase !== 'success') return state;
  const puzzleIndex = state.puzzleIndex + 1;
  const puzzle = state.puzzles[puzzleIndex];
  if (!puzzle) return { ...state, phase: 'won' };
  return startPuzzle(state.config, state.puzzles, puzzle, puzzleIndex, state);
}

/**
 * Échelle d'aide du puzzle en cours : 0 (aucune vérification ratée), 1 (la carte non respectée luit),
 * 2 (ses pièces remuent aussi), 3 (une pièce a rejoint sa case).
 */
export function getHelpStage(state: LogicGridGameState): 0 | 1 | 2 | 3 {
  if (state.failedChecks >= HELP_LOCK_CHECK) return 3;
  if (state.failedChecks === 2) return 2;
  return state.failedChecks === 1 ? 1 : 0;
}

/** Victoire « Parfait » (couronne) : chaque puzzle de l'étoile réussi à la première vérification. */
export function isPerfectWin(state: LogicGridGameState): boolean {
  return state.phase === 'won' && state.totalFailedChecks === 0;
}

/**
 * Pas que montre la main fantôme : le premier du raisonnement, au premier puzzle d'une étoile guidée,
 * tant que l'enfant n'a encore rien posé. `null` sinon.
 */
export function getGuideStep(state: LogicGridGameState): SolveStep | null {
  if (!state.config.hasGuide || state.puzzleIndex > 0 || state.moves > 0) return null;
  if (state.phase !== 'placing') return null;
  return state.puzzle.steps[0] ?? null;
}

/** Pièces posées par l'enfant que la carte nomme : celles qui remuent à l'échelon 2. */
export function getMovableCluePieces(state: LogicGridGameState, clue: Clue): PieceId[] {
  return getCluePieces(clue).filter(
    (piece) => state.board.includes(piece) && isPieceMovable(state, piece),
  );
}
