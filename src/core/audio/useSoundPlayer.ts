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
  /** Coupe le son en cours ; la sortie audio reste ouverte pour la suite de l'écran */
  stop: () => void;
}

/**
 * Lecteur de sons d'un écran : suit le réglage de l'appareil. Son coupé ou page masquée, il se tait et
 * libère aussitôt la sortie audio, comme le service audio (FEAT-22 §4) ; écran démonté, il se tait et la
 * libère si rien ne sonne dans les 3 s : le niveau suivant ne réveille pas une sortie à peine endormie.
 */
export function useSoundPlayer(): SoundPlayer {
  const { state } = useMiaStorage();
  const isEnabled = state.settings.soundEnabled;

  useEffect(() => {
    if (!isEnabled) stopSounds();
  }, [isEnabled]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) stopSounds();
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => {
      document.removeEventListener('visibilitychange', stopWhenHidden);
      stopSounds('soon');
    };
  }, []);

  return useMemo(
    () => ({
      isEnabled,
      playBeats: (beats, beatMs) => {
        if (isEnabled) playSoundBeats(beats, beatMs);
      },
      playJingle: (kind) => {
        if (isEnabled) playSoundJingle(kind);
      },
      stop: () => {
        stopSounds('keep');
      },
    }),
    [isEnabled],
  );
}
