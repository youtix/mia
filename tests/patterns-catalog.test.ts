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
  PATTERNS_CATALOG,
  validatePatternsCatalog,
  type PatternsLevel,
} from '@/games/patterns/catalog';
import type * as PatternsEngine from '@/games/patterns/engine';
import { CHOICE_COUNT, createPatternsGame, getPatternsConfigErrors } from '@/games/patterns/engine';
import type {
  PatternAnswerMode,
  PatternColorMode,
  PatternFamily,
  PatternLevelConfig,
  PatternRule,
  PatternSoundPairing,
} from '@/games/patterns/types';
import type { DifficultyTier, GameId, UserProfile } from '@/types/mia';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Moteur réel, `createPatternsGame` espionnée : une instanciation impossible se simule (défense en
// profondeur du validateur), une configuration sans anomalie s'instancie toujours (FEAT-21).
vi.mock('@/games/patterns/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof PatternsEngine>();
  return { ...actual, createPatternsGame: vi.fn(actual.createPatternsGame) };
});

type StarRow = [
  id: string,
  tier: DifficultyTier,
  order: number,
  rule: PatternRule,
  family: PatternFamily,
  colorMode: PatternColorMode,
  visibleItems: number,
  answerMode: PatternAnswerMode,
  soundPairing: PatternSoundPairing | null,
  stopRounds: number,
  stopSeconds: number,
  hasGuide: boolean,
];

/** Le tableau des 20 étoiles de FEAT-21 §3.3, colonne par colonne. */
const SPEC_ROWS: StarRow[] = [
  ['pat-001', 'very_easy', 10, 'ab', 'animals', 'distinct', 4, 'visual', null, 0, 2, true],
  ['pat-002', 'very_easy', 20, 'ab', 'animals', 'distinct', 4, 'visual', null, 1, 2, false],
  ['pat-003', 'very_easy', 30, 'ab', 'animals', 'distinct', 5, 'visual', null, 1, 2, false],
  ['pat-004', 'very_easy', 40, 'ab', 'animals', 'same', 4, 'visual', null, 1, 2, false],
  ['pat-005', 'easy', 10, 'ab', 'shapes', 'distinct', 4, 'visual', null, 1, 2, false],
  ['pat-006', 'easy', 20, 'ab', 'shapes', 'distinct', 5, 'visual', null, 1, 2, false],
  ['pat-007', 'easy', 30, 'ab', 'shapes', 'same', 4, 'visual', null, 2, 2, false],
  ['pat-008', 'easy', 40, 'ab', 'shapes', 'same', 5, 'visual', null, 2, 2, false],
  ['pat-009', 'medium', 10, 'abb', 'animals', 'distinct', 6, 'visual', null, 1, 3, false],
  ['pat-010', 'medium', 20, 'abb', 'animals', 'distinct', 5, 'visual', null, 2, 3, false],
  ['pat-011', 'medium', 30, 'abb', 'shapes', 'distinct', 5, 'visual', null, 2, 3, false],
  ['pat-012', 'medium', 40, 'abb', 'shapes', 'same', 5, 'visual', null, 2, 3, false],
  ['pat-013', 'hard', 10, 'ab', 'shapes', 'distinct', 4, 'sound', 'fixed', 0, 3, true],
  ['pat-014', 'hard', 20, 'ab', 'animals', 'distinct', 4, 'sound', 'fixed', 1, 3, false],
  ['pat-015', 'hard', 30, 'ab', 'shapes', 'distinct', 4, 'sound', 'varied', 1, 3, false],
  ['pat-016', 'hard', 40, 'ab', 'animals', 'same', 4, 'sound', 'varied', 2, 3, false],
  ['pat-017', 'very_hard', 10, 'abb', 'shapes', 'distinct', 3, 'sound', 'varied', 1, 3, false],
  ['pat-018', 'very_hard', 20, 'abb', 'animals', 'same', 3, 'sound', 'varied', 2, 3, false],
  ['pat-019', 'very_hard', 30, 'abb', 'shapes', 'distinct', 6, 'sound', 'varied', 2, 3, false],
  ['pat-020', 'very_hard', 40, 'abb', 'shapes', 'same', 6, 'sound', 'varied', 3, 3, false],
];

function toRow(entry: PatternsLevel): StarRow {
  const { rule, family, colorMode, visibleItems, answerMode } = entry.config;
  const { soundPairing, stopRounds, stopSeconds, hasGuide } = entry.config;
  return [
    entry.id,
    entry.tier,
    entry.order,
    rule,
    family,
    colorMode,
    visibleItems,
    answerMode,
    soundPairing,
    stopRounds,
    stopSeconds,
    hasGuide,
  ];
}

/** A-B en pièces, 4 éléments, sans STOP : une configuration valide. */
const BASE_CONFIG: PatternLevelConfig = {
  rule: 'ab',
  family: 'animals',
  colorMode: 'distinct',
  visibleItems: 4,
  answerMode: 'visual',
  soundPairing: null,
  rounds: 5,
  stopRounds: 0,
  stopSeconds: 2,
  hasGuide: false,
};

const UNKNOWN_FAMILY = 'plants' as string as PatternFamily;

function level(
  id: string,
  tier: DifficultyTier,
  order: number,
  config: Partial<PatternLevelConfig> = {},
  gameId: GameId = 'patterns',
): PatternsLevel {
  return { id, gameId, tier, order, config: { ...BASE_CONFIG, ...config } };
}

const levelsOf = (tier: DifficultyTier): PatternsLevel[] =>
  PATTERNS_CATALOG.filter((entry) => entry.tier === tier);

const idsWhere = (predicate: (config: PatternLevelConfig) => boolean): string[] =>
  PATTERNS_CATALOG.filter((entry) => predicate(entry.config)).map((entry) => entry.id);

afterEach(() => {
  vi.mocked(createPatternsGame).mockReset();
});

describe('PATTERNS_CATALOG', () => {
  it('publie exactement les 20 étoiles de FEAT-21 §3.3, dans l’ordre de la carte', () => {
    expect(PATTERNS_CATALOG.map(toRow)).toEqual(SPEC_ROWS);
    expect(PATTERNS_CATALOG.map((entry) => entry.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `pat-${String(index + 1).padStart(3, '0')}`),
    );
    expect(PATTERNS_CATALOG.every((entry) => entry.gameId === 'patterns')).toBe(true);
  });

  it('enchaîne 5 défis à chaque étoile', () => {
    expect(PATTERNS_CATALOG.map((entry) => entry.config.rounds)).toEqual(
      Array.from({ length: 20 }, () => 5),
    );
  });

  it('donne à chaque étoile un titre court, unique, jamais affiché', () => {
    const titles = PATTERNS_CATALOG.map((entry) => entry.title);

    expect(titles.every((title) => typeof title === 'string' && title.trim() !== '')).toBe(true);
    expect(new Set(titles).size).toBe(20);
  });

  it('remplit les 5 paliers de 4 étoiles chacun, numérotées de 1 à 20', () => {
    const summary = getGameProgressSummary('patterns', PATTERNS_CATALOG, null);

    expect(summary.totalStars).toBe(20);
    expect(summary.tiers.map((tier) => [tier.tier, tier.totalStars])).toEqual(
      DIFFICULTY_TIER_IDS.map((tier) => [tier, 4]),
    );
    // Déclaré dans l'ordre de la carte : les numéros d'étoile suivent les identifiants.
    expect(summary.allLevels.map((entry) => entry.definition)).toEqual([...PATTERNS_CATALOG]);
    expect(summary.allLevels.map((entry) => entry.starNumber)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(summary.tiers.map((tier) => tier.levels.map((entry) => entry.definition.order))).toEqual(
      Array.from({ length: 5 }, () => [10, 20, 30, 40]),
    );
  });

  it('commence par l’Étoile #1, seule débloquée sans progression', () => {
    const summary = getGameProgressSummary('patterns', PATTERNS_CATALOG, null);

    expect(summary.nextPlayableLevel?.definition.id).toBe('pat-001');
    expect(
      summary.allLevels.filter((entry) => entry.isUnlocked).map((entry) => entry.definition.id),
    ).toEqual(['pat-001']);
    expect(summary).toMatchObject({ earnedStars: 0, perfectCount: 0 });
  });

  it('est branché sur le registre des jeux (Hub, Carte des Étoiles, page /patterns)', () => {
    expect(GAME_REGISTRY.patterns.catalog).toBe(PATTERNS_CATALOG);
    expect(validateLevelCatalog('patterns', GAME_REGISTRY.patterns.catalog)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it.each<[DifficultyTier, PatternRule, PatternAnswerMode, PatternFamily[]]>([
    ['very_easy', 'ab', 'visual', ['animals']],
    ['easy', 'ab', 'visual', ['shapes']],
    ['medium', 'abb', 'visual', ['animals', 'shapes']],
    ['hard', 'ab', 'sound', ['animals', 'shapes']],
    ['very_hard', 'abb', 'sound', ['animals', 'shapes']],
  ])('monte par paliers : %s, règle %s, réponses %s', (tier, rule, answerMode, families) => {
    const levels = levelsOf(tier);

    expect(levels).toHaveLength(4);
    for (const { config } of levels) expect(config).toMatchObject({ rule, answerMode });
    expect(new Set(levels.map(({ config }) => config.family))).toEqual(new Set(families));
  });

  it('garde chaque élément avec son son aux 2 premières étoiles de Difficile seulement', () => {
    const soundLevels = PATTERNS_CATALOG.filter((entry) => entry.config.answerMode === 'sound');

    expect(soundLevels.map((entry) => [entry.id, entry.config.soundPairing])).toEqual([
      ['pat-013', 'fixed'],
      ['pat-014', 'fixed'],
      ['pat-015', 'varied'],
      ['pat-016', 'varied'],
      ['pat-017', 'varied'],
      ['pat-018', 'varied'],
      ['pat-019', 'varied'],
      ['pat-020', 'varied'],
    ]);
  });

  it('n’associe aucun son aux étoiles en pièces', () => {
    const visualLevels = PATTERNS_CATALOG.filter((entry) => entry.config.answerMode === 'visual');

    expect(visualLevels).toHaveLength(12);
    for (const { config } of visualLevels) expect(config.soundPairing).toBeNull();
  });

  it('guide le geste à pat-001 et les deux appuis à pat-013, sans STOP, et nulle part ailleurs', () => {
    expect(idsWhere((config) => config.hasGuide)).toEqual(['pat-001', 'pat-013']);
    expect(idsWhere((config) => config.stopRounds === 0)).toEqual(['pat-001', 'pat-013']);
  });

  it('allonge le STOP à 3 s à partir de Moyen', () => {
    expect(new Set(levelsOf('very_easy').map(({ config }) => config.stopSeconds))).toEqual(
      new Set([2]),
    );
    expect(new Set(levelsOf('easy').map(({ config }) => config.stopSeconds))).toEqual(new Set([2]));
    for (const tier of ['medium', 'hard', 'very_hard'] as const) {
      expect(new Set(levelsOf(tier).map(({ config }) => config.stopSeconds))).toEqual(new Set([3]));
    }
  });

  it.each(PATTERNS_CATALOG)('$id : configuration sans anomalie, instanciable', (entry) => {
    const { config } = entry;

    expect(getPatternsConfigErrors(config)).toEqual([]);

    const game = createPatternsGame(config);
    expect(game.rounds).toHaveLength(config.rounds);
    expect(game.phase).toBe('intro');
    for (const round of game.rounds) expect(round.choices).toHaveLength(CHOICE_COUNT);
  });
});

describe('validatePatternsCatalog', () => {
  it('valide le catalogue initial, par défaut comme explicitement, et un catalogue vide', () => {
    expect(validatePatternsCatalog()).toEqual({ valid: true, errors: [] });
    expect(validatePatternsCatalog(PATTERNS_CATALOG)).toEqual({ valid: true, errors: [] });
    expect(validatePatternsCatalog([])).toEqual({ valid: true, errors: [] });
  });

  it('instancie chaque niveau sans anomalie, et seulement ceux-là', () => {
    vi.mocked(createPatternsGame).mockClear();

    validatePatternsCatalog([
      level('pat-001', 'very_easy', 10),
      level('pat-002', 'very_easy', 20, { rounds: 0 }),
      level('pat-003', 'very_easy', 30, { stopRounds: 2 }),
    ]);

    expect(vi.mocked(createPatternsGame).mock.calls.map(([config]) => config)).toEqual([
      BASE_CONFIG,
      { ...BASE_CONFIG, stopRounds: 2 },
    ]);
  });

  it('reprend les règles communes : identifiant en double, jeu et order déjà pris', () => {
    const catalog = [
      level('pat-001', 'very_easy', 10),
      level('pat-001', 'very_easy', 10),
      level('mem-001', 'easy', 10, {}, 'memory'),
    ];

    expect(validatePatternsCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 2 « pat-001 » : identifiant en double',
        'niveau n° 2 « pat-001 » : order 10 déjà pris par « pat-001 » dans le palier « very_easy »',
        'niveau n° 3 « mem-001 » : niveau du jeu « memory » au lieu de « patterns »',
      ],
    });
  });

  it('signale chaque anomalie de configuration, préfixée du nom du niveau', () => {
    const catalog = [
      level('pat-001', 'very_easy', 10, { visibleItems: 3 }),
      level('pat-002', 'very_easy', 20, { rule: 'abb', visibleItems: 4 }),
      level('pat-003', 'very_easy', 30, { answerMode: 'sound', soundPairing: null }),
      level('pat-004', 'very_easy', 40, { soundPairing: 'fixed' }),
      level('pat-005', 'easy', 10, {
        answerMode: 'sound',
        soundPairing: 'varied',
        visibleItems: 5,
      }),
      level('pat-006', 'easy', 20, { rounds: 0 }),
      level('pat-007', 'easy', 30, { rounds: 2, stopRounds: 3 }),
      level('pat-008', 'easy', 40, { stopSeconds: 0 }),
      level('pat-009', 'medium', 10, { family: UNKNOWN_FAMILY, stopRounds: -1 }),
    ];

    expect(validatePatternsCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « pat-001 » : visibleItems 3 invalide pour la règle « ab » en pièces (entier de 4 à 6 attendu)',
        'niveau n° 2 « pat-002 » : visibleItems 4 invalide pour la règle « abb » en pièces (entier de 5 à 6 attendu)',
        'niveau n° 3 « pat-003 » : soundPairing invalide (fixed ou varied attendu pour des réponses en sons)',
        'niveau n° 4 « pat-004 » : soundPairing invalide (null attendu pour des réponses en pièces)',
        'niveau n° 5 « pat-005 » : visibleItems 5 invalide pour la règle « ab » en sons (4 attendu)',
        'niveau n° 6 « pat-006 » : rounds 0 invalide (entier ≥ 1 attendu)',
        'niveau n° 7 « pat-007 » : stopRounds 3 supérieur à rounds 2',
        'niveau n° 8 « pat-008 » : stopSeconds 0 invalide (nombre fini > 0 attendu)',
        'niveau n° 9 « pat-009 » : family « plants » inconnue',
        'niveau n° 9 « pat-009 » : stopRounds -1 invalide (entier ≥ 0 attendu)',
      ],
    });
  });

  it('liste les règles communes avant les règles de chaque niveau', () => {
    const catalog = [level('PAT-1', 'very_easy', 10, { rounds: 0 })];

    expect(validatePatternsCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « PAT-1 » : identifiant invalide (minuscules, chiffres et tirets, ex: « mem-001 »)',
        'niveau n° 1 « PAT-1 » : rounds 0 invalide (entier ≥ 1 attendu)',
      ],
    });
  });

  it('signale un niveau que le moteur ne sait pas instancier, quelle que soit l’erreur levée', () => {
    const failure: unknown = 'panne du tirage';
    vi.mocked(createPatternsGame)
      .mockImplementationOnce(() => {
        throw new RangeError('banque d’éléments vide');
      })
      .mockImplementationOnce(() => {
        throw failure;
      });
    const catalog = [level('pat-001', 'very_easy', 10), level('pat-002', 'very_easy', 20)];

    expect(validatePatternsCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « pat-001 » : instanciation impossible : banque d’éléments vide',
        'niveau n° 2 « pat-002 » : instanciation impossible : panne du tirage',
      ],
    });
  });
});

describe('Progression sous gamesProgress.patterns', () => {
  const COMPLETED_AT = '2026-10-01T09:00:00.000Z';

  const progress = {
    gameId: 'patterns',
    levels: {
      'pat-001': {
        levelId: 'pat-001',
        completed: true,
        isPerfect: true,
        bestMoves: 5,
        bestTimeSeconds: 40,
        timesPlayed: 1,
        completedAt: COMPLETED_AT,
      },
    },
    lastPlayedLevelId: 'pat-001',
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

  it('survit à la relecture de la sauvegarde : patterns est un jeu connu (FEAT-21 §4)', () => {
    const report = parseSaveStateReport(saveWith({ patterns: progress }));

    expect(report.issues).toEqual([]);
    expect(report.state.profiles[0]?.gamesProgress).toEqual({ patterns: progress });
  });

  it('continue d’écarter un jeu réellement inconnu', () => {
    const report = parseSaveStateReport(saveWith({ patterns: progress, chess: progress }));

    expect(report.issues).toContain('jeu inconnu « p1/chess », écarté');
    expect(report.state.profiles[0]?.gamesProgress).toEqual({ patterns: progress });
  });

  it('débloque l’étoile suivante du catalogue', () => {
    const report = parseSaveStateReport(saveWith({ patterns: progress }));
    const profile: UserProfile | undefined = report.state.profiles[0];
    const summary = getGameProgressSummary('patterns', PATTERNS_CATALOG, profile ?? null);

    expect(summary).toMatchObject({ earnedStars: 1, perfectCount: 1 });
    expect(summary.nextPlayableLevel?.definition.id).toBe('pat-002');
  });
});
