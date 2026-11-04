// @vitest-environment node
import {
  MIN_WEBVIEW_VERSION,
  WEBVIEW_ERROR_PAGE,
  WEBVIEW_GUARD_SCRIPT,
} from '@/core/pwa/webview-guard';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
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

  it('laisse Huawei au seuil de Capacitor : sa WebView a sa propre numérotation', () => {
    expect(capacitorConfig.android).not.toHaveProperty('minHuaweiWebViewVersion');
  });

  it('demande des icônes claires pour les barres système, quel que soit le thème de l’appareil', () => {
    expect(capacitorConfig.plugins?.SystemBars).toMatchObject({ style: 'DARK' });
  });
});

describe('Garde-fou WebView de l’application', () => {
  const ua = (chrome: string) =>
    `Mozilla/5.0 (Linux; Android 10; VOG-L29 Build/HUAWEIVOG-L29; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 ${chrome} Mobile Safari/537.36`;

  /** Exécute le script du `<head>` à une adresse donnée ; renvoie la redirection. */
  function runGuard(userAgent: string, href = 'https://localhost/') {
    const { protocol, hostname } = new URL(href);
    const replace = vi.fn();
    runInNewContext(WEBVIEW_GUARD_SCRIPT, {
      navigator: { userAgent },
      location: { protocol, hostname, replace },
    });
    return replace;
  }

  it('suit le seuil de Capacitor et sa page d’erreur', () => {
    expect(MIN_WEBVIEW_VERSION).toBe(capacitorConfig.android?.minWebViewVersion);
    expect(WEBVIEW_ERROR_PAGE).toBe(capacitorConfig.server?.errorPath);
    expect(read('public/webview-obsolete.html')).toContain(`>= ${String(MIN_WEBVIEW_VERSION)}`);
  });

  it('dans l’APK, envoie une WebView trop ancienne, Huawei comprise, vers la page d’erreur', () => {
    const replace = runGuard(ua('Chrome/99.0.4844.88'));

    expect(replace).toHaveBeenCalledExactlyOnceWith('/webview-obsolete.html');
  });

  it.each([
    ['une WebView assez récente', ua('Chrome/111.0.5563.116'), 'https://localhost/'],
    ['un agent sans version de Chrome', ua('Gecko/20100101'), 'https://localhost/'],
    ['le Web, même ancien', ua('Chrome/99.0.4844.88'), 'https://youtix.github.io/mia/'],
    ['le serveur de développement', ua('Chrome/99.0.4844.88'), 'http://localhost:3000/'],
  ])('laisse démarrer %s', (_label, userAgent, href) => {
    expect(runGuard(userAgent, href)).not.toHaveBeenCalled();
  });

  it('écrit son script en ES3, et le layout le place avant tout le reste', () => {
    expect(WEBVIEW_GUARD_SCRIPT).not.toMatch(/\b(let|const|class|async|await)\b|=>|`/);
    const layout = read('src/app/layout.tsx');
    expect(layout.indexOf('WEBVIEW_GUARD_SCRIPT }}')).toBeGreaterThan(-1);
    expect(layout.indexOf('WEBVIEW_GUARD_SCRIPT }}')).toBeLessThan(
      layout.indexOf('TV_MODE_BOOTSTRAP_SCRIPT }}'),
    );
  });
});

describe('Page WebView obsolète', () => {
  const html = read('public/webview-obsolete.html');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const source = scripts[0]?.[2] ?? '';
  const minVersion = capacitorConfig.android?.minWebViewVersion ?? 0;

  it('est autonome : un seul script inline, ni ressource externe, ni police distante', () => {
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.[1]).toBe('');
    expect(html).not.toMatch(/<(link|img|iframe|object|embed|video|audio|source)\b/i);
    expect(html).not.toMatch(/\b(src|href)\s*=/i);
    expect(html).not.toMatch(/url\(|@import|@font-face/i);
  });

  it('écrit son script en ES3 : il doit tourner sur les moteurs que la page accueille', () => {
    expect(source).not.toMatch(/\b(let|const|class|async|await)\b|=>|`/);
  });

  /** Exécute le script de la page dans un contexte neuf ; renvoie la redirection et la fenêtre. */
  function runScript(userAgent: string | undefined, window = { name: '' }) {
    const replace = vi.fn();
    runInNewContext(source, { navigator: { userAgent }, location: { replace }, window });
    return { replace, window };
  }

  const ua = (version: number) =>
    `Mozilla/5.0 (Linux; Android 7.1.2; BRAVIA 4K Build/NRD90M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/${String(version)}.0.6045.193 Safari/537.36`;

  it.each([minVersion, minVersion + 8, 140])(
    'rend la main à Mia sur une WebView %i, assez récente (Capacitor ne lit pas sa version avant Android 8)',
    (version) => {
      const { replace } = runScript(ua(version));

      expect(replace).toHaveBeenCalledTimes(1);
      // `./` : `/` sous https://localhost (APK), `/mia/` si la page est ouverte sur GitHub Pages.
      expect(replace).toHaveBeenCalledWith('./');
    },
  );

  it.each([
    ['une WebView trop ancienne', ua(minVersion - 1)],
    ['une WebView à deux chiffres', ua(95)],
    ['un agent sans version de Chrome', 'Mozilla/5.0 (Linux; Android 7.1.2) AppleWebKit/537.36'],
    ['un agent vide', ''],
  ])('reste affichée sur %s', (_label, userAgent) => {
    expect(runScript(userAgent).replace).not.toHaveBeenCalled();
  });

  it('ne tente sa chance qu’une fois par fenêtre : Capacitor revient ici si Mia ne charge pas', () => {
    const first = runScript(ua(minVersion));
    const second = runScript(ua(minVersion), first.window);

    expect(first.replace).toHaveBeenCalledTimes(1);
    expect(second.replace).not.toHaveBeenCalled();
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

  it('ne laisse aucune donnée quitter l’appareil : ni sauvegarde automatique, ni transfert', () => {
    const application = /<application\b[^>]*>/.exec(manifest)?.[0] ?? '';
    const rules = read('android/app/src/main/res/xml/data_extraction_rules.xml');

    expect(application).toContain('android:allowBackup="false"');
    expect(application).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    expect(rules).toContain('<data-extraction-rules>');
    for (const section of ['cloud-backup', 'device-transfer']) {
      const body = new RegExp(`<${section}>([\\s\\S]*?)</${section}>`).exec(rules)?.[1] ?? '';

      for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) {
        expect(body, `${section} ${domain}`).toContain(`<exclude domain="${domain}" path="." />`);
      }
      expect(body).not.toContain('<include');
    }
  });
});

describe('Thème de l’application', () => {
  const styles = read('android/app/src/main/res/values/styles.xml');
  const theme = /<style name="AppTheme\.NoActionBar" parent="([^"]+)">([\s\S]*?)<\/style>/.exec(
    styles,
  );

  it('reste sombre sur un appareil en thème clair, avec le fond de Mia sous les barres système', () => {
    expect(theme?.[1]).toBe('Theme.AppCompat.NoActionBar');
    expect(theme?.[2]).toContain(
      '<item name="android:windowBackground">@color/splash_background</item>',
    );
    expect(read('android/app/src/main/res/values/colors.xml')).toContain(
      `<color name="splash_background">${String(capacitorConfig.backgroundColor)}</color>`,
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
