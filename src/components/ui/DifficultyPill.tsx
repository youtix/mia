import { cn } from '@/lib/cn';
import { DIFFICULTY_TIERS, type DifficultyTier } from '@/types/mia';

export type DifficultyPillSize = 'sm' | 'md' | 'lg';

export interface DifficultyPillProps {
  tier: DifficultyTier;
  /** Ajoute le sous-titre du palier (ex: « Éveil ») */
  showSubtitle?: boolean;
  size?: DifficultyPillSize;
  className?: string;
}

const TIER_COUNT = Object.keys(DIFFICULTY_TIERS).length;

const SIZE_CLASSES: Record<DifficultyPillSize, { pill: string; bar: string }> = {
  sm: { pill: 'gap-1.5 px-2.5 py-0.5 text-fluid-xs', bar: 'w-1' },
  md: { pill: 'gap-2 px-3 py-1 text-fluid-sm', bar: 'w-1' },
  lg: { pill: 'gap-2.5 px-4 py-1.5 text-fluid-lg', bar: 'w-1.5' },
};

/**
 * Badge d'un palier cognitif. Les barres de niveau (1 à 5) doublent la couleur
 * pour ne pas en dépendre (daltonisme) ; le rang est aussi annoncé aux lecteurs d'écran.
 */
export function DifficultyPill({
  tier,
  showSubtitle = false,
  size = 'md',
  className,
}: DifficultyPillProps) {
  const meta = DIFFICULTY_TIERS[tier];
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <span
      data-tier={meta.id}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border font-semibold whitespace-nowrap',
        meta.badgeBgClass,
        meta.colorClass,
        sizeClasses.pill,
        className,
      )}
    >
      <span aria-hidden="true" className="flex h-[1em] items-end gap-0.5">
        {Array.from({ length: TIER_COUNT }, (_, index) => (
          <span
            key={index}
            data-filled={index < meta.order}
            className={cn(
              'rounded-full bg-current',
              index < meta.order ? 'opacity-100' : 'opacity-25',
              sizeClasses.bar,
            )}
            style={{ height: `${String(((index + 1) / TIER_COUNT) * 100)}%` }}
          />
        ))}
      </span>
      <span>{meta.label}</span>
      {/* Espace en tête : séparateur pour les lecteurs d'écran, sans effet dans le flex. */}
      {showSubtitle ? (
        <span className="font-normal text-slate-300">{` · ${meta.subtitle}`}</span>
      ) : null}
      <span className="sr-only">
        , palier {meta.order} sur {TIER_COUNT}
      </span>
    </span>
  );
}
