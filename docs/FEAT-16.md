# FEAT-16 : Intégration APK dans la Release Automatique, Recette F-Droid & Documentation

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-16`
> **Dépendances** : [FEAT-02](./FEAT-02.md), [FEAT-15](./FEAT-15.md)

---

## 1. Contexte & Objectif pour l'IA

Dans la `FEAT-02`, nous avons mis en place le système de release automatique (`semantic-release`) et le déploiement PWA sur GitHub Pages à chaque merge sur `main`. Dans la `FEAT-15`, nous avons ajouté le projet Android/Android TV (`android/`).

L'objectif de cette **FEAT-16** finale est de boucler la chaîne de publication **100% automatique et gratuite** :
1. **Synchronisation automatique de la version Android (`scripts/sync-android-version.mjs`)** : Lorsqu'une nouvelle release SemVer (ex: `1.3.0`) est calculée par `semantic-release` au merge sur `main`, met automatiquement à jour `versionName "1.3.0"` et `versionCode` (ex: `10300`) dans `android/app/build.gradle`.
2. **Compilation & Attachement automatique de l'APK à la GitHub Release** : Enrichit `.github/workflows/release-and-deploy.yml` et `.releaserc.json` pour compiler l'APK universel (`mia-vX.Y.Z-universal.apk`) et l'attacher directement aux assets de la **GitHub Release** créée par `semantic-release` !
3. **Recette officielle F-Droid (`fdroid/org.mia.braintraining.yml`)** : Fournit le fichier de build reproductible pour soumettre **Mia** au store F-Droid.
4. **Documentation complète (`README.md`)** : Guide d'utilisation, d'installation sur Mobile/Tablette/Android TV et tutoriel pas-à-pas pour ajouter de nouveaux niveaux/étoiles à l'infini.

---

## 2. Fichiers à Créer / Modifier

```text
/home/alexeiananenko/Workspace/mia/
├── scripts/
│   └── sync-android-version.mjs       # Synchronise package.json version -> android/app/build.gradle
├── .releaserc.json                    # Ajoute @semantic-release/exec + asset APK dans @semantic-release/github
├── .github/
│   └── workflows/
│       └── release-and-deploy.yml     # Ajoute JDK 21 + build de l'APK signé lors de la release auto sur main
├── fdroid/
│   └── org.mia.braintraining.yml      # Recette de compilation reproductible F-Droid
├── README.md                          # Documentation complète du projet Mia
└── tests/
    └── release-pipeline.test.ts       # Tests unitaires de sync-android-version et des configs de release/F-Droid
```

---

## 3. Spécifications Techniques Détaillées

### 3.1. Script de Synchronisation de Version Android (`scripts/sync-android-version.mjs`)
* Prend une version SemVer en argument (ex: `node scripts/sync-android-version.mjs 1.4.2`).
* Calcule un `versionCode` entier déterministe et strictement croissant :
  `versionCode = major * 10000 + minor * 100 + patch` (ex: `1.4.2` $\rightarrow$ `10402`).
* Met à jour `versionCode` et `versionName` dans `android/app/build.gradle`.

### 3.2. Enrichissement de `semantic-release` (`.releaserc.json`)
Installe `@semantic-release/exec` et configure le cycle `prepare` dans `.releaserc.json` :
1. Exécute `node scripts/sync-android-version.mjs ${nextRelease.version}` pour mettre à jour `android/app/build.gradle`.
2. Exécute `npm run cap:sync` pour régénérer le bundle statique `out/` et le copier dans `android/`.
3. Compile l'APK Android (`cd android && ./gradlew assembleRelease` ou `assembleDebug` signé avec une clé de release locale si aucun secret de keystore personnalisé n'est configuré) et copie l'APK généré vers `dist-apk/mia-v${nextRelease.version}-universal.apk`.
4. Dans `@semantic-release/git`, inclut `"android/app/build.gradle"` dans les fichiers commités (`chore(release): ${nextRelease.version} [skip ci]`).
5. Dans `@semantic-release/github`, configure :
   ```json
   [
     "@semantic-release/github",
     {
       "assets": [
         {
           "path": "dist-apk/*.apk",
           "label": "Mia Android / Android TV Universal APK"
         }
       ]
     }
   ]
   ```

### 3.3. Mise à jour de `.github/workflows/release-and-deploy.yml`
* Ajoute l'étape `actions/setup-java@v4` (`distribution: 'temurin'`, `java-version: '21'`) et le cache Gradle dans le job de release pour que `semantic-release` puisse compiler l'APK Android et le publier automatiquement sur GitHub Releases en même temps que le déploiement PWA sur GitHub Pages.

### 3.4. Recette F-Droid (`fdroid/org.mia.braintraining.yml`)
* Fournit le manifeste YAML standard pour le dépôt `fdroiddata` (compilation Open Source à partir du tag `vX.Y.Z` via Node.js + Capacitor + Gradle).

### 3.5. Documentation Complète (`README.md`)
Rédige un `README.md` clair et complet en français détaillant :
1. L'architecture de **Mia** (Mobile, Tablette, Android TV, PWA).
2. Le workflow de développement et les conventions de commit (**Conventional Commits** déclenchant les releases automatiques au merge sur `main`).
3. **Comment ajouter facilement des dizaines de nouveaux niveaux / nouvelles étoiles** dans `src/games/memory/catalog.ts` et `src/games/traffic-jam/catalog.ts` (avec exemple de grille ASCII `6x6` et vérification via `npm run validate:levels`).
4. Comment installer **Mia** sur **Android TV**, Smartphone et Tablette gratuitement.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/release-pipeline.test.ts` teste le calcul de `versionCode` / `versionName` de `sync-android-version.mjs` ainsi que la validité de `.releaserc.json`, `.github/workflows/release-and-deploy.yml` et `fdroid/org.mia.braintraining.yml`.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `validate:levels`, `test:coverage`, `build`) passe avec `0` erreur et une couverture `>= 80%`.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(release): integrate android apk build and f-droid recipe into automated release`).

---

## 5. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Même release que FEAT-15** | `tests/android-manifest.test.ts` (FEAT-15) exige que `android/app/build.gradle` porte la version de `package.json`. Le projet Android et cette chaîne de release doivent donc atterrir dans la **même release** : une release de FEAT-15 seule passerait `package.json` à `0.11.0` sans synchroniser `build.gradle`, et ce test échouerait au CI suivant. À partir de là, chaque commit `chore(release)` contient `package.json`, `package-lock.json`, `CHANGELOG.md`, `android/app/build.gradle` **et** `fdroid/org.mia.braintraining.yml` synchronisés. |
| **`scripts/sync-android-version.mjs`** | ESM JavaScript (règles typées ESLint désactivées, types JSDoc lus par TypeScript pour les tests). Fonctions pures exportées : `parseVersion`, `computeVersionCode` (`major * 10000 + minor * 100 + patch`, SemVer stricte `MAJOR.MINOR.PATCH` sans « v » ni pré-version, `minor` / `patch` < 100, versionCode > 0 et ≤ 2 100 000 000), `syncGradleVersion(content, version)` (remplace exactement les lignes `versionCode` et `versionName` : espaces, tabulations et syntaxe `=` tolérés, indentation et CRLF conservés, `Error` si une ligne manque ou est en double), `syncFdroidRecipe(content, version)` et `parseArgs`. Le CLI (`<version> [--root <dossier>]`) ne s'exécute que si le module est le point d'entrée (`isEntryPoint`), calcule les deux contenus avant la première écriture (aucun fichier modifié si l'un n'est pas conforme), messages d'erreur en français sur `stderr`, code de sortie 1. `--root` sert aux tests (copies temporaires) : le dépôt réel n'est modifié que par semantic-release. |
| **Recette F-Droid synchronisée** (écart) | Le brief demandait `CurrentVersion` / `CurrentVersionCode` égaux à la version de `package.json` : sans synchronisation, ce test aurait échoué dès la release suivante. Le script met donc aussi à jour l'unique bloc de build de la recette (`versionName`, `versionCode`, `commit: vX.Y.Z`) et la version courante ; la recette est ajoutée aux `assets` de `@semantic-release/git`. La copie versionnée décrit toujours la dernière release ; fdroiddata ajoute lui-même un bloc par tag (`AutoUpdateMode: Version`). |
| **`scripts/build-apk.mjs`** | `buildApk(version, { root, gradle })` : `./gradlew assembleRelease --no-daemon` lancé par `spawnSync` avec le chemin absolu de `android/gradlew` (sortie relayée), puis `pickReleaseApk` retient l'unique `.apk` signé de `app/build/outputs/apk/release` (un APK « unsigned » seul signale une signature absente), `dist-apk/` est vidé puis reçoit `mia-v<version>-universal.apk` (le glob `dist-apk/*.apk` ne publie qu'un fichier). Gradle injectable pour les tests ; le CLI réutilise `parseArgs` / `isEntryPoint` du script de synchronisation. |
| **Signature (`android/app/build.gradle`)** | `def releaseKeystorePath = System.getenv("MIA_KEYSTORE_PATH")` en tête ; bloc `signingConfigs.release` renseigné (`storeFile`, `storePassword`, `keyAlias`, `keyPassword` depuis `MIA_KEYSTORE_PASSWORD`, `MIA_KEY_ALIAS`, `MIA_KEY_PASSWORD`) seulement si la clé est fournie ; `buildTypes.release.signingConfig = releaseKeystorePath ? signingConfigs.release : signingConfigs.debug` (la configuration `debug` est créée par le plugin Android, keystore de débogage généré au besoin). Forme `signingConfig = …` sur une ligne : la recette F-Droid la retire d'un `sed` pour obtenir un APK non signé. `android/.gitignore` ignore désormais `*.jks` et `*.keystore` ; `.gitignore` racine ignore `dist-apk/`. Structure du fichier conservée, aucune dépendance ajoutée. |
| **`.releaserc.json`** | `@semantic-release/exec` inséré après `@semantic-release/npm` (version de `package.json` déjà à jour) et avant `@semantic-release/git` : `prepareCmd` = `node scripts/sync-android-version.mjs ${nextRelease.version} && npm run cap:sync && node scripts/build-apk.mjs ${nextRelease.version}` (commandes enchaînées dans un shell par execa ; un échec interrompt la release avant tout commit ou tag). `@semantic-release/github` : asset `{ path: "dist-apk/*.apk", label: "Mia Android / Android TV Universal APK" }`. |
| **Workflow `release-and-deploy.yml`** | Job `release` : `actions/setup-java@v4` (`temurin`, `21`, `cache: gradle`, `cache-dependency-path` limité à `android/`) après `setup-node` et avant `npm ci` ; étape « Check Android SDK » qui échoue avec un message explicite si `ANDROID_HOME` manque (le SDK est préinstallé sur `ubuntu-latest` et le plugin Android Gradle télécharge les composants manquants, licences acceptées sur les runners) : `android-actions/setup-android` n'est pas ajouté, à faire seulement si cette vérification échoue ; `timeout-minutes` passé de 15 à 30 (build Next.js + Gradle). Keystore : le contexte `secrets` n'étant pas disponible dans un `if` d'étape, l'étape « Prepare release keystore » reçoit `MIA_KEYSTORE_BASE64` en `env` et, s'il est non vide, le décode dans `$RUNNER_TEMP/mia-release.jks` et exporte `MIA_KEYSTORE_PATH` via `$GITHUB_ENV` ; `MIA_KEYSTORE_PASSWORD`, `MIA_KEY_ALIAS` et `MIA_KEY_PASSWORD` sont passés en `env` de l'étape semantic-release (vides sans secret, ignorés par Gradle) ; le fichier est supprimé par une étape `if: always()`. Token d'App, détection de release et déploiement Pages inchangés. |
| **Recette F-Droid (`fdroid/org.mia.braintraining.yml`)** | Format fdroiddata (clés PascalCase) : `Categories` Games / Science & Education, `License: GPL-3.0-or-later`, `AuthorName`, `WebSite`, `SourceCode`, `IssueTracker`, `Changelog`, `AutoName: Mia` (descriptions lues dans `metadata/fr-FR/`, format Fastlane, pas de `Summary` / `Description` inline), `RepoType: git`, `Repo`, `AutoUpdateMode: Version`, `UpdateCheckMode: Tags ^v[0-9.]+$`, `CurrentVersion` / `CurrentVersionCode`. Un seul bloc de build : `subdir: android/app` ; `sudo` installe `ca-certificates`, `curl`, `xz-utils`, `openjdk-21-jdk-headless` (Capacitor 8 exige Java 21 ; `update-java-alternatives -s java-1.21.0-openjdk-amd64`) et Node **22.23.4** depuis nodejs.org, vérifié par son SHA-256 officiel (`SHASUMS256.txt` consulté) ; `init` : `cd ../..` puis `HUSKY=0 npm ci --no-audit --no-fund` ; `prebuild` : `sed` qui retire la ligne `signingConfig = …`, `NEXT_TELEMETRY_DISABLED=1 npm run build`, `npx cap sync android`, puis `rm -rf` des outils que le scanner F-Droid signalerait et dont Gradle n'a pas besoin (`esbuild` / `@esbuild` : exécutables ELF sans extension, `@img` : bibliothèques `.so`, `@capacitor/cli` : archives `.tar.gz`, `@pnpm` : `.tgz`, et les liens `.bin` correspondants), liste établie depuis `node_modules` du lockfile actuel. **Écart** : `gradle: [yes]` au lieu de `[release]` (dans fdroiddata, chaque entrée est une *flavour* : `release` produirait la tâche `assembleReleaseRelease`, inexistante). `MaintainerNotes` en anglais (destinées aux mainteneurs F-Droid). Le tag `v0.10.0` référencé ne contient pas encore `android/` : la recette est à soumettre après la première release qui l'inclut (documenté dans le README et en tête du fichier). |
| **README.md** | Français, formaté par Prettier : présentation, fonctionnalités, architecture (schéma Mermaid, stack, trois supports), installation (PWA GitHub Pages, APK GitHub Releases, sideload Android TV, F-Droid « pas encore publiée »), développement (prérequis, scripts, qualité, Conventional Commits avec types et scopes, CI), release automatique (schéma, versionCode, signature et secrets, compilation locale), guide pas-à-pas Memory (objet dans `MEMORY_CATALOG`, tableau des champs) et Traffic Jam (grille ASCII 6 × 6, `parseTrafficJamAscii`, `optimalMoves: 0` puis `npm run validate:levels` qui indique le minimum mesuré ; exemple vérifié avec le solveur réel), nouveau jeu (SPECIFICATION §7.3), structure du dépôt, licence. FEAT-14 ayant été livrée pendant la session, la documentation suit l'API réelle de `src/games/traffic-jam/catalog.ts` et de `scripts/validate-levels.ts`. |
| **Tests** | `tests/release-pipeline.test.ts` (environnement `node`) : `computeVersionCode` (valeurs, versions non SemVer, limites), `syncGradleVersion` (gabarit, tolérances, CRLF, erreurs, vrai `build.gradle` : exactement deux lignes changées et idempotence avec `package.json`), `syncFdroidRecipe` (vraie recette : cinq lignes, YAML relu, erreurs), CLI des deux scripts exécutés avec `process.execPath` sur des copies temporaires (`--root`, codes de sortie, faux `gradlew` shell), `buildApk` avec Gradle injecté, `.releaserc.json` (exec et ses trois étapes, ordre npm → exec → git, assets git et GitHub, scripts présents), workflow (setup-java avant `npm ci` et semantic-release, vérification du SDK, keystore conditionnel et secrets en `env`, aucun `secrets.` dans un `if`), signature Gradle (variables, ordre des blocs, `sed` de la recette qui retire exactement une ligne), recette F-Droid (clés, licence et URL de `package.json`, tags, cohérence `computeVersionCode`, Node 22 + SHA-256 + JDK 21, étapes `init` / `prebuild`, paquets retirés sans toucher `@capacitor/android`), `.gitignore`, README. `tests/quality-setup.test.ts` : expectation `toEqual` de `.releaserc.json`, `@semantic-release/exec` dans les dépendances, `setup-java` dans le test du workflow (éditions ciblées). |
| **CHORE-01 (undici)** | Point de contrôle « au plus tard au démarrage de FEAT-16 » vu : `node_modules/npm/node_modules/undici` est toujours en 6.29.0 (npm 11 embarqué par `@semantic-release/npm`), aucune mise à jour applicable, rien modifié (hors périmètre, chore toujours en attente). |
| **Non vérifié localement** | Aucun JDK ni SDK Android sur le poste : `android/app/build.gradle` est relu (syntaxe Groovy DSL, `signingConfigs.debug` fourni par le plugin Android) mais pas compilé ; le workflow (JDK, cache, keystore, SDK), l'exécution réelle de `prepareCmd`, la publication de l'asset et la recette F-Droid (disponibilité de `openjdk-21-jdk-headless` sur le buildserver, mémoire du VM pour `next build`, comportement exact du scanner) ne se vérifient qu'en CI ou chez F-Droid. Vérification en CI : premier merge sur `main` → job `release` vert, asset `mia-vX.Y.Z-universal.apk` sur la GitHub Release, commit `chore(release)` contenant `build.gradle` et la recette ; puis `tests/android-manifest.test.ts` et `tests/release-pipeline.test.ts` verts sur la PR suivante. |
| **Git** | Commit attendu : `feat(release): integrate android apk build and f-droid recipe into automated release`. |
