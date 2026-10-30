import { cn } from '@/lib/cn';
import type { BearSize, BearTraits, SortFeature } from '../types';
import {
  BOX_INSIDE,
  FADE_TRANSITION_CLASSES,
  getArtPalette,
  GLOW_COLOR,
  GREY_PALETTE,
} from './art-tokens';

/** Échelle dans le parent : les deux tailles de boîte se distinguent d'un coup d'œil. */
const BOX_SCALES: Readonly<Record<BearSize, number>> = { big: 1, small: 0.68 };

/** Échelle commune aux deux tailles quand la taille est le critère estompé. */
const FADED_SIZE_SCALE = 0.84;

/** Silhouette de la caisse, reprise par le halo. */
const CRATE_SILHOUETTE = 'M15 12H85L97 32V38L91 92Q90.5 96.5 85.5 96.5H14.5Q9.5 96.5 9 92L3 38V32Z';

/** Une seule boîte brille à la fois : un identifiant fixe suffit. */
const GLOW_FILTER_ID = 'bear-sort-box-glow';

export interface BearBoxProps {
  /** Couleur et taille de la boîte, `null` pour la boîte ouverte, neutre, de la règle « sauf » */
  traits: BearTraits | null;
  /** Caractéristique estompée (échelon 2 de l'échelle d'indices) */
  fadedFeature?: SortFeature | null;
  /** Bonne boîte éclairée (échelon 3 de l'échelle d'indices) */
  isGlowing?: boolean;
  className?: string;
}

/**
 * Caisse à jouets ouverte, vue de face et un peu du dessus, aux couleurs des ours. Remplit son
 * parent, ancrée en bas et au centre. Décorative : son bouton porte le nom vocalisé.
 */
export function BearBox({
  traits,
  fadedFeature = null,
  isGlowing = false,
  className,
}: BearBoxProps) {
  const palette = traits ? getArtPalette(traits.color, fadedFeature) : GREY_PALETTE;
  const scale =
    traits === null ? 1 : fadedFeature === 'size' ? FADED_SIZE_SCALE : BOX_SCALES[traits.size];

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMax meet"
      data-box-color={traits?.color ?? 'neutral'}
      data-box-size={traits?.size}
      data-faded={fadedFeature ?? undefined}
      data-glowing={isGlowing || undefined}
      className={cn('size-full overflow-visible', className)}
    >
      <g
        stroke={palette.outline}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transform: `scale(${String(scale)})`, transformOrigin: '50px 100px' }}
        className={FADE_TRANSITION_CLASSES}
      >
        {/* Halo : un trait épais et flouté autour de la silhouette, qui reste visible sans animation */}
        {isGlowing ? (
          <g
            data-glow="true"
            fill="none"
            stroke={GLOW_COLOR}
            className="motion-safe:animate-pulse contrast:stroke-white"
          >
            <filter
              id={GLOW_FILTER_ID}
              x="-30"
              y="-30"
              width="160"
              height="160"
              filterUnits="userSpaceOnUse"
            >
              <feGaussianBlur stdDeviation={3.6} />
            </filter>
            <path d={CRATE_SILHOUETTE} strokeWidth={13} filter={`url(#${GLOW_FILTER_ID})`} />
          </g>
        ) : null}

        {/* Bord arrière et paroi du fond, vus par l'ouverture */}
        <path d="M15 12H85L97 34H3Z" fill={palette.light} />
        <path d="M19.5 17H80.5L89 33H11Z" fill={BOX_INSIDE} stroke="none" />
        <path d="M19.5 17H80.5L83 21.8H17Z" fill={palette.shade} stroke="none" />

        {/* Face avant et lattes */}
        <path
          d="M4 34H96L91 91.5A5.5 5.5 0 0 1 85.5 96.5H14.5A5.5 5.5 0 0 1 9 91.5Z"
          fill={palette.body}
        />
        <path d="M10 62H90M10 79H90" fill="none" stroke={palette.shade} strokeWidth={2.6} />

        {/* Montants d'angle */}
        <path d="M4 34H15.5L18 96.5H14.5A5.5 5.5 0 0 1 9 91.5Z" fill={palette.shade} />
        <path d="M96 34H84.5L82 96.5H85.5A5.5 5.5 0 0 0 91 91.5Z" fill={palette.shade} />

        {/* Empreinte de patte, sur la latte du haut : les ours rangés occupent le bas de la face */}
        <ellipse cx={50} cy={54.5} rx={7.4} ry={5.6} fill={palette.light} stroke="none" />
        <circle cx={40.4} cy={48.5} r={2.9} fill={palette.light} stroke="none" />
        <circle cx={46.4} cy={45} r={3} fill={palette.light} stroke="none" />
        <circle cx={53.6} cy={45} r={3} fill={palette.light} stroke="none" />
        <circle cx={59.6} cy={48.5} r={2.9} fill={palette.light} stroke="none" />

        {/* Rebord avant */}
        <rect x={2} y={30} width={96} height={9.5} rx={4.75} fill={palette.light} />
      </g>
    </svg>
  );
}
