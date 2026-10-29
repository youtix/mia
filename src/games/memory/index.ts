// Composants d'interface (FEAT-10) ; ceux qui ont un état sont marqués 'use client'. Une page
// importe le module de son écran, pas ce barrel (FEAT-08).
export {
  MATCH_DELAY_MS,
  MISMATCH_DELAY_MS,
  MemoryBoard,
  MemoryCardView,
  MemoryEndModal,
  MemoryHud,
  MemorySymbolIcon,
  SWAP_HIGHLIGHT_MS,
  getMemoryCardLabel,
  type MemoryBoardProps,
  type MemoryCardViewProps,
  type MemoryEndModalProps,
  type MemoryGameResult,
  type MemoryHudProps,
  type MemorySymbolIconProps,
} from './components';
export {
  createMemoryGame,
  endPreviewPhase,
  getMemoryConfigErrors,
  isEvaluationMatch,
  isPerfectWin,
  resolveEvaluation,
  selectCard,
} from './engine';
export type { Rng } from './random';
export {
  DISTINCT_COLOR_CLASSES,
  MEMORY_ICONS,
  MEMORY_ROTATIONS,
  MEMORY_SHAPES,
  MEMORY_THEMES,
  buildCardGroups,
  getMemoryModeCapacity,
  getMemorySymbolLabel,
  isMemoryVisualMode,
} from './symbols';
export type {
  MemoryCard,
  MemoryCardGroup,
  MemoryCardState,
  MemoryGameState,
  MemoryIconId,
  MemoryIconSymbol,
  MemoryLevelConfig,
  MemoryPhase,
  MemoryRotation,
  MemoryShapeId,
  MemorySymbolId,
  MemoryTheme,
  MemoryThemeId,
  MemoryVisualMode,
  VisualSymbol,
} from './types';
