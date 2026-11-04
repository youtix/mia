import {
  FOREGROUND_CHECK_INTERVAL_MS,
  REPAIR_SCRIPT_TIMEOUT_MS,
  appUpdate,
  createAppUpdateController,
  getAppVersion,
  repairApp,
  type AppRepairResult,
  type AppUpdateController,
  type AppUpdateStatus,
} from '@/core/pwa/appUpdate';
import { RESTORE_PRECACHE_MESSAGE, SKIP_WAITING_MESSAGE } from '@/core/pwa/precache';
import { useAppUpdateStatus } from '@/core/pwa/useAppUpdateStatus';
import { BACKUP_STORAGE_KEY, STORAGE_KEY } from '@/core/storage/default-state';
import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import nextConfig from '../next.config';
import { version } from '../package.json';

/** Plateforme simulée : `true` pour l'APK Capacitor. */
const platform = vi.hoisted(() => ({ native: false }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform.native },
}));

/** jsdom n'implémente pas la navigation : le rechargement est espionné, jamais exécuté. */
const reloadPage = vi.hoisted(() => vi.fn<() => void>());

vi.mock('@/core/pwa/reloadPage', () => ({ reloadPage, reloadToHub: vi.fn<() => void>() }));

/** `ServiceWorker` simulé : un `EventTarget` avec son état et `postMessage`. */
interface FakeWorker extends EventTarget {
  state: ServiceWorkerState;
  scriptURL: string;
  postMessage: Mock<(message: unknown) => void>;
}

function createWorker(state: ServiceWorkerState = 'activated'): FakeWorker {
  return Object.assign(new EventTarget(), {
    state,
    scriptURL: 'https://youtix.github.io/mia/sw.js',
    postMessage: vi.fn<(message: unknown) => void>(),
  });
}

/** Worker d'une réparation : `sw.js?repair=…`, l'adresse gardée ensuite par l'inscription. */
function repairCopy(state: ServiceWorkerState): FakeWorker {
  return Object.assign(createWorker(state), {
    scriptURL: 'https://youtix.github.io/mia/sw.js?repair=1730000000000',
  });
}

/**
 * `ServiceWorkerRegistration` simulée : `update()` ne trouve rien, sauf indication contraire.
 * Les écouteurs `visibilitychange` et `pageshow` des suivis des tests précédents restent branchés :
 * chaque test crée donc sa propre inscription et n'observe que celle-là.
 */
interface FakeRegistration extends EventTarget {
  active: FakeWorker | null;
  waiting: FakeWorker | null;
  installing: FakeWorker | null;
  update: Mock<() => Promise<unknown>>;
}

type Workers = Partial<Pick<FakeRegistration, 'active' | 'waiting' | 'installing'>>;

function createRegistration(workers: Workers = {}): FakeRegistration {
  return Object.assign(new EventTarget(), {
    active: null,
    waiting: null,
    installing: null,
    update: vi.fn<() => Promise<unknown>>(() => Promise.resolve()),
    ...workers,
  });
}

type GetRegistration = (
  clientUrl?: string,
) => Promise<{ scope: string; unregister: () => Promise<boolean> } | undefined>;

type Register = (url: string, options?: RegistrationOptions) => Promise<FakeRegistration>;

/** `navigator.serviceWorker` simulé, que jsdom n'expose pas. */
interface FakeContainer extends EventTarget {
  controller: FakeWorker | null;
  getRegistration: Mock<GetRegistration>;
  register: Mock<Register>;
}

function stubServiceWorker(): FakeContainer {
  const container: FakeContainer = Object.assign(new EventTarget(), {
    controller: createWorker(),
    getRegistration: vi.fn<GetRegistration>(() => Promise.resolve(undefined)),
    // Sans suite par défaut : seuls les tests qui relancent une installation y répondent.
    register: vi.fn<Register>(() => new Promise(() => undefined)),
  });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
  return container;
}

function removeServiceWorker(): void {
  Reflect.deleteProperty(navigator, 'serviceWorker');
}

/** Démarre le suivi (neuf par défaut) sur l'inscription simulée. */
function startTracking(
  registration: FakeRegistration,
  controller: AppUpdateController = createAppUpdateController(),
): AppUpdateController {
  controller.start(registration as unknown as ServiceWorkerRegistration);
  return controller;
}

function changeState(worker: FakeWorker, state: ServiceWorkerState): void {
  worker.state = state;
  worker.dispatchEvent(new Event('statechange'));
}

/** Nouvelle version trouvée : `installing` change, puis `updatefound`. */
function findUpdate(
  registration: FakeRegistration,
  worker: FakeWorker = createWorker('installing'),
): FakeWorker {
  registration.installing = worker;
  registration.dispatchEvent(new Event('updatefound'));
  return worker;
}

/** Pré-cache réussi : le worker passe de `installing` à `waiting`, puis `statechange`. */
function finishInstall(registration: FakeRegistration, worker: FakeWorker): void {
  registration.installing = null;
  registration.waiting = worker;
  changeState(worker, 'installed');
}

/**
 * Pré-cache échoué, dans l'ordre de la spécification (Install, « If installFailed ») : le worker
 * devient `redundant` pendant que `installing` le désigne encore, et aucun événement ne suit.
 */
function failInstall(registration: FakeRegistration, worker: FakeWorker): void {
  changeState(worker, 'redundant');
  registration.installing = null;
}

/** Activation : le worker passe de `waiting` à `active`, puis `statechange`. */
function activateWaiting(registration: FakeRegistration, worker: FakeWorker): void {
  registration.waiting = null;
  registration.active = worker;
  changeState(worker, 'activating');
}

/** Laisse s'achever les promesses en cours (la recherche lancée par `start`, par exemple). */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Comme `settle`, sous des minuteurs simulés : seules les microtâches avancent. */
async function flushMicrotasks(): Promise<void> {
  for (let step = 0; step < 20; step += 1) await Promise.resolve();
}

/** Rejets que Node signale comme non gérés pendant `action` et les promesses qu'elle lance. */
async function unhandledRejectionsDuring(action: () => void): Promise<unknown[]> {
  const rejections: unknown[] = [];
  const record = (reason: unknown): void => {
    rejections.push(reason);
  };
  process.on('unhandledRejection', record);
  action();
  await settle();
  process.off('unhandledRejection', record);
  return rejections;
}

let container: FakeContainer;

beforeEach(() => {
  platform.native = false;
  reloadPage.mockReset();
  vi.stubEnv('NODE_ENV', 'production');
  container = stubServiceWorker();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  removeServiceWorker();
  Reflect.deleteProperty(document, 'visibilityState');
  localStorage.clear();
});

describe('getStatus', () => {
  it('vaut unsupported hors production', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(createAppUpdateController().getStatus()).toBe('unsupported');
  });

  it('vaut unsupported dans l’APK Capacitor', () => {
    platform.native = true;

    expect(createAppUpdateController().getStatus()).toBe('unsupported');
  });

  it('vaut unsupported sans support des service workers', () => {
    removeServiceWorker();

    expect(createAppUpdateController().getStatus()).toBe('unsupported');
  });

  it('vaut idle en production dans un navigateur Web, avant start', () => {
    expect(createAppUpdateController().getStatus()).toBe('idle');
  });

  it('lit l’environnement à la première lecture, pas à la création du suivi', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const controller = createAppUpdateController();
    vi.stubEnv('NODE_ENV', 'production');

    expect(controller.getStatus()).toBe('idle');
  });

  it('ne branche aucun écouteur avant start', () => {
    const onContainer = vi.spyOn(container, 'addEventListener');
    const onDocument = vi.spyOn(document, 'addEventListener');
    const onWindow = vi.spyOn(window, 'addEventListener');

    createAppUpdateController().getStatus();

    expect(onContainer).not.toHaveBeenCalled();
    expect(onDocument).not.toHaveBeenCalled();
    expect(onWindow).not.toHaveBeenCalled();
  });

  it('ne démarre pas là où aucun service worker n’est prévu : ni écouteur, ni relance', () => {
    vi.useFakeTimers();
    vi.stubEnv('NODE_ENV', 'development');
    const onContainer = vi.spyOn(container, 'addEventListener');
    const onDocument = vi.spyOn(document, 'addEventListener');
    const controller = createAppUpdateController();

    controller.start(null);
    vi.advanceTimersByTime(10 * FOREGROUND_CHECK_INTERVAL_MS);

    expect(controller.getStatus()).toBe('unsupported');
    expect(onContainer).not.toHaveBeenCalled();
    expect(onDocument).not.toHaveBeenCalled();
    expect(container.register).not.toHaveBeenCalled();
  });
});

describe('statut relu sur l’inscription', () => {
  it.each<[AppUpdateStatus, string, Workers]>([
    ['ready', 'une version attend', { active: createWorker(), waiting: createWorker('installed') }],
    [
      'downloading',
      'une version se télécharge',
      { active: createWorker(), installing: createWorker('installing') },
    ],
    [
      'ready',
      'une version attend pendant qu’une autre se télécharge',
      {
        active: createWorker(),
        waiting: createWorker('installed'),
        installing: createWorker('installing'),
      },
    ],
    ['idle', 'rien de nouveau', { active: createWorker() }],
    [
      'idle',
      'la copie d’une réparation s’installe, même après son abandon faute de réponse',
      { active: createWorker(), installing: repairCopy('installing') },
    ],
    [
      'idle',
      'la copie d’une réparation attend la fermeture de l’application',
      { active: createWorker(), waiting: repairCopy('installed') },
    ],
    [
      'ready',
      'une mise à jour attend, sur une inscription déjà réparée',
      { active: repairCopy('activated'), waiting: repairCopy('installed') },
    ],
    ['idle', 'aucun worker', {}],
    ['idle', 'le premier worker s’installe', { installing: createWorker('installing') }],
    ['idle', 'le premier worker attend son activation', { waiting: createWorker('installed') }],
    [
      'idle',
      'première installation, installing et waiting présents',
      { waiting: createWorker('installed'), installing: createWorker('installing') },
    ],
  ])('vaut %s quand %s', (expected, _label, workers) => {
    const controller = startTracking(createRegistration(workers));

    expect(controller.getStatus()).toBe(expected);
  });

  it('vaut ready aussitôt pour une version déjà en attente, sans attendre la recherche', () => {
    const registration = createRegistration({
      active: createWorker(),
      waiting: createWorker('installed'),
    });
    registration.update.mockReturnValue(new Promise(() => undefined));
    const controller = createAppUpdateController();
    expect(controller.getStatus()).toBe('idle');
    const listener = vi.fn<() => void>();
    controller.subscribe(listener);

    startTracking(registration, controller);

    expect(controller.getStatus()).toBe('ready');
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('abonnés', () => {
  it('ne sont pas prévenus par un démarrage qui ne change rien, même sans lecture préalable', () => {
    const controller = createAppUpdateController();
    const listener = vi.fn<() => void>();
    controller.subscribe(listener);

    startTracking(createRegistration({ active: createWorker() }), controller);

    expect(listener).not.toHaveBeenCalled();
  });

  it('ne sont prévenus que lorsque le statut change, et lisent alors le nouveau', async () => {
    const registration = createRegistration({ active: createWorker() });
    const controller = createAppUpdateController();
    // Comme useSyncExternalStore : le statut est lu une première fois avant de s'abonner.
    controller.getStatus();
    const seen: AppUpdateStatus[] = [];
    controller.subscribe(() => {
      seen.push(controller.getStatus());
    });

    startTracking(registration, controller);
    await settle();
    expect(seen).toEqual([]);

    const worker = findUpdate(registration);
    expect(seen).toEqual(['downloading']);

    registration.dispatchEvent(new Event('updatefound'));
    changeState(worker, 'installing');
    await controller.check();
    expect(seen).toEqual(['downloading']);

    finishInstall(registration, worker);
    expect(seen).toEqual(['downloading', 'ready']);

    activateWaiting(registration, worker);
    expect(seen).toEqual(['downloading', 'ready', 'idle']);
  });

  it('sont tous prévenus', () => {
    const registration = createRegistration({ active: createWorker() });
    const controller = startTracking(registration);
    const listeners = [vi.fn<() => void>(), vi.fn<() => void>()];
    for (const listener of listeners) controller.subscribe(listener);

    findUpdate(registration);

    for (const listener of listeners) expect(listener).toHaveBeenCalledOnce();
  });

  it('ne sont plus prévenus après leur désabonnement, les autres si', () => {
    const registration = createRegistration({ active: createWorker() });
    const controller = startTracking(registration);
    const gone = vi.fn<() => void>();
    const kept = vi.fn<() => void>();
    const unsubscribe = controller.subscribe(gone);
    controller.subscribe(kept);

    unsubscribe();
    findUpdate(registration);

    expect(gone).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledOnce();
  });
});

describe('cycle de vie des workers', () => {
  it('updatefound puis installed : idle, downloading, ready', () => {
    const registration = createRegistration({ active: createWorker() });
    const controller = startTracking(registration);
    expect(controller.getStatus()).toBe('idle');

    const worker = findUpdate(registration);
    expect(controller.getStatus()).toBe('downloading');

    finishInstall(registration, worker);
    expect(controller.getStatus()).toBe('ready');
  });

  it('installation échouée (redundant) : retour à idle', () => {
    const registration = createRegistration({ active: createWorker() });
    const controller = startTracking(registration);
    const worker = findUpdate(registration);
    expect(controller.getStatus()).toBe('downloading');

    failInstall(registration, worker);

    expect(controller.getStatus()).toBe('idle');
  });

  it('suit un worker déjà en cours d’installation au démarrage', () => {
    const worker = createWorker('installing');
    const registration = createRegistration({ active: createWorker(), installing: worker });
    const controller = startTracking(registration);
    expect(controller.getStatus()).toBe('downloading');

    finishInstall(registration, worker);

    expect(controller.getStatus()).toBe('ready');
  });

  it('suit un worker déjà en attente au démarrage : son activation ramène à idle', () => {
    const worker = createWorker('installed');
    const registration = createRegistration({ active: createWorker(), waiting: worker });
    const controller = startTracking(registration);
    expect(controller.getStatus()).toBe('ready');

    activateWaiting(registration, worker);

    expect(controller.getStatus()).toBe('idle');
  });

  it('première installation : idle à chaque étape, rien à proposer', () => {
    const registration = createRegistration();
    const controller = startTracking(registration);

    const worker = findUpdate(registration);
    expect(controller.getStatus()).toBe('idle');

    finishInstall(registration, worker);
    expect(controller.getStatus()).toBe('idle');

    activateWaiting(registration, worker);
    expect(controller.getStatus()).toBe('idle');
  });
});

describe('start', () => {
  it('lance exactement une recherche', () => {
    const registration = createRegistration({ active: createWorker() });

    startTracking(registration);

    expect(registration.update).toHaveBeenCalledOnce();
  });

  it('demande une seule fois au worker actif de vérifier son pré-cache', () => {
    const active = createWorker();
    const registration = createRegistration({ active });
    const controller = startTracking(registration);

    startTracking(registration, controller);

    expect(active.postMessage).toHaveBeenCalledExactlyOnceWith(RESTORE_PRECACHE_MESSAGE);
  });

  it('le demande aussi au worker en attente : une version vidée de son cache ne reste pas proposée', () => {
    const waiting = createWorker('installed');

    startTracking(createRegistration({ active: createWorker(), waiting }));

    expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith(RESTORE_PRECACHE_MESSAGE);
  });

  it('première installation : aucun worker actif à qui le demander', () => {
    const installing = createWorker('installing');

    startTracking(createRegistration({ installing }));

    expect(installing.postMessage).not.toHaveBeenCalled();
  });

  it('ignore les appels suivants : ni écouteur ni recherche en plus, autre inscription comprise', () => {
    const registration = createRegistration({ active: createWorker() });
    const other = createRegistration({
      active: createWorker(),
      waiting: createWorker('installed'),
    });
    const onRegistration = vi.spyOn(registration, 'addEventListener');
    const onOther = vi.spyOn(other, 'addEventListener');
    const onContainer = vi.spyOn(container, 'addEventListener');
    const onDocument = vi.spyOn(document, 'addEventListener');
    const onWindow = vi.spyOn(window, 'addEventListener');

    const controller = startTracking(registration);
    startTracking(registration, controller);
    startTracking(other, controller);

    expect(registration.update).toHaveBeenCalledOnce();
    expect(other.update).not.toHaveBeenCalled();
    expect(onRegistration).toHaveBeenCalledOnce();
    expect(onOther).not.toHaveBeenCalled();
    expect(onContainer).toHaveBeenCalledOnce();
    expect(onDocument.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(1);
    expect(onWindow.mock.calls.filter(([type]) => type === 'pageshow')).toHaveLength(1);
    expect(controller.getStatus()).toBe('idle');
  });

  it('un update rejeté ne laisse aucun rejet non géré', async () => {
    const registration = createRegistration({ active: createWorker() });
    registration.update.mockRejectedValue(new TypeError('Failed to update'));
    const controller = createAppUpdateController();

    const rejections = await unhandledRejectionsDuring(() => {
      startTracking(registration, controller);
    });

    expect(registration.update).toHaveBeenCalledOnce();
    expect(rejections).toEqual([]);
    expect(controller.getStatus()).toBe('idle');
  });
});

describe('check', () => {
  it('vaut unreachable avant start', async () => {
    await expect(createAppUpdateController().check()).resolves.toBe('unreachable');
  });

  it.each<[AppUpdateStatus, Workers]>([
    ['idle', { active: createWorker() }],
    ['downloading', { active: createWorker(), installing: createWorker('installing') }],
    ['ready', { active: createWorker(), waiting: createWorker('installed') }],
  ])('vaut unreachable quand update échoue, le statut restant %s', async (status, workers) => {
    const registration = createRegistration(workers);
    const controller = startTracking(registration);
    await settle();
    const listener = vi.fn<() => void>();
    controller.subscribe(listener);
    registration.update.mockRejectedValue(new TypeError('Failed to update'));

    await expect(controller.check()).resolves.toBe('unreachable');

    expect(controller.getStatus()).toBe(status);
    expect(listener).not.toHaveBeenCalled();
  });

  it('vaut up-to-date quand rien de nouveau', async () => {
    const registration = createRegistration({ active: createWorker() });
    const controller = startTracking(registration);
    await settle();

    await expect(controller.check()).resolves.toBe('up-to-date');

    expect(registration.update).toHaveBeenCalledTimes(2);
    expect(controller.getStatus()).toBe('idle');
  });

  it('vaut up-to-date pendant une première installation : rien à proposer', async () => {
    const registration = createRegistration({ installing: createWorker('installing') });
    const controller = startTracking(registration);
    await settle();

    await expect(controller.check()).resolves.toBe('up-to-date');
  });

  it('vaut found quand un worker s’installe, puis suit ce worker jusqu’à ready', async () => {
    const registration = createRegistration({ active: createWorker() });
    const controller = startTracking(registration);
    await settle();
    const worker = createWorker('installing');
    // Comme le navigateur : `update()` se résout avec `installing` à jour, avant `updatefound`.
    registration.update.mockImplementationOnce(() => {
      registration.installing = worker;
      return Promise.resolve();
    });

    await expect(controller.check()).resolves.toBe('found');
    expect(controller.getStatus()).toBe('downloading');

    registration.dispatchEvent(new Event('updatefound'));
    finishInstall(registration, worker);
    expect(controller.getStatus()).toBe('ready');
  });

  it('vaut found quand un worker attend', async () => {
    const registration = createRegistration({ active: createWorker() });
    const controller = startTracking(registration);
    await settle();
    registration.update.mockImplementationOnce(() => {
      registration.waiting = createWorker('installed');
      return Promise.resolve();
    });

    await expect(controller.check()).resolves.toBe('found');

    expect(controller.getStatus()).toBe('ready');
  });

  it('vaut found quand une version attendait déjà au démarrage', async () => {
    const registration = createRegistration({
      active: createWorker(),
      waiting: createWorker('installed'),
    });
    const controller = startTracking(registration);
    await settle();

    await expect(controller.check()).resolves.toBe('found');
  });

  it('prévient les abonnés quand la recherche change le statut', async () => {
    const registration = createRegistration({ active: createWorker() });
    const controller = startTracking(registration);
    await settle();
    const listener = vi.fn<() => void>();
    controller.subscribe(listener);
    registration.update.mockImplementationOnce(() => {
      registration.installing = createWorker('installing');
      return Promise.resolve();
    });

    await controller.check();

    expect(listener).toHaveBeenCalledOnce();
  });

  it('relit l’inscription : un changement survenu sans événement est rattrapé', async () => {
    const registration = createRegistration({
      active: createWorker(),
      installing: createWorker('installing'),
    });
    const controller = startTracking(registration);
    await settle();
    expect(controller.getStatus()).toBe('downloading');

    registration.installing = null;

    await expect(controller.check()).resolves.toBe('up-to-date');
    expect(controller.getStatus()).toBe('idle');
  });
});

describe('première installation à retenter', () => {
  /** `update()` comme le navigateur sur une inscription retirée : refusé, quelle que soit la connexion. */
  function losePage(registration: FakeRegistration): void {
    registration.update.mockRejectedValue(
      new DOMException('Inscription retirée', 'InvalidStateError'),
    );
  }

  /** Démarrage normal d'une première visite, dont l'installation échoue. */
  async function failedFirstInstall(): Promise<{
    controller: AppUpdateController;
    registration: FakeRegistration;
  }> {
    container.controller = null;
    const worker = createWorker('installing');
    const registration = createRegistration({ installing: worker });
    const controller = startTracking(registration);
    await settle();
    failInstall(registration, worker);
    losePage(registration);
    return { controller, registration };
  }

  /** `register()` accepté : l'installation repart sur une nouvelle inscription. */
  function acceptRegister(worker: FakeWorker = createWorker('installing')): FakeRegistration {
    const next = createRegistration({ installing: worker });
    container.register.mockResolvedValue(next);
    return next;
  }

  /** Réponse de `check()` encore en attente ? */
  async function isPending(promise: Promise<unknown>): Promise<boolean> {
    let settled = false;
    void promise.finally(() => {
      settled = true;
    });
    await settle();
    return !settled;
  }

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/mia');
  });

  it('réinscrit au lieu d’appeler update(), et répond à la fin de l’installation', async () => {
    const { controller, registration } = await failedFirstInstall();
    registration.update.mockClear();
    const worker = createWorker('installing');
    const next = acceptRegister(worker);

    const result = controller.check();

    expect(await isPending(result)).toBe(true);
    expect(container.register).toHaveBeenCalledExactlyOnceWith('/mia/sw.js', { scope: '/mia/' });
    expect(registration.update).not.toHaveBeenCalled();

    next.installing = null;
    next.waiting = worker;
    changeState(worker, 'installed');
    await expect(result).resolves.toBe('up-to-date');
  });

  it('vaut unreachable quand la nouvelle installation échoue, et la suivante peut réussir', async () => {
    const { controller } = await failedFirstInstall();
    const worker = createWorker('installing');
    const next = acceptRegister(worker);

    const result = controller.check();
    await settle();
    failInstall(next, worker);
    await expect(result).resolves.toBe('unreachable');

    const retried = createWorker('installed');
    container.register.mockResolvedValue(createRegistration({ waiting: retried }));
    await expect(controller.check()).resolves.toBe('up-to-date');
    expect(container.register).toHaveBeenCalledTimes(2);
  });

  it('vaut unreachable quand register() échoue, sans rien propager', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { controller } = await failedFirstInstall();
    container.register.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(controller.check()).resolves.toBe('unreachable');

    expect(warn).toHaveBeenCalledOnce();
    expect(controller.getStatus()).toBe('idle');
  });

  it('suit la nouvelle inscription : statut, mise à jour suivante et apply', async () => {
    const { controller } = await failedFirstInstall();
    const worker = createWorker('activated');
    const next = createRegistration({ active: worker });
    container.register.mockResolvedValue(next);
    await expect(controller.check()).resolves.toBe('up-to-date');
    expect(next.update).not.toHaveBeenCalled();

    await expect(controller.check()).resolves.toBe('up-to-date');
    expect(next.update).toHaveBeenCalledOnce();

    const newer = findUpdate(next);
    expect(controller.getStatus()).toBe('downloading');
    finishInstall(next, newer);
    expect(controller.getStatus()).toBe('ready');
    controller.apply();
    expect(newer.postMessage).toHaveBeenCalledExactlyOnceWith(SKIP_WAITING_MESSAGE);
  });

  it('le retour au premier plan relance aussi', async () => {
    vi.setSystemTime(new Date(2026, 9, 30, 12, 0));
    const { registration } = await failedFirstInstall();
    registration.update.mockClear();
    acceptRegister(createWorker('installed'));

    vi.setSystemTime(new Date(2026, 9, 30, 12, 1));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();

    expect(registration.update).not.toHaveBeenCalled();
    expect(container.register).toHaveBeenCalledOnce();
  });

  it('une minute après l’échec, relance d’elle-même, une seule fois par page', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    container.controller = null;
    const worker = createWorker('installing');
    const registration = createRegistration({ installing: worker });
    startTracking(registration);
    failInstall(registration, worker);
    const again = createWorker('installing');
    const next = acceptRegister(again);

    vi.advanceTimersByTime(FOREGROUND_CHECK_INTERVAL_MS - 1);
    await flushMicrotasks();
    expect(container.register).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await flushMicrotasks();
    expect(container.register).toHaveBeenCalledOnce();

    // Nouvel échec : plus de relance automatique, il faudrait encore tout retélécharger.
    failInstall(next, again);
    vi.advanceTimersByTime(10 * FOREGROUND_CHECK_INTERVAL_MS);
    await flushMicrotasks();
    expect(container.register).toHaveBeenCalledOnce();
    expect(next.update).not.toHaveBeenCalled();
  });

  it('ne relance pas si une recherche a déjà réparé entre-temps', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    container.controller = null;
    const worker = createWorker('installing');
    const registration = createRegistration({ installing: worker });
    const controller = startTracking(registration);
    failInstall(registration, worker);
    const next = createRegistration({ active: createWorker() });
    container.register.mockResolvedValue(next);
    await controller.check();
    container.register.mockClear();
    next.update.mockClear();

    vi.advanceTimersByTime(FOREGROUND_CHECK_INTERVAL_MS);
    await flushMicrotasks();

    expect(container.register).not.toHaveBeenCalled();
    expect(next.update).not.toHaveBeenCalled();
  });

  it('première visite réussie : aucune relance', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    container.controller = null;
    const worker = createWorker('installing');
    const registration = createRegistration({ installing: worker });
    startTracking(registration);
    finishInstall(registration, worker);
    activateWaiting(registration, worker);

    vi.advanceTimersByTime(10 * FOREGROUND_CHECK_INTERVAL_MS);
    await flushMicrotasks();

    expect(registration.update).toHaveBeenCalledOnce();
    expect(container.register).not.toHaveBeenCalled();
  });

  it('page rechargée par personne : la prise de main de la nouvelle installation ne recharge pas', async () => {
    const { controller } = await failedFirstInstall();
    const worker = createWorker('installed');
    container.register.mockResolvedValue(createRegistration({ waiting: worker }));
    await controller.check();

    container.controller = worker;
    container.dispatchEvent(new Event('controllerchange'));

    expect(reloadPage).not.toHaveBeenCalled();
  });

  describe('register() refusé au lancement', () => {
    it('reste idle, et la recherche retente register() au lieu de rester sans réponse', async () => {
      const controller = createAppUpdateController();
      controller.start(null);
      expect(controller.getStatus()).toBe('idle');
      const worker = createWorker('installed');
      container.register.mockResolvedValue(createRegistration({ waiting: worker }));

      await expect(controller.check()).resolves.toBe('up-to-date');

      expect(container.register).toHaveBeenCalledExactlyOnceWith('/mia/sw.js', { scope: '/mia/' });
    });

    it('vaut unreachable tant que register() échoue', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const controller = createAppUpdateController();
      controller.start(null);
      container.register.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(controller.check()).resolves.toBe('unreachable');
    });

    it('relance d’elle-même une minute plus tard', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      createAppUpdateController().start(null);

      vi.advanceTimersByTime(FOREGROUND_CHECK_INTERVAL_MS - 1);
      await flushMicrotasks();
      expect(container.register).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      await flushMicrotasks();

      expect(container.register).toHaveBeenCalledOnce();
    });

    it('ne compte que le premier démarrage, avec ou sans inscription', () => {
      const registration = createRegistration({ active: createWorker() });
      const controller = createAppUpdateController();

      controller.start(null);
      startTracking(registration, controller);

      expect(registration.update).not.toHaveBeenCalled();
    });
  });
});

describe('apply', () => {
  it('ne fait rien avant start', () => {
    const controller = createAppUpdateController();

    expect(() => {
      controller.apply();
    }).not.toThrow();
  });

  it('ne fait rien sans worker en attente', () => {
    const active = createWorker();
    const installing = createWorker('installing');
    const controller = startTracking(createRegistration({ active, installing }));

    controller.apply();

    expect(active.postMessage).not.toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
    expect(installing.postMessage).not.toHaveBeenCalled();
  });

  it('envoie SKIP_WAITING_MESSAGE au worker en attente, et à lui seul', () => {
    const active = createWorker();
    const waiting = createWorker('installed');
    const installing = createWorker('installing');
    const controller = startTracking(createRegistration({ active, waiting, installing }));
    waiting.postMessage.mockClear();

    controller.apply();

    expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith(SKIP_WAITING_MESSAGE);
    expect(active.postMessage).not.toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
    expect(installing.postMessage).not.toHaveBeenCalled();
  });

  it('un second apply renvoie le message, sans erreur', () => {
    const waiting = createWorker('installed');
    const controller = startTracking(createRegistration({ active: createWorker(), waiting }));
    waiting.postMessage.mockClear();

    controller.apply();
    controller.apply();

    expect(waiting.postMessage.mock.calls).toEqual([
      [SKIP_WAITING_MESSAGE],
      [SKIP_WAITING_MESSAGE],
    ]);
  });

  it('vise le worker en attente au moment de l’appel, pas celui du démarrage', () => {
    const replaced = createWorker('installed');
    const registration = createRegistration({ active: createWorker(), waiting: replaced });
    const controller = startTracking(registration);
    const newest = findUpdate(registration);
    finishInstall(registration, newest);
    changeState(replaced, 'redundant');

    controller.apply();

    expect(newest.postMessage).toHaveBeenCalledExactlyOnceWith(SKIP_WAITING_MESSAGE);
    expect(replaced.postMessage).not.toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
  });
});

describe('rechargement au changement de worker', () => {
  function changeController(worker: FakeWorker = createWorker()): void {
    container.controller = worker;
    container.dispatchEvent(new Event('controllerchange'));
  }

  it('page contrôlée au démarrage : recharge, une seule fois même après deux événements', () => {
    startTracking(createRegistration({ active: createWorker() }));
    expect(reloadPage).not.toHaveBeenCalled();

    changeController();
    expect(reloadPage).toHaveBeenCalledOnce();

    changeController();
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('page sans worker au démarrage (première visite, clients.claim()) : le premier événement ne recharge pas, le suivant si', () => {
    container.controller = null;
    startTracking(createRegistration());

    changeController();
    expect(reloadPage).not.toHaveBeenCalled();

    // La page a maintenant un worker : une mise à jour acceptée dans un autre onglet la concerne.
    changeController();
    expect(reloadPage).toHaveBeenCalledOnce();

    changeController();
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('page sans worker au démarrage mais apply appelé : recharge dès le premier événement', () => {
    container.controller = null;
    const controller = startTracking(createRegistration({ waiting: createWorker('installed') }));

    controller.apply();
    expect(reloadPage).not.toHaveBeenCalled();

    changeController();
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('page sans worker au démarrage et apply sans effet : le premier événement ne recharge pas', () => {
    container.controller = null;
    const controller = startTracking(createRegistration());

    controller.apply();
    changeController();

    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('page sans contrôleur mais worker actif (rechargement forcé) : son remplacement recharge', () => {
    container.controller = null;
    startTracking(createRegistration({ active: createWorker() }));

    changeController();

    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('page sans contrôleur que le worker actif réclame (pré-cache refait) : pas de rechargement, jusqu’à son remplacement', () => {
    const active = createWorker();
    container.controller = null;
    startTracking(createRegistration({ active }));

    changeController(active);
    expect(reloadPage).not.toHaveBeenCalled();

    changeController();
    expect(reloadPage).toHaveBeenCalledOnce();
  });
});

/** WebKit, retour du cache de navigation (bfcache) : seul l'état du worker change, sans `controllerchange`. */
describe('worker de la page devenu redundant', () => {
  it('recharge une seule fois, y compris si controllerchange suit', () => {
    const worker = createWorker();
    container.controller = worker;
    startTracking(createRegistration({ active: worker }));

    changeState(worker, 'redundant');
    expect(reloadPage).toHaveBeenCalledOnce();

    container.controller = createWorker();
    container.dispatchEvent(new Event('controllerchange'));
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('page sans contrôleur (rechargement forcé) : suit le worker actif', () => {
    const active = createWorker();
    container.controller = null;
    startTracking(createRegistration({ active }));

    changeState(active, 'redundant');

    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('première visite : suit le worker qui a pris la main', () => {
    const first = createWorker();
    container.controller = null;
    startTracking(createRegistration());

    container.controller = first;
    container.dispatchEvent(new Event('controllerchange'));
    expect(reloadPage).not.toHaveBeenCalled();

    changeState(first, 'redundant');
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('ne recharge pas pour un autre état du worker de la page', () => {
    const worker = createWorker('activating');
    container.controller = worker;
    startTracking(createRegistration({ active: worker }));

    changeState(worker, 'activated');

    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('ne recharge pas pour un autre worker devenu redundant (installation échouée, version remplacée)', () => {
    const registration = createRegistration({ active: createWorker() });
    startTracking(registration);

    failInstall(registration, findUpdate(registration));

    expect(reloadPage).not.toHaveBeenCalled();
  });
});

describe('retour par le cache de navigation (bfcache)', () => {
  function showPage(persisted: boolean): void {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }));
  }

  it('une version trouvée pendant le sommeil de la page devient prête', () => {
    const registration = createRegistration({ active: createWorker() });
    const controller = startTracking(registration);
    const listener = vi.fn<() => void>();
    controller.subscribe(listener);
    registration.waiting = createWorker('installed');

    showPage(true);

    expect(controller.getStatus()).toBe('ready');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('une version prête au départ, activée entre-temps, n’est plus proposée', () => {
    const registration = createRegistration({
      active: createWorker(),
      waiting: createWorker('installed'),
    });
    const controller = startTracking(registration);
    expect(controller.getStatus()).toBe('ready');
    registration.waiting = null;

    showPage(true);

    expect(controller.getStatus()).toBe('idle');
  });

  it('ne relit rien au chargement normal de la page', () => {
    const registration = createRegistration({ active: createWorker() });
    const controller = startTracking(registration);
    registration.waiting = createWorker('installed');

    showPage(false);

    expect(controller.getStatus()).toBe('idle');
  });

  it('ne lance aucune recherche de plus', () => {
    const registration = createRegistration({ active: createWorker() });
    startTracking(registration);
    expect(registration.update).toHaveBeenCalledOnce();

    showPage(true);

    expect(registration.update).toHaveBeenCalledOnce();
  });
});

describe('recherche au retour au premier plan', () => {
  const NOW = new Date(2026, 9, 30, 12, 0).getTime();

  function setVisibility(state: DocumentVisibilityState): void {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  beforeEach(() => {
    vi.setSystemTime(NOW);
  });

  it('cherche une fois de plus quand l’intervalle est écoulé', () => {
    const registration = createRegistration({ active: createWorker() });
    startTracking(registration);
    expect(registration.update).toHaveBeenCalledOnce();

    vi.setSystemTime(NOW + FOREGROUND_CHECK_INTERVAL_MS);
    setVisibility('visible');

    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it('ne cherche pas avant la fin de l’intervalle', () => {
    const registration = createRegistration({ active: createWorker() });
    startTracking(registration);

    vi.setSystemTime(NOW + FOREGROUND_CHECK_INTERVAL_MS - 1);
    setVisibility('visible');

    expect(registration.update).toHaveBeenCalledOnce();
  });

  it('ne cherche pas tant que la page reste cachée', () => {
    const registration = createRegistration({ active: createWorker() });
    startTracking(registration);

    vi.setSystemTime(NOW + FOREGROUND_CHECK_INTERVAL_MS);
    setVisibility('hidden');
    expect(registration.update).toHaveBeenCalledOnce();

    setVisibility('visible');
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it('compte l’intervalle depuis la dernière recherche, manuelle ou non', async () => {
    const registration = createRegistration({ active: createWorker() });
    const controller = startTracking(registration);

    vi.setSystemTime(NOW + FOREGROUND_CHECK_INTERVAL_MS - 1);
    await controller.check();
    expect(registration.update).toHaveBeenCalledTimes(2);

    vi.setSystemTime(NOW + FOREGROUND_CHECK_INTERVAL_MS);
    setVisibility('visible');
    expect(registration.update).toHaveBeenCalledTimes(2);

    vi.setSystemTime(NOW + 2 * FOREGROUND_CHECK_INTERVAL_MS - 1);
    setVisibility('visible');
    expect(registration.update).toHaveBeenCalledTimes(3);

    setVisibility('visible');
    expect(registration.update).toHaveBeenCalledTimes(3);
  });

  it('un update rejeté ne laisse aucun rejet non géré et compte comme une recherche', async () => {
    const registration = createRegistration({ active: createWorker() });
    const controller = startTracking(registration);
    await settle();
    registration.update.mockRejectedValue(new TypeError('Failed to update'));

    const rejections = await unhandledRejectionsDuring(() => {
      vi.setSystemTime(NOW + FOREGROUND_CHECK_INTERVAL_MS);
      setVisibility('visible');
    });

    expect(registration.update).toHaveBeenCalledTimes(2);
    expect(rejections).toEqual([]);
    expect(controller.getStatus()).toBe('idle');

    setVisibility('visible');
    expect(registration.update).toHaveBeenCalledTimes(2);
  });
});

describe('repairApp', () => {
  /** Déroulé de la réparation : chaque étape s'inscrit une fois terminée. */
  let log: string[];
  let deleteCache: Mock<(name: string) => Promise<boolean>>;
  let worker: FakeWorker;
  let registration: FakeRegistration;

  /** Installation neuve qui se termine bien, activation comprise. */
  function finishRepairInstall(): void {
    registration.installing = null;
    registration.waiting = worker;
    log.push('installed');
    changeState(worker, 'installed');
  }

  function activate(): void {
    registration.waiting = null;
    registration.active = worker;
    log.push('activated');
    changeState(worker, 'activated');
  }

  /** Lance la réparation et la laisse avancer jusqu'à la prochaine attente. */
  async function start(): Promise<{ pending: Promise<AppRepairResult> }> {
    const pending = repairApp();
    await settle();
    return { pending };
  }

  beforeEach(() => {
    log = [];
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/mia');
    worker = createWorker('installing');
    registration = createRegistration({ active: createWorker(), installing: worker });
    container.register.mockImplementation(() => {
      log.push('register');
      return Promise.resolve(registration);
    });
    worker.postMessage.mockImplementation((message) => {
      log.push(String(message));
    });
    deleteCache = vi.fn(() => {
      log.push('delete');
      return Promise.resolve(true);
    });
    vi.stubGlobal('caches', {
      keys: () => Promise.resolve(['mia-precache-1a2b3c4d']),
      delete: deleteCache,
    });
    reloadPage.mockImplementation(() => {
      log.push('reload');
    });
  });

  it('installe sous une URL neuve, prend la main une fois tout téléchargé, puis recharge', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1730000000000);

    const pending = repairApp();
    await settle();
    expect(container.register).toHaveBeenCalledExactlyOnceWith('/mia/sw.js?repair=1730000000000', {
      scope: '/mia/',
    });
    expect(worker.postMessage).not.toHaveBeenCalled();

    finishRepairInstall();
    await settle();
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith(SKIP_WAITING_MESSAGE);
    expect(reloadPage).not.toHaveBeenCalled();

    activate();
    await expect(pending).resolves.toBe('reloading');
    expect(log).toEqual(['register', 'installed', SKIP_WAITING_MESSAGE, 'activated', 'reload']);
  });

  it('ne supprime rien de lui-même : l’activation du remplaçant purge les autres versions', async () => {
    const { pending } = await start();
    finishRepairInstall();
    await settle();
    activate();
    await pending;

    expect(deleteCache).not.toHaveBeenCalled();
    expect(container.getRegistration).not.toHaveBeenCalled();
  });

  it('continue quand l’installation est déjà finie au retour de register()', async () => {
    worker.state = 'installed';
    registration.installing = null;
    registration.waiting = worker;

    const { pending } = await start();
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith(SKIP_WAITING_MESSAGE);
    activate();

    await expect(pending).resolves.toBe('reloading');
  });

  it('recharge aussi quand le remplaçant est aussitôt remplacé (une version plus récente)', async () => {
    const { pending } = await start();
    finishRepairInstall();
    await settle();
    changeState(worker, 'redundant');

    await expect(pending).resolves.toBe('reloading');
  });

  it.each<[string, () => void]>([
    [
      'le réseau est coupé',
      () => {
        container.register.mockRejectedValue(new TypeError('Failed to fetch'));
      },
    ],
    [
      'sw.js répond 503 ou n’est pas un script',
      () => {
        container.register.mockRejectedValue(new DOMException('Bad MIME', 'SecurityError'));
      },
    ],
    ['les service workers manquent', removeServiceWorker],
  ])('vaut unreachable quand %s : rien n’est supprimé ni rechargé', async (_label, arrange) => {
    arrange();

    await expect(repairApp()).resolves.toBe('unreachable');

    expect(deleteCache).not.toHaveBeenCalled();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('vaut unreachable quand un fichier manque pendant l’installation : l’ancienne version reste', async () => {
    const { pending } = await start();

    failInstall(registration, worker);

    await expect(pending).resolves.toBe('unreachable');
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(deleteCache).not.toHaveBeenCalled();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('vaut unreachable si sw.js ne répond jamais, au lieu d’attendre sans message', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    container.register.mockImplementation(() => new Promise(() => undefined));

    const pending = repairApp();
    vi.advanceTimersByTime(REPAIR_SCRIPT_TIMEOUT_MS);

    await expect(pending).resolves.toBe('unreachable');
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('ne touche pas à la sauvegarde (localStorage)', async () => {
    localStorage.setItem(STORAGE_KEY, '{"schemaVersion":1}');
    localStorage.setItem(BACKUP_STORAGE_KEY, 'copie');

    const { pending } = await start();
    finishRepairInstall();
    await settle();
    activate();
    await expect(pending).resolves.toBe('reloading');

    expect(localStorage).toHaveLength(2);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{"schemaVersion":1}');
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBe('copie');
  });

  it('sans basePath : /sw.js et le scope /', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', undefined);
    vi.spyOn(Date, 'now').mockReturnValue(1730000000000);

    const { pending } = await start();

    expect(container.register).toHaveBeenCalledExactlyOnceWith('/sw.js?repair=1730000000000', {
      scope: '/',
    });
    finishRepairInstall();
    await settle();
    activate();
    await pending;
  });

  it('première installation perdue : le remplaçant s’active seul', async () => {
    registration.active = null;

    const { pending } = await start();
    finishRepairInstall();
    await settle();
    activate();

    await expect(pending).resolves.toBe('reloading');
  });
});

describe('getAppVersion', () => {
  it('renvoie la version injectée au build', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.2.3');

    expect(getAppVersion()).toBe('1.2.3');
  });

  it('renvoie « inconnue » quand elle manque', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', undefined);

    expect(getAppVersion()).toBe('inconnue');
  });
});

describe('reloadPage', () => {
  it('recharge la page courante', async () => {
    const actual = await vi.importActual<{ reloadPage: () => void }>('@/core/pwa/reloadPage');
    const reload = vi.fn<() => void>();
    vi.stubGlobal('location', { reload });

    actual.reloadPage();

    expect(reload).toHaveBeenCalledOnce();
  });
});

describe('reloadToHub', () => {
  it.each([
    ['sans basePath (APK)', '', '/'],
    ['sous le basePath de GitHub Pages', '/mia', '/mia/'],
  ])('remplace la page courante par le Hub, %s', async (_label, basePath, expected) => {
    const actual = await vi.importActual<{ reloadToHub: () => void }>('@/core/pwa/reloadPage');
    const replace = vi.fn<(url: string) => void>();
    vi.stubGlobal('location', { replace });
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', basePath);

    actual.reloadToHub();

    expect(replace).toHaveBeenCalledExactlyOnceWith(expected);
  });
});

describe('useAppUpdateStatus', () => {
  function StatusProbe(): string {
    return useAppUpdateStatus();
  }

  // Le singleton ne démarre qu'une fois par page : seul ce test l'utilise pour de vrai.
  it('renvoie le statut du singleton et suit ses changements', async () => {
    const registration = createRegistration({ active: createWorker() });
    const { result } = renderHook(() => useAppUpdateStatus());
    expect(result.current).toBe('idle');

    await act(async () => {
      startTracking(registration, appUpdate);
      await settle();
    });
    expect(result.current).toBe('idle');

    const worker = createWorker('installing');
    act(() => {
      findUpdate(registration, worker);
    });
    expect(result.current).toBe('downloading');

    act(() => {
      finishInstall(registration, worker);
    });
    expect(result.current).toBe('ready');
    expect(appUpdate.getStatus()).toBe('ready');
  });

  it('vaut unsupported au pré-rendu, quel que soit le statut du singleton', () => {
    vi.spyOn(appUpdate, 'getStatus').mockReturnValue('ready');

    expect(renderToString(createElement(StatusProbe))).toBe('unsupported');
  });
});

describe('next.config.ts', () => {
  it('injecte la version de package.json dans NEXT_PUBLIC_APP_VERSION', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    expect(nextConfig.env?.NEXT_PUBLIC_APP_VERSION).toBe(version);
  });
});
