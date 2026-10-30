// @vitest-environment node
import type { SoundBeat } from '@/core/audio/types';
import type { Rng } from '@/games/memory/random';
import { PATTERNS_CATALOG, type PatternsLevel } from '@/games/patterns/catalog';
import {
  advanceRound,
  beginRound,
  CHOICE_COUNT,
  createPatternsGame,
  endListening,
  endStop,
  getHelpLevel,
  getPatternsConfigErrors,
  getUnitLength,
  isPerfectWin,
  MAX_VISIBLE_ITEMS,
  tapChoice,
  TOO_FAST_MS,
} from '@/games/patterns/engine';
import {
  DISTINCT_ITEM_COLORS,
  getPatternItemLabel,
  PATTERN_ITEMS,
  SAME_ITEM_COLOR,
} from '@/games/patterns/items';
import type {
  PatternAnswerMode,
  PatternColorMode,
  PatternFamily,
  PatternGameState,
  PatternItem,
  PatternItemId,
  PatternLevelConfig,
  PatternPhase,
  PatternRole,
  PatternRound,
  PatternRule,
  PatternSoundPairing,
} from '@/games/patterns/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Tirage toujours nul : chaque mélange conserve l'ordre (FEAT-21 §4). */
const FIRST: Rng = () => 0;

/** Générateur à graine (mulberry32) : parties reproductibles. */
function seeded(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graines des invariants de génération : un échec se rejoue à l'identique. */
const SEEDS = Array.from({ length: 100 }, (_, seed) => seed);

/** Longueur de l'unité, d'après la spécification : le moteur ne se contrôle pas lui-même. */
const UNIT_LENGTH: Record<PatternRule, number> = { ab: 2, abb: 3 };

/** Index de chaque proposition sous `FIRST` (A-B à 4 éléments) : A, B, puis l'intrus. */
const RIGHT = 0;
const WRONG = 1;
const OTHER_WRONG = 2;

/** Horloge de l'appelant : loin de 0, pour distinguer une mesure relative d'une mesure absolue. */
const T0 = 50_000;

/** Défi en pièces A-B, 4 éléments, sans STOP. */
function visualConfig(overrides: Partial<PatternLevelConfig> = {}): PatternLevelConfig {
  return {
    rule: 'ab',
    family: 'animals',
    colorMode: 'distinct',
    visibleItems: 4,
    answerMode: 'visual',
    soundPairing: null,
    rounds: 3,
    stopRounds: 0,
    stopSeconds: 2,
    hasGuide: false,
    ...overrides,
  };
}

/** Défi en sons A-B, 4 temps, chaque élément gardant son son, sans STOP. */
function soundConfig(overrides: Partial<PatternLevelConfig> = {}): PatternLevelConfig {
  return visualConfig({ answerMode: 'sound', soundPairing: 'fixed', ...overrides });
}

const VISUAL_LEVELS = PATTERNS_CATALOG.filter((level) => level.config.answerMode === 'visual');
const SOUND_LEVELS = PATTERNS_CATALOG.filter((level) => level.config.answerMode === 'sound');
const FIXED_LEVELS = SOUND_LEVELS.filter((level) => level.config.soundPairing === 'fixed');
const VARIED_LEVELS = SOUND_LEVELS.filter((level) => level.config.soundPairing === 'varied');

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Rien à l’index ${String(index)}`);
  return item;
}

const idsOf = (items: readonly PatternItem[]): PatternItemId[] => items.map((item) => item.id);

function itemsOf(round: PatternRound): PatternItem[] {
  return round.choices.map((choice) => {
    if (choice.kind !== 'item') throw new Error('Proposition en pièce attendue');
    return choice.item;
  });
}

function beatsOf(round: PatternRound): (readonly SoundBeat[])[] {
  return round.choices.map((choice) => {
    if (choice.kind !== 'sound') throw new Error('Proposition en sons attendue');
    return choice.beats;
  });
}

const correctBeatsOf = (round: PatternRound): readonly SoundBeat[] =>
  at(beatsOf(round), round.correctIndex);

/** Son du rôle A : la bonne suite s'ouvre par A. */
const soundOfRoleA = (round: PatternRound): SoundBeat => at(correctBeatsOf(round), 0);

const gamesOf = ({ config }: PatternsLevel): PatternGameState[] =>
  SEEDS.map((seed) => createPatternsGame(config, seeded(seed)));

const roundsOf = (level: PatternsLevel): PatternRound[] =>
  gamesOf(level).flatMap((game) => game.rounds);

const stopIndicesOf = ({ rounds }: PatternGameState): number[] =>
  rounds.flatMap((round, index) => (round.startsWithStop ? [index] : []));

/** Défis consécutifs d'une partie : [précédent, suivant]. */
function consecutive<T>(items: readonly T[]): [T, T][] {
  return items.slice(1).map((item, index): [T, T] => [at(items, index), item]);
}

/** Rôles d'une suite de `length` éléments : A ouvre chaque unité, B la complète. */
function rolesOf(rule: PatternRule, length: number): PatternRole[] {
  return Array.from({ length }, (_, index) => (index % UNIT_LENGTH[rule] === 0 ? 'A' : 'B'));
}

/** Lecture d'une suite de sons : le premier son est A, l'autre B (« A-B-B-A »). */
const toRoleText = (beats: readonly SoundBeat[]): string =>
  beats.map((beat) => (beat === beats[0] ? 'A' : 'B')).join('-');

/** Même élément à deux positions si et seulement si même son à ces positions. */
function hasSameStructure(row: readonly PatternItem[], beats: readonly SoundBeat[]): boolean {
  return (
    row.length === beats.length &&
    row.every((item, i) =>
      row.every((other, j) => (item.id === other.id) === (at(beats, i) === at(beats, j))),
    )
  );
}

/** Sons entendus pour chaque élément : l'élément à une position sonne comme la bonne suite. */
function soundsHeardByItem(rounds: readonly PatternRound[]): Map<PatternItemId, Set<SoundBeat>> {
  const heard = new Map<PatternItemId, Set<SoundBeat>>();
  for (const round of rounds) {
    const beats = correctBeatsOf(round);
    round.row.forEach((item, position) => {
      heard.set(item.id, (heard.get(item.id) ?? new Set()).add(at(beats, position)));
    });
  }
  return heard;
}

/**
 * Réponse posée à une proposition : pièces, une tape ; sons, écoute puis validation
 * `TOO_FAST_MS` plus tard, ce qui ne déclenche jamais de STOP.
 */
function answer(state: PatternGameState, index: number, nowMs: number): PatternGameState {
  if (state.config.answerMode === 'visual') return tapChoice(state, index, nowMs);
  return tapChoice(endListening(tapChoice(state, index, nowMs), nowMs), index, nowMs + TOO_FAST_MS);
}

/** Propositions déverrouillées (ou STOP du premier défi) à `T0`. */
const started = (config: PatternLevelConfig): PatternGameState =>
  beginRound(createPatternsGame(config, FIRST), T0);

/** Partie arrêtée dans la phase demandée. */
function gameIn(phase: PatternPhase, mode: PatternAnswerMode = 'visual'): PatternGameState {
  const config = mode === 'sound' ? soundConfig() : visualConfig();
  switch (phase) {
    case 'intro':
      return createPatternsGame(config, FIRST);
    case 'stop':
      return started({ ...config, stopRounds: 1 });
    case 'choosing':
      return started(config);
    case 'listening':
      return tapChoice(started(config), RIGHT, T0);
    case 'success':
      return answer(started(config), RIGHT, T0);
    case 'won':
      return advanceRound(answer(started({ ...config, rounds: 1 }), RIGHT, T0));
  }
}

/**
 * Joue une étoile entière : `answersOf` donne les propositions tapées à chaque défi, assez lentement
 * pour qu'une erreur ne déclenche jamais de STOP (voir `answer`).
 */
function playStar(
  start: PatternGameState,
  answersOf: (round: PatternRound) => readonly number[],
): PatternGameState {
  let state = start;
  let nowMs = T0;
  const tick = (): number => {
    nowMs += 2 * TOO_FAST_MS;
    return nowMs;
  };
  for (const round of start.rounds) {
    state = endStop(beginRound(state, tick()), tick());
    for (const index of answersOf(round)) state = answer(state, index, tick());
    state = advanceRound(state);
  }
  return state;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Constantes et banque d’éléments', () => {
  it('fixe les valeurs du cadrage : 3 propositions, 6 éléments au plus, 1,2 s', () => {
    expect(CHOICE_COUNT).toBe(3);
    expect(MAX_VISIBLE_ITEMS).toBe(6);
    expect(TOO_FAST_MS).toBe(1200);
  });

  it('donne la longueur de l’unité répétée : A-B 2, A-B-B 3', () => {
    expect(getUnitLength('ab')).toBe(2);
    expect(getUnitLength('abb')).toBe(3);
  });

  it('propose assez d’éléments distincts dans chaque famille, sans élément commun', () => {
    const { animals, shapes } = PATTERN_ITEMS;

    expect(new Set(animals).size).toBe(animals.length);
    expect(new Set(shapes).size).toBe(shapes.length);
    expect(animals.length).toBeGreaterThanOrEqual(CHOICE_COUNT);
    expect(shapes.length).toBeGreaterThanOrEqual(CHOICE_COUNT);
    expect(animals.filter((id) => shapes.includes(id))).toEqual([]);
  });

  it('nomme chaque élément en français pour les lecteurs d’écran', () => {
    const ids = [...PATTERN_ITEMS.animals, ...PATTERN_ITEMS.shapes];

    expect(Object.fromEntries(ids.map((id) => [id, getPatternItemLabel(id)]))).toEqual({
      cat: 'Chat',
      dog: 'Chien',
      fish: 'Poisson',
      bird: 'Oiseau',
      rabbit: 'Lapin',
      turtle: 'Tortue',
      squirrel: 'Écureuil',
      snail: 'Escargot',
      circle: 'Rond',
      square: 'Carré',
      triangle: 'Triangle',
      star: 'Étoile',
      heart: 'Cœur',
      diamond: 'Losange',
      hexagon: 'Hexagone',
      cross: 'Croix',
    });
  });

  it('propose assez de couleurs distinctes pour A, B et l’intrus, et une couleur unique à part', () => {
    expect(new Set(DISTINCT_ITEM_COLORS).size).toBe(DISTINCT_ITEM_COLORS.length);
    expect(DISTINCT_ITEM_COLORS.length).toBeGreaterThanOrEqual(CHOICE_COUNT);
    expect(DISTINCT_ITEM_COLORS).not.toContain(SAME_ITEM_COLOR);
  });
});

describe('getPatternsConfigErrors', () => {
  const UNKNOWN_RULE = 'abc' as string as PatternRule;
  const INHERITED_RULE = 'toString' as string as PatternRule;
  const UNKNOWN_FAMILY = 'plants' as string as PatternFamily;
  const UNKNOWN_COLOR_MODE = 'rainbow' as string as PatternColorMode;
  const UNKNOWN_ANSWER_MODE = 'touch' as string as PatternAnswerMode;
  const UNKNOWN_PAIRING = 'random' as string as PatternSoundPairing;

  const SOUND = { answerMode: 'sound', soundPairing: 'varied' } as const;

  it.each<[string, Partial<PatternLevelConfig>]>([
    ['A-B en pièces, ligne la plus courte', { visibleItems: 4 }],
    ['A-B en pièces, 5 éléments', { visibleItems: 5 }],
    ['A-B en pièces, ligne la plus longue', { visibleItems: MAX_VISIBLE_ITEMS }],
    ['A-B-B en pièces, ligne la plus courte', { rule: 'abb', visibleItems: 5 }],
    ['A-B-B en pièces, ligne la plus longue', { rule: 'abb', visibleItems: MAX_VISIBLE_ITEMS }],
    ['A-B en sons, 4 temps', { ...SOUND, visibleItems: 4 }],
    ['A-B-B en sons, 3 temps', { ...SOUND, rule: 'abb', visibleItems: 3 }],
    ['A-B-B en sons, 6 temps', { ...SOUND, rule: 'abb', visibleItems: 6 }],
    ['chaque élément garde son son', { answerMode: 'sound', soundPairing: 'fixed' }],
    ['association qui change', { answerMode: 'sound', soundPairing: 'varied' }],
    ['famille des formes', { family: 'shapes' }],
    ['couleur unique', { colorMode: 'same' }],
    ['un seul défi', { rounds: 1 }],
    ['aucun STOP', { stopRounds: 0 }],
    ['un STOP à chaque défi', { rounds: 3, stopRounds: 3 }],
    ['STOP d’une fraction de seconde', { stopSeconds: 0.5 }],
    ['guide', { hasGuide: true }],
  ])('accepte : %s', (_, overrides) => {
    expect(getPatternsConfigErrors(visualConfig(overrides))).toEqual([]);
    expect(() => createPatternsGame(visualConfig(overrides), FIRST)).not.toThrow();
  });

  it.each<[string, Partial<PatternLevelConfig>, string]>([
    ['règle inconnue', { rule: UNKNOWN_RULE }, 'rule « abc » inconnue'],
    ['règle héritée d’Object', { rule: INHERITED_RULE }, 'rule « toString » inconnue'],
    ['famille inconnue', { family: UNKNOWN_FAMILY }, 'family « plants » inconnue'],
    ['couleurs inconnues', { colorMode: UNKNOWN_COLOR_MODE }, 'colorMode « rainbow » inconnu'],
    ['réponses inconnues', { answerMode: UNKNOWN_ANSWER_MODE }, 'answerMode « touch » inconnu'],
    [
      'A-B en pièces, ligne ambiguë',
      { visibleItems: 3 },
      'visibleItems 3 invalide pour la règle « ab » en pièces (entier de 4 à 6 attendu)',
    ],
    [
      'A-B en pièces, ligne trop longue',
      { visibleItems: 7 },
      'visibleItems 7 invalide pour la règle « ab » en pièces (entier de 4 à 6 attendu)',
    ],
    [
      'A-B en pièces, ligne décimale',
      { visibleItems: 4.5 },
      'visibleItems 4.5 invalide pour la règle « ab » en pièces (entier de 4 à 6 attendu)',
    ],
    [
      'A-B en pièces, ligne NaN',
      { visibleItems: Number.NaN },
      'visibleItems NaN invalide pour la règle « ab » en pièces (entier de 4 à 6 attendu)',
    ],
    [
      'A-B-B en pièces, ligne ambiguë',
      { rule: 'abb', visibleItems: 4 },
      'visibleItems 4 invalide pour la règle « abb » en pièces (entier de 5 à 6 attendu)',
    ],
    [
      'A-B-B en pièces, ligne trop longue',
      { rule: 'abb', visibleItems: 7 },
      'visibleItems 7 invalide pour la règle « abb » en pièces (entier de 5 à 6 attendu)',
    ],
    [
      'A-B en sons, longueur non prévue',
      { ...SOUND, visibleItems: 5 },
      'visibleItems 5 invalide pour la règle « ab » en sons (4 attendu)',
    ],
    [
      'A-B en sons, 6 temps',
      { ...SOUND, visibleItems: 6 },
      'visibleItems 6 invalide pour la règle « ab » en sons (4 attendu)',
    ],
    [
      'A-B-B en sons, 4 temps',
      { ...SOUND, rule: 'abb', visibleItems: 4 },
      'visibleItems 4 invalide pour la règle « abb » en sons (3 ou 6 attendu)',
    ],
    [
      'A-B-B en sons, 5 temps',
      { ...SOUND, rule: 'abb', visibleItems: 5 },
      'visibleItems 5 invalide pour la règle « abb » en sons (3 ou 6 attendu)',
    ],
    [
      'sons sans association',
      { answerMode: 'sound', soundPairing: null },
      'soundPairing invalide (fixed ou varied attendu pour des réponses en sons)',
    ],
    [
      'sons, association inconnue',
      { answerMode: 'sound', soundPairing: UNKNOWN_PAIRING },
      'soundPairing invalide (fixed ou varied attendu pour des réponses en sons)',
    ],
    [
      'pièces avec une association fixe',
      { soundPairing: 'fixed' },
      'soundPairing invalide (null attendu pour des réponses en pièces)',
    ],
    [
      'pièces avec une association qui change',
      { soundPairing: 'varied' },
      'soundPairing invalide (null attendu pour des réponses en pièces)',
    ],
    ['aucun défi', { rounds: 0 }, 'rounds 0 invalide (entier ≥ 1 attendu)'],
    ['défis négatifs', { rounds: -2 }, 'rounds -2 invalide (entier ≥ 1 attendu)'],
    ['défis décimaux', { rounds: 2.5 }, 'rounds 2.5 invalide (entier ≥ 1 attendu)'],
    ['défis NaN', { rounds: Number.NaN }, 'rounds NaN invalide (entier ≥ 1 attendu)'],
    ['défis infinis', { rounds: Infinity }, 'rounds Infinity invalide (entier ≥ 1 attendu)'],
    ['STOP négatifs', { stopRounds: -1 }, 'stopRounds -1 invalide (entier ≥ 0 attendu)'],
    ['STOP décimaux', { stopRounds: 1.5 }, 'stopRounds 1.5 invalide (entier ≥ 0 attendu)'],
    ['STOP NaN', { stopRounds: Number.NaN }, 'stopRounds NaN invalide (entier ≥ 0 attendu)'],
    [
      'plus de STOP que de défis',
      { rounds: 3, stopRounds: 4 },
      'stopRounds 4 supérieur à rounds 3',
    ],
    ['STOP nul', { stopSeconds: 0 }, 'stopSeconds 0 invalide (nombre fini > 0 attendu)'],
    ['STOP négatif', { stopSeconds: -1 }, 'stopSeconds -1 invalide (nombre fini > 0 attendu)'],
    [
      'STOP infini',
      { stopSeconds: Infinity },
      'stopSeconds Infinity invalide (nombre fini > 0 attendu)',
    ],
    ['STOP NaN', { stopSeconds: Number.NaN }, 'stopSeconds NaN invalide (nombre fini > 0 attendu)'],
  ])('signale : %s', (_, overrides, message) => {
    expect(getPatternsConfigErrors(visualConfig(overrides))).toEqual([message]);
  });

  it('ne déduit aucune anomalie en cascade d’une valeur déjà signalée', () => {
    const errorsOf = (overrides: Partial<PatternLevelConfig>) =>
      getPatternsConfigErrors(visualConfig(overrides));

    // Règle inconnue : aucune longueur de ligne ne peut être jugée, en pièces comme en sons.
    expect(errorsOf({ rule: UNKNOWN_RULE, visibleItems: 99 })).toEqual(['rule « abc » inconnue']);
    expect(errorsOf({ ...SOUND, rule: INHERITED_RULE, visibleItems: 99 })).toEqual([
      'rule « toString » inconnue',
    ]);
    // Réponses inconnues : ni l'association ni la longueur ne peuvent être jugées.
    expect(
      errorsOf({ answerMode: UNKNOWN_ANSWER_MODE, soundPairing: 'fixed', visibleItems: 99 }),
    ).toEqual(['answerMode « touch » inconnu']);
    expect(
      errorsOf({ answerMode: UNKNOWN_ANSWER_MODE, soundPairing: null, visibleItems: 99 }),
    ).toEqual(['answerMode « touch » inconnu']);
    // Défis invalides : les STOP ne se comparent pas à une valeur déjà signalée.
    expect(errorsOf({ rounds: 0, stopRounds: 3 })).toEqual([
      'rounds 0 invalide (entier ≥ 1 attendu)',
    ]);
    expect(errorsOf({ rounds: 1.5, stopRounds: 3 })).toEqual([
      'rounds 1.5 invalide (entier ≥ 1 attendu)',
    ]);
    // STOP invalides : un seul message, même au-delà du nombre de défis.
    expect(errorsOf({ rounds: 2, stopRounds: 3.5 })).toEqual([
      'stopRounds 3.5 invalide (entier ≥ 0 attendu)',
    ]);
  });

  it('signale ensemble les anomalies indépendantes, un message par anomalie', () => {
    expect(
      getPatternsConfigErrors(
        visualConfig({
          rule: UNKNOWN_RULE,
          family: UNKNOWN_FAMILY,
          colorMode: UNKNOWN_COLOR_MODE,
          answerMode: 'sound',
          soundPairing: null,
          visibleItems: 99,
          rounds: 0,
          stopRounds: -1,
          stopSeconds: 0,
        }),
      ),
    ).toEqual([
      'rule « abc » inconnue',
      'family « plants » inconnue',
      'colorMode « rainbow » inconnu',
      'soundPairing invalide (fixed ou varied attendu pour des réponses en sons)',
      'rounds 0 invalide (entier ≥ 1 attendu)',
      'stopRounds -1 invalide (entier ≥ 0 attendu)',
      'stopSeconds 0 invalide (nombre fini > 0 attendu)',
    ]);
    expect(
      getPatternsConfigErrors(visualConfig({ soundPairing: 'fixed', visibleItems: 3, rounds: 0 })),
    ).toEqual([
      'soundPairing invalide (null attendu pour des réponses en pièces)',
      'visibleItems 3 invalide pour la règle « ab » en pièces (entier de 4 à 6 attendu)',
      'rounds 0 invalide (entier ≥ 1 attendu)',
    ]);
  });
});

describe('createPatternsGame', () => {
  it('s’ouvre en intro sur le premier défi, compteurs à zéro', () => {
    const config = visualConfig();
    const game = createPatternsGame(config, seeded(1));

    expect(game).toEqual({
      config,
      phase: 'intro',
      rounds: game.rounds,
      round: game.rounds[0],
      roundIndex: 0,
      armedIndex: null,
      roundMistakes: 0,
      mistakes: 0,
      impulsiveTaps: 0,
      moves: 0,
      unlockedAtMs: 0,
      lastWrongIndex: null,
      wrongTick: 0,
    });
    expect(game.config).toBe(config);
    expect(game.round).toBe(game.rounds[0]);
    expect(getHelpLevel(game)).toBe(0);
    expect(isPerfectWin(game)).toBe(false);
  });

  it('lève une Error listant chaque anomalie de la configuration', () => {
    expect(() => createPatternsGame(visualConfig({ rounds: 0, stopSeconds: -1 }), FIRST)).toThrow(
      new Error(
        'Configuration Suites Logiques invalide : rounds 0 invalide (entier ≥ 1 attendu) ; stopSeconds -1 invalide (nombre fini > 0 attendu)',
      ),
    );
    expect(() => createPatternsGame(visualConfig({ visibleItems: 3 }))).toThrow(
      new Error(
        'Configuration Suites Logiques invalide : visibleItems 3 invalide pour la règle « ab » en pièces (entier de 4 à 6 attendu)',
      ),
    );
  });

  it('rejoue la même partie à graine égale, une autre à graine différente', () => {
    const config = soundConfig({ stopRounds: 1 });

    expect(createPatternsGame(config, seeded(7))).toEqual(createPatternsGame(config, seeded(7)));
    expect(createPatternsGame(config, seeded(7))).not.toEqual(
      createPatternsGame(config, seeded(8)),
    );
  });

  it('tire au hasard avec Math.random par défaut', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(createPatternsGame(soundConfig())).toEqual(createPatternsGame(soundConfig(), FIRST));
    expect(random).toHaveBeenCalled();
  });

  it('n’appelle jamais Math.random quand un générateur est fourni', () => {
    const random = vi.spyOn(Math, 'random');

    createPatternsGame(soundConfig({ soundPairing: 'varied', stopRounds: 1 }), seeded(1));
    createPatternsGame(visualConfig({ stopRounds: 1 }), seeded(1));

    expect(random).not.toHaveBeenCalled();
  });

  it.each<[number, number]>([
    [1, 0],
    [1, 1],
    [2, 2],
    [8, 0],
    [8, 3],
    [8, 8],
  ])('respecte %i défis dont %i STOP, en pièces comme en sons', (rounds, stopRounds) => {
    for (const config of [
      visualConfig({ rounds, stopRounds }),
      soundConfig({ rounds, stopRounds }),
    ]) {
      for (const seed of SEEDS.slice(0, 10)) {
        const game = createPatternsGame(config, seeded(seed));

        expect(game.rounds).toHaveLength(rounds);
        expect(stopIndicesOf(game)).toHaveLength(stopRounds);
      }
    }
  });
});

describe('Tirage nul : le mélange conserve l’ordre (FEAT-21 §4)', () => {
  const cat = { id: 'cat', colorClass: DISTINCT_ITEM_COLORS[0] };
  const dog = { id: 'dog', colorClass: DISTINCT_ITEM_COLORS[1] };
  const fish = { id: 'fish', colorClass: DISTINCT_ITEM_COLORS[2] };
  const circle = { id: 'circle', colorClass: DISTINCT_ITEM_COLORS[0] };
  const square = { id: 'square', colorClass: DISTINCT_ITEM_COLORS[1] };

  it('A-B à 4 éléments : la bonne réponse à l’index 0, tenue par le premier élément', () => {
    expect(createPatternsGame(visualConfig(), FIRST).round).toEqual({
      row: [cat, dog, cat, dog],
      choices: [
        { kind: 'item', item: cat },
        { kind: 'item', item: dog },
        { kind: 'item', item: fish },
      ],
      correctIndex: RIGHT,
      startsWithStop: false,
    });
  });

  it.each<[PatternRule, number, 'A' | 'B', number]>([
    ['ab', 4, 'A', 0],
    ['ab', 5, 'B', 1],
    ['ab', 6, 'A', 0],
    ['abb', 5, 'B', 1],
    ['abb', 6, 'A', 0],
  ])('%s sur %i éléments : la suite continue par %s (index %i)', (rule, visibleItems, _, index) => {
    const { round } = createPatternsGame(visualConfig({ rule, visibleItems }), FIRST);

    expect(round.row).toHaveLength(visibleItems);
    expect(round.correctIndex).toBe(index);
  });

  it('sons : la bonne suite d’abord, A et B échangés d’un défi à l’autre', () => {
    const { rounds } = createPatternsGame(
      soundConfig({ family: 'shapes', rounds: 2, stopRounds: 1 }),
      FIRST,
    );

    expect(rounds).toEqual([
      {
        row: [circle, square, circle, square],
        choices: [
          { kind: 'sound', beats: ['bell', 'drum', 'bell', 'drum'] },
          { kind: 'sound', beats: ['bell', 'bell', 'drum', 'drum'] },
          { kind: 'sound', beats: ['bell', 'drum', 'drum', 'bell'] },
        ],
        correctIndex: RIGHT,
        startsWithStop: true,
      },
      {
        row: [square, circle, square, circle],
        choices: [
          { kind: 'sound', beats: ['drum', 'bell', 'drum', 'bell'] },
          { kind: 'sound', beats: ['drum', 'drum', 'bell', 'bell'] },
          { kind: 'sound', beats: ['drum', 'bell', 'bell', 'drum'] },
        ],
        correctIndex: RIGHT,
        startsWithStop: false,
      },
    ]);
  });

  it('couleur unique : tous les éléments portent la même couleur', () => {
    const { round } = createPatternsGame(visualConfig({ colorMode: 'same' }), FIRST);

    expect(round.row[0]).toEqual({ id: 'cat', colorClass: SAME_ITEM_COLOR });
    expect(itemsOf(round).map((item) => item.colorClass)).toEqual(
      Array.from({ length: CHOICE_COUNT }, () => SAME_ITEM_COLOR),
    );
  });
});

describe(`Génération des défis : toutes les étoiles, ${String(SEEDS.length)} graines`, () => {
  describe('Tous les défis', () => {
    it.each(PATTERNS_CATALOG)('$id : autant de défis que rounds', (level) => {
      for (const game of gamesOf(level)) {
        expect(game.rounds).toHaveLength(level.config.rounds);
        expect(game.round).toBe(game.rounds[0]);
      }
    });

    it.each(PATTERNS_CATALOG)('$id : 3 propositions et une bonne réponse parmi elles', (level) => {
      for (const { choices, correctIndex } of roundsOf(level)) {
        expect(choices).toHaveLength(CHOICE_COUNT);
        expect([0, 1, 2]).toContain(correctIndex);
      }
    });

    it.each(PATTERNS_CATALOG)('$id : la bonne réponse occupe tour à tour chaque place', (level) => {
      const places = new Set(roundsOf(level).map((round) => round.correctIndex));

      expect(places).toEqual(new Set([0, 1, 2]));
    });

    it.each(PATTERNS_CATALOG)('$id : exactement stopRounds défis ouverts par un STOP', (level) => {
      for (const game of gamesOf(level)) {
        expect(stopIndicesOf(game)).toHaveLength(level.config.stopRounds);
      }
    });

    it.each(PATTERNS_CATALOG.filter((level) => level.config.stopRounds > 0))(
      '$id : les STOP changent de place d’une partie à l’autre, sur tous les défis',
      (level) => {
        const games = gamesOf(level);
        const layouts = new Set(games.map((game) => stopIndicesOf(game).join()));
        const places = new Set(games.flatMap(stopIndicesOf));

        expect(layouts.size).toBeGreaterThan(1);
        expect(places.size).toBe(level.config.rounds);
      },
    );

    it.each(PATTERNS_CATALOG)(
      '$id : la ligne suit la règle sur visibleItems éléments, A et B distincts',
      (level) => {
        const { rule, visibleItems } = level.config;
        const roles = rolesOf(rule, visibleItems);

        for (const { row } of roundsOf(level)) {
          const a = at(row, 0);
          const b = at(row, 1);

          expect(a.id).not.toBe(b.id);
          expect(row).toEqual(roles.map((role) => (role === 'A' ? a : b)));
        }
      },
    );

    it.each(PATTERNS_CATALOG)('$id : les éléments viennent de la famille de l’étoile', (level) => {
      const drawn = new Set(roundsOf(level).flatMap((round) => idsOf(round.row)));

      // Tous les éléments de la banque finissent par sortir : rien ne se mémorise.
      expect(drawn).toEqual(new Set(PATTERN_ITEMS[level.config.family]));
    });

    it.each(PATTERNS_CATALOG.filter((level) => level.config.colorMode === 'same'))(
      '$id : couleur unique sur toute la ligne',
      (level) => {
        const colors = roundsOf(level).flatMap((round) => round.row.map((item) => item.colorClass));

        expect(new Set(colors)).toEqual(new Set([SAME_ITEM_COLOR]));
      },
    );

    it.each(PATTERNS_CATALOG.filter((level) => level.config.colorMode === 'distinct'))(
      '$id : A et B de couleurs distinctes, parmi les couleurs prévues',
      (level) => {
        for (const { row } of roundsOf(level)) {
          const a = at(row, 0).colorClass;
          const b = at(row, 1).colorClass;

          expect(a).not.toBe(b);
          expect(DISTINCT_ITEM_COLORS).toEqual(expect.arrayContaining([a, b]));
        }
      },
    );

    it.each(PATTERNS_CATALOG.filter((level) => level.config.colorMode === 'distinct'))(
      '$id : aucune couleur n’annonce un rôle : toutes passent par A et par B',
      (level) => {
        const rounds = roundsOf(level);
        const everyColor = new Set(DISTINCT_ITEM_COLORS);

        expect(new Set(rounds.map((round) => at(round.row, 0).colorClass))).toEqual(everyColor);
        expect(new Set(rounds.map((round) => at(round.row, 1).colorClass))).toEqual(everyColor);
      },
    );

    it.each(PATTERNS_CATALOG)('$id : deux parties ne se ressemblent pas', (level) => {
      const games = gamesOf(level).map((game) => JSON.stringify(game.rounds));

      expect(new Set(games).size).toBeGreaterThan(1);
    });
  });

  describe('Défis en pièces', () => {
    it.each(VISUAL_LEVELS)('$id : toutes les propositions sont des pièces', (level) => {
      for (const { choices } of roundsOf(level)) {
        expect(choices.every((choice) => choice.kind === 'item')).toBe(true);
      }
    });

    it.each(VISUAL_LEVELS)('$id : la bonne réponse est l’élément suivant de la suite', (level) => {
      const { rule, visibleItems } = level.config;
      const nextRole = visibleItems % UNIT_LENGTH[rule] === 0 ? 'A' : 'B';

      for (const round of roundsOf(level)) {
        const expected = at(round.row, nextRole === 'A' ? 0 : 1);

        // La pièce à placer est celle de la ligne, couleur comprise.
        expect(at(itemsOf(round), round.correctIndex)).toEqual(expected);
      }
    });

    it.each(VISUAL_LEVELS)('$id : A, B et un intrus absent de la ligne', (level) => {
      for (const round of roundsOf(level)) {
        const choices = itemsOf(round);
        const rowIds = idsOf(round.row);
        const intruders = choices.filter((item) => !rowIds.includes(item.id));

        expect(intruders).toHaveLength(1);
        // Trois propositions distinctes : A et B tels que sur la ligne, couleur comprise, et l'intrus.
        expect(new Set(idsOf(choices)).size).toBe(CHOICE_COUNT);
        expect(new Set(choices)).toEqual(
          new Set([at(round.row, 0), at(round.row, 1), at(intruders, 0)]),
        );
      }
    });

    it.each(VISUAL_LEVELS)('$id : les propositions sont de la famille de l’étoile', (level) => {
      const family = PATTERN_ITEMS[level.config.family];

      for (const round of roundsOf(level)) {
        expect(family).toEqual(expect.arrayContaining(idsOf(itemsOf(round))));
      }
    });

    it.each(VISUAL_LEVELS.filter((level) => level.config.colorMode === 'same'))(
      '$id : une seule couleur pour les trois propositions',
      (level) => {
        for (const round of roundsOf(level)) {
          expect(new Set(itemsOf(round).map((item) => item.colorClass))).toEqual(
            new Set([SAME_ITEM_COLOR]),
          );
        }
      },
    );

    it.each(VISUAL_LEVELS.filter((level) => level.config.colorMode === 'distinct'))(
      '$id : trois couleurs distinctes pour les trois propositions',
      (level) => {
        for (const round of roundsOf(level)) {
          const colors = itemsOf(round).map((item) => item.colorClass);

          expect(new Set(colors).size).toBe(CHOICE_COUNT);
          expect(DISTINCT_ITEM_COLORS).toEqual(expect.arrayContaining(colors));
        }
      },
    );

    it.each(VISUAL_LEVELS.filter((level) => level.config.colorMode === 'distinct'))(
      '$id : l’intrus ne se repère pas à sa couleur',
      (level) => {
        const colors = roundsOf(level).map((round) => {
          const rowIds = idsOf(round.row);
          const intruders = itemsOf(round).filter((item) => !rowIds.includes(item.id));

          return at(intruders, 0).colorClass;
        });

        expect(new Set(colors)).toEqual(new Set(DISTINCT_ITEM_COLORS));
      },
    );
  });

  describe('Défis en sons', () => {
    /** Bonne suite puis les deux autres ordres, par règle et par nombre de temps (§3.2). */
    const SOUND_ORDERS: Record<string, [answer: string, ...others: string[]]> = {
      'ab/4': ['A-B-A-B', 'A-A-B-B', 'A-B-B-A'],
      'abb/3': ['A-B-B', 'A-A-B', 'A-B-A'],
      'abb/6': ['A-B-B-A-B-B', 'A-A-B-A-A-B', 'A-B-A-A-B-A'],
    };

    it.each(SOUND_LEVELS)(
      '$id : ligne et propositions ont autant de temps, avec les deux sons',
      (level) => {
        const { visibleItems } = level.config;

        for (const round of roundsOf(level)) {
          const patterns = beatsOf(round);

          expect(round.row).toHaveLength(visibleItems);
          expect(patterns.map((beats) => beats.length)).toEqual([
            visibleItems,
            visibleItems,
            visibleItems,
          ]);
          expect(patterns.map((beats) => [...new Set(beats)].sort())).toEqual([
            ['bell', 'drum'],
            ['bell', 'drum'],
            ['bell', 'drum'],
          ]);
        }
      },
    );

    it.each(SOUND_LEVELS)('$id : trois suites différentes', (level) => {
      for (const round of roundsOf(level)) {
        expect(new Set(beatsOf(round).map((beats) => beats.join())).size).toBe(CHOICE_COUNT);
      }
    });

    it.each(SOUND_LEVELS)('$id : le premier temps ne renseigne pas', (level) => {
      for (const round of roundsOf(level)) {
        expect(new Set(beatsOf(round).map((beats) => beats[0])).size).toBe(1);
      }
    });

    it.each(SOUND_LEVELS)(
      '$id : seule la bonne proposition a la structure de la ligne',
      (level) => {
        for (const round of roundsOf(level)) {
          beatsOf(round).forEach((beats, index) => {
            expect(hasSameStructure(round.row, beats)).toBe(index === round.correctIndex);
          });
        }
      },
    );

    it.each(SOUND_LEVELS)('$id : la bonne suite et les deux autres ordres de §3.2', (level) => {
      const { rule, visibleItems } = level.config;
      const orders = SOUND_ORDERS[`${rule}/${String(visibleItems)}`];

      for (const round of roundsOf(level)) {
        const texts = beatsOf(round).map(toRoleText);

        expect(texts[round.correctIndex]).toBe(orders?.[0]);
        expect(new Set(texts)).toEqual(new Set(orders));
      }
    });

    it.each(SOUND_LEVELS)('$id : le son de A change d’un défi à l’autre', (level) => {
      for (const { rounds } of gamesOf(level)) {
        for (const [previous, next] of consecutive(rounds)) {
          expect(soundOfRoleA(next)).not.toBe(soundOfRoleA(previous));
        }
      }
    });

    it.each(SOUND_LEVELS)('$id : le son de A au premier défi est tiré au hasard', (level) => {
      const firstSounds = gamesOf(level).map((game) => soundOfRoleA(at(game.rounds, 0)));

      expect(new Set(firstSounds)).toEqual(new Set(['bell', 'drum']));
    });
  });

  describe('Association fixed : chaque élément garde son son', () => {
    it('couvre les deux premières étoiles de Difficile', () => {
      expect(FIXED_LEVELS.map((level) => level.id)).toEqual(['pat-013', 'pat-014']);
    });

    it.each(FIXED_LEVELS)('$id : les deux mêmes éléments sur toute l’étoile', (level) => {
      for (const { rounds } of gamesOf(level)) {
        const items = rounds.flatMap((round) =>
          round.row.map((item) => `${item.id}:${item.colorClass}`),
        );

        // Couleur comprise : l'élément reste visuellement le même d'un défi à l'autre.
        expect(new Set(items).size).toBe(2);
      }
    });

    it.each(FIXED_LEVELS)('$id : chaque élément garde son son sur toute l’étoile', (level) => {
      for (const { rounds } of gamesOf(level)) {
        const heard = [...soundsHeardByItem(rounds).values()];

        expect(heard).toHaveLength(2);
        expect(heard.map((sounds) => sounds.size)).toEqual([1, 1]);
        // Les deux éléments n'ont pas le même son.
        expect(new Set(heard.flatMap((sounds) => [...sounds]))).toEqual(new Set(['bell', 'drum']));
      }
    });

    it.each(FIXED_LEVELS)(
      '$id : les éléments échangent les rôles A et B à chaque défi',
      (level) => {
        for (const { rounds } of gamesOf(level)) {
          for (const [previous, next] of consecutive(rounds)) {
            expect(at(next.row, 0).id).toBe(at(previous.row, 1).id);
            expect(at(next.row, 1).id).toBe(at(previous.row, 0).id);
          }
        }
      },
    );

    it.each(FIXED_LEVELS)('$id : l’association change d’une partie à l’autre', (level) => {
      const heard = soundsHeardByItem(roundsOf(level));

      expect(new Set(heard.keys())).toEqual(new Set(PATTERN_ITEMS[level.config.family]));
      for (const sounds of heard.values()) expect(sounds.size).toBe(2);
    });
  });

  describe('Association varied : seule la structure mène à la réponse', () => {
    it('couvre toutes les autres étoiles en sons', () => {
      expect(VARIED_LEVELS.map((level) => level.id)).toEqual([
        'pat-015',
        'pat-016',
        'pat-017',
        'pat-018',
        'pat-019',
        'pat-020',
      ]);
    });

    it.each(VARIED_LEVELS)('$id : de nouveaux éléments sont tirés au fil de l’étoile', (level) => {
      for (const { rounds } of gamesOf(level)) {
        const pairs = rounds.map((round) => idsOf(round.row).slice(0, 2).sort().join());

        expect(new Set(pairs).size).toBeGreaterThan(1);
      }
    });

    it.each(VARIED_LEVELS)('$id : un élément n’annonce jamais son son', (level) => {
      const heard = soundsHeardByItem(roundsOf(level));

      expect(new Set(heard.keys())).toEqual(new Set(PATTERN_ITEMS[level.config.family]));
      for (const sounds of heard.values()) expect(sounds.size).toBe(2);
    });
  });
});

describe('Machine à états', () => {
  it('beginRound : intro → choosing et déverrouille à nowMs', () => {
    const intro = createPatternsGame(visualConfig(), FIRST);

    expect(beginRound(intro, T0)).toEqual({ ...intro, phase: 'choosing', unlockedAtMs: T0 });
  });

  it('beginRound : intro → stop pour un défi ouvert par un STOP', () => {
    const intro = createPatternsGame(visualConfig({ stopRounds: 1 }), FIRST);

    expect(intro.round.startsWithStop).toBe(true);
    expect(beginRound(intro, T0)).toEqual({ ...intro, phase: 'stop', unlockedAtMs: T0 });
  });

  it('endStop : stop → choosing, déverrouille à la fin du STOP', () => {
    const stop = gameIn('stop');

    expect(endStop(stop, T0 + 2000)).toEqual({
      ...stop,
      phase: 'choosing',
      unlockedAtMs: T0 + 2000,
    });
  });

  it('tapChoice : choosing → listening pour des sons, puis endListening : → choosing', () => {
    const choosing = gameIn('choosing', 'sound');
    const listening = tapChoice(choosing, WRONG, T0 + 100);

    expect(listening).toEqual({ ...choosing, phase: 'listening', armedIndex: WRONG });
    expect(endListening(listening, T0 + 3000)).toEqual({
      ...listening,
      phase: 'choosing',
      unlockedAtMs: T0 + 3000,
    });
  });

  it('tapChoice : choosing → success pour une bonne pièce', () => {
    const choosing = gameIn('choosing');

    expect(tapChoice(choosing, RIGHT, T0 + 100)).toEqual({
      ...choosing,
      phase: 'success',
      moves: 1,
    });
  });

  it('advanceRound : success → intro du défi suivant, champs du défi remis à zéro', () => {
    let state = started(visualConfig({ stopRounds: 1 }));
    state = tapChoice(state, WRONG, T0 + 100);
    state = endStop(state, T0 + 2000);
    state = tapChoice(state, OTHER_WRONG, T0 + 2000 + TOO_FAST_MS);
    const success = tapChoice(state, RIGHT, T0 + 2000 + 2 * TOO_FAST_MS);

    const next = advanceRound(success);

    expect(next).toEqual({
      ...success,
      phase: 'intro',
      round: success.rounds[1],
      roundIndex: 1,
      armedIndex: null,
      roundMistakes: 0,
      lastWrongIndex: null,
    });
    expect(next.round).toBe(success.rounds[1]);
    // Compteurs de l'étoile : conservés d'un défi à l'autre.
    expect(next).toMatchObject({ mistakes: 1, moves: 2, impulsiveTaps: 1, wrongTick: 1 });
  });

  it('advanceRound : désarme la proposition et efface l’erreur du défi précédent', () => {
    let state = started(soundConfig());
    state = endListening(tapChoice(state, WRONG, T0), T0);
    state = tapChoice(state, WRONG, T0 + TOO_FAST_MS);
    state = tapChoice(endListening(tapChoice(state, RIGHT, T0), T0), RIGHT, T0);

    expect(state).toMatchObject({ phase: 'success', lastWrongIndex: WRONG, roundMistakes: 1 });
    expect(advanceRound({ ...state, armedIndex: RIGHT })).toMatchObject({
      phase: 'intro',
      armedIndex: null,
      roundMistakes: 0,
      lastWrongIndex: null,
    });
  });

  it('advanceRound : le dernier défi mène à won, sans changer de défi', () => {
    const success = answer(started(visualConfig({ rounds: 1 })), RIGHT, T0);

    expect(success.rounds).toHaveLength(1);
    expect(advanceRound(success)).toEqual({ ...success, phase: 'won' });
    expect(advanceRound(success).roundIndex).toBe(0);
  });

  it('enchaîne les défis dans l’ordre, le défi en cours toujours à jour', () => {
    const game = createPatternsGame(visualConfig({ rounds: 3 }), seeded(3));
    let state = game;

    for (const [index, round] of game.rounds.entries()) {
      expect(state).toMatchObject({ phase: 'intro', roundIndex: index });
      expect(state.round).toBe(round);
      state = advanceRound(tapChoice(beginRound(state, T0), round.correctIndex, T0));
    }

    expect(state.phase).toBe('won');
  });

  it.each(PATTERNS_CATALOG)(
    '$id : chaque défi avec STOP passe par stop, les autres non',
    (level) => {
      const game = createPatternsGame(level.config, seeded(11));
      let state = game;
      let stops = 0;

      for (const round of game.rounds) {
        state = beginRound(state, T0);
        expect(state.phase).toBe(round.startsWithStop ? 'stop' : 'choosing');
        if (state.phase === 'stop') stops += 1;
        state = advanceRound(answer(endStop(state, T0), round.correctIndex, T0));
      }

      expect(stops).toBe(level.config.stopRounds);
      expect(state.phase).toBe('won');
    },
  );
});

describe('Actions ignorées : l’état reçu est renvoyé tel quel', () => {
  const STATES: [PatternAnswerMode, PatternPhase][] = [
    ['visual', 'intro'],
    ['visual', 'stop'],
    ['visual', 'choosing'],
    ['visual', 'success'],
    ['visual', 'won'],
    ['sound', 'intro'],
    ['sound', 'stop'],
    ['sound', 'choosing'],
    ['sound', 'listening'],
    ['sound', 'success'],
    ['sound', 'won'],
  ];

  const statesOutside = (phase: PatternPhase) =>
    STATES.filter(([, statePhase]) => statePhase !== phase);

  it.each(STATES)('prépare %s, phase %s', (mode, phase) => {
    expect(gameIn(phase, mode)).toMatchObject({ phase, config: { answerMode: mode } });
  });

  it.each(statesOutside('intro'))('beginRound : %s, phase %s', (mode, phase) => {
    const state = gameIn(phase, mode);

    expect(beginRound(state, T0 + 1)).toBe(state);
  });

  it.each(statesOutside('stop'))('endStop : %s, phase %s', (mode, phase) => {
    const state = gameIn(phase, mode);

    expect(endStop(state, T0 + 1)).toBe(state);
  });

  it.each(statesOutside('listening'))('endListening : %s, phase %s', (mode, phase) => {
    const state = gameIn(phase, mode);

    expect(endListening(state, T0 + 1)).toBe(state);
  });

  it.each(statesOutside('success'))('advanceRound : %s, phase %s', (mode, phase) => {
    const state = gameIn(phase, mode);

    expect(advanceRound(state)).toBe(state);
  });

  it.each(STATES.filter(([, phase]) => ['intro', 'listening', 'success', 'won'].includes(phase)))(
    'tapChoice sur chaque proposition : %s, phase %s',
    (mode, phase) => {
      const state = gameIn(phase, mode);

      for (const index of [RIGHT, WRONG, OTHER_WRONG]) {
        expect(tapChoice(state, index, T0 + TOO_FAST_MS)).toBe(state);
      }
    },
  );

  it.each(STATES)('tapChoice hors des propositions : %s, phase %s', (mode, phase) => {
    const state = gameIn(phase, mode);

    for (const index of [-1, CHOICE_COUNT, 99, 0.5, 1.5, Number.NaN, Infinity, -Infinity]) {
      expect(tapChoice(state, index, T0 + TOO_FAST_MS)).toBe(state);
    }
  });

  it('une proposition armée reste armée après une tape hors des propositions', () => {
    const ready = endListening(gameIn('listening', 'sound'), T0);

    expect(tapChoice(ready, -1, T0 + 1)).toBe(ready);
    expect(ready.armedIndex).toBe(RIGHT);
  });
});

describe('tapChoice pendant un STOP', () => {
  it.each([RIGHT, WRONG, OTHER_WRONG])(
    'ne compte qu’un geste impulsif, phase et durée inchangées (proposition %i)',
    (index) => {
      const stop = gameIn('stop');
      const next = tapChoice(stop, index, T0 + 500);

      expect(next).not.toBe(stop);
      expect(next).toEqual({ ...stop, impulsiveTaps: 1 });
    },
  );

  it('n’écoute ni n’arme une proposition sonore', () => {
    const stop = gameIn('stop', 'sound');

    expect(tapChoice(stop, WRONG, T0 + 500)).toEqual({ ...stop, impulsiveTaps: 1 });
  });

  it('compte chaque tape, et la fin du STOP arrive comme prévu', () => {
    let state = gameIn('stop');

    for (const offset of [100, 200, 300]) state = tapChoice(state, WRONG, T0 + offset);

    expect(state).toMatchObject({
      phase: 'stop',
      impulsiveTaps: 3,
      unlockedAtMs: T0,
      mistakes: 0,
      roundMistakes: 0,
      moves: 0,
      wrongTick: 0,
      lastWrongIndex: null,
    });
    expect(endStop(state, T0 + 2000)).toMatchObject({
      phase: 'choosing',
      impulsiveTaps: 3,
      unlockedAtMs: T0 + 2000,
    });
  });

  it('compte aussi les tapes pendant un STOP dû à une erreur trop rapide', () => {
    const stop = tapChoice(gameIn('choosing'), WRONG, T0 + 100);

    expect(stop.phase).toBe('stop');
    expect(tapChoice(stop, RIGHT, T0 + 200)).toEqual({ ...stop, impulsiveTaps: 1 });
  });
});

describe('Réponses en sons : écouter, puis valider', () => {
  it('la première tape écoute et arme, sans valider, même sur la bonne suite', () => {
    const choosing = gameIn('choosing', 'sound');
    const next = tapChoice(choosing, RIGHT, T0 + 100);

    expect(next).toEqual({ ...choosing, phase: 'listening', armedIndex: RIGHT });
    expect(next.moves).toBe(0);
  });

  it('un double tap pendant l’écoute ne valide jamais', () => {
    const listening = gameIn('listening', 'sound');

    expect(tapChoice(listening, RIGHT, T0 + 1)).toBe(listening);
  });

  it('une tape sur une autre proposition pendant l’écoute ne l’interrompt pas', () => {
    const listening = gameIn('listening', 'sound');

    expect(tapChoice(listening, WRONG, T0 + 1)).toBe(listening);
  });

  it('une tape sur la proposition armée après l’écoute la valide', () => {
    const ready = endListening(gameIn('listening', 'sound'), T0 + 3000);

    expect(ready).toMatchObject({ phase: 'choosing', armedIndex: RIGHT });
    expect(tapChoice(ready, RIGHT, T0 + 3100)).toEqual({
      ...ready,
      phase: 'success',
      armedIndex: null,
      moves: 1,
    });
  });

  it('une tape sur une autre proposition la réarme, sans valider ni compter d’erreur', () => {
    const ready = endListening(tapChoice(gameIn('choosing', 'sound'), RIGHT, T0), T0 + 3000);

    const next = tapChoice(ready, WRONG, T0 + 3100);

    expect(next).toEqual({ ...ready, phase: 'listening', armedIndex: WRONG });
    expect(next).toMatchObject({ moves: 0, mistakes: 0, roundMistakes: 0, wrongTick: 0 });
  });

  it('passer d’une mauvaise proposition à la bonne n’est pas une validation', () => {
    const ready = endListening(tapChoice(gameIn('choosing', 'sound'), WRONG, T0), T0 + 3000);

    expect(tapChoice(ready, RIGHT, T0 + 3100)).toMatchObject({
      phase: 'listening',
      armedIndex: RIGHT,
      moves: 0,
    });
  });

  it('une mauvaise validation désarme, et la suite doit être réécoutée', () => {
    const ready = endListening(tapChoice(gameIn('choosing', 'sound'), WRONG, T0), T0 + 3000);

    const wrong = tapChoice(ready, WRONG, T0 + 3000 + TOO_FAST_MS);

    expect(wrong).toEqual({
      ...ready,
      phase: 'choosing',
      armedIndex: null,
      moves: 1,
      roundMistakes: 1,
      mistakes: 1,
      unlockedAtMs: T0 + 3000 + TOO_FAST_MS,
      lastWrongIndex: WRONG,
      wrongTick: 1,
    });
    // Toujours disponible, mais une nouvelle tape l'écoute au lieu de compter une autre erreur.
    expect(tapChoice(wrong, WRONG, T0 + 3000 + 2 * TOO_FAST_MS)).toEqual({
      ...wrong,
      phase: 'listening',
      armedIndex: WRONG,
    });
  });

  it('une mauvaise validation juste après l’écoute déclenche un STOP (§6)', () => {
    const ready = endListening(tapChoice(gameIn('choosing', 'sound'), WRONG, T0), T0 + 3000);

    expect(tapChoice(ready, WRONG, T0 + 3000 + TOO_FAST_MS - 1)).toMatchObject({
      phase: 'stop',
      armedIndex: null,
      mistakes: 1,
    });
  });

  it('une bonne validation juste après l’écoute n’est jamais pénalisée', () => {
    const ready = endListening(gameIn('listening', 'sound'), T0 + 3000);

    expect(tapChoice(ready, RIGHT, T0 + 3000).phase).toBe('success');
  });

  it('l’écoute se mesure depuis sa fin, pas depuis la tape qui l’a lancée', () => {
    const listening = tapChoice(gameIn('choosing', 'sound'), WRONG, T0 + TOO_FAST_MS);

    // L'écoute ne déverrouille qu'à sa fin : la première tape n'a pas touché à la mesure.
    expect(listening.unlockedAtMs).toBe(T0);
    expect(endListening(listening, T0 + 9000).unlockedAtMs).toBe(T0 + 9000);
  });

  it('après un STOP dû à une erreur, la proposition se réécoute avant d’être validée', () => {
    const ready = endListening(tapChoice(gameIn('choosing', 'sound'), RIGHT, T0), T0);
    const armedWrong = endListening(tapChoice(ready, WRONG, T0), T0);
    const stop = tapChoice(armedWrong, WRONG, T0 + 1);
    const unlocked = endStop(stop, T0 + 3000);

    expect(stop).toMatchObject({ phase: 'stop', armedIndex: null });
    expect(tapChoice(unlocked, RIGHT, T0 + 3001)).toMatchObject({
      phase: 'listening',
      armedIndex: RIGHT,
    });
  });

  it('une pièce n’est jamais écoutée : la première tape valide, sans armer', () => {
    const choosing = gameIn('choosing');

    expect(tapChoice(choosing, RIGHT, T0).phase).toBe('success');
    expect(tapChoice(choosing, WRONG, T0 + TOO_FAST_MS)).toMatchObject({
      phase: 'choosing',
      armedIndex: null,
      moves: 1,
    });
  });

  it('ne compte comme coups que les réponses validées', () => {
    let state = gameIn('choosing', 'sound');
    state = endListening(tapChoice(state, WRONG, T0), T0); // écoute : aucun coup
    state = endListening(tapChoice(state, OTHER_WRONG, T0), T0); // autre écoute : aucun coup
    expect(state.moves).toBe(0);

    state = tapChoice(state, OTHER_WRONG, T0 + TOO_FAST_MS); // mauvaise réponse : 1 coup
    state = endListening(tapChoice(state, RIGHT, T0 + TOO_FAST_MS), T0 + TOO_FAST_MS);
    state = tapChoice(state, RIGHT, T0 + TOO_FAST_MS); // bonne réponse : 1 coup

    expect(state).toMatchObject({ phase: 'success', moves: 2, mistakes: 1 });
  });
});

describe('Mauvaise réponse', () => {
  it('compte l’erreur, rebondit et garde la proposition disponible', () => {
    const choosing = gameIn('choosing');

    const wrong = tapChoice(choosing, WRONG, T0 + TOO_FAST_MS);

    expect(wrong).toEqual({
      ...choosing,
      moves: 1,
      roundMistakes: 1,
      mistakes: 1,
      unlockedAtMs: T0 + TOO_FAST_MS,
      lastWrongIndex: WRONG,
      wrongTick: 1,
    });
    // Toujours sélectionnable : une 2e tape sur la même pièce compte comme une nouvelle réponse.
    expect(tapChoice(wrong, WRONG, T0 + 2 * TOO_FAST_MS)).toMatchObject({
      phase: 'choosing',
      roundMistakes: 2,
      mistakes: 2,
      moves: 2,
    });
  });

  it('relance le rebond à chaque erreur, même sur la même pièce', () => {
    const first = tapChoice(gameIn('choosing'), WRONG, T0 + TOO_FAST_MS);
    const second = tapChoice(first, WRONG, T0 + 2 * TOO_FAST_MS);
    const third = tapChoice(second, OTHER_WRONG, T0 + 3 * TOO_FAST_MS);

    expect(first).toMatchObject({ wrongTick: 1, lastWrongIndex: WRONG });
    expect(second).toMatchObject({ wrongTick: 2, lastWrongIndex: WRONG });
    expect(third).toMatchObject({ wrongTick: 3, lastWrongIndex: OTHER_WRONG });
  });

  it('une bonne réponse après une erreur finit le défi, l’erreur restant visible', () => {
    const wrong = tapChoice(gameIn('choosing'), WRONG, T0 + TOO_FAST_MS);

    expect(tapChoice(wrong, RIGHT, T0 + 2 * TOO_FAST_MS)).toEqual({
      ...wrong,
      phase: 'success',
      moves: 2,
    });
  });
});

describe('Erreur trop rapide', () => {
  it('déclenche un STOP juste avant TOO_FAST_MS, pas à TOO_FAST_MS', () => {
    const choosing = gameIn('choosing');

    expect(tapChoice(choosing, WRONG, T0 + TOO_FAST_MS - 1).phase).toBe('stop');
    expect(tapChoice(choosing, WRONG, T0 + TOO_FAST_MS).phase).toBe('choosing');
  });

  it('compte l’erreur de la même façon, avec ou sans STOP', () => {
    const choosing = gameIn('choosing');
    const fast = tapChoice(choosing, WRONG, T0 + 1);
    const slow = tapChoice(choosing, WRONG, T0 + TOO_FAST_MS);

    for (const state of [fast, slow]) {
      expect(state).toMatchObject({
        moves: 1,
        mistakes: 1,
        roundMistakes: 1,
        wrongTick: 1,
        lastWrongIndex: WRONG,
        armedIndex: null,
        impulsiveTaps: 0,
      });
    }
  });

  it.each([0, 1, TOO_FAST_MS - 1])(
    'ne pénalise jamais une bonne réponse, même à %i ms',
    (delay) => {
      const success = tapChoice(gameIn('choosing'), RIGHT, T0 + delay);

      expect(success).toMatchObject({ phase: 'success', mistakes: 0, moves: 1 });
    },
  );

  it('une 2e erreur peu après la 1re déclenche un STOP : la 1re a relancé la mesure', () => {
    const first = tapChoice(gameIn('choosing'), WRONG, T0 + 5000);

    expect(first).toMatchObject({ phase: 'choosing', unlockedAtMs: T0 + 5000 });
    expect(tapChoice(first, OTHER_WRONG, T0 + 5000 + 100)).toMatchObject({
      phase: 'stop',
      mistakes: 2,
      unlockedAtMs: T0 + 5100,
    });
    expect(tapChoice(first, OTHER_WRONG, T0 + 5000 + TOO_FAST_MS).phase).toBe('choosing');
  });

  it('la mesure repart à la fin d’un STOP dû à une erreur', () => {
    const stop = tapChoice(gameIn('choosing'), WRONG, T0 + 100);
    const unlocked = endStop(stop, T0 + 5000);

    expect(stop.phase).toBe('stop');
    expect(tapChoice(unlocked, WRONG, T0 + 5000 + TOO_FAST_MS - 1).phase).toBe('stop');
    expect(tapChoice(unlocked, WRONG, T0 + 5000 + TOO_FAST_MS).phase).toBe('choosing');
  });

  it('la mesure repart à la fin d’un STOP prévu, pas au début du défi', () => {
    const unlocked = endStop(gameIn('stop'), T0 + 2000);

    expect(tapChoice(unlocked, WRONG, T0 + 2000 + TOO_FAST_MS - 1).phase).toBe('stop');
    expect(tapChoice(unlocked, WRONG, T0 + 2000 + TOO_FAST_MS).phase).toBe('choosing');
  });

  it('la mesure part de beginRound, à chaque défi', () => {
    const first = gameIn('choosing');
    const intro = advanceRound(tapChoice(first, RIGHT, T0 + 100));
    const second = beginRound(intro, T0 + 9000);

    expect(tapChoice(second, WRONG, T0 + 9000 + TOO_FAST_MS - 1).phase).toBe('stop');
    expect(tapChoice(second, WRONG, T0 + 9000 + TOO_FAST_MS).phase).toBe('choosing');
  });

  it('la pause d’un STOP ne fait pas perdre une erreur déjà commise', () => {
    const stop = tapChoice(gameIn('choosing'), WRONG, T0 + 100);

    expect(endStop(stop, T0 + 5000)).toMatchObject({
      phase: 'choosing',
      roundMistakes: 1,
      mistakes: 1,
      lastWrongIndex: WRONG,
    });
  });
});

describe('getHelpLevel', () => {
  it('monte à 0, 0, 1, 2, 2 pour 0 à 4 mauvaises réponses', () => {
    let state = gameIn('choosing');
    const levels = [getHelpLevel(state)];

    for (let count = 1; count <= 4; count += 1) {
      state = tapChoice(state, WRONG, T0 + count * TOO_FAST_MS);
      levels.push(getHelpLevel(state));
    }

    expect(state.roundMistakes).toBe(4);
    expect(levels).toEqual([0, 0, 1, 2, 2]);
  });

  it('compte aussi les erreurs trop rapides, celles qui déclenchent un STOP', () => {
    let state = gameIn('choosing');

    for (let count = 1; count <= 3; count += 1) {
      state = endStop(tapChoice(state, WRONG, T0 + count), T0 + count);
    }

    expect(getHelpLevel(state)).toBe(2);
  });

  it('repart de 0 au défi suivant, le total de l’étoile restant acquis', () => {
    let state = gameIn('choosing');
    for (let count = 1; count <= 3; count += 1) {
      state = tapChoice(state, WRONG, T0 + count * TOO_FAST_MS);
    }
    const success = tapChoice(state, RIGHT, T0 + 4 * TOO_FAST_MS);

    expect(getHelpLevel(success)).toBe(2);

    const next = advanceRound(success);

    expect(getHelpLevel(next)).toBe(0);
    expect(next).toMatchObject({ roundMistakes: 0, mistakes: 3 });
    expect(getHelpLevel(beginRound(next, T0))).toBe(0);
  });

  it('la 2e erreur suffit, sur des propositions différentes', () => {
    const first = tapChoice(gameIn('choosing'), WRONG, T0 + TOO_FAST_MS);
    const second = tapChoice(first, OTHER_WRONG, T0 + 2 * TOO_FAST_MS);

    expect(getHelpLevel(first)).toBe(0);
    expect(getHelpLevel(second)).toBe(1);
  });
});

describe('isPerfectWin', () => {
  const perfect = (round: PatternRound) => [round.correctIndex];

  it('est vrai pour une étoile gagnée sans erreur ni tape pendant un STOP', () => {
    const won = playStar(createPatternsGame(visualConfig({ stopRounds: 1 }), FIRST), perfect);

    expect(won).toMatchObject({ phase: 'won', mistakes: 0, impulsiveTaps: 0 });
    expect(isPerfectWin(won)).toBe(true);
  });

  it('est faux avant won, à chaque étape d’une partie parfaite', () => {
    const intro = createPatternsGame(visualConfig({ rounds: 1, stopRounds: 1 }), FIRST);
    const stop = beginRound(intro, T0);
    const choosing = endStop(stop, T0 + 2000);
    const success = tapChoice(choosing, RIGHT, T0 + 2100);

    for (const state of [intro, stop, choosing, success]) {
      expect(isPerfectWin(state)).toBe(false);
    }
    expect(isPerfectWin(advanceRound(success))).toBe(true);
  });

  it('est faux pour une proposition sonore en écoute', () => {
    expect(isPerfectWin(gameIn('listening', 'sound'))).toBe(false);
  });

  it('est faux après une seule mauvaise réponse, sur un seul défi de l’étoile', () => {
    const game = createPatternsGame(visualConfig(), FIRST);
    const won = playStar(game, (round) =>
      round === game.rounds[1] ? [WRONG, round.correctIndex] : [round.correctIndex],
    );

    expect(won).toMatchObject({ phase: 'won', mistakes: 1, impulsiveTaps: 0 });
    expect(isPerfectWin(won)).toBe(false);
  });

  it('est faux après une seule tape pendant un STOP', () => {
    const stop = started(visualConfig({ rounds: 1, stopRounds: 1 }));
    const tapped = endStop(tapChoice(stop, RIGHT, T0 + 100), T0 + 2000);
    const won = advanceRound(tapChoice(tapped, RIGHT, T0 + 2100));

    expect(won).toMatchObject({ phase: 'won', mistakes: 0, impulsiveTaps: 1 });
    expect(isPerfectWin(won)).toBe(false);
  });
});

describe('Une étoile ne peut pas être perdue', () => {
  const wrongsThenRight = (round: PatternRound): number[] => [
    ...[0, 1, 2].filter((index) => index !== round.correctIndex),
    round.correctIndex,
  ];

  it.each(PATTERNS_CATALOG)('$id : se gagne avec la couronne sans aucune erreur', (level) => {
    for (const seed of SEEDS.slice(0, 5)) {
      const won = playStar(createPatternsGame(level.config, seeded(seed)), (round) => [
        round.correctIndex,
      ]);

      expect(won).toMatchObject({
        phase: 'won',
        roundIndex: level.config.rounds - 1,
        moves: level.config.rounds,
        mistakes: 0,
        impulsiveTaps: 0,
      });
      expect(isPerfectWin(won)).toBe(true);
    }
  });

  it.each(PATTERNS_CATALOG)('$id : se gagne aussi en se trompant à chaque fois', (level) => {
    const { rounds } = level.config;

    for (const seed of SEEDS.slice(0, 5)) {
      const won = playStar(createPatternsGame(level.config, seeded(seed)), wrongsThenRight);

      expect(won).toMatchObject({
        phase: 'won',
        moves: 3 * rounds,
        mistakes: 2 * rounds,
        wrongTick: 2 * rounds,
      });
      expect(isPerfectWin(won)).toBe(false);
    }
  });
});

describe('Pureté', () => {
  /** Action sur un état gelé : une écriture lèverait, et l'état reçu doit rester identique. */
  function pure(
    state: PatternGameState,
    action: (state: PatternGameState) => PatternGameState,
  ): PatternGameState {
    const before = structuredClone(state);
    const next = action(deepFreeze(state));

    expect(state).toEqual(before);
    return next;
  }

  it.each<[string, PatternLevelConfig]>([
    ['pièces', visualConfig({ rounds: 2, stopRounds: 1 })],
    ['sons', soundConfig({ rounds: 2, stopRounds: 1 })],
  ])('ne modifie jamais un état reçu, de la création à la victoire : %s', (_, config) => {
    let state = createPatternsGame(deepFreeze(config), FIRST);

    state = pure(state, (received) => tapChoice(received, RIGHT, T0));
    state = pure(state, (received) => beginRound(received, T0));
    expect(state.phase).toBe('stop');
    state = pure(state, (received) => tapChoice(received, WRONG, T0 + 1));
    state = pure(state, (received) => endStop(received, T0 + 2000));
    state = pure(state, (received) => tapChoice(received, WRONG, T0 + 2001));
    if (state.phase === 'listening') {
      state = pure(state, (received) => tapChoice(received, WRONG, T0 + 2002));
      state = pure(state, (received) => endListening(received, T0 + 3000));
      state = pure(state, (received) => tapChoice(received, WRONG, T0 + 3001));
    }
    expect(state.phase).toBe('stop');
    state = pure(state, (received) => endStop(received, T0 + 5000));
    state = pure(state, (received) => tapChoice(received, RIGHT, T0 + 5001));
    if (state.phase === 'listening') {
      state = pure(state, (received) => endListening(received, T0 + 6000));
      state = pure(state, (received) => tapChoice(received, RIGHT, T0 + 6001));
    }
    expect(state.phase).toBe('success');
    state = pure(state, advanceRound);
    state = pure(state, (received) => beginRound(received, T0 + 7000));
    state = pure(state, (received) => tapChoice(received, RIGHT, T0 + 7001));
    if (state.phase === 'listening') {
      state = pure(state, (received) => endListening(received, T0 + 8000));
      state = pure(state, (received) => tapChoice(received, RIGHT, T0 + 8001));
    }
    state = pure(state, advanceRound);

    expect(state.phase).toBe('won');
    expect(pure(state, advanceRound)).toBe(state);
    expect(getHelpLevel(deepFreeze(state))).toBe(0);
    expect(isPerfectWin(deepFreeze(state))).toBe(false);
  });

  it('ne modifie ni la configuration ni les banques d’éléments en tirant les défis', () => {
    const items = structuredClone(PATTERN_ITEMS);
    const colors = [...DISTINCT_ITEM_COLORS];
    const config = soundConfig({ soundPairing: 'varied', stopRounds: 2 });
    const before = structuredClone(config);

    for (const seed of SEEDS.slice(0, 5)) createPatternsGame(config, seeded(seed));

    expect(config).toEqual(before);
    expect(PATTERN_ITEMS).toEqual(items);
    expect(DISTINCT_ITEM_COLORS).toEqual(colors);
  });
});
