import { appUpdate } from '@/core/pwa/appUpdate';
import {
  deletePrecaches,
  readServiceWorkerEnvironment,
  registerServiceWorker,
  shouldRegisterServiceWorker,
  shouldUnregisterStaleServiceWorkers,
  unregisterStaleServiceWorkers,
  type ServiceWorkerEnvironment,
} from '@/core/pwa/registerServiceWorker';
import { ServiceWorkerRegistrar } from '@/core/pwa/ServiceWorkerRegistrar';
import { render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';

/** Plateforme simulée : `true` pour l'APK Capacitor. */
const platform = vi.hoisted(() => ({ native: false }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform.native },
}));

const registration = { scope: 'https://youtix.github.io/mia/' };
const register = vi.fn<(url: string, options?: RegistrationOptions) => Promise<unknown>>();

/** Inscription laissée par un `npm start` précédent, à désinscrire en développement. */
interface StaleRegistration {
  unregister: Mock<() => Promise<boolean>>;
}

const getRegistrations = vi.fn<() => Promise<StaleRegistration[]>>();

function staleRegistration(): StaleRegistration {
  return { unregister: vi.fn(() => Promise.resolve(true)) };
}

/** jsdom n'expose pas `navigator.serviceWorker` : on le simule, et on le retire après chaque test. */
function stubServiceWorker(): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register, getRegistrations },
  });
}

function removeServiceWorker(): void {
  Reflect.deleteProperty(navigator, 'serviceWorker');
}

/** jsdom n'expose pas `caches` non plus : CacheStorage simulé (noms présents, suppression). */
function stubCaches(names: string[]): Mock<(name: string) => Promise<boolean>> {
  const remove = vi.fn((name: string) => Promise.resolve(names.includes(name)));
  vi.stubGlobal('caches', { keys: () => Promise.resolve(names), delete: remove });
  return remove;
}

function setReadyState(state: DocumentReadyState): void {
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => state });
}

/** Laisse s'achever les promesses en cours : sans cela, « jamais appelé » ne prouverait rien. */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const web: ServiceWorkerEnvironment = {
  nodeEnv: 'production',
  isNativePlatform: false,
  supportsServiceWorker: true,
};

describe('shouldRegisterServiceWorker', () => {
  it('accepte seulement la production, dans un navigateur Web avec service workers', () => {
    expect(shouldRegisterServiceWorker(web)).toBe(true);
  });

  it.each([
    ['en développement', { nodeEnv: 'development' }],
    ['sans NODE_ENV', { nodeEnv: undefined }],
    ['dans l’APK Capacitor', { isNativePlatform: true }],
    ['sans support des service workers', { supportsServiceWorker: false }],
  ])('refuse %s', (_label, overrides: Partial<ServiceWorkerEnvironment>) => {
    expect(shouldRegisterServiceWorker({ ...web, ...overrides })).toBe(false);
  });
});

describe('shouldUnregisterStaleServiceWorkers', () => {
  it.each([
    ['en développement', { nodeEnv: 'development' }],
    ['sans NODE_ENV', { nodeEnv: undefined }],
  ])('désinscrit %s, dans un navigateur Web avec service workers', (_label, overrides) => {
    expect(shouldUnregisterStaleServiceWorkers({ ...web, ...overrides })).toBe(true);
  });

  it.each([
    ['en production', {}],
    ['dans l’APK Capacitor', { nodeEnv: 'development', isNativePlatform: true }],
    ['sans support des service workers', { nodeEnv: 'development', supportsServiceWorker: false }],
  ])('ne désinscrit rien %s', (_label, overrides: Partial<ServiceWorkerEnvironment>) => {
    expect(shouldUnregisterStaleServiceWorkers({ ...web, ...overrides })).toBe(false);
  });
});

describe('readServiceWorkerEnvironment', () => {
  beforeEach(() => {
    platform.native = false;
    stubServiceWorker();
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    removeServiceWorker();
  });

  it('décrit un navigateur Web en production', () => {
    expect(readServiceWorkerEnvironment()).toEqual(web);
  });

  it('relit NODE_ENV, la plateforme et le support des service workers à chaque appel', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(readServiceWorkerEnvironment()).toEqual({ ...web, nodeEnv: 'development' });

    platform.native = true;
    expect(readServiceWorkerEnvironment()).toEqual({
      ...web,
      nodeEnv: 'development',
      isNativePlatform: true,
    });

    removeServiceWorker();
    expect(readServiceWorkerEnvironment()).toEqual({
      nodeEnv: 'development',
      isNativePlatform: true,
      supportsServiceWorker: false,
    });
  });

  it('se passe de navigator quand il n’existe pas', () => {
    vi.stubGlobal('navigator', undefined);

    expect(readServiceWorkerEnvironment()).toEqual({ ...web, supportsServiceWorker: false });
  });
});

describe('deletePrecaches', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ne supprime que les caches mia-precache-*, jamais ceux des autres applications', async () => {
    const remove = stubCaches([
      'mia-precache-1a2b3c4d',
      'autre-cache',
      'mia-precache-ffffffff',
      'workbox-precache-v2',
      'mia-autre',
      'autre-mia-precache-1a2b3c4d',
    ]);

    await expect(deletePrecaches()).resolves.toBeUndefined();

    expect(remove.mock.calls).toEqual([['mia-precache-1a2b3c4d'], ['mia-precache-ffffffff']]);
  });

  it('ne supprime rien quand aucun cache n’appartient à Mia', async () => {
    const remove = stubCaches(['autre-cache']);

    await expect(deletePrecaches()).resolves.toBeUndefined();

    expect(remove).not.toHaveBeenCalled();
  });

  it('se passe de CacheStorage quand le navigateur ne l’expose pas (contexte non sécurisé)', async () => {
    expect(typeof caches).toBe('undefined');

    await expect(deletePrecaches()).resolves.toBeUndefined();
  });
});

describe('registerServiceWorker', () => {
  beforeEach(() => {
    platform.native = false;
    register.mockReset();
    register.mockResolvedValue(registration);
    getRegistrations.mockReset();
    getRegistrations.mockResolvedValue([]);
    stubServiceWorker();
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    removeServiceWorker();
  });

  it('enregistre /mia/sw.js sur le scope /mia/ avec NEXT_PUBLIC_BASE_PATH=/mia', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/mia');

    await expect(registerServiceWorker()).resolves.toBe(registration);
    expect(register).toHaveBeenCalledExactlyOnceWith('/mia/sw.js', { scope: '/mia/' });
  });

  it('enregistre /sw.js sur le scope / sans basePath', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', undefined);

    await expect(registerServiceWorker()).resolves.toBe(registration);
    expect(register).toHaveBeenCalledExactlyOnceWith('/sw.js', { scope: '/' });
  });

  it('lit NEXT_PUBLIC_BASE_PATH à chaque appel', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    await registerServiceWorker();
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/mia');
    await registerServiceWorker();

    expect(register.mock.calls).toEqual([
      ['/sw.js', { scope: '/' }],
      ['/mia/sw.js', { scope: '/mia/' }],
    ]);
  });

  it('ne désinscrit rien en production', async () => {
    const remove = stubCaches(['mia-precache-1a2b3c4d']);

    await expect(registerServiceWorker()).resolves.toBe(registration);
    expect(getRegistrations).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('n’enregistre rien dans l’APK Capacitor', async () => {
    platform.native = true;

    await expect(registerServiceWorker()).resolves.toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it('n’enregistre rien dans un navigateur sans service workers', async () => {
    removeServiceWorker();

    await expect(registerServiceWorker()).resolves.toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it('journalise un échec d’enregistrement sans le propager', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failure = new Error('SecurityError');
    register.mockRejectedValue(failure);

    await expect(registerServiceWorker()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('non enregistré'),
      failure,
    );
  });

  describe('hors production (next dev)', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    it('n’enregistre rien, désinscrit les service workers laissés par npm start et purge leurs caches', async () => {
      const stale = [staleRegistration(), staleRegistration()];
      getRegistrations.mockResolvedValue(stale);
      const remove = stubCaches(['mia-precache-1a2b3c4d', 'autre-cache', 'mia-precache-ffffffff']);

      await expect(registerServiceWorker()).resolves.toBeNull();

      expect(register).not.toHaveBeenCalled();
      for (const { unregister } of stale) expect(unregister).toHaveBeenCalledOnce();
      expect(remove.mock.calls).toEqual([['mia-precache-1a2b3c4d'], ['mia-precache-ffffffff']]);
    });

    it('se passe de CacheStorage quand le navigateur ne l’expose pas (contexte non sécurisé)', async () => {
      const stale = staleRegistration();
      getRegistrations.mockResolvedValue([stale]);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(typeof caches).toBe('undefined');

      await expect(registerServiceWorker()).resolves.toBeNull();

      expect(stale.unregister).toHaveBeenCalledOnce();
      expect(warn).not.toHaveBeenCalled();
    });

    it('ne désinscrit rien dans l’APK Capacitor', async () => {
      platform.native = true;
      const remove = stubCaches(['mia-precache-1a2b3c4d']);

      await expect(registerServiceWorker()).resolves.toBeNull();

      expect(getRegistrations).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it('ne tente rien dans un navigateur sans service workers', async () => {
      removeServiceWorker();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await expect(registerServiceWorker()).resolves.toBeNull();

      expect(getRegistrations).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    it('journalise un échec de désinscription sans le propager', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const failure = new Error('InvalidStateError');
      getRegistrations.mockRejectedValue(failure);

      await expect(registerServiceWorker()).resolves.toBeNull();

      expect(warn).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('non désinscrits'),
        failure,
      );
    });

    it('journalise un échec de purge des caches sans le propager', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const failure = new Error('QuotaExceededError');
      vi.stubGlobal('caches', { keys: () => Promise.reject(failure), delete: vi.fn() });

      await expect(unregisterStaleServiceWorkers()).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('non désinscrits'),
        failure,
      );
    });
  });
});

describe('ServiceWorkerRegistrar', () => {
  /** Le suivi a ses propres tests (`pwa-update.test.ts`) : seul son démarrage compte ici. */
  let start: MockInstance<typeof appUpdate.start>;

  beforeEach(() => {
    platform.native = false;
    register.mockReset();
    register.mockResolvedValue(registration);
    getRegistrations.mockReset();
    getRegistrations.mockResolvedValue([]);
    stubServiceWorker();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/mia');
    start = vi.spyOn(appUpdate, 'start').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    removeServiceWorker();
    Reflect.deleteProperty(document, 'readyState');
  });

  it('ne rend rien et attend l’événement load avant d’enregistrer', async () => {
    setReadyState('loading');
    const { container } = render(createElement(ServiceWorkerRegistrar));

    expect(container).toBeEmptyDOMElement();
    expect(register).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(register).toHaveBeenCalledExactlyOnceWith('/mia/sw.js', { scope: '/mia/' });
    });
  });

  it('enregistre immédiatement quand la page est déjà chargée', async () => {
    setReadyState('complete');
    render(createElement(ServiceWorkerRegistrar));

    await waitFor(() => {
      expect(register).toHaveBeenCalledExactlyOnceWith('/mia/sw.js', { scope: '/mia/' });
    });
  });

  it('retire l’écouteur load au démontage', () => {
    setReadyState('loading');
    const { unmount } = render(createElement(ServiceWorkerRegistrar));

    unmount();
    window.dispatchEvent(new Event('load'));

    expect(register).not.toHaveBeenCalled();
  });

  it('désinscrit les anciens service workers une fois la page chargée, hors production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const stale = staleRegistration();
    getRegistrations.mockResolvedValue([stale]);
    setReadyState('complete');

    render(createElement(ServiceWorkerRegistrar));

    await waitFor(() => {
      expect(stale.unregister).toHaveBeenCalledOnce();
    });
    expect(register).not.toHaveBeenCalled();
  });

  describe('suivi des mises à jour', () => {
    it('démarre avec l’inscription obtenue, une fois la page chargée', async () => {
      setReadyState('loading');
      render(createElement(ServiceWorkerRegistrar));
      await flushPromises();
      expect(start).not.toHaveBeenCalled();

      window.dispatchEvent(new Event('load'));

      await waitFor(() => {
        expect(start).toHaveBeenCalledExactlyOnceWith(registration);
      });
    });

    it('démarre avec l’inscription obtenue quand la page est déjà chargée', async () => {
      setReadyState('complete');
      render(createElement(ServiceWorkerRegistrar));

      await waitFor(() => {
        expect(start).toHaveBeenCalledExactlyOnceWith(registration);
      });
    });

    it('ne démarre pas quand l’enregistrement échoue', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      register.mockRejectedValue(new Error('SecurityError'));
      setReadyState('complete');

      render(createElement(ServiceWorkerRegistrar));
      await waitFor(() => {
        expect(warn).toHaveBeenCalledOnce();
      });
      await flushPromises();

      expect(start).not.toHaveBeenCalled();
    });

    it('ne démarre pas en développement', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      setReadyState('complete');

      render(createElement(ServiceWorkerRegistrar));
      await waitFor(() => {
        expect(getRegistrations).toHaveBeenCalledOnce();
      });
      await flushPromises();

      expect(start).not.toHaveBeenCalled();
    });

    it('ne démarre pas dans l’APK Capacitor', async () => {
      platform.native = true;
      setReadyState('complete');

      render(createElement(ServiceWorkerRegistrar));
      await flushPromises();

      expect(register).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    });
  });
});
