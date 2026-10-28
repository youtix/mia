/**
 * Indicateur de focus haute visibilité (FEAT-03 §3.2), repérable à 3 mètres sur un téléviseur :
 * anneau lumineux, léger zoom et halo. `z-10` fait passer l'élément zoomé devant ses voisins.
 */
export const FOCUSED_CLASSES =
  'z-10 scale-[1.04] shadow-lg ring-4 shadow-sky-500/30 ring-sky-400 ring-offset-2 ring-offset-slate-950';

/** Même indicateur pour la navigation clavier native (Tab), l'anneau remplaçant l'`outline`. */
export const FOCUS_VISIBLE_CLASSES =
  'focus-visible:z-10 focus-visible:scale-[1.04] focus-visible:shadow-lg focus-visible:ring-4 focus-visible:shadow-sky-500/30 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus-visible:outline-hidden';

/** Transition de l'anneau et du zoom, coupée si le système demande de réduire les animations. */
export const FOCUS_TRANSITION_CLASSES =
  'motion-safe:transition motion-safe:duration-150 motion-safe:ease-out';
