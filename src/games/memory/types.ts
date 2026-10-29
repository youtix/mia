/**
 * Types du jeu Memory (FEAT-09). Le moteur est en TypeScript pur, sans React ni DOM : il reste
 * importable par un composant serveur et par le script `validate:levels`.
 */

/** Mode de distinction visuelle des groupes, du plus lisible au plus exigeant. */
export type MemoryVisualMode =
  | 'distinct_color_shape' // Une icône ET une couleur uniques par groupe (Très Facile / Facile)
  | 'thematic_palette' // Icônes d'un même thème, palette de 3 couleurs (Facile / Moyen)
  | 'monochrome' // Toutes les cartes ont exactement la même couleur (Moyen / Difficile)
  | 'abstract_orientation'; // Formes géométriques orientées, d'une même couleur (Difficile / Très Difficile)

export interface MemoryLevelConfig {
  cols: number;
  rows: number;
  /** 2 = paires classiques, 3 = triplets de cartes identiques */
  matchSize: 2 | 3;
  visualMode: MemoryVisualMode;
  /** Temps d'aperçu initial où toutes les cartes sont visibles (0 = pas d'aperçu) */
  previewSeconds: number;
  /** Erreurs tolérées : la suivante fait perdre (null = illimité, 0 = la première erreur fait perdre) */
  maxMistakes: number | null;
  /** Si défini, permute 2 cartes face cachée toutes les N erreurs */
  swapEveryNMistakes: number | null;
  /** Nombre max d'erreurs pour obtenir la mention "Parfait" (Couronne) */
  perfectMaxMistakes: number;
}

/** Thèmes de la banque d'icônes (mode `thematic_palette`). */
export type MemoryThemeId = 'nature' | 'animals' | 'objects';

/** Icônes figuratives (modes `distinct_color_shape`, `thematic_palette` et `monochrome`). */
export type MemoryIconId =
  // Nature & ciel
  | 'sun'
  | 'moon'
  | 'star'
  | 'cloud'
  | 'bolt'
  | 'flame'
  | 'snowflake'
  | 'droplet'
  | 'tree'
  | 'flower'
  | 'leaf'
  | 'apple'
  // Animaux
  | 'cat'
  | 'dog'
  | 'fish'
  | 'bird'
  | 'rabbit'
  | 'turtle'
  | 'squirrel'
  | 'snail'
  | 'bug'
  | 'rat'
  | 'shell'
  | 'feather'
  // Objets & trésors
  | 'heart'
  | 'car'
  | 'rocket'
  | 'music'
  | 'crown'
  | 'diamond'
  | 'anchor'
  | 'bell'
  | 'compass'
  | 'key'
  | 'gift'
  | 'trophy';

/**
 * Formes géométriques sans symétrie de rotation (mode `abstract_orientation`) : leurs 4
 * orientations sont 4 groupes distincts. Dessinées pointe vers le haut à 0°.
 */
export type MemoryShapeId =
  | 'arrow'
  | 'chevron'
  | 'triangle'
  | 'right-triangle'
  | 'half-disc'
  | 'quarter-disc'
  | 'l-shape'
  | 't-shape';

export type MemorySymbolId = MemoryIconId | MemoryShapeId;

/** Orientation du symbole en degrés, sens horaire (toujours 0 pour une icône figurative). */
export type MemoryRotation = 0 | 90 | 180 | 270;

/** Symbole de la banque : données seules, l'icône est associée par `MemorySymbolIcon` (FEAT-10). */
export interface VisualSymbol<TId extends MemorySymbolId = MemorySymbolId> {
  id: TId;
  /** Nom vocalisé par les lecteurs d'écran (ex: « Soleil ») */
  label: string;
}

/** Icône figurative et son thème. */
export interface MemoryIconSymbol extends VisualSymbol<MemoryIconId> {
  theme: MemoryThemeId;
}

export interface MemoryTheme {
  id: MemoryThemeId;
  /** Nom affichable du thème (ex: « Animaux ») */
  label: string;
  /** 3 couleurs bien distinctes, réparties à parts égales entre les groupes */
  colorClasses: readonly [string, string, string];
}

export type MemoryCardState = 'hidden' | 'flipped' | 'matched';

export interface MemoryCard {
  /** Identifiant stable (`groupId#n`) : suit la carte lors d'une permutation (clé React, animation) */
  uid: string;
  /** Identité visuelle du groupe (`symbolId@rotationDeg`) : deux groupes ne diffèrent jamais par la seule couleur */
  groupId: string;
  symbolId: MemorySymbolId;
  /** Couleur du symbole (classe Tailwind `text-*`) sur la face sombre de la carte */
  colorClass: string;
  rotationDeg: MemoryRotation;
  state: MemoryCardState;
  /** Déjà montrée au joueur (aperçu ou retournement) : les permutations visent ces cartes en priorité */
  seen: boolean;
}

/** Apparence commune aux cartes d'un groupe (`buildCardGroups`). */
export type MemoryCardGroup = Pick<
  MemoryCard,
  'groupId' | 'symbolId' | 'colorClass' | 'rotationDeg'
>;

export type MemoryPhase = 'preview' | 'playing' | 'evaluating' | 'won' | 'lost';

export interface MemoryGameState {
  config: MemoryLevelConfig;
  phase: MemoryPhase;
  /** Cartes dans l'ordre du plateau, ligne par ligne (`index = row * cols + col`) */
  cards: MemoryCard[];
  /** Cartes retournées pendant le coup en cours, dans l'ordre des retournements */
  flippedIndices: number[];
  /** Coups joués : un coup = `matchSize` cartes retournées */
  moves: number;
  mistakes: number;
  matchedGroups: number;
  totalGroups: number;
  /** Positions échangées par la dernière résolution (`resolveEvaluation`), `null` sinon */
  lastSwappedPair: [number, number] | null;
}
