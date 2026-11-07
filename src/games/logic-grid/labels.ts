import { getPieceColor, getPieceShape } from './grid';
import type { Clue, ClueSubject, ClueZone, PieceColor, PieceId, PieceShape } from './types';

/**
 * Textes de Chacun sa Place (FEAT-27) : tous vocalisés par les lecteurs d'écran, aucun n'est affiché,
 * l'enfant ne sait peut-être pas lire. Les trois formes sont du masculin : « le rond », « du carré ».
 */

const SHAPE_NAMES: Readonly<Record<PieceShape, string>> = {
  circle: 'rond',
  square: 'carré',
  triangle: 'triangle',
};

const SHAPE_PLURALS: Readonly<Record<PieceShape, string>> = {
  circle: 'ronds',
  square: 'carrés',
  triangle: 'triangles',
};

/** Couleur d'une forme (masculin). */
const COLOR_NAMES: Readonly<Record<PieceColor, string>> = {
  red: 'rouge',
  yellow: 'jaune',
  blue: 'bleu',
};

/** Couleur d'une pièce (féminin : « une pièce bleue »). */
const COLOR_FEMININE: Readonly<Record<PieceColor, string>> = {
  red: 'rouge',
  yellow: 'jaune',
  blue: 'bleue',
};

const ROW_NAMES = ['du haut', 'du milieu', 'du bas'] as const;
const COL_NAMES = ['de gauche', 'du milieu', 'de droite'] as const;

/** Position d'une case, de « en haut à gauche » à « en bas à droite » (« au centre » au milieu). */
const CELL_PLACES = [
  'en haut à gauche',
  'en haut au milieu',
  'en haut à droite',
  'au milieu à gauche',
  'au centre',
  'au milieu à droite',
  'en bas à gauche',
  'en bas au milieu',
  'en bas à droite',
] as const;

/** Nom d'une pièce sans article (« rond rouge »). */
function getPieceName(piece: PieceId): string {
  return `${SHAPE_NAMES[getPieceShape(piece)]} ${COLOR_NAMES[getPieceColor(piece)]}`;
}

/** Nom d'une pièce, avec majuscule (« Rond rouge ») : bouton de la réserve ou de la grille. */
export function getPieceLabel(piece: PieceId): string {
  const name = getPieceName(piece);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Position d'une case (« en haut à gauche »). */
export function getCellPlace(cell: number): string {
  return CELL_PLACES[cell] ?? `case ${String(cell + 1)}`;
}

/** Nom d'une case de la grille, avec son contenu (« Case en haut à gauche, rond rouge »). */
export function getCellLabel(cell: number, piece: PieceId | null, isLocked: boolean): string {
  const place = `Case ${getCellPlace(cell)}`;
  if (piece === null) return `${place}, vide`;
  return `${place}, ${getPieceName(piece)}${isLocked ? ', déjà en place' : ''}`;
}

/** Lieu d'une zone (« sur la case au centre », « dans la ligne du haut »). */
function getZoneText(zone: ClueZone): string {
  switch (zone.kind) {
    case 'cell':
      return `sur la case ${getCellPlace(zone.cell)}`;
    case 'rows': {
      const [first] = zone.rows;
      if (zone.rows.length === 1) return `dans la ligne ${ROW_NAMES[first ?? 0] ?? ''}`;
      return first === 0 ? 'dans les deux lignes du haut' : 'dans les deux lignes du bas';
    }
    case 'cols': {
      const [first] = zone.cols;
      if (zone.cols.length === 1) return `dans la colonne ${COL_NAMES[first ?? 0] ?? ''}`;
      return first === 0 ? 'dans les deux colonnes de gauche' : 'dans les deux colonnes de droite';
    }
  }
}

/** Phrase d'une carte de place, selon son sujet. */
function getPlaceSentence(subject: ClueSubject, zone: ClueZone, isNegated: boolean): string {
  const where = getZoneText(zone);
  switch (subject.kind) {
    case 'piece': {
      const who = `Le ${getPieceName(subject.piece)}`;
      return isNegated ? `${who} n’est pas ${where}.` : `${who} est ${where}.`;
    }
    case 'shape': {
      const plural = SHAPE_PLURALS[subject.shape];
      return isNegated
        ? `Aucun ${SHAPE_NAMES[subject.shape]} n’est ${where}.`
        : `Tous les ${plural} sont ${where}.`;
    }
    case 'color': {
      const color = COLOR_FEMININE[subject.color];
      return isNegated
        ? `Aucune pièce ${color} n’est ${where}.`
        : `Toutes les pièces ${color}s sont ${where}.`;
    }
  }
}

/**
 * Phrase d'une carte, pour les lecteurs d'écran : le dessin ne dit rien à TalkBack
 * (« Le carré bleu est juste à droite du rond rouge. »).
 */
export function getClueLabel(clue: Clue): string {
  switch (clue.kind) {
    case 'place':
      return getPlaceSentence(clue.subject, clue.zone, clue.isNegated);
    case 'pair': {
      const where = clue.direction === 'right' ? 'juste à droite' : 'juste en dessous';
      return `Le ${getPieceName(clue.second)} est ${where} du ${getPieceName(clue.first)}.`;
    }
    case 'next': {
      const second = `Le ${getPieceName(clue.second)}`;
      const first = `le ${getPieceName(clue.first)}`;
      return clue.isNegated
        ? `${second} ne touche pas ${first}.`
        : `${second} touche ${first} par un côté.`;
    }
  }
}

/** Messages de la région `role="status"` du plateau. */
export const ANNOUNCEMENTS = {
  pickFirst: 'Choisis d’abord une pièce de la réserve.',
  ready: 'Toutes les pièces sont posées : appuie sur la cloche pour vérifier.',
  wellDone: 'Bravo, chaque pièce est à sa place !',
  starWon: 'Étoile gagnée !',
} as const;

/** Vérification ratée : la carte à relire, et, à l'échelon 3, la pièce que l'aide a placée. */
export function formatMissAnnouncement(clue: Clue, helped: PieceId | null, cell: number): string {
  const look = `Pas encore. Regarde cette carte : ${getClueLabel(clue)}`;
  if (helped === null) return look;
  return `${look} Je t’aide : le ${getPieceName(helped)} va ${getCellPlace(cell)}.`;
}

/** Titre du plateau (`h1` réservé aux lecteurs d'écran). */
export function formatBoardTitle(starNumber: number): string {
  return `Chacun sa Place, Étoile #${String(starNumber)}`;
}

/** Puzzle en cours (« Puzzle 2 sur 3 »). */
export function formatPuzzleLabel(puzzleIndex: number, puzzles: number): string {
  return `Puzzle ${String(puzzleIndex + 1)} sur ${String(puzzles)}`;
}
