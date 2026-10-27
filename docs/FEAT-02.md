# FEAT-02 : Environnement Projet, Bonnes Pratiques Qualité, CI & Release Automatique

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-02`
> **Dépendances** : [FEAT-01](./FEAT-01.md)

---

## 1. Contexte & Objectif pour l'IA

Cette feature met en place dès le début du projet **Mia** l'ensemble des gardes-fous d'ingénierie logicielle pour que toutes les features suivantes (`FEAT-03` à `FEAT-16`) soient développées selon les standards les plus stricts :
1. **Standardisation de l'environnement** : `.nvmrc` (Node 22 LTS), `.editorconfig`, `engines` stricts dans `package.json` (appliqués par `engine-strict=true` dans `.npmrc`).
2. **Linter Pack Strict Complet (ESLint 9 Flat Config)** : `@eslint/js` recommended + `typescript-eslint` (`strictTypeChecked` & `stylisticTypeChecked`) + `eslint-config-next` (React / Hooks / Core Web Vitals) + `eslint-plugin-jsx-a11y` (`strict` pour garantir l'accessibilité clavier/télécommande Android TV) + `eslint-config-prettier`, avec tolérance **0 warning** (`--max-warnings=0`).
3. **Formateur de code (Prettier)** : avec tri automatique des imports (`prettier-plugin-organize-imports`) et tri automatique des classes Tailwind (`prettier-plugin-tailwindcss`).
4. **Git Hooks & Commitlint (Husky + lint-staged)** :
   * `pre-commit` : formatage Prettier + ESLint strict + Typecheck TypeScript.
   * `commit-msg` : validation **Conventional Commits** (`@commitlint/config-conventional`).
   * `pre-push` : exécution des tests unitaires avec vérification de la couverture (`>= 80%`).
5. **Couverture de tests obligatoire (`@vitest/coverage-v8`)** : seuil minimal fixé à **80%** (lignes, fonctions, branches, statements).
6. **CI, Release Automatique (`semantic-release`) & Déploiement Automatique au merge sur `main`** :
   * Workflow CI sur chaque Pull Request (et sur chaque push sur `main`, via le workflow de release) + validation du titre de PR (squash merge).
   * Workflow `release-and-deploy.yml` sur `main` : calcule automatiquement la nouvelle version SemVer à partir des Conventional Commits, met à jour `CHANGELOG.md` et `package.json`, crée le tag Git `vX.Y.Z` et la **GitHub Release**, et déploie automatiquement la PWA sur **GitHub Pages**.
7. **Maintenance automatisée** : configuration **Dependabot** (`.github/dependabot.yml`).

---

## 2. Fichiers à Créer / Configurer

```text
/home/alexeiananenko/Workspace/mia/
├── .nvmrc                             # Fixé à "22"
├── .npmrc                             # engine-strict=true
├── .editorconfig                      # UTF-8, LF, indent 2 espaces
├── .prettierrc.json                   # Configuration Prettier + plugins imports & tailwind
├── .prettierignore                    # out/, coverage/, android/, node_modules/, .next/, docs/, CHANGELOG.md, package-lock.json
├── eslint.config.mjs                  # ESLint 9 Flat Config (strictTypeChecked + jsx-a11y strict)
├── commitlint.config.mjs              # @commitlint/config-conventional
├── .lintstagedrc.json                 # ESLint --fix + Prettier --write sur fichiers stagés
├── .releaserc.json                    # Configuration semantic-release (Changelog + Git + GitHub Release)
├── .husky/
│   ├── pre-commit                     # npx lint-staged && npm run typecheck
│   ├── commit-msg                     # npx --no -- commitlint --edit "$1"
│   └── pre-push                       # npm run test:coverage
├── .github/
│   ├── dependabot.yml                 # Mises à jour hebdo npm + github-actions (fix(deps) / chore(deps-dev) / chore(deps))
│   └── workflows/
│       ├── ci.yml                     # PR vers main + workflow_call : Format, Lint, Typecheck, Coverage >= 80%, Build
│       ├── pr-title.yml               # Titre de PR validé par commitlint (il devient le commit squash)
│       └── release-and-deploy.yml     # Semantic-Release auto sur main + Déploiement GitHub Pages
├── vitest.config.ts                   # Ajout de @vitest/coverage-v8 avec seuils à 80%
├── package.json                       # Scripts qualité, engines, devDependencies
└── tests/
    └── quality-setup.test.ts          # Tests vérifiant la présence et la validité des configs qualité
```

---

## 3. Spécifications Techniques Détaillées

### 3.1. Standardisation de l'Environnement (`.nvmrc`, `.editorconfig`, `package.json`)
* `.nvmrc` : contient `22`.
* `.editorconfig` : `root = true`, `charset = utf-8`, `end_of_line = lf`, `insert_final_newline = true`, `indent_style = space`, `indent_size = 2`, `trim_trailing_whitespace = true` (sauf `*.md`, où deux espaces finaux forcent un saut de ligne).
* Dans `package.json` :
  ```json
  "engines": {
    "node": "^22.22.2 || >=24.15.0",
    "npm": ">=10.0.0"
  }
  ```
  > Le minimum de 22.13 (jsdom 29, Vitest 5, Vite 8 — voir [FEAT-01 §6](./FEAT-01.md#6-décisions-dimplémentation-session-de-cadrage)) est relevé par `lint-staged` 17, `@semantic-release/changelog` 7 et `@semantic-release/git` 11 (`^22.22.2 || >=24.15`).
* `.npmrc` : `engine-strict=true` (`npm install` / `npm ci` refusent une version de Node hors `engines`).

### 3.2. ESLint 9 Flat Config — Pack Strict Complet (`eslint.config.mjs`)
Packages à installer en `devDependencies` :
* `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-jsx-a11y`, `eslint-config-prettier`
* Bornes à respecter : `eslint` et `@eslint/js` en `^9` (les plugins de `eslint-config-next` ne supportent pas ESLint 10, et `@eslint/js` 10 exige ESLint 10) et `typescript` en `~6.0.x` (peer de `typescript-eslint` : `<6.1.0`).
* Configuration requise dans `eslint.config.mjs` :
  * Activer `tseslint.configs.strictTypeChecked` et `tseslint.configs.stylisticTypeChecked` avec `languageOptions.parserOptions.projectService: true`.
  * Activer les règles `jsx-a11y` en mode `strict` (vérifie que chaque élément interactif est accessible au clavier/focus D-Pad, possède un rôle et des attributs ARIA valides). ⚠️ `eslint-config-next` enregistre déjà le plugin `jsx-a11y` : ne reprendre que `jsxA11y.flatConfigs.strict.rules` (ajouter la config telle quelle provoque « Cannot redefine plugin »).
  * Partir de `eslint-config-next/core-web-vitals` (pas de `eslint-config-next/typescript`, remplacé par `strictTypeChecked`) et appliquer `tseslint.configs.disableTypeChecked` aux fichiers `**/*.{js,mjs,cjs}` (hors `tsconfig`).
  * Règles explicites :
    * `@typescript-eslint/no-explicit-any`: `'error'`
    * `@typescript-eslint/no-unused-vars`: `['error', { argsIgnorePattern: '^_' }]`
    * `@typescript-eslint/consistent-type-imports`: `['error', { fixStyle: 'inline-type-imports' }]` (style `import { X, type Y }` de FEAT-01)
  * Placer `eslintConfigPrettier` en dernier pour désactiver les règles de formatage en conflit avec Prettier.
  * Ignorer : `out/**`, `.next/**`, `coverage/**`, `android/**`, `node_modules/**`, `next-env.d.ts`.

### 3.3. Prettier (`.prettierrc.json` & `.prettierignore`)
Packages à installer :
* `prettier`, `prettier-plugin-organize-imports`, `prettier-plugin-tailwindcss`
* Configuration `.prettierrc.json` :
  ```json
  {
    "semi": true,
    "singleQuote": true,
    "trailingComma": "all",
    "printWidth": 100,
    "tabWidth": 2,
    "plugins": [
      "prettier-plugin-organize-imports",
      "prettier-plugin-tailwindcss"
    ],
    "tailwindStylesheet": "./src/app/globals.css",
    "tailwindFunctions": ["cn", "clsx", "twMerge"]
  }
  ```
  > `tailwindStylesheet` est requis par Tailwind v4 pour trier selon le thème du projet ; `tailwindFunctions` trie aussi les classes passées au helper `cn()` de FEAT-03.
* `.prettierignore` : `out/`, `coverage/`, `android/`, `node_modules/`, `.next/`, ainsi que `docs/` (spécifications rédigées à la main : Prettier alignerait chaque tableau sur sa cellule la plus longue), `CHANGELOG.md` (généré par semantic-release dans un format non-Prettier) et `package-lock.json`.

### 3.4. Husky, `lint-staged` & Commitlint
Packages à installer :
* `husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional`
* **`commitlint.config.mjs`** :
  * Étend `['@commitlint/config-conventional']`.
  * Types autorisés : `['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']`.
  * Scopes autorisés (`scope-enum`, scope facultatif) : `core`, `ui`, `navigation`, `storage`, `profile`, `progression`, `hub`, `memory`, `traffic-jam`, `android`, `pwa`, `release`, `quality`, `deps`, `deps-dev`.
  * `ignores` : les commits `chore(release):` générés par semantic-release (notes de version > 100 caractères par ligne).
* **`.lintstagedrc.json`** (ESLint corrige d'abord, Prettier formate ensuite le résultat ; `--no-warn-ignored` évite qu'un fichier ignoré compte comme warning) :
  ```json
  {
    "*.{ts,tsx,js,mjs,cjs}": [
      "eslint --fix --max-warnings=0 --no-warn-ignored",
      "prettier --write"
    ],
    "*.{json,md,css,yml,yaml}": [
      "prettier --write"
    ]
  }
  ```
* **Hooks dans `.husky/`** :
  * `.husky/pre-commit` : `npx lint-staged && npm run typecheck`
  * `.husky/commit-msg` : `npx --no -- commitlint --edit "$1"`
  * `.husky/pre-push` : `npm run test:coverage`

### 3.5. Vitest Coverage à 80% (`vitest.config.ts`)
Installe `@vitest/coverage-v8` et configure dans `vitest.config.ts` :
```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json-summary', 'lcov'],
  include: ['src/**/*.{ts,tsx}'],
  exclude: [
    'src/**/*.d.ts',
    'src/**/index.ts',
    'src/types/**',
    'src/app/layout.tsx',
  ],
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80,
  },
}
```

### 3.6. Scripts Normalisés dans `package.json`
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "npx serve@latest out",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings=0",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "validate:all": "npm run format:check && npm run lint && npm run typecheck && npm run test:coverage && npm run build",
    "prepare": "husky"
  }
}
```

### 3.7. Release Automatique (`semantic-release`) & Déploiement Automatique sur `main`
Packages à installer :
* `semantic-release`, `@semantic-release/changelog`, `@semantic-release/git`, `@semantic-release/github`, `@semantic-release/npm`, `conventional-changelog-conventionalcommits` (requis par le preset `conventionalcommits`, non fourni par semantic-release)
* **Configuration `.releaserc.json`** :
  * Branche : `["main"]`.
  * Plugins :
    1. `@semantic-release/commit-analyzer` (preset `conventionalcommits`)
    2. `@semantic-release/release-notes-generator` (preset `conventionalcommits`)
    3. `@semantic-release/changelog` (`changelogFile: "CHANGELOG.md"`)
    4. `@semantic-release/npm` (`npmPublish: false` — met uniquement à jour la version dans `package.json` !)
    5. `@semantic-release/git` (`assets: ["CHANGELOG.md", "package.json", "package-lock.json"]`, `message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"`)
    6. `@semantic-release/github`
* **Workflow `.github/workflows/ci.yml`** (sur `pull_request` vers `main` et `workflow_call` ; les commits `chore(release)` portent `[skip ci]`) :
  * Job `verify` : exécute `npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:coverage`, et `npm run build`.
* **Workflow `.github/workflows/pr-title.yml`** (sur `pull_request` : `opened`, `edited`, `synchronize`, `reopened`) :
  * Job `pr-title` : valide le titre de la PR avec `commitlint` (il devient le message du commit squash). Le titre est transmis par variable d'environnement, jamais interpolé dans le script.
* **Workflow `.github/workflows/release-and-deploy.yml`** (sur chaque `push` / merge sur `main`) :
  * **Job 1 (`verify`)** : réutilise `ci.yml` (`uses: ./.github/workflows/ci.yml`), soit les mêmes vérifications que `npm run validate:all`.
  * **Job 2 (`release`)** : exécute `npx semantic-release` avec le token d'une **GitHub App** (`actions/create-github-app-token@v3`, variable `RELEASE_APP_CLIENT_ID` + secret `RELEASE_APP_PRIVATE_KEY`), seule autorisée à pousser sur `main` protégée ; l'App a les permissions `contents`, `issues` et `pull-requests` en écriture. Le `GITHUB_TOKEN` du job reste en `contents: read` ; `HUSKY=0` pour que le commit de release ne déclenche pas les hooks.
  * **Job 3 (`deploy-pwa`)** : uniquement si une version a été publiée. Récupère le **tag** de release, compile l'export statique Next.js (`npm run build`) avec la nouvelle version et déploie automatiquement `out/` sur **GitHub Pages** (`actions/upload-pages-artifact@v5` + `actions/deploy-pages@v5`, permissions `pages: write` et `id-token: write`).
    * ⚠️ **`basePath` obligatoire** : GitHub Pages sert le site sous `/<nom-du-dépôt>/`. Ajouter une étape `actions/configure-pages@v6` (`id: pages`) avant le build et compiler avec `env: NEXT_PUBLIC_BASE_PATH: ${{ steps.pages.outputs.base_path }}` (ex. `/mia`, vide avec un domaine personnalisé). Sans cela, tous les assets `/_next/…` renvoient 404. Les autres builds (CI, APK) restent sans `basePath`.

### 3.8. Dependabot (`.github/dependabot.yml`)
* Configure la vérification hebdomadaire (`schedule.interval: "weekly"`, `cooldown.default-days: 3`) pour `package-ecosystem: "npm"` et `package-ecosystem: "github-actions"`, avec des messages conformes à Commitlint :
  * npm : `commit-message: { prefix: "fix", prefix-development: "chore", include: "scope" }` → `fix(deps)` pour les dépendances embarquées dans l'app (release patch + redéploiement), `chore(deps-dev)` pour l'outillage. Mises à jour mineures/patch groupées (`prod`, `dev`). Ignorés : versions majeures de `eslint`, `@eslint/js` et `@types/node`, et `typescript >= 6.1.0`.
  * github-actions : `commit-message: { prefix: "chore", include: "scope" }`, toutes les mises à jour dans un seul groupe (`actions`).

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `npm run format:check` passe sans erreur (tous les fichiers du dépôt hors `.prettierignore` sont formatés par Prettier).
- [ ] `npm run lint` passe avec **0 erreur et 0 warning** (`--max-warnings=0`).
- [ ] `npm run typecheck` passe sans erreur.
- [ ] `npm run test:coverage` passe et respecte le seuil minimal de **80% de couverture**.
- [ ] `npm run validate:all` s'exécute de bout en bout avec un code de retour `0`.
- [ ] `npx commitlint --from HEAD~1` (ou test d'une chaîne via `echo "feat(core): init quality tools" | npx commitlint`) valide les messages Conventional Commits et rejette `"bad commit message"`.

---

## 5. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Node** | Node 22 conservé (`.nvmrc` = `22`), mais `engines.node` relevé à `^22.22.2 \|\| >=24.15.0` pour utiliser les dernières versions majeures (`lint-staged` 17, `@semantic-release/changelog` 7, `@semantic-release/git` 11). `engine-strict=true` dans `.npmrc` : `npm install` échoue immédiatement sur une version non supportée (le conteneur Dependabot, en Node 24, est compatible). |
| **Dépôt GitHub** | [`youtix/mia`](https://github.com/youtix/mia), public (GitHub Pages et rulesets gratuits uniquement pour un dépôt public), PWA sur `https://youtix.github.io/mia/` (`basePath` = `/mia`, fourni par `actions/configure-pages`). `package.json` renseigne `repository`, `homepage` et `bugs`. |
| **Flux Git** | Pull requests + **squash merge uniquement** ; message du commit squash = **titre de la PR seul** (`squash_merge_commit_message: BLANK`) : les descriptions des PR Dependabot citent les notes de version amont, et une ligne `BREAKING CHANGE:` y déclencherait une version majeure. Branches supprimées après merge. |
| **Protection de `main`** | Ruleset sur la branche par défaut : PR obligatoire (0 approbation, squash seul), checks `verify` et `pr-title` requis (GitHub Actions), historique linéaire, ni force-push ni suppression. Seule la **GitHub App de release** est autorisée à contourner le ruleset, pour pousser le commit `chore(release)`. |
| **GitHub App de release** | Token éphémère via `actions/create-github-app-token@v3` (`client-id` = variable `RELEASE_APP_CLIENT_ID`, clé = secret `RELEASE_APP_PRIVATE_KEY`) ; permissions de l'App : `contents`, `issues`, `pull-requests` en écriture. Les commits de release sont signés de l'identité `<app>[bot]`. Le push du commit de release ne relance aucun workflow (`[skip ci]`). |
| **Versionnement** | Tag de référence `v0.1.0` posé sur le commit de FEAT-01 (aligné sur `package.json`) : semantic-release reste en `0.x` (`feat` → mineure, `fix`/`perf` → patch). `1.0.0` est réservée à la première version complète (jeux + APK), via un commit `!` / `BREAKING CHANGE`. La PR de FEAT-02 est titrée `feat(quality): …` et publie `v0.2.0`. |
| **Déploiement Pages** | Uniquement quand une nouvelle version est publiée (Pages = dernière GitHub Release), à partir du **tag** de release (le commit déclencheur porte l'ancienne version). En cas d'échec, « Re-run failed jobs » relance le déploiement de la même release. |
| **Langue** | Commits et changelog en anglais (preset `conventionalcommits` par défaut), comme les exemples de commits des specs. |
| **CI** | `ci.yml` sur les PR vers `main` + `workflow_call` ; `release-and-deploy.yml` le réutilise comme job `verify` (une seule définition des vérifications, sans double exécution sur `main`). Permissions minimales par job, `concurrency` (jamais deux releases simultanées), `timeout-minutes`, dernières versions majeures des actions officielles (`checkout` v7, `setup-node` v7 avec `node-version-file: .nvmrc`, `configure-pages` v6, `upload-pages-artifact` v5, `deploy-pages` v5). |
| **Dependabot** | Voir §3.8. Alertes et mises à jour de sécurité Dependabot activées sur le dépôt. |
| **Commitlint** | Scopes limités à une liste (voir §3.4), scope facultatif ; le titre de PR est validé en CI avec la même configuration (`pr-title.yml`). |
| **Prettier** | `docs/` exclu (voir §3.3) ; le reste du dépôt (code, configs, workflows, futur `README.md`) est formaté. |
| **Tests** | `tests/quality-setup.test.ts` (environnement `node`) vérifie le contenu des configs (JSON, YAML via `yaml`) **et** leur comportement : moteur commitlint (`@commitlint/load` + `@commitlint/lint`), configuration ESLint résolue (`ESLint#calculateConfigForFile`), seuils importés de `vitest.config.ts`. |
