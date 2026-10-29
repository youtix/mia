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
// Composants d'interface (FEAT-13) ; ceux qui ont un état sont marqués 'use client'. Une page
// importe le module de son écran, pas ce barrel (FEAT-08).
export {
  EXIT_ANIMATION_MS,
  HINT_DURATION_MS,
  HINT_UNAVAILABLE_MESSAGE,
  HINT_WON_MESSAGE,
  HUD_ACTIONS,
  TrafficJamBoard,
  TrafficJamEndModal,
  TrafficJamHud,
  VEHICLE_GAP_PX,
  VehiclePiece,
  formatCells,
  getBoardLabel,
  getCrownMissedMessage,
  getCrownTargetLabel,
  getDirectionLabel,
  getHintMessage,
  getObstacleLabel,
  getVehicleLabel,
  getVehicleName,
  type HudAction,
  type TrafficJamBoardProps,
  type TrafficJamEndModalProps,
  type TrafficJamGameResult,
  type TrafficJamHudProps,
  type VehiclePieceProps,
} from './components';
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
