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
