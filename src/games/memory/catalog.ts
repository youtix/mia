import { validateLevelCatalog } from '@/core/progression/catalog-validator';
import type { BaseLevelDefinition, CatalogValidationResult } from '@/core/progression/types';
import { createMemoryGame, getMemoryConfigErrors } from './engine';
import type { MemoryLevelConfig } from './types';

/**
 * Catalogue initial de Memory (FEAT-11) : 20 étoiles, de la grille 2 × 2 avec aperçu au 6 × 6
 * abstrait dont les cartes permutent. Données seules, en TypeScript pur (sans React) : le registre
 * des jeux, la page `/memory` et le script `validate:levels` (FEAT-14) l'importent. Ce module
 * n'importe que des modules, jamais le barrel `@/core/progression` : il ré-exporte le registre,
 * qui importe ce catalogue (cycle).
 *
 * Un niveau publié n'est jamais retiré ni renommé : son `id` est la clé de la sauvegarde des
 * joueurs (`countProfileStars` divergerait du Hub). Changer son palier ou son `order` est sans
 * risque (numéros d'étoile recalculés, niveaux réussis toujours débloqués) ; un nouveau niveau
 * s'intercale avec un `order` libre (15, 25…) et se vérifie par `validateMemoryCatalog`.
 */

type MemoryLevel = BaseLevelDefinition<MemoryLevelConfig>;

/** Les 20 étoiles initiales (FEAT-11 §3.1), déclarées dans l'ordre de la Carte des Étoiles. */
export const MEMORY_CATALOG: readonly MemoryLevel[] = [
  // Très Facile (Éveil) : apprendre la règle sur 4 à 8 cartes. Chaque paire a sa couleur et son
  // icône, l'aperçu montre les cartes puis se raccourcit ; les erreurs ne sont pas limitées.
  {
    id: 'mem-001',
    gameId: 'memory',
    tier: 'very_easy',
    order: 10,
    title: 'Premiers pas',
    config: {
      cols: 2,
      rows: 2,
      matchSize: 2,
      visualMode: 'distinct_color_shape',
      previewSeconds: 3,
      maxMistakes: null,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 0,
    },
  },
  {
    id: 'mem-002',
    gameId: 'memory',
    tier: 'very_easy',
    order: 20,
    title: 'Trois paires',
    config: {
      cols: 3,
      rows: 2,
      matchSize: 2,
      visualMode: 'distinct_color_shape',
      previewSeconds: 3,
      maxMistakes: null,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 1,
    },
  },
  {
    id: 'mem-003',
    gameId: 'memory',
    tier: 'very_easy',
    order: 30,
    title: 'Sans aperçu',
    config: {
      cols: 3,
      rows: 2,
      matchSize: 2,
      visualMode: 'distinct_color_shape',
      previewSeconds: 0,
      maxMistakes: null,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 2,
    },
  },
  {
    id: 'mem-004',
    gameId: 'memory',
    tier: 'very_easy',
    order: 40,
    title: 'Quatre paires',
    config: {
      cols: 4,
      rows: 2,
      matchSize: 2,
      visualMode: 'distinct_color_shape',
      previewSeconds: 2,
      maxMistakes: null,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 2,
    },
  },
  // Facile (Initié) : jusqu'à 12 cartes. La palette d'un thème (3 couleurs partagées) retire
  // l'indice de la couleur unique ; les erreurs restent illimitées, la couronne se mérite.
  {
    id: 'mem-005',
    gameId: 'memory',
    tier: 'easy',
    order: 10,
    title: 'Première palette',
    config: {
      cols: 4,
      rows: 2,
      matchSize: 2,
      visualMode: 'thematic_palette',
      previewSeconds: 0,
      maxMistakes: null,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 3,
    },
  },
  {
    id: 'mem-006',
    gameId: 'memory',
    tier: 'easy',
    order: 20,
    title: 'Cinq paires',
    config: {
      cols: 5,
      rows: 2,
      matchSize: 2,
      visualMode: 'distinct_color_shape',
      previewSeconds: 2,
      maxMistakes: null,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 3,
    },
  },
  {
    id: 'mem-007',
    gameId: 'memory',
    tier: 'easy',
    order: 30,
    title: 'Dix cartes à thème',
    config: {
      cols: 5,
      rows: 2,
      matchSize: 2,
      visualMode: 'thematic_palette',
      previewSeconds: 0,
      maxMistakes: null,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 4,
    },
  },
  {
    id: 'mem-008',
    gameId: 'memory',
    tier: 'easy',
    order: 40,
    title: 'Douze cartes',
    config: {
      cols: 4,
      rows: 3,
      matchSize: 2,
      visualMode: 'thematic_palette',
      previewSeconds: 0,
      maxMistakes: null,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 4,
    },
  },
  // Moyen (Confirmé) : 12 à 20 cartes. Le monochrome ne laisse que la forme pour distinguer les
  // paires, et une limite d'erreurs apparaît : la partie peut désormais être perdue.
  {
    id: 'mem-009',
    gameId: 'memory',
    tier: 'medium',
    order: 10,
    title: 'Une seule couleur',
    config: {
      cols: 4,
      rows: 3,
      matchSize: 2,
      visualMode: 'monochrome',
      previewSeconds: 2,
      maxMistakes: 10,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 4,
    },
  },
  {
    id: 'mem-010',
    gameId: 'memory',
    tier: 'medium',
    order: 20,
    title: 'Carré de seize',
    config: {
      cols: 4,
      rows: 4,
      matchSize: 2,
      visualMode: 'thematic_palette',
      previewSeconds: 2,
      maxMistakes: 12,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 5,
    },
  },
  {
    id: 'mem-011',
    gameId: 'memory',
    tier: 'medium',
    order: 30,
    title: 'Seize en monochrome',
    config: {
      cols: 4,
      rows: 4,
      matchSize: 2,
      visualMode: 'monochrome',
      previewSeconds: 0,
      maxMistakes: 12,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 6,
    },
  },
  {
    id: 'mem-012',
    gameId: 'memory',
    tier: 'medium',
    order: 40,
    title: 'Vingt cartes',
    config: {
      cols: 5,
      rows: 4,
      matchSize: 2,
      visualMode: 'thematic_palette',
      previewSeconds: 0,
      maxMistakes: 14,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 7,
    },
  },
  // Difficile (Expert) : 15 à 24 cartes, limites d'erreurs plus serrées, premiers triplets et
  // formes abstraites dont seule l'orientation change.
  {
    id: 'mem-013',
    gameId: 'memory',
    tier: 'hard',
    order: 10,
    title: 'Vingt en monochrome',
    config: {
      cols: 5,
      rows: 4,
      matchSize: 2,
      visualMode: 'monochrome',
      previewSeconds: 0,
      maxMistakes: 12,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 6,
    },
  },
  {
    id: 'mem-014',
    gameId: 'memory',
    tier: 'hard',
    order: 20,
    title: 'Vingt-quatre cartes',
    config: {
      cols: 6,
      rows: 4,
      matchSize: 2,
      visualMode: 'thematic_palette',
      previewSeconds: 0,
      maxMistakes: 15,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 8,
    },
  },
  {
    id: 'mem-015',
    gameId: 'memory',
    tier: 'hard',
    order: 30,
    title: 'Premiers triplets',
    config: {
      cols: 5,
      rows: 3,
      matchSize: 3,
      visualMode: 'distinct_color_shape',
      previewSeconds: 3,
      maxMistakes: 10,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 4,
    },
  },
  {
    id: 'mem-016',
    gameId: 'memory',
    tier: 'hard',
    order: 40,
    title: 'Formes tournées',
    config: {
      cols: 6,
      rows: 4,
      matchSize: 2,
      visualMode: 'abstract_orientation',
      previewSeconds: 0,
      maxMistakes: 14,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 8,
    },
  },
  // Très Difficile (Maître) : 20 à 36 cartes, triplets à thème, puis des cartes qui permutent
  // toutes les 4 ou 5 erreurs : mémoriser ne suffit plus, il faut aussi suivre les échanges.
  {
    id: 'mem-017',
    gameId: 'memory',
    tier: 'very_hard',
    order: 10,
    title: 'Trente cartes',
    config: {
      cols: 6,
      rows: 5,
      matchSize: 2,
      visualMode: 'monochrome',
      previewSeconds: 0,
      maxMistakes: 18,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 10,
    },
  },
  {
    id: 'mem-018',
    gameId: 'memory',
    tier: 'very_hard',
    order: 20,
    title: 'Triplets à thème',
    config: {
      cols: 6,
      rows: 4,
      matchSize: 3,
      visualMode: 'thematic_palette',
      previewSeconds: 3,
      maxMistakes: 14,
      swapEveryNMistakes: null,
      perfectMaxMistakes: 6,
    },
  },
  {
    id: 'mem-019',
    gameId: 'memory',
    tier: 'very_hard',
    order: 30,
    title: 'Cartes qui permutent',
    config: {
      cols: 5,
      rows: 4,
      matchSize: 2,
      visualMode: 'monochrome',
      previewSeconds: 0,
      maxMistakes: 12,
      swapEveryNMistakes: 4,
      perfectMaxMistakes: 6,
    },
  },
  {
    id: 'mem-020',
    gameId: 'memory',
    tier: 'very_hard',
    order: 40,
    title: 'Grand final',
    config: {
      cols: 6,
      rows: 6,
      matchSize: 2,
      visualMode: 'abstract_orientation',
      previewSeconds: 0,
      maxMistakes: 20,
      swapEveryNMistakes: 5,
      perfectMaxMistakes: 10,
    },
  },
];

/**
 * Anomalies propres à un niveau : celles de sa configuration (`getMemoryConfigErrors` : grille
 * divisible en au moins 2 groupes, capacité du mode visuel, règles entières et cohérentes), puis,
 * pour une configuration sans anomalie, son instanciation par `createMemoryGame` (tirage des
 * symboles compris) : défense en profondeur contre une règle du moteur que le validateur ignorerait.
 * Une configuration déjà en anomalie n'est pas instanciée, `createMemoryGame` en répéterait les
 * messages.
 */
function getMemoryLevelErrors(config: MemoryLevelConfig): string[] {
  const errors = getMemoryConfigErrors(config);
  if (errors.length > 0) return errors;
  try {
    createMemoryGame(config);
    return [];
  } catch (error) {
    return [`instanciation impossible : ${error instanceof Error ? error.message : String(error)}`];
  }
}

/**
 * Validation du catalogue Memory (test du catalogue, `npm run validate:levels`) : règles communes
 * de `validateLevelCatalog` (identifiant `LEVEL_ID_PATTERN` unique, jeu, palier, `order` unique
 * dans son palier), puis règles propres de chaque niveau, préfixées de son nom comme les règles
 * communes (« niveau n° 3 « mem-003 » : … »). Un message français par anomalie.
 */
export function validateMemoryCatalog(
  catalog: readonly MemoryLevel[] = MEMORY_CATALOG,
): CatalogValidationResult {
  const errors = [...validateLevelCatalog('memory', catalog).errors];
  for (const [index, level] of catalog.entries()) {
    const name = `niveau n° ${String(index + 1)} « ${level.id} »`;
    errors.push(...getMemoryLevelErrors(level.config).map((error) => `${name} : ${error}`));
  }
  return { valid: errors.length === 0, errors };
}
