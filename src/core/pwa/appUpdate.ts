import { RESTORE_PRECACHE_MESSAGE, SKIP_WAITING_MESSAGE } from '@/core/pwa/precache';
import {
  deletePrecaches,
  readServiceWorkerEnvironment,
  shouldRegisterServiceWorker,
} from '@/core/pwa/registerServiceWorker';
import { reloadPage } from '@/core/pwa/reloadPage';

/**
 * Où en est la mise à jour de la PWA (FEAT-20) :
 * - `unsupported` : rien à gérer ici (APK, développement, navigateur sans service worker) ;
 * - `idle` : aucune nouvelle version connue ;
 * - `downloading` : une nouvelle version se pré-cache en arrière-plan ;
 * - `ready` : une nouvelle version complète attend l'accord du joueur.
 */
export type AppUpdateStatus = 'unsupported' | 'idle' | 'downloading' | 'ready';

/** Issue d'une recherche : `found` couvre le téléchargement en cours comme la version déjà prête. */
export type AppUpdateCheckResult = 'up-to-date' | 'found' | 'unreachable';

/** Issue d'une réparation : `unreachable` signifie que rien n'a été supprimé. */
export type AppRepairResult = 'reloading' | 'unreachable';

/** Retour au premier plan : au plus une recherche par minute, chacune retélécharge `sw.js`. */
export const FOREGROUND_CHECK_INTERVAL_MS = 60_000;

/** Version de Mia (`package.json`), injectée au build par `next.config.ts`. */
export function getAppVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION ?? 'inconnue';
}

function readRegistrationStatus(registration: ServiceWorkerRegistration): AppUpdateStatus {
  // Sans worker actif, c'est la première installation : il s'active seul, sans rien demander.
  if (!registration.active) return 'idle';
  if (registration.waiting) return 'ready';
  // Installation échouée : le worker devient `redundant` avant que `installing` ne se vide, et aucun
  // événement ne suit.
  const { installing } = registration;
  return installing && installing.state !== 'redundant' ? 'downloading' : 'idle';
}

export interface AppUpdateController {
  subscribe: (listener: () => void) => () => void;
  getStatus: () => AppUpdateStatus;
  /** Suit l'inscription pour toute la vie de la page ; seul le premier appel compte. */
  start: (registration: ServiceWorkerRegistration) => void;
  /** Cherche une nouvelle version ; `unreachable` si le réseau ou l'inscription manquent. */
  check: () => Promise<AppUpdateCheckResult>;
  /** Active la version prête : la page se recharge au changement de worker, sinon sans effet. */
  apply: () => void;
}

/**
 * Suivi de la mise à jour, lu par `useSyncExternalStore` : le worker en attente ne s'active qu'à la
 * demande du joueur (`apply`), et toutes les pages ouvertes se rechargent alors, car les chunks de
 * l'ancienne version disparaissent avec son cache. Une recherche part au lancement et à chaque
 * retour au premier plan : une PWA reprise depuis l'arrière-plan ne recharge jamais sa page.
 */
export function createAppUpdateController(): AppUpdateController {
  const listeners = new Set<() => void>();
  let registration: ServiceWorkerRegistration | null = null;
  let status: AppUpdateStatus | null = null;
  let lastCheckAt = 0;
  let isApplying = false;
  let isReloading = false;

  const getStatus = (): AppUpdateStatus => {
    status ??= shouldRegisterServiceWorker(readServiceWorkerEnvironment()) ? 'idle' : 'unsupported';
    return status;
  };

  const syncStatus = (): void => {
    if (!registration) return;
    const next = readRegistrationStatus(registration);
    if (next === getStatus()) return;
    status = next;
    for (const listener of listeners) listener();
  };

  const track = (worker: ServiceWorker | null): void => {
    worker?.addEventListener('statechange', syncStatus);
  };

  const check = async (): Promise<AppUpdateCheckResult> => {
    if (!registration) return 'unreachable';
    lastCheckAt = Date.now();
    try {
      await registration.update();
    } catch {
      return 'unreachable';
    }
    syncStatus();
    return getStatus() === 'idle' ? 'up-to-date' : 'found';
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getStatus,
    start: (next) => {
      if (registration) return;
      registration = next;

      const reloadOnce = (): void => {
        if (isReloading) return;
        isReloading = true;
        reloadPage();
      };

      // Le worker dont la page attend ses chunks : sans contrôleur (rechargement forcé), celui qui
      // est actif, car son remplacement purge aussi les fichiers de la page.
      let pageWorker = navigator.serviceWorker.controller ?? next.active;
      // WebKit peut le remplacer pendant que la page dort dans le cache de navigation (bfcache) : à
      // son retour, seul l'état du worker le signale, jamais `controllerchange`.
      const watchPageWorker = (): void => {
        const worker = pageWorker;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'redundant') reloadOnce();
        });
      };
      watchPageWorker();
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        const { controller } = navigator.serviceWorker;
        // Première visite (aucun worker) : `clients.claim()` n'apporte pas de version à recharger.
        if ((pageWorker && controller !== pageWorker) || isApplying) reloadOnce();
        pageWorker = controller;
        watchPageWorker();
      });

      next.addEventListener('updatefound', () => {
        track(next.installing);
        syncStatus();
      });
      track(next.installing);
      track(next.waiting);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (Date.now() - lastCheckAt >= FOREGROUND_CHECK_INTERVAL_MS) void check();
      });
      // Retour par le cache de navigation (bfcache) : les événements du worker n'ont pas suivi la page
      // endormie, et son statut date de son départ.
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) syncStatus();
      });

      syncStatus();
      void check();
      // Une réparation ou une éviction du navigateur a pu vider le cache de chacun.
      next.active?.postMessage(RESTORE_PRECACHE_MESSAGE);
      next.waiting?.postMessage(RESTORE_PRECACHE_MESSAGE);
    },
    check,
    apply: () => {
      const waiting = registration?.waiting;
      if (!waiting) return;
      isApplying = true;
      waiting.postMessage(SKIP_WAITING_MESSAGE);
    },
  };
}

/** Suivi unique de la page, démarré par `ServiceWorkerRegistrar`. */
export const appUpdate = createAppUpdateController();

/**
 * Désinscrit le worker de Mia seulement : sans inscription de Mia, le navigateur rend celle d'un
 * scope parent, qui appartient à une autre application de l'origine.
 */
async function unregisterOwnWorker(basePath: string): Promise<void> {
  const scope = new URL(`${basePath}/`, window.location.href).href;
  const registration = await navigator.serviceWorker.getRegistration(scope);
  if (registration?.scope === scope) await registration.unregister();
}

/**
 * Remet Mia à neuf : désinscrit son service worker, supprime ses caches et recharge la page depuis
 * le réseau. Seuls Mia et ses fichiers sont touchés : la sauvegarde (`localStorage`) et les autres
 * applications de l'origine restent intactes (GitHub Pages partage l'origine entre dépôts).
 */
export async function repairApp(): Promise<AppRepairResult> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  // Réseau vérifié avant toute suppression : sans lui, plus rien ne se chargerait après la purge.
  // `sw.js` n'est jamais pré-caché : cette requête ne peut pas être servie par le worker.
  try {
    const response = await fetch(`${basePath}/sw.js`, { cache: 'no-store' });
    if (!response.ok) return 'unreachable';
  } catch {
    return 'unreachable';
  }

  // Étapes indépendantes : même si le worker reste inscrit, ses caches vides le renvoient au réseau.
  for (const step of [() => unregisterOwnWorker(basePath), deletePrecaches]) {
    try {
      await step();
    } catch (error) {
      console.warn('Réparation incomplète : Mia se recharge quand même.', error);
    }
  }
  reloadPage();
  return 'reloading';
}
