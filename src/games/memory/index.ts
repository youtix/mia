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
