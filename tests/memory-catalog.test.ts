// @vitest-environment node
import {
  DIFFICULTY_TIER_IDS,
  GAME_REGISTRY,
  getGameProgressSummary,
  validateLevelCatalog,
  type BaseLevelDefinition,
} from '@/core/progression';
import { MEMORY_CATALOG, validateMemoryCatalog } from '@/games/memory/catalog';
import type * as MemoryEngine from '@/games/memory/engine';
import { createMemoryGame, getMemoryConfigErrors } from '@/games/memory/engine';
import { getMemoryModeCapacity } from '@/games/memory/symbols';
import type { MemoryLevelConfig, MemoryVisualMode } from '@/games/memory/types';
import type { DifficultyTier, GameId } from '@/types/mia';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Moteur réel, `createMemoryGame` espionnée : une instanciation impossible se simule (défense en
// profondeur du validateur), une configuration sans anomalie s'instancie toujours (FEAT-09).
vi.mock('@/games/memory/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof MemoryEngine>();
  return { ...actual, createMemoryGame: vi.fn(actual.createMemoryGame) };
});

type MemoryLevel = BaseLevelDefinition<MemoryLevelConfig>;

type StarRow = [
  id: string,
  tier: DifficultyTier,
  order: number,
  cols: number,
  rows: number,
  matchSize: 2 | 3,
  visualMode: MemoryVisualMode,
  previewSeconds: number,
  maxMistakes: number | null,
  swapEveryNMistakes: number | null,
  perfectMaxMistakes: number,
];

/**
 * Le tableau des 20 étoiles de FEAT-11 §3.1, colonne par colonne. Aperçu : socle uniforme de 5 s
 * pour les huit étoiles qui en ont un (FEAT-19), 0 pour les douze autres.
 */
const SPEC_ROWS: StarRow[] = [
  ['mem-001', 'very_easy', 10, 2, 2, 2, 'distinct_color_shape', 5, null, null, 0],
  ['mem-002', 'very_easy', 20, 3, 2, 2, 'distinct_color_shape', 5, null, null, 1],
  ['mem-003', 'very_easy', 30, 3, 2, 2, 'distinct_color_shape', 0, null, null, 2],
  ['mem-004', 'very_easy', 40, 4, 2, 2, 'distinct_color_shape', 5, null, null, 2],
  ['mem-005', 'easy', 10, 4, 2, 2, 'thematic_palette', 0, null, null, 3],
  ['mem-006', 'easy', 20, 5, 2, 2, 'distinct_color_shape', 5, null, null, 3],
  ['mem-007', 'easy', 30, 5, 2, 2, 'thematic_palette', 0, null, null, 4],
  ['mem-008', 'easy', 40, 4, 3, 2, 'thematic_palette', 0, null, null, 4],
  ['mem-009', 'medium', 10, 4, 3, 2, 'monochrome', 5, 10, null, 4],
  ['mem-010', 'medium', 20, 4, 4, 2, 'thematic_palette', 5, 12, null, 5],
  ['mem-011', 'medium', 30, 4, 4, 2, 'monochrome', 0, 12, null, 6],
  ['mem-012', 'medium', 40, 5, 4, 2, 'thematic_palette', 0, 14, null, 7],
  ['mem-013', 'hard', 10, 5, 4, 2, 'monochrome', 0, 12, null, 6],
  ['mem-014', 'hard', 20, 6, 4, 2, 'thematic_palette', 0, 15, null, 8],
  ['mem-015', 'hard', 30, 5, 3, 3, 'distinct_color_shape', 5, 10, null, 4],
  ['mem-016', 'hard', 40, 6, 4, 2, 'abstract_orientation', 0, 14, null, 8],
  ['mem-017', 'very_hard', 10, 6, 5, 2, 'monochrome', 0, 18, null, 10],
  ['mem-018', 'very_hard', 20, 6, 4, 3, 'thematic_palette', 5, 14, null, 6],
  ['mem-019', 'very_hard', 30, 5, 4, 2, 'monochrome', 0, 12, 4, 6],
  ['mem-020', 'very_hard', 40, 6, 6, 2, 'abstract_orientation', 0, 20, 5, 10],
];

function toRow(level: MemoryLevel): StarRow {
  const { cols, rows, matchSize, visualMode, previewSeconds } = level.config;
  const { maxMistakes, swapEveryNMistakes, perfectMaxMistakes } = level.config;
  return [
    level.id,
    level.tier,
    level.order,
    cols,
    rows,
    matchSize,
    visualMode,
    previewSeconds,
    maxMistakes,
    swapEveryNMistakes,
    perfectMaxMistakes,
  ];
}

/** 2 × 2 en paires, sans aperçu ni limite : la plus petite configuration valide. */
const BASE_CONFIG: MemoryLevelConfig = {
  cols: 2,
  rows: 2,
  matchSize: 2,
  visualMode: 'distinct_color_shape',
  previewSeconds: 0,
  maxMistakes: null,
  swapEveryNMistakes: null,
  perfectMaxMistakes: 0,
};

const UNKNOWN_MODE = 'rainbow' as string as MemoryVisualMode;

function level(
  id: string,
  tier: DifficultyTier,
  order: number,
  config: Partial<MemoryLevelConfig> = {},
  gameId: GameId = 'memory',
): MemoryLevel {
  return { id, gameId, tier, order, config: { ...BASE_CONFIG, ...config } };
}

function groupsOf({ cols, rows, matchSize }: MemoryLevelConfig): number {
  return (cols * rows) / matchSize;
}

afterEach(() => {
  vi.mocked(createMemoryGame).mockReset();
});

describe('MEMORY_CATALOG', () => {
  it('publie exactement les 20 étoiles de FEAT-11 §3.1, dans l’ordre de la carte', () => {
    expect(MEMORY_CATALOG.map(toRow)).toEqual(SPEC_ROWS);
    expect(MEMORY_CATALOG.map((entry) => entry.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `mem-${String(index + 1).padStart(3, '0')}`),
    );
    expect(MEMORY_CATALOG.every((entry) => entry.gameId === 'memory')).toBe(true);
  });

  it('donne un aperçu uniforme de 5 s à huit étoiles, aucun aux douze autres (FEAT-19)', () => {
    const idsWithPreview = (seconds: number) =>
      MEMORY_CATALOG.filter((entry) => entry.config.previewSeconds === seconds).map(
        (entry) => entry.id,
      );

    // Socle unique : la durée jouée est ce socle multiplié par le facteur du profil, jamais une
    // valeur propre à l'étoile ; une étoile sans aperçu n'en gagne jamais.
    expect(idsWithPreview(5)).toEqual([
      'mem-001',
      'mem-002',
      'mem-004',
      'mem-006',
      'mem-009',
      'mem-010',
      'mem-015',
      'mem-018',
    ]);
    expect(idsWithPreview(0)).toHaveLength(12);
    expect(new Set(MEMORY_CATALOG.map((entry) => entry.config.previewSeconds))).toEqual(
      new Set([0, 5]),
    );
  });

  it('donne à chaque étoile un titre court, unique, jamais affiché', () => {
    const titles = MEMORY_CATALOG.map((entry) => entry.title);

    expect(titles.every((title) => typeof title === 'string' && title.trim() !== '')).toBe(true);
    expect(new Set(titles).size).toBe(20);
  });

  it('remplit les 5 paliers de 4 étoiles chacun, numérotées de 1 à 20', () => {
    const summary = getGameProgressSummary('memory', MEMORY_CATALOG, null);

    expect(summary.totalStars).toBe(20);
    expect(summary.tiers.map((tier) => [tier.tier, tier.totalStars])).toEqual(
      DIFFICULTY_TIER_IDS.map((tier) => [tier, 4]),
    );
    expect(DIFFICULTY_TIER_IDS).toEqual(['very_easy', 'easy', 'medium', 'hard', 'very_hard']);
    // Déclaré dans l'ordre de la carte : les numéros d'étoile suivent les identifiants.
    expect(summary.allLevels.map((entry) => entry.definition)).toEqual([...MEMORY_CATALOG]);
    expect(summary.allLevels.map((entry) => entry.starNumber)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(summary.tiers.map((tier) => tier.levels.map((entry) => entry.definition.order))).toEqual(
      Array.from({ length: 5 }, () => [10, 20, 30, 40]),
    );
  });

  it('commence par l’Étoile #1, seule débloquée sans progression', () => {
    const summary = getGameProgressSummary('memory', MEMORY_CATALOG, null);

    expect(summary.nextPlayableLevel?.definition.id).toBe('mem-001');
    expect(
      summary.allLevels.filter((entry) => entry.isUnlocked).map((entry) => entry.definition.id),
    ).toEqual(['mem-001']);
    expect(summary).toMatchObject({ earnedStars: 0, perfectCount: 0 });
  });

  it('est branché sur le registre des jeux (Hub, Carte des Étoiles, page /memory)', () => {
    expect(GAME_REGISTRY.memory.catalog).toBe(MEMORY_CATALOG);
    expect(validateLevelCatalog('memory', GAME_REGISTRY.memory.catalog)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it.each(MEMORY_CATALOG)(
    '$id : grille divisible, dans la capacité du mode, instanciable',
    (entry) => {
      const { config } = entry;
      const groups = groupsOf(config);

      expect(getMemoryConfigErrors(config)).toEqual([]);
      expect(Number.isInteger(groups)).toBe(true);
      expect(groups).toBeGreaterThanOrEqual(2);
      expect(groups).toBeLessThanOrEqual(getMemoryModeCapacity(config.visualMode));

      const game = createMemoryGame(config);
      expect(game.cards).toHaveLength(config.cols * config.rows);
      expect(game.totalGroups).toBe(groups);
      expect(game.phase).toBe(config.previewSeconds > 0 ? 'preview' : 'playing');
    },
  );

  it('ne tourne jamais une grille carrée et garde les autres plus larges que hautes', () => {
    // Contrat FEAT-10 : une grille large tourne d'elle-même en portrait ; aucune grille haute.
    for (const { config } of MEMORY_CATALOG)
      expect(config.cols).toBeGreaterThanOrEqual(config.rows);
  });
});

describe('validateMemoryCatalog', () => {
  it('valide le catalogue initial, par défaut comme explicitement, et un catalogue vide', () => {
    expect(validateMemoryCatalog()).toEqual({ valid: true, errors: [] });
    expect(validateMemoryCatalog(MEMORY_CATALOG)).toEqual({ valid: true, errors: [] });
    expect(validateMemoryCatalog([])).toEqual({ valid: true, errors: [] });
  });

  it('instancie chaque niveau sans anomalie, et seulement ceux-là', () => {
    vi.mocked(createMemoryGame).mockClear();

    validateMemoryCatalog([
      level('mem-001', 'very_easy', 10),
      level('mem-002', 'very_easy', 20, { cols: 0 }),
      level('mem-003', 'very_easy', 30, { previewSeconds: 2 }),
    ]);

    expect(vi.mocked(createMemoryGame).mock.calls.map(([config]) => config)).toEqual([
      BASE_CONFIG,
      { ...BASE_CONFIG, previewSeconds: 2 },
    ]);
  });

  it('reprend les règles communes : identifiant en double, jeu et order déjà pris', () => {
    const catalog = [
      level('mem-001', 'very_easy', 10),
      level('mem-001', 'very_easy', 10),
      level('tj-001', 'easy', 10, {}, 'traffic-jam'),
    ];

    expect(validateMemoryCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 2 « mem-001 » : identifiant en double',
        'niveau n° 2 « mem-001 » : order 10 déjà pris par « mem-001 » dans le palier « very_easy »',
        'niveau n° 3 « tj-001 » : niveau du jeu « traffic-jam » au lieu de « memory »',
      ],
    });
  });

  it('signale chaque anomalie de configuration, préfixée du nom du niveau', () => {
    const catalog = [
      level('mem-001', 'very_easy', 10, { cols: 3, rows: 3 }),
      level('mem-002', 'very_easy', 20, { cols: 11, rows: 2 }),
      level('mem-003', 'very_easy', 30, { cols: 2, rows: 1 }),
      level('mem-004', 'very_easy', 40, {
        maxMistakes: 2,
        perfectMaxMistakes: 3,
        swapEveryNMistakes: 5,
      }),
      level('mem-005', 'easy', 10, { visualMode: UNKNOWN_MODE }),
      level('mem-006', 'easy', 20, { cols: 4, rows: 3, matchSize: 3, previewSeconds: -1 }),
    ];

    expect(validateMemoryCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « mem-001 » : grille 3 × 3 non divisible en groupes de 2 cartes',
        'niveau n° 2 « mem-002 » : grille 11 × 2 : 11 groupes, le mode « distinct_color_shape » en accepte 10 au plus',
        'niveau n° 3 « mem-003 » : grille 2 × 1 trop petite (au moins 2 groupes de 2 cartes)',
        'niveau n° 4 « mem-004 » : perfectMaxMistakes 3 supérieur à maxMistakes 2 : chaque victoire serait couronnée',
        'niveau n° 4 « mem-004 » : swapEveryNMistakes 5 supérieur à maxMistakes 2 : aucune permutation avant la défaite',
        'niveau n° 5 « mem-005 » : visualMode « rainbow » inconnu',
        'niveau n° 6 « mem-006 » : previewSeconds -1 invalide (nombre fini ≥ 0 attendu)',
      ],
    });
  });

  it('liste les règles communes avant les règles de chaque niveau', () => {
    const catalog = [level('MEM-1', 'very_easy', 10, { cols: 0 })];

    expect(validateMemoryCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « MEM-1 » : identifiant invalide (minuscules, chiffres et tirets, ex: « mem-001 »)',
        'niveau n° 1 « MEM-1 » : cols 0 invalide (entier ≥ 1 attendu)',
      ],
    });
  });

  it('signale un niveau que le moteur ne sait pas instancier, quelle que soit l’erreur levée', () => {
    const failure: unknown = 'panne du tirage';
    vi.mocked(createMemoryGame)
      .mockImplementationOnce(() => {
        throw new RangeError('40 groupes demandés : le mode « monochrome » en accepte de 0 à 36');
      })
      .mockImplementationOnce(() => {
        throw failure;
      });
    const catalog = [level('mem-001', 'very_easy', 10), level('mem-002', 'very_easy', 20)];

    expect(validateMemoryCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « mem-001 » : instanciation impossible : 40 groupes demandés : le mode « monochrome » en accepte de 0 à 36',
        'niveau n° 2 « mem-002 » : instanciation impossible : panne du tirage',
      ],
    });
  });
});
