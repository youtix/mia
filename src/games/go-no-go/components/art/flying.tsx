import type { ReactNode } from 'react';
import type { FlyingImageId } from '../../types';
import { ART_STROKE, ART_STROKE_WIDTH, ART_INK as OUTLINE } from '../art-tokens';

/**
 * Ce qui vole vraiment (règles 2 et 3). Aplats sans dégradé ni filtre, contour ardoise arrondi,
 * viewBox 100 × 100. Aucun rouge : cette teinte est réservée au panneau STOP.
 */

const WHITE = '#ffffff';

/** Réduction de 5 % qui laisse de l'air autour de l'image. */
const FRAME_SCALE = 0.95;

/**
 * Style commun : le contour de tous les dessins (`ART_STROKE`), chaque forme porte son propre aplat. Le
 * dessin est cadré : `center` est le centre de sa boîte visible (contour compris), ramené au centre de
 * la boîte, puis le tout est réduit de 5 % pour laisser un peu d'air (les images qui volent restent
 * centrées). Le trait est grossi d'autant : à l'écran, il est exactement celui des images qui ne volent
 * pas, rien ne les distingue que l'image.
 */
function Ink({ center, children }: { center: readonly [number, number]; children: ReactNode }) {
  const [cx, cy] = center;
  return (
    <g
      transform={`translate(50 50) scale(${String(FRAME_SCALE)}) translate(${String(-cx)} ${String(-cy)})`}
      {...ART_STROKE}
      strokeWidth={ART_STROKE_WIDTH / FRAME_SCALE}
    >
      {children}
    </g>
  );
}

/** Pigeon gris-bleu en vol, de profil, tourné vers la droite : aile levée, queue en éventail. */
function Pigeon() {
  const body = '#94a3b8';
  const belly = '#cbd5e1';
  const wing = '#64748b';
  const wingDark = '#475569';
  // Silhouette de la tête et du corps : le dos et le ventre la partagent.
  const silhouette =
    'M22 66C22 60 30 52 42 46C48 43 54 40 58 36C60 32 62 30 64 28C68 23 77 23 82 29C86 34 86 42 83 46C89 52 90 64 80 74C72 84 54 86 42 82C30 80 22 74 22 66Z';
  return (
    <Ink center={[51.6, 45.6]}>
      {/* Queue en éventail, derrière le corps : trois plumes à bout rond */}
      <g fill="none" strokeLinecap="round">
        <path d="M34 61L15 53M34 66L11 66M34 71L15 79" strokeWidth={14} />
        <path d="M34 61L15 53M34 66L11 66M34 71L15 79" stroke={wing} strokeWidth={8} />
      </g>
      {/* Bec */}
      <path d="M82 33C89 34 95 37 98 42C92 45 87 46 82 45Z" fill="#fbbf24" strokeWidth={2.6} />
      {/* Corps et tête : ventre clair, dos gris-bleu */}
      <path d={silhouette} fill={belly} stroke="none" />
      <path
        d="M22 66C22 60 30 52 42 46C48 43 54 40 58 36C60 32 62 30 64 28C68 23 77 23 82 29C86 34 86 42 83 46C70 56 40 66 22 66Z"
        fill={body}
        stroke="none"
      />
      {/* Reflets du cou : vert et violet */}
      <g stroke="none">
        <ellipse
          cx={72.5}
          cy={48.5}
          rx={5.8}
          ry={3.2}
          fill="#2dd4bf"
          transform="rotate(30 72.5 48.5)"
        />
        <ellipse
          cx={77.5}
          cy={52}
          rx={4.8}
          ry={2.8}
          fill="#a78bfa"
          transform="rotate(30 77.5 52)"
        />
      </g>
      <path d={silhouette} fill="none" />
      {/* Aile levée, plumes en éventail */}
      <path
        d="M66 52C66 34 50 14 28 7C23 6 21 11 25 14C19 17 19 23 25 25C20 29 21 35 27 36C23 40 26 46 33 47C36 52 38 56 42 58C50 62 62 60 66 52Z"
        fill={wing}
      />
      <path
        d="M25 14L38 21M25 25L41 31M27 36L44 41M33 47L46 51"
        fill="none"
        stroke={wingDark}
        strokeWidth={2.2}
      />
      {/* Oeil */}
      <circle cx={76} cy={35} r={5.4} fill="#fb923c" stroke="none" />
      <circle cx={76} cy={35} r={3.6} fill={OUTLINE} stroke="none" />
      <circle cx={77.4} cy={33.6} r={1.3} fill={WHITE} stroke="none" />
    </Ink>
  );
}

/** Avion de ligne de profil, tourné vers la droite : fuselage blanc, ailes et dérive bleues. */
function Plane() {
  const blue = '#3b82f6';
  const blueDark = '#2563eb';
  const glass = '#38bdf8';
  return (
    <Ink center={[51, 52.5]}>
      {/* Dérive et stabilisateur, derrière le fuselage */}
      <path d="M38 46L20 15L8 15L6 40Z" fill={blue} />
      <path d="M26 52L11 47L6 62L17 62Z" fill={blueDark} />
      {/* Fuselage */}
      <path
        d="M6 36C12 40 22 42 34 42L70 42C86 42 96 49 96 54C96 60 86 64 70 64L34 64C20 64 10 50 6 44Z"
        fill={WHITE}
      />
      {/* Aile proche */}
      <path d="M72 58L50 90L36 90L54 58Z" fill={blue} />
      {/* Hublots et cockpit */}
      <g fill={glass} strokeWidth={2.2}>
        <circle cx={30} cy={51} r={3.2} />
        <circle cx={40} cy={51} r={3.2} />
        <circle cx={50} cy={51} r={3.2} />
        <circle cx={60} cy={51} r={3.2} />
        <path d="M76 46H86C90 47 92 50 92 53H76Z" />
      </g>
    </Ink>
  );
}

/** Hélicoptère de profil, tourné vers la droite : cabine ronde, poutre de queue, rotors, patins. */
function Helicopter() {
  const body = '#fbbf24';
  const bodyDark = '#f59e0b';
  const metal = '#94a3b8';
  const glass = '#7dd3fc';
  const cabin =
    'M30 52C30 38 44 32 60 32C78 32 92 42 92 56C92 70 80 78 62 78L44 78C34 78 30 66 30 52Z';
  return (
    <Ink center={[48, 54.2]}>
      {/* Rotor principal et mât */}
      <rect x={46} y={18} width={8} height={16} fill={metal} />
      <path d="M10 20Q51 11 92 20Q51 25 10 20Z" fill="#475569" />
      {/* Dérive, poutre de queue et rotor arrière */}
      <path d="M8 47L4.5 28C4 25.5 8 25 9.5 27L21 47Z" fill={bodyDark} />
      <path d="M34 46L12 42C9 42 8 44 8 46C8 49 10 51 12 51L34 60Z" fill={body} />
      <circle cx={9} cy={31} r={5.4} fill="#cbd5e1" strokeWidth={2.2} />
      <circle cx={9} cy={31} r={1.5} fill={OUTLINE} stroke="none" />
      {/* Patins */}
      <path d="M46 78L44 90M74 78L76 90" fill="none" />
      <rect x={34} y={88} width={58} height={5} rx={2.5} fill={metal} />
      {/* Cabine, bandeau du bas et vitre */}
      <path d={cabin} fill={body} />
      <path
        d="M90.6 63.7C87 72.9 76.4 78 62 78L44 78C37 78 32.9 72.1 31.3 63.7Z"
        fill={bodyDark}
        stroke="none"
      />
      <path d={cabin} fill="none" />
      <path d="M60 42H74C80 42 86 46 87 54H60Z" fill={glass} strokeWidth={2.2} />
    </Ink>
  );
}

/** Papillon vu de face : quatre grandes ailes violettes et orange, corps sombre, antennes. */
function Butterfly() {
  const purple = '#8b5cf6';
  const orange = '#fb923c';
  const yellow = '#fde047';
  const bodyColor = '#334155';
  return (
    <Ink center={[50, 45.6]}>
      {/* Antennes */}
      <path d="M47 27C44 16 40 10 33 6M53 27C56 16 60 10 67 6" fill="none" strokeWidth={2.6} />
      <circle cx={33} cy={6} r={2.8} fill={bodyColor} />
      <circle cx={67} cy={6} r={2.8} fill={bodyColor} />
      {/* Ailes basses */}
      <path d="M47 52C38 50 22 52 18 64C14 76 22 90 34 88C44 86 48 72 47 60Z" fill={orange} />
      <path d="M53 52C62 50 78 52 82 64C86 76 78 90 66 88C56 86 52 72 53 60Z" fill={orange} />
      <g stroke="none">
        <circle cx={32} cy={72} r={6.5} fill={purple} />
        <circle cx={68} cy={72} r={6.5} fill={purple} />
        <circle cx={32} cy={72} r={2.6} fill={yellow} />
        <circle cx={68} cy={72} r={2.6} fill={yellow} />
      </g>
      {/* Ailes hautes */}
      <path
        d="M47 44C40 22 24 8 10 14C0 20 2 38 12 46C18 50 28 52 36 50C42 48 46 46 47 44Z"
        fill={purple}
      />
      <path
        d="M53 44C60 22 76 8 90 14C100 20 98 38 88 46C82 50 72 52 64 50C58 48 54 46 53 44Z"
        fill={purple}
      />
      <g stroke="none">
        <circle cx={24} cy={32} r={9} fill={orange} />
        <circle cx={76} cy={32} r={9} fill={orange} />
        <circle cx={24} cy={32} r={4} fill={yellow} />
        <circle cx={76} cy={32} r={4} fill={yellow} />
      </g>
      {/* Corps et tête */}
      <ellipse cx={50} cy={56} rx={4.5} ry={22} fill={bodyColor} />
      <circle cx={50} cy={31} r={7} fill={bodyColor} />
      <g stroke="none" fill={WHITE}>
        <circle cx={47.4} cy={30} r={1.8} />
        <circle cx={52.6} cy={30} r={1.8} />
      </g>
    </Ink>
  );
}

/** Abeille rayée jaune et noir : ailes bleu clair translucides, dard, antennes, visage souriant. */
function Bee() {
  const yellow = '#facc15';
  const wing = '#e0f2fe';
  return (
    <Ink center={[48, 52.5]}>
      {/* Ailes translucides, rejetées vers l'arrière */}
      <ellipse
        cx={22}
        cy={34}
        rx={10}
        ry={16.5}
        fill={wing}
        fillOpacity={0.8}
        transform="rotate(-30 22 34)"
      />
      <ellipse
        cx={43}
        cy={29}
        rx={10}
        ry={16}
        fill={wing}
        fillOpacity={0.8}
        transform="rotate(4 43 29)"
      />
      {/* Pattes */}
      <path d="M28 84L26 91M42 85L42 92M56 83L59 90" fill="none" />
      {/* Dard */}
      <path d="M14 56L2 62L14 68Z" fill={OUTLINE} />
      {/* Corps : trois bandes noires découpées dans l'ellipse */}
      <ellipse cx={42} cy={62} rx={30} ry={23} fill={yellow} />
      <g fill={OUTLINE} stroke="none">
        <path d="M20 46.36A30 23 0 0 1 28 41.66L28 82.34A30 23 0 0 1 20 77.64Z" />
        <path d="M34 39.83A30 23 0 0 1 42 39L42 85A30 23 0 0 1 34 84.17Z" />
        <path d="M48 39.46A30 23 0 0 1 56 41.66L56 82.34A30 23 0 0 1 48 84.54Z" />
      </g>
      <ellipse cx={42} cy={62} rx={30} ry={23} fill="none" />
      {/* Antennes */}
      <path d="M69 43C68 35 66 29 62 24M80 43C82 35 85 29 91 25" fill="none" strokeWidth={2.6} />
      <circle cx={62} cy={24} r={3} fill={OUTLINE} />
      <circle cx={91} cy={25} r={3} fill={OUTLINE} />
      {/* Tête et visage */}
      <circle cx={74} cy={58} r={17} fill={yellow} />
      <g stroke="none">
        <circle cx={68} cy={54} r={4} fill={OUTLINE} />
        <circle cx={81} cy={54} r={4} fill={OUTLINE} />
        <circle cx={69.3} cy={52.7} r={1.3} fill={WHITE} />
        <circle cx={82.3} cy={52.7} r={1.3} fill={WHITE} />
      </g>
      <path d="M69 63Q74.5 69 80 63" fill="none" strokeWidth={2.6} />
    </Ink>
  );
}

/** Fusée penchée d'environ 20° vers la droite : corps blanc, nez bleu, deux ailerons, flamme. */
function Rocket() {
  const blue = '#3b82f6';
  return (
    <Ink center={[40.5, 51.5]}>
      <g transform="rotate(20 50 51)">
        {/* Flamme */}
        <path d="M39 76C36 88 45 95 50 99C55 95 64 88 61 76Z" fill="#fb923c" />
        <path d="M44 76C43 84 47 90 50 94C53 90 57 84 56 76Z" fill="#fde047" stroke="none" />
        {/* Ailerons */}
        <path d="M34 54C26 58 18 68 16 82C24 80 30 76 34 74Z" fill={blue} />
        <path d="M66 54C74 58 82 68 84 82C76 80 70 76 66 74Z" fill={blue} />
        {/* Corps */}
        <path d="M34 30L34 70L66 70L66 30Z" fill={WHITE} />
        <path d="M34 59H66V65H34Z" fill={blue} />
        <path d="M34 30C34 20 43 10 50 4C57 10 66 20 66 30Z" fill={blue} />
        {/* Tuyère */}
        <path d="M41 70L59 70L62 78L38 78Z" fill="#64748b" />
        {/* Hublot */}
        <circle cx={50} cy={45} r={10} fill="#94a3b8" />
        <circle cx={50} cy={45} r={7} fill="#7dd3fc" strokeWidth={2.2} />
      </g>
    </Ink>
  );
}

export const FLYING_ART: Record<FlyingImageId, () => ReactNode> = {
  pigeon: Pigeon,
  plane: Plane,
  helicopter: Helicopter,
  butterfly: Butterfly,
  bee: Bee,
  rocket: Rocket,
};
