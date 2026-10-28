import type { EnrichedLevelItem, GameProgressSummary } from '@/core/progression';

/**
 * Prochain objectif d'un jeu, proposé par le Hub (« Continuer ») et par la Carte des Étoiles
 * (« Jouer l'Étoile #X ») :
 * - `empty` : catalogue vide (« Bientôt disponible ») ;
 * - `play` : prochain niveau à jouer (`nextPlayableLevel`), `isFirstStar` si aucune étoile gagnée ;
 * - `crown` : toutes les étoiles gagnées, premier niveau sans couronne ;
 * - `complete` : toutes les étoiles et toutes les couronnes.
 */
export type NextGoal<TConfig = unknown> =
  | { kind: 'empty' }
  | { kind: 'play'; level: EnrichedLevelItem<TConfig>; isFirstStar: boolean }
  | { kind: 'crown'; level: EnrichedLevelItem<TConfig> }
  | { kind: 'complete' };

export function getNextGoal<TConfig>(summary: GameProgressSummary<TConfig>): NextGoal<TConfig> {
  if (summary.totalStars === 0) return { kind: 'empty' };
  const next = summary.nextPlayableLevel;
  if (next) return { kind: 'play', level: next, isFirstStar: summary.earnedStars === 0 };
  // Tout est réussi, donc débloqué : le premier niveau sans couronne est jouable.
  const uncrowned = summary.allLevels.find((level) => !level.isPerfect);
  return uncrowned ? { kind: 'crown', level: uncrowned } : { kind: 'complete' };
}

/** Niveau de l'objectif à lancer, `null` s'il n'y en a pas (`empty`, `complete`). */
export function getGoalLevel<TConfig>(goal: NextGoal<TConfig>): EnrichedLevelItem<TConfig> | null {
  return goal.kind === 'play' || goal.kind === 'crown' ? goal.level : null;
}

/** Tuile du curseur à l'ouverture de la carte : l'objectif, sinon la première étoile. */
export function getInitialLevel<TConfig>(
  summary: GameProgressSummary<TConfig>,
): EnrichedLevelItem<TConfig> | null {
  return getGoalLevel(getNextGoal(summary)) ?? summary.allLevels[0] ?? null;
}
