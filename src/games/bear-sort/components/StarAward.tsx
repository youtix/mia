import { cn } from '@/lib/cn';
import { ART_STYLE_PRECEDENCE, INK } from './art-tokens';

const STAR_GOLD = '#fbbf24';
const STAR_LIGHT = '#fcd34d';
const CROWN_GOLD = '#fde68a';
const GOLD_OUTLINE = '#854d0e';
const SPARKLE = '#fef9c3';

/** Étoile à cinq branches dodues autour de (0, 0). */
const STAR_POINTS =
  '0,-40 12.64,-17.39 38.04,-12.36 20.45,6.64 23.51,32.36 0,21.5 -23.51,32.36 -20.45,6.64 -38.04,-12.36 -12.64,-17.39';

/** Scintillement à quatre branches autour de (0, 0). */
const SPARKLE_PATH = 'M0-8Q1-1 8 0Q1 1 0 8Q-1 1-8 0Q-1-1 0-8Z';

const STAR_KEYFRAMES = [
  '@keyframes bear-sort-star-sway{0%,100%{transform:rotate(-3.5deg) scale(1)}50%{transform:rotate(3.5deg) scale(1.03)}}',
  '@keyframes bear-sort-twinkle{0%,100%{transform:scale(.6);opacity:.55}50%{transform:scale(1.15);opacity:1}}',
].join('');

/** Scintillements autour de l'étoile : décalés dans le temps, ils ne brillent pas ensemble. */
const SPARKLES = [
  { x: 8, y: 18, scale: 1.1, delayClass: '[animation-delay:0ms]' },
  { x: 92, y: 14, scale: 0.9, delayClass: '[animation-delay:450ms]' },
  { x: 95, y: 72, scale: 1, delayClass: '[animation-delay:900ms]' },
  { x: 5, y: 76, scale: 0.8, delayClass: '[animation-delay:1350ms]' },
] as const;

export interface StarAwardProps {
  /** Couronne gagnée : affichée au-dessus de l'étoile. Une couronne manquée n'est jamais évoquée */
  hasCrown: boolean;
  className?: string;
}

/** Grande étoile dorée et souriante de la fin de partie, qui scintille. Décorative. */
export function StarAward({ hasCrown, className }: StarAwardProps) {
  return (
    <>
      <style href="bear-sort-star" precedence={ART_STYLE_PRECEDENCE}>
        {STAR_KEYFRAMES}
      </style>
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        data-crown={hasCrown || undefined}
        className={cn('size-full overflow-visible', className)}
      >
        {/* Sans couronne, l'étoile prend toute la place : rien ne laisse deviner un manque */}
        <g transform={hasCrown ? 'translate(50 62) scale(.86)' : 'translate(50 53) scale(1.08)'}>
          <g className="motion-safe:animate-[bear-sort-star-sway_2.6s_ease-in-out_infinite]">
            <polygon
              points={STAR_POINTS}
              fill={GOLD_OUTLINE}
              stroke={GOLD_OUTLINE}
              strokeWidth={14}
              strokeLinejoin="round"
            />
            <polygon
              points={STAR_POINTS}
              fill={STAR_GOLD}
              stroke={STAR_GOLD}
              strokeWidth={8}
              strokeLinejoin="round"
            />
            <polygon
              points={STAR_POINTS}
              transform="translate(-1 -3) scale(.56)"
              fill={STAR_LIGHT}
              stroke={STAR_LIGHT}
              strokeWidth={6}
              strokeLinejoin="round"
            />

            {/* Visage */}
            <circle cx={-8} cy={-3} r={3.4} fill={INK} />
            <circle cx={8} cy={-3} r={3.4} fill={INK} />
            <circle cx={-9.2} cy={-4.4} r={1.15} fill="#ffffff" />
            <circle cx={6.8} cy={-4.4} r={1.15} fill="#ffffff" />
            <path
              d="M-7 5Q0 13 7 5"
              fill="none"
              stroke={INK}
              strokeWidth={2.6}
              strokeLinecap="round"
            />
          </g>
        </g>

        {hasCrown ? (
          <g
            data-star-crown="true"
            transform="translate(50 18) rotate(-5)"
            stroke={GOLD_OUTLINE}
            strokeWidth={2.6}
            strokeLinejoin="round"
          >
            <path d="M-21 12-25-9-11 0 0-14 11 0 25-9 21 12Z" fill={CROWN_GOLD} />
            <path d="M-21.8 7H21.8" fill="none" strokeWidth={2} />
            <circle cx={-25} cy={-10} r={3.6} fill="#ffffff" />
            <circle cx={0} cy={-15} r={3.8} fill="#ffffff" />
            <circle cx={25} cy={-10} r={3.6} fill="#ffffff" />
          </g>
        ) : null}

        {SPARKLES.map(({ x, y, scale, delayClass }) => (
          <g
            key={`${String(x)}-${String(y)}`}
            data-sparkle="true"
            transform={`translate(${String(x)} ${String(y)}) scale(${String(scale)})`}
          >
            <path
              d={SPARKLE_PATH}
              fill={SPARKLE}
              className={cn(
                'origin-center transform-fill motion-safe:animate-[bear-sort-twinkle_1.8s_ease-in-out_infinite]',
                delayClass,
              )}
            />
          </g>
        ))}
      </svg>
    </>
  );
}
