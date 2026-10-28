import {
  DIFFICULTY_TIERS,
  type DifficultyTier,
  type GameId,
  type GameProgress,
  type LevelCompletion,
  type MiaSaveState,
  type UserProfile,
} from '@/types/mia';
import type {
  BaseLevelDefinition,
  EnrichedLevelItem,
  GameProgressSummary,
  LevelVictoryParams,
  RecordVictoryOptions,
  TierProgressSummary,
} from './types';

/**
 * Moteur de progression par étoiles (FEAT-07) : fonctions pures. Les étoiles sont recalculées à
 * chaque appel à partir du catalogue et de la sauvegarde, indexée par identifiant de niveau
 * immuable : ajouter des niveaux n'importe où dans un catalogue ne décale aucune progression.
 */

type CompletedMap = Readonly<Record<string, LevelCompletion>>;

const NO_COMPLETIONS: CompletedMap = {};

/** Les 5 paliers, du plus facile au plus difficile (`DIFFICULTY_TIERS[tier].order`). */
export const DIFFICULTY_TIER_IDS: readonly DifficultyTier[] = Object.values(DIFFICULTY_TIERS)
  .sort((a, b) => a.order - b.order)
  .map((meta) => meta.id);

/** Lecture d'une clé propre : un identifiant comme « constructor » ne lit rien d'hérité. */
function getOwn<V>(record: Readonly<Record<string, V>>, key: string): V | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function isLevelCompleted(completedMap: CompletedMap, levelId: string): boolean {
  return getOwn(completedMap, levelId)?.completed === true;
}

/** Comparaison par unités de code : contrairement à `localeCompare`, identique sur tout appareil. */
function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Catalogue trié par palier, puis par `order`, puis par `id` (nouveau tableau). */
export function sortLevels<T>(levels: readonly BaseLevelDefinition<T>[]): BaseLevelDefinition<T>[] {
  return [...levels].sort(
    (a, b) =>
      DIFFICULTY_TIERS[a.tier].order - DIFFICULTY_TIERS[b.tier].order ||
      a.order - b.order ||
      compareIds(a.id, b.id),
  );
}

/**
 * Règle de déblocage résiliente aux mises à jour. L'Étoile #1 est toujours débloquée ; un autre
 * niveau l'est s'il est déjà réussi, si le niveau qui le précède l'est, ou si le joueur a gagné au
 * moins `globalIndex` étoiles dans ce jeu : des niveaux insérés avant sa position ne bloquent
 * jamais un joueur avancé. Index hors du catalogue : `false`.
 */
export function isLevelUnlockedAtIndex<T>(
  sortedLevels: readonly BaseLevelDefinition<T>[],
  globalIndex: number,
  completedMap: CompletedMap,
  earnedStars: number,
): boolean {
  const level = sortedLevels[globalIndex];
  if (!level) return false;
  if (globalIndex === 0) return true;
  const previous = sortedLevels[globalIndex - 1];
  return (
    isLevelCompleted(completedMap, level.id) ||
    (previous !== undefined && isLevelCompleted(completedMap, previous.id)) ||
    earnedStars >= globalIndex
  );
}

/** `profile.gamesProgress[gameId]?.levels ?? {}`, sans rien lire d'hérité. */
function getCompletedMap(profile: UserProfile | null, gameId: GameId): CompletedMap {
  if (!profile) return NO_COMPLETIONS;
  return getOwn(profile.gamesProgress, gameId)?.levels ?? NO_COMPLETIONS;
}

/**
 * Le niveau qui suit le niveau réussi le plus avancé : le joueur reprend là où il en était, même
 * si une mise à jour a inséré des niveaux plus tôt (ils apparaissent « à conquérir » sur la carte).
 * Si ce niveau réussi est le dernier, le premier niveau non réussi. L'un comme l'autre est toujours
 * débloqué (son prédécesseur est réussi). `null` quand tout est réussi.
 */
function findNextPlayableLevel<T>(
  allLevels: readonly EnrichedLevelItem<T>[],
): EnrichedLevelItem<T> | null {
  let furthestCompleted = -1;
  for (const level of allLevels) {
    if (level.isCompleted) furthestCompleted = level.globalIndex;
  }
  return allLevels[furthestCompleted + 1] ?? allLevels.find((level) => !level.isCompleted) ?? null;
}

function summarizeTier<T>(
  tier: DifficultyTier,
  allLevels: readonly EnrichedLevelItem<T>[],
): TierProgressSummary<T> {
  const levels = allLevels.filter((level) => level.definition.tier === tier);
  return {
    tier,
    earnedStars: levels.filter((level) => level.isCompleted).length,
    totalStars: levels.length,
    perfectCount: levels.filter((level) => level.isPerfect).length,
    levels,
  };
}

/**
 * Progression d'un profil dans un jeu : niveaux triés et enrichis, sous-totaux des 5 paliers,
 * totaux et prochain niveau à jouer. Sans profil, rien n'est réussi. Seuls les niveaux du catalogue
 * comptent : la réussite d'un niveau inconnu (sauvegarde d'une version plus récente) reste dans la
 * sauvegarde sans rapporter d'étoile ni débloquer de niveau.
 */
export function getGameProgressSummary<T>(
  gameId: GameId,
  catalog: readonly BaseLevelDefinition<T>[],
  profile: UserProfile | null,
): GameProgressSummary<T> {
  const sortedLevels = sortLevels(catalog);
  const completedMap = getCompletedMap(profile, gameId);
  const earnedStars = sortedLevels.filter((level) =>
    isLevelCompleted(completedMap, level.id),
  ).length;

  const allLevels = sortedLevels.map((definition, globalIndex): EnrichedLevelItem<T> => {
    const completion = getOwn(completedMap, definition.id) ?? null;
    const isCompleted = completion?.completed === true;
    return {
      definition,
      starNumber: globalIndex + 1,
      globalIndex,
      isUnlocked: isLevelUnlockedAtIndex(sortedLevels, globalIndex, completedMap, earnedStars),
      isCompleted,
      isPerfect: isCompleted && completion.isPerfect,
      completion,
    };
  });

  return {
    gameId,
    earnedStars,
    totalStars: allLevels.length,
    perfectCount: allLevels.filter((level) => level.isPerfect).length,
    nextPlayableLevel: findNextPlayableLevel(allLevels),
    tiers: DIFFICULTY_TIER_IDS.map((tier) => summarizeTier(tier, allLevels)),
    allLevels,
  };
}

/** Nombre fini ≥ 0, sinon `null` (`Infinity` deviendrait `null` en JSON et le niveau serait écarté). */
function toValidScore(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Meilleur score (le plus petit). Une valeur invalide n'en devient jamais un : 0 faute d'ancien. */
function keepBest(previous: number | undefined, value: number): number {
  const score = toValidScore(value);
  if (previous === undefined) return score ?? 0;
  return score === null ? previous : Math.min(previous, score);
}

function mergeVictory(
  existing: LevelCompletion | undefined,
  params: LevelVictoryParams,
  now: Date,
): LevelCompletion {
  // Une entrée non réussie (import, version plus récente) n'a ni meilleur score ni date d'étoile.
  const previous = existing?.completed ? existing : undefined;
  return {
    levelId: params.levelId,
    completed: true,
    isPerfect: previous?.isPerfect === true || params.isPerfect,
    bestMoves: keepBest(previous?.bestMoves, params.moves),
    bestTimeSeconds: keepBest(previous?.bestTimeSeconds, params.timeSeconds),
    timesPlayed: (existing?.timesPlayed ?? 0) + 1,
    completedAt: previous?.completedAt ?? now.toISOString(),
  };
}

/**
 * Enregistre une partie gagnée dans le profil actif : l'étoile, la couronne (définitive), les
 * meilleurs scores, le nombre de victoires et le dernier niveau joué ; `completedAt` garde la date
 * de la première victoire. Un `moves` ou un `timeSeconds` invalide (non fini ou négatif) ne devient
 * jamais un meilleur score, mais l'étoile est enregistrée. Sans profil actif ou avec un `levelId`
 * vide, renvoie `state` lui-même (`updateState` n'écrit rien). À appliquer par
 * `updateState((state) => recordLevelVictory(state, params))`.
 */
export function recordLevelVictory(
  state: MiaSaveState,
  params: LevelVictoryParams,
  options: RecordVictoryOptions = {},
): MiaSaveState {
  const { gameId, levelId } = params;
  const profileIndex = state.profiles.findIndex((profile) => profile.id === state.activeProfileId);
  const profile = state.profiles[profileIndex];
  if (!profile || levelId === '') return state;

  const levels = getOwn(profile.gamesProgress, gameId)?.levels ?? NO_COMPLETIONS;
  const progress: GameProgress = {
    gameId,
    levels: {
      ...levels,
      [levelId]: mergeVictory(getOwn(levels, levelId), params, options.now ?? new Date()),
    },
    lastPlayedLevelId: levelId,
  };
  const nextProfile: UserProfile = {
    ...profile,
    gamesProgress: { ...profile.gamesProgress, [gameId]: progress },
  };
  return {
    ...state,
    profiles: state.profiles.map((entry, index) => (index === profileIndex ? nextProfile : entry)),
  };
}
