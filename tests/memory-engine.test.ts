import {
  buildCardGroups,
  createMemoryGame,
  DISTINCT_COLOR_CLASSES,
  endPreviewPhase,
  getMemoryConfigErrors,
  getMemoryModeCapacity,
  getMemorySymbolLabel,
  isEvaluationMatch,
  isMemoryVisualMode,
  isPerfectWin,
  MEMORY_ICONS,
  MEMORY_ROTATIONS,
  MEMORY_SHAPES,
  MEMORY_THEMES,
  resolveEvaluation,
  selectCard,
  type MemoryCard,
  type MemoryGameState,
  type MemoryLevelConfig,
  type MemoryVisualMode,
  type Rng,
} from '@/games/memory';
import { describe, expect, it } from 'vitest';

/** Tirage toujours nul : chaque mélange conserve l'ordre (symboles du catalogue, cartes groupées). */
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

const MODES: MemoryVisualMode[] = [
  'distinct_color_shape',
  'thematic_palette',
  'monochrome',
  'abstract_orientation',
];

const UNKNOWN_MODE = 'rainbow' as string as MemoryVisualMode;

const SPEC_SYMBOLS = [
  'sun',
  'moon',
  'star',
  'heart',
  'apple',
  'car',
  'rocket',
  'cat',
  'dog',
  'fish',
  'bird',
  'tree',
  'flower',
  'music',
  'crown',
  'diamond',
  'anchor',
  'bell',
  'bolt',
  'cloud',
  'compass',
  'feather',
  'flame',
  'key',
];

const SHAPE_IDS = new Set<string>(MEMORY_SHAPES.map((shape) => shape.id));

function config(overrides: Partial<MemoryLevelConfig> = {}): MemoryLevelConfig {
  return {
    cols: 2,
    rows: 2,
    matchSize: 2,
    visualMode: 'distinct_color_shape',
    previewSeconds: 0,
    maxMistakes: null,
    swapEveryNMistakes: null,
    perfectMaxMistakes: 0,
    ...overrides,
  };
}

type LevelRow = [
  id: string,
  cols: number,
  rows: number,
  matchSize: 2 | 3,
  visualMode: MemoryVisualMode,
  previewSeconds: number,
  maxMistakes: number | null,
  swapEveryNMistakes: number | null,
  perfectMaxMistakes: number,
];

/** Configurations du catalogue initial des 20 étoiles (FEAT-11 §3.1). */
const INITIAL_LEVEL_ROWS: LevelRow[] = [
  ['mem-001', 2, 2, 2, 'distinct_color_shape', 3, null, null, 0],
  ['mem-002', 3, 2, 2, 'distinct_color_shape', 3, null, null, 1],
  ['mem-003', 3, 2, 2, 'distinct_color_shape', 0, null, null, 2],
  ['mem-004', 4, 2, 2, 'distinct_color_shape', 2, null, null, 2],
  ['mem-005', 4, 2, 2, 'thematic_palette', 0, null, null, 3],
  ['mem-006', 5, 2, 2, 'distinct_color_shape', 2, null, null, 3],
  ['mem-007', 5, 2, 2, 'thematic_palette', 0, null, null, 4],
  ['mem-008', 4, 3, 2, 'thematic_palette', 0, null, null, 4],
  ['mem-009', 4, 3, 2, 'monochrome', 2, 10, null, 4],
  ['mem-010', 4, 4, 2, 'thematic_palette', 2, 12, null, 5],
  ['mem-011', 4, 4, 2, 'monochrome', 0, 12, null, 6],
  ['mem-012', 5, 4, 2, 'thematic_palette', 0, 14, null, 7],
  ['mem-013', 5, 4, 2, 'monochrome', 0, 12, null, 6],
  ['mem-014', 6, 4, 2, 'thematic_palette', 0, 15, null, 8],
  ['mem-015', 5, 3, 3, 'distinct_color_shape', 3, 10, null, 4],
  ['mem-016', 6, 4, 2, 'abstract_orientation', 0, 14, null, 8],
  ['mem-017', 6, 5, 2, 'monochrome', 0, 18, null, 10],
  ['mem-018', 6, 4, 3, 'thematic_palette', 3, 14, null, 6],
  ['mem-019', 5, 4, 2, 'monochrome', 0, 12, 4, 6],
  ['mem-020', 6, 6, 2, 'abstract_orientation', 0, 20, 5, 10],
];

const INITIAL_LEVELS: [string, MemoryLevelConfig][] = INITIAL_LEVEL_ROWS.map(
  ([id, cols, rows, matchSize, visualMode, previewSeconds, maxMistakes, swapEvery, perfect]) => [
    id,
    {
      cols,
      rows,
      matchSize,
      visualMode,
      previewSeconds,
      maxMistakes,
      swapEveryNMistakes: swapEvery,
      perfectMaxMistakes: perfect,
    },
  ],
);

function initialLevel(id: string): MemoryLevelConfig {
  const entry = INITIAL_LEVELS.find(([levelId]) => levelId === id);
  if (!entry) throw new Error(`niveau « ${id} » absent du catalogue initial`);
  return entry[1];
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function cardAt(state: MemoryGameState, index: number): MemoryCard {
  const card = state.cards[index];
  if (!card) throw new Error(`carte n° ${String(index)} absente du plateau`);
  return card;
}

function uidsOf(state: MemoryGameState): string[] {
  return state.cards.map((card) => card.uid);
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function themeOf(symbolId: string): string | undefined {
  return MEMORY_ICONS.find((icon) => icon.id === symbolId)?.theme;
}

/** Positions des cartes de chaque groupe, dans l'ordre du plateau. */
function groupIndices(state: MemoryGameState): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  state.cards.forEach((card, index) => {
    groups.set(card.groupId, [...(groups.get(card.groupId) ?? []), index]);
  });
  return groups;
}

/** Groupes encore à trouver (toutes leurs cartes cachées). */
function hiddenGroups(state: MemoryGameState): number[][] {
  return [...groupIndices(state).values()].filter((indices) =>
    indices.every((index) => cardAt(state, index).state === 'hidden'),
  );
}

/** Coup gagnant : toutes les cartes du premier groupe à trouver. */
function rightMove(state: MemoryGameState): number[] {
  const [group] = hiddenGroups(state);
  if (!group) throw new Error('aucun groupe à trouver');
  return group;
}

/** Coup perdant : une carte d'un groupe à trouver, complétée par les cartes d'un autre groupe. */
function wrongMove(state: MemoryGameState): number[] {
  const [first, second] = hiddenGroups(state);
  if (!first || !second) throw new Error('au moins deux groupes à trouver sont nécessaires');
  return [...first.slice(0, 1), ...second.slice(0, state.config.matchSize - 1)];
}

function flip(state: MemoryGameState, indices: readonly number[]): MemoryGameState {
  return indices.reduce((current, index) => selectCard(current, index), state);
}

/** Coup complet : retourne les cartes `indices` puis résout l'évaluation. */
function play(
  state: MemoryGameState,
  indices: readonly number[],
  rng: Rng = FIRST,
): MemoryGameState {
  return resolveEvaluation(flip(state, indices), rng);
}

/** Fin de partie sans erreur, en connaissant la position de chaque groupe. */
function playPerfectly(state: MemoryGameState): MemoryGameState {
  let current = endPreviewPhase(state);
  while (current.phase === 'playing') current = play(current, rightMove(current));
  return current;
}

describe('Banque de symboles', () => {
  it('fournit au moins 24 icônes uniques, dont les 24 symboles de la spécification', () => {
    const ids = MEMORY_ICONS.map((icon) => icon.id);

    expect(ids.length).toBeGreaterThanOrEqual(24);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(SPEC_SYMBOLS));
  });

  it('range les icônes en thèmes d’au moins 12 icônes, chacun doté de 3 couleurs distinctes', () => {
    expect(MEMORY_THEMES.map((theme) => theme.id)).toEqual(['nature', 'animals', 'objects']);
    for (const theme of MEMORY_THEMES) {
      const icons = MEMORY_ICONS.filter((icon) => icon.theme === theme.id);
      expect(icons.length).toBeGreaterThanOrEqual(12);
      expect(new Set(theme.colorClasses).size).toBe(3);
      expect(DISTINCT_COLOR_CLASSES).toEqual(expect.arrayContaining([...theme.colorClasses]));
    }
    const themeIds = new Set<string>(MEMORY_THEMES.map((theme) => theme.id));
    expect(MEMORY_ICONS.every((icon) => themeIds.has(icon.theme))).toBe(true);
  });

  it('propose 10 couleurs très distinctes, 8 formes orientables et 4 orientations', () => {
    expect(DISTINCT_COLOR_CLASSES).toHaveLength(10);
    expect(new Set(DISTINCT_COLOR_CLASSES).size).toBe(10);
    expect(DISTINCT_COLOR_CLASSES.every((color) => /^text-[a-z]+-\d+$/.test(color))).toBe(true);
    expect(MEMORY_SHAPES).toHaveLength(8);
    expect(MEMORY_ROTATIONS).toEqual([0, 90, 180, 270]);
  });

  it('vocalise chaque symbole par un nom français unique, orientation comprise', () => {
    expect(getMemorySymbolLabel('sun')).toBe('Soleil');
    expect(getMemorySymbolLabel('droplet')).toBe('Goutte d’eau');
    expect(getMemorySymbolLabel('arrow')).toBe('Flèche, vers le haut');
    expect(getMemorySymbolLabel('arrow', 90)).toBe('Flèche, vers la droite');
    expect(getMemorySymbolLabel('l-shape', 180)).toBe('Forme en L, vers le bas');
    expect(getMemorySymbolLabel('half-disc', 270)).toBe('Demi-disque, vers la gauche');

    const labels = [
      ...MEMORY_ICONS.map((icon) => getMemorySymbolLabel(icon.id)),
      ...MEMORY_SHAPES.flatMap((shape) =>
        MEMORY_ROTATIONS.map((rotation) => getMemorySymbolLabel(shape.id, rotation)),
      ),
    ];
    expect(labels).toHaveLength(68);
    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('annonce la capacité de chaque mode visuel et reconnaît les modes connus', () => {
    expect(MODES.map((mode) => getMemoryModeCapacity(mode))).toEqual([10, 36, 36, 32]);
    expect(MODES.every((mode) => isMemoryVisualMode(mode))).toBe(true);
    expect(isMemoryVisualMode('rainbow')).toBe(false);
    expect(isMemoryVisualMode('constructor')).toBe(false);
  });
});

describe('buildCardGroups', () => {
  it('suit l’ordre du catalogue quand le tirage est toujours nul', () => {
    expect(buildCardGroups({ visualMode: 'distinct_color_shape' }, 4, FIRST)).toEqual([
      { groupId: 'sun@0', symbolId: 'sun', colorClass: 'text-red-400', rotationDeg: 0 },
      { groupId: 'cat@0', symbolId: 'cat', colorClass: 'text-orange-400', rotationDeg: 0 },
      { groupId: 'heart@0', symbolId: 'heart', colorClass: 'text-yellow-300', rotationDeg: 0 },
      { groupId: 'moon@0', symbolId: 'moon', colorClass: 'text-lime-400', rotationDeg: 0 },
    ]);
    expect(
      buildCardGroups({ visualMode: 'abstract_orientation' }, 5, FIRST).map(
        (group) => group.groupId,
      ),
    ).toEqual(['arrow@0', 'arrow@90', 'arrow@180', 'arrow@270', 'chevron@0']);
  });

  it('donne à chaque groupe distinct une icône et une couleur uniques, en alternant les thèmes', () => {
    const groups = buildCardGroups({ visualMode: 'distinct_color_shape' }, 10, seeded(1));

    expect(groups).toHaveLength(10);
    expect(new Set(groups.map((group) => group.symbolId)).size).toBe(10);
    expect(new Set(groups.map((group) => group.colorClass)).size).toBe(10);
    expect(groups.every((group) => group.rotationDeg === 0)).toBe(true);
    expect(groups.some((group) => SHAPE_IDS.has(group.symbolId))).toBe(false);
    for (const start of [0, 3, 6]) {
      const themes = groups.slice(start, start + 3).map((group) => themeOf(group.symbolId));
      expect(new Set(themes).size).toBe(3);
    }
  });

  it('tire les groupes thématiques d’un seul thème, sur ses 3 couleurs à parts égales', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const [totalGroups, expectedCounts] of [
        [12, [4, 4, 4]],
        [10, [3, 3, 4]],
      ] as const) {
        const groups = buildCardGroups(
          { visualMode: 'thematic_palette' },
          totalGroups,
          seeded(seed),
        );
        const themes = new Set(groups.map((group) => themeOf(group.symbolId)));
        const theme = MEMORY_THEMES.find((candidate) => themes.has(candidate.id));
        const counts = countBy(groups, (group) => group.colorClass);

        expect(themes.size).toBe(1);
        expect([...counts.keys()].sort()).toEqual([...(theme?.colorClasses ?? [])].sort());
        expect([...counts.values()].sort((a, b) => a - b)).toEqual(expectedCounts);
        expect(groups.every((group) => group.rotationDeg === 0)).toBe(true);
      }
    }
  });

  it('complète les groupes thématiques avec un autre thème au-delà de 12', () => {
    const groups = buildCardGroups({ visualMode: 'thematic_palette' }, 18, seeded(3));
    const mainThemes = new Set(groups.slice(0, 12).map((group) => themeOf(group.symbolId)));
    const extraThemes = new Set(groups.slice(12).map((group) => themeOf(group.symbolId)));
    const palette = MEMORY_THEMES.find((theme) => mainThemes.has(theme.id))?.colorClasses ?? [];

    expect(mainThemes.size).toBe(1);
    expect(extraThemes.size).toBe(1);
    expect([...extraThemes]).not.toEqual([...mainThemes]);
    expect(new Set(groups.map((group) => group.symbolId)).size).toBe(18);
    // Les icônes ajoutées gardent la palette du thème tiré.
    expect([...countBy(groups, (group) => group.colorClass).keys()].sort()).toEqual(
      [...palette].sort(),
    );
  });

  it('donne la même couleur à tous les groupes monochromes, avec des icônes uniques', () => {
    const groups = buildCardGroups({ visualMode: 'monochrome' }, 36, seeded(4));
    const colors = new Set(groups.map((group) => group.colorClass));

    expect(colors.size).toBe(1);
    expect(DISTINCT_COLOR_CLASSES).toEqual(expect.arrayContaining([...colors]));
    expect(new Set(groups.map((group) => group.symbolId)).size).toBe(36);
    expect(groups.every((group) => group.rotationDeg === 0)).toBe(true);
  });

  it('utilise toutes les orientations de chaque forme tirée, d’une seule couleur', () => {
    const groups = buildCardGroups({ visualMode: 'abstract_orientation' }, 18, seeded(5));
    const perShape = countBy(groups, (group) => group.symbolId);

    expect(groups.every((group) => SHAPE_IDS.has(group.symbolId))).toBe(true);
    expect(new Set(groups.map((group) => group.colorClass)).size).toBe(1);
    // 18 groupes = 4 formes complètes + 2 orientations d'une cinquième.
    expect([...perShape.values()].sort((a, b) => a - b)).toEqual([2, 4, 4, 4, 4]);
    expect(new Set(groups.map((group) => group.groupId)).size).toBe(18);
  });

  it.each(MODES)('ne distingue jamais deux groupes par la seule couleur (%s)', (visualMode) => {
    const capacity = getMemoryModeCapacity(visualMode);
    const groups = buildCardGroups({ visualMode }, capacity, seeded(6));
    const identities = groups.map((group) => `${group.symbolId}@${String(group.rotationDeg)}`);

    expect(groups).toHaveLength(capacity);
    expect(new Set(identities).size).toBe(capacity);
    expect(groups.map((group) => group.groupId)).toEqual(identities);
  });

  it.each(MODES)(
    'tire l’apparence au hasard à chaque partie, de façon reproductible (%s)',
    (visualMode) => {
      const groups = buildCardGroups({ visualMode }, 8, seeded(10));
      const variants = new Set(
        [10, 11, 12, 13, 14].map((seed) =>
          JSON.stringify(buildCardGroups({ visualMode }, 8, seeded(seed))),
        ),
      );

      expect(buildCardGroups({ visualMode }, 8, seeded(10))).toEqual(groups);
      expect(variants.size).toBeGreaterThan(1);
    },
  );

  it('tire au hasard avec Math.random par défaut', () => {
    expect(buildCardGroups({ visualMode: 'thematic_palette' }, 6)).toHaveLength(6);
  });

  it('refuse un mode inconnu ou un nombre de groupes hors de la capacité du mode', () => {
    expect(buildCardGroups({ visualMode: 'monochrome' }, 0, FIRST)).toEqual([]);
    expect(() => buildCardGroups({ visualMode: 'distinct_color_shape' }, 11)).toThrow(
      new RangeError('11 groupes demandés : le mode « distinct_color_shape » en accepte de 0 à 10'),
    );
    expect(() => buildCardGroups({ visualMode: 'abstract_orientation' }, 33)).toThrow(RangeError);
    expect(() => buildCardGroups({ visualMode: 'monochrome' }, -1)).toThrow(RangeError);
    expect(() => buildCardGroups({ visualMode: 'monochrome' }, 1.5)).toThrow(RangeError);
    expect(() => buildCardGroups({ visualMode: UNKNOWN_MODE }, 2)).toThrow(
      new RangeError('Mode visuel « rainbow » inconnu'),
    );
  });
});

describe('getMemoryConfigErrors', () => {
  it('accepte une configuration valide', () => {
    expect(getMemoryConfigErrors(config())).toEqual([]);
    expect(getMemoryConfigErrors(initialLevel('mem-020'))).toEqual([]);
  });

  it.each<[string, Partial<MemoryLevelConfig>, string]>([
    ['cols nul', { cols: 0 }, 'cols 0 invalide (entier ≥ 1 attendu)'],
    ['cols décimal', { cols: 2.5 }, 'cols 2.5 invalide (entier ≥ 1 attendu)'],
    ['rows négatif', { rows: -2 }, 'rows -2 invalide (entier ≥ 1 attendu)'],
    ['matchSize inconnu', { matchSize: 4 as number as 2 }, 'matchSize 4 invalide (2 ou 3 attendu)'],
    ['mode visuel inconnu', { visualMode: UNKNOWN_MODE }, 'visualMode « rainbow » inconnu'],
    [
      'grille non divisible',
      { cols: 3, rows: 3 },
      'grille 3 × 3 non divisible en groupes de 2 cartes',
    ],
    [
      'grille d’un seul groupe',
      { cols: 2, rows: 1 },
      'grille 2 × 1 trop petite (au moins 2 groupes de 2 cartes)',
    ],
    [
      'triplet unique',
      { cols: 3, rows: 1, matchSize: 3 },
      'grille 3 × 1 trop petite (au moins 2 groupes de 3 cartes)',
    ],
    [
      'mode visuel saturé',
      { cols: 11, rows: 2 },
      'grille 11 × 2 : 11 groupes, le mode « distinct_color_shape » en accepte 10 au plus',
    ],
    [
      'aperçu négatif',
      { previewSeconds: -1 },
      'previewSeconds -1 invalide (nombre fini ≥ 0 attendu)',
    ],
    [
      'aperçu infini',
      { previewSeconds: Infinity },
      'previewSeconds Infinity invalide (nombre fini ≥ 0 attendu)',
    ],
    [
      'aperçu NaN',
      { previewSeconds: Number.NaN },
      'previewSeconds NaN invalide (nombre fini ≥ 0 attendu)',
    ],
    [
      'limite d’erreurs négative',
      { maxMistakes: -1 },
      'maxMistakes -1 invalide (null ou entier ≥ 0 attendu)',
    ],
    [
      'limite d’erreurs décimale',
      { maxMistakes: 1.5 },
      'maxMistakes 1.5 invalide (null ou entier ≥ 0 attendu)',
    ],
    [
      'permutation nulle',
      { swapEveryNMistakes: 0 },
      'swapEveryNMistakes 0 invalide (null ou entier ≥ 1 attendu)',
    ],
    [
      'couronne négative',
      { perfectMaxMistakes: -1 },
      'perfectMaxMistakes -1 invalide (entier ≥ 0 attendu)',
    ],
    [
      'couronne plus permissive que la défaite',
      { maxMistakes: 4, perfectMaxMistakes: 5 },
      'perfectMaxMistakes 5 supérieur à maxMistakes 4 : chaque victoire serait couronnée',
    ],
    [
      'permutation impossible avant la défaite',
      { maxMistakes: 3, swapEveryNMistakes: 4 },
      'swapEveryNMistakes 4 supérieur à maxMistakes 3 : aucune permutation avant la défaite',
    ],
  ])('signale : %s', (_, overrides, message) => {
    expect(getMemoryConfigErrors(config(overrides))).toEqual([message]);
  });

  it('ne déduit aucune anomalie en cascade d’une valeur déjà signalée', () => {
    expect(
      getMemoryConfigErrors(
        config({ cols: 0, rows: 1.5, matchSize: 4 as number as 2, visualMode: UNKNOWN_MODE }),
      ),
    ).toEqual([
      'cols 0 invalide (entier ≥ 1 attendu)',
      'rows 1.5 invalide (entier ≥ 1 attendu)',
      'matchSize 4 invalide (2 ou 3 attendu)',
      'visualMode « rainbow » inconnu',
    ]);
    expect(
      getMemoryConfigErrors(
        config({ maxMistakes: 2, swapEveryNMistakes: 0, perfectMaxMistakes: -1 }),
      ),
    ).toEqual([
      'swapEveryNMistakes 0 invalide (null ou entier ≥ 1 attendu)',
      'perfectMaxMistakes -1 invalide (entier ≥ 0 attendu)',
    ]);
    expect(
      getMemoryConfigErrors(
        config({ maxMistakes: -1, swapEveryNMistakes: 9, perfectMaxMistakes: 9 }),
      ),
    ).toEqual(['maxMistakes -1 invalide (null ou entier ≥ 0 attendu)']);
  });

  it('signale séparément une grille non divisible et trop petite', () => {
    expect(getMemoryConfigErrors(config({ cols: 1, rows: 1 }))).toEqual([
      'grille 1 × 1 non divisible en groupes de 2 cartes',
      'grille 1 × 1 trop petite (au moins 2 groupes de 2 cartes)',
    ]);
  });

  it('accepte une couronne ou une permutation au seuil de la défaite (mort subite comprise)', () => {
    expect(getMemoryConfigErrors(config({ maxMistakes: 0, perfectMaxMistakes: 0 }))).toEqual([]);
    expect(
      getMemoryConfigErrors(
        config({ maxMistakes: 4, swapEveryNMistakes: 4, perfectMaxMistakes: 4 }),
      ),
    ).toEqual([]);
    expect(
      getMemoryConfigErrors(config({ swapEveryNMistakes: 50, perfectMaxMistakes: 50 })),
    ).toEqual([]);
  });

  it('respecte la capacité de chaque mode visuel', () => {
    expect(getMemoryConfigErrors(config({ cols: 5, rows: 4 }))).toEqual([]);
    expect(getMemoryConfigErrors(config({ cols: 9, rows: 8, visualMode: 'monochrome' }))).toEqual(
      [],
    );
    expect(
      getMemoryConfigErrors(config({ cols: 8, rows: 8, visualMode: 'abstract_orientation' })),
    ).toEqual([]);
    expect(
      getMemoryConfigErrors(config({ cols: 6, rows: 11, visualMode: 'abstract_orientation' })),
    ).toEqual([
      'grille 6 × 11 : 33 groupes, le mode « abstract_orientation » en accepte 32 au plus',
    ]);
    expect(
      getMemoryConfigErrors(config({ cols: 6, rows: 6, matchSize: 3, perfectMaxMistakes: 4 })),
    ).toEqual([
      'grille 6 × 6 : 12 groupes, le mode « distinct_color_shape » en accepte 10 au plus',
    ]);
  });
});

describe('createMemoryGame', () => {
  it('crée les paires d’une grille 2 × 2, cartes cachées et jamais vues', () => {
    const game = createMemoryGame(config(), FIRST);

    expect(game).toMatchObject({
      phase: 'playing',
      flippedIndices: [],
      moves: 0,
      mistakes: 0,
      matchedGroups: 0,
      totalGroups: 2,
      lastSwappedPair: null,
    });
    expect(uidsOf(game)).toEqual(['sun@0#1', 'sun@0#2', 'cat@0#1', 'cat@0#2']);
    expect(game.cards[0]).toEqual({
      uid: 'sun@0#1',
      groupId: 'sun@0',
      symbolId: 'sun',
      colorClass: 'text-red-400',
      rotationDeg: 0,
      state: 'hidden',
      seen: false,
    });
    expect(game.cards.every((card) => card.state === 'hidden' && !card.seen)).toBe(true);
  });

  it('crée les triplets d’une grille 5 × 3', () => {
    const game = createMemoryGame(config({ cols: 5, rows: 3, matchSize: 3 }), seeded(2));

    expect(game.cards).toHaveLength(15);
    expect(game.totalGroups).toBe(5);
    expect([...groupIndices(game).values()].map((indices) => indices.length)).toEqual([
      3, 3, 3, 3, 3,
    ]);
  });

  it('ouvre l’aperçu avec toutes les cartes visibles, et donc vues', () => {
    const game = createMemoryGame(config({ previewSeconds: 3 }), FIRST);

    expect(game.phase).toBe('preview');
    expect(game.cards.every((card) => card.state === 'flipped' && card.seen)).toBe(true);
  });

  it('donne à chaque carte un uid unique et l’apparence de son groupe', () => {
    const game = createMemoryGame(initialLevel('mem-020'), seeded(3));

    expect(new Set(uidsOf(game)).size).toBe(36);
    for (const [groupId, indices] of groupIndices(game)) {
      const cards = indices.map((index) => cardAt(game, index));
      const [first] = cards;
      expect(cards.map((card) => card.uid).sort()).toEqual([`${groupId}#1`, `${groupId}#2`]);
      expect(
        cards.every(
          (card) =>
            card.symbolId === first?.symbolId &&
            card.colorClass === first.colorClass &&
            card.rotationDeg === first.rotationDeg,
        ),
      ).toBe(true);
    }
  });

  it('mélange les cartes par Fisher-Yates avec le rng injecté, de façon reproductible', () => {
    const level = initialLevel('mem-010');
    const grouped = createMemoryGame(level, FIRST);
    const shuffled = createMemoryGame(level, seeded(42));
    const isGrouped = (state: MemoryGameState) =>
      state.cards.every(
        (card, index) => index % 2 === 1 || state.cards[index + 1]?.groupId === card.groupId,
      );

    expect(isGrouped(grouped)).toBe(true);
    expect(isGrouped(shuffled)).toBe(false);
    expect(createMemoryGame(level, seeded(42))).toEqual(shuffled);
    expect(uidsOf(createMemoryGame(level, seeded(43)))).not.toEqual(uidsOf(shuffled));
  });

  it('reste dans les bornes avec un générateur défaillant (1, négatif, NaN)', () => {
    for (const rng of [() => 1, () => -0.5, () => Number.NaN]) {
      const game = createMemoryGame(initialLevel('mem-009'), rng);

      expect(game.cards).toHaveLength(12);
      expect(new Set(uidsOf(game)).size).toBe(12);
    }
  });

  it('tire au hasard avec Math.random par défaut', () => {
    const game = createMemoryGame(config({ cols: 4, rows: 2 }));

    expect(game.cards).toHaveLength(8);
    expect(game.totalGroups).toBe(4);
  });

  it('lève une erreur listant les anomalies d’une configuration invalide', () => {
    expect(() => createMemoryGame(config({ cols: 3, rows: 3 }))).toThrow(
      'Configuration Memory invalide : grille 3 × 3 non divisible en groupes de 2 cartes',
    );
    expect(() => createMemoryGame(config({ cols: 0, previewSeconds: -1 }))).toThrow(
      'Configuration Memory invalide : cols 0 invalide (entier ≥ 1 attendu) ; previewSeconds -1 invalide (nombre fini ≥ 0 attendu)',
    );
  });

  it('garde la configuration reçue sans la modifier', () => {
    const level = deepFreeze(config({ previewSeconds: 2 }));

    expect(createMemoryGame(level, FIRST).config).toBe(level);
  });

  it.each(INITIAL_LEVELS)('instancie %s du catalogue initial (FEAT-11)', (_, level) => {
    const game = createMemoryGame(level, seeded(7));

    expect(getMemoryConfigErrors(level)).toEqual([]);
    expect(game.cards).toHaveLength(level.cols * level.rows);
    expect(game.totalGroups).toBe((level.cols * level.rows) / level.matchSize);
    expect(game.phase).toBe(level.previewSeconds > 0 ? 'preview' : 'playing');
  });
});

describe('endPreviewPhase', () => {
  it('cache toutes les cartes et lance la partie, cartes toujours vues', () => {
    const game = endPreviewPhase(createMemoryGame(config({ previewSeconds: 3 }), FIRST));

    expect(game.phase).toBe('playing');
    expect(game.cards.every((card) => card.state === 'hidden' && card.seen)).toBe(true);
  });

  it('ignore l’appel hors de l’aperçu (état reçu renvoyé tel quel)', () => {
    const game = createMemoryGame(config(), FIRST);
    const started = endPreviewPhase(createMemoryGame(config({ previewSeconds: 1 }), FIRST));

    expect(endPreviewPhase(game)).toBe(game);
    expect(endPreviewPhase(started)).toBe(started);
  });
});

describe('selectCard', () => {
  it('retourne une carte cachée et la marque comme vue', () => {
    const game = createMemoryGame(config(), FIRST);
    const next = selectCard(game, 2);

    expect(cardAt(next, 2)).toMatchObject({ state: 'flipped', seen: true });
    expect(next).toMatchObject({ phase: 'playing', flippedIndices: [2], moves: 0 });
    expect(next.cards[0]).toBe(game.cards[0]);
  });

  it('compte le coup et passe en évaluation à la deuxième carte d’une paire', () => {
    const next = flip(createMemoryGame(config(), FIRST), [2, 0]);

    expect(next).toMatchObject({ phase: 'evaluating', flippedIndices: [2, 0], moves: 1 });
  });

  it('attend la troisième carte des triplets, même si les deux premières diffèrent', () => {
    const game = createMemoryGame(config({ cols: 3, rows: 2, matchSize: 3 }), FIRST);
    const twoCards = flip(game, [0, 3]);

    expect(twoCards).toMatchObject({ phase: 'playing', flippedIndices: [0, 3], moves: 0 });
    expect(selectCard(twoCards, 4)).toMatchObject({
      phase: 'evaluating',
      flippedIndices: [0, 3, 4],
      moves: 1,
    });
  });

  it('ignore une carte déjà retournée ou trouvée, ou hors du plateau', () => {
    const game = createMemoryGame(config({ cols: 4, rows: 2 }), FIRST);
    const flipped = selectCard(game, 0);
    const matched = play(game, [0, 1]);

    expect(selectCard(flipped, 0)).toBe(flipped);
    expect(selectCard(matched, 1)).toBe(matched);
    for (const index of [-1, 8, 1.5, Number.NaN]) expect(selectCard(game, index)).toBe(game);
  });

  it('ignore les retournements hors de la phase de jeu', () => {
    const preview = createMemoryGame(config({ previewSeconds: 2 }), FIRST);
    const evaluating = flip(createMemoryGame(config(), FIRST), [0, 2]);
    const won = playPerfectly(createMemoryGame(config(), FIRST));
    const lost = play(createMemoryGame(config({ maxMistakes: 0 }), FIRST), [0, 2]);

    expect(selectCard(preview, 0)).toBe(preview);
    expect(selectCard(evaluating, 1)).toBe(evaluating);
    expect(won.phase).toBe('won');
    expect(selectCard(won, 0)).toBe(won);
    expect(lost.phase).toBe('lost');
    expect(selectCard(lost, 0)).toBe(lost);
  });

  it('ignore un retournement de trop dans un état incohérent', () => {
    const full: MemoryGameState = { ...createMemoryGame(config(), FIRST), flippedIndices: [0, 1] };

    expect(selectCard(full, 2)).toBe(full);
  });

  it('ne modifie jamais l’état reçu', () => {
    const game = deepFreeze(createMemoryGame(config({ cols: 4, rows: 2 }), FIRST));

    expect(() => flip(game, [0, 2])).not.toThrow();
    expect(game.cards.every((card) => card.state === 'hidden')).toBe(true);
  });
});

describe('isEvaluationMatch', () => {
  it('reconnaît un groupe complet pendant l’évaluation seulement', () => {
    const game = createMemoryGame(config({ cols: 3, rows: 2, matchSize: 3 }), FIRST);

    expect(isEvaluationMatch(flip(game, [0, 1, 2]))).toBe(true);
    expect(isEvaluationMatch(flip(game, [0, 1, 3]))).toBe(false);
    expect(isEvaluationMatch(flip(game, [0, 1]))).toBe(false);
    expect(isEvaluationMatch(game)).toBe(false);
  });
});

describe('resolveEvaluation', () => {
  it('valide un groupe trouvé', () => {
    const next = resolveEvaluation(
      flip(createMemoryGame(config({ cols: 4, rows: 2 }), FIRST), [2, 3]),
    );

    expect(next).toMatchObject({
      phase: 'playing',
      flippedIndices: [],
      moves: 1,
      mistakes: 0,
      matchedGroups: 1,
      lastSwappedPair: null,
    });
    expect(next.cards.map((card) => card.state)).toEqual([
      'hidden',
      'hidden',
      'matched',
      'matched',
      'hidden',
      'hidden',
      'hidden',
      'hidden',
    ]);
  });

  it('gagne la partie au dernier groupe trouvé', () => {
    const game = play(createMemoryGame(config(), FIRST), [0, 1]);

    expect(play(game, [2, 3])).toMatchObject({
      phase: 'won',
      moves: 2,
      mistakes: 0,
      matchedGroups: 2,
      totalGroups: 2,
    });
  });

  it('compte une erreur et recache les cartes, désormais vues', () => {
    const next = resolveEvaluation(
      flip(createMemoryGame(config({ cols: 4, rows: 2 }), FIRST), [0, 2]),
    );

    expect(next).toMatchObject({
      phase: 'playing',
      flippedIndices: [],
      moves: 1,
      mistakes: 1,
      matchedGroups: 0,
    });
    expect(cardAt(next, 0)).toMatchObject({ state: 'hidden', seen: true });
    expect(cardAt(next, 2)).toMatchObject({ state: 'hidden', seen: true });
    expect(cardAt(next, 1).seen).toBe(false);
  });

  it('compte une erreur de triplet même avec deux cartes identiques', () => {
    const next = play(
      createMemoryGame(config({ cols: 3, rows: 2, matchSize: 3 }), FIRST),
      [0, 1, 3],
    );

    expect(next).toMatchObject({ phase: 'playing', mistakes: 1, matchedGroups: 0 });
    expect(next.cards.every((card) => card.state === 'hidden')).toBe(true);
  });

  it('ignore l’appel hors de l’évaluation', () => {
    const game = createMemoryGame(config(), FIRST);
    const oneCard = selectCard(game, 0);

    expect(resolveEvaluation(game)).toBe(game);
    expect(resolveEvaluation(oneCard)).toBe(oneCard);
  });

  it('tolère maxMistakes erreurs et perd à la suivante', () => {
    const twoMistakes = play(
      play(createMemoryGame(config({ cols: 4, rows: 2, maxMistakes: 2 }), FIRST), [0, 2]),
      [0, 2],
    );
    const lost = play(twoMistakes, [0, 2]);

    expect(twoMistakes).toMatchObject({ phase: 'playing', mistakes: 2 });
    expect(lost).toMatchObject({ phase: 'lost', mistakes: 3, flippedIndices: [] });
    expect(lost.cards.every((card) => card.state === 'hidden')).toBe(true);
  });

  it('perd à la première erreur avec maxMistakes 0', () => {
    expect(play(createMemoryGame(config({ maxMistakes: 0 }), FIRST), [0, 2])).toMatchObject({
      phase: 'lost',
      mistakes: 1,
    });
  });

  it('ne perd jamais sans limite d’erreurs', () => {
    let game = createMemoryGame(config(), FIRST);
    for (let mistake = 0; mistake < 50; mistake += 1) game = play(game, [0, 2]);

    expect(game).toMatchObject({ phase: 'playing', mistakes: 50 });
  });

  it('permute deux cartes cachées de groupes différents toutes les N erreurs', () => {
    const level = config({ cols: 4, rows: 4, visualMode: 'monochrome', swapEveryNMistakes: 2 });
    const start = createMemoryGame(level, seeded(8));

    const first = play(start, wrongMove(start), seeded(9));
    expect(first.lastSwappedPair).toBeNull();
    expect(uidsOf(first)).toEqual(uidsOf(start));

    const second = play(first, wrongMove(first), seeded(9));
    const [a, b]: [number, number] = second.lastSwappedPair ?? [-1, -1];
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(b);
    expect(cardAt(second, a).uid).toBe(cardAt(first, b).uid);
    expect(cardAt(second, b).uid).toBe(cardAt(first, a).uid);
    expect(cardAt(second, a).groupId).not.toBe(cardAt(second, b).groupId);
    expect([cardAt(second, a).state, cardAt(second, b).state]).toEqual(['hidden', 'hidden']);
    const untouched = (state: MemoryGameState) =>
      uidsOf(state).filter((_, index) => index !== a && index !== b);
    expect(untouched(second)).toEqual(untouched(first));

    const third = play(second, wrongMove(second), seeded(9));
    expect(third.lastSwappedPair).toBeNull();
    expect(play(third, wrongMove(third), seeded(9)).lastSwappedPair).not.toBeNull();
  });

  it('vise les cartes déjà vues : sans aperçu, celles de l’erreur', () => {
    const level = config({ cols: 4, rows: 2, swapEveryNMistakes: 1 });

    for (const rng of [FIRST, seeded(1), seeded(2), () => 0.999]) {
      const next = play(createMemoryGame(level, FIRST), [0, 2], rng);

      expect(next.lastSwappedPair).toEqual([0, 2]);
      expect(uidsOf(next)).toEqual([
        'cat@0#1',
        'sun@0#2',
        'sun@0#1',
        'cat@0#2',
        'heart@0#1',
        'heart@0#2',
        'moon@0#1',
        'moon@0#2',
      ]);
      expect(cardAt(next, 0).seen && cardAt(next, 2).seen).toBe(true);
    }
  });

  it('complète par une carte jamais vue quand les cartes vues sont d’un seul groupe', () => {
    const game = createMemoryGame(config({ cols: 4, rows: 2, swapEveryNMistakes: 1 }), FIRST);
    // État construit : seule la jumelle de la première carte a déjà été vue.
    const evaluating = flip(game, [0, 2]);
    const crafted: MemoryGameState = {
      ...evaluating,
      cards: evaluating.cards.map((card, index): MemoryCard => ({ ...card, seen: index === 1 })),
    };

    const next = resolveEvaluation(crafted, seeded(4));
    const pair: [number, number] = next.lastSwappedPair ?? [-1, -1];

    expect(pair).toContain(1);
    expect(cardAt(next, pair[0]).groupId).not.toBe(cardAt(next, pair[1]).groupId);
    expect(cardAt(next, pair[0] === 1 ? pair[1] : pair[0]).uid).toBe('sun@0#2');
  });

  it('ne permute pas quand l’erreur fait perdre la partie', () => {
    const level = config({ cols: 4, rows: 2, maxMistakes: 3, swapEveryNMistakes: 2 });
    let game = createMemoryGame(level, FIRST);
    for (let mistake = 0; mistake < 3; mistake += 1) game = play(game, [0, 2]);
    const lost = play(game, [0, 2]);

    expect(game).toMatchObject({ phase: 'playing', mistakes: 3 });
    expect(lost).toMatchObject({ phase: 'lost', mistakes: 4, lastSwappedPair: null });
    expect(uidsOf(lost)).toEqual(uidsOf(game));
  });

  it('efface lastSwappedPair dès la résolution suivante, même réussie', () => {
    const swapped = play(
      createMemoryGame(config({ cols: 4, rows: 2, swapEveryNMistakes: 1 }), FIRST),
      [0, 2],
    );
    const next = play(swapped, rightMove(swapped));

    expect(swapped.lastSwappedPair).toEqual([0, 2]);
    expect(next).toMatchObject({ matchedGroups: 1, lastSwappedPair: null });
  });

  it('ne permute rien dans un état incohérent sans paire possible', () => {
    const game = createMemoryGame(config({ cols: 4, rows: 2, swapEveryNMistakes: 1 }), FIRST);
    const matched = game.cards.map((card): MemoryCard => ({ ...card, state: 'matched' }));
    // Aucune carte cachée : la seule carte « retournée » est hors du plateau.
    const noCandidate: MemoryGameState = {
      ...game,
      phase: 'evaluating',
      cards: matched,
      flippedIndices: [99],
    };
    // Une seule carte cachée après l'erreur.
    const oneCandidate: MemoryGameState = {
      ...noCandidate,
      cards: matched.map((card, index): MemoryCard =>
        index === 0 ? { ...card, state: 'flipped' } : card,
      ),
      flippedIndices: [0, 99],
    };

    expect(resolveEvaluation(noCandidate)).toMatchObject({
      phase: 'playing',
      mistakes: 1,
      lastSwappedPair: null,
    });
    expect(resolveEvaluation(oneCandidate)).toMatchObject({ mistakes: 1, lastSwappedPair: null });
  });

  it('ne modifie jamais l’état reçu', () => {
    const level = config({ cols: 4, rows: 2, maxMistakes: 5, swapEveryNMistakes: 1 });
    const mistake = deepFreeze(flip(createMemoryGame(level, FIRST), [0, 2]));
    const match = deepFreeze(flip(createMemoryGame(level, FIRST), [0, 1]));

    expect(() => resolveEvaluation(mistake)).not.toThrow();
    expect(() => resolveEvaluation(match)).not.toThrow();
    expect(mistake.cards.map((card) => card.uid)).toEqual(uidsOf(createMemoryGame(level, FIRST)));
  });
});

describe('isPerfectWin', () => {
  it('couronne une victoire avec au plus perfectMaxMistakes erreurs', () => {
    const level = config({ perfectMaxMistakes: 1 });
    const won = playPerfectly(play(createMemoryGame(level, FIRST), [0, 2]));

    expect(won).toMatchObject({ phase: 'won', mistakes: 1 });
    expect(isPerfectWin(won)).toBe(true);
    expect(isPerfectWin({ ...won, config: { ...level, perfectMaxMistakes: 0 } })).toBe(false);
    expect(isPerfectWin(createMemoryGame(level, FIRST))).toBe(false);
  });
});

describe('Parties complètes', () => {
  it.each(INITIAL_LEVELS)('gagne %s sans erreur, avec la couronne', (_, level) => {
    const won = playPerfectly(createMemoryGame(level, seeded(11)));

    expect(won).toMatchObject({
      phase: 'won',
      mistakes: 0,
      moves: won.totalGroups,
      matchedGroups: won.totalGroups,
    });
    expect(won.cards.every((card) => card.state === 'matched')).toBe(true);
    expect(isPerfectWin(won)).toBe(true);
  });

  it('termine mem-020 malgré les erreurs et les permutations, sans couronne', () => {
    const rng = seeded(12);
    let game = createMemoryGame(initialLevel('mem-020'), rng);
    const uids = uidsOf(game).sort();
    let swaps = 0;

    while (game.phase === 'playing') {
      if (game.totalGroups - game.matchedGroups >= 2) {
        game = play(game, wrongMove(game), rng);
        if (game.lastSwappedPair) swaps += 1;
      }
      game = play(game, rightMove(game), rng);
      // Le plateau garde toujours les mêmes cartes.
      expect(uidsOf(game).sort()).toEqual(uids);
    }

    // Une erreur avant chacun des 17 premiers groupes : permutations aux erreurs 5, 10 et 15.
    expect(game).toMatchObject({ phase: 'won', mistakes: 17, moves: 35, matchedGroups: 18 });
    expect(swaps).toBe(3);
    expect(isPerfectWin(game)).toBe(false);
  });

  it('perd mem-019 à la treizième erreur, après trois permutations', () => {
    let game = createMemoryGame(initialLevel('mem-019'), seeded(13));
    let swaps = 0;
    for (let mistake = 1; mistake <= 12; mistake += 1) {
      game = play(game, wrongMove(game), seeded(mistake));
      if (game.lastSwappedPair) swaps += 1;
    }
    const lost = play(game, wrongMove(game));

    expect(game).toMatchObject({ phase: 'playing', mistakes: 12 });
    expect(swaps).toBe(3);
    expect(lost).toMatchObject({ phase: 'lost', mistakes: 13, lastSwappedPair: null });
    expect(isPerfectWin(lost)).toBe(false);
  });
});
