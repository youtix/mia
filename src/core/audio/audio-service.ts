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
  // Le grave porte le rebond sur un téléviseur ou un casque ; l'octave, sur un haut-parleur de
  // téléphone, qui ne rend presque rien sous 400 Hz.
  bounce: [
    { type: 'sine', frequency: 300, endFrequency: 170, start: 0, duration: 0.24 },
    { type: 'sine', frequency: 600, endFrequency: 340, start: 0, duration: 0.24 },
  ],
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

/**
 * Sortie audio qui vient de s'ouvrir (contexte créé ou repris) : un téléviseur (HDMI) ou un casque
 * Bluetooth peut mettre un instant à la rouvrir, et couper les premiers mots. La voix ne part donc
 * qu'à ce délai du réveil.
 */
const WAKE_LEAD_SECONDS = 0.3;

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

/** Arrête une source tout de suite, y compris une note dont le début est encore à venir. */
function stopSource(source: AudioScheduledSourceNode): void {
  try {
    source.stop();
  } catch {
    // Déjà terminé : rien à arrêter.
  }
}

function playEffectNotes(
  context: AudioContext,
  notes: readonly EffectNote[],
  playing: Set<OscillatorNode>,
): void {
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
    playing.add(oscillator);
    oscillator.onended = () => {
      playing.delete(oscillator);
    };
  }
}

/** Séquence retenue jusqu'au premier geste, et qui l'attend pour savoir quand elle part enfin. */
interface PendingSequence {
  paths: readonly string[];
  onDeferredStart?: (voice: Promise<void>) => void;
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
  let pending: PendingSequence | null = null;
  /** `suspend()` demandé : `state` peut encore dire `running`, le temps que le navigateur suspende. */
  let isSuspendRequested = false;
  /** Dernier réveil de la sortie audio (`performance.now()`). */
  let wokeAt = Number.NEGATIVE_INFINITY;
  /** Notes d'effet pas encore finies, certaines encore à venir. */
  const effectNotes = new Set<OscillatorNode>();
  const buffers = new Map<string, Promise<AudioBuffer | null>>();

  function stopClips(): void {
    sequence += 1;
    pending = null;
    stopCurrentClip?.();
  }

  function isAwake(audio: AudioContext): boolean {
    return isRunning(audio) && !isSuspendRequested;
  }

  function wakeContext(audio: AudioContext): Promise<void> {
    isSuspendRequested = false;
    return audio.resume().catch(ignoreRejection);
  }

  /**
   * Libère la sortie audio (batterie, HDMI, Bluetooth). Les effets s'arrêtent d'abord : `suspend()`
   * figerait leurs notes, dont la fin partirait à la reprise, sur le début de la voix suivante.
   */
  function releaseContext(audio: AudioContext): void {
    for (const note of effectNotes) stopSource(note);
    effectNotes.clear();
    isSuspendRequested = true;
    void audio.suspend().catch(ignoreRejection);
  }

  function listenToPage(audio: AudioContext): void {
    const playPending = () => {
      const waiting = pending;
      if (!waiting || !isRunning(audio)) return;
      const { paths, onDeferredStart } = waiting;
      const voice = playClips(paths, onDeferredStart);
      onDeferredStart?.(voice);
    };
    const unlock = () => {
      if (!isEnabled || isAwake(audio)) return;
      void wakeContext(audio);
    };
    for (const type of UNLOCK_EVENTS) {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    }
    // Après un geste, ou tout seul après le délai laissé à `resume()` : la voix en attente part alors.
    audio.onstatechange = () => {
      if (audio.state === 'running') wokeAt = performance.now();
      playPending();
    };
    // Application en arrière-plan : la voix se tait et sa promesse est résolue, le jeu n'attend pas
    // un clip que personne n'entend (le système peut aussi suspendre le contexte sans `ended`).
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopClips();
        releaseContext(audio);
      } else if (isEnabled) {
        void wakeContext(audio);
      }
    });
  }

  function getContext(): AudioContext | null {
    if (context) return context;
    context = createContext();
    if (context) {
      wokeAt = performance.now();
      listenToPage(context);
    }
    return context;
  }

  function loadBuffer(audio: AudioContext, path: string): Promise<AudioBuffer | null> {
    const cached = buffers.get(path);
    if (cached) return cached;
    const loading = fetchClip(resolveAudioUrl(path))
      .then((data) => audio.decodeAudioData(data))
      .then(
        (buffer) => {
          // Y compris après le délai de `waitForBuffer`, qui l'avait retiré du cache.
          buffers.set(path, Promise.resolve(buffer));
          return buffer;
        },
        () => {
          // Réessayé au prochain appel : le réseau peut revenir avant que le cache ne soit prêt.
          buffers.delete(path);
          return null;
        },
      );
    buffers.set(path, loading);
    return loading;
  }

  /**
   * Attend un clip. Ni un arrêt, ni un réseau qui ne répond plus n'attendent son chargement, qui
   * finira quand même dans le cache : un jeu peut suspendre sa suite à la fin de la voix (panneau STOP).
   * Passé le délai, le prochain appel réessaie aussi : ce chargement ne répondra peut-être jamais.
   */
  function waitForBuffer(audio: AudioContext, path: string): Promise<AudioBuffer | null> {
    return new Promise((resolve) => {
      const finish = (buffer: AudioBuffer | null) => {
        clearTimeout(timer);
        resolve(buffer);
      };
      const timer = setTimeout(() => {
        buffers.delete(path);
        finish(null);
      }, CLIP_LOAD_TIMEOUT_MS);
      stopCurrentClip = () => {
        finish(null);
      };
      void loadBuffer(audio, path).then(finish);
    });
  }

  function playBuffer(audio: AudioContext, buffer: AudioBuffer): Promise<void> {
    const leadSeconds = Math.max(0, WAKE_LEAD_SECONDS - (performance.now() - wokeAt) / 1000);
    return new Promise((resolve) => {
      const source = audio.createBufferSource();
      const finish = () => {
        clearTimeout(safetyTimer);
        source.onended = null;
        stopCurrentClip = null;
        resolve();
      };
      const stop = () => {
        stopSource(source);
        finish();
      };
      // La source s'arrête aussi : si le système a suspendu le contexte, `ended` ne viendra pas et
      // elle repartirait à la reprise, par-dessus le clip suivant.
      const safetyTimer = setTimeout(
        stop,
        (buffer.duration + leadSeconds) * 1000 + CLIP_END_MARGIN_MS,
      );
      source.buffer = buffer;
      source.connect(audio.destination);
      source.onended = finish;
      stopCurrentClip = stop;
      if (leadSeconds > 0) source.start(audio.currentTime + leadSeconds);
      else source.start();
    });
  }

  async function ensureRunning(audio: AudioContext): Promise<boolean> {
    if (isAwake(audio)) return true;
    await Promise.race([wakeContext(audio), delay(RESUME_TIMEOUT_MS)]);
    return isRunning(audio);
  }

  async function playClips(
    paths: readonly string[],
    onDeferredStart?: PendingSequence['onDeferredStart'],
  ): Promise<void> {
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
      pending = { paths, onDeferredStart };
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
      // Rien ne joue : la sortie audio reste libérée jusqu'à la voix suivante.
      if (context) releaseContext(context);
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
      if (!isEnabled || document.hidden) return;
      const audio = getContext();
      if (audio && isAwake(audio)) playEffectNotes(audio, EFFECTS[effect], effectNotes);
    },
  };
}

let sharedService: AudioService | null = null;

/** Service unique de l'application : le navigateur limite le nombre de contextes audio. */
export function getAudioService(): AudioService {
  sharedService ??= createAudioService();
  return sharedService;
}
