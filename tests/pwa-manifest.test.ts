// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface Manifest {
  id: string;
  start_url: string;
  scope: string;
  background_color: string;
  icons: ManifestIcon[];
}

const manifest = JSON.parse(readFileSync(join(PUBLIC_DIR, 'manifest.json'), 'utf8')) as Manifest;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Types de couleur PNG sans canal alpha (niveaux de gris, RVB, palette). */
const OPAQUE_COLOR_TYPES = [0, 2, 3];

interface PngHeader {
  width: number;
  height: number;
  colorType: number;
}

/** Lit l'en-tête IHDR (premier chunk, juste après la signature de 8 octets), sans dépendance. */
function readPngHeader(relativePath: string): PngHeader {
  const bytes = readFileSync(join(PUBLIC_DIR, relativePath));
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error(`${relativePath} n'est pas un PNG`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25] ?? -1,
  };
}

/** Relative : ni absolue (`/…`), ni avec un schéma (`https:`), pour suivre le basePath. */
const isRelativeUrl = (url: string): boolean =>
  !url.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(url);

const pngIcons = manifest.icons.filter((icon) => icon.type === 'image/png');

describe('Manifeste PWA', () => {
  it('n’utilise que des URL relatives (servi sous /mia/ sur GitHub Pages)', () => {
    for (const url of [manifest.id, manifest.start_url, manifest.scope]) {
      expect(isRelativeUrl(url), url).toBe(true);
    }
    for (const icon of manifest.icons) {
      expect(isRelativeUrl(icon.src), icon.src).toBe(true);
    }
  });

  it('déclare des icônes qui existent toutes dans public/', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(join(PUBLIC_DIR, icon.src)), icon.src).toBe(true);
    }
  });

  it('déclare pour chaque PNG les dimensions lues dans son en-tête IHDR', () => {
    expect(pngIcons.length).toBeGreaterThan(0);
    for (const icon of pngIcons) {
      const { width, height } = readPngHeader(icon.src);
      expect(icon.sizes, icon.src).toBe(`${String(width)}x${String(height)}`);
    }
  });

  it.each([192, 512])(
    'offre un PNG %ix%i en « any » et en « maskable », en entrées distinctes',
    (size) => {
      const sizes = `${String(size)}x${String(size)}`;
      for (const purpose of ['any', 'maskable']) {
        expect(pngIcons, `${sizes} ${purpose}`).toContainEqual(
          expect.objectContaining({ sizes, purpose, type: 'image/png' }),
        );
      }
      expect(manifest.icons.some((icon) => icon.purpose?.includes(' '))).toBe(false);
    },
  );

  it('conserve les icônes SVG de FEAT-01', () => {
    expect(manifest.icons).toContainEqual(
      expect.objectContaining({ src: 'icons/icon-512.svg', type: 'image/svg+xml' }),
    );
  });
});

describe('Icônes d’installation', () => {
  it('fournit une apple-touch-icon de 180x180 à fond opaque', () => {
    const { width, height, colorType } = readPngHeader('icons/apple-touch-icon.png');

    expect([width, height]).toEqual([180, 180]);
    expect(OPAQUE_COLOR_TYPES).toContain(colorType);
  });

  it('fournit un favicon PNG de 32x32 pour Safari', () => {
    const { width, height } = readPngHeader('icons/favicon-32.png');

    expect([width, height]).toEqual([32, 32]);
  });
});

describe('Métadonnées du layout', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('préfixe les icônes par le basePath et déclare la Web App iOS', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/mia');
    const { metadata } = await import('@/app/layout');

    expect(metadata.icons).toEqual({
      icon: [
        // Le PNG précède le SVG : Chrome et Firefox retiennent la dernière icône compatible.
        { url: '/mia/icons/favicon-32.png', type: 'image/png', sizes: '32x32' },
        { url: '/mia/icons/icon-192.svg', type: 'image/svg+xml' },
      ],
      apple: [{ url: '/mia/icons/apple-touch-icon.png', type: 'image/png', sizes: '180x180' }],
    });
    expect(metadata.appleWebApp).toEqual({ capable: true, title: 'Mia', statusBarStyle: 'black' });
    expect(metadata.manifest).toBe('/mia/manifest.json');
  });
});
