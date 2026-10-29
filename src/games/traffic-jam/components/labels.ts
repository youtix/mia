import { formatMoves } from '@/components/progression/labels';
import type { VehicleDef } from '../types';

const frenchPlural = new Intl.PluralRules('fr-FR');

/** « 1 case », « 3 cases » : 0 et 1 au singulier, comme `formatMoves` (FEAT-08). */
function pluralize(count: number, singular: string, plural: string): string {
  return `${String(count)} ${frenchPlural.select(count) === 'one' ? singular : plural}`;
}

/** Cases parcourues (« 1 case », « 2 cases »). */
export function formatCells(count: number): string {
  return pluralize(count, 'case', 'cases');
}

/** Nom d'un véhicule dans une phrase : « ta voiture », « la voiture A », « le camion B ». */
export function getVehicleName(vehicle: Pick<VehicleDef, 'id' | 'type'>): string {
  switch (vehicle.type) {
    case 'hero':
      return 'ta voiture';
    case 'car':
      return `la voiture ${vehicle.id}`;
    case 'truck':
      return `le camion ${vehicle.id}`;
  }
}

/** Nom d'un véhicule en tête de libellé : « Ta voiture », « Voiture A », « Camion B ». */
function getVehicleTitle(vehicle: Pick<VehicleDef, 'id' | 'type'>): string {
  switch (vehicle.type) {
    case 'hero':
      return 'Ta voiture';
    case 'car':
      return `Voiture ${vehicle.id}`;
    case 'truck':
      return `Camion ${vehicle.id}`;
  }
}

/** Axe accordé au genre du véhicule (« horizontale » pour une voiture, « vertical » pour un camion). */
function getAxisLabel(vehicle: Pick<VehicleDef, 'axis' | 'type'>): string {
  const feminine = vehicle.type !== 'truck';
  if (vehicle.axis === 'H') return feminine ? 'horizontale' : 'horizontal';
  return feminine ? 'verticale' : 'vertical';
}

/**
 * Nom vocalisé d'un véhicule : type, axe, longueur et position affichée (lignes et colonnes
 * comptées à partir de 1), repère indispensable au lecteur d'écran ; la couleur n'est jamais
 * nommée. « , en marche » en état 2 de la télécommande (véhicule démarré).
 */
export function getVehicleLabel(vehicle: VehicleDef, isLocked = false): string {
  const first = { row: vehicle.row + 1, col: vehicle.col + 1 };
  const last = vehicle.length - 1;
  const position =
    vehicle.axis === 'H'
      ? `ligne ${String(first.row)}, colonnes ${String(first.col)} à ${String(first.col + last)}`
      : `lignes ${String(first.row)} à ${String(first.row + last)}, colonne ${String(first.col)}`;
  const state = isLocked ? ', en marche' : '';
  return `${getVehicleTitle(vehicle)}, ${getAxisLabel(vehicle)}, ${formatCells(vehicle.length)}, ${position}${state}`;
}

/** Nom vocalisé d'un plot de chantier (position comptée à partir de 1). */
export function getObstacleLabel(row: number, col: number): string {
  return `Plot fixe, ligne ${String(row + 1)}, colonne ${String(col + 1)}`;
}

/** Nom vocalisé du parking : taille et position de la sortie (ligne comptée à partir de 1). */
export function getBoardLabel(gridSize: number, exitRow: number): string {
  return `Parking de ${String(gridSize)} × ${String(gridSize)} cases, sortie à droite sur la ligne ${String(exitRow + 1)}`;
}

/** Sens d'un déplacement le long de l'axe du véhicule (négatif = gauche ou haut). */
export function getDirectionLabel(axis: VehicleDef['axis'], delta: number): string {
  if (axis === 'H') return delta < 0 ? 'vers la gauche' : 'vers la droite';
  return delta < 0 ? 'vers le haut' : 'vers le bas';
}

/** Indice vocalisé : « Indice : déplace la voiture A de 2 cases vers la droite ». */
export function getHintMessage(vehicle: VehicleDef, delta: number): string {
  return `Indice : déplace ${getVehicleName(vehicle)} de ${formatCells(Math.abs(delta))} ${getDirectionLabel(vehicle.axis, delta)}`;
}

/** Indice impossible : position insoluble, ou trop de positions à explorer (`getNextBestMove`). */
export const HINT_UNAVAILABLE_MESSAGE =
  'Aucun indice : cette position est bloquée. Annule des coups ou recommence.';

/** Indice demandé après la victoire (pendant la sortie du véhicule). */
export const HINT_WON_MESSAGE = 'La partie est déjà gagnée !';

/** Objectif de la couronne (« ≤ 10 coups »). */
export function getCrownTargetLabel(optimalMoves: number): string {
  return `≤ ${formatMoves(optimalMoves)}`;
}

/** Couronne manquée : « Couronne : ≤ 10 coups, tu en as fait 12. Rejoue pour la gagner ! ». */
export function getCrownMissedMessage(optimalMoves: number, moves: number): string {
  return `Couronne : ${getCrownTargetLabel(optimalMoves)}, tu en as fait ${String(moves)}. Rejoue pour la gagner !`;
}
