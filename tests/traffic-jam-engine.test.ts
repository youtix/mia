// @vitest-environment node
import {
  applyMove,
  buildOccupancyGrid,
  countFreeCells,
  createTrafficJamGame,
  DEFAULT_EXIT_ROW,
  DEFAULT_MAX_STATES,
  formatTrafficJamAscii,
  getBoardGeometryError,
  getNextBestMove,
  getVehicleBounds,
  getVehicleCells,
  HERO_COLOR_CLASS,
  HERO_VEHICLE_ID,
  isHeroAtExit,
  isPerfectWin,
  parseTrafficJamAscii,
  resetLevel,
  solveFromVehicles,
  solveTrafficJam,
  undoLastMove,
  UNSOLVABLE_MOVES,
  validateBoardGeometry,
  VEHICLE_COLOR_CLASSES,
  type ParseTrafficJamOptions,
  type TrafficJamLevelConfig,
  type TrafficJamMove,
  type TrafficJamState,
  type VehicleAxis,
  type VehicleDef,
  type VehicleType,
} from '@/games/traffic-jam';
import { describe, expect, it } from 'vitest';

/** Parseur, obstacles, voitures et camions dans les deux axes : 3 coups (C −1, B +3, hero +4). */
const SAMPLE = ['A..B..', 'A..B.C', 'HH.B.C', '....##', 'DDD...', 'EE..FF'];

/** Ligne de sortie libre : 1 coup. */
const TRIVIAL = ['......', '......', 'HH....', '......', '......', '......'];

/** Une voiture verticale bloque la sortie : 2 coups. */
const TWO_MOVES = ['......', '...A..', 'HH.A..', '......', '......', '......'];

/** Deux camions verticaux à dégager : 3 coups. */
const THREE_MOVES = ['......', '..B...', 'HHB.C.', '..B.C.', '....C.', '......'];

/** Chaîne de dépendances (C libère A, qui libère la ligne, puis B) : 4 coups. */
const FOUR_MOVES = ['..A...', '..A...', 'HHA.B.', '....B.', '.CCC..', '......'];

/** Obstacle devant le hero : insoluble. */
const WALLED = ['......', '......', 'HH.#..', '......', '......', '......'];

/** Hero déjà contre le bord droit. */
const ALREADY_WON = ['......', '......', '....HH', '......', '......', '......'];

/** 11 véhicules et un obstacle : 23 coups. */
const DENSE_23 = ['.#CEE.', 'LLC.JI', '.HH.JI', 'G.BB.I', 'GAADDD', '.KK.FF'];

/** 11 véhicules, environ 200 positions atteignables : 20 coups (oracle naïf abordable). */
const DENSE_20 = ['JG..B.', 'JGAAB.', 'JFHHB.', '.F....', '.FEIKK', 'CCEIDD'];

/** 12 véhicules, chaque case utile occupée : 42 coups. */
const DENSE_42 = ['..EEAA', 'GGF.L.', 'HHF.L.', 'KBBBLJ', 'K..I.J', 'KDDICC'];

/** 13 véhicules hors hero : la palette de 12 couleurs est reprise en boucle. */
const THIRTEEN_CARS = ['AABBCC', 'DDEEFF', 'HH....', 'GGIIJJ', 'KKLLMM', 'NN....'];

/** 20 véhicules de 8 positions sur 9 × 9 : 8^20 positions, au-delà de 2^53 (clés en chaîne). */
const BIG_GRID = [
  'AABB.....',
  '.........',
  'HH..C....',
  '....C....',
  '.........',
  'DDEEFFGG.',
  'IIJJKKLL.',
  'MMNNOOPP.',
  'QQRRSSTT.',
];

const HERO: VehicleDef = {
  id: HERO_VEHICLE_ID,
  type: 'hero',
  axis: 'H',
  length: 2,
  row: 2,
  col: 0,
  colorClass: HERO_COLOR_CLASS,
};

function car(id: string, axis: VehicleAxis, row: number, col: number): VehicleDef {
  return { id, type: 'car', axis, length: 2, row, col, colorClass: 'bg-sky-500' };
}

function truck(id: string, axis: VehicleAxis, row: number, col: number): VehicleDef {
  return { id, type: 'truck', axis, length: 3, row, col, colorClass: 'bg-emerald-500' };
}

function board(overrides: Partial<TrafficJamLevelConfig> = {}): TrafficJamLevelConfig {
  return {
    gridSize: 6,
    exitRow: 2,
    optimalMoves: 0,
    vehicles: [HERO],
    obstacles: [],
    ...overrides,
  };
}

function game(lines: readonly string[], options?: ParseTrafficJamOptions): TrafficJamState {
  return createTrafficJamGame(parseTrafficJamAscii(lines, options));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function vehicleOf(state: TrafficJamState, id: string): VehicleDef {
  const vehicle = state.vehicles.find((candidate) => candidate.id === id);
  if (!vehicle) throw new Error(`véhicule « ${id} » absent de l'état`);
  return vehicle;
}

/** Rejoue des coups depuis la position de départ du niveau. */
function replay(config: TrafficJamLevelConfig, moves: readonly TrafficJamMove[]): TrafficJamState {
  return moves.reduce(
    (state, move) => applyMove(state, move.vehicleId, move.delta),
    createTrafficJamGame(config),
  );
}

/**
 * Oracle indépendant du solveur : parcours en largeur naïf sur les états du moteur (clés ASCII).
 * `-1` si la sortie est inaccessible.
 */
function referenceOptimalMoves(config: TrafficJamLevelConfig): number {
  const start = createTrafficJamGame(config);
  const keyOf = (state: TrafficJamState): string => formatTrafficJamAscii(state).join('/');
  const seen = new Set([keyOf(start)]);
  let frontier = [start];
  for (let depth = 0; frontier.length > 0; depth += 1) {
    const next: TrafficJamState[] = [];
    for (const state of frontier) {
      if (state.isWon) return depth;
      for (const vehicle of state.vehicles) {
        const { minDelta, maxDelta } = getVehicleBounds(state, vehicle.id);
        for (let delta = minDelta; delta <= maxDelta; delta += 1) {
          if (delta === 0) continue;
          const moved = applyMove(state, vehicle.id, delta);
          const key = keyOf(moved);
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(moved);
        }
      }
    }
    frontier = next;
  }
  return -1;
}

describe('Palette', () => {
  it('propose un hero rouge et 12 couleurs distinctes en classes Tailwind littérales', () => {
    expect(HERO_VEHICLE_ID).toBe('hero');
    expect(HERO_COLOR_CLASS).toBe('bg-red-500');
    expect(VEHICLE_COLOR_CLASSES).toHaveLength(12);
    expect(new Set(VEHICLE_COLOR_CLASSES).size).toBe(12);
    expect(VEHICLE_COLOR_CLASSES).not.toContain(HERO_COLOR_CLASS);
    expect(VEHICLE_COLOR_CLASSES.every((color) => /^bg-[a-z]+-\d+$/.test(color))).toBe(true);
  });
});

describe('parseTrafficJamAscii', () => {
  it('lit le hero, les voitures, les camions et les obstacles, couleurs dans l’ordre d’apparition', () => {
    expect(parseTrafficJamAscii(SAMPLE)).toEqual({
      gridSize: 6,
      exitRow: DEFAULT_EXIT_ROW,
      optimalMoves: 0,
      vehicles: [
        { id: 'A', type: 'car', axis: 'V', length: 2, row: 0, col: 0, colorClass: 'bg-sky-500' },
        {
          id: 'B',
          type: 'truck',
          axis: 'V',
          length: 3,
          row: 0,
          col: 3,
          colorClass: 'bg-emerald-500',
        },
        { id: 'C', type: 'car', axis: 'V', length: 2, row: 1, col: 5, colorClass: 'bg-amber-400' },
        HERO,
        {
          id: 'D',
          type: 'truck',
          axis: 'H',
          length: 3,
          row: 4,
          col: 0,
          colorClass: 'bg-violet-500',
        },
        { id: 'E', type: 'car', axis: 'H', length: 2, row: 5, col: 0, colorClass: 'bg-pink-500' },
        { id: 'F', type: 'car', axis: 'H', length: 2, row: 5, col: 4, colorClass: 'bg-lime-500' },
      ],
      obstacles: [
        { row: 3, col: 4 },
        { row: 3, col: 5 },
      ],
    });
  });

  it('applique les options exitRow et optimalMoves sur une grille 7 × 7', () => {
    const lines = ['.......', '.......', '.......', '.HH....', '.......', '.......', '.......'];
    const config = parseTrafficJamAscii(lines, { exitRow: 3, optimalMoves: 1 });

    expect(config).toMatchObject({ gridSize: 7, exitRow: 3, optimalMoves: 1, obstacles: [] });
    expect(config.vehicles).toEqual([{ ...HERO, row: 3, col: 1 }]);
  });

  it('reprend la palette en boucle au-delà de 12 véhicules', () => {
    const colors = parseTrafficJamAscii(THIRTEEN_CARS)
      .vehicles.filter((vehicle) => vehicle.type !== 'hero')
      .map((vehicle) => vehicle.colorClass);

    expect(colors).toHaveLength(13);
    expect(colors.slice(0, 12)).toEqual([...VEHICLE_COLOR_CLASSES]);
    expect(colors[12]).toBe(VEHICLE_COLOR_CLASSES[0]);
  });

  it.each([
    [SAMPLE],
    [TRIVIAL],
    [TWO_MOVES],
    [THREE_MOVES],
    [FOUR_MOVES],
    [WALLED],
    [ALREADY_WON],
    [DENSE_23],
    [DENSE_20],
    [DENSE_42],
    [THIRTEEN_CARS],
    [BIG_GRID],
  ])('produit une géométrie valide pour %j', (lines) => {
    expect(validateBoardGeometry(parseTrafficJamAscii(lines))).toEqual({ valid: true });
  });

  it.each<[string, string[], ParseTrafficJamOptions | undefined, string]>([
    ['une grille vide', [], undefined, 'Grille ASCII vide'],
    [
      'une grille non carrée',
      ['......', '......', 'HH....', '......', '......'],
      undefined,
      'Ligne 0 : 6 caractères au lieu de 5 (grille carrée attendue)',
    ],
    [
      'une ligne trop courte',
      ['......', '......', 'HH....', '.....', '......', '......'],
      undefined,
      'Ligne 3 : 5 caractères au lieu de 6',
    ],
    [
      'un caractère inconnu',
      ['..x...', '......', 'HH....', '......', '......', '......'],
      undefined,
      'Caractère « x » inconnu en ligne 0, colonne 2 (« . », « # » ou lettre majuscule attendus)',
    ],
    [
      'une espace',
      ['......', '......', 'HH....', '... ..', '......', '......'],
      undefined,
      'Caractère «   » inconnu en ligne 3, colonne 3',
    ],
    [
      'une lettre non alignée',
      ['A.....', '.A....', 'HH....', '......', '......', '......'],
      undefined,
      'Lettre « A » : cases non alignées (une seule ligne ou une seule colonne attendue)',
    ],
    [
      'une lettre dispersée sur une ligne',
      ['A.A...', '......', 'HH....', '......', '......', '......'],
      undefined,
      'Lettre « A » : cases non contiguës (un seul segment attendu)',
    ],
    [
      'une lettre dispersée sur une colonne',
      ['A.....', '......', 'HH....', 'A.....', '......', '......'],
      undefined,
      'Lettre « A » : cases non contiguës',
    ],
    [
      'une lettre isolée',
      ['A.....', '......', 'HH....', '......', '......', '......'],
      undefined,
      'Lettre « A » : 1 case(s), un véhicule en occupe 2 (voiture) ou 3 (camion)',
    ],
    [
      'une lettre sur 4 cases',
      ['AAAA..', '......', 'HH....', '......', '......', '......'],
      undefined,
      'Lettre « A » : 4 case(s)',
    ],
    [
      'un hero vertical',
      ['......', '......', 'H.....', 'H.....', '......', '......'],
      undefined,
      'Lettre « H » : le véhicule du joueur doit être horizontal',
    ],
    [
      'un hero de 3 cases',
      ['......', '......', 'HHH...', '......', '......', '......'],
      undefined,
      'Lettre « H » : 3 case(s), le véhicule du joueur en occupe exactement 2',
    ],
    [
      'un hero en double',
      ['......', '......', 'HH.HH.', '......', '......', '......'],
      undefined,
      'Lettre « H » : cases non contiguës',
    ],
    [
      'un hero absent',
      ['......', '......', '......', '......', '......', '......'],
      undefined,
      'Véhicule du joueur absent (lettre « H » attendue sur la ligne de sortie 2)',
    ],
    [
      'un hero hors de la ligne de sortie',
      ['......', 'HH....', '......', '......', '......', '......'],
      undefined,
      'Lettre « H » : ligne 1 au lieu de la ligne de sortie 2',
    ],
    [
      'un hero hors de la ligne de sortie choisie',
      ['......', '......', 'HH....', '......', '......', '......'],
      { exitRow: 4 },
      'Lettre « H » : ligne 2 au lieu de la ligne de sortie 4',
    ],
    [
      'une ligne de sortie hors de la grille',
      TRIVIAL,
      { exitRow: 6 },
      'exitRow 6 hors de la grille (entier de 0 à 5 attendu)',
    ],
    ['une ligne de sortie non entière', TRIVIAL, { exitRow: 1.5 }, 'exitRow 1.5 hors de la grille'],
    [
      'un optimalMoves négatif',
      TRIVIAL,
      { optimalMoves: -1 },
      'optimalMoves -1 invalide (entier ≥ 0 attendu)',
    ],
    ['un optimalMoves non entier', TRIVIAL, { optimalMoves: 2.5 }, 'optimalMoves 2.5 invalide'],
  ])('rejette %s', (_name, lines, options, message) => {
    expect(() => parseTrafficJamAscii(lines, options)).toThrow(message);
  });
});

describe('formatTrafficJamAscii', () => {
  it.each([[SAMPLE], [TRIVIAL], [FOUR_MOVES], [WALLED], [DENSE_23], [THIRTEEN_CARS], [BIG_GRID]])(
    'restitue la grille %j',
    (lines) => {
      expect(formatTrafficJamAscii(parseTrafficJamAscii(lines))).toEqual(lines);
    },
  );

  it('dessine les positions courantes d’un état', () => {
    const state = applyMove(applyMove(game(FOUR_MOVES), 'C', 2), 'B', -2);

    expect(formatTrafficJamAscii(state)).toEqual([
      '..A.B.',
      '..A.B.',
      'HHA...',
      '......',
      '...CCC',
      '......',
    ]);
  });

  it('prend la première lettre de l’identifiant et ignore les cases hors de la grille', () => {
    const config = board({
      vehicles: [HERO, car('bus', 'H', 0, 5), car('van', 'V', 5, 0)],
      obstacles: [{ row: 9, col: 9 }],
    });

    expect(formatTrafficJamAscii(config)).toEqual([
      '.....B',
      '......',
      'HH....',
      '......',
      '......',
      'V.....',
    ]);
  });

  it('donne une lettre libre aux identifiants sans initiale disponible (grille re-parsable)', () => {
    const config = board({
      vehicles: [
        HERO,
        car('hat', 'H', 0, 0),
        car('a1', 'V', 3, 5),
        car('a2', 'V', 0, 5),
        car('7up', 'H', 5, 0),
      ],
      obstacles: [],
    });
    const lines = ['BB...C', '.....C', 'HH....', '.....A', '.....A', 'DD....'];

    expect(formatTrafficJamAscii(config)).toEqual(lines);
    expect(formatTrafficJamAscii(parseTrafficJamAscii(lines))).toEqual(lines);
  });
});

describe('validateBoardGeometry', () => {
  it('exige l’identifiant « hero » pour le véhicule du joueur (curseur initial de FEAT-13)', () => {
    expect(getBoardGeometryError(board({ vehicles: [{ ...HERO, id: 'player' }] }))).toBe(
      'le véhicule « player » : identifiant invalide (« hero » attendu pour le véhicule du joueur)',
    );
  });

  it('accepte un niveau correct sans message', () => {
    expect(validateBoardGeometry(parseTrafficJamAscii(SAMPLE))).toEqual({ valid: true });
    expect(getBoardGeometryError(board())).toBeUndefined();
  });

  it.each<[string, TrafficJamLevelConfig, string]>([
    ['une grille de 1', board({ gridSize: 1 }), 'gridSize 1 invalide (entier ≥ 2 attendu)'],
    ['une grille non entière', board({ gridSize: 6.5 }), 'gridSize 6.5 invalide'],
    [
      'une sortie hors de la grille',
      board({ exitRow: 6 }),
      'exitRow 6 hors de la grille (entier de 0 à 5 attendu)',
    ],
    ['une sortie négative', board({ exitRow: -1 }), 'exitRow -1 hors de la grille'],
    [
      'un optimalMoves négatif',
      board({ optimalMoves: -1 }),
      'optimalMoves -1 invalide (entier ≥ 0 attendu)',
    ],
    ['un optimalMoves non entier', board({ optimalMoves: 0.5 }), 'optimalMoves 0.5 invalide'],
    [
      'un obstacle hors de la grille',
      board({ obstacles: [{ row: 6, col: 0 }] }),
      'obstacle (ligne 6, colonne 0) hors de la grille',
    ],
    [
      'un obstacle en double',
      board({
        obstacles: [
          { row: 0, col: 0 },
          { row: 0, col: 0 },
        ],
      }),
      'obstacle (ligne 0, colonne 0) en double',
    ],
    [
      'un identifiant vide',
      board({ vehicles: [HERO, car('', 'H', 0, 0)] }),
      'identifiant de véhicule vide',
    ],
    [
      'un identifiant en double',
      board({ vehicles: [HERO, car('A', 'H', 0, 0), car('A', 'H', 1, 0)] }),
      'identifiant « A » en double',
    ],
    [
      'un type inconnu',
      board({ vehicles: [HERO, { ...car('A', 'H', 0, 0), type: 'bus' as string as VehicleType }] }),
      'le véhicule « A » : type « bus » inconnu (hero, car ou truck attendu)',
    ],
    [
      'un axe invalide',
      board({ vehicles: [HERO, { ...car('A', 'H', 0, 0), axis: 'X' as string as VehicleAxis }] }),
      'le véhicule « A » : axe « X » invalide (H ou V attendu)',
    ],
    [
      'une voiture de 3 cases',
      board({ vehicles: [HERO, { ...car('A', 'H', 0, 0), length: 3 }] }),
      'le véhicule « A » : longueur 3 invalide (2 attendue pour une voiture)',
    ],
    [
      'un camion de 2 cases',
      board({ vehicles: [HERO, { ...truck('A', 'H', 0, 0), length: 2 }] }),
      'le véhicule « A » : longueur 2 invalide (3 attendue pour un camion)',
    ],
    [
      'un hero de 3 cases',
      board({ vehicles: [{ ...HERO, length: 3 }] }),
      'le véhicule « hero » : longueur 3 invalide (2 attendue pour le véhicule du joueur)',
    ],
    [
      'un hero vertical',
      board({ vehicles: [{ ...HERO, axis: 'V' }] }),
      'le véhicule « hero » : le véhicule du joueur doit être horizontal',
    ],
    [
      'un hero hors de la ligne de sortie',
      board({ vehicles: [{ ...HERO, row: 1 }] }),
      'le véhicule « hero » : ligne 1 au lieu de la ligne de sortie 2',
    ],
    [
      'un véhicule qui dépasse à droite',
      board({ vehicles: [HERO, car('A', 'H', 0, 5)] }),
      'le véhicule « A » hors de la grille (ligne 0, colonne 6)',
    ],
    [
      'un véhicule qui dépasse en haut',
      board({ vehicles: [HERO, car('A', 'V', -1, 0)] }),
      'le véhicule « A » hors de la grille (ligne -1, colonne 0)',
    ],
    [
      'une position non entière',
      board({ vehicles: [HERO, car('A', 'H', 0, 0.5)] }),
      'le véhicule « A » hors de la grille (ligne 0, colonne 0.5)',
    ],
    [
      'deux véhicules superposés',
      board({ vehicles: [HERO, car('A', 'H', 0, 0), car('B', 'V', 0, 1)] }),
      'le véhicule « B » chevauche le véhicule « A » en (ligne 0, colonne 1)',
    ],
    [
      'un véhicule sur un obstacle',
      board({ vehicles: [HERO, car('A', 'H', 0, 0)], obstacles: [{ row: 0, col: 1 }] }),
      'le véhicule « A » chevauche l’obstacle (ligne 0, colonne 1) en (ligne 0, colonne 1)'.replace(
        '’',
        "'",
      ),
    ],
    [
      'un niveau sans hero',
      board({ vehicles: [car('A', 'H', 0, 0)] }),
      'aucun véhicule du joueur (type hero)',
    ],
    [
      'deux heros',
      board({ vehicles: [HERO, { ...HERO, id: 'hero2', col: 3 }] }),
      'plusieurs véhicules du joueur (un seul type hero attendu)',
    ],
  ])('signale %s', (_name, config, message) => {
    expect(validateBoardGeometry(config)).toEqual({
      valid: false,
      error: expect.stringContaining(message) as string,
    });
    expect(getBoardGeometryError(config)).toContain(message);
  });
});

describe('createTrafficJamGame', () => {
  it('copie les véhicules, partage la configuration et part sans coup', () => {
    const config = parseTrafficJamAscii(SAMPLE);
    const state = createTrafficJamGame(config);

    expect(state).toEqual({
      config,
      vehicles: config.vehicles,
      moves: 0,
      history: [],
      isWon: false,
    });
    expect(state.config).toBe(config);
    expect(state.vehicles).not.toBe(config.vehicles);
    expect(state.vehicles[0]).not.toBe(config.vehicles[0]);
  });

  it('détecte une position de départ déjà gagnante', () => {
    expect(game(ALREADY_WON).isWon).toBe(true);
  });

  it('refuse une géométrie invalide', () => {
    expect(() => createTrafficJamGame(board({ vehicles: [] }))).toThrow(
      'Niveau Traffic Jam invalide : aucun véhicule du joueur (type hero)',
    );
  });
});

describe('Grille d’occupation', () => {
  it('liste les cases d’un véhicule dans les deux axes', () => {
    expect(getVehicleCells(car('A', 'H', 1, 2))).toEqual([
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ]);
    expect(getVehicleCells(truck('B', 'V', 3, 0))).toEqual([
      { row: 3, col: 0 },
      { row: 4, col: 0 },
      { row: 5, col: 0 },
    ]);
  });

  it('ignore les cases hors de la grille au lieu de les replier sur la ligne voisine', () => {
    const occupied = buildOccupancyGrid(
      {
        gridSize: 4,
        obstacles: [
          { row: 1, col: 4 },
          { row: -1, col: 0 },
        ],
      },
      [car('A', 'H', 0, 3), car('B', 'V', 3, 1)],
    );

    // A : (0, 3) marquée, (0, 4) ignorée (pas (1, 0)) ; B : (3, 1) marquée, (4, 1) ignorée.
    expect([...occupied]).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
  });

  it('marque obstacles et véhicules, et compte les cases libres jusqu’à une limite', () => {
    const occupied = buildOccupancyGrid({ gridSize: 4, obstacles: [{ row: 0, col: 3 }] }, [
      car('A', 'V', 2, 1),
    ]);

    expect([...occupied]).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]);
    // Ligne 0 depuis la colonne 0 vers la droite : 3 cases libres puis l'obstacle.
    expect(countFreeCells(occupied, 0, 1, 4)).toBe(3);
    // Même parcours limité à 2 cases.
    expect(countFreeCells(occupied, 0, 1, 2)).toBe(2);
    // Colonne 1 depuis la ligne 1 vers le bas : la voiture bloque aussitôt.
    expect(countFreeCells(occupied, 5, 4, 3)).toBe(1);
    expect(countFreeCells(occupied, 9, 4, 2)).toBe(0);
  });

  it('reconnaît le hero contre le bord droit', () => {
    expect(isHeroAtExit([{ ...HERO, col: 4 }], 6)).toBe(true);
    expect(isHeroAtExit([{ ...HERO, col: 3 }], 6)).toBe(false);
    expect(isHeroAtExit([car('A', 'H', 2, 4)], 6)).toBe(false);
  });
});

describe('getVehicleBounds', () => {
  it('borne chaque véhicule par les murs, les véhicules et les obstacles', () => {
    const state = game(FOUR_MOVES);

    expect(getVehicleBounds(state, 'hero')).toEqual({ minDelta: 0, maxDelta: 0 });
    expect(getVehicleBounds(state, 'A')).toEqual({ minDelta: 0, maxDelta: 1 });
    expect(getVehicleBounds(state, 'B')).toEqual({ minDelta: -2, maxDelta: 2 });
    expect(getVehicleBounds(state, 'C')).toEqual({ minDelta: -1, maxDelta: 2 });

    const withObstacles = game(SAMPLE);
    expect(getVehicleBounds(withObstacles, 'C')).toEqual({ minDelta: -1, maxDelta: 0 });
    expect(getVehicleBounds(withObstacles, 'F')).toEqual({ minDelta: -2, maxDelta: 0 });
  });

  it('laisse le hero atteindre la sortie sans quitter la grille', () => {
    expect(getVehicleBounds(game(TRIVIAL), 'hero')).toEqual({ minDelta: 0, maxDelta: 4 });
    expect(getVehicleBounds(game(ALREADY_WON), 'hero')).toEqual({ minDelta: -4, maxDelta: 0 });
    expect(getVehicleBounds(game(WALLED), 'hero')).toEqual({ minDelta: 0, maxDelta: 1 });
  });

  it('refuse un identifiant inconnu', () => {
    expect(() => getVehicleBounds(game(TRIVIAL), 'Z')).toThrow(RangeError);
    expect(() => getVehicleBounds(game(TRIVIAL), 'Z')).toThrow('Véhicule « Z » inconnu');
  });
});

describe('applyMove', () => {
  it('déplace un véhicule dans un nouvel état sans modifier l’ancien', () => {
    const state = deepFreeze(game(FOUR_MOVES));
    const next = applyMove(state, 'C', 2);

    expect(vehicleOf(next, 'C')).toEqual({ ...vehicleOf(state, 'C'), col: 3 });
    expect(next.moves).toBe(1);
    expect(next.history).toEqual([{ vehicleId: 'C', delta: 2 }]);
    expect(next.isWon).toBe(false);
    expect(next.config).toBe(state.config);
    expect(next.vehicles).not.toBe(state.vehicles);
    expect(vehicleOf(next, 'hero')).toBe(vehicleOf(state, 'hero'));
    expect(vehicleOf(state, 'C').col).toBe(1);
  });

  it('déplace aussi vers la gauche et le haut, puis détecte la victoire', () => {
    const steps: TrafficJamMove[] = [
      { vehicleId: 'C', delta: 2 },
      { vehicleId: 'A', delta: 3 },
      { vehicleId: 'B', delta: -2 },
      { vehicleId: 'hero', delta: 4 },
    ];
    const won = replay(parseTrafficJamAscii(FOUR_MOVES), steps);

    expect(won.isWon).toBe(true);
    expect(won.moves).toBe(4);
    expect(won.history).toEqual(steps);
    expect(vehicleOf(won, 'hero')).toMatchObject({ row: 2, col: 4 });
    expect(vehicleOf(won, 'B')).toMatchObject({ row: 0, col: 4 });
  });

  it('renvoie l’état reçu pour un déplacement nul ou après la victoire', () => {
    const state = game(FOUR_MOVES);
    expect(applyMove(state, 'B', 0)).toBe(state);

    const won = applyMove(game(TRIVIAL), 'hero', 4);
    expect(won.isWon).toBe(true);
    expect(applyMove(won, 'hero', -1)).toBe(won);
  });

  it.each<[string, string, number, string]>([
    ['un véhicule inconnu', 'Z', 1, 'Véhicule « Z » inconnu'],
    [
      'un déplacement non entier',
      'B',
      1.5,
      'Déplacement 1.5 du véhicule « B » invalide (entier attendu)',
    ],
    [
      'un déplacement au-delà de la borne droite',
      'C',
      3,
      'Déplacement 3 du véhicule « C » hors de la plage autorisée (-1 à 2)',
    ],
    ['un déplacement au-delà de la borne gauche', 'C', -2, 'hors de la plage autorisée (-1 à 2)'],
    [
      'le hero bloqué',
      'hero',
      1,
      'Déplacement 1 du véhicule « hero » hors de la plage autorisée (0 à 0)',
    ],
  ])('refuse %s', (_name, vehicleId, delta, message) => {
    expect(() => applyMove(game(FOUR_MOVES), vehicleId, delta)).toThrow(RangeError);
    expect(() => applyMove(game(FOUR_MOVES), vehicleId, delta)).toThrow(message);
  });

  it('cumule les pas successifs d’un même véhicule en un seul coup', () => {
    const merge = { mergeWithPreviousIfSameVehicle: true };
    const one = applyMove(game(FOUR_MOVES), 'B', -1, merge);
    const two = applyMove(one, 'B', -1, merge);
    const three = applyMove(two, 'C', 1, merge);

    expect(one.history).toEqual([{ vehicleId: 'B', delta: -1 }]);
    expect(two.history).toEqual([{ vehicleId: 'B', delta: -2 }]);
    expect(two.moves).toBe(1);
    expect(vehicleOf(two, 'B').row).toBe(0);
    expect(three.history).toEqual([
      { vehicleId: 'B', delta: -2 },
      { vehicleId: 'C', delta: 1 },
    ]);
    expect(three.moves).toBe(2);
  });

  it('retire le coup quand le véhicule revient à sa place', () => {
    const merge = { mergeWithPreviousIfSameVehicle: true };
    const away = applyMove(applyMove(game(FOUR_MOVES), 'B', -1, merge), 'B', -1, merge);
    const back = applyMove(applyMove(away, 'B', 1, merge), 'B', 1, merge);

    expect(back.history).toEqual([]);
    expect(back.moves).toBe(0);
    expect(vehicleOf(back, 'B').row).toBe(2);
  });

  it('ne fusionne pas par-dessus le coup d’un autre véhicule ni sans l’option', () => {
    const merge = { mergeWithPreviousIfSameVehicle: true };
    const interleaved = applyMove(
      applyMove(applyMove(game(FOUR_MOVES), 'B', -1, merge), 'C', 1, merge),
      'B',
      -1,
      merge,
    );
    expect(interleaved.history).toEqual([
      { vehicleId: 'B', delta: -1 },
      { vehicleId: 'C', delta: 1 },
      { vehicleId: 'B', delta: -1 },
    ]);
    expect(interleaved.moves).toBe(3);

    const separate = applyMove(
      applyMove(game(FOUR_MOVES), 'B', -1, { mergeWithPreviousIfSameVehicle: false }),
      'B',
      -1,
    );
    expect(separate.history).toEqual([
      { vehicleId: 'B', delta: -1 },
      { vehicleId: 'B', delta: -1 },
    ]);
    expect(separate.moves).toBe(2);
  });
});

describe('undoLastMove et resetLevel', () => {
  it('annule le dernier coup, cumulé compris, et recalcule la victoire', () => {
    const start = game(TWO_MOVES);
    const merge = { mergeWithPreviousIfSameVehicle: true };
    const cleared = applyMove(applyMove(start, 'A', 1, merge), 'A', 1, merge);
    const won = applyMove(cleared, 'hero', 4);
    expect(won.isWon).toBe(true);

    const undone = undoLastMove(won);
    expect(undone.isWon).toBe(false);
    expect(undone.moves).toBe(1);
    expect(undone.history).toEqual([{ vehicleId: 'A', delta: 2 }]);
    expect(vehicleOf(undone, 'hero').col).toBe(0);

    const initial = undoLastMove(undone);
    expect(initial.vehicles).toEqual(start.vehicles);
    expect(initial).toMatchObject({ moves: 0, history: [], isWon: false });
    expect(initial.config).toBe(start.config);
  });

  it('renvoie l’état reçu sans historique', () => {
    const state = game(TWO_MOVES);
    expect(undoLastMove(state)).toBe(state);
  });

  it('recommence depuis les positions de départ', () => {
    const start = game(FOUR_MOVES);
    const played = applyMove(applyMove(start, 'C', 2), 'A', 3);
    const reset = resetLevel(played);

    expect(reset).toEqual(start);
    expect(reset.config).toBe(start.config);
    expect(reset.vehicles).not.toBe(played.vehicles);
    expect(resetLevel(game(ALREADY_WON)).isWon).toBe(true);
  });
});

describe('isPerfectWin', () => {
  const solution: TrafficJamMove[] = [
    { vehicleId: 'C', delta: 2 },
    { vehicleId: 'A', delta: 3 },
    { vehicleId: 'B', delta: -2 },
    { vehicleId: 'hero', delta: 4 },
  ];

  it('couronne une victoire en au plus optimalMoves coups', () => {
    const config = parseTrafficJamAscii(FOUR_MOVES, { optimalMoves: 4 });
    const perfect = replay(config, solution);
    const detour = replay(config, [
      { vehicleId: 'B', delta: 1 },
      { vehicleId: 'B', delta: -1 },
      ...solution,
    ]);

    expect(isPerfectWin(perfect)).toBe(true);
    expect(isPerfectWin(detour)).toBe(false);
    expect(isPerfectWin(undoLastMove(perfect))).toBe(false);
    expect(
      isPerfectWin(replay(parseTrafficJamAscii(FOUR_MOVES, { optimalMoves: 5 }), solution)),
    ).toBe(true);
  });
});

describe('solveTrafficJam', () => {
  it('expose ses constantes', () => {
    expect(UNSOLVABLE_MOVES).toBe(-1);
    expect(DEFAULT_MAX_STATES).toBe(50_000);
  });

  it('résout un niveau trivial en 1 coup', () => {
    expect(solveTrafficJam(parseTrafficJamAscii(TRIVIAL))).toEqual({
      solvable: true,
      optimalMoves: 1,
      solution: [{ vehicleId: 'hero', delta: 4 }],
    });
  });

  it.each<[string, string[], number]>([
    ['une voiture à dégager', TWO_MOVES, 2],
    ['deux camions à dégager', THREE_MOVES, 3],
    ['une chaîne de dépendances', FOUR_MOVES, 4],
    ['le niveau d’exemple du parseur', SAMPLE, 3],
    ['un parking de 11 véhicules en 20 coups', DENSE_20, 20],
  ])('trouve le minimum exact pour %s et une solution rejouable', (_name, lines, optimal) => {
    const config = parseTrafficJamAscii(lines);
    const result = solveTrafficJam(config);

    expect(result.solvable).toBe(true);
    expect(result.optimalMoves).toBe(optimal);
    expect(result.solution).toHaveLength(optimal);
    expect(referenceOptimalMoves(config)).toBe(optimal);

    const end = replay(config, result.solution);
    expect(end.isWon).toBe(true);
    expect(end.moves).toBe(optimal);
    expect(result.solution.every((move) => move.delta !== 0)).toBe(true);
  });

  it.each<[string, string[], number]>([
    ['un parking de 11 véhicules et un obstacle', DENSE_23, 23],
    ['un parking de 12 véhicules', DENSE_42, 42],
  ])('résout %s avec une solution rejouable', (_name, lines, optimal) => {
    const config = parseTrafficJamAscii(lines);
    const result = solveTrafficJam(config);

    expect(result).toMatchObject({ solvable: true, optimalMoves: optimal });
    expect(replay(config, result.solution)).toMatchObject({ isWon: true, moves: optimal });
  });

  it('reconnaît une position déjà gagnante', () => {
    expect(solveTrafficJam(parseTrafficJamAscii(ALREADY_WON))).toEqual({
      solvable: true,
      optimalMoves: 0,
      solution: [],
    });
    expect(solveTrafficJam(parseTrafficJamAscii(ALREADY_WON), 1).solvable).toBe(true);
  });

  it('déclare insoluble un hero muré', () => {
    const config = parseTrafficJamAscii(WALLED);

    expect(solveTrafficJam(config)).toEqual({
      solvable: false,
      optimalMoves: UNSOLVABLE_MOVES,
      solution: [],
    });
    expect(referenceOptimalMoves(config)).toBe(-1);
  });

  it('refuse un budget de positions qui n’est pas un nombre ≥ 1', () => {
    const config = parseTrafficJamAscii(TWO_MOVES);
    for (const budget of [Number.NaN, 0, -5]) {
      expect(() => solveTrafficJam(config, budget)).toThrow(RangeError);
    }
    expect(solveTrafficJam(config, Number.POSITIVE_INFINITY).solvable).toBe(true);
  });

  it('abandonne au-delà du budget de positions, départ compris', () => {
    const config = parseTrafficJamAscii(FOUR_MOVES);

    expect(solveTrafficJam(config, 3)).toEqual({ solvable: false, optimalMoves: -1, solution: [] });
    expect(solveTrafficJam(config, 1).solvable).toBe(false);
    // Niveau trivial : départ, 3 positions intermédiaires du hero, puis l'arrivée = 5 positions.
    expect(solveTrafficJam(parseTrafficJamAscii(TRIVIAL), 4).solvable).toBe(false);
    expect(solveTrafficJam(parseTrafficJamAscii(TRIVIAL), 5).solvable).toBe(true);
  });

  it('refuse une géométrie invalide', () => {
    expect(() => solveTrafficJam(board({ vehicles: [] }))).toThrow(
      'Niveau Traffic Jam invalide : aucun véhicule du joueur (type hero)',
    );
    expect(() => solveFromVehicles(board(), [HERO, car('A', 'H', 2, 0)])).toThrow(
      'le véhicule « A » chevauche le véhicule « hero »',
    );
  });

  it('code les positions en nombre au-delà de 2^31 et en chaîne au-delà de 2^53', () => {
    const thirteen = parseTrafficJamAscii(THIRTEEN_CARS);
    expect(solveTrafficJam(thirteen)).toEqual({
      solvable: true,
      optimalMoves: 1,
      solution: [{ vehicleId: 'hero', delta: 4 }],
    });

    const big = parseTrafficJamAscii(BIG_GRID);
    const result = solveTrafficJam(big);
    expect(result).toMatchObject({ solvable: true, optimalMoves: 2 });
    expect(replay(big, result.solution).isWon).toBe(true);
    expect(referenceOptimalMoves(big)).toBe(2);
    expect(solveTrafficJam(big, 2).solvable).toBe(false);
  });

  it('résout depuis des positions arbitraires', () => {
    const config = parseTrafficJamAscii(FOUR_MOVES);
    const played = applyMove(createTrafficJamGame(config), 'C', 2);

    expect(solveFromVehicles(config, played.vehicles).optimalMoves).toBe(3);
    expect(solveFromVehicles(config, config.vehicles)).toEqual(solveTrafficJam(config));
  });
});

describe('getNextBestMove', () => {
  it('mène à la victoire en optimalMoves coups quand on le suit', () => {
    const config = parseTrafficJamAscii(DENSE_23);
    let state = createTrafficJamGame(config);
    const played: TrafficJamMove[] = [];
    while (!state.isWon) {
      const move = getNextBestMove(state);
      if (move === null) throw new Error('indice manquant avant la victoire');
      played.push(move);
      state = applyMove(state, move.vehicleId, move.delta);
    }

    expect(played).toHaveLength(23);
    expect(state.moves).toBe(23);
    expect(getNextBestMove(state)).toBeNull();
  });

  it('propose le premier coup de la solution, puis rien une fois gagné ou insoluble', () => {
    const state = game(TWO_MOVES);
    expect(getNextBestMove(state)).toEqual(solveTrafficJam(state.config).solution[0]);
    expect(getNextBestMove(game(ALREADY_WON))).toBeNull();
    expect(getNextBestMove(game(WALLED))).toBeNull();
    expect(getNextBestMove(game(FOUR_MOVES), 2)).toBeNull();
  });
});

describe('Performance du solveur', () => {
  it('résout les parkings denses bien sous la seconde', () => {
    const configs = [DENSE_42, DENSE_23, BIG_GRID].map((lines) => parseTrafficJamAscii(lines));
    const start = performance.now();
    const results = configs.map((config) => solveTrafficJam(config));
    const elapsed = performance.now() - start;

    expect(results.map((result) => result.optimalMoves)).toEqual([42, 23, 2]);
    expect(elapsed).toBeLessThan(1000);
  });
});
