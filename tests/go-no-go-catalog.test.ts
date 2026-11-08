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
  GO_NO_GO_CATALOG,
  validateGoNoGoCatalog,
  VALIDATION_SEEDS,
  type GoNoGoLevel,
} from '@/games/go-no-go/catalog';
import type * as GoNoGoEngine from '@/games/go-no-go/engine';
import {
  createGoNoGoGame,
  getGoNoGoConfigErrors,
  getShownLimit,
  isPerfectWin,
  TRAP_FREE_APPEARANCES,
} from '@/games/go-no-go/engine';
import type * as GoNoGoSimulation from '@/games/go-no-go/simulation';
import {
  getShownCap,
  simulateStar,
  WINNING_PROFILES,
  type ChildProfile,
} from '@/games/go-no-go/simulation';
import type { GoNoGoLevelConfig, GoNoGoRule } from '@/games/go-no-go/types';
import { createSeededRng } from '@/games/logic-grid/generator';
import type { DifficultyTier, GameId, UserProfile } from '@/types/mia';
import { describe, expect, it, vi } from 'vitest';

// Moteur et simulation réels, espionnés : une file défaillante ou une étoile sans fin se simulent
// (défense en profondeur du validateur), une configuration sans anomalie s'instancie toujours.
vi.mock('@/games/go-no-go/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof GoNoGoEngine>();
  return { ...actual, createGoNoGoGame: vi.fn(actual.createGoNoGoGame) };
});
vi.mock('@/games/go-no-go/simulation', async (importOriginal) => {
  const actual = await importOriginal<typeof GoNoGoSimulation>();
  return { ...actual, simulateStar: vi.fn(actual.simulateStar) };
});

type StarRow = [
  id: string,
  tier: DifficultyTier,
  order: number,
  rule: GoNoGoRule,
  appearances: number,
  traps: number,
  stops: number,
  startWindowMs: number,
  fastestWindowMs: number,
  hideouts: 1 | 3,
  decoys: string,
  hasLure: boolean,
  stopDelayCeilingMs: number | null,
  intro: 'full' | 'lure' | null,
];

/** Le tableau des 20 étoiles de FEAT-28 §7, colonne par colonne (fenêtres en ms). */
const SPEC_ROWS: StarRow[] = [
  ['gn-001', 'very_easy', 10, 'owl-says', 12, 3, 0, 2500, 2000, 1, 'fox', false, null, 'full'],
  ['gn-002', 'very_easy', 20, 'owl-says', 16, 4, 0, 2400, 1800, 1, 'fox', false, null, null],
  ['gn-003', 'very_easy', 30, 'owl-says', 16, 4, 0, 2200, 1600, 1, 'fox', false, null, null],
  ['gn-004', 'very_easy', 40, 'owl-says', 20, 5, 0, 2200, 1500, 1, 'fox', false, null, null],
  ['gn-005', 'easy', 10, 'owl-says', 20, 5, 0, 2000, 1400, 3, 'fox', false, null, null],
  ['gn-006', 'easy', 20, 'owl-says', 20, 5, 0, 2000, 1300, 3, 'fox+cat', false, null, null],
  ['gn-007', 'easy', 30, 'owl-says', 24, 5, 0, 1800, 1200, 3, 'fox+cat', false, null, null],
  ['gn-008', 'easy', 40, 'owl-says', 24, 5, 0, 1800, 1100, 3, 'fox+cat', false, null, null],
  ['gn-009', 'medium', 10, 'flies', 16, 4, 0, 2400, 1800, 1, '', false, null, 'full'],
  ['gn-010', 'medium', 20, 'flies', 20, 5, 0, 2200, 1600, 1, '', false, null, null],
  ['gn-011', 'medium', 30, 'flies', 20, 5, 0, 2000, 1400, 1, '', false, null, null],
  ['gn-012', 'medium', 40, 'flies', 24, 6, 0, 1800, 1300, 1, '', false, null, null],
  ['gn-013', 'hard', 10, 'flies', 20, 5, 0, 2000, 1500, 1, '', true, null, 'lure'],
  ['gn-014', 'hard', 20, 'flies', 20, 5, 0, 1800, 1300, 1, '', true, null, null],
  ['gn-015', 'hard', 30, 'flies', 24, 6, 0, 1800, 1200, 1, '', true, null, null],
  ['gn-016', 'hard', 40, 'flies', 24, 5, 0, 1600, 1100, 1, '', true, null, null],
  ['gn-017', 'very_hard', 10, 'late-stop', 20, 0, 5, 1800, 1400, 1, '', false, 300, 'full'],
  ['gn-018', 'very_hard', 20, 'late-stop', 24, 0, 6, 1600, 1300, 1, '', false, 350, null],
  ['gn-019', 'very_hard', 30, 'late-stop', 24, 4, 5, 1800, 1300, 1, '', false, 350, null],
  ['gn-020', 'very_hard', 40, 'late-stop', 28, 5, 6, 1600, 1100, 1, '', false, 400, null],
];

/** Étoile réduite à l'essentiel, pour les cas d'anomalie. */
const BASE_CONFIG: GoNoGoLevelConfig = {
  rule: 'flies',
  appearances: 12,
  traps: 3,
  stops: 0,
  startWindowMs: 2400,
  fastestWindowMs: 1800,
  hideouts: 1,
  decoys: [],
  hasLure: false,
  stopDelayCeilingMs: null,
  intro: null,
  maxTrapRun: 2,
};

/** Valeur que le test sait présente : une absence est une erreur du test, pas un cas à contourner. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('valeur absente');
  return value;
}

function level(
  id: string,
  tier: DifficultyTier,
  order: number,
  config: Partial<GoNoGoLevelConfig> = {},
  gameId: GameId = 'go-no-go',
): GoNoGoLevel {
  return { id, gameId, tier, order, config: { ...BASE_CONFIG, ...config } };
}

function describeRow(config: GoNoGoLevelConfig) {
  return [
    config.rule,
    config.appearances,
    config.traps,
    config.stops,
    config.startWindowMs,
    config.fastestWindowMs,
    config.hideouts,
    config.decoys.join('+'),
    config.hasLure,
    config.stopDelayCeilingMs,
    config.intro,
  ];
}

describe('GO_NO_GO_CATALOG', () => {
  it('publie exactement les 20 étoiles de FEAT-28 §7, dans l’ordre de la carte', () => {
    const rows = GO_NO_GO_CATALOG.map(({ id, tier, order, config }) => [
      id,
      tier,
      order,
      ...describeRow(config),
    ]);
    expect(rows).toEqual(SPEC_ROWS);
  });

  it('donne à chaque étoile un titre court et unique, jamais affiché', () => {
    const titles = GO_NO_GO_CATALOG.map((entry) => entry.title);
    expect(titles.every((title) => typeof title === 'string' && title.length > 0)).toBe(true);
    expect(new Set(titles).size).toBe(20);
  });

  it('remplit les 5 paliers de 4 étoiles chacun, numérotées de 1 à 20', () => {
    const summary = getGameProgressSummary('go-no-go', GO_NO_GO_CATALOG, null);
    expect(summary.tiers.map((tier) => [tier.tier, tier.totalStars])).toEqual(
      DIFFICULTY_TIER_IDS.map((tier) => [tier, 4]),
    );
    expect(summary.allLevels.map((entry) => entry.definition.id)).toEqual(
      GO_NO_GO_CATALOG.map((entry) => entry.id),
    );
    expect(summary.allLevels.map((entry) => entry.starNumber)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });

  it('commence par l’Étoile #1, seule débloquée sans progression', () => {
    const summary = getGameProgressSummary('go-no-go', GO_NO_GO_CATALOG, null);
    expect(summary.nextPlayableLevel?.definition.id).toBe('gn-001');
    expect(
      summary.allLevels.filter((entry) => entry.isUnlocked).map((entry) => entry.definition.id),
    ).toEqual(['gn-001']);
  });

  it('est branché sur le registre des jeux (Hub, Carte des Étoiles, page /go-no-go)', () => {
    expect(GAME_REGISTRY['go-no-go']).toMatchObject({
      id: 'go-no-go',
      title: 'Pas si vite !',
      skill: 'Inhibition & Attention · dès 3 ans',
      path: '/go-no-go',
    });
    expect(GAME_REGISTRY['go-no-go'].catalog).toBe(GO_NO_GO_CATALOG);
    expect(validateLevelCatalog('go-no-go', GAME_REGISTRY['go-no-go'].catalog)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('enseigne une règle par palier : la chouette, « Ça vole ? », le leurre, le STOP tardif', () => {
    const rulesByTier = (tier: DifficultyTier) =>
      new Set(
        GO_NO_GO_CATALOG.filter((entry) => entry.tier === tier).map(
          ({ config }) => `${config.rule}${config.hasLure ? '+leurre' : ''}`,
        ),
      );
    expect(rulesByTier('very_easy')).toEqual(new Set(['owl-says']));
    expect(rulesByTier('easy')).toEqual(new Set(['owl-says']));
    expect(rulesByTier('medium')).toEqual(new Set(['flies']));
    expect(rulesByTier('hard')).toEqual(new Set(['flies+leurre']));
    expect(rulesByTier('very_hard')).toEqual(new Set(['late-stop']));
  });

  it('accélère de plus en plus : aucune vitesse maximale sous 1,1 s, des départs lents aux étoiles nouvelles', () => {
    for (const { config } of GO_NO_GO_CATALOG) {
      expect(config.fastestWindowMs).toBeGreaterThanOrEqual(1100);
      expect(config.startWindowMs).toBeLessThanOrEqual(2500);
      expect(config.startWindowMs).toBeGreaterThanOrEqual(config.fastestWindowMs);
    }
    // Une règle nouvelle repart plus lentement que la dernière étoile de la précédente.
    const byId = new Map(GO_NO_GO_CATALOG.map((entry) => [entry.id, entry.config]));
    expect(byId.get('gn-009')?.startWindowMs).toBeGreaterThan(
      byId.get('gn-008')?.startWindowMs ?? 0,
    );
  });

  it('joue la démo (⭐ 1, 9, 17), la démo courte du leurre (⭐ 13) et le rappel ailleurs', () => {
    expect(
      GO_NO_GO_CATALOG.filter((entry) => entry.config.intro !== null).map((e) => e.id),
    ).toEqual(['gn-001', 'gn-009', 'gn-013', 'gn-017']);
  });

  it('garde 25 % de pièges environ, jamais deux d’affilée aux paliers 1 et 2', () => {
    for (const { tier, config } of GO_NO_GO_CATALOG) {
      const share = (config.traps + config.stops) / config.appearances;
      expect(share).toBeGreaterThanOrEqual(0.2);
      expect(share).toBeLessThanOrEqual(0.4);
      const isEarly = tier === 'very_easy' || tier === 'easy';
      expect(config.maxTrapRun).toBe(isEarly ? 1 : 2);
    }
  });

  it('mêle, aux étoiles 19 et 20, 60 % de cibles simples, 15 à 20 % d’images qui ne volent pas et 20 % de STOP', () => {
    for (const id of ['gn-019', 'gn-020']) {
      const { config } = must(GO_NO_GO_CATALOG.find((entry) => entry.id === id));
      const targets = config.appearances - config.traps - config.stops;
      expect(targets / config.appearances).toBeGreaterThanOrEqual(0.6);
      expect(targets / config.appearances).toBeLessThan(0.65);
      expect(config.traps / config.appearances).toBeGreaterThanOrEqual(0.15);
      expect(config.traps / config.appearances).toBeLessThanOrEqual(0.2);
      expect(config.stops / config.appearances).toBeGreaterThanOrEqual(0.2);
      expect(config.stops / config.appearances).toBeLessThan(0.22);
    }
  });

  it('borne le délai du STOP tardif à 300, 350, 350 et 400 ms', () => {
    expect(
      GO_NO_GO_CATALOG.filter((entry) => entry.config.rule === 'late-stop').map(
        (entry) => entry.config.stopDelayCeilingMs,
      ),
    ).toEqual([300, 350, 350, 400]);
  });

  it.each(GO_NO_GO_CATALOG)('$id : une configuration sans anomalie', ({ config }) => {
    expect(getGoNoGoConfigErrors(config)).toEqual([]);
  });
});

describe('étoiles simulées (FEAT-28 §10)', () => {
  it('chaque enfant du jeu termine chaque étoile, avec plusieurs graines', () => {
    for (const { id, config } of GO_NO_GO_CATALOG) {
      for (const seed of [11, 12, 13]) {
        for (const profile of WINNING_PROFILES) {
          const { status, state } = simulateStar(config, profile, createSeededRng(seed));
          expect(`${id}/${profile}/${String(seed)}/${status}`).toBe(
            `${id}/${profile}/${String(seed)}/won`,
          );
          expect(state.shown).toBeLessThanOrEqual(getShownCap(config.appearances));
        }
      }
    }
  });

  it('l’enfant attentive finit sans une erreur ni une apparition de trop', () => {
    for (const { config } of GO_NO_GO_CATALOG) {
      const { state } = simulateStar(config, 'attentive', createSeededRng(5));
      expect(state).toMatchObject({
        status: 'won',
        shown: config.appearances,
        trapped: 0,
        missed: 0,
        cleared: config.appearances,
      });
      expect(isPerfectWin(state)).toBe(true);
    }
  });

  it('l’enfant qui agit par réflexe finit, mais ne gagne aucune couronne', () => {
    for (const { config } of GO_NO_GO_CATALOG) {
      const { state } = simulateStar(config, 'reflex', createSeededRng(5));
      expect(state.status).toBe('won');
      expect(state.trapped).toBeGreaterThan(0);
      expect(isPerfectWin(state)).toBe(false);
    }
  });

  it('l’enfant qui laisse tout passer ne mène l’étoile nulle part : une cible attend', () => {
    for (const { config } of GO_NO_GO_CATALOG) {
      const { status, state } = simulateStar(config, 'sleeper', createSeededRng(5));
      expect(status).toBe('stalled');
      expect(state.status).not.toBe('won');
      // Trois cibles ratées d'affilée, et la quatrième attend sans limite de temps.
      expect(state.missStreak).toBe(3);
    }
  });

  it('l’enfant qui tape sur tout ne mène l’étoile nulle part non plus', () => {
    for (const { config } of GO_NO_GO_CATALOG) {
      const { status, state } = simulateStar(config, 'tapper', createSeededRng(5));
      expect(status).toBe('capped');
      expect(state.status).not.toBe('won');
      expect(state.shown).toBeGreaterThanOrEqual(getShownCap(config.appearances));
      expect(state.trapped).toBeGreaterThan(config.traps + config.stops);
    }
  });

  it('au-delà de 1,5 fois la longueur prévue, tout attend ou porte l’indice le plus fort', () => {
    const { config } = must(GO_NO_GO_CATALOG[0]);
    const { state } = simulateStar(config, 'tapper', createSeededRng(5));
    expect(state.shown).toBeGreaterThan(getShownLimit(config.appearances));
  });

  it('une étoile ne se simule que par ses profils connus', () => {
    const profiles: ChildProfile[] = [
      'attentive',
      'reflex',
      'passive',
      'alternating',
      'tapper',
      'sleeper',
    ];
    for (const profile of profiles) {
      const { config } = must(GO_NO_GO_CATALOG[0]);
      expect(['won', 'stalled', 'capped']).toContain(
        simulateStar(config, profile, createSeededRng(3)).status,
      );
    }
  });

  it('reproduit la même partie avec la même graine', () => {
    const { config } = must(GO_NO_GO_CATALOG[7]);
    const first = simulateStar(config, 'reflex', createSeededRng(9));
    const second = simulateStar(config, 'reflex', createSeededRng(9));
    expect(second.state).toEqual(first.state);
  });
});

describe('validateGoNoGoCatalog', () => {
  it('valide le catalogue initial, par défaut comme explicitement, et un catalogue vide', () => {
    expect(validateGoNoGoCatalog()).toEqual({ valid: true, errors: [] });
    expect(validateGoNoGoCatalog(GO_NO_GO_CATALOG)).toEqual({ valid: true, errors: [] });
    expect(validateGoNoGoCatalog([])).toEqual({ valid: true, errors: [] });
  });

  it('tire une partie par graine de validation, pour chaque niveau sans anomalie seulement', () => {
    vi.mocked(createGoNoGoGame).mockClear();

    validateGoNoGoCatalog([
      level('gn-001', 'very_easy', 10),
      level('gn-002', 'very_easy', 20, { appearances: 1 }),
    ]);

    // Une file par graine, puis une partie par enfant simulé et par graine.
    const perSeed = 1 + WINNING_PROFILES.length;
    expect(vi.mocked(createGoNoGoGame)).toHaveBeenCalledTimes(VALIDATION_SEEDS.length * perSeed);
    expect(vi.mocked(createGoNoGoGame).mock.calls.map(([config]) => config)).toEqual(
      Array.from({ length: VALIDATION_SEEDS.length * perSeed }, () => BASE_CONFIG),
    );
  });

  it('reprend les règles communes : identifiant en double, jeu et order déjà pris', () => {
    const catalog = [
      level('gn-001', 'very_easy', 10),
      level('gn-001', 'very_easy', 10),
      level('mem-001', 'easy', 10, {}, 'memory'),
    ];

    expect(validateGoNoGoCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 2 « gn-001 » : identifiant en double',
        'niveau n° 2 « gn-001 » : order 10 déjà pris par « gn-001 » dans le palier « very_easy »',
        'niveau n° 3 « mem-001 » : niveau du jeu « memory » au lieu de « go-no-go »',
      ],
    });
  });

  it('signale chaque anomalie de configuration, préfixée du nom du niveau', () => {
    const catalog = [
      level('gn-001', 'very_easy', 10, { traps: 0 }),
      level('gn-002', 'very_easy', 20, { startWindowMs: 3500 }),
      level('gn-003', 'very_easy', 30, {
        rule: 'owl-says',
        decoys: ['fox'],
        maxTrapRun: 1,
        hasLure: true,
      }),
    ];

    expect(validateGoNoGoCatalog(catalog)).toEqual({
      valid: false,
      errors: [
        'niveau n° 1 « gn-001 » : aucun piège ni STOP tardif : il n’y aurait rien à retenir',
        'niveau n° 2 « gn-002 » : startWindowMs 3500 au-delà de 3000 ms',
        'niveau n° 3 « gn-003 » : hasLure : le leurre de la chouette est celui de la règle « flies »',
      ],
    });
  });

  it('signale un niveau dont aucune file ne peut être tirée, pour chaque graine', () => {
    vi.mocked(createGoNoGoGame).mockImplementation(() => {
      throw new Error('tirage impossible');
    });
    try {
      const result = validateGoNoGoCatalog([level('gn-001', 'very_easy', 10)]);
      expect(result.errors).toEqual(
        VALIDATION_SEEDS.map(
          (seed) =>
            `niveau n° 1 « gn-001 » : graine ${String(seed)} : instanciation impossible : tirage impossible`,
        ),
      );
    } finally {
      vi.mocked(createGoNoGoGame).mockRestore();
    }
  });

  it('nomme une erreur qui n’est pas une Error', () => {
    vi.mocked(createGoNoGoGame).mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- une valeur levée quelconque
      throw 'oups';
    });
    const result = validateGoNoGoCatalog([level('gn-001', 'very_easy', 10)]);
    expect(result.errors).toEqual([
      'niveau n° 1 « gn-001 » : graine 1 : instanciation impossible : oups',
    ]);
  });

  describe('file défaillante', () => {
    /** Une file valide dont une apparition est remplacée, pour la première graine seulement. */
    function withBrokenQueue(
      config: GoNoGoLevelConfig,
      edit: (
        queue: ReturnType<typeof createGoNoGoGame>['queue'],
      ) => ReturnType<typeof createGoNoGoGame>['queue'],
    ): string[] {
      const actual = vi.mocked(createGoNoGoGame).getMockImplementation();
      vi.mocked(createGoNoGoGame).mockImplementationOnce((levelConfig, rng) => {
        const game = (actual as typeof createGoNoGoGame)(levelConfig, rng);
        return { ...game, queue: edit(game.queue) };
      });
      return validateGoNoGoCatalog([{ ...level('gn-001', 'very_easy', 10), config }]).errors;
    }

    it('signale un nombre d’apparitions, de pièges ou de STOP qui n’est pas celui de l’étoile', () => {
      const errors = withBrokenQueue(BASE_CONFIG, (queue) =>
        queue
          .slice(0, -1)
          .map((entry) => (entry.kind === 'trap' ? { ...entry, kind: 'target' } : entry)),
      );
      expect(errors.join('\n')).toContain('graine 1 : 11 apparitions tirées au lieu de 12');
      expect(errors.join('\n')).toContain('0 pièges tirés au lieu de 3');
    });

    it('signale des STOP tirés en trop', () => {
      const errors = withBrokenQueue(BASE_CONFIG, (queue) =>
        queue.map((entry, index) => (index === 5 ? { ...entry, kind: 'stop' } : entry)),
      );
      expect(errors.join('\n')).toContain('1 STOP tirés au lieu de 0');
    });

    it('signale un piège dans les premières apparitions', () => {
      const errors = withBrokenQueue(BASE_CONFIG, (queue) => {
        const trap = queue.find((entry) => entry.kind === 'trap');
        return trap ? [trap, ...queue.filter((entry) => entry !== trap)] : queue;
      });
      expect(errors.join('\n')).toContain(
        `un piège dans les ${String(TRAP_FREE_APPEARANCES)} premières apparitions`,
      );
    });

    it('signale trop de pièges d’affilée', () => {
      const errors = withBrokenQueue({ ...BASE_CONFIG, maxTrapRun: 1 }, (queue) => {
        const traps = queue.filter((entry) => entry.kind === 'trap');
        const targets = queue.filter((entry) => entry.kind === 'target');
        return [...targets.slice(0, 5), ...traps, ...targets.slice(5)];
      });
      expect(errors.join('\n')).toContain('plus de 1 pièges d’affilée');
    });

    it('signale une image qui se répète, ou qui ne convient pas à son genre', () => {
      const repeated = withBrokenQueue(BASE_CONFIG, (queue) =>
        queue.map((entry, index) => (index < 2 ? { ...entry, subject: 'bee' as const } : entry)),
      );
      expect(repeated.join('\n')).toContain('« bee » deux fois de suite');
      const wrong = withBrokenQueue(BASE_CONFIG, (queue) =>
        queue.map((entry, index) => (index === 0 ? { ...entry, subject: 'cow' as const } : entry)),
      );
      expect(wrong.join('\n')).toContain('« cow » ne convient pas à une apparition « target »');
      const wrongTrap = withBrokenQueue(BASE_CONFIG, (queue) => {
        let done = false;
        return queue.map((entry) => {
          if (entry.kind !== 'trap' || done) return entry;
          done = true;
          return { ...entry, subject: 'bee' as const };
        });
      });
      expect(wrongTrap.join('\n')).toContain('« bee » ne convient pas à une apparition « trap »');
    });

    it('signale, à la règle 1, un personnage qui n’est pas celui de son genre', () => {
      const owl: GoNoGoLevelConfig = {
        ...BASE_CONFIG,
        rule: 'owl-says',
        decoys: ['fox'],
        maxTrapRun: 1,
      };
      const wrongTarget = withBrokenQueue(owl, (queue) =>
        queue.map((entry, index) => (index === 0 ? { ...entry, subject: 'fox' as const } : entry)),
      );
      expect(wrongTarget.join('\n')).toContain(
        '« fox » ne convient pas à une apparition « target »',
      );
      const wrongDecoy = withBrokenQueue(owl, (queue) => {
        let done = false;
        return queue.map((entry) => {
          if (entry.kind !== 'trap' || done) return entry;
          done = true;
          return { ...entry, subject: 'cat' as const };
        });
      });
      expect(wrongDecoy.join('\n')).toContain('« cat » ne convient pas à une apparition « trap »');
    });

    it('signale une cachette hors du castelet, ou la même deux fois de suite', () => {
      const owl: GoNoGoLevelConfig = {
        ...BASE_CONFIG,
        rule: 'owl-says',
        decoys: ['fox'],
        maxTrapRun: 1,
        hideouts: 3,
      };
      const out = withBrokenQueue(owl, (queue) =>
        queue.map((entry, index) => (index === 4 ? { ...entry, hideout: 3 } : entry)),
      );
      expect(out.join('\n')).toContain('cachette 3 hors du castelet');
      const same = withBrokenQueue(owl, (queue) =>
        queue.map((entry, index) =>
          index === 1 ? { ...entry, hideout: queue[0]?.hideout ?? 0 } : entry,
        ),
      );
      expect(same.join('\n')).toContain('la même cachette deux fois de suite');
      const single = withBrokenQueue(BASE_CONFIG, (queue) =>
        queue.map((entry, index) => (index === 4 ? { ...entry, hideout: 1 } : entry)),
      );
      expect(single.join('\n')).toContain('cachette 1 hors du castelet');
    });
  });

  describe('enfants simulés', () => {
    it('signale une étoile qu’un enfant du jeu ne termine pas', () => {
      vi.mocked(simulateStar).mockImplementationOnce((config, _profile, rng) => {
        const result = simulateStar(config, 'attentive', rng);
        return { status: 'capped', state: result.state };
      });
      const { errors } = validateGoNoGoCatalog([level('gn-001', 'very_easy', 10)]);
      expect(errors).toEqual([
        expect.stringMatching(
          /^niveau n° 1 « gn-001 » : graine 1 : l’enfant « attentive » ne termine pas l’étoile \(12 apparitions montrées\)$/,
        ),
      ]);
    });

    it('signale une étoile que l’enfant attentive ne finit pas sans erreur', () => {
      vi.mocked(simulateStar).mockImplementationOnce((config, _profile, rng) => {
        const result = simulateStar(config, 'attentive', rng);
        return { status: 'won', state: { ...result.state, missed: 1 } };
      });
      const { errors } = validateGoNoGoCatalog([level('gn-001', 'very_easy', 10)]);
      expect(errors).toEqual([
        'niveau n° 1 « gn-001 » : graine 1 : l’enfant attentive ne finit pas sans erreur',
      ]);
    });
  });
});

describe('Progression sous gamesProgress["go-no-go"]', () => {
  const COMPLETED_AT = '2026-10-01T09:00:00.000Z';

  /** La vitesse tenue est enregistrée en secondes décimales : le stockage doit la garder telle quelle. */
  const progress = {
    gameId: 'go-no-go',
    levels: {
      'gn-001': {
        levelId: 'gn-001',
        completed: true,
        isPerfect: true,
        bestMoves: 0,
        bestTimeSeconds: 1.23,
        timesPlayed: 2,
        completedAt: COMPLETED_AT,
      },
    },
    lastPlayedLevelId: 'gn-001',
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

  it('survit à la relecture de la sauvegarde, vitesse décimale comprise : aucune donnée nouvelle', () => {
    const report = parseSaveStateReport(saveWith({ 'go-no-go': progress }));

    expect(report.issues).toEqual([]);
    expect(report.state.profiles[0]?.gamesProgress).toEqual({ 'go-no-go': progress });
  });

  it('débloque l’étoile suivante du catalogue', () => {
    const report = parseSaveStateReport(saveWith({ 'go-no-go': progress }));
    const profile: UserProfile | undefined = report.state.profiles[0];
    const summary = getGameProgressSummary('go-no-go', GO_NO_GO_CATALOG, profile ?? null);

    expect(summary).toMatchObject({ earnedStars: 1, perfectCount: 1 });
    expect(summary.nextPlayableLevel?.definition.id).toBe('gn-002');
  });
});
