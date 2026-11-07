import type { ClueZone, PieceColor, PieceId, PieceShape } from './types';

/**
 * Pièces et géométrie de la grille 3 × 3 de Chacun sa Place (FEAT-27). Une case est un indice de 0
 * (en haut à gauche) à 8 (en bas à droite), ligne par ligne. Les ensembles de cases sont des masques
 * de 9 bits (bit `n` : case `n`) : le solveur les croise sans allouer.
 */

/** Côté de la grille. */
export const GRID_SIZE = 3;

/** Cases de la grille. */
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

/** Formes, dans l'ordre de la réserve et des familles. */
export const PIECE_SHAPES: readonly PieceShape[] = ['circle', 'square', 'triangle'];

/** Couleurs, dans l'ordre de la réserve et des familles. */
export const PIECE_COLORS: readonly PieceColor[] = ['red', 'yellow', 'blue'];

interface PieceTraits {
  shape: PieceShape;
  color: PieceColor;
}

/** Les neuf pièces : chaque couleur dans chaque forme. */
export const PIECE_IDS: readonly PieceId[] = PIECE_COLORS.flatMap((color) =>
  PIECE_SHAPES.map((shape): PieceId => `${color}-${shape}`),
);

const PIECE_TRAITS = new Map<string, PieceTraits>(
  PIECE_COLORS.flatMap((color) =>
    PIECE_SHAPES.map((shape): [string, PieceTraits] => [`${color}-${shape}`, { shape, color }]),
  ),
);

/** Pièce connue de Chacun sa Place ? */
export function isPieceId(value: string): value is PieceId {
  return PIECE_TRAITS.has(value);
}

function getTraits(piece: PieceId): PieceTraits {
  const traits = PIECE_TRAITS.get(piece);
  if (!traits) throw new Error(`Pièce inconnue : « ${piece} »`);
  return traits;
}

export function getPieceShape(piece: PieceId): PieceShape {
  return getTraits(piece).shape;
}

export function getPieceColor(piece: PieceId): PieceColor {
  return getTraits(piece).color;
}

/** Ligne de la case (0 en haut). */
export function rowOf(cell: number): number {
  return Math.floor(cell / GRID_SIZE);
}

/** Colonne de la case (0 à gauche). */
export function colOf(cell: number): number {
  return cell % GRID_SIZE;
}

/** Case valide de la grille ? */
export function isCell(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < CELL_COUNT;
}

/** Masque de toutes les cases. */
export const ALL_CELLS_MASK = (1 << CELL_COUNT) - 1;

export function cellBit(cell: number): number {
  return 1 << cell;
}

/** Masque d'une ligne entière. */
export function rowMask(row: number): number {
  return 0b111 << (row * GRID_SIZE);
}

/** Masque d'une colonne entière. */
export function colMask(col: number): number {
  return 0b001001001 << col;
}

/** Cases d'une zone de carte. */
export function zoneMask(zone: ClueZone): number {
  switch (zone.kind) {
    case 'cell':
      return cellBit(zone.cell);
    case 'rows':
      return zone.rows.reduce((mask, row) => mask | rowMask(row), 0);
    case 'cols':
      return zone.cols.reduce((mask, col) => mask | colMask(col), 0);
  }
}

/** Cases qui touchent `cell` par un côté (jamais par un coin). */
export function neighbourMask(cell: number): number {
  const row = rowOf(cell);
  const col = colOf(cell);
  let mask = 0;
  if (row > 0) mask |= cellBit(cell - GRID_SIZE);
  if (row < GRID_SIZE - 1) mask |= cellBit(cell + GRID_SIZE);
  if (col > 0) mask |= cellBit(cell - 1);
  if (col < GRID_SIZE - 1) mask |= cellBit(cell + 1);
  return mask;
}

/** Les deux cases se touchent-elles par un côté ? */
export function areNeighbours(first: number, second: number): boolean {
  return (neighbourMask(first) & cellBit(second)) !== 0;
}

/** Nombre de cases du masque. */
export function countCells(mask: number): number {
  let count = 0;
  for (let rest = mask; rest !== 0; rest &= rest - 1) count += 1;
  return count;
}

/** Cases du masque, dans l'ordre de lecture. */
export function listCells(mask: number): number[] {
  const cells: number[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    if ((mask & cellBit(cell)) !== 0) cells.push(cell);
  }
  return cells;
}

/** Première case du masque dans l'ordre de lecture, `null` s'il est vide. */
export function firstCell(mask: number): number | null {
  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    if ((mask & cellBit(cell)) !== 0) return cell;
  }
  return null;
}

/**
 * Case collée à `cell` dans la direction d'une carte « collées » : à droite ou en dessous
 * (`isAfter`), sinon à gauche ou au-dessus ; `null` hors de la grille.
 */
export function getPairCell(
  cell: number,
  direction: 'right' | 'down',
  isAfter: boolean,
): number | null {
  if (direction === 'right') {
    if (isAfter) return colOf(cell) < GRID_SIZE - 1 ? cell + 1 : null;
    return colOf(cell) > 0 ? cell - 1 : null;
  }
  if (isAfter) return rowOf(cell) < GRID_SIZE - 1 ? cell + GRID_SIZE : null;
  return rowOf(cell) > 0 ? cell - GRID_SIZE : null;
}
