import { validateLevelCatalog } from '@/core/progression/catalog-validator';
import type { BaseLevelDefinition, CatalogValidationResult } from '@/core/progression/types';
import { getBearSortConfigErrors } from './engine';
import type { BearSortLevelConfig, BearSortRule, BearTraits } from './types';

/**
 * Catalogue initial d'Attrape-Piège (FEAT-25) : 20 étoiles, de la couleur seule à « sauf un grand
 * ours bleu ». Données seules, en TypeScript pur (sans React) : le registre des jeux, la page
 * `/bear-sort` et le script `validate:levels` l'importent. Ce module n'importe que des modules,
 * jamais le barrel `@/core/progression` : il ré-exporte le registre, qui importe ce catalogue
 * (cycle).
 *
 * Un niveau publié n'est jamais retiré ni renommé : son `id` est la clé de la sauvegarde des
 * joueurs. Un nouveau niveau s'intercale avec un `order` libre (15, 25…).
 *
 * Les boîtes s'opposent par la couleur et par la taille. Un ours est en conflit quand ces deux
 * critères l'envoient dans des boîtes différentes : `blue-big` et `yellow-small` avec une petite
 * boîte bleue et une grande boîte jaune, `blue-small` et `yellow-big` avec l'appariement inverse.
 * La difficulté se règle par la part de ces ours, la longueur des séries, le nombre de changements
 * et la forme de la négation. Le test de référence (Dimensional Change Card Sort) enchaîne 6 cartes
 * avant et 6 après le changement : c'est la série de départ.
 */

type BearSortLevel = BaseLevelDefinition<BearSortLevelConfig>;

const BY_COLOR: BearSortRule = { kind: 'sort', feature: 'color' };
const BY_SIZE: BearSortRule = { kind: 'sort', feature: 'size' };

const SMALL_BLUE: BearTraits = { color: 'blue', size: 'small' };
const BIG_BLUE: BearTraits = { color: 'blue', size: 'big' };
const SMALL_YELLOW: BearTraits = { color: 'yellow', size: 'small' };
const BIG_YELLOW: BearTraits = { color: 'yellow', size: 'big' };

/** Série d'ouverture de 8 ours, dont 6 à ranger : 2 attendent encore quand le STOP arrive. */
const OPENING_BEARS = { 'blue-small': 2, 'blue-big': 2, 'yellow-small': 2, 'yellow-big': 2 };

/** Les 20 étoiles initiales (FEAT-25 §3.1), déclarées dans l'ordre de la Carte des Étoiles. */
export const BEAR_SORT_CATALOG: readonly BearSortLevel[] = [
  // Très Facile (Éveil) : le geste d'abord, puis un seul changement, dans les deux sens.
  {
    id: 'bs-001',
    gameId: 'bear-sort',
    tier: 'very_easy',
    order: 10,
    title: 'Premier rangement',
    config: {
      zones: [SMALL_BLUE, BIG_YELLOW],
      phases: [
        {
          rule: BY_COLOR,
          addBears: { 'blue-small': 2, 'yellow-big': 2, 'blue-big': 1, 'yellow-small': 1 },
          placements: null,
        },
      ],
      showGestureHint: true,
    },
  },
  {
    id: 'bs-002',
    gameId: 'bear-sort',
    tier: 'very_easy',
    order: 20,
    title: 'Premier piège',
    config: {
      zones: [SMALL_BLUE, BIG_YELLOW],
      phases: [
        { rule: BY_COLOR, addBears: OPENING_BEARS, placements: 6 },
        {
          rule: BY_SIZE,
          addBears: { 'blue-small': 1, 'blue-big': 1, 'yellow-small': 1, 'yellow-big': 1 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-003',
    gameId: 'bear-sort',
    tier: 'very_easy',
    order: 30,
    title: 'Boîtes échangées',
    config: {
      zones: [BIG_YELLOW, SMALL_BLUE],
      phases: [
        { rule: BY_COLOR, addBears: OPENING_BEARS, placements: 6 },
        {
          rule: BY_SIZE,
          addBears: { 'blue-big': 2, 'yellow-small': 1, 'yellow-big': 1 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-004',
    gameId: 'bear-sort',
    tier: 'very_easy',
    order: 40,
    title: 'La taille d’abord',
    config: {
      zones: [SMALL_BLUE, BIG_YELLOW],
      phases: [
        { rule: BY_SIZE, addBears: OPENING_BEARS, placements: 6 },
        {
          rule: BY_COLOR,
          addBears: { 'blue-small': 1, 'blue-big': 1, 'yellow-small': 1, 'yellow-big': 1 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },

  // Facile (Initié) : une habitude plus longue à briser (8 ours), plus d'ours en conflit ensuite.
  {
    id: 'bs-005',
    gameId: 'bear-sort',
    tier: 'easy',
    order: 10,
    title: 'Longue série',
    config: {
      zones: [BIG_BLUE, SMALL_YELLOW],
      phases: [
        {
          rule: BY_COLOR,
          addBears: { 'blue-big': 3, 'yellow-small': 3, 'blue-small': 2, 'yellow-big': 2 },
          placements: 8,
        },
        {
          rule: BY_SIZE,
          addBears: { 'blue-small': 2, 'yellow-big': 2, 'blue-big': 1, 'yellow-small': 1 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-006',
    gameId: 'bear-sort',
    tier: 'easy',
    order: 20,
    title: 'Longue série, taille d’abord',
    config: {
      zones: [SMALL_YELLOW, BIG_BLUE],
      phases: [
        {
          rule: BY_SIZE,
          addBears: { 'blue-big': 3, 'yellow-small': 3, 'blue-small': 2, 'yellow-big': 2 },
          placements: 8,
        },
        {
          rule: BY_COLOR,
          addBears: { 'blue-small': 2, 'yellow-big': 2, 'blue-big': 1, 'yellow-small': 1 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-007',
    gameId: 'bear-sort',
    tier: 'easy',
    order: 30,
    title: 'Presque que des pièges',
    config: {
      zones: [SMALL_BLUE, BIG_YELLOW],
      phases: [
        {
          rule: BY_COLOR,
          addBears: { 'blue-small': 3, 'yellow-big': 3, 'blue-big': 2, 'yellow-small': 2 },
          placements: 8,
        },
        {
          rule: BY_SIZE,
          addBears: { 'blue-big': 3, 'yellow-small': 2, 'blue-small': 1 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-008',
    gameId: 'bear-sort',
    tier: 'easy',
    order: 40,
    title: 'Pièges en sens inverse',
    config: {
      zones: [BIG_YELLOW, SMALL_BLUE],
      phases: [
        {
          rule: BY_SIZE,
          addBears: { 'blue-small': 3, 'yellow-big': 3, 'blue-big': 2, 'yellow-small': 2 },
          placements: 8,
        },
        {
          rule: BY_COLOR,
          addBears: { 'blue-big': 3, 'yellow-small': 2, 'yellow-big': 1 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },

  // Moyen (Confirmé) : aller-retour entre les règles, le plus dur étant de revenir à la première.
  {
    id: 'bs-009',
    gameId: 'bear-sort',
    tier: 'medium',
    order: 10,
    title: 'Aller-retour',
    config: {
      zones: [SMALL_BLUE, BIG_YELLOW],
      phases: [
        { rule: BY_COLOR, addBears: OPENING_BEARS, placements: 6 },
        {
          rule: BY_SIZE,
          addBears: { 'blue-big': 2, 'yellow-small': 1, 'blue-small': 1 },
          placements: 4,
        },
        {
          rule: BY_COLOR,
          addBears: { 'blue-big': 1, 'yellow-small': 2, 'yellow-big': 1 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-010',
    gameId: 'bear-sort',
    tier: 'medium',
    order: 20,
    title: 'Retour à la taille',
    config: {
      zones: [BIG_BLUE, SMALL_YELLOW],
      phases: [
        { rule: BY_SIZE, addBears: OPENING_BEARS, placements: 6 },
        {
          rule: BY_COLOR,
          addBears: { 'blue-small': 2, 'yellow-big': 1, 'yellow-small': 1 },
          placements: 4,
        },
        {
          rule: BY_SIZE,
          addBears: { 'blue-small': 1, 'yellow-big': 2, 'blue-big': 1 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-011',
    gameId: 'bear-sort',
    tier: 'medium',
    order: 30,
    title: 'Quatre règles',
    config: {
      zones: [SMALL_YELLOW, BIG_BLUE],
      phases: [
        {
          rule: BY_COLOR,
          addBears: { 'blue-big': 2, 'yellow-small': 2, 'blue-small': 1, 'yellow-big': 1 },
          placements: 4,
        },
        {
          rule: BY_SIZE,
          addBears: { 'blue-small': 2, 'yellow-big': 1, 'yellow-small': 1 },
          placements: 4,
        },
        {
          rule: BY_COLOR,
          addBears: { 'blue-small': 1, 'yellow-big': 2, 'blue-big': 1 },
          placements: 4,
        },
        { rule: BY_SIZE, addBears: { 'blue-small': 1, 'yellow-big': 1 }, placements: null },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-012',
    gameId: 'bear-sort',
    tier: 'medium',
    order: 40,
    title: 'Quatre règles, taille d’abord',
    config: {
      zones: [BIG_YELLOW, SMALL_BLUE],
      phases: [
        {
          rule: BY_SIZE,
          addBears: { 'blue-small': 2, 'yellow-big': 2, 'blue-big': 1, 'yellow-small': 1 },
          placements: 4,
        },
        {
          rule: BY_COLOR,
          addBears: { 'blue-big': 2, 'yellow-small': 1, 'yellow-big': 1 },
          placements: 4,
        },
        {
          rule: BY_SIZE,
          addBears: { 'blue-big': 1, 'yellow-small': 2, 'blue-small': 1 },
          placements: 4,
        },
        { rule: BY_COLOR, addBears: { 'blue-big': 1, 'yellow-small': 1 }, placements: null },
      ],
      showGestureHint: false,
    },
  },

  // Difficile (Expert) : la négation d'une seule caractéristique, marche vers la suivante.
  {
    id: 'bs-013',
    gameId: 'bear-sort',
    tier: 'hard',
    order: 10,
    title: 'Sauf les bleus',
    config: {
      zones: [SMALL_BLUE, BIG_YELLOW],
      phases: [
        { rule: BY_COLOR, addBears: OPENING_BEARS, placements: 6 },
        {
          rule: { kind: 'except', forbidden: { color: 'blue' } },
          addBears: { 'blue-small': 1, 'blue-big': 1, 'yellow-small': 2, 'yellow-big': 2 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-014',
    gameId: 'bear-sort',
    tier: 'hard',
    order: 20,
    title: 'Sauf les petits',
    config: {
      zones: [BIG_BLUE, SMALL_YELLOW],
      phases: [
        { rule: BY_SIZE, addBears: OPENING_BEARS, placements: 6 },
        {
          rule: { kind: 'except', forbidden: { size: 'small' } },
          addBears: { 'blue-small': 1, 'yellow-small': 1, 'blue-big': 2, 'yellow-big': 2 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-015',
    gameId: 'bear-sort',
    tier: 'hard',
    order: 30,
    title: 'Sauf les jaunes',
    config: {
      zones: [SMALL_YELLOW, BIG_BLUE],
      phases: [
        { rule: BY_COLOR, addBears: OPENING_BEARS, placements: 6 },
        {
          rule: BY_SIZE,
          addBears: { 'blue-small': 2, 'yellow-big': 1, 'yellow-small': 1 },
          placements: 4,
        },
        {
          rule: { kind: 'except', forbidden: { color: 'yellow' } },
          addBears: { 'yellow-small': 1, 'yellow-big': 1, 'blue-small': 2, 'blue-big': 2 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-016',
    gameId: 'bear-sort',
    tier: 'hard',
    order: 40,
    title: 'Sauf les grands',
    config: {
      zones: [BIG_YELLOW, SMALL_BLUE],
      phases: [
        { rule: BY_SIZE, addBears: OPENING_BEARS, placements: 6 },
        {
          rule: BY_COLOR,
          addBears: { 'blue-big': 2, 'yellow-small': 1, 'yellow-big': 1 },
          placements: 4,
        },
        {
          rule: { kind: 'except', forbidden: { size: 'big' } },
          addBears: { 'blue-big': 1, 'yellow-big': 1, 'blue-small': 2, 'yellow-small': 2 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },

  // Très Difficile (Maître) : la négation de deux caractéristiques à la fois, et ses faux amis
  // (qui ne partagent qu'une des deux avec l'ours interdit, et restent donc permis).
  {
    id: 'bs-017',
    gameId: 'bear-sort',
    tier: 'very_hard',
    order: 10,
    title: 'Sauf le petit bleu',
    config: {
      zones: [SMALL_BLUE, BIG_YELLOW],
      phases: [
        { rule: BY_COLOR, addBears: OPENING_BEARS, placements: 6 },
        {
          rule: { kind: 'except', forbidden: { color: 'blue', size: 'small' } },
          addBears: { 'blue-small': 2, 'blue-big': 2, 'yellow-small': 2, 'yellow-big': 1 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-018',
    gameId: 'bear-sort',
    tier: 'very_hard',
    order: 20,
    title: 'Sauf le grand jaune',
    config: {
      zones: [BIG_BLUE, SMALL_YELLOW],
      phases: [
        { rule: BY_SIZE, addBears: OPENING_BEARS, placements: 6 },
        {
          rule: { kind: 'except', forbidden: { color: 'yellow', size: 'big' } },
          addBears: { 'yellow-big': 2, 'blue-big': 2, 'yellow-small': 2, 'blue-small': 1 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-019',
    gameId: 'bear-sort',
    tier: 'very_hard',
    order: 30,
    title: 'Sauf le petit jaune',
    config: {
      zones: [SMALL_YELLOW, BIG_BLUE],
      phases: [
        { rule: BY_COLOR, addBears: OPENING_BEARS, placements: 6 },
        {
          rule: BY_SIZE,
          addBears: { 'blue-small': 2, 'yellow-big': 1, 'yellow-small': 1 },
          placements: 4,
        },
        {
          rule: { kind: 'except', forbidden: { color: 'yellow', size: 'small' } },
          addBears: { 'yellow-small': 2, 'yellow-big': 2, 'blue-small': 2, 'blue-big': 1 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
  {
    id: 'bs-020',
    gameId: 'bear-sort',
    tier: 'very_hard',
    order: 40,
    title: 'Le grand piège',
    config: {
      zones: [BIG_BLUE, SMALL_YELLOW],
      phases: [
        { rule: BY_COLOR, addBears: OPENING_BEARS, placements: 6 },
        {
          rule: BY_SIZE,
          addBears: { 'blue-small': 2, 'yellow-big': 1, 'yellow-small': 1 },
          placements: 4,
        },
        {
          rule: BY_COLOR,
          addBears: { 'blue-small': 1, 'yellow-big': 2, 'blue-big': 1 },
          placements: 4,
        },
        {
          rule: { kind: 'except', forbidden: { color: 'blue', size: 'big' } },
          addBears: { 'blue-big': 2, 'blue-small': 2, 'yellow-big': 2, 'yellow-small': 1 },
          placements: null,
        },
      ],
      showGestureHint: false,
    },
  },
];

/**
 * Validateur du catalogue, repris par `validate:levels` : règles communes (`validateLevelCatalog`)
 * et configuration de chaque niveau (`getBearSortConfigErrors`).
 */
export function validateBearSortCatalog(
  catalog: readonly BearSortLevel[] = BEAR_SORT_CATALOG,
): CatalogValidationResult {
  const errors = [...validateLevelCatalog('bear-sort', catalog).errors];
  for (const [index, level] of catalog.entries()) {
    const name = `niveau n° ${String(index + 1)} « ${level.id} »`;
    errors.push(...getBearSortConfigErrors(level.config).map((error) => `${name} : ${error}`));
  }
  return { valid: errors.length === 0, errors };
}
