'use client';

import type { AudioService } from '@/core/audio';
import { MIN_MIME_MS } from '@/games/bear-sort/components/useMascotSpeech';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Humeur de la mascotte qui parle : le bec s'anime, et les ailes battent pour le leurre. */
export type SpeakingMood = 'talking' | 'flap';

export interface MascotVoice {
  /** Humeur tant que la mascotte parle, `null` sinon */
  speakingMood: SpeakingMood | null;
  /**
   * Dit des clips (chemins relatifs à la racine de l'export) en remplaçant la séquence en cours. La
   * promesse est résolue à la fin de la voix (son coupé : aussitôt), sans attendre la fin du mime.
   */
  speak: (clips: readonly string[], mood?: SpeakingMood) => Promise<void>;
}

/**
 * Voix de la mascotte et mime qui l'accompagne, comme `useMascotSpeech` d'Attrape-Piège mais sur des
 * chemins de clips : « elle parle » jusqu'à la fin de la voix, et au moins `MIN_MIME_MS`, même son
 * coupé. Un jeton garantit qu'un mime ancien ne peut pas clore un mime récent. Une voix retenue par le
 * navigateur jusqu'au premier geste relance le mime quand elle part enfin.
 */
export function useMascotVoice(audio: AudioService): MascotVoice {
  const [speakingMood, setSpeakingMood] = useState<SpeakingMood | null>(null);
  const speechRef = useRef(0);
  const mimeRef = useRef(0);
  const mimeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Mime jusqu'à la fin de `voice`, et au moins `MIN_MIME_MS`. */
  const mimeUntil = useCallback((voice: Promise<void>, mood: SpeakingMood) => {
    mimeRef.current += 1;
    const mime = mimeRef.current;
    setSpeakingMood(mood);
    clearTimeout(mimeTimerRef.current);
    const minimum = new Promise((resolve) => {
      mimeTimerRef.current = setTimeout(resolve, MIN_MIME_MS);
    });
    void Promise.all([voice, minimum]).then(() => {
      if (mimeRef.current === mime) setSpeakingMood(null);
    });
  }, []);

  const speak = useCallback(
    (clips: readonly string[], mood: SpeakingMood = 'talking') => {
      speechRef.current += 1;
      const speech = speechRef.current;
      const voice = audio.playClips(clips, (deferred) => {
        if (speechRef.current === speech) mimeUntil(deferred, mood);
      });
      mimeUntil(voice, mood);
      return voice;
    },
    [audio, mimeUntil],
  );

  useEffect(
    () => () => {
      clearTimeout(mimeTimerRef.current);
    },
    [],
  );

  return { speakingMood, speak };
}
