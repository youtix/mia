import { cn } from '@/lib/cn';
import { INK } from './art-tokens';

/** Gris clair : un « non » calme, jamais rouge. */
const NO_SIGN_COLOR = '#e2e8f0';

/** Tracé commun au contour sombre et au signe clair. */
function NoSignStroke({ color, width }: { color: string; width: number }) {
  return (
    <g fill="none" stroke={color} strokeWidth={width}>
      <circle cx={50} cy={50} r={43} />
      <path d="M19.6 19.6 80.4 80.4" />
    </g>
  );
}

/**
 * Le signe « non » (cercle barré) dans un repère 100 × 100, partagé avec l'image de la règle. Le
 * contour sombre le détache d'un ours clair comme du fond sombre ; l'intérieur reste transparent.
 */
export function NoSignShape() {
  return (
    <>
      <NoSignStroke color={INK} width={12} />
      <NoSignStroke color={NO_SIGN_COLOR} width={8} />
    </>
  );
}

export interface NoBadgeProps {
  className?: string;
}

/**
 * Signe « non » neutre, gris et jamais rouge : posé sur un ours interdit (échelon 2 de l'échelle
 * d'indices de la règle « sauf »). Décoratif.
 */
export function NoBadge({ className }: NoBadgeProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      className={cn('size-full overflow-visible', className)}
    >
      <NoSignShape />
    </svg>
  );
}
