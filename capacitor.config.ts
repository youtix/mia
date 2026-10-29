import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Empaquetage Android / Android TV (FEAT-15) : l'export statique `out/` est embarqué tel quel dans
 * l'APK (`npm run cap:sync`) et servi depuis `https://localhost`, sans serveur ni réseau.
 */
const config: CapacitorConfig = {
  appId: 'org.mia.braintraining',
  appName: 'Mia',
  webDir: 'out',
  // Couleur de la WebView avant le premier rendu : évite un éclair blanc sur un téléviseur.
  backgroundColor: '#0f172a',
  android: {
    // Tailwind v4 / Next 16 exigent Chrome 111+ (FEAT-01 §6) : en dessous, `server.errorPath`.
    minWebViewVersion: 111,
  },
  server: {
    // Affichée à la place de l'application si la WebView est trop ancienne (page autonome).
    errorPath: 'webview-obsolete.html',
  },
  plugins: {
    // Plein écran (edge-to-edge, imposé par Android 15) : `insetsHandling` reste à sa valeur par
    // défaut (`css`). Avec `viewport-fit=cover` (layout.tsx) et une WebView 140+, la WebView passe
    // sous les barres système et `env(safe-area-inset-*)` (déjà lu par `.tv-safe-container`)
    // porte leurs tailles ; avant 140, Capacitor rembourre lui-même la vue. L'indice évite un saut
    // de mise en page au lancement : le layout déclare toujours `cover`.
    SystemBars: {
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
