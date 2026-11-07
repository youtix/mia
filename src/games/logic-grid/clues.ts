import {
  areNeighbours,
  CELL_COUNT,
  cellBit,
  getPairCell,
  getPieceColor,
  getPieceShape,
  PIECE_COLORS,
  PIECE_IDS,
  PIECE_SHAPES,
  zoneMask,
} from './grid';
import type { Board, Clue, ClueKind, ClueSubject, ClueZone, PieceId } from './types';

/**
 * Cartes d'indice de Chacun sa Place (FEAT-27) : pièces qu'elles nomment, vérification sur un
 * plateau, et liste de toutes les cartes vraies d'une solution, où le générateur puise.
 */

/** Pièces d'un sujet : la pièce elle-même, ou les trois pièces de sa famille. */
export function getSubjectPieces(subject: ClueSubject): PieceId[] {
  switch (subject.kind) {
    case 'piece':
      return [subject.piece];
    case 'shape':
      return PIECE_IDS.filter((piece) => getPieceShape(piece) === subject.shape);
    case 'color':
      return PIECE_IDS.filter((piece) => getPieceColor(piece) === subject.color);
  }
}

/** Le sujet vaut-il pour `piece` ? */
export function subjectCovers(subject: ClueSubject, piece: PieceId): boolean {
  switch (subject.kind) {
    case 'piece':
      return subject.piece === piece;
    case 'shape':
      return getPieceShape(piece) === subject.shape;
    case 'color':
      return getPieceColor(piece) === subject.color;
  }
}

/** Pièces que la carte nomme (une famille : ses trois pièces). */
export function getCluePieces(clue: Clue): PieceId[] {
  return clue.kind === 'place' ? getSubjectPieces(clue.subject) : [clue.first, clue.second];
}

/** Sorte de la carte : case, ligne ou colonne, pièces collées, pièces qui se touchent. */
export function getClueKind(clue: Clue): ClueKind {
  if (clue.kind === 'place') return clue.zone.kind === 'cell' ? 'cell' : 'line';
  return clue.kind;
}

/** Carte barrée ? */
export function isNegatedClue(clue: Clue): boolean {
  return clue.kind !== 'pair' && clue.isNegated;
}

/** Carte de famille (toutes les pièces d'une forme ou d'une couleur) ? */
export function isGroupClue(clue: Clue): boolean {
  return clue.kind === 'place' && clue.subject.kind !== 'piece';
}

/** Case de chaque pièce posée sur le plateau. */
export function locatePieces(board: Board): Map<PieceId, number> {
  const cells = new Map<PieceId, number>();
  board.forEach((piece, cell) => {
    if (piece !== null) cells.set(piece, cell);
  });
  return cells;
}

/**
 * La carte est-elle déjà contredite par les pièces posées ? Une carte dont une pièce manque n'est
 * contredite que si celles qui sont posées suffisent à la démentir (une famille dont une pièce est
 * hors de la zone, par exemple). Sert à la recherche exhaustive.
 */
export function isClueContradicted(clue: Clue, cells: ReadonlyMap<PieceId, number>): boolean {
  if (clue.kind === 'place') {
    const zone = zoneMask(clue.zone);
    return getSubjectPieces(clue.subject).some((piece) => {
      const cell = cells.get(piece);
      if (cell === undefined) return false;
      const isInZone = (zone & cellBit(cell)) !== 0;
      return isInZone === clue.isNegated;
    });
  }
  const first = cells.get(clue.first);
  const second = cells.get(clue.second);
  if (first === undefined || second === undefined) return false;
  if (clue.kind === 'pair') return getPairCell(first, clue.direction, true) !== second;
  return areNeighbours(first, second) === clue.isNegated;
}

/** La carte est-elle respectée par le plateau ? Toutes ses pièces doivent y être posées. */
export function isClueSatisfied(clue: Clue, board: Board): boolean {
  const cells = locatePieces(board);
  if (getCluePieces(clue).some((piece) => !cells.has(piece))) return false;
  return !isClueContradicted(clue, cells);
}

/** Options du tirage des cartes : celles de la configuration de l'étoile. */
export interface ClueOptions {
  clueKinds: readonly ClueKind[];
  allowsNegation: boolean;
  allowsGroups: boolean;
}

/** Lignes et colonnes d'une carte de place : une seule, ou deux voisines. */
const LINE_ZONES: readonly ClueZone[] = [
  { kind: 'rows', rows: [0] },
  { kind: 'rows', rows: [1] },
  { kind: 'rows', rows: [2] },
  { kind: 'rows', rows: [0, 1] },
  { kind: 'rows', rows: [1, 2] },
  { kind: 'cols', cols: [0] },
  { kind: 'cols', cols: [1] },
  { kind: 'cols', cols: [2] },
  { kind: 'cols', cols: [0, 1] },
  { kind: 'cols', cols: [1, 2] },
];

/** Zone d'une seule ligne ou colonne : seule une telle zone se barre (deux barrées = une seule). */
function isSingleLine(zone: ClueZone): boolean {
  if (zone.kind === 'rows') return zone.rows.length === 1;
  return zone.kind === 'cols' && zone.cols.length === 1;
}

const FAMILIES: readonly ClueSubject[] = [
  ...PIECE_SHAPES.map((shape): ClueSubject => ({ kind: 'shape', shape })),
  ...PIECE_COLORS.map((color): ClueSubject => ({ kind: 'color', color })),
];

/** Cartes de place d'un sujet : vraies dans la zone, ou barrées si aucune de ses pièces n'y est. */
function getPlaceClues(
  subject: ClueSubject,
  cells: ReadonlyMap<PieceId, number>,
  zones: readonly ClueZone[],
  allowsNegation: boolean,
): Clue[] {
  const mask = getSubjectPieces(subject).reduce(
    (total, piece) => total | cellBit(cells.get(piece) ?? 0),
    0,
  );
  const clues: Clue[] = [];
  for (const zone of zones) {
    const inZone = zoneMask(zone);
    if ((mask & inZone) === mask) {
      clues.push({ kind: 'place', subject, zone, isNegated: false });
    } else if (allowsNegation && (mask & inZone) === 0 && isSingleLine(zone)) {
      clues.push({ kind: 'place', subject, zone, isNegated: true });
    }
  }
  return clues;
}

/** Cartes de case d'une pièce à placer : la sienne, et, barrées, les autres cases libres. */
function getCellClues(
  piece: PieceId,
  cell: number,
  freeCells: readonly number[],
  allowsNegation: boolean,
): Clue[] {
  const subject: ClueSubject = { kind: 'piece', piece };
  const clues: Clue[] = [
    { kind: 'place', subject, zone: { kind: 'cell', cell }, isNegated: false },
  ];
  if (!allowsNegation) return clues;
  for (const other of freeCells) {
    if (other !== cell) {
      clues.push({ kind: 'place', subject, zone: { kind: 'cell', cell: other }, isNegated: true });
    }
  }
  return clues;
}

/**
 * Toutes les cartes vraies de la solution, dans les sortes permises, qui nomment au moins une pièce
 * à placer (une carte sur des pièces verrouillées n'apprendrait rien). Dans une carte « se touchent »,
 * la pièce verrouillée est au centre du dessin (`first`) : l'enfant part de ce qu'il voit.
 */
export function listTrueClues(
  solution: readonly PieceId[],
  freePieces: readonly PieceId[],
  options: ClueOptions,
): Clue[] {
  const { clueKinds, allowsNegation, allowsGroups } = options;
  const cells = locatePieces(solution);
  const free = new Set(freePieces);
  const freeCells = freePieces.flatMap((piece) => cells.get(piece) ?? []);
  const isUseful = (...pieces: PieceId[]) => pieces.some((piece) => free.has(piece));
  const clues: Clue[] = [];

  for (const piece of freePieces) {
    const cell = cells.get(piece) ?? 0;
    const subject: ClueSubject = { kind: 'piece', piece };
    if (clueKinds.includes('cell')) {
      clues.push(...getCellClues(piece, cell, freeCells, allowsNegation));
    }
    if (clueKinds.includes('line')) {
      clues.push(...getPlaceClues(subject, cells, LINE_ZONES, allowsNegation));
    }
  }

  if (allowsGroups && clueKinds.includes('line')) {
    for (const family of FAMILIES) {
      if (isUseful(...getSubjectPieces(family))) {
        clues.push(...getPlaceClues(family, cells, LINE_ZONES, allowsNegation));
      }
    }
  }

  if (clueKinds.includes('pair')) {
    for (let cell = 0; cell < CELL_COUNT; cell += 1) {
      const first = solution[cell];
      if (first === undefined) continue;
      for (const direction of ['right', 'down'] as const) {
        const after = getPairCell(cell, direction, true);
        const second = after === null ? undefined : solution[after];
        if (second !== undefined && isUseful(first, second)) {
          clues.push({ kind: 'pair', first, second, direction });
        }
      }
    }
  }

  if (clueKinds.includes('next')) {
    for (let a = 0; a < CELL_COUNT; a += 1) {
      for (let b = a + 1; b < CELL_COUNT; b += 1) {
        const pieceA = solution[a];
        const pieceB = solution[b];
        if (pieceA === undefined || pieceB === undefined || !isUseful(pieceA, pieceB)) continue;
        const isTouching = areNeighbours(a, b);
        if (!isTouching && !allowsNegation) continue;
        // Pièce verrouillée au centre du dessin ; deux pièces à placer : celle d'en haut à gauche.
        const [first, second] =
          free.has(pieceA) && !free.has(pieceB) ? [pieceB, pieceA] : [pieceA, pieceB];
        clues.push({ kind: 'next', first, second, isNegated: !isTouching });
      }
    }
  }

  return clues;
}

/** Nom d'un sujet dans une identité de carte : la pièce, ou la famille. */
function getSubjectKey(subject: ClueSubject): string {
  switch (subject.kind) {
    case 'piece':
      return subject.piece;
    case 'shape':
      return `shape:${subject.shape}`;
    case 'color':
      return `color:${subject.color}`;
  }
}

/** Nom d'une zone dans une identité de carte. */
function getZoneKey(zone: ClueZone): string {
  switch (zone.kind) {
    case 'cell':
      return `cell:${String(zone.cell)}`;
    case 'rows':
      return `rows:${zone.rows.join('')}`;
    case 'cols':
      return `cols:${zone.cols.join('')}`;
  }
}

/** Identité d'une carte : deux cartes de même identité disent la même chose. */
export function getClueKey(clue: Clue): string {
  if (clue.kind === 'pair') return `pair:${clue.first}:${clue.second}:${clue.direction}`;
  if (clue.kind === 'next') return `next:${clue.first}:${clue.second}:${String(clue.isNegated)}`;
  const zone = getZoneKey(clue.zone);
  return `place:${getSubjectKey(clue.subject)}:${zone}:${String(clue.isNegated)}`;
}
