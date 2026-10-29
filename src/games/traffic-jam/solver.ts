import { buildOccupancyGrid, countFreeCells, getBoardGeometryError } from './engine';
import type { TrafficJamLevelConfig, TrafficJamMove, TrafficJamState, VehicleDef } from './types';

/**
 * Solveur de Traffic Jam (FEAT-12) : parcours en largeur (BFS) sur les positions des véhicules.
 * Un coup = glissement d'un véhicule d'un nombre quelconque de cases dans un sens (cases
 * intermédiaires libres), comme le comptage du jeu : le BFS trouve le nombre minimal exact de
 * coups. Une position est codée par un seul nombre en base mixte (position de chaque véhicule sur
 * son axe × son poids) : la position voisine d'un coup s'obtient par une addition et se cherche
 * dans l'ensemble des positions vues sans rien allouer. Au-delà de 2^53 positions possibles
 * (grandes grilles très chargées), le code est une chaîne de caractères.
 */

/** `optimalMoves` d'un niveau insoluble ou abandonné (budget `maxStates` dépassé). */
export const UNSOLVABLE_MOVES = -1;

/** Positions distinctes explorées au plus avant d'abandonner, position de départ comprise. */
export const DEFAULT_MAX_STATES = 50_000;

export interface TrafficJamSolution {
  solvable: boolean;
  /** Nombre minimal de coups (0 : déjà gagné) ; `UNSOLVABLE_MOVES` quand `solvable` est faux */
  optimalMoves: number;
  /** Coups optimaux, rejouables par `applyMove` depuis la position de départ (vide sinon) */
  solution: TrafficJamMove[];
}

interface SolverVehicle {
  index: number;
  id: string;
  isHero: boolean;
  length: number;
  /** Index de grille de la case de position 0 sur l'axe */
  base: number;
  /** Écart d'index entre deux cases consécutives de l'axe (1 sur une ligne, gridSize sur une colonne) */
  stride: number;
  /** Nombre de positions possibles sur l'axe : `gridSize - length + 1` ; la dernière est la sortie du hero */
  radix: number;
  /** Poids de la position dans le code numérique (produit des radix précédents) */
  weight: number;
  /** Position de départ */
  start: number;
}

interface SolverBoard {
  vehicles: SolverVehicle[];
  /** Grille d'occupation des seuls obstacles, recopiée avant d'y poser les véhicules */
  obstacles: Uint8Array;
}

interface SearchNode<K> {
  key: K;
  parent: SearchNode<K> | null;
  /** Coup qui mène du parent à ce nœud (vide à la racine) */
  vehicleId: string;
  delta: number;
}

/** Codage d'une position complète (toutes les positions de véhicules) en une clé comparable. */
interface KeyCodec<K> {
  encode(vehicles: readonly SolverVehicle[]): K;
  positionOf(key: K, vehicle: SolverVehicle): number;
  shift(key: K, vehicle: SolverVehicle, delta: number): K;
}

const NUMERIC_CODEC: KeyCodec<number> = {
  encode: (vehicles) => vehicles.reduce((key, vehicle) => key + vehicle.start * vehicle.weight, 0),
  // Clé < 2^53 et poids entier : le quotient arrondi est exact, `floor` rend la division entière.
  positionOf: (key, vehicle) => Math.floor(key / vehicle.weight) % vehicle.radix,
  shift: (key, vehicle, delta) => key + delta * vehicle.weight,
};

const STRING_CODEC: KeyCodec<string> = {
  encode: (vehicles) => String.fromCharCode(...vehicles.map((vehicle) => vehicle.start)),
  positionOf: (key, vehicle) => key.charCodeAt(vehicle.index),
  shift: (key, vehicle, delta) =>
    key.slice(0, vehicle.index) +
    String.fromCharCode(key.charCodeAt(vehicle.index) + delta) +
    key.slice(vehicle.index + 1),
};

function describeVehicles(
  gridSize: number,
  vehicles: readonly VehicleDef[],
): { vehicles: SolverVehicle[]; keySpace: number } {
  let weight = 1;
  const described = vehicles.map((vehicle, index): SolverVehicle => {
    const horizontal = vehicle.axis === 'H';
    const radix = gridSize - vehicle.length + 1;
    const solverVehicle: SolverVehicle = {
      index,
      id: vehicle.id,
      isHero: vehicle.type === 'hero',
      length: vehicle.length,
      base: horizontal ? vehicle.row * gridSize : vehicle.col,
      stride: horizontal ? 1 : gridSize,
      radix,
      weight,
      start: horizontal ? vehicle.col : vehicle.row,
    };
    weight *= radix;
    return solverVehicle;
  });
  return { vehicles: described, keySpace: weight };
}

function unsolved(): TrafficJamSolution {
  return { solvable: false, optimalMoves: UNSOLVABLE_MOVES, solution: [] };
}

function buildSolution(goal: SearchNode<unknown>): TrafficJamSolution {
  const solution: TrafficJamMove[] = [];
  let node = goal;
  while (node.parent !== null) {
    solution.push({ vehicleId: node.vehicleId, delta: node.delta });
    node = node.parent;
  }
  solution.reverse();
  return { solvable: true, optimalMoves: solution.length, solution };
}

function isExit(vehicle: SolverVehicle, position: number): boolean {
  return vehicle.isHero && position === vehicle.radix - 1;
}

function search<K>(
  board: SolverBoard,
  codec: KeyCodec<K>,
  start: K,
  maxStates: number,
): TrafficJamSolution {
  const { vehicles, obstacles } = board;
  const root: SearchNode<K> = { key: start, parent: null, vehicleId: '', delta: 0 };
  if (vehicles.some((vehicle) => isExit(vehicle, codec.positionOf(start, vehicle)))) {
    return buildSolution(root);
  }

  const visited = new Set<K>([start]);
  const queue = [root];
  const occupied = new Uint8Array(obstacles.length);
  // File FIFO sans décalage : l'itérateur de tableau relit la longueur à chaque pas, les nœuds
  // ajoutés pendant le parcours sont donc visités à leur tour.
  for (const node of queue) {
    occupied.set(obstacles);
    for (const vehicle of vehicles) {
      const position = codec.positionOf(node.key, vehicle);
      for (let offset = 0; offset < vehicle.length; offset += 1) {
        occupied[vehicle.base + (position + offset) * vehicle.stride] = 1;
      }
    }
    for (const vehicle of vehicles) {
      const { base, stride, length } = vehicle;
      const position = codec.positionOf(node.key, vehicle);
      const backward = countFreeCells(occupied, base + (position - 1) * stride, -stride, position);
      const forward = countFreeCells(
        occupied,
        base + (position + length) * stride,
        stride,
        vehicle.radix - 1 - position,
      );
      for (let delta = -backward; delta <= forward; delta += 1) {
        if (delta === 0) continue;
        const key = codec.shift(node.key, vehicle, delta);
        if (visited.has(key)) continue;
        if (visited.size >= maxStates) return unsolved();
        visited.add(key);
        const next: SearchNode<K> = { key, parent: node, vehicleId: vehicle.id, delta };
        if (isExit(vehicle, position + delta)) return buildSolution(next);
        queue.push(next);
      }
    }
  }
  return unsolved();
}

/**
 * Résolution depuis des positions arbitraires (`vehicles` remplace `config.vehicles`, par exemple
 * l'état courant d'une partie). Lève une `Error` si la géométrie est invalide
 * (`getBoardGeometryError`). Voir `solveTrafficJam` pour le résultat.
 */
export function solveFromVehicles(
  config: TrafficJamLevelConfig,
  vehicles: readonly VehicleDef[],
  maxStates = DEFAULT_MAX_STATES,
): TrafficJamSolution {
  if (Number.isNaN(maxStates) || maxStates < 1) {
    throw new RangeError(
      `Budget de positions invalide : ${String(maxStates)} (nombre ≥ 1 attendu)`,
    );
  }
  const error = getBoardGeometryError({ ...config, vehicles: [...vehicles] });
  if (error !== undefined) throw new Error(`Niveau Traffic Jam invalide : ${error}`);
  const { vehicles: described, keySpace } = describeVehicles(config.gridSize, vehicles);
  const board: SolverBoard = { vehicles: described, obstacles: buildOccupancyGrid(config, []) };
  return keySpace <= Number.MAX_SAFE_INTEGER
    ? search(board, NUMERIC_CODEC, NUMERIC_CODEC.encode(described), maxStates)
    : search(board, STRING_CODEC, STRING_CODEC.encode(described), maxStates);
}

/**
 * Nombre minimal de coups d'un niveau et une suite de coups qui l'atteint, rejouable par
 * `applyMove` depuis `createTrafficJamGame(config)`.
 * - Position de départ déjà gagnante : `{ solvable: true, optimalMoves: 0, solution: [] }`.
 * - Niveau insoluble, ou plus de `maxStates` positions distinctes explorées (départ compris) :
 *   `{ solvable: false, optimalMoves: UNSOLVABLE_MOVES (-1), solution: [] }`.
 * - Géométrie invalide : `Error` (vérifier `validateBoardGeometry` d'abord).
 * - `maxStates` : nombre ≥ 1 (`Infinity` lève le budget) ; `NaN`, `0` ou négatif : `RangeError`.
 */
export function solveTrafficJam(
  config: TrafficJamLevelConfig,
  maxStates = DEFAULT_MAX_STATES,
): TrafficJamSolution {
  return solveFromVehicles(config, config.vehicles, maxStates);
}

/**
 * Indice : premier coup d'une solution optimale depuis les positions courantes (nouveau BFS à
 * chaque appel), `null` si la partie est gagnée ou la position insoluble dans le budget.
 */
export function getNextBestMove(
  state: TrafficJamState,
  maxStates = DEFAULT_MAX_STATES,
): TrafficJamMove | null {
  if (state.isWon) return null;
  const [move] = solveFromVehicles(state.config, state.vehicles, maxStates).solution;
  return move ?? null;
}
