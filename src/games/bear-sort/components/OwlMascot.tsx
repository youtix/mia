import { cn } from '@/lib/cn';
import { ART_STYLE_PRECEDENCE, INK } from './art-tokens';

export type MascotMood = 'idle' | 'talking' | 'happy' | 'no';

export interface OwlMascotProps {
  /** `talking` : bec animé ; `happy` : petit saut ; `no` : la tête dit non (règle « sauf ») */
  mood: MascotMood;
  className?: string;
}

/** Violet : la chouette ne se confond ni avec le bleu, ni avec le jaune, ni avec le rouge. */
const OWL_BODY = '#8b5cf6';
const OWL_SHADE = '#6d28d9';
const OWL_LIGHT = '#ede9fe';
const OWL_MID = '#c4b5fd';
const OWL_OUTLINE = '#2e1065';
const BEAK = '#fdba74';

/** Images clés de la chouette. Les pivots sont en unités du repère 100 × 100 (`transform-origin`). */
const OWL_KEYFRAMES = [
  '@keyframes bear-sort-owl-sway{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.6deg)}}',
  '@keyframes bear-sort-owl-blink{0%,93%,100%{transform:scaleY(1)}96.5%{transform:scaleY(.08)}}',
  '@keyframes bear-sort-owl-beak{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}',
  '@keyframes bear-sort-owl-hop{0%,62%,100%{transform:translateY(0) scale(1)}12%{transform:translateY(0) scale(1.05,.93)}36%{transform:translateY(-8px) scale(.98,1.03)}56%{transform:translateY(0) scale(1.04,.95)}}',
  '@keyframes bear-sort-owl-flap-left{0%,62%,100%{transform:rotate(0)}36%{transform:rotate(30deg)}}',
  '@keyframes bear-sort-owl-flap-right{0%,62%,100%{transform:rotate(0)}36%{transform:rotate(-30deg)}}',
  '@keyframes bear-sort-owl-shake{0%,62%,100%{transform:rotate(0)}10%{transform:rotate(-9deg)}26%{transform:rotate(9deg)}42%{transform:rotate(-7deg)}54%{transform:rotate(3deg)}}',
].join('');

/** Clignement : autour du centre de l'œil, quelle que soit sa position. */
const BLINK_CLASSES =
  'transform-fill origin-center motion-safe:animate-[bear-sort-owl-blink_4.5s_ease-in-out_infinite]';

/** Animation de tout le corps selon l'humeur. */
const BODY_ANIMATION: Readonly<Record<MascotMood, string | null>> = {
  idle: 'motion-safe:animate-[bear-sort-owl-sway_5s_ease-in-out_infinite]',
  talking: null,
  happy: 'motion-safe:animate-[bear-sort-owl-hop_1.1s_ease-in-out_infinite]',
  no: null,
};

/** Un œil ouvert : blanc, pupille et reflet, légèrement tourné vers le centre. */
function OpenEye({ cx, pupilOffset }: { cx: number; pupilOffset: number }) {
  return (
    <g className={BLINK_CLASSES}>
      <circle cx={cx} cy={36} r={12} fill="#ffffff" strokeWidth={2} />
      <circle cx={cx + pupilOffset} cy={36.5} r={8} fill={INK} stroke="none" />
      <circle cx={cx + pupilOffset - 2.6} cy={33.4} r={2.8} fill="#ffffff" stroke="none" />
    </g>
  );
}

/**
 * Chouette violette : corps rond, grands yeux, petit bec, aigrettes, ventre et ailes. La tête est un
 * groupe à part : c'est elle qui dit « non ». L'humeur se lit aussi sans animation : yeux souriants
 * de `happy`, bec entrouvert de `talking`. Décorative : son bouton (rejouer la voix) porte le nom
 * vocalisé.
 */
export function OwlMascot({ mood, className }: OwlMascotProps) {
  const isHappy = mood === 'happy';
  const isBeakOpen = mood === 'talking' || isHappy;

  return (
    <>
      <style href="bear-sort-owl" precedence={ART_STYLE_PRECEDENCE}>
        {OWL_KEYFRAMES}
      </style>
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        data-mood={mood}
        className={cn('size-full overflow-visible', className)}
      >
        <g
          stroke={OWL_OUTLINE}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transformOrigin: '50px 98px' }}
          className={cn(BODY_ANIMATION[mood])}
        >
          {/* Pattes à trois doigts, sortant de sous le corps */}
          <path
            d="M29.5 86Q27 98.5 32.5 98Q35 100 37.5 98.2Q40 100 42.5 98Q48 98.5 45.5 86Z"
            fill={BEAK}
            strokeWidth={2.2}
          />
          <path
            d="M70.5 86Q73 98.5 67.5 98Q65 100 62.5 98.2Q60 100 57.5 98Q52 98.5 54.5 86Z"
            fill={BEAK}
            strokeWidth={2.2}
          />

          {/* Ailes, derrière le corps : elles battent de joie */}
          <path
            d="M24 50C12 56 8 73 15 86C24 83 32 68 31 52Z"
            fill={OWL_SHADE}
            style={{ transformOrigin: '27px 52px' }}
            className={cn(
              isHappy && 'motion-safe:animate-[bear-sort-owl-flap-left_1.1s_ease-in-out_infinite]',
            )}
          />
          <path
            d="M76 50C88 56 92 73 85 86C76 83 68 68 69 52Z"
            fill={OWL_SHADE}
            style={{ transformOrigin: '73px 52px' }}
            className={cn(
              isHappy && 'motion-safe:animate-[bear-sort-owl-flap-right_1.1s_ease-in-out_infinite]',
            )}
          />

          {/* Corps et ventre plumeté */}
          <ellipse cx={50} cy={59} rx={30} ry={32} fill={OWL_BODY} />
          <ellipse cx={50} cy={67} rx={20} ry={21} fill={OWL_LIGHT} stroke="none" />
          <path
            d="M36.5 64q4.5 5.5 9 0M45.5 64q4.5 5.5 9 0M54.5 64q4.5 5.5 9 0M41 72q4.5 5.5 9 0M50 72q4.5 5.5 9 0M45.5 80q4.5 5.5 9 0"
            fill="none"
            stroke={OWL_MID}
            strokeWidth={2.6}
          />

          {/* Tête */}
          <g
            style={{ transformOrigin: '50px 62px' }}
            className={cn(
              mood === 'no' &&
                'motion-safe:animate-[bear-sort-owl-shake_2.4s_ease-in-out_infinite]',
            )}
          >
            {/* Aigrettes */}
            <path d="M28 24C24 18 22 11 23 4C30 7 38 11 43 17Z" fill={OWL_SHADE} />
            <path d="M72 24C76 18 78 11 77 4C70 7 62 11 57 17Z" fill={OWL_SHADE} />

            <ellipse cx={50} cy={36} rx={33} ry={27} fill={OWL_BODY} />
            <path
              d="M22.5 32C24 22 31 14.5 41 12.5"
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.35}
              strokeWidth={3.6}
            />

            {/* Disque facial */}
            <circle cx={36} cy={36} r={16} fill={OWL_MID} stroke="none" />
            <circle cx={64} cy={36} r={16} fill={OWL_MID} stroke="none" />

            {/* Yeux : ouverts, ou plissés de joie */}
            {isHappy ? (
              <path
                data-eyes="smiling"
                d="M25.5 39.5Q36 25 46.5 39.5M53.5 39.5Q64 25 74.5 39.5"
                fill="none"
                stroke={INK}
                strokeWidth={4.8}
              />
            ) : (
              <>
                <OpenEye cx={36} pupilOffset={1} />
                <OpenEye cx={64} pupilOffset={-1} />
              </>
            )}

            {/* Bec : la mandibule descend, le creux apparaît entre les deux */}
            <ellipse cx={50} cy={49.5} rx={4.2} ry={3.6} fill={OWL_OUTLINE} stroke="none" />
            <path
              data-beak="lower"
              d="M45.6 48.5H54.4L50 54Z"
              fill={BEAK}
              strokeWidth={1.8}
              style={isBeakOpen ? { transform: 'translateY(3.5px)' } : undefined}
              className={cn(
                mood === 'talking' &&
                  'motion-safe:animate-[bear-sort-owl-beak_0.46s_ease-in-out_infinite]',
              )}
            />
            <path d="M43.5 44H56.5L50 52Z" fill={BEAK} strokeWidth={1.8} />
          </g>
        </g>
      </svg>
    </>
  );
}
