import { validateLevelCatalog } from '@/core/progression/catalog-validator';
import type { BaseLevelDefinition, CatalogValidationResult } from '@/core/progression/types';
import { createPatternsGame, getPatternsConfigErrors } from './engine';
import type { PatternLevelConfig } from './types';

export type PatternsLevel = BaseLevelDefinition<PatternLevelConfig>;

/**
 * Catalogue initial de Suites Logiques (FEAT-21) : A-B en animaux (Très Facile), A-B en formes
 * (Facile), A-B-B (Moyen), transfert vers les sons sur A-B (Difficile), puis sur A-B-B (Très
 * Difficile). Au sein d'un palier, la difficulté monte par la longueur de la ligne, la couleur
 * unique et le nombre de STOP. Un niveau publié n'est jamais retiré ni renommé.
 */
export const PATTERNS_CATALOG: readonly PatternsLevel[] = [
  {
    id: 'pat-001',
    gameId: 'patterns',
    tier: 'very_easy',
    order: 10,
    title: 'Chien, chat',
    config: {
      rule: 'ab',
      family: 'animals',
      colorMode: 'distinct',
      visibleItems: 4,
      answerMode: 'visual',
      soundPairing: null,
      rounds: 5,
      stopRounds: 0,
      stopSeconds: 2,
      hasGuide: true,
    },
  },
  {
    id: 'pat-002',
    gameId: 'patterns',
    tier: 'very_easy',
    order: 20,
    title: 'Premier STOP',
    config: {
      rule: 'ab',
      family: 'animals',
      colorMode: 'distinct',
      visibleItems: 4,
      answerMode: 'visual',
      soundPairing: null,
      rounds: 5,
      stopRounds: 1,
      stopSeconds: 2,
      hasGuide: false,
    },
  },
  {
    id: 'pat-003',
    gameId: 'patterns',
    tier: 'very_easy',
    order: 30,
    title: 'Une pièce de plus',
    config: {
      rule: 'ab',
      family: 'animals',
      colorMode: 'distinct',
      visibleItems: 5,
      answerMode: 'visual',
      soundPairing: null,
      rounds: 5,
      stopRounds: 1,
      stopSeconds: 2,
      hasGuide: false,
    },
  },
  {
    id: 'pat-004',
    gameId: 'patterns',
    tier: 'very_easy',
    order: 40,
    title: 'Animaux d’une seule couleur',
    config: {
      rule: 'ab',
      family: 'animals',
      colorMode: 'same',
      visibleItems: 4,
      answerMode: 'visual',
      soundPairing: null,
      rounds: 5,
      stopRounds: 1,
      stopSeconds: 2,
      hasGuide: false,
    },
  },
  {
    id: 'pat-005',
    gameId: 'patterns',
    tier: 'easy',
    order: 10,
    title: 'Formes en couleurs',
    config: {
      rule: 'ab',
      family: 'shapes',
      colorMode: 'distinct',
      visibleItems: 4,
      answerMode: 'visual',
      soundPairing: null,
      rounds: 5,
      stopRounds: 1,
      stopSeconds: 2,
      hasGuide: false,
    },
  },
  {
    id: 'pat-006',
    gameId: 'patterns',
    tier: 'easy',
    order: 20,
    title: 'Formes, une pièce de plus',
    config: {
      rule: 'ab',
      family: 'shapes',
      colorMode: 'distinct',
      visibleItems: 5,
      answerMode: 'visual',
      soundPairing: null,
      rounds: 5,
      stopRounds: 1,
      stopSeconds: 2,
      hasGuide: false,
    },
  },
  {
    id: 'pat-007',
    gameId: 'patterns',
    tier: 'easy',
    order: 30,
    title: 'Formes d’une seule couleur',
    config: {
      rule: 'ab',
      family: 'shapes',
      colorMode: 'same',
      visibleItems: 4,
      answerMode: 'visual',
      soundPairing: null,
      rounds: 5,
      stopRounds: 2,
      stopSeconds: 2,
      hasGuide: false,
    },
  },
  {
    id: 'pat-008',
    gameId: 'patterns',
    tier: 'easy',
    order: 40,
    title: 'Seule la forme compte',
    config: {
      rule: 'ab',
      family: 'shapes',
      colorMode: 'same',
      visibleItems: 5,
      answerMode: 'visual',
      soundPairing: null,
      rounds: 5,
      stopRounds: 2,
      stopSeconds: 2,
      hasGuide: false,
    },
  },
  {
    id: 'pat-009',
    gameId: 'patterns',
    tier: 'medium',
    order: 10,
    title: 'Un, puis deux',
    config: {
      rule: 'abb',
      family: 'animals',
      colorMode: 'distinct',
      visibleItems: 6,
      answerMode: 'visual',
      soundPairing: null,
      rounds: 5,
      stopRounds: 1,
      stopSeconds: 3,
      hasGuide: false,
    },
  },
  {
    id: 'pat-010',
    gameId: 'patterns',
    tier: 'medium',
    order: 20,
    title: 'Le dernier du groupe',
    config: {
      rule: 'abb',
      family: 'animals',
      colorMode: 'distinct',
      visibleItems: 5,
      answerMode: 'visual',
      soundPairing: null,
      rounds: 5,
      stopRounds: 2,
      stopSeconds: 3,
      hasGuide: false,
    },
  },
  {
    id: 'pat-011',
    gameId: 'patterns',
    tier: 'medium',
    order: 30,
    title: 'Triangle, carré, carré',
    config: {
      rule: 'abb',
      family: 'shapes',
      colorMode: 'distinct',
      visibleItems: 5,
      answerMode: 'visual',
      soundPairing: null,
      rounds: 5,
      stopRounds: 2,
      stopSeconds: 3,
      hasGuide: false,
    },
  },
  {
    id: 'pat-012',
    gameId: 'patterns',
    tier: 'medium',
    order: 40,
    title: 'A-B-B d’une seule couleur',
    config: {
      rule: 'abb',
      family: 'shapes',
      colorMode: 'same',
      visibleItems: 5,
      answerMode: 'visual',
      soundPairing: null,
      rounds: 5,
      stopRounds: 2,
      stopSeconds: 3,
      hasGuide: false,
    },
  },
  {
    id: 'pat-013',
    gameId: 'patterns',
    tier: 'hard',
    order: 10,
    title: 'Premiers sons',
    config: {
      rule: 'ab',
      family: 'shapes',
      colorMode: 'distinct',
      visibleItems: 4,
      answerMode: 'sound',
      soundPairing: 'fixed',
      rounds: 5,
      stopRounds: 0,
      stopSeconds: 3,
      hasGuide: true,
    },
  },
  {
    id: 'pat-014',
    gameId: 'patterns',
    tier: 'hard',
    order: 20,
    title: 'Chaque animal a son son',
    config: {
      rule: 'ab',
      family: 'animals',
      colorMode: 'distinct',
      visibleItems: 4,
      answerMode: 'sound',
      soundPairing: 'fixed',
      rounds: 5,
      stopRounds: 1,
      stopSeconds: 3,
      hasGuide: false,
    },
  },
  {
    id: 'pat-015',
    gameId: 'patterns',
    tier: 'hard',
    order: 30,
    title: 'Les sons changent',
    config: {
      rule: 'ab',
      family: 'shapes',
      colorMode: 'distinct',
      visibleItems: 4,
      answerMode: 'sound',
      soundPairing: 'varied',
      rounds: 5,
      stopRounds: 1,
      stopSeconds: 3,
      hasGuide: false,
    },
  },
  {
    id: 'pat-016',
    gameId: 'patterns',
    tier: 'hard',
    order: 40,
    title: 'Seule la structure compte',
    config: {
      rule: 'ab',
      family: 'animals',
      colorMode: 'same',
      visibleItems: 4,
      answerMode: 'sound',
      soundPairing: 'varied',
      rounds: 5,
      stopRounds: 2,
      stopSeconds: 3,
      hasGuide: false,
    },
  },
  {
    id: 'pat-017',
    gameId: 'patterns',
    tier: 'very_hard',
    order: 10,
    title: 'Un coup, puis deux',
    config: {
      rule: 'abb',
      family: 'shapes',
      colorMode: 'distinct',
      visibleItems: 3,
      answerMode: 'sound',
      soundPairing: 'varied',
      rounds: 5,
      stopRounds: 1,
      stopSeconds: 3,
      hasGuide: false,
    },
  },
  {
    id: 'pat-018',
    gameId: 'patterns',
    tier: 'very_hard',
    order: 20,
    title: 'A-B-B à l’oreille',
    config: {
      rule: 'abb',
      family: 'animals',
      colorMode: 'same',
      visibleItems: 3,
      answerMode: 'sound',
      soundPairing: 'varied',
      rounds: 5,
      stopRounds: 2,
      stopSeconds: 3,
      hasGuide: false,
    },
  },
  {
    id: 'pat-019',
    gameId: 'patterns',
    tier: 'very_hard',
    order: 30,
    title: 'Deux fois A-B-B',
    config: {
      rule: 'abb',
      family: 'shapes',
      colorMode: 'distinct',
      visibleItems: 6,
      answerMode: 'sound',
      soundPairing: 'varied',
      rounds: 5,
      stopRounds: 2,
      stopSeconds: 3,
      hasGuide: false,
    },
  },
  {
    id: 'pat-020',
    gameId: 'patterns',
    tier: 'very_hard',
    order: 40,
    title: 'Grand final',
    config: {
      rule: 'abb',
      family: 'shapes',
      colorMode: 'same',
      visibleItems: 6,
      answerMode: 'sound',
      soundPairing: 'varied',
      rounds: 5,
      stopRounds: 3,
      stopSeconds: 3,
      hasGuide: false,
    },
  },
];

/**
 * Anomalies propres à un niveau : celles de sa configuration, puis, pour une configuration sans
 * anomalie, son instanciation par `createPatternsGame` (tirage des défis compris).
 */
function getPatternsLevelErrors(config: PatternLevelConfig): string[] {
  const errors = getPatternsConfigErrors(config);
  if (errors.length > 0) return errors;
  try {
    createPatternsGame(config);
    return [];
  } catch (error) {
    return [`instanciation impossible : ${error instanceof Error ? error.message : String(error)}`];
  }
}

/**
 * Validation du catalogue (test du catalogue, `npm run validate:levels`) : règles communes de
 * `validateLevelCatalog`, puis règles propres de chaque niveau, préfixées de son nom. Un message
 * français par anomalie.
 */
export function validatePatternsCatalog(
  catalog: readonly PatternsLevel[] = PATTERNS_CATALOG,
): CatalogValidationResult {
  const errors = [...validateLevelCatalog('patterns', catalog).errors];
  for (const [index, level] of catalog.entries()) {
    const name = `niveau n° ${String(index + 1)} « ${level.id} »`;
    errors.push(...getPatternsLevelErrors(level.config).map((error) => `${name} : ${error}`));
  }
  return { valid: errors.length === 0, errors };
}
