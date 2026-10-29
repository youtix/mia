// @vitest-environment node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import capacitorConfig from '../capacitor.config';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path: string): boolean => existsSync(new URL(`../${path}`, import.meta.url));

const APP_ID = 'org.mia.braintraining';
const JAVA_DIR = 'android/app/src/main/java/org/mia/braintraining';

/** Dépendances et outils Google propriétaires refusés par F-Droid (comparés en minuscules). */
const PROPRIETARY_MARKERS = [
  'com.google.android.gms',
  'firebase',
  'play-services',
  'com.google.gms',
  'google-services',
];

/** Fichiers Gradle du projet, générés par Capacitor (`capacitor.*.gradle`) ou personnalisés. */
const GRADLE_FILES = [
  'android/build.gradle',
  'android/app/build.gradle',
  'android/variables.gradle',
  'android/settings.gradle',
  'android/capacitor.settings.gradle',
  'android/app/capacitor.build.gradle',
];

describe('capacitor.config.ts', () => {
  it('identifie Mia et embarque l’export statique', () => {
    expect(capacitorConfig).toMatchObject({ appId: APP_ID, appName: 'Mia', webDir: 'out' });
  });

  it('exige une WebView 111+ et renvoie vers une page d’erreur présente dans public/', () => {
    expect(capacitorConfig.android?.minWebViewVersion).toBe(111);

    const errorPath = capacitorConfig.server?.errorPath;
    expect(errorPath).toBe('webview-obsolete.html');
    expect(exists(`public/${String(errorPath)}`)).toBe(true);
  });
});

describe('Page WebView obsolète', () => {
  const html = read('public/webview-obsolete.html');

  it('est autonome : ni script, ni ressource externe, ni police distante', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<(link|img|iframe|object|embed|video|audio|source)\b/i);
    expect(html).not.toMatch(/\b(src|href)\s*=/i);
    expect(html).not.toMatch(/url\(|@import|@font-face/i);
  });

  it('explique en français comment mettre à jour Android System WebView', () => {
    expect(html).toMatch(/<html lang="fr">/);
    expect(html).toMatch(/<meta name="viewport"/);
    expect(html).toContain('Android System WebView');
    expect(html).toContain('111');
    expect(html).toContain('Play Store');
  });
});

describe('AndroidManifest.xml (smartphone, tablette et Android TV)', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');

  it('rend l’écran tactile et le mode Leanback optionnels', () => {
    for (const feature of ['android.hardware.touchscreen', 'android.software.leanback']) {
      expect(manifest).toMatch(
        new RegExp(`<uses-feature\\s+android:name="${feature}"\\s+android:required="false"\\s*/>`),
      );
    }
  });

  it('déclare la bannière Android TV sur <application>', () => {
    const application = /<application\b[^>]*>/.exec(manifest)?.[0] ?? '';

    expect(application).toContain('android:banner="@drawable/tv_banner"');
    expect(exists('android/app/src/main/res/drawable/tv_banner.xml')).toBe(true);
  });

  it('laisse toutes les orientations à MainActivity', () => {
    const activity = /<activity\b[^>]*android:name="\.MainActivity"[^>]*>/.exec(manifest)?.[0];

    expect(activity).toContain('android:screenOrientation="unspecified"');
  });

  it('se lance depuis le lanceur mobile et le lanceur Leanback', () => {
    const filters = manifest.match(/<intent-filter>[\s\S]*?<\/intent-filter>/g) ?? [];
    const launch = filters.find((filter) => filter.includes('android.intent.action.MAIN'));

    expect(launch).toContain('android.intent.category.LAUNCHER');
    expect(launch).toContain('android.intent.category.LEANBACK_LAUNCHER');
  });

  it('nomme l’application « Mia »', () => {
    expect(read('android/app/src/main/res/values/strings.xml')).toContain(
      '<string name="app_name">Mia</string>',
    );
  });
});

describe('Bannière Android TV', () => {
  it('est un vecteur de 320 × 180 dp', () => {
    const banner = read('android/app/src/main/res/drawable/tv_banner.xml');

    expect(banner).toMatch(/<vector\b/);
    expect(banner).toContain('android:width="320dp"');
    expect(banner).toContain('android:height="180dp"');
  });
});

describe('Conformité F-Droid (Gradle)', () => {
  it.each(GRADLE_FILES)('%s ne référence aucune dépendance Google propriétaire', (file) => {
    const gradle = read(file).toLowerCase();

    for (const marker of PROPRIETARY_MARKERS) expect(gradle, marker).not.toContain(marker);
  });

  it('aligne applicationId, namespace et version sur capacitor.config.ts et package.json', () => {
    const gradle = read('android/app/build.gradle');
    const { version } = JSON.parse(read('package.json')) as { version: string };
    const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);

    expect(gradle).toContain(`namespace = "${APP_ID}"`);
    expect(gradle).toContain(`applicationId "${APP_ID}"`);
    expect(gradle).toContain(`versionName "${version}"`);
    expect(gradle).toMatch(
      new RegExp(`versionCode ${String(major * 10000 + minor * 100 + patch)}\\b`),
    );
  });

  it('garde android/gradlew exécutable (lancé tel quel par scripts/build-apk.mjs et F-Droid)', () => {
    const { mode } = statSync(new URL('../android/gradlew', import.meta.url));

    expect(mode & 0o111).not.toBe(0);
  });
});

describe('Plugin natif TvMode', () => {
  it('est enregistré dans MainActivity avant la création du pont', () => {
    const activity = read(`${JAVA_DIR}/MainActivity.java`);
    const registerAt = activity.indexOf('registerPlugin(TvModePlugin.class)');

    expect(activity).toContain(`package ${APP_ID};`);
    expect(activity).toContain('extends BridgeActivity');
    expect(registerAt).toBeGreaterThan(-1);
    expect(registerAt).toBeLessThan(activity.indexOf('super.onCreate('));
  });

  it('expose isTelevision via UiModeManager', () => {
    const plugin = read(`${JAVA_DIR}/TvModePlugin.java`);

    expect(plugin).toContain(`package ${APP_ID};`);
    expect(plugin).toContain('@CapacitorPlugin(name = "TvMode")');
    expect(plugin).toMatch(/@PluginMethod\s+public void isTelevision\(PluginCall call\)/);
    expect(plugin).toContain('Configuration.UI_MODE_TYPE_TELEVISION');
    expect(plugin).toContain('put("value"');
  });
});

describe('Fichiers générés par cap sync', () => {
  it('ne sont pas versionnés (assets web, configuration, plugins Cordova)', () => {
    const ignored = read('android/.gitignore').split('\n');

    for (const entry of [
      'app/src/main/assets/public',
      'app/src/main/assets/capacitor.config.json',
      'app/src/main/assets/capacitor.plugins.json',
      'capacitor-cordova-android-plugins',
    ]) {
      expect(ignored).toContain(entry);
    }
  });
});

describe('Métadonnées F-Droid (metadata/fr-FR)', () => {
  it('fournit un titre, une description courte (≤ 80) et une description complète (≤ 4000)', () => {
    const short = read('metadata/fr-FR/short_description.txt').trim();
    const full = read('metadata/fr-FR/full_description.txt').trim();

    expect(read('metadata/fr-FR/title.txt').trim()).toBe('Mia');
    expect(short.length).toBeGreaterThan(0);
    expect(short.length).toBeLessThanOrEqual(80);
    expect(full.length).toBeGreaterThan(short.length);
    expect(full.length).toBeLessThanOrEqual(4000);
    expect(full).toContain('Android TV');
  });
});
