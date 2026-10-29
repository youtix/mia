'use client';

import { registerServiceWorker } from '@/core/pwa/registerServiceWorker';
import { useEffect } from 'react';

/**
 * Enregistre le service worker (FEAT-17) une fois la page entièrement chargée (événement `load`) :
 * le pré-cache de tout l'export ne doit pas concurrencer le premier affichage sur les boîtiers TV
 * modestes. Ne rend rien ; monté une seule fois dans le layout racine.
 */
export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    const register = (): void => {
      void registerServiceWorker();
    };
    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => {
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}
