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

### 3.4. Conformité Stricte F-Droid
* Vérifie dans `android/build.gradle` et `android/app/build.gradle` qu'aucune dépendance propriétaire (`com.google.android.gms`, `com.google.firebase`, etc.) n'est présente.
* Crée les fichiers de description en français dans `metadata/fr-FR/` pour F-Droid.

### 3.5. Mode TV & Zones de Sécurité ([FEAT-03 §5](./FEAT-03.md#5-décisions-dimplémentation-session-de-cadrage))
* Sur un vrai boîtier, vérifier que la détection CSS `(hover: none) and (pointer: none)` active la variante `tv:` (marges anti-overscan de 5 %, aides de la télécommande). Sinon (télécommandes à pointeur « air mouse »), détecter la TV côté natif (`UiModeManager` → `UI_MODE_TYPE_TELEVISION`) et poser `data-tv="on"` sur `<html>` lorsque `tvModeOverride` vaut `'auto'`.
* `.tv-safe-container` intègre déjà `env(safe-area-inset-*)`. Si l'APK passe en plein écran (edge-to-edge, imposé à partir d'Android 15 / API 35), activer `viewportFit: 'cover'` dans `layout.tsx` et vérifier que chaque écran passe par `AppShell`.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/android-manifest.test.ts` vérifie automatiquement la présence de `LEANBACK_LAUNCHER`, `LAUNCHER`, `touchscreen required="false"`, `android:banner`, et l'absence de `com.google.android.gms` / `firebase`.
- [ ] Un test vérifie que `capacitor.config.ts` déclare `android.minWebViewVersion: 111` et que le fichier `server.errorPath` existe dans `public/`.
- [ ] `npm run cap:sync` synchronise le dossier `out/` vers `android/app/src/main/assets/public` sans erreur.
- [ ] Recette sur Android TV : le mode TV s'active (marges de 5 %, aides de la télécommande) et aucun bouton n'est rogné (§3.5).
- [ ] `npm run validate:all` passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(android): add capacitor android and android tv packaging for f-droid`).
