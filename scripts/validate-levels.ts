/**
 * `npm run validate:levels` (FEAT-14) : valide tous les catalogues de niveaux de Mia (Memory, Traffic
 * Jam, Suites Logiques et Attrape-Piège) et affiche un résumé par jeu (niveaux par palier, puis chaque
 * étoile avec sa configuration : coups optimaux mesurés par le solveur BFS pour Traffic Jam). Code de
 * sortie 1 à la moindre anomalie (`validate:all`, CI). Modules importés directement, jamais les barrels
 * (ils ré-exportent des composants React) : le script s'exécute avec tsx, sans DOM.
 */
import { DIFFICULTY_TIER_IDS, sortLevels } from '@/core/progression/progression-engine';
import type { BaseLevelDefinition, CatalogValidationResult } from '@/core/progression/types';
import { BEAR_SORT_CATALOG, validateBearSortCatalog } from '@/games/bear-sort/catalog';
import { getRuleLabel } from '@/games/bear-sort/labels';
import type { BearSortLevelConfig } from '@/games/bear-sort/types';
import { MEMORY_CATALOG, validateMemoryCatalog } from '@/games/memory/catalog';
import type { MemoryLevelConfig } from '@/games/memory/types';
import { PATTERNS_CATALOG, validatePatternsCatalog } from '@/games/patterns/catalog';
import type { PatternLevelConfig } from '@/games/patterns/types';
import { TRAFFIC_JAM_CATALOG, validateTrafficJamCatalog } from '@/games/traffic-jam/catalog';
import type { TrafficJamLevelConfig } from '@/games/traffic-jam/types';
import { DIFFICULTY_TIERS, type DifficultyTierMeta } from '@/types/mia';

interface CatalogCheck<TConfig> {
  title: string;
  catalog: readonly BaseLevelDefinition<TConfig>[];
  validate: () => CatalogValidationResult;
  /** Résumé d'une configuration, après l'identifiant et le palier de l'étoile */
  describe: (config: TConfig) => string;
}

/** « 1 coup », « 12 coups » (0 et 1 au singulier). */
function formatCount(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count > 1 ? plural : singular}`;
}

const MEMORY: CatalogCheck<MemoryLevelConfig> = {
  title: 'Memory',
  catalog: MEMORY_CATALOG,
  validate: () => validateMemoryCatalog(MEMORY_CATALOG),
  describe: ({ cols, rows, matchSize, visualMode }) =>
    `${String(cols)} × ${String(rows)} cartes, ${matchSize === 2 ? 'paires' : 'triplets'}, ${visualMode}`,
};

const TRAFFIC_JAM: CatalogCheck<TrafficJamLevelConfig> = {
  title: 'Traffic Jam',
  catalog: TRAFFIC_JAM_CATALOG,
  validate: () => validateTrafficJamCatalog(TRAFFIC_JAM_CATALOG),
  describe: ({ optimalMoves, vehicles, obstacles }) =>
    [
      formatCount(optimalMoves, 'coup optimal', 'coups optimaux'),
      formatCount(vehicles.length, 'véhicule', 'véhicules'),
      formatCount(obstacles.length, 'obstacle', 'obstacles'),
    ].join(', '),
};

const PATTERNS: CatalogCheck<PatternLevelConfig> = {
  title: 'Suites Logiques',
  catalog: PATTERNS_CATALOG,
  validate: () => validatePatternsCatalog(PATTERNS_CATALOG),
  describe: ({ rule, family, colorMode, visibleItems, answerMode, soundPairing, stopRounds }) =>
    [
      `${rule === 'ab' ? 'A-B' : 'A-B-B'} ${family}, ${colorMode}`,
      formatCount(visibleItems, 'élément', 'éléments'),
      answerMode === 'sound' ? `sons ${String(soundPairing)}` : 'pièces',
      formatCount(stopRounds, 'STOP', 'STOP'),
    ].join(', '),
};

const BEAR_SORT: CatalogCheck<BearSortLevelConfig> = {
  title: 'Attrape-Piège',
  catalog: BEAR_SORT_CATALOG,
  validate: () => validateBearSortCatalog(BEAR_SORT_CATALOG),
  describe: ({ phases }) => phases.map((phase) => getRuleLabel(phase.rule)).join(' → '),
};

/** Niveaux par palier : « Très Facile 4 · Facile 4 · … ». */
function describeTiers(catalog: readonly BaseLevelDefinition[]): string {
  return DIFFICULTY_TIER_IDS.map((tier) => {
    const count = catalog.filter((level) => level.tier === tier).length;
    return `${DIFFICULTY_TIERS[tier].label} ${String(count)}`;
  }).join(' · ');
}

/** Paliers par identifiant quelconque : un palier inconnu reste affichable (signalé ensuite). */
const TIER_META: Partial<Record<string, DifficultyTierMeta>> = DIFFICULTY_TIERS;

/** Affiche le résumé puis le verdict d'un catalogue ; renvoie son nombre d'anomalies. */
function report<TConfig>({ title, catalog, validate, describe }: CatalogCheck<TConfig>): number {
  console.log(
    `${title} : ${formatCount(catalog.length, 'niveau', 'niveaux')} (${describeTiers(catalog)})`,
  );
  // Seuls les paliers connus se classent comme sur la carte ; un niveau au palier inconnu est
  // listé à la fin, puis signalé en français par le validateur (jamais par une trace de pile).
  const known = catalog.filter((level) => DIFFICULTY_TIER_IDS.includes(level.tier));
  const unknown = catalog.filter((level) => !DIFFICULTY_TIER_IDS.includes(level.tier));
  for (const [index, level] of [...sortLevels(known), ...unknown].entries()) {
    const star = `#${String(index + 1)}`.padEnd(4);
    const tier = (TIER_META[level.tier]?.label ?? level.tier).padEnd(14);
    console.log(`  ${star} ${level.id.padEnd(8)} ${tier} ${describe(level.config)}`);
  }
  const { errors } = validate();
  for (const error of errors) console.error(`  ✘ ${error}`);
  console.log(
    errors.length === 0
      ? '  ✔ Catalogue valide.'
      : `  ✘ ${formatCount(errors.length, 'anomalie', 'anomalies')}.`,
  );
  console.log('');
  return errors.length;
}

const checks = [MEMORY, TRAFFIC_JAM, PATTERNS, BEAR_SORT] as const;
const anomalies = report(MEMORY) + report(TRAFFIC_JAM) + report(PATTERNS) + report(BEAR_SORT);
const levelCount = checks.reduce((total, check) => total + check.catalog.length, 0);

if (anomalies > 0) {
  console.error(
    `Validation des niveaux : ${formatCount(anomalies, 'anomalie', 'anomalies')} dans ${String(checks.length)} catalogues.`,
  );
  process.exit(1);
}
console.log(
  `Validation des niveaux : ${formatCount(levelCount, 'niveau valide', 'niveaux valides')} dans ${String(checks.length)} catalogues.`,
);
