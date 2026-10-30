'use client';

import { useMiaStorage } from '@/core/storage';
import { useEffect, useMemo } from 'react';
import { playSoundBeats, playSoundJingle, stopSounds } from './synth';
import type { JingleKind, SoundBeat } from './types';

export interface SoundPlayer {
  /** Réglage « Son » de l'appareil (FEAT-18) : coupé, un jeu remplace les sons par des images */
  isEnabled: boolean;
  /** Joue une suite de temps à intervalle régulier ; sans effet si le son est coupé */
  playBeats: (beats: readonly SoundBeat[], beatMs: number) => void;
  /** Joue une récompense sonore ; sans effet si le son est coupé */
  playJingle: (kind: JingleKind) => void;
  /** Coupe le son en cours */
  stop: () => void;
}

/** Lecteur de sons d'un écran : suit le réglage de l'appareil et se tait au démontage. */
export function useSoundPlayer(): SoundPlayer {
  const { state } = useMiaStorage();
  const isEnabled = state.settings.soundEnabled;

  useEffect(() => stopSounds, []);

  return useMemo(
    () => ({
      isEnabled,
      playBeats: (beats, beatMs) => {
        if (isEnabled) playSoundBeats(beats, beatMs);
      },
      playJingle: (kind) => {
        if (isEnabled) playSoundJingle(kind);
      },
      stop: stopSounds,
    }),
    [isEnabled],
  );
}
