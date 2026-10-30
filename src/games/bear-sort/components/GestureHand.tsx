import { cn } from '@/lib/cn';

const HAND_FILL = '#f1f5f9';
const HAND_OUTLINE = '#1e293b';

export interface GestureHandProps {
  className?: string;
}

/**
 * Main qui montre le geste (première étoile), décorative ; le plateau anime son déplacement. L'index
 * pointe vers le haut : son bout est à 42 % de la largeur et 4 % de la hauteur.
 */
export function GestureHand({ className }: GestureHandProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      className={cn('size-full overflow-visible', className)}
    >
      <g stroke={HAND_OUTLINE} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M33 59V14.5A9 9 0 0 1 51 14.5V45.5A6.5 6.5 0 0 1 64 45.5V48A6 6 0 0 1 76 48V52A5.5 5.5 0 0 1 87 52V70C87 85 76 96 62 96H52C42 96 35 91 29 83L13 62A8 8 0 0 1 24.5 51Z"
          fill={HAND_FILL}
        />
        <path d="M51 45.5V62M64 48V60M76 52V60" fill="none" strokeWidth={3} />
      </g>
    </svg>
  );
}
