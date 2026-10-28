import type { GameProgressSummary, ProfileProgressSummary } from '@/core/progression';
import type { NextGoal } from './next-goal';

const frenchPlural = new Intl.PluralRules('fr-FR');

/** « 1 coup », « 12 coups » : 0 et 1 au singulier, comme `describeStars`. */
function pluralize(count: number, singular: string, plural: string): string {
  return `${String(count)} ${frenchPlural.select(count) === 'one' ? singular : plural}`;
}

/** Meilleur nombre de coups d'une étoile réussie (« 12 coups »). */
export function formatMoves(moves: number): string {
  return pluralize(moves, 'coup', 'coups');
}

/** Couronnes gagnées, vocalisées (« 2 couronnes »). */
export function describeCrowns(count: number): string {
  return pluralize(count, 'couronne', 'couronnes');
}

/** Libellé du bouton du Hub qui lance l'objectif d'un jeu, `null` sans niveau à lancer. */
export function getHubGoalLabel(goal: NextGoal): string | null {
  switch (goal.kind) {
    case 'play':
      return `${goal.isFirstStar ? 'Commencer' : 'Continuer'} (Étoile #${String(goal.level.starNumber)})`;
    case 'crown':
      return `Viser la couronne (Étoile #${String(goal.level.starNumber)})`;
    case 'empty':
    case 'complete':
      return null;
  }
}

/**
 * Compteur d'étoiles d'`AppShell` : le total est omis tant qu'aucun niveau n'est publié (« 0 »
 * plutôt que « 0 / 0 ») ; halo doré quand chaque étoile a sa couronne.
 */
export function getStarCounter(
  summary: Pick<
    GameProgressSummary | ProfileProgressSummary,
    'earnedStars' | 'totalStars' | 'perfectCount'
  >,
): { earned: number; total?: number; isPerfect: boolean } {
  const { earnedStars, totalStars, perfectCount } = summary;
  return {
    earned: earnedStars,
    total: totalStars > 0 ? totalStars : undefined,
    isPerfect: totalStars > 0 && perfectCount === totalStars,
  };
}
