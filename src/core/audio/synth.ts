import type { JingleKind, SoundBeat } from './types';

/**
 * Sons de Mia (FEAT-21), synthétisés par la Web Audio API : aucun fichier à embarquer, à licencier
 * (F-Droid) ni à pré-cacher (PWA). Sans `AudioContext` (tests, navigateur ancien), rien n'est joué :
 * le déroulé d'un jeu ne dépend jamais de ces fonctions, il reste cadencé par ses propres minuteurs.
 * Un seul son à la fois : chaque lecture remplace la précédente.
 */

/** Volume de sortie, sous la saturation quand les partiels d'une cloche s'additionnent. */
const OUTPUT_GAIN = 0.5;

/** Valeur finale des enveloppes : une rampe exponentielle ne peut pas atteindre 0. */
const SILENCE = 0.0001;

const BELL_HZ = 880;

/** Partiels inharmoniques d'une cloche : le plus aigu s'éteint le premier. */
const BELL_PARTIALS = [
  { ratio: 1, gain: 0.48, decay: 0.5 },
  { ratio: 2.76, gain: 0.2, decay: 0.32 },
  { ratio: 5.4, gain: 0.1, decay: 0.18 },
] as const;

/**
 * Tambour audible sur le haut-parleur d'un téléphone, qui ne reproduit rien sous 300 Hz environ : le
 * corps en onde triangle et un partiel de membrane restent au-dessus, le grave n'ajoute qu'une assise
 * sur un téléviseur, l'attaque de bruit filtré fait la frappe. Le niveau suit la cloche (FEAT-21 §3.4).
 */
const DRUM_TONES = [
  { type: 'triangle', fromHz: 400, toHz: 240, decay: 0.3, gain: 0.9 },
  { type: 'sine', fromHz: 620, toHz: 380, decay: 0.2, gain: 0.5 },
  { type: 'sine', fromHz: 160, toHz: 110, decay: 0.3, gain: 0.4 },
] as const;
const DRUM_SWEEP_SECONDS = 0.08;
const DRUM_ATTACK = { hz: 1500, q: 0.7, length: 0.08, gain: 0.5 } as const;

/** Volume des notes d'un jingle, au moins aussi présent qu'un temps de cloche. */
const JINGLE_GAIN = 0.7;

interface JingleNote {
  hz: number;
  /** Début de la note, en secondes après le début du jingle */
  at: number;
  /** Durée de la note, en secondes */
  length: number;
}

const JINGLES: Readonly<Record<JingleKind, readonly JingleNote[]>> = {
  round: [
    { hz: 523.25, at: 0, length: 0.2 },
    { hz: 659.25, at: 0.09, length: 0.2 },
    { hz: 783.99, at: 0.18, length: 0.35 },
  ],
  star: [
    { hz: 523.25, at: 0, length: 0.22 },
    { hz: 659.25, at: 0.12, length: 0.22 },
    { hz: 783.99, at: 0.24, length: 0.22 },
    { hz: 1046.5, at: 0.36, length: 0.8 },
  ],
};

let context: AudioContext | null = null;
let currentBus: GainNode | null = null;

/** Contexte de ces sons, créé au premier son et réveillé à chaque lecture. */
function getContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    context ??= new AudioContext();
  } catch {
    // Matériel audio indisponible, contexte refusé par le navigateur : le jeu continue en silence,
    // et le prochain son réessaiera.
    return null;
  }
  // Politique d'autoplay : suspendu tant qu'aucun geste n'a eu lieu. Un refus n'est pas une erreur,
  // le prochain geste réessaiera.
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  return context;
}

/** Nouvelle sortie de la lecture : couper la précédente suffit à faire taire ses notes. */
function startBus(ctx: AudioContext): GainNode {
  stopSounds();
  const bus = ctx.createGain();
  bus.gain.value = OUTPUT_GAIN;
  bus.connect(ctx.destination);
  currentBus = bus;
  return bus;
}

function scheduleTone(
  ctx: AudioContext,
  bus: AudioNode,
  type: OscillatorType,
  { hz, at, length, gain }: { hz: number; at: number; length: number; gain: number },
): OscillatorNode {
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(hz, at);
  envelope.gain.setValueAtTime(gain, at);
  envelope.gain.exponentialRampToValueAtTime(SILENCE, at + length);
  oscillator.connect(envelope).connect(bus);
  oscillator.start(at);
  oscillator.stop(at + length);
  return oscillator;
}

function scheduleBell(ctx: AudioContext, bus: AudioNode, at: number): void {
  for (const { ratio, gain, decay } of BELL_PARTIALS) {
    scheduleTone(ctx, bus, 'sine', { hz: BELL_HZ * ratio, at, length: decay, gain });
  }
}

function scheduleDrum(ctx: AudioContext, bus: AudioNode, at: number): void {
  for (const { type, fromHz, toHz, decay, gain } of DRUM_TONES) {
    const tone = scheduleTone(ctx, bus, type, { hz: fromHz, at, length: decay, gain });
    tone.frequency.exponentialRampToValueAtTime(toHz, at + DRUM_SWEEP_SECONDS);
  }

  const samples = Math.ceil(ctx.sampleRate * DRUM_ATTACK.length);
  const noise = ctx.createBuffer(1, samples, ctx.sampleRate);
  noise.getChannelData(0).forEach((_, index, channel) => {
    channel[index] = Math.random() * 2 - 1;
  });
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = DRUM_ATTACK.hz;
  filter.Q.value = DRUM_ATTACK.q;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(DRUM_ATTACK.gain, at);
  envelope.gain.exponentialRampToValueAtTime(SILENCE, at + DRUM_ATTACK.length);
  source.connect(filter).connect(envelope).connect(bus);
  source.start(at);
}

/** Joue une suite de temps à intervalle régulier, à partir de maintenant. */
export function playSoundBeats(beats: readonly SoundBeat[], beatMs: number): void {
  const ctx = getContext();
  if (!ctx) return;
  const bus = startBus(ctx);
  for (const [index, beat] of beats.entries()) {
    const at = ctx.currentTime + (index * beatMs) / 1000;
    if (beat === 'bell') scheduleBell(ctx, bus, at);
    else scheduleDrum(ctx, bus, at);
  }
}

/** Joue une récompense sonore, à partir de maintenant. */
export function playSoundJingle(kind: JingleKind): void {
  const ctx = getContext();
  if (!ctx) return;
  const bus = startBus(ctx);
  for (const { hz, at, length } of JINGLES[kind]) {
    scheduleTone(ctx, bus, 'triangle', { hz, at: ctx.currentTime + at, length, gain: JINGLE_GAIN });
  }
}

/** Coupe le son en cours (le contexte, lui, reste ouvert pour les lectures suivantes). */
export function stopSounds(): void {
  currentBus?.disconnect();
  currentBus = null;
}
