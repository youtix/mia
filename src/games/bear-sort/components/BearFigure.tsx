import { cn } from '@/lib/cn';
import type { BearColor, BearSize, SortFeature } from '../types';
import { FADE_TRANSITION_CLASSES, getArtPalette, INK } from './art-tokens';

/** Échelle dans le carré parent : l'écart de taille se voit au premier coup d'œil. */
const BEAR_SCALES: Readonly<Record<BearSize, number>> = { big: 1, small: 0.62 };

/** Échelle commune aux deux tailles quand la taille est le critère estompé. */
const FADED_SIZE_SCALE = 0.8;

interface BearDrawingProps {
  color: BearColor;
  size: BearSize;
  /** Caractéristique estompée (échelon 2 de l'échelle d'indices) : ours gris, ou tailles égalisées */
  fadedFeature?: SortFeature | null;
}

/**
 * Le dessin de l'ours dans un repère 100 × 100, partagé avec l'image de la règle : posé en bas et au
 * centre, il s'y met à l'échelle de sa taille. Tête et yeux restent grands : un petit ours se
 * reconnaît encore à quelques dizaines de pixels.
 */
export function BearDrawing({ color, size, fadedFeature = null }: BearDrawingProps) {
  const palette = getArtPalette(color, fadedFeature);
  const scale = fadedFeature === 'size' ? FADED_SIZE_SCALE : BEAR_SCALES[size];

  return (
    <g
      stroke={palette.outline}
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `scale(${String(scale)})`, transformOrigin: '50px 100px' }}
      className={FADE_TRANSITION_CLASSES}
    >
      {/* Oreilles */}
      <circle cx={26} cy={16} r={11.5} fill={palette.body} />
      <circle cx={74} cy={16} r={11.5} fill={palette.body} />
      <circle cx={27} cy={17} r={6} fill={palette.light} stroke="none" />
      <circle cx={73} cy={17} r={6} fill={palette.light} stroke="none" />

      {/* Bras, sortant de derrière le corps */}
      <rect
        x={14}
        y={52.5}
        width={14}
        height={27}
        rx={7}
        transform="rotate(58 21 66)"
        fill={palette.body}
      />
      <rect
        x={72}
        y={52.5}
        width={14}
        height={27}
        rx={7}
        transform="rotate(-58 79 66)"
        fill={palette.body}
      />

      {/* Corps et ventre */}
      <ellipse cx={50} cy={71} rx={24} ry={24} fill={palette.body} />
      <ellipse cx={50} cy={73} rx={15} ry={16} fill={palette.light} stroke="none" />

      {/* Pieds, coussinets clairs vers l'avant */}
      <ellipse
        cx={31.5}
        cy={86.5}
        rx={13.5}
        ry={10.5}
        transform="rotate(-10 31.5 86.5)"
        fill={palette.body}
      />
      <ellipse
        cx={68.5}
        cy={86.5}
        rx={13.5}
        ry={10.5}
        transform="rotate(10 68.5 86.5)"
        fill={palette.body}
      />
      <ellipse cx={30.5} cy={87} rx={7.5} ry={5.8} fill={palette.light} stroke="none" />
      <ellipse cx={69.5} cy={87} rx={7.5} ry={5.8} fill={palette.light} stroke="none" />

      {/* Tête, reflet et museau */}
      <ellipse cx={50} cy={34} rx={27.5} ry={25} fill={palette.body} />
      <path
        d="M29 27c3-8 11-13 20-13"
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.35}
        strokeWidth={4}
      />
      <ellipse cx={50} cy={44} rx={13.5} ry={10} fill={palette.light} stroke="none" />

      {/* Grands yeux, nez et sourire */}
      <circle cx={37} cy={31} r={4.6} fill={INK} stroke="none" />
      <circle cx={63} cy={31} r={4.6} fill={INK} stroke="none" />
      <circle cx={35.5} cy={29.2} r={1.6} fill="#ffffff" stroke="none" />
      <circle cx={61.5} cy={29.2} r={1.6} fill="#ffffff" stroke="none" />
      <path
        d="M45.3 38.2c0-1.5 2.2-2.2 4.7-2.2s4.7.7 4.7 2.2c0 2-2.7 4.3-4.7 4.3s-4.7-2.3-4.7-4.3Z"
        fill={INK}
        stroke="none"
      />
      <path
        d="M50 42.5v2.3M43.8 45.3c1.6 2.6 4.7 2.6 6.2-.4 1.5 3 4.6 3 6.2.4"
        fill="none"
        stroke={INK}
        strokeWidth={2}
      />
    </g>
  );
}

export interface BearFigureProps extends BearDrawingProps {
  className?: string;
}

/**
 * Ours en peluche entier, même dessin pour les quatre sortes. Il remplit son carré parent ; `size`
 * le met à l'échelle dans ce carré, ancré en bas et au centre. Décoratif : son bouton porte le nom
 * vocalisé.
 */
export function BearFigure({ color, size, fadedFeature = null, className }: BearFigureProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMax meet"
      data-color={color}
      data-size={size}
      data-faded={fadedFeature ?? undefined}
      className={cn('size-full', className)}
    >
      <BearDrawing color={color} size={size} fadedFeature={fadedFeature} />
    </svg>
  );
}
