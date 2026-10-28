import type { InputMode } from '@/types/mia';

export type { InputMode };

/** Direction du D-Pad : flèches de la télécommande Android TV ou du clavier. */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Case d'une grille, ligne et colonne comptées à partir de 0. */
export interface GridCoord {
  row: number;
  col: number;
}

/** Point dans le repère de l'écran : `y` croît vers le bas, comme les lignes d'une grille. */
export interface Point2D {
  x: number;
  y: number;
}

/** Cible candidate de `findNearestTarget` (ex: centre géométrique d'un véhicule de Traffic Jam). */
export interface NavigationTarget extends Point2D {
  id: string;
}

/**
 * Comportement d'une zone de navigation (`useNavigationScope`). Un gestionnaire absent laisse la
 * touche au navigateur : ni `preventDefault()`, ni action.
 */
export interface NavigationScope {
  /** Flèche, répétée tant que la touche est maintenue. */
  onDirection?: (direction: Direction) => void;
  /** OK / Entrée / Espace, une seule fois par appui. */
  onSelect?: () => void;
  /** Retour : Échap, Retour arrière ou bouton Retour Android (`dispatchBack`). */
  onBack?: () => void;
  /** Élément DOM du curseur : s'il a déjà le focus DOM, le premier appui agit sans réveil. */
  getFocusedElement?: () => Element | null;
  /** Éléments de la zone : OK sur un élément interactif hors zone reste au navigateur. */
  ownsElement?: (element: Element) => boolean;
}

export function mapKeyToDirection(key: string): Direction | null {
  switch (key) {
    case 'ArrowUp':
    case 'Up':
      return 'up';
    case 'ArrowDown':
    case 'Down':
      return 'down';
    case 'ArrowLeft':
    case 'Left':
      return 'left';
    case 'ArrowRight':
    case 'Right':
      return 'right';
    default:
      return null;
  }
}

export function isSelectKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'NumpadEnter' || key === 'Select';
}

export function isBackKey(key: string): boolean {
  return key === 'Escape' || key === 'Backspace' || key === 'GoBack' || key === 'BrowserBack';
}
