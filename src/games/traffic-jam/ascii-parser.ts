import { getVehicleCells, type GridCell } from './engine';
import {
  HERO_COLOR_CLASS,
  HERO_VEHICLE_ID,
  VEHICLE_COLOR_CLASSES,
  type ObstacleDef,
  type TrafficJamLevelConfig,
  type TrafficJamState,
  type VehicleAxis,
  type VehicleDef,
} from './types';

/**
 * Grilles ASCII de Traffic Jam (FEAT-12) : une chaîne par ligne, un caractère par case. `.` case
 * vide, `#` obstacle fixe, `H` véhicule du joueur (2 cases horizontales sur la ligne de sortie),
 * toute autre lettre majuscule un véhicule de 2 cases (voiture) ou 3 cases (camion) alignées
 * horizontalement ou verticalement. Lignes et colonnes 0-indexées dans les messages, comme dans la
 * configuration produite.
 */

/** Ligne de sortie par défaut (SPECIFICATION §4.2). */
export const DEFAULT_EXIT_ROW = 2;

export interface ParseTrafficJamOptions {
  /** Nombre minimal de coups, renseigné par le catalogue et vérifié par le solveur (0 par défaut) */
  optimalMoves?: number;
  /** Ligne de la sortie (`DEFAULT_EXIT_ROW` par défaut) */
  exitRow?: number;
}

const EMPTY = '.';
const OBSTACLE = '#';
const HERO_LETTER = 'H';
const LETTER_PATTERN = /^[A-Z]$/;
const ALPHABET = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));

/** Cases d'une lettre dans l'ordre de lecture (ligne par ligne) : jamais vide. */
type Segment = [GridCell, ...GridCell[]];

/** Couleur du n-ième véhicule hors hero : la palette est reprise en boucle. */
function vehicleColorAt(index: number): string {
  return VEHICLE_COLOR_CLASSES[index % VEHICLE_COLOR_CLASSES.length] ?? VEHICLE_COLOR_CLASSES[0];
}

/** Véhicule décrit par une lettre, ou `Error` si ses cases ne forment pas un véhicule. */
function buildVehicle(
  letter: string,
  cells: Segment,
  exitRow: number,
  colorClass: string,
): VehicleDef {
  const [first] = cells;
  const sameRow = cells.every((cell) => cell.row === first.row);
  const sameCol = cells.every((cell) => cell.col === first.col);
  if (!sameRow && !sameCol) {
    throw new Error(
      `Lettre « ${letter} » : cases non alignées (une seule ligne ou une seule colonne attendue)`,
    );
  }
  // Lecture ligne par ligne : les cases sont déjà triées le long de l'axe.
  const axis: VehicleAxis = sameRow ? 'H' : 'V';
  const contiguous = cells.every((cell, offset) =>
    axis === 'H' ? cell.col === first.col + offset : cell.row === first.row + offset,
  );
  if (!contiguous) {
    throw new Error(`Lettre « ${letter} » : cases non contiguës (un seul segment attendu)`);
  }
  const length = cells.length;
  if (letter === HERO_LETTER) {
    if (length !== 2) {
      throw new Error(
        `Lettre « H » : ${String(length)} case(s), le véhicule du joueur en occupe exactement 2`,
      );
    }
    if (axis !== 'H') throw new Error('Lettre « H » : le véhicule du joueur doit être horizontal');
    if (first.row !== exitRow) {
      throw new Error(
        `Lettre « H » : ligne ${String(first.row)} au lieu de la ligne de sortie ${String(exitRow)}`,
      );
    }
    return {
      id: HERO_VEHICLE_ID,
      type: 'hero',
      axis: 'H',
      length: 2,
      row: first.row,
      col: first.col,
      colorClass: HERO_COLOR_CLASS,
    };
  }
  if (length !== 2 && length !== 3) {
    throw new Error(
      `Lettre « ${letter} » : ${String(length)} case(s), un véhicule en occupe 2 (voiture) ou 3 (camion)`,
    );
  }
  return {
    id: letter,
    type: length === 2 ? 'car' : 'truck',
    axis,
    length,
    row: first.row,
    col: first.col,
    colorClass,
  };
}

/**
 * Configuration d'un niveau à partir de sa grille ASCII (carrée : autant de caractères par ligne
 * que de lignes). Les véhicules suivent l'ordre d'apparition en lecture ligne par ligne ; le hero
 * (`id: 'hero'`) est rouge, les autres (`id` = lettre) prennent les couleurs de
 * `VEHICLE_COLOR_CLASSES` dans cet ordre. Lève une `Error` en français pour une grille vide, non
 * carrée, un caractère inconnu, une lettre non alignée, dispersée ou de longueur hors 2–3, un `H`
 * absent, en double, vertical ou hors de la ligne de sortie, ou une option invalide. Le résultat
 * satisfait toujours `validateBoardGeometry`.
 */
export function parseTrafficJamAscii(
  lines: readonly string[],
  options: ParseTrafficJamOptions = {},
): TrafficJamLevelConfig {
  const gridSize = lines.length;
  if (gridSize === 0) throw new Error('Grille ASCII vide');
  const exitRow = options.exitRow ?? DEFAULT_EXIT_ROW;
  const optimalMoves = options.optimalMoves ?? 0;
  if (!Number.isInteger(exitRow) || exitRow < 0 || exitRow >= gridSize) {
    throw new Error(
      `exitRow ${String(exitRow)} hors de la grille (entier de 0 à ${String(gridSize - 1)} attendu)`,
    );
  }
  if (!Number.isInteger(optimalMoves) || optimalMoves < 0) {
    throw new Error(`optimalMoves ${String(optimalMoves)} invalide (entier ≥ 0 attendu)`);
  }

  const obstacles: ObstacleDef[] = [];
  /** Cases de chaque lettre ; l'ordre d'insertion est l'ordre d'apparition. */
  const segments = new Map<string, Segment>();
  for (const [row, line] of lines.entries()) {
    if (line.length !== gridSize) {
      throw new Error(
        `Ligne ${String(row)} : ${String(line.length)} caractères au lieu de ${String(gridSize)} (grille carrée attendue)`,
      );
    }
    for (let col = 0; col < line.length; col += 1) {
      const char = line.charAt(col);
      if (char === EMPTY) continue;
      if (char === OBSTACLE) {
        obstacles.push({ row, col });
        continue;
      }
      if (!LETTER_PATTERN.test(char)) {
        throw new Error(
          `Caractère « ${char} » inconnu en ligne ${String(row)}, colonne ${String(col)} (« . », « # » ou lettre majuscule attendus)`,
        );
      }
      const segment = segments.get(char);
      if (segment === undefined) segments.set(char, [{ row, col }]);
      else segment.push({ row, col });
    }
  }
  if (!segments.has(HERO_LETTER)) {
    throw new Error(
      `Véhicule du joueur absent (lettre « H » attendue sur la ligne de sortie ${String(exitRow)})`,
    );
  }

  const vehicles: VehicleDef[] = [];
  let colorIndex = 0;
  for (const [letter, cells] of segments) {
    if (letter === HERO_LETTER) {
      vehicles.push(buildVehicle(letter, cells, exitRow, HERO_COLOR_CLASS));
    } else {
      vehicles.push(buildVehicle(letter, cells, exitRow, vehicleColorAt(colorIndex)));
      colorIndex += 1;
    }
  }
  return { gridSize, exitRow, optimalMoves, vehicles, obstacles };
}

/**
 * Grille ASCII d'une configuration ou d'un état (positions courantes) : inverse de
 * `parseTrafficJamAscii` (`H` pour le hero, première lettre de l'identifiant en majuscule pour les
 * autres, `#` obstacles, `.` cases vides). Les cases hors de la grille sont ignorées : un niveau
 * invalide se décrit aussi (messages du CLI, débogage).
 */
export function formatTrafficJamAscii(source: TrafficJamLevelConfig | TrafficJamState): string[] {
  const letters = assignLetters(source.vehicles);
  const config = 'config' in source ? source.config : source;
  const { gridSize } = config;
  const rows = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => EMPTY),
  );
  const paint = (cell: GridCell, symbol: string): void => {
    const row = rows[cell.row];
    if (row !== undefined && cell.col >= 0 && cell.col < row.length) row[cell.col] = symbol;
  };
  for (const obstacle of config.obstacles) paint(obstacle, OBSTACLE);
  for (const [vehicle, symbol] of letters) {
    for (const cell of getVehicleCells(vehicle)) paint(cell, symbol);
  }
  return rows.map((row) => row.join(''));
}

/**
 * Lettre de chaque véhicule : `H` pour le hero ; sinon l'initiale de l'identifiant (en majuscule)
 * si c'est une lettre encore libre, sinon la première lettre libre de l'alphabet. Les identifiants
 * issus du parseur se retrouvent tels quels ; des identifiants déclaratifs (`hat`, `a1` / `a2`,
 * `7up`) donnent encore une grille lisible et re-parsable, au lieu de lettres en double.
 */
function assignLetters(vehicles: readonly VehicleDef[]): [VehicleDef, string][] {
  const used = new Set<string>([HERO_LETTER]);
  const assigned: [VehicleDef, string][] = [];
  const pending: VehicleDef[] = [];
  for (const vehicle of vehicles) {
    const initial = vehicle.id.charAt(0).toUpperCase();
    if (vehicle.type === 'hero') {
      assigned.push([vehicle, HERO_LETTER]);
    } else if (LETTER_PATTERN.test(initial) && !used.has(initial)) {
      used.add(initial);
      assigned.push([vehicle, initial]);
    } else {
      pending.push(vehicle);
    }
  }
  for (const vehicle of pending) {
    const letter = ALPHABET.find((candidate) => !used.has(candidate)) ?? '?';
    used.add(letter);
    assigned.push([vehicle, letter]);
  }
  return assigned;
}
