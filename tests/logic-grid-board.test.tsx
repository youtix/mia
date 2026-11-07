import LogicGridPage, { metadata as logicGridMetadata } from '@/app/logic-grid/page';
import { END_SCREEN_GUARD_MS, NavigationProvider } from '@/core/navigation';
import {
  GAME_REGISTRY,
  getGameProgressSummary,
  type BaseLevelDefinition,
} from '@/core/progression';
import type * as MiaStorage from '@/core/storage';
import { ClueCard, LogicGridBoard, SUCCESS_MS } from '@/games/logic-grid/components';
import type * as Generator from '@/games/logic-grid/generator';
import { CELL_COUNT } from '@/games/logic-grid/grid';
import { getPieceLabel } from '@/games/logic-grid/labels';
import { solveLikeAChild } from '@/games/logic-grid/solver';
import type {
  Clue,
  LogicGridLevelConfig,
  LogicGridPuzzle,
  PieceId,
} from '@/games/logic-grid/types';
import type { UserProfile } from '@/types/mia';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { storage, synth, generator } = vi.hoisted(() => ({
  storage: { soundEnabled: true, activeProfile: null as UserProfile | null },
  synth: { playSoundBeats: vi.fn(), playSoundJingle: vi.fn(), stopSounds: vi.fn() },
  generator: { queue: [] as LogicGridPuzzle[], fallback: null as LogicGridPuzzle | null },
}));

/** Réglage « Son » et profil actif vus par le plateau (`useMiaStorage`) ; le reste du module est réel. */
vi.mock('@/core/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof MiaStorage>();
  const useMiaStorage = () => ({
    state: {
      profiles: [storage.activeProfile ?? { id: 'p1' }],
      settings: { soundEnabled: storage.soundEnabled },
    },
    isLoaded: true,
    activeProfile: storage.activeProfile,
    updateState: vi.fn(() => Promise.resolve()),
  });
  return { ...actual, useMiaStorage };
});

/** Ce qui est joué, sans Web Audio : le déroulé du jeu n'en dépend pas. */
vi.mock('@/core/audio/synth', () => synth);

/**
 * Puzzles écrits à la main, dans l'ordre de `generator.queue` (puis `generator.fallback`) : le
 * générateur a ses propres tests, le plateau joue des puzzles connus.
 */
vi.mock('@/games/logic-grid/generator', async (importOriginal) => {
  const actual = await importOriginal<typeof Generator>();
  return {
    ...actual,
    generatePuzzle: () => {
      const next = generator.queue.shift() ?? generator.fallback;
      if (!next) throw new Error('Aucun puzzle de test en attente');
      return next;
    },
  };
});

// Page `/logic-grid` : niveau lancé par l'adresse, choix du joueur déjà fait.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams({ level: 'lg-001' }),
}));
vi.mock('@/components/profile', () => ({ ProfileGate: () => null }));

/** Rouges en haut, jaunes au milieu, bleus en bas ; rond, carré, triangle de gauche à droite. */
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

function onCell(piece: PieceId, cell: number): Clue {
  return {
    kind: 'place',
    subject: { kind: 'piece', piece },
    zone: { kind: 'cell', cell },
    isNegated: false,
  };
}

/** Puzzle de la solution de référence : `freeCells` à remplir, cartes dans l'ordre d'affichage. */
function puzzleWith(
  freeCells: readonly number[],
  freePieces: readonly PieceId[],
  clues: readonly Clue[],
): LogicGridPuzzle {
  const lockedCells = Array.from({ length: CELL_COUNT }, (_, cell) => cell).filter(
    (cell) => !freeCells.includes(cell),
  );
  const start = SOLUTION.map((piece, cell) => (lockedCells.includes(cell) ? piece : null));
  return {
    solution: SOLUTION,
    lockedCells,
    freePieces,
    clues,
    steps: solveLikeAChild(start, clues, 'combine').steps,
  };
}

/** Rond rouge en haut à gauche (carte 0), carré jaune au centre (carte 1), triangle bleu en dernier. */
const PUZZLE_A = puzzleWith(
  [0, 4, 8],
  ['yellow-square', 'red-circle', 'blue-triangle'],
  [onCell('red-circle', 0), onCell('yellow-square', 4)],
);

/** Carré rouge en haut au milieu, carré bleu en bas au milieu, rond jaune en dernier. */
const PUZZLE_B = puzzleWith(
  [1, 3, 7],
  ['blue-square', 'red-square', 'yellow-circle'],
  [onCell('red-square', 1), onCell('blue-square', 7)],
);

/** Carte 0 : le carré rouge juste à droite du rond rouge (deux pièces à placer) ; carte 1 : le rond. */
const PUZZLE_PAIR = puzzleWith(
  [0, 1, 8],
  ['blue-triangle', 'red-square', 'red-circle'],
  [
    { kind: 'pair', first: 'red-circle', second: 'red-square', direction: 'right' },
    onCell('red-circle', 0),
  ],
);

/** Une étoile d'un seul puzzle (plus de quatre pièces à placer : un puzzle par étoile). */
const SINGLE: LogicGridLevelConfig = {
  freePieces: 5,
  clueKinds: ['cell'],
  allowsNegation: false,
  allowsGroups: false,
  reasoning: 'direct',
  focus: [],
  hasGuide: false,
};

/** Trois pièces à placer : trois puzzles par étoile. */
const SERIES: LogicGridLevelConfig = { ...SINGLE, freePieces: 3 };

const CREATED_AT = '2026-10-01T09:00:00.000Z';

function crownedPlayer(): UserProfile {
  return {
    id: 'p1',
    name: 'Léo',
    avatarId: 'fox',
    createdAt: CREATED_AT,
    gamesProgress: {
      'logic-grid': {
        gameId: 'logic-grid',
        levels: {
          'lg-001': {
            levelId: 'lg-001',
            completed: true,
            isPerfect: true,
            bestMoves: 3,
            bestTimeSeconds: 9,
            timesPlayed: 1,
            completedAt: CREATED_AT,
          },
        },
        lastPlayedLevelId: 'lg-001',
      },
    },
    gameSettings: { memory: { previewFactor: 1, mismatchFactor: 1 } },
  };
}

function definition(
  id: string,
  order: number,
  config: LogicGridLevelConfig,
): BaseLevelDefinition<LogicGridLevelConfig> {
  return { id, gameId: 'logic-grid', tier: 'very_easy', order, config };
}

interface BoardOptions {
  config?: LogicGridLevelConfig;
  puzzles?: readonly LogicGridPuzzle[];
  /** Niveau joué : 0 (Étoile #1, suivie de l'Étoile #2) ou 1 (dernière étoile du catalogue) */
  levelIndex?: number;
  profile?: UserProfile | null;
  soundEnabled?: boolean;
}

/** Monte le plateau comme `GameScreen.renderLevel` : niveau du résumé et commandes simulées. */
function renderBoard({
  config = SINGLE,
  puzzles = [PUZZLE_A],
  levelIndex = 0,
  profile = null,
  soundEnabled = true,
}: BoardOptions = {}) {
  storage.activeProfile = profile;
  storage.soundEnabled = soundEnabled;
  generator.queue = [...puzzles];
  generator.fallback = puzzles.at(-1) ?? PUZZLE_A;
  const catalog = [definition('lg-001', 10, config), definition('lg-002', 20, config)];
  const summary = getGameProgressSummary('logic-grid', catalog, profile);
  const level = summary.allLevels[levelIndex];
  if (!level) throw new Error(`Niveau ${String(levelIndex)} absent du catalogue de test`);
  const controls = {
    summary,
    playLevel: vi.fn(),
    exitToMap: vi.fn(),
    recordVictory: vi.fn(() => Promise.resolve()),
  };
  render(<LogicGridBoard level={level} controls={controls} />, { wrapper: NavigationProvider });
  return controls;
}

/** Mode TV forcé avant le montage : le moteur D-Pad démarre en mode `dpad`. */
function forceTvMode(): void {
  document.documentElement.dataset.tv = 'on';
}

/** Appuie sur une touche (cible : élément focalisé) ; `true` si le moteur D-Pad l'a consommée. */
function press(key: string): boolean {
  return !fireEvent.keyDown(document.activeElement ?? document.body, { key });
}

/** Flèches vers la gauche, puis vers le bas, jusqu'à une case vide (curseur de la télécommande). */
function moveToEmptyCell(): void {
  for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowDown', 'ArrowDown']) {
    const focused = document.querySelector<HTMLElement>('[data-focused]');
    if (focused?.dataset.cell !== undefined && focused.dataset.piece === undefined) return;
    press(key);
  }
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function getCell(cell: number): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-cell="${String(cell)}"]`);
  if (!element) throw new Error(`Case ${String(cell)} absente`);
  return element;
}

function getReservePiece(piece: PieceId): HTMLElement {
  return screen.getByRole('button', { name: getPieceLabel(piece) });
}

function getReservePieces(): (string | undefined)[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-reserve-piece]')).map(
    (element) => element.dataset.piece,
  );
}

function getBoard(): string[] {
  return Array.from({ length: CELL_COUNT }, (_, cell) => {
    const element = getCell(cell);
    return `${element.dataset.piece ?? '-'}${element.dataset.locked ? '*' : ''}`;
  });
}

function getBell(): HTMLElement {
  return screen.getByRole('button', { name: 'Vérifier' });
}

function getBack(): HTMLElement {
  return screen.getByRole('button', { name: 'Retour' });
}

function getCardStates(): (string | undefined)[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-clue-state]')).map(
    (card) => card.dataset.clueState,
  );
}

function getStatus(): string {
  return screen.getByRole('status').textContent;
}

function getWiggling(): (string | undefined)[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-wiggling]')).map(
    (element) => element.dataset.piece,
  );
}

/** Choisit une pièce de la réserve, puis la pose d'un tap sur une case. */
function place(piece: PieceId, cell: number): void {
  fireEvent.click(getReservePiece(piece));
  fireEvent.click(getCell(cell));
}

function ring(): void {
  fireEvent.click(getBell());
}

/** Pose chaque pièce à placer sur sa case de solution. */
function solve(puzzle: LogicGridPuzzle): void {
  for (const piece of puzzle.freePieces) place(piece, puzzle.solution.indexOf(piece));
}

/** Réussit le puzzle en cours, et laisse passer la célébration. */
async function solveAndCelebrate(puzzle: LogicGridPuzzle): Promise<void> {
  solve(puzzle);
  ring();
  await advance(SUCCESS_MS);
}

/** Texte visible de la page : tout, sauf ce qui est réservé aux lecteurs d'écran. */
function getVisibleText(): string {
  const page = document.body.cloneNode(true) as HTMLElement;
  for (const hidden of page.querySelectorAll('.sr-only, [role="status"]')) hidden.remove();
  return page.textContent.trim();
}

/**
 * jsdom n'a pas de mise en page : grille de cases de 90 px à partir de (100, 100), pièces de la
 * réserve en colonne de deux à partir de (500, 100), cloche en (520, 420), réserve autour.
 */
const TRAY_RECT = { left: 490, top: 90, right: 650, bottom: 400 };

function rectAt(left: number, top: number, size: number): DOMRect {
  return new DOMRect(left, top, size, size);
}

function mockLayout(reserveOrder: readonly PieceId[]) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const cell = this.dataset.cellBox ?? this.dataset.cell;
    if (cell !== undefined) {
      const index = Number(cell);
      return rectAt(100 + (index % 3) * 100, 100 + Math.floor(index / 3) * 100, 90);
    }
    if (this.dataset.reservePiece !== undefined) {
      const index = reserveOrder.indexOf(this.dataset.piece as PieceId);
      return rectAt(500 + (index % 2) * 70, 100 + Math.floor(index / 2) * 70, 60);
    }
    if (this.getAttribute('aria-label') === 'Réserve') {
      const { left, top, right, bottom } = TRAY_RECT;
      return new DOMRect(left, top, right - left, bottom - top);
    }
    if (this.getAttribute('aria-label') === 'Vérifier') return rectAt(520, 420, 80);
    return new DOMRect(0, 0, 0, 0);
  });
}

/** Centre d'une case dans `mockLayout`. */
function cellCenter(cell: number): { clientX: number; clientY: number } {
  return { clientX: 145 + (cell % 3) * 100, clientY: 145 + Math.floor(cell / 3) * 100 };
}

const POINTER = { pointerId: 7, isPrimary: true };

/** Glissement complet : contact au centre de l'élément, déplacement, relâchement en `to`. */
function drag(element: HTMLElement, to: { clientX: number; clientY: number }): void {
  const rect = element.getBoundingClientRect();
  const origin = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  fireEvent.pointerDown(element, { ...origin, ...POINTER });
  fireEvent.pointerMove(element, { ...to, ...POINTER });
  fireEvent.pointerUp(element, { ...to, ...POINTER });
}

const setPointerCapture = vi.fn();

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  // jsdom n'implémente pas la capture du pointeur.
  Element.prototype.setPointerCapture = setPointerCapture;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
  delete (Element.prototype as Partial<Element>).setPointerCapture;
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  storage.activeProfile = null;
  storage.soundEnabled = true;
  generator.queue = [];
  generator.fallback = null;
  delete document.documentElement.dataset.tv;
});

describe('Zéro texte', () => {
  it('n’affiche aucun texte, de la première image à l’écran de fin, aide comprise', async () => {
    renderBoard({ puzzles: [PUZZLE_PAIR] });
    expect(getVisibleText()).toBe('');

    place('red-circle', 1);
    place('red-square', 8);
    place('blue-triangle', 0);
    for (let check = 0; check < 3; check += 1) ring();
    expect(getVisibleText()).toBe('');

    await advance(3000);
    ring();
    ring();
    await advance(SUCCESS_MS);
    await advance(1000);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(getVisibleText()).toBe('');
  });

  it('garde les noms accessibles : titre, Retour, cartes, cases, réserve, cloche', () => {
    renderBoard();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Chacun sa Place, Étoile #1' }),
    ).toHaveClass('sr-only');
    expect(getBack()).toBeInTheDocument();
    expect(
      screen.getAllByRole('img', { name: /^Le / }).map((card) => card.getAttribute('aria-label')),
    ).toEqual([
      'Le rond rouge est sur la case en haut à gauche.',
      'Le carré jaune est sur la case au centre.',
    ]);
    expect(getCell(0)).toHaveAccessibleName('Case en haut à gauche, vide');
    expect(getCell(1)).toHaveAccessibleName('Case en haut au milieu, carré rouge, déjà en place');
    expect(getReservePieces()).toEqual(['yellow-square', 'red-circle', 'blue-triangle']);
    expect(getReservePiece('red-circle')).toHaveAttribute('aria-pressed', 'false');
    expect(getBell()).toHaveAttribute('aria-disabled', 'true');
  });

  it.each([
    [false, 'Le carré bleu touche le triangle rouge par un côté.'],
    [true, 'Le carré bleu ne touche pas le triangle rouge.'],
  ])(
    'dessine la pièce d’une carte « se touchent » (barrée : %s) à gauche, jamais sous une croix',
    (isNegated, label) => {
      render(
        <ClueCard
          clue={{ kind: 'next', first: 'red-triangle', second: 'blue-square', isNegated }}
        />,
      );
      const card = screen.getByRole('img', { name: label });

      // La pièce nommée, puis celle du centre : deux pièces dessinées, aucune sur les quatre côtés.
      expect(
        Array.from(card.querySelectorAll('[data-glyph]'), (glyph) =>
          glyph.getAttribute('data-glyph'),
        ),
      ).toEqual(['blue-square', 'red-triangle']);
      const sides = Array.from(card.querySelectorAll('[data-around]'));
      expect(sides).toHaveLength(4);
      for (const side of sides) {
        expect(side.querySelector('[data-glyph]')).toBeNull();
        expect(side.querySelector('[data-cross]') !== null).toBe(isNegated);
      }
    },
  );
});

describe('Poser les pièces', () => {
  it('pose une pièce choisie d’un tap sur une case vide, puis annonce le plateau plein', () => {
    renderBoard();

    fireEvent.click(getReservePiece('red-circle'));
    expect(getReservePiece('red-circle')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(getCell(0));

    expect(getCell(0)).toHaveAttribute('data-piece', 'red-circle');
    expect(getReservePieces()).toEqual(['yellow-square', 'blue-triangle']);
    expect(getCell(0)).toHaveAttribute('aria-pressed', 'false');

    place('yellow-square', 4);
    expect(getBell()).toHaveAttribute('aria-disabled', 'true');
    place('blue-triangle', 8);
    expect(getBell()).toHaveAttribute('aria-disabled', 'false');
    expect(getBell()).toHaveAttribute('data-bell-ready', 'true');
    expect(getStatus()).toBe('Toutes les pièces sont posées : appuie sur la cloche pour vérifier.');
  });

  it('échange une pièce de la grille avec celle qu’on y pose, ou avec une pièce de la réserve', () => {
    renderBoard();
    place('yellow-square', 0);

    // Depuis la réserve sur une case occupée : la pièce qui y était retourne à la réserve.
    place('red-circle', 0);
    expect(getCell(0)).toHaveAttribute('data-piece', 'red-circle');
    expect(getReservePieces()).toContain('yellow-square');

    // Pièce de la grille choisie, puis une pièce de la réserve : celle-ci prend sa case.
    fireEvent.click(getCell(0));
    expect(getCell(0)).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(getReservePiece('blue-triangle'));
    expect(getCell(0)).toHaveAttribute('data-piece', 'blue-triangle');
    expect(getReservePieces()).toEqual(['yellow-square', 'red-circle']);
  });

  it('déplace une pièce de la grille sur une case vide, ou l’échange avec une autre', () => {
    renderBoard();
    place('red-circle', 4);
    place('yellow-square', 0);

    fireEvent.click(getCell(4));
    fireEvent.click(getCell(8));
    expect(getBoard()[8]).toBe('red-circle');
    expect(getBoard()[4]).toBe('-');

    fireEvent.click(getCell(8));
    fireEvent.click(getCell(0));
    expect(getBoard()[0]).toBe('red-circle');
    expect(getBoard()[8]).toBe('yellow-square');

    // Un second tap sur la pièce choisie la repose.
    fireEvent.click(getCell(0));
    fireEvent.click(getCell(0));
    expect(getCell(0)).toHaveAttribute('aria-pressed', 'false');
  });

  it('fait remuer la réserve quand on touche une case vide sans pièce choisie', () => {
    renderBoard();
    fireEvent.click(getCell(0));

    expect(getWiggling()).toEqual(['yellow-square', 'red-circle', 'blue-triangle']);
    expect(getStatus()).toBe('Choisis d’abord une pièce de la réserve.');
    expect(getBoard()[0]).toBe('-');
  });

  it('ne laisse pas toucher aux pièces posées d’avance : ce ne sont pas des boutons', () => {
    renderBoard();
    expect(getCell(1).tagName).toBe('DIV');
    expect(getCell(1)).toHaveAttribute('data-locked', 'true');
    fireEvent.click(getReservePiece('red-circle'));
    fireEvent.click(getCell(1));
    expect(getBoard()[1]).toBe('red-square*');
    expect(getReservePieces()).toContain('red-circle');
  });
});

describe('Glisser-déposer', () => {
  it('pose une pièce glissée de la réserve sur une case', () => {
    renderBoard();
    mockLayout(PUZZLE_A.freePieces);

    drag(getReservePiece('red-circle'), cellCenter(0));

    expect(getBoard()[0]).toBe('red-circle');
    expect(getReservePieces()).not.toContain('red-circle');
    expect(setPointerCapture).toHaveBeenCalledWith(POINTER.pointerId);
  });

  it('déplace une pièce de la grille, ou la rend à la réserve', () => {
    renderBoard();
    mockLayout(PUZZLE_A.freePieces);
    drag(getReservePiece('red-circle'), cellCenter(4));

    drag(getCell(4), cellCenter(8));
    expect(getBoard()[8]).toBe('red-circle');

    drag(getCell(8), { clientX: 560, clientY: 300 });
    expect(getBoard()[8]).toBe('-');
    expect(getReservePieces()).toContain('red-circle');
  });

  it('ne pose rien hors de la grille, ni sur une case figée', () => {
    renderBoard();
    mockLayout(PUZZLE_A.freePieces);

    drag(getReservePiece('red-circle'), { clientX: 900, clientY: 700 });
    drag(getReservePiece('red-circle'), cellCenter(1));

    expect(getBoard()).toEqual([
      '-',
      'red-square*',
      'red-triangle*',
      'yellow-circle*',
      '-',
      'yellow-triangle*',
      'blue-circle*',
      'blue-square*',
      '-',
    ]);
    expect(getReservePieces()).toContain('red-circle');
  });
});

describe('La cloche', () => {
  it('ne vérifie rien tant qu’une pièce attend : la réserve remue', () => {
    renderBoard();
    place('red-circle', 4);
    ring();

    expect(getCardStates()).toEqual(['idle', 'idle']);
    expect(getWiggling()).toEqual(['yellow-square', 'blue-triangle']);
    expect(synth.playSoundBeats).not.toHaveBeenCalled();
  });

  it('désigne la première carte non respectée, sans jamais rien barrer sur la grille', () => {
    renderBoard();
    place('red-circle', 4);
    place('yellow-square', 8);
    place('blue-triangle', 0);
    ring();

    expect(synth.playSoundBeats).toHaveBeenCalledWith(['bell'], expect.any(Number));
    expect(getCardStates()).toEqual(['unmet', 'idle']);
    expect(getStatus()).toBe(
      'Pas encore. Regarde cette carte : Le rond rouge est sur la case en haut à gauche.',
    );
    // Les pièces restent où l'enfant les a mises.
    expect(getBoard()[4]).toBe('red-circle');
    expect(document.querySelector('[data-cross]')).toBeNull();
  });

  it('laisse la carte entourée après sa pulsation, jusqu’à la vérification suivante', async () => {
    renderBoard();
    place('red-circle', 4);
    place('yellow-square', 8);
    place('blue-triangle', 0);
    ring();
    await advance(3000);
    expect(getCardStates()).toEqual(['reminder', 'idle']);
  });

  it('fait remuer les pièces de la carte à la deuxième vérification ratée', () => {
    renderBoard({ puzzles: [PUZZLE_PAIR] });
    place('red-circle', 1);
    place('red-square', 8);
    place('blue-triangle', 0);
    ring();
    expect(getWiggling()).toEqual([]);
    ring();
    expect(getCardStates()[0]).toBe('unmet');
    expect(getWiggling().sort()).toEqual(['red-circle', 'red-square']);
  });

  it('met une pièce de la carte à sa place à la troisième vérification ratée, puis finit le puzzle', () => {
    renderBoard({ puzzles: [PUZZLE_PAIR] });
    place('red-circle', 1);
    place('red-square', 8);
    place('blue-triangle', 0);
    ring();
    ring();
    ring();

    expect(getCell(0)).toHaveAttribute('data-piece', 'red-circle');
    expect(getCell(0)).toHaveAttribute('data-locked', 'true');
    expect(getCell(0)).toHaveAttribute('data-glowing', 'true');
    expect(getBoard()[1]).toBe('blue-triangle');
    expect(getStatus()).toBe(
      'Pas encore. Regarde cette carte : Le carré rouge est juste à droite du rond rouge. Je t’aide : le rond rouge va en haut à gauche.',
    );

    // La pièce aidée ne bouge plus ; l'enfant finit lui-même.
    fireEvent.click(getCell(0));
    expect(getCell(0)).not.toHaveAttribute('aria-pressed');
    fireEvent.click(getCell(8));
    fireEvent.click(getCell(1));
    ring();
    expect(getStatus()).toBe('Bravo, chaque pièce est à sa place !');
  });
});

describe('Réussite et étoile', () => {
  it('enchaîne les puzzles de l’étoile, puis enregistre une victoire parfaite une seule fois', async () => {
    const controls = renderBoard({ config: SERIES, puzzles: [PUZZLE_A, PUZZLE_B, PUZZLE_A] });
    expect(screen.getByRole('img', { name: 'Défi 1 sur 3' })).toBeInTheDocument();

    await solveAndCelebrate(PUZZLE_A);
    expect(screen.getByRole('img', { name: 'Défi 2 sur 3' })).toBeInTheDocument();
    expect(getReservePieces()).toEqual(['blue-square', 'red-square', 'yellow-circle']);
    expect(controls.recordVictory).not.toHaveBeenCalled();

    await solveAndCelebrate(PUZZLE_B);
    solve(PUZZLE_A);
    ring();
    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 9,
      // Deux célébrations de SUCCESS_MS avant la dernière vérification : 2,8 s.
      timeSeconds: 3,
      isPerfect: true,
    });
    await advance(SUCCESS_MS);
    expect(getStatus()).toBe('Étoile gagnée !');
    await advance(1000);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.querySelector('[data-star-award]')).toHaveAttribute('data-crown', 'true');
    expect(controls.recordVictory).toHaveBeenCalledTimes(1);
  });

  it('perd la couronne pour une seule vérification ratée', async () => {
    const controls = renderBoard();
    place('red-circle', 4);
    place('yellow-square', 0);
    place('blue-triangle', 8);
    ring();
    fireEvent.click(getCell(4));
    fireEvent.click(getCell(0));
    ring();

    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ isPerfect: false, moves: 4 }),
    );
    await advance(SUCCESS_MS);
    await advance(1000);
    expect(document.querySelector('[data-star-award]')).not.toHaveAttribute('data-crown');
  });

  it('montre une couronne déjà acquise même après une partie imparfaite', async () => {
    renderBoard({ profile: crownedPlayer() });
    place('red-circle', 4);
    place('yellow-square', 0);
    place('blue-triangle', 8);
    ring();
    fireEvent.click(getCell(4));
    fireEvent.click(getCell(0));
    ring();
    await advance(SUCCESS_MS);
    await advance(1000);
    expect(document.querySelector('[data-star-award]')).toHaveAttribute('data-crown', 'true');
  });

  it('sonne la cloche, puis un jingle par puzzle et un pour l’étoile', async () => {
    renderBoard();
    solve(PUZZLE_A);
    ring();
    expect(synth.playSoundJingle).not.toHaveBeenCalled();
    await advance(500);
    expect(synth.playSoundJingle).toHaveBeenCalledWith('round');
    await advance(SUCCESS_MS);
    expect(synth.playSoundJingle).toHaveBeenLastCalledWith('star');
  });

  it('reste silencieux avec le son coupé, et gagne quand même', async () => {
    const controls = renderBoard({ soundEnabled: false });
    solve(PUZZLE_A);
    ring();
    await advance(SUCCESS_MS);
    await advance(1000);
    expect(synth.playSoundBeats).not.toHaveBeenCalled();
    expect(synth.playSoundJingle).not.toHaveBeenCalled();
    expect(controls.recordVictory).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('propose l’étoile suivante, rejouer et la carte, en icônes seules', async () => {
    const controls = renderBoard();
    solve(PUZZLE_A);
    ring();
    await advance(SUCCESS_MS);
    await advance(1000);
    await advance(END_SCREEN_GUARD_MS);

    fireEvent.click(screen.getByRole('button', { name: 'Étoile suivante' }));
    expect(controls.playLevel).toHaveBeenCalledWith('lg-002');
    fireEvent.click(screen.getByRole('button', { name: 'Carte des étoiles' }));
    expect(controls.exitToMap).toHaveBeenCalled();
  });

  it('rejoue une nouvelle partie depuis l’écran de fin', async () => {
    const controls = renderBoard({ puzzles: [PUZZLE_A, PUZZLE_B] });
    solve(PUZZLE_A);
    ring();
    await advance(SUCCESS_MS);
    await advance(1000);
    await advance(END_SCREEN_GUARD_MS);

    fireEvent.click(screen.getByRole('button', { name: 'Rejouer' }));
    await advance(1000);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getReservePieces()).toEqual(['blue-square', 'red-square', 'yellow-circle']);
    solve(PUZZLE_B);
    ring();
    expect(controls.recordVictory).toHaveBeenCalledTimes(2);
  });

  it('retire l’étoile suivante après la dernière étoile du catalogue', async () => {
    renderBoard({ levelIndex: 1, profile: crownedPlayer() });
    solve(PUZZLE_A);
    ring();
    await advance(SUCCESS_MS);
    await advance(1000);
    expect(screen.queryByRole('button', { name: 'Étoile suivante' })).toBeNull();
  });
});

describe('Main fantôme', () => {
  it('fait luire la carte du premier pas et montre le geste jusqu’à la première pièce posée', () => {
    renderBoard({ config: { ...SINGLE, hasGuide: true } });
    mockLayout(PUZZLE_A.freePieces);
    // La mesure attend la mise en page (`requestAnimationFrame`).
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(getCardStates()).toEqual(['guide', 'idle']);
    expect(document.querySelector('[data-guide-hand]')).not.toBeNull();

    place('red-circle', 0);
    expect(getCardStates()).toEqual(['idle', 'idle']);
    expect(document.querySelector('[data-guide-hand]')).toBeNull();
  });

  it('montre la pièce et la case à la télécommande, sans main', () => {
    forceTvMode();
    renderBoard({ config: { ...SINGLE, hasGuide: true } });

    expect(getReservePiece('red-circle')).toHaveAttribute('data-guided', 'true');
    expect(getCell(0)).toHaveAttribute('data-guide-target', 'true');
    expect(document.querySelector('[data-guide-hand]')).toBeNull();
  });

  it('n’apparaît pas sans `hasGuide`', () => {
    renderBoard();
    expect(getCardStates()).toEqual(['idle', 'idle']);
    expect(document.querySelector('[data-guided], [data-guide-target]')).toBeNull();
  });
});

describe('Télécommande', () => {
  it('choisit avec OK, va sur une case avec les flèches, pose avec OK, puis passe à la pièce suivante', () => {
    forceTvMode();
    renderBoard();
    mockLayout(PUZZLE_A.freePieces);

    expect(getReservePiece('yellow-square')).toHaveAttribute('data-focused', 'true');
    expect(press('Enter')).toBe(true);
    expect(getReservePiece('yellow-square')).toHaveAttribute('aria-pressed', 'true');

    press('ArrowLeft');
    const focused = document.querySelector<HTMLElement>('[data-focused]');
    expect(focused?.dataset.cell).toBeDefined();
    // La pièce choisie se devine en transparence sur la case vide du curseur.
    expect(focused?.querySelector('[data-preview="yellow-square"]')).not.toBeNull();
    const cell = Number(focused?.dataset.cell);

    press('Enter');
    expect(getBoard()[cell]).toBe('yellow-square');
    expect(getReservePiece('red-circle')).toHaveAttribute('data-focused', 'true');
  });

  it('mène à la cloche une fois la réserve vide, et vérifie avec OK', () => {
    forceTvMode();
    renderBoard();
    mockLayout(PUZZLE_A.freePieces);

    for (let piece = 0; piece < 3; piece += 1) {
      press('Enter');
      moveToEmptyCell();
      press('Enter');
    }
    expect(getReservePieces()).toEqual([]);

    expect(getBell()).toHaveAttribute('data-focused', 'true');
    expect(getBell()).toHaveFocus();
    press('Enter');
    expect(synth.playSoundBeats).toHaveBeenCalledWith(['bell'], expect.any(Number));
  });

  it('rejoint Retour par le haut, et en revient', () => {
    forceTvMode();
    renderBoard();
    mockLayout(PUZZLE_A.freePieces);

    press('ArrowLeft');
    press('ArrowUp');
    press('ArrowUp');
    press('ArrowUp');
    expect(getBack()).toHaveFocus();
    press('ArrowDown');
    expect(document.querySelector('[data-focused]')).not.toBeNull();
  });

  it('revient à la Carte des Étoiles avec Retour', () => {
    forceTvMode();
    const controls = renderBoard();
    press('Escape');
    expect(controls.exitToMap).toHaveBeenCalledTimes(1);
  });

  it('active la zone de l’élément qui reçoit le focus (Tab, clic)', () => {
    forceTvMode();
    renderBoard();
    fireEvent.focus(getBack());
    expect(getBack()).toHaveAttribute('data-focused', 'true');
    fireEvent.focus(getReservePiece('blue-triangle'));
    expect(getReservePiece('blue-triangle')).toHaveAttribute('data-focused', 'true');
  });
});

describe('Page', () => {
  it('publie le titre du registre et lance le plateau de l’étoile demandée', () => {
    expect(logicGridMetadata.title).toBe(GAME_REGISTRY['logic-grid'].title);
    storage.activeProfile = crownedPlayer();
    generator.fallback = PUZZLE_A;

    render(<LogicGridPage />, { wrapper: NavigationProvider });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Chacun sa Place, Étoile #1' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Grille' })).toBeInTheDocument();
    expect(getReservePieces()).toHaveLength(3);
  });

  it('revient à la Carte des Étoiles au doigt', () => {
    const controls = renderBoard();
    fireEvent.click(getBack());
    expect(controls.exitToMap).toHaveBeenCalledTimes(1);
  });
});
