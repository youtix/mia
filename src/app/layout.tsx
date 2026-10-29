import { AndroidBackButtonBridge, NavigationProvider } from '@/core/navigation';
import { ServiceWorkerRegistrar } from '@/core/pwa';
import { StorageProvider, TV_MODE_BOOTSTRAP_SCRIPT } from '@/core/storage';
import '@fontsource-variable/atkinson-hyperlegible-next';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  // Les pages des jeux donnent leur titre (« Memory · Mia ») ; le Hub garde le titre par défaut.
  title: { default: 'Mia - Entraînement Cérébral', template: '%s · Mia' },
  description:
    'Entraînement cérébral gratuit et open-source pour Smartphone, Tablette, Android TV et Web.',
  applicationName: 'Mia',
  manifest: `${basePath}/manifest.json`,
  icons: {
    icon: [
      // PNG d'abord (Safari n'affiche pas les favicons SVG), SVG en dernier : Chrome et Firefox
      // retiennent la dernière icône compatible, sinon le PNG 32 px s'afficherait flou en HiDPI.
      { url: `${basePath}/icons/favicon-32.png`, type: 'image/png', sizes: '32x32' },
      { url: `${basePath}/icons/icon-192.svg`, type: 'image/svg+xml' },
    ],
    // iOS exige un PNG, sinon l'écran d'accueil affiche une capture de la page.
    apple: [{ url: `${basePath}/icons/apple-touch-icon.png`, type: 'image/png', sizes: '180x180' }],
  },
  // `black-translucent` exigerait la gestion des safe-areas.
  appleWebApp: { capable: true, title: 'Mia', statusBarStyle: 'black' },
};

export const viewport: Viewport = {
  themeColor: '#38bdf8',
  colorScheme: 'dark',
  // Plein écran dans l'APK (edge-to-edge, FEAT-15) : `.tv-safe-container` lit `env(safe-area-inset-*)`.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // suppressHydrationWarning : le script inline pose `data-tv` sur <html> avant l'hydratation.
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Mode TV (FEAT-05 §3.4) : posé avant le premier rendu, sinon les marges sauteraient. */}
        <script dangerouslySetInnerHTML={{ __html: TV_MODE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-slate-900 font-sans text-slate-50 antialiased">
        {/* Sauvegarde locale (profils, étoiles) et moteur D-Pad, partagés par tous les écrans. */}
        <StorageProvider>
          <NavigationProvider>
            {/* Bouton Retour physique d'Android (FEAT-15) : même routage que les touches. */}
            <AndroidBackButtonBridge />
            {children}
          </NavigationProvider>
        </StorageProvider>
        {/* PWA hors-ligne (FEAT-17) : enregistré après `load`, en production Web seulement. */}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
