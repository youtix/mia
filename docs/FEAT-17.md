# FEAT-17 : PWA Hors-ligne (Service Worker) & Icônes d'Installation Multi-Plateformes

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-17`
> **Dépendances** : [FEAT-01](./FEAT-01.md), [FEAT-02](./FEAT-02.md)

---

## 1. Contexte & Objectif pour l'IA

La `FEAT-01` a livré le manifeste PWA et des icônes **SVG uniquement**, sans service worker (voir [FEAT-01 §6](./FEAT-01.md#6-décisions-dimplémentation-session-de-cadrage)). Conséquences actuelles pour la version Web hébergée sur **GitHub Pages** :
* L'application **ne fonctionne pas hors-ligne**, ce qui contredit le principe « 100% hors-ligne » de la [SPECIFICATION](./SPECIFICATION.md#1-principes-directeurs--contraintes).
* L'installation est imparfaite : iOS exige une `apple-touch-icon` **PNG** (sinon l'écran d'accueil affiche une capture de la page), et certains lanceurs Android gèrent mal les icônes SVG ou non `maskable`.

L'APK Capacitor (FEAT-15) n'est **pas** concerné : ses assets sont embarqués localement.

L'objectif de cette **FEAT-17** est de rendre la PWA Web **installable partout et 100% fonctionnelle hors-ligne** :
1. Un **service worker maison, sans dépendance runtime**, qui pré-cache l'intégralité de l'export statique `out/` (HTML, JS, CSS, polices, payloads RSC `.txt`, icônes) et sert l'application hors-ligne, y compris la navigation côté client.
2. Un **enregistrement sûr** : uniquement en production, uniquement dans un navigateur Web (jamais dans Capacitor, jamais en `next dev`).
3. Des **mises à jour atomiques** : une nouvelle version se télécharge en arrière-plan et s'active au prochain lancement, sans jamais mélanger deux versions.
4. Les **icônes PNG** (192/512, `any` + `maskable`), l'`apple-touch-icon` (180) et un favicon PNG (32), générés depuis les SVG de FEAT-01.

⚠️ **Hors périmètre** : bannière « Nouvelle version disponible » (pourra être ajoutée plus tard avec le Design System de FEAT-03), notifications push, synchronisation en arrière-plan, captures d'écran du manifeste (`screenshots`).

---

## 2. Contraintes Techniques

1. **Zéro CDN, zéro service propriétaire** : pas de Workbox chargé via `importScripts` depuis un CDN Google, aucune requête vers un domaine tiers (conformité F-Droid et hors-ligne).
2. **Compatible `basePath`** : la PWA est servie sous `/<nom-du-dépôt>/` sur GitHub Pages (`NEXT_PUBLIC_BASE_PATH`, FEAT-01/FEAT-02) et à la racine ailleurs. Toutes les URL du service worker sont résolues **relativement à `self.registration.scope`**, jamais en absolu depuis `/`.
3. **Jamais dans l'APK** : ne pas enregistrer le service worker si `Capacitor.isNativePlatform()` est vrai (il figerait d'anciennes versions après une mise à jour de l'APK). Le fichier `sw.js` présent dans `out/` est simplement ignoré par l'APK.
4. **Jamais en développement** : aucun enregistrement si `process.env.NODE_ENV !== 'production'` (le cache casserait le rechargement à chaud).
5. **Navigateurs cibles** : Chrome / Android System WebView 111+, Safari 16.4+ (minimum fixé par FEAT-01). Le service worker est compilé pour `chrome111` / `safari16.4`.
6. **Pas de `skipWaiting()` automatique** : activer une nouvelle version pendant qu'une ancienne page est ouverte supprimerait des chunks encore attendus par cette page (écran cassé). La nouvelle version s'active quand toutes les fenêtres de l'application sont fermées.

---

## 3. Fichiers à Créer / Modifier

```text
/home/alexeiananenko/Workspace/mia/
├── package.json                       # Scripts build/icons/typecheck + devDependencies esbuild, sharp
├── tsconfig.json                      # Exclut src/core/pwa/sw (compilé avec la lib webworker)
├── scripts/
│   ├── build-sw.ts                    # Post-build (tsx) : liste out/, calcule le manifeste, bundle out/sw.js
│   └── generate-icons.mjs             # Outil dev : SVG → PNG (sharp), résultats versionnés dans public/icons/
├── public/
│   ├── manifest.json                  # + icônes PNG any & maskable
│   └── icons/
│       ├── icon-192.png
│       ├── icon-512.png
│       ├── apple-touch-icon.png       # 180x180, fond opaque
│       └── favicon-32.png
├── src/
│   ├── app/
│   │   └── layout.tsx                 # + <ServiceWorkerRegistrar />, icons.apple, favicon PNG, appleWebApp
│   └── core/
│       └── pwa/
│           ├── precache.ts            # Fonctions PURES partagées (script de build, service worker, tests)
│           ├── registerServiceWorker.ts
│           ├── ServiceWorkerRegistrar.tsx
│           └── sw/
│               ├── tsconfig.json      # lib: ["esnext", "webworker"]
│               └── service-worker.ts  # Glue mince : événements install / activate / fetch
└── tests/
    ├── pwa-precache.test.ts
    ├── pwa-register.test.ts
    └── pwa-manifest.test.ts
```

---

## 4. Spécifications Techniques Détaillées

### 4.1. Fonctions pures de pré-cache (`src/core/pwa/precache.ts`)
Module **sans aucune API DOM, Worker ou Node** (il est compilé à la fois dans le programme principal, dans celui du service worker et exécuté par le script de build) :
```typescript
export interface PrecacheEntry {
  /** Chemin relatif au scope, sans slash initial (ex: "index.html", "_next/static/chunks/a1b2.js") */
  url: string;
  /** Empreinte du contenu (ex: 8 premiers caractères hexadécimaux du SHA-256) */
  revision: string;
}

export const CACHE_PREFIX = 'mia-precache-';

/** false pour "sw.js", les source maps "*.map" et les fichiers système (".DS_Store"…). */
export function isPrecacheable(relativePath: string): boolean;

/** Trie par url pour un résultat déterministe ; le hachage est injecté pour rester pur. */
export function createPrecacheEntries(
  files: { path: string; content: Uint8Array }[],
  hash: (content: Uint8Array) => string,
): PrecacheEntry[];

/** Nom du cache versionné : CACHE_PREFIX + empreinte de l'ensemble des (url, revision). */
export function getCacheName(entries: PrecacheEntry[], hash: (text: string) => string): string;

/**
 * Traduit une URL de navigation en entrée pré-cachée, avec trailingSlash: true :
 *   "<scope>"         -> "index.html"
 *   "<scope>jeux/"    -> "jeux/index.html"
 *   "<scope>jeux"     -> "jeux/index.html"
 *   route inconnue    -> "404.html"
 */
export function resolveNavigationKey(pathname: string, scopePathname: string, knownUrls: ReadonlySet<string>): string;

/**
 * Pour une requête non-navigation : renvoie l'url pré-cachée correspondante en IGNORANT la query string
 * (le routeur Next demande les payloads RSC sous la forme "index.txt?_rsc=abc"), ou null si hors pré-cache.
 */
export function resolveAssetKey(pathname: string, scopePathname: string, knownUrls: ReadonlySet<string>): string | null;
```

### 4.2. Service worker (`src/core/pwa/sw/service-worker.ts`)
* Fichier de glue **mince** (toute décision passe par `precache.ts`), avec `/// <reference lib="webworker" />` et `declare const self: ServiceWorkerGlobalScope;`.
* Reçoit deux constantes injectées au bundling : `declare const __MIA_PRECACHE__: PrecacheEntry[];` et `declare const __MIA_CACHE_NAME__: string;`.
* **`install`** : ouvre `__MIA_CACHE_NAME__` et y ajoute chaque entrée sous l'URL absolue `new URL(entry.url, self.registration.scope)`, en requêtant avec `new Request(url, { cache: 'reload' })` pour contourner le cache HTTP (GitHub Pages sert avec `max-age=600` : sans cela, une ancienne page pourrait être pré-cachée).
* **`activate`** : supprime tous les caches commençant par `CACHE_PREFIX` autres que `__MIA_CACHE_NAME__`, puis `self.clients.claim()` (pour que la première visite soit contrôlée sans rechargement).
* **`fetch`** : ignore tout ce qui n'est pas `GET`, pas de même origine ou hors du scope (le navigateur gère alors normalement). Sinon :
  * **Navigation** (`request.mode === 'navigate'`) : **cache d'abord** sur `resolveNavigationKey(...)`. Si la route est inconnue et que le réseau est disponible, tenter le réseau puis retomber sur `404.html` du cache.
  * **Asset pré-caché** (`resolveAssetKey(...) !== null`) : **cache d'abord**, réseau en secours.
  * **Tout le reste** : réseau direct, sans mise en cache à l'exécution.
* Le pré-cache est la **seule source de vérité** d'une version : HTML, chunks et payloads RSC d'un même build sont servis ensemble (aucun mélange de versions).

### 4.3. Génération de `out/sw.js` (`scripts/build-sw.ts`)
* Exécuté après `next build` via `tsx` (déjà présent depuis FEAT-01).
* Parcourt récursivement `out/`, filtre avec `isPrecacheable`, calcule les entrées (`node:crypto`, SHA-256) avec `createPrecacheEntries` puis `getCacheName`.
* Bundle `src/core/pwa/sw/service-worker.ts` avec **esbuild** (`bundle: true`, `format: 'iife'`, `target: ['chrome111', 'safari16.4']`, `minify: true`, `outfile: 'out/sw.js'`) en injectant `__MIA_PRECACHE__` et `__MIA_CACHE_NAME__` via `define` (`JSON.stringify`).
* Comme `sw.js` contient le nom de cache versionné, tout changement de contenu du build modifie ses octets : le navigateur détecte la nouvelle version automatiquement.
* Affiche un résumé (`N fichiers pré-cachés, X Ko, cache mia-precache-xxxxxxxx`) et échoue (code ≠ 0) si `out/index.html` est absent.

### 4.4. Enregistrement (`src/core/pwa/registerServiceWorker.ts` & `ServiceWorkerRegistrar.tsx`)
```typescript
export interface ServiceWorkerEnvironment {
  nodeEnv: string | undefined;
  isNativePlatform: boolean;
  supportsServiceWorker: boolean;
}

/** Pure : vrai seulement en production, dans un navigateur Web supportant les service workers. */
export function shouldRegisterServiceWorker(env: ServiceWorkerEnvironment): boolean;

/**
 * Lit NEXT_PUBLIC_BASE_PATH à l'appel (pas au chargement du module, pour rester testable),
 * puis enregistre `${basePath}/sw.js` avec { scope: `${basePath}/` }. Renvoie null si la garde refuse
 * ou si l'enregistrement échoue (erreur journalisée via console.warn, jamais propagée à l'UI).
 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null>;
```
* `ServiceWorkerRegistrar.tsx` : composant client (`'use client'`) qui ne rend rien (`return null`) et appelle `registerServiceWorker()` dans un `useEffect`, **après l'événement `load`** de la fenêtre (immédiatement si `document.readyState === 'complete'`) pour ne pas concurrencer le premier affichage sur les boîtiers TV modestes.
* Monté une seule fois dans `<body>` de `src/app/layout.tsx`.

### 4.5. TypeScript du service worker
* `src/core/pwa/sw/tsconfig.json` : étend la racine avec `"lib": ["esnext", "webworker"]` et inclut `./*.ts` et `../precache.ts` (les libs `dom` et `webworker` sont incompatibles dans un même programme).
* `tsconfig.json` racine : ajouter `"src/core/pwa/sw"` à `exclude`.
* Script : `"typecheck": "tsc --noEmit && tsc --noEmit -p src/core/pwa/sw/tsconfig.json"`.
* Le `projectService` d'ESLint (FEAT-02) trouve automatiquement le `tsconfig.json` le plus proche du fichier.
* Couverture (FEAT-02) : ajouter `'src/core/pwa/sw/**'` à `coverage.exclude` (code de glue exécuté uniquement dans le contexte service worker) ; `precache.ts` et `registerServiceWorker.ts` restent couverts.

### 4.6. Icônes PNG & métadonnées d'installation
* `scripts/generate-icons.mjs` (devDependency `sharp`) génère depuis `public/icons/icon-512.svg` : `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180x180) et `favicon-32.png`. Les PNG sont **versionnés** : le build ne dépend jamais de `sharp`. Script npm : `"icons": "node scripts/generate-icons.mjs"`, à relancer uniquement quand le SVG change.
* Les SVG de FEAT-01 ont un fond plein et un symbole contenu dans le cercle central de 80 % : les mêmes PNG servent pour `any` et `maskable` (entrées distinctes, jamais `"purpose": "any maskable"`).
* `public/manifest.json` : conserver les entrées SVG et ajouter (URL **relatives**) :
  ```json
  { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
  { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ```
* `src/app/layout.tsx` (URL préfixées explicitement par `basePath`, Next ne le fait pas pour les métadonnées texte) :
  * `icons.icon` : SVG existant + `favicon-32.png` (`sizes: '32x32'`, pour Safari qui n'affiche pas les favicons SVG).
  * `icons.apple` : `apple-touch-icon.png` (`sizes: '180x180'`).
  * `appleWebApp: { capable: true, title: 'Mia', statusBarStyle: 'black' }` (`black-translucent` exigerait la gestion des safe-areas).

### 4.7. Scripts `package.json`
```json
{
  "build": "next build && tsx scripts/build-sw.ts",
  "icons": "node scripts/generate-icons.mjs",
  "typecheck": "tsc --noEmit && tsc --noEmit -p src/core/pwa/sw/tsconfig.json"
}
```
DevDependencies à ajouter : `esbuild`, `sharp`.

---

## 5. Critères d'Acceptation (Definition of Done)

- [ ] `tests/pwa-precache.test.ts` couvre : exclusion de `sw.js` et des `*.map`, déterminisme des entrées (même contenu → mêmes révisions, ordre stable), changement du nom de cache quand un seul fichier change, `resolveNavigationKey` (scope racine `/` **et** scope `/mia/`, avec et sans slash final, route inconnue → `404.html`), `resolveAssetKey` qui ignore `?_rsc=…` et renvoie `null` hors pré-cache.
- [ ] `tests/pwa-register.test.ts` vérifie la garde (développement, Capacitor natif, navigateur sans service worker → aucun enregistrement) et l'appel `register('/mia/sw.js', { scope: '/mia/' })` avec `NEXT_PUBLIC_BASE_PATH=/mia` (`vi.stubEnv`), et `'/sw.js'` / `'/'` sans `basePath`.
- [ ] `tests/pwa-manifest.test.ts` vérifie que le manifeste n'utilise que des URL relatives, que chaque icône déclarée existe dans `public/`, que les dimensions des PNG (lues dans l'en-tête IHDR, sans dépendance) correspondent à `sizes`, que les purposes `any` et `maskable` existent en 192 et 512, et que `apple-touch-icon.png` mesure 180x180.
- [ ] Après `npm run build`, `out/sw.js` existe, référence `index.html` et au moins un fichier `_next/static/`, et ne se référence pas lui-même.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck` des deux programmes, `test:coverage` ≥ 80 %, `build`) passe sans aucune erreur.
- [ ] Recette manuelle sur la PWA déployée sous `/mia/` (Chrome DevTools > Application) : service worker activé, Cache Storage rempli, puis **mode hors-ligne + rechargement** → l'application s'affiche et la navigation fonctionne ; le panneau Manifest ne signale aucune erreur d'installabilité.
- [ ] Recette manuelle dans l'APK (FEAT-15, si disponible) : aucun service worker enregistré (`chrome://inspect` > Application).
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(pwa): add offline service worker and installable png icons`).
