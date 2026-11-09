import { cn } from '@/lib/cn';
import { ART_STROKE, ART_INK as OUTLINE } from '../art-tokens';

/**
 * Les deux imposteurs du castelet (règle « La chouette a dit ») : un renard orange et un chat gris,
 * de face, en buste. Aplats sans dégradé ni filtre, contour ardoise arrondi, viewBox 100 × 100. Le
 * bas du buste file jusqu'au bord de la boîte. Aucun rouge : cette teinte est réservée au STOP.
 *
 * Seuls les deux bras bougent (`go-no-go-arm-left` / `go-no-go-arm-right`, pivot à l'épaule, en unités
 * du viewBox) : ils pendent le long du corps, +70° lève le gauche vers l'extérieur, -70° le droit. La
 * tête est un groupe à part, qui garde son pivot au cou pour une animation future.
 */

const WHITE = '#ffffff';

type Expression = 'neutral' | 'wink' | 'sulk';

interface PuppetProps {
  expression?: Expression;
  className?: string;
}

/** Classe et pivot de chaque bras : l'épaule, en unités du viewBox. */
const ARM_CLASS = { left: 'go-no-go-arm-left', right: 'go-no-go-arm-right' } as const;
const ARM_PIVOT = { left: '27px 78px', right: '73px 78px' } as const;

/**
 * Un bras : manchon arrondi et patte claire, pendu le long du corps. Dessiné côté gauche ; le droit
 * en est le miroir, posé dans un groupe interne pour que la rotation CSS du groupe externe reste
 * dans le repère de l'écran (un `transform` d'attribut serait écrasé par elle).
 */
function Arm({ side, fur, paw }: { side: 'left' | 'right'; fur: string; paw: string }) {
  return (
    <g
      className={ARM_CLASS[side]}
      style={{ transformOrigin: ARM_PIVOT[side], transformBox: 'view-box' }}
    >
      <g transform={side === 'right' ? 'translate(100 0) scale(-1 1)' : undefined}>
        <path d="M27 78L18 89.5" fill="none" stroke={OUTLINE} strokeWidth={19} />
        <path d="M27 78L18 89.5" fill="none" stroke={fur} strokeWidth={13} />
        <circle cx={17} cy={90.5} r={7.5} fill={paw} />
      </g>
    </g>
  );
}

/** Oeil ouvert du renard : tout sombre, avec son reflet. */
function FoxEye({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g stroke="none">
      <ellipse cx={cx} cy={cy} rx={5.6} ry={6.8} fill={OUTLINE} />
      <circle cx={cx + 1.9} cy={cy - 2.7} r={2} fill={WHITE} />
    </g>
  );
}

/** Yeux et bouche du renard selon l'expression. */
function FoxFace({ expression }: { expression: Expression }) {
  if (expression === 'wink') {
    return (
      <>
        <FoxEye cx={32} cy={40} />
        <path d="M61 42Q68 33 75 42" fill="none" strokeWidth={3.4} />
        <path d="M39 64.5C43 73 56 73 62.5 62.5" fill="none" strokeWidth={2.6} />
      </>
    );
  }
  if (expression === 'sulk') {
    // Paupières mi-closes, regard vers le bas, et la moue : la bouche du sourire, à l'envers.
    return (
      <>
        <g stroke="none">
          <path d="M26.4 41A5.6 6.8 0 0 0 37.6 41Z" fill={OUTLINE} />
          <path d="M62.4 41A5.6 6.8 0 0 0 73.6 41Z" fill={OUTLINE} />
          <circle cx={33.6} cy={44.4} r={1.5} fill={WHITE} />
          <circle cx={69.6} cy={44.4} r={1.5} fill={WHITE} />
        </g>
        <path d="M25.5 41L38.5 41M61.5 41L74.5 41" fill="none" strokeWidth={3} />
        <path
          d="M50 63.5L50 67M41 72C43 66 48 66 50 69.5C52 66 57 66 59 72"
          fill="none"
          strokeWidth={2.6}
        />
      </>
    );
  }
  return (
    <>
      <FoxEye cx={32} cy={40} />
      <FoxEye cx={68} cy={40} />
      <path
        d="M50 63.5L50 66M41 66C44 71 48 71 50 67C52 71 56 71 59 66"
        fill="none"
        strokeWidth={2.6}
      />
    </>
  );
}

/** Renard orange de face : joues blanches, oreilles pointues à bout sombre, museau noir. */
export function FoxPuppet({ expression = 'neutral', className }: PuppetProps) {
  const fur = '#fb923c';
  const earInside = '#ffedd5';
  const tip = '#475569';
  const head =
    'M50 16C66 16 81 23 87 37C89 42 92 49 95 56C88 58 83 62 77 67C71 72 62 76 50 76C38 76 29 72 23 67C17 62 12 58 5 56C8 49 11 42 13 37C19 23 34 16 50 16Z';
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={cn('size-full overflow-visible', className)}
    >
      <g {...ART_STROKE}>
        {/* Torse, ventre blanc ; le bas file jusqu'au bord de la boîte */}
        <path d="M31 68C26 76 22 86 20 100L80 100C78 86 74 76 69 68Z" fill={fur} stroke="none" />
        <path d="M36 100C36 86 42 80 50 80C58 80 64 86 64 100Z" fill={WHITE} stroke="none" />
        <path d="M31 68C26 76 22 86 20 100M69 68C74 76 78 86 80 100" fill="none" />

        <Arm side="left" fur={fur} paw={WHITE} />
        <Arm side="right" fur={fur} paw={WHITE} />

        {/* Tête : un seul groupe, pour pouvoir l'incliner autour du cou */}
        <g style={{ transformOrigin: '50px 72px', transformBox: 'view-box' }}>
          {/* Oreilles : orange, creux clair, bout sombre */}
          <path d="M11 40L10 7L42 19Z" fill={fur} stroke="none" />
          <path d="M89 40L90 7L58 19Z" fill={fur} stroke="none" />
          <path d="M15.5 31.9L15 13.8L32.6 20.4Z" fill={earInside} stroke="none" />
          <path d="M84.5 31.9L85 13.8L67.4 20.4Z" fill={earInside} stroke="none" />
          <path d="M10 7L10.4 20.2L22.8 11.8Z" fill={tip} stroke="none" />
          <path d="M90 7L89.6 20.2L77.2 11.8Z" fill={tip} stroke="none" />
          <path d="M11 40L10 7L42 19Z" fill="none" />
          <path d="M89 40L90 7L58 19Z" fill="none" />

          {/* Visage : orange, joues et menton blancs */}
          <path d={head} fill={fur} stroke="none" />
          <path
            d="M95 56C88 58 83 62 77 67C71 72 62 76 50 76C38 76 29 72 23 67C17 62 12 58 5 56C16 47 28 49 37 54C42 57 46 60 50 61C54 60 58 57 63 54C72 49 84 47 95 56Z"
            fill={WHITE}
            stroke="none"
          />
          <path d={head} fill="none" />

          {/* Museau noir et expression */}
          <path
            d="M43.5 55C43.5 52.5 56.5 52.5 56.5 55C56.5 59.5 52.5 63 50 63.5C47.5 63 43.5 59.5 43.5 55Z"
            fill={OUTLINE}
            strokeWidth={2.2}
          />
          <ellipse cx={47.5} cy={55.4} rx={2} ry={1.1} fill={WHITE} stroke="none" />
          <FoxFace expression={expression} />
        </g>
      </g>
    </svg>
  );
}

/** Yeux et bouche du chat selon l'expression. */
function CatFace({ expression }: { expression: Expression }) {
  const iris = '#bef264';
  const eye = (cx: number) => (
    <g>
      <circle cx={cx} cy={43} r={9.5} fill={iris} strokeWidth={2.2} />
      <ellipse cx={cx} cy={43} rx={4.4} ry={6.4} fill={OUTLINE} stroke="none" />
      <circle cx={cx + 2.4} cy={40.2} r={2} fill={WHITE} stroke="none" />
    </g>
  );
  if (expression === 'wink') {
    return (
      <>
        {eye(33)}
        <path d="M58 45Q67 32 76 45" fill="none" strokeWidth={3.4} />
        <path d="M50 57L50 60M40 59C42 69 55 69 62 58" fill="none" strokeWidth={2.4} />
      </>
    );
  }
  if (expression === 'sulk') {
    // Paupières mi-closes, regard vers le bas, et la moue : la bouche du sourire, à l'envers.
    return (
      <>
        <g strokeWidth={2.2}>
          <path d="M23.5 43A9.5 9.5 0 0 0 42.5 43Z" fill={iris} />
          <path d="M57.5 43A9.5 9.5 0 0 0 76.5 43Z" fill={iris} />
        </g>
        <g stroke="none">
          <ellipse cx={33} cy={47.2} rx={4.2} ry={4} fill={OUTLINE} />
          <ellipse cx={67} cy={47.2} rx={4.2} ry={4} fill={OUTLINE} />
          <circle cx={34.8} cy={46} r={1.4} fill={WHITE} />
          <circle cx={68.8} cy={46} r={1.4} fill={WHITE} />
        </g>
        <path d="M22.5 43L43.5 43M56.5 43L77.5 43" fill="none" strokeWidth={3} />
        <path
          d="M50 57L50 61M42 66C44 60 48.5 60 50 63C51.5 60 56 60 58 66"
          fill="none"
          strokeWidth={2.4}
        />
      </>
    );
  }
  return (
    <>
      {eye(33)}
      {eye(67)}
      <path
        d="M50 57L50 60M42 60C44.5 65 49 64.5 50 60C51 64.5 55.5 65 58 60"
        fill="none"
        strokeWidth={2.4}
      />
    </>
  );
}

/** Chat gris de face : oreilles roses, grands yeux jaune-vert, petit nez rose, moustaches. */
export function CatPuppet({ expression = 'neutral', className }: PuppetProps) {
  const fur = '#94a3b8';
  const shade = '#64748b';
  const light = '#e2e8f0';
  const earInside = '#fbcfe8';
  const head = 'M50 17C70 17 86 27 88 44C90 60 76 73 50 73C24 73 10 60 12 44C14 27 30 17 50 17Z';
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={cn('size-full overflow-visible', className)}
    >
      <g {...ART_STROKE}>
        {/* Torse, ventre clair ; le bas file jusqu'au bord de la boîte */}
        <path d="M31 68C26 76 22 86 20 100L80 100C78 86 74 76 69 68Z" fill={fur} stroke="none" />
        <path d="M36 100C36 86 42 80 50 80C58 80 64 86 64 100Z" fill={light} stroke="none" />
        <path d="M31 68C26 76 22 86 20 100M69 68C74 76 78 86 80 100" fill="none" />

        <Arm side="left" fur={fur} paw={light} />
        <Arm side="right" fur={fur} paw={light} />

        {/* Tête : un seul groupe, pour pouvoir l'incliner autour du cou */}
        <g style={{ transformOrigin: '50px 72px', transformBox: 'view-box' }}>
          {/* Oreilles */}
          <path d="M12 40L15 6L40 19Z" fill={fur} />
          <path d="M88 40L85 6L60 19Z" fill={fur} />
          <path d="M16.6 31.8L18.3 13.1L32 20.2Z" fill={earInside} stroke="none" />
          <path d="M83.4 31.8L81.7 13.1L68 20.2Z" fill={earInside} stroke="none" />

          {/* Visage */}
          <path d={head} fill={fur} />
          <path
            d="M50 21L50 29M41 22.5L43 29M59 22.5L57 29"
            fill="none"
            stroke={shade}
            strokeWidth={3}
          />
          <path
            d="M32 62C32 54 42 52 50 56C58 52 68 54 68 62C68 68 58 70 50 70C42 70 32 68 32 62Z"
            fill={light}
            stroke="none"
          />

          {/* Moustaches : liseré sombre, cœur clair */}
          <path
            d="M30 56L4 51M30 60L3 61M30 64L6 71M70 56L96 51M70 60L97 61M70 64L94 71"
            fill="none"
            strokeWidth={3.6}
          />
          <path
            d="M30 56L4 51M30 60L3 61M30 64L6 71M70 56L96 51M70 60L97 61M70 64L94 71"
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={1.4}
          />

          {/* Nez rose et expression */}
          <path
            d="M45.5 51C45.5 49.5 54.5 49.5 54.5 51C54.5 54 51.5 56.5 50 57C48.5 56.5 45.5 54 45.5 51Z"
            fill="#f9a8d4"
            strokeWidth={2.2}
          />
          <CatFace expression={expression} />
        </g>
      </g>
    </svg>
  );
}
