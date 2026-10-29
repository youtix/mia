/**
 * Post-build (FEAT-17) : compile le service worker en `out/sw.js` après `next build`.
 *
 * Liste les fichiers de l'export statique, calcule le manifeste de pré-cache (SHA-256) et le nom
 * de cache versionné, puis bundle `src/core/pwa/sw/service-worker.ts` avec esbuild en injectant
 * ces deux constantes. Le nom de cache dépend du contenu du build : tout changement modifie les
 * octets de `sw.js`, et le navigateur détecte la nouvelle version de lui-même.
 */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrecacheEntries, getCacheName, isPrecacheable } from '../src/core/pwa/precache';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'out');
const ENTRY_POINT = join(ROOT, 'src/core/pwa/sw/service-worker.ts');
const SW_TSCONFIG = join(ROOT, 'src/core/pwa/sw/tsconfig.json');
const OUTFILE = join(OUT_DIR, 'sw.js');

interface BuildFile {
  /** Chemin relatif à `out/`, séparateurs `/`. */
  path: string;
  content: Uint8Array;
}

/** 8 premiers caractères hexadécimaux du SHA-256 : suffisant pour distinguer deux versions. */
function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 8);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Fichiers pré-cachables de `directory`, parcouru récursivement. */
async function collectFiles(directory: string, prefix = ''): Promise<BuildFile[]> {
  const files: BuildFile[] = [];
  for (const dirent of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix === '' ? dirent.name : `${prefix}/${dirent.name}`;
    const absolutePath = join(directory, dirent.name);
    if (dirent.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, relativePath)));
    } else if (dirent.isFile() && isPrecacheable(relativePath)) {
      files.push({ path: relativePath, content: await readFile(absolutePath) });
    }
  }
  return files;
}

async function main(): Promise<void> {
  if (!(await exists(join(OUT_DIR, 'index.html')))) {
    console.error('out/index.html introuvable : lance `next build` avant scripts/build-sw.ts.');
    process.exitCode = 1;
    return;
  }

  const files = await collectFiles(OUT_DIR);
  const entries = createPrecacheEntries(files, sha256);
  const cacheName = getCacheName(entries, sha256);

  await build({
    entryPoints: [ENTRY_POINT],
    tsconfig: SW_TSCONFIG,
    bundle: true,
    format: 'iife',
    // Navigateurs minimum de FEAT-01 : Chrome / WebView Android 111+, Safari 16.4+.
    target: ['chrome111', 'safari16.4'],
    minify: true,
    outfile: OUTFILE,
    define: {
      __MIA_PRECACHE__: JSON.stringify(entries),
      __MIA_CACHE_NAME__: JSON.stringify(cacheName),
    },
    logLevel: 'warning',
  });

  const totalBytes = files.reduce((sum, file) => sum + file.content.byteLength, 0);
  const totalKb = Math.round(totalBytes / 1024);
  console.log(
    `${String(entries.length)} fichiers pré-cachés, ${String(totalKb)} Ko, cache ${cacheName}`,
  );
}

await main();
