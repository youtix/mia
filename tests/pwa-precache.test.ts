// @vitest-environment node
import {
  CACHE_PREFIX,
  createPrecacheEntries,
  getCacheName,
  isPrecacheable,
  normalizePrecachePath,
  NOT_FOUND_KEY,
  resolveAssetKey,
  resolveNavigationKey,
  type PrecacheEntry,
} from '@/core/pwa/precache';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/** Même empreinte que scripts/build-sw.ts : 8 premiers caractères hexadécimaux du SHA-256. */
const sha256 = (data: Uint8Array | string): string =>
  createHash('sha256').update(data).digest('hex').slice(0, 8);

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function file(path: string, text = path): { path: string; content: Uint8Array } {
  return { path, content: encode(text) };
}

/** Export statique réduit : pages, payloads RSC, chunk et icône. */
const BUILD_FILES = [
  file('index.html'),
  file('404.html'),
  file('memory/index.html'),
  file('memory/index.txt'),
  file('_next/static/chunks/app.js'),
  file('icons/icon-192.png'),
];

const ENTRIES = createPrecacheEntries(BUILD_FILES, sha256);
const KNOWN_URLS: ReadonlySet<string> = new Set(ENTRIES.map((entry) => entry.url));

describe('isPrecacheable', () => {
  it.each([
    'index.html',
    '404.html',
    '_next/static/chunks/a1b2.js',
    '_next/static/media/police.woff2',
    'memory/index.txt',
    'icons/icon-192.png',
    'manifest.json',
  ])('pré-cache « %s »', (path) => {
    expect(isPrecacheable(path)).toBe(true);
  });

  it.each([
    'sw.js',
    './sw.js',
    '/sw.js',
    'sw.js.map',
    '_next/static/chunks/a1b2.js.map',
    'styles.css.map',
    '.DS_Store',
    'icons/.DS_Store',
    '.git/HEAD',
    'Thumbs.db',
    'memory/desktop.ini',
    '',
  ])('exclut « %s »', (path) => {
    expect(isPrecacheable(path)).toBe(false);
  });

  it('normalise les séparateurs et les préfixes relatifs', () => {
    expect(normalizePrecachePath('.\\_next\\static\\a.js')).toBe('_next/static/a.js');
    expect(normalizePrecachePath('/index.html')).toBe('index.html');
    expect(normalizePrecachePath('././index.html')).toBe('index.html');
  });
});

describe('createPrecacheEntries', () => {
  it('calcule la révision de chaque fichier avec le hachage injecté, triée par url', () => {
    expect(ENTRIES).toEqual([
      { url: '404.html', revision: sha256(encode('404.html')) },
      { url: '_next/static/chunks/app.js', revision: sha256(encode('_next/static/chunks/app.js')) },
      { url: 'icons/icon-192.png', revision: sha256(encode('icons/icon-192.png')) },
      { url: 'index.html', revision: sha256(encode('index.html')) },
      { url: 'memory/index.html', revision: sha256(encode('memory/index.html')) },
      { url: 'memory/index.txt', revision: sha256(encode('memory/index.txt')) },
    ]);
  });

  it('est déterministe : même contenu, même résultat, quel que soit l’ordre des fichiers', () => {
    const reversed = createPrecacheEntries([...BUILD_FILES].reverse(), sha256);

    expect(reversed).toEqual(ENTRIES);
    expect(createPrecacheEntries(BUILD_FILES, sha256)).toEqual(ENTRIES);
  });

  it('change la révision d’un fichier dont le contenu change, et seulement celle-là', () => {
    const changed = createPrecacheEntries(
      BUILD_FILES.map((entry) => (entry.path === 'index.html' ? file('index.html', 'v2') : entry)),
      sha256,
    );

    expect(changed.find((entry) => entry.url === 'index.html')?.revision).not.toBe(
      ENTRIES.find((entry) => entry.url === 'index.html')?.revision,
    );
    expect(changed.filter((entry) => entry.url !== 'index.html')).toEqual(
      ENTRIES.filter((entry) => entry.url !== 'index.html'),
    );
  });

  it('normalise les chemins (séparateurs Windows, « ./ » initial)', () => {
    const entries = createPrecacheEntries(
      [file('.\\_next\\static\\a.js'), file('./index.html')],
      sha256,
    );

    expect(entries.map((entry) => entry.url)).toEqual(['_next/static/a.js', 'index.html']);
  });

  it('conserve l’ordre d’entrée de deux chemins équivalents (tri stable, sans dédoublonnage)', () => {
    const entries = createPrecacheEntries(
      [file('./index.html', 'première'), file('index.html', 'seconde')],
      sha256,
    );

    expect(entries).toEqual([
      { url: 'index.html', revision: sha256(encode('première')) },
      { url: 'index.html', revision: sha256(encode('seconde')) },
    ]);
  });
});

describe('getCacheName', () => {
  const cacheName = getCacheName(ENTRIES, sha256);

  it('préfixe mia-precache- suivi de l’empreinte de l’ensemble', () => {
    expect(cacheName).toMatch(new RegExp(`^${CACHE_PREFIX}[0-9a-f]{8}$`));
  });

  it('ne dépend pas de l’ordre des entrées', () => {
    expect(getCacheName([...ENTRIES].reverse(), sha256)).toBe(cacheName);
  });

  it('change dès qu’un seul fichier change de contenu', () => {
    const changed = createPrecacheEntries(
      BUILD_FILES.map((entry) =>
        entry.path === '_next/static/chunks/app.js' ? file(entry.path, 'nouveau chunk') : entry,
      ),
      sha256,
    );

    expect(getCacheName(changed, sha256)).not.toBe(cacheName);
  });

  it('change quand un fichier est ajouté ou retiré', () => {
    const added: PrecacheEntry[] = [
      ...ENTRIES,
      { url: 'traffic-jam/index.html', revision: 'a1b2c3d4' },
    ];

    expect(getCacheName(added, sha256)).not.toBe(cacheName);
    expect(getCacheName(ENTRIES.slice(1), sha256)).not.toBe(cacheName);
  });
});

describe('resolveNavigationKey', () => {
  describe.each([
    ['racine', '/'],
    ['GitHub Pages', '/mia/'],
    ['GitHub Pages sans barre finale', '/mia'],
  ])('scope %s (%s)', (_label, scope) => {
    const base = scope.endsWith('/') ? scope : `${scope}/`;

    it.each([
      [base, 'index.html'],
      [`${base}memory/`, 'memory/index.html'],
      [`${base}memory`, 'memory/index.html'],
      [`${base}memory//`, 'memory/index.html'],
      [`${base}inconnue/`, NOT_FOUND_KEY],
      [`${base}inconnue`, NOT_FOUND_KEY],
      [`${base}memory/inconnue/`, NOT_FOUND_KEY],
      [`${base}404.html`, NOT_FOUND_KEY],
      [`${base}index.html`, 'index.html'],
    ])('« %s » → « %s »', (pathname, expected) => {
      expect(resolveNavigationKey(pathname, scope, KNOWN_URLS)).toBe(expected);
    });
  });

  it('traite « /mia » comme la racine du scope « /mia/ »', () => {
    expect(resolveNavigationKey('/mia', '/mia/', KNOWN_URLS)).toBe('index.html');
  });

  it('renvoie 404.html hors du scope', () => {
    expect(resolveNavigationKey('/autre/', '/mia/', KNOWN_URLS)).toBe(NOT_FOUND_KEY);
    expect(resolveNavigationKey('/miam/', '/mia/', KNOWN_URLS)).toBe(NOT_FOUND_KEY);
  });

  it('décode les chemins encodés et tolère un encodage invalide', () => {
    const known = new Set(['index.html', 'mémoire/index.html']);

    expect(resolveNavigationKey('/mia/m%C3%A9moire/', '/mia/', known)).toBe('mémoire/index.html');
    expect(resolveNavigationKey('/mia/%E0%A4%A/', '/mia/', known)).toBe(NOT_FOUND_KEY);
  });

  it('expose la page 404 de l’export statique', () => {
    expect(NOT_FOUND_KEY).toBe('404.html');
  });
});

describe('resolveAssetKey', () => {
  it('ignore la requête « ?_rsc= » des payloads RSC du routeur Next', () => {
    const { pathname } = new URL('https://youtix.github.io/mia/memory/index.txt?_rsc=1a2b3');

    expect(resolveAssetKey(pathname, '/mia/', KNOWN_URLS)).toBe('memory/index.txt');
    expect(resolveAssetKey('/mia/memory/index.txt?_rsc=1a2b3', '/mia/', KNOWN_URLS)).toBe(
      'memory/index.txt',
    );
    expect(resolveAssetKey('/memory/index.txt?_rsc=1a2b3#x', '/', KNOWN_URLS)).toBe(
      'memory/index.txt',
    );
  });

  it('résout les chunks et les icônes sous le scope racine et sous /mia/', () => {
    expect(resolveAssetKey('/_next/static/chunks/app.js', '/', KNOWN_URLS)).toBe(
      '_next/static/chunks/app.js',
    );
    expect(resolveAssetKey('/mia/_next/static/chunks/app.js', '/mia/', KNOWN_URLS)).toBe(
      '_next/static/chunks/app.js',
    );
    expect(resolveAssetKey('/mia/icons/icon-192.png', '/mia', KNOWN_URLS)).toBe(
      'icons/icon-192.png',
    );
  });

  it('renvoie null hors pré-cache, hors scope et pour la racine du scope', () => {
    expect(resolveAssetKey('/mia/_next/static/chunks/autre.js', '/mia/', KNOWN_URLS)).toBeNull();
    expect(resolveAssetKey('/_next/static/chunks/app.js', '/mia/', KNOWN_URLS)).toBeNull();
    expect(resolveAssetKey('/mia/', '/mia/', KNOWN_URLS)).toBeNull();
    expect(resolveAssetKey('/mia/memory/', '/mia/', KNOWN_URLS)).toBeNull();
  });
});
