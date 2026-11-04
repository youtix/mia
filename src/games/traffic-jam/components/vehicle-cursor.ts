import { findNearestTarget, type Direction, type NavigationTarget } from '@/core/navigation';
import type { VehicleDef } from '../types';

const DIRECTIONS: readonly Direction[] = ['left', 'right', 'up', 'down'];

const OPPOSITE_DIRECTIONS: Readonly<Record<Direction, Direction>> = {
  left: 'right',
  right: 'left',
  up: 'down',
  down: 'up',
};

/** Véhicule visé par chaque flèche depuis chaque véhicule (clé `moveKey`) ; absent : aucun devant. */
type CursorMoves = ReadonlyMap<string, string>;

function moveKey(vehicleId: string, direction: Direction): string {
  return `${vehicleId} ${direction}`;
}

/** Centre géométrique d'un véhicule, en cases (repère écran : `y` croît vers le bas). */
function getVehicleCenter(vehicle: VehicleDef): NavigationTarget {
  return {
    id: vehicle.id,
    x: vehicle.col + (vehicle.axis === 'H' ? vehicle.length / 2 : 0.5),
    y: vehicle.row + (vehicle.axis === 'V' ? vehicle.length / 2 : 0.5),
  };
}

function getNearestMoves(vehicles: readonly VehicleDef[]): CursorMoves {
  const centers = vehicles.map(getVehicleCenter);
  const moves = new Map<string, string>();
  for (const center of centers) {
    const others = centers.filter((other) => other.id !== center.id);
    for (const direction of DIRECTIONS) {
      const targetId = findNearestTarget(center, others, direction);
      if (targetId !== null) moves.set(moveKey(center.id, direction), targetId);
    }
  }
  return moves;
}

/** Couples (départ, arrivée) reliés par les flèches : véhicules² si chacun atteint tous les autres. */
function countReachablePairs(vehicles: readonly VehicleDef[], moves: CursorMoves): number {
  let count = 0;
  for (const vehicle of vehicles) {
    const reached = new Set([vehicle.id]);
    // Un `Set` parcourt aussi ce qu'on lui ajoute en chemin.
    for (const id of reached) {
      for (const direction of DIRECTIONS) {
        const targetId = moves.get(moveKey(id, direction));
        if (targetId !== undefined) reached.add(targetId);
      }
    }
    count += reached.size;
  }
  return count;
}

/**
 * Flèches du curseur dans une position. `findNearestTarget` ne suffit pas à tout atteindre : un
 * véhicule peut n'être le plus proche d'aucun autre, dans aucune direction. Chaque flèche d'un
 * véhicule mène à un voisin : la flèche opposée de ce voisin le vise alors à la place de sa cible
 * habituelle, si davantage de véhicules deviennent atteignables. Une flèche n'en vise jamais un
 * qui n'est pas devant elle, et celle sans véhicule devant reste sans cible (Haut rejoint le HUD).
 */
function getCursorMoves(vehicles: readonly VehicleDef[]): CursorMoves {
  const allPairs = vehicles.length ** 2;
  let moves = getNearestMoves(vehicles);
  let reachablePairs = countReachablePairs(vehicles, moves);
  for (const vehicle of vehicles) {
    for (const direction of DIRECTIONS) {
      if (reachablePairs === allPairs) return moves;
      const neighborId = moves.get(moveKey(vehicle.id, direction));
      if (neighborId === undefined) continue;
      const repaired = new Map(moves);
      repaired.set(moveKey(neighborId, OPPOSITE_DIRECTIONS[direction]), vehicle.id);
      const repairedPairs = countReachablePairs(vehicles, repaired);
      if (repairedPairs > reachablePairs) {
        moves = repaired;
        reachablePairs = repairedPairs;
      }
    }
  }
  return moves;
}

/**
 * Véhicule voisin dans la direction d'une flèche (FEAT-13 §3.4), `null` s'il n'y en a plus devant.
 * Depuis n'importe quel véhicule, les flèches mènent à tous les autres.
 */
export function findVehicleTarget(
  vehicles: readonly VehicleDef[],
  fromId: string,
  direction: Direction,
): string | null {
  return getCursorMoves(vehicles).get(moveKey(fromId, direction)) ?? null;
}
