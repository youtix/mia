import type { PatternFamily, PatternItemId } from './types';

/** Banque d'éléments par famille : de quoi tirer A, B et l'intrus de chaque défi. */
export const PATTERN_ITEMS: Readonly<Record<PatternFamily, readonly PatternItemId[]>> = {
  animals: ['cat', 'dog', 'fish', 'bird', 'rabbit', 'turtle', 'squirrel', 'snail'],
  shapes: ['circle', 'square', 'triangle', 'star', 'heart', 'diamond', 'hexagon', 'cross'],
};

/** Noms vocalisés par les lecteurs d'écran : le jeu n'affiche aucun texte (FEAT-21). */
const ITEM_LABELS: Readonly<Record<PatternItemId, string>> = {
  cat: 'Chat',
  dog: 'Chien',
  fish: 'Poisson',
  bird: 'Oiseau',
  rabbit: 'Lapin',
  turtle: 'Tortue',
  squirrel: 'Écureuil',
  snail: 'Escargot',
  circle: 'Rond',
  square: 'Carré',
  triangle: 'Triangle',
  star: 'Étoile',
  heart: 'Cœur',
  diamond: 'Losange',
  hexagon: 'Hexagone',
  cross: 'Croix',
};

export function getPatternItemLabel(id: PatternItemId): string {
  return ITEM_LABELS[id];
}

/** Couleurs de `distinct` (une par élément du défi) : claires, lisibles sur le fond sombre. */
export const DISTINCT_ITEM_COLORS: readonly string[] = [
  'text-rose-300',
  'text-sky-300',
  'text-amber-300',
  'text-emerald-300',
  'text-violet-300',
  'text-orange-300',
];

/** Couleur unique de `same` : seule la forme distingue les éléments. */
export const SAME_ITEM_COLOR = 'text-sky-200';
