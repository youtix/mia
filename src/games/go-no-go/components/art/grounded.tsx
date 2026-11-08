import type { ReactNode } from 'react';
import type { GroundedImageId } from '../../types';

/**
 * Dessins des images qui ne volent pas (règle 2 de « Pas si vite ! », FEAT-28 §4.2). Chacun remplit
 * un carré de 100 × 100, sans texte, dans le même style plat : aplats, contour ardoise, un reflet
 * blanc dans chaque œil. Aucun rouge : cette teinte est réservée au panneau STOP. Animaux et
 * véhicules regardent vers la droite. Ce qui vit dans l'eau ou roule sur un rail est dessiné sur
 * eux ; le reste pose simplement ses pieds sur la ligne de base (vers y = 90).
 */

const INK = '#1e293b';
const WHITE = '#ffffff';

/** Contour commun : chaque dessin l'hérite de son groupe racine. */
function Drawing({ children }: { children: ReactNode }) {
  return (
    <g stroke={INK} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round">
      {children}
    </g>
  );
}

/** Œil rond : pupille sombre et petit reflet blanc. */
function Eye({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={INK} stroke="none" />
      <circle cx={cx - r * 0.32} cy={cy - r * 0.36} r={r * 0.4} fill={WHITE} stroke="none" />
    </>
  );
}

/** Trait épais cerné de sombre (queue, tige) : un trait large sombre, puis le même en couleur. */
function Rope({ d, color, width }: { d: string; color: string; width: number }) {
  return (
    <>
      <path d={d} fill="none" strokeWidth={width + 4.4} />
      <path d={d} fill="none" stroke={color} strokeWidth={width} />
    </>
  );
}

/** Patte à sabot : un rectangle arrondi, et le sabot en bas. */
function Leg({
  x,
  y,
  width = 10,
  bottom = 90,
  fill,
  hoof,
}: {
  x: number;
  y: number;
  width?: number;
  bottom?: number;
  fill: string;
  hoof?: string;
}) {
  return (
    <>
      <rect x={x} y={y} width={width} height={bottom - y} rx={4.5} fill={fill} />
      {hoof && (
        <rect
          x={x}
          y={bottom - 7}
          width={width}
          height={7}
          rx={3.5}
          fill={hoof}
          strokeWidth={2.2}
        />
      )}
    </>
  );
}

/** Nombre arrondi au dixième, en texte : les chemins calculés restent courts. */
const num = (value: number) => String(Math.round(value * 10) / 10);

/**
 * Bande verticale d'une ellipse entre x1 et x2 : ses bords haut et bas suivent l'ellipse, donc la
 * bande ne déborde jamais du corps (pas de masque, donc pas d'identifiant).
 */
function ellipseBand(cx: number, cy: number, rx: number, ry: number, x1: number, x2: number) {
  const half = (x: number) => ry * Math.sqrt(1 - ((x - cx) / rx) ** 2);
  const [h1, h2] = [half(x1), half(x2)];
  const arc = `A${num(rx)} ${num(ry)} 0 0 1`;
  return (
    `M${num(x1)} ${num(cy - h1)}${arc} ${num(x2)} ${num(cy - h2)}` +
    `V${num(cy + h2)}${arc} ${num(x1)} ${num(cy + h1)}Z`
  );
}

/** Spirale de coquille : demi-cercles de rayons croissants, centrés sur (cx, cy). */
function spiral(cx: number, cy: number, step: number, turns: number) {
  let d = `M${num(cx)} ${num(cy)}`;
  for (let i = 1; i <= turns; i++) {
    const r = step * i;
    d += `a${num(r)} ${num(r)} 0 0 1 ${num(i % 2 ? 2 * r : -2 * r)} 0`;
  }
  return d;
}

/** Les deux rayures du poisson (corps : ellipse centrée en 53, 58), et la spirale de l'escargot. */
const FISH_STRIPES = [
  ellipseBand(53, 58, 27, 19, 38, 45),
  ellipseBand(53, 58, 27, 19, 51, 58),
] as const;
const SNAIL_SPIRAL = spiral(40, 52, 4.2, 5);

export const GROUNDED_ART: Record<GroundedImageId, () => ReactNode> = {
  // Vache de profil : blanche à grandes taches noires, museau rose, petites cornes.
  cow: () => (
    <Drawing>
      <Rope d="M15 40C5 42 4 54 7 63" color={WHITE} width={2.4} />
      <path d="M7 61C3 65 4 72 8 74C12 72 12 65 7 61Z" fill={INK} strokeWidth={2.2} />
      <Leg x={29} y={58} fill="#e2e8f0" hoof="#475569" />
      <Leg x={47} y={58} fill="#e2e8f0" hoof="#475569" />
      <Leg x={16} y={58} fill={WHITE} hoof="#475569" />
      <Leg x={60} y={58} fill={WHITE} hoof="#475569" />
      <rect x={12} y={30} width={62} height={38} rx={17} fill={WHITE} />
      <path d="M30 30H52C54 38 50 46 42 46C34 46 28 40 30 30Z" fill={INK} stroke="none" />
      <path
        d="M14 52C12 42 18 35 25 34C26 42 28 50 24 57C20 60 15 58 14 52Z"
        fill={INK}
        stroke="none"
      />
      <path
        d="M45 60C45 52 54 49 60 53C64 57 62 65 56 67H49C46 66 45 63 45 60Z"
        fill={INK}
        stroke="none"
      />
      <path d="M70 27C66 21 65 16 67 13C74 14 78 20 78 27Z" fill="#fde68a" strokeWidth={2.2} />
      <path d="M82 27C82 20 85 15 90 12C93 18 91 24 90 28Z" fill="#fde68a" strokeWidth={2.2} />
      <path
        d="M67 34C67 25 74 22 82 23C91 24 96 32 96 42V54C96 61 91 66 84 66C75 66 68 60 67 50Z"
        fill={WHITE}
      />
      <path d="M67 32C70 26 76 25 79 27C80 34 75 41 68 43Z" fill={INK} stroke="none" />
      <ellipse cx={87} cy={56} rx={10} ry={9} fill="#fbcfe8" />
      <circle cx={84} cy={56} r={1.8} fill={INK} stroke="none" />
      <circle cx={91} cy={56} r={1.8} fill={INK} stroke="none" />
      <ellipse cx={65} cy={38} rx={9.5} ry={5} fill="#334155" transform="rotate(-20 65 38)" />
      <ellipse
        cx={66}
        cy={38}
        rx={5.5}
        ry={2.4}
        fill="#fbcfe8"
        stroke="none"
        transform="rotate(-20 66 38)"
      />
      <Eye cx={85} cy={39} r={4} />
    </Drawing>
  ),

  // Cochon rond et rose, gros groin à deux narines, oreille tombante, queue en tire-bouchon.
  pig: () => (
    <Drawing>
      <Rope
        d="M13 44C6 42 3 33 8 28C13 24 20 27 19 33C18 38 12 38 12 34"
        color="#f9a8d4"
        width={2.8}
      />
      <Leg x={31} y={66} bottom={91} fill="#ee9ac6" hoof="#d97ba8" />
      <Leg x={45} y={66} bottom={91} fill="#ee9ac6" hoof="#d97ba8" />
      <Leg x={17} y={66} bottom={91} width={11} fill="#f9a8d4" hoof="#e58fb8" />
      <Leg x={56} y={66} bottom={91} width={11} fill="#f9a8d4" hoof="#e58fb8" />
      <ellipse cx={38} cy={53} rx={32} ry={26} fill="#f9a8d4" />
      <circle cx={66} cy={47} r={21} fill="#f9a8d4" />
      <path d="M54 34C52 23 57 14 65 12C72 12 78 19 80 28C74 25 70 28 70 32Z" fill="#f9a8d4" />
      <path
        d="M60 30C60 23 63 19 66 19C69 19 72 22 73 26C70 25 68 27 67 29Z"
        fill="#fbcfe8"
        stroke="none"
      />
      <ellipse cx={85} cy={52} rx={9} ry={10} fill="#fbcfe8" />
      <ellipse cx={83} cy={52} rx={1.8} ry={2.8} fill={INK} stroke="none" />
      <ellipse cx={89} cy={52} rx={1.8} ry={2.8} fill={INK} stroke="none" />
      <Eye cx={72} cy={41} r={3.8} />
    </Drawing>
  ),

  // Chien brun de profil : oreille tombante sombre, collier bleu à médaille jaune, queue levée.
  dog: () => (
    <Drawing>
      <Rope d="M14 56C4 52 3 38 9 28" color="#d9a05b" width={5} />
      <Leg x={29} y={60} fill="#c58a45" hoof="#fde7c0" />
      <Leg x={43} y={60} fill="#c58a45" hoof="#fde7c0" />
      <Leg x={16} y={60} fill="#d9a05b" hoof="#fde7c0" />
      <Leg x={54} y={60} fill="#d9a05b" hoof="#fde7c0" />
      <rect x={12} y={44} width={52} height={26} rx={13} fill="#d9a05b" />
      <circle cx={67} cy={34} r={17} fill="#d9a05b" />
      <rect x={72} y={33} width={21} height={16} rx={8} fill="#fde7c0" />
      <path d="M85 47Q86 56 90 55Q93 53 91 46Z" fill="#f9a8d4" strokeWidth={2.2} />
      <ellipse cx={91} cy={38.5} rx={4.2} ry={3.4} fill={INK} />
      <path d="M77 46Q83 50 90 45" fill="none" strokeWidth={2.2} />
      <path d="M59 23C65 20 71 25 68 35C66 43 63 48 60 47C56 45 54 30 59 23Z" fill="#8a4f1d" />
      <rect
        x={52}
        y={46}
        width={17}
        height={7}
        rx={3.5}
        fill="#3b82f6"
        strokeWidth={2.2}
        transform="rotate(25 60 49)"
      />
      <circle cx={64} cy={59} r={4} fill="#facc15" strokeWidth={2.2} />
      <Eye cx={76} cy={30} r={4.2} />
    </Drawing>
  ),

  // Poisson orange rayé de jaune, vu de profil, nageant dans l'eau avec quelques bulles.
  fish: () => (
    <Drawing>
      <path d="M5 22Q15 16 26 22T48 22T70 22T95 22V84Q95 94 85 94H15Q5 94 5 84Z" fill="#38bdf8" />
      <path d="M32 58L12 40Q17 58 12 76Z" fill="#f59e0b" />
      <path d="M38 44Q43 27 58 31Q62 35 64 46Z" fill="#f59e0b" />
      <path d="M46 74Q50 88 64 86Q58 82 58 74Z" fill="#f59e0b" />
      <ellipse cx={53} cy={58} rx={27} ry={19} fill="#fb923c" />
      <path d={FISH_STRIPES[0]} fill="#fde047" stroke="none" />
      <path d={FISH_STRIPES[1]} fill="#fde047" stroke="none" />
      <ellipse cx={53} cy={58} rx={27} ry={19} fill="none" />
      <path d="M53 60Q43 67 45 76Q56 74 62 65Z" fill="#f59e0b" strokeWidth={2.2} />
      <circle cx={69} cy={52} r={7} fill={WHITE} strokeWidth={2.2} />
      <Eye cx={70.5} cy={52.5} r={4} />
      <path d="M71 64.5Q74 67.5 76.5 64.5" fill="none" strokeWidth={2.2} />
      <circle cx={85} cy={45} r={3.5} fill="#e0f2fe" strokeWidth={2.2} />
      <circle cx={88} cy={35} r={2.5} fill="#e0f2fe" strokeWidth={2.2} />
    </Drawing>
  ),

  // Escargot vert olive sur une bande d'herbe : coquille brune en spirale, yeux au bout de tiges.
  snail: () => (
    <Drawing>
      <rect x={5} y={84} width={90} height={7} rx={3.5} fill="#4ade80" />
      <Rope d="M78 44L72 24" color="#a3b83a" width={3} />
      <Rope d="M90 44L94 24" color="#a3b83a" width={3} />
      <path
        d="M6 85C20 80 34 70 50 66C60 63 68 62 70 54C70 44 76 39 84 39C92 39 96 46 96 54C96 62 94 68 93 76C92 82 90 85 84 85Z"
        fill="#a3b83a"
      />
      <path d="M81 59Q87 65 93 58" fill="none" strokeWidth={2.2} />
      <Eye cx={72} cy={21} r={4.8} />
      <Eye cx={94} cy={21} r={4.8} />
      <circle cx={40} cy={52} r={26} fill="#d97706" />
      <path d={SNAIL_SPIRAL} fill="none" stroke="#713f12" />
    </Drawing>
  ),

  // Tortue de profil : carapace verte en dôme à motif d'hexagones, tête, quatre pattes courtes.
  turtle: () => (
    <Drawing>
      <path d="M16 64L2 72L17 76Z" fill="#a3e635" />
      <Leg x={29} y={66} width={12} bottom={86} fill="#84cc16" />
      <Leg x={50} y={66} width={12} bottom={86} fill="#84cc16" />
      <Leg x={14} y={66} width={14} bottom={89} fill="#a3e635" />
      <Leg x={63} y={66} width={14} bottom={89} fill="#a3e635" />
      <circle cx={85} cy={55} r={12} fill="#a3e635" />
      <path d="M14 68A32 38 0 0 1 78 68Z" fill="#16a34a" />
      <path
        d="M56 46L51 37.3H41L36 46L41 54.7H51ZM56 46L72.1 46M51 37.3L54.5 31.4M41 37.3L37.5 31.4M36 46L19.9 46M41 54.7L36.8 62M51 54.7L55.2 62"
        fill="#15803d"
        stroke="#14532d"
      />
      <rect x={12} y={62} width={68} height={12} rx={6} fill="#bef264" />
      <Eye cx={90} cy={51} r={3.8} />
      <path d="M86 61Q90 65 93.5 61.5" fill="none" strokeWidth={2.2} />
    </Drawing>
  ),

  // Voiture bleue de profil : deux vitres, deux roues à enjoliveur, phare jaune.
  car: () => (
    <Drawing>
      <path
        d="M12 80H88Q96 80 96 72V62Q96 56 90 55L72 52L62 33Q60 29 55 29H36Q31 29 29 33L20 52L10 54Q4 56 4 64V72Q4 80 12 80Z"
        fill="#3b82f6"
      />
      <path d="M43 35H36L26 50H43Z" fill="#e0f2fe" strokeWidth={2.2} />
      <path d="M48 35H57L68 50H48Z" fill="#e0f2fe" strokeWidth={2.2} />
      <path d="M46 52V74M51 58H56" fill="none" strokeWidth={2.2} />
      <ellipse cx={90} cy={62} rx={4.2} ry={4.8} fill="#fde047" strokeWidth={2.2} />
      <rect x={3} y={58} width={5} height={8} rx={2.5} fill="#fb923c" strokeWidth={2.2} />
      <path d="M10.5 80A13.5 13.5 0 0 1 37.5 80Z" fill={INK} />
      <path d="M60.5 80A13.5 13.5 0 0 1 87.5 80Z" fill={INK} />
      <circle cx={24} cy={79} r={10.5} fill="#475569" />
      <circle cx={24} cy={79} r={5} fill="#cbd5e1" strokeWidth={2.2} />
      <circle cx={74} cy={79} r={10.5} fill="#475569" />
      <circle cx={74} cy={79} r={5} fill="#cbd5e1" strokeWidth={2.2} />
    </Drawing>
  ),

  // Petite locomotive verte à cheminée sur son rail : cabine, chaudière ronde, grandes roues.
  train: () => (
    <Drawing>
      <rect x={8} y={90} width={10} height={4} rx={1.5} fill="#a16207" strokeWidth={2.2} />
      <rect x={32} y={90} width={10} height={4} rx={1.5} fill="#a16207" strokeWidth={2.2} />
      <rect x={56} y={90} width={10} height={4} rx={1.5} fill="#a16207" strokeWidth={2.2} />
      <rect x={80} y={90} width={10} height={4} rx={1.5} fill="#a16207" strokeWidth={2.2} />
      <rect x={4} y={86.5} width={92} height={4.5} rx={2} fill="#94a3b8" strokeWidth={2.2} />
      <circle cx={75} cy={15} r={4.6} fill={WHITE} strokeWidth={2.2} />
      <circle cx={83.5} cy={10} r={3.4} fill={WHITE} strokeWidth={2.2} />
      <path d="M69 27H79L80 42H68Z" fill="#475569" />
      <rect x={64} y={21} width={20} height={6} rx={3} fill="#475569" />
      <rect x={30} y={40} width={60} height={26} rx={13} fill="#22c55e" />
      <rect x={46} y={40} width={5} height={26} fill="#facc15" strokeWidth={2.2} />
      <rect x={66} y={40} width={5} height={26} fill="#facc15" strokeWidth={2.2} />
      <path d="M48 40C48 30 60 30 60 40Z" fill="#facc15" />
      <circle cx={89} cy={50} r={5} fill="#fde047" strokeWidth={2.2} />
      <rect x={8} y={30} width={28} height={38} fill="#22c55e" />
      <rect x={4} y={22} width={36} height={8} rx={3} fill="#16a34a" />
      <rect x={14} y={36} width={16} height={14} rx={3} fill="#e0f2fe" strokeWidth={2.2} />
      <rect x={6} y={66} width={86} height={5} rx={2} fill="#475569" strokeWidth={2.2} />
      <path d="M87 68L95 86.5H85Z" fill="#facc15" strokeWidth={2.2} />
      <circle cx={77} cy={79} r={7.5} fill="#475569" />
      <circle cx={24} cy={74.5} r={12} fill="#475569" />
      <circle cx={50} cy={74.5} r={12} fill="#475569" />
      <rect x={24} y={72.5} width={26} height={4} rx={2} fill="#facc15" strokeWidth={2.2} />
      <circle cx={24} cy={74.5} r={4.5} fill="#facc15" strokeWidth={2.2} />
      <circle cx={50} cy={74.5} r={4.5} fill="#facc15" strokeWidth={2.2} />
    </Drawing>
  ),

  // Voilier sur les vagues : coque en bois, grande voile blanche, petit foc jaune, fanion.
  boat: () => (
    <Drawing>
      <path d="M5 76Q15 68 27 76T50 76T73 76T95 76V86Q95 94 87 94H13Q5 94 5 86Z" fill="#0ea5e9" />
      <rect x={47} y={10} width={4} height={46} rx={1.5} fill="#713f12" strokeWidth={2.2} />
      <path d="M51 10V20L64 15Z" fill="#fb923c" strokeWidth={2.2} />
      <path d="M45 14V52H14Z" fill={WHITE} />
      <path d="M53 22V52H78Z" fill="#fde047" />
      <path
        d="M8 56H82Q92 54 95 45Q94 68 84 77Q81 80 76 80H26Q20 80 17 76Q10 68 8 56Z"
        fill="#b45309"
      />
      <path d="M10 60H85Q91 59 94 53" fill="none" stroke="#fbbf24" strokeWidth={2.2} />
      <circle cx={36} cy={69} r={3.5} fill="#bae6fd" strokeWidth={2.2} />
      <circle cx={52} cy={69} r={3.5} fill="#bae6fd" strokeWidth={2.2} />
      <path d="M5 84Q15 76 27 84T50 84T73 84T95 84V86Q95 94 87 94H13Q5 94 5 86Z" fill="#38bdf8" />
    </Drawing>
  ),

  // Chaise de cuisine en bois, vue de trois quarts : dossier à traverses, assise, quatre pieds.
  chair: () => (
    <Drawing>
      <rect x={60} y={10} width={9} height={68} rx={3.5} fill="#b45309" />
      <rect x={18} y={10} width={9} height={68} rx={3.5} fill="#b45309" />
      <rect x={18} y={10} width={51} height={13} rx={4} fill="#cf8a3f" />
      <rect x={21} y={28} width={45} height={9} rx={3} fill="#cf8a3f" />
      <path d="M18 46L32 60V68L18 54Z" fill="#9a5416" />
      <path d="M18 46H69L83 60H32Z" fill="#f1c27d" />
      <rect x={32} y={60} width={51} height={8} rx={2} fill="#cf8a3f" />
      <rect x={32} y={68} width={9} height={24} rx={3.5} fill="#b45309" />
      <rect x={74} y={68} width={9} height={24} rx={3.5} fill="#b45309" />
    </Drawing>
  ),

  // Chaumière de face : murs jaunes, toit vert sombre, porte brune, deux fenêtres à croisillon.
  house: () => (
    <Drawing>
      <rect x={66} y={14} width={10} height={26} fill="#94a3b8" />
      <rect x={64} y={11} width={14} height={5} rx={2} fill="#cbd5e1" />
      <rect x={16} y={44} width={68} height={46} fill="#fde68a" />
      <path d="M6 50L50 12L94 50Z" fill="#0f766e" />
      <path d="M41 90V70A9 9 0 0 1 59 70V90Z" fill="#b45309" />
      <circle cx={55} cy={79} r={2} fill="#facc15" stroke="none" />
      <rect x={21} y={58} width={15} height={15} fill="#bae6fd" />
      <path d="M28.5 58V73M21 65.5H36" fill="none" strokeWidth={2.2} />
      <rect x={64} y={58} width={15} height={15} fill="#bae6fd" />
      <path d="M71.5 58V73M64 65.5H79" fill="none" strokeWidth={2.2} />
      <path d="M4 92L6 84L10 90L13 83L16 91L19 92Z" fill="#16a34a" strokeWidth={2.2} />
      <path d="M81 92L84 91L87 83L90 90L94 84L96 92Z" fill="#16a34a" strokeWidth={2.2} />
    </Drawing>
  ),

  // Arbre fruitier : couronne de quatre boules vertes, tronc brun, fruits orange, touffes d'herbe.
  tree: () => (
    <Drawing>
      <path d="M38 92C45 88 44 78 44 56H56C56 78 55 88 62 92Z" fill="#a16207" />
      {/* Couronne : contour de 6 derrière, aplats par-dessus (seul le contour extérieur reste) */}
      <g fill="#22c55e" strokeWidth={6}>
        <circle cx={31} cy={42} r={17} />
        <circle cx={69} cy={42} r={17} />
        <circle cx={50} cy={24} r={18} />
        <circle cx={50} cy={46} r={19} />
      </g>
      <g fill="#22c55e" stroke="none">
        <circle cx={31} cy={42} r={17} />
        <circle cx={69} cy={42} r={17} />
        <circle cx={50} cy={24} r={18} />
        <circle cx={50} cy={46} r={19} />
      </g>
      <path d="M38 15Q42 10 48 9M20 36Q22 31 26 29" fill="none" stroke="#86efac" strokeWidth={3} />
      <circle cx={38} cy={50} r={4.5} fill="#fb923c" strokeWidth={2.2} />
      <circle cx={62} cy={32} r={4.5} fill="#fde047" strokeWidth={2.2} />
      <circle cx={64} cy={54} r={4.5} fill="#fb923c" strokeWidth={2.2} />
      <path d="M26 93L28 83L33 90L37 81L41 91L45 93Z" fill="#16a34a" strokeWidth={2.2} />
      <path d="M60 93L63 84L67 90L71 82L74 92L78 93Z" fill="#16a34a" strokeWidth={2.2} />
    </Drawing>
  ),
};
