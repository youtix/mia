# FEAT-02 : Environnement Projet, Bonnes Pratiques Qualité, CI & Release Automatique

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-02`
> **Dépendances** : [FEAT-01](./FEAT-01.md)

---

## 1. Contexte & Objectif pour l'IA

Cette feature met en place dès le début du projet **Mia** l'ensemble des gardes-fous d'ingénierie logicielle pour que toutes les features suivantes (`FEAT-03` à `FEAT-16`) soient développées selon les standards les plus stricts :
1. **Standardisation de l'environnement** : `.nvmrc` (Node 22 LTS), `.editorconfig`, `engines` stricts dans `package.json`.
2. **Linter Pack Strict Complet (ESLint 9 Flat Config)** : `@eslint/js` recommended + `typescript-eslint` (`strictTypeChecked` & `stylisticTypeChecked`) + `eslint-config-next` (React / Hooks / Core Web Vitals) + `eslint-plugin-jsx-a11y` (`strict` pour garantir l'accessibilité clavier/télécommande Android TV) + `eslint-config-prettier`, avec tolérance **0 warning** (`--max-warnings=0`).
3. **Formateur de code (Prettier)** : avec tri automatique des imports (`prettier-plugin-organize-imports`) et tri automatique des classes Tailwind (`prettier-plugin-tailwindcss`).
4. **Git Hooks & Commitlint (Husky + lint-staged)** :
   * `pre-commit` : formatage Prettier + ESLint strict + Typecheck TypeScript.
   * `commit-msg` : validation **Conventional Commits** (`@commitlint/config-conventional`).
   * `pre-push` : exécution des tests unitaires avec vérification de la couverture (`>= 80%`).
5. **Couverture de tests obligatoire (`@vitest/coverage-v8`)** : seuil minimal fixé à **80%** (lignes, fonctions, branches, statements).
6. **CI, Release Automatique (`semantic-release`) & Déploiement Automatique au merge sur `main`** :
   * Workflow CI sur chaque Push / Pull Request.
   * Workflow `release-and-deploy.yml` sur `main` : calcule automatiquement la nouvelle version SemVer à partir des Conventional Commits, met à jour `CHANGELOG.md` et `package.json`, crée le tag Git `vX.Y.Z` et la **GitHub Release**, et déploie automatiquement la PWA sur **GitHub Pages**.
7. **Maintenance automatisée** : configuration **Dependabot** (`.github/dependabot.yml`).

---

## 2. Fichiers à Créer / Configurer

```text
/home/alexeiananenko/Workspace/mia/
├── .nvmrc                             # Fixé à "22"
├── .editorconfig                      # UTF-8, LF, indent 2 espaces
├── .prettierrc.json                   # Configuration Prettier + plugins imports & tailwind
├── .prettierignore                    # out/, coverage/, android/, node_modules/, .next/
├── eslint.config.mjs                  # ESLint 9 Flat Config (strictTypeChecked + jsx-a11y strict)
├── commitlint.config.mjs              # @commitlint/config-conventional
├── .lintstagedrc.json                 # ESLint --fix + Prettier --write sur fichiers stagés
├── .releaserc.json                    # Configuration semantic-release (Changelog + Git + GitHub Release)
├── .husky/
│   ├── pre-commit                     # npx lint-staged && npm run typecheck
│   ├── commit-msg                     # npx --no -- commitlint --edit "$1"
│   └── pre-push                       # npm run test:coverage
├── .github/
│   ├── dependabot.yml                 # Mises à jour hebdo npm + github-actions (préfixe chore(deps))
│   └── workflows/
│       ├── ci.yml                     # Lint, Format, Typecheck, Coverage >= 80%, Build
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
* `.editorconfig` : `charset = utf-8`, `end_of_line = lf`, `insert_final_newline = true`, `indent_style = space`, `indent_size = 2`.
* Dans `package.json` :
  ```json
  "engines": {
    "node": ">=22.13.0",
    "npm": ">=10.0.0"
  }
  ```
  > Node ≥ 22.13 est le minimum réel imposé par jsdom 29, Vitest 5 et Vite 8 (voir [FEAT-01 §6](./FEAT-01.md#6-décisions-dimplémentation-session-de-cadrage)).

### 3.2. ESLint 9 Flat Config — Pack Strict Complet (`eslint.config.mjs`)
Packages à installer en `devDependencies` :
* `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-jsx-a11y`, `eslint-config-prettier`
* Bornes à respecter : `eslint` en `^9` (les plugins de `eslint-config-next` ne supportent pas ESLint 10) et `typescript` en `~6.0.x` (peer de `typescript-eslint` : `<6.1.0`).
* Configuration requise dans `eslint.config.mjs` :
  * Activer `tseslint.configs.strictTypeChecked` et `tseslint.configs.stylisticTypeChecked` avec `languageOptions.parserOptions.projectService: true`.
  * Activer les règles `jsx-a11y` en mode `strict` (vérifie que chaque élément interactif est accessible au clavier/focus D-Pad, possède un rôle et des attributs ARIA valides).
  * Règles explicites :
    * `@typescript-eslint/no-explicit-any`: `'error'`
    * `@typescript-eslint/no-unused-vars`: `['error', { argsIgnorePattern: '^_' }]`
    * `@typescript-eslint/consistent-type-imports`: `'error'`
  * Placer `eslintConfigPrettier` en dernier pour désactiver les règles de formatage en conflit avec Prettier.
  * Ignorer : `out/**`, `.next/**`, `coverage/**`, `android/**`, `node_modules/**`.

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
    ]
  }
  ```

### 3.4. Husky, `lint-staged` & Commitlint
Packages à installer :
* `husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional`
* **`commitlint.config.mjs`** :
  * Étend `['@commitlint/config-conventional']`.
  * Types autorisés : `['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']`.
* **`.lintstagedrc.json`** :
  ```json
  {
    "*.{ts,tsx}": [
      "prettier --write",
      "eslint --fix --max-warnings=0"
    ],
    "*.{js,mjs,json,md,css,yml,yaml}": [
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
* `semantic-release`, `@semantic-release/changelog`, `@semantic-release/git`, `@semantic-release/github`, `@semantic-release/npm`
* **Configuration `.releaserc.json`** :
  * Branche : `["main"]`.
  * Plugins :
    1. `@semantic-release/commit-analyzer` (preset `conventionalcommits`)
    2. `@semantic-release/release-notes-generator` (preset `conventionalcommits`)
    3. `@semantic-release/changelog` (`changelogFile: "CHANGELOG.md"`)
    4. `@semantic-release/npm` (`npmPublish: false` — met uniquement à jour la version dans `package.json` !)
    5. `@semantic-release/git` (`assets: ["CHANGELOG.md", "package.json", "package-lock.json"]`, `message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"`)
    6. `@semantic-release/github`
* **Workflow `.github/workflows/ci.yml`** (sur `pull_request` et `push` hors `chore(release)`) :
  * Exécute `npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:coverage`, et `npm run build`.
* **Workflow `.github/workflows/release-and-deploy.yml`** (sur chaque `push` / merge sur `main`) :
  * **Job 1 (`verify`)** : Exécute `npm run validate:all`.
  * **Job 2 (`release`)** : Exécute `npx semantic-release` avec `GITHUB_TOKEN` (permissions `contents: write`, `issues: write`, `pull-requests: write`, `pages: write`, `id-token: write`).
  * **Job 3 (`deploy-pwa`)** : Compile l'export statique Next.js (`npm run build`) avec la nouvelle version et déploie automatiquement `out/` sur **GitHub Pages** (`actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`).
    * ⚠️ **`basePath` obligatoire** : GitHub Pages sert le site sous `/<nom-du-dépôt>/`. Ajouter une étape `actions/configure-pages@v5` (`id: pages`) avant le build et compiler avec `env: NEXT_PUBLIC_BASE_PATH: ${{ steps.pages.outputs.base_path }}` (ex. `/mia`, vide avec un domaine personnalisé). Sans cela, tous les assets `/_next/…` renvoient 404. Les autres builds (CI, APK) restent sans `basePath`.

### 3.8. Dependabot (`.github/dependabot.yml`)
* Configure la vérification hebdomadaire (`schedule.interval: "weekly"`) pour `package-ecosystem: "npm"` et `package-ecosystem: "github-actions"`, avec `commit-message: { prefix: "chore", include: "scope" }` pour respecter Commitlint.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `npm run format:check` passe sans erreur (tous les fichiers du dépôt sont formatés par Prettier).
- [ ] `npm run lint` passe avec **0 erreur et 0 warning** (`--max-warnings=0`).
- [ ] `npm run typecheck` passe sans erreur.
- [ ] `npm run test:coverage` passe et respecte le seuil minimal de **80% de couverture**.
- [ ] `npm run validate:all` s'exécute de bout en bout avec un code de retour `0`.
- [ ] `npx commitlint --from HEAD~1` (ou test d'une chaîne via `echo "feat(core): init quality tools" | npx commitlint`) valide les messages Conventional Commits et rejette `"bad commit message"`.
