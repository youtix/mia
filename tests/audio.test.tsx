import type * as MiaStorage from '@/core/storage';
import type { StorageContextValue } from '@/core/storage';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Réglage « Son » vu par le lecteur. Comme pour le plateau de Memory, le `StorageProvider` réel
 * charge la sauvegarde après le montage : le lecteur est monté sur un contexte simulé.
 */
const storage = vi.hoisted((): { soundEnabled: boolean } => ({ soundEnabled: true }));

vi.mock('@/core/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof MiaStorage>();
  // Nouvel objet de contexte à chaque rendu : le lecteur ne doit pas dépendre de son identité.
  const useMiaStorage = (): Pick<StorageContextValue, 'state'> => {
    const state = actual.createDefaultSaveState();
    const settings = { ...state.settings, soundEnabled: storage.soundEnabled };
    return { state: { ...state, settings } };
  };
  return { ...actual, useMiaStorage };
});

interface ParamEvent {
  method: 'set' | 'ramp';
  value: number;
  time: number;
}

class FakeParam {
  value = 0;
  readonly events: ParamEvent[] = [];

  setValueAtTime(value: number, time: number): this {
    this.events.push({ method: 'set', value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    // Comme le navigateur : une rampe exponentielle ne peut pas atteindre 0.
    if (value <= 0) throw new RangeError('Rampe exponentielle vers une valeur nulle ou négative');
    this.events.push({ method: 'ramp', value, time });
    return this;
  }
}

class FakeNode {
  readonly outputs: FakeNode[] = [];
  disconnectCount = 0;

  connect<T extends FakeNode>(target: T): T {
    this.outputs.push(target);
    return target;
  }

  disconnect(): void {
    this.disconnectCount += 1;
    this.outputs.length = 0;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeOscillator extends FakeNode {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam();
  readonly startTimes: number[] = [];
  readonly stopTimes: number[] = [];

  start(time: number): void {
    this.startTimes.push(time);
  }

  stop(time: number): void {
    this.stopTimes.push(time);
  }
}

class FakeFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

class FakeBuffer {
  readonly channel: Float32Array;

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channel = new Float32Array(length);
  }

  getChannelData(): Float32Array {
    return this.channel;
  }
}

class FakeBufferSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  readonly startTimes: number[] = [];

  start(time: number): void {
    this.startTimes.push(time);
  }
}

/** Contexte audio factice : retient les nœuds créés, pour lire ce qui a été programmé. */
class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = 'running';
  readonly sampleRate = 48_000;
  readonly destination = new FakeNode();
  resume: () => Promise<void> = vi.fn(() => Promise.resolve());
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];
  readonly sources: FakeBufferSource[] = [];
  readonly buffers: FakeBuffer[] = [];

  createOscillator(): FakeOscillator {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  }

  createGain(): FakeGain {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }

  createBiquadFilter(): FakeFilter {
    const node = new FakeFilter();
    this.filters.push(node);
    return node;
  }

  createBufferSource(): FakeBufferSource {
    const node = new FakeBufferSource();
    this.sources.push(node);
    return node;
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    const buffer = new FakeBuffer(channels, length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }
}

/** `new AudioContext()` renvoie ce contexte factice ; le constructeur compte ses appels. */
function installAudioContext(setup: Partial<Pick<FakeAudioContext, 'currentTime' | 'state'>> = {}) {
  const context = Object.assign(new FakeAudioContext(), setup);
  const AudioContextMock = vi.fn(function fakeConstructor() {
    return context;
  });
  vi.stubGlobal('AudioContext', AudioContextMock);
  return { context, AudioContextMock };
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Rien à l’index ${String(index)}`);
  return item;
}

/** Nœuds traversés depuis `node`, jusqu'à la sortie ou jusqu'à un nœud déconnecté. */
function pathOf(node: FakeNode): FakeNode[] {
  const next = node.outputs[0];
  return next ? [node, ...pathOf(next)] : [node];
}

/** Sortie de la lecture en cours : le seul nœud relié à la destination. */
function liveBus(context: FakeAudioContext): FakeGain {
  const buses = context.gains.filter((gain) => gain.outputs.includes(context.destination));
  expect(buses).toHaveLength(1);
  return at(buses, 0);
}

/** Enveloppe d'une note : le nœud de gain juste après l'oscillateur ou le filtre. */
function envelopeOf(node: FakeNode): FakeGain {
  const envelope = node.outputs[0];
  if (!(envelope instanceof FakeGain)) throw new Error('Enveloppe attendue');
  return envelope;
}

/** Temps en millisecondes entières : compare des dates sans erreur d'arrondi. */
const inMs = (seconds: number): number => Math.round(seconds * 1000);

const startsInMs = (nodes: readonly { startTimes: number[] }[]): number[] =>
  nodes.flatMap((node) => node.startTimes.map(inMs));

const oscillatorsOfType = (context: FakeAudioContext, type: OscillatorType): FakeOscillator[] =>
  context.oscillators.filter((oscillator) => oscillator.type === type);

const loadSynth = () => import('@/core/audio/synth');

beforeEach(() => {
  // `synth.ts` garde son contexte dans le module : chaque test repart d'un module neuf.
  vi.resetModules();
  storage.soundEnabled = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sans AudioContext (navigateur ancien, tests)', () => {
  it('ne plante pas et ne joue rien', async () => {
    const { playSoundBeats, playSoundJingle, stopSounds } = await loadSynth();

    expect(typeof AudioContext).toBe('undefined');
    expect(() => {
      playSoundBeats(['bell', 'drum'], 550);
      playSoundJingle('round');
      playSoundJingle('star');
      stopSounds();
    }).not.toThrow();
  });

  it('laisse le lecteur utilisable : rien à jouer, rien à couper', async () => {
    const { useSoundPlayer } = await import('@/core/audio');
    const { result, unmount } = renderHook(() => useSoundPlayer());

    expect(result.current.isEnabled).toBe(true);
    expect(() => {
      result.current.playBeats(['bell'], 550);
      result.current.playJingle('star');
      result.current.stop();
      unmount();
    }).not.toThrow();
  });

  // `new AudioContext()` peut lever (`NotSupportedError` : matériel audio indisponible, contexte
  // refusé par le navigateur). Sans cette garde, le jingle de réussite, qui part d'un effet, démonte
  // tout l'écran et l'étoile n'est jamais enregistrée (FEAT-21 §3.4).
  it('ne plante pas non plus quand la création du contexte échoue', async () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function failingConstructor() {
        throw new DOMException('Matériel audio indisponible', 'NotSupportedError');
      }),
    );
    const { playSoundBeats, playSoundJingle, stopSounds } = await loadSynth();

    expect(() => {
      playSoundBeats(['bell', 'drum'], 550);
      playSoundJingle('round');
      stopSounds();
    }).not.toThrow();
  });
});

describe('playSoundBeats', () => {
  it('programme chaque temps à currentTime + index × beatMs', async () => {
    const { context } = installAudioContext({ currentTime: 12.5 });
    const { playSoundBeats } = await loadSynth();

    playSoundBeats(['bell', 'drum', 'drum', 'bell'], 550);

    // Cloches à 12,5 s et 14,15 s, 3 partiels chacune ; tambours à 13,05 s et 13,6 s : un corps
    // triangle, 2 sons sinusoïdaux et leur bruit.
    expect(startsInMs(oscillatorsOfType(context, 'sine'))).toEqual([
      12500, 12500, 12500, 13050, 13050, 13600, 13600, 14150, 14150, 14150,
    ]);
    expect(startsInMs(oscillatorsOfType(context, 'triangle'))).toEqual([13050, 13600]);
    expect(startsInMs(context.sources)).toEqual([13050, 13600]);
  });

  it('suit l’intervalle demandé', async () => {
    const { context } = installAudioContext();
    const { playSoundBeats } = await loadSynth();

    playSoundBeats(['drum', 'drum', 'drum'], 1000);

    expect(startsInMs(context.oscillators)).toEqual([0, 0, 0, 1000, 1000, 1000, 2000, 2000, 2000]);
    expect(startsInMs(context.sources)).toEqual([0, 1000, 2000]);
  });

  it('ne programme rien pour une suite vide', async () => {
    const { context } = installAudioContext();
    const { playSoundBeats } = await loadSynth();

    playSoundBeats([], 550);

    expect(context.oscillators).toEqual([]);
    expect(context.sources).toEqual([]);
  });

  it('une cloche : uniquement des oscillateurs sinus, à partiels inharmoniques', async () => {
    const { context } = installAudioContext();
    const { playSoundBeats } = await loadSynth();

    playSoundBeats(['bell'], 550);

    expect(context.oscillators.map((oscillator) => oscillator.type)).toEqual([
      'sine',
      'sine',
      'sine',
    ]);
    expect(context.sources).toEqual([]);
    expect(context.buffers).toEqual([]);
    expect(context.filters).toEqual([]);

    const partials = context.oscillators.map((oscillator) => at(oscillator.frequency.events, 0));
    const fundamental = at(partials, 0).value;
    for (const partial of partials.slice(1)) {
      expect(partial.value).toBeGreaterThan(fundamental);
      expect(Number.isInteger(partial.value / fundamental)).toBe(false);
    }
  });

  it('une cloche : le partiel le plus aigu s’éteint le premier', async () => {
    const { context } = installAudioContext();
    const { playSoundBeats } = await loadSynth();

    playSoundBeats(['bell'], 550);

    const byPitch = [...context.oscillators].sort(
      (a, b) => at(a.frequency.events, 0).value - at(b.frequency.events, 0).value,
    );
    const ends = byPitch.map((oscillator) => at(oscillator.stopTimes, 0));
    expect(ends).toEqual([...ends].sort((a, b) => b - a));
    expect(new Set(ends).size).toBe(3);
  });

  it('un tambour : audible sur un haut-parleur de téléphone, avec une assise grave', async () => {
    const { context } = installAudioContext();
    const { playSoundBeats } = await loadSynth();

    playSoundBeats(['drum'], 550);

    expect(context.oscillators.map((oscillator) => oscillator.type)).toEqual([
      'triangle',
      'sine',
      'sine',
    ]);
    const tones = context.oscillators.map(({ frequency }) => frequency.events);
    for (const events of tones) {
      expect(events.map((event) => event.method)).toEqual(['set', 'ramp']);
      expect(at(events, 1).value).toBeLessThan(at(events, 0).value);
    }

    // Un téléphone ne reproduit rien sous 300 Hz environ : le corps part au-dessus, sa fondamentale
    // redescend sous ce seuil mais ses harmoniques restent, et le partiel y reste jusqu'au bout.
    expect(at(at(tones, 0), 0).value).toBeGreaterThan(300);
    expect(at(at(tones, 1), 1).value).toBeGreaterThan(300);
    // Seul le grave passe en dessous (téléviseur), sans s'enfoncer sous 100 Hz.
    expect(at(at(tones, 2), 0).value).toBeLessThan(300);
    expect(at(at(tones, 2), 1).value).toBeGreaterThanOrEqual(100);
  });

  it('un tambour : une attaque de bruit filtré, brève et audible', async () => {
    const { context } = installAudioContext();
    const { playSoundBeats } = await loadSynth();

    playSoundBeats(['drum'], 550);

    expect(context.sources).toHaveLength(1);
    expect(context.buffers).toHaveLength(1);
    const buffer = at(context.buffers, 0);
    const filter = at(context.filters, 0);

    expect(at(context.sources, 0).buffer).toBe(buffer);
    expect(buffer.numberOfChannels).toBe(1);
    expect(buffer.sampleRate).toBe(context.sampleRate);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.length).toBeLessThan(context.sampleRate / 4);

    // Du bruit, pas un silence : des échantillons variés, dans l'amplitude autorisée.
    const samples = [...buffer.channel];
    expect(new Set(samples).size).toBeGreaterThan(1);
    expect(samples.every((sample) => sample >= -1 && sample <= 1)).toBe(true);

    expect(filter.type).toBe('bandpass');
    expect(filter.frequency.value).toBeGreaterThan(300);
    expect(filter.Q.value).toBeGreaterThan(0);
  });

  it('un tambour au 3e temps : tout part de ce temps, balayage compris', async () => {
    const { context } = installAudioContext({ currentTime: 2 });
    const { playSoundBeats } = await loadSynth();

    playSoundBeats(['bell', 'bell', 'drum'], 500);

    const body = at(oscillatorsOfType(context, 'triangle'), 0);
    const source = at(context.sources, 0);
    const [sweepStart, sweepEnd] = body.frequency.events;

    expect(inMs(at(body.startTimes, 0))).toBe(3000);
    expect(inMs(at(source.startTimes, 0))).toBe(3000);
    expect(inMs(sweepStart?.time ?? 0)).toBe(3000);
    expect(inMs(sweepEnd?.time ?? 0)).toBeGreaterThan(3000);
    expect(inMs(at(envelopeOf(at(context.filters, 0)).gain.events, 0).time)).toBe(3000);
  });

  it('chaque note s’éteint en douceur avant de s’arrêter', async () => {
    const { context } = installAudioContext({ currentTime: 1 });
    const { playSoundBeats } = await loadSynth();

    playSoundBeats(['bell', 'drum'], 550);

    for (const oscillator of context.oscillators) {
      const [attack, release] = envelopeOf(oscillator).gain.events;
      const start = at(oscillator.startTimes, 0);
      const end = at(oscillator.stopTimes, 0);

      expect(attack).toMatchObject({ method: 'set', time: start });
      expect(attack?.value).toBeGreaterThan(0);
      expect(release).toMatchObject({ method: 'ramp', time: end });
      expect(release?.value).toBeLessThan(0.001);
      expect(end).toBeGreaterThan(start);
    }
  });

  it('fait passer chaque note par la sortie de la lecture, à un volume sans saturation', async () => {
    const { context } = installAudioContext();
    const { playSoundBeats } = await loadSynth();

    playSoundBeats(['bell', 'drum'], 550);

    const bus = liveBus(context);
    expect(bus.gain.value).toBeGreaterThan(0);
    expect(bus.gain.value).toBeLessThanOrEqual(1);
    for (const node of [...context.oscillators, ...context.sources]) {
      const path = pathOf(node);

      expect(path.at(-1)).toBe(context.destination);
      expect(path.at(-2)).toBe(bus);
    }
  });
});

describe('playSoundJingle', () => {
  it.each<['round' | 'star', number]>([
    ['round', 3],
    ['star', 4],
  ])('%s : une montée de %i notes, à partir de maintenant', async (kind, notes) => {
    const { context } = installAudioContext({ currentTime: 3 });
    const { playSoundJingle } = await loadSynth();

    playSoundJingle(kind);

    expect(context.oscillators).toHaveLength(notes);
    expect(context.sources).toEqual([]);

    const starts = startsInMs(context.oscillators);
    const pitches = context.oscillators.map(
      (oscillator) => at(oscillator.frequency.events, 0).value,
    );
    expect(starts[0]).toBe(3000);
    expect(starts).toEqual([...new Set(starts)].sort((a, b) => a - b));
    expect(pitches).toEqual([...new Set(pitches)].sort((a, b) => a - b));
    for (const oscillator of context.oscillators) {
      expect(pathOf(oscillator)).toContain(liveBus(context));
      expect(at(oscillator.stopTimes, 0)).toBeGreaterThan(at(oscillator.startTimes, 0));
    }
  });

  it('la récompense d’une étoile dure plus longtemps que celle d’un défi', async () => {
    const round = installAudioContext();
    const synth = await loadSynth();
    synth.playSoundJingle('round');
    const roundEnd = Math.max(...round.context.oscillators.flatMap((note) => note.stopTimes));

    vi.resetModules();
    const star = installAudioContext();
    (await loadSynth()).playSoundJingle('star');
    const starEnd = Math.max(...star.context.oscillators.flatMap((note) => note.stopTimes));

    expect(starEnd).toBeGreaterThan(roundEnd);
  });
});

describe('Un seul son à la fois', () => {
  it('une nouvelle lecture coupe la sortie de la précédente', async () => {
    const { context } = installAudioContext();
    const { playSoundBeats, playSoundJingle } = await loadSynth();

    playSoundBeats(['bell', 'drum'], 550);
    const firstBus = liveBus(context);
    const firstNotes = [...context.oscillators, ...context.sources];

    playSoundJingle('round');
    const secondBus = liveBus(context);

    expect(secondBus).not.toBe(firstBus);
    expect(firstBus.disconnectCount).toBe(1);
    expect(firstBus.outputs).toEqual([]);
    expect(secondBus.disconnectCount).toBe(0);
    for (const note of firstNotes) expect(pathOf(note)).not.toContain(context.destination);
  });

  it('remplace aussi une suite par une suite, et une récompense par une suite', async () => {
    const { context } = installAudioContext();
    const { playSoundBeats, playSoundJingle } = await loadSynth();

    playSoundBeats(['bell'], 550);
    const first = liveBus(context);
    playSoundBeats(['drum'], 550);
    const second = liveBus(context);
    playSoundJingle('star');
    const third = liveBus(context);
    playSoundBeats(['bell'], 550);

    for (const bus of [first, second, third]) expect(bus.disconnectCount).toBe(1);
    expect(liveBus(context).disconnectCount).toBe(0);
  });
});

describe('stopSounds', () => {
  it('est sans effet avant toute lecture, et n’ouvre pas de contexte', async () => {
    const { AudioContextMock } = installAudioContext();
    const { stopSounds } = await loadSynth();

    expect(() => {
      stopSounds();
      stopSounds();
    }).not.toThrow();
    expect(AudioContextMock).not.toHaveBeenCalled();
  });

  it('coupe la lecture en cours, une seule fois même appelée plusieurs fois', async () => {
    const { context } = installAudioContext();
    const { playSoundBeats, stopSounds } = await loadSynth();

    playSoundBeats(['bell'], 550);
    const bus = liveBus(context);

    stopSounds();
    stopSounds();

    expect(bus.disconnectCount).toBe(1);
    expect(context.destination.outputs).toEqual([]);
    expect(context.gains.filter((gain) => gain.outputs.includes(context.destination))).toEqual([]);
  });

  it('n’empêche pas la lecture suivante, dans le même contexte', async () => {
    const { context, AudioContextMock } = installAudioContext();
    const { playSoundBeats, stopSounds } = await loadSynth();

    playSoundBeats(['bell'], 550);
    const stopped = liveBus(context);
    stopSounds();
    playSoundBeats(['drum'], 550);

    expect(liveBus(context)).not.toBe(stopped);
    expect(AudioContextMock).toHaveBeenCalledOnce();
  });
});

describe('Contexte audio', () => {
  it('n’est créé qu’au premier son, et une seule fois', async () => {
    const { AudioContextMock } = installAudioContext();
    const { playSoundBeats, playSoundJingle, stopSounds } = await loadSynth();

    expect(AudioContextMock).not.toHaveBeenCalled();

    playSoundBeats(['bell'], 550);
    playSoundJingle('round');
    stopSounds();
    playSoundBeats(['drum'], 550);
    playSoundJingle('star');

    expect(AudioContextMock).toHaveBeenCalledOnce();
  });

  it('réveille un contexte suspendu à chaque lecture, tant qu’il le reste', async () => {
    const { context } = installAudioContext({ state: 'suspended' });
    const { playSoundBeats, playSoundJingle } = await loadSynth();

    playSoundBeats(['bell'], 550);
    expect(context.resume).toHaveBeenCalledOnce();

    playSoundJingle('round');
    expect(context.resume).toHaveBeenCalledTimes(2);

    context.state = 'running';
    playSoundBeats(['bell'], 550);
    expect(context.resume).toHaveBeenCalledTimes(2);
  });

  it('ne réveille pas un contexte déjà actif', async () => {
    const { context } = installAudioContext();
    const { playSoundBeats } = await loadSynth();

    playSoundBeats(['bell'], 550);

    expect(context.resume).not.toHaveBeenCalled();
  });

  it('ne laisse aucun rejet sans suite quand le réveil est refusé, et programme quand même', async () => {
    const unhandled = vi.fn();
    const refused = vi.fn();
    process.on('unhandledRejection', unhandled);
    const { context } = installAudioContext({ state: 'suspended' });
    // Un vrai rejet, pas `mockRejectedValue` : `vi.fn` suit le résultat de ses appels et traiterait
    // lui-même le rejet, ce qui masquerait un `.catch` oublié.
    context.resume = () => {
      refused();
      return Promise.reject(new Error('Aucun geste de l’utilisateur'));
    };
    const { playSoundBeats, playSoundJingle } = await loadSynth();

    try {
      expect(() => {
        playSoundBeats(['bell'], 550);
        playSoundJingle('round');
      }).not.toThrow();

      // Node signale un rejet sans suite une fois les micro-tâches vidées.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      expect(refused).toHaveBeenCalledTimes(2);
      expect(unhandled).not.toHaveBeenCalled();
      expect(context.oscillators).toHaveLength(6);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('useSoundPlayer', () => {
  const loadPlayer = async () => (await import('@/core/audio')).useSoundPlayer;

  it('suit le réglage Son de l’appareil', async () => {
    const useSoundPlayer = await loadPlayer();
    const { result, rerender } = renderHook(() => useSoundPlayer());

    expect(result.current.isEnabled).toBe(true);

    storage.soundEnabled = false;
    rerender();
    expect(result.current.isEnabled).toBe(false);

    storage.soundEnabled = true;
    rerender();
    expect(result.current.isEnabled).toBe(true);
  });

  it('joue suites et récompenses quand le son est actif', async () => {
    const { context } = installAudioContext();
    const useSoundPlayer = await loadPlayer();
    const { result } = renderHook(() => useSoundPlayer());

    result.current.playBeats(['bell', 'drum'], 550);
    expect(oscillatorsOfType(context, 'sine')).toHaveLength(5);
    expect(oscillatorsOfType(context, 'triangle')).toHaveLength(1);
    expect(startsInMs(oscillatorsOfType(context, 'triangle'))).toEqual([550]);

    result.current.playJingle('star');
    expect(oscillatorsOfType(context, 'triangle')).toHaveLength(5);
  });

  it('n’émet rien quand le son est coupé, sans même ouvrir de contexte', async () => {
    storage.soundEnabled = false;
    const { context, AudioContextMock } = installAudioContext();
    const useSoundPlayer = await loadPlayer();
    const { result } = renderHook(() => useSoundPlayer());

    result.current.playBeats(['bell', 'drum'], 550);
    result.current.playJingle('round');

    expect(result.current.isEnabled).toBe(false);
    expect(AudioContextMock).not.toHaveBeenCalled();
    expect(context.oscillators).toEqual([]);
    expect(context.sources).toEqual([]);
  });

  it('se remet à jouer quand le son est réactivé', async () => {
    storage.soundEnabled = false;
    const { context } = installAudioContext();
    const useSoundPlayer = await loadPlayer();
    const { result, rerender } = renderHook(() => useSoundPlayer());

    result.current.playJingle('round');
    expect(context.oscillators).toEqual([]);

    storage.soundEnabled = true;
    rerender();
    result.current.playJingle('round');
    expect(context.oscillators).toHaveLength(3);
  });

  it('stop coupe le son en cours, y compris une fois le son coupé', async () => {
    const { context } = installAudioContext();
    const useSoundPlayer = await loadPlayer();
    const { result, rerender } = renderHook(() => useSoundPlayer());

    result.current.playBeats(['bell'], 550);
    const bus = liveBus(context);

    storage.soundEnabled = false;
    rerender();
    expect(bus.disconnectCount).toBe(0);

    result.current.stop();
    expect(bus.disconnectCount).toBe(1);
  });

  it('se tait au démontage', async () => {
    const { context } = installAudioContext();
    const useSoundPlayer = await loadPlayer();
    const { result, unmount } = renderHook(() => useSoundPlayer());

    result.current.playBeats(['bell', 'drum'], 550);
    const bus = liveBus(context);
    expect(bus.disconnectCount).toBe(0);

    unmount();

    expect(bus.disconnectCount).toBe(1);
  });

  it('un démontage sans lecture n’ouvre pas de contexte', async () => {
    const { AudioContextMock } = installAudioContext();
    const useSoundPlayer = await loadPlayer();
    const { unmount } = renderHook(() => useSoundPlayer());

    unmount();

    expect(AudioContextMock).not.toHaveBeenCalled();
  });

  it('un nouveau rendu ne coupe pas le son en cours', async () => {
    const { context } = installAudioContext();
    const useSoundPlayer = await loadPlayer();
    const { result, rerender } = renderHook(() => useSoundPlayer());

    result.current.playBeats(['bell'], 550);
    const bus = liveBus(context);
    rerender();

    expect(bus.disconnectCount).toBe(0);
    expect(liveBus(context)).toBe(bus);
  });

  it('garde la même identité tant que le réglage ne change pas', async () => {
    const useSoundPlayer = await loadPlayer();
    const { result, rerender } = renderHook(() => useSoundPlayer());
    const initial = result.current;

    rerender();
    rerender();
    expect(result.current).toBe(initial);

    storage.soundEnabled = false;
    rerender();
    const muted = result.current;
    expect(muted).not.toBe(initial);

    rerender();
    expect(result.current).toBe(muted);
  });

  it('expose son API par l’index du module', async () => {
    const audio = await import('@/core/audio');

    expect(Object.keys(audio).sort()).toEqual([
      'createAudioService',
      'getAudioService',
      'playSoundBeats',
      'playSoundJingle',
      'resolveAudioUrl',
      'stopSounds',
      'useGameAudio',
      'useSoundPlayer',
    ]);
  });
});
