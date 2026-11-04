/// <reference lib="webworker" />
/**
 * Service worker de Mia (FEAT-17) : glue mince autour des fonctions pures de `precache.ts`.
 * Compilé par `scripts/build-sw.ts` (esbuild) en `out/sw.js` avec le manifeste du pré-cache et le
 * nom de cache versionné injectés : un build = un cache, jamais deux versions mélangées.
 */
import {
  CACHE_PREFIX,
  NOT_FOUND_KEY,
  RESTORE_PRECACHE_MESSAGE,
  SKIP_WAITING_MESSAGE,
  matchesRevision,
  resolveAssetKey,
  resolveNavigationKey,
  type PrecacheEntry,
} from '@/core/pwa/precache';

declare const self: ServiceWorkerGlobalScope;
/** Constantes injectées au bundling (`define` d'esbuild, voir scripts/build-sw.ts). */
declare const __MIA_PRECACHE__: PrecacheEntry[];
declare const __MIA_CACHE_NAME__: string;

const CACHE_NAME = __MIA_CACHE_NAME__;
const PRECACHE_ENTRIES = __MIA_PRECACHE__;
const KNOWN_URLS: ReadonlySet<string> = new Set(PRECACHE_ENTRIES.map((entry) => entry.url));

/** URL absolue d'une entrée, relative au scope (donc au basePath de GitHub Pages), jamais à `/`. */
function toAbsoluteUrl(key: string): string {
  return new URL(key, self.registration.scope).href;
}

/**
 * Copie déjà en cache au contenu identique à cette entrée, si l'empreinte de ses octets le prouve : un
 * fichier abîmé ou périmé ne se transmet pas d'une version à l'autre. Une copie illisible est écartée.
 */
async function findIdenticalCopy(
  entry: PrecacheEntry,
  sources: Cache[],
): Promise<Response | undefined> {
  for (const source of sources) {
    try {
      const copy = await source.match(toAbsoluteUrl(entry.url));
      if (!copy) continue;
      const digest = await crypto.subtle.digest('SHA-256', await copy.clone().arrayBuffer());
      if (matchesRevision(digest, entry.revision)) return copy;
    } catch {
      // Copie illisible : la source suivante, sinon le réseau.
    }
  }
  return undefined;
}

/**
 * Télécharge une entrée et vérifie que ses octets sont ceux de ce build. cache: 'reload' contourne le
 * cache HTTP (GitHub Pages sert avec max-age=600), pas le CDN : juste après une publication, un de ses
 * nœuds peut encore servir l'ancienne page. Pré-cachée sous le nom de la nouvelle version, elle
 * mélangerait les deux hors-ligne ; l'installation échoue plutôt, et la recherche suivante la retente.
 * Une entrée sans révision (jamais produite par scripts/build-sw.ts) n'a rien à comparer.
 */
async function download(entry: PrecacheEntry): Promise<Response> {
  const response = await fetch(new Request(toAbsoluteUrl(entry.url), { cache: 'reload' }));
  if (!response.ok) throw new TypeError(`${entry.url} a répondu ${String(response.status)}`);
  if (entry.revision !== '') {
    const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
    if (!matchesRevision(digest, entry.revision)) {
      throw new Error(`${entry.url} ne correspond pas à cette version (CDN pas encore à jour)`);
    }
  }
  return response;
}

async function precacheAll(): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  const names = await caches.keys();
  const sources = await Promise.all(
    names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.open(name)),
  );
  // Une version change peu de fichiers : les autres (chunks hachés, polices, clips) sont recopiés
  // plutôt que retéléchargés.
  const copies = await Promise.all(
    PRECACHE_ENTRIES.map(async (entry) => ({
      entry,
      copy: await findIdenticalCopy(entry, sources),
    })),
  );
  // Rien n'est stocké avant que tout soit arrivé et vérifié : un échec ne laisse ainsi rien de neuf
  // dans ce cache, et l'ancienne version reste en place.
  const responses = await Promise.all(
    copies.map(async ({ entry, copy }) => ({
      url: toAbsoluteUrl(entry.url),
      response: copy ?? (await download(entry)),
    })),
  );
  await Promise.all(responses.map(({ url, response }) => cache.put(url, response)));
  // Une autre version activée pendant le téléchargement purge ce cache : il a été rempli comme un
  // objet orphelin, et ce worker attendrait ensuite sans rien pour répondre. Échouer le rend
  // `redundant` ; la prochaine recherche le retélécharge.
  if (!(await caches.has(CACHE_NAME))) throw new Error('Pré-cache purgé pendant le téléchargement');
}

/**
 * Refait le pré-cache s'il a disparu ou s'il est incomplet (éviction par le navigateur) : sans cela,
 * le hors-ligne resterait perdu jusqu'à la prochaine version. Le worker actif reprend ensuite la main
 * sur la page ; un worker en attente n'en a pas le droit, et `claim` le refuse (`InvalidStateError`).
 * Ce refus est ignoré, plutôt que de comparer `self.serviceWorker` au worker actif : Firefox ne
 * l'expose pas, et la comparaison y échouait toujours.
 */
async function restorePrecache(): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  if ((await cache.keys()).length >= PRECACHE_ENTRIES.length) return;
  await precacheAll();
  await self.clients.claim().catch(() => undefined);
}

/** Supprime les caches des versions précédentes : seule la version activée reste installée. */
async function purgeStaleCaches(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)),
  );
}

/**
 * Copie pré-cachée de `key`. Un stockage en erreur (disque plein, données de site corrompues ou
 * bloquées) ne fait pas échouer la page : la requête passe alors par le réseau.
 */
async function fromCache(key: string): Promise<Response | undefined> {
  try {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(toAbsoluteUrl(key));
  } catch {
    return undefined;
  }
}

/** Copie d'une réponse du cache (même corps, mêmes en-têtes), jamais marquée `redirected`. */
function copyResponse(
  response: Response,
  status = response.status,
  statusText = response.statusText,
): Response {
  return new Response(response.body, { status, statusText, headers: response.headers });
}

/**
 * Réponse de navigation sans l'indicateur `redirected` (comme `cleanRedirect` de Workbox).
 * `serve` (`npm start`) et d'autres hébergeurs répondent 301 à `memory/index.html` → `memory/` :
 * `fetch` suit la redirection, et le cache stocke une réponse marquée `redirected`, que le navigateur
 * transforme en erreur réseau quand elle répond à une navigation (mode de redirection `manual`).
 * GitHub Pages sert `index.html` en 200 : la réponse est alors rendue telle quelle.
 */
function withoutRedirect(response: Response): Response {
  return response.redirected ? copyResponse(response) : response;
}

/** Repli hors-ligne : la page 404 du build, avec le statut 404 (le cache l'a stockée en 200). */
function asNotFound(response: Response): Response {
  return copyResponse(response, 404, 'Not Found');
}

/** Navigation : cache d'abord ; route inconnue : réseau, puis la page 404 du build hors-ligne. */
async function handleNavigation(
  request: Request,
  pathname: string,
  scopePathname: string,
): Promise<Response> {
  const key = resolveNavigationKey(pathname, scopePathname, KNOWN_URLS);
  if (key !== NOT_FOUND_KEY) {
    const cached = await fromCache(key);
    return cached ? withoutRedirect(cached) : fetch(request);
  }
  try {
    return await fetch(request);
  } catch (error) {
    const fallback = await fromCache(NOT_FOUND_KEY);
    if (fallback) return asNotFound(fallback);
    throw error;
  }
}

/** Asset pré-caché : cache d'abord, réseau en secours (le cache est complet dès l'installation). */
async function handleAsset(request: Request, key: string): Promise<Response> {
  return (await fromCache(key)) ?? fetch(request);
}

self.addEventListener('install', (event) => {
  // Jamais de skipWaiting() ici : une page ouverte sur l'ancienne version attend encore ses chunks ;
  // la nouvelle version s'active quand toutes les fenêtres de Mia sont fermées, ou à la demande du
  // joueur (message ci-dessous).
  event.waitUntil(precacheAll());
});

self.addEventListener('message', (event) => {
  // Le joueur accepte la mise à jour (FEAT-20) : chaque page se recharge au changement de worker.
  if (event.data === SKIP_WAITING_MESSAGE) event.waitUntil(self.skipWaiting());
  else if (event.data === RESTORE_PRECACHE_MESSAGE) event.waitUntil(restorePrecache());
});

self.addEventListener('activate', (event) => {
  // clients.claim() : la première visite est contrôlée sans rechargement.
  event.waitUntil(purgeStaleCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  // Autre origine ou hors du scope : le navigateur gère normalement.
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request, url.pathname, scope.pathname));
    return;
  }

  const key = resolveAssetKey(url.pathname, scope.pathname, KNOWN_URLS);
  // Tout le reste part directement au réseau, sans mise en cache à l'exécution.
  if (key !== null) event.respondWith(handleAsset(request, key));
});
