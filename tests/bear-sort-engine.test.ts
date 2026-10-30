// @vitest-environment node
import {
  BEAR_KINDS,
  continueAfterStop,
  createBearSortGame,
  dropBear,
  getBearSortConfigErrors,
  getFadedFeature,
  getHintLevel,
  getNextBearUid,
  getTargetZoneId,
  getUpcomingRule,
  isBearForbidden,
  isConflictBear,
  isPerfectWin,
} from '@/games/bear-sort/engine';
import type {
  Bear,
  BearCounts,
  BearKind,
  BearSortLevelConfig,
  BearSortPhaseConfig,
  BearSortRule,
  BearSortState,
  BearSortZone,
  BearSortZoneId,
  BearTraits,
} from '@/games/bear-sort/types';
import type { Rng } from '@/games/memory/random';
import { describe, expect, it } from 'vitest';

/** Tirage toujours nul : chaque mélange conserve l'ordre (les ours dans l'ordre de `BEAR_KINDS`). */
const FIRST: Rng = () => 0;

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

const SMALL_BLUE: BearTraits = { color: 'blue', size: 'small' };
const BIG_BLUE: BearTraits = { color: 'blue', size: 'big' };
const SMALL_YELLOW: BearTraits = { color: 'yellow', size: 'small' };
const BIG_YELLOW: BearTraits = { color: 'yellow', size: 'big' };

const BY_COLOR: BearSortRule = { kind: 'sort', feature: 'color' };
const BY_SIZE: BearSortRule = { kind: 'sort', feature: 'size' };
const EXCEPT_BLUE: BearSortRule = { kind: 'except', forbidden: { color: 'blue' } };
const EXCEPT_BIG: BearSortRule = { kind: 'except', forbidden: { size: 'big' } };
const EXCEPT_SMALL_BLUE: BearSortRule = {
  kind: 'except',
  forbidden: { color: 'blue', size: 'small' },
};

/** Petite boîte bleue à gauche, grande boîte jaune à droite : le grand bleu et le petit jaune sont en conflit. */
const ZONES: BearSortLevelConfig['zones'] = [SMALL_BLUE, BIG_YELLOW];

const ONE_OF_EACH: BearCounts = {
  'blue-small': 1,
  'blue-big': 1,
  'yellow-small': 1,
  'yellow-big': 1,
};

function phase(
  rule: BearSortRule,
  addBears: BearCounts = ONE_OF_EACH,
  placements: number | null = null,
): BearSortPhaseConfig {
  return { rule, addBears, placements };
}

function level(...phases: BearSortPhaseConfig[]): BearSortLevelConfig {
  return { zones: ZONES, phases, showGestureHint: false };
}

/** Une seule phase, par couleur, jouée jusqu'au bout. */
const ONE_PHASE = level(phase(BY_COLOR));

/** Par couleur (4 ours, 3 à ranger, 1 attend), puis par taille (4 de plus, tous à ranger). */
const TWO_PHASES = level(phase(BY_COLOR, ONE_OF_EACH, 3), phase(BY_SIZE));

/** Aller-retour : couleur, taille, couleur. 12 ours en tout, 2 attendent au second STOP. */
const THREE_PHASES = level(
  phase(BY_COLOR, ONE_OF_EACH, 3),
  phase(BY_SIZE, ONE_OF_EACH, 3),
  phase(BY_COLOR),
);

/** Par couleur, puis tous sauf les bleus : les ours bleus restent à la fin. */
const THEN_EXCEPT = level(phase(BY_COLOR, ONE_OF_EACH, 3), phase(EXCEPT_BLUE));

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function uidsOf(bears: readonly Bear[]): string[] {
  return bears.map((bear) => bear.uid);
}

function kindOf({ color, size }: BearTraits): BearKind {
  return `${color}-${size}`;
}

function kindsOf(bears: readonly Bear[]): BearKind[] {
  return bears.map(kindOf);
}

function zoneOf(state: BearSortState, id: BearSortZoneId): BearSortZone {
  const zone = state.zones.find((candidate) => candidate.id === id);
  if (!zone) throw new Error(`boîte « ${id} » absente de la phase`);
  return zone;
}

function bearOf(state: BearSortState, kind: BearKind): Bear {
  const bear = state.reserve.find((candidate) => kindOf(candidate) === kind);
  if (!bear) throw new Error(`aucun ours « ${kind} » dans la réserve`);
  return bear;
}

/** Dépose le premier ours d'une sorte dans une boîte. */
function drop(state: BearSortState, kind: BearKind, zoneId: BearSortZoneId): BearSortState {
  return dropBear(state, bearOf(state, kind).uid, zoneId);
}

/** Range le premier ours de la réserve que sa boîte accepte. */
function placeNext(state: BearSortState): BearSortState {
  for (const bear of state.reserve) {
    const zoneId = getTargetZoneId(state, bear);
    if (zoneId) return dropBear(state, bear.uid, zoneId);
  }
  throw new Error('aucun ours à ranger');
}

/** Range des ours sans erreur jusqu'à la fin de la phase (STOP ou victoire). */
function finishPhase(state: BearSortState): BearSortState {
  let current = state;
  while (current.status === 'playing') current = placeNext(current);
  return current;
}

/** Passe le STOP de la phase en cours, sans mélange. */
function nextPhase(state: BearSortState): BearSortState {
  return continueAfterStop(finishPhase(state), FIRST);
}

/** Répète le même dépôt : chaque rebond laisse l'ours dans la réserve. */
function bounceTimes(
  state: BearSortState,
  count: number,
  kind: BearKind,
  zoneId: BearSortZoneId,
): BearSortState {
  let current = state;
  for (let bounce = 0; bounce < count; bounce += 1) current = drop(current, kind, zoneId);
  return current;
}

describe('BEAR_KINDS', () => {
  it('liste les quatre sortes d’ours, dans l’ordre de création', () => {
    expect(BEAR_KINDS).toEqual(['blue-small', 'blue-big', 'yellow-small', 'yellow-big']);
  });
});

describe('isConflictBear', () => {
  it.each<[string, BearSortLevelConfig['zones'], BearTraits[], BearTraits[]]>([
    ['petite bleue, grande jaune', ZONES, [BIG_BLUE, SMALL_YELLOW], [SMALL_BLUE, BIG_YELLOW]],
    [
      'grande jaune, petite bleue',
      [BIG_YELLOW, SMALL_BLUE],
      [BIG_BLUE, SMALL_YELLOW],
      [SMALL_BLUE, BIG_YELLOW],
    ],
    [
      'grande bleue, petite jaune',
      [BIG_BLUE, SMALL_YELLOW],
      [SMALL_BLUE, BIG_YELLOW],
      [BIG_BLUE, SMALL_YELLOW],
    ],
    [
      'petite jaune, grande bleue',
      [SMALL_YELLOW, BIG_BLUE],
      [SMALL_BLUE, BIG_YELLOW],
      [BIG_BLUE, SMALL_YELLOW],
    ],
  ])('repère les ours que les deux règles séparent (%s)', (_, zones, conflicts, others) => {
    for (const bear of conflicts) expect(isConflictBear(zones, bear), kindOf(bear)).toBe(true);
    for (const bear of others) expect(isConflictBear(zones, bear), kindOf(bear)).toBe(false);
  });
});

describe('isBearForbidden', () => {
  it('n’interdit aucun ours avec une règle de tri', () => {
    for (const bear of [SMALL_BLUE, BIG_BLUE, SMALL_YELLOW, BIG_YELLOW]) {
      expect(isBearForbidden(BY_COLOR, bear)).toBe(false);
      expect(isBearForbidden(BY_SIZE, bear)).toBe(false);
    }
  });

  it('interdit tous les ours d’une couleur, quelle que soit leur taille', () => {
    expect(isBearForbidden(EXCEPT_BLUE, SMALL_BLUE)).toBe(true);
    expect(isBearForbidden(EXCEPT_BLUE, BIG_BLUE)).toBe(true);
    expect(isBearForbidden(EXCEPT_BLUE, SMALL_YELLOW)).toBe(false);
    expect(isBearForbidden(EXCEPT_BLUE, BIG_YELLOW)).toBe(false);
  });

  it('interdit tous les ours d’une taille, quelle que soit leur couleur', () => {
    expect(isBearForbidden(EXCEPT_BIG, BIG_BLUE)).toBe(true);
    expect(isBearForbidden(EXCEPT_BIG, BIG_YELLOW)).toBe(true);
    expect(isBearForbidden(EXCEPT_BIG, SMALL_BLUE)).toBe(false);
    expect(isBearForbidden(EXCEPT_BIG, SMALL_YELLOW)).toBe(false);
  });

  it('n’interdit que l’ours qui porte les deux caractéristiques : les faux amis restent permis', () => {
    expect(isBearForbidden(EXCEPT_SMALL_BLUE, SMALL_BLUE)).toBe(true);
    expect(isBearForbidden(EXCEPT_SMALL_BLUE, BIG_BLUE)).toBe(false);
    expect(isBearForbidden(EXCEPT_SMALL_BLUE, SMALL_YELLOW)).toBe(false);
    expect(isBearForbidden(EXCEPT_SMALL_BLUE, BIG_YELLOW)).toBe(false);
  });
});

describe('getBearSortConfigErrors', () => {
  it.each<[string, BearSortLevelConfig]>([
    ['une seule phase', ONE_PHASE],
    ['deux phases', TWO_PHASES],
    ['un aller-retour entre les règles', THREE_PHASES],
    ['une règle « sauf » pour finir', THEN_EXCEPT],
    ['une règle « sauf » seule', level(phase(EXCEPT_BIG))],
    ['une règle « sauf » sur deux caractéristiques', level(phase(EXCEPT_SMALL_BLUE))],
    [
      'un seul ours en conflit après le changement',
      level(phase(BY_COLOR, ONE_OF_EACH, 3), phase(BY_SIZE, { 'blue-big': 1, 'blue-small': 1 })),
    ],
    [
      'les ours en attente à ranger tous sauf un',
      level(phase(BY_COLOR, ONE_OF_EACH, 3), phase(BY_SIZE, ONE_OF_EACH, 4), phase(BY_COLOR)),
    ],
    [
      'des boîtes déclarées dans l’autre sens',
      { zones: [BIG_YELLOW, SMALL_BLUE], phases: [phase(BY_SIZE)], showGestureHint: true },
    ],
  ])('accepte %s', (_, config) => {
    expect(getBearSortConfigErrors(config)).toEqual([]);
  });

  it.each<[string, BearSortLevelConfig['zones'], string[]]>([
    [
      'deux boîtes de la même couleur',
      [SMALL_BLUE, BIG_BLUE],
      ['les deux boîtes sont de couleur blue'],
    ],
    [
      'deux boîtes de la même taille',
      [SMALL_BLUE, SMALL_YELLOW],
      ['les deux boîtes sont de taille small'],
    ],
    [
      'deux boîtes identiques',
      [BIG_YELLOW, BIG_YELLOW],
      ['les deux boîtes sont de couleur yellow', 'les deux boîtes sont de taille big'],
    ],
  ])('signale : %s', (_, zones, errors) => {
    expect(getBearSortConfigErrors({ ...level(phase(BY_SIZE)), zones })).toEqual(errors);
  });

  it('signale une étoile sans phase', () => {
    expect(getBearSortConfigErrors(level())).toEqual(['aucune phase']);
  });

  it.each<[string, BearCounts, string]>([
    ['décimal', { 'blue-small': 1.5 }, 'blue-small : 1.5 ours'],
    ['négatif', { 'yellow-big': -1, 'yellow-small': 2 }, 'yellow-big : -1 ours'],
    ['NaN', { 'blue-big': Number.NaN }, 'blue-big : NaN ours'],
    ['infini', { 'yellow-small': Infinity }, 'yellow-small : Infinity ours'],
  ])('signale un nombre d’ours %s', (_, counts, message) => {
    expect(getBearSortConfigErrors(level(phase(BY_COLOR, { ...ONE_OF_EACH, ...counts })))).toEqual([
      `phase 1 : ${message} (entier ≥ 0 attendu)`,
    ]);
  });

  it('accepte zéro ours d’une sorte, comme une sorte absente', () => {
    const counts: BearCounts = { 'blue-small': 0, 'blue-big': 2, 'yellow-big': 2 };

    expect(getBearSortConfigErrors(level(phase(BY_COLOR, counts)))).toEqual([]);
  });

  it.each<[string, BearSortRule, BearCounts, string]>([
    ['boîte de droite vide, par couleur', BY_COLOR, { 'blue-small': 2, 'blue-big': 2 }, 'color'],
    [
      'boîte de gauche vide, par couleur',
      BY_COLOR,
      { 'yellow-small': 1, 'yellow-big': 1 },
      'color',
    ],
    ['boîte de droite vide, par taille', BY_SIZE, { 'blue-small': 2, 'yellow-small': 2 }, 'size'],
    ['boîte de gauche vide, par taille', BY_SIZE, { 'blue-big': 1, 'yellow-big': 1 }, 'size'],
    ['aucun ours', BY_COLOR, {}, 'color'],
  ])('exige de quoi remplir les deux boîtes : %s', (_, rule, counts, feature) => {
    expect(getBearSortConfigErrors(level(phase(rule, counts)))).toEqual([
      `phase 1 : les ours ajoutés ne remplissent pas les deux boîtes (tri par ${feature})`,
    ]);
  });

  it('refuse deux phases de suite avec la même règle', () => {
    expect(
      getBearSortConfigErrors(level(phase(BY_COLOR, ONE_OF_EACH, 2), phase(BY_COLOR))),
    ).toEqual(['phase 2 : même règle que la phase précédente (tri par color)']);
    expect(getBearSortConfigErrors(level(phase(BY_SIZE, ONE_OF_EACH, 2), phase(BY_SIZE)))).toEqual([
      'phase 2 : même règle que la phase précédente (tri par size)',
    ]);
  });

  it('exige un ours en conflit parmi ceux ajoutés après un changement de règle', () => {
    const noConflict: BearCounts = { 'blue-small': 2, 'yellow-big': 2 };

    expect(
      getBearSortConfigErrors(level(phase(BY_COLOR, ONE_OF_EACH, 2), phase(BY_SIZE, noConflict))),
    ).toEqual(['phase 2 : aucun ours en conflit après le changement de règle']);
    // Sans changement de règle, la première phase n'a pas à en montrer.
    expect(getBearSortConfigErrors(level(phase(BY_SIZE, noConflict)))).toEqual([]);
  });

  it('réserve la règle « sauf » à la dernière phase', () => {
    expect(
      getBearSortConfigErrors(level(phase(EXCEPT_BLUE, ONE_OF_EACH, 2), phase(BY_COLOR))),
    ).toEqual(['phase 1 : une règle « sauf » termine toujours l’étoile']);
  });

  it.each<[string, BearSortRule, BearCounts, string[]]>([
    ['sans ours interdit', EXCEPT_BLUE, { 'yellow-small': 2 }, ['aucun ours interdit ajouté']],
    ['sans ours permis', EXCEPT_BLUE, { 'blue-small': 2 }, ['aucun ours permis ajouté']],
    ['sans aucun ours', EXCEPT_BIG, {}, ['aucun ours interdit ajouté', 'aucun ours permis ajouté']],
    [
      'sans l’ours interdit, même avec ses faux amis',
      EXCEPT_SMALL_BLUE,
      { 'blue-big': 1, 'yellow-small': 1 },
      ['aucun ours interdit ajouté'],
    ],
  ])(
    'exige un ours permis et un ours interdit dans la règle « sauf » : %s',
    (_, rule, counts, errors) => {
      expect(getBearSortConfigErrors(level(phase(rule, counts)))).toEqual(
        errors.map((error) => `phase 1 : ${error}`),
      );
    },
  );

  it('accepte un ours interdit et ses faux amis, seuls ours permis de la règle « sauf »', () => {
    expect(
      getBearSortConfigErrors(level(phase(EXCEPT_SMALL_BLUE, { 'blue-small': 1, 'blue-big': 1 }))),
    ).toEqual([]);
  });

  it('fait jouer la dernière phase jusqu’au bout', () => {
    expect(getBearSortConfigErrors(level(phase(BY_COLOR, ONE_OF_EACH, 2)))).toEqual([
      'phase 1 : la dernière phase se joue jusqu’au bout (placements null)',
    ]);
    expect(getBearSortConfigErrors(level(phase(EXCEPT_BLUE, ONE_OF_EACH, 2)))).toEqual([
      'phase 1 : la dernière phase se joue jusqu’au bout (placements null)',
    ]);
  });

  it.each([null, 0, -1, 1.5, Number.NaN])(
    'exige un nombre entier de dépôts avant un STOP (placements %s)',
    (placements) => {
      expect(
        getBearSortConfigErrors(level(phase(BY_COLOR, ONE_OF_EACH, placements), phase(BY_SIZE))),
      ).toEqual([
        `phase 1 : placements ${String(placements)} invalide (entier ≥ 1 attendu avant un STOP)`,
      ]);
    },
  );

  it.each([4, 5])(
    'exige que le STOP interrompe des ours qui attendent (placements %i)',
    (placements) => {
      expect(
        getBearSortConfigErrors(level(phase(BY_COLOR, ONE_OF_EACH, placements), phase(BY_SIZE))),
      ).toEqual([
        `phase 1 : placements ${String(placements)} : le STOP doit interrompre des ours qui attendent (4 dans la réserve)`,
      ]);
    },
  );

  it('suit la réserve d’une phase à l’autre, ours restés compris', () => {
    // Après la phase 1, 1 ours attend : 5 dans la réserve au début de la phase 2.
    expect(
      getBearSortConfigErrors(
        level(phase(BY_COLOR, ONE_OF_EACH, 3), phase(BY_SIZE, ONE_OF_EACH, 5), phase(BY_COLOR)),
      ),
    ).toEqual([
      'phase 2 : placements 5 : le STOP doit interrompre des ours qui attendent (5 dans la réserve)',
    ]);
  });

  it('liste les boîtes, puis chaque phase dans l’ordre, en nommant la phase', () => {
    const config: BearSortLevelConfig = {
      zones: [SMALL_BLUE, SMALL_YELLOW],
      phases: [
        phase(BY_COLOR, { 'blue-small': -2, 'blue-big': 3, 'yellow-big': 2 }, 1),
        phase(BY_COLOR, {}, 2),
        phase(EXCEPT_BLUE, { 'blue-big': 1 }, 2),
      ],
      showGestureHint: false,
    };

    expect(getBearSortConfigErrors(config)).toEqual([
      'les deux boîtes sont de taille small',
      'phase 1 : blue-small : -2 ours (entier ≥ 0 attendu)',
      'phase 2 : les ours ajoutés ne remplissent pas les deux boîtes (tri par color)',
      'phase 2 : même règle que la phase précédente (tri par color)',
      'phase 2 : placements 2 : le STOP doit interrompre des ours qui attendent (2 dans la réserve)',
      'phase 3 : aucun ours permis ajouté',
      'phase 3 : la dernière phase se joue jusqu’au bout (placements null)',
    ]);
  });

  it('ne modifie pas la configuration reçue', () => {
    const config = deepFreeze(level(phase(BY_COLOR, ONE_OF_EACH, 9), phase(BY_COLOR, {})));

    expect(() => getBearSortConfigErrors(config)).not.toThrow();
  });
});

describe('createBearSortGame', () => {
  it('démarre à la première phase : réserve pleine, boîtes vides, compteurs à zéro', () => {
    const game = createBearSortGame(TWO_PHASES, FIRST);

    expect(game).toEqual({
      config: TWO_PHASES,
      status: 'playing',
      phaseIndex: 0,
      rule: BY_COLOR,
      previousRule: null,
      placementsLeft: 3,
      reserve: [
        { ...SMALL_BLUE, uid: '0-0' },
        { ...BIG_BLUE, uid: '0-1' },
        { ...SMALL_YELLOW, uid: '0-2' },
        { ...BIG_YELLOW, uid: '0-3' },
      ],
      zones: [
        { id: 'left', traits: SMALL_BLUE, bears: [] },
        { id: 'right', traits: BIG_YELLOW, bears: [] },
      ],
      moves: 0,
      mistakes: 0,
      errorStreak: 0,
      lastBounce: null,
    });
    expect(game.config).toBe(TWO_PHASES);
  });

  it('crée autant d’ours que demandé par sorte, dans l’ordre de BEAR_KINDS avant mélange', () => {
    const counts: BearCounts = { 'yellow-big': 2, 'blue-small': 1, 'blue-big': 0 };
    const game = createBearSortGame(level(phase(BY_COLOR, counts)), FIRST);

    expect(game.reserve).toEqual([
      { ...SMALL_BLUE, uid: '0-0' },
      { ...BIG_YELLOW, uid: '0-1' },
      { ...BIG_YELLOW, uid: '0-2' },
    ]);
  });

  it('garde les boîtes dans l’ordre déclaré, de gauche à droite', () => {
    const game = createBearSortGame(
      { zones: [BIG_YELLOW, SMALL_BLUE], phases: [phase(BY_SIZE)], showGestureHint: false },
      FIRST,
    );

    expect(game.zones).toEqual([
      { id: 'left', traits: BIG_YELLOW, bears: [] },
      { id: 'right', traits: SMALL_BLUE, bears: [] },
    ]);
  });

  it('n’ouvre qu’une boîte neutre quand l’étoile commence par une règle « sauf »', () => {
    const game = createBearSortGame(level(phase(EXCEPT_BLUE)), FIRST);

    expect(game.zones).toEqual([{ id: 'open', traits: null, bears: [] }]);
    expect(game.placementsLeft).toBeNull();
  });

  it('mélange la réserve avec le rng injecté, de façon reproductible', () => {
    const config = level(
      phase(BY_COLOR, { 'blue-small': 4, 'blue-big': 4, 'yellow-small': 4, 'yellow-big': 4 }),
    );
    const sorted = createBearSortGame(config, FIRST);
    const shuffled = createBearSortGame(config, seeded(42));

    expect(uidsOf(shuffled.reserve)).not.toEqual(uidsOf(sorted.reserve));
    expect(uidsOf(shuffled.reserve).sort()).toEqual(uidsOf(sorted.reserve).sort());
    expect(createBearSortGame(config, seeded(42))).toEqual(shuffled);
    expect(uidsOf(createBearSortGame(config, seeded(43)).reserve)).not.toEqual(
      uidsOf(shuffled.reserve),
    );
  });

  it('reste dans les bornes avec un générateur défaillant (1, négatif, NaN)', () => {
    for (const rng of [() => 1, () => -0.5, () => Number.NaN]) {
      const game = createBearSortGame(ONE_PHASE, rng);

      expect(new Set(uidsOf(game.reserve)).size).toBe(4);
    }
  });

  it('tire au hasard avec Math.random par défaut', () => {
    expect(createBearSortGame(ONE_PHASE).reserve).toHaveLength(4);
  });

  it('lève une erreur listant les anomalies d’une configuration invalide', () => {
    expect(() => createBearSortGame(level())).toThrow(
      'Configuration Attrape-Piège invalide : aucune phase',
    );
    expect(() =>
      createBearSortGame({ ...level(phase(BY_COLOR, {})), zones: [SMALL_BLUE, BIG_BLUE] }),
    ).toThrow(
      'Configuration Attrape-Piège invalide : les deux boîtes sont de couleur blue ; phase 1 : les ours ajoutés ne remplissent pas les deux boîtes (tri par color)',
    );
  });

  it('garde la configuration reçue sans la modifier', () => {
    const config = deepFreeze(level(phase(BY_COLOR)));

    expect(createBearSortGame(config, seeded(1)).config).toBe(config);
  });
});

describe('getTargetZoneId', () => {
  it('suit la couleur avec une règle de tri par couleur', () => {
    const game = createBearSortGame(level(phase(BY_COLOR)), FIRST);

    expect(getTargetZoneId(game, SMALL_BLUE)).toBe('left');
    expect(getTargetZoneId(game, BIG_BLUE)).toBe('left');
    expect(getTargetZoneId(game, SMALL_YELLOW)).toBe('right');
    expect(getTargetZoneId(game, BIG_YELLOW)).toBe('right');
  });

  it('suit la taille avec une règle de tri par taille', () => {
    const game = createBearSortGame(level(phase(BY_SIZE)), FIRST);

    expect(getTargetZoneId(game, SMALL_BLUE)).toBe('left');
    expect(getTargetZoneId(game, SMALL_YELLOW)).toBe('left');
    expect(getTargetZoneId(game, BIG_BLUE)).toBe('right');
    expect(getTargetZoneId(game, BIG_YELLOW)).toBe('right');
  });

  it('suit les boîtes telles que déclarées, pas un côté fixe', () => {
    const game = createBearSortGame(
      { zones: [BIG_YELLOW, SMALL_BLUE], phases: [phase(BY_COLOR)], showGestureHint: false },
      FIRST,
    );

    expect(getTargetZoneId(game, SMALL_YELLOW)).toBe('left');
    expect(getTargetZoneId(game, BIG_BLUE)).toBe('right');
  });

  it('envoie un ours permis dans la boîte ouverte et ne donne aucune boîte à un ours interdit', () => {
    const game = createBearSortGame(level(phase(EXCEPT_SMALL_BLUE)), FIRST);

    expect(getTargetZoneId(game, SMALL_BLUE)).toBeNull();
    expect(getTargetZoneId(game, BIG_BLUE)).toBe('open');
    expect(getTargetZoneId(game, SMALL_YELLOW)).toBe('open');
    expect(getTargetZoneId(game, BIG_YELLOW)).toBe('open');
  });
});

describe('dropBear', () => {
  it('range l’ours dans la bonne boîte et le retire de la réserve', () => {
    const game = createBearSortGame(TWO_PHASES, FIRST);

    const next = dropBear(game, '0-2', 'right');

    expect(uidsOf(next.reserve)).toEqual(['0-0', '0-1', '0-3']);
    expect(zoneOf(next, 'right').bears).toEqual([{ ...SMALL_YELLOW, uid: '0-2' }]);
    expect(zoneOf(next, 'left')).toBe(zoneOf(game, 'left'));
    expect(next).toMatchObject({
      status: 'playing',
      placementsLeft: 2,
      moves: 1,
      mistakes: 0,
      errorStreak: 0,
      lastBounce: null,
    });
  });

  it('garde les ours d’une boîte dans l’ordre des dépôts', () => {
    const game = createBearSortGame(TWO_PHASES, FIRST);

    const next = dropBear(dropBear(game, '0-1', 'left'), '0-0', 'left');

    expect(uidsOf(zoneOf(next, 'left').bears)).toEqual(['0-1', '0-0']);
  });

  it('fait rebondir un ours dans la mauvaise boîte : il reste dans la réserve', () => {
    const game = createBearSortGame(TWO_PHASES, FIRST);

    const next = dropBear(game, '0-0', 'right');

    expect(next.reserve).toBe(game.reserve);
    expect(next.zones).toBe(game.zones);
    expect(next).toMatchObject({
      status: 'playing',
      placementsLeft: 3,
      moves: 1,
      mistakes: 1,
      errorStreak: 1,
      lastBounce: { bearUid: '0-0', zoneId: 'right', kind: 'slip' },
    });
  });

  it('fait de chaque rebond un dépôt et une erreur, le dernier rebond restant seul retenu', () => {
    const game = createBearSortGame(TWO_PHASES, FIRST);

    const next = dropBear(dropBear(game, '0-0', 'right'), '0-3', 'left');

    expect(next).toMatchObject({
      moves: 2,
      mistakes: 2,
      errorStreak: 2,
      lastBounce: { bearUid: '0-3', zoneId: 'left', kind: 'slip' },
    });
  });

  it('remet à zéro la série de rebonds au dépôt réussi, sans effacer les erreurs', () => {
    const bounced = bounceTimes(createBearSortGame(TWO_PHASES, FIRST), 2, 'blue-small', 'right');

    const next = drop(bounced, 'blue-small', 'left');

    expect(bounced).toMatchObject({ errorStreak: 2, mistakes: 2 });
    expect(next).toMatchObject({ errorStreak: 0, mistakes: 2, moves: 3, lastBounce: null });
  });

  it.each<[string, string, BearSortZoneId]>([
    ['un ours inconnu', 'ours-inconnu', 'left'],
    ['un ours de la phase suivante', '1-0', 'left'],
    ['la boîte ouverte, absente d’une phase de tri', '0-0', 'open'],
  ])('ignore %s (état reçu renvoyé tel quel)', (_, bearUid, zoneId) => {
    const game = createBearSortGame(TWO_PHASES, FIRST);

    expect(dropBear(game, bearUid, zoneId)).toBe(game);
  });

  it('ignore un ours déjà rangé', () => {
    const placed = dropBear(createBearSortGame(TWO_PHASES, FIRST), '0-0', 'left');

    expect(dropBear(placed, '0-0', 'left')).toBe(placed);
    expect(dropBear(placed, '0-0', 'right')).toBe(placed);
  });

  it('ignore une boîte de tri pendant une phase « sauf », même pour un ours interdit', () => {
    const game = createBearSortGame(level(phase(EXCEPT_BLUE)), FIRST);

    expect(dropBear(game, '0-0', 'left')).toBe(game);
    expect(dropBear(game, '0-2', 'right')).toBe(game);
  });

  it('ignore tout dépôt pendant le STOP et après la victoire', () => {
    const stopped = finishPhase(createBearSortGame(TWO_PHASES, FIRST));
    const won = finishPhase(createBearSortGame(ONE_PHASE, FIRST));
    const waiting = stopped.reserve[0];

    expect(stopped.status).toBe('stop');
    expect(waiting).toBeDefined();
    expect(dropBear(stopped, waiting?.uid ?? '', 'left')).toBe(stopped);
    expect(dropBear(stopped, waiting?.uid ?? '', 'right')).toBe(stopped);
    expect(won.status).toBe('won');
    expect(dropBear(won, '0-0', 'left')).toBe(won);
  });

  it('ne modifie jamais l’état reçu', () => {
    const game = deepFreeze(createBearSortGame(TWO_PHASES, FIRST));

    expect(() => {
      dropBear(game, '0-0', 'left');
      dropBear(game, '0-0', 'right');
    }).not.toThrow();
    expect(game).toMatchObject({ moves: 0, mistakes: 0, placementsLeft: 3 });
    expect(game.reserve).toHaveLength(4);
  });
});

describe('Nature des rebonds', () => {
  it('classe en simple erreur tout rebond de la première phase, sans règle précédente', () => {
    const game = createBearSortGame(TWO_PHASES, FIRST);

    expect(drop(game, 'blue-big', 'right').lastBounce?.kind).toBe('slip');
    expect(drop(game, 'blue-small', 'right').lastBounce?.kind).toBe('slip');
  });

  it('reconnaît l’ancienne règle : un ours en conflit déposé là où elle le voulait', () => {
    const game = nextPhase(createBearSortGame(TWO_PHASES, FIRST));

    expect(game.rule).toEqual(BY_SIZE);
    expect(drop(game, 'blue-big', 'left').lastBounce).toEqual({
      bearUid: bearOf(game, 'blue-big').uid,
      zoneId: 'left',
      kind: 'old-rule',
    });
    expect(drop(game, 'yellow-small', 'right').lastBounce?.kind).toBe('old-rule');
  });

  it('classe en simple erreur un ours sans conflit : les deux règles voulaient l’autre boîte', () => {
    const game = nextPhase(createBearSortGame(TWO_PHASES, FIRST));

    expect(drop(game, 'blue-small', 'right').lastBounce?.kind).toBe('slip');
    expect(drop(game, 'yellow-big', 'left').lastBounce?.kind).toBe('slip');
  });

  it('suit la dernière règle en vigueur au retour à la première règle', () => {
    const game = nextPhase(nextPhase(createBearSortGame(THREE_PHASES, FIRST)));

    expect(game).toMatchObject({ rule: BY_COLOR, previousRule: BY_SIZE });
    expect(drop(game, 'blue-big', 'right').lastBounce?.kind).toBe('old-rule');
    expect(drop(game, 'yellow-small', 'left').lastBounce?.kind).toBe('old-rule');
    expect(drop(game, 'blue-small', 'right').lastBounce?.kind).toBe('slip');
  });

  it('reconnaît l’ancienne règle quelle que soit la place des boîtes', () => {
    const swapped: BearSortLevelConfig = { ...TWO_PHASES, zones: [BIG_YELLOW, SMALL_BLUE] };
    const game = nextPhase(createBearSortGame(swapped, FIRST));

    expect(drop(game, 'blue-big', 'right').lastBounce?.kind).toBe('old-rule');
    expect(drop(game, 'blue-small', 'left').lastBounce?.kind).toBe('slip');
  });

  it('nomme « interdit » l’ours interdit déposé dans la boîte ouverte, avec ou sans règle précédente', () => {
    const alone = createBearSortGame(level(phase(EXCEPT_BLUE)), FIRST);
    const afterSort = nextPhase(createBearSortGame(THEN_EXCEPT, FIRST));

    expect(drop(alone, 'blue-small', 'open').lastBounce).toEqual({
      bearUid: bearOf(alone, 'blue-small').uid,
      zoneId: 'open',
      kind: 'forbidden',
    });
    expect(afterSort.previousRule).toEqual(BY_COLOR);
    expect(drop(afterSort, 'blue-small', 'open').lastBounce?.kind).toBe('forbidden');
  });
});

describe('Enchaînement des phases', () => {
  it('s’arrête au STOP après `placements` ours rangés, alors que d’autres attendent', () => {
    const game = createBearSortGame(TWO_PHASES, FIRST);
    const twoPlaced = placeNext(placeNext(game));
    const stopped = placeNext(twoPlaced);

    expect(twoPlaced).toMatchObject({ status: 'playing', placementsLeft: 1 });
    expect(stopped).toMatchObject({ status: 'stop', placementsLeft: 0, phaseIndex: 0, moves: 3 });
    expect(uidsOf(stopped.reserve)).toEqual(['0-3']);
  });

  it('ne compte que les dépôts réussis pour atteindre le STOP', () => {
    let game = createBearSortGame(TWO_PHASES, FIRST);
    game = bounceTimes(game, 5, 'blue-small', 'right');

    expect(game).toMatchObject({ status: 'playing', placementsLeft: 3, moves: 5 });
    expect(finishPhase(game)).toMatchObject({ status: 'stop', moves: 8, mistakes: 5 });
  });

  it('annonce la règle suivante pendant le STOP, et aucune à la dernière phase', () => {
    const game = createBearSortGame(THEN_EXCEPT, FIRST);
    const stopped = finishPhase(game);
    const last = continueAfterStop(stopped, FIRST);

    expect(getUpcomingRule(game)).toEqual(EXCEPT_BLUE);
    expect(getUpcomingRule(stopped)).toEqual(EXCEPT_BLUE);
    expect(getUpcomingRule(last)).toBeNull();
    expect(getUpcomingRule(finishPhase(last))).toBeNull();
    expect(getUpcomingRule(createBearSortGame(ONE_PHASE, FIRST))).toBeNull();
  });

  it('passe de `playing` à `stop`, puis `playing`, jusqu’à `won`', () => {
    const statuses: string[] = [];
    let game = createBearSortGame(THREE_PHASES, FIRST);
    while (game.status !== 'won') {
      statuses.push(game.status);
      game = game.status === 'stop' ? continueAfterStop(game, FIRST) : placeNext(game);
    }
    statuses.push(game.status);

    expect(statuses).toEqual([
      ...['playing', 'playing', 'playing', 'stop'],
      ...['playing', 'playing', 'playing', 'stop'],
      ...['playing', 'playing', 'playing', 'playing', 'playing', 'playing', 'won'],
    ]);
    expect(game).toMatchObject({ phaseIndex: 2, moves: 12, mistakes: 0, placementsLeft: null });
    expect(game.reserve).toEqual([]);
  });

  it('continueAfterStop ouvre la phase suivante, sans toucher aux compteurs de la partie', () => {
    const stopped = finishPhase(
      bounceTimes(createBearSortGame(TWO_PHASES, FIRST), 2, 'blue-small', 'right'),
    );

    const next = continueAfterStop(stopped, FIRST);

    expect(next).toMatchObject({
      config: TWO_PHASES,
      status: 'playing',
      phaseIndex: 1,
      rule: BY_SIZE,
      previousRule: BY_COLOR,
      placementsLeft: null,
      moves: stopped.moves,
      mistakes: 2,
    });
  });

  it('vide les boîtes au changement de phase', () => {
    const stopped = finishPhase(createBearSortGame(TWO_PHASES, FIRST));

    const next = continueAfterStop(stopped, FIRST);

    expect(stopped.zones.flatMap((zone) => zone.bears)).toHaveLength(3);
    expect(next.zones).toEqual([
      { id: 'left', traits: SMALL_BLUE, bears: [] },
      { id: 'right', traits: BIG_YELLOW, bears: [] },
    ]);
  });

  it('garde les ours qui attendaient et ajoute ceux de la nouvelle phase', () => {
    const stopped = finishPhase(createBearSortGame(TWO_PHASES, FIRST));

    const next = continueAfterStop(stopped, FIRST);

    expect(uidsOf(stopped.reserve)).toEqual(['0-3']);
    expect(next.reserve).toEqual([
      { ...BIG_YELLOW, uid: '0-3' },
      { ...SMALL_BLUE, uid: '1-0' },
      { ...BIG_BLUE, uid: '1-1' },
      { ...SMALL_YELLOW, uid: '1-2' },
      { ...BIG_YELLOW, uid: '1-3' },
    ]);
  });

  it('accumule les ours restés d’une phase à l’autre et les garde jusqu’à leur dépôt', () => {
    const secondStop = finishPhase(nextPhase(createBearSortGame(THREE_PHASES, FIRST)));
    const last = continueAfterStop(secondStop, FIRST);

    expect(secondStop.status).toBe('stop');
    expect(secondStop.reserve).toHaveLength(2);
    expect(last.reserve).toHaveLength(6);
    expect(new Set(uidsOf(last.reserve)).size).toBe(6);
    expect(uidsOf(last.reserve)).toEqual(expect.arrayContaining(uidsOf(secondStop.reserve)));

    const won = finishPhase(last);
    expect(won.status).toBe('won');
    expect(uidsOf(won.zones.flatMap((zone) => zone.bears)).sort()).toEqual(
      uidsOf(last.reserve).sort(),
    );
  });

  it('mélange les ours restés et les nouveaux avec le rng injecté, de façon reproductible', () => {
    const stopped = finishPhase(createBearSortGame(TWO_PHASES, FIRST));
    const sorted = continueAfterStop(stopped, FIRST);
    const shuffled = continueAfterStop(stopped, seeded(5));

    expect(uidsOf(shuffled.reserve)).not.toEqual(uidsOf(sorted.reserve));
    expect(uidsOf(shuffled.reserve).sort()).toEqual(uidsOf(sorted.reserve).sort());
    expect(continueAfterStop(stopped, seeded(5))).toEqual(shuffled);
  });

  it('tire au hasard avec Math.random par défaut', () => {
    const stopped = finishPhase(createBearSortGame(TWO_PHASES, FIRST));

    expect(continueAfterStop(stopped).reserve).toHaveLength(5);
  });

  it('remet à zéro la série de rebonds et le dernier rebond au changement de phase', () => {
    // Le dépôt qui déclenche le STOP les efface déjà : état construit, pour le contrat de la fonction.
    const stopped: BearSortState = {
      ...finishPhase(createBearSortGame(TWO_PHASES, FIRST)),
      errorStreak: 4,
      lastBounce: { bearUid: '0-3', zoneId: 'left', kind: 'slip' },
    };

    expect(continueAfterStop(stopped, FIRST)).toMatchObject({ errorStreak: 0, lastBounce: null });
  });

  it('ignore continueAfterStop hors du STOP (état reçu renvoyé tel quel)', () => {
    const playing = createBearSortGame(TWO_PHASES, FIRST);
    const won = finishPhase(createBearSortGame(ONE_PHASE, FIRST));

    expect(continueAfterStop(playing, FIRST)).toBe(playing);
    expect(continueAfterStop(won, FIRST)).toBe(won);
  });

  it('ignore continueAfterStop sans phase suivante, dans un état incohérent', () => {
    const incoherent: BearSortState = {
      ...finishPhase(createBearSortGame(ONE_PHASE, FIRST)),
      status: 'stop',
    };

    expect(continueAfterStop(incoherent, FIRST)).toBe(incoherent);
  });

  it('ne modifie jamais l’état reçu au changement de phase', () => {
    const stopped = deepFreeze(finishPhase(createBearSortGame(TWO_PHASES, FIRST)));

    expect(() => continueAfterStop(stopped, seeded(1))).not.toThrow();
    expect(stopped).toMatchObject({ status: 'stop', phaseIndex: 0 });
    expect(stopped.reserve).toHaveLength(1);
  });

  it('gagne l’étoile au dernier ours d’une partie à une seule phase', () => {
    const game = createBearSortGame(ONE_PHASE, FIRST);
    const lastOne = placeNext(placeNext(placeNext(game)));

    expect(lastOne).toMatchObject({ status: 'playing', placementsLeft: null });
    expect(uidsOf(lastOne.reserve)).toEqual(['0-3']);
    expect(placeNext(lastOne)).toMatchObject({ status: 'won', moves: 4, reserve: [] });
  });
});

describe('Règle « sauf »', () => {
  it('n’ouvre qu’une boîte neutre, sans objectif de dépôts', () => {
    const game = nextPhase(createBearSortGame(THEN_EXCEPT, FIRST));

    expect(game).toMatchObject({ status: 'playing', rule: EXCEPT_BLUE, previousRule: BY_COLOR });
    expect(game.placementsLeft).toBeNull();
    expect(game.zones).toEqual([{ id: 'open', traits: null, bears: [] }]);
  });

  it('range un ours permis dans la boîte ouverte, même un ours resté de la phase précédente', () => {
    const game = nextPhase(createBearSortGame(THEN_EXCEPT, FIRST));
    const carried = '0-3';

    const next = dropBear(game, carried, 'open');

    expect(game.reserve.map((bear) => bear.uid)).toContain(carried);
    expect(uidsOf(zoneOf(next, 'open').bears)).toEqual([carried]);
    expect(next).toMatchObject({ status: 'playing', mistakes: 0, moves: 4, placementsLeft: null });
  });

  it('fait rebondir un ours interdit : il reste dans la réserve', () => {
    const game = nextPhase(createBearSortGame(THEN_EXCEPT, FIRST));

    const next = drop(game, 'blue-small', 'open');

    expect(next.reserve).toBe(game.reserve);
    expect(next.zones).toBe(game.zones);
    expect(next).toMatchObject({ status: 'playing', mistakes: 1, errorStreak: 1 });
  });

  it('s’achève de lui-même dès qu’il ne reste que des ours interdits', () => {
    // Couleur : les 3 premiers ours rangés, le grand jaune attend. Puis 4 ours de plus :
    // 3 jaunes à ranger, 2 bleus interdits.
    const game = nextPhase(createBearSortGame(THEN_EXCEPT, FIRST));
    expect(kindsOf(game.reserve).sort()).toEqual(
      ['blue-big', 'blue-small', 'yellow-big', 'yellow-big', 'yellow-small'].sort(),
    );

    const twoPlaced = placeNext(placeNext(game));
    const won = placeNext(twoPlaced);

    expect(twoPlaced.status).toBe('playing');
    expect(won.status).toBe('won');
    expect(kindsOf(won.reserve).sort()).toEqual(['blue-big', 'blue-small']);
    expect(zoneOf(won, 'open').bears).toHaveLength(3);
  });

  it('ne laisse à la fin que l’ours exact interdit, ses faux amis étant tous rangés', () => {
    const config = level(
      phase(BY_COLOR, ONE_OF_EACH, 3),
      phase(EXCEPT_SMALL_BLUE, { 'blue-small': 2, 'blue-big': 1, 'yellow-small': 1 }),
    );

    const won = finishPhase(nextPhase(createBearSortGame(config, FIRST)));

    expect(won.status).toBe('won');
    expect(kindsOf(won.reserve)).toEqual(['blue-small', 'blue-small']);
    expect(won.zones.flatMap((zone) => kindsOf(zone.bears))).not.toContain('blue-small');
  });

  it('reste en jeu tant qu’un ours permis attend, malgré les rebonds', () => {
    const game = nextPhase(createBearSortGame(THEN_EXCEPT, FIRST));

    const bounced = bounceTimes(game, 6, 'blue-big', 'open');

    expect(bounced).toMatchObject({ status: 'playing', mistakes: 6, errorStreak: 6 });
    expect(finishPhase(bounced)).toMatchObject({ status: 'won', mistakes: 6, errorStreak: 0 });
  });

  it('ne donne aucune règle suivante : la partie est gagnée, pas interrompue par un STOP', () => {
    const won = finishPhase(createBearSortGame(level(phase(EXCEPT_BIG)), FIRST));

    expect(won.status).toBe('won');
    expect(getUpcomingRule(won)).toBeNull();
    expect(kindsOf(won.reserve).sort()).toEqual(['blue-big', 'yellow-big']);
    expect(continueAfterStop(won, FIRST)).toBe(won);
  });
});

describe('Échelle d’indices', () => {
  it.each<[number, number]>([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 3],
    [50, 3],
  ])('après %i rebonds d’affilée, donne l’échelon %i', (bounces, hintLevel) => {
    const game = bounceTimes(createBearSortGame(TWO_PHASES, FIRST), bounces, 'blue-small', 'right');

    expect(game.errorStreak).toBe(bounces);
    expect(getHintLevel(game)).toBe(hintLevel);
  });

  it('retombe à zéro au dépôt réussi et au changement de phase', () => {
    const bounced = bounceTimes(createBearSortGame(TWO_PHASES, FIRST), 3, 'blue-small', 'right');
    const stopped: BearSortState = { ...finishPhase(bounced), errorStreak: 2 };

    expect(getHintLevel(bounced)).toBe(3);
    expect(getHintLevel(drop(bounced, 'blue-small', 'left'))).toBe(0);
    expect(getHintLevel(continueAfterStop(stopped, FIRST))).toBe(0);
  });

  it('n’estompe rien avant le 2ᵉ rebond d’affilée', () => {
    const game = createBearSortGame(TWO_PHASES, FIRST);

    expect(getFadedFeature(game)).toBeNull();
    expect(getFadedFeature(drop(game, 'blue-small', 'right'))).toBeNull();
  });

  it('estompe à partir du 2ᵉ rebond le critère que la règle ignore : la taille si l’on trie par couleur', () => {
    const game = createBearSortGame(TWO_PHASES, FIRST);

    expect(getFadedFeature(bounceTimes(game, 2, 'blue-small', 'right'))).toBe('size');
    expect(getFadedFeature(bounceTimes(game, 3, 'blue-small', 'right'))).toBe('size');
    expect(getFadedFeature(bounceTimes(game, 7, 'blue-small', 'right'))).toBe('size');
  });

  it('estompe la couleur si l’on trie par taille', () => {
    const game = nextPhase(createBearSortGame(TWO_PHASES, FIRST));

    expect(getFadedFeature(drop(game, 'blue-big', 'left'))).toBeNull();
    expect(getFadedFeature(bounceTimes(game, 2, 'blue-big', 'left'))).toBe('color');
  });

  it('n’estompe plus rien après un dépôt réussi', () => {
    const bounced = bounceTimes(createBearSortGame(TWO_PHASES, FIRST), 3, 'blue-small', 'right');

    expect(getFadedFeature(drop(bounced, 'blue-small', 'left'))).toBeNull();
  });

  it('n’estompe rien pendant une règle « sauf » : les deux critères peuvent compter', () => {
    const game = nextPhase(createBearSortGame(THEN_EXCEPT, FIRST));
    const bounced = bounceTimes(game, 3, 'blue-small', 'open');

    expect(getHintLevel(bounced)).toBe(3);
    expect(getFadedFeature(bounced)).toBeNull();
  });
});

describe('getNextBearUid', () => {
  const game = createBearSortGame(ONE_PHASE, FIRST);

  it('passe à l’ours suivant de la réserve', () => {
    expect(getNextBearUid(game, '0-0')).toBe('0-1');
    expect(getNextBearUid(game, '0-2')).toBe('0-3');
  });

  it('revient au premier ours après le dernier', () => {
    expect(getNextBearUid(game, '0-3')).toBe('0-0');
  });

  it('propose le premier ours pour un ours absent de la réserve', () => {
    expect(getNextBearUid(game, 'ours-inconnu')).toBe('0-0');
    expect(getNextBearUid(dropBear(game, '0-0', 'left'), '0-0')).toBe('0-1');
  });

  it('reste sur le seul ours restant', () => {
    const lastOne = placeNext(placeNext(placeNext(game)));

    expect(getNextBearUid(lastOne, '0-3')).toBe('0-3');
  });

  it('ne propose rien quand la réserve est vide', () => {
    expect(getNextBearUid(finishPhase(game), '0-0')).toBeNull();
  });
});

describe('isPerfectWin', () => {
  it('couronne une étoile finie sans aucun rebond', () => {
    const won = finishPhase(nextPhase(createBearSortGame(TWO_PHASES, FIRST)));

    expect(won).toMatchObject({ status: 'won', mistakes: 0 });
    expect(isPerfectWin(won)).toBe(true);
  });

  it('refuse la couronne dès un rebond, même rattrapé', () => {
    const bounced = drop(createBearSortGame(TWO_PHASES, FIRST), 'blue-small', 'right');

    expect(isPerfectWin(finishPhase(nextPhase(bounced)))).toBe(false);
  });

  it('refuse la couronne avant la fin de l’étoile', () => {
    const game = createBearSortGame(TWO_PHASES, FIRST);

    expect(isPerfectWin(game)).toBe(false);
    expect(isPerfectWin(finishPhase(game))).toBe(false);
  });
});

describe('Parties complètes à graine', () => {
  /** Joue toute l'étoile en rangeant le premier ours accepté, et passe chaque STOP. */
  function playThrough(config: BearSortLevelConfig, rng: Rng): BearSortState {
    let game = createBearSortGame(config, rng);
    while (game.status !== 'won') {
      game = game.status === 'stop' ? continueAfterStop(game, rng) : placeNext(game);
    }
    return game;
  }

  it('rejoue exactement la même partie avec la même graine', () => {
    expect(playThrough(THREE_PHASES, seeded(7))).toEqual(playThrough(THREE_PHASES, seeded(7)));
  });

  it('présente les ours dans un autre ordre avec une autre graine, pour le même résultat', () => {
    const one = playThrough(THREE_PHASES, seeded(7));
    const other = playThrough(THREE_PHASES, seeded(8));

    expect(uidsOf(one.zones.flatMap((zone) => zone.bears))).not.toEqual(
      uidsOf(other.zones.flatMap((zone) => zone.bears)),
    );
    expect(one).toMatchObject({ status: 'won', moves: 12, mistakes: 0 });
    expect(other).toMatchObject({ status: 'won', moves: 12, mistakes: 0 });
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'ne perd ni ne double aucun ours d’une phase à l’autre (graine %i)',
    (seed) => {
      const rng = seeded(seed);
      const placedBefore: Bear[] = [];
      let game = createBearSortGame(THREE_PHASES, rng);
      while (game.status !== 'won') {
        if (game.status === 'stop') {
          placedBefore.push(...game.zones.flatMap((zone) => zone.bears));
          game = continueAfterStop(game, rng);
        } else {
          game = placeNext(game);
        }
        const uids = uidsOf([
          ...placedBefore,
          ...game.zones.flatMap((zone) => zone.bears),
          ...game.reserve,
        ]);
        expect(new Set(uids).size).toBe(uids.length);
      }

      expect(placedBefore).toHaveLength(6);
      expect(game.zones.flatMap((zone) => zone.bears)).toHaveLength(6);
      expect(isPerfectWin(game)).toBe(true);
    },
  );
});
