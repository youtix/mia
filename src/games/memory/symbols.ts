import { pickOne, shuffle, type Rng } from './random';
import type {
  MemoryCardGroup,
  MemoryIconId,
  MemoryIconSymbol,
  MemoryLevelConfig,
  MemoryRotation,
  MemoryShapeId,
  MemorySymbolId,
  MemoryTheme,
  MemoryThemeId,
  MemoryVisualMode,
  VisualSymbol,
} from './types';

/**
 * Banque de symboles de Memory (FEAT-09) : données seules. Les icônes sont associées par
 * `MemorySymbolIcon` (FEAT-10), table exhaustive sur `MemorySymbolId` comme `AVATAR_ICONS`. Les
 * couleurs sont des classes Tailwind littérales (`text-*`, détectées dans `src/` par la feuille de
 * style), toutes contrastées à plus de 4,5:1 sur la face sombre de la carte (`bg-slate-900`).
 */

/** Couleurs très distinctes (`distinct_color_shape`) : une par groupe, d'où la capacité du mode. */
export const DISTINCT_COLOR_CLASSES: readonly [string, ...string[]] = [
  'text-red-400',
  'text-orange-400',
  'text-yellow-300',
  'text-lime-400',
  'text-emerald-400',
  'text-cyan-300',
  'text-blue-400',
  'text-violet-400',
  'text-pink-400',
  'text-slate-50',
];

/** Thèmes de `thematic_palette`, chacun avec sa palette de 3 couleurs bien distinctes. */
export const MEMORY_THEMES: readonly [MemoryTheme, ...MemoryTheme[]] = [
  {
    id: 'nature',
    label: 'Nature & ciel',
    colorClasses: ['text-yellow-300', 'text-emerald-400', 'text-blue-400'],
  },
  {
    id: 'animals',
    label: 'Animaux',
    colorClasses: ['text-orange-400', 'text-pink-400', 'text-cyan-300'],
  },
  {
    id: 'objects',
    label: 'Objets & trésors',
    colorClasses: ['text-red-400', 'text-violet-400', 'text-lime-400'],
  },
];

/** Table exhaustive : chaque `MemoryIconId` est décrit (12 icônes par thème, noms uniques). */
const ICON_CATALOG: Readonly<Record<MemoryIconId, Omit<MemoryIconSymbol, 'id'>>> = {
  sun: { label: 'Soleil', theme: 'nature' },
  moon: { label: 'Lune', theme: 'nature' },
  star: { label: 'Étoile', theme: 'nature' },
  cloud: { label: 'Nuage', theme: 'nature' },
  bolt: { label: 'Éclair', theme: 'nature' },
  flame: { label: 'Flamme', theme: 'nature' },
  snowflake: { label: 'Flocon de neige', theme: 'nature' },
  droplet: { label: 'Goutte d’eau', theme: 'nature' },
  tree: { label: 'Arbre', theme: 'nature' },
  flower: { label: 'Fleur', theme: 'nature' },
  leaf: { label: 'Feuille', theme: 'nature' },
  apple: { label: 'Pomme', theme: 'nature' },
  cat: { label: 'Chat', theme: 'animals' },
  dog: { label: 'Chien', theme: 'animals' },
  fish: { label: 'Poisson', theme: 'animals' },
  bird: { label: 'Oiseau', theme: 'animals' },
  rabbit: { label: 'Lapin', theme: 'animals' },
  turtle: { label: 'Tortue', theme: 'animals' },
  squirrel: { label: 'Écureuil', theme: 'animals' },
  snail: { label: 'Escargot', theme: 'animals' },
  bug: { label: 'Insecte', theme: 'animals' },
  rat: { label: 'Rat', theme: 'animals' },
  shell: { label: 'Coquillage', theme: 'animals' },
  feather: { label: 'Plume', theme: 'animals' },
  heart: { label: 'Cœur', theme: 'objects' },
  car: { label: 'Voiture', theme: 'objects' },
  rocket: { label: 'Fusée', theme: 'objects' },
  music: { label: 'Note de musique', theme: 'objects' },
  crown: { label: 'Couronne', theme: 'objects' },
  diamond: { label: 'Diamant', theme: 'objects' },
  anchor: { label: 'Ancre', theme: 'objects' },
  bell: { label: 'Cloche', theme: 'objects' },
  compass: { label: 'Boussole', theme: 'objects' },
  key: { label: 'Clé', theme: 'objects' },
  gift: { label: 'Cadeau', theme: 'objects' },
  trophy: { label: 'Trophée', theme: 'objects' },
};

/** Les 36 icônes figuratives, thème par thème. */
export const MEMORY_ICONS: readonly MemoryIconSymbol[] = Object.entries(ICON_CATALOG).map(
  ([id, icon]) => ({ id: id as MemoryIconId, ...icon }),
);

/** Table exhaustive : nom vocalisé de chaque forme, dessinée pointe vers le haut à 0°. */
const SHAPE_LABELS: Readonly<Record<MemoryShapeId, string>> = {
  arrow: 'Flèche',
  chevron: 'Chevron',
  triangle: 'Triangle',
  'right-triangle': 'Triangle rectangle',
  'half-disc': 'Demi-disque',
  'quarter-disc': 'Quart de disque',
  'l-shape': 'Forme en L',
  't-shape': 'Forme en T',
};

/** Les 8 formes de `abstract_orientation` : 4 groupes chacune (une par orientation). */
export const MEMORY_SHAPES: readonly VisualSymbol<MemoryShapeId>[] = Object.entries(
  SHAPE_LABELS,
).map(([id, label]) => ({ id: id as MemoryShapeId, label }));

/** Les 4 orientations d'une forme, en degrés (sens horaire). */
export const MEMORY_ROTATIONS: readonly [MemoryRotation, ...MemoryRotation[]] = [0, 90, 180, 270];

const ORIENTATION_LABELS: Readonly<Record<MemoryRotation, string>> = {
  0: 'vers le haut',
  90: 'vers la droite',
  180: 'vers le bas',
  270: 'vers la gauche',
};

function isShapeId(symbolId: MemorySymbolId): symbolId is MemoryShapeId {
  return Object.hasOwn(SHAPE_LABELS, symbolId);
}

/**
 * Nom vocalisé d'un symbole (`aria-label` de FEAT-10) : « Soleil », « Flèche, vers la droite ».
 * Deux groupes d'une partie ne s'annoncent jamais de la même façon.
 */
export function getMemorySymbolLabel(
  symbolId: MemorySymbolId,
  rotationDeg: MemoryRotation = 0,
): string {
  if (isShapeId(symbolId)) return `${SHAPE_LABELS[symbolId]}, ${ORIENTATION_LABELS[rotationDeg]}`;
  return ICON_CATALOG[symbolId].label;
}

function toGroup(
  symbolId: MemorySymbolId,
  colorClass: string,
  rotationDeg: MemoryRotation = 0,
): MemoryCardGroup {
  return { groupId: `${symbolId}@${String(rotationDeg)}`, symbolId, colorClass, rotationDeg };
}

function iconsOfTheme(themeId: MemoryThemeId): MemoryIconSymbol[] {
  return MEMORY_ICONS.filter((icon) => icon.theme === themeId);
}

/** Fusion à tour de rôle : le 1er élément de chaque liste, puis le 2e de chaque liste, etc. */
function interleave<T>(lists: readonly (readonly T[])[]): T[] {
  const longest = Math.max(0, ...lists.map((list) => list.length));
  return Array.from({ length: longest }, (_, rank) =>
    lists.flatMap((list) => list.slice(rank, rank + 1)),
  ).flat();
}

/** Paires formées dans l'ordre, jusqu'à épuisement de la plus courte des deux listes. */
function zip<A, B>(first: readonly A[], second: readonly B[]): [A, B][] {
  const pairs: [A, B][] = [];
  const others = second[Symbol.iterator]();
  for (const item of first) {
    const other = others.next();
    if (other.done) break;
    pairs.push([item, other.value]);
  }
  return pairs;
}

/** `count` éléments pris à tour de rôle dans `items` : une palette répartie à parts égales. */
function cycle<T>(items: readonly [T, ...T[]], count: number): T[] {
  return Array.from({ length: Math.ceil(count / items.length) }, () => items)
    .flat()
    .slice(0, count);
}

/** Une icône de chaque thème à tour de rôle (formes de familles différentes), chacune de sa couleur. */
function buildDistinctGroups(totalGroups: number, rng: Rng): MemoryCardGroup[] {
  const pools = shuffle(MEMORY_THEMES, rng).map((theme) => shuffle(iconsOfTheme(theme.id), rng));
  const colors = shuffle(DISTINCT_COLOR_CLASSES, rng).slice(0, totalGroups);
  return zip(interleave(pools), colors).map(([icon, colorClass]) => toGroup(icon.id, colorClass));
}

/**
 * Icônes du thème tiré, puis des autres thèmes si le niveau demande plus de groupes qu'il n'en
 * contient, sur les 3 couleurs du thème tiré réparties à parts égales.
 */
function buildThematicGroups(totalGroups: number, rng: Rng): MemoryCardGroup[] {
  const themes = shuffle(MEMORY_THEMES, rng);
  const icons = themes.flatMap((theme) => shuffle(iconsOfTheme(theme.id), rng));
  const colors = cycle(shuffle(themes[0].colorClasses, rng), totalGroups);
  return zip(icons, colors).map(([icon, colorClass]) => toGroup(icon.id, colorClass));
}

/** Icônes uniques, toutes de la même couleur : seule la forme distingue les groupes. */
function buildMonochromeGroups(totalGroups: number, rng: Rng): MemoryCardGroup[] {
  const colorClass = pickOne(DISTINCT_COLOR_CLASSES, rng);
  return shuffle(MEMORY_ICONS, rng)
    .slice(0, totalGroups)
    .map((icon) => toGroup(icon.id, colorClass));
}

/**
 * Toutes les orientations de chaque forme tirée, d'une même couleur : chaque forme a ses jumelles
 * tournées sur le plateau (18 groupes = 4 formes complètes + 2 orientations d'une cinquième).
 */
function buildAbstractGroups(totalGroups: number, rng: Rng): MemoryCardGroup[] {
  const colorClass = pickOne(DISTINCT_COLOR_CLASSES, rng);
  return shuffle(MEMORY_SHAPES, rng)
    .flatMap((shape) =>
      shuffle(MEMORY_ROTATIONS, rng).map((rotationDeg) =>
        toGroup(shape.id, colorClass, rotationDeg),
      ),
    )
    .slice(0, totalGroups);
}

interface VisualModeRules {
  /** Nombre maximal de groupes d'une partie */
  capacity: number;
  build: (totalGroups: number, rng: Rng) => MemoryCardGroup[];
}

const VISUAL_MODE_RULES: Readonly<Record<MemoryVisualMode, VisualModeRules>> = {
  distinct_color_shape: {
    capacity: Math.min(DISTINCT_COLOR_CLASSES.length, MEMORY_ICONS.length),
    build: buildDistinctGroups,
  },
  thematic_palette: { capacity: MEMORY_ICONS.length, build: buildThematicGroups },
  monochrome: { capacity: MEMORY_ICONS.length, build: buildMonochromeGroups },
  abstract_orientation: {
    capacity: MEMORY_SHAPES.length * MEMORY_ROTATIONS.length,
    build: buildAbstractGroups,
  },
};

/** Mode visuel connu (une configuration peut provenir d'un catalogue déclaratif JSON). */
export function isMemoryVisualMode(value: string): value is MemoryVisualMode {
  return Object.hasOwn(VISUAL_MODE_RULES, value);
}

/**
 * Nombre maximal de groupes d'une partie dans ce mode : 10 en `distinct_color_shape` (une couleur
 * unique par groupe), 36 en `thematic_palette` et `monochrome` (toutes les icônes), 32 en
 * `abstract_orientation` (8 formes × 4 orientations).
 */
export function getMemoryModeCapacity(visualMode: MemoryVisualMode): number {
  return VISUAL_MODE_RULES[visualMode].capacity;
}

/**
 * Apparence des `totalGroups` groupes d'une partie selon `config.visualMode`, tirée par `rng`
 * (symboles, thème, couleurs, formes) : chaque partie est différente, et reproductible avec un
 * générateur à graine. Deux groupes ne diffèrent jamais par la seule couleur. Lève une
 * `RangeError` pour un mode inconnu ou un nombre de groupes hors de `[0, capacité]`.
 */
export function buildCardGroups(
  config: Pick<MemoryLevelConfig, 'visualMode'>,
  totalGroups: number,
  rng: Rng = Math.random,
): MemoryCardGroup[] {
  const mode: string = config.visualMode;
  if (!isMemoryVisualMode(mode)) throw new RangeError(`Mode visuel « ${mode} » inconnu`);
  const { capacity, build } = VISUAL_MODE_RULES[mode];
  if (!Number.isInteger(totalGroups) || totalGroups < 0 || totalGroups > capacity) {
    throw new RangeError(
      `${String(totalGroups)} groupes demandés : le mode « ${mode} » en accepte de 0 à ${String(capacity)}`,
    );
  }
  return build(totalGroups, rng);
}
