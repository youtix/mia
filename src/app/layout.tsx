// Module direct, pas le barrel : il ferait entrer StorageContext et Capacitor dans le JS client.
import { TV_MODE_BOOTSTRAP_SCRIPT } from '@/core/storage/tv-mode';
import '@fontsource-variable/atkinson-hyperlegible-next';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Mia - Entraînement Cérébral',
  description:
    'Entraînement cérébral gratuit et open-source pour Smartphone, Tablette, Android TV et Web.',
  applicationName: 'Mia',
  manifest: `${basePath}/manifest.json`,
  icons: {
    icon: [{ url: `${basePath}/icons/icon-192.svg`, type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#38bdf8',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // suppressHydrationWarning : le script inline pose `data-tv` sur <html> avant l'hydratation.
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Mode TV (FEAT-05 §3.4) : posé avant le premier rendu, sinon les marges sauteraient. */}
        <script dangerouslySetInnerHTML={{ __html: TV_MODE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-slate-900 font-sans text-slate-50 antialiased">{children}</body>
    </html>
  );
}
