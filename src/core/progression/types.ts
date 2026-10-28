import type { DifficultyTier, GameId, LevelCompletion } from '@/types/mia';

export interface BaseLevelDefinition<TConfig = unknown> {
  /** Identifiant unique et immuable (ex: "mem-001", "tj-012") : clé de la progression sauvegardée */
  id: string;
  gameId: GameId;
  tier: DifficultyTier;
  /** Ordre au sein du palier (convention : 10, 20, 30, 40... pour permettre d'insérer 15, 25 plus tard) */
  order: number;
  title?: string;
  config: TConfig;
}

/**
 * Entrée du registre des jeux : données seules. Les icônes sont associées dans `components/`,
 * comme `DIFFICULTY_TIERS` et les avatars.
 */
export interface GameManifest<TConfig = unknown> {
  id: GameId;
  /** Nom affiché du jeu (ex: « Memory ») */
  title: string;
  /** Faculté cérébrale travaillée, affichée sur la carte du jeu dans le Hub */
  skill: string;
  /** Route de la Carte des Étoiles (ex: « /memory ») : `next/link` ajoute `basePath` et la barre finale */
  path: string;
  /** Niveaux dans un ordre quelconque (`sortLevels` les range) ; un niveau publié n'en est jamais retiré */
  catalog: readonly BaseLevelDefinition<TConfig>[];
}

export interface EnrichedLevelItem<TConfig = unknown> {
  definition: BaseLevelDefinition<TConfig>;
  /** Numéro d'étoile global (1 à N) calculé dynamiquement après tri */
  starNumber: number;
  /** Index 0-based dans le catalogue trié */
  globalIndex: number;
  isUnlocked: boolean;
  isCompleted: boolean;
  /** Couronne : niveau réussi avec un score parfait (jamais sans `isCompleted`) */
  isPerfect: boolean;
  /** Entrée de la sauvegarde pour ce niveau, `null` s'il n'a jamais été réussi */
  completion: LevelCompletion | null;
}

export interface TierProgressSummary<TConfig = unknown> {
  tier: DifficultyTier;
  earnedStars: number;
  totalStars: number;
  perfectCount: number;
  levels: EnrichedLevelItem<TConfig>[];
}

export interface GameProgressSummary<TConfig = unknown> {
  gameId: GameId;
  /** Niveaux du catalogue réussis (une réussite d'un niveau inconnu du catalogue ne compte pas) */
  earnedStars: number;
  totalStars: number;
  perfectCount: number;
  /**
   * Niveau qui suit le niveau réussi le plus avancé (s'il était le dernier : le premier niveau non
   * réussi) ; toujours débloqué et non réussi, `null` quand tout est réussi.
   */
  nextPlayableLevel: EnrichedLevelItem<TConfig> | null;
  /** Les 5 paliers, du plus facile au plus difficile, même vides */
  tiers: TierProgressSummary<TConfig>[];
  allLevels: EnrichedLevelItem<TConfig>[];
}

/** Progression d'un profil sur tous les jeux du registre (compteur d'étoiles du Hub). */
export interface ProfileProgressSummary {
  earnedStars: number;
  totalStars: number;
  perfectCount: number;
  /** Résumé de chaque jeu, dans l'ordre d'affichage du Hub */
  games: GameProgressSummary[];
}

/** Partie gagnée, à enregistrer par `recordLevelVictory`. */
export interface LevelVictoryParams {
  gameId: GameId;
  levelId: string;
  moves: number;
  /** Durée de la partie, mesurée avec `performance.now()` (insensible aux réglages d'horloge) */
  timeSeconds: number;
  isPerfect: boolean;
}

export interface RecordVictoryOptions {
  /** Date de la victoire (tests) ; défaut : maintenant */
  now?: Date;
}

export interface CatalogValidationResult {
  valid: boolean;
  /** Messages français, un par anomalie */
  errors: string[];
}
