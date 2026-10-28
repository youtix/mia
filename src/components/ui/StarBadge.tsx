import { cn } from '@/lib/cn';
import { Crown, Star } from 'lucide-react';

export type StarBadgeSize = 'sm' | 'md' | 'lg';

export interface StarBadgeProps {
  /** Nombre d'étoiles acquises */
  earned: number;
  /** Nombre total d'étoiles disponibles (affiche `earned / total`) */
  total?: number;
  /** Score parfait : couronne et halo doré */
  isPerfect?: boolean;
  size?: StarBadgeSize;
  className?: string;
}

const SIZE_CLASSES: Record<StarBadgeSize, { badge: string; icon: string }> = {
  sm: { badge: 'gap-1 px-2 py-0.5 text-fluid-sm', icon: 'size-4' },
  md: { badge: 'gap-1.5 px-3 py-1 text-fluid-base', icon: 'size-5' },
  lg: { badge: 'gap-2 px-4 py-1.5 text-fluid-xl', icon: 'size-7' },
};

const frenchPlural = new Intl.PluralRules('fr-FR');

/** Libellé vocalisé, ex : « 1 étoile sur 20 », « 12 étoiles, parfait » (0 et 1 au singulier). */
export function describeStars(earned: number, total?: number, isPerfect = false): string {
  const noun = frenchPlural.select(earned) === 'one' ? 'étoile' : 'étoiles';
  const outOf = total === undefined ? '' : ` sur ${String(total)}`;
  return `${String(earned)} ${noun}${outOf}${isPerfect ? ', parfait' : ''}`;
}

export function StarBadge({
  earned,
  total,
  isPerfect = false,
  size = 'md',
  className,
}: StarBadgeProps) {
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <span
      role="img"
      aria-label={describeStars(earned, total, isPerfect)}
      data-perfect={isPerfect || undefined}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border font-bold whitespace-nowrap tabular-nums',
        isPerfect
          ? 'border-amber-300 bg-amber-400/15 text-amber-100 shadow-lg ring-2 shadow-amber-400/40 ring-amber-300/60'
          : 'border-slate-700 bg-slate-800/80 text-slate-50',
        sizeClasses.badge,
        className,
      )}
    >
      <Star className={cn('fill-amber-400 text-amber-400', sizeClasses.icon)} />
      <span>
        {earned}
        {total === undefined ? null : (
          <span className="font-semibold text-slate-400"> / {total}</span>
        )}
      </span>
      {isPerfect ? (
        <Crown className={cn('fill-amber-300 text-amber-300', sizeClasses.icon)} />
      ) : null}
    </span>
  );
}
