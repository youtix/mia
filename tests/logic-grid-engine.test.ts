import {
  getClueKey,
  getClueKind,
  getCluePieces,
  isClueContradicted,
  isClueSatisfied,
  isGroupClue,
  isNegatedClue,
  listTrueClues,
  locatePieces,
} from '@/games/logic-grid/clues';
import {
  advancePuzzle,
  checkBoard,
  createLogicGridGame,
  getGuideStep,
  getHelpStage,
  getLogicGridConfigErrors,
  getMovableCluePieces,
  getReservePieces,
  getSeriesLength,
  HELP_LOCK_CHECK,
  isBoardFull,
  isCellLocked,
  isPerfectWin,
  isPieceMovable,
  MAX_FREE_PIECES,
  movePiece,
  returnPiece,
} from '@/games/logic-grid/engine';
import {
  createSeededRng,
  generatePuzzle,
  MAX_ATTEMPTS,
  MAX_CLUES,
} from '@/games/logic-grid/generator';
import {
  areNeighbours,
  CELL_COUNT,
  colMask,
  countCells,
  firstCell,
  getPairCell,
  getPieceColor,
  getPieceShape,
  isCell,
  isPieceId,
  listCells,
  neighbourMask,
  PIECE_IDS,
  rowMask,
  zoneMask,
} from '@/games/logic-grid/grid';
import {
  ANNOUNCEMENTS,
  formatBoardTitle,
  formatMissAnnouncement,
  formatPuzzleLabel,
  getCellLabel,
  getCellPlace,
  getClueLabel,
  getPieceLabel,
} from '@/games/logic-grid/labels';
import {
  countSolutions,
  getClueMask,
  getReasoningRank,
  solveLikeAChild,
} from '@/games/logic-grid/solver';
import type {
  Board,
  Clue,
  LogicGridGameState,
  LogicGridLevelConfig,
  PieceId,
} from '@/games/logic-grid/types';
import { describe, expect, it } from 'vitest';

/** Solution de référence : rouge en haut, jaune au milieu, bleu en bas ; rond, carré, triangle. */
const SOLUTION: readonly PieceId[] = [
  'red-circle',
  'red-square',
  'red-triangle',
  'yellow-circle',
  'yellow-square',
  'yellow-triangle',
  'blue-circle',
  'blue-square',
  'blue-triangle',
];

/** Élément présent, sinon le test échoue clairement. */
function defined<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`${what} absent`);
  return value;
}

/** Plateau de la solution où seules les cases `free` sont vides. */
function startWithout(free: readonly number[]): Board {
  return SOLUTION.map((piece, cell) => (free.includes(cell) ? null : piece));
}

const BASE_CONFIG: LogicGridLevelConfig = {
  freePieces: 3,
  clueKinds: ['cell'],
  allowsNegation: false,
  allowsGroups: false,
  reasoning: 'direct',
  focus: [],
  hasGuide: false,
};

/** Place chaque pièce à placer sur sa case de solution. */
function solve(state: LogicGridGameState): LogicGridGameState {
  return state.puzzle.freePieces.reduce(
    (current, piece) => movePiece(current, piece, state.puzzle.solution.indexOf(piece)),
    state,
  );
}

/**
 * Remplit le plateau en décalant les pièces à placer d'une case libre : aucune n'est à sa place
 * (au moins deux pièces à placer).
 */
function fillWrongly(state: LogicGridGameState): LogicGridGameState {
  const cells = state.puzzle.freePieces.map((piece) => state.puzzle.solution.indexOf(piece));
  return state.puzzle.freePieces.reduce((current, piece, index) => {
    const target = cells[(index + 1) % cells.length] ?? 0;
    return movePiece(current, piece, target);
  }, state);
}

describe('Grille 3 × 3', () => {
  it('compte neuf pièces différentes, chaque couleur dans chaque forme', () => {
    expect(PIECE_IDS).toHaveLength(9);
    expect(new Set(PIECE_IDS).size).toBe(9);
    expect(getPieceShape('blue-triangle')).toBe('triangle');
    expect(getPieceColor('blue-triangle')).toBe('blue');
    expect(isPieceId('red-circle')).toBe(true);
    expect(isPieceId('green-circle')).toBe(false);
    expect(() => getPieceShape('green-circle' as PieceId)).toThrow('Pièce inconnue');
  });

  it('décrit les lignes, les colonnes et les zones des cartes en masques de cases', () => {
    expect(listCells(rowMask(0))).toEqual([0, 1, 2]);
    expect(listCells(colMask(2))).toEqual([2, 5, 8]);
    expect(listCells(zoneMask({ kind: 'cell', cell: 4 }))).toEqual([4]);
    expect(listCells(zoneMask({ kind: 'rows', rows: [1, 2] }))).toEqual([3, 4, 5, 6, 7, 8]);
    expect(listCells(zoneMask({ kind: 'cols', cols: [0, 1] }))).toEqual([0, 1, 3, 4, 6, 7]);
    expect(countCells(0b101010101)).toBe(5);
    expect(firstCell(0)).toBeNull();
    expect(firstCell(0b100000000)).toBe(8);
    expect(isCell(8)).toBe(true);
    expect(isCell(9)).toBe(false);
    expect(isCell(1.5)).toBe(false);
  });

  it('ne compte comme voisines que les cases qui se touchent par un côté', () => {
    expect(listCells(neighbourMask(4))).toEqual([1, 3, 5, 7]);
    expect(listCells(neighbourMask(0))).toEqual([1, 3]);
    expect(listCells(neighbourMask(8))).toEqual([5, 7]);
    expect(areNeighbours(0, 1)).toBe(true);
    expect(areNeighbours(0, 4)).toBe(false);
    expect(areNeighbours(2, 3)).toBe(false);
  });

  it('trouve la case collée à droite, à gauche, en dessous et au-dessus, jamais hors de la grille', () => {
    expect(getPairCell(0, 'right', true)).toBe(1);
    expect(getPairCell(2, 'right', true)).toBeNull();
    expect(getPairCell(3, 'right', false)).toBeNull();
    expect(getPairCell(4, 'right', false)).toBe(3);
    expect(getPairCell(4, 'down', true)).toBe(7);
    expect(getPairCell(7, 'down', true)).toBeNull();
    expect(getPairCell(1, 'down', false)).toBeNull();
    expect(getPairCell(7, 'down', false)).toBe(4);
  });
});

describe('Cartes', () => {
  const allOptions = {
    clueKinds: ['cell', 'line', 'pair', 'next'] as const,
    allowsNegation: true,
    allowsGroups: true,
  };

  it('vérifie chaque sorte de carte sur un plateau complet', () => {
    const clues: Clue[] = [
      {
        kind: 'place',
        subject: { kind: 'piece', piece: 'yellow-square' },
        zone: { kind: 'cell', cell: 4 },
        isNegated: false,
      },
      {
        kind: 'place',
        subject: { kind: 'color', color: 'red' },
        zone: { kind: 'rows', rows: [0] },
        isNegated: false,
      },
      {
        kind: 'place',
        subject: { kind: 'shape', shape: 'circle' },
        zone: { kind: 'cols', cols: [2] },
        isNegated: true,
      },
      { kind: 'pair', first: 'red-circle', second: 'red-square', direction: 'right' },
      { kind: 'pair', first: 'red-circle', second: 'yellow-circle', direction: 'down' },
      { kind: 'next', first: 'yellow-square', second: 'blue-square', isNegated: false },
      { kind: 'next', first: 'red-circle', second: 'blue-triangle', isNegated: true },
    ];
    for (const clue of clues) expect(isClueSatisfied(clue, SOLUTION)).toBe(true);

    const swapped = [...SOLUTION];
    swapped[0] = 'red-square';
    swapped[1] = 'red-circle';
    expect(isClueSatisfied(defined(clues[3], 'carte'), swapped)).toBe(false);
    expect(isClueSatisfied(defined(clues[4], 'carte'), swapped)).toBe(false);
    expect(isClueSatisfied(defined(clues[1], 'carte'), swapped)).toBe(true);
  });

  it('ne tient pas pour respectée une carte dont une pièce manque', () => {
    const board = startWithout([4]);
    const clue: Clue = {
      kind: 'place',
      subject: { kind: 'piece', piece: 'yellow-square' },
      zone: { kind: 'cell', cell: 4 },
      isNegated: false,
    };
    expect(isClueSatisfied(clue, board)).toBe(false);
  });

  it('repère une famille contredite dès qu’une de ses pièces est hors de la zone', () => {
    const cells = new Map<PieceId, number>([['red-circle', 4]]);
    const clue: Clue = {
      kind: 'place',
      subject: { kind: 'color', color: 'red' },
      zone: { kind: 'rows', rows: [0] },
      isNegated: false,
    };
    expect(isClueContradicted(clue, cells)).toBe(true);
    expect(isClueContradicted(clue, new Map([['red-circle', 1]]))).toBe(false);
    const pair: Clue = {
      kind: 'pair',
      first: 'red-circle',
      second: 'red-square',
      direction: 'right',
    };
    expect(isClueContradicted(pair, cells)).toBe(false);
  });

  it('classe les cartes et nomme leurs pièces', () => {
    const group: Clue = {
      kind: 'place',
      subject: { kind: 'shape', shape: 'square' },
      zone: { kind: 'cols', cols: [1] },
      isNegated: false,
    };
    const next: Clue = {
      kind: 'next',
      first: 'red-circle',
      second: 'blue-square',
      isNegated: true,
    };
    expect(getClueKind(group)).toBe('line');
    expect(getClueKind(next)).toBe('next');
    expect(isGroupClue(group)).toBe(true);
    expect(isNegatedClue(group)).toBe(false);
    expect(isNegatedClue(next)).toBe(true);
    expect(getCluePieces(group)).toEqual(['red-square', 'yellow-square', 'blue-square']);
    expect(getCluePieces(next)).toEqual(['red-circle', 'blue-square']);
    expect(locatePieces(startWithout([0])).has('red-circle')).toBe(false);
  });

  it('ne tire que des cartes vraies, distinctes, qui nomment une pièce à placer', () => {
    const free: PieceId[] = ['red-circle', 'yellow-square', 'blue-triangle'];
    const clues = listTrueClues(SOLUTION, free, allOptions);

    expect(clues.length).toBeGreaterThan(30);
    expect(new Set(clues.map(getClueKey)).size).toBe(clues.length);
    for (const clue of clues) {
      expect(isClueSatisfied(clue, SOLUTION)).toBe(true);
      expect(getCluePieces(clue).some((piece) => free.includes(piece))).toBe(true);
    }
    // Familles : toutes les pièces rouges sont en haut ; aucun rond dans la colonne du milieu.
    expect(clues.map(getClueKey)).toEqual(
      expect.arrayContaining([
        'place:color:red:rows:0:false',
        'place:shape:circle:cols:1:true',
        'next:yellow-circle:yellow-square:false',
      ]),
    );
  });

  it('respecte les sortes de cartes permises', () => {
    const free: PieceId[] = ['red-circle', 'yellow-square'];
    const clues = listTrueClues(SOLUTION, free, {
      clueKinds: ['next'],
      allowsNegation: false,
      allowsGroups: false,
    });
    expect(clues.every((clue) => clue.kind === 'next' && !clue.isNegated)).toBe(true);
    // Une pièce verrouillée est au centre du dessin.
    expect(clues).toContainEqual({
      kind: 'next',
      first: 'red-square',
      second: 'red-circle',
      isNegated: false,
    });
  });

  it('distingue les cartes par leur identité', () => {
    const keys = [
      getClueKey({ kind: 'pair', first: 'red-circle', second: 'red-square', direction: 'down' }),
      getClueKey({
        kind: 'place',
        subject: { kind: 'piece', piece: 'red-circle' },
        zone: { kind: 'cell', cell: 0 },
        isNegated: false,
      }),
      getClueKey({
        kind: 'place',
        subject: { kind: 'piece', piece: 'red-circle' },
        zone: { kind: 'cols', cols: [0, 1] },
        isNegated: false,
      }),
    ];
    expect(keys).toEqual([
      'pair:red-circle:red-square:down',
      'place:red-circle:cell:0:false',
      'place:red-circle:cols:01:false',
    ]);
  });
});

describe('Solveur « enfant »', () => {
  it('place une pièce d’une seule carte, puis la dernière pièce dans la dernière case', () => {
    const clues: Clue[] = [
      {
        kind: 'place',
        subject: { kind: 'piece', piece: 'red-circle' },
        zone: { kind: 'cell', cell: 0 },
        isNegated: false,
      },
    ];
    const result = solveLikeAChild(startWithout([0, 8]), clues, 'direct');
    expect(result.isSolved).toBe(true);
    expect(result.steps.map((step) => [step.piece, step.cell, step.move])).toEqual([
      ['red-circle', 0, 'direct'],
      ['blue-triangle', 8, 'last-hole'],
    ]);
    expect(result.board).toEqual(SOLUTION);
    expect(result.openOptions).toBe(0);
  });

  it('croise une ligne et une colonne quand aucune carte seule ne suffit', () => {
    const clues: Clue[] = [
      {
        kind: 'place',
        subject: { kind: 'piece', piece: 'red-circle' },
        zone: { kind: 'rows', rows: [0] },
        isNegated: false,
      },
      {
        kind: 'place',
        subject: { kind: 'piece', piece: 'red-circle' },
        zone: { kind: 'cols', cols: [0] },
        isNegated: false,
      },
    ];
    const start = startWithout([0, 2, 6]);
    expect(solveLikeAChild(start, clues, 'direct').isSolved).toBe(false);
    const result = solveLikeAChild(start, clues, 'combine');
    expect(result.steps[0]).toEqual({
      piece: 'red-circle',
      cell: 0,
      move: 'combine',
      clueIndices: [0, 1],
    });
    expect(result.isSolved).toBe(false);
    expect(result.openOptions).toBe(4);
  });

  it('trouve la seule pièce qui peut aller dans une case', () => {
    // Cases libres 0, 1, 2 : ni le rond rouge ni le carré rouge ne vont à droite, seul le triangle
    // rouge le peut ; le carré, qui le touche, se place ensuite.
    const clues: Clue[] = [
      {
        kind: 'place',
        subject: { kind: 'piece', piece: 'red-circle' },
        zone: { kind: 'cols', cols: [2] },
        isNegated: true,
      },
      {
        kind: 'place',
        subject: { kind: 'piece', piece: 'red-square' },
        zone: { kind: 'cols', cols: [2] },
        isNegated: true,
      },
      { kind: 'next', first: 'red-triangle', second: 'red-square', isNegated: false },
    ];
    const start = startWithout([0, 1, 2]);
    expect(solveLikeAChild(start, clues, 'combine').isSolved).toBe(false);
    const result = solveLikeAChild(start, clues, 'exclude');
    expect(result.steps[0]).toMatchObject({ piece: 'red-triangle', cell: 2, move: 'exclude' });
    expect(result.steps[0]?.clueIndices).toEqual([0, 1]);
    expect(result.isSolved).toBe(true);
  });

  it('lit une carte « collées » dès que l’autre pièce est posée', () => {
    const clues: Clue[] = [
      { kind: 'pair', first: 'red-circle', second: 'red-square', direction: 'right' },
      { kind: 'pair', first: 'red-square', second: 'yellow-square', direction: 'down' },
      { kind: 'next', first: 'red-circle', second: 'blue-square', isNegated: true },
    ];
    // Libres : le carré rouge (1), le carré jaune (4) et le carré bleu (7).
    const result = solveLikeAChild(startWithout([1, 4, 7]), clues, 'direct');
    expect(
      result.steps.map((step) => [step.piece, step.cell, step.move, step.clueIndices]),
    ).toEqual([
      ['red-square', 1, 'direct', [0]],
      ['yellow-square', 4, 'direct', [1]],
      ['blue-square', 7, 'last-hole', []],
    ]);
    expect(result.board).toEqual(SOLUTION);
  });

  it('lit une carte « se touchent », et sa version barrée, à partir d’une pièce posée', () => {
    // Cases vides 1, 3 et 7 ; le rond bleu est posé en 6, ses voisines sont 3 et 7.
    const cells = new Map<PieceId, number>([['blue-circle', 6]]);
    const free = 0b010001010;
    const touching: Clue = {
      kind: 'next',
      first: 'blue-circle',
      second: 'blue-square',
      isNegated: false,
    };
    const apart: Clue = {
      kind: 'next',
      first: 'blue-circle',
      second: 'red-square',
      isNegated: true,
    };
    const pair: Clue = {
      kind: 'pair',
      first: 'blue-circle',
      second: 'red-square',
      direction: 'down',
    };

    expect(listCells(getClueMask(touching, 'blue-square', cells, free) ?? -1)).toEqual([3, 7]);
    expect(listCells(getClueMask(apart, 'red-square', cells, free) ?? -1)).toEqual([1]);
    // Rien sur une pièce que la carte ne nomme pas, ni tant que sa partenaire n'est pas posée.
    expect(getClueMask(touching, 'red-square', cells, free)).toBeNull();
    expect(getClueMask(touching, 'blue-circle', new Map(), free)).toBeNull();
    // Collée sous une pièce de la dernière ligne : aucune case possible.
    expect(getClueMask(pair, 'red-square', cells, free)).toBe(0);
  });

  it('classe les raisonnements', () => {
    expect([
      getReasoningRank('direct'),
      getReasoningRank('combine'),
      getReasoningRank('exclude'),
    ]).toEqual([1, 2, 3]);
  });

  it('compte les solutions, jusqu’à la limite demandée', () => {
    const start = startWithout([0, 1, 2]);
    expect(countSolutions(start, [])).toBe(2);
    expect(countSolutions(start, [], 10)).toBe(6);
    const clue: Clue = {
      kind: 'place',
      subject: { kind: 'piece', piece: 'red-circle' },
      zone: { kind: 'cell', cell: 0 },
      isNegated: false,
    };
    expect(countSolutions(start, [clue], 10)).toBe(2);
    expect(countSolutions(SOLUTION, [clue])).toBe(1);
  });
});

describe('Générateur', () => {
  it('tire des puzzles d’une seule solution, en six cartes au plus, que l’enfant peut finir', () => {
    const configs: LogicGridLevelConfig[] = [
      BASE_CONFIG,
      {
        ...BASE_CONFIG,
        freePieces: 4,
        clueKinds: ['line', 'pair', 'next'],
        reasoning: 'combine',
        focus: ['combine'],
      },
      {
        ...BASE_CONFIG,
        freePieces: 6,
        clueKinds: ['cell', 'line', 'pair', 'next'],
        allowsNegation: true,
        allowsGroups: true,
        reasoning: 'exclude',
        focus: ['exclude'],
      },
    ];
    for (const config of configs) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const puzzle = generatePuzzle(config, createSeededRng(seed));
        const start = puzzle.solution.map((piece, cell) =>
          puzzle.lockedCells.includes(cell) ? piece : null,
        );
        expect(puzzle.clues.length).toBeLessThanOrEqual(MAX_CLUES);
        expect(puzzle.freePieces).toHaveLength(config.freePieces);
        expect(puzzle.lockedCells).toHaveLength(CELL_COUNT - config.freePieces);
        expect(countSolutions(start, puzzle.clues)).toBe(1);
        const result = solveLikeAChild(start, puzzle.clues, config.reasoning);
        expect(result.isSolved).toBe(true);
        expect(result.steps).toEqual(puzzle.steps);
        for (const clue of puzzle.clues) expect(isClueSatisfied(clue, puzzle.solution)).toBe(true);
      }
    }
  });

  it('exige le raisonnement demandé : les règles plus simples ne suffisent pas', () => {
    const combine = {
      ...BASE_CONFIG,
      clueKinds: ['line'] as const,
      reasoning: 'combine' as const,
      focus: ['combine'] as const,
    };
    for (const seed of [11, 12, 13]) {
      const puzzle = generatePuzzle(combine, createSeededRng(seed));
      const start = puzzle.solution.map((piece, cell) =>
        puzzle.lockedCells.includes(cell) ? piece : null,
      );
      expect(solveLikeAChild(start, puzzle.clues, 'direct').isSolved).toBe(false);
      expect(puzzle.steps.some((step) => step.move === 'combine')).toBe(true);
    }
  });

  it('range les cartes dans l’ordre où l’enfant s’en sert', () => {
    const puzzle = generatePuzzle(
      { ...BASE_CONFIG, freePieces: 5, clueKinds: ['cell', 'next'], focus: ['next'] },
      createSeededRng(3),
    );
    const firstUses = puzzle.steps.flatMap((step) => step.clueIndices);
    const order = firstUses.filter((index, position) => firstUses.indexOf(index) === position);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(puzzle.clues.some((clue) => clue.kind === 'next')).toBe(true);
  });

  it('guide le premier pas avec une carte de la sorte nouvelle', () => {
    const config: LogicGridLevelConfig = {
      ...BASE_CONFIG,
      clueKinds: ['cell', 'line'],
      allowsNegation: true,
      reasoning: 'combine',
      focus: ['not'],
      hasGuide: true,
    };
    for (const seed of [1, 2, 3]) {
      const puzzle = generatePuzzle(config, createSeededRng(seed));
      const [first] = puzzle.steps;
      expect(
        first?.clueIndices.some((index) => isNegatedClue(defined(puzzle.clues[index], 'carte'))),
      ).toBe(true);
    }
  });

  it('abandonne après MAX_ATTEMPTS essais sans puzzle possible', () => {
    // Trois pièces et des cartes « collées » seules ne demandent jamais d’éliminer une pièce.
    const impossible: LogicGridLevelConfig = {
      ...BASE_CONFIG,
      clueKinds: ['pair'],
      reasoning: 'exclude',
      focus: ['exclude'],
    };
    expect(MAX_ATTEMPTS).toBeGreaterThan(0);
    expect(() => generatePuzzle(impossible, createSeededRng(1))).toThrow('aucun puzzle trouvé');
  });

  it('rend une partie reproductible avec la même graine', () => {
    const first = generatePuzzle(BASE_CONFIG, createSeededRng(42));
    const again = generatePuzzle(BASE_CONFIG, createSeededRng(42));
    expect(again).toEqual(first);
    const rng = createSeededRng(7);
    const values = Array.from({ length: 100 }, rng);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

describe('Configuration', () => {
  it('accepte chaque sorte d’étoile du catalogue', () => {
    expect(getLogicGridConfigErrors(BASE_CONFIG)).toEqual([]);
    expect(
      getLogicGridConfigErrors({
        freePieces: MAX_FREE_PIECES,
        clueKinds: ['cell', 'line', 'pair', 'next'],
        allowsNegation: true,
        allowsGroups: true,
        reasoning: 'exclude',
        focus: ['group', 'not', 'combine', 'exclude'],
        hasGuide: false,
      }),
    ).toEqual([]);
  });

  it('signale chaque anomalie en français', () => {
    const errors = getLogicGridConfigErrors({
      freePieces: 9,
      clueKinds: ['cell', 'cell', 'zigzag' as 'cell'],
      allowsNegation: false,
      allowsGroups: true,
      reasoning: 'guess' as 'direct',
      focus: ['not', 'group', 'pair', 'exclude', 'luck' as 'not', 'not'],
      hasGuide: false,
    });
    expect(errors).toEqual([
      'freePieces 9 invalide (entier de 3 à 8 attendu)',
      'clueKinds : sorte « zigzag » inconnue',
      'clueKinds : sorte en double',
      'allowsGroups sans la sorte « line » (une famille se place dans une ligne)',
      'reasoning « guess » inconnu',
      'focus « not » sans allowsNegation',
      'focus « pair » sans la sorte de carte « pair » dans clueKinds',
      'focus « luck » inconnu',
      'focus « not » sans allowsNegation',
      'focus en double',
    ]);
    expect(getLogicGridConfigErrors({ ...BASE_CONFIG, clueKinds: [], focus: ['combine'] })).toEqual(
      [
        'clueKinds vide (au moins une sorte de carte attendue)',
        'focus « combine » au-delà du raisonnement « direct »',
      ],
    );
    expect(getLogicGridConfigErrors({ ...BASE_CONFIG, focus: ['group'] })).toEqual([
      'focus « group » sans allowsGroups',
    ]);
  });

  it('refuse de créer une partie invalide', () => {
    expect(() => createLogicGridGame({ ...BASE_CONFIG, freePieces: 2 })).toThrow(
      'Configuration Chacun sa Place invalide : freePieces 2 invalide',
    );
  });

  it('enchaîne 3 puzzles à 3 pièces, 2 à 4, puis 1', () => {
    expect([3, 4, 5, 6, 7, 8].map(getSeriesLength)).toEqual([3, 2, 1, 1, 1, 1]);
  });
});

describe('Partie', () => {
  const game = () => createLogicGridGame(BASE_CONFIG, createSeededRng(5));

  it('commence par le premier puzzle, seules les pièces verrouillées posées', () => {
    const state = game();
    expect(state.puzzles).toHaveLength(3);
    expect(state.puzzle).toBe(state.puzzles[0]);
    expect(state.phase).toBe('placing');
    expect(getReservePieces(state)).toEqual(state.puzzle.freePieces);
    expect(state.board.filter((piece) => piece !== null)).toHaveLength(6);
    for (const cell of state.puzzle.lockedCells) {
      expect(isCellLocked(state, cell)).toBe(true);
      expect(state.board[cell]).toBe(state.puzzle.solution[cell]);
    }
    expect(isBoardFull(state)).toBe(false);
  });

  it('pose une pièce de la réserve, l’échange avec une autre, la déplace, la rend', () => {
    const start = game();
    const [a, b] = start.puzzle.freePieces as [PieceId, PieceId, PieceId];
    const [cellA, cellB] = start.puzzle.freePieces.map((piece) =>
      start.puzzle.solution.indexOf(piece),
    ) as [number, number];

    const placed = movePiece(start, a, cellA);
    expect(placed.board[cellA]).toBe(a);
    expect(placed.moves).toBe(1);
    expect(getReservePieces(placed)).not.toContain(a);

    // De la réserve sur une case occupée : la pièce qui y était retourne à la réserve.
    const replaced = movePiece(placed, b, cellA);
    expect(replaced.board[cellA]).toBe(b);
    expect(getReservePieces(replaced)).toContain(a);

    // D'une case à une autre case occupée : les deux pièces changent de place.
    const both = movePiece(movePiece(replaced, a, cellB), a, cellA);
    expect(both.board[cellA]).toBe(a);
    expect(both.board[cellB]).toBe(b);

    const returned = returnPiece(both, a);
    expect(returned.board[cellA]).toBeNull();
    expect(getReservePieces(returned)).toContain(a);
    expect(returned.moves).toBe(both.moves + 1);
  });

  it('ignore une case figée, une pièce verrouillée, une case hors grille ou la même case', () => {
    const start = game();
    const [piece] = start.puzzle.freePieces as [PieceId];
    const [lockedCell] = start.puzzle.lockedCells as [number];
    const lockedPiece = defined(start.board[lockedCell], 'pièce verrouillée');

    expect(movePiece(start, piece, lockedCell)).toBe(start);
    expect(movePiece(start, piece, 9)).toBe(start);
    expect(movePiece(start, lockedPiece, start.puzzle.solution.indexOf(piece))).toBe(start);
    expect(isPieceMovable(start, lockedPiece)).toBe(false);
    expect(returnPiece(start, lockedPiece)).toBe(start);
    expect(returnPiece(start, piece)).toBe(start);
    const placed = movePiece(start, piece, start.puzzle.solution.indexOf(piece));
    expect(movePiece(placed, piece, start.puzzle.solution.indexOf(piece))).toBe(placed);
  });

  it('ne vérifie qu’un plateau plein, et réussit quand chaque carte est respectée', () => {
    const start = game();
    expect(checkBoard(start)).toBe(start);
    const solved = checkBoard(solve(start));
    expect(solved.phase).toBe('success');
    expect(solved.unmetClueIndex).toBeNull();
    // Plus rien ne bouge pendant la célébration.
    expect(movePiece(solved, defined(solved.puzzle.freePieces[0], 'pièce'), 0)).toBe(solved);
    expect(checkBoard(solved)).toBe(solved);
  });

  it('désigne la première carte non respectée, puis fait monter l’échelle d’aide', () => {
    const wrong = fillWrongly(game());
    expect(isBoardFull(wrong)).toBe(true);

    const first = checkBoard(wrong);
    const expected = wrong.puzzle.clues.findIndex((clue) => !isClueSatisfied(clue, wrong.board));
    expect(first.phase).toBe('placing');
    expect(first.unmetClueIndex).toBe(expected);
    expect(first.failedChecks).toBe(1);
    expect(first.totalFailedChecks).toBe(1);
    expect(first.checkTick).toBe(1);
    expect(getHelpStage(first)).toBe(1);
    expect(getHelpStage(checkBoard(first))).toBe(2);
    expect(getHelpStage(wrong)).toBe(0);
  });

  it('met une pièce de la carte à sa place et la fige à la troisième vérification ratée', () => {
    let state = fillWrongly(game());
    for (let check = 1; check < HELP_LOCK_CHECK; check += 1) state = checkBoard(state);
    const unmet = defined(
      state.puzzle.clues.find((clue) => !isClueSatisfied(clue, state.board)),
      'carte non respectée',
    );

    const helped = checkBoard(state);
    const piece = defined(helped.helpedPiece, 'pièce aidée');
    const target = helped.puzzle.solution.indexOf(piece);
    expect(getHelpStage(helped)).toBe(3);
    expect(getCluePieces(unmet)).toContain(piece);
    expect(helped.board[target]).toBe(piece);
    expect(isCellLocked(helped, target)).toBe(true);
    expect(isPieceMovable(helped, piece)).toBe(false);
    expect(isBoardFull(helped)).toBe(true);
    // La pièce qui occupait la case a pris celle que la pièce aidée a quittée.
    expect(new Set(helped.board).size).toBe(CELL_COUNT);
    // Un geste efface le signal de l'aide.
    const [other] = helped.puzzle.freePieces.filter((candidate) =>
      isPieceMovable(helped, candidate),
    );
    expect(returnPiece(helped, defined(other, 'pièce')).helpedPiece).toBeNull();
  });

  it('finit toujours le puzzle à force d’aide', () => {
    let state = fillWrongly(
      createLogicGridGame(
        { ...BASE_CONFIG, freePieces: 5, clueKinds: ['cell', 'next'], focus: ['next'] },
        createSeededRng(9),
      ),
    );
    for (let check = 0; check < 12 && state.phase === 'placing'; check += 1)
      state = checkBoard(state);
    expect(state.phase).toBe('success');
  });

  it('enchaîne les puzzles de l’étoile, puis la gagne avec la couronne sans erreur', () => {
    let state = game();
    for (let index = 0; index < 3; index += 1) {
      expect(state.puzzleIndex).toBe(index);
      state = checkBoard(solve(state));
      expect(isPerfectWin(state)).toBe(false);
      state = advancePuzzle(state);
    }
    expect(state.phase).toBe('won');
    expect(isPerfectWin(state)).toBe(true);
    expect(advancePuzzle(state)).toBe(state);
  });

  it('perd la couronne pour une seule vérification ratée dans la série', () => {
    let state = checkBoard(fillWrongly(game()));
    state = advancePuzzle(checkBoard(solve(state)));
    expect(state.totalFailedChecks).toBe(1);
    expect(state.failedChecks).toBe(0);
    expect(state.unmetClueIndex).toBeNull();
    state = advancePuzzle(checkBoard(solve(state)));
    state = advancePuzzle(checkBoard(solve(state)));
    expect(state.phase).toBe('won');
    expect(isPerfectWin(state)).toBe(false);
  });

  it('montre le premier pas à la main fantôme tant que rien n’est posé, au premier puzzle', () => {
    const guided = createLogicGridGame({ ...BASE_CONFIG, hasGuide: true }, createSeededRng(5));
    expect(getGuideStep(guided)).toEqual(guided.puzzle.steps[0]);
    const piece = defined(guided.puzzle.freePieces[0], 'pièce');
    expect(
      getGuideStep(movePiece(guided, piece, guided.puzzle.solution.indexOf(piece))),
    ).toBeNull();
    expect(getGuideStep(game())).toBeNull();
    const second = advancePuzzle(checkBoard(solve(guided)));
    expect(getGuideStep({ ...second, moves: 0 })).toBeNull();
    expect(getGuideStep(checkBoard(solve(guided)))).toBeNull();
  });

  it('liste les pièces posées par l’enfant qu’une carte nomme', () => {
    const start = game();
    const [piece] = start.puzzle.freePieces as [PieceId];
    const cell = start.puzzle.solution.indexOf(piece);
    const clue: Clue = {
      kind: 'place',
      subject: { kind: 'piece', piece },
      zone: { kind: 'cell', cell },
      isNegated: false,
    };
    expect(getMovableCluePieces(start, clue)).toEqual([]);
    expect(getMovableCluePieces(movePiece(start, piece, cell), clue)).toEqual([piece]);
  });
});

describe('Textes', () => {
  it('nomme les pièces et les cases', () => {
    expect(getPieceLabel('blue-square')).toBe('Carré bleu');
    expect(getCellPlace(4)).toBe('au centre');
    expect(getCellPlace(12)).toBe('case 13');
    expect(getCellLabel(0, null, false)).toBe('Case en haut à gauche, vide');
    expect(getCellLabel(8, 'red-circle', true)).toBe(
      'Case en bas à droite, rond rouge, déjà en place',
    );
    expect(getCellLabel(3, 'yellow-triangle', false)).toBe(
      'Case au milieu à gauche, triangle jaune',
    );
  });

  it('dit chaque carte en une phrase', () => {
    const piece = { kind: 'piece', piece: 'red-circle' } as const;
    const label = (clue: Clue) => getClueLabel(clue);
    expect(
      label({ kind: 'place', subject: piece, zone: { kind: 'cell', cell: 4 }, isNegated: false }),
    ).toBe('Le rond rouge est sur la case au centre.');
    expect(
      label({ kind: 'place', subject: piece, zone: { kind: 'rows', rows: [2] }, isNegated: true }),
    ).toBe('Le rond rouge n’est pas dans la ligne du bas.');
    expect(
      label({
        kind: 'place',
        subject: piece,
        zone: { kind: 'rows', rows: [0, 1] },
        isNegated: false,
      }),
    ).toBe('Le rond rouge est dans les deux lignes du haut.');
    expect(
      label({
        kind: 'place',
        subject: piece,
        zone: { kind: 'rows', rows: [1, 2] },
        isNegated: false,
      }),
    ).toBe('Le rond rouge est dans les deux lignes du bas.');
    expect(
      label({ kind: 'place', subject: piece, zone: { kind: 'cols', cols: [0] }, isNegated: false }),
    ).toBe('Le rond rouge est dans la colonne de gauche.');
    expect(
      label({
        kind: 'place',
        subject: piece,
        zone: { kind: 'cols', cols: [0, 1] },
        isNegated: false,
      }),
    ).toBe('Le rond rouge est dans les deux colonnes de gauche.');
    expect(
      label({
        kind: 'place',
        subject: piece,
        zone: { kind: 'cols', cols: [1, 2] },
        isNegated: false,
      }),
    ).toBe('Le rond rouge est dans les deux colonnes de droite.');
    expect(
      label({
        kind: 'place',
        subject: { kind: 'shape', shape: 'square' },
        zone: { kind: 'cols', cols: [1] },
        isNegated: false,
      }),
    ).toBe('Tous les carrés sont dans la colonne du milieu.');
    expect(
      label({
        kind: 'place',
        subject: { kind: 'shape', shape: 'circle' },
        zone: { kind: 'cols', cols: [2] },
        isNegated: true,
      }),
    ).toBe('Aucun rond n’est dans la colonne de droite.');
    expect(
      label({
        kind: 'place',
        subject: { kind: 'color', color: 'blue' },
        zone: { kind: 'rows', rows: [2] },
        isNegated: false,
      }),
    ).toBe('Toutes les pièces bleues sont dans la ligne du bas.');
    expect(
      label({
        kind: 'place',
        subject: { kind: 'color', color: 'blue' },
        zone: { kind: 'rows', rows: [0] },
        isNegated: true,
      }),
    ).toBe('Aucune pièce bleue n’est dans la ligne du haut.');
    expect(
      label({ kind: 'pair', first: 'red-circle', second: 'blue-square', direction: 'right' }),
    ).toBe('Le carré bleu est juste à droite du rond rouge.');
    expect(
      label({ kind: 'pair', first: 'red-circle', second: 'blue-square', direction: 'down' }),
    ).toBe('Le carré bleu est juste en dessous du rond rouge.');
    expect(
      label({ kind: 'next', first: 'red-circle', second: 'blue-square', isNegated: false }),
    ).toBe('Le carré bleu touche le rond rouge par un côté.');
    expect(
      label({ kind: 'next', first: 'red-circle', second: 'blue-square', isNegated: true }),
    ).toBe('Le carré bleu ne touche pas le rond rouge.');
  });

  it('annonce les vérifications et titre l’écran', () => {
    const clue: Clue = {
      kind: 'next',
      first: 'red-circle',
      second: 'blue-square',
      isNegated: false,
    };
    expect(formatMissAnnouncement(clue, null, 0)).toBe(
      'Pas encore. Regarde cette carte : Le carré bleu touche le rond rouge par un côté.',
    );
    expect(formatMissAnnouncement(clue, 'blue-square', 1)).toBe(
      'Pas encore. Regarde cette carte : Le carré bleu touche le rond rouge par un côté. Je t’aide : le carré bleu va en haut au milieu.',
    );
    expect(formatBoardTitle(3)).toBe('Chacun sa Place, Étoile #3');
    expect(formatPuzzleLabel(1, 3)).toBe('Puzzle 2 sur 3');
    expect(ANNOUNCEMENTS.ready).toContain('cloche');
  });
});
