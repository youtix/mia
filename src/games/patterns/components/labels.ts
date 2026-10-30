import { getPatternItemLabel } from '../items';
import type { PatternChoice, PatternItem } from '../types';

/**
 * Textes de Suites Logiques : tous vocalisés par les lecteurs d'écran, aucun n'est affiché, l'enfant
 * ne sait peut-être pas lire (FEAT-21 §3.5). Les noms des éléments viennent de `getPatternItemLabel`.
 */

/** Messages de la région `role="status"` du plateau. */
export const ANNOUNCEMENTS = {
  stop: 'Stop ! Attends sans toucher.',
  stopOver: 'À toi !',
  stopTap: 'Pas encore, attends.',
  tryAgain: 'Essaie encore.',
  wellDone: 'Bravo !',
} as const;

/** Nom du groupe des trois propositions. */
export const CHOICES_LABEL = 'Réponses';

/** Noms des boutons en icônes de l'écran de fin. */
export const END_ACTION_LABELS = {
  next: 'Étoile suivante',
  replay: 'Rejouer',
  map: 'Carte des Étoiles',
} as const;

/** Titre du plateau (`h1` réservé aux lecteurs d'écran). */
export function formatBoardTitle(starNumber: number): string {
  return `Suites Logiques, Étoile #${String(starNumber)}`;
}

/** Titre de l'écran de fin (réservé aux lecteurs d'écran). */
export function formatEndTitle(starNumber: number): string {
  return `Étoile #${String(starNumber)} gagnée`;
}

/** Défi en cours (« Défi 2 sur 5 ») : points de progression et annonce du défi. */
export function formatRoundLabel(roundIndex: number, rounds: number): string {
  return `Défi ${String(roundIndex + 1)} sur ${String(rounds)}`;
}

/** Contenu de la cible : vide, puis la pièce placée ou le son trouvé. */
function getTargetLabel(answer: PatternChoice | null): string {
  if (!answer) return 'une case vide';
  return answer.kind === 'item' ? getPatternItemLabel(answer.item.id) : 'le bon son';
}

/** Ligne de lecture (« Suite : Chien, Chat, Chien, Chat, puis une case vide »). */
export function formatRowLabel(
  row: readonly PatternItem[],
  answer: PatternChoice | null = null,
): string {
  const items = row.map((item) => getPatternItemLabel(item.id)).join(', ');
  return `Suite : ${items}, puis ${getTargetLabel(answer)}`;
}

/** Annonce d'un nouveau défi : son numéro, puis la suite, sans avoir à la chercher sur l'écran. */
export function formatRoundAnnouncement(
  roundIndex: number,
  rounds: number,
  row: readonly PatternItem[],
): string {
  return `${formatRoundLabel(roundIndex, rounds)}. ${formatRowLabel(row)}.`;
}

/** Fin de l'écoute d'une proposition : le changement de son nom n'est pas toujours vocalisé. */
export function formatArmedAnnouncement(index: number): string {
  return `Son ${String(index + 1)} prêt, appuie encore pour valider.`;
}

/**
 * Nom d'une proposition : l'élément, ou le numéro du son et le geste attendu (« Son 2, appuie pour
 * écouter »). Jamais le contenu du son : ce serait donner la réponse.
 */
export function getChoiceLabel(choice: PatternChoice, index: number, isArmed: boolean): string {
  if (choice.kind === 'item') return getPatternItemLabel(choice.item.id);
  const action = isArmed ? 'appuie encore pour valider' : 'appuie pour écouter';
  return `Son ${String(index + 1)}, ${action}`;
}

/** Aide de niveau 2 : dite aussi, car la lueur de la bonne proposition ne s'entend pas. */
export function formatHintedLabel(label: string): string {
  return `${label}, c’est la bonne réponse`;
}

/** Phrase réservée aux lecteurs d'écran : la couronne de l'écran de fin n'est qu'une icône. */
export function getCrownSentence(isPerfect: boolean, hadCrown: boolean): string {
  if (isPerfect) {
    return hadCrown ? 'Parfait ! Tu avais déjà la couronne.' : 'Parfait ! Couronne gagnée.';
  }
  return hadCrown
    ? 'Tu as déjà la couronne.'
    : 'Pas de couronne cette fois : rejoue sans erreur, et sans toucher pendant les stops, pour la gagner.';
}
