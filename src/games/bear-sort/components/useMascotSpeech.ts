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

/** Voix d'une mascotte sur des chemins de clips, et le mime qui l'accompagne (`useMascotVoice`). */
export interface MascotVoice<Mood extends string> {
  /** Humeur tant que la mascotte parle, `null` sinon */
  speakingMood: Mood | null;
  /**
   * Dit des clips (chemins relatifs à la racine de l'export) en remplaçant la séquence en cours. La
   * promesse est résolue à la fin de la voix (son coupé : aussitôt), sans attendre la fin du mime.
   * `mood` à `null` : la voix seule, sans mime ; celui qui la fait parler anime lui-même la mascotte.
   */
  speak: (paths: readonly string[], mood: Mood | null) => Promise<void>;
  /** Fait taire la voix, celle que le navigateur retient jusqu'au premier geste comprise, et le mime */
  stop: () => void;
}

/**
 * Voix d'une mascotte et mime qui l'accompagne, partagés par Attrape-Piège et Pas si vite ! : « elle
 * parle » jusqu'à la fin de la voix, et au moins `MIN_MIME_MS`, même son coupé. Un jeton garantit
 * qu'un mime ancien ne peut pas clore un mime récent. Une voix retenue par le navigateur jusqu'au
 * premier geste relance le mime quand elle part enfin.
 */
export function useMascotVoice<Mood extends string>(audio: AudioService): MascotVoice<Mood> {
  const [speakingMood, setSpeakingMood] = useState<Mood | null>(null);
  const speechRef = useRef(0);
  const mimeRef = useRef(0);
  const mimeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Arrête le mime en cours : plus rien ne le clora, il n'y a rien à clore. */
  const endMime = useCallback(() => {
    mimeRef.current += 1;
    clearTimeout(mimeTimerRef.current);
    setSpeakingMood(null);
  }, []);

  /** Mime jusqu'à la fin de `voice`, et au moins `MIN_MIME_MS`. */
  const mimeUntil = useCallback((voice: Promise<void>, mood: Mood) => {
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
    (paths: readonly string[], mood: Mood | null) => {
      speechRef.current += 1;
      const speech = speechRef.current;
      const voice = audio.playClips(paths, (deferred) => {
        if (speechRef.current === speech && mood !== null) mimeUntil(deferred, mood);
      });
      if (mood === null) endMime();
      else mimeUntil(voice, mood);
      return voice;
    },
    [audio, endMime, mimeUntil],
  );

  const stop = useCallback(() => {
    speechRef.current += 1;
    endMime();
    audio.stopClips();
  }, [audio, endMime]);

  useEffect(
    () => () => {
      clearTimeout(mimeTimerRef.current);
    },
    [],
  );

  return { speakingMood, speak, stop };
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

/** La voix d'Attrape-Piège : ses clips par identifiant, l'humeur déduite de la règle dite. */
export function useMascotSpeech(audio: AudioService): MascotSpeech {
  const { speakingMood, speak: speakPaths } = useMascotVoice<SpeakingMood>(audio);
  const speak = useCallback(
    (clips: readonly BearSortClipId[], mood: SpeakingMood = getSpeakingMood(clips)) =>
      speakPaths(clips.map(getVoiceClipPath), mood),
    [speakPaths],
  );
  return { speakingMood, speak };
}
