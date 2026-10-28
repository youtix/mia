import { getAvatar } from '@/core/storage';
import { cn } from '@/lib/cn';
import { UserRound } from 'lucide-react';
import { AVATAR_ICONS } from './avatar-icons';

export type AvatarBadgeSize = 'sm' | 'md' | 'lg';

export interface AvatarBadgeProps {
  /** Avatar du catalogue (`AVATARS`) ; inconnu (sauvegarde plus récente) : silhouette neutre */
  avatarId: string;
  size?: AvatarBadgeSize;
  /** Libellé vocalisé ; absent, l'avatar est décoratif (le prénom affiché à côté suffit) */
  label?: string;
  className?: string;
}

const SIZE_CLASSES: Record<AvatarBadgeSize, { badge: string; icon: string }> = {
  sm: { badge: 'size-8', icon: 'size-5' },
  md: { badge: 'size-12', icon: 'size-7' },
  lg: { badge: 'size-16', icon: 'size-9' },
};

/**
 * Avatar d'un profil : cercle de couleur et icône vectorielle. Contenu « phrasé » (`span`, `svg`),
 * utilisable dans une `FocusableCard` ou un bouton.
 */
export function AvatarBadge({ avatarId, size = 'md', label, className }: AvatarBadgeProps) {
  const avatar = getAvatar(avatarId);
  const Icon = avatar ? AVATAR_ICONS[avatar.id] : UserRound;
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-avatar={avatar?.id ?? 'unknown'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        avatar
          ? [avatar.bgClass, 'text-slate-950']
          : 'border-2 border-dashed border-slate-500 bg-slate-700 text-slate-200',
        sizeClasses.badge,
        className,
      )}
    >
      <Icon className={sizeClasses.icon} />
    </span>
  );
}
