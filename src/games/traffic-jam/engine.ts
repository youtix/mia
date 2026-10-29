import {
  HERO_VEHICLE_ID,
  type TrafficJamLevelConfig,
  type TrafficJamMove,
  type TrafficJamState,
  type VehicleAxis,
  type VehicleDef,
  type VehicleType,
} from './types';

/**
 * Moteur de Traffic Jam (FEAT-12) : fonctions pures, sans React ni DOM. Chaque action renvoie un
 * nouvel état sans modifier celui reçu ; une action sans effet (déplacement nul, partie déjà
 * gagnée, rien à annuler) renvoie l'état reçu lui-même (React n'a rien à redessiner). `config` est
 * partagé par référence entre les états, les véhicules sont recopiés. Coordonnées 0-indexées
 * partout, messages d'erreur compris (comme dans la configuration).
 */

/** Case de la grille. */
export interface GridCell {
  row: number;
  col: number;
}

export interface BoardGeometryResult {
  valid: boolean;
  /** Première anomalie rencontrée, en français (absente si `valid`) */
  error?: string;
}

/** Plage de déplacement d'un véhicule le long de son axe (`minDelta ≤ 0 ≤ maxDelta`). */
export interface VehicleBounds {
  minDelta: number;
  maxDelta: number;
}

export interface ApplyMoveOptions {
  /**
   * Cumule le déplacement dans le dernier coup de l'historique s'il concerne le même véhicule :
   * avancer case par case à la télécommande compte alors pour un seul coup, comme un glisser.
   */
  mergeWithPreviousIfSameVehicle?: boolean;
}

const VEHICLE_TYPES: readonly string[] = ['hero', 'car', 'truck'];
const VEHICLE_AXES: readonly string[] = ['H', 'V'];
const TYPE_LABELS: Readonly<Record<VehicleType, string>> = {
  hero: 'le véhicule du joueur',
  car: 'une voiture',
  truck: 'un camion',
};

function isVehicleType(value: string): value is VehicleType {
  return VEHICLE_TYPES.includes(value);
}

function isVehicleAxis(value: string): value is VehicleAxis {
  return VEHICLE_AXES.includes(value);
}

function isInGrid(cell: GridCell, gridSize: number): boolean {
  return (
    Number.isInteger(cell.row) &&
    Number.isInteger(cell.col) &&
    cell.row >= 0 &&
    cell.row < gridSize &&
    cell.col >= 0 &&
    cell.col < gridSize
  );
}

function describeCell(cell: GridCell): string {
  return `(ligne ${String(cell.row)}, colonne ${String(cell.col)})`;
}

/** Cases occupées par un véhicule, de sa case supérieure-gauche vers la droite ou le bas. */
export function getVehicleCells(
  vehicle: Pick<VehicleDef, 'axis' | 'length' | 'row' | 'col'>,
): GridCell[] {
  return Array.from({ length: vehicle.length }, (_, offset) =>
    vehicle.axis === 'H'
      ? { row: vehicle.row, col: vehicle.col + offset }
      : { row: vehicle.row + offset, col: vehicle.col },
  );
}

/**
 * Première anomalie géométrique d'un niveau, en français (`undefined` : niveau valide) : grille
 * carrée d'au moins 2 cases, ligne de sortie dans la grille, `optimalMoves` entier ≥ 0, obstacles
 * dans la grille et sans doublon, identifiants de véhicules non vides et uniques, types et axes
 * connus, longueur 2 (voiture, hero) ou 3 (camion), un seul hero (horizontal, sur la ligne de
 * sortie), véhicules entièrement dans la grille et sans chevauchement (entre eux et avec les
 * obstacles). Les règles sont vérifiées dans cet ordre, obstacles puis véhicules dans l'ordre
 * de déclaration.
 */
export function getBoardGeometryError(config: TrafficJamLevelConfig): string | undefined {
  const { gridSize, exitRow, optimalMoves, vehicles, obstacles } = config;
  if (!Number.isInteger(gridSize) || gridSize < 2) {
    return `gridSize ${String(gridSize)} invalide (entier ≥ 2 attendu)`;
  }
  if (!Number.isInteger(exitRow) || exitRow < 0 || exitRow >= gridSize) {
    return `exitRow ${String(exitRow)} hors de la grille (entier de 0 à ${String(gridSize - 1)} attendu)`;
  }
  if (!Number.isInteger(optimalMoves) || optimalMoves < 0) {
    return `optimalMoves ${String(optimalMoves)} invalide (entier ≥ 0 attendu)`;
  }

  /** Occupant de chaque case (index `row * gridSize + col`), pour nommer les chevauchements. */
  const occupants = new Map<number, string>();
  for (const obstacle of obstacles) {
    if (!isInGrid(obstacle, gridSize))
      return `obstacle ${describeCell(obstacle)} hors de la grille`;
    const index = obstacle.row * gridSize + obstacle.col;
    if (occupants.has(index)) return `obstacle ${describeCell(obstacle)} en double`;
    occupants.set(index, `l'obstacle ${describeCell(obstacle)}`);
  }

  const ids = new Set<string>();
  let heroCount = 0;
  for (const vehicle of vehicles) {
    if (vehicle.id === '') return 'identifiant de véhicule vide';
    if (ids.has(vehicle.id)) return `identifiant « ${vehicle.id} » en double`;
    ids.add(vehicle.id);
    const label = `le véhicule « ${vehicle.id} »`;
    const type: string = vehicle.type;
    if (!isVehicleType(type)) {
      return `${label} : type « ${type} » inconnu (hero, car ou truck attendu)`;
    }
    const axis: string = vehicle.axis;
    if (!isVehicleAxis(axis)) return `${label} : axe « ${axis} » invalide (H ou V attendu)`;
    const expectedLength = type === 'truck' ? 3 : 2;
    const length: number = vehicle.length;
    if (length !== expectedLength) {
      return `${label} : longueur ${String(length)} invalide (${String(expectedLength)} attendue pour ${TYPE_LABELS[type]})`;
    }
    if (type === 'hero') {
      heroCount += 1;
      if (heroCount > 1) return 'plusieurs véhicules du joueur (un seul type hero attendu)';
      if (axis !== 'H') return `${label} : le véhicule du joueur doit être horizontal`;
      // FEAT-13 place le curseur initial de la télécommande sur `HERO_VEHICLE_ID`.
      if (vehicle.id !== HERO_VEHICLE_ID) {
        return `${label} : identifiant invalide (« ${HERO_VEHICLE_ID} » attendu pour le véhicule du joueur)`;
      }
      if (vehicle.row !== exitRow) {
        return `${label} : ligne ${String(vehicle.row)} au lieu de la ligne de sortie ${String(exitRow)}`;
      }
    }
    for (const cell of getVehicleCells(vehicle)) {
      if (!isInGrid(cell, gridSize)) return `${label} hors de la grille ${describeCell(cell)}`;
      const index = cell.row * gridSize + cell.col;
      const occupant = occupants.get(index);
      if (occupant !== undefined) return `${label} chevauche ${occupant} en ${describeCell(cell)}`;
      occupants.set(index, label);
    }
  }
  if (heroCount === 0) return 'aucun véhicule du joueur (type hero)';
  return undefined;
}

/** Validation géométrique d'un niveau, reprise par `validateTrafficJamCatalog` (FEAT-14). */
export function validateBoardGeometry(config: TrafficJamLevelConfig): BoardGeometryResult {
  const error = getBoardGeometryError(config);
  return error === undefined ? { valid: true } : { valid: false, error };
}

/**
 * Grille d'occupation (index `row * gridSize + col`, 1 = case prise) des obstacles et des
 * véhicules donnés : base des calculs de collision du moteur et du solveur. Une case hors de la
 * grille est ignorée.
 */
export function buildOccupancyGrid(
  config: Pick<TrafficJamLevelConfig, 'gridSize' | 'obstacles'>,
  vehicles: readonly VehicleDef[],
): Uint8Array {
  const { gridSize } = config;
  const occupied = new Uint8Array(gridSize * gridSize);
  // Garde explicite : sans elle, une case qui déborde à droite se replierait sur la ligne suivante.
  for (const obstacle of config.obstacles) {
    if (isInGrid(obstacle, gridSize)) occupied[obstacle.row * gridSize + obstacle.col] = 1;
  }
  for (const vehicle of vehicles) {
    for (const cell of getVehicleCells(vehicle)) {
      if (isInGrid(cell, gridSize)) occupied[cell.row * gridSize + cell.col] = 1;
    }
  }
  return occupied;
}

/**
 * Nombre de cases libres consécutives à partir de la case d'index `from`, en avançant de `step`
 * index à chaque pas (`±1` le long d'une ligne, `±gridSize` le long d'une colonne), au plus
 * `limit` : plage de glissement d'un véhicule dans un sens. `limit` est le nombre de cases
 * restant jusqu'au bord ; sans lui, l'index passerait à la ligne voisine.
 */
export function countFreeCells(
  occupied: Uint8Array,
  from: number,
  step: number,
  limit: number,
): number {
  let count = 0;
  while (count < limit && occupied[from + count * step] === 0) count += 1;
  return count;
}

function findVehicle(state: TrafficJamState, vehicleId: string): VehicleDef {
  const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId);
  if (vehicle === undefined) throw new RangeError(`Véhicule « ${vehicleId} » inconnu`);
  return vehicle;
}

/** Le véhicule du joueur touche le bord droit (`hero.col + hero.length >= gridSize`). */
export function isHeroAtExit(vehicles: readonly VehicleDef[], gridSize: number): boolean {
  return vehicles.some(
    (vehicle) => vehicle.type === 'hero' && vehicle.col + vehicle.length >= gridSize,
  );
}

function buildState(config: TrafficJamLevelConfig): TrafficJamState {
  return {
    config,
    vehicles: config.vehicles.map((vehicle) => ({ ...vehicle })),
    moves: 0,
    history: [],
    isWon: isHeroAtExit(config.vehicles, config.gridSize),
  };
}

/**
 * Nouvelle partie aux positions de `config.vehicles` (copiées), sans coup joué. Lève une `Error`
 * décrivant la première anomalie d'une géométrie invalide (`getBoardGeometryError`).
 */
export function createTrafficJamGame(config: TrafficJamLevelConfig): TrafficJamState {
  const error = getBoardGeometryError(config);
  if (error !== undefined) throw new Error(`Niveau Traffic Jam invalide : ${error}`);
  return buildState(config);
}

/**
 * Plage de déplacement d'un véhicule le long de son axe sans collision ni sortie de grille :
 * `minDelta` (≤ 0) vers la gauche ou le haut, `maxDelta` (≥ 0) vers la droite ou le bas. Le hero
 * s'arrête contre le bord droit (`col + length === gridSize`, position de victoire), jamais
 * au-delà. `RangeError` pour un identifiant inconnu.
 */
export function getVehicleBounds(state: TrafficJamState, vehicleId: string): VehicleBounds {
  const vehicle = findVehicle(state, vehicleId);
  const { gridSize } = state.config;
  const others = state.vehicles.filter((candidate) => candidate.id !== vehicleId);
  const occupied = buildOccupancyGrid(state.config, others);
  const horizontal = vehicle.axis === 'H';
  const stride = horizontal ? 1 : gridSize;
  const base = horizontal ? vehicle.row * gridSize : vehicle.col;
  const position = horizontal ? vehicle.col : vehicle.row;
  const backward = countFreeCells(occupied, base + (position - 1) * stride, -stride, position);
  const forward = countFreeCells(
    occupied,
    base + (position + vehicle.length) * stride,
    stride,
    gridSize - position - vehicle.length,
  );
  // `0 - n` plutôt que `-n` : un véhicule bloqué donnerait -0 (distinct de 0 pour `Object.is`).
  return { minDelta: 0 - backward, maxDelta: forward };
}

function shiftVehicle(vehicle: VehicleDef, delta: number): VehicleDef {
  return vehicle.axis === 'H'
    ? { ...vehicle, col: vehicle.col + delta }
    : { ...vehicle, row: vehicle.row + delta };
}

function moveVehicle(
  vehicles: readonly VehicleDef[],
  vehicleId: string,
  delta: number,
): VehicleDef[] {
  return vehicles.map((vehicle) =>
    vehicle.id === vehicleId ? shiftVehicle(vehicle, delta) : vehicle,
  );
}

/**
 * Historique après un coup. Avec `merge`, un coup du même véhicule que le dernier s'y cumule ;
 * si le cumul est nul, le véhicule est revenu à sa place et le coup disparaît.
 */
function pushMove(
  history: readonly TrafficJamMove[],
  move: TrafficJamMove,
  merge: boolean,
): TrafficJamMove[] {
  const last = history.at(-1);
  if (!merge || last?.vehicleId !== move.vehicleId) return [...history, move];
  const delta = last.delta + move.delta;
  const previous = history.slice(0, -1);
  return delta === 0 ? previous : [...previous, { vehicleId: move.vehicleId, delta }];
}

function nextState(
  state: TrafficJamState,
  vehicles: VehicleDef[],
  history: TrafficJamMove[],
): TrafficJamState {
  return {
    config: state.config,
    vehicles,
    moves: history.length,
    history,
    isWon: isHeroAtExit(vehicles, state.config.gridSize),
  };
}

/**
 * Glisse le véhicule `vehicleId` de `delta` cases le long de son axe (négatif = gauche/haut) : un
 * coup de plus dans l'historique, ou cumulé au coup précédent du même véhicule avec
 * `mergeWithPreviousIfSameVehicle` (contrat FEAT-13 : à la télécommande, 3 pas = 1 coup, et un
 * retour à la case de départ efface le coup). `moves` vaut toujours `history.length`.
 * - Partie déjà gagnée ou `delta` nul : l'état reçu lui-même (aucun coup après la victoire).
 * - `delta` non entier, véhicule inconnu ou `delta` hors de `getVehicleBounds` : `RangeError`.
 */
export function applyMove(
  state: TrafficJamState,
  vehicleId: string,
  delta: number,
  options: ApplyMoveOptions = {},
): TrafficJamState {
  if (state.isWon || delta === 0) return state;
  if (!Number.isInteger(delta)) {
    throw new RangeError(
      `Déplacement ${String(delta)} du véhicule « ${vehicleId} » invalide (entier attendu)`,
    );
  }
  const { minDelta, maxDelta } = getVehicleBounds(state, vehicleId);
  if (delta < minDelta || delta > maxDelta) {
    throw new RangeError(
      `Déplacement ${String(delta)} du véhicule « ${vehicleId} » hors de la plage autorisée (${String(minDelta)} à ${String(maxDelta)})`,
    );
  }
  const vehicles = moveVehicle(state.vehicles, vehicleId, delta);
  const merge = options.mergeWithPreviousIfSameVehicle === true;
  return nextState(state, vehicles, pushMove(state.history, { vehicleId, delta }, merge));
}

/**
 * Annule le dernier coup (déplacement inverse, `isWon` recalculé : possible même après la
 * victoire). Sans historique, l'état reçu lui-même.
 */
export function undoLastMove(state: TrafficJamState): TrafficJamState {
  const last = state.history.at(-1);
  if (last === undefined) return state;
  const vehicles = moveVehicle(state.vehicles, last.vehicleId, -last.delta);
  return nextState(state, vehicles, state.history.slice(0, -1));
}

/** Repart des positions de `config.vehicles`, sans coup ni historique (même `config`). */
export function resetLevel(state: TrafficJamState): TrafficJamState {
  return buildState(state.config);
}

/** Victoire « Parfait » (couronne) : partie gagnée en au plus `config.optimalMoves` coups. */
export function isPerfectWin(state: TrafficJamState): boolean {
  return state.isWon && state.moves <= state.config.optimalMoves;
}
