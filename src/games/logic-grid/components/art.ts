import type { PieceColor, PieceShape } from '../types';

/**
 * Dessin des pièces de Chacun sa Place (FEAT-27). Trois couleurs aussi distinctes en luminosité
 * qu'en teinte : rouge sombre, bleu moyen, jaune clair. Un enfant daltonien les sépare encore, et une
 * capture en niveaux de gris aussi (rouge L* ≈ 48, bleu ≈ 67, jaune ≈ 84).
 */
export const PIECE_FILLS: Readonly<Record<PieceColor, string>> = {
  red: '#dc2626',
  yellow: '#facc15',
  blue: '#60a5fa',
};

/** Contour sombre de chaque pièce : net sur le fond ardoise comme sur une case éclairée. */
export const PIECE_OUTLINE = '#0f172a';

/** Tracé de chaque forme dans un carré de 100 × 100. */
export const SHAPE_PATHS: Readonly<Record<PieceShape, string>> = {
  circle: 'M50 12a38 38 0 1 1 0 76a38 38 0 1 1 0-76Z',
  square: 'M22 14H78A8 8 0 0 1 86 22V78A8 8 0 0 1 78 86H22A8 8 0 0 1 14 78V22A8 8 0 0 1 22 14Z',
  triangle: 'M50 12L90 84H10Z',
};

/** Croix des cartes barrées : rose vif bordé de sombre, lisible sur une case claire ou sombre. */
export const CROSS_COLOR = '#fb7185';
