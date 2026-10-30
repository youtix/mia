'use client';

import { useMiaStorage } from '@/core/storage';
import { useEffect, useState } from 'react';
import { getAudioService } from './audio-service';
import type { AudioService } from './types';

/**
 * Service audio d'un écran de jeu : suit le réglage « Son », et coupe le son quand l'écran disparaît
 * (voix interrompue, sortie audio libérée, jusqu'au prochain écran de jeu).
 * À appeler avant les effets qui jouent un son : ses propres effets passent les premiers, le réglage
 * est donc appliqué avant la première voix.
 */
export function useGameAudio(): AudioService {
  const { soundEnabled } = useMiaStorage().state.settings;
  const [service] = useState(getAudioService);

  useEffect(() => {
    service.setEnabled(soundEnabled);
    return () => {
      service.setEnabled(false);
    };
  }, [service, soundEnabled]);

  return service;
}
