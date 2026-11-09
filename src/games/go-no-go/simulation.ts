import type { Rng } from '@/games/memory/random';
import {
  createGoNoGoGame,
  getShownLimit,
  resolveAppearance,
  startAppearance,
  TRAP_FREE_APPEARANCES,
} from './engine';
import type { GoNoGoLevelConfig, GoNoGoState, OnStage, Presentation } from './types';

/**
 * Enfants simulés (FEAT-28 §10) : la terminaison d'une étoile se vérifie en la jouant, avec le moteur
 * seul et sans minuterie, par des enfants aux gestes très différents. Le validateur du catalogue
 * (`validate:levels`) exige que les quatre premiers terminent chaque étoile, et les tests que les
 * deux derniers n'y arrivent jamais : rester passive, ou taper sur tout, ne mène nulle part (§3.3).
 */
export type ChildProfile =
  'attentive' | 'reflex' | 'passive' | 'alternating' | 'tapper' | 'sleeper';

/** Les enfants qui doivent finir toute étoile. */
export const WINNING_PROFILES: readonly ChildProfile[] = [
  'attentive',
  'reflex',
  'passive',
  'alternating',
];

/**
 * Temps d'un appui réfléchi sur une cible, d'un réflexe, et de celui qui tape sans arrêt (en ms). Ce
 * dernier tape juste après le plancher du STOP tardif (100 ms) : un appui plus rapide que lui attrape
 * la cible sans erreur (§4.3), aucune enfant ne tape pourtant si vite après l'entrée.
 */
const THOUGHTFUL_PRESS_MS = 500;
const REFLEX_PRESS_MS = 200;
const TAPPER_PRESS_MS = 120;

type PressPolicy = (onStage: OnStage, state: GoNoGoState) => number | null;

/** Ne jamais dépasser la fenêtre : un appui à `atMs`, ou juste avant la fin si elle est plus courte. */
function pressWithin(presentation: Presentation, atMs: number): number {
  return presentation.windowMs === null ? atMs : Math.min(atMs, presentation.windowMs - 1);
}

const POLICIES: Readonly<Record<ChildProfile, PressPolicy>> = {
  // Appuie sur chaque cible, se retient devant chaque piège et chaque STOP : l'étoile parfaite.
  attentive: ({ appearance, presentation }) =>
    appearance.kind === 'target' ? pressWithin(presentation, THOUGHTFUL_PRESS_MS) : null,
  // Tape sur tout, sans réfléchir, jusqu'à ce que l'indice le plus fort (signe « non », STOP presque
  // immédiat) lui fasse retenir son geste.
  reflex: ({ appearance, presentation }) => {
    if (appearance.kind !== 'target' && presentation.help === 3) return null;
    return pressWithin(presentation, REFLEX_PRESS_MS);
  },
  // N'appuie jamais, sauf sur une cible qui attend sans limite de temps (échelon 3).
  passive: ({ presentation }) => (presentation.windowMs === null ? THOUGHTFUL_PRESS_MS : null),
  // Une apparition sur deux : appui, puis abstention ; une cible qui attend est toujours attrapée.
  alternating: ({ presentation }, state) => {
    if (presentation.windowMs === null) return THOUGHTFUL_PRESS_MS;
    return state.shown % 2 === 1 ? pressWithin(presentation, THOUGHTFUL_PRESS_MS) : null;
  },
  // Tape sans arrêt, même devant le signe « non » : chaque piège lui coûte une pause.
  tapper: ({ presentation }) => pressWithin(presentation, TAPPER_PRESS_MS),
  // Ne tape jamais, même quand la cible l'attend.
  sleeper: () => null,
};

export interface SimulationResult {
  /** `won` : étoile gagnée ; `stalled` : une cible attend et l'enfant n'appuie pas ; `capped` : trop d'apparitions */
  status: 'won' | 'stalled' | 'capped';
  state: GoNoGoState;
}

/** Apparitions au-delà desquelles une étoile est tenue pour sans fin : le garde-fou, puis chaque apparition remise trois fois. */
export function getShownCap(appearances: number): number {
  return getShownLimit(appearances) + 4 * appearances + TRAP_FREE_APPEARANCES;
}

/**
 * Joue une étoile avec le moteur seul : chaque apparition entre, l'enfant appuie (ou non) selon son
 * profil, et l'issue est résolue. Reproductible avec un `rng` à graine. Une file vide avant la victoire
 * est un moteur cassé, pas une étoile sans fin : elle lève une `Error`.
 */
export function simulateStar(
  config: GoNoGoLevelConfig,
  profile: ChildProfile,
  rng: Rng,
): SimulationResult {
  const policy = POLICIES[profile];
  const cap = getShownCap(config.appearances);
  let state = createGoNoGoGame(config, rng);
  while (state.status !== 'won') {
    if (state.shown >= cap) return { status: 'capped', state };
    state = startAppearance(state);
    const { onStage } = state;
    if (!onStage) throw new Error('Pas si vite ! : file vide avant la victoire');
    const resolved = resolveAppearance(state, policy(onStage, state), rng);
    // Rien ne s'est passé : la cible attend et personne n'appuie.
    if (resolved === state) return { status: 'stalled', state };
    state = resolved;
  }
  return { status: 'won', state };
}
