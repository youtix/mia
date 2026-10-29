// @vitest-environment node
import {
  DIFFICULTY_TIER_IDS,
  GAME_REGISTRY,
  getGameProgressSummary,
  sortLevels,
  validateLevelCatalog,
  type BaseLevelDefinition,
} from '@/core/progression';
import { parseTrafficJamAscii } from '@/games/traffic-jam/ascii-parser';
import {
  getLaneSignature,
  TRAFFIC_JAM_CATALOG,
  validateTrafficJamCatalog,
} from '@/games/traffic-jam/catalog';
import { applyMove, createTrafficJamGame, validateBoardGeometry } from '@/games/traffic-jam/engine';
import { DEFAULT_MAX_STATES, getNextBestMove, solveTrafficJam } from '@/games/traffic-jam/solver';
import type { TrafficJamLevelConfig } from '@/games/traffic-jam/types';
import type { DifficultyTier, GameId } from '@/types/mia';
import { describe, expect, it } from 'vitest';

type TrafficJamLevel = BaseLevelDefinition<TrafficJamLevelConfig>;

type StarRow = [
  id: string,
  tier: DifficultyTier,
  order: number,
  optimalMoves: number,
  vehicles: number,
  obstacles: number,
];

/** Le tableau des 20 étoiles de FEAT-14 §5, colonne par colonne (véhicules : hero compris). */
const SPEC_ROWS: StarRow[] = [
  ['tj-001', 'very_easy', 10, 2, 2, 0],
  ['tj-002', 'very_easy', 20, 3, 4, 0],
  ['tj-003', 'very_easy', 30, 4, 5, 0],
  ['tj-004', 'very_easy', 40, 5, 5, 0],
  ['tj-005', 'easy', 10, 7, 5, 0],
  ['tj-006', 'easy', 20, 8, 6, 0],
  ['tj-007', 'easy', 30, 10, 6, 0],
  ['tj-008', 'easy', 40, 11, 7, 0],
  ['tj-009', 'medium', 10, 12, 8, 0],
  ['tj-010', 'medium', 20, 14, 8, 1],
  ['tj-011', 'medium', 30, 16, 9, 0],
  ['tj-012', 'medium', 40, 18, 10, 0],
  ['tj-013', 'hard', 10, 19, 10, 0],
  ['tj-014', 'hard', 20, 22, 11, 1],
  ['tj-015', 'hard', 30, 25, 11, 0],
  ['tj-016', 'hard', 40, 28, 12, 0],
  ['tj-017', 'very_hard', 10, 31, 11, 0],
  ['tj-018', 'very_hard', 20, 36, 12, 0],
  ['tj-019', 'very_hard', 30, 41, 12, 2],
  ['tj-020', 'very_hard', 40, 45, 12, 0],
];

/** Plages de coups optimaux de chaque palier (FEAT-14 §3.1). */
const TIER_RANGES: Record<DifficultyTier, [min: number, max: number]> = {
  very_easy: [1, 5],
  easy: [6, 11],
  medium: [12, 18],
  hard: [19, 28],
  very_hard: [29, Infinity],
};

function toRow(level: TrafficJamLevel): StarRow {
  const { optimalMoves, vehicles, obstacles } = level.config;
  return [level.id, level.tier, level.order, optimalMoves, vehicles.length, obstacles.length];
}

function findLevel(id: string): TrafficJamLevel {
  const level = TRAFFIC_JAM_CATALOG.find((entry) => entry.id === id);
  if (!level) throw new Error(`Niveau « ${id} » absent du catalogue`);
  return level;
}

function countTrucks(level: TrafficJamLevel): number {
  return level.config.vehicles.filter((vehicle) => vehicle.type === 'truck').length;
}

/** Ligne de sortie libre : 1 coup. */
const TRIVIAL = ['......', '......', 'HH....', '......', '......', '......'];

/** Une voiture verticale devant la sortie : 2 coups. */
const TWO_MOVES = ['......', '...A..', 'HH.A..', '......', '......', '......'];

/** Une voiture verticale contre le bord droit : 2 coups, autres voies que `TWO_MOVES`. */
const TWO_MOVES_RIGHT = ['......', '......', 'HH..A.', '....A.', '......', '......'];

/** Ligne de sortie libre, une voiture garée en bas : 1 coup, autres voies que `TRIVIAL`. */
const ONE_MOVE_CAR = ['......', '......', 'HH....', '......', '.AA...', '......'];

/** Plot fixe devant le hero : insoluble. */
const WALLED = ['......', '......', 'HH#...', '......', '......', '......'];

/** Hero déjà contre le bord droit : gagné sans jouer. */
const WON = ['......', '......', '....HH', '......', '......', '......'];

function level(
  id: string,
  tier: DifficultyTier,
  order: number,
  lines: string[],
  optimalMoves: number,
  gameId: GameId = 'traffic-jam',
): TrafficJamLevel {
  return { id, gameId, tier, order, config: parseTrafficJamAscii(lines, { optimalMoves }) };
}

describe('TRAFFIC_JAM_CATALOG', () => {
  it('publie exactement les 20 étoiles de FEAT-14, dans l’ordre de la carte', () => {
    expect(TRAFFIC_JAM_CATALOG.map(toRow)).toEqual(SPEC_ROWS);
    expect(TRAFFIC_JAM_CATALOG.map((entry) => entry.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `tj-${String(index + 1).padStart(3, '0')}`),
    );
    expect(TRAFFIC_JAM_CATALOG.every((entry) => entry.gameId === 'traffic-jam')).toBe(true);
  });

  it('donne à chaque étoile un titre court, unique, jamais affiché', () => {
    const titles = TRAFFIC_JAM_CATALOG.map((entry) => entry.title);

    expect(titles.every((title) => typeof title === 'string' && title.trim() !== '')).toBe(true);
    expect(new Set(titles).size).toBe(20);
  });

  it('donne à chaque étoile un parking structurellement différent (voies et plots)', () => {
    // Même multiensemble de voies = même parking aux positions de départ près.
    expect(getLaneSignature(findLevel('tj-001').config)).toBe('H2@2 V2@4');
    expect(getLaneSignature(findLevel('tj-010').config)).toBe(
      'H2@0 H2@2 H3@3 H3@4 H3@5 V2@0 V2@2 V2@3 #0,3',
    );
    expect(new Set(TRAFFIC_JAM_CATALOG.map((entry) => getLaneSignature(entry.config))).size).toBe(
      20,
    );
  });

  it('remplit les 5 paliers de 4 étoiles chacun, numérotées de 1 à 20', () => {
    const summary = getGameProgressSummary('traffic-jam', TRAFFIC_JAM_CATALOG, null);

    expect(summary.totalStars).toBe(20);
    expect(summary.tiers.map((tier) => [tier.tier, tier.totalStars])).toEqual(
      DIFFICULTY_TIER_IDS.map((tier) => [tier, 4]),
    );
    // Déclaré dans l'ordre de la carte : les numéros d'étoile suivent les identifiants.
    expect(summary.allLevels.map((entry) => entry.definition)).toEqual([...TRAFFIC_JAM_CATALOG]);
    expect(summary.allLevels.map((entry) => entry.starNumber)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(summary.tiers.map((tier) => tier.levels.map((entry) => entry.definition.order))).toEqual(
      Array.from({ length: 5 }, () => [10, 20, 30, 40]),
    );
  });

  it('commence par l’Étoile #1, seule débloquée sans progression', () => {
    const summary = getGameProgressSummary('traffic-jam', TRAFFIC_JAM_CATALOG, null);

    expect(summary.nextPlayableLevel?.definition.id).toBe('tj-001');
    expect(
      summary.allLevels.filter((entry) => entry.isUnlocked).map((entry) => entry.definition.id),
    ).toEqual(['tj-001']);
    expect(summary).toMatchObject({ earnedStars: 0, perfectCount: 0 });
  });

  it('est branché sur le registre des jeux (Hub, Carte des Étoiles, page /traffic-jam)', () => {
    expect(GAME_REGISTRY['traffic-jam'].catalog).toBe(TRAFFIC_JAM_CATALOG);
    expect(validateLevelCatalog('traffic-jam', GAME_REGISTRY['traffic-jam'].catalog)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('respecte les plages de chaque palier et progresse strictement d’une étoile à la suivante', () => {
    const sorted = sortLevels(TRAFFIC_JAM_CATALOG);
    const moves = sorted.map((entry) => entry.config.optimalMoves);

    for (const entry of sorted) {
      const [min, max] = TIER_RANGES[entry.tier];
      expect(entry.config.optimalMoves, entry.id).toBeGreaterThanOrEqual(min);
      expect(entry.config.optimalMoves, entry.id).toBeLessThanOrEqual(max);
    }
    expect(moves.every((value, index) => index === 0 || value > (moves[index - 1] ?? 0))).toBe(
      true,
    );
    // Règle 5 : moyenne par palier strictement croissante (3,5 / 9 / 15 / 23,5 / 38,25).
    const averages = DIFFICULTY_TIER_IDS.map((tier) => {
      const values = sorted
        .filter((entry) => entry.tier === tier)
        .map(toRow)
        .map((row) => row[3]);
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    });
    expect(averages).toEqual([3.5, 9, 15, 23.5, 38.25]);
  });

  it('suit les caractéristiques de SPECIFICATION §4.2 : camion, plots, parkings de 12 véhicules', () => {
    // Premier camion à l'Étoile #3, aucun avant.
    expect(['tj-001', 'tj-002'].map((id) => countTrucks(findLevel(id)))).toEqual([0, 0]);
    expect(countTrucks(findLevel('tj-003'))).toBe(1);
    // Premier plot fixe au palier Moyen (tj-010), un autre en Difficile (tj-014), deux
    // asymétriques en Très Difficile (tj-019) ; aucun ailleurs.
    const withObstacles = TRAFFIC_JAM_CATALOG.filter((entry) => entry.config.obstacles.length > 0);
    expect(withObstacles.map((entry) => [entry.id, entry.config.obstacles.length])).toEqual([
      ['tj-010', 1],
      ['tj-014', 1],
      ['tj-019', 2],
    ]);
    const [first, second] = findLevel('tj-019').config.obstacles;
    expect(first?.row).not.toBe(second?.row);
    expect(first?.col).not.toBe(second?.col);
    // Parkings de 12 véhicules (hero compris), dont le Défi Maître, le plus long du catalogue.
    expect(findLevel('tj-018').config.vehicles).toHaveLength(12);
    expect(findLevel('tj-020').config.vehicles).toHaveLength(12);
    expect(Math.max(...TRAFFIC_JAM_CATALOG.map((entry) => entry.config.vehicles.length))).toBe(12);
    expect(Math.max(...TRAFFIC_JAM_CATALOG.map((entry) => entry.config.optimalMoves))).toBe(45);
  });

  it.each(TRAFFIC_JAM_CATALOG)(
    '$id : parking 6 × 6 valide, instanciable, résolu par BFS en optimalMoves coups exactement',
    (entry) => {
      const { config } = entry;
      const hero = config.vehicles.find((vehicle) => vehicle.type === 'hero');

      expect(config).toMatchObject({ gridSize: 6, exitRow: 2 });
      expect(hero).toMatchObject({ axis: 'H', length: 2, row: 2 });
      expect(validateBoardGeometry(config)).toEqual({ valid: true });

      const start = createTrafficJamGame(config);
      expect(start).toMatchObject({ moves: 0, isWon: false });

      const result = solveTrafficJam(config);
      expect(result.solvable).toBe(true);
      expect(result.optimalMoves).toBe(config.optimalMoves);
      expect(config.optimalMoves).toBeGreaterThan(0);

      // La solution se rejoue depuis le départ, et l'indice du plateau en propose le premier coup.
      expect(getNextBestMove(start)).toEqual(result.solution[0]);
      let state = start;
      for (const move of result.solution) state = applyMove(state, move.vehicleId, move.delta);
      expect(state.isWon).toBe(true);
      expect(state.moves).toBe(config.optimalMoves);
    },
  );

  it('reste largement sous le budget du solveur (indice rapide) et se résout vite en entier', () => {
    const start = performance.now();
    const results = TRAFFIC_JAM_CATALOG.map((entry) =>
      // Au plus 8 051 positions explorées (tj-017) : un quart du budget par défaut suffit.
      solveTrafficJam(entry.config, DEFAULT_MAX_STATES / 4),
    );
    const elapsed = performance.now() - start;

    expect(results.map((result) => result.optimalMoves)).toEqual(SPEC_ROWS.map((row) => row[3]));
    expect(elapsed).toBeLessThan(10_000);
  });
});

describe('validateTrafficJamCatalog', () => {
  it('valide le catalogue initial, par défaut comme explicitement, et un catalogue vide', () => {
    expect(validateTrafficJamCatalog()).toEqual({ valid: true, errors: [] });
    expect(validateTrafficJamCatalog(TRAFFIC_JAM_CATALOG)).toEqual({ valid: true, errors: [] });
    expect(validateTrafficJamCatalog([])).toEqual({ valid: true, errors: [] });
  });

  it('reprend les règles communes : identifiant en double, jeu et order déjà pris', () => {
    // Grilles différentes : seules les règles communes s'appliquent (la diversité a son test).
    const catalog = [
      level('tj-001', 'very_easy', 10, TRIVIAL, 1),
      level('tj-001', 'very_easy', 10, TWO_MOVES, 2),
      level('mem-001', 'easy', 10, TWO_MOVES_RIGHT, 2, 'memory'),
    ];

    expect(validateTrafficJamCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 2 « tj-001 » : identifiant en double',
        'niveau n° 2 « tj-001 » : order 10 déjà pris par « tj-001 » dans le palier « very_easy »',
        'niveau n° 3 « mem-001 » : niveau du jeu « memory » au lieu de « traffic-jam »',
      ],
    });
  });

  it('signale une géométrie invalide avant le solveur (qui lèverait), sans la classer', () => {
    const overlapping = level('tj-001', 'very_easy', 10, TRIVIAL, 1);
    overlapping.config.obstacles.push({ row: 2, col: 0 });
    const unknownMoves = level('tj-002', 'easy', 10, TWO_MOVES, 2);
    unknownMoves.config.optimalMoves = Number.NaN;
    const catalog = [overlapping, unknownMoves, level('tj-003', 'medium', 10, TWO_MOVES_RIGHT, 2)];

    // Un `optimalMoves` non fini ne compte pas dans les moyennes : aucune fausse régression.
    expect(validateTrafficJamCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        "niveau n° 1 « tj-001 » : géométrie invalide : le véhicule « hero » chevauche l'obstacle (ligne 2, colonne 0) en (ligne 2, colonne 0)",
        'niveau n° 2 « tj-002 » : géométrie invalide : optimalMoves NaN invalide (entier ≥ 0 attendu)',
      ],
    });
  });

  it('signale un niveau insoluble, déjà gagné au départ, ou à l’optimalMoves inexact', () => {
    const catalog = [
      level('tj-001', 'very_easy', 10, WALLED, 0),
      level('tj-002', 'very_easy', 20, WON, 0),
      level('tj-003', 'very_easy', 30, TWO_MOVES, 5),
    ];

    expect(validateTrafficJamCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « tj-001 » : insoluble, ou plus de 50000 positions à explorer (budget par défaut du solveur)',
        'niveau n° 2 « tj-002 » : déjà gagné au départ (aucun coup à jouer)',
        'niveau n° 3 « tj-003 » : optimalMoves 5 au lieu de 2 (minimum mesuré par le solveur)',
      ],
    });
  });

  it('refuse deux niveaux aux mêmes voies, aux positions de départ près ; un plot les distingue', () => {
    // Même voiture verticale en colonne 3, une case plus bas : le même parking décalé.
    const shifted = ['......', '......', 'HH.A..', '...A..', '......', '......'];
    const withObstacle = level('tj-003', 'very_easy', 30, TWO_MOVES, 2);
    withObstacle.config.obstacles.push({ row: 5, col: 5 });
    const catalog = [
      level('tj-001', 'very_easy', 10, TWO_MOVES, 2),
      level('tj-002', 'very_easy', 20, shifted, 2),
      withObstacle,
    ];

    expect(getLaneSignature(withObstacle.config)).toBe('H2@2 V2@3 #5,5');
    expect(validateTrafficJamCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 2 « tj-002 » : mêmes voies (véhicules et plots) que le niveau « tj-001 », seules les positions de départ diffèrent',
      ],
    });
  });

  it('exige un optimalMoves moyen strictement croissant d’un palier au suivant, paliers vides ignorés', () => {
    expect(
      validateTrafficJamCatalog([
        level('tj-001', 'very_easy', 10, TRIVIAL, 1),
        level('tj-002', 'hard', 10, TWO_MOVES, 2),
      ]),
    ).toEqual({ valid: true, errors: [] });

    // Moyennes 1,5 puis 1 : régression du palier Facile, et l'étoile #3 redescend sur la carte.
    expect(
      validateTrafficJamCatalog([
        level('tj-001', 'very_easy', 10, TRIVIAL, 1),
        level('tj-002', 'very_easy', 20, TWO_MOVES, 2),
        level('tj-003', 'easy', 10, ONE_MOVE_CAR, 1),
      ]),
    ).toEqual({
      valid: false,
      errors: [
        'palier « easy » : optimalMoves moyen 1 non supérieur à celui du palier « very_easy » (1,5)',
        'niveau n° 3 « tj-003 » : optimalMoves 1 inférieur à celui du niveau précédent sur la carte « tj-002 » (2)',
      ],
    });

    // Moyennes égales (2 et 2) : non strictement croissant.
    expect(
      validateTrafficJamCatalog([
        level('tj-001', 'very_easy', 10, TWO_MOVES, 2),
        level('tj-002', 'easy', 10, TWO_MOVES_RIGHT, 2),
      ]),
    ).toEqual({
      valid: false,
      errors: [
        'palier « easy » : optimalMoves moyen 2 non supérieur à celui du palier « very_easy » (2)',
      ],
    });
  });

  it('refuse un optimalMoves qui redescend dans l’ordre de la carte, même au sein d’un palier', () => {
    // Déclaré dans le désordre : la règle suit l'ordre de la carte, le nom l'ordre de déclaration.
    const catalog = [
      level('tj-002', 'very_easy', 20, TRIVIAL, 1),
      level('tj-001', 'very_easy', 10, TWO_MOVES, 2),
    ];

    expect(validateTrafficJamCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « tj-002 » : optimalMoves 1 inférieur à celui du niveau précédent sur la carte « tj-001 » (2)',
      ],
    });
  });

  it('ne classe pas un niveau d’un palier inconnu, déjà signalé par les règles communes', () => {
    const catalog = [
      level('tj-001', 'very_easy', 10, TRIVIAL, 1),
      level('tj-002', 'legendary' as string as DifficultyTier, 10, TWO_MOVES, 2),
    ];

    expect(validateTrafficJamCatalog(catalog)).toEqual({
      valid: false,
      errors: ['niveau n° 2 « tj-002 » : palier « legendary » inconnu'],
    });
  });

  it('liste les règles communes, puis celles de chaque niveau, puis la progression', () => {
    const catalog = [
      level('TJ-1', 'very_easy', 10, TWO_MOVES, 2),
      level('tj-002', 'easy', 10, WALLED, 0),
    ];

    expect(validateTrafficJamCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « TJ-1 » : identifiant invalide (minuscules, chiffres et tirets, ex: « mem-001 »)',
        'niveau n° 2 « tj-002 » : insoluble, ou plus de 50000 positions à explorer (budget par défaut du solveur)',
        'palier « easy » : optimalMoves moyen 0 non supérieur à celui du palier « very_easy » (2)',
        'niveau n° 2 « tj-002 » : optimalMoves 0 inférieur à celui du niveau précédent sur la carte « TJ-1 » (2)',
      ],
    });
  });
});
