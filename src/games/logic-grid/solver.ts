import { isClueContradicted, locatePieces, subjectCovers } from './clues';
import {
  CELL_COUNT,
  cellBit,
  countCells,
  firstCell,
  getPairCell,
  listCells,
  neighbourMask,
  PIECE_IDS,
  zoneMask,
} from './grid';
import type { Board, Clue, PieceId, Reasoning, SolveStep } from './types';

/**
 * Solveurs de Chacun sa Place (FEAT-27).
 *
 * `solveLikeAChild` raisonne comme un enfant, avec trois règles de plus en plus exigeantes : une carte
 * seule ne laisse qu'une case à une pièce (`direct`, et la dernière pièce va dans la dernière case),
 * les cartes d'une même pièce, croisées, ne lui en laissent qu'une (`combine`), ou une case ne peut plus
 * recevoir qu'une seule pièce (`exclude`). Chaque règle est une vraie déduction : un puzzle qu'il
 * résout n'a qu'une solution. Les règles ne font que gagner des pièces à mesure que le plateau se
 * remplit : le résultat ne dépend pas de l'ordre des pas.
 *
 * `countSolutions` compte les solutions par recherche exhaustive (au plus 9! = 362 880 plateaux) :
 * il contrôle le précédent dans les tests et le validateur.
 */

const REASONING_RANKS: Readonly<Record<Reasoning, number>> = { direct: 1, combine: 2, exclude: 3 };

/** Rang d'un raisonnement : `direct` 1, `combine` 2, `exclude` 3. */
export function getReasoningRank(reasoning: Reasoning): number {
  return REASONING_RANKS[reasoning];
}

/** Ce que le solveur sait : pièces posées (verrouillées ou déduites), cases encore vides. */
interface Knowledge {
  board: (PieceId | null)[];
  cells: Map<PieceId, number>;
  freeMask: number;
  /** Pièces encore à placer, dans l'ordre des pièces */
  unknown: PieceId[];
}

function createKnowledge(start: Board): Knowledge {
  const board = Array.from({ length: CELL_COUNT }, (_, cell) => start[cell] ?? null);
  const cells = locatePieces(board);
  const freeMask = board.reduce(
    (mask, piece, cell) => (piece === null ? mask | cellBit(cell) : mask),
    0,
  );
  return { board, cells, freeMask, unknown: PIECE_IDS.filter((piece) => !cells.has(piece)) };
}

function place(knowledge: Knowledge, piece: PieceId, cell: number): void {
  knowledge.board[cell] = piece;
  knowledge.cells.set(piece, cell);
  knowledge.freeMask &= ~cellBit(cell);
  knowledge.unknown = knowledge.unknown.filter((other) => other !== piece);
}

/** Carte de place prête à croiser : ses pièces et ses cases, calculées une fois. */
interface PlaceTerms {
  pieces: ReadonlySet<PieceId>;
  zone: number;
}

/**
 * Pièces et cases de chaque carte de place, calculées à la première lecture : le générateur relit les
 * mêmes cartes des milliers de fois.
 */
const PLACE_TERMS = new WeakMap<Clue, PlaceTerms>();

function getPlaceTerms(clue: Clue & { kind: 'place' }): PlaceTerms {
  let terms = PLACE_TERMS.get(clue);
  if (!terms) {
    terms = {
      pieces: new Set(PIECE_IDS.filter((piece) => subjectCovers(clue.subject, piece))),
      zone: zoneMask(clue.zone),
    };
    PLACE_TERMS.set(clue, terms);
  }
  return terms;
}

/**
 * Cases vides que la carte laisse à `piece`, vu les pièces posées. `null` : la carte ne dit encore
 * rien de cette pièce (elle ne la nomme pas, ou sa partenaire n'est pas encore placée : un enfant
 * part d'une pièce qu'il voit).
 */
export function getClueMask(
  clue: Clue,
  piece: PieceId,
  cells: ReadonlyMap<PieceId, number>,
  freeMask: number,
): number | null {
  if (clue.kind === 'place') {
    const { pieces, zone } = getPlaceTerms(clue);
    if (!pieces.has(piece)) return null;
    return clue.isNegated ? freeMask & ~zone : freeMask & zone;
  }
  const isFirst = clue.first === piece;
  if (!isFirst && clue.second !== piece) return null;
  const partnerCell = cells.get(isFirst ? clue.second : clue.first);
  if (partnerCell === undefined) return null;
  if (clue.kind === 'pair') {
    const cell = getPairCell(partnerCell, clue.direction, !isFirst);
    return cell === null ? 0 : freeMask & cellBit(cell);
  }
  const around = neighbourMask(partnerCell);
  return clue.isNegated ? freeMask & ~around : freeMask & around;
}

interface Candidates {
  piece: PieceId;
  /** Cases encore possibles pour la pièce, toutes ses cartes croisées */
  mask: number;
  /** Cartes qui ont retiré au moins une case */
  clueIndices: number[];
}

function getCandidates(knowledge: Knowledge, piece: PieceId, clues: readonly Clue[]): Candidates {
  let mask = knowledge.freeMask;
  const clueIndices: number[] = [];
  clues.forEach((clue, index) => {
    const allowed = getClueMask(clue, piece, knowledge.cells, knowledge.freeMask);
    if (allowed === null || (mask & allowed) === mask) return;
    mask &= allowed;
    clueIndices.push(index);
  });
  return { piece, mask, clueIndices };
}

/** Une carte seule ne laisse qu'une case à une pièce ; ou il ne reste qu'une pièce et qu'une case. */
function findDirectStep(knowledge: Knowledge, clues: readonly Clue[]): SolveStep | null {
  const [lastPiece, ...others] = knowledge.unknown;
  const lastCell = firstCell(knowledge.freeMask);
  if (lastPiece !== undefined && others.length === 0 && lastCell !== null) {
    return { piece: lastPiece, cell: lastCell, move: 'last-hole', clueIndices: [] };
  }
  for (const piece of knowledge.unknown) {
    for (const [index, clue] of clues.entries()) {
      const allowed = getClueMask(clue, piece, knowledge.cells, knowledge.freeMask);
      const cell = allowed === null ? null : firstCell(allowed);
      if (allowed !== null && cell !== null && countCells(allowed) === 1) {
        return { piece, cell, move: 'direct', clueIndices: [index] };
      }
    }
  }
  return null;
}

/** Les cartes d'une pièce, croisées, ne lui laissent qu'une case. */
function findCombineStep(knowledge: Knowledge, clues: readonly Clue[]): SolveStep | null {
  for (const piece of knowledge.unknown) {
    const { mask, clueIndices } = getCandidates(knowledge, piece, clues);
    const cell = firstCell(mask);
    if (cell !== null && countCells(mask) === 1) {
      return { piece, cell, move: 'combine', clueIndices };
    }
  }
  return null;
}

/** Une case vide ne peut plus recevoir qu'une seule des pièces à placer. */
function findExcludeStep(knowledge: Knowledge, clues: readonly Clue[]): SolveStep | null {
  const all = knowledge.unknown.map((piece) => getCandidates(knowledge, piece, clues));
  for (const cell of listCells(knowledge.freeMask)) {
    const bit = cellBit(cell);
    const holders = all.filter(({ mask }) => (mask & bit) !== 0);
    const [holder] = holders;
    if (holder === undefined || holders.length !== 1) continue;
    // Cartes qui ferment cette case aux autres pièces : celles que l'enfant a dû croiser.
    const clueIndices = new Set<number>();
    for (const other of all) {
      if (other === holder) continue;
      clues.forEach((clue, index) => {
        const allowed = getClueMask(clue, other.piece, knowledge.cells, knowledge.freeMask);
        if (allowed !== null && (allowed & bit) === 0) clueIndices.add(index);
      });
    }
    return {
      piece: holder.piece,
      cell,
      move: 'exclude',
      clueIndices: [...clueIndices].sort((a, b) => a - b),
    };
  }
  return null;
}

export interface ChildSolveResult {
  /** Toutes les pièces sont placées */
  isSolved: boolean;
  /** Plateau atteint : pièces de départ et pièces déduites */
  board: Board;
  /** Pas du raisonnement, dans l'ordre */
  steps: SolveStep[];
  /**
   * Cases encore possibles, pièces restantes confondues (toutes leurs cartes croisées) : 0 quand le
   * puzzle est résolu. Mesure ce que les cartes ont déjà appris.
   */
  openOptions: number;
}

/**
 * Résout le puzzle comme un enfant, avec les règles jusqu'à `reasoning` compris, en préférant
 * toujours la règle la plus simple. `start` porte les pièces déjà posées ; les autres sont à trouver.
 */
export function solveLikeAChild(
  start: Board,
  clues: readonly Clue[],
  reasoning: Reasoning,
): ChildSolveResult {
  const knowledge = createKnowledge(start);
  const rank = getReasoningRank(reasoning);
  const steps: SolveStep[] = [];

  for (;;) {
    let step = findDirectStep(knowledge, clues);
    if (!step && rank >= 2) step = findCombineStep(knowledge, clues);
    if (!step && rank >= 3) step = findExcludeStep(knowledge, clues);
    if (!step) break;
    place(knowledge, step.piece, step.cell);
    steps.push(step);
  }

  const openOptions = knowledge.unknown.reduce(
    (total, piece) => total + countCells(getCandidates(knowledge, piece, clues).mask),
    0,
  );
  return {
    isSolved: knowledge.unknown.length === 0,
    board: knowledge.board,
    steps,
    openOptions,
  };
}

/**
 * Nombre de plateaux complets qui respectent toutes les cartes, en partant des pièces de `start`,
 * arrêté à `limit` (2 suffit pour savoir si la solution est unique).
 */
export function countSolutions(start: Board, clues: readonly Clue[], limit = 2): number {
  const knowledge = createKnowledge(start);
  const { board, cells, unknown } = knowledge;
  let count = 0;

  const search = (index: number): void => {
    const piece = unknown[index];
    if (piece === undefined) {
      count += 1;
      return;
    }
    for (let cell = 0; cell < CELL_COUNT && count < limit; cell += 1) {
      if (board[cell] !== null) continue;
      board[cell] = piece;
      cells.set(piece, cell);
      if (!clues.some((clue) => isClueContradicted(clue, cells))) search(index + 1);
      board[cell] = null;
      cells.delete(piece);
    }
  };

  search(0);
  return count;
}
