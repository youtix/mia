/**
 * Outil de développement (FEAT-17) : génère les PNG d'installation depuis public/icons/icon-512.svg.
 *
 * Les PNG sont versionnés dans le dépôt : le build ne dépend jamais de sharp. À relancer seulement
 * quand le SVG change : `npm run icons`.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ICONS_DIR = fileURLToPath(new URL('../public/icons/', import.meta.url));
const SOURCE = join(ICONS_DIR, 'icon-512.svg');

/** Fond opaque de l'icône iOS : la couleur de fond du manifeste (iOS noircit la transparence). */
const manifest = JSON.parse(
  await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'),
);
const background = manifest.background_color;

/** Lanceurs Android / Chrome (any et maskable), écran d'accueil iOS, favicon Safari. */
const TARGETS = [
  { file: 'icon-192.png', size: 192, opaque: false },
  { file: 'icon-512.png', size: 512, opaque: false },
  { file: 'apple-touch-icon.png', size: 180, opaque: true },
  { file: 'favicon-32.png', size: 32, opaque: false },
];

const svg = await readFile(SOURCE);

for (const { file, size, opaque } of TARGETS) {
  let image = sharp(svg).resize(size, size);
  if (opaque) image = image.flatten({ background });
  const output = await image.png({ compressionLevel: 9 }).toFile(join(ICONS_DIR, file));
  console.log(`${file} : ${size}x${size}, ${output.size} octets`);
}
