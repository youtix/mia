// Moteur pur de Traffic Jam (FEAT-12) : aucune dépendance React ni DOM.
export {
  DEFAULT_EXIT_ROW,
  formatTrafficJamAscii,
  parseTrafficJamAscii,
  type ParseTrafficJamOptions,
} from './ascii-parser';
export {
  applyMove,
  buildOccupancyGrid,
  countFreeCells,
  createTrafficJamGame,
  getBoardGeometryError,
  getVehicleBounds,
  getVehicleCells,
  isHeroAtExit,
  isPerfectWin,
  resetLevel,
  undoLastMove,
  validateBoardGeometry,
  type ApplyMoveOptions,
  type BoardGeometryResult,
  type GridCell,
  type VehicleBounds,
} from './engine';
export {
  DEFAULT_MAX_STATES,
  UNSOLVABLE_MOVES,
  getNextBestMove,
  solveFromVehicles,
  solveTrafficJam,
  type TrafficJamSolution,
} from './solver';
export { HERO_COLOR_CLASS, HERO_VEHICLE_ID, VEHICLE_COLOR_CLASSES } from './types';
export type {
  ObstacleDef,
  TrafficJamLevelConfig,
  TrafficJamMove,
  TrafficJamState,
  VehicleAxis,
  VehicleDef,
  VehicleType,
} from './types';
