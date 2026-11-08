import type { AudioService } from '@/core/audio';
import { MIN_MIME_MS } from '@/games/bear-sort/components/useMascotSpeech';
import { useMascotVoice } from '@/games/go-no-go/components/useMascotVoice';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Voix dont la fin se décide dans le test. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function createAudio(playClips: AudioService['playClips']): AudioService {
  return {
    setEnabled: vi.fn(),
    preloadClips: vi.fn(() => Promise.resolve()),
    playClips,
    stopClips: vi.fn(),
    playEffect: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useMascotVoice', () => {
  it('mime la parole : la chouette parle pendant la voix, et au moins MIN_MIME_MS', async () => {
    const audio = createAudio(() => Promise.resolve());
    const { result } = renderHook(() => useMascotVoice(audio));
    expect(result.current.speakingMood).toBeNull();

    await act(async () => {
      void result.current.speak(['audio/go-no-go/rule-flies.mp3']);
      await Promise.resolve();
    });
    // Son coupé : la voix est résolue aussitôt, le mime tient quand même.
    expect(result.current.speakingMood).toBe('talking');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MIN_MIME_MS - 1);
    });
    expect(result.current.speakingMood).toBe('talking');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.speakingMood).toBeNull();
  });

  it('garde le mime jusqu’à la fin d’une voix plus longue que le minimum', async () => {
    const voice = deferred();
    const audio = createAudio(() => voice.promise);
    const { result } = renderHook(() => useMascotVoice(audio));

    await act(async () => {
      void result.current.speak(['audio/go-no-go/demo-warning.mp3']);
      await vi.advanceTimersByTimeAsync(MIN_MIME_MS * 3);
    });
    expect(result.current.speakingMood).toBe('talking');
    await act(async () => {
      voice.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.speakingMood).toBeNull();
  });

  it('bat des ailes pour le leurre : l’humeur « flap » remplace celle qui parle', async () => {
    const audio = createAudio(() => Promise.resolve());
    const { result } = renderHook(() => useMascotVoice(audio));
    await act(async () => {
      void result.current.speak(['audio/go-no-go/lure-cow.mp3'], 'flap');
      await Promise.resolve();
    });
    expect(result.current.speakingMood).toBe('flap');
  });

  it('une parole récente n’est pas close par une parole ancienne', async () => {
    const first = deferred();
    const second = deferred();
    const voices = [first.promise, second.promise];
    const audio = createAudio(() => voices.shift() ?? Promise.resolve());
    const { result } = renderHook(() => useMascotVoice(audio));

    await act(async () => {
      void result.current.speak(['a.mp3']);
      await vi.advanceTimersByTimeAsync(MIN_MIME_MS);
      void result.current.speak(['b.mp3'], 'flap');
    });
    await act(async () => {
      // La première finit pendant que la seconde parle encore.
      first.resolve();
      await vi.advanceTimersByTimeAsync(MIN_MIME_MS * 2);
    });
    expect(result.current.speakingMood).toBe('flap');
    await act(async () => {
      second.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.speakingMood).toBeNull();
  });

  it('une voix retenue jusqu’au premier geste relance le mime quand elle part enfin', async () => {
    let start: (voice: Promise<void>) => void = () => undefined;
    const audio = createAudio((_paths, onDeferredStart) => {
      if (onDeferredStart) start = onDeferredStart;
      return Promise.resolve();
    });
    const { result } = renderHook(() => useMascotVoice(audio));

    await act(async () => {
      void result.current.speak(['a.mp3']);
      await vi.advanceTimersByTimeAsync(MIN_MIME_MS);
    });
    expect(result.current.speakingMood).toBeNull();

    const late = deferred();
    await act(async () => {
      start(late.promise);
      await vi.advanceTimersByTimeAsync(MIN_MIME_MS * 2);
    });
    expect(result.current.speakingMood).toBe('talking');
    await act(async () => {
      late.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.speakingMood).toBeNull();
  });

  it('n’appelle pas le départ différé d’une parole déjà remplacée', async () => {
    const calls: ((voice: Promise<void>) => void)[] = [];
    const audio = createAudio((_paths, onDeferredStart) => {
      if (onDeferredStart) calls.push(onDeferredStart);
      return Promise.resolve();
    });
    const { result } = renderHook(() => useMascotVoice(audio));

    await act(async () => {
      void result.current.speak(['a.mp3']);
      void result.current.speak(['b.mp3'], 'flap');
      await vi.advanceTimersByTimeAsync(MIN_MIME_MS);
    });
    const [firstStart] = calls;
    await act(async () => {
      // La première parole, remplacée, ne rallume pas le mime de la seconde.
      firstStart?.(deferred().promise);
      await Promise.resolve();
    });
    expect(result.current.speakingMood).toBeNull();
  });

  it('arrête son minuteur au démontage', async () => {
    const audio = createAudio(() => Promise.resolve());
    const { result, unmount } = renderHook(() => useMascotVoice(audio));
    await act(async () => {
      void result.current.speak(['a.mp3']);
      await Promise.resolve();
    });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
