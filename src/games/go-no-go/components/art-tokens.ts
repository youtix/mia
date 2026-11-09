/**
 * Jetons des dessins de Pas si vite ! (FEAT-28). Le rouge n'apparaît nulle part ici : il est réservé
 * au panneau STOP (celui d'Attrape-Piège), car il ne doit jamais vouloir dire autre chose que « stop ».
 * Le buzzer n'est donc jamais rouge, contrairement aux buzzers de jeux télévisés.
 */

/** Précédence des `<style>` hissés dans le `<head>` (dédupliqués par leur `href`). */
export const ART_STYLE_PRECEDENCE = 'go-no-go-art';
export const ART_STYLE_ID = 'go-no-go-keyframes';

/** Ciel de la scène : clair, pour que la chouette violette, le renard et les images ressortent. */
export const SKY_TOP = '#7dd3fc';
export const SKY_BOTTOM = '#e0f2fe';

/** Collines (règles 2 et 3), au premier et au second plan. */
export const HILL_FRONT = '#4ade80';
export const HILL_BACK = '#86efac';
export const HILL_OUTLINE = '#166534';

/** Castelet (règle 1) : bois brun, auvent rayé bleu et crème. */
export const WOOD = '#b45309';
export const WOOD_DARK = '#78350f';
export const AWNING_BLUE = '#38bdf8';
export const AWNING_CREAM = '#fef3c7';
/** Fond des fenêtres : un bleu-vert profond, que ni les contours sombres du renard et du chat, ni le violet de la chouette ne confondent avec lui. */
export const WINDOW_INSIDE = '#115e59';

/** Buzzer : turquoise vif, ni rouge, ni vert d'une colline, ni bleu du ciel. */
export const BUZZER_BODY = '#22d3ee';
export const BUZZER_LIGHT = '#a5f3fc';
export const BUZZER_SHADE = '#0891b2';
export const BUZZER_EDGE = '#164e63';
export const BUZZER_GREY_BODY = '#94a3b8';
export const BUZZER_GREY_LIGHT = '#cbd5e1';
export const BUZZER_GREY_SHADE = '#64748b';
export const BUZZER_GREY_EDGE = '#334155';

/** Perles de la guirlande : allumées, dorées ; éteintes, un simple contour. */
export const PEARL_LIT = '#fbbf24';

/**
 * Contour de tous les dessins, cibles comme pièges, personnages comme images : un seul trait, pour
 * qu'aucun contour ne trahisse la réponse (seule l'image décide, §3.1). Chaque dessin l'hérite de son
 * groupe racine.
 */
export const ART_INK = '#1e293b';
export const ART_STROKE_WIDTH = 3;
export const ART_STROKE = {
  stroke: ART_INK,
  strokeWidth: ART_STROKE_WIDTH,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
} as const;

/**
 * Images clés du jeu. Chaque élément animé porte la classe du nom de son animation (la durée, qui
 * varie, reste dans son style en ligne) : c'est elle que visent les animations réduites. L'entrée est
 * identique pour toutes les apparitions, et plus lente sous l'aide ou en démo. `transform` et
 * `opacity` seulement : les animations doivent tenir 60 images par seconde sur un boîtier Android TV
 * modeste. Animations réduites : tout devient un fondu, et le gag une pose fixe qui s'efface (§8.3) ;
 * ce qui ne fait que bouger (le buzzer qui pulse, la perle qui gonfle) reste immobile, et les
 * étincelles disparaissent.
 */
export const GO_NO_GO_KEYFRAMES = [
  // Entrée : la même pour toutes (derrière une colline, ou au fond d'une cachette).
  '@keyframes gng-rise{from{transform:translateY(105%)}to{transform:translateY(0)}}',
  '@keyframes gng-fade-in{from{opacity:0}to{opacity:1}}',
  // Attrapée : la chouette saute de joie et replonge ; une image s'envoie en l'air.
  '@keyframes gng-hoot{0%{transform:translateY(0) scale(1)}35%{transform:translateY(-9%) scale(1.07)}100%{transform:translateY(105%) scale(1)}}',
  '@keyframes gng-fly-away{0%{transform:translate(0,0) scale(1) rotate(0);opacity:1}100%{transform:translate(38%,-80%) scale(.5) rotate(14deg);opacity:0}}',
  // Ratée : elle s'en va doucement.
  '@keyframes gng-sink{from{transform:translateY(0);opacity:1}to{transform:translateY(105%);opacity:1}}',
  // Gag d'un piège laissé passer : le renard boude et redescend ; l'image qui ne vole pas tente de
  // s'envoler quand même, retombe sur son derrière et s'en va.
  '@keyframes gng-sulk{0%{transform:translateY(0) rotate(0)}18%{transform:translateY(0) rotate(-6deg)}38%{transform:translateY(2%) rotate(5deg)}100%{transform:translateY(105%) rotate(0)}}',
  '@keyframes gng-try-fly{0%{transform:translateY(0) rotate(0)}18%{transform:translateY(-26%) rotate(-9deg)}34%{transform:translateY(-8%) rotate(7deg)}50%{transform:translateY(-20%) rotate(-7deg)}68%{transform:translateY(6%) rotate(16deg) scale(1.04,.92)}82%{transform:translateY(4%) rotate(14deg) scale(1,1)}100%{transform:translate(34%,4%) rotate(14deg);opacity:0}}',
  // STOP tardif : l'oiseau se fige comme une statue, vacille, puis repart.
  '@keyframes gng-statue{0%{transform:translate(0,0) rotate(0)}22%{transform:translate(0,0) rotate(0)}34%{transform:translate(-2%,0) rotate(-4deg)}46%{transform:translate(2%,0) rotate(4deg)}58%{transform:translate(-1%,0) rotate(-2deg)}70%{transform:translate(0,0) rotate(0)}100%{transform:translate(30%,-70%) scale(.6);opacity:0}}',
  '@keyframes gng-ice{0%{opacity:0}18%{opacity:.62}68%{opacity:.62}100%{opacity:0}}',
  // Fondu de sortie, pour les animations réduites.
  '@keyframes gng-fade-out{from{opacity:1}to{opacity:0}}',
  // Le signal : les bras se lèvent et battent, identiques pour tous les personnages.
  '@keyframes gng-wave-left{0%,100%{transform:rotate(0)}50%{transform:rotate(70deg)}}',
  '@keyframes gng-wave-right{0%,100%{transform:rotate(0)}50%{transform:rotate(-70deg)}}',
  // Étincelles de la chouette qui replonge.
  '@keyframes gng-spark{0%{transform:translate(0,0) scale(.3);opacity:0}25%{opacity:1}100%{transform:translate(var(--gng-dx),var(--gng-dy)) scale(1);opacity:0}}',
  // Panneau STOP qui surgit, buzzer qui attend, main qui tape ou se fige en l'air, perle qui s'allume.
  '@keyframes gng-stop-pop{0%{transform:scale(.2);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1}}',
  '@keyframes gng-buzzer-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}',
  '@keyframes gng-hand-tap{0%{transform:translate(0,95%);opacity:0}20%{transform:translate(0,45%);opacity:1}38%{transform:translate(0,32%) scale(.92)}52%{transform:translate(0,45%) scale(1)}100%{transform:translate(0,45%);opacity:0}}',
  '@keyframes gng-hand-freeze{0%{transform:translate(0,95%);opacity:0}30%{transform:translate(0,50%);opacity:1}100%{transform:translate(0,38%);opacity:1}}',
  '@keyframes gng-pearl{0%{transform:scale(.4)}60%{transform:scale(1.35)}100%{transform:scale(1)}}',
  // Le signal des personnages du castelet : les bras battent pendant que le personnage attend.
  '.gng-signal .go-no-go-arm-left{animation:gng-wave-left .55s ease-in-out infinite}.gng-signal .go-no-go-arm-right{animation:gng-wave-right .55s ease-in-out infinite}',
  // Animations réduites : plus de déplacement, des fondus (l'entrée en fondu, chaque sortie en fondu : un
  // même nom d'animation pour l'entrée et la sortie ne la relancerait pas) ; le signal et le gag
  // deviennent des poses fixes (bras levés), et la main fantôme s'affiche sans bouger. Les étincelles,
  // qui ne sont qu'un mouvement, ne s'affichent pas : immobiles, elles se superposeraient en un disque.
  '@media (prefers-reduced-motion:reduce){.gng-rise{animation-name:gng-fade-in !important;animation-duration:.25s !important}.gng-hoot,.gng-fly-away,.gng-sink,.gng-sulk,.gng-try-fly,.gng-statue{animation-name:gng-fade-out !important;animation-duration:.4s !important}.gng-spark{animation:none !important;display:none}.gng-buzzer-pulse,.gng-pearl{animation:none !important}.gng-signal .go-no-go-arm-left{animation:none !important;transform:rotate(70deg)}.gng-signal .go-no-go-arm-right{animation:none !important;transform:rotate(-70deg)}.gng-stop-pop{animation-name:gng-fade-in !important;animation-duration:.2s !important}.gng-hand-tap,.gng-hand-freeze{animation-name:gng-fade-in !important;animation-duration:.4s !important;animation-iteration-count:1 !important}}',
].join('');
