import type { BearColor, BearSize, BearSortRule, BearTraits, ForbiddenBears } from './types';

/**
 * Libellés d'Attrape-Piège (FEAT-24), réservés aux lecteurs d'écran et à `validate:levels` : le jeu
 * n'affiche aucun texte. TypeScript pur, sans React. La couleur et la taille sont toujours nommées,
 * car ce sont elles que l'on trie.
 */

const BEAR_COLOR_LABELS: Readonly<Record<BearColor, string>> = { blue: 'bleu', yellow: 'jaune' };

const BEAR_SIZE_LABELS: Readonly<Record<BearSize, string>> = { small: 'petit', big: 'grand' };

const BOX_COLOR_LABELS: Readonly<Record<BearColor, string>> = { blue: 'bleue', yellow: 'jaune' };

const BOX_SIZE_LABELS: Readonly<Record<BearSize, string>> = { small: 'Petite', big: 'Grande' };

/** « Petit ours bleu ». */
export function getBearLabel({ color, size }: BearTraits): string {
  const label = BEAR_SIZE_LABELS[size];
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ours ${BEAR_COLOR_LABELS[color]}`;
}

/** « Petite boîte bleue », ou « Boîte ouverte » pour la boîte neutre de la règle « sauf ». */
export function getBoxLabel(traits: BearTraits | null): string {
  if (traits === null) return 'Boîte ouverte';
  return `${BOX_SIZE_LABELS[traits.size]} boîte ${BOX_COLOR_LABELS[traits.color]}`;
}

/** « un petit ours bleu », « un ours jaune », « un grand ours ». */
function getForbiddenLabel({ color, size }: ForbiddenBears): string {
  const prefix = size === undefined ? '' : `${BEAR_SIZE_LABELS[size]} `;
  const suffix = color === undefined ? '' : ` ${BEAR_COLOR_LABELS[color]}`;
  return `un ${prefix}ours${suffix}`;
}

/** Règle en vigueur, en clair (image de la règle, résumé de `validate:levels`). */
export function getRuleLabel(rule: BearSortRule): string {
  if (rule.kind === 'except') return `Tous les ours, sauf ${getForbiddenLabel(rule.forbidden)}`;
  return rule.feature === 'color' ? 'Ranger par couleur' : 'Ranger par taille';
}
