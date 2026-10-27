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
    <html lang="fr">
      <body className="min-h-dvh bg-slate-900 font-sans text-slate-50 antialiased">
        {children}
      </body>
    </html>
  );
}
