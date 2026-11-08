// @vitest-environment node
import type { SoundEffect } from '@/core/audio/types';
import { getDemoClipPaths, getDemoScript } from '@/games/go-no-go/demo';
import { TRIAL_WINDOW_MS } from '@/games/go-no-go/engine';
import {
  BREATH_MS,
  CAUGHT_MS,
  createRun,
  EMPTY_SCENE,
  END_SCREEN_DELAY_MS,
  HAPPY_MS,
  IDLE_MS,
  LURE_FLAP_MS,
  MAX_NUDGES,
  MISSED_MS,
  PASSED_MS,
  PRESS_FLASH_MS,
  START_DELAY_MS,
  TRAPPED_PAUSE_MS,
  WINDOW_GRACE_MS,
  type Run,
  type RunDeps,
  type RunResult,
  type RunSnapshot,
} from '@/games/go-no-go/run';
import type { GoNoGoLevelConfig } from '@/games/go-no-go/types';
import { getLureClipId, getVoiceClipPath, SHARED_CLIPS } from '@/games/go-no-go/voice-script';
import type { Rng } from '@/games/memory/random';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Tirage toujours nul : la file est rangée de façon prévisible (pièges en fin de file). */
const FIRST: Rng = () => 0;

const OWL: GoNoGoLevelConfig = {
  rule: 'owl-says',
  appearances: 6,
  traps: 1,
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

const FLIES_LURE: GoNoGoLevelConfig = {
  ...OWL,
  rule: 'flies',
  decoys: [],
  hasLure: true,
  intro: 'lure',
  maxTrapRun: 2,
};

const FLIES: GoNoGoLevelConfig = { ...FLIES_LURE, hasLure: false, intro: 'full' };

const LATE_STOP: GoNoGoLevelConfig = {
  ...OWL,
  rule: 'late-stop',
  appearances: 6,
  traps: 0,
  stops: 1,
  decoys: [],
  startWindowMs: 1800,
  fastestWindowMs: 1400,
  stopDelayCeilingMs: 300,
  intro: 'full',
  maxTrapRun: 2,
};

interface Harness {
  run: Run;
  deps: RunDeps;
  effects: SoundEffect[];
  spoken: { clips: readonly string[]; mood: 'talking' | 'flap' | undefined }[];
  results: RunResult[];
  preloaded: string[];
  snap: () => RunSnapshot;
}

/** Une partie dont la voix est instantanée (son coupé) et l'horloge, celle des minuteurs simulés. */
function setup(config: GoNoGoLevelConfig, overrides: Partial<RunDeps> = {}): Harness {
  const effects: SoundEffect[] = [];
  const spoken: Harness['spoken'] = [];
  const results: RunResult[] = [];
  const preloaded: string[] = [];
  const deps: RunDeps = {
    config,
    hasWon: false,
    rng: FIRST,
    now: () => Date.now(),
    playEffect: (effect) => {
      effects.push(effect);
    },
    speak: (clips, mood) => {
      spoken.push({ clips, mood });
      return Promise.resolve();
    },
    preload: (paths) => {
      preloaded.push(...paths);
    },
    onWin: (result) => {
      results.push(result);
    },
    ...overrides,
  };
  const run = createRun(deps);
  return { run, deps, effects, spoken, results, preloaded, snap: () => run.getSnapshot() };
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** Avance par petits pas jusqu'à ce que `done` soit vrai. */
async function until(h: Harness, done: (snapshot: RunSnapshot) => boolean, limitMs = 120_000) {
  for (let spent = 0; spent < limitMs; spent += 25) {
    if (done(h.snap())) return;
    await advance(25);
  }
  throw new Error(`condition jamais atteinte, phase ${h.snap().phase}`);
}

/** Démarre et attend la première apparition de la partie. */
async function startLive(h: Harness): Promise<void> {
  h.run.start();
  await until(h, (snapshot) => snapshot.game.status === 'window');
}

/** Laisse la fenêtre de l'apparition sur scène s'écouler sans appui. */
async function letItExpire(h: Harness): Promise<void> {
  await advance((h.snap().game.presentation?.windowMs ?? 0) + WINDOW_GRACE_MS);
}

/** Attend la prochaine apparition sur scène, ou la victoire. */
async function nextOrWon(h: Harness): Promise<void> {
  await until(
    h,
    (snapshot) =>
      snapshot.phase === 'won' ||
      (snapshot.game.status === 'window' && snapshot.scene.subject !== null),
  );
}

/** Attend la prochaine apparition sur scène. */
async function nextAppearance(h: Harness): Promise<void> {
  await until(
    h,
    (snapshot) => snapshot.game.status === 'window' && snapshot.scene.subject !== null,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('départ de l’étoile', () => {
  it('ne fait rien avant start, et start ne tire aucun son ni aucune voix immédiatement', () => {
    const h = setup(OWL);
    expect(h.snap()).toMatchObject({ phase: 'starting', isEndOpen: false });
    expect(h.snap().scene).toEqual(EMPTY_SCENE);
    expect(h.spoken).toEqual([]);
    h.run.start();
    expect(h.spoken).toEqual([]);
  });

  it('dit la phrase de rappel, puis fait entrer la première apparition après le départ et la respiration', async () => {
    const h = setup(OWL);
    h.run.start();
    await advance(0);
    expect(h.spoken).toEqual([{ clips: [getVoiceClipPath('rule-owl-says')], mood: undefined }]);
    expect(h.snap().phase).toBe('starting');
    await advance(START_DELAY_MS);
    expect(h.snap().phase).toBe('live');
    expect(h.snap().game.status).toBe('between');
    await advance(BREATH_MS);
    expect(h.snap().game.status).toBe('window');
    expect(h.snap().scene).toMatchObject({ subject: 'owl', kind: 'target', moment: 'entering' });
  });

  it('charge la phrase de rappel d’abord, puis toutes celles que l’étoile peut dire', async () => {
    const h = setup(OWL);
    h.run.start();
    await advance(0);
    expect(h.preloaded[0]).toBe(getVoiceClipPath('rule-owl-says'));
    expect(h.preloaded).toEqual(
      expect.arrayContaining([
        SHARED_CLIPS.trapped,
        SHARED_CLIPS.lookCarefully,
        SHARED_CLIPS.starWon,
      ]),
    );
  });

  it('ne démarre qu’une fois, même si start est appelée deux fois', async () => {
    const h = setup(OWL);
    h.run.start();
    h.run.start();
    await advance(0);
    expect(h.spoken).toHaveLength(1);
  });

  it('un effet rejoué sous StrictMode (start, dispose, start) ne parle qu’une fois', async () => {
    const h = setup(OWL);
    h.run.start();
    h.run.dispose();
    h.run.start();
    await advance(0);
    expect(h.spoken).toHaveLength(1);
  });

  it('dispose arrête tous les minuteurs : plus rien ne change ensuite', async () => {
    const h = setup(OWL);
    await startLive(h);
    h.run.dispose();
    const before = h.snap();
    await advance(60_000);
    expect(h.snap()).toBe(before);
  });

  it('prévient ses abonnés à chaque changement, jusqu’à la désinscription', async () => {
    const h = setup(OWL);
    const listener = vi.fn();
    const unsubscribe = h.run.subscribe(listener);
    h.run.start();
    await advance(START_DELAY_MS + BREATH_MS);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    await advance(10_000);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('une apparition : les quatre issues', () => {
  it('cible attrapée : son de réussite, perle, la mascotte contente, puis la respiration', async () => {
    const h = setup(OWL);
    await startLive(h);
    await advance(500);
    h.run.press();
    expect(h.snap().scene.moment).toBe('caught');
    expect(h.snap().game).toMatchObject({ cleared: 1, shown: 1 });
    expect(h.effects).toContain('success');
    await advance(CAUGHT_MS);
    expect(h.snap().scene.subject).toBeNull();
    await advance(BREATH_MS);
    expect(h.snap().game.shown).toBe(2);
  });

  it('rien n’est compté entre deux apparitions : le buzzer s’enfonce seulement', async () => {
    const h = setup(OWL);
    await startLive(h);
    await advance(500);
    h.run.press();
    await advance(CAUGHT_MS);
    const cleared = h.snap().game.cleared;
    // Respiration : la scène est vide.
    h.run.press();
    expect(h.snap().game.cleared).toBe(cleared);
    expect(h.snap().isBuzzerPressed).toBe(true);
    await advance(PRESS_FLASH_MS);
    expect(h.snap().isBuzzerPressed).toBe(false);
    expect(h.snap().game.shown).toBe(1);
  });

  it('cible ratée : la fenêtre s’écoule, son neutre, la cible repassera', async () => {
    const h = setup(OWL);
    await startLive(h);
    await advance(2500 + WINDOW_GRACE_MS);
    expect(h.snap().scene.moment).toBe('missed');
    expect(h.effects).toContain('neutral');
    expect(h.snap().game).toMatchObject({ missed: 1, missStreak: 1 });
    expect(h.snap().game.queue).toHaveLength(6);
    await advance(MISSED_MS + BREATH_MS);
    expect(h.snap().game.shown).toBe(2);
  });

  it('piège touché : le rythme s’interrompt, le buzzer est grisé, la chouette dit l’erreur', async () => {
    const h = setup(OWL);
    await startLive(h);
    // Cinq cibles, puis le piège (tirage le plus bas : le piège est en fin de file).
    for (let index = 0; index < 5; index += 1) {
      await advance(500);
      h.run.press();
      await nextAppearance(h);
    }
    expect(h.snap().scene).toMatchObject({ subject: 'fox', kind: 'trap' });
    await advance(300);
    h.run.press();
    expect(h.snap().scene.moment).toBe('trapped');
    expect(h.effects).toContain('oops');
    expect(h.snap().isBuzzerEnabled).toBe(false);
    expect(h.snap().mascot.isVisible).toBe(true);
    expect(h.spoken.at(-1)?.clips).toEqual([SHARED_CLIPS.trapped]);
    expect(h.snap().game).toMatchObject({ trapped: 1, trapStreak: 1 });

    // Pendant la pause, un nouvel appui n'est pas compté, et le buzzer ne s'enfonce pas.
    await advance(PRESS_FLASH_MS);
    h.run.press();
    expect(h.snap().isBuzzerPressed).toBe(false);
    await advance(TRAPPED_PAUSE_MS - PRESS_FLASH_MS - 1);
    expect(h.snap().scene.moment).toBe('trapped');
    await advance(1);
    expect(h.snap().scene.subject).toBeNull();
    expect(h.snap().isBuzzerEnabled).toBe(true);
    // Le renard est parti : la chouette se cache de nouveau (règle 1).
    expect(h.snap().mascot.isVisible).toBe(false);
  });

  it('piège touché deux fois d’affilée : « Regarde bien. » s’ajoute à l’erreur', async () => {
    const h = setup(OWL);
    await startLive(h);
    for (let index = 0; index < 5; index += 1) {
      await advance(500);
      h.run.press();
      await nextAppearance(h);
    }
    await advance(300);
    h.run.press();
    await advance(TRAPPED_PAUSE_MS + BREATH_MS);
    // C'était la dernière apparition : le piège revient aussitôt, aucune cible n'attend plus.
    await nextAppearance(h);
    expect(h.snap().scene).toMatchObject({ kind: 'trap', subject: 'fox' });
    await advance(300);
    h.run.press();
    expect(h.spoken.at(-1)?.clips).toEqual([SHARED_CLIPS.trapped, SHARED_CLIPS.lookCarefully]);
  });

  it('piège laissé passer : le gag, son joyeux, puis la respiration', async () => {
    const h = setup(OWL);
    await startLive(h);
    for (let index = 0; index < 5; index += 1) {
      await advance(500);
      h.run.press();
      await nextAppearance(h);
    }
    expect(h.snap().scene.kind).toBe('trap');
    await advance(2500 + WINDOW_GRACE_MS);
    expect(h.snap().scene.moment).toBe('passed');
    expect(h.effects).toContain('gag');
    expect(h.snap().game).toMatchObject({ trapped: 0, cleared: 6 });
    await advance(PASSED_MS);
    expect(h.snap().phase).toBe('won');
  });

  it('accélère après 3 réussites d’affilée', async () => {
    const h = setup(OWL);
    await startLive(h);
    for (let index = 0; index < 3; index += 1) {
      await advance(500);
      h.run.press();
      await nextAppearance(h).catch(() => undefined);
    }
    expect(h.snap().game.windowMs).toBe(2250);
  });
});

describe('dater l’appui : l’horodatage de l’évènement', () => {
  it('compte un appui daté dans la fenêtre, même traité un peu après sa fin', async () => {
    const h = setup(OWL);
    await startLive(h);
    await advance(2500 + 20);
    // Évènement survenu 60 ms plus tôt : 40 ms avant la fin de la fenêtre.
    h.run.press(Date.now() - 60);
    expect(h.snap().scene.moment).toBe('caught');
  });

  it('ignore un appui daté après la fin de la fenêtre : la cible est ratée', async () => {
    const h = setup(OWL);
    await startLive(h);
    await advance(2500 + 20);
    h.run.press(Date.now());
    expect(h.snap().scene.moment).toBe('entering');
    await advance(WINDOW_GRACE_MS);
    expect(h.snap().scene.moment).toBe('missed');
  });

  it('ramène à zéro un horodatage antérieur à l’entrée', async () => {
    const h = setup(OWL);
    await startLive(h);
    h.run.press(Date.now() - 10_000);
    expect(h.snap().scene.moment).toBe('caught');
  });
});

describe('STOP tardif (règle 3)', () => {
  /** Une partie de la règle 3 sans introduction, jusqu'à l'apparition d'un STOP. */
  async function untilStop(h: Harness): Promise<void> {
    h.run.start();
    for (let guard = 0; guard < 12; guard += 1) {
      await nextAppearance(h);
      if (h.snap().scene.kind === 'stop') return;
      await advance(300);
      h.run.press();
    }
    throw new Error('aucun STOP');
  }

  const NO_INTRO: GoNoGoLevelConfig = { ...LATE_STOP, intro: null };

  it('fait surgir le panneau 150 ms après l’entrée, avec l’effet stop', async () => {
    const h = setup(NO_INTRO);
    await untilStop(h);
    expect(h.snap().scene.hasStop).toBe(false);
    await advance(149);
    expect(h.snap().scene.hasStop).toBe(false);
    await advance(1);
    expect(h.snap().scene.hasStop).toBe(true);
    expect(h.effects).toContain('stop');
  });

  it('un appui avant le STOP attrape la cible sans erreur', async () => {
    const h = setup(NO_INTRO);
    await untilStop(h);
    await advance(100);
    h.run.press();
    expect(h.snap().scene.moment).toBe('caught');
    expect(h.snap().game.trapped).toBe(0);
  });

  it('un appui après le STOP est un piège touché', async () => {
    const h = setup(NO_INTRO);
    await untilStop(h);
    await advance(400);
    h.run.press();
    expect(h.snap().scene.moment).toBe('trapped');
    expect(h.snap().game).toMatchObject({ trapped: 1 });
  });

  it('un STOP laissé passer : le gag de l’oiseau figé', async () => {
    const h = setup(NO_INTRO);
    await untilStop(h);
    await advance(1800 + WINDOW_GRACE_MS);
    expect(h.snap().scene.moment).toBe('passed');
    expect(h.snap().scene.hasStop).toBe(true);
    expect(h.effects).toContain('gag');
  });
});

describe('cible qui attend (échelon 3 de l’aide)', () => {
  it('trois cibles ratées d’affilée : la quatrième attend sans limite de temps, main et buzzer qui pulse', async () => {
    const h = setup(OWL);
    h.run.start();
    for (let index = 0; index < 3; index += 1) {
      await nextAppearance(h);
      await letItExpire(h);
      // Un appui entre deux apparitions ne compte pas, mais l'enfant est là : pas de pause d'inaction.
      await advance(MISSED_MS + 100);
      h.run.press();
    }
    await nextAppearance(h);
    expect(h.snap().hand).toBe('tap');
    expect(h.snap().isBuzzerPulsing).toBe(true);
    // Elle reste sur scène, 10 s plus tard comme au premier instant.
    await advance(10_000);
    expect(h.snap().scene.moment).toBe('entering');
    expect(h.snap().game.status).toBe('window');
    // Un appui la résout, à n'importe quel moment.
    h.run.press();
    expect(h.snap().scene.moment).toBe('caught');
    expect(h.snap().hand).toBe('none');
  });
});

describe('fin de l’étoile', () => {
  /** Joue l'étoile entière sans la moindre erreur. */
  async function playPerfectly(h: Harness): Promise<void> {
    h.run.start();
    await nextOrWon(h);
    while (h.snap().phase !== 'won') {
      if (h.snap().scene.kind === 'target') {
        await advance(400);
        h.run.press();
      } else {
        await letItExpire(h);
      }
      await advance(1);
      await nextOrWon(h);
    }
  }

  it('enregistre la victoire une seule fois : pièges touchés, vitesse tenue, couronne', async () => {
    const h = setup({ ...OWL, intro: null });
    await playPerfectly(h);
    // Six réussites seulement : pas de série de 8, la vitesse tenue est la fenêtre de fin de partie.
    expect(h.results).toEqual([{ moves: 0, timeSeconds: 2.03, isPerfect: true }]);
    expect(h.effects.at(-1)).toBe('victory');
    expect(h.spoken.at(-1)?.clips).toEqual([SHARED_CLIPS.starWon, SHARED_CLIPS.crownWon]);
    await advance(60_000);
    expect(h.results).toHaveLength(1);
  });

  it('ouvre l’écran de fin un instant après la victoire', async () => {
    const h = setup({ ...OWL, intro: null });
    await playPerfectly(h);
    expect(h.snap().isEndOpen).toBe(false);
    await advance(END_SCREEN_DELAY_MS);
    expect(h.snap().isEndOpen).toBe(true);
  });

  it('une étoile avec un piège touché est gagnée sans couronne', async () => {
    const h = setup({ ...OWL, intro: null });
    h.run.start();
    let trappedOnce = false;
    await nextOrWon(h);
    while (h.snap().phase !== 'won') {
      const isTrap = h.snap().scene.kind === 'trap';
      if (isTrap && !trappedOnce) {
        trappedOnce = true;
        await advance(200);
        h.run.press();
        await advance(TRAPPED_PAUSE_MS);
      } else if (isTrap) {
        await letItExpire(h);
      } else {
        await advance(400);
        h.run.press();
      }
      await advance(1);
      await nextOrWon(h);
    }
    expect(h.results).toHaveLength(1);
    expect(h.results[0]).toMatchObject({ moves: 1, isPerfect: false });
    expect(h.spoken.at(-1)?.clips).toEqual([SHARED_CLIPS.starWon]);
  });

  it('rien ne se compte plus une fois l’étoile gagnée', async () => {
    const h = setup({ ...OWL, intro: null });
    await playPerfectly(h);
    h.run.press();
    expect(h.snap().phase).toBe('won');
    h.run.pause();
    expect(h.snap().phase).toBe('won');
  });

  it('Rejouer : nouvelle file, rappel dit de nouveau, sans la démo de l’étoile gagnée', async () => {
    const h = setup({ ...OWL, intro: null });
    await playPerfectly(h);
    await advance(END_SCREEN_DELAY_MS);
    h.spoken.length = 0;
    h.run.restart();
    expect(h.snap()).toMatchObject({ phase: 'starting', isEndOpen: false });
    expect(h.snap().game).toMatchObject({ shown: 0, cleared: 0 });
    await advance(0);
    expect(h.spoken).toEqual([{ clips: [getVoiceClipPath('rule-owl-says')], mood: undefined }]);
    await advance(START_DELAY_MS + BREATH_MS);
    expect(h.snap().game.status).toBe('window');
    // La victoire suivante s'enregistre aussi.
    expect(h.results).toHaveLength(1);
  });
});

describe('inaction et page masquée (§6.5)', () => {
  it('au bout de 12 s sans appui, le défilement se met en pause : scène vide, chouette, buzzer qui pulse', async () => {
    const h = setup(OWL);
    await startLive(h);
    await advance(IDLE_MS);
    expect(h.snap()).toMatchObject({ phase: 'paused', hand: 'none', isBuzzerPulsing: true });
    expect(h.snap().scene.subject).toBeNull();
    expect(h.snap().mascot).toEqual({ isVisible: true, pose: 'idle' });
    // L'apparition qui était sur scène revient en tête, non comptée : seules les ratées l'ont été.
    expect(h.snap().game.status).toBe('between');
    expect(h.snap().game.current).toBeNull();
    expect(h.snap().game.shown).toBe(h.snap().game.missed);
    expect(h.snap().game.queue).toHaveLength(6);
  });

  it('la chouette rappelle la règle, au plus 3 fois, puis se tait', async () => {
    const h = setup(OWL);
    await startLive(h);
    h.spoken.length = 0;
    await advance(IDLE_MS);
    expect(h.spoken).toHaveLength(1);
    await advance(IDLE_MS * 5);
    expect(h.spoken).toHaveLength(MAX_NUDGES);
    for (const { clips } of h.spoken) expect(clips).toEqual([getVoiceClipPath('rule-owl-says')]);
  });

  it('un appui relance le défilement sans compter, la même apparition revient', async () => {
    const h = setup(OWL);
    await startLive(h);
    const first = h.snap().game.current;
    h.run.pause();
    expect(h.snap().game.queue[0]).toBe(first);
    await advance(IDLE_MS);
    h.run.press();
    expect(h.snap().phase).toBe('live');
    expect(h.snap().isBuzzerPulsing).toBe(false);
    expect(h.snap().game.cleared).toBe(0);
    await advance(BREATH_MS);
    expect(h.snap().game.status).toBe('window');
    expect(h.snap().game.current).toBe(first);
    // La mascotte de la règle 1 se cache de nouveau.
    expect(h.snap().mascot.isVisible).toBe(false);
  });

  it('chaque appui repousse l’inaction', async () => {
    const h = setup(OWL);
    await startLive(h);
    for (let index = 0; index < 4; index += 1) {
      await advance(IDLE_MS - 3000);
      h.run.press(); // pendant une apparition ou non : la pause ne vient pas
    }
    expect(h.snap().phase).toBe('live');
  });

  it('page masquée : pause immédiate, la chouette ne dit rien, un appui relance', async () => {
    const h = setup(OWL);
    await startLive(h);
    h.spoken.length = 0;
    h.run.pause();
    expect(h.snap().phase).toBe('paused');
    await advance(IDLE_MS * 2);
    expect(h.spoken).toEqual([]);
    h.run.press();
    expect(h.snap().phase).toBe('live');
  });

  it('page masquée avant le premier plan ou pendant une pause : rien ne change', async () => {
    const h = setup(OWL);
    h.run.pause();
    expect(h.snap().phase).toBe('starting');
    await startLive(h);
    h.run.pause();
    const paused = h.snap();
    h.run.pause();
    expect(h.snap()).toBe(paused);
  });

  it('la mascotte touchée pendant une pause répète la règle sans relancer le jeu', async () => {
    const h = setup(OWL);
    await startLive(h);
    h.run.replayRule();
    expect(
      h.spoken.filter(({ clips }) => clips[0] === getVoiceClipPath('rule-owl-says')),
    ).toHaveLength(1);
    h.run.pause();
    const before = h.spoken.length;
    h.run.replayRule();
    expect(h.spoken).toHaveLength(before + 1);
    expect(h.snap().phase).toBe('paused');
  });

  it('la pause d’une victoire acquise ne la perd pas', async () => {
    const h = setup({ ...OWL, intro: null, appearances: 4, traps: 1 });
    h.run.start();
    // Trois cibles attrapées, puis le piège laissé passer : victoire en cours d'animation.
    for (let index = 0; index < 3; index += 1) {
      await nextAppearance(h);
      await advance(300);
      h.run.press();
    }
    await nextAppearance(h);
    await advance(2500 + WINDOW_GRACE_MS);
    expect(h.snap().game.status).toBe('won');
    h.run.pause();
    expect(h.snap().phase).toBe('live');
    await advance(PASSED_MS);
    expect(h.snap().phase).toBe('won');
    expect(h.results).toHaveLength(1);
  });

  it('l’inaction n’interrompt pas une pause « oups » en cours de victoire', async () => {
    const h = setup(OWL);
    await startLive(h);
    h.run.pause();
    h.run.press();
    expect(h.snap().phase).toBe('live');
  });
});

describe('le leurre de la chouette (palier 4)', () => {
  const NO_DEMO: GoNoGoLevelConfig = { ...FLIES_LURE, intro: null };

  it('bat des ailes et dit « … vole ! » à chaque image, cibles comme pièges', async () => {
    const h = setup(NO_DEMO);
    await startLive(h);
    const subject = h.snap().scene.subject;
    if (!subject) throw new Error('aucune image');
    expect(h.spoken.at(-1)).toEqual({
      clips: [getVoiceClipPath(getLureClipId(subject as 'pigeon'))],
      mood: 'flap',
    });
    expect(h.snap().mascot.pose).toBe('flap');
    await advance(LURE_FLAP_MS);
    expect(h.snap().mascot.pose).toBe('idle');
  });

  it('la mascotte reste à côté de la scène aux règles 2 et 3 : jamais cachée', async () => {
    const h = setup(NO_DEMO);
    await startLive(h);
    expect(h.snap().mascot.isVisible).toBe(true);
  });

  it('la mascotte est contente après une cible attrapée', async () => {
    const h = setup(NO_DEMO);
    await startLive(h);
    await advance(300);
    h.run.press();
    expect(h.snap().mascot.pose).toBe('happy');
    await advance(HAPPY_MS);
    expect(h.snap().mascot.pose).toBe('idle');
  });
});

describe('introduction : la démo et les essais guidés (§9)', () => {
  it('à la première étoile de la règle, la démo se joue, puis quatre essais, puis la partie', async () => {
    const h = setup(OWL_INTRO);
    h.run.start();
    await advance(0);
    expect(h.snap().phase).toBe('demo');
    await until(h, (snapshot) => snapshot.phase === 'trial');
    expect(h.snap().trial).toBe(0);
    for (let trial = 0; trial < 4; trial += 1) {
      await until(h, (snapshot) => snapshot.scene.subject !== null && snapshot.trial === trial);
      await advance(300);
      h.run.press();
    }
    await until(h, (snapshot) => snapshot.phase === 'live');
    expect(h.snap().game.shown).toBe(0);
    await nextAppearance(h);
    expect(h.results).toEqual([]);
  });

  const OWL_INTRO: GoNoGoLevelConfig = { ...OWL, intro: 'full' };

  it('la démo de la règle 1 : la chouette, la main fantôme, le renard, la mise en garde', async () => {
    const h = setup(OWL_INTRO);
    h.run.start();
    await until(h, (snapshot) => snapshot.phase === 'trial');
    expect(h.effects.slice(0, 3)).toEqual(['signal', 'success', 'signal']);
    expect(h.effects).toContain('oops');
    const said = h.spoken.map(({ clips }) => clips[0]);
    expect(said).toEqual([
      getVoiceClipPath('rule-owl-says'),
      getVoiceClipPath('demo-bravo'),
      getVoiceClipPath('demo-oops'),
      getVoiceClipPath('demo-warning'),
    ]);
  });

  it('charge les phrases de la démo avant de la jouer', async () => {
    const h = setup(OWL_INTRO);
    h.run.start();
    await advance(0);
    expect(h.preloaded).toEqual(expect.arrayContaining(getDemoClipPaths(OWL_INTRO)));
  });

  it('tout appui pendant la démo est ignoré : rien n’est compté, le buzzer reste à elle', async () => {
    const h = setup(OWL_INTRO);
    h.run.start();
    await advance(0);
    h.run.press();
    expect(h.snap().isBuzzerPressed).toBe(false);
    expect(h.snap().game.shown).toBe(0);
  });

  it('une étoile déjà gagnée garde le rappel et les essais, sans la démo', async () => {
    const h = setup(OWL_INTRO, { hasWon: true });
    h.run.start();
    await advance(0);
    expect(h.snap().phase).toBe('starting');
    expect(h.spoken.map(({ clips }) => clips[0])).toEqual([getVoiceClipPath('rule-owl-says')]);
    await advance(START_DELAY_MS);
    expect(h.snap().phase).toBe('trial');
  });

  it('un seul rappel aux étoiles sans introduction : pas d’essai', async () => {
    const h = setup(OWL);
    h.run.start();
    await advance(START_DELAY_MS);
    expect(h.snap().phase).toBe('live');
  });

  describe('essais guidés', () => {
    it('cible, cible, piège, cible, à fenêtre longue, la main fantôme sur le premier', async () => {
      const h = setup(OWL_INTRO, { hasWon: true });
      h.run.start();
      await advance(START_DELAY_MS);
      const kinds: string[] = [];
      for (let trial = 0; trial < 4; trial += 1) {
        await until(h, (snapshot) => snapshot.scene.subject !== null && snapshot.trial === trial);
        kinds.push(h.snap().scene.kind);
        if (trial === 0) {
          expect(h.snap().hand).toBe('tap');
          expect(h.snap().isBuzzerPulsing).toBe(true);
        } else {
          expect(h.snap().hand).toBe('none');
        }
        expect(h.snap().scene.isSlow).toBe(true);
        await advance(100);
        h.run.press();
      }
      expect(kinds).toEqual(['target', 'target', 'trap', 'target']);
    });

    it('rien n’est compté ni remis dans la file : le moteur de l’étoile n’est pas touché', async () => {
      const h = setup(OWL_INTRO, { hasWon: true });
      h.run.start();
      await advance(START_DELAY_MS);
      const before = h.snap().game;
      for (let trial = 0; trial < 4; trial += 1) {
        await until(h, (snapshot) => snapshot.scene.subject !== null && snapshot.trial === trial);
        h.run.press(); // y compris sur le piège
        await until(h, (snapshot) => snapshot.trial > trial || snapshot.phase === 'live');
      }
      expect(h.snap().phase).toBe('live');
      expect(h.snap().game).toBe(before);
    });

    it('une fenêtre de 3 s : l’essai non touché s’écoule sans conséquence', async () => {
      const h = setup(OWL_INTRO, { hasWon: true });
      h.run.start();
      await advance(START_DELAY_MS);
      await until(h, (snapshot) => snapshot.scene.subject !== null);
      await advance(TRIAL_WINDOW_MS - 1);
      expect(h.snap().scene.moment).toBe('entering');
      await advance(WINDOW_GRACE_MS + 1);
      expect(h.snap().scene.moment).toBe('missed');
      expect(h.snap().game.missed).toBe(0);
    });

    it('un piège touché pendant les essais reçoit la même réponse douce, sans rien compter', async () => {
      const h = setup(OWL_INTRO, { hasWon: true });
      h.run.start();
      await advance(START_DELAY_MS);
      for (let trial = 0; trial < 3; trial += 1) {
        await until(h, (snapshot) => snapshot.scene.subject !== null && snapshot.trial === trial);
        h.run.press();
        await advance(TRAPPED_PAUSE_MS);
      }
      expect(h.spoken.at(-1)?.clips).toEqual([SHARED_CLIPS.trapped]);
      expect(h.snap().game.trapped).toBe(0);
    });

    it('un essai interrompu par une pause revient entier', async () => {
      const h = setup(OWL_INTRO, { hasWon: true });
      h.run.start();
      await advance(START_DELAY_MS);
      await until(h, (snapshot) => snapshot.scene.subject !== null);
      h.run.pause();
      expect(h.snap().phase).toBe('paused');
      h.run.press();
      expect(h.snap().phase).toBe('trial');
      await until(h, (snapshot) => snapshot.scene.subject !== null);
      expect(h.snap().trial).toBe(0);
    });
  });

  describe('autres règles', () => {
    it('règle 2 : la démo montre un avion qu’on attrape, une vache qu’on ne touche pas', async () => {
      const h = setup(FLIES);
      h.run.start();
      await until(h, (snapshot) => snapshot.phase === 'trial');
      expect(h.effects).not.toContain('signal');
      expect(h.spoken.map(({ clips }) => clips[0])).toContain(getVoiceClipPath('rule-flies'));
    });

    it('règle 3 : la main fantôme se fige quand le STOP surgit', async () => {
      const h = setup(LATE_STOP);
      h.run.start();
      const seen = new Set<string>();
      const unsubscribe = h.run.subscribe(() => {
        const snapshot = h.snap();
        if (snapshot.phase === 'demo') {
          seen.add(`${snapshot.hand}${snapshot.scene.hasStop ? '+stop' : ''}`);
        }
      });
      await until(h, (snapshot) => snapshot.phase === 'trial');
      unsubscribe();
      expect(seen).toContain('freeze');
      expect(seen).toContain('freeze+stop');
      expect(h.effects).toContain('stop');
      expect(h.spoken.map(({ clips }) => clips[0])).toContain(getVoiceClipPath('rule-late-stop'));
    });

    it('palier 4 : une démo courte, la chouette annonce son piège puis dit « Vache vole ! »', async () => {
      const h = setup(FLIES_LURE);
      h.run.start();
      await until(h, (snapshot) => snapshot.phase === 'trial');
      expect(h.spoken.map(({ clips, mood }) => [clips[0], mood])).toEqual([
        [getVoiceClipPath('rule-lure'), 'flap'],
        [getVoiceClipPath('lure-cow'), 'flap'],
      ]);
      expect(h.effects).toContain('gag');
    });

    it('arrêtée en pleine démo, elle recommence au premier plan après un appui', async () => {
      const h = setup(OWL_INTRO);
      h.run.start();
      await advance(3000);
      expect(h.snap().phase).toBe('demo');
      h.run.pause();
      expect(h.snap().phase).toBe('paused');
      h.run.press();
      expect(h.snap().phase).toBe('demo');
      await until(h, (snapshot) => snapshot.phase === 'trial');
      expect(getDemoScript(OWL_INTRO).length).toBeGreaterThan(10);
    });

    it('une démo interrompue par dispose ne lance jamais les essais', async () => {
      const h = setup(OWL_INTRO);
      h.run.start();
      await advance(3000);
      h.run.dispose();
      await advance(120_000);
      expect(h.snap().phase).toBe('demo');
    });
  });
});

describe('voix lente : la pause d’un piège dure autant que la voix', () => {
  it('attend la fin d’une phrase plus longue que 2 s', async () => {
    let finishVoice: () => void = () => undefined;
    let isFirst = true;
    const h = setup(OWL, {
      speak: () => {
        if (isFirst) {
          isFirst = false;
          return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          finishVoice = resolve;
        });
      },
    });
    await startLive(h);
    for (let index = 0; index < 5; index += 1) {
      await advance(500);
      h.run.press();
      await nextAppearance(h);
    }
    await advance(300);
    h.run.press();
    await advance(TRAPPED_PAUSE_MS + 3000);
    expect(h.snap().scene.moment).toBe('trapped');
    finishVoice();
    await advance(0);
    expect(h.snap().scene.subject).toBeNull();
  });
});
