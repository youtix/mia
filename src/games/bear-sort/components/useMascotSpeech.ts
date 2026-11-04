'use client';

import type { AudioService } from '@/core/audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getVoiceClipPath, type BearSortClipId } from '../voice-script';

/**
 * Durée minimale du mime de la mascotte : elle parle à l'écran même son coupé, où `playClips` est
 * résolue aussitôt (l'image de la règle porte alors seule la consigne).
 */
export const MIN_MIME_MS = 2000;

/** Humeur de la mascotte qui parle : `no` (la tête dit non) quand elle annonce une règle « sauf ». */
export type SpeakingMood = 'talking' | 'no';

function getSpeakingMood(clips: readonly BearSortClipId[]): SpeakingMood {
  return clips.some((clip) => clip.startsWith('rule-except')) ? 'no' : 'talking';
}

export interface MascotSpeech {
  /** Humeur tant que la mascotte parle, `null` sinon */
  speakingMood: SpeakingMood | null;
  /**
   * Joue une séquence de clips en remplaçant la précédente. La promesse est résolue à la fin de la
   * voix (son coupé : aussitôt), sans attendre la fin du mime. `mood` remplace l'humeur déduite des
   * clips : la même règle « sauf », rappelée après un rebond, ne doit pas faire dire non à la tête.
   */
  speak: (clips: readonly BearSortClipId[], mood?: SpeakingMood) => Promise<void>;
}

/**
 * Voix de la mascotte et mime qui l'accompagne : « elle parle » jusqu'à la fin de la voix, et au
 * moins `MIN_MIME_MS`. Un jeton garantit qu'un mime ancien ne peut pas clore un mime récent. Une voix
 * retenue par le navigateur jusqu'au premier geste relance le mime quand elle part enfin.
 */
export function useMascotSpeech(audio: AudioService): MascotSpeech {
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
    (clips: readonly BearSortClipId[], mood = getSpeakingMood(clips)) => {
      speechRef.current += 1;
      const speech = speechRef.current;
      const voice = audio.playClips(clips.map(getVoiceClipPath), (deferred) => {
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
