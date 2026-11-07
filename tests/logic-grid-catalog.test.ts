// @vitest-environment node
import {
  DIFFICULTY_TIER_IDS,
  GAME_REGISTRY,
  getGameProgressSummary,
  validateLevelCatalog,
} from '@/core/progression';
import { CURRENT_SCHEMA_VERSION, DEFAULT_DEVICE_SETTINGS } from '@/core/storage/default-state';
import { parseSaveStateReport } from '@/core/storage/migrations';
import {
  LOGIC_GRID_CATALOG,
  validateLogicGridCatalog,
  VALIDATION_SEEDS,
  type LogicGridLevel,
} from '@/games/logic-grid/catalog';
import { getClueKind, isGroupClue, isNegatedClue } from '@/games/logic-grid/clues';
import type * as LogicGridEngine from '@/games/logic-grid/engine';
import { createLogicGridGame, getSeriesLength } from '@/games/logic-grid/engine';
import { createSeededRng, MAX_CLUES } from '@/games/logic-grid/generator';
import { CELL_COUNT } from '@/games/logic-grid/grid';
import { countSolutions, solveLikeAChild } from '@/games/logic-grid/solver';
import type {
  ClueKind,
  LogicGridFocus,
  LogicGridLevelConfig,
  LogicGridPuzzle,
  Reasoning,
} from '@/games/logic-grid/types';
import type { DifficultyTier, GameId, UserProfile } from '@/types/mia';
import { describe, expect, it, vi } from 'vitest';

/** Délai des tests qui tirent et recomptent beaucoup de puzzles. */
const SLOW = { timeout: 30_000 };

// Moteur réel, `createLogicGridGame` espionnée : une instanciation impossible se simule (défense en
// profondeur du validateur), une configuration sans anomalie s'instancie toujours (FEAT-27).
vi.mock('@/games/logic-grid/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof LogicGridEngine>();
  return { ...actual, createLogicGridGame: vi.fn(actual.createLogicGridGame) };
});

type StarRow = [
  id: string,
  tier: DifficultyTier,
  order: number,
  freePieces: number,
  clueKinds: string,
  allowsNegation: boolean,
  allowsGroups: boolean,
  reasoning: Reasoning,
  focus: string,
  hasGuide: boolean,
];

const ALL = 'cell+line+pair+next';

/** Le tableau des 20 étoiles de FEAT-27 §3.3, colonne par colonne. */
const SPEC_ROWS: StarRow[] = [
  ['lg-001', 'very_easy', 10, 3, 'cell', false, false, 'direct', '', true],
  ['lg-002', 'very_easy', 20, 3, 'cell+next', false, false, 'direct', 'next', false],
  ['lg-003', 'very_easy', 30, 4, 'cell+next', false, false, 'direct', 'next', false],
  ['lg-004', 'very_easy', 40, 5, 'cell+next', false, false, 'direct', 'next', false],
  ['lg-005', 'easy', 10, 3, 'line', false, false, 'combine', 'line+combine', true],
  ['lg-006', 'easy', 20, 3, 'line+pair', false, false, 'combine', 'pair+combine', false],
  ['lg-007', 'easy', 30, 4, 'line+pair+next', false, false, 'combine', 'combine', false],
  ['lg-008', 'easy', 40, 5, ALL, false, false, 'combine', 'combine', false],
  ['lg-009', 'medium', 10, 3, 'cell+line', true, false, 'combine', 'not', true],
  ['lg-010', 'medium', 20, 4, 'cell+line+next', true, false, 'combine', 'not', false],
  ['lg-011', 'medium', 30, 5, 'line+pair+next', true, false, 'combine', 'not+combine', false],
  ['lg-012', 'medium', 40, 6, ALL, true, false, 'exclude', 'not+combine', false],
  ['lg-013', 'hard', 10, 4, 'line', false, true, 'combine', 'group', true],
  ['lg-014', 'hard', 20, 5, 'line+pair', false, true, 'combine', 'group', false],
  ['lg-015', 'hard', 30, 6, 'line+pair+next', true, true, 'exclude', 'group+not', false],
  ['lg-016', 'hard', 40, 7, ALL, true, true, 'exclude', 'group', false],
  ['lg-017', 'very_hard', 10, 6, ALL, true, true, 'exclude', 'exclude', false],
  ['lg-018', 'very_hard', 20, 7, ALL, true, true, 'exclude', 'not+combine', false],
  ['lg-019', 'very_hard', 30, 7, ALL, true, true, 'exclude', 'group+exclude', false],
  ['lg-020', 'very_hard', 40, 8, ALL, true, true, 'exclude', 'group+not+combine', false],
];

function toRow(entry: LogicGridLevel): StarRow {
  const { freePieces, clueKinds, allowsNegation, allowsGroups, reasoning, focus, hasGuide } =
    entry.config;
  return [
    entry.id,
    entry.tier,
    entry.order,
    freePieces,
    clueKinds.join('+'),
    allowsNegation,
    allowsGroups,
    reasoning,
    focus.join('+'),
    hasGuide,
  ];
}

/** Trois pièces, cartes de case, sans exigence : une configuration valide. */
const BASE_CONFIG: LogicGridLevelConfig = {
  freePieces: 3,
  clueKinds: ['cell'],
  allowsNegation: false,
  allowsGroups: false,
  reasoning: 'direct',
  focus: [],
  hasGuide: false,
};

function level(
  id: string,
  tier: DifficultyTier,
  order: number,
  config: Partial<LogicGridLevelConfig> = {},
  gameId: GameId = 'logic-grid',
): LogicGridLevel {
  return { id, gameId, tier, order, config: { ...BASE_CONFIG, ...config } };
}

/** Puzzles tirés pour une étoile, avec plusieurs graines (autres que celles du validateur). */
function samplePuzzles(config: LogicGridLevelConfig): LogicGridPuzzle[] {
  return [11, 12, 13].flatMap((seed) => createLogicGridGame(config, createSeededRng(seed)).puzzles);
}

function startOf(puzzle: LogicGridPuzzle) {
  return puzzle.solution.map((piece, cell) => (puzzle.lockedCells.includes(cell) ? piece : null));
}

describe('LOGIC_GRID_CATALOG', () => {
  it('publie exactement les 20 étoiles de FEAT-27 §3.3, dans l’ordre de la carte', () => {
    expect(LOGIC_GRID_CATALOG.map(toRow)).toEqual(SPEC_ROWS);
    expect(LOGIC_GRID_CATALOG.map((entry) => entry.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `lg-${String(index + 1).padStart(3, '0')}`),
    );
    expect(LOGIC_GRID_CATALOG.every((entry) => entry.gameId === 'logic-grid')).toBe(true);
  });

  it('donne à chaque étoile un titre court, unique, jamais affiché', () => {
    const titles = LOGIC_GRID_CATALOG.map((entry) => entry.title);

    expect(titles.every((title) => typeof title === 'string' && title.trim() !== '')).toBe(true);
    expect(new Set(titles).size).toBe(20);
  });

  it('remplit les 5 paliers de 4 étoiles chacun, numérotées de 1 à 20', () => {
    const summary = getGameProgressSummary('logic-grid', LOGIC_GRID_CATALOG, null);

    expect(summary.totalStars).toBe(20);
    expect(summary.tiers.map((tier) => [tier.tier, tier.totalStars])).toEqual(
      DIFFICULTY_TIER_IDS.map((tier) => [tier, 4]),
    );
    expect(summary.allLevels.map((entry) => entry.definition)).toEqual([...LOGIC_GRID_CATALOG]);
    expect(summary.allLevels.map((entry) => entry.starNumber)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(summary.tiers.map((tier) => tier.levels.map((entry) => entry.definition.order))).toEqual(
      Array.from({ length: 5 }, () => [10, 20, 30, 40]),
    );
  });

  it('commence par l’Étoile #1, seule débloquée sans progression', () => {
    const summary = getGameProgressSummary('logic-grid', LOGIC_GRID_CATALOG, null);

    expect(summary.nextPlayableLevel?.definition.id).toBe('lg-001');
    expect(
      summary.allLevels.filter((entry) => entry.isUnlocked).map((entry) => entry.definition.id),
    ).toEqual(['lg-001']);
  });

  it('est branché sur le registre des jeux (Hub, Carte des Étoiles, page /logic-grid)', () => {
    expect(GAME_REGISTRY['logic-grid'].catalog).toBe(LOGIC_GRID_CATALOG);
    expect(validateLevelCatalog('logic-grid', GAME_REGISTRY['logic-grid'].catalog)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('monte en dents de scie : chaque palier repart d’un petit plateau qui grandit', () => {
    for (const tier of DIFFICULTY_TIER_IDS) {
      const sizes = LOGIC_GRID_CATALOG.filter((entry) => entry.tier === tier).map(
        (entry) => entry.config.freePieces,
      );
      expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    }
    expect(LOGIC_GRID_CATALOG.map((entry) => entry.config.freePieces).at(-1)).toBe(8);
  });

  it('enchaîne 3 puzzles à 3 pièces, 2 à 4, puis 1', () => {
    expect(LOGIC_GRID_CATALOG.map((entry) => getSeriesLength(entry.config.freePieces))).toEqual([
      3, 3, 2, 1, 3, 3, 2, 1, 3, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it('guide la première étoile des quatre premiers paliers, et aucune autre', () => {
    expect(
      LOGIC_GRID_CATALOG.filter((entry) => entry.config.hasGuide).map((entry) => entry.id),
    ).toEqual(['lg-001', 'lg-005', 'lg-009', 'lg-013']);
  });

  it('n’ouvre les cartes barrées qu’à partir de Moyen, et les familles qu’à partir de Difficile', () => {
    const tierRank = (tier: DifficultyTier) => DIFFICULTY_TIER_IDS.indexOf(tier);
    for (const entry of LOGIC_GRID_CATALOG) {
      expect(entry.config.allowsNegation).toBe(
        tierRank(entry.tier) >= tierRank('medium') &&
          !(entry.tier === 'hard' && entry.config.freePieces < 6),
      );
      expect(entry.config.allowsGroups).toBe(tierRank(entry.tier) >= tierRank('hard'));
    }
  });

  it.each(LOGIC_GRID_CATALOG)(
    '$id : chaque puzzle tiré tient en six cartes, a une seule solution et remplit ses exigences',
    SLOW,
    (entry) => {
      const { config } = entry;
      for (const puzzle of samplePuzzles(config)) {
        const start = startOf(puzzle);
        expect(puzzle.clues.length).toBeLessThanOrEqual(MAX_CLUES);
        expect(puzzle.lockedCells).toHaveLength(CELL_COUNT - config.freePieces);
        expect(countSolutions(start, puzzle.clues)).toBe(1);
        expect(solveLikeAChild(start, puzzle.clues, config.reasoning).isSolved).toBe(true);
        const kinds = new Set<ClueKind>(puzzle.clues.map(getClueKind));
        for (const kind of kinds) expect(config.clueKinds).toContain(kind);
        if (!config.allowsNegation) expect(puzzle.clues.some(isNegatedClue)).toBe(false);
        if (!config.allowsGroups) expect(puzzle.clues.some(isGroupClue)).toBe(false);
        const focus = new Set<LogicGridFocus>(config.focus);
        if (focus.has('not')) expect(puzzle.clues.some(isNegatedClue)).toBe(true);
        if (focus.has('group')) expect(puzzle.clues.some(isGroupClue)).toBe(true);
        if (focus.has('combine')) {
          expect(solveLikeAChild(start, puzzle.clues, 'direct').isSolved).toBe(false);
        }
        if (focus.has('exclude')) {
          expect(solveLikeAChild(start, puzzle.clues, 'combine').isSolved).toBe(false);
        }
      }
    },
  );
});

describe('validateLogicGridCatalog', () => {
  // Vingt étoiles, quatre parties chacune, chaque puzzle recompté par recherche exhaustive : plusieurs
  // secondes sous l'instrumentation de la couverture, avec d'autres suites en parallèle.
  it(
    'valide le catalogue initial, par défaut comme explicitement, et un catalogue vide',
    SLOW,
    () => {
      expect(validateLogicGridCatalog()).toEqual({ valid: true, errors: [] });
      expect(validateLogicGridCatalog([])).toEqual({ valid: true, errors: [] });
    },
  );

  it('tire une partie par graine de validation, pour chaque niveau sans anomalie seulement', () => {
    vi.mocked(createLogicGridGame).mockClear();

    validateLogicGridCatalog([
      level('lg-001', 'very_easy', 10),
      level('lg-002', 'very_easy', 20, { freePieces: 1 }),
    ]);

    expect(vi.mocked(createLogicGridGame)).toHaveBeenCalledTimes(VALIDATION_SEEDS.length);
    expect(vi.mocked(createLogicGridGame).mock.calls.map(([config]) => config)).toEqual(
      VALIDATION_SEEDS.map(() => BASE_CONFIG),
    );
  });

  it('reprend les règles communes : identifiant en double, jeu et order déjà pris', () => {
    const catalog = [
      level('lg-001', 'very_easy', 10),
      level('lg-001', 'very_easy', 10),
      level('mem-001', 'easy', 10, {}, 'memory'),
    ];

    expect(validateLogicGridCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 2 « lg-001 » : identifiant en double',
        'niveau n° 2 « lg-001 » : order 10 déjà pris par « lg-001 » dans le palier « very_easy »',
        'niveau n° 3 « mem-001 » : niveau du jeu « memory » au lieu de « logic-grid »',
      ],
    });
  });

  it('signale chaque anomalie de configuration, préfixée du nom du niveau', () => {
    const catalog = [
      level('lg-001', 'very_easy', 10, { freePieces: 9 }),
      level('lg-002', 'very_easy', 20, { focus: ['not'] }),
      level('lg-003', 'very_easy', 30, { allowsGroups: true }),
    ];

    expect(validateLogicGridCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « lg-001 » : freePieces 9 invalide (entier de 3 à 8 attendu)',
        'niveau n° 2 « lg-002 » : focus « not » sans allowsNegation',
        'niveau n° 3 « lg-003 » : allowsGroups sans la sorte « line » (une famille se place dans une ligne)',
      ],
    });
  });

  it('signale un niveau dont aucun puzzle ne peut être tiré, pour chaque graine', () => {
    // Des cartes « collées » seules ne demandent jamais d'éliminer une pièce.
    const catalog = [
      level('lg-001', 'very_easy', 10, {
        clueKinds: ['pair'],
        reasoning: 'exclude',
        focus: ['exclude'],
      }),
    ];

    expect(validateLogicGridCatalog(catalog).errors).toEqual(
      VALIDATION_SEEDS.map(
        (seed) =>
          `niveau n° 1 « lg-001 » : graine ${String(seed)} : instanciation impossible : aucun puzzle trouvé en 400 essais`,
      ),
    );
  });

  it('signale un puzzle à plusieurs solutions ou à trop de cartes, quelle que soit l’erreur levée', () => {
    const failure: unknown = 'panne du tirage';
    const real = createLogicGridGame(BASE_CONFIG, createSeededRng(1));
    const [puzzle] = real.puzzles;
    const second = puzzle?.clues[1];
    if (!puzzle || !second) throw new Error('Puzzle à deux cartes attendu');
    // Sept fois la même carte : trop de cartes, et deux pièces libres d'échanger leur place.
    const broken: LogicGridPuzzle = {
      ...puzzle,
      clues: Array.from({ length: MAX_CLUES + 1 }, () => second),
    };
    vi.mocked(createLogicGridGame)
      .mockImplementationOnce(() => ({ ...real, puzzles: [broken] }))
      .mockImplementationOnce(() => {
        throw failure;
      });

    const { errors } = validateLogicGridCatalog([level('lg-001', 'very_easy', 10)]);

    expect(errors[0]).toBe('niveau n° 1 « lg-001 » : graine 1 : 7 cartes (au plus 6)');
    expect(errors[1]).toBe('niveau n° 1 « lg-001 » : graine 1 : 2 solutions au lieu d’une');
    expect(errors[2]).toBe(
      'niveau n° 1 « lg-001 » : graine 2 : instanciation impossible : panne du tirage',
    );
  });
});

describe('Progression sous gamesProgress["logic-grid"]', () => {
  const COMPLETED_AT = '2026-10-01T09:00:00.000Z';

  const progress = {
    gameId: 'logic-grid',
    levels: {
      'lg-001': {
        levelId: 'lg-001',
        completed: true,
        isPerfect: true,
        bestMoves: 9,
        bestTimeSeconds: 40,
        timesPlayed: 1,
        completedAt: COMPLETED_AT,
      },
    },
    lastPlayedLevelId: 'lg-001',
  };

  function saveWith(gamesProgress: unknown): string {
    return JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      activeProfileId: 'p1',
      profiles: [
        {
          id: 'p1',
          name: 'Mia',
          avatarId: 'fox',
          createdAt: COMPLETED_AT,
          gamesProgress,
          gameSettings: { memory: { previewFactor: 1, mismatchFactor: 1 } },
        },
      ],
      settings: DEFAULT_DEVICE_SETTINGS,
    });
  }

  it('survit à la relecture de la sauvegarde : logic-grid est un jeu connu', () => {
    const report = parseSaveStateReport(saveWith({ 'logic-grid': progress }));

    expect(report.issues).toEqual([]);
    expect(report.state.profiles[0]?.gamesProgress).toEqual({ 'logic-grid': progress });
  });

  it('débloque l’étoile suivante du catalogue', () => {
    const report = parseSaveStateReport(saveWith({ 'logic-grid': progress }));
    const profile: UserProfile | undefined = report.state.profiles[0];
    const summary = getGameProgressSummary('logic-grid', LOGIC_GRID_CATALOG, profile ?? null);

    expect(summary).toMatchObject({ earnedStars: 1, perfectCount: 1 });
    expect(summary.nextPlayableLevel?.definition.id).toBe('lg-002');
  });
});
