/**
 * Types du jeu Traffic Jam (FEAT-12). Le moteur, le parseur ASCII et le solveur sont en TypeScript
 * pur, sans React ni DOM : ils restent importables par un composant serveur et par le script
 * `validate:levels` (FEAT-14).
 */

export type VehicleAxis = 'H' | 'V';
export type VehicleType = 'hero' | 'car' | 'truck';

export interface VehicleDef {
  /** `hero` pour le véhicule du joueur, `A`, `B`, `C`… pour les autres */
  id: string;
  type: VehicleType;
  axis: VehicleAxis;
  length: 2 | 3;
  /** Coordonnées 0-indexées de la case supérieure-gauche du véhicule */
  row: number;
  col: number;
  /** Classe Tailwind littérale de fond (`HERO_COLOR_CLASS`, `VEHICLE_COLOR_CLASSES`) */
  colorClass: string;
}

/** Obstacle fixe d'une case (plot de chantier). */
export interface ObstacleDef {
  row: number;
  col: number;
}

export interface TrafficJamLevelConfig {
  /** Côté de la grille carrée (6 par défaut) */
  gridSize: number;
  /** Ligne de la sortie, sur le bord droit (2 par défaut) */
  exitRow: number;
  /** Nombre minimal de coups pour sortir, mesuré par le solveur BFS (0 tant qu'il n'est pas connu) */
  optimalMoves: number;
  vehicles: VehicleDef[];
  obstacles: ObstacleDef[];
}

export interface TrafficJamMove {
  vehicleId: string;
  /** Déplacement relatif sur l'axe : négatif = gauche/haut, positif = droite/bas */
  delta: number;
}

export interface TrafficJamState {
  config: TrafficJamLevelConfig;
  /** Véhicules aux positions courantes (copies : `config.vehicles` n'est jamais modifié) */
  vehicles: VehicleDef[];
  /** Coups joués, toujours égal à `history.length` */
  moves: number;
  history: TrafficJamMove[];
  /** Le véhicule du joueur touche le bord droit : `hero.col + hero.length >= config.gridSize` */
  isWon: boolean;
}

/** Identifiant du véhicule du joueur (`parseTrafficJamAscii`). */
export const HERO_VEHICLE_ID = 'hero';

/** Couleur du véhicule du joueur : la voiture rouge classique de l'embouteillage. */
export const HERO_COLOR_CLASS = 'bg-red-500';

/**
 * Couleurs des autres véhicules, attribuées dans l'ordre d'apparition sur la grille (reprises en
 * boucle au-delà de 12). Classes Tailwind littérales : Tailwind v4 ne génère que les classes
 * présentes telles quelles dans les sources. Toutes distinctes du rouge du hero et contrastées sur
 * le fond sombre de l'application.
 */
export const VEHICLE_COLOR_CLASSES: readonly [string, ...string[]] = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-400',
  'bg-violet-500',
  'bg-pink-500',
  'bg-lime-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-fuchsia-500',
  'bg-cyan-500',
  'bg-yellow-400',
];
