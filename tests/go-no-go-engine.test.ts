// @vitest-environment node
import {
  createGoNoGoGame,
  createTrialPlan,
  getGoNoGoConfigErrors,
  getHeldSpeedSeconds,
  getHeldWindowMs,
  getHelpStage,
  getShownLimit,
  HELD_RUN,
  interruptAppearance,
  isOverrun,
  isPerfectWin,
  judgeAppearance,
  MAX_APPEARANCES,
  MAX_WINDOW_MS,
  MIN_STOP_DELAY_MS,
  resolveAppearance,
  startAppearance,
  TRAP_FREE_APPEARANCES,
} from '@/games/go-no-go/engine';
import { FLYING_IMAGES, GROUNDED_IMAGES } from '@/games/go-no-go/subjects';
import type { Appearance, GoNoGoLevelConfig, GoNoGoState, OnStage } from '@/games/go-no-go/types';
import { createSeededRng } from '@/games/logic-grid/generator';
import type { Rng } from '@/games/memory/random';
import { describe, expect, it } from 'vitest';

/** Tirage toujours nul : la première série, la première image, la remise la plus proche. */
const FIRST: Rng = () => 0;
/** Tirage toujours au plus haut : la dernière série, la dernière image, la remise la plus lointaine. */
const LAST: Rng = () => 0.999999;

/** Générateur à graine du catalogue (mulberry32) : parties reproductibles. */
const seeded = createSeededRng;

/** Règle 1 : 12 apparitions dont 3 pièges (le renard), fenêtre de 2,5 à 2 s. */
const OWL: GoNoGoLevelConfig = {
  rule: 'owl-says',
  appearances: 12,
  traps: 3,
  stops: 0,
  startWindowMs: 2500,
  fastestWindowMs: 2000,
  hideouts: 1,
  decoys: ['fox'],
  hasLure: false,
  stopDelayCeilingMs: null,
  intro: null,
  maxTrapRun: 1,
};

/** Règle 2 : 20 apparitions dont 5 pièges, avec le leurre de la chouette. */
const FLIES: GoNoGoLevelConfig = {
  rule: 'flies',
  appearances: 20,
  traps: 5,
  stops: 0,
  startWindowMs: 2000,
  fastestWindowMs: 1500,
  hideouts: 1,
  decoys: [],
  hasLure: true,
  stopDelayCeilingMs: null,
  intro: 'lure',
  maxTrapRun: 2,
};

/** Règle 3 : 20 apparitions dont 5 STOP tardifs, délai de 300 ms au plus. */
const LATE_STOP: GoNoGoLevelConfig = {
  rule: 'late-stop',
  appearances: 20,
  traps: 0,
  stops: 5,
  startWindowMs: 1800,
  fastestWindowMs: 1400,
  hideouts: 1,
  decoys: [],
  hasLure: false,
  stopDelayCeilingMs: 300,
  intro: 'full',
  maxTrapRun: 2,
};

/** Règle 3 mêlée à « Ça vole ? » : des pièges et des STOP. */
const MIXED: GoNoGoLevelConfig = {
  ...LATE_STOP,
  appearances: 24,
  traps: 4,
  stops: 5,
  intro: null,
};

/** Valeur que le test sait présente : une absence est une erreur du test, pas un cas à contourner. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('valeur absente');
  return value;
}

/** La file en une chaîne : `.` cible, `T` piège, `S` STOP tardif. */
function pattern(queue: readonly Appearance[]): string {
  return queue.map((entry) => ({ target: '.', trap: 'T', stop: 'S' })[entry.kind]).join('');
}

/** Fait entrer l'apparition suivante et renvoie l'état, l'apparition sur scène présente. */
function enter(state: GoNoGoState): GoNoGoState & { onStage: OnStage } {
  const next = startAppearance(state);
  const { onStage } = next;
  if (!onStage) throw new Error('aucune apparition sur scène');
  return { ...next, onStage };
}

/** Une apparition, jouée avec un appui à `pressedAtMs` (`null` : fenêtre écoulée sans appui). */
function play(state: GoNoGoState, pressedAtMs: number | null, rng: Rng = FIRST): GoNoGoState {
  return resolveAppearance(enter(state), pressedAtMs, rng);
}

/** L'enfant attentive : appuie sur la cible, se retient devant un piège ou un STOP. */
function answerCorrectly(state: GoNoGoState): GoNoGoState {
  const entered = enter(state);
  return resolveAppearance(
    entered,
    entered.onStage.appearance.kind === 'target' ? 500 : null,
    FIRST,
  );
}

/** Joue `count` apparitions correctes à la suite. */
function playCorrectly(state: GoNoGoState, count: number): GoNoGoState {
  let current = state;
  for (let index = 0; index < count; index += 1) current = answerCorrectly(current);
  return current;
}

describe('getHelpStage', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [9, 3],
  ] as const)('range %i erreur(s) d’affilée à l’échelon %i', (streak, stage) => {
    expect(getHelpStage(streak)).toBe(stage);
  });
});

describe('getShownLimit', () => {
  it.each([
    [12, 18],
    [16, 24],
    [20, 30],
    [24, 36],
    [28, 42],
    [15, 23],
  ])(
    'tient %i apparitions prévues jusqu’à %i montrées (1,5 fois, arrondi en haut)',
    (planned, limit) => {
      expect(getShownLimit(planned)).toBe(limit);
    },
  );
});

describe('getGoNoGoConfigErrors', () => {
  it.each([
    ['« owl-says »', OWL],
    ['« flies » avec leurre', FLIES],
    ['« late-stop »', LATE_STOP],
    ['« late-stop » mêlée', MIXED],
  ])('accepte une configuration %s', (_name, config) => {
    expect(getGoNoGoConfigErrors(config)).toEqual([]);
  });

  const invalid: [string, Partial<Record<keyof GoNoGoLevelConfig, unknown>>, string][] = [
    ['règle inconnue', { rule: 'zigzag' }, 'rule « zigzag » inconnue'],
    ['trop peu d’apparitions', { appearances: 3 }, 'appearances 3 invalide'],
    ['trop d’apparitions', { appearances: MAX_APPEARANCES + 1 }, 'appearances 41 invalide'],
    ['apparitions décimales', { appearances: 12.5 }, 'appearances 12.5 invalide'],
    ['pièges négatifs', { traps: -1 }, 'traps -1 invalide'],
    ['STOP décimaux', { stops: 0.5 }, 'stops 0.5 invalide'],
    ['aucun piège', { traps: 0 }, 'aucun piège ni STOP tardif'],
    ['trop de pièges', { traps: 6 }, '6 pièges ne tiennent pas dans 12 apparitions'],
    ['série de pièges inconnue', { maxTrapRun: 3 }, 'maxTrapRun 3 invalide'],
    [
      'fenêtre de départ trop lente',
      { startWindowMs: 3500 },
      'startWindowMs 3500 au-delà de 3000 ms',
    ],
    ['vitesse maximale plus lente', { fastestWindowMs: 2600 }, 'fastestWindowMs 2600 plus lente'],
    ['fenêtres décimales', { startWindowMs: 2500.5 }, 'fenêtres : entiers en ms attendus'],
    ['trois cachettes sans castelet', { rule: 'flies', hideouts: 3 }, 'hideouts : les cachettes'],
    ['deux cachettes', { hideouts: 2 }, 'hideouts 2 invalide'],
    ['aucun imposteur', { decoys: [] }, 'decoys vide'],
    ['imposteur inconnu', { decoys: ['owl'] }, 'decoys : imposteur « owl » inconnu'],
    ['imposteur en double', { decoys: ['fox', 'fox'] }, 'decoys : imposteur en double'],
    ['imposteur hors du castelet', { rule: 'flies', decoys: ['fox'] }, 'decoys : les imposteurs'],
    ['leurre hors de « flies »', { hasLure: true }, 'hasLure : le leurre'],
    ['délai de STOP hors de la règle 3', { stopDelayCeilingMs: 300 }, 'stopDelayCeilingMs hors'],
    ['STOP hors de la règle 3', { stops: 1 }, 'stops 1 hors de la règle'],
    ['introduction inconnue', { intro: 'long' }, 'intro « long » inconnue'],
    ['démo courte sans leurre', { intro: 'lure' }, 'intro « lure » sans leurre'],
  ];

  it.each(invalid)('refuse %s', (_name, patch, message) => {
    const errors = getGoNoGoConfigErrors({ ...OWL, ...patch } as GoNoGoLevelConfig);
    expect(errors.some((error) => error.includes(message))).toBe(true);
  });

  it('refuse une règle 3 sans STOP tardif, sans délai, ou avec un délai plus long que la fenêtre moins 300 ms', () => {
    expect(getGoNoGoConfigErrors({ ...LATE_STOP, stops: 0, traps: 3 })).toContain(
      'règle « late-stop » sans STOP tardif (stops ≥ 1 attendu)',
    );
    expect(getGoNoGoConfigErrors({ ...LATE_STOP, stopDelayCeilingMs: null })).toContain(
      'stopDelayCeilingMs invalide (entier ≥ 100 ms attendu)',
    );
    expect(getGoNoGoConfigErrors({ ...LATE_STOP, stopDelayCeilingMs: 50 })).toContain(
      'stopDelayCeilingMs invalide (entier ≥ 100 ms attendu)',
    );
    expect(getGoNoGoConfigErrors({ ...LATE_STOP, stopDelayCeilingMs: 1200 })).toContain(
      'stopDelayCeilingMs 1200 au-delà de la vitesse maximale moins 300 ms',
    );
  });

  it('signale une règle 1 sans imposteur parmi les pièges', () => {
    expect(getGoNoGoConfigErrors({ ...OWL, traps: 0, stops: 1 })).toContain(
      'règle « owl-says » sans imposteur (traps ≥ 1)',
    );
  });

  it('refuse les pièges qui ne tiennent pas dans la file, série par série', () => {
    // 9 emplacements libres : 5 pièges isolés au mieux ; en séries de 2, 6.
    expect(getGoNoGoConfigErrors({ ...OWL, traps: 5 })).toEqual([]);
    expect(getGoNoGoConfigErrors({ ...OWL, traps: 6 })).toHaveLength(1);
    expect(getGoNoGoConfigErrors({ ...OWL, traps: 6, maxTrapRun: 2 })).toEqual([]);
    expect(getGoNoGoConfigErrors({ ...OWL, traps: 7, maxTrapRun: 2 })).toHaveLength(1);
  });

  it('cite chaque anomalie : plusieurs défauts, plusieurs messages', () => {
    const errors = getGoNoGoConfigErrors({ ...OWL, rule: 'flies', hideouts: 3, decoys: ['fox'] });
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('createGoNoGoGame', () => {
  it('commence entre deux apparitions, à la fenêtre de départ, sans rien de compté', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    expect(game).toMatchObject({
      config: OWL,
      status: 'between',
      onStage: null,
      windowMs: 2500,
      stopDelayMs: 150,
      runLength: 0,
      heldWindowMs: null,
      trapStreak: 0,
      missStreak: 0,
      shown: 0,
      cleared: 0,
      trapped: 0,
      missed: 0,
      lastResult: null,
    });
    expect(game.queue).toHaveLength(12);
  });

  it('lève une Error qui liste les anomalies d’une configuration invalide', () => {
    expect(() => createGoNoGoGame({ ...OWL, traps: 0 })).toThrow(
      /Configuration Pas si vite ! invalide : aucun piège ni STOP tardif/,
    );
  });

  it('numérote les apparitions de 1 à N', () => {
    const { queue } = createGoNoGoGame(OWL, seeded(3));
    expect(queue.map((entry) => entry.id)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it.each([
    ['le tirage le plus bas', FIRST],
    ['le tirage le plus haut', LAST],
    ['une graine', seeded(7)],
  ])('compose la file avec %s : bon nombre de pièges, aucun dans les 3 premières', (_name, rng) => {
    for (const config of [OWL, FLIES, LATE_STOP, MIXED]) {
      const { queue } = createGoNoGoGame(config, rng);
      expect(queue).toHaveLength(config.appearances);
      expect(queue.filter((entry) => entry.kind === 'trap')).toHaveLength(config.traps);
      expect(queue.filter((entry) => entry.kind === 'stop')).toHaveLength(config.stops);
      expect(queue.slice(0, TRAP_FREE_APPEARANCES).every((entry) => entry.kind === 'target')).toBe(
        true,
      );
    }
  });

  it('ne place jamais plus de pièges d’affilée que permis, pour tout tirage et toute configuration possible', () => {
    for (const maxTrapRun of [1, 2] as const) {
      for (let appearances = 4; appearances <= MAX_APPEARANCES; appearances += 1) {
        for (let traps = 1; traps < appearances; traps += 1) {
          const config: GoNoGoLevelConfig = {
            ...FLIES,
            hasLure: false,
            intro: null,
            appearances,
            traps,
            maxTrapRun,
          };
          if (getGoNoGoConfigErrors(config).length > 0) continue;
          for (const rng of [FIRST, LAST, () => 0.5, seeded(appearances * 100 + traps)]) {
            const pieces = pattern(createGoNoGoGame(config, rng).queue);
            expect(pieces.split('.').every((run) => run.length <= maxTrapRun)).toBe(true);
            expect(pieces.split('T').slice(1)).toHaveLength(traps);
            expect(pieces.slice(0, TRAP_FREE_APPEARANCES)).toBe('...');
          }
        }
      }
    }
  });

  it('place les pièges en fin de file avec le tirage le plus bas, en début avec le plus haut', () => {
    expect(pattern(createGoNoGoGame(OWL, FIRST).queue)).toBe('.......T.T.T');
    expect(pattern(createGoNoGoGame(OWL, LAST).queue)).toBe('...T.T.T....');
  });

  it('mêle les STOP et les pièges de la règle 3 mêlée, sans les confondre', () => {
    const { queue } = createGoNoGoGame(MIXED, seeded(5));
    expect(queue.filter((entry) => entry.kind === 'stop')).toHaveLength(5);
    expect(queue.filter((entry) => entry.kind === 'trap')).toHaveLength(4);
  });

  describe('règle 1 : la chouette a dit', () => {
    it('met la chouette en cible et un imposteur en piège', () => {
      const { queue } = createGoNoGoGame({ ...OWL, decoys: ['fox', 'cat'] }, seeded(11));
      for (const entry of queue) {
        if (entry.kind === 'target') expect(entry.subject).toBe('owl');
        else expect(['fox', 'cat']).toContain(entry.subject);
      }
    });

    it('n’emploie que les imposteurs de l’étoile', () => {
      const { queue } = createGoNoGoGame(OWL, seeded(2));
      expect(queue.filter((entry) => entry.kind === 'trap').every((e) => e.subject === 'fox')).toBe(
        true,
      );
    });

    it('sort toujours de la même cachette avec une seule, de l’une des trois sinon, sans répéter la précédente', () => {
      expect(createGoNoGoGame(OWL, seeded(4)).queue.every((entry) => entry.hideout === 0)).toBe(
        true,
      );
      const { queue } = createGoNoGoGame({ ...OWL, hideouts: 3 }, seeded(4));
      expect(new Set(queue.map((entry) => entry.hideout))).toEqual(new Set([0, 1, 2]));
      for (const [index, entry] of queue.entries()) {
        expect(entry.hideout).toBeGreaterThanOrEqual(0);
        expect(entry.hideout).toBeLessThan(3);
        if (index > 0) expect(entry.hideout).not.toBe(queue[index - 1]?.hideout);
      }
    });
  });

  describe('règles 2 et 3 : les images', () => {
    it('met une image qui vole en cible, une image qui ne vole pas en piège', () => {
      const { queue } = createGoNoGoGame(FLIES, seeded(8));
      for (const entry of queue) {
        const pool: readonly string[] = entry.kind === 'trap' ? GROUNDED_IMAGES : FLYING_IMAGES;
        expect(pool).toContain(entry.subject);
      }
    });

    it('fait voler aussi les images portant un STOP tardif', () => {
      const { queue } = createGoNoGoGame(MIXED, seeded(9));
      for (const entry of queue.filter((candidate) => candidate.kind === 'stop')) {
        expect(FLYING_IMAGES as readonly string[]).toContain(entry.subject);
      }
    });

    it('ne montre jamais la même image deux fois de suite', () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const { queue } = createGoNoGoGame(MIXED, seeded(seed));
        for (const [index, entry] of queue.entries()) {
          if (index > 0) expect(entry.subject).not.toBe(queue[index - 1]?.subject);
        }
      }
    });

    it('garde une seule cachette hors du castelet', () => {
      expect(createGoNoGoGame(FLIES, seeded(1)).queue.every((entry) => entry.hideout === 0)).toBe(
        true,
      );
    });
  });
});

describe('createTrialPlan', () => {
  it('prépare quatre essais : cible, cible, piège, cible', () => {
    const plan = createTrialPlan(OWL, seeded(1));
    expect(plan).toHaveLength(4);
    expect(pattern(plan)).toBe('..T.');
    expect(plan.map((entry) => entry.subject)).toEqual(['owl', 'owl', 'fox', 'owl']);
  });

  it('remplace le piège par un STOP tardif à la règle 3', () => {
    const plan = createTrialPlan(LATE_STOP, seeded(1));
    expect(pattern(plan)).toBe('..S.');
    expect(
      plan.every((entry) => (FLYING_IMAGES as readonly string[]).includes(entry.subject)),
    ).toBe(true);
  });

  it('prend un piège qui ne vole pas à la règle 2', () => {
    const plan = createTrialPlan(FLIES, seeded(1));
    expect(GROUNDED_IMAGES as readonly string[]).toContain(plan[2]?.subject);
    expect(FLYING_IMAGES as readonly string[]).toContain(plan[0]?.subject);
  });

  it('fait sortir les essais de trois cachettes l’une après l’autre', () => {
    const plan = createTrialPlan({ ...OWL, hideouts: 3 }, seeded(1));
    expect(plan.map((entry) => entry.hideout)).toEqual([0, 1, 2, 0]);
  });
});

describe('judgeAppearance', () => {
  it.each([
    ['target', 400, null, 'caught'],
    ['target', null, null, 'missed'],
    ['trap', 400, null, 'trapped'],
    ['trap', null, null, 'passed'],
    ['stop', null, 200, 'passed'],
    ['stop', 150, 200, 'caught'],
    ['stop', 199, 200, 'caught'],
    ['stop', 200, 200, 'trapped'],
    ['stop', 900, 200, 'trapped'],
    ['stop', 100, null, 'trapped'],
  ] as const)('%s, appui %s, STOP à %s : %s', (kind, pressedAtMs, stopAtMs, outcome) => {
    expect(judgeAppearance(kind, pressedAtMs, stopAtMs)).toBe(outcome);
  });
});

describe('startAppearance', () => {
  it('fait entrer la première apparition de la file', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    const entered = startAppearance(game);
    expect(entered.status).toBe('window');
    expect(entered.onStage?.appearance).toBe(game.queue[0]);
    expect(entered.queue).toEqual(game.queue.slice(1));
    expect(entered.shown).toBe(1);
  });

  it('fige les paramètres de la cible : la fenêtre en vigueur, rien d’autre', () => {
    expect(enter(createGoNoGoGame(OWL, FIRST)).onStage.presentation).toEqual({
      windowMs: 2500,
      stopAtMs: null,
      help: 0,
      isSlow: false,
      hasNoBadge: false,
      pulsesBuzzer: false,
      showsHand: false,
    });
  });

  it('ne fait rien si une apparition est déjà sur scène, si l’étoile est gagnée ou si la file est vide', () => {
    const entered = enter(createGoNoGoGame(OWL, FIRST));
    expect(startAppearance(entered)).toBe(entered);
    const empty = { ...createGoNoGoGame(OWL, FIRST), queue: [] };
    expect(startAppearance(empty)).toBe(empty);
    const won = { ...empty, status: 'won' as const };
    expect(startAppearance(won)).toBe(won);
  });

  it('ne modifie pas l’état reçu', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    const snapshot = structuredClone(game);
    startAppearance(game);
    expect(game).toEqual(snapshot);
  });
});

describe('resolveAppearance : les quatre issues', () => {
  it('cible attrapée : une perle de plus, rien de remis dans la file', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    const next = play(game, 700);
    expect(next).toMatchObject({
      status: 'between',
      cleared: 1,
      missed: 0,
      trapped: 0,
      onStage: null,
      lastResult: { appearance: game.queue[0], outcome: 'caught', help: 0 },
    });
    expect(next.queue).toHaveLength(11);
  });

  it('cible ratée : remise dans la file, 2 apparitions plus tard avec le tirage le plus bas', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    const first = game.queue[0];
    const next = play(game, null, FIRST);
    expect(next).toMatchObject({ cleared: 0, missed: 1, missStreak: 1 });
    expect(next.lastResult).toMatchObject({ outcome: 'missed', help: 1 });
    // Reste 11 apparitions + la remise, qui passe en 2e place : une apparition entre-temps.
    expect(next.queue).toHaveLength(12);
    expect(next.queue[1]).toBe(first);
  });

  it('cible ratée : remise 4 apparitions plus tard avec le tirage le plus haut', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    const next = play(game, null, LAST);
    expect(next.queue[3]).toBe(game.queue[0]);
  });

  it('remet une cible ratée à la fin quand la file est plus courte que l’écart', () => {
    const game = {
      ...createGoNoGoGame(OWL, FIRST),
      queue: createGoNoGoGame(OWL, FIRST).queue.slice(0, 2),
    };
    const first = game.queue[0];
    const next = play(game, null, LAST);
    expect(next.queue).toHaveLength(2);
    expect(next.queue[1]).toBe(first);
  });

  it('une remise ne suit ni ne précède la même image (§14.2.2)', () => {
    const game = createGoNoGoGame(FLIES, FIRST);
    const target = (subject: Appearance['subject'], id: number): Appearance => ({
      id,
      kind: 'target',
      subject,
      hideout: 0,
    });
    const missed = target('pigeon', 1);
    const queue = [
      target('butterfly', 2),
      target('pigeon', 3),
      target('plane', 4),
      target('bee', 5),
    ];
    // Avec le tirage le plus bas, la remise irait en 2e place, juste avant un pigeon ; en 3e, juste
    // après lui : elle glisse jusqu'en 4e.
    const next = play({ ...game, queue: [missed, ...queue] }, null, FIRST);
    expect(next.queue.map((entry) => entry.id)).toEqual([2, 3, 4, 1, 5]);
  });

  it('une remise change de cachette quand l’une de ses voisines a la sienne', () => {
    const config: GoNoGoLevelConfig = { ...OWL, hideouts: 3 };
    const owl = (id: number, hideout: number): Appearance => ({
      id,
      kind: 'target',
      subject: 'owl',
      hideout,
    });
    const game = createGoNoGoGame(config, FIRST);
    const next = play(
      { ...game, queue: [owl(1, 1), owl(2, 0), owl(3, 1), owl(4, 2)] },
      null,
      FIRST,
    );
    // Remise en 2e place, entre la cachette 0 et la cachette 1 : elle prend la 2.
    expect(next.queue.map((entry) => [entry.id, entry.hideout])).toEqual([
      [2, 0],
      [1, 2],
      [3, 1],
      [4, 2],
    ]);
  });

  it('un piège remis compte celui qui vient d’être montré : jamais trois d’affilée (§14.1)', () => {
    const game = createGoNoGoGame(FLIES, FIRST);
    const entry = (id: number, kind: Appearance['kind'], subject: Appearance['subject']) => ({
      id,
      kind,
      subject,
      hideout: 0,
    });
    // Le piège touché ouvrait une paire : en 2e place, il suivrait son partenaire et ferait, avec
    // lui-même juste montré, trois pièges d'affilée.
    const queue = [
      entry(1, 'trap', 'cow'),
      entry(2, 'trap', 'pig'),
      entry(3, 'target', 'plane'),
      entry(4, 'target', 'bee'),
      entry(5, 'target', 'rocket'),
    ];
    const next = play({ ...game, queue }, 300, FIRST);
    expect(next.lastResult?.outcome).toBe('trapped');
    expect(pattern(next.queue)).toBe('T.T..');
    expect(next.queue.map((appearance) => appearance.id)).toEqual([2, 3, 1, 4, 5]);
  });

  it('remet une cible ratée seule dans la file si c’était la dernière', () => {
    const game = {
      ...createGoNoGoGame(OWL, FIRST),
      queue: createGoNoGoGame(OWL, FIRST).queue.slice(0, 1),
    };
    const next = play(game, null, LAST);
    expect(next.status).toBe('between');
    expect(next.queue).toEqual(game.queue);
  });

  /** Une file qui commence par un piège, suivie de cibles. */
  function trapFirst(config: GoNoGoLevelConfig = OWL): GoNoGoState {
    const game = createGoNoGoGame(config, FIRST);
    const trap = must(game.queue.find((entry) => entry.kind !== 'target'));
    const targets = game.queue.filter((entry) => entry.kind === 'target');
    return { ...game, queue: [trap, ...targets] };
  }

  it('piège touché : compté pour la couronne, remis dans la file, série de pièges + 1', () => {
    const next = play(trapFirst(), 600);
    expect(next).toMatchObject({ trapped: 1, trapStreak: 1, cleared: 0, status: 'between' });
    expect(next.lastResult).toMatchObject({ outcome: 'trapped', help: 1 });
    // Neuf cibles attendent, plus le piège remis en 2e place (tirage le plus bas).
    expect(next.queue).toHaveLength(10);
    expect(next.queue[1]).toBe(next.lastResult?.appearance);
    expect(isPerfectWin(next)).toBe(false);
  });

  it('piège laissé passer : une perle de plus, série de pièges remise à zéro', () => {
    const base = { ...trapFirst(), trapStreak: 2 };
    const next = play(base, null);
    expect(next).toMatchObject({ trapped: 0, trapStreak: 0, cleared: 1 });
    expect(next.lastResult).toMatchObject({ outcome: 'passed', help: 0 });
  });

  it('une cible attrapée remet la série de cibles ratées à zéro, pas celle des pièges', () => {
    const game = { ...createGoNoGoGame(OWL, FIRST), missStreak: 2, trapStreak: 2 };
    const next = play(game, 500);
    expect(next.missStreak).toBe(0);
    expect(next.trapStreak).toBe(2);
  });

  it('un piège laissé passer remet la série de pièges à zéro, pas celle des cibles ratées', () => {
    const next = play({ ...trapFirst(), missStreak: 2, trapStreak: 2 }, null);
    expect(next.trapStreak).toBe(0);
    expect(next.missStreak).toBe(2);
  });

  it('compte les cibles ratées pendant toute l’étoile', () => {
    let game = createGoNoGoGame(OWL, FIRST);
    game = play(game, null);
    game = play(game, null);
    expect(game.missed).toBe(2);
    expect(game.trapped).toBe(0);
  });

  it('ne modifie pas l’état reçu', () => {
    const entered = enter(createGoNoGoGame(OWL, FIRST));
    const snapshot = structuredClone(entered);
    resolveAppearance(entered, 500, FIRST);
    expect(entered).toEqual(snapshot);
  });

  it('ignore une résolution hors d’une apparition sur scène', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    expect(resolveAppearance(game, 500)).toBe(game);
    const won = { ...game, status: 'won' as const };
    expect(resolveAppearance(won, 500)).toBe(won);
  });

  it('traite un appui hors de la fenêtre comme une fenêtre écoulée', () => {
    const entered = enter(createGoNoGoGame(OWL, FIRST));
    const late = resolveAppearance(entered, 2500, FIRST);
    expect(late.lastResult?.outcome).toBe('missed');
    const justIn = resolveAppearance(entered, 2499, FIRST);
    expect(justIn.lastResult?.outcome).toBe('caught');
  });

  it('gagne l’étoile quand la dernière apparition est réussie', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    const last = must(game.queue.at(-1));
    const state: GoNoGoState = { ...game, queue: [last] };
    const won = answerCorrectly(state);
    expect(won.status).toBe('won');
    expect(won.queue).toEqual([]);
    expect(isPerfectWin(won)).toBe(true);
  });

  it('ne gagne pas sur une dernière apparition manquée : elle revient', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    const state: GoNoGoState = { ...game, queue: [must(game.queue[0])] };
    expect(play(state, null).status).toBe('between');
  });
});

describe('résolution : la cadence (§5.1)', () => {
  it('raccourcit la fenêtre de 10 % après 3 réussites d’affilée, pas avant', () => {
    let game = createGoNoGoGame(OWL, FIRST);
    game = playCorrectly(game, 2);
    expect(game.windowMs).toBe(2500);
    expect(game.runLength).toBe(2);
    game = playCorrectly(game, 1);
    expect(game.windowMs).toBe(2250);
    // La série continue : c'est la 6e réussite qui accélère de nouveau, pas la 4e.
    game = playCorrectly(game, 2);
    expect(game.windowMs).toBe(2250);
    game = playCorrectly(game, 1);
    expect(game.windowMs).toBe(2025);
    expect(game.runLength).toBe(6);
  });

  it('ne descend jamais sous la vitesse maximale de l’étoile', () => {
    let game = createGoNoGoGame({ ...OWL, appearances: 40, traps: 4 }, FIRST);
    game = playCorrectly(game, 30);
    expect(game.windowMs).toBe(2000);
  });

  it('allonge la fenêtre de 10 % pour une cible ratée', () => {
    expect(play(createGoNoGoGame(OWL, FIRST), null).windowMs).toBe(2750);
  });

  it('allonge la fenêtre de 15 % pour un piège touché', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    const trap = must(game.queue.find((entry) => entry.kind === 'trap'));
    expect(play({ ...game, queue: [trap] }, 400).windowMs).toBe(2875);
  });

  it('ne dépasse jamais 3 s', () => {
    let game = createGoNoGoGame(OWL, FIRST);
    for (let index = 0; index < 6; index += 1) game = play(game, null);
    expect(game.windowMs).toBe(MAX_WINDOW_MS);
  });

  it('remet à zéro les réussites d’affilée à chaque erreur', () => {
    let game = playCorrectly(createGoNoGoGame(OWL, FIRST), 2);
    game = play(game, null);
    expect(game).toMatchObject({ runLength: 0 });
    game = playCorrectly(game, 2);
    expect(game.windowMs).toBe(2750);
  });

  it('se stabilise : trois réussites accélèrent, une erreur ralentit', () => {
    let game = createGoNoGoGame({ ...OWL, appearances: 40, traps: 3 }, FIRST);
    game = playCorrectly(game, 3);
    const fast = game.windowMs;
    game = play(game, null);
    expect(game.windowMs).toBeGreaterThan(fast);
  });
});

describe('résolution : la vitesse tenue (§11.2)', () => {
  it('retient la fenêtre sur laquelle 8 réussites ont été enchaînées', () => {
    let game = createGoNoGoGame({ ...OWL, appearances: 20, traps: 3 }, FIRST);
    game = playCorrectly(game, HELD_RUN - 1);
    expect(game.heldWindowMs).toBeNull();
    game = playCorrectly(game, 1);
    // 3 réussites à 2500, 3 à 2250, puis 2025 : la 8e se joue à 2025 ms.
    expect(game.heldWindowMs).toBe(2025);
  });

  it('garde la plus courte de ces fenêtres, une série plus lente n’y change rien', () => {
    let game = createGoNoGoGame({ ...OWL, appearances: 40, traps: 3 }, FIRST);
    game = playCorrectly(game, 14);
    expect(game.heldWindowMs).toBe(2000);
    game = play(game, null);
    game = playCorrectly(game, 9);
    expect(game.heldWindowMs).toBe(2000);
  });

  it('à défaut de telle série, la vitesse tenue est la fenêtre de fin de partie', () => {
    let game = createGoNoGoGame(OWL, FIRST);
    game = playCorrectly(game, 4);
    game = play(game, null);
    expect(game.heldWindowMs).toBeNull();
    expect(getHeldWindowMs(game)).toBe(game.windowMs);
  });

  it('la réussite qui gagne l’étoile n’accélère rien : la fin de partie est la fenêtre jouée', () => {
    // Une étoile de 6 apparitions, parfaite : 3 réussites à 2500 ms, puis 3 à 2250 ms. La 6e aurait
    // raccourci la fenêtre à 2025 ms, que l'enfant n'a jamais jouée.
    const config: GoNoGoLevelConfig = { ...OWL, appearances: 6, traps: 1 };
    let game = createGoNoGoGame(config, FIRST);
    while (game.status !== 'won') game = answerCorrectly(game);
    expect(game.heldWindowMs).toBeNull();
    expect(game.windowMs).toBe(2250);
    expect(getHeldSpeedSeconds(game)).toBe(2.25);
  });

  describe('une cible qui attendait (échelon 3) ne dit rien de la vitesse (§14.2.1)', () => {
    /** Trois cibles ratées d'affilée : la quatrième attend sans limite de temps. */
    function waitingTarget(patch: Partial<GoNoGoState> = {}): GoNoGoState & { onStage: OnStage } {
      const entered = enter({ ...createGoNoGoGame(OWL, FIRST), missStreak: 3, ...patch });
      expect(entered.onStage.presentation.windowMs).toBeNull();
      return entered;
    }

    it('attrapée, elle remet l’aide à zéro et compte une perle, sans accélérer', () => {
      const next = resolveAppearance(waitingTarget({ runLength: 2 }), 900, FIRST);
      expect(next).toMatchObject({ cleared: 1, missStreak: 0, runLength: 0, windowMs: 2500 });
      expect(next.lastResult).toMatchObject({ outcome: 'caught', help: 0 });
    });

    it('elle interrompt la série : la 8e réussite d’affilée n’est pas la sienne', () => {
      const next = resolveAppearance(waitingTarget({ runLength: 7 }), 900, FIRST);
      expect(next.heldWindowMs).toBeNull();
      expect(next.runLength).toBe(0);
    });

    it('l’enfant qui n’attrape que les cibles qui attendent garde la fenêtre la plus lente', () => {
      // Le garde-fou passé, toutes les cibles attendent : l'enfant passive les attrape toutes et
      // laisse passer les pièges, sans jamais rien jouer contre le temps.
      let game = { ...createGoNoGoGame(OWL, FIRST), windowMs: MAX_WINDOW_MS, shown: 18 };
      while (game.status !== 'won') {
        const entered = enter(game);
        const { windowMs } = entered.onStage.presentation;
        game = resolveAppearance(entered, windowMs === null ? 500 : null, FIRST);
      }
      expect(game.heldWindowMs).toBeNull();
      expect(getHeldSpeedSeconds(game)).toBe(3);
    });
  });

  it('exprime la vitesse tenue en secondes, au centième près', () => {
    const game = { ...createGoNoGoGame(OWL, FIRST), heldWindowMs: 1234 };
    expect(getHeldWindowMs(game)).toBe(1234);
    expect(getHeldSpeedSeconds(game)).toBe(1.23);
    expect(getHeldSpeedSeconds({ ...game, heldWindowMs: 2025 })).toBe(2.03);
    expect(getHeldSpeedSeconds({ ...game, heldWindowMs: 3000 })).toBe(3);
  });
});

describe('résolution : le STOP tardif (§5.2, §4.3)', () => {
  /** Une file qui commence par un STOP tardif. */
  function stopFirst(config: GoNoGoLevelConfig = LATE_STOP): GoNoGoState {
    const game = createGoNoGoGame(config, FIRST);
    const stop = must(game.queue.find((entry) => entry.kind === 'stop'));
    return { ...game, queue: [stop, ...game.queue.filter((entry) => entry.kind === 'target')] };
  }

  it('part à 150 ms de l’entrée, la fenêtre en vigueur moins 300 ms permettant', () => {
    const entered = enter(stopFirst());
    expect(entered.onStage.presentation.stopAtMs).toBe(150);
    expect(entered.onStage.presentation.windowMs).toBe(1800);
  });

  it('un STOP réussi allonge le délai de 50 ms, sans dépasser le plafond de l’étoile', () => {
    let game = stopFirst();
    game = play(game, null);
    expect(game.stopDelayMs).toBe(200);
    expect(game.lastResult?.outcome).toBe('passed');
    game = play({ ...game, stopDelayMs: 280, queue: stopFirst().queue }, null);
    expect(game.stopDelayMs).toBe(300);
  });

  it('un STOP manqué raccourcit le délai de 100 ms, jamais sous 100 ms', () => {
    let game = play(stopFirst(), 900);
    expect(game.lastResult?.outcome).toBe('trapped');
    expect(game.stopDelayMs).toBe(MIN_STOP_DELAY_MS);
    game = play({ ...game, stopDelayMs: 250, queue: stopFirst().queue }, 900);
    expect(game.stopDelayMs).toBe(150);
    game = play({ ...game, stopDelayMs: 120, queue: stopFirst().queue }, 900);
    expect(game.stopDelayMs).toBe(MIN_STOP_DELAY_MS);
  });

  it('un appui avant l’arrivée du STOP attrape la cible sans erreur, mais avance le STOP suivant', () => {
    const game = { ...stopFirst(), stopDelayMs: 250 };
    const next = play(game, 100);
    expect(next.lastResult?.outcome).toBe('caught');
    expect(next).toMatchObject({ trapped: 0, cleared: 1, stopDelayMs: 150 });
  });

  it('un appui après l’arrivée du STOP est un piège touché', () => {
    const next = play(stopFirst(), 150);
    expect(next.lastResult?.outcome).toBe('trapped');
    expect(next).toMatchObject({ trapped: 1, trapStreak: 1 });
  });

  it('ne laisse pas le STOP arriver à moins de 300 ms de la fin de la fenêtre', () => {
    const entered = enter({ ...stopFirst(), stopDelayMs: 300, windowMs: 520 });
    expect(entered.onStage.presentation.stopAtMs).toBe(220);
  });

  it('ne laisse pas le STOP descendre sous 100 ms, même avec une fenêtre très courte', () => {
    const entered = enter({ ...stopFirst(), stopDelayMs: 300, windowMs: 350 });
    expect(entered.onStage.presentation.stopAtMs).toBe(MIN_STOP_DELAY_MS);
  });

  it('borne le délai de départ par le plafond de l’étoile', () => {
    const tight = createGoNoGoGame({ ...LATE_STOP, stopDelayCeilingMs: 100 }, FIRST);
    expect(tight.stopDelayMs).toBe(100);
  });

  it('un piège ordinaire ne touche pas au délai du STOP', () => {
    const game = createGoNoGoGame(MIXED, FIRST);
    const trap = must(game.queue.find((entry) => entry.kind === 'trap'));
    expect(play({ ...game, queue: [trap] }, 600).stopDelayMs).toBe(150);
  });
});

describe('résolution : l’échelle d’aide (§6.4)', () => {
  /** Une file qui commence par un piège. */
  function trapFirst(config: GoNoGoLevelConfig = OWL): GoNoGoState {
    const game = createGoNoGoGame(config, FIRST);
    const trap = must(game.queue.find((entry) => entry.kind === 'trap'));
    return { ...game, queue: [trap, ...game.queue.filter((entry) => entry.kind === 'target')] };
  }

  describe('cibles ratées', () => {
    it('1 raté : rien de plus, la cible repasse', () => {
      const game = { ...createGoNoGoGame(OWL, FIRST), missStreak: 1 };
      expect(enter(game).onStage.presentation).toMatchObject({
        help: 1,
        pulsesBuzzer: false,
        showsHand: false,
      });
    });

    it('2 ratés d’affilée : la cible suivante arrive avec le buzzer qui pulse', () => {
      const game = { ...createGoNoGoGame(OWL, FIRST), missStreak: 2 };
      expect(enter(game).onStage.presentation).toMatchObject({
        windowMs: 2500,
        help: 2,
        pulsesBuzzer: true,
        showsHand: false,
      });
    });

    it('3 ratés d’affilée : la cible attend sans limite de temps, buzzer qui pulse et main qui montre', () => {
      const game = { ...createGoNoGoGame(OWL, FIRST), missStreak: 3 };
      expect(enter(game).onStage.presentation).toMatchObject({
        windowMs: null,
        help: 3,
        pulsesBuzzer: true,
        showsHand: true,
      });
    });

    it('une cible qui attend ne s’écoule pas : sans appui, l’état est inchangé', () => {
      const waiting = enter({ ...createGoNoGoGame(OWL, FIRST), missStreak: 3 });
      expect(resolveAppearance(waiting, null)).toBe(waiting);
    });

    it('une cible qui attend est attrapée au premier appui, à n’importe quel moment', () => {
      const waiting = enter({ ...createGoNoGoGame(OWL, FIRST), missStreak: 3 });
      const next = resolveAppearance(waiting, 45_000, FIRST);
      expect(next.lastResult?.outcome).toBe('caught');
      expect(next.missStreak).toBe(0);
    });

    it('trois ratés d’affilée mènent à l’échelon 3 de la série suivante', () => {
      let game = createGoNoGoGame(OWL, FIRST);
      for (let index = 0; index < 3; index += 1) game = play(game, null);
      expect(game.missStreak).toBe(3);
      expect(game.lastResult?.help).toBe(3);
      expect(enter(game).onStage.presentation.windowMs).toBeNull();
    });

    it('ne touche pas la présentation d’un piège', () => {
      const game = { ...trapFirst(), missStreak: 3 };
      expect(enter(game).onStage.presentation).toMatchObject({
        windowMs: 2500,
        help: 0,
        showsHand: false,
      });
    });
  });

  describe('pièges touchés', () => {
    it('1 touché : rien de plus à l’entrée du suivant', () => {
      expect(enter({ ...trapFirst(), trapStreak: 1 }).onStage.presentation).toMatchObject({
        help: 1,
        isSlow: false,
        hasNoBadge: false,
        windowMs: 2500,
      });
    });

    it('2 touchés d’affilée : le piège suivant entre plus lentement, avec une fenêtre plus longue', () => {
      expect(enter({ ...trapFirst(), trapStreak: 2 }).onStage.presentation).toMatchObject({
        help: 2,
        isSlow: true,
        hasNoBadge: false,
        windowMs: 3000,
      });
    });

    it('3 touchés et plus : le piège porte le signe « non »', () => {
      expect(enter({ ...trapFirst(), trapStreak: 5 }).onStage.presentation).toMatchObject({
        help: 3,
        isSlow: true,
        hasNoBadge: true,
      });
    });

    it('allonge la fenêtre de moitié sans dépasser 3 s', () => {
      expect(
        enter({ ...trapFirst(), trapStreak: 2, windowMs: 1600 }).onStage.presentation.windowMs,
      ).toBe(2400);
      expect(
        enter({ ...trapFirst(), trapStreak: 2, windowMs: 2400 }).onStage.presentation.windowMs,
      ).toBe(3000);
    });

    it('ne touche pas la présentation d’une cible', () => {
      const game = { ...createGoNoGoGame(OWL, FIRST), trapStreak: 3 };
      expect(enter(game).onStage.presentation).toMatchObject({
        help: 0,
        windowMs: 2500,
        hasNoBadge: false,
      });
    });

    it('un STOP tardif au 3e échelon arrive presque aussitôt, sans signe « non »', () => {
      const game = createGoNoGoGame(LATE_STOP, FIRST);
      const stop = must(game.queue.find((entry) => entry.kind === 'stop'));
      const entered = enter({ ...game, queue: [stop], trapStreak: 3 });
      expect(entered.onStage.presentation).toMatchObject({
        stopAtMs: 100,
        hasNoBadge: false,
        help: 3,
      });
    });

    it('un STOP tardif au 2e échelon entre plus lentement', () => {
      const game = createGoNoGoGame(LATE_STOP, FIRST);
      const stop = must(game.queue.find((entry) => entry.kind === 'stop'));
      const entered = enter({ ...game, queue: [stop], trapStreak: 2 });
      expect(entered.onStage.presentation).toMatchObject({
        isSlow: true,
        windowMs: 2700,
        stopAtMs: 150,
      });
    });
  });

  describe('garde-fou de durée', () => {
    it('s’applique quand l’étoile a montré 1,5 fois sa longueur prévue', () => {
      const game = createGoNoGoGame(OWL, FIRST);
      expect(isOverrun({ ...game, shown: 17 })).toBe(false);
      expect(isOverrun({ ...game, shown: 18 })).toBe(true);
    });

    it('passe toutes les apparitions restantes à l’échelon 3 : les cibles attendent', () => {
      const game = { ...createGoNoGoGame(OWL, FIRST), shown: 18 };
      expect(enter(game).onStage.presentation).toMatchObject({
        windowMs: null,
        help: 3,
        showsHand: true,
      });
    });

    it('passe les pièges à l’échelon 3 : signe « non », fenêtre plus longue', () => {
      const game = { ...trapFirst(), shown: 18 };
      expect(enter(game).onStage.presentation).toMatchObject({
        help: 3,
        hasNoBadge: true,
        isSlow: true,
      });
    });
  });
});

describe('interruptAppearance', () => {
  it('remet l’apparition en tête de la file, sans la compter ni toucher à la cadence', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    const entered = enter(game);
    const interrupted = interruptAppearance(entered);
    expect(interrupted.status).toBe('between');
    expect(interrupted.onStage).toBeNull();
    expect(interrupted.queue).toEqual(game.queue);
    expect(interrupted.shown).toBe(0);
    expect(interrupted.windowMs).toBe(game.windowMs);
  });

  it('ignore une interruption hors d’une apparition sur scène', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    expect(interruptAppearance(game)).toBe(game);
  });

  it('l’apparition interrompue revient entière, avec les paramètres du moment', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    const again = enter(interruptAppearance(enter(game)));
    expect(again.onStage.appearance).toBe(game.queue[0]);
    expect(again.shown).toBe(1);
  });
});

describe('isPerfectWin', () => {
  it('est faux avant la fin de l’étoile', () => {
    expect(isPerfectWin(createGoNoGoGame(OWL, FIRST))).toBe(false);
  });

  it('exige aucun piège touché, mais pas de cible réussie du premier coup', () => {
    const game = createGoNoGoGame(OWL, FIRST);
    const last = must(game.queue.at(-1));
    expect(isPerfectWin({ ...game, queue: [last], status: 'won', missed: 4, trapped: 0 })).toBe(
      true,
    );
    expect(isPerfectWin({ ...game, queue: [last], status: 'won', missed: 0, trapped: 1 })).toBe(
      false,
    );
  });
});

describe('étoiles entières, jouées de bout en bout', () => {
  function playToTheEnd(config: GoNoGoLevelConfig, rng: Rng): GoNoGoState {
    let game = createGoNoGoGame(config, rng);
    while (game.status !== 'won') game = answerCorrectly(game);
    return game;
  }

  it.each([
    ['la règle 1', OWL],
    ['la règle 2 et son leurre', FLIES],
    ['la règle 3', LATE_STOP],
    ['la règle 3 mêlée', MIXED],
  ])('%s : une étoile parfaite montre exactement les apparitions prévues', (_name, config) => {
    const game = playToTheEnd(config, seeded(6));
    expect(game).toMatchObject({
      status: 'won',
      shown: config.appearances,
      cleared: config.appearances,
      trapped: 0,
      missed: 0,
    });
    expect(isPerfectWin(game)).toBe(true);
    expect(getHeldWindowMs(game)).toBeLessThan(config.startWindowMs);
  });

  it('chaque piège touché et chaque cible ratée revient jusqu’à être réussi', () => {
    let game = createGoNoGoGame(OWL, seeded(21));
    const rng = seeded(22);
    let guard = 0;
    // Un enfant qui se trompe une fois sur deux, au hasard.
    while (game.status !== 'won' && guard < 400) {
      const entered = enter(game);
      const isRight = rng() < 0.5;
      const pressesTarget = entered.onStage.appearance.kind === 'target';
      const press = pressesTarget === isRight ? 400 : null;
      game = resolveAppearance(entered, press, rng);
      guard += 1;
    }
    expect(game.status).toBe('won');
    expect(game.cleared).toBe(OWL.appearances);
    expect(game.shown).toBe(game.cleared + game.missed + game.trapped);
  });
});
