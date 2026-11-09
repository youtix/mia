import { validateLevelCatalog } from '@/core/progression/catalog-validator';
import type { BaseLevelDefinition, CatalogValidationResult } from '@/core/progression/types';
// Module pur du Chacun sa Place : le générateur à graine rend la validation reproductible.
import { createSeededRng } from '@/games/logic-grid/generator';
import { createGoNoGoGame, getGoNoGoConfigErrors, TRAP_FREE_APPEARANCES } from './engine';
import { simulateStar, WINNING_PROFILES } from './simulation';
import { isFlyingImage } from './subjects';
import type { GoNoGoLevelConfig, GoNoGoState } from './types';

export type GoNoGoLevel = BaseLevelDefinition<GoNoGoLevelConfig>;

/** Réglages communs : la règle 1 n'a ni STOP tardif, ni leurre, ni image. */
const OWL = {
  rule: 'owl-says',
  stops: 0,
  hasLure: false,
  stopDelayCeilingMs: null,
  maxTrapRun: 1,
} as const;

/** La règle 2 « Ça vole ? » : des images, jamais deux pièges d'affilée au-delà de deux. */
const FLIES = {
  rule: 'flies',
  stops: 0,
  hideouts: 1,
  decoys: [],
  stopDelayCeilingMs: null,
  maxTrapRun: 2,
} as const;

/** La règle 3, le STOP tardif : toutes les images volent. */
const LATE_STOP = {
  rule: 'late-stop',
  hideouts: 1,
  decoys: [],
  hasLure: false,
  maxTrapRun: 2,
} as const;

/**
 * Catalogue initial de Pas si vite ! (FEAT-28 §7), les valeurs de départ du cadrage. Très Facile et
 * Facile : « La chouette a dit » (un puis trois castelets, un puis deux imposteurs), de plus en plus
 * vite. Moyen : « Ça vole ? ». Difficile : la chouette tend le piège (leurre). Très Difficile : le STOP
 * tardif, seul puis mêlé à « Ça vole ? ». La première étoile de chaque règle a sa démo (⭐ 1, 9, 17), la
 * 13ᵉ une démo courte. Un niveau publié n'est jamais retiré ni renommé.
 */
export const GO_NO_GO_CATALOG: readonly GoNoGoLevel[] = [
  {
    id: 'gn-001',
    gameId: 'go-no-go',
    tier: 'very_easy',
    order: 10,
    title: 'La chouette a dit',
    config: {
      ...OWL,
      appearances: 12,
      traps: 3,
      startWindowMs: 2500,
      fastestWindowMs: 2000,
      hideouts: 1,
      decoys: ['fox'],
      intro: 'full',
    },
  },
  {
    id: 'gn-002',
    gameId: 'go-no-go',
    tier: 'very_easy',
    order: 20,
    title: 'Le renard s’en mêle',
    config: {
      ...OWL,
      appearances: 16,
      traps: 4,
      startWindowMs: 2400,
      fastestWindowMs: 1800,
      hideouts: 1,
      decoys: ['fox'],
      intro: null,
    },
  },
  {
    id: 'gn-003',
    gameId: 'go-no-go',
    tier: 'very_easy',
    order: 30,
    title: 'Un peu plus vite',
    config: {
      ...OWL,
      appearances: 16,
      traps: 4,
      startWindowMs: 2200,
      fastestWindowMs: 1600,
      hideouts: 1,
      decoys: ['fox'],
      intro: null,
    },
  },
  {
    id: 'gn-004',
    gameId: 'go-no-go',
    tier: 'very_easy',
    order: 40,
    title: 'Une série plus longue',
    config: {
      ...OWL,
      appearances: 20,
      traps: 5,
      startWindowMs: 2200,
      fastestWindowMs: 1500,
      hideouts: 1,
      decoys: ['fox'],
      intro: null,
    },
  },
  {
    id: 'gn-005',
    gameId: 'go-no-go',
    tier: 'easy',
    order: 10,
    title: 'Trois cachettes',
    config: {
      ...OWL,
      appearances: 20,
      traps: 5,
      startWindowMs: 2000,
      fastestWindowMs: 1400,
      hideouts: 3,
      decoys: ['fox'],
      intro: null,
    },
  },
  {
    id: 'gn-006',
    gameId: 'go-no-go',
    tier: 'easy',
    order: 20,
    title: 'Le chat gris',
    config: {
      ...OWL,
      appearances: 20,
      traps: 5,
      startWindowMs: 2000,
      fastestWindowMs: 1300,
      hideouts: 3,
      decoys: ['fox', 'cat'],
      intro: null,
    },
  },
  {
    id: 'gn-007',
    gameId: 'go-no-go',
    tier: 'easy',
    order: 30,
    title: 'L’habitude se renforce',
    config: {
      ...OWL,
      appearances: 24,
      traps: 5,
      startWindowMs: 1800,
      fastestWindowMs: 1200,
      hideouts: 3,
      decoys: ['fox', 'cat'],
      intro: null,
    },
  },
  {
    id: 'gn-008',
    gameId: 'go-no-go',
    tier: 'easy',
    order: 40,
    title: 'Vite, le castelet',
    config: {
      ...OWL,
      appearances: 24,
      traps: 5,
      startWindowMs: 1800,
      fastestWindowMs: 1100,
      hideouts: 3,
      decoys: ['fox', 'cat'],
      intro: null,
    },
  },
  {
    id: 'gn-009',
    gameId: 'go-no-go',
    tier: 'medium',
    order: 10,
    title: 'Ça vole ?',
    config: {
      ...FLIES,
      appearances: 16,
      traps: 4,
      startWindowMs: 2400,
      fastestWindowMs: 1800,
      hasLure: false,
      intro: 'full',
    },
  },
  {
    id: 'gn-010',
    gameId: 'go-no-go',
    tier: 'medium',
    order: 20,
    title: 'Oiseaux et vaches',
    config: {
      ...FLIES,
      appearances: 20,
      traps: 5,
      startWindowMs: 2200,
      fastestWindowMs: 1600,
      hasLure: false,
      intro: null,
    },
  },
  {
    id: 'gn-011',
    gameId: 'go-no-go',
    tier: 'medium',
    order: 30,
    title: 'Avions et bateaux',
    config: {
      ...FLIES,
      appearances: 20,
      traps: 5,
      startWindowMs: 2000,
      fastestWindowMs: 1400,
      hasLure: false,
      intro: null,
    },
  },
  {
    id: 'gn-012',
    gameId: 'go-no-go',
    tier: 'medium',
    order: 40,
    title: 'Toutes les images',
    config: {
      ...FLIES,
      appearances: 24,
      traps: 6,
      startWindowMs: 1800,
      fastestWindowMs: 1300,
      hasLure: false,
      intro: null,
    },
  },
  {
    id: 'gn-013',
    gameId: 'go-no-go',
    tier: 'hard',
    order: 10,
    title: 'La chouette tend le piège',
    config: {
      ...FLIES,
      appearances: 20,
      traps: 5,
      startWindowMs: 2000,
      fastestWindowMs: 1500,
      hasLure: true,
      intro: 'lure',
    },
  },
  {
    id: 'gn-014',
    gameId: 'go-no-go',
    tier: 'hard',
    order: 20,
    title: 'Vache vole !',
    config: {
      ...FLIES,
      appearances: 20,
      traps: 5,
      startWindowMs: 1800,
      fastestWindowMs: 1300,
      hasLure: true,
      intro: null,
    },
  },
  {
    id: 'gn-015',
    gameId: 'go-no-go',
    tier: 'hard',
    order: 30,
    title: 'Ne te fie pas aux ailes',
    config: {
      ...FLIES,
      appearances: 24,
      traps: 6,
      startWindowMs: 1800,
      fastestWindowMs: 1200,
      hasLure: true,
      intro: null,
    },
  },
  {
    id: 'gn-016',
    gameId: 'go-no-go',
    tier: 'hard',
    order: 40,
    title: 'Seule l’image décide',
    config: {
      ...FLIES,
      appearances: 24,
      traps: 5,
      startWindowMs: 1600,
      fastestWindowMs: 1100,
      hasLure: true,
      intro: null,
    },
  },
  {
    id: 'gn-017',
    gameId: 'go-no-go',
    tier: 'very_hard',
    order: 10,
    title: 'STOP, trop tard !',
    config: {
      ...LATE_STOP,
      appearances: 20,
      traps: 0,
      stops: 5,
      startWindowMs: 1800,
      fastestWindowMs: 1400,
      stopDelayCeilingMs: 300,
      intro: 'full',
    },
  },
  {
    id: 'gn-018',
    gameId: 'go-no-go',
    tier: 'very_hard',
    order: 20,
    title: 'Le STOP arrive plus tard',
    config: {
      ...LATE_STOP,
      appearances: 24,
      traps: 0,
      stops: 6,
      startWindowMs: 1600,
      fastestWindowMs: 1300,
      stopDelayCeilingMs: 350,
      intro: null,
    },
  },
  {
    id: 'gn-019',
    gameId: 'go-no-go',
    tier: 'very_hard',
    order: 30,
    title: 'Ça vole, STOP !',
    config: {
      ...LATE_STOP,
      appearances: 24,
      traps: 4,
      stops: 5,
      startWindowMs: 1800,
      fastestWindowMs: 1300,
      stopDelayCeilingMs: 350,
      intro: null,
    },
  },
  {
    id: 'gn-020',
    gameId: 'go-no-go',
    tier: 'very_hard',
    order: 40,
    title: 'Le grand final',
    config: {
      ...LATE_STOP,
      appearances: 28,
      traps: 5,
      stops: 6,
      startWindowMs: 1600,
      fastestWindowMs: 1100,
      stopDelayCeilingMs: 400,
      intro: null,
    },
  },
];

/** Parties tirées par niveau pour le valider, chacune avec sa graine : la validation est reproductible. */
export const VALIDATION_SEEDS: readonly number[] = [1, 2, 3, 4];

/** Anomalies de la file tirée : composition, début sans piège, séries de pièges, images de la règle. */
function getPlanErrors(game: GoNoGoState): string[] {
  const { config, queue } = game;
  const errors: string[] = [];
  const count = (kind: string) => queue.filter((entry) => entry.kind === kind).length;
  if (queue.length !== config.appearances) {
    errors.push(
      `${String(queue.length)} apparitions tirées au lieu de ${String(config.appearances)}`,
    );
  }
  if (count('trap') !== config.traps) {
    errors.push(`${String(count('trap'))} pièges tirés au lieu de ${String(config.traps)}`);
  }
  if (count('stop') !== config.stops) {
    errors.push(`${String(count('stop'))} STOP tirés au lieu de ${String(config.stops)}`);
  }
  if (queue.slice(0, TRAP_FREE_APPEARANCES).some((entry) => entry.kind !== 'target')) {
    errors.push(`un piège dans les ${String(TRAP_FREE_APPEARANCES)} premières apparitions`);
  }
  let run = 0;
  for (const entry of queue) {
    run = entry.kind === 'target' ? 0 : run + 1;
    if (run > config.maxTrapRun) {
      errors.push(`plus de ${String(config.maxTrapRun)} pièges d’affilée`);
      break;
    }
  }
  for (const [index, entry] of queue.entries()) {
    const previous = queue[index - 1];
    // La chouette est la seule cible de la règle 1 : elle revient forcément ; ailleurs, une image change.
    if (config.rule !== 'owl-says' && entry.subject === previous?.subject) {
      errors.push(`« ${entry.subject} » deux fois de suite`);
      break;
    }
    if (config.hideouts === 3 && entry.hideout === previous?.hideout) {
      errors.push('la même cachette deux fois de suite');
      break;
    }
    const isOwlRule = config.rule === 'owl-says';
    const isRightSubject = isOwlRule
      ? entry.kind === 'target'
        ? entry.subject === 'owl'
        : config.decoys.some((decoy) => decoy === entry.subject)
      : entry.kind === 'trap'
        ? !isFlyingImage(entry.subject)
        : isFlyingImage(entry.subject);
    if (!isRightSubject) {
      errors.push(`« ${entry.subject} » ne convient pas à une apparition « ${entry.kind} »`);
      break;
    }
    if (entry.hideout < 0 || entry.hideout >= config.hideouts) {
      errors.push(`cachette ${String(entry.hideout)} hors du castelet`);
      break;
    }
  }
  return errors;
}

/**
 * Anomalies propres à un niveau : celles de sa configuration, puis, pour une configuration sans
 * anomalie, une partie par graine de `VALIDATION_SEEDS` : la file tirée est conforme, et les enfants
 * de `WINNING_PROFILES` (attentive, réflexe, passive, qui alterne) terminent l'étoile, le premier sans
 * une erreur ni une apparition de trop (FEAT-28 §10).
 */
function getGoNoGoLevelErrors(config: GoNoGoLevelConfig): string[] {
  const errors = getGoNoGoConfigErrors(config);
  if (errors.length > 0) return errors;
  for (const seed of VALIDATION_SEEDS) {
    const prefix = `graine ${String(seed)}`;
    try {
      errors.push(
        ...getPlanErrors(createGoNoGoGame(config, createSeededRng(seed))).map(
          (error) => `${prefix} : ${error}`,
        ),
      );
      for (const profile of WINNING_PROFILES) {
        const { status, state } = simulateStar(config, profile, createSeededRng(seed));
        if (status !== 'won') {
          errors.push(
            `${prefix} : l’enfant « ${profile} » ne termine pas l’étoile (${String(state.shown)} apparitions montrées)`,
          );
        } else if (
          profile === 'attentive' &&
          (state.shown !== config.appearances || state.trapped + state.missed > 0)
        ) {
          errors.push(`${prefix} : l’enfant attentive ne finit pas sans erreur`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${prefix} : instanciation impossible : ${message}`);
    }
  }
  return errors;
}

/**
 * Validation du catalogue (test du catalogue, `npm run validate:levels`) : règles communes de
 * `validateLevelCatalog`, puis règles propres de chaque niveau, préfixées de son nom. Un message
 * français par anomalie.
 */
export function validateGoNoGoCatalog(
  catalog: readonly GoNoGoLevel[] = GO_NO_GO_CATALOG,
): CatalogValidationResult {
  const errors = [...validateLevelCatalog('go-no-go', catalog).errors];
  for (const [index, level] of catalog.entries()) {
    const name = `niveau n° ${String(index + 1)} « ${level.id} »`;
    errors.push(...getGoNoGoLevelErrors(level.config).map((error) => `${name} : ${error}`));
  }
  return { valid: errors.length === 0, errors };
}
