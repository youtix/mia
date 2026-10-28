import type { Direction, GridCoord, NavigationTarget, Point2D } from './types';

export interface GridSize {
  rows: number;
  cols: number;
  /** Nombre réel d'éléments (dernière ligne incomplète), borné à `rows * cols` */
  totalItems?: number;
}

export interface MoveInGridOptions extends GridSize {
  /** Boucle d'un bord à l'autre de la ligne ou de la colonne (défaut : arrêt aux bords) */
  wrap?: boolean;
}

/**
 * Poids du décalage perpendiculaire dans la distance de `findNearestTarget` : à distance égale,
 * la cible alignée sur l'axe de la flèche l'emporte sur la cible en diagonale.
 */
const PERPENDICULAR_WEIGHT = 2;

export function indexToCoord(index: number, cols: number): GridCoord {
  const width = Math.max(1, cols);
  return { row: Math.floor(index / width), col: index % width };
}

export function coordToIndex(coord: GridCoord, cols: number): number {
  return coord.row * Math.max(1, cols) + coord.col;
}

/** Nombre d'éléments présents dans la grille : `totalItems` borné à `rows * cols`. */
export function getGridItemCount({ rows, cols, totalItems }: GridSize): number {
  const capacity = Math.max(0, rows) * Math.max(0, cols);
  return Math.max(0, Math.min(totalItems ?? capacity, capacity));
}

/**
 * Déplace le curseur d'une case. Sans `wrap`, il s'arrête aux bords (la position renvoyée est
 * alors identique). Descendre vers une case vide de la dernière ligne incomplète rabat le curseur
 * sur le dernier élément ; avec `wrap`, une colonne boucle sur sa dernière case existante.
 */
export function moveInGrid(
  current: GridCoord,
  direction: Direction,
  options: MoveInGridOptions,
): GridCoord {
  const { cols, wrap = false } = options;
  const count = getGridItemCount(options);
  if (count === 0) return current;

  const index = Math.min(Math.max(coordToIndex(current, cols), 0), count - 1);
  const { row, col } = indexToCoord(index, cols);
  const lastRow = Math.floor((count - 1) / cols);
  const lastRowLength = count - lastRow * cols;
  const rowLength = row === lastRow ? lastRowLength : cols;

  switch (direction) {
    case 'left':
      if (col > 0) return { row, col: col - 1 };
      return { row, col: wrap ? rowLength - 1 : col };
    case 'right':
      if (col < rowLength - 1) return { row, col: col + 1 };
      return { row, col: wrap ? 0 : col };
    case 'up':
      if (row > 0) return { row: row - 1, col };
      if (!wrap) return { row, col };
      return { row: col < lastRowLength ? lastRow : lastRow - 1, col };
    case 'down':
      if (row < lastRow) {
        const isEmptyCell = row + 1 === lastRow && col >= lastRowLength;
        return isEmptyCell ? indexToCoord(count - 1, cols) : { row: row + 1, col };
      }
      return { row: wrap ? 0 : row, col };
  }
}

/** Distance le long de la flèche (`primary`, positive devant) et décalage perpendiculaire. */
function projectOnDirection(
  dx: number,
  dy: number,
  direction: Direction,
): { primary: number; secondary: number } {
  switch (direction) {
    case 'up':
      return { primary: -dy, secondary: dx };
    case 'down':
      return { primary: dy, secondary: dx };
    case 'left':
      return { primary: -dx, secondary: dy };
    case 'right':
      return { primary: dx, secondary: dy };
  }
}

interface ScoredTarget {
  id: string;
  score: number;
}

/**
 * Cible la plus proche dans la direction demandée (distance euclidienne, décalage perpendiculaire
 * pondéré). Cherche d'abord dans le cône de ±45° autour de la flèche, puis dans tout le
 * demi-plan situé devant : `null` signifie qu'aucune cible ne se trouve plus loin dans cette
 * direction (ex: quitter le plateau vers les boutons du HUD). À égalité, l'ordre du tableau décide.
 */
export function findNearestTarget(
  from: Point2D,
  candidates: readonly NavigationTarget[],
  direction: Direction,
): string | null {
  let bestInCone: ScoredTarget | null = null;
  let bestAhead: ScoredTarget | null = null;

  for (const candidate of candidates) {
    const { primary, secondary } = projectOnDirection(
      candidate.x - from.x,
      candidate.y - from.y,
      direction,
    );
    if (primary <= 0) continue;

    const score = primary ** 2 + (PERPENDICULAR_WEIGHT * secondary) ** 2;
    if (Math.abs(secondary) <= primary) {
      if (!bestInCone || score < bestInCone.score) bestInCone = { id: candidate.id, score };
    } else if (!bestAhead || score < bestAhead.score) {
      bestAhead = { id: candidate.id, score };
    }
  }

  return (bestInCone ?? bestAhead)?.id ?? null;
}
