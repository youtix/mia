import { createAudioService, getAudioService, resolveAudioUrl } from '@/core/audio/audio-service';
import type { SoundEffect } from '@/core/audio/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Temps laissé à `resume()` avant de considérer le son bloqué (`RESUME_TIMEOUT_MS`). */
const RESUME_TIMEOUT_MS = 150;

/** Marge du filet de sécurité après la durée d'un clip (`CLIP_END_MARGIN_MS`). */
const CLIP_END_MARGIN_MS = 500;

/** Délai après lequel un clip toujours pas chargé est sauté (`CLIP_LOAD_TIMEOUT_MS`). */
const CLIP_LOAD_TIMEOUT_MS = 4000;

/** Gain de crête des effets (`EFFECT_PEAK_GAIN`) : doux, surtout pour le rebond. */
const EFFECT_PEAK_GAIN = 0.18;

/** Tampon décodé : garde l'URL du fichier, pour vérifier ce qui est joué. */
interface FakeBuffer {
  duration: number;
  url: string;
}

class FakeParam {
  readonly setValueAtTime = vi.fn<(value: number, time: number) => void>();
  readonly exponentialRampToValueAtTime = vi.fn<(value: number, time: number) => void>();
}

class FakeOscillator {
  type = '';
  readonly frequency = new FakeParam();
  readonly connect = vi.fn<(target: unknown) => void>();
  readonly start = vi.fn<(when: number) => void>();
  readonly stop = vi.fn<(when: number) => void>();
}

class FakeGain {
  readonly gain = new FakeParam();
  readonly connect = vi.fn<(target: unknown) => void>();
}

class FakeSource {
  buffer: FakeBuffer | null = null;
  onended: (() => void) | null = null;
  readonly connect = vi.fn<(target: unknown) => void>();
  readonly start = vi.fn<() => void>();
  readonly stop = vi.fn<() => void>();

  /** Fin de lecture, telle que le navigateur la signale. */
  end(): void {
    this.onended?.();
  }
}

class FakeAudioContext {
  state: AudioContextState;
  /** Politique d'autoplay : tant qu'elle bloque, `resume()` n'a aucun effet */
  isBlocked = false;
  /** Durée des clips décodés, en secondes */
  clipSeconds = 1;
  onstatechange: (() => void) | null = null;
  readonly currentTime = 10;
  readonly destination = { name: 'haut-parleurs' };
  readonly sources: FakeSource[] = [];
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGain[] = [];

  readonly resume = vi.fn((): Promise<void> => {
    if (!this.isBlocked) this.state = 'running';
    return Promise.resolve();
  });

  readonly suspend = vi.fn((): Promise<void> => {
    this.state = 'suspended';
    return Promise.resolve();
  });

  readonly decodeAudioData = vi.fn((data: ArrayBuffer): Promise<FakeBuffer> =>
    Promise.resolve({ duration: this.clipSeconds, url: new TextDecoder().decode(data) }),
  );

  readonly createBufferSource = vi.fn((): FakeSource => {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  });

  readonly createOscillator = vi.fn((): FakeOscillator => {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  });

  readonly createGain = vi.fn((): FakeGain => {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  });

  constructor(state: AudioContextState) {
    this.state = state;
  }

  /** Le navigateur démarre le contexte de lui-même, après coup. */
  startByItself(): void {
    this.isBlocked = false;
    this.state = 'running';
    this.onstatechange?.();
  }

  lastSource(): FakeSource {
    const source = this.sources.at(-1);
    if (!source) throw new Error('aucun clip en lecture');
    return source;
  }

  /** URL des clips lancés, dans l'ordre. */
  played(): (string | undefined)[] {
    return this.sources.map((source) => source.buffer?.url);
  }
}

/** Contenu d'un fichier simulé : son URL, que `decodeAudioData` retrouve. */
function encodeFile(url: string): ArrayBuffer {
  return new TextEncoder().encode(url).buffer;
}

function setup(state: AudioContextState = 'running') {
  const context = new FakeAudioContext(state);
  const createContext = vi.fn(() => context as unknown as AudioContext);
  const fetchClip = vi.fn((url: string) => Promise.resolve(encodeFile(url)));
  const service = createAudioService({ createContext, fetchClip });
  return { context, createContext, fetchClip, service };
}

/** Service dont le contexte attend un geste : `resume()` répond sans rien débloquer. */
function setupBlocked() {
  const harness = setup('suspended');
  harness.context.isBlocked = true;
  return harness;
}

/** Suit une promesse sans l'attendre. */
function track(promise: Promise<void>): { settled: boolean } {
  const run = { settled: false };
  void promise.then(() => {
    run.settled = true;
  });
  return run;
}

/** Laisse s'écouler les promesses en attente, sans faire avancer le temps. */
const flush = () => vi.advanceTimersByTimeAsync(0);

/** Lève le blocage d'autoplay et émet le geste de l'utilisateur, comme un navigateur. */
function gesture(context: FakeAudioContext, type = 'pointerdown'): void {
  context.isBlocked = false;
  window.dispatchEvent(new Event(type));
}

function setPageHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

function spyOnListeners(target: EventTarget) {
  return vi.spyOn(target, 'addEventListener');
}

/** Retire les écouteurs posés pendant un test : les services des tests précédents restent muets. */
function removeListeners(target: EventTarget, spy: ReturnType<typeof spyOnListeners>): void {
  for (const [type, listener, options] of spy.mock.calls) {
    if (listener) target.removeEventListener(type, listener, options);
  }
}

let windowListeners: ReturnType<typeof spyOnListeners>;
let documentListeners: ReturnType<typeof spyOnListeners>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('NEXT_PUBLIC_BASE_PATH', undefined);
  windowListeners = spyOnListeners(window);
  documentListeners = spyOnListeners(document);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  removeListeners(window, windowListeners);
  removeListeners(document, documentListeners);
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'hidden');
});

describe('Lecture d’une séquence', () => {
  it('joue les clips dans l’ordre et résout la promesse à la fin', async () => {
    const { context, fetchClip, service } = setup();

    const run = track(service.playClips(['un.mp3', 'deux.mp3']));
    await flush();

    expect(context.played()).toEqual(['/un.mp3']);
    expect(fetchClip.mock.calls).toEqual([['/un.mp3']]);
    expect(context.lastSource().connect).toHaveBeenCalledWith(context.destination);
    expect(context.lastSource().start).toHaveBeenCalledOnce();
    expect(run.settled).toBe(false);

    context.lastSource().end();
    await flush();

    expect(context.played()).toEqual(['/un.mp3', '/deux.mp3']);
    expect(fetchClip.mock.calls).toEqual([['/un.mp3'], ['/deux.mp3']]);
    expect(run.settled).toBe(false);

    context.lastSource().end();
    await flush();

    expect(run.settled).toBe(true);
    expect(context.sources).toHaveLength(2);
  });

  it('crée un seul contexte, à la première lecture', async () => {
    const { createContext, service } = setup();

    expect(createContext).not.toHaveBeenCalled();
    void service.playClips(['un.mp3']);
    await flush();
    void service.playClips(['deux.mp3']);
    await flush();

    expect(createContext).toHaveBeenCalledOnce();
  });

  it('remplace la séquence en cours : elle se tait et ses clips restants sont oubliés', async () => {
    const { context, service } = setup();
    const first = track(service.playClips(['un.mp3', 'deux.mp3']));
    await flush();
    const interrupted = context.lastSource();

    const second = track(service.playClips(['trois.mp3']));
    await flush();

    expect(interrupted.stop).toHaveBeenCalledOnce();
    expect(first.settled).toBe(true);
    expect(second.settled).toBe(false);
    expect(context.played()).toEqual(['/un.mp3', '/trois.mp3']);

    context.lastSource().end();
    await flush();

    expect(second.settled).toBe(true);
    expect(context.played()).toEqual(['/un.mp3', '/trois.mp3']);
  });

  it('ignore la fin tardive d’un clip remplacé', async () => {
    const { context, service } = setup();
    void service.playClips(['un.mp3']);
    await flush();
    const interrupted = context.lastSource();

    const second = track(service.playClips(['deux.mp3']));
    await flush();
    interrupted.end();
    await flush();

    expect(interrupted.onended).toBeNull();
    expect(second.settled).toBe(false);
  });

  it('résout aussitôt une séquence vide, qui fait aussi taire la voix en cours', async () => {
    const { context, createContext, service } = setup();

    await expect(service.playClips([])).resolves.toBeUndefined();
    expect(createContext).not.toHaveBeenCalled();

    const run = track(service.playClips(['un.mp3']));
    await flush();
    await service.playClips([]);
    await flush();

    expect(context.lastSource().stop).toHaveBeenCalledOnce();
    expect(run.settled).toBe(true);
  });
});

describe('stopClips', () => {
  it('coupe le clip en cours et résout la promesse, sans charger les clips suivants', async () => {
    const { context, fetchClip, service } = setup();
    const run = track(service.playClips(['un.mp3', 'deux.mp3']));
    await flush();

    service.stopClips();
    await flush();

    expect(context.lastSource().stop).toHaveBeenCalledOnce();
    expect(run.settled).toBe(true);
    expect(context.sources).toHaveLength(1);
    expect(fetchClip.mock.calls).toEqual([['/un.mp3']]);
  });

  it('tolère un clip déjà terminé, dont l’arrêt lève une erreur', async () => {
    const { context, service } = setup();
    const run = track(service.playClips(['un.mp3']));
    await flush();
    context.lastSource().stop.mockImplementation(() => {
      throw new DOMException('Déjà terminé', 'InvalidStateError');
    });

    expect(() => {
      service.stopClips();
    }).not.toThrow();
    await flush();

    expect(run.settled).toBe(true);
  });

  it('ne fait rien sans séquence, et ne crée pas de contexte pour autant', () => {
    const { context, createContext, service } = setup();

    service.stopClips();

    expect(createContext).not.toHaveBeenCalled();
    expect(context.sources).toEqual([]);
  });

  it('n’a plus rien à arrêter après la fin de la séquence', async () => {
    const { context, service } = setup();
    void service.playClips(['un.mp3']);
    await flush();
    context.lastSource().end();
    await flush();

    service.stopClips();

    expect(context.lastSource().stop).not.toHaveBeenCalled();
  });

  it('résout la promesse sans attendre le chargement du clip en cours', async () => {
    const { context, fetchClip, service } = setup();
    const file = Promise.withResolvers<ArrayBuffer>();
    fetchClip.mockReturnValueOnce(file.promise);
    const run = track(service.playClips(['un.mp3']));
    await flush();
    expect(run.settled).toBe(false);

    service.stopClips();
    await flush();

    expect(run.settled).toBe(true);

    // Le clip arrive trop tard : il n'est pas joué, mais reste en cache pour la suite.
    file.resolve(encodeFile('/un.mp3'));
    await flush();
    expect(context.sources).toEqual([]);

    void service.playClips(['un.mp3']);
    await flush();
    expect(fetchClip).toHaveBeenCalledOnce();
    expect(context.played()).toEqual(['/un.mp3']);
  });

  it('laisse interrompre la séquence suivante quand un ancien chargement se termine', async () => {
    const { context, fetchClip, service } = setup();
    const file = Promise.withResolvers<ArrayBuffer>();
    fetchClip.mockReturnValueOnce(file.promise);
    const first = track(service.playClips(['un.mp3']));
    await flush();
    const second = track(service.playClips(['deux.mp3']));
    await flush();
    expect(first.settled).toBe(true);
    expect(context.played()).toEqual(['/deux.mp3']);

    file.resolve(encodeFile('/un.mp3'));
    await flush();
    service.stopClips();
    await flush();

    expect(context.lastSource().stop).toHaveBeenCalledOnce();
    expect(second.settled).toBe(true);
    expect(context.played()).toEqual(['/deux.mp3']);
  });
});

describe('Réglage « Son »', () => {
  it('coupé : ne crée rien, ne charge rien, ne joue rien', async () => {
    const { context, createContext, fetchClip, service } = setup();

    service.setEnabled(false);
    await expect(service.playClips(['un.mp3'])).resolves.toBeUndefined();
    await flush();

    expect(createContext).not.toHaveBeenCalled();
    expect(fetchClip).not.toHaveBeenCalled();
    expect(context.sources).toEqual([]);
  });

  it('coupé en cours de lecture : la voix se tait et la promesse est résolue', async () => {
    const { context, service } = setup();
    const run = track(service.playClips(['un.mp3', 'deux.mp3']));
    await flush();

    service.setEnabled(false);
    await flush();

    expect(context.lastSource().stop).toHaveBeenCalledOnce();
    expect(run.settled).toBe(true);
    expect(context.sources).toHaveLength(1);
  });

  it('remis : joue de nouveau, sans reprendre la séquence interrompue', async () => {
    const { context, service } = setup();
    void service.playClips(['un.mp3']);
    await flush();
    service.setEnabled(false);
    await flush();

    service.setEnabled(true);
    await flush();
    expect(context.sources).toHaveLength(1);

    void service.playClips(['deux.mp3']);
    await flush();
    expect(context.played()).toEqual(['/un.mp3', '/deux.mp3']);
  });

  it('coupé pendant que le contexte se réveille : le premier clip n’est même pas chargé', async () => {
    const { context, fetchClip, service } = setup('suspended');

    const run = track(service.playClips(['un.mp3']));
    service.setEnabled(false);
    await flush();

    expect(context.state).toBe('suspended');
    expect(fetchClip).not.toHaveBeenCalled();
    expect(context.sources).toEqual([]);
    expect(run.settled).toBe(true);
  });

  it('coupé : ne précharge rien, sans créer de contexte', async () => {
    const { createContext, fetchClip, service } = setup();

    service.setEnabled(false);
    await service.preloadClips(['un.mp3']);

    expect(createContext).not.toHaveBeenCalled();
    expect(fetchClip).not.toHaveBeenCalled();
  });

  it('coupé : libère la sortie audio, que ni un geste ni le retour au premier plan ne réveillent', async () => {
    const { context, service } = setup();
    void service.playClips(['un.mp3']);
    await flush();
    context.resume.mockClear();

    service.setEnabled(false);
    expect(context.suspend).toHaveBeenCalledOnce();
    expect(context.state).toBe('suspended');

    gesture(context);
    setPageHidden(true);
    setPageHidden(false);
    await flush();

    expect(context.resume).not.toHaveBeenCalled();
    expect(context.state).toBe('suspended');
  });

  it('remis : réveille le contexte à la voix suivante, même si sa suspension n’a pas encore eu lieu', async () => {
    const { context, service } = setup();
    void service.playClips(['un.mp3']);
    await flush();
    // Le navigateur n'a pas encore traité `suspend()` : `state` dit toujours `running`.
    context.suspend.mockImplementationOnce(() => Promise.resolve());
    context.resume.mockClear();

    service.setEnabled(false);
    service.setEnabled(true);
    void service.playClips(['deux.mp3']);
    await flush();

    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.played()).toEqual(['/un.mp3', '/deux.mp3']);

    // Le contexte est reparti : la voix suivante ne le réveille plus pour rien.
    context.resume.mockClear();
    void service.playClips(['trois.mp3']);
    await flush();
    expect(context.resume).not.toHaveBeenCalled();
  });

  it('coupé puis remis : oublie la séquence en attente du premier geste', async () => {
    const { context, service } = setupBlocked();
    await service.playClips(['un.mp3']);

    service.setEnabled(false);
    service.setEnabled(true);
    gesture(context);
    await flush();

    expect(context.state).toBe('running');
    expect(context.sources).toEqual([]);
  });
});

describe('Son bloqué avant le premier geste', () => {
  it('résout aussitôt la promesse, sans rien charger ni jouer', async () => {
    const { context, fetchClip, service } = setupBlocked();

    const run = track(service.playClips(['un.mp3']));
    await flush();

    expect(run.settled).toBe(true);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(fetchClip).not.toHaveBeenCalled();
    expect(context.sources).toEqual([]);
  });

  it('n’attend pas plus de 150 ms un resume() qui ne répond jamais', async () => {
    const { context, service } = setupBlocked();
    context.resume.mockReturnValueOnce(new Promise<void>(() => undefined));

    const run = track(service.playClips(['un.mp3']));
    await vi.advanceTimersByTimeAsync(RESUME_TIMEOUT_MS - 1);
    expect(run.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(run.settled).toBe(true);
  });

  it('joue tout de suite si le navigateur accepte de réveiller le contexte', async () => {
    const { context, service } = setup('suspended');

    void service.playClips(['un.mp3']);
    await flush();

    expect(context.state).toBe('running');
    expect(context.played()).toEqual(['/un.mp3']);
  });

  it.each(['pointerdown', 'pointerup', 'touchend', 'keydown'])(
    'lance la séquence au premier geste (%s), puis la joue jusqu’au bout',
    async (type) => {
      const { context, service } = setupBlocked();
      await service.playClips(['un.mp3', 'deux.mp3']);

      gesture(context, type);
      await flush();

      expect(context.state).toBe('running');
      expect(context.played()).toEqual(['/un.mp3']);

      context.lastSource().end();
      await flush();
      expect(context.played()).toEqual(['/un.mp3', '/deux.mp3']);
    },
  );

  it('ne lance la séquence qu’une fois, même au doigt où plusieurs évènements s’enchaînent', async () => {
    const { context, service } = setupBlocked();
    await service.playClips(['un.mp3']);

    gesture(context, 'pointerdown');
    gesture(context, 'pointerup');
    gesture(context, 'touchend');
    await flush();
    gesture(context, 'keydown');
    await flush();

    expect(context.sources).toHaveLength(1);
  });

  it('attend le vrai geste quand un évènement ne débloque pas le navigateur', async () => {
    const { context, service } = setupBlocked();
    await service.playClips(['un.mp3']);
    context.resume.mockClear();

    // Au doigt, `pointerdown` n'active pas la page : `resume()` reste sans effet.
    window.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.state).toBe('suspended');
    expect(context.sources).toEqual([]);

    gesture(context, 'pointerup');
    await flush();
    expect(context.played()).toEqual(['/un.mp3']);
  });

  it('garde la séquence en attente quand resume() échoue', async () => {
    const { context, service } = setupBlocked();
    await service.playClips(['un.mp3']);
    context.resume.mockRejectedValueOnce(new Error('Refusé'));

    window.dispatchEvent(new Event('keydown'));
    await flush();
    expect(context.sources).toEqual([]);

    gesture(context, 'keydown');
    await flush();
    expect(context.played()).toEqual(['/un.mp3']);
  });

  it('garde la séquence en attente quand le premier resume() échoue déjà', async () => {
    const { context, service } = setupBlocked();
    context.resume.mockRejectedValueOnce(new Error('Refusé'));

    await service.playClips(['un.mp3']);
    gesture(context);
    await flush();

    expect(context.played()).toEqual(['/un.mp3']);
  });

  it('ne joue que la dernière séquence demandée avant le geste', async () => {
    const { context, service } = setupBlocked();
    await service.playClips(['un.mp3']);
    await service.playClips(['deux.mp3']);

    gesture(context);
    await flush();

    expect(context.played()).toEqual(['/deux.mp3']);
  });

  it('oublie une séquence remplacée pendant l’attente de resume()', async () => {
    const { context, service } = setupBlocked();
    context.resume.mockReturnValueOnce(new Promise<void>(() => undefined));
    const first = track(service.playClips(['un.mp3']));
    await vi.advanceTimersByTimeAsync(RESUME_TIMEOUT_MS / 2);

    await service.playClips(['deux.mp3']);
    await vi.advanceTimersByTimeAsync(RESUME_TIMEOUT_MS);
    expect(first.settled).toBe(true);

    gesture(context);
    await flush();
    expect(context.played()).toEqual(['/deux.mp3']);
  });

  it('joue une seule fois la séquence quand le geste arrive pendant l’attente de resume()', async () => {
    const { context, service } = setupBlocked();
    context.resume.mockReturnValueOnce(new Promise<void>(() => undefined));
    const run = track(service.playClips(['un.mp3']));
    await flush();

    gesture(context);
    await vi.advanceTimersByTimeAsync(RESUME_TIMEOUT_MS);

    expect(run.settled).toBe(false);
    expect(context.played()).toEqual(['/un.mp3']);
  });

  it.each<[string, (service: ReturnType<typeof setup>['service']) => void]>([
    [
      'stopClips',
      (service) => {
        service.stopClips();
      },
    ],
    [
      'une séquence vide',
      (service) => {
        void service.playClips([]);
      },
    ],
  ])('oublie la séquence en attente avec %s', async (_, forget) => {
    const { context, service } = setupBlocked();
    await service.playClips(['un.mp3']);

    forget(service);
    gesture(context);
    await flush();

    expect(context.state).toBe('running');
    expect(context.sources).toEqual([]);
  });

  it('joue la séquence en attente si le contexte démarre seul après le délai, sans autre geste', async () => {
    const { context, service } = setupBlocked();
    await service.playClips(['un.mp3']);
    expect(context.sources).toEqual([]);

    context.startByItself();
    await flush();

    expect(context.played()).toEqual(['/un.mp3']);
  });

  it('ne joue qu’une fois la séquence quand le contexte démarre au moment d’un geste', async () => {
    const { context, service } = setupBlocked();
    await service.playClips(['un.mp3']);

    gesture(context);
    context.startByItself();
    await flush();

    expect(context.sources).toHaveLength(1);
  });

  it('ne joue rien quand le contexte démarre seul sans séquence en attente', async () => {
    const { context, service } = setupBlocked();
    await service.preloadClips(['un.mp3']);

    context.startByItself();
    await flush();

    expect(context.sources).toEqual([]);
  });

  it('débloque le contexte à chaque geste tant qu’il dort, même sans séquence en attente', async () => {
    const { context, service } = setupBlocked();
    await service.preloadClips(['un.mp3']);

    gesture(context);
    await flush();

    expect(context.state).toBe('running');
    expect(context.sources).toEqual([]);
  });

  it('ne réveille plus le contexte une fois débloqué', async () => {
    const { context, service } = setupBlocked();
    await service.playClips(['un.mp3']);
    gesture(context);
    await flush();
    context.resume.mockClear();

    gesture(context, 'keydown');
    await flush();

    expect(context.resume).not.toHaveBeenCalled();
  });
});

describe('Application en arrière-plan', () => {
  it('fait taire la voix, résout la promesse et suspend le contexte', async () => {
    const { context, service } = setup();
    const run = track(service.playClips(['un.mp3', 'deux.mp3']));
    await flush();

    setPageHidden(true);
    await flush();

    expect(context.lastSource().stop).toHaveBeenCalledOnce();
    expect(run.settled).toBe(true);
    expect(context.suspend).toHaveBeenCalledOnce();
    expect(context.state).toBe('suspended');
    expect(context.sources).toHaveLength(1);
  });

  it('réveille le contexte au retour, sans relancer la voix', async () => {
    const { context, service } = setup();
    void service.playClips(['un.mp3']);
    await flush();
    setPageHidden(true);
    await flush();
    context.resume.mockClear();

    setPageHidden(false);
    await flush();

    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.state).toBe('running');
    expect(context.sources).toHaveLength(1);
  });

  it('oublie la séquence en attente du premier geste', async () => {
    const { context, service } = setupBlocked();
    await service.playClips(['un.mp3']);

    setPageHidden(true);
    await flush();
    setPageHidden(false);
    gesture(context);
    await flush();

    expect(context.sources).toEqual([]);
  });

  it('tolère un contexte fermé, qui refuse de se suspendre et de se réveiller', async () => {
    const { context, service } = setup();
    void service.playClips(['un.mp3']);
    await flush();
    // Promesses nues : le suivi de `vi.fn` traiterait le rejet. Non traité, Vitest ferait échouer la suite.
    let refusals = 0;
    const refuse = () => {
      refusals += 1;
      return Promise.reject(new Error('Fermé'));
    };
    Object.assign(context, { suspend: refuse, resume: refuse });

    setPageHidden(true);
    await flush();
    setPageHidden(false);
    await flush();

    expect(refusals).toBe(2);
  });

  it('ne fait rien tant qu’aucun contexte n’existe', async () => {
    const { createContext, service } = setup();

    setPageHidden(true);
    await flush();
    setPageHidden(false);
    await flush();
    service.stopClips();

    expect(createContext).not.toHaveBeenCalled();
  });

  it('ne réveille pas le contexte pour une séquence demandée en arrière-plan', async () => {
    const { context, fetchClip, service } = setup();
    void service.playClips(['un.mp3']);
    await flush();
    setPageHidden(true);
    await flush();
    context.resume.mockClear();

    // Le jeu enchaîne dès que la promesse précédente est résolue : personne n'entendrait la suite.
    const run = track(service.playClips(['deux.mp3']));
    await flush();

    expect(run.settled).toBe(true);
    expect(context.resume).not.toHaveBeenCalled();
    expect(context.state).toBe('suspended');
    expect(fetchClip).toHaveBeenCalledOnce();
    expect(context.sources).toHaveLength(1);

    setPageHidden(false);
    await flush();
    void service.playClips(['deux.mp3']);
    await flush();
    expect(context.played()).toEqual(['/un.mp3', '/deux.mp3']);
  });

  it('crée quand même le contexte en arrière-plan, pour écouter le retour au premier plan', async () => {
    const { context, createContext, service } = setup('suspended');
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });

    await service.playClips(['un.mp3']);
    await flush();
    expect(createContext).toHaveBeenCalledOnce();
    expect(context.resume).not.toHaveBeenCalled();

    setPageHidden(false);
    await flush();
    expect(context.resume).toHaveBeenCalledOnce();
  });
});

describe('Clips illisibles', () => {
  it('saute un clip introuvable, joue la suite et résout la promesse', async () => {
    const { context, fetchClip, service } = setup();
    fetchClip.mockRejectedValueOnce(new Error('404'));

    const run = track(service.playClips(['perdu.mp3', 'deux.mp3']));
    await flush();

    expect(context.played()).toEqual(['/deux.mp3']);

    context.lastSource().end();
    await flush();

    expect(run.settled).toBe(true);
  });

  it('saute un clip indécodable', async () => {
    const { context, service } = setup();
    context.decodeAudioData.mockRejectedValueOnce(new Error('Format inconnu'));

    void service.playClips(['abime.mp3', 'deux.mp3']);
    await flush();

    expect(context.played()).toEqual(['/deux.mp3']);
  });

  it('saute un clip dont le chargement ne répond pas : le jeu n’attend pas un réseau mort', async () => {
    const { context, fetchClip, service } = setup();
    const file = Promise.withResolvers<ArrayBuffer>();
    fetchClip.mockReturnValueOnce(file.promise);

    const run = track(service.playClips(['lent.mp3', 'deux.mp3']));
    await vi.advanceTimersByTimeAsync(CLIP_LOAD_TIMEOUT_MS - 1);
    expect(context.sources).toEqual([]);
    expect(run.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(context.played()).toEqual(['/deux.mp3']);
    context.lastSource().end();
    await flush();
    expect(run.settled).toBe(true);

    // Arrivé trop tard, le clip n'est pas joué, mais reste en cache pour la suite.
    file.resolve(encodeFile('/lent.mp3'));
    await flush();
    expect(context.played()).toEqual(['/deux.mp3']);

    void service.playClips(['lent.mp3']);
    await flush();
    expect(fetchClip).toHaveBeenCalledTimes(2);
    expect(context.played()).toEqual(['/deux.mp3', '/lent.mp3']);
  });

  it('résout la promesse sans rien jouer quand aucun clip n’est lisible', async () => {
    const { context, fetchClip, service } = setup();
    fetchClip.mockRejectedValue(new Error('Hors ligne'));

    await expect(service.playClips(['un.mp3', 'deux.mp3'])).resolves.toBeUndefined();

    expect(fetchClip).toHaveBeenCalledTimes(2);
    expect(context.sources).toEqual([]);
  });

  it('retente un clip illisible à l’appel suivant', async () => {
    const { context, fetchClip, service } = setup();
    fetchClip.mockRejectedValueOnce(new Error('Hors ligne'));
    await service.playClips(['un.mp3']);
    expect(context.sources).toEqual([]);

    void service.playClips(['un.mp3']);
    await flush();

    expect(fetchClip.mock.calls).toEqual([['/un.mp3'], ['/un.mp3']]);
    expect(context.played()).toEqual(['/un.mp3']);
  });

  it('ne charge et ne décode qu’une fois un clip lisible', async () => {
    const { context, fetchClip, service } = setup();
    void service.playClips(['un.mp3']);
    await flush();
    void service.playClips(['un.mp3']);
    await flush();

    expect(fetchClip).toHaveBeenCalledOnce();
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
    expect(context.played()).toEqual(['/un.mp3', '/un.mp3']);
  });
});

describe('Filet de sécurité', () => {
  it('résout un clip dont `ended` ne vient jamais, après sa durée et la marge', async () => {
    const { context, service } = setup();
    const safetyMs = context.clipSeconds * 1000 + CLIP_END_MARGIN_MS;

    const run = track(service.playClips(['un.mp3']));
    await flush();
    await vi.advanceTimersByTimeAsync(safetyMs - 1);
    expect(run.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(run.settled).toBe(true);
  });

  it('suit la durée du clip et enchaîne sur le clip suivant', async () => {
    const { context, service } = setup();
    context.clipSeconds = 3;

    const run = track(service.playClips(['long.mp3', 'deux.mp3']));
    await flush();
    await vi.advanceTimersByTimeAsync(3000 + CLIP_END_MARGIN_MS - 1);
    expect(context.sources).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(context.played()).toEqual(['/long.mp3', '/deux.mp3']);
    expect(run.settled).toBe(false);
  });

  it('ne laisse aucun minuteur après la fin normale d’un clip', async () => {
    const { context, service } = setup();
    void service.playClips(['un.mp3']);
    await flush();
    expect(vi.getTimerCount()).toBe(1);

    context.lastSource().end();
    await flush();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('ne laisse aucun minuteur après l’interruption d’un clip', async () => {
    const { service } = setup();
    void service.playClips(['un.mp3']);
    await flush();

    service.stopClips();
    await flush();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('n’interrompt pas la séquence suivante, dont le clip a son propre minuteur', async () => {
    const { context, service } = setup();
    void service.playClips(['un.mp3']);
    await flush();
    await vi.advanceTimersByTimeAsync(1000);

    const second = track(service.playClips(['deux.mp3']));
    await flush();
    await vi.advanceTimersByTimeAsync(CLIP_END_MARGIN_MS);

    expect(second.settled).toBe(false);
    expect(context.lastSource().stop).not.toHaveBeenCalled();
  });

  it('ignore un `ended` tardif après le filet de sécurité : le clip suivant reste interruptible', async () => {
    const { context, service } = setup();
    void service.playClips(['un.mp3', 'deux.mp3']);
    await flush();
    const first = context.lastSource();
    await vi.advanceTimersByTimeAsync(context.clipSeconds * 1000 + CLIP_END_MARGIN_MS);
    expect(context.played()).toEqual(['/un.mp3', '/deux.mp3']);

    first.end();
    service.stopClips();

    expect(context.lastSource().stop).toHaveBeenCalledOnce();
  });
});

describe('Effets sonores', () => {
  const EFFECT_NOTES: [SoundEffect, number][] = [
    ['success', 2],
    ['bounce', 1],
    ['stop', 2],
    ['victory', 4],
  ];

  it.each(EFFECT_NOTES)(
    'joue l’effet « %s » en %i note(s), reliées à la sortie',
    (effect, notes) => {
      const { context, service } = setup();

      service.playEffect(effect);

      expect(context.oscillators).toHaveLength(notes);
      expect(context.gains).toHaveLength(notes);
      context.oscillators.forEach((oscillator, index) => {
        const gain = context.gains[index];

        expect(oscillator.connect).toHaveBeenCalledWith(gain);
        expect(gain?.connect).toHaveBeenCalledWith(context.destination);
        expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledOnce();
      });
    },
  );

  it.each(EFFECT_NOTES)(
    'programme l’effet « %s » note après note, à partir de maintenant',
    (effect) => {
      const { context, service } = setup();

      service.playEffect(effect);

      const starts = context.oscillators.map(
        (oscillator) => oscillator.start.mock.calls[0]?.[0] ?? 0,
      );
      const stops = context.oscillators.map(
        (oscillator) => oscillator.stop.mock.calls[0]?.[0] ?? 0,
      );
      expect(starts[0]).toBe(context.currentTime);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      starts.forEach((start, index) => {
        expect(stops[index]).toBeGreaterThan(start);
      });
    },
  );

  it.each(EFFECT_NOTES)('garde l’effet « %s » doux, sans clic ni rampe vers zéro', (effect) => {
    const { context, service } = setup();

    service.playEffect(effect);

    for (const { gain } of context.gains) {
      const [start] = gain.setValueAtTime.mock.calls;
      const ramps = gain.exponentialRampToValueAtTime.mock.calls.map(([value]) => value);

      // Une rampe exponentielle vers 0 lèverait une erreur dans un vrai navigateur.
      expect(start?.[0]).toBeGreaterThan(0);
      expect(ramps[0]).toBe(EFFECT_PEAK_GAIN);
      expect(ramps[1]).toBe(start?.[0]);
    }
  });

  it('fait glisser le rebond vers le grave, seul effet en glissando', () => {
    const { context, service } = setup();

    service.playEffect('bounce');

    const [oscillator] = context.oscillators;
    const [startFrequency] = oscillator?.frequency.setValueAtTime.mock.calls[0] ?? [];
    const [endFrequency, endTime] =
      oscillator?.frequency.exponentialRampToValueAtTime.mock.calls[0] ?? [];
    expect(endFrequency).toBeLessThan(startFrequency ?? 0);
    expect(endTime).toBe(oscillator?.stop.mock.calls[0]?.[0]);

    for (const effect of ['success', 'stop', 'victory'] as const) {
      const { context: other, service: otherService } = setup();
      otherService.playEffect(effect);

      for (const note of other.oscillators) {
        expect(note.frequency.exponentialRampToValueAtTime).not.toHaveBeenCalled();
      }
    }
  });

  it('joue par-dessus la voix, sans l’interrompre', async () => {
    const { context, service } = setup();
    const run = track(service.playClips(['un.mp3']));
    await flush();

    service.playEffect('success');
    await flush();

    expect(context.oscillators).toHaveLength(2);
    expect(context.lastSource().stop).not.toHaveBeenCalled();
    expect(run.settled).toBe(false);
  });

  it.each(EFFECT_NOTES)('n’ajoute rien quand le son est coupé (« %s »)', (effect) => {
    const { context, createContext, service } = setup();

    service.setEnabled(false);
    service.playEffect(effect);

    expect(createContext).not.toHaveBeenCalled();
    expect(context.oscillators).toEqual([]);
  });

  it.each(EFFECT_NOTES)('n’ajoute rien tant que le son est bloqué (« %s »)', (effect) => {
    const { context, createContext, service } = setupBlocked();

    service.playEffect(effect);

    // Le contexte existe désormais : il attend le premier geste, sans qu'on cherche à le réveiller.
    expect(createContext).toHaveBeenCalledOnce();
    expect(context.resume).not.toHaveBeenCalled();
    expect(context.oscillators).toEqual([]);
  });

  it('se tait en arrière-plan et rejoue au retour', async () => {
    const { context, service } = setup();
    service.playEffect('bounce');
    setPageHidden(true);
    await flush();

    service.playEffect('bounce');
    expect(context.oscillators).toHaveLength(1);

    setPageHidden(false);
    await flush();
    service.playEffect('bounce');
    expect(context.oscillators).toHaveLength(2);
  });

  it('rejoue après le premier geste', async () => {
    const { context, service } = setupBlocked();
    service.playEffect('success');

    gesture(context);
    await flush();
    service.playEffect('success');

    expect(context.oscillators).toHaveLength(2);
  });
});

describe('preloadClips', () => {
  it('charge et décode chaque clip, sans rien jouer', async () => {
    const { context, fetchClip, service } = setup();

    await service.preloadClips(['un.mp3', 'deux.mp3']);

    expect(fetchClip.mock.calls).toEqual([['/un.mp3'], ['/deux.mp3']]);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2);
    expect(context.sources).toEqual([]);
  });

  it('évite de recharger un clip à sa lecture', async () => {
    const { context, fetchClip, service } = setup();
    await service.preloadClips(['un.mp3']);

    void service.playClips(['un.mp3']);
    await flush();

    expect(fetchClip).toHaveBeenCalledOnce();
    expect(context.played()).toEqual(['/un.mp3']);
  });

  it('partage le chargement en cours avec une lecture demandée entre-temps', async () => {
    const { context, fetchClip, service } = setup();
    const file = Promise.withResolvers<ArrayBuffer>();
    fetchClip.mockReturnValueOnce(file.promise);

    const preloading = service.preloadClips(['un.mp3']);
    void service.playClips(['un.mp3']);
    await flush();
    file.resolve(encodeFile('/un.mp3'));
    await preloading;
    await flush();

    expect(fetchClip).toHaveBeenCalledOnce();
    expect(context.played()).toEqual(['/un.mp3']);
  });

  it('résout la promesse malgré un clip illisible, retenté à sa lecture', async () => {
    const { context, fetchClip, service } = setup();
    fetchClip.mockRejectedValueOnce(new Error('Hors ligne'));

    await expect(service.preloadClips(['un.mp3', 'deux.mp3'])).resolves.toBeUndefined();

    void service.playClips(['un.mp3']);
    await flush();
    expect(fetchClip.mock.calls).toEqual([['/un.mp3'], ['/deux.mp3'], ['/un.mp3']]);
    expect(context.played()).toEqual(['/un.mp3']);
  });

  it('charge même avant le premier geste, qui reste nécessaire pour jouer', async () => {
    const { context, fetchClip, service } = setupBlocked();

    await service.preloadClips(['un.mp3']);

    expect(fetchClip).toHaveBeenCalledOnce();
    expect(context.resume).not.toHaveBeenCalled();
  });

  it('ne touche pas à la voix en cours', async () => {
    const { context, service } = setup();
    const run = track(service.playClips(['un.mp3']));
    await flush();

    await service.preloadClips(['deux.mp3']);

    expect(context.lastSource().stop).not.toHaveBeenCalled();
    expect(run.settled).toBe(false);
  });
});

describe('Sans contexte audio', () => {
  it('ne fait rien quand createContext renvoie null', async () => {
    const createContext = vi.fn(() => null);
    const fetchClip = vi.fn((url: string) => Promise.resolve(encodeFile(url)));
    const service = createAudioService({ createContext, fetchClip });

    await expect(service.playClips(['un.mp3'])).resolves.toBeUndefined();
    await expect(service.preloadClips(['un.mp3'])).resolves.toBeUndefined();
    expect(() => {
      service.playEffect('success');
      service.stopClips();
      service.setEnabled(false);
      service.setEnabled(true);
    }).not.toThrow();

    expect(createContext).toHaveBeenCalled();
    expect(fetchClip).not.toHaveBeenCalled();
    expect(windowListeners).not.toHaveBeenCalled();
    expect(documentListeners).not.toHaveBeenCalled();
  });

  it('reste muet dans jsdom, qui ne fournit pas d’AudioContext', async () => {
    const browserFetch = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', browserFetch);
    const service = createAudioService();

    expect('AudioContext' in window).toBe(false);
    await expect(service.playClips(['un.mp3'])).resolves.toBeUndefined();
    await expect(service.preloadClips(['un.mp3'])).resolves.toBeUndefined();
    service.playEffect('success');

    expect(browserFetch).not.toHaveBeenCalled();
  });

  it('reste muet hors du navigateur, sans window', async () => {
    const service = createAudioService();
    vi.stubGlobal('window', undefined);

    await expect(service.playClips(['un.mp3'])).resolves.toBeUndefined();
  });

  it('reste muet quand le navigateur refuse de créer le contexte', async () => {
    const browserFetch = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', browserFetch);
    // Trop de contextes, ou aucune sortie audio sur le boîtier TV.
    vi.stubGlobal('AudioContext', function RefusedAudioContext() {
      throw new DOMException('Trop de contextes', 'NotSupportedError');
    });
    const service = createAudioService();

    await expect(service.playClips(['un.mp3'])).resolves.toBeUndefined();

    expect(browserFetch).not.toHaveBeenCalled();
  });
});

describe('Contexte et lecture du navigateur', () => {
  /** Remplace l'`AudioContext` du navigateur par le contexte simulé. */
  function stubBrowserContext(): FakeAudioContext {
    const context = new FakeAudioContext('running');
    vi.stubGlobal('AudioContext', function BrowserAudioContext() {
      return context;
    });
    return context;
  }

  it('crée une AudioContext et charge les clips par fetch', async () => {
    const context = stubBrowserContext();
    const browserFetch = vi.fn((url: string) =>
      Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(encodeFile(url)) }),
    );
    vi.stubGlobal('fetch', browserFetch);
    const service = createAudioService();

    void service.playClips(['audio/un.mp3']);
    await flush();

    expect(browserFetch).toHaveBeenCalledWith('/audio/un.mp3');
    expect(context.played()).toEqual(['/audio/un.mp3']);
  });

  it('saute un clip que le serveur ne trouve pas', async () => {
    const context = stubBrowserContext();
    const browserFetch = vi.fn(() =>
      Promise.resolve({ ok: false, arrayBuffer: () => Promise.resolve(encodeFile('page 404')) }),
    );
    vi.stubGlobal('fetch', browserFetch);
    const service = createAudioService();

    await expect(service.playClips(['audio/perdu.mp3'])).resolves.toBeUndefined();

    expect(browserFetch).toHaveBeenCalledOnce();
    expect(context.decodeAudioData).not.toHaveBeenCalled();
    expect(context.sources).toEqual([]);
  });

  it('écoute les gestes en capture, sans gêner le défilement', async () => {
    stubBrowserContext();
    const service = createAudioService();

    await service.preloadClips([]);

    expect(windowListeners.mock.calls.map(([type, , options]) => [type, options])).toEqual(
      ['pointerdown', 'pointerup', 'touchend', 'keydown'].map((type) => [
        type,
        { capture: true, passive: true },
      ]),
    );
    expect(documentListeners.mock.calls.map(([type]) => type)).toEqual(['visibilitychange']);
  });

  it('getAudioService partage un seul service dans toute l’application', () => {
    expect(getAudioService()).toBe(getAudioService());
  });
});

describe('resolveAudioUrl', () => {
  it('vise la racine sans NEXT_PUBLIC_BASE_PATH', () => {
    expect(resolveAudioUrl('audio/bear-sort/stop-go.mp3')).toBe('/audio/bear-sort/stop-go.mp3');
  });

  it('préfixe le chemin par NEXT_PUBLIC_BASE_PATH (GitHub Pages), lu à chaque appel', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/mia');

    expect(resolveAudioUrl('audio/bear-sort/stop-go.mp3')).toBe('/mia/audio/bear-sort/stop-go.mp3');

    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/autre');

    expect(resolveAudioUrl('audio/bear-sort/stop-go.mp3')).toBe(
      '/autre/audio/bear-sort/stop-go.mp3',
    );
  });

  it('traite un chemin de base vide comme la racine', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');

    expect(resolveAudioUrl('audio/un.mp3')).toBe('/audio/un.mp3');
  });

  it('sert au chargement des clips', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/mia');
    const { fetchClip, service } = setup();

    await service.preloadClips(['audio/un.mp3']);

    expect(fetchClip).toHaveBeenCalledWith('/mia/audio/un.mp3');
  });
});
