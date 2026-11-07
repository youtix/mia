// Module pur de Memory : réutilisé tel quel plutôt que dupliqué (générateur injectable, mélange).
import { randomInt, shuffle, type Rng } from '@/games/memory/random';
import { getClueKind, isGroupClue, isNegatedClue, listTrueClues } from './clues';
import { CELL_COUNT, PIECE_IDS } from './grid';
import { solveLikeAChild, type ChildSolveResult } from './solver';
import type {
  Board,
  Clue,
  LogicGridFocus,
  LogicGridLevelConfig,
  LogicGridPuzzle,
  Reasoning,
} from './types';

/**
 * Générateur de puzzles de Chacun sa Place (FEAT-27). Un essai tire une solution et les cases à
 * libérer, puis ajoute des cartes vraies jusqu'à ce que le solveur « enfant » (`solveLikeAChild`) la
 * retrouve : d'abord une carte de chaque sorte exigée, puis, à chaque tour, la carte d'un tirage qui
 * fait le plus avancer son raisonnement. Quand l'étoile exige un raisonnement (`combine`,
 * `exclude`), une carte qui laisse les règles plus simples avancer seules coûte des points : le
 * puzzle bute ainsi sur le raisonnement voulu. L'essai retire ensuite toute carte dont le puzzle peut
 * se passer, et n'est gardé que s'il tient en `MAX_CLUES` cartes et remplit toutes les exigences. Le
 * solveur ne faisant que de vraies déductions, la solution est unique.
 */

/** Cartes d'un puzzle, au plus : toutes visibles à la fois, sur un téléphone comme sur un téléviseur. */
export const MAX_CLUES = 6;

/** Essais avant d'abandonner (`validate:levels` vérifie que chaque étoile en est loin). */
export const MAX_ATTEMPTS = 400;

/** Cartes quelconques évaluées à chaque ajout, tirées au hasard parmi les cartes vraies. */
const SAMPLE_SIZE = 48;

/** Cartes des sortes exigées ajoutées à chaque tirage : les plus rares ne sont jamais oubliées. */
const FOCUS_SAMPLE_SIZE = 16;

/** Ajouts au plus pendant un essai : au-delà, même l'élagage ne ramènerait pas à `MAX_CLUES`. */
const MAX_ADDITIONS = MAX_CLUES + 4;

/** Points d'une pièce trouvée ; chaque case encore possible en retire un. */
const STEP_POINTS = 20;

/** Points retirés pour chaque pièce que les règles plus simples trouvent seules. */
const SIMPLER_STEP_PENALTY = 120;

/** Exigences qui portent sur une sorte de carte, et le test de cette sorte. */
const CLUE_FOCUS_TESTS: Readonly<Partial<Record<LogicGridFocus, (clue: Clue) => boolean>>> = {
  next: (clue) => clue.kind === 'next',
  line: (clue) => getClueKind(clue) === 'line',
  pair: (clue) => clue.kind === 'pair',
  not: isNegatedClue,
  group: isGroupClue,
};

/** Tests des sortes de cartes exigées par l'étoile. */
function getClueFocusTests(config: LogicGridLevelConfig): ((clue: Clue) => boolean)[] {
  return config.focus.flatMap((focus) => CLUE_FOCUS_TESTS[focus] ?? []);
}

/**
 * Raisonnement qui ne doit pas suffire : l'étoile exige `exclude` (alors `combine` ne suffit pas) ou
 * `combine` (alors `direct` ne suffit pas). `null` sans exigence de raisonnement.
 */
function getSimplerReasoning(config: LogicGridLevelConfig): Reasoning | null {
  if (config.focus.includes('exclude')) return 'combine';
  return config.focus.includes('combine') ? 'direct' : null;
}

interface Draft {
  config: LogicGridLevelConfig;
  start: Board;
  pool: readonly Clue[];
  /** Raisonnement plus simple qui ne doit pas suffire (`getSimplerReasoning`) */
  simpler: Reasoning | null;
}

/** Avancée du raisonnement avec un jeu de cartes. */
interface Progress {
  clues: readonly Clue[];
  /** Raisonnement de l'étoile, pas comptés depuis le départ */
  result: ChildSolveResult;
  steps: number;
  /** Pièces trouvées avec les seules règles plus simples */
  simplerBoard: Board;
  simplerSteps: number;
  score: number;
}

/**
 * Avancée avec `clues`, à partir de celle de `base` : ajouter une carte ne retire aucune déduction et
 * leur ordre n'importe pas, le raisonnement reprend donc là où il s'était arrêté.
 */
function measure(draft: Draft, clues: readonly Clue[], base: Progress | null): Progress {
  const result = solveLikeAChild(base?.result.board ?? draft.start, clues, draft.config.reasoning);
  const steps = (base?.steps ?? 0) + result.steps.length;
  let simplerBoard = draft.start;
  let simplerSteps = 0;
  if (draft.simpler) {
    const simpler = solveLikeAChild(base?.simplerBoard ?? draft.start, clues, draft.simpler);
    simplerBoard = simpler.board;
    simplerSteps = (base?.simplerSteps ?? 0) + simpler.steps.length;
  }
  return {
    clues,
    result,
    steps,
    simplerBoard,
    simplerSteps,
    score: steps * STEP_POINTS - result.openOptions - simplerSteps * SIMPLER_STEP_PENALTY,
  };
}

/**
 * `count` éléments tirés au hasard, sans remise (Fisher-Yates arrêté en chemin) : un tirage parmi
 * des centaines de cartes, sans mélanger toute la liste à chaque ajout.
 */
function drawSample<T>(items: readonly T[], count: number, rng: Rng): T[] {
  const pool = [...items];
  const size = Math.min(count, pool.length);
  for (let index = 0; index < size; index += 1) {
    const picked = index + randomInt(pool.length - index, rng);
    const item = pool[picked];
    const current = pool[index];
    if (item !== undefined && current !== undefined) {
      pool[index] = item;
      pool[picked] = current;
    }
  }
  return pool.slice(0, size);
}

/** Carte qui fait le plus avancer le raisonnement parmi un tirage (`test` : une sorte imposée). */
function pickBestClue(
  draft: Draft,
  base: Progress,
  rng: Rng,
  test?: (clue: Clue) => boolean,
): Progress | null {
  // Les cartes du tirage sont des objets uniques : l'identité suffit à écarter celles déjà prises.
  const used = new Set(base.clues);
  const fresh = draft.pool.filter((clue) => !used.has(clue));
  let sample: Clue[];
  if (test) {
    sample = drawSample(fresh.filter(test), SAMPLE_SIZE, rng);
  } else {
    const tests = getClueFocusTests(draft.config);
    const isWanted = (clue: Clue) => tests.some((wanted) => wanted(clue));
    sample = [
      ...drawSample(fresh.filter(isWanted), FOCUS_SAMPLE_SIZE, rng),
      ...drawSample(
        fresh.filter((clue) => !isWanted(clue)),
        SAMPLE_SIZE,
        rng,
      ),
    ];
  }
  let best: Progress | null = null;
  for (const clue of sample) {
    const progress = measure(draft, [...base.clues, clue], base);
    if (!best || progress.score > best.score) best = progress;
  }
  return best;
}

/** Le puzzle remplit-il toutes les exigences de l'étoile ? */
function meetsFocus(config: LogicGridLevelConfig, start: Board, clues: readonly Clue[]): boolean {
  return config.focus.every((focus) => {
    const test = CLUE_FOCUS_TESTS[focus];
    if (test) return clues.some(test);
    // Un raisonnement est exigé quand les règles plus simples ne suffisent pas.
    const simpler = focus === 'combine' ? 'direct' : 'combine';
    return !solveLikeAChild(start, clues, simpler).isSolved;
  });
}

/**
 * Retire toute carte dont le puzzle peut se passer : chacune de celles qui restent est nécessaire.
 * Les cartes des sortes exigées passent en dernier, elles ne cèdent leur place qu'à défaut.
 */
function pruneClues(draft: Draft, clues: readonly Clue[], rng: Rng): Clue[] {
  const tests = getClueFocusTests(draft.config);
  const isWanted = (clue: Clue) => tests.some((test) => test(clue));
  const order = [
    ...shuffle(
      clues.filter((clue) => !isWanted(clue)),
      rng,
    ),
    ...shuffle(clues.filter(isWanted), rng),
  ];
  let kept = [...clues];
  for (const clue of order) {
    const without = kept.filter((other) => other !== clue);
    if (solveLikeAChild(draft.start, without, draft.config.reasoning).isSolved) kept = without;
  }
  return kept;
}

/** Indices des cartes dans l'ordre où le raisonnement les lit ; celles qu'aucun pas ne lit, à la fin. */
function getUseOrder(clueCount: number, result: ChildSolveResult): number[] {
  const order: number[] = [];
  for (const step of result.steps) {
    for (const index of step.clueIndices) if (!order.includes(index)) order.push(index);
  }
  for (let index = 0; index < clueCount; index += 1) {
    if (!order.includes(index)) order.push(index);
  }
  return order;
}

/** Rangements au plus : l'ordre d'usage se stabilise dès le deuxième en pratique. */
const MAX_ORDERINGS = 4;

/**
 * Cartes rangées dans l'ordre où l'enfant s'en sert, et le raisonnement qui les lit dans cet ordre.
 * Ranger les cartes peut changer la carte retenue pour un pas (deux cartes qui placent la même
 * pièce) : on recommence jusqu'à ce que l'ordre ne bouge plus.
 */
function orderByUse(
  draft: Draft,
  clues: readonly Clue[],
): { clues: Clue[]; result: ChildSolveResult } {
  let ordered = [...clues];
  let result = solveLikeAChild(draft.start, ordered, draft.config.reasoning);
  for (let round = 0; round < MAX_ORDERINGS; round += 1) {
    const order = getUseOrder(ordered.length, result);
    if (order.every((index, position) => index === position)) break;
    ordered = order.flatMap((index) => ordered[index] ?? []);
    result = solveLikeAChild(draft.start, ordered, draft.config.reasoning);
  }
  return { clues: ordered, result };
}

/** Étoile guidée : le premier pas, que la main montre, lit-il une carte de la sorte exigée ? */
function isGuideReady(config: LogicGridLevelConfig, puzzle: LogicGridPuzzle): boolean {
  const tests = getClueFocusTests(config);
  if (!config.hasGuide || tests.length === 0) return true;
  return (puzzle.steps[0]?.clueIndices ?? []).some((index) => {
    const clue = puzzle.clues[index];
    return clue !== undefined && tests.some((test) => test(clue));
  });
}

/** Un essai : un puzzle qui convient, ou `null`. */
function tryGeneratePuzzle(config: LogicGridLevelConfig, rng: Rng): LogicGridPuzzle | null {
  const solution = shuffle(PIECE_IDS, rng);
  const cells = Array.from({ length: CELL_COUNT }, (_, cell) => cell);
  const freeCells = new Set(shuffle(cells, rng).slice(0, config.freePieces));
  const start: Board = solution.map((piece, cell) => (freeCells.has(cell) ? null : piece));
  const freePieces = shuffle(
    solution.filter((_, cell) => freeCells.has(cell)),
    rng,
  );
  const draft: Draft = {
    config,
    start,
    pool: listTrueClues(solution, freePieces, config),
    simpler: getSimplerReasoning(config),
  };

  let progress = measure(draft, [], null);
  // Une carte de chaque sorte exigée d'abord, la plus utile d'un tirage.
  for (const test of getClueFocusTests(config)) {
    if (progress.clues.some(test)) continue;
    const seeded = pickBestClue(draft, progress, rng, test);
    if (!seeded) return null;
    progress = seeded;
  }
  while (!progress.result.isSolved) {
    const next = progress.clues.length < MAX_ADDITIONS ? pickBestClue(draft, progress, rng) : null;
    if (!next || next.score <= progress.score) return null;
    progress = next;
  }

  const kept = pruneClues(draft, progress.clues, rng);
  if (kept.length > MAX_CLUES || !meetsFocus(config, start, kept)) return null;

  const { clues, result } = orderByUse(draft, kept);
  const puzzle: LogicGridPuzzle = {
    solution,
    lockedCells: cells.filter((cell) => !freeCells.has(cell)),
    freePieces,
    clues,
    steps: result.steps,
  };
  return isGuideReady(config, puzzle) ? puzzle : null;
}

/**
 * Générateur à graine (mulberry32) : une partie reproductible, pour valider le catalogue sans que
 * le hasard ne le rende un jour invalide.
 */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Puzzle d'une étoile, tiré avec `rng`. Lève une `Error` si aucun essai n'aboutit en
 * `MAX_ATTEMPTS` : une configuration du catalogue ne doit jamais en arriver là (`validate:levels`).
 */
export function generatePuzzle(config: LogicGridLevelConfig, rng: Rng): LogicGridPuzzle {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const puzzle = tryGeneratePuzzle(config, rng);
    if (puzzle) return puzzle;
  }
  throw new Error(`aucun puzzle trouvé en ${String(MAX_ATTEMPTS)} essais`);
}
