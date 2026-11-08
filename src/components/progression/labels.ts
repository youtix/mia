import type {
  EnrichedLevelItem,
  GameProgressSummary,
  ProfileProgressSummary,
} from '@/core/progression';
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

const speedFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Vitesse tenue de Pas si vite ! (« 1,2 s ») : la fenêtre d'appui sur laquelle l'enfant a enchaîné ses réussites. */
export function formatSpeed(seconds: number): string {
  return `${speedFormat.format(seconds)} s`;
}

/** Couronnes gagnées, vocalisées (« 2 couronnes »). */
export function describeCrowns(count: number): string {
  return pluralize(count, 'couronne', 'couronnes');
}

/**
 * Meilleur score d'une étoile réussie, sous son numéro sur la Carte des Étoiles : les coups, ou, pour
 * Pas si vite !, la vitesse tenue (FEAT-28 §11.2, qui enregistre le nombre de pièges touchés dans
 * `bestMoves` et la vitesse dans `bestTimeSeconds` sans nouvelle donnée). `null` tant que l'étoile n'est
 * pas réussie.
 */
export function getBestScore(
  level: Pick<EnrichedLevelItem, 'definition' | 'isCompleted' | 'completion'>,
): { announcement: string; text: string } | null {
  const { completion } = level;
  if (!level.isCompleted || !completion) return null;
  if (level.definition.gameId === 'go-no-go') {
    return { announcement: ', vitesse tenue :', text: formatSpeed(completion.bestTimeSeconds) };
  }
  return { announcement: ', meilleur score :', text: formatMoves(completion.bestMoves) };
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

/** Textes du bandeau de mise à jour du Hub (FEAT-20). */
export const UPDATE_BANNER_TEXTS = {
  title: 'Nouvelle version disponible',
  note: 'Tes profils et tes étoiles sont conservés.',
  button: 'Mettre à jour',
} as const;

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
