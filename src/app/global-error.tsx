'use client';

import { CrashScreen } from '@/components/ui/CrashScreen';
import { NavigationProvider } from '@/core/navigation';
import '@fontsource-variable/atkinson-hyperlegible-next';
import { useEffect } from 'react';
import './globals.css';

/**
 * Écran d'erreur global (FEAT-20) : un plantage côté client (ex: chunk introuvable à cause d'un
 * cache périmé) afficherait sinon la page d'erreur de Next, sans accès aux Réglages. Ce fichier
 * remplace le layout racine, dont les fournisseurs et le `<head>` disparaissent : il rend donc son
 * propre document, styles et police compris, et ne lit jamais la sauvegarde.
 */
export default function GlobalError({ error }: Readonly<{ error: unknown }>) {
  useEffect(() => {
    console.error('[Mia]', error);
  }, [error]);

  return (
    <html lang="fr">
      <head>
        <title>Mia</title>
        {/* Le `viewport` du layout part avec lui, et un composant client ne peut pas l'exporter. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="min-h-dvh bg-slate-900 font-sans text-slate-50 antialiased">
        <NavigationProvider>
          <CrashScreen />
        </NavigationProvider>
      </body>
    </html>
  );
}
