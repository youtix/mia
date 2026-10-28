export { LEVEL_ID_PATTERN, validateLevelCatalog } from './catalog-validator';
export {
  GAMES,
  GAME_REGISTRY,
  getProfileProgressSummary,
  type GameRegistry,
} from './game-registry';
export {
  DIFFICULTY_TIER_IDS,
  getGameProgressSummary,
  isLevelUnlockedAtIndex,
  recordLevelVictory,
  sortLevels,
} from './progression-engine';
export type {
  BaseLevelDefinition,
  CatalogValidationResult,
  EnrichedLevelItem,
  GameManifest,
  GameProgressSummary,
  LevelVictoryParams,
  ProfileProgressSummary,
  RecordVictoryOptions,
  TierProgressSummary,
} from './types';
