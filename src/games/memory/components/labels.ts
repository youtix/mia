import type { MemoryLevelConfig } from '../types';

type MatchSize = MemoryLevelConfig['matchSize'];

const frenchPlural = new Intl.PluralRules('fr-FR');

/** « 1 erreur », « 3 erreurs » : 0 et 1 au singulier, comme `formatMoves` (FEAT-08). */
function pluralize(count: number, singular: string, plural: string): string {
  return `${String(count)} ${frenchPlural.select(count) === 'one' ? singular : plural}`;
}

/** Erreurs d'une partie (« 0 erreur », « 6 erreurs »). */
export function formatMistakes(count: number): string {
  return pluralize(count, 'erreur', 'erreurs');
}

/** Groupes trouvés, selon la règle du niveau (« 1 paire », « 5 paires », « 2 triplets »). */
export function formatGroups(count: number, matchSize: MatchSize): string {
  return matchSize === 3
    ? pluralize(count, 'triplet', 'triplets')
    : pluralize(count, 'paire', 'paires');
}

/** Nom du compteur de groupes (« Paires », « Triplets ») : plus parlant que « Groupes ». */
export function getGroupsTitle(matchSize: MatchSize): string {
  return matchSize === 3 ? 'Triplets' : 'Paires';
}

/** Règle du niveau (« Trouve les paires (2) », « Trouve les triplets (3) »). */
export function getMatchRuleLabel(matchSize: MatchSize): string {
  return matchSize === 3 ? 'Trouve les triplets (3)' : 'Trouve les paires (2)';
}

/** Règle de permutation (« Permutation à chaque erreur », « Permutation toutes les 4 erreurs »). */
export function getSwapRuleLabel(everyNMistakes: number): string {
  return everyNMistakes === 1
    ? 'Permutation à chaque erreur'
    : `Permutation toutes les ${String(everyNMistakes)} erreurs`;
}

/** Objectif de la couronne (« Sans erreur », « 1 erreur max », « 4 erreurs max »). */
export function getCrownTargetLabel(perfectMaxMistakes: number): string {
  return perfectMaxMistakes === 0 ? 'Sans erreur' : `${formatMistakes(perfectMaxMistakes)} max`;
}

/**
 * Titre de la défaite. La limite est inclusive (FEAT-09 §5) : la défaite survient à la
 * `maxMistakes + 1`-ième erreur, jamais annoncée « 11 / 10 » (« Trop d’erreurs : plus de 10 »).
 */
export function getDefeatTitle(maxMistakes: number | null): string {
  if (maxMistakes === null) return 'Trop d’erreurs';
  if (maxMistakes === 0) return 'Trop d’erreurs : aucune n’était permise';
  if (maxMistakes === 1) return 'Trop d’erreurs : plus d’une';
  return `Trop d’erreurs : plus de ${String(maxMistakes)}`;
}
