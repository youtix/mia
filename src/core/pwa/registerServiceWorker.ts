import { CACHE_PREFIX } from '@/core/pwa/precache';
import { Capacitor } from '@capacitor/core';

export interface ServiceWorkerEnvironment {
  /** `process.env.NODE_ENV` : le cache casserait le rechargement à chaud de `next dev`. */
  nodeEnv: string | undefined;
  /** APK Capacitor : les assets sont embarqués, un service worker figerait d'anciennes versions. */
  isNativePlatform: boolean;
  /** `'serviceWorker' in navigator` (absent en navigation privée Firefox, vieux WebView…). */
  supportsServiceWorker: boolean;
}

/** Pure : vrai seulement en production, dans un navigateur Web supportant les service workers. */
export function shouldRegisterServiceWorker(env: ServiceWorkerEnvironment): boolean {
  return env.nodeEnv === 'production' && !env.isNativePlatform && env.supportsServiceWorker;
}

/**
 * Pure : vrai hors production, dans un navigateur Web supportant les service workers. Un service
 * worker laissé par `npm start` (export de production servi sur localhost:3000) continuerait sinon
 * de servir l'ancien build à la place de `next dev` sur le même port. Jamais dans l'APK.
 */
export function shouldUnregisterStaleServiceWorkers(env: ServiceWorkerEnvironment): boolean {
  return env.nodeEnv !== 'production' && !env.isNativePlatform && env.supportsServiceWorker;
}

/**
 * Désinscrit tous les service workers de l'origine courante et supprime les caches `mia-precache-*`
 * (hors production uniquement, voir `shouldUnregisterStaleServiceWorkers`). Ne lève jamais : une
 * erreur est journalisée (console.warn), `next dev` reste utilisable.
 */
export async function unregisterStaleServiceWorkers(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    // `caches` manque hors contexte sécurisé (http autre que localhost) : rien à purger alors.
    if (typeof caches === 'undefined') return;
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)),
    );
  } catch (error) {
    console.warn(
      'Anciens service workers non désinscrits : un ancien build de Mia peut encore être servi.',
      error,
    );
  }
}

/**
 * Enregistre `${basePath}/sw.js` avec le scope `${basePath}/` (GitHub Pages sert Mia sous /mia/).
 * `NEXT_PUBLIC_BASE_PATH` est lu à l'appel, pas au chargement du module, pour rester testable.
 * Renvoie null si la garde refuse ou si l'enregistrement échoue : l'erreur est journalisée
 * (console.warn), jamais propagée à l'interface, Mia reste utilisable en ligne.
 * Hors production dans un navigateur (`next dev`), désinscrit d'abord les service workers laissés
 * par un `npm start` précédent (`unregisterStaleServiceWorkers`), puis renvoie null.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  const environment: ServiceWorkerEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    isNativePlatform: Capacitor.isNativePlatform(),
    supportsServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  };
  if (!shouldRegisterServiceWorker(environment)) {
    if (shouldUnregisterStaleServiceWorkers(environment)) await unregisterStaleServiceWorkers();
    return null;
  }

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  try {
    return await navigator.serviceWorker.register(`${basePath}/sw.js`, { scope: `${basePath}/` });
  } catch (error) {
    console.warn('Service worker non enregistré : Mia reste utilisable en ligne.', error);
    return null;
  }
}
