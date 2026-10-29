import {
  DIFFICULTY_TIER_IDS,
  GAME_REGISTRY,
  GAMES,
  getGameProgressSummary,
  getProfileProgressSummary,
  isLevelUnlockedAtIndex,
  LEVEL_ID_PATTERN,
  recordLevelVictory,
  sortLevels,
  validateLevelCatalog,
  type BaseLevelDefinition,
  type EnrichedLevelItem,
  type GameManifest,
  type GameProgressSummary,
  type LevelVictoryParams,
} from '@/core/progression';
import { countProfileStars, createDefaultSaveState, parseSaveStateReport } from '@/core/storage';
import type {
  DifficultyTier,
  GameId,
  GameProgress,
  LevelCompletion,
  MiaSaveState,
  UserProfile,
} from '@/types/mia';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const NOW = new Date('2026-10-28T09:00:00.000Z');
const EARLIER = '2026-10-01T09:00:00.000Z';
const TIERS: DifficultyTier[] = ['very_easy', 'easy', 'medium', 'hard', 'very_hard'];

interface DemoConfig {
  cards: number;
}

function def(
  id: string,
  tier: DifficultyTier,
  order: number,
  gameId: GameId = 'memory',
): BaseLevelDefinition<DemoConfig> {
  return { id, gameId, tier, order, config: { cards: 4 } };
}

function memId(rank: number): string {
  return `mem-${String(rank).padStart(3, '0')}`;
}

/** `mem-001` à `mem-020` : 4 niveaux par palier (order 10 à 40), comme les catalogues initiaux. */
const CATALOG = TIERS.flatMap((tier, tierIndex) =>
  [10, 20, 30, 40].map((order, index) => def(memId(tierIndex * 4 + index + 1), tier, order)),
);

function won(levelId: string, overrides: Partial<LevelCompletion> = {}): LevelCompletion {
  return {
    levelId,
    completed: true,
    isPerfect: false,
    bestMoves: 12,
    bestTimeSeconds: 30,
    timesPlayed: 1,
    completedAt: EARLIER,
    ...overrides,
  };
}

/** Réussite des `count` premiers niveaux de `CATALOG`. */
function wonFirst(count: number): LevelCompletion[] {
  return Array.from({ length: count }, (_, index) => won(memId(index + 1)));
}

function progressOf(gameId: GameId, levels: LevelCompletion[]): GameProgress {
  return {
    gameId,
    levels: Object.fromEntries(levels.map((level) => [level.levelId, level])),
    lastPlayedLevelId: levels.at(-1)?.levelId ?? null,
  };
}

/** Profil « p1 » ayant réussi les niveaux `memory` donnés. */
function player(memory: LevelCompletion[] = [], overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'p1',
    name: 'Mia',
    avatarId: 'fox',
    createdAt: EARLIER,
    gamesProgress: memory.length > 0 ? { memory: progressOf('memory', memory) } : {},
    gameSettings: { memory: { previewFactor: 1, mismatchFactor: 1 } },
    ...overrides,
  };
}

function saveWith(
  profiles: UserProfile[],
  activeProfileId: string | null = profiles[0]?.id ?? null,
): MiaSaveState {
  return { ...createDefaultSaveState(), activeProfileId, profiles };
}

function ids<T>(levels: readonly EnrichedLevelItem<T>[]): string[] {
  return levels.map((level) => level.definition.id);
}

function levelOf<T>(summary: GameProgressSummary<T>, id: string): EnrichedLevelItem<T> {
  const level = summary.allLevels.find((item) => item.definition.id === id);
  if (!level) throw new Error(`niveau « ${id} » absent du résumé`);
  return level;
}

function tierCounts<T>(summary: GameProgressSummary<T>) {
  return summary.tiers.map((tier) => [
    tier.tier,
    tier.earnedStars,
    tier.totalStars,
    tier.perfectCount,
  ]);
}

/** Gel profond : en mode strict, toute mutation de la valeur reçue lèverait une `TypeError`. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Tri du catalogue', () => {
  it('range les 5 paliers du plus facile au plus difficile', () => {
    expect(DIFFICULTY_TIER_IDS).toEqual(TIERS);
  });

  it('trie par palier, puis par order, sans modifier le catalogue reçu', () => {
    const shuffled = deepFreeze([
      def('mem-020', 'very_hard', 40),
      def('mem-005', 'easy', 10),
      def('mem-002', 'very_easy', 20),
      def('mem-013', 'hard', 10),
      def('mem-009', 'medium', 10),
      def('mem-001', 'very_easy', 10),
    ]);

    const sorted = sortLevels(shuffled);

    expect(sorted.map((level) => level.id)).toEqual([
      'mem-001',
      'mem-002',
      'mem-005',
      'mem-009',
      'mem-013',
      'mem-020',
    ]);
    expect(sorted).not.toBe(shuffled);
    expect(shuffled[0]?.id).toBe('mem-020');
  });

  it('intercale un niveau d’order 15 entre les order 10 et 20', () => {
    const sorted = sortLevels([...CATALOG, def('mem-021', 'very_easy', 15)]);

    expect(sorted.slice(0, 4).map((level) => level.id)).toEqual([
      'mem-001',
      'mem-021',
      'mem-002',
      'mem-003',
    ]);
  });

  it('départage les order égaux par identifiant, quel que soit l’ordre reçu', () => {
    // Le doublon de « tj-b » (refusé par validateLevelCatalog) reste groupé.
    const tied = [
      def('tj-b', 'easy', 10),
      def('tj-a9', 'easy', 10),
      def('tj-b', 'easy', 10),
      def('tj-a10', 'easy', 10),
    ];
    const expected = ['tj-a10', 'tj-a9', 'tj-b', 'tj-b'];

    expect(sortLevels(tied).map((level) => level.id)).toEqual(expected);
    expect(sortLevels(tied.toReversed()).map((level) => level.id)).toEqual(expected);
  });
});

describe('isLevelUnlockedAtIndex', () => {
  const sorted = sortLevels(CATALOG);

  it('débloque toujours l’Étoile #1', () => {
    expect(isLevelUnlockedAtIndex(sorted, 0, {}, 0)).toBe(true);
  });

  it('débloque un niveau dont le précédent est réussi, pas le suivant', () => {
    const completed = { 'mem-001': won('mem-001') };

    expect(isLevelUnlockedAtIndex(sorted, 1, completed, 1)).toBe(true);
    expect(isLevelUnlockedAtIndex(sorted, 2, completed, 1)).toBe(false);
  });

  it('laisse débloqué un niveau déjà réussi', () => {
    const completed = { 'mem-005': won('mem-005') };

    expect(isLevelUnlockedAtIndex(sorted, 4, completed, 1)).toBe(true);
    expect(isLevelUnlockedAtIndex(sorted, 5, completed, 1)).toBe(true);
  });

  it('débloque les niveaux de rang inférieur ou égal au nombre d’étoiles gagnées', () => {
    expect(isLevelUnlockedAtIndex(sorted, 3, {}, 3)).toBe(true);
    expect(isLevelUnlockedAtIndex(sorted, 4, {}, 3)).toBe(false);
  });

  it('ne débloque rien avec une réussite non validée', () => {
    const completed = { 'mem-001': won('mem-001', { completed: false }) };

    expect(isLevelUnlockedAtIndex(sorted, 1, completed, 0)).toBe(false);
  });

  it.each([-1, 20, 1.5])('refuse l’index %s, hors du catalogue', (index) => {
    expect(isLevelUnlockedAtIndex(sorted, index, {}, 20)).toBe(false);
  });
});

describe('getGameProgressSummary', () => {
  it('sans profil : aucune étoile, seule l’Étoile #1 est débloquée', () => {
    const summary = getGameProgressSummary('memory', CATALOG, null);

    expectTypeOf(summary).toEqualTypeOf<GameProgressSummary<DemoConfig>>();
    expect(summary).toMatchObject({
      gameId: 'memory',
      earnedStars: 0,
      totalStars: 20,
      perfectCount: 0,
    });
    expect(summary.allLevels.map((level) => [level.globalIndex, level.starNumber])).toEqual(
      Array.from({ length: 20 }, (_, index) => [index, index + 1]),
    );
    expect(ids(summary.allLevels.filter((level) => level.isUnlocked))).toEqual(['mem-001']);
    expect(summary.allLevels[0]).toMatchObject({
      isCompleted: false,
      isPerfect: false,
      completion: null,
    });
    expect(summary.nextPlayableLevel).toBe(summary.allLevels[0]);
    expect(tierCounts(summary)).toEqual(TIERS.map((tier) => [tier, 0, 4, 0]));
  });

  it('répartit les étoiles et les couronnes par palier', () => {
    const profile = player([
      ...wonFirst(6).map((level) =>
        ['mem-002', 'mem-005'].includes(level.levelId) ? { ...level, isPerfect: true } : level,
      ),
      won('mem-007', { completed: false, isPerfect: true }),
    ]);

    const summary = getGameProgressSummary('memory', CATALOG, profile);

    expect(summary).toMatchObject({ earnedStars: 6, totalStars: 20, perfectCount: 2 });
    expect(tierCounts(summary)).toEqual([
      ['very_easy', 4, 4, 1],
      ['easy', 2, 4, 1],
      ['medium', 0, 4, 0],
      ['hard', 0, 4, 0],
      ['very_hard', 0, 4, 0],
    ]);
    expect(summary.tiers[1]?.levels).toEqual(summary.allLevels.slice(4, 8));
    expect(summary.tiers[1]?.levels[0]).toBe(summary.allLevels[4]);
    expect(levelOf(summary, 'mem-002')).toMatchObject({
      isUnlocked: true,
      isCompleted: true,
      isPerfect: true,
    });
    expect(levelOf(summary, 'mem-002').completion).toBe(
      profile.gamesProgress.memory?.levels['mem-002'],
    );
    // Une entrée non réussie n'apporte ni étoile ni couronne, mais reste exposée.
    expect(levelOf(summary, 'mem-007')).toMatchObject({
      isUnlocked: true,
      isCompleted: false,
      isPerfect: false,
      completion: { completed: false },
    });
    expect(levelOf(summary, 'mem-008').isUnlocked).toBe(false);
    expect(summary.nextPlayableLevel?.definition.id).toBe('mem-007');
  });

  it('ne compte que les niveaux du catalogue de ce jeu', () => {
    const profile = player([], {
      gamesProgress: {
        memory: progressOf('memory', [
          won('mem-001'),
          won('mem-097'),
          won('mem-098'),
          won('mem-099'),
        ]),
        'traffic-jam': progressOf('traffic-jam', [won('tj-001')]),
      },
    });

    const summary = getGameProgressSummary('memory', CATALOG, profile);

    // Niveaux inconnus du catalogue (sauvegarde d'une version plus récente) : ni étoile, ni déblocage.
    expect(summary.earnedStars).toBe(1);
    expect(ids(summary.allLevels.filter((level) => level.isUnlocked))).toEqual([
      'mem-001',
      'mem-002',
    ]);
    // Le sélecteur de profil (FEAT-06) compte sans catalogue : écart limité à ce cas.
    expect(countProfileStars(profile)).toBe(5);
  });

  it('catalogue vide : 5 paliers vides et aucun niveau à jouer', () => {
    expect(getGameProgressSummary('traffic-jam', [], player(wonFirst(2)))).toEqual({
      gameId: 'traffic-jam',
      earnedStars: 0,
      totalStars: 0,
      perfectCount: 0,
      nextPlayableLevel: null,
      tiers: TIERS.map((tier) => ({
        tier,
        earnedStars: 0,
        totalStars: 0,
        perfectCount: 0,
        levels: [],
      })),
      allLevels: [],
    });
  });

  it('ne lit aucune propriété héritée de la sauvegarde', () => {
    const catalog = [def('mem-001', 'very_easy', 10), def('constructor', 'very_easy', 20)];

    const summary = getGameProgressSummary('memory', catalog, player([won('mem-001')]));

    expect(levelOf(summary, 'constructor')).toMatchObject({
      isUnlocked: true,
      isCompleted: false,
      completion: null,
    });
  });
});

describe('nextPlayableLevel', () => {
  it('reprend après le niveau réussi le plus avancé', () => {
    const profile = player([...wonFirst(3), won('mem-006')]);

    const next = getGameProgressSummary('memory', CATALOG, profile).nextPlayableLevel;

    expect(next).toMatchObject({ starNumber: 7, isUnlocked: true, isCompleted: false });
    expect(next?.definition.id).toBe('mem-007');
  });

  it('revient au premier niveau non réussi quand le dernier niveau est réussi', () => {
    const profile = player(
      wonFirst(20).filter((level) => !['mem-003', 'mem-010'].includes(level.levelId)),
    );

    const next = getGameProgressSummary('memory', CATALOG, profile).nextPlayableLevel;

    expect(next).toMatchObject({ starNumber: 3, isUnlocked: true, isCompleted: false });
  });

  it('vaut null quand tout est réussi, jusqu’à la publication d’un nouveau niveau', () => {
    const profile = player(wonFirst(20));
    const inserted = def('mem-021', 'easy', 25);
    const appended = def('mem-021', 'very_hard', 50);

    expect(getGameProgressSummary('memory', CATALOG, profile).nextPlayableLevel).toBeNull();
    expect(
      getGameProgressSummary('memory', [...CATALOG, inserted], profile).nextPlayableLevel,
    ).toMatchObject({ definition: inserted, starNumber: 7, isUnlocked: true });
    expect(
      getGameProgressSummary('memory', [...CATALOG, appended], profile).nextPlayableLevel,
    ).toMatchObject({ definition: appended, starNumber: 21, isUnlocked: true });
  });
});

describe('Extensibilité : nouveaux niveaux publiés', () => {
  it('ne bloque jamais un joueur avancé quand des niveaux sont insérés avant sa position', () => {
    const profile = player(wonFirst(12));
    const before = getGameProgressSummary('memory', CATALOG, profile);
    const update = [
      ...CATALOG,
      def('mem-021', 'very_easy', 12),
      def('mem-022', 'very_easy', 15),
      def('mem-023', 'medium', 35),
      def('mem-024', 'hard', 50),
    ];

    const after = getGameProgressSummary('memory', update, profile);

    expect(before.nextPlayableLevel).toMatchObject({ starNumber: 13 });
    expect(after).toMatchObject({ earnedStars: 12, totalStars: 24 });
    // Même niveau à jouer, numéro d'étoile recalculé.
    expect(after.nextPlayableLevel?.definition.id).toBe('mem-013');
    expect(after.nextPlayableLevel?.starNumber).toBe(16);
    expect(levelOf(after, 'mem-012')).toMatchObject({ starNumber: 15, isCompleted: true });
    // Nouveaux niveaux à conquérir (y compris deux à la suite, débloqués par les étoiles gagnées).
    expect(ids(after.allLevels.filter((level) => level.isUnlocked && !level.isCompleted))).toEqual([
      'mem-021',
      'mem-022',
      'mem-023',
      'mem-013',
    ]);
    expect(after.allLevels.filter((level) => level.isCompleted && !level.isUnlocked)).toEqual([]);
    expect(levelOf(after, 'mem-024').isUnlocked).toBe(false);
    expect(tierCounts(after)).toEqual([
      ['very_easy', 4, 6, 0],
      ['easy', 4, 4, 0],
      ['medium', 4, 5, 0],
      ['hard', 0, 5, 0],
      ['very_hard', 0, 4, 0],
    ]);
  });

  it('passe à 200 étoiles sans toucher au moteur', () => {
    const catalog = TIERS.flatMap((tier, tierIndex) =>
      Array.from({ length: 40 }, (_, index) =>
        def(memId(tierIndex * 40 + index + 1), tier, (index + 1) * 10),
      ),
    ).toReversed();

    const summary = getGameProgressSummary('memory', catalog, null);

    expect(summary.totalStars).toBe(200);
    expect(summary.allLevels.map((level) => level.starNumber)).toEqual(
      Array.from({ length: 200 }, (_, index) => index + 1),
    );
    expect(ids(summary.allLevels)).toEqual(
      Array.from({ length: 200 }, (_, index) => memId(index + 1)),
    );
    expect(summary.tiers.flatMap((tier) => tier.levels)).toEqual(summary.allLevels);
    expect(summary.tiers.map((tier) => tier.totalStars)).toEqual([40, 40, 40, 40, 40]);
  });
});

describe('recordLevelVictory', () => {
  const victory: LevelVictoryParams = {
    gameId: 'memory',
    levelId: 'mem-001',
    moves: 14,
    timeSeconds: 42.5,
    isPerfect: false,
  };

  it('enregistre une première victoire dans le profil actif, sans modifier l’état reçu', () => {
    const state = deepFreeze(saveWith([player(), player([], { id: 'p2', name: 'Léo' })], 'p1'));

    const next = recordLevelVictory(state, victory, { now: NOW });

    expect(next.profiles[0]?.gamesProgress).toEqual({
      memory: {
        gameId: 'memory',
        levels: {
          'mem-001': {
            levelId: 'mem-001',
            completed: true,
            isPerfect: false,
            bestMoves: 14,
            bestTimeSeconds: 42.5,
            timesPlayed: 1,
            completedAt: NOW.toISOString(),
          },
        },
        lastPlayedLevelId: 'mem-001',
      },
    });
    expect(next.profiles[1]).toBe(state.profiles[1]);
    expect(next.activeProfileId).toBe('p1');
    expect(next.settings).toBe(state.settings);
  });

  it('garde les meilleurs scores, la couronne et la date de la première victoire', () => {
    const state = deepFreeze(
      saveWith([
        player([
          won('mem-001', { isPerfect: true, bestMoves: 10, bestTimeSeconds: 50, timesPlayed: 2 }),
        ]),
      ]),
    );

    const next = recordLevelVictory(
      state,
      { ...victory, moves: 12, timeSeconds: 30, isPerfect: false },
      { now: NOW },
    );

    expect(next.profiles[0]?.gamesProgress.memory?.levels['mem-001']).toEqual({
      levelId: 'mem-001',
      completed: true,
      isPerfect: true,
      bestMoves: 10,
      bestTimeSeconds: 30,
      timesPlayed: 3,
      completedAt: EARLIER,
    });
  });

  it('décerne la couronne à une victoire parfaite après une victoire simple', () => {
    const state = saveWith([player([won('mem-001')])]);

    const next = recordLevelVictory(state, { ...victory, isPerfect: true }, { now: NOW });

    expect(next.profiles[0]?.gamesProgress.memory?.levels['mem-001']?.isPerfect).toBe(true);
  });

  it('met à jour le dernier niveau joué sans toucher aux autres niveaux ni aux autres jeux', () => {
    const trafficJam = progressOf('traffic-jam', [won('tj-001')]);
    const memory = progressOf('memory', [won('mem-001'), won('mem-002')]);
    const state = deepFreeze(
      saveWith(
        [
          player([], { id: 'p0', name: 'Léo' }),
          player([], { gamesProgress: { memory, 'traffic-jam': trafficJam } }),
        ],
        'p1',
      ),
    );

    const next = recordLevelVictory(state, victory, { now: NOW });

    const progress = next.profiles[1]?.gamesProgress;
    expect(progress?.memory?.lastPlayedLevelId).toBe('mem-001');
    expect(progress?.memory?.levels['mem-002']).toBe(memory.levels['mem-002']);
    expect(progress?.['traffic-jam']).toBe(trafficJam);
    expect(next.profiles[0]).toBe(state.profiles[0]);
  });

  it.each([Number.NaN, Infinity, -Infinity, -3])(
    'n’enregistre jamais %s comme meilleur score, mais toujours l’étoile',
    (invalid) => {
      const first = recordLevelVictory(
        saveWith([player()]),
        { ...victory, moves: invalid, timeSeconds: invalid, isPerfect: true },
        { now: NOW },
      );
      const again = recordLevelVictory(
        saveWith([player([won('mem-001', { bestMoves: 10, bestTimeSeconds: 50 })])]),
        { ...victory, moves: invalid, timeSeconds: invalid },
        { now: NOW },
      );

      expect(first.profiles[0]?.gamesProgress.memory?.levels['mem-001']).toMatchObject({
        completed: true,
        isPerfect: true,
        bestMoves: 0,
        bestTimeSeconds: 0,
        timesPlayed: 1,
      });
      expect(again.profiles[0]?.gamesProgress.memory?.levels['mem-001']).toMatchObject({
        completed: true,
        bestMoves: 10,
        bestTimeSeconds: 50,
        timesPlayed: 2,
      });
    },
  );

  it('traite une entrée non réussie comme une première victoire', () => {
    const unfinished = won('mem-001', {
      completed: false,
      isPerfect: true,
      bestMoves: 0,
      bestTimeSeconds: 0,
      timesPlayed: 2,
      completedAt: '',
    });

    const next = recordLevelVictory(saveWith([player([unfinished])]), victory, { now: NOW });

    expect(next.profiles[0]?.gamesProgress.memory?.levels['mem-001']).toEqual({
      levelId: 'mem-001',
      completed: true,
      isPerfect: false,
      bestMoves: 14,
      bestTimeSeconds: 42.5,
      timesPlayed: 3,
      completedAt: NOW.toISOString(),
    });
  });

  it.each<[string, MiaSaveState, LevelVictoryParams]>([
    ['sans aucun profil', createDefaultSaveState(), victory],
    ['sans profil actif', saveWith([player()], null), victory],
    ['avec un profil actif introuvable', saveWith([player()], 'disparu'), victory],
    ['avec un identifiant de niveau vide', saveWith([player()]), { ...victory, levelId: '' }],
  ])('ignore une victoire %s (état renvoyé tel quel)', (_case, state, params) => {
    expect(recordLevelVictory(state, params, { now: NOW })).toBe(state);
  });

  it('date la victoire de l’instant présent par défaut', () => {
    vi.useFakeTimers({ now: NOW });

    const next = recordLevelVictory(saveWith([player()]), victory);

    expect(next.profiles[0]?.gamesProgress.memory?.levels['mem-001']?.completedAt).toBe(
      NOW.toISOString(),
    );
  });

  it('débloque l’étoile suivante, qui devient le prochain niveau à jouer', () => {
    const next = recordLevelVictory(saveWith([player()]), victory, { now: NOW });

    const summary = getGameProgressSummary('memory', CATALOG, next.profiles[0] ?? null);

    expect(summary.earnedStars).toBe(1);
    expect(levelOf(summary, 'mem-002').isUnlocked).toBe(true);
    expect(summary.nextPlayableLevel?.definition.id).toBe('mem-002');
  });

  it('produit une progression relue sans perte au chargement (FEAT-05)', () => {
    let state = saveWith([player()]);
    state = recordLevelVictory(state, victory, { now: NOW });
    state = recordLevelVictory(
      state,
      { ...victory, moves: 9, timeSeconds: Number.NaN, isPerfect: true },
      { now: NOW },
    );
    state = recordLevelVictory(
      state,
      {
        gameId: 'traffic-jam',
        levelId: 'tj-001',
        moves: Infinity,
        timeSeconds: -5,
        isPerfect: false,
      },
      { now: NOW },
    );

    const report = parseSaveStateReport(JSON.stringify(state));

    expect(report.issues).toEqual([]);
    expect(report.state).toEqual(state);
  });
});

describe('validateLevelCatalog', () => {
  it('accepte un catalogue conforme (même order dans des paliers différents) ou vide', () => {
    expect(validateLevelCatalog('memory', CATALOG)).toEqual({ valid: true, errors: [] });
    expect(validateLevelCatalog('traffic-jam', [])).toEqual({ valid: true, errors: [] });
  });

  it('signale chaque anomalie par un message français', () => {
    const catalog = [
      def('Mem 1', 'very_easy', 10),
      def('mem-002', 'very_easy', 20),
      def('mem-002', 'easy', 10),
      def('tj-001', 'easy', 20, 'traffic-jam'),
      def('mem-004', 'legendary' as DifficultyTier, 30),
      def('mem-005', 'medium', Number.NaN),
      def('mem-006', 'medium', Infinity),
      def('mem-007', 'very_easy', 20),
    ];

    expect(validateLevelCatalog('memory', catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « Mem 1 » : identifiant invalide (minuscules, chiffres et tirets, ex: « mem-001 »)',
        'niveau n° 3 « mem-002 » : identifiant en double',
        'niveau n° 4 « tj-001 » : niveau du jeu « traffic-jam » au lieu de « memory »',
        'niveau n° 5 « mem-004 » : palier « legendary » inconnu',
        'niveau n° 6 « mem-005 » : order NaN invalide (nombre fini attendu)',
        'niveau n° 7 « mem-006 » : order Infinity invalide (nombre fini attendu)',
        'niveau n° 8 « mem-007 » : order 20 déjà pris par « mem-002 » dans le palier « very_easy »',
      ],
    });
  });

  it('n’accepte que des identifiants en minuscules, chiffres et tirets', () => {
    for (const id of ['mem-001', 'tj-012', 'memory-001b', 'level7']) {
      expect(LEVEL_ID_PATTERN.test(id)).toBe(true);
    }
    for (const id of ['', 'Mem-001', 'mem_001', 'mem--001', '-mem', 'mem-', ' mem-001', 'mem 1']) {
      expect(LEVEL_ID_PATTERN.test(id)).toBe(false);
    }
  });
});

describe('Registre des jeux', () => {
  it('déclare Memory puis Traffic Jam, chacun sous son identifiant', () => {
    expect(GAMES.map((game) => [game.id, game.title, game.skill, game.path])).toEqual([
      ['memory', 'Memory', 'Mémoire visuelle & spatiale', '/memory'],
      ['traffic-jam', 'Traffic Jam', 'Planification & Logique séquentielle', '/traffic-jam'],
    ]);
    for (const [key, game] of Object.entries(GAME_REGISTRY)) expect(game.id).toBe(key);
  });

  it.each(GAMES)('ne publie que des niveaux valides dans le catalogue de $title', (game) => {
    expect(validateLevelCatalog(game.id, game.catalog)).toEqual({ valid: true, errors: [] });
  });

  it('additionne la progression de tous les jeux (compteur du Hub)', () => {
    const games: GameManifest[] = [
      { ...GAME_REGISTRY.memory, catalog: CATALOG },
      {
        ...GAME_REGISTRY['traffic-jam'],
        catalog: TIERS.slice(0, 2).map((tier, index) =>
          def(`tj-00${String(index + 1)}`, tier, 10, 'traffic-jam'),
        ),
      },
    ];
    const memory = [won('mem-001'), won('mem-002', { isPerfect: true }), won('mem-003')];
    const profile = player([], {
      gamesProgress: {
        memory: progressOf('memory', memory),
        'traffic-jam': progressOf('traffic-jam', [won('tj-001', { isPerfect: true })]),
      },
    });

    const summary = getProfileProgressSummary(profile, games);

    expect(summary).toMatchObject({ earnedStars: 4, totalStars: 22, perfectCount: 2 });
    expect(summary.games).toEqual([
      getGameProgressSummary('memory', CATALOG, profile),
      getGameProgressSummary('traffic-jam', games[1]?.catalog ?? [], profile),
    ]);
    // Sans niveau inconnu des catalogues, égal au décompte du sélecteur de profil (FEAT-06).
    expect(countProfileStars(profile)).toBe(summary.earnedStars);
  });

  it('résume par défaut les jeux du registre, dans l’ordre du Hub', () => {
    const summary = getProfileProgressSummary(null);

    expect(summary.games.map((game) => game.gameId)).toEqual(['memory', 'traffic-jam']);
    expect(summary).toMatchObject({
      earnedStars: 0,
      perfectCount: 0,
      totalStars: GAMES.reduce((total, game) => total + game.catalog.length, 0),
    });
  });
});
