/**
 * Générateur pseudo-aléatoire injectable : renvoie un nombre de [0, 1[ (`Math.random` par défaut).
 * Un générateur à graine rend une partie reproductible (tests, validation des catalogues).
 */
export type Rng = () => number;

/** Entier de [0, max[ : un générateur hors de [0, 1[ (1, négatif, NaN) reste dans les bornes. */
export function randomInt(max: number, rng: Rng): number {
  const value = Math.floor(rng() * max);
  if (value >= max) return max - 1;
  return value >= 0 ? value : 0;
}

/**
 * Mélange de Fisher-Yates dans sa forme d'origine (chaque élément est tiré parmi les éléments
 * restants), dans un nouveau tableau. Une liste non vide reste typée non vide.
 */
export function shuffle<T>(items: readonly [T, ...T[]], rng: Rng): [T, ...T[]];
export function shuffle<T>(items: readonly T[], rng: Rng): T[];
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const remaining = [...items];
  const shuffled: T[] = [];
  while (remaining.length > 0) {
    shuffled.push(...remaining.splice(randomInt(remaining.length, rng), 1));
  }
  return shuffled;
}

/** Élément tiré au hasard dans une liste non vide. */
export function pickOne<T>(items: readonly [T, ...T[]], rng: Rng): T {
  const [picked] = shuffle(items, rng);
  return picked;
}
