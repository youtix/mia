export type DifficultyTier = 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard';

export type GameId = 'memory' | 'traffic-jam';

export type InputMode = 'touch' | 'dpad';

/** Mode TV de la variante `tv:` (FEAT-03 §5) : `auto` = détection CSS, sinon forcé. */
export type TvModeOverride = 'auto' | 'always_tv' | 'always_touch';

/** Paramètres globaux de l'appareil (partagés par tous les profils). */
export interface DeviceSettings {
  soundEnabled: boolean;
  highContrastMode: boolean;
  tvModeOverride: TvModeOverride;
}

export interface LevelCompletion {
  levelId: string;
  /** Niveau réussi (donne 1 Étoile) */
  completed: boolean;
  /** Résolu avec un score parfait (sans erreur ou en un minimum de coups) */
  isPerfect: boolean;
  /** Meilleur nombre de coups réalisés */
  bestMoves: number;
  /** Meilleur temps en secondes (indicatif uniquement, non pénalisant sur TV) */
  bestTimeSeconds: number;
  /** Nombre de fois où ce niveau a été terminé */
  timesPlayed: number;
  completedAt: string;
}

export interface GameProgress {
  gameId: GameId;
  /** Dictionnaire indexé par levelId immuable (ex: "mem-001", "tj-005") */
  levels: Record<string, LevelCompletion>;
  /** Dernier niveau joué pour proposer le bouton "Continuer" */
  lastPlayedLevelId: string | null;
}

/**
 * Pas du facteur de temps des réglages de jeu (FEAT-19), dans l'ordre d'affichage : `1` = temps du
 * niveau tel quel, `0.5` le divise par deux, `2` le double.
 */
export const TIME_FACTORS = [0.5, 1, 1.5, 2] as const;

/** Multiplicateur d'un temps de jeu (aperçu, affichage d'une erreur), parmi `TIME_FACTORS`. */
export type TimeFactor = (typeof TIME_FACTORS)[number];

/** Réglages de Memory propres à un profil (FEAT-19), appliqués aux temps de chaque niveau. */
export interface MemoryGameSettings {
  /** Multiplie l'aperçu du niveau (`previewSeconds`) ; une étoile sans aperçu (0) n'en gagne pas */
  previewFactor: TimeFactor;
  /** Multiplie le temps pendant lequel les cartes d'une erreur restent visibles (`MISMATCH_DELAY_MS`) */
  mismatchFactor: TimeFactor;
}

/** Réglages de jeu d'un profil, un objet par jeu qui en propose (Traffic Jam n'en a pas encore). */
export interface ProfileGameSettings {
  memory: MemoryGameSettings;
}

export interface UserProfile {
  id: string;
  name: string;
  /** ex: "fox", "owl", "robot" (catalogue d'avatars de FEAT-06) */
  avatarId: string;
  createdAt: string;
  /** Progression indexée par identifiant de jeu ("memory", "traffic-jam") */
  gamesProgress: Record<string, GameProgress>;
  /** Réglages de jeu du joueur (FEAT-19) : toujours complets, réparés aux valeurs par défaut à la lecture */
  gameSettings: ProfileGameSettings;
}

/** Sauvegarde locale complète (FEAT-05) : une seule clé de stockage par appareil. */
export interface MiaSaveState {
  /** Version du schéma pour permettre des migrations transparentes */
  schemaVersion: 1;
  /** ID du profil actuellement actif */
  activeProfileId: string | null;
  /** Profils familiaux créés sur l'appareil */
  profiles: UserProfile[];
  settings: DeviceSettings;
}

export interface DifficultyTierMeta {
  id: DifficultyTier;
  order: number;
  label: string;
  subtitle: string;
  colorClass: string;
  badgeBgClass: string;
}

export const DIFFICULTY_TIERS: Record<DifficultyTier, DifficultyTierMeta> = {
  very_easy: {
    id: 'very_easy',
    order: 1,
    label: 'Très Facile',
    subtitle: 'Éveil',
    colorClass: 'text-emerald-400',
    badgeBgClass: 'bg-emerald-500/20 border-emerald-400',
  },
  easy: {
    id: 'easy',
    order: 2,
    label: 'Facile',
    subtitle: 'Initié',
    colorClass: 'text-sky-400',
    badgeBgClass: 'bg-sky-500/20 border-sky-400',
  },
  medium: {
    id: 'medium',
    order: 3,
    label: 'Moyen',
    subtitle: 'Confirmé',
    colorClass: 'text-amber-400',
    badgeBgClass: 'bg-amber-500/20 border-amber-400',
  },
  hard: {
    id: 'hard',
    order: 4,
    label: 'Difficile',
    subtitle: 'Expert',
    colorClass: 'text-orange-400',
    badgeBgClass: 'bg-orange-500/20 border-orange-400',
  },
  very_hard: {
    id: 'very_hard',
    order: 5,
    label: 'Très Difficile',
    subtitle: 'Maître',
    colorClass: 'text-purple-400',
    badgeBgClass: 'bg-purple-500/20 border-purple-400',
  },
};
