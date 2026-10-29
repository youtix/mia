// @vitest-environment node
import lint from '@commitlint/lint';
import load from '@commitlint/load';
import { ESLint, type Linter } from 'eslint';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import vitestConfig from '../vitest.config';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SLOW = { timeout: 30_000 };

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readJson = (path: string): unknown => JSON.parse(read(path));
const readYaml = (path: string): unknown => parse(read(path));

interface PackageJson {
  engines: Record<string, string>;
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
}

interface WorkflowStep {
  id?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

interface WorkflowJob {
  uses?: string;
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string>;
  env?: Record<string, unknown>;
  steps?: WorkflowStep[];
}

interface Workflow {
  on: Record<string, Record<string, unknown> | null>;
  jobs: Record<string, WorkflowJob>;
}

/** Configuration résolue par `ESLint#calculateConfigForFile` (typée `any` par ESLint). */
interface ResolvedEslintConfig {
  rules?: Partial<Linter.RulesRecord>;
  languageOptions?: { parserOptions?: { projectService?: unknown } };
}

interface DependabotUpdate {
  'package-ecosystem': string;
  schedule: { interval: string };
  cooldown?: { 'default-days': number };
  'commit-message': Record<string, string>;
  ignore?: { 'dependency-name': string }[];
}

function getJob(workflow: Workflow, name: string): WorkflowJob {
  const job = workflow.jobs[name];
  if (!job) throw new Error(`Job « ${name} » introuvable`);
  return job;
}

const stepsOf = (job: WorkflowJob): WorkflowStep[] => job.steps ?? [];
const runsOf = (job: WorkflowJob): string[] => stepsOf(job).flatMap((step) => step.run ?? []);

function findStep(job: WorkflowJob, action: string): WorkflowStep {
  const step = stepsOf(job).find((candidate) => candidate.uses?.startsWith(`${action}@`));
  if (!step) throw new Error(`Étape « ${action} » introuvable`);
  return step;
}

const SEVERITY_LEVELS = { off: 0, warn: 1, error: 2 } as const;

function severity(entry: Linter.RuleEntry | undefined): number {
  const level = Array.isArray(entry) ? entry[0] : entry;
  if (level === undefined) return 0;
  return typeof level === 'number' ? level : SEVERITY_LEVELS[level];
}

function ruleOptions(entry: Linter.RuleEntry | undefined): unknown {
  return Array.isArray(entry) ? entry[1] : undefined;
}

describe('Environnement', () => {
  it('fixe Node 22 via .nvmrc et bloque les versions non supportées', () => {
    expect(read('.nvmrc').trim()).toBe('22');
    expect(read('.npmrc').split('\n')).toContain('engine-strict=true');

    const { engines } = readJson('package.json') as PackageJson;
    expect(engines).toEqual({ node: '^22.22.2 || >=24.15.0', npm: '>=10.0.0' });
  });

  it('normalise les éditeurs avec .editorconfig', () => {
    const editorconfig = read('.editorconfig');

    for (const setting of [
      'charset = utf-8',
      'end_of_line = lf',
      'insert_final_newline = true',
      'indent_style = space',
      'indent_size = 2',
    ]) {
      expect(editorconfig).toContain(setting);
    }
  });

  it('expose les scripts qualité normalisés', () => {
    const { scripts } = readJson('package.json') as PackageJson;

    expect(scripts).toMatchObject({
      typecheck: 'tsc --noEmit',
      lint: 'eslint . --max-warnings=0',
      'lint:fix': 'eslint . --fix',
      format: 'prettier --write .',
      'format:check': 'prettier --check .',
      test: 'vitest run',
      'test:coverage': 'vitest run --coverage',
      'validate:levels': 'tsx scripts/validate-levels.ts',
      'validate:all':
        'npm run format:check && npm run lint && npm run typecheck && npm run validate:levels && npm run test:coverage && npm run build',
      prepare: 'husky',
    });
  });
});

describe('Prettier', () => {
  it('trie les imports puis les classes Tailwind (plugin Tailwind en dernier)', () => {
    expect(readJson('.prettierrc.json')).toMatchObject({
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
      tabWidth: 2,
      plugins: ['prettier-plugin-organize-imports', 'prettier-plugin-tailwindcss'],
      tailwindStylesheet: './src/app/globals.css',
    });
  });

  it('ignore les dossiers générés, les specs et les fichiers produits par les outils', () => {
    const ignored = read('.prettierignore').split('\n');

    for (const entry of [
      'out/',
      'coverage/',
      'android/',
      'node_modules/',
      '.next/',
      'docs/',
      'CHANGELOG.md',
      'package-lock.json',
    ]) {
      expect(ignored).toContain(entry);
    }
  });
});

describe('ESLint (pack strict)', () => {
  const eslint = new ESLint({ cwd: ROOT });
  const configFor = async (path: string) =>
    (await eslint.calculateConfigForFile(path)) as ResolvedEslintConfig;

  it('active les règles typées strictes, Next et les règles explicites', SLOW, async () => {
    const config = await configFor('src/app/page.tsx');
    const rules = config.rules ?? {};

    expect(config.languageOptions?.parserOptions?.projectService).toBe(true);
    for (const rule of [
      '@typescript-eslint/no-explicit-any',
      '@typescript-eslint/no-floating-promises',
      '@typescript-eslint/no-unnecessary-condition',
      '@typescript-eslint/prefer-nullish-coalescing',
      'react-hooks/rules-of-hooks',
      '@next/next/no-sync-scripts',
    ]) {
      expect(severity(rules[rule]), rule).toBe(2);
    }
    expect(ruleOptions(rules['@typescript-eslint/no-unused-vars'])).toMatchObject({
      argsIgnorePattern: '^_',
    });
    expect(ruleOptions(rules['@typescript-eslint/consistent-type-imports'])).toMatchObject({
      fixStyle: 'inline-type-imports',
    });
  });

  it('applique toutes les règles jsx-a11y strict après celles de Next', SLOW, async () => {
    const loadCommonJs = createRequire(import.meta.url);
    const jsxA11y = loadCommonJs('eslint-plugin-jsx-a11y') as {
      flatConfigs: { strict: { rules: Record<string, Linter.RuleEntry> } };
    };
    const rules = (await configFor('src/app/page.tsx')).rules ?? {};

    for (const [rule, entry] of Object.entries(jsxA11y.flatConfigs.strict.rules)) {
      expect(severity(rules[rule]), rule).toBe(severity(entry));
    }
  });

  it('place eslint-config-prettier en dernier', SLOW, async () => {
    const rules = (await configFor('src/app/page.tsx')).rules ?? {};

    expect(severity(rules['no-unexpected-multiline'])).toBe(0);
  });

  it('désactive les règles typées pour les fichiers de configuration JS', SLOW, async () => {
    const rules = (await configFor('eslint.config.mjs')).rules ?? {};

    expect(severity(rules['@typescript-eslint/no-floating-promises'])).toBe(0);
  });
});

describe('Commitlint', () => {
  const lintMessage = async (message: string) => {
    const config = await load({}, { cwd: ROOT });
    const options: NonNullable<Parameters<typeof lint>[2]> = {
      parserOpts: config.parserPreset?.parserOpts as NonNullable<
        Parameters<typeof lint>[2]
      >['parserOpts'],
      plugins: config.plugins,
      ignores: config.ignores,
      defaultIgnores: config.defaultIgnores,
    };
    return lint(message, config.rules, options);
  };

  it.each([
    'feat(core): init quality tools',
    'docs: clarify the level authoring guide',
    'fix(deps): bump next from 16.4.3 to 16.5.0',
    'chore(deps-dev): bump the dev group with 3 updates',
    'feat(memory)!: drop legacy save format',
  ])('accepte « %s »', SLOW, async (message) => {
    expect((await lintMessage(message)).valid).toBe(true);
  });

  it.each([
    'bad commit message',
    'feat(unknown-scope): add something',
    'wip(core): save progress',
    'feat(core): Add capitalized subject',
  ])('rejette « %s »', SLOW, async (message) => {
    expect((await lintMessage(message)).valid).toBe(false);
  });

  it('ignore les commits de release générés par semantic-release', SLOW, async () => {
    const longNote = `* **quality:** add tooling (${'x'.repeat(120)})`;

    expect((await lintMessage(`chore(release): 0.2.0 [skip ci]\n\n${longNote}`)).valid).toBe(true);
  });

  it('autorise exactement les 11 types Conventional Commits', SLOW, async () => {
    const { rules } = await load({}, { cwd: ROOT });

    expect(rules['type-enum']).toEqual([
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ]);
  });
});

describe('Husky & lint-staged', () => {
  it.each([
    ['pre-commit', 'npx lint-staged && npm run typecheck'],
    ['commit-msg', 'npx --no -- commitlint --edit "$1"'],
    ['pre-push', 'npm run test:coverage'],
  ])('déclare le hook %s', (hook, command) => {
    expect(read(`.husky/${hook}`).trim()).toBe(command);
  });

  it('corrige avec ESLint avant de formater les fichiers indexés', () => {
    expect(readJson('.lintstagedrc.json')).toEqual({
      '*.{ts,tsx,js,mjs,cjs}': [
        'eslint --fix --max-warnings=0 --no-warn-ignored',
        'prettier --write',
      ],
      '*.{json,md,css,yml,yaml}': ['prettier --write'],
    });
  });
});

describe('Couverture Vitest', () => {
  it('impose 80 % de couverture v8 sur src/', () => {
    const coverage = vitestConfig.test?.coverage;

    expect(coverage).toMatchObject({
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    });
  });

  it('impose 90 % de couverture au moteur pur de Memory (FEAT-09)', () => {
    expect(vitestConfig.test?.coverage).toMatchObject({
      thresholds: {
        'src/games/memory/*.ts': { lines: 90, functions: 90, branches: 90, statements: 90 },
      },
    });
  });

  it('impose 90 % de couverture au moteur pur de Traffic Jam (FEAT-12)', () => {
    expect(vitestConfig.test?.coverage).toMatchObject({
      thresholds: {
        'src/games/traffic-jam/*.ts': { lines: 90, functions: 90, branches: 90, statements: 90 },
      },
    });
  });
});

describe('semantic-release', () => {
  it('publie depuis main sans publication npm et commite changelog et version', () => {
    expect(readJson('.releaserc.json')).toEqual({
      branches: ['main'],
      plugins: [
        ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
        ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
        ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
        ['@semantic-release/npm', { npmPublish: false }],
        [
          '@semantic-release/git',
          {
            assets: ['CHANGELOG.md', 'package.json', 'package-lock.json'],
            message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
          },
        ],
        '@semantic-release/github',
      ],
    });
  });

  it('installe les plugins et le preset conventionalcommits', () => {
    const { devDependencies } = readJson('package.json') as PackageJson;

    for (const dependency of [
      'semantic-release',
      '@semantic-release/changelog',
      '@semantic-release/git',
      '@semantic-release/github',
      '@semantic-release/npm',
      'conventional-changelog-conventionalcommits',
    ]) {
      expect(devDependencies, dependency).toHaveProperty([dependency]);
    }
  });
});

describe('GitHub', () => {
  it('maintient npm et les actions chaque semaine avec des messages conformes', () => {
    const { updates } = readYaml('.github/dependabot.yml') as { updates: DependabotUpdate[] };
    const npm = updates.find((update) => update['package-ecosystem'] === 'npm');
    const actions = updates.find((update) => update['package-ecosystem'] === 'github-actions');

    expect(npm).toMatchObject({
      schedule: { interval: 'weekly' },
      cooldown: { 'default-days': 3 },
      'commit-message': { prefix: 'fix', 'prefix-development': 'chore', include: 'scope' },
    });
    expect(npm?.ignore?.map((rule) => rule['dependency-name'])).toEqual(
      expect.arrayContaining([
        'eslint',
        '@eslint/js',
        'typescript',
        '@types/node',
        'conventional-changelog-conventionalcommits',
      ]),
    );
    expect(actions).toMatchObject({
      schedule: { interval: 'weekly' },
      'commit-message': { prefix: 'chore', include: 'scope' },
    });
  });

  it('vérifie chaque PR (format, lint, types, niveaux, couverture, build)', () => {
    const workflow = readYaml('.github/workflows/ci.yml') as Workflow;

    expect(Object.keys(workflow.on)).toEqual(['pull_request', 'workflow_call']);
    expect(runsOf(getJob(workflow, 'verify'))).toEqual([
      'npm ci',
      'npm run format:check',
      'npm run lint',
      'npm run typecheck',
      'npm run validate:levels',
      'npm run test:coverage',
      'npm run build',
    ]);
  });

  it('valide le titre de PR avec commitlint sans injection shell', () => {
    const workflow = readYaml('.github/workflows/pr-title.yml') as Workflow;
    const job = getJob(workflow, 'pr-title');
    const lintStep = stepsOf(job).find((step) => step.run?.includes('commitlint'));

    expect(workflow.on.pull_request?.types).toEqual(
      expect.arrayContaining(['opened', 'edited', 'synchronize']),
    );
    expect(lintStep?.env).toEqual({
      PR_TITLE: '${{ github.event.pull_request.title }}',
    });
    expect(lintStep?.run).toContain('"$PR_TITLE"');
    expect(lintStep?.run).not.toContain('github.event');
  });

  it('publie la release depuis main puis déploie la PWA sur GitHub Pages', () => {
    const workflow = readYaml('.github/workflows/release-and-deploy.yml') as Workflow;
    const verify = getJob(workflow, 'verify');
    const release = getJob(workflow, 'release');
    const deploy = getJob(workflow, 'deploy-pwa');

    expect(workflow.on).toEqual({ push: { branches: ['main'] } });
    expect(verify.uses).toBe('./.github/workflows/ci.yml');

    expect(release.needs).toBe('verify');
    expect(String(release.env?.HUSKY)).toBe('0');
    expect(findStep(release, 'actions/create-github-app-token').with).toHaveProperty('private-key');
    expect(runsOf(release)).toContain('npx semantic-release');

    expect(deploy.needs).toBe('release');
    expect(deploy.if).toContain('needs.release.outputs.published');
    expect(deploy.permissions).toMatchObject({ pages: 'write', 'id-token': 'write' });
    expect(findStep(deploy, 'actions/checkout').with?.ref).toBe('${{ needs.release.outputs.tag }}');
    expect(findStep(deploy, 'actions/configure-pages').id).toBe('pages');
    expect(stepsOf(deploy).find((step) => step.run === 'npm run build')?.env).toEqual({
      NEXT_PUBLIC_BASE_PATH: '${{ steps.pages.outputs.base_path }}',
    });
    expect(findStep(deploy, 'actions/upload-pages-artifact').with).toEqual({ path: 'out' });
    expect(findStep(deploy, 'actions/deploy-pages').id).toBe('deployment');
  });
});
