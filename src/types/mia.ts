export type DifficultyTier = 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard';

export type GameId = 'memory' | 'traffic-jam';

export type InputMode = 'touch' | 'dpad';

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
