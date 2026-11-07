import { validateLevelCatalog } from '@/core/progression/catalog-validator';
import type { BaseLevelDefinition, CatalogValidationResult } from '@/core/progression/types';
import { createLogicGridGame, getLogicGridConfigErrors } from './engine';
import { createSeededRng, MAX_CLUES } from './generator';
import { countSolutions } from './solver';
import type { ClueKind, LogicGridLevelConfig, LogicGridPuzzle } from './types';

export type LogicGridLevel = BaseLevelDefinition<LogicGridLevelConfig>;

const ALL_KINDS: readonly ClueKind[] = ['cell', 'line', 'pair', 'next'];

/**
 * Catalogue initial de Chacun sa Place (FEAT-27), en dents de scie : chaque palier apporte une sorte
 * de carte sur un petit plateau, puis le plateau grandit sur ses quatre étoiles. Très Facile : une case,
 * deux pièces qui se touchent. Facile : lignes, colonnes et pièces collées, deux cartes à croiser.
 * Moyen : les cartes barrées. Difficile : les familles (toutes les pièces d'une forme ou d'une
 * couleur). Très Difficile : tout à la fois, jusqu'à huit pièces, et la seule pièce qui peut aller
 * dans une case. La première étoile de chaque palier (sauf le dernier) est guidée. Un niveau publié
 * n'est jamais retiré ni renommé.
 */
export const LOGIC_GRID_CATALOG: readonly LogicGridLevel[] = [
  {
    id: 'lg-001',
    gameId: 'logic-grid',
    tier: 'very_easy',
    order: 10,
    title: 'Chaque pièce à sa case',
    config: {
      freePieces: 3,
      clueKinds: ['cell'],
      allowsNegation: false,
      allowsGroups: false,
      reasoning: 'direct',
      focus: [],
      hasGuide: true,
    },
  },
  {
    id: 'lg-002',
    gameId: 'logic-grid',
    tier: 'very_easy',
    order: 20,
    title: 'Elles se touchent',
    config: {
      freePieces: 3,
      clueKinds: ['cell', 'next'],
      allowsNegation: false,
      allowsGroups: false,
      reasoning: 'direct',
      focus: ['next'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-003',
    gameId: 'logic-grid',
    tier: 'very_easy',
    order: 30,
    title: 'Une pièce de plus',
    config: {
      freePieces: 4,
      clueKinds: ['cell', 'next'],
      allowsNegation: false,
      allowsGroups: false,
      reasoning: 'direct',
      focus: ['next'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-004',
    gameId: 'logic-grid',
    tier: 'very_easy',
    order: 40,
    title: 'Cinq pièces',
    config: {
      freePieces: 5,
      clueKinds: ['cell', 'next'],
      allowsNegation: false,
      allowsGroups: false,
      reasoning: 'direct',
      focus: ['next'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-005',
    gameId: 'logic-grid',
    tier: 'easy',
    order: 10,
    title: 'Ligne et colonne',
    config: {
      freePieces: 3,
      clueKinds: ['line'],
      allowsNegation: false,
      allowsGroups: false,
      reasoning: 'combine',
      focus: ['line', 'combine'],
      hasGuide: true,
    },
  },
  {
    id: 'lg-006',
    gameId: 'logic-grid',
    tier: 'easy',
    order: 20,
    title: 'Collées',
    config: {
      freePieces: 3,
      clueKinds: ['line', 'pair'],
      allowsNegation: false,
      allowsGroups: false,
      reasoning: 'combine',
      focus: ['pair', 'combine'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-007',
    gameId: 'logic-grid',
    tier: 'easy',
    order: 30,
    title: 'Croiser les cartes',
    config: {
      freePieces: 4,
      clueKinds: ['line', 'pair', 'next'],
      allowsNegation: false,
      allowsGroups: false,
      reasoning: 'combine',
      focus: ['combine'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-008',
    gameId: 'logic-grid',
    tier: 'easy',
    order: 40,
    title: 'Toutes les cartes',
    config: {
      freePieces: 5,
      clueKinds: ALL_KINDS,
      allowsNegation: false,
      allowsGroups: false,
      reasoning: 'combine',
      focus: ['combine'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-009',
    gameId: 'logic-grid',
    tier: 'medium',
    order: 10,
    title: 'Pas ici !',
    config: {
      freePieces: 3,
      clueKinds: ['cell', 'line'],
      allowsNegation: true,
      allowsGroups: false,
      reasoning: 'combine',
      focus: ['not'],
      hasGuide: true,
    },
  },
  {
    id: 'lg-010',
    gameId: 'logic-grid',
    tier: 'medium',
    order: 20,
    title: 'Elles ne se touchent pas',
    config: {
      freePieces: 4,
      clueKinds: ['cell', 'line', 'next'],
      allowsNegation: true,
      allowsGroups: false,
      reasoning: 'combine',
      focus: ['not'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-011',
    gameId: 'logic-grid',
    tier: 'medium',
    order: 30,
    title: 'Barrées et croisées',
    config: {
      freePieces: 5,
      clueKinds: ['line', 'pair', 'next'],
      allowsNegation: true,
      allowsGroups: false,
      reasoning: 'combine',
      focus: ['not', 'combine'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-012',
    gameId: 'logic-grid',
    tier: 'medium',
    order: 40,
    title: 'Six pièces',
    config: {
      freePieces: 6,
      clueKinds: ALL_KINDS,
      allowsNegation: true,
      allowsGroups: false,
      reasoning: 'exclude',
      focus: ['not', 'combine'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-013',
    gameId: 'logic-grid',
    tier: 'hard',
    order: 10,
    title: 'Toute la famille',
    config: {
      freePieces: 4,
      clueKinds: ['line'],
      allowsNegation: false,
      allowsGroups: true,
      reasoning: 'combine',
      focus: ['group'],
      hasGuide: true,
    },
  },
  {
    id: 'lg-014',
    gameId: 'logic-grid',
    tier: 'hard',
    order: 20,
    title: 'Familles collées',
    config: {
      freePieces: 5,
      clueKinds: ['line', 'pair'],
      allowsNegation: false,
      allowsGroups: true,
      reasoning: 'combine',
      focus: ['group'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-015',
    gameId: 'logic-grid',
    tier: 'hard',
    order: 30,
    title: 'Aucune de la famille',
    config: {
      freePieces: 6,
      clueKinds: ['line', 'pair', 'next'],
      allowsNegation: true,
      allowsGroups: true,
      reasoning: 'exclude',
      focus: ['group', 'not'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-016',
    gameId: 'logic-grid',
    tier: 'hard',
    order: 40,
    title: 'Sept pièces',
    config: {
      freePieces: 7,
      clueKinds: ALL_KINDS,
      allowsNegation: true,
      allowsGroups: true,
      reasoning: 'exclude',
      focus: ['group'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-017',
    gameId: 'logic-grid',
    tier: 'very_hard',
    order: 10,
    title: 'La seule qui rentre',
    config: {
      freePieces: 6,
      clueKinds: ALL_KINDS,
      allowsNegation: true,
      allowsGroups: true,
      reasoning: 'exclude',
      focus: ['exclude'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-018',
    gameId: 'logic-grid',
    tier: 'very_hard',
    order: 20,
    title: 'Sept pièces barrées',
    config: {
      freePieces: 7,
      clueKinds: ALL_KINDS,
      allowsNegation: true,
      allowsGroups: true,
      reasoning: 'exclude',
      focus: ['not', 'combine'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-019',
    gameId: 'logic-grid',
    tier: 'very_hard',
    order: 30,
    title: 'Familles et élimination',
    config: {
      freePieces: 7,
      clueKinds: ALL_KINDS,
      allowsNegation: true,
      allowsGroups: true,
      reasoning: 'exclude',
      focus: ['group', 'exclude'],
      hasGuide: false,
    },
  },
  {
    id: 'lg-020',
    gameId: 'logic-grid',
    tier: 'very_hard',
    order: 40,
    title: 'Grand final',
    config: {
      freePieces: 8,
      clueKinds: ALL_KINDS,
      allowsNegation: true,
      allowsGroups: true,
      reasoning: 'exclude',
      focus: ['group', 'not', 'combine'],
      hasGuide: false,
    },
  },
];

/** Parties tirées par niveau pour le valider, chacune avec sa graine : la validation est reproductible. */
export const VALIDATION_SEEDS: readonly number[] = [1, 2, 3, 4];

/** Anomalies d'un puzzle tiré : trop de cartes, ou pas exactement une solution. */
function getPuzzleErrors(puzzle: LogicGridPuzzle): string[] {
  const errors: string[] = [];
  if (puzzle.clues.length > MAX_CLUES) {
    errors.push(`${String(puzzle.clues.length)} cartes (au plus ${String(MAX_CLUES)})`);
  }
  const start = puzzle.solution.map((piece, cell) =>
    puzzle.lockedCells.includes(cell) ? piece : null,
  );
  const solutions = countSolutions(start, puzzle.clues);
  if (solutions !== 1) errors.push(`${String(solutions)} solutions au lieu d’une`);
  return errors;
}

/**
 * Anomalies propres à un niveau : celles de sa configuration, puis, pour une configuration sans
 * anomalie, une partie par graine de `VALIDATION_SEEDS` (chaque puzzle : au plus `MAX_CLUES` cartes,
 * une seule solution, recomptée par recherche exhaustive).
 */
function getLogicGridLevelErrors(config: LogicGridLevelConfig): string[] {
  const errors = getLogicGridConfigErrors(config);
  if (errors.length > 0) return errors;
  for (const seed of VALIDATION_SEEDS) {
    try {
      const game = createLogicGridGame(config, createSeededRng(seed));
      for (const puzzle of game.puzzles) {
        errors.push(...getPuzzleErrors(puzzle).map((error) => `graine ${String(seed)} : ${error}`));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`graine ${String(seed)} : instanciation impossible : ${message}`);
    }
  }
  return errors;
}

/**
 * Validation du catalogue (test du catalogue, `npm run validate:levels`) : règles communes de
 * `validateLevelCatalog`, puis règles propres de chaque niveau, préfixées de son nom. Un message
 * français par anomalie.
 */
export function validateLogicGridCatalog(
  catalog: readonly LogicGridLevel[] = LOGIC_GRID_CATALOG,
): CatalogValidationResult {
  const errors = [...validateLevelCatalog('logic-grid', catalog).errors];
  for (const [index, level] of catalog.entries()) {
    const name = `niveau n° ${String(index + 1)} « ${level.id} »`;
    errors.push(...getLogicGridLevelErrors(level.config).map((error) => `${name} : ${error}`));
  }
  return { valid: errors.length === 0, errors };
}
