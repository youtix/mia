// @vitest-environment node
import {
  DIFFICULTY_TIER_IDS,
  GAME_REGISTRY,
  getGameProgressSummary,
  validateLevelCatalog,
  type BaseLevelDefinition,
} from '@/core/progression';
import { BEAR_SORT_CATALOG, validateBearSortCatalog } from '@/games/bear-sort/catalog';
import {
  continueAfterStop,
  createBearSortGame,
  dropBear,
  getBearSortConfigErrors,
  getTargetZoneId,
  isBearForbidden,
  isConflictBear,
  isPerfectWin,
} from '@/games/bear-sort/engine';
import { getBearLabel, getBoxLabel, getRuleLabel } from '@/games/bear-sort/labels';
import type {
  Bear,
  BearBounceKind,
  BearKind,
  BearSortLevelConfig,
  BearSortRule,
  BearSortState,
  BearSortZoneId,
  BearTraits,
  ForbiddenBears,
} from '@/games/bear-sort/types';
import {
  BEAR_SORT_CLIP_IDS,
  getRuleClipId,
  getVoiceClipPath,
  VOICE_SCRIPT,
  type BearSortClipId,
} from '@/games/bear-sort/voice-script';
import type { Rng } from '@/games/memory/random';
import type { DifficultyTier, GameId } from '@/types/mia';
import { describe, expect, it } from 'vitest';

type BearSortLevel = BaseLevelDefinition<BearSortLevelConfig>;

type StarRow = [id: string, tier: DifficultyTier, order: number, rules: string];

/** Les 20 étoiles, colonne par colonne : un niveau publié n'est jamais retiré ni renommé. */
const SPEC_ROWS: StarRow[] = [
  ['bs-001', 'very_easy', 10, 'couleur'],
  ['bs-002', 'very_easy', 20, 'couleur > taille'],
  ['bs-003', 'very_easy', 30, 'couleur > taille'],
  ['bs-004', 'very_easy', 40, 'taille > couleur'],
  ['bs-005', 'easy', 10, 'couleur > taille'],
  ['bs-006', 'easy', 20, 'taille > couleur'],
  ['bs-007', 'easy', 30, 'couleur > taille'],
  ['bs-008', 'easy', 40, 'taille > couleur'],
  ['bs-009', 'medium', 10, 'couleur > taille > couleur'],
  ['bs-010', 'medium', 20, 'taille > couleur > taille'],
  ['bs-011', 'medium', 30, 'couleur > taille > couleur > taille'],
  ['bs-012', 'medium', 40, 'taille > couleur > taille > couleur'],
  ['bs-013', 'hard', 10, 'couleur > sauf bleu'],
  ['bs-014', 'hard', 20, 'taille > sauf petit'],
  ['bs-015', 'hard', 30, 'couleur > taille > sauf jaune'],
  ['bs-016', 'hard', 40, 'taille > couleur > sauf grand'],
  ['bs-017', 'very_hard', 10, 'couleur > sauf petit bleu'],
  ['bs-018', 'very_hard', 20, 'taille > sauf grand jaune'],
  ['bs-019', 'very_hard', 30, 'couleur > taille > sauf petit jaune'],
  ['bs-020', 'very_hard', 40, 'couleur > taille > couleur > sauf grand bleu'],
];

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const SMALL_BLUE: BearTraits = { color: 'blue', size: 'small' };
const BIG_BLUE: BearTraits = { color: 'blue', size: 'big' };
const SMALL_YELLOW: BearTraits = { color: 'yellow', size: 'small' };
const BIG_YELLOW: BearTraits = { color: 'yellow', size: 'big' };

const BY_COLOR: BearSortRule = { kind: 'sort', feature: 'color' };
const BY_SIZE: BearSortRule = { kind: 'sort', feature: 'size' };

/** Toutes les règles que le script de la voix doit savoir annoncer. */
const ALL_RULES: [rule: BearSortRule, clipId: BearSortClipId, label: string][] = [
  [BY_COLOR, 'rule-color', 'Ranger par couleur'],
  [BY_SIZE, 'rule-size', 'Ranger par taille'],
  [except({ color: 'blue' }), 'rule-except-blue', 'Tous les ours, sauf un ours bleu'],
  [except({ color: 'yellow' }), 'rule-except-yellow', 'Tous les ours, sauf un ours jaune'],
  [except({ size: 'small' }), 'rule-except-small', 'Tous les ours, sauf un petit ours'],
  [except({ size: 'big' }), 'rule-except-big', 'Tous les ours, sauf un grand ours'],
  [except(SMALL_BLUE), 'rule-except-small-blue', 'Tous les ours, sauf un petit ours bleu'],
  [except(BIG_BLUE), 'rule-except-big-blue', 'Tous les ours, sauf un grand ours bleu'],
  [except(SMALL_YELLOW), 'rule-except-small-yellow', 'Tous les ours, sauf un petit ours jaune'],
  [except(BIG_YELLOW), 'rule-except-big-yellow', 'Tous les ours, sauf un grand ours jaune'],
];

/** Plus petite configuration valide : une phase par couleur, un ours pour chaque boîte. */
const BASE_CONFIG: BearSortLevelConfig = {
  zones: [SMALL_BLUE, BIG_YELLOW],
  phases: [{ rule: BY_COLOR, addBears: { 'blue-small': 1, 'yellow-big': 1 }, placements: null }],
  showGestureHint: false,
};

function except(forbidden: ForbiddenBears): BearSortRule {
  return { kind: 'except', forbidden };
}

function level(
  id: string,
  tier: DifficultyTier,
  order: number,
  config: Partial<BearSortLevelConfig> = {},
  gameId: GameId = 'bear-sort',
): BearSortLevel {
  return { id, gameId, tier, order, config: { ...BASE_CONFIG, ...config } };
}

function idsOf(levels: readonly BearSortLevel[]): string[] {
  return levels.map((entry) => entry.id);
}

function levelsOfTier(tier: DifficultyTier): BearSortLevel[] {
  return BEAR_SORT_CATALOG.filter((entry) => entry.tier === tier);
}

function rulesOf(entry: BearSortLevel): BearSortRule[] {
  return entry.config.phases.map((phase) => phase.rule);
}

/** Règle « sauf » qui termine une étoile, et l'échec du test sinon. */
function closingExcept(entry: BearSortLevel): ForbiddenBears {
  const rule = rulesOf(entry).at(-1);
  if (rule?.kind !== 'except') throw new Error(`${entry.id} ne finit pas par une règle « sauf »`);
  return rule.forbidden;
}

function describeRule(rule: BearSortRule): string {
  if (rule.kind === 'sort') return rule.feature === 'color' ? 'couleur' : 'taille';
  const { color, size } = rule.forbidden;
  const words = [
    size && { small: 'petit', big: 'grand' }[size],
    color && { blue: 'bleu', yellow: 'jaune' }[color],
  ];
  return `sauf ${words.filter(Boolean).join(' ')}`;
}

function toRow(entry: BearSortLevel): StarRow {
  return [entry.id, entry.tier, entry.order, rulesOf(entry).map(describeRule).join(' > ')];
}

/** Générateur à graine (mulberry32) : parties reproductibles. */
function seeded(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bien au-delà des dépôts d'une étoile : une partie qui n'avance plus échoue au lieu de boucler. */
const MAX_TURNS = 500;

interface Playthrough {
  final: BearSortState;
  /** États du plateau juste après chaque STOP, dans l'ordre */
  restarts: BearSortState[];
  stopReserves: (readonly Bear[])[];
  bounces: BearBounceKind[];
}

/**
 * Joue une étoile jusqu'à sa fin : `turn` choisit le dépôt suivant, et chaque STOP est passé.
 * Toute partie qui n'atteint pas `won` échoue.
 */
function playStar(
  config: BearSortLevelConfig,
  rng: Rng,
  turn: (state: BearSortState) => [bearUid: string, zoneId: BearSortZoneId],
): Playthrough {
  let state = createBearSortGame(config, rng);
  const restarts: BearSortState[] = [];
  const stopReserves: (readonly Bear[])[] = [];
  const bounces: BearBounceKind[] = [];
  for (let step = 0; step < MAX_TURNS; step += 1) {
    if (state.status === 'won') return { final: state, restarts, stopReserves, bounces };
    if (state.status === 'stop') {
      stopReserves.push(state.reserve);
      state = continueAfterStop(state, rng);
      restarts.push(state);
    } else {
      const [bearUid, zoneId] = turn(state);
      state = dropBear(state, bearUid, zoneId);
      if (state.lastBounce) bounces.push(state.lastBounce.kind);
    }
  }
  throw new Error(`Partie sans fin après ${String(MAX_TURNS)} tours`);
}

/** Joueur parfait : range un ours accepté, tiré au hasard, dans sa boîte. */
function perfectPlayer(rng: Rng) {
  return (state: BearSortState): [string, BearSortZoneId] => {
    const movable = state.reserve.filter((bear) => getTargetZoneId(state, bear) !== null);
    const bear = movable[Math.floor(rng() * movable.length)];
    const zoneId = bear && getTargetZoneId(state, bear);
    if (!zoneId) throw new Error('aucun ours à ranger alors que la partie continue');
    return [bear.uid, zoneId];
  };
}

/** Mauvais dépôt d'un ours : l'autre boîte, la boîte ouverte s'il est interdit, aucun s'il y est permis. */
function getWrongZoneId(state: BearSortState, bear: BearTraits): BearSortZoneId | null {
  const target = getTargetZoneId(state, bear);
  if (target === null) return 'open';
  if (target === 'open') return null;
  return target === 'left' ? 'right' : 'left';
}

/** Joueur maladroit : essaie d'abord chaque ours de la phase au mauvais endroit, puis le range. */
function clumsyPlayer(rng: Rng) {
  const perfect = perfectPlayer(rng);
  const tried = new Set<string>();
  return (state: BearSortState): [string, BearSortZoneId] => {
    const keyOf = (bear: Bear) => `${String(state.phaseIndex)}/${bear.uid}`;
    const fresh = state.reserve.find((bear) => !tried.has(keyOf(bear)));
    if (fresh) {
      tried.add(keyOf(fresh));
      const zoneId = getWrongZoneId(state, fresh);
      if (zoneId) return [fresh.uid, zoneId];
    }
    return perfect(state);
  };
}

const KIND_TRAITS: readonly [BearKind, BearTraits][] = [
  ['blue-small', SMALL_BLUE],
  ['blue-big', BIG_BLUE],
  ['yellow-small', SMALL_YELLOW],
  ['yellow-big', BIG_YELLOW],
];

/** Ours créés par toute une étoile qui vérifient `predicate`. */
function countBears(config: BearSortLevelConfig, predicate: (bear: BearTraits) => boolean): number {
  let total = 0;
  for (const { addBears } of config.phases) {
    for (const [kind, traits] of KIND_TRAITS) {
      if (predicate(traits)) total += addBears[kind] ?? 0;
    }
  }
  return total;
}

describe('BEAR_SORT_CATALOG', () => {
  it('publie exactement les 20 étoiles prévues, dans l’ordre de la carte', () => {
    expect(BEAR_SORT_CATALOG.map(toRow)).toEqual(SPEC_ROWS);
    expect(idsOf(BEAR_SORT_CATALOG)).toEqual(
      Array.from({ length: 20 }, (_, index) => `bs-${String(index + 1).padStart(3, '0')}`),
    );
    expect(new Set(idsOf(BEAR_SORT_CATALOG)).size).toBe(20);
    expect(BEAR_SORT_CATALOG.every((entry) => entry.gameId === 'bear-sort')).toBe(true);
  });

  it('donne à chaque étoile un titre court, unique, jamais affiché', () => {
    const titles = BEAR_SORT_CATALOG.map((entry) => entry.title);

    expect(titles.every((title) => typeof title === 'string' && title.trim() !== '')).toBe(true);
    expect(new Set(titles).size).toBe(20);
  });

  it('remplit les 5 paliers de 4 étoiles chacun, numérotées de 1 à 20', () => {
    const summary = getGameProgressSummary('bear-sort', BEAR_SORT_CATALOG, null);

    expect(summary.totalStars).toBe(20);
    expect(summary.tiers.map((tier) => [tier.tier, tier.totalStars])).toEqual(
      DIFFICULTY_TIER_IDS.map((tier) => [tier, 4]),
    );
    // Déclaré dans l'ordre de la carte : les numéros d'étoile suivent les identifiants.
    expect(summary.allLevels.map((entry) => entry.definition)).toEqual([...BEAR_SORT_CATALOG]);
    expect(summary.allLevels.map((entry) => entry.starNumber)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(summary.tiers.map((tier) => tier.levels.map((entry) => entry.definition.order))).toEqual(
      Array.from({ length: 5 }, () => [10, 20, 30, 40]),
    );
  });

  it('commence par l’Étoile #1, seule débloquée sans progression', () => {
    const summary = getGameProgressSummary('bear-sort', BEAR_SORT_CATALOG, null);

    expect(summary.nextPlayableLevel?.definition.id).toBe('bs-001');
    expect(
      summary.allLevels.filter((entry) => entry.isUnlocked).map((entry) => entry.definition.id),
    ).toEqual(['bs-001']);
    expect(summary).toMatchObject({ earnedStars: 0, perfectCount: 0 });
  });

  it('est branché sur le registre des jeux (Hub, Carte des Étoiles, page /bear-sort)', () => {
    expect(GAME_REGISTRY['bear-sort'].catalog).toBe(BEAR_SORT_CATALOG);
    expect(validateLevelCatalog('bear-sort', GAME_REGISTRY['bear-sort'].catalog)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it.each(BEAR_SORT_CATALOG)('$id : configuration valide, instanciable', (entry) => {
    expect(getBearSortConfigErrors(entry.config)).toEqual([]);
    expect(createBearSortGame(entry.config).status).toBe('playing');
  });
});

describe('Courbe de difficulté', () => {
  it('réserve à l’Étoile #1 la phase unique et le geste montré', () => {
    const [first] = BEAR_SORT_CATALOG;

    expect(first?.config.phases).toHaveLength(1);
    expect(first?.config.phases[0]?.rule).toEqual(BY_COLOR);
    expect(idsOf(BEAR_SORT_CATALOG.filter((entry) => entry.config.phases.length === 1))).toEqual([
      'bs-001',
    ]);
    expect(idsOf(BEAR_SORT_CATALOG.filter((entry) => entry.config.showGestureHint))).toEqual([
      'bs-001',
    ]);
  });

  it.each<DifficultyTier>(['very_easy', 'easy'])(
    'limite le palier %s à un seul changement de règle de tri (2 phases, hors Étoile #1)',
    (tier) => {
      const stars = levelsOfTier(tier).filter((entry) => entry.id !== 'bs-001');

      expect(stars.length).toBeGreaterThanOrEqual(3);
      for (const entry of stars) {
        expect(entry.config.phases, entry.id).toHaveLength(2);
        expect(
          rulesOf(entry).every((rule) => rule.kind === 'sort'),
          entry.id,
        ).toBe(true);
      }
    },
  );

  it('fait revenir le palier moyen à la première règle : au moins 3 phases, tri seulement', () => {
    for (const entry of levelsOfTier('medium')) {
      const rules = rulesOf(entry);

      expect(rules.length, entry.id).toBeGreaterThanOrEqual(3);
      expect(
        rules.every((rule) => rule.kind === 'sort'),
        entry.id,
      ).toBe(true);
      expect(rules[2], entry.id).toEqual(rules[0]);
    }
  });

  it('termine le palier difficile par une règle « sauf » sur une seule caractéristique', () => {
    expect(levelsOfTier('hard').map(closingExcept)).toEqual([
      { color: 'blue' },
      { size: 'small' },
      { color: 'yellow' },
      { size: 'big' },
    ]);
  });

  it('termine le palier très difficile par une règle « sauf » sur deux caractéristiques', () => {
    expect(levelsOfTier('very_hard').map(closingExcept)).toEqual([
      SMALL_BLUE,
      BIG_YELLOW,
      SMALL_YELLOW,
      BIG_BLUE,
    ]);
  });

  it('n’introduit la règle « sauf » qu’au palier difficile, et seulement en dernière phase', () => {
    for (const entry of BEAR_SORT_CATALOG) {
      const excepts = rulesOf(entry).filter((rule) => rule.kind === 'except');
      const isLate = entry.tier === 'hard' || entry.tier === 'very_hard';

      expect(excepts, entry.id).toHaveLength(isLate ? 1 : 0);
      if (isLate) expect(rulesOf(entry).at(-1)?.kind, entry.id).toBe('except');
    }
  });

  it.each(BEAR_SORT_CATALOG)(
    '$id : des boîtes opposées par la couleur et par la taille, et des ours en conflit',
    ({ config }) => {
      const [left, right] = config.zones;

      expect(left.color).not.toBe(right.color);
      expect(left.size).not.toBe(right.size);
      expect(countBears(config, (bear) => isConflictBear(config.zones, bear))).toBeGreaterThan(0);
    },
  );
});

describe('Parties simulées', () => {
  describe.each(BEAR_SORT_CATALOG)('$id', (entry) => {
    it.each(SEEDS)('un joueur parfait gagne avec la couronne (graine %i)', (seed) => {
      const rng = seeded(seed);
      const { config } = entry;
      const { final, restarts, stopReserves, bounces } = playStar(config, rng, perfectPlayer(rng));
      const last = config.phases.at(-1);

      expect(final.status).toBe('won');
      expect(isPerfectWin(final)).toBe(true);
      expect(bounces).toEqual([]);
      expect(final.mistakes).toBe(0);
      // Exactement un STOP entre deux phases, et il interrompt toujours des ours qui attendent.
      expect(stopReserves).toHaveLength(config.phases.length - 1);
      expect(stopReserves.every((reserve) => reserve.length > 0)).toBe(true);
      expect(final.phaseIndex).toBe(config.phases.length - 1);

      // Un changement entre deux règles de tri laisse toujours un ours en conflit à ranger.
      for (const restart of restarts) {
        if (restart.rule.kind === 'sort') {
          expect(restart.reserve.some((bear) => isConflictBear(config.zones, bear))).toBe(true);
        }
      }

      // Chaque ours créé a fini dans une boîte, ou reste interdit dans la réserve.
      const created = countBears(config, () => true);
      expect(final.reserve.length + final.moves).toBe(created);
      if (last?.rule.kind === 'except') {
        const { rule } = last;
        expect(final.reserve.length).toBeGreaterThan(0);
        expect(final.reserve.every((bear) => isBearForbidden(rule, bear))).toBe(true);
      } else {
        expect(final.reserve).toEqual([]);
      }
    });

    it('un joueur maladroit finit quand même l’étoile, sans couronne', () => {
      const rng = seeded(11);
      const { config } = entry;
      const { final, stopReserves, bounces } = playStar(config, rng, clumsyPlayer(rng));
      const rules = rulesOf(entry);
      const hasSortChange = rules.some(
        (rule, index) => index > 0 && rule.kind === 'sort' && rules[index - 1]?.kind === 'sort',
      );

      expect(final.status).toBe('won');
      expect(isPerfectWin(final)).toBe(false);
      expect(final.mistakes).toBe(bounces.length);
      expect(stopReserves).toHaveLength(config.phases.length - 1);
      expect(bounces.includes('old-rule')).toBe(hasSortChange);
      expect(bounces.includes('forbidden')).toBe(rules.at(-1)?.kind === 'except');
    });
  });
});

describe('validateBearSortCatalog', () => {
  it('valide le catalogue initial, par défaut comme explicitement, et un catalogue vide', () => {
    expect(validateBearSortCatalog()).toEqual({ valid: true, errors: [] });
    expect(validateBearSortCatalog(BEAR_SORT_CATALOG)).toEqual({ valid: true, errors: [] });
    expect(validateBearSortCatalog([])).toEqual({ valid: true, errors: [] });
  });

  it('reprend les règles communes : identifiant en double, jeu et order déjà pris', () => {
    const catalog = [
      level('bs-001', 'very_easy', 10),
      level('bs-001', 'very_easy', 10),
      level('mem-001', 'easy', 10, {}, 'memory'),
    ];

    expect(validateBearSortCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 2 « bs-001 » : identifiant en double',
        'niveau n° 2 « bs-001 » : order 10 déjà pris par « bs-001 » dans le palier « very_easy »',
        'niveau n° 3 « mem-001 » : niveau du jeu « memory » au lieu de « bear-sort »',
      ],
    });
  });

  it('reprend les règles communes : identifiant illisible, palier inconnu, order invalide', () => {
    const catalog = [
      level('BS 1', 'very_easy', 10),
      level('bs-002', 'legendary' as string as DifficultyTier, 10),
      level('bs-003', 'easy', Number.NaN),
    ];

    expect(validateBearSortCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « BS 1 » : identifiant invalide (minuscules, chiffres et tirets, ex: « mem-001 »)',
        'niveau n° 2 « bs-002 » : palier « legendary » inconnu',
        'niveau n° 3 « bs-003 » : order NaN invalide (nombre fini attendu)',
      ],
    });
  });

  it('signale chaque anomalie de configuration, préfixée du nom du niveau', () => {
    const counts = { 'blue-small': 1, 'blue-big': 1, 'yellow-small': 1, 'yellow-big': 1 };
    const catalog = [
      level('bs-001', 'very_easy', 10, { zones: [SMALL_BLUE, BIG_BLUE] }),
      level('bs-002', 'very_easy', 20, { zones: [SMALL_BLUE, SMALL_YELLOW] }),
      level('bs-003', 'very_easy', 30, { phases: [] }),
      level('bs-004', 'very_easy', 40, {
        phases: [
          { rule: BY_COLOR, addBears: { 'blue-small': 1.5, 'yellow-big': 1 }, placements: null },
        ],
      }),
      level('bs-005', 'easy', 10, {
        phases: [{ rule: BY_COLOR, addBears: { 'blue-small': 2 }, placements: null }],
      }),
      level('bs-006', 'easy', 20, {
        phases: [
          { rule: BY_COLOR, addBears: counts, placements: 2 },
          { rule: BY_COLOR, addBears: counts, placements: null },
        ],
      }),
      level('bs-007', 'easy', 30, {
        phases: [
          { rule: BY_COLOR, addBears: counts, placements: 2 },
          { rule: BY_SIZE, addBears: { 'blue-small': 1, 'yellow-big': 1 }, placements: null },
        ],
      }),
      level('bs-008', 'easy', 40, {
        phases: [
          { rule: except({ color: 'blue' }), addBears: counts, placements: 2 },
          { rule: BY_COLOR, addBears: counts, placements: null },
        ],
      }),
      level('bs-009', 'medium', 10, {
        phases: [
          { rule: except({ color: 'blue' }), addBears: { 'yellow-big': 1 }, placements: null },
        ],
      }),
      level('bs-010', 'medium', 20, {
        phases: [
          { rule: except({ color: 'blue' }), addBears: { 'blue-big': 1 }, placements: null },
        ],
      }),
      level('bs-011', 'medium', 30, {
        phases: [{ rule: BY_COLOR, addBears: counts, placements: 1 }],
      }),
      level('bs-012', 'medium', 40, {
        phases: [
          { rule: BY_COLOR, addBears: counts, placements: null },
          { rule: BY_SIZE, addBears: counts, placements: null },
        ],
      }),
      level('bs-013', 'hard', 10, {
        phases: [
          { rule: BY_COLOR, addBears: counts, placements: 4 },
          { rule: BY_SIZE, addBears: counts, placements: null },
        ],
      }),
    ];

    expect(validateBearSortCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « bs-001 » : les deux boîtes sont de couleur blue',
        'niveau n° 2 « bs-002 » : les deux boîtes sont de taille small',
        'niveau n° 3 « bs-003 » : aucune phase',
        'niveau n° 4 « bs-004 » : phase 1 : blue-small : 1.5 ours (entier ≥ 0 attendu)',
        'niveau n° 5 « bs-005 » : phase 1 : les ours ajoutés ne remplissent pas les deux boîtes (tri par color)',
        'niveau n° 6 « bs-006 » : phase 2 : même règle que la phase précédente (tri par color)',
        'niveau n° 7 « bs-007 » : phase 2 : aucun ours en conflit après le changement de règle',
        'niveau n° 8 « bs-008 » : phase 1 : une règle « sauf » termine toujours l’étoile',
        'niveau n° 9 « bs-009 » : phase 1 : aucun ours interdit ajouté',
        'niveau n° 10 « bs-010 » : phase 1 : aucun ours permis ajouté',
        'niveau n° 11 « bs-011 » : phase 1 : la dernière phase se joue jusqu’au bout (placements null)',
        'niveau n° 12 « bs-012 » : phase 1 : placements null invalide (entier ≥ 1 attendu avant un STOP)',
        'niveau n° 13 « bs-013 » : phase 1 : placements 4 : le STOP doit interrompre des ours qui attendent (4 dans la réserve)',
      ],
    });
  });

  it('liste les règles communes avant les règles de chaque niveau', () => {
    const catalog = [level('BS-1', 'very_easy', 10, { phases: [] })];

    expect(validateBearSortCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « BS-1 » : identifiant invalide (minuscules, chiffres et tirets, ex: « mem-001 »)',
        'niveau n° 1 « BS-1 » : aucune phase',
      ],
    });
  });
});

describe('Libellés', () => {
  it.each<[BearTraits, string]>([
    [SMALL_BLUE, 'Petit ours bleu'],
    [BIG_BLUE, 'Grand ours bleu'],
    [SMALL_YELLOW, 'Petit ours jaune'],
    [BIG_YELLOW, 'Grand ours jaune'],
  ])('nomme la taille et la couleur d’un ours (%j)', (bear, label) => {
    expect(getBearLabel(bear)).toBe(label);
  });

  it.each<[BearTraits, string]>([
    [SMALL_BLUE, 'Petite boîte bleue'],
    [BIG_BLUE, 'Grande boîte bleue'],
    [SMALL_YELLOW, 'Petite boîte jaune'],
    [BIG_YELLOW, 'Grande boîte jaune'],
  ])('accorde la taille et la couleur d’une boîte (%j)', (traits, label) => {
    expect(getBoxLabel(traits)).toBe(label);
  });

  it('nomme la boîte neutre de la règle « sauf »', () => {
    expect(getBoxLabel(null)).toBe('Boîte ouverte');
  });

  it.each(ALL_RULES)('énonce la règle %j', (rule, _clipId, label) => {
    expect(getRuleLabel(rule)).toBe(label);
  });

  it('donne à chaque règle du catalogue un libellé distinct', () => {
    const rules = new Map(
      BEAR_SORT_CATALOG.flatMap(rulesOf).map((rule) => [JSON.stringify(rule), rule]),
    );
    const labels = [...rules.values()].map((rule) => getRuleLabel(rule));

    expect(labels).toHaveLength(10);
    expect(new Set(labels).size).toBe(10);
  });
});

describe('Script de la voix', () => {
  it('liste une phrase non vide et unique par identifiant', () => {
    const texts = Object.values(VOICE_SCRIPT);

    expect(BEAR_SORT_CLIP_IDS).toEqual(Object.keys(VOICE_SCRIPT));
    expect(texts.every((text) => text.trim() !== '')).toBe(true);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('couvre les annonces, les rappels et les récompenses du jeu', () => {
    expect(BEAR_SORT_CLIP_IDS).toEqual(
      expect.arrayContaining<BearSortClipId>([
        'stop-warning',
        'stop-go',
        'bounce-trap',
        'hint-look',
        'hint-here',
        'nudge-more',
        'star-won',
        'crown-won',
      ]),
    );
  });

  it('range chaque clip dans audio/bear-sort/, sous un nom de fichier sûr', () => {
    expect(getVoiceClipPath('rule-color')).toBe('audio/bear-sort/rule-color.mp3');
    expect(getVoiceClipPath('crown-won')).toBe('audio/bear-sort/crown-won.mp3');
    for (const id of BEAR_SORT_CLIP_IDS) {
      expect(getVoiceClipPath(id)).toMatch(/^audio\/bear-sort\/[a-z-]+\.mp3$/);
    }
  });

  it.each(ALL_RULES)('annonce la règle %j par son clip', (rule, clipId) => {
    expect(getRuleClipId(rule)).toBe(clipId);
  });

  it('dit la même chose que le libellé de chaque règle « sauf »', () => {
    for (const [rule, clipId, label] of ALL_RULES) {
      if (rule.kind === 'except') {
        const forbidden = label.replace('Tous les ours, sauf ', '');

        expect(VOICE_SCRIPT[clipId]).toContain(`sauf ${forbidden}.`);
      }
    }
  });

  it('couvre chaque règle du catalogue, sans clip de règle orphelin', () => {
    const catalogClips = new Set(BEAR_SORT_CATALOG.flatMap(rulesOf).map(getRuleClipId));
    const ruleClips = BEAR_SORT_CLIP_IDS.filter((id) => id.startsWith('rule-'));

    for (const clipId of catalogClips) expect(VOICE_SCRIPT).toHaveProperty([clipId]);
    expect([...catalogClips].sort()).toEqual([...ruleClips].sort());
  });
});
