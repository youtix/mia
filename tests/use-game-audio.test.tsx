import { useGameAudio, type AudioService } from '@/core/audio';
import type * as AudioServiceModule from '@/core/audio/audio-service';
import type * as MiaStorage from '@/core/storage';
import type { StorageContextValue } from '@/core/storage';
import { render, renderHook } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Réglage « Son » vu par le hook, à la place du `StorageProvider` réel qui charge la sauvegarde. */
const storage = vi.hoisted(() => ({ soundEnabled: true }));

/** Service partagé simulé : le hook ne doit dépendre que de son contrat. */
const audio = vi.hoisted(() => ({
  service: {
    setEnabled: vi.fn(),
    preloadClips: vi.fn(() => Promise.resolve()),
    playClips: vi.fn(() => Promise.resolve()),
    stopClips: vi.fn(),
    playEffect: vi.fn(),
  },
  getAudioService: vi.fn(),
}));

vi.mock('@/core/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof MiaStorage>();
  // Nouvel objet de contexte à chaque rendu : le hook ne doit pas dépendre de son identité.
  const useMiaStorage = (): Pick<StorageContextValue, 'state'> => ({
    state: {
      ...actual.createDefaultSaveState(),
      settings: { ...actual.DEFAULT_DEVICE_SETTINGS, soundEnabled: storage.soundEnabled },
    },
  });
  return { ...actual, useMiaStorage };
});

vi.mock('@/core/audio/audio-service', async (importOriginal) => {
  const actual = await importOriginal<typeof AudioServiceModule>();
  return { ...actual, getAudioService: audio.getAudioService };
});

const { service } = audio;

beforeEach(() => {
  // Avant chaque test, pas après : le démontage automatique du test précédent coupe le son.
  vi.resetAllMocks();
  storage.soundEnabled = true;
  audio.getAudioService.mockReturnValue(service satisfies AudioService);
});

describe('useGameAudio', () => {
  it('renvoie le service partagé, le même d’un rendu à l’autre', () => {
    const { result, rerender } = renderHook(() => useGameAudio());
    const first = result.current;

    rerender();

    expect(first).toBe(service);
    expect(result.current).toBe(first);
    expect(audio.getAudioService).toHaveBeenCalledOnce();
  });

  it.each([true, false])('applique le réglage « Son » au montage (%s)', (soundEnabled) => {
    storage.soundEnabled = soundEnabled;

    renderHook(() => useGameAudio());

    expect(service.setEnabled.mock.calls).toEqual([[soundEnabled]]);
  });

  it('suit le réglage « Son » quand il change, dans les deux sens', () => {
    const { rerender } = renderHook(() => useGameAudio());

    storage.soundEnabled = false;
    rerender();
    expect(service.setEnabled).toHaveBeenLastCalledWith(false);

    storage.soundEnabled = true;
    rerender();
    expect(service.setEnabled).toHaveBeenLastCalledWith(true);
  });

  it('n’applique pas de nouveau un réglage inchangé', () => {
    const { rerender } = renderHook(() => useGameAudio());

    rerender();
    rerender();

    expect(service.setEnabled).toHaveBeenCalledOnce();
  });

  it('applique le réglage avant la première voix de l’écran', () => {
    function Screen() {
      const gameAudio = useGameAudio();
      useEffect(() => {
        void gameAudio.playClips(['un.mp3']);
      }, [gameAudio]);
      return null;
    }

    render(<Screen />);

    expect(service.playClips).toHaveBeenCalledOnce();
    expect(service.setEnabled).toHaveBeenCalledBefore(service.playClips);
  });

  it('coupe le son quand l’écran disparaît, pas à chaque rendu', () => {
    const { rerender, unmount } = renderHook(() => useGameAudio());

    rerender();
    expect(service.setEnabled.mock.calls).toEqual([[true]]);

    unmount();
    expect(service.setEnabled.mock.calls).toEqual([[true], [false]]);
  });

  it('rend le son à l’écran suivant, selon le réglage', () => {
    const { unmount } = renderHook(() => useGameAudio());
    unmount();

    renderHook(() => useGameAudio());

    expect(service.setEnabled).toHaveBeenLastCalledWith(true);
  });
});
