import type { GameId } from '@/types/mia';
import { CarFront, Grid2x2, type LucideIcon } from 'lucide-react';

export interface GameIcon {
  Icon: LucideIcon;
  /** Fond clair de la pastille, sous une icône `slate-950` (contraste AA), comme les avatars */
  badgeClass: string;
}

/**
 * Icône de chaque jeu du registre (`GAME_REGISTRY`, données seules) : table exhaustive sur
 * `GameId`, comme `AVATAR_ICONS` et les paliers de `DIFFICULTY_TIERS`.
 */
export const GAME_ICONS: Readonly<Record<GameId, GameIcon>> = {
  memory: { Icon: Grid2x2, badgeClass: 'bg-violet-300' },
  'traffic-jam': { Icon: CarFront, badgeClass: 'bg-amber-300' },
};
