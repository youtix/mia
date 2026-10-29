# FEAT-15 : Empaquetage Android & Android TV via Capacitor (Conformité F-Droid)

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-15`
> **Dépendances** : [FEAT-08](./FEAT-08.md), [FEAT-11](./FEAT-11.md), [FEAT-14](./FEAT-14.md)

---

## 1. Contexte & Objectif pour l'IA

L'application **Mia** doit pouvoir être installée sous forme d'un unique fichier **`.apk`** fonctionnant à la fois sur **Smartphone Android**, **Tablette Android** et **Android TV**, et être distribuée gratuitement sur **F-Droid** et **GitHub Releases**.

L'objectif de cette **FEAT-15** est de configurer **Capacitor (`capacitor.config.ts`)**, de générer et personnaliser le projet natif Android (`android/`), de configurer l'`AndroidManifest.xml` pour la compatibilité **Android TV (`LEANBACK_LAUNCHER`)**, de gérer le bouton physique `Retour` de la télécommande Android, et de préparer les métadonnées **Fastlane / F-Droid**.

---

## 2. Fichiers à Créer / Configurer

```text
/home/alexeiananenko/Workspace/mia/
├── capacitor.config.ts                # Configuration Capacitor pointant sur out/
├── public/
│   └── webview-obsolete.html          # Page d'erreur autonome si la WebView est < 111 (voir §3.1)
├── android/                           # Projet Android Gradle généré par @capacitor/android
│   └── app/
│       ├── build.gradle               # Sans aucune dépendance Google Play Services propriétaire
│       └── src/main/
│           ├── AndroidManifest.xml    # Support Mobile (LAUNCHER) + Android TV (LEANBACK_LAUNCHER)
│           └── res/
│               └── drawable/
│                   └── tv_banner.xml  # Bannière vectorielle Android TV (320x180dp)
├── src/
│   └── core/
│       └── navigation/
│           └── useAndroidBackButton.ts# Hook connectant @capacitor/app backButton au routeur/navigation
├── metadata/                          # Métadonnées Fastlane officielles pour F-Droid
│   └── fr-FR/
│       ├── title.txt
│       ├── short_description.txt
│       └── full_description.txt
└── tests/
    └── android-manifest.test.ts       # Test automatisé vérifiant la conformité Android TV & F-Droid
```

---

## 3. Spécifications Techniques Détaillées

### 3.1. Configuration Capacitor (`capacitor.config.ts`)
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.mia.braintraining',
  appName: 'Mia',
  webDir: 'out',
  android: {
    // Tailwind v4 / Next 16 exigent Chrome 111+ (voir FEAT-01 §6).
    minWebViewVersion: 111,
  },
  server: {
    // Affichée à la place de l'application si la WebView est trop ancienne.
    errorPath: 'webview-obsolete.html',
  },
};

export default config;
```
* **Garde-fou WebView** : sur les boîtiers TV non certifiés, la « Android System WebView » peut avoir des années de retard ; sans ce garde-fou, l'interface s'afficherait cassée ou vide. `public/webview-obsolete.html` doit être **100% autonome** (HTML + CSS inline basique, sans Tailwind, sans JavaScript moderne, sans police externe) et expliquer en français comment mettre à jour « Android System WebView » (Play Store ou mises à jour système), avec une mise en page lisible à 3 mètres.
Ajoute `@capacitor/cli` et `@capacitor/android` dans `package.json`, ainsi que le script :
* `"cap:sync": "npm run build && npx cap sync android"`

### 3.2. Configuration Critique de `AndroidManifest.xml` pour Mobile + Tablette + Android TV
Dans `android/app/src/main/AndroidManifest.xml`, applique impérativement ces 4 règles :

1. **Rendre l'écran tactile et le mode Leanback optionnels** :
   ```xml
   <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
   <uses-feature android:name="android.software.leanback" android:required="false" />
   ```
2. **Déclarer la bannière Android TV (`android:banner="@drawable/tv_banner"`)** sur la balise `<application>`.
3. **Autoriser toutes les orientations sur Mobile/Tablette et le paysage sur TV** (`android:screenOrientation="unspecified"`).
4. **Déclarer les deux catégories de lancement dans l'`<intent-filter>` de `MainActivity`** :
   ```xml
   <intent-filter>
       <action android:name="android.intent.action.MAIN" />
       <category android:name="android.intent.category.LAUNCHER" />
       <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
   </intent-filter>
   ```

### 3.3. Gestion du Bouton Physique `Retour` Android (`src/core/navigation/useAndroidBackButton.ts`)
* Utilise `App.addListener('backButton', ...)` de `@capacitor/app` pour revenir à l'écran parent ou fermer une modale ouverte lorsqu'on appuie sur le bouton `Retour` de la télécommande Android TV.
* **Contrat FEAT-04** ([§5](./FEAT-04.md#5-décisions-dimplémentation-session-de-cadrage)) : le bouton physique n'émet aucun `keydown`. Brancher l'écouteur sur `dispatchBack()` (`useNavigation`), qui applique le routage des touches (zone active de la couche du dessus, sinon `onClose` de la modale ouverte) et renvoie `false` si rien ne l'a géré : c'est alors à ce hook de décider (ex: `App.exitApp()` sur l'écran d'accueil).
* **Contrat FEAT-08** ([§6](./FEAT-08.md#6-décisions-dimplémentation-session-de-cadrage)) : les zones du Hub n'ont pas d'`onBack` (`dispatchBack()` → `false` : quitter l'application). Sur la Carte des Étoiles et un niveau, Retour revient à l'écran parent (historique dépilé quand il le précède, sinon remplacé) : Mia n'est quittée que depuis le Hub. Avec le choix du joueur imposé (modale sans `onClose`), `dispatchBack()` renvoie aussi `false`.

### 3.4. Conformité Stricte F-Droid
* Vérifie dans `android/build.gradle` et `android/app/build.gradle` qu'aucune dépendance propriétaire (`com.google.android.gms`, `com.google.firebase`, etc.) n'est présente.
* Crée les fichiers de description en français dans `metadata/fr-FR/` pour F-Droid.

### 3.5. Mode TV & Zones de Sécurité ([FEAT-03 §5](./FEAT-03.md#5-décisions-dimplémentation-session-de-cadrage))
* Sur un vrai boîtier, vérifier que la détection CSS `(hover: none) and (pointer: none)` active la variante `tv:` (marges anti-overscan de 5 %, aides de la télécommande). Sinon (télécommandes à pointeur « air mouse »), détecter la TV côté natif (`UiModeManager` → `UI_MODE_TYPE_TELEVISION`) et poser `data-tv="on"` sur `<html>` lorsque `tvModeOverride` vaut `'auto'`.
* **Contrat FEAT-05** ([§5](./FEAT-05.md#5-décisions-dimplémentation-session-de-cadrage)) : en `'auto'`, le script inline du `<head>` ne pose rien et `StorageProvider` retire `data-tv` une fois la sauvegarde chargée. Une détection native ne doit donc pas écrire `data-tv` de son côté (elle serait effacée) : étendre la résolution de `'auto'` dans `applyTvModeOverride` **et** `TV_MODE_BOOTSTRAP_SCRIPT` (`src/core/storage/tv-mode.ts`). Sur l'APK, la sauvegarde vit dans les SharedPreferences (`@capacitor/preferences`) avec un miroir `localStorage` ; `navigator.storage.persist()` n'y est jamais appelé.
* `.tv-safe-container` intègre déjà `env(safe-area-inset-*)`. Si l'APK passe en plein écran (edge-to-edge, imposé à partir d'Android 15 / API 35), activer `viewportFit: 'cover'` dans `layout.tsx` et vérifier que chaque écran passe par `AppShell`.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/android-manifest.test.ts` vérifie automatiquement la présence de `LEANBACK_LAUNCHER`, `LAUNCHER`, `touchscreen required="false"`, `android:banner`, et l'absence de `com.google.android.gms` / `firebase`.
- [ ] Un test vérifie que `capacitor.config.ts` déclare `android.minWebViewVersion: 111` et que le fichier `server.errorPath` existe dans `public/`.
- [ ] `npm run cap:sync` synchronise le dossier `out/` vers `android/app/src/main/assets/public` sans erreur.
- [ ] Recette sur Android TV : le mode TV s'active (marges de 5 %, aides de la télécommande) et aucun bouton n'est rogné (§3.5).
- [ ] `npm run validate:all` passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(android): add capacitor android and android tv packaging for f-droid`).

---

## 5. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Configuration Capacitor** | `capacitor.config.ts` conforme à §3.1, plus `backgroundColor: '#0f172a'` (couleur de la WebView avant le premier rendu : aucun éclair blanc sur un téléviseur) et `plugins.SystemBars.initialViewportFitValueHint: 'cover'` (voir « Plein écran »). `npx cap add android` (Capacitor 8.6, sans JDK : la synchronisation Gradle est simplement sautée) puis `npx cap sync android` vérifiés localement : `out/` copié dans `android/app/src/main/assets/public` (`sw.js` compris, ignoré par l'APK : FEAT-17), `capacitor.config.json` et `capacitor.plugins.json` générés, deux plugins détectés (`@capacitor/app`, `@capacitor/preferences`). Script `cap:sync` = `npm run build && npx cap sync android` (figé par `tests/quality-setup.test.ts`). |
| **Routage dans l'APK** | Capacitor sert `index.html` pour toute adresse sans extension (`html5mode`) : l'application démarre toujours sur le Hub (`https://localhost/`), la navigation entre écrans est celle du routeur Next.js (client, charges utiles `*/index.txt` et chunks servis comme fichiers), les pages statiques `memory/index.html`… ne sont jamais demandées par la WebView. `basePath` vide dans l'APK. |
| **Garde-fou WebView** | `public/webview-obsolete.html` : HTML et CSS inline uniquement (ni script, ni police, ni image, ni lien), polices système, flexbox et `rem` (moteur ancien), texte au tutoiement : Play Store → « Android System WebView » → Mettre à jour, sinon mises à jour système, redémarrage ; mention de Chrome (fournisseur de la WebView sur certains boîtiers) et de l'adresse Web en texte brut. Capacitor la charge depuis `https://localhost/webview-obsolete.html` quand la WebView est antérieure à 111 (`Bridge.getErrorUrl`). Le fichier arrive dans `out/` par la copie de `public/` et sera pré-caché par le service worker (FEAT-17, ~2,5 Ko). |
| **Manifeste Android** | Les quatre règles de §3.2 ; `uses-feature` placés avant `<application>` ; `singleTask`, `configChanges` et le `FileProvider` du gabarit conservés ; permission `INTERNET` conservée (la WebView Capacitor l'exige, même sans réseau). `strings.xml` : « Mia », `org.mia.braintraining`. |
| **Bannière TV** | `drawable/tv_banner.xml` : VectorDrawable 320 × 180 dp (viewport 1280 × 720) reprenant `public/icons/tv-banner.svg` à l'identique ; chaque cercle SVG devient deux arcs (`a`), le tracé du « M » passe en coordonnées absolues. |
| **Gradle et F-Droid** | `android/app/build.gradle` : `versionCode 1000` / `versionName "0.10.0"` (`major * 10000 + minor * 100 + patch`, contrat FEAT-16), `applicationId` et `namespace` = `org.mia.braintraining` ; le bloc `google-services.json` du gabarit est retiré, ainsi que le `classpath 'com.google.gms:google-services'` de `android/build.gradle` (refusé par le scanner F-Droid). `tests/android-manifest.test.ts` vérifie l'absence de `com.google.android.gms`, `firebase`, `play-services`, `com.google.gms` et `google-services` dans les six fichiers Gradle (dont `app/capacitor.build.gradle` et `capacitor.settings.gradle`, générés par `cap sync` et versionnés comme le veut Capacitor) et l'alignement de la version sur `package.json`. Après le sync, `capacitor.build.gradle` ne référence que `:capacitor-app` et `:capacitor-preferences` ; `capacitor-cordova-android-plugins` (ignoré par Git) ne dépend que d'AndroidX et d'`org.apache.cordova:framework`. Dépôts Maven `google()` conservés (AndroidX). |
| **Bouton Retour** | `useAndroidBackButton()` (`src/core/navigation/useAndroidBackButton.ts`, `'use client'`) : inactif hors `Capacitor.isNativePlatform()` ; `App.addListener('backButton', …)` → `dispatchBack()` ; si `false` : sur le Hub (`isHubPathname(window.location.pathname)` : `basePath + '/'` avec ou sans barre finale, `basePath` lu à l'appel) → `App.exitApp()`, sinon `router.replace('/')` (modale imposée sans gestionnaire : retour au Hub, puis Retour quitte). Écouteur retiré au démontage (`remove()` de la promesse) ; un `addListener` en échec est journalisé (`console.warn`) sans casser l'écran. `AndroidBackButtonBridge` (rend `null`) monté dans `layout.tsx` sous `NavigationProvider` ; exports ajoutés au barrel `@/core/navigation` (`AndroidBackButtonBridge`, `useAndroidBackButton`, `isHubPathname`). `window.location.pathname` plutôt que `usePathname()` : lu au moment de l'appui, aucun réabonnement à chaque navigation. |
| **Détection TV native** | Plugin Java minimal `TvModePlugin` (`@CapacitorPlugin(name = "TvMode")`, `isTelevision` → `UiModeManager.getCurrentModeType() == UI_MODE_TYPE_TELEVISION` → `{ value }`), enregistré dans `MainActivity.onCreate` avant `super.onCreate`. Côté web (`src/core/storage/tv-mode.ts`) : `registerPlugin<TvModePlugin>('TvMode', { web })` **à la demande** (le module est évalué au pré-rendu et par des tests qui simulent `@capacitor/core` sans `registerPlugin`) ; `hasNativeTvDetection()` (`isNativePlatform() && isPluginAvailable('TvMode')`, jamais d'exception) ; `detectNativeTv(): Promise<boolean>` (APK seulement ; écrit `mia_tv_detected` = `'on'` / `'off'` dans `localStorage` ; un échec du pont est journalisé et vaut `false`). `applyTvModeOverride(override, root = document.documentElement, { nativeTv = false })` : en `auto`, `on` si `nativeTv`, sinon attribut retiré ; signature rétrocompatible. `TV_MODE_BOOTSTRAP_SCRIPT` (ES5) : réglage forcé d'abord, sinon marqueur `'on'` → `data-tv="on"` ; le marqueur est lu avant l'analyse de la sauvegarde (une sauvegarde illisible ne l'annule pas) ; `data-contrast` inchangé. `StorageProvider` : état `nativeTv: boolean \| null` (`null` tant que le plugin n'a pas répondu, `false` d'emblée hors APK) ; en `auto`, `data-tv` n'est pas touché avant la réponse (l'attribut du script inline reste, aucun saut des marges), un réglage forcé s'applique sans attendre ; réponse ignorée après le démontage. Le barrel `@/core/storage` ré-exporte ces ajouts (`TV_DETECTED_STORAGE_KEY`, `detectNativeTv`, `hasNativeTvDetection`, types `ApplyTvModeOptions` et `TvModePlugin`), ajout fait à l'intégration : `layout.tsx` importe déjà ce barrel. |
| **Plein écran (edge-to-edge)** | `viewportFit: 'cover'` dans `viewport` de `layout.tsx`. Capacitor 8.6 n'a plus `android.adjustMarginsForEdgeToEdge` : son successeur est `plugins.SystemBars.insetsHandling` (`native` / `css` / `disable`), **laissé à sa valeur par défaut `css`** : WebView 140+ avec `viewport-fit=cover` → WebView sous les barres système et `env(safe-area-inset-*)` renseignés (déjà lus par `.tv-safe-container`) ; WebView < 140 → Capacitor rembourre la vue native et `env()` vaut 0. Seul ajout : `initialViewportFitValueHint: 'cover'` (le layout déclare toujours `cover` ; évite un saut de mise en page au lancement, sans effet sur le résultat final d'après la documentation du plugin). Tous les écrans passent par `AppShell` ou `ModalDialog` (`tv-safe-container`). |
| **Icônes et écran de lancement** | Les icônes du gabarit (logo Capacitor) sont remplacées : `ic_launcher.png` (carré), `ic_launcher_round.png` (disque) et `ic_launcher_foreground.png` (couche adaptative : symbole seul, rendu dans 80 dp sur 108, donc dans la zone sûre de 66 dp) générés avec sharp depuis `public/icons/icon-512.svg` aux cinq densités (script ponctuel hors dépôt ; PNG versionnés de 0,8 à 4,8 Ko) ; `ic_launcher_background` = `#0f172a`. Écran de lancement : les onze `splash.png` du gabarit sont remplacés par `drawable/splash.xml` (`layer-list` : fond `@color/splash_background` + symbole centré) et `windowSplashScreenBackground` (Android 12+). Les vecteurs inutilisés du gabarit (`drawable/ic_launcher_background.xml`, `drawable-v24/ic_launcher_foreground.xml`) et les tests d'exemple (`ExampleUnitTest`, `ExampleInstrumentedTest`, paquet `com.getcapacitor.myapp`) sont supprimés. |
| **Fichiers versionnés sous `android/`** | Projet Gradle complet (42 fichiers : wrapper `gradlew` exécutable et `gradle-wrapper.jar` compris), `app/capacitor.build.gradle` et `capacitor.settings.gradle` (générés, versionnés). Ignorés par `android/.gitignore` (gabarit, suffisant ; `.gitignore` racine inchangé) : `app/src/main/assets/public`, `capacitor.config.json`, `capacitor.plugins.json`, `res/xml/config.xml`, `capacitor-cordova-android-plugins/`, `build/`, `.gradle/`, `local.properties`. |
| **Métadonnées F-Droid** | `metadata/fr-FR/` : `title.txt` (« Mia »), `short_description.txt` (70 caractères), `full_description.txt` (texte brut, ~1 250 caractères : usages, jeux, progression, profils, vie privée). |
| **Tests** | `tests/android-manifest.test.ts` (environnement `node`, import direct de `capacitor.config.ts`) : critères de §4, bannière, `strings.xml`, plugin natif (enregistrement avant `super.onCreate`, `UI_MODE_TYPE_TELEVISION`), `android/.gitignore`, métadonnées, version. `tests/android-back-button.test.tsx` : `isHubPathname` (racine, `basePath`), hook hors APK, zone active, Hub → `exitApp`, autre écran → `replace('/')`, modale imposée, démontage, pont en échec. `tests/storage.test.tsx` : `applyTvModeOverride` avec `nativeTv`, script inline (marqueur, sauvegarde illisible, `off`), `detectNativeTv` (Web, APK, plugin absent, pont partiel, échec, marqueur inscriptible ou non), Provider (attente de la détection, réglage forcé immédiat, `off`, démontage). `tests/navigation.test.tsx` inchangé (`dispatchBack` déjà couvert) ; `tests/quality-setup.test.ts` fige `cap:sync`. |
| **Non vérifié localement** | Aucun JDK ni SDK Android : `MainActivity.java`, `TvModePlugin.java`, les fichiers Gradle modifiés, `AndroidManifest.xml`, `tv_banner.xml`, `splash.xml`, `styles.xml` et `colors.xml` sont relus et validés (XML bien formé) mais non compilés : FEAT-16 compile en CI. Recette sur appareil (§4 : marges, télécommande, bouton Retour, page WebView obsolète, détection native) à faire avec l'APK. |
| **Git** | Commit attendu : `feat(android): add capacitor android and android tv packaging for f-droid`. |
