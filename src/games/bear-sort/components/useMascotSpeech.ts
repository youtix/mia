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
  /** Coupe la voix et le mime */
  stopSpeaking: () => void;
}

/**
 * Voix de la mascotte et mime qui l'accompagne : « elle parle » jusqu'à la fin de la voix, et au
 * moins `MIN_MIME_MS`. Un jeton garantit qu'une parole ancienne ne peut pas clore une parole récente.
 */
export function useMascotSpeech(audio: AudioService): MascotSpeech {
  const [speakingMood, setSpeakingMood] = useState<SpeakingMood | null>(null);
  const speechRef = useRef(0);
  const mimeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const speak = useCallback(
    (clips: readonly BearSortClipId[], mood = getSpeakingMood(clips)) => {
      speechRef.current += 1;
      const speech = speechRef.current;
      setSpeakingMood(mood);
      clearTimeout(mimeTimerRef.current);
      const mime = new Promise((resolve) => {
        mimeTimerRef.current = setTimeout(resolve, MIN_MIME_MS);
      });
      const voice = audio.playClips(clips.map(getVoiceClipPath));
      void Promise.all([voice, mime]).then(() => {
        if (speechRef.current === speech) setSpeakingMood(null);
      });
      return voice;
    },
    [audio],
  );

  const stopSpeaking = useCallback(() => {
    speechRef.current += 1;
    clearTimeout(mimeTimerRef.current);
    setSpeakingMood(null);
    audio.stopClips();
  }, [audio]);

  useEffect(
    () => () => {
      clearTimeout(mimeTimerRef.current);
    },
    [],
  );

  return { speakingMood, speak, stopSpeaking };
}
