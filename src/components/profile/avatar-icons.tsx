import type { AvatarId } from '@/core/storage';
import { Bot, Brain, Cat, Crown, Rocket, Star } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

/** Props communes aux icônes Lucide et aux icônes dessinées ici. */
export interface AvatarIconProps {
  className?: string;
  strokeWidth?: number;
}

export type AvatarIcon = ComponentType<AvatarIconProps>;

/** Mêmes attributs que les icônes Lucide (grille 24 × 24, trait arrondi `currentColor`). */
function LucideStyleIcon({
  className,
  strokeWidth = 2,
  children,
}: AvatarIconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Tête de renard de face (absente de Lucide) : oreilles pointues, joues larges, museau effilé. */
export function FoxIcon(props: AvatarIconProps) {
  return (
    <LucideStyleIcon {...props}>
      <path d="M12 20 3 11l1-8 5 4h6l5-4 1 8Z" />
      <path d="m3 11 5 2 4 3 4-3 5-2" />
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
    </LucideStyleIcon>
  );
}

/** Chouette de face (absente de Lucide) : aigrettes, grands yeux ronds, petit bec. */
export function OwlIcon(props: AvatarIconProps) {
  return (
    <LucideStyleIcon {...props}>
      <path d="M4 3l4 3h8l4-3v11a8 8 0 0 1-16 0Z" />
      <circle cx="8.5" cy="11" r="2" />
      <circle cx="15.5" cy="11" r="2" />
      <path d="m11 15.5 1 1.5 1-1.5" />
    </LucideStyleIcon>
  );
}

/** Icône de chaque avatar du catalogue (`AVATARS`), table exhaustive. */
export const AVATAR_ICONS: Readonly<Record<AvatarId, AvatarIcon>> = {
  fox: FoxIcon,
  owl: OwlIcon,
  robot: Bot,
  rocket: Rocket,
  cat: Cat,
  crown: Crown,
  star: Star,
  brain: Brain,
};
