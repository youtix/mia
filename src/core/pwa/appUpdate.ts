import { RESTORE_PRECACHE_MESSAGE, SKIP_WAITING_MESSAGE } from '@/core/pwa/precache';
import {
  REPAIR_SCRIPT_PARAM,
  readServiceWorkerEnvironment,
  registerServiceWorker,
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

/** Issue d'une réparation : `unreachable` signifie que rien n'a changé. */
export type AppRepairResult = 'reloading' | 'unreachable';

/** Retour au premier plan : au plus une recherche par minute, chacune retélécharge `sw.js`. */
export const FOREGROUND_CHECK_INTERVAL_MS = 60_000;

/** Réparation : délai accordé à `sw.js`, que `register()` attendrait sans limite sur un réseau muet. */
export const REPAIR_SCRIPT_TIMEOUT_MS = 30_000;

/** États d'un worker qui a fini son installation, réussie ou non (`redundant`). */
const INSTALL_OUTCOMES: readonly ServiceWorkerState[] = [
  'installed',
  'activating',
  'activated',
  'redundant',
];

/** Résout dès que le worker atteint l'un de ces états, même s'il y est déjà. */
function waitForWorkerState(
  worker: ServiceWorker,
  states: readonly ServiceWorkerState[],
): Promise<ServiceWorkerState> {
  return new Promise((resolve) => {
    const settle = (): void => {
      if (!states.includes(worker.state)) return;
      worker.removeEventListener('statechange', settle);
      resolve(worker.state);
    };
    worker.addEventListener('statechange', settle);
    settle();
  });
}

/** Version de Mia (`package.json`), injectée au build par `next.config.ts`. */
export function getAppVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION ?? 'inconnue';
}

/**
 * Plus aucun worker : la première installation a échoué, et le navigateur a retiré l'inscription.
 * `update()` la refuse alors, quelle que soit la connexion. Le worker devient `redundant` avant que
 * `installing` ne se vide.
 */
function isRegistrationLost({ active, waiting, installing }: ServiceWorkerRegistration): boolean {
  return !active && !waiting && (!installing || installing.state === 'redundant');
}

/**
 * Copie neuve d'une réparation (`sw.js?repair=…`, une autre adresse que celle du worker actif) : pas une
 * version à proposer. Une réparation abandonnée faute de réponse peut encore s'installer bien plus tard,
 * le navigateur ne l'annulant pas ; elle attend alors la fermeture de l'application pour s'activer. Une
 * mise à jour d'une inscription réparée garde l'adresse du worker actif : elle reste proposée.
 */
function isRepairCopy(worker: ServiceWorker, active: ServiceWorker): boolean {
  if (worker.scriptURL === active.scriptURL) return false;
  return new URL(worker.scriptURL).searchParams.has(REPAIR_SCRIPT_PARAM);
}

function readRegistrationStatus(registration: ServiceWorkerRegistration): AppUpdateStatus {
  // Sans worker actif, c'est la première installation : il s'active seul, sans rien demander.
  const { active, waiting, installing } = registration;
  if (!active) return 'idle';
  if (waiting && !isRepairCopy(waiting, active)) return 'ready';
  // Installation échouée : le worker devient `redundant` avant que `installing` ne se vide, et aucun
  // événement ne suit.
  if (!installing || installing.state === 'redundant' || isRepairCopy(installing, active)) {
    return 'idle';
  }
  return 'downloading';
}

export interface AppUpdateController {
  subscribe: (listener: () => void) => () => void;
  getStatus: () => AppUpdateStatus;
  /**
   * Suit l'inscription pour toute la vie de la page, `null` si `register()` a échoué (à retenter) ;
   * seul le premier appel compte, et rien ne démarre là où aucun service worker n'est prévu.
   */
  start: (registration: ServiceWorkerRegistration | null) => void;
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
  let isStarted = false;
  let registration: ServiceWorkerRegistration | null = null;
  let status: AppUpdateStatus | null = null;
  let lastCheckAt = 0;
  let isApplying = false;
  let isReloading = false;
  let isRetryScheduled = false;

  const getStatus = (): AppUpdateStatus => {
    status ??= shouldRegisterServiceWorker(readServiceWorkerEnvironment()) ? 'idle' : 'unsupported';
    return status;
  };

  /**
   * Une seule relance automatique par page, une minute après l'échec : un fichier peut manquer un
   * instant, et chaque tentative peut tout retélécharger. Ensuite, le retour au premier plan et le
   * bouton des Réglages relancent à leur tour.
   */
  const scheduleInstallRetry = (): void => {
    if (isRetryScheduled) return;
    isRetryScheduled = true;
    setTimeout(() => {
      if (!registration || isRegistrationLost(registration)) void check();
    }, FOREGROUND_CHECK_INTERVAL_MS);
  };

  const syncStatus = (): void => {
    if (!registration) return;
    if (isRegistrationLost(registration)) scheduleInstallRetry();
    const next = readRegistrationStatus(registration);
    if (next === getStatus()) return;
    status = next;
    for (const listener of listeners) listener();
  };

  const track = (worker: ServiceWorker | null): void => {
    worker?.addEventListener('statechange', syncStatus);
  };

  const onUpdateFound = (): void => {
    track(registration?.installing ?? null);
    syncStatus();
  };

  const follow = (next: ServiceWorkerRegistration): void => {
    registration = next;
    next.addEventListener('updatefound', onUpdateFound);
    track(next.installing);
    track(next.waiting);
  };

  /**
   * `register()` refusé ou première installation échouée : tout repart de `register()`, et la
   * recherche répond par ce que le réseau a vraiment donné, une fois l'installation terminée.
   */
  const installAgain = async (): Promise<AppUpdateCheckResult> => {
    const next = await registerServiceWorker();
    if (!next) return 'unreachable';
    follow(next);
    syncStatus();
    const worker = next.installing ?? next.waiting;
    if (worker) await waitForWorkerState(worker, INSTALL_OUTCOMES);
    return isRegistrationLost(next) ? 'unreachable' : 'up-to-date';
  };

  const check = async (): Promise<AppUpdateCheckResult> => {
    if (!isStarted) return 'unreachable';
    lastCheckAt = Date.now();
    if (!registration || isRegistrationLost(registration)) return installAgain();
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
      if (isStarted || getStatus() === 'unsupported') return;
      isStarted = true;

      const reloadOnce = (): void => {
        if (isReloading) return;
        isReloading = true;
        reloadPage();
      };

      // Le worker dont la page attend ses chunks : sans contrôleur (rechargement forcé), celui qui
      // est actif, car son remplacement purge aussi les fichiers de la page.
      let pageWorker = navigator.serviceWorker.controller ?? next?.active ?? null;
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

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (Date.now() - lastCheckAt >= FOREGROUND_CHECK_INTERVAL_MS) void check();
      });
      // Retour par le cache de navigation (bfcache) : les événements du worker n'ont pas suivi la page
      // endormie, et son statut date de son départ.
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) syncStatus();
      });

      if (!next) {
        scheduleInstallRetry();
        return;
      }
      follow(next);
      syncStatus();
      void check();
      // Une éviction du navigateur a pu vider le cache de chacun.
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

/** `register()` plafonné : un réseau muet ne doit pas bloquer la réparation sans message. */
function registerWithin(url: string, scope: string): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('sw.js ne répond pas'));
    }, REPAIR_SCRIPT_TIMEOUT_MS);
    void navigator.serviceWorker
      .register(url, { scope })
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(timer);
      });
  });
}

/**
 * Remet Mia à neuf sans rien retirer avant d'avoir le remplaçant : une installation neuve vérifie
 * chaque fichier et retélécharge ce qui est abîmé, pendant que l'ancien worker et ses caches continuent
 * de servir. Elle prend ensuite la main comme une mise à jour acceptée, ce qui purge les autres caches,
 * et la page se recharge. Si le réseau manque à un moment ou un autre, rien n'a changé. La sauvegarde
 * (`localStorage`) et les autres applications de l'origine restent intactes (GitHub Pages partage
 * l'origine entre dépôts).
 */
export async function repairApp(): Promise<AppRepairResult> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  // Autre URL : seul moyen d'obtenir une installation d'un `sw.js` inchangé. `registerServiceWorker`
  // la conserve ensuite, sinon l'URL normale relancerait une installation au prochain chargement.
  const url = `${basePath}/sw.js?${REPAIR_SCRIPT_PARAM}=${String(Date.now())}`;
  let registration: ServiceWorkerRegistration;
  try {
    registration = await registerWithin(url, `${basePath}/`);
  } catch {
    return 'unreachable';
  }

  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker || (await waitForWorkerState(worker, INSTALL_OUTCOMES)) === 'redundant') {
    return 'unreachable';
  }
  worker.postMessage(SKIP_WAITING_MESSAGE);
  await waitForWorkerState(worker, ['activated', 'redundant']);
  reloadPage();
  return 'reloading';
}
