// @vitest-environment node
import { RESTORE_PRECACHE_MESSAGE, SKIP_WAITING_MESSAGE } from '@/core/pwa/precache';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

/**
 * Le service worker (src/core/pwa/sw/**) est exclu du programme TypeScript racine (lib `webworker`)
 * et de la couverture : il n'est pas importé, mais bundlé par esbuild comme dans
 * scripts/build-sw.ts, puis exécuté dans un contexte `node:vm` qui simule le contexte service worker
 * (`self`, `caches`, `fetch`) avec les `Request` / `Response` / `URL` / `Headers` de Node.
 */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCOPE = 'https://youtix.github.io/mia/';
const CACHE_NAME = 'mia-precache-test';

/** Même empreinte que scripts/build-sw.ts : 8 premiers caractères hexadécimaux du SHA-256. */
function revisionOf(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 8);
}

/** Corps d'un fichier dans le réseau simulé : distinct par URL, pour tracer d'où vient ce qui est servi. */
function networkBody(url: string): string {
  return `contenu de ${url}`;
}

/** Entrée dont la révision est celle du fichier servi par le réseau simulé, comme dans un vrai build. */
function exactEntry(url: string): { url: string; revision: string } {
  return { url, revision: revisionOf(networkBody(new URL(url, SCOPE).href)) };
}

/** Manifeste réduit, injecté comme le ferait scripts/build-sw.ts à partir de l'export statique. */
const PRECACHE_ENTRIES = [
  exactEntry('404.html'),
  exactEntry('_next/static/chunks/app.js'),
  exactEntry('icons/icon-192.png'),
  exactEntry('index.html'),
  exactEntry('index.txt'),
  exactEntry('memory/index.html'),
  exactEntry('memory/index.txt'),
  { url: 'sans-revision.json', revision: '' },
  exactEntry('settings/index.html'),
];

/** Deux fichiers que les tests de copie placent dans le cache d'une autre version. */
const COPYABLE_URLS = ['_next/static/chunks/app.js', 'icons/icon-192.png'];

type FetchMock = Mock<(request: Request) => Promise<Response>>;
type Listener = (event: unknown) => void;

function absoluteUrl(key: string): string {
  return new URL(key, SCOPE).href;
}

/** Réponse du réseau simulé. */
function networkResponse(request: Request): Response {
  return new Response(networkBody(request.url), { headers: { 'content-type': 'text/html' } });
}

/** Corps d'une entrée telle que pré-cachée à l'installation (voir `networkResponse`). */
function precachedBody(key: string): string {
  return networkBody(absoluteUrl(key));
}

/** `redirected` est en lecture seule et ne se construit pas : simulé sur une vraie `Response`. */
function markRedirected(response: Response): Response {
  Object.defineProperty(response, 'redirected', { value: true });
  return response;
}

function navigation(url: string, init?: RequestInit): Request {
  // Le constructeur refuse `mode: 'navigate'` : posé après coup, comme `redirected`.
  const request = new Request(new URL(url, SCOPE).href, init);
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  return request;
}

function asset(url: string, init?: RequestInit): Request {
  return new Request(new URL(url, SCOPE).href, init);
}

function bodyOf(response: Response | null): Promise<string> {
  if (!response) return Promise.reject(new Error('respondWith non appelé'));
  return response.text();
}

/** Statut, indicateur de redirection et en-têtes d'une réponse, pour une comparaison explicite. */
function describeResponse(response: Response | null) {
  if (!response) throw new Error('respondWith non appelé');
  return {
    status: response.status,
    statusText: response.statusText,
    redirected: response.redirected,
    headers: [...response.headers],
  };
}

interface MemoryCache {
  /** Réponses stockées par URL absolue. */
  responses: Map<string, Response>;
  put(url: string, response: Response): Promise<void>;
  match(url: string | Request): Promise<Response | undefined>;
  keys(): Promise<string[]>;
}

/**
 * Cache en mémoire : comme l'API Cache, `match` rend un clone, et `put` refuse une réponse dont le
 * corps a déjà été lu (le worker doit vérifier les octets d'une copie, pas de l'original).
 */
function createMemoryCache(): MemoryCache {
  const responses = new Map<string, Response>();
  return {
    responses,
    put(url, response) {
      if (response.bodyUsed) return Promise.reject(new TypeError('Corps de la réponse déjà lu'));
      responses.set(url, response);
      return Promise.resolve();
    },
    match(url) {
      const stored = responses.get(typeof url === 'string' ? url : url.url);
      if (!stored) return Promise.resolve(undefined);
      const clone = stored.clone();
      return Promise.resolve(stored.redirected ? markRedirected(clone) : clone);
    },
    keys: () => Promise.resolve([...responses.keys()]),
  };
}

interface MemoryCacheStorage {
  open(name: string): Promise<MemoryCache>;
  has(name: string): Promise<boolean>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

function createCacheStorage(log: string[]): MemoryCacheStorage {
  const store = new Map<string, MemoryCache>();
  return {
    open(name) {
      const cache = store.get(name) ?? createMemoryCache();
      store.set(name, cache);
      return Promise.resolve(cache);
    },
    has: (name) => Promise.resolve(store.has(name)),
    keys: () => Promise.resolve([...store.keys()]),
    delete(name) {
      log.push(`delete ${name}`);
      return Promise.resolve(store.delete(name));
    },
  };
}

interface ServiceWorkerHarness {
  fetchMock: FetchMock;
  cacheStorage: MemoryCacheStorage;
  claim: Mock<() => Promise<void>>;
  skipWaiting: Mock<() => Promise<void>>;
  /** Suppressions de caches et `clients.claim()`, dans l'ordre. */
  log: string[];
  install(): Promise<void>;
  activate(): Promise<void>;
  /** Soumet un message au gestionnaire `message` ; renvoie les promesses passées à `waitUntil`. */
  dispatchMessage(data: unknown): Promise<unknown>[];
  /** Soumet une requête au gestionnaire `fetch` ; `null` si `respondWith` n'a pas été appelé. */
  dispatchFetch(request: Request): Promise<Response | null>;
  /** Le cache de la version courante. */
  precache(): Promise<MemoryCache>;
  /** Un autre worker devient l'actif : celui-ci n'attend plus que son tour. */
  becomeWaiting(): void;
}

let bundle = '';

beforeAll(async () => {
  // Mêmes options que scripts/build-sw.ts (bundle iife, cibles, tsconfig du worker, define).
  const result = await build({
    entryPoints: [join(ROOT, 'src/core/pwa/sw/service-worker.ts')],
    tsconfig: join(ROOT, 'src/core/pwa/sw/tsconfig.json'),
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['chrome111', 'safari16.4'],
    define: {
      __MIA_PRECACHE__: JSON.stringify(PRECACHE_ENTRIES),
      __MIA_CACHE_NAME__: JSON.stringify(CACHE_NAME),
    },
    logLevel: 'silent',
  });
  const [output] = result.outputFiles;
  if (!output) throw new Error('esbuild n’a produit aucun fichier');
  bundle = output.text;
});

/** Exécute le bundle dans un contexte service worker simulé, neuf pour chaque test. */
function createHarness(): ServiceWorkerHarness {
  const listeners = new Map<string, Listener[]>();
  const log: string[] = [];
  const fetchMock: FetchMock = vi.fn();
  const cacheStorage = createCacheStorage(log);
  const thisWorker = { name: 'ce worker' };
  const registration = { scope: SCOPE, active: thisWorker as object };
  const claim = vi.fn(() => {
    // Comme la spécification : seul le worker actif peut réclamer les pages.
    if (registration.active !== thisWorker) {
      return Promise.reject(new DOMException('Worker non actif', 'InvalidStateError'));
    }
    log.push('claim');
    return Promise.resolve();
  });
  const skipWaiting = vi.fn(() => Promise.resolve());
  // Comme Firefox, sans `self.serviceWorker` : le worker ne sait pas lui-même s'il est l'actif.
  const workerGlobal = {
    registration,
    clients: { claim },
    skipWaiting,
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
  };
  const context = createContext({
    self: workerGlobal,
    caches: cacheStorage,
    fetch: fetchMock,
    crypto,
    Request,
    Response,
    Headers,
    URL,
    console,
  });
  runInContext(bundle, context);

  const dispatch = (type: string, event: unknown): void => {
    const handlers = listeners.get(type) ?? [];
    if (handlers.length !== 1) {
      throw new Error(`${String(handlers.length)} gestionnaire(s) « ${type} » enregistré(s)`);
    }
    for (const handler of handlers) handler(event);
  };

  /** Déclenche un événement prolongeable ; renvoie les promesses passées à `waitUntil`. */
  const dispatchExtendable = (type: string, fields: object = {}): Promise<unknown>[] => {
    const pending: Promise<unknown>[] = [];
    dispatch(type, {
      ...fields,
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise);
      },
    });
    return pending;
  };

  const runExtendable = async (type: string): Promise<void> => {
    await Promise.all(dispatchExtendable(type));
  };

  return {
    fetchMock,
    cacheStorage,
    claim,
    skipWaiting,
    log,
    install: () => runExtendable('install'),
    activate: () => runExtendable('activate'),
    dispatchMessage: (data) => dispatchExtendable('message', { data }),
    dispatchFetch(request) {
      const respondWith = vi.fn<(response: Promise<Response> | Response) => void>();
      dispatch('fetch', { request, respondWith });
      const [call, ...extra] = respondWith.mock.calls;
      if (extra.length > 0) throw new Error('respondWith appelé plusieurs fois');
      return call ? Promise.resolve(call[0]) : Promise.resolve(null);
    },
    precache: () => cacheStorage.open(CACHE_NAME),
    becomeWaiting() {
      registration.active = { name: 'un autre worker' };
    },
  };
}

/** Worker installé et activé sur le réseau simulé, puis passé hors-ligne (réseau en échec). */
async function installedWorker(): Promise<ServiceWorkerHarness> {
  const worker = createHarness();
  worker.fetchMock.mockImplementation((request) => Promise.resolve(networkResponse(request)));
  await worker.install();
  await worker.activate();
  worker.fetchMock.mockReset();
  worker.fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
  return worker;
}

/** Requêtes reçues par le réseau simulé, dans l'ordre. */
function fetchedRequests(worker: ServiceWorkerHarness): Request[] {
  return worker.fetchMock.mock.calls.map(([request]) => request);
}

/** Réseau simulé qui sert `body` à l'adresse de `key`, et le fichier du build partout ailleurs. */
function serveInstead(worker: ServiceWorkerHarness, key: string, body: string): void {
  worker.fetchMock.mockImplementation((request) =>
    Promise.resolve(
      request.url === absoluteUrl(key)
        ? new Response(body, { headers: { 'content-type': 'text/html' } })
        : networkResponse(request),
    ),
  );
}

describe('install', () => {
  it('pré-cache chaque entrée sous le scope, en contournant le cache HTTP (cache: "reload")', async () => {
    const worker = createHarness();
    worker.fetchMock.mockImplementation((request) => Promise.resolve(networkResponse(request)));

    await worker.install();

    const expectedUrls = PRECACHE_ENTRIES.map((entry) => absoluteUrl(entry.url));
    const requests = fetchedRequests(worker);
    expect(requests.map((request) => request.url)).toEqual(expectedUrls);
    expect(requests.every((request) => request.cache === 'reload')).toBe(true);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    const cache = await worker.precache();
    expect([...cache.responses.keys()]).toEqual(expectedUrls);
    await expect(cacheStorageKeys(worker)).resolves.toEqual([CACHE_NAME]);
  });

  it('refuse un fichier dont les octets ne sont pas ceux du build (CDN encore sur l’ancienne version) : rien n’est stocké', async () => {
    const worker = createHarness();
    serveInstead(worker, 'index.html', 'ancienne page');

    await expect(worker.install()).rejects.toThrow(
      'index.html ne correspond pas à cette version (CDN pas encore à jour)',
    );
    expect((await worker.precache()).responses.size).toBe(0);
  });

  it('garde tel quel le fichier d’une entrée sans révision : rien ne permet de le vérifier', async () => {
    const worker = createHarness();
    serveInstead(worker, 'sans-revision.json', '{"autre":"contenu"}');

    await worker.install();

    const stored = await (await worker.precache()).match(absoluteUrl('sans-revision.json'));
    await expect(stored?.text()).resolves.toBe('{"autre":"contenu"}');
  });

  it('propage à waitUntil l’échec d’une entrée (réponse non-2xx) : rien n’est stocké', async () => {
    const worker = createHarness();
    worker.fetchMock.mockImplementation((request) =>
      Promise.resolve(
        request.url.endsWith('/app.js')
          ? new Response(null, { status: 404 })
          : networkResponse(request),
      ),
    );

    await expect(worker.install()).rejects.toThrow('app.js a répondu 404');
    expect((await worker.precache()).responses.size).toBe(0);
  });

  it('échoue si une version activée entre-temps a purgé son cache : il n’attendrait qu’un cache orphelin', async () => {
    const worker = createHarness();
    worker.fetchMock.mockImplementation(async (request) => {
      await worker.cacheStorage.delete(CACHE_NAME);
      return networkResponse(request);
    });

    await expect(worker.install()).rejects.toThrow('Pré-cache purgé pendant le téléchargement');
  });
});

function cacheStorageKeys(worker: ServiceWorkerHarness): Promise<string[]> {
  return worker.cacheStorage.keys();
}

describe('install : fichiers identiques à ceux d’une autre version', () => {
  const OLD_CACHE = 'mia-precache-0ld0ld0l';

  /** Worker dont le réseau répond, avec un cache de la version précédente garni de ces fichiers. */
  async function workerWithCache(
    files: Record<string, Response>,
    name = OLD_CACHE,
  ): Promise<{ worker: ServiceWorkerHarness; old: MemoryCache }> {
    const worker = createHarness();
    worker.fetchMock.mockImplementation((request) => Promise.resolve(networkResponse(request)));
    const old = await worker.cacheStorage.open(name);
    for (const [url, response] of Object.entries(files)) {
      old.responses.set(absoluteUrl(url), response);
    }
    return { worker, old };
  }

  const identical = (url: string): Response =>
    new Response(precachedBody(url), { headers: { 'content-type': 'image/png' } });

  const fetchedUrls = (worker: ServiceWorkerHarness): string[] =>
    fetchedRequests(worker).map((request) => request.url);

  it('recopie ce qui a le même contenu, télécharge le reste en contournant le cache HTTP', async () => {
    const { worker } = await workerWithCache({
      [COPYABLE_URLS[0] ?? '']: identical(COPYABLE_URLS[0] ?? ''),
      [COPYABLE_URLS[1] ?? '']: identical(COPYABLE_URLS[1] ?? ''),
      // Même adresse, autre contenu : une page change à chaque version.
      'index.html': new Response('ancienne page'),
    });

    await worker.install();

    const copied = COPYABLE_URLS.map(absoluteUrl);
    const expected = PRECACHE_ENTRIES.map((entry) => absoluteUrl(entry.url)).filter(
      (url) => !copied.includes(url),
    );
    expect(fetchedUrls(worker)).toEqual(expected);
    expect(fetchedRequests(worker).every((request) => request.cache === 'reload')).toBe(true);
    const cache = await worker.precache();
    expect([...cache.responses.keys()].sort()).toEqual(
      PRECACHE_ENTRIES.map((entry) => absoluteUrl(entry.url)).sort(),
    );
    for (const entry of PRECACHE_ENTRIES) {
      const stored = await cache.match(absoluteUrl(entry.url));
      await expect(stored?.text()).resolves.toBe(precachedBody(entry.url));
    }
  });

  it('garde les en-têtes de la copie, et ne touche pas à l’ancien cache', async () => {
    const url = COPYABLE_URLS[0] ?? '';
    const { worker, old } = await workerWithCache({ [url]: identical(url) });

    await worker.install();

    const copy = await (await worker.precache()).match(absoluteUrl(url));
    expect(copy?.headers.get('content-type')).toBe('image/png');
    const kept = await old.match(absoluteUrl(url));
    await expect(kept?.text()).resolves.toBe(precachedBody(url));
  });

  it('retélécharge une copie abîmée : la révision de son contenu ne correspond pas', async () => {
    const url = COPYABLE_URLS[0] ?? '';
    const { worker } = await workerWithCache({ [url]: new Response('contenu abîmé') });

    await worker.install();

    expect(fetchedUrls(worker)).toContain(absoluteUrl(url));
    const stored = await (await worker.precache()).match(absoluteUrl(url));
    await expect(stored?.text()).resolves.toBe(precachedBody(url));
  });

  it('ne fait jamais confiance à la copie d’un fichier sans révision', async () => {
    const url = 'sans-revision.json';
    const { worker } = await workerWithCache({ [url]: identical(url) });

    await worker.install();

    expect(fetchedUrls(worker)).toContain(absoluteUrl(url));
  });

  it('retélécharge une copie illisible', async () => {
    const url = COPYABLE_URLS[0] ?? '';
    const { worker, old } = await workerWithCache({});
    vi.spyOn(old, 'match').mockImplementation((requested) =>
      requested === absoluteUrl(url)
        ? Promise.reject(new Error('Entrée de cache illisible'))
        : Promise.resolve(undefined),
    );

    await worker.install();

    expect(fetchedUrls(worker)).toContain(absoluteUrl(url));
    const stored = await (await worker.precache()).match(absoluteUrl(url));
    await expect(stored?.text()).resolves.toBe(precachedBody(url));
  });

  it('ignore les caches des autres applications de l’origine', async () => {
    const url = COPYABLE_URLS[0] ?? '';
    const { worker } = await workerWithCache({ [url]: identical(url) }, 'autre-cache');

    await worker.install();

    expect(fetchedUrls(worker)).toContain(absoluteUrl(url));
  });

  it('réseau en échec : le nouveau cache reste vide, aucune copie à moitié installée', async () => {
    const url = COPYABLE_URLS[0] ?? '';
    const { worker } = await workerWithCache({ [url]: identical(url) });
    worker.fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(worker.install()).rejects.toThrow('Failed to fetch');

    expect((await worker.precache()).responses.size).toBe(0);
  });

  it('même version réinstallée (réparation) : seul le fichier abîmé repart du réseau', async () => {
    const worker = await installedWorker();
    const damaged = COPYABLE_URLS[0] ?? '';
    const cache = await worker.precache();
    cache.responses.set(absoluteUrl(damaged), new Response('contenu abîmé'));
    worker.fetchMock.mockImplementation((request) => Promise.resolve(networkResponse(request)));

    await worker.install();

    expect(fetchedUrls(worker)).toContain(absoluteUrl(damaged));
    expect(fetchedUrls(worker)).not.toContain(absoluteUrl(COPYABLE_URLS[1] ?? ''));
    const repaired = await cache.match(absoluteUrl(damaged));
    await expect(repaired?.text()).resolves.toBe(precachedBody(damaged));
  });
});

describe('activate', () => {
  it('purge les caches mia-precache-* des autres versions, épargne les autres préfixes, puis réclame les clients', async () => {
    const worker = createHarness();
    await Promise.all(
      [
        'mia-precache-0ld0ld0l',
        CACHE_NAME,
        'autre-cache',
        'mia-precache-ffffffff',
        'workbox-precache-v2',
      ].map((name) => worker.cacheStorage.open(name)),
    );

    await worker.activate();

    await expect(cacheStorageKeys(worker)).resolves.toEqual([
      CACHE_NAME,
      'autre-cache',
      'workbox-precache-v2',
    ]);
    expect(worker.claim).toHaveBeenCalledOnce();
    expect(worker.log).toEqual([
      'delete mia-precache-0ld0ld0l',
      'delete mia-precache-ffffffff',
      'claim',
    ]);
  });
});

describe('message', () => {
  it('SKIP_WAITING_MESSAGE appelle skipWaiting et passe sa promesse à waitUntil', () => {
    const worker = createHarness();
    const skipped = Promise.resolve();
    worker.skipWaiting.mockReturnValue(skipped);

    const pending = worker.dispatchMessage(SKIP_WAITING_MESSAGE);

    expect(worker.skipWaiting).toHaveBeenCalledOnce();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toBe(skipped);
  });

  it.each([
    ['une autre chaîne', 'skip-waiting'],
    ['le message suivi d’un suffixe', `${SKIP_WAITING_MESSAGE}-2`],
    ['une chaîne vide', ''],
    ['un objet portant le message', { type: SKIP_WAITING_MESSAGE }],
    ['un tableau contenant le message', [SKIP_WAITING_MESSAGE]],
    ['null', null],
    ['undefined', undefined],
  ])('ignore %s : skipWaiting jamais appelé, waitUntil non plus', (_label, data) => {
    const worker = createHarness();

    expect(worker.dispatchMessage(data)).toEqual([]);
    expect(worker.skipWaiting).not.toHaveBeenCalled();
  });
});

describe('message RESTORE_PRECACHE_MESSAGE', () => {
  const restore = async (worker: ServiceWorkerHarness): Promise<void> => {
    await Promise.all(worker.dispatchMessage(RESTORE_PRECACHE_MESSAGE));
  };

  it('pré-cache intact : aucun téléchargement, aucune page réclamée', async () => {
    const worker = await installedWorker();
    worker.claim.mockClear();

    await restore(worker);

    expect(worker.fetchMock).not.toHaveBeenCalled();
    expect(worker.claim).not.toHaveBeenCalled();
  });

  it.each([
    ['supprimé', false],
    ['recréé vide par une requête entre-temps', true],
  ])(
    'pré-cache %s : le refait, en contournant le cache HTTP, puis réclame la page',
    async (_label, recreated) => {
      const worker = await installedWorker();
      await worker.cacheStorage.delete(CACHE_NAME);
      if (recreated) await worker.precache();
      worker.claim.mockClear();
      worker.fetchMock.mockImplementation((request) => Promise.resolve(networkResponse(request)));

      await restore(worker);

      const cache = await worker.precache();
      expect(cache.responses.size).toBe(PRECACHE_ENTRIES.length);
      expect(fetchedRequests(worker)).toHaveLength(PRECACHE_ENTRIES.length);
      expect(fetchedRequests(worker).every((request) => request.cache === 'reload')).toBe(true);
      expect(worker.claim).toHaveBeenCalledOnce();
    },
  );

  it('pré-cache incomplet : le complète, puis réclame la page', async () => {
    const worker = await installedWorker();
    const cache = await worker.precache();
    cache.responses.delete(absoluteUrl('memory/index.html'));
    worker.claim.mockClear();
    worker.fetchMock.mockImplementation((request) => Promise.resolve(networkResponse(request)));

    await restore(worker);

    expect(cache.responses.has(absoluteUrl('memory/index.html'))).toBe(true);
    expect(cache.responses.size).toBe(PRECACHE_ENTRIES.length);
    expect(worker.claim).toHaveBeenCalledOnce();
  });

  it('téléchargement échoué : l’échec va à waitUntil, aucune page réclamée', async () => {
    const worker = await installedWorker();
    await worker.cacheStorage.delete(CACHE_NAME);
    worker.claim.mockClear();

    await expect(restore(worker)).rejects.toThrow('Failed to fetch');

    expect(worker.claim).not.toHaveBeenCalled();
  });

  it('worker en attente : le refait, et le refus de réclamer la page ne remonte pas', async () => {
    const worker = createHarness();
    worker.becomeWaiting();
    worker.fetchMock.mockImplementation((request) => Promise.resolve(networkResponse(request)));

    await restore(worker);

    expect((await worker.precache()).responses.size).toBe(PRECACHE_ENTRIES.length);
    expect(worker.log).not.toContain('claim');
  });
});

describe('activation d’une nouvelle version', () => {
  it('ni install ni activate n’appellent skipWaiting : elle ne s’active jamais seule, une ancienne page peut être ouverte', async () => {
    const worker = createHarness();
    worker.fetchMock.mockImplementation((request) => Promise.resolve(networkResponse(request)));

    await worker.install();
    expect(worker.skipWaiting).not.toHaveBeenCalled();

    await worker.activate();
    expect(worker.skipWaiting).not.toHaveBeenCalled();
  });
});

describe('fetch : navigations sous le scope /mia/', () => {
  let worker: ServiceWorkerHarness;

  beforeEach(async () => {
    worker = await installedWorker();
  });

  it.each([
    ['/mia/', 'index.html'],
    ['/mia/memory/', 'memory/index.html'],
    ['/mia/memory', 'memory/index.html'],
    ['/mia/memory/?level=mem-005', 'memory/index.html'],
    ['/mia/settings/#ancre', 'settings/index.html'],
  ])('sert « %s » depuis le cache (%s), sans appel réseau', async (path, key) => {
    const response = await worker.dispatchFetch(navigation(path));

    expect(describeResponse(response)).toEqual({
      status: 200,
      statusText: '',
      redirected: false,
      headers: [['content-type', 'text/html']],
    });
    await expect(bodyOf(response)).resolves.toBe(precachedBody(key));
    expect(worker.fetchMock).not.toHaveBeenCalled();
  });

  it('route inconnue : réseau quand il répond', async () => {
    worker.fetchMock.mockResolvedValue(new Response('page en ligne'));
    const request = navigation('/mia/inconnue/');

    const response = await worker.dispatchFetch(request);

    expect(worker.fetchMock).toHaveBeenCalledExactlyOnceWith(request);
    await expect(bodyOf(response)).resolves.toBe('page en ligne');
  });

  it('route inconnue hors-ligne : repli 404.html du cache, avec le statut 404', async () => {
    const response = await worker.dispatchFetch(navigation('/mia/inconnue/'));

    expect(worker.fetchMock).toHaveBeenCalledOnce();
    expect(describeResponse(response)).toEqual({
      status: 404,
      statusText: 'Not Found',
      redirected: false,
      headers: [['content-type', 'text/html']],
    });
    await expect(bodyOf(response)).resolves.toBe(precachedBody('404.html'));
  });

  it('route inconnue hors-ligne sans 404.html en cache : l’erreur réseau est propagée', async () => {
    (await worker.precache()).responses.delete(absoluteUrl('404.html'));

    await expect(worker.dispatchFetch(navigation('/mia/inconnue/'))).rejects.toThrow(
      'Failed to fetch',
    );
  });

  it('route connue absente du cache : réseau en secours', async () => {
    (await worker.precache()).responses.delete(absoluteUrl('memory/index.html'));
    worker.fetchMock.mockResolvedValue(new Response('page en ligne'));
    const request = navigation('/mia/memory/');

    const response = await worker.dispatchFetch(request);

    expect(worker.fetchMock).toHaveBeenCalledExactlyOnceWith(request);
    await expect(bodyOf(response)).resolves.toBe('page en ligne');
  });

  it('recopie sans l’indicateur redirected une page stockée après une redirection (serve de npm start)', async () => {
    const stored = markRedirected(
      new Response('<p>memory</p>', {
        headers: { 'content-type': 'text/html', 'x-mia': 'oui' },
      }),
    );
    (await worker.precache()).responses.set(absoluteUrl('memory/index.html'), stored);

    const response = await worker.dispatchFetch(navigation('/mia/memory/'));

    expect(describeResponse(response)).toEqual({
      status: 200,
      statusText: '',
      redirected: false,
      headers: [
        ['content-type', 'text/html'],
        ['x-mia', 'oui'],
      ],
    });
    await expect(bodyOf(response)).resolves.toBe('<p>memory</p>');
    expect(worker.fetchMock).not.toHaveBeenCalled();
  });

  it('recopie aussi le repli 404.html stocké après une redirection, avec le statut 404', async () => {
    const stored = markRedirected(
      new Response('introuvable', { headers: { 'content-type': 'text/html' } }),
    );
    (await worker.precache()).responses.set(absoluteUrl('404.html'), stored);

    const response = await worker.dispatchFetch(navigation('/mia/inconnue/'));

    expect(describeResponse(response)).toEqual({
      status: 404,
      statusText: 'Not Found',
      redirected: false,
      headers: [['content-type', 'text/html']],
    });
    await expect(bodyOf(response)).resolves.toBe('introuvable');
  });
});

describe('fetch : assets et requêtes laissées au navigateur', () => {
  let worker: ServiceWorkerHarness;

  beforeEach(async () => {
    worker = await installedWorker();
  });

  it.each([
    ['/mia/_next/static/chunks/app.js', '_next/static/chunks/app.js'],
    ['/mia/memory/index.txt?_rsc=1a2b3', 'memory/index.txt'],
    ['/mia/icons/icon-192.png', 'icons/icon-192.png'],
  ])('sert l’asset pré-caché « %s » depuis le cache (%s), sans appel réseau', async (path, key) => {
    const response = await worker.dispatchFetch(asset(path));

    await expect(bodyOf(response)).resolves.toBe(precachedBody(key));
    expect(worker.fetchMock).not.toHaveBeenCalled();
  });

  it('stockage en erreur : la page et ses assets passent par le réseau au lieu d’échouer', async () => {
    vi.spyOn(worker.cacheStorage, 'open').mockRejectedValue(
      new DOMException('Stockage indisponible', 'UnknownError'),
    );
    worker.fetchMock.mockImplementation((request) =>
      Promise.resolve(new Response(`en ligne : ${new URL(request.url).pathname}`)),
    );

    const page = await worker.dispatchFetch(navigation('/mia/memory/'));
    const chunk = await worker.dispatchFetch(asset('/mia/_next/static/chunks/app.js'));

    await expect(bodyOf(page)).resolves.toBe('en ligne : /mia/memory/');
    await expect(bodyOf(chunk)).resolves.toBe('en ligne : /mia/_next/static/chunks/app.js');
  });

  it('asset pré-caché absent du cache : réseau en secours', async () => {
    (await worker.precache()).responses.delete(absoluteUrl('_next/static/chunks/app.js'));
    worker.fetchMock.mockResolvedValue(new Response('chunk en ligne'));
    const request = asset('/mia/_next/static/chunks/app.js');

    const response = await worker.dispatchFetch(request);

    expect(worker.fetchMock).toHaveBeenCalledExactlyOnceWith(request);
    await expect(bodyOf(response)).resolves.toBe('chunk en ligne');
  });

  it.each([
    ['un asset inconnu', asset('/mia/_next/static/chunks/autre.js')],
    ['sw.js lui-même', asset('/mia/sw.js')],
    ['une requête POST', asset('/mia/index.html', { method: 'POST' })],
    ['une navigation POST (formulaire)', navigation('/mia/', { method: 'POST' })],
    ['une autre origine', asset('https://example.com/mia/index.html')],
    ['une navigation sur une autre origine', navigation('https://example.com/mia/')],
    ['une navigation hors du scope (/miam/)', navigation('/miam/')],
    ['une navigation à la racine du site (/)', navigation('/')],
  ])('laisse %s au navigateur : respondWith jamais appelé', async (_label, request) => {
    await expect(worker.dispatchFetch(request)).resolves.toBeNull();
    expect(worker.fetchMock).not.toHaveBeenCalled();
  });
});
