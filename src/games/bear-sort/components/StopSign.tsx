import { cn } from '@/lib/cn';
import { ART_STYLE_PRECEDENCE, PULSE_CLASSES, PULSE_KEYFRAMES, PULSE_STYLE_ID } from './art-tokens';

/** Le seul rouge du jeu : il ne veut jamais rien dire d'autre que « stop ». */
const STOP_RED = '#dc2626';

/** Octogones réguliers de centre (50, 50), à 46 et 40 unités de chaque côté. */
const BORDER_OCTAGON = '30.95,4 69.05,4 96,30.95 96,69.05 69.05,96 30.95,96 4,69.05 4,30.95';
const FIELD_OCTAGON = '33.43,10 66.57,10 90,33.43 90,66.57 66.57,90 33.43,90 10,66.57 10,33.43';

export interface StopSignProps {
  /** Le panneau peut être touché : il pulse doucement, et un halo blanc le signale même sans animation */
  isPulsing?: boolean;
  className?: string;
}

/**
 * Panneau STOP : octogone rouge, large bord blanc, lettres tracées (aucune police requise, lisibles
 * à 3 mètres). Décoratif : son bouton porte le nom vocalisé.
 */
export function StopSign({ isPulsing = false, className }: StopSignProps) {
  return (
    <>
      <style href={PULSE_STYLE_ID} precedence={ART_STYLE_PRECEDENCE}>
        {PULSE_KEYFRAMES}
      </style>
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        data-pulsing={isPulsing || undefined}
        className={cn(
          'size-full overflow-visible',
          isPulsing && cn('drop-shadow-[0_0_0.5rem_rgb(255_255_255/0.6)]', PULSE_CLASSES),
          className,
        )}
      >
        <polygon
          points={BORDER_OCTAGON}
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth={4}
          strokeLinejoin="round"
        />
        <polygon
          points={FIELD_OCTAGON}
          fill={STOP_RED}
          stroke={STOP_RED}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* Lettres S, T, O, P */}
        <g
          fill="none"
          stroke="#ffffff"
          strokeWidth={5.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M28 42.6C27.2 40 25.4 38.7 23.2 38.7C20.4 38.7 18.7 40.7 18.7 43.2C18.7 46 20.7 47.5 23.4 49C26 50.5 28.3 52.2 28.3 55.6C28.3 58.9 26.1 61.3 23.1 61.3C20.7 61.3 18.8 59.9 18.2 57.2" />
          <path d="M36 38.7H46.6M41.3 38.7V61.3" />
          <rect x={54.3} y={38.7} width={9.8} height={22.6} rx={4.9} />
          <path d="M71.7 61.3V38.7H76C79.8 38.7 81.7 41 81.7 44.4C81.7 47.8 79.8 50.2 76 50.2H71.7" />
        </g>
      </svg>
    </>
  );
}
