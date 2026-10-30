/**
 * Fonctions pures du pré-cache PWA (FEAT-17), partagées par le script de build, le service
 * worker et les tests : aucune API DOM, Worker ou Node ici, le module est compilé dans les deux
 * programmes TypeScript (`dom` et `webworker`) et exécuté sous Node par `scripts/build-sw.ts`.
 */

export interface PrecacheEntry {
  /** Chemin relatif au scope, sans slash initial (ex: "index.html", "_next/static/chunks/a1b2.js"). */
  url: string;
  /** Empreinte du contenu (ex: 8 premiers caractères hexadécimaux du SHA-256). */
  revision: string;
}

/** Préfixe des caches versionnés : l'activation purge tous les autres caches de ce préfixe. */
export const CACHE_PREFIX = 'mia-precache-';

/** Page servie hors-ligne pour une route inconnue (export statique Next : `404.html`). */
export const NOT_FOUND_KEY = '404.html';

/** Message de la page au worker en attente : le joueur accepte la mise à jour (FEAT-20). */
export const SKIP_WAITING_MESSAGE = 'mia-skip-waiting';

/** Message de la page au worker actif : refaire le pré-cache s'il a disparu (FEAT-20). */
export const RESTORE_PRECACHE_MESSAGE = 'mia-restore-precache';

/** Le service worker compilé à la racine de `out/` ne doit jamais se pré-cacher lui-même. */
const SERVICE_WORKER_FILE = 'sw.js';

/** Fichiers déposés par les systèmes d'exploitation, étrangers au build. */
const SYSTEM_FILES: ReadonlySet<string> = new Set(['Thumbs.db', 'desktop.ini']);

/** Chemin relatif normalisé : séparateurs `/`, sans `./` ni `/` initial. */
export function normalizePrecachePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^(?:\.\/|\/)+/, '');
}

/** false pour "sw.js", les source maps "*.map" et les fichiers système (".DS_Store"…). */
export function isPrecacheable(relativePath: string): boolean {
  const url = normalizePrecachePath(relativePath);
  if (url === '' || url === SERVICE_WORKER_FILE || url.endsWith('.map')) return false;
  // Les fichiers et dossiers cachés (".DS_Store", ".git"…) ne font jamais partie de l'export.
  return !url.split('/').some((segment) => segment.startsWith('.') || SYSTEM_FILES.has(segment));
}

/** Ordre stable des entrées, indépendant de la locale (comparaison par unités de code). */
function compareByUrl(a: PrecacheEntry, b: PrecacheEntry): number {
  if (a.url === b.url) return 0;
  return a.url < b.url ? -1 : 1;
}

/** Trie par url pour un résultat déterministe ; le hachage est injecté pour rester pur. */
export function createPrecacheEntries(
  files: { path: string; content: Uint8Array }[],
  hash: (content: Uint8Array) => string,
): PrecacheEntry[] {
  return files
    .map(({ path, content }) => ({ url: normalizePrecachePath(path), revision: hash(content) }))
    .sort(compareByUrl);
}

/** Nom du cache versionné : CACHE_PREFIX + empreinte de l'ensemble des (url, revision). */
export function getCacheName(entries: PrecacheEntry[], hash: (text: string) => string): string {
  const manifest = [...entries]
    .sort(compareByUrl)
    .map((entry) => `${entry.url}@${entry.revision}`)
    .join('\n');
  return `${CACHE_PREFIX}${hash(manifest)}`;
}

/** Retire une éventuelle requête ou ancre passée avec le chemin (le routeur Next ajoute `?_rsc=`). */
function stripQuery(pathname: string): string {
  const index = pathname.search(/[?#]/);
  return index === -1 ? pathname : pathname.slice(0, index);
}

/** Décode les séquences `%xx` ; un chemin mal encodé est comparé tel quel plutôt que de lever. */
function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Chemin demandé relatif au scope (sans slash initial), ou null si la requête sort du scope. */
function toScopeRelativePath(pathname: string, scopePathname: string): string | null {
  const scope = scopePathname.endsWith('/') ? scopePathname : `${scopePathname}/`;
  const path = stripQuery(pathname);
  if (path.startsWith(scope)) return safeDecode(path.slice(scope.length));
  // "/mia" (sans barre) est accepté comme racine du scope "/mia/" par cette fonction pure (utile
  // aux tests et à un scope "/"), mais le gestionnaire `fetch` du service worker ignore tout chemin
  // qui ne commence pas par "/mia/" : "/mia" ne lui est jamais soumis (en ligne, GitHub Pages
  // redirige en 301 vers "/mia/" ; hors-ligne, le navigateur affiche son erreur).
  return `${path}/` === scope ? '' : null;
}

/**
 * Traduit une URL de navigation en entrée pré-cachée, avec trailingSlash: true :
 *   "<scope>"         -> "index.html"
 *   "<scope>jeux/"    -> "jeux/index.html"
 *   "<scope>jeux"     -> "jeux/index.html"
 *   route inconnue    -> "404.html"
 * Un fichier pré-caché demandé directement ("<scope>404.html") est servi tel quel.
 */
export function resolveNavigationKey(
  pathname: string,
  scopePathname: string,
  knownUrls: ReadonlySet<string>,
): string {
  const relativePath = toScopeRelativePath(pathname, scopePathname);
  if (relativePath === null) return NOT_FOUND_KEY;
  const route = relativePath.replace(/\/+$/, '');
  const candidates = route === '' ? ['index.html'] : [`${route}/index.html`, route];
  return candidates.find((candidate) => knownUrls.has(candidate)) ?? NOT_FOUND_KEY;
}

/**
 * Pour une requête non-navigation : renvoie l'url pré-cachée correspondante en IGNORANT la query
 * string (le routeur Next demande les payloads RSC sous la forme "index.txt?_rsc=abc"), ou null
 * si hors pré-cache.
 */
export function resolveAssetKey(
  pathname: string,
  scopePathname: string,
  knownUrls: ReadonlySet<string>,
): string | null {
  const relativePath = toScopeRelativePath(pathname, scopePathname);
  return relativePath !== null && knownUrls.has(relativePath) ? relativePath : null;
}
