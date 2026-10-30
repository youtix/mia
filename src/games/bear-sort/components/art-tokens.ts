import type { BearColor, SortFeature } from '../types';

/**
 * Jetons des dessins d'Attrape-Piège (FEAT-24). Bleu et jaune restent distincts pour un daltonien
 * rouge-vert et sur le fond ardoise sombre. Le rouge n'apparaît nulle part ici : il est réservé au
 * panneau STOP, car il ne doit jamais vouloir dire autre chose que « stop ».
 */

/** Tons d'un dessin : corps, ombre (lattes, montants), clair (museau, rebord), contour. */
export interface ArtPalette {
  body: string;
  shade: string;
  light: string;
  outline: string;
}

const BLUE_PALETTE: ArtPalette = {
  body: '#3b82f6',
  shade: '#2563eb',
  light: '#bfdbfe',
  outline: '#1e3a8a',
};

const YELLOW_PALETTE: ArtPalette = {
  body: '#facc15',
  shade: '#eab308',
  light: '#fef3c7',
  outline: '#854d0e',
};

/** Tons ardoise : couleur estompée (échelon 2 des indices), et boîte ouverte de la règle « sauf ». */
export const GREY_PALETTE: ArtPalette = {
  body: '#94a3b8',
  shade: '#64748b',
  light: '#e2e8f0',
  outline: '#334155',
};

/** Palette d'un ours ou d'une boîte : grise si la couleur est le critère estompé. */
export function getArtPalette(color: BearColor, fadedFeature: SortFeature | null): ArtPalette {
  if (fadedFeature === 'color') return GREY_PALETTE;
  return color === 'blue' ? BLUE_PALETTE : YELLOW_PALETTE;
}

/** Encre des yeux, du nez, du contour du signe « non » : lisible sur toutes les teintes. */
export const INK = '#0f172a';

/** Intérieur d'une boîte, vu par son ouverture. */
export const BOX_INSIDE = '#1e293b';

/** Halo de la bonne boîte : vert très pâle, jamais rouge. */
export const GLOW_COLOR = '#dcfce7';

/**
 * Transition d'échelle du dessin, et de couleur de ses formes (filles directes uniquement : une
 * couleur héritée d'un parent lui-même en transition repartirait de zéro à chaque image).
 */
export const FADE_TRANSITION_CLASSES =
  'motion-safe:transition-transform motion-safe:duration-400 motion-safe:ease-out motion-safe:[&>*]:transition-colors motion-safe:[&>*]:duration-400 motion-safe:[&>*]:ease-out';

/**
 * Précédence des `<style>` hissés dans le `<head>` par les dessins (dédupliqués par leur `href`) :
 * les images clés d'Attrape-Piège restent ainsi avec lui, sans toucher à la feuille globale.
 */
export const ART_STYLE_PRECEDENCE = 'bear-sort-art';

/** Battement doux partagé par le panneau STOP et l'image de la règle. */
export const PULSE_STYLE_ID = 'bear-sort-pulse';
export const PULSE_KEYFRAMES =
  '@keyframes bear-sort-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}';
export const PULSE_CLASSES = 'motion-safe:animate-[bear-sort-pulse_1.6s_ease-in-out_infinite]';
