import type { AudioService, SoundEffect } from './types';

/**
 * Service audio (FEAT-22), sans React : une seule `AudioContext` pour la voix (fichiers) et les
 * effets (synthétisés). Elle se débloque au premier geste, puis joue sans autre geste, ce qu'un
 * élément `<audio>` ne garantit pas sur iOS. Les fichiers passent par `fetch` : le service worker
 * les sert hors-ligne (FEAT-17) et ils sont locaux dans l'APK. La synthèse de Suites Logiques (`synth.ts`,
 * FEAT-21) garde son propre contexte : un seul écran de jeu est monté à la fois, ils ne jouent pas ensemble.
 */

/** Note d'un effet : glissando si `endFrequency`, `start` et `duration` en secondes. */
interface EffectNote {
  type: OscillatorType;
  frequency: number;
  endFrequency?: number;
  start: number;
  duration: number;
}

/** Effets doux et brefs : le rebond ne doit surtout pas sonner comme une sanction. */
const EFFECTS: Readonly<Record<SoundEffect, readonly EffectNote[]>> = {
  success: [
    { type: 'sine', frequency: 659, start: 0, duration: 0.12 },
    { type: 'sine', frequency: 880, start: 0.09, duration: 0.2 },
  ],
  bounce: [{ type: 'sine', frequency: 300, endFrequency: 170, start: 0, duration: 0.24 }],
  stop: [
    { type: 'triangle', frequency: 523, start: 0, duration: 0.18 },
    { type: 'triangle', frequency: 392, start: 0.2, duration: 0.3 },
  ],
  victory: [
    { type: 'sine', frequency: 523, start: 0, duration: 0.14 },
    { type: 'sine', frequency: 659, start: 0.12, duration: 0.14 },
    { type: 'sine', frequency: 784, start: 0.24, duration: 0.14 },
    { type: 'sine', frequency: 1047, start: 0.36, duration: 0.32 },
  ],
};

const EFFECT_PEAK_GAIN = 0.18;

/** Une rampe exponentielle ne peut ni partir de 0, ni y arriver. */
const SILENT_GAIN = 0.0001;

const EFFECT_ATTACK_SECONDS = 0.015;

/** Temps laissé à `resume()` : sans geste préalable, sa promesse peut ne jamais se résoudre. */
const RESUME_TIMEOUT_MS = 150;

/** Filet de sécurité d'une fin de clip : certains WebView perdent l'évènement `ended`. */
const CLIP_END_MARGIN_MS = 500;

/** Clip toujours pas chargé après ce délai : il est sauté, le jeu n'attend pas un réseau mort. */
const CLIP_LOAD_TIMEOUT_MS = 4000;

/**
 * Gestes qui débloquent le son. Au doigt, `pointerdown` n'active pas la page : il faut attendre
 * `pointerup` ou `touchend` (HTML, « activation triggering input event »).
 */
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;

export interface AudioServiceOptions {
  /** Crée le contexte audio (tests) ; `null` : aucun son possible */
  createContext?: () => AudioContext | null;
  /** Lit un fichier audio (tests) */
  fetchClip?: (url: string) => Promise<ArrayBuffer>;
}

function createBrowserContext(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  try {
    return new AudioContext();
  } catch {
    // Trop de contextes, ou aucune sortie audio sur le boîtier TV : le jeu reste jouable sans son.
    return null;
  }
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Clip audio introuvable : ${url}`);
  return response.arrayBuffer();
}

/** URL d'un fichier de `public/`. `NEXT_PUBLIC_BASE_PATH` est lu à l'appel, pour rester testable. */
export function resolveAudioUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/${path}`;
}

function isRunning(context: AudioContext): boolean {
  return context.state === 'running';
}

function ignoreRejection(): void {
  // `resume()` et `suspend()` échouent sur un contexte fermé : il n'y a alors rien à faire.
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function playEffectNotes(context: AudioContext, notes: readonly EffectNote[]): void {
  const now = context.currentTime;
  for (const note of notes) {
    const start = now + note.start;
    const end = start + note.duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, start);
    if (note.endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(note.endFrequency, end);
    }
    gain.gain.setValueAtTime(SILENT_GAIN, start);
    gain.gain.exponentialRampToValueAtTime(EFFECT_PEAK_GAIN, start + EFFECT_ATTACK_SECONDS);
    gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, end);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end);
  }
}

export function createAudioService({
  createContext = createBrowserContext,
  fetchClip = fetchArrayBuffer,
}: AudioServiceOptions = {}): AudioService {
  let isEnabled = true;
  let context: AudioContext | null = null;
  /** Numéro de la séquence en cours : toute nouvelle séquence, ou un arrêt, invalide la précédente. */
  let sequence = 0;
  /** Interrompt le clip en cours de lecture, ou l'attente de son chargement. */
  let stopCurrentClip: (() => void) | null = null;
  /** Séquence bloquée par le navigateur : elle part au premier geste, si rien ne l'a remplacée. */
  let pending: readonly string[] | null = null;
  /** Son coupé après coup : `state` peut encore dire `running`, le temps que le navigateur suspende. */
  let isSuspendRequested = false;
  const buffers = new Map<string, Promise<AudioBuffer | null>>();

  function stopClips(): void {
    sequence += 1;
    pending = null;
    stopCurrentClip?.();
  }

  function listenToPage(audio: AudioContext): void {
    const playPending = () => {
      const waiting = pending;
      if (waiting && isRunning(audio)) void playClips(waiting);
    };
    const unlock = () => {
      if (!isEnabled || isRunning(audio)) return;
      void audio.resume().then(playPending, ignoreRejection);
    };
    for (const type of UNLOCK_EVENTS) {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    }
    // Le contexte peut démarrer après le délai laissé à `resume()`, sans geste de plus à attendre.
    audio.onstatechange = playPending;
    // Application en arrière-plan : la voix se tait et sa promesse est résolue, le jeu n'attend pas
    // un clip que personne n'entend (le système peut aussi suspendre le contexte sans `ended`).
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopClips();
        void audio.suspend().catch(ignoreRejection);
      } else if (isEnabled) {
        void audio.resume().catch(ignoreRejection);
      }
    });
  }

  function getContext(): AudioContext | null {
    if (context) return context;
    context = createContext();
    if (context) listenToPage(context);
    return context;
  }

  function loadBuffer(audio: AudioContext, path: string): Promise<AudioBuffer | null> {
    const cached = buffers.get(path);
    if (cached) return cached;
    const loading = fetchClip(resolveAudioUrl(path))
      .then((data) => audio.decodeAudioData(data))
      .catch(() => {
        // Réessayé au prochain appel : le réseau peut revenir avant que le cache ne soit prêt.
        buffers.delete(path);
        return null;
      });
    buffers.set(path, loading);
    return loading;
  }

  /**
   * Attend un clip. Ni un arrêt, ni un réseau qui ne répond plus n'attendent son chargement, qui
   * finira quand même dans le cache : un jeu peut suspendre sa suite à la fin de la voix (panneau STOP).
   */
  function waitForBuffer(audio: AudioContext, path: string): Promise<AudioBuffer | null> {
    return new Promise((resolve) => {
      const finish = (buffer: AudioBuffer | null) => {
        clearTimeout(timer);
        resolve(buffer);
      };
      const timer = setTimeout(finish, CLIP_LOAD_TIMEOUT_MS, null);
      stopCurrentClip = () => {
        finish(null);
      };
      void loadBuffer(audio, path).then(finish);
    });
  }

  function playBuffer(audio: AudioContext, buffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const source = audio.createBufferSource();
      const finish = () => {
        clearTimeout(safetyTimer);
        source.onended = null;
        stopCurrentClip = null;
        resolve();
      };
      const safetyTimer = setTimeout(finish, buffer.duration * 1000 + CLIP_END_MARGIN_MS);
      source.buffer = buffer;
      source.connect(audio.destination);
      source.onended = finish;
      stopCurrentClip = () => {
        source.onended = null;
        try {
          source.stop();
        } catch {
          // Déjà terminé : rien à arrêter.
        }
        finish();
      };
      source.start();
    });
  }

  async function ensureRunning(audio: AudioContext): Promise<boolean> {
    if (isRunning(audio) && !isSuspendRequested) return true;
    isSuspendRequested = false;
    await Promise.race([audio.resume().catch(ignoreRejection), delay(RESUME_TIMEOUT_MS)]);
    return isRunning(audio);
  }

  async function playClips(paths: readonly string[]): Promise<void> {
    stopClips();
    if (!isEnabled || paths.length === 0) return;
    const audio = getContext();
    // En arrière-plan, le jeu peut enchaîner dès que `stopClips` a résolu la phrase précédente :
    // réveiller le contexte ferait parler l'application alors que personne ne l'écoute.
    if (!audio || document.hidden) return;
    const current = sequence;
    const isAudible = await ensureRunning(audio);
    if (current !== sequence) return;
    if (!isAudible) {
      pending = paths;
      return;
    }
    for (const path of paths) {
      const buffer = await waitForBuffer(audio, path);
      if (current !== sequence) return;
      if (buffer) await playBuffer(audio, buffer);
      if (current !== sequence) return;
    }
  }

  return {
    setEnabled: (enabled) => {
      isEnabled = enabled;
      if (enabled) return;
      stopClips();
      // Rien ne joue : la sortie audio est libérée (batterie, HDMI, Bluetooth) jusqu'à la voix suivante.
      if (context) {
        isSuspendRequested = true;
        void context.suspend().catch(ignoreRejection);
      }
    },
    preloadClips: async (paths) => {
      if (!isEnabled) return;
      const audio = getContext();
      if (!audio) return;
      await Promise.all(paths.map((path) => loadBuffer(audio, path)));
    },
    playClips,
    stopClips,
    playEffect: (effect) => {
      if (!isEnabled) return;
      const audio = getContext();
      if (audio && isRunning(audio)) playEffectNotes(audio, EFFECTS[effect]);
    },
  };
}

let sharedService: AudioService | null = null;

/** Service unique de l'application : le navigateur limite le nombre de contextes audio. */
export function getAudioService(): AudioService {
  sharedService ??= createAudioService();
  return sharedService;
}
