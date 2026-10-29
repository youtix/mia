// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import {
  ANDROID_DIR,
  APK_OUTPUT_DIR,
  DIST_DIR,
  buildApk,
  main as buildApkMain,
  getApkFileName,
  pickReleaseApk,
  runGradle,
} from '../scripts/build-apk.mjs';
import {
  FDROID_RECIPE_FILE,
  GRADLE_FILE,
  computeVersionCode,
  isEntryPoint,
  parseArgs,
  parseVersion,
  syncFdroidRecipe,
  syncGradleVersion,
  main as syncVersionMain,
} from '../scripts/sync-android-version.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SYNC_SCRIPT = join(ROOT, 'scripts/sync-android-version.mjs');
const BUILD_SCRIPT = join(ROOT, 'scripts/build-apk.mjs');
const RELEASE_WORKFLOW = '.github/workflows/release-and-deploy.yml';

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const readJson = (path: string): unknown => JSON.parse(read(path));
const readYaml = (path: string): unknown => parse(read(path));

interface PackageJson {
  version: string;
  license: string;
  homepage: string;
  bugs: { url: string };
  engines: Record<string, string>;
  devDependencies: Record<string, string>;
}

interface WorkflowStep {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

interface WorkflowJob {
  'timeout-minutes'?: number;
  steps?: WorkflowStep[];
}

interface Workflow {
  jobs: Record<string, WorkflowJob>;
}

/** Configuration d'un plugin semantic-release : nom seul ou `[nom, options]`. */
type PluginEntry = string | [string, Record<string, unknown>];

interface ReleaseConfig {
  plugins: PluginEntry[];
}

interface FdroidBuild {
  versionName: string;
  versionCode: number;
  commit: string;
  subdir: string;
  sudo: string[];
  init: string[];
  gradle: string[];
  prebuild: string[];
}

interface FdroidRecipe {
  Categories: string[];
  License: string;
  WebSite: string;
  SourceCode: string;
  IssueTracker: string;
  Changelog: string;
  AutoName: string;
  RepoType: string;
  Repo: string;
  Builds: FdroidBuild[];
  MaintainerNotes: string;
  AutoUpdateMode: string;
  UpdateCheckMode: string;
  CurrentVersion: string;
  CurrentVersionCode: number;
}

const pkg = readJson('package.json') as PackageJson;
const PACKAGE_VERSION = pkg.version;

const pluginName = (entry: PluginEntry): string => (typeof entry === 'string' ? entry : entry[0]);

function pluginOptions(config: ReleaseConfig, name: string): Record<string, unknown> {
  const entry = config.plugins.find((candidate) => pluginName(candidate) === name);
  if (entry === undefined || typeof entry === 'string') {
    throw new Error(`Plugin « ${name} » introuvable ou sans options`);
  }
  return entry[1];
}

function getJob(workflow: Workflow, name: string): WorkflowJob {
  const job = workflow.jobs[name];
  if (!job) throw new Error(`Job « ${name} » introuvable`);
  return job;
}

const stepsOf = (job: WorkflowJob): WorkflowStep[] => job.steps ?? [];

function stepIndex(job: WorkflowJob, predicate: (step: WorkflowStep) => boolean): number {
  const index = stepsOf(job).findIndex(predicate);
  if (index === -1) throw new Error('Étape introuvable');
  return index;
}

const stepAt = (job: WorkflowJob, index: number): WorkflowStep => stepsOf(job)[index] ?? {};
const usesAction = (action: string) => (step: WorkflowStep) =>
  step.uses?.startsWith(`${action}@`) ?? false;
const runs = (command: string) => (step: WorkflowStep) => step.run === command;

/** Lignes qui diffèrent entre deux textes de même longueur (comparaison ligne à ligne). */
function changedLines(before: string, after: string): number {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  expect(afterLines).toHaveLength(beforeLines.length);
  return beforeLines.filter((line, index) => line !== afterLines[index]).length;
}

const tempDirs: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'mia-release-'));
  tempDirs.push(root);
  return root;
}

/** Copie les deux fichiers synchronisés par le script dans une racine temporaire. */
function copyReleaseFiles(root: string): void {
  for (const file of [GRADLE_FILE, FDROID_RECIPE_FILE]) {
    mkdirSync(join(root, dirname(file)), { recursive: true });
    copyFileSync(join(ROOT, file), join(root, file));
  }
}

/** Faux `android/gradlew` (script shell) dans une racine temporaire ; renvoie `android/`. */
function writeFakeGradlew(root: string, script: string): string {
  const androidDir = join(root, ANDROID_DIR);
  mkdirSync(androidDir, { recursive: true });
  const gradlew = join(androidDir, 'gradlew');
  writeFileSync(gradlew, `#!/bin/sh\n${script}\n`);
  chmodSync(gradlew, 0o755);
  return androidDir;
}

/** Script d'un faux `gradlew` qui produit un APK de release là où Gradle le ferait. */
const FAKE_APK_SCRIPT = `mkdir -p ${APK_OUTPUT_DIR} && echo fake-apk > ${APK_OUTPUT_DIR}/app-release.apk`;

const runNode = (args: string[]) =>
  spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT });

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('computeVersionCode', () => {
  it.each([
    ['1.4.2', 10402],
    ['0.10.0', 1000],
    ['0.0.1', 1],
    ['0.2.0', 200],
    ['12.34.56', 123456],
    ['209.99.99', 2099999],
  ])('calcule major * 10000 + minor * 100 + patch pour %s', (version, versionCode) => {
    expect(computeVersionCode(version)).toBe(versionCode);
  });

  it.each(['1.4', '1.4.2.1', 'v1.4.2', '1.4.2-beta.1', '01.4.2', '1.04.2', 'abc', '', '1.4.x'])(
    'refuse la version non SemVer « %s »',
    (version) => {
      expect(() => computeVersionCode(version)).toThrow(/invalide/);
    },
  );

  it.each(['1.100.0', '1.4.100', '0.100.100'])(
    'refuse « %s » : minor et patch doivent rester inférieurs à 100',
    (version) => {
      expect(() => computeVersionCode(version)).toThrow(/inférieurs à 100/);
    },
  );

  it('refuse 0.0.0 (versionCode nul) et un versionCode au-delà du maximum Android', () => {
    expect(() => computeVersionCode('0.0.0')).toThrow(/positif/);
    expect(() => computeVersionCode('210001.0.0')).toThrow(/maximum Android/);
    expect(computeVersionCode('210000.0.0')).toBe(2_100_000_000);
  });

  it('décompose une version stricte', () => {
    expect(parseVersion('1.4.2')).toEqual({ major: 1, minor: 4, patch: 2 });
  });
});

describe('syncGradleVersion', () => {
  const fixture = [
    'android {',
    '    defaultConfig {',
    '        // versionCode = major * 10000 + minor * 100 + patch.',
    '        versionCode 1000',
    '        versionName "0.10.0"',
    '    }',
    '}',
    '',
  ].join('\n');

  it('remplace exactement les lignes versionCode et versionName, indentation conservée', () => {
    expect(syncGradleVersion(fixture, '1.4.2')).toBe(
      fixture.replace('versionCode 1000', 'versionCode 10402').replace('"0.10.0"', '"1.4.2"'),
    );
  });

  it('tolère les espaces, les tabulations et la syntaxe « = »', () => {
    expect(syncGradleVersion('\tversionCode   =  7\n  versionName="1.0.0"\n', '2.0.0')).toBe(
      '\tversionCode 20000\n  versionName "2.0.0"\n',
    );
  });

  it('conserve des fins de ligne CRLF', () => {
    expect(syncGradleVersion('versionCode 1\r\nversionName "0.0.1"\r\n', '1.4.2')).toBe(
      'versionCode 10402\r\nversionName "1.4.2"\r\n',
    );
  });

  it('échoue si une ligne manque ou est présente plusieurs fois', () => {
    expect(() => syncGradleVersion('versionCode 1\n', '1.4.2')).toThrow(
      'versionName : 0 occurrence(s) trouvée(s), une seule attendue',
    );
    expect(() => syncGradleVersion(`versionCode 1\n${fixture}`, '1.4.2')).toThrow(
      'versionCode : 2 occurrence(s) trouvée(s), une seule attendue',
    );
    expect(() => syncGradleVersion('versionCode = 1\nversionName = 1.0\n', '1.4.2')).toThrow(
      /versionName/,
    );
  });

  it('refuse une version invalide avant de toucher au contenu', () => {
    expect(() => syncGradleVersion(fixture, '1.4')).toThrow(/invalide/);
  });

  it('ne change que deux lignes du vrai android/app/build.gradle, déjà aligné sur package.json', () => {
    const gradle = read(GRADLE_FILE);
    const synced = syncGradleVersion(gradle, '1.4.2');

    expect(changedLines(gradle, synced)).toBe(2);
    expect(synced).toContain('        versionCode 10402\n');
    expect(synced).toContain('        versionName "1.4.2"\n');
    expect(syncGradleVersion(gradle, PACKAGE_VERSION)).toBe(gradle);
  });
});

describe('syncFdroidRecipe', () => {
  it('aligne le bloc de build et la version courante de la vraie recette', () => {
    const recipe = read(FDROID_RECIPE_FILE);
    const synced = syncFdroidRecipe(recipe, '1.4.2');
    const parsed = parse(synced) as FdroidRecipe;

    expect(changedLines(recipe, synced)).toBe(5);
    expect(parsed.Builds).toHaveLength(1);
    expect(parsed.Builds[0]).toMatchObject({
      versionName: '1.4.2',
      versionCode: 10402,
      commit: 'v1.4.2',
    });
    expect(parsed.CurrentVersion).toBe('1.4.2');
    expect(parsed.CurrentVersionCode).toBe(10402);
    expect(syncFdroidRecipe(recipe, PACKAGE_VERSION)).toBe(recipe);
  });

  it('refuse une recette à plusieurs blocs de build ou sans version courante', () => {
    const recipe = read(FDROID_RECIPE_FILE);
    const twoBuilds = recipe.replace(
      'Builds:\n',
      'Builds:\n  - versionName: 0.1.0\n    versionCode: 100\n    commit: v0.1.0\n',
    );

    expect(() => syncFdroidRecipe(twoBuilds, '1.4.2')).toThrow(
      'versionName : 2 occurrence(s) trouvée(s), une seule attendue',
    );
    expect(() => syncFdroidRecipe(recipe.replace(/^CurrentVersion:.*\n/m, ''), '1.4.2')).toThrow(
      'CurrentVersion : 0 occurrence(s) trouvée(s), une seule attendue',
    );
  });
});

describe('CLI sync-android-version.mjs', () => {
  it('analyse <version> [--root <dossier>]', () => {
    expect(parseArgs(['1.2.3'])).toEqual({ version: '1.2.3', root: resolve(ROOT) });
    expect(parseArgs(['--root', 'elsewhere', '1.2.3'])).toEqual({
      version: '1.2.3',
      root: resolve('elsewhere'),
    });
    expect(() => parseArgs([])).toThrow(/Usage/);
    expect(() => parseArgs(['1.2.3', '--root'])).toThrow(/dossier manquant/);
    expect(() => parseArgs(['1.2.3', '4.5.6'])).toThrow(/inattendu/);
  });

  it("ne lance le CLI que depuis le point d'entrée", () => {
    const entry = process.argv[1] ?? '';

    expect(isEntryPoint(pathToFileURL(resolve(entry)).href)).toBe(true);
    expect(isEntryPoint(pathToFileURL(SYNC_SCRIPT).href)).toBe(false);
  });

  it("reconnaît le point d'entrée lancé via un lien symbolique", () => {
    const link = join(makeTempRoot(), 'sync-android-version.mjs');
    symlinkSync(SYNC_SCRIPT, link);
    const originalArgv = [...process.argv];
    process.argv[1] = link;

    try {
      expect(isEntryPoint(pathToFileURL(SYNC_SCRIPT).href)).toBe(true);
      expect(isEntryPoint(pathToFileURL(BUILD_SCRIPT).href)).toBe(false);
    } finally {
      process.argv = originalArgv;
    }
  });

  it('main() synchronise les fichiers de --root et annonce la version écrite', async () => {
    const root = makeTempRoot();
    copyReleaseFiles(root);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await syncVersionMain(['2.0.1', '--root', root]);

    expect(log).toHaveBeenCalledWith(
      `${GRADLE_FILE} et ${FDROID_RECIPE_FILE} : versionName "2.0.1", versionCode 20001`,
    );
    expect(readFileSync(join(root, GRADLE_FILE), 'utf8')).toContain('versionName "2.0.1"');
    expect(readFileSync(join(root, FDROID_RECIPE_FILE), 'utf8')).toContain('CurrentVersion: 2.0.1');
    log.mockRestore();
  });

  it('synchronise une copie des deux fichiers sous --root', () => {
    const root = makeTempRoot();
    copyReleaseFiles(root);

    const stdout = execFileSync(process.execPath, [SYNC_SCRIPT, '1.4.2', '--root', root], {
      encoding: 'utf8',
    });

    expect(stdout).toContain('versionName "1.4.2", versionCode 10402');
    expect(readFileSync(join(root, GRADLE_FILE), 'utf8')).toContain('versionCode 10402');
    expect(readFileSync(join(root, FDROID_RECIPE_FILE), 'utf8')).toContain('commit: v1.4.2');
    expect(readFileSync(join(root, FDROID_RECIPE_FILE), 'utf8')).toContain(
      'CurrentVersionCode: 10402',
    );
    // Le dépôt réel n'est jamais touché par les tests.
    expect(read(GRADLE_FILE)).toContain(`versionName "${PACKAGE_VERSION}"`);
  });

  it('sort en code 1 avec un message français pour une version invalide', () => {
    const result = runNode([SYNC_SCRIPT, '1.4', '--root', makeTempRoot()]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Version « 1.4 » invalide');
  });

  it('sort en code 1 sans argument et quand un fichier manque, sans rien écrire', () => {
    const root = makeTempRoot();
    copyReleaseFiles(root);
    rmSync(join(root, FDROID_RECIPE_FILE));
    const gradleBefore = readFileSync(join(root, GRADLE_FILE), 'utf8');

    expect(runNode([SYNC_SCRIPT]).status).toBe(1);
    const result = runNode([SYNC_SCRIPT, '1.4.2', '--root', root]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ENOENT');
    expect(readFileSync(join(root, GRADLE_FILE), 'utf8')).toBe(gradleBefore);
  });
});

describe('build-apk.mjs', () => {
  it('nomme l’APK universel d’après la version', () => {
    expect(getApkFileName('1.4.2')).toBe('mia-v1.4.2-universal.apk');
    expect(() => getApkFileName('v1.4.2')).toThrow(/invalide/);
  });

  it('retient le seul APK signé du dossier de sortie', () => {
    expect(pickReleaseApk(['app-release.apk', 'output-metadata.json'])).toBe('app-release.apk');
    expect(() => pickReleaseApk([])).toThrow('0 APK signé(s)');
    expect(() => pickReleaseApk(['app-release-unsigned.apk'])).toThrow(/un seul attendu/);
    expect(() => pickReleaseApk(['a.apk', 'b.apk'])).toThrow('2 APK signé(s)');
  });

  it('compile puis copie l’APK dans dist-apk/, vidé de ses anciens APK', async () => {
    const root = makeTempRoot();
    const distDir = join(root, DIST_DIR);
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, 'mia-v0.0.1-universal.apk'), 'stale');
    const gradle = vi.fn((androidDir: string) => {
      mkdirSync(join(androidDir, APK_OUTPUT_DIR), { recursive: true });
      writeFileSync(join(androidDir, APK_OUTPUT_DIR, 'app-release.apk'), 'fresh-apk');
    });

    const target = await buildApk('1.4.2', { root, gradle });

    expect(gradle).toHaveBeenCalledWith(join(root, ANDROID_DIR));
    expect(target).toBe(join(distDir, 'mia-v1.4.2-universal.apk'));
    expect(readFileSync(target, 'utf8')).toBe('fresh-apk');
    expect(existsSync(join(distDir, 'mia-v0.0.1-universal.apk'))).toBe(false);
  });

  it('échoue si Gradle ne produit aucun APK, et avant Gradle si la version est invalide', async () => {
    const root = makeTempRoot();
    const gradle = vi.fn();

    await expect(buildApk('1.4.2', { root, gradle })).rejects.toThrow(
      '0 APK signé(s) dans app/build/outputs/apk/release (dossier vide)',
    );
    await expect(buildApk('1.4', { root, gradle })).rejects.toThrow(/invalide/);
    expect(gradle).toHaveBeenCalledTimes(1);
  });

  it('lance ./gradlew assembleRelease --no-daemon dans android/', () => {
    const androidDir = writeFakeGradlew(makeTempRoot(), 'printf "%s\\n" "$@" > args.txt');

    runGradle(androidDir);

    expect(readFileSync(join(androidDir, 'args.txt'), 'utf8')).toBe(
      'assembleRelease\n--no-daemon\n',
    );
  });

  it('signale un gradlew en échec ou introuvable', () => {
    const failing = writeFakeGradlew(makeTempRoot(), 'exit 3');
    const missing = join(makeTempRoot(), ANDROID_DIR);

    expect(() => {
      runGradle(failing);
    }).toThrow('Gradle a échoué (code 3)');
    expect(() => {
      runGradle(missing);
    }).toThrow(/Impossible de lancer/);
  });

  it('expose un CLI <version> [--root <dossier>] qui enchaîne Gradle et la copie', () => {
    const root = makeTempRoot();
    writeFakeGradlew(root, FAKE_APK_SCRIPT);

    const stdout = execFileSync(process.execPath, [BUILD_SCRIPT, '1.4.2', '--root', root], {
      encoding: 'utf8',
    });

    expect(stdout).toContain(`APK prêt : ${DIST_DIR}/mia-v1.4.2-universal.apk`);
    expect(existsSync(join(root, DIST_DIR, 'mia-v1.4.2-universal.apk'))).toBe(true);
  });

  it('sort en code 1 quand Gradle échoue', () => {
    const root = makeTempRoot();
    writeFakeGradlew(root, 'exit 1');

    const result = runNode([BUILD_SCRIPT, '1.4.2', '--root', root]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Gradle a échoué (code 1)');
    expect(existsSync(join(root, DIST_DIR))).toBe(false);
  });

  it('main() enchaîne Gradle et la copie puis annonce le chemin de l’APK', async () => {
    const root = makeTempRoot();
    writeFakeGradlew(root, FAKE_APK_SCRIPT);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await buildApkMain(['1.4.2', '--root', root]);

    expect(log).toHaveBeenCalledWith(`APK prêt : ${DIST_DIR}/mia-v1.4.2-universal.apk`);
    expect(readFileSync(join(root, DIST_DIR, 'mia-v1.4.2-universal.apk'), 'utf8')).toBe(
      'fake-apk\n',
    );
    log.mockRestore();
  });
});

describe('.releaserc.json', () => {
  const config = readJson('.releaserc.json') as ReleaseConfig;
  const names = config.plugins.map(pluginName);

  it('prépare la release en trois étapes : version Android, cap sync, APK', () => {
    expect(pluginOptions(config, '@semantic-release/exec')).toEqual({
      prepareCmd:
        'node scripts/sync-android-version.mjs ${nextRelease.version} && npm run cap:sync && node scripts/build-apk.mjs ${nextRelease.version}',
    });
    expect(existsSync(SYNC_SCRIPT)).toBe(true);
    expect(existsSync(BUILD_SCRIPT)).toBe(true);
    expect(pkg.devDependencies).toHaveProperty(['@semantic-release/exec']);
  });

  it('exécute exec après npm (version déjà à jour) et avant git (fichiers commités)', () => {
    const order = ['@semantic-release/npm', '@semantic-release/exec', '@semantic-release/git'];
    const indexes = order.map((name) => names.indexOf(name));

    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(names.at(-1)).toBe('@semantic-release/github');
  });

  it('commite build.gradle et la recette F-Droid avec la version', () => {
    expect(pluginOptions(config, '@semantic-release/git').assets).toEqual([
      'CHANGELOG.md',
      'package.json',
      'package-lock.json',
      GRADLE_FILE,
      FDROID_RECIPE_FILE,
    ]);
  });

  it('attache l’APK universel à la GitHub Release', () => {
    expect(pluginOptions(config, '@semantic-release/github').assets).toEqual([
      { path: `${DIST_DIR}/*.apk`, label: 'Mia Android / Android TV Universal APK' },
    ]);
  });
});

describe('Workflow release-and-deploy.yml', () => {
  const workflow = readYaml(RELEASE_WORKFLOW) as Workflow;
  const release = getJob(workflow, 'release');

  it('installe JDK 21 (temurin) avec le cache Gradle avant npm ci et semantic-release', () => {
    const java = stepIndex(release, usesAction('actions/setup-java'));

    expect(stepAt(release, java).with).toMatchObject({
      distribution: 'temurin',
      'java-version': '21',
      cache: 'gradle',
    });
    expect(java).toBeGreaterThan(stepIndex(release, usesAction('actions/setup-node')));
    expect(java).toBeLessThan(stepIndex(release, runs('npm ci')));
    expect(java).toBeLessThan(stepIndex(release, runs('npx semantic-release')));
  });

  it('vérifie le SDK Android préinstallé et laisse le temps de compiler', () => {
    const check = stepAt(
      release,
      stepIndex(release, (step) => step.run?.includes('ANDROID_HOME') ?? false),
    );

    expect(check.run).toContain('android-actions/setup-android');
    expect(release['timeout-minutes']).toBeGreaterThanOrEqual(30);
  });

  it('décode le keystore de release seulement si le secret existe, hors du dépôt', () => {
    const keystore = stepAt(
      release,
      stepIndex(release, (step) => step.run?.includes('MIA_KEYSTORE_PATH=') ?? false),
    );
    const semanticRelease = stepAt(release, stepIndex(release, runs('npx semantic-release')));

    expect(keystore.env).toEqual({ MIA_KEYSTORE_BASE64: '${{ secrets.MIA_KEYSTORE_BASE64 }}' });
    expect(keystore.run).toContain('if [ -n "$MIA_KEYSTORE_BASE64" ]');
    expect(keystore.run).toContain('base64 -d > "$RUNNER_TEMP/mia-release.jks"');
    expect(keystore.run).toContain('>> "$GITHUB_ENV"');
    expect(semanticRelease.env).toMatchObject({
      GITHUB_TOKEN: '${{ steps.app-token.outputs.token }}',
      MIA_KEYSTORE_PASSWORD: '${{ secrets.MIA_KEYSTORE_PASSWORD }}',
      MIA_KEY_ALIAS: '${{ secrets.MIA_KEY_ALIAS }}',
      MIA_KEY_PASSWORD: '${{ secrets.MIA_KEY_PASSWORD }}',
    });
    expect(stepIndex(release, (step) => step === keystore)).toBeLessThan(
      stepIndex(release, (step) => step === semanticRelease),
    );
    expect(
      stepsOf(release).some(
        (step) => step.if === 'always()' && (step.run?.includes('mia-release.jks') ?? false),
      ),
    ).toBe(true);
  });

  it('ne lit jamais le contexte secrets dans une condition if (indisponible pour les étapes)', () => {
    expect(read(RELEASE_WORKFLOW)).not.toMatch(/^\s*if:.*secrets\./m);
  });
});

describe('Signature de l’APK (android/app/build.gradle)', () => {
  const gradle = read(GRADLE_FILE);
  const SIGNING_LINE =
    'signingConfig = releaseKeystorePath ? signingConfigs.release : signingConfigs.debug';

  it('lit la clé de release dans l’environnement et retombe sur la clé de débogage', () => {
    expect(gradle).toContain('def releaseKeystorePath = System.getenv("MIA_KEYSTORE_PATH")');
    for (const variable of ['MIA_KEYSTORE_PASSWORD', 'MIA_KEY_ALIAS', 'MIA_KEY_PASSWORD']) {
      expect(gradle).toContain(`System.getenv("${variable}")`);
    }
    expect(gradle).toContain(SIGNING_LINE);
    expect(gradle.indexOf('signingConfigs {')).toBeGreaterThan(-1);
    expect(gradle.indexOf('signingConfigs {')).toBeLessThan(gradle.indexOf('buildTypes {'));
  });

  it('est neutralisée par le sed de la recette F-Droid, qui exige un APK non signé', () => {
    const recipe = readYaml(FDROID_RECIPE_FILE) as FdroidRecipe;
    const sed = recipe.Builds[0]?.prebuild.find((command) => command.startsWith('sed ')) ?? '';
    const pattern = /^sed -i -e '\/(.+)\/d' build\.gradle$/.exec(sed)?.[1];

    expect(pattern).toBeDefined();
    const lines = gradle.split('\n');
    const matching = lines.filter((line) => line.includes(String(pattern)));
    expect(matching).toHaveLength(1);
    expect(matching[0]?.trim()).toBe(SIGNING_LINE);
    const stripped = lines.filter((line) => !line.includes(String(pattern))).join('\n');
    expect(stripped).not.toContain('signingConfig =');
    expect(stripped).toContain('signingConfigs {');
  });

  it('ignore les keystores et le dossier dist-apk/', () => {
    const androidIgnored = read('android/.gitignore').split('\n');
    expect(androidIgnored).toContain('*.jks');
    expect(androidIgnored).toContain('*.keystore');
    expect(read('.gitignore').split('\n')).toContain('dist-apk/');
  });
});

describe('Recette F-Droid (fdroid/org.mia.braintraining.yml)', () => {
  const recipe = readYaml(FDROID_RECIPE_FILE) as FdroidRecipe;
  const build = recipe.Builds[0] ?? ({} as FdroidBuild);

  it('identifie Mia, sa licence et ses dépôts', () => {
    expect(recipe.Categories).toContain('Games');
    expect(recipe.License).toBe(pkg.license);
    expect(recipe.License).toBe('GPL-3.0-or-later');
    expect(recipe.AutoName).toBe('Mia');
    expect(recipe.WebSite).toBe(pkg.homepage);
    expect(recipe.SourceCode).toBe('https://github.com/youtix/mia');
    expect(recipe.IssueTracker).toBe(pkg.bugs.url);
    expect(recipe.Changelog).toContain('CHANGELOG.md');
    expect(recipe.RepoType).toBe('git');
    expect(recipe.Repo).toBe('https://github.com/youtix/mia.git');
    expect(recipe.MaintainerNotes).toContain('Capacitor');
  });

  it('suit les tags vX.Y.Z et déclare la version courante de package.json', () => {
    expect(recipe.AutoUpdateMode).toBe('Version');
    expect(recipe.UpdateCheckMode).toBe('Tags ^v[0-9.]+$');
    const tagPattern = new RegExp(recipe.UpdateCheckMode.replace(/^Tags /, ''));
    expect(tagPattern.test(`v${PACKAGE_VERSION}`)).toBe(true);
    expect(tagPattern.test('v1.2.3-beta.1')).toBe(false);
    expect(recipe.CurrentVersion).toBe(PACKAGE_VERSION);
    expect(recipe.CurrentVersionCode).toBe(computeVersionCode(PACKAGE_VERSION));
  });

  it('décrit un seul bloc de build cohérent avec computeVersionCode', () => {
    expect(recipe.Builds).toHaveLength(1);
    expect(build.versionName).toBe(recipe.CurrentVersion);
    expect(build.versionCode).toBe(computeVersionCode(build.versionName));
    expect(build.commit).toBe(`v${build.versionName}`);
    expect(build.subdir).toBe('android/app');
    expect(build.gradle).toEqual(['yes']);
  });

  it('installe Node 22 vérifié par SHA-256 et le JDK 21 avant le build', () => {
    const sudo = build.sudo.join('\n');
    const download =
      /nodejs\.org\/dist\/v(22\.\d+\.\d+)\/node-v(22\.\d+\.\d+)-linux-x64\.tar\.xz/.exec(sudo);

    expect(download?.[1]).toBeDefined();
    expect(download?.[1]).toBe(download?.[2]);
    expect(sudo).toMatch(/echo "[0-9a-f]{64} {2}\/tmp\/node\.tar\.xz" \| sha256sum -c -/);
    expect(sudo).toContain('tar -xJf /tmp/node.tar.xz --strip-components=1 -C /usr/local');
    expect(sudo).toContain('openjdk-21-jdk-headless');
    expect(read('.nvmrc').trim()).toBe('22');
  });

  it('installe les dépendances, construit le bundle web et synchronise Capacitor', () => {
    expect(build.init).toEqual(['cd ../..', 'HUSKY=0 npm ci --no-audit --no-fund']);
    expect(build.prebuild[0]).toMatch(/^sed .* build\.gradle$/);
    expect(build.prebuild.slice(1)).toEqual([
      'cd ../..',
      'NEXT_TELEMETRY_DISABLED=1 npm run build',
      'npx cap sync android',
      expect.stringMatching(/^rm -rf /) as string,
    ]);
    const removed = build.prebuild.at(-1)?.replace('rm -rf ', '').split(' ') ?? [];
    for (const path of [
      'node_modules/esbuild',
      'node_modules/@esbuild',
      'node_modules/@img',
      'node_modules/@capacitor/cli',
      'node_modules/@pnpm',
    ]) {
      expect(removed).toContain(path);
    }
    expect(removed.some((path) => path.startsWith('node_modules/@capacitor/android'))).toBe(false);
  });
});

describe('README.md', () => {
  const readme = read('README.md');

  it('documente l’installation, la release automatique et l’ajout de niveaux', () => {
    expect(readme).toMatch(/^# Mia/);
    for (const needle of [
      'https://youtix.github.io/mia/',
      'universal.apk',
      'F-Droid',
      'Android TV',
      'npm run validate:levels',
      'parseTrafficJamAscii',
      'MEMORY_CATALOG',
      'Conventional Commits',
      'MIA_KEYSTORE_BASE64',
      'GPL-3.0-or-later',
    ]) {
      expect(readme, needle).toContain(needle);
    }
  });
});
