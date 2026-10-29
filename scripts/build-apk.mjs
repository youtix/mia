/**
 * Compilation de l'APK universel (FEAT-16) : `node scripts/build-apk.mjs 1.4.2`.
 *
 * Exécuté par semantic-release (`prepareCmd` de `.releaserc.json`) après `npm run cap:sync` :
 * lance `./gradlew assembleRelease --no-daemon` dans `android/` puis copie l'APK produit vers
 * `dist-apk/mia-v<version>-universal.apk`, que `@semantic-release/github` attache à la GitHub
 * Release (`dist-apk/*.apk`). Un seul APK pour smartphone, tablette et Android TV, signé avec la
 * clé fournie par `MIA_KEYSTORE_*` ou, à défaut, la clé de débogage (`android/app/build.gradle`).
 *
 * Les fonctions sont exportées pour les tests (Gradle injectable) ; le CLI ne s'exécute que si ce
 * module est le point d'entrée. Option `--root <dossier>` : racine du dépôt.
 */
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEntryPoint, parseArgs, parseVersion } from './sync-android-version.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Projet Gradle, relatif à la racine du dépôt. */
export const ANDROID_DIR = 'android';

/** Dossier de publication (ignoré par Git), relatif à la racine du dépôt. */
export const DIST_DIR = 'dist-apk';

/** Sortie de `assembleRelease`, relative à `android/`. */
export const APK_OUTPUT_DIR = 'app/build/outputs/apk/release';

/** `--no-daemon` : un seul build par job de CI, inutile de laisser un démon Gradle derrière soi. */
const GRADLE_ARGS = ['assembleRelease', '--no-daemon'];

/**
 * Nom public de l'APK d'une version (`mia-v1.4.2-universal.apk`) ; `Error` si la version n'est
 * pas une SemVer stricte.
 * @param {string} version
 * @returns {string}
 */
export function getApkFileName(version) {
  parseVersion(version);
  return `mia-v${version}-universal.apk`;
}

/**
 * APK à publier parmi les fichiers du dossier de sortie : exactement un `.apk` signé attendu. Un
 * APK « unsigned » n'est jamais retenu : il signalerait une configuration de signature absente.
 * @param {readonly string[]} fileNames
 * @returns {string}
 */
export function pickReleaseApk(fileNames) {
  const apks = fileNames.filter((name) => name.endsWith('.apk') && !name.includes('unsigned'));
  if (apks.length !== 1) {
    throw new Error(
      `${String(apks.length)} APK signé(s) dans ${APK_OUTPUT_DIR} (${fileNames.join(', ') || 'dossier vide'}) : un seul attendu`,
    );
  }
  return apks[0];
}

/**
 * Lance `./gradlew assembleRelease --no-daemon` dans `androidDir`, sortie relayée telle quelle ;
 * `Error` si Gradle ne démarre pas ou échoue.
 * @param {string} androidDir
 * @returns {void}
 */
export function runGradle(androidDir) {
  const gradlew = join(androidDir, 'gradlew');
  const result = spawnSync(gradlew, GRADLE_ARGS, { cwd: androidDir, stdio: 'inherit' });
  if (result.error) {
    throw new Error(`Impossible de lancer ${gradlew} : ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Gradle a échoué (code ${String(result.status ?? result.signal)})`);
  }
}

/**
 * Fichiers d'un dossier, vide s'il n'existe pas (le message d'erreur vient de `pickReleaseApk`).
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function listFiles(directory) {
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
}

/**
 * Compile l'APK de release puis le copie dans `dist-apk/` sous son nom public ; renvoie le chemin
 * de la copie. Le dossier est vidé au préalable : `dist-apk/*.apk` ne doit publier qu'un fichier.
 * @param {string} version
 * @param {{ root?: string, gradle?: (androidDir: string) => void }} [options]
 * @returns {Promise<string>}
 */
export async function buildApk(version, { root = REPO_ROOT, gradle = runGradle } = {}) {
  const fileName = getApkFileName(version);
  const androidDir = resolve(root, ANDROID_DIR);
  const distDir = resolve(root, DIST_DIR);
  gradle(androidDir);
  const outputDir = join(androidDir, APK_OUTPUT_DIR);
  const source = join(outputDir, pickReleaseApk(await listFiles(outputDir)));
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  const target = join(distDir, fileName);
  await copyFile(source, target);
  return target;
}

/**
 * CLI : compile et copie l'APK de la version donnée.
 * @param {readonly string[]} argv arguments après le nom du script
 * @returns {Promise<void>}
 */
export async function main(argv) {
  const { version, root } = parseArgs(argv);
  const target = await buildApk(version, { root });
  console.log(`APK prêt : ${relative(root, target)}`);
}

if (isEntryPoint(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
