/**
 * Synchronisation de la version Android (FEAT-16) : `node scripts/sync-android-version.mjs 1.4.2`.
 *
 * Exécuté par semantic-release (`prepareCmd` de `.releaserc.json`) avec la version qu'il vient de
 * calculer : met à jour `versionCode` / `versionName` dans `android/app/build.gradle` et la recette
 * F-Droid `fdroid/org.mia.braintraining.yml` (bloc de build et version courante), fichiers que
 * `@semantic-release/git` commite ensuite avec `package.json`. Android exige un `versionCode`
 * entier strictement croissant : `major * 10000 + minor * 100 + patch` (1.4.2 → 10402), d'où le
 * refus d'un `minor` ou d'un `patch` ≥ 100.
 *
 * Les fonctions pures sont exportées pour les tests ; le CLI ne s'exécute que si ce module est le
 * point d'entrée. Option `--root <dossier>` : racine du dépôt à modifier (tests sur une copie).
 */
import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Version SemVer stricte « MAJOR.MINOR.PATCH » (ni préfixe « v », ni suffixe de pré-version). */
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Limite documentée d'Android pour `versionCode`. */
const MAX_VERSION_CODE = 2_100_000_000;

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Fichier Gradle de l'application, relatif à la racine du dépôt. */
export const GRADLE_FILE = 'android/app/build.gradle';

/** Recette F-Droid (format fdroiddata), relative à la racine du dépôt. */
export const FDROID_RECIPE_FILE = 'fdroid/org.mia.braintraining.yml';

/**
 * Décompose une version SemVer stricte ; `Error` (en français) sinon.
 * @param {string} version
 * @returns {{ major: number, minor: number, patch: number }}
 */
export function parseVersion(version) {
  const match = SEMVER_PATTERN.exec(version);
  if (match === null) {
    throw new Error(
      `Version « ${version} » invalide : « MAJOR.MINOR.PATCH » attendu (ex: 1.4.2, sans préfixe « v »)`,
    );
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * `versionCode` Android d'une version : `major * 10000 + minor * 100 + patch`, strictement
 * croissant tant que `minor` et `patch` restent inférieurs à 100 (refusés au-delà).
 * @param {string} version
 * @returns {number}
 */
export function computeVersionCode(version) {
  const { major, minor, patch } = parseVersion(version);
  if (minor >= 100 || patch >= 100) {
    throw new Error(
      `Version « ${version} » hors limites : minor et patch doivent rester inférieurs à 100 (versionCode = major * 10000 + minor * 100 + patch)`,
    );
  }
  const versionCode = major * 10000 + minor * 100 + patch;
  if (versionCode === 0) {
    throw new Error(`Version « ${version} » refusée : Android exige un versionCode positif`);
  }
  if (versionCode > MAX_VERSION_CODE) {
    throw new Error(
      `Version « ${version} » hors limites : versionCode ${String(versionCode)} dépasse le maximum Android (${String(MAX_VERSION_CODE)})`,
    );
  }
  return versionCode;
}

/**
 * Remplace la seule ligne qui correspond au motif, en conservant son indentation (groupe 1) ;
 * `Error` si la ligne est absente ou présente plusieurs fois (le fichier n'est alors pas celui
 * attendu : mieux vaut échouer que de synchroniser à moitié).
 * @param {string} content
 * @param {RegExp} pattern motif global et multiligne, groupe 1 = indentation
 * @param {string} line ligne de remplacement, sans indentation
 * @param {string} label nom de l'entrée pour les messages d'erreur
 * @returns {string}
 */
function replaceSingleLine(content, pattern, line, label) {
  const count = [...content.matchAll(pattern)].length;
  if (count !== 1) {
    throw new Error(`${label} : ${String(count)} occurrence(s) trouvée(s), une seule attendue`);
  }
  return content.replace(pattern, (_match, /** @type {string} */ indent) => `${indent}${line}`);
}

/**
 * Contenu de `android/app/build.gradle` aligné sur `version` : seules les lignes `versionCode` et
 * `versionName` changent (espaces et `=` tolérés, indentation conservée).
 * @param {string} content
 * @param {string} version
 * @returns {string}
 */
export function syncGradleVersion(content, version) {
  const versionCode = computeVersionCode(version);
  const withCode = replaceSingleLine(
    content,
    /^([ \t]*)versionCode(?:[ \t]*=[ \t]*|[ \t]+)\d+[ \t]*$/gm,
    `versionCode ${String(versionCode)}`,
    'versionCode',
  );
  return replaceSingleLine(
    withCode,
    /^([ \t]*)versionName(?:[ \t]*=[ \t]*|[ \t]+)"[^"]*"[ \t]*$/gm,
    `versionName "${version}"`,
    'versionName',
  );
}

/**
 * Contenu de `fdroid/org.mia.braintraining.yml` aligné sur `version` : l'unique bloc de build
 * (`versionName`, `versionCode`, `commit: vX.Y.Z`, le tag posé par semantic-release) et la version
 * courante (`CurrentVersion`, `CurrentVersionCode`). La recette versionnée ne décrit que la
 * dernière release : fdroiddata ajoute lui-même un bloc par tag (`AutoUpdateMode: Version`).
 * @param {string} content
 * @param {string} version
 * @returns {string}
 */
export function syncFdroidRecipe(content, version) {
  const versionCode = String(computeVersionCode(version));
  /** @type {[RegExp, string, string][]} */
  const replacements = [
    [/^([ \t]*(?:- )?)versionName:[ \t]*\S+[ \t]*$/gm, `versionName: ${version}`, 'versionName'],
    [
      /^([ \t]*(?:- )?)versionCode:[ \t]*\d+[ \t]*$/gm,
      `versionCode: ${versionCode}`,
      'versionCode',
    ],
    [/^([ \t]*(?:- )?)commit:[ \t]*\S+[ \t]*$/gm, `commit: v${version}`, 'commit'],
    [/^([ \t]*)CurrentVersion:[ \t]*\S+[ \t]*$/gm, `CurrentVersion: ${version}`, 'CurrentVersion'],
    [
      /^([ \t]*)CurrentVersionCode:[ \t]*\d+[ \t]*$/gm,
      `CurrentVersionCode: ${versionCode}`,
      'CurrentVersionCode',
    ],
  ];
  return replacements.reduce(
    (result, [pattern, line, label]) => replaceSingleLine(result, pattern, line, label),
    content,
  );
}

/**
 * Arguments du CLI : `<version> [--root <dossier>]`.
 * @param {readonly string[]} argv arguments après le nom du script
 * @param {string} defaultRoot racine du dépôt par défaut
 * @returns {{ version: string, root: string }}
 */
export function parseArgs(argv, defaultRoot = REPO_ROOT) {
  /** @type {string | undefined} */
  let version;
  let root = defaultRoot;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      const value = argv[index + 1];
      if (value === undefined) throw new Error('Option --root : dossier manquant');
      root = value;
      index += 1;
    } else if (version === undefined) {
      version = arg;
    } else {
      throw new Error(`Argument « ${arg} » inattendu`);
    }
  }
  if (version === undefined) {
    throw new Error('Usage : node scripts/sync-android-version.mjs <version> [--root <dossier>]');
  }
  return { version, root: resolve(root) };
}

/**
 * CLI : synchronise les deux fichiers de `root` et affiche le résultat.
 * @param {readonly string[]} argv arguments après le nom du script
 * @returns {Promise<void>}
 */
export async function main(argv) {
  const { version, root } = parseArgs(argv);
  const versionCode = computeVersionCode(version);
  const gradlePath = resolve(root, GRADLE_FILE);
  const recipePath = resolve(root, FDROID_RECIPE_FILE);
  // Les deux contenus sont calculés avant la première écriture : aucun fichier n'est modifié si
  // l'un des deux n'est pas conforme.
  const gradle = syncGradleVersion(await readFile(gradlePath, 'utf8'), version);
  const recipe = syncFdroidRecipe(await readFile(recipePath, 'utf8'), version);
  await writeFile(gradlePath, gradle);
  await writeFile(recipePath, recipe);
  console.log(
    `${GRADLE_FILE} et ${FDROID_RECIPE_FILE} : versionName "${version}", versionCode ${String(versionCode)}`,
  );
}

/**
 * Vrai quand ce module est lancé par `node scripts/sync-android-version.mjs …`, faux à l'import.
 * Les deux chemins sont comparés en chemins réels : `import.meta.url` est déjà résolu par Node,
 * `process.argv[1]` non. Sans cela, un dépôt atteint par un lien symbolique (ou une lettre de
 * lecteur d'une autre casse sous Windows) ferait sortir le CLI en silence, sans rien écrire.
 * @param {string} moduleUrl
 * @returns {boolean}
 */
export function isEntryPoint(moduleUrl) {
  const entry = process.argv[1];
  return entry !== undefined && toRealPath(resolve(entry)) === toRealPath(fileURLToPath(moduleUrl));
}

/**
 * Chemin réel (liens symboliques résolus), ou le chemin tel quel s'il n'existe pas.
 * @param {string} path
 * @returns {string}
 */
function toRealPath(path) {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

if (isEntryPoint(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
