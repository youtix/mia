'use client';

import type { DeviceSettings, MiaSaveState, UserProfile } from '@/types/mia';
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { applyHighContrastMode } from './contrast-mode';
import { createDefaultSaveState, STORAGE_KEY } from './default-state';
import {
  importFailure,
  parseAndMigrateSaveState,
  parseBackupJson,
  type ImportFailure,
} from './migrations';
import {
  exportSaveJson,
  loadSaveState,
  readStoredSaveRaw,
  removeSaveBackup,
  requestPersistentStorage,
  saveState,
} from './storage-service';
import { applyTvModeOverride, detectNativeTv, hasNativeTvDetection } from './tv-mode';

/**
 * Résultat d'`importBackup` : réussi, `issues` liste ce qui a été écarté ou réparé dans le fichier ;
 * en cas d'échec, `message` est prêt à afficher.
 */
export type ImportResult = { ok: true; issues: string[] } | ImportFailure;

type SaveUpdater = (prev: MiaSaveState) => MiaSaveState;

export interface StorageContextValue {
  state: MiaSaveState;
  /** Sauvegarde chargée ; avant, `state` vaut l'état par défaut (pré-rendu, premier rendu) */
  isLoaded: boolean;
  activeProfile: UserProfile | null;
  /**
   * Appliqué sur le dernier état, dans l'ordre des appels, une fois la sauvegarde chargée ;
   * l'écriture suit (jamais de rejet sur un échec d'écriture). Renvoyer `prev` n'écrit rien.
   */
  updateState: (updater: SaveUpdater) => Promise<void>;
  updateSettings: (partial: Partial<DeviceSettings>) => Promise<void>;
  /** Efface profils et réglages (état par défaut) et la copie de secours */
  resetAllData: () => Promise<void>;
  /** JSON de l'état courant (à appeler une fois `isLoaded`) */
  exportBackup: () => string;
  /**
   * Remplace profils et profil actif, conserve les réglages de l'appareil. Contrairement à
   * `updateState`, échoue si la sauvegarde n'a pas pu être écrite : rien n'est restauré alors.
   */
  importBackup: (json: string) => Promise<ImportResult>;
}

interface StorageSnapshot {
  state: MiaSaveState;
  isLoaded: boolean;
}

interface StorageStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => StorageSnapshot;
  load: () => Promise<void>;
  /** Écriture de la sauvegarde par un autre onglet : valeur relue sur le disque (`null` : supprimée) */
  receive: (raw: string | null) => void;
  /** Relit la sauvegarde : la page a pu manquer des écritures en dormant */
  reload: () => Promise<void>;
  update: (updater: SaveUpdater) => Promise<void>;
  updateSettings: (partial: Partial<DeviceSettings>) => Promise<void>;
  resetAllData: () => Promise<void>;
  exportBackup: () => string;
  importBackup: (json: string) => Promise<ImportResult>;
}

/** Pré-rendu statique et premier rendu client : état par défaut, non chargé. */
const SERVER_SNAPSHOT: StorageSnapshot = { state: createDefaultSaveState(), isLoaded: false };

const getServerSnapshot = () => SERVER_SNAPSHOT;

function withSettings(prev: MiaSaveState, partial: Partial<DeviceSettings>): MiaSaveState {
  const settings: DeviceSettings = {
    soundEnabled: partial.soundEnabled ?? prev.settings.soundEnabled,
    highContrastMode: partial.highContrastMode ?? prev.settings.highContrastMode,
    tvModeOverride: partial.tvModeOverride ?? prev.settings.tvModeOverride,
  };
  const keys = Object.keys(settings) as (keyof DeviceSettings)[];
  return keys.every((key) => settings[key] === prev.settings[key]) ? prev : { ...prev, settings };
}

function createStorageStore(): StorageStore {
  const listeners = new Set<() => void>();
  let snapshot = SERVER_SNAPSHOT;
  let writes: Promise<unknown> = Promise.resolve();
  let markLoaded: () => void = () => undefined;
  const loaded = new Promise<void>((resolve) => {
    markLoaded = resolve;
  });

  function publish(state: MiaSaveState): void {
    snapshot = { state, isLoaded: true };
    markLoaded();
    for (const listener of listeners) listener();
  }

  /** Écritures sérialisées, dans l'ordre des appels. */
  function save(state: MiaSaveState): Promise<boolean> {
    const written = writes.then(() => saveState(state));
    writes = written;
    return written;
  }

  async function update(updater: SaveUpdater): Promise<void> {
    await loaded;
    const prev = snapshot.state;
    const next = updater(prev);
    if (next === prev) return;
    publish(next);
    await save(next);
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    load: async () => {
      const state = await loadSaveState();
      // Une écriture d'un autre onglet reçue pendant le chargement est plus récente : elle reste.
      if (!snapshot.isLoaded) publish(state);
    },
    receive: (raw) => {
      publish(parseAndMigrateSaveState(raw));
    },
    reload: async () => {
      await writes;
      publish(await loadSaveState());
    },
    update,
    updateSettings: (partial) => update((prev) => withSettings(prev, partial)),
    resetAllData: async () => {
      await update(createDefaultSaveState);
      await removeSaveBackup();
    },
    exportBackup: () => exportSaveJson(snapshot.state),
    importBackup: async (json) => {
      const result = parseBackupJson(json);
      if (!result.ok) return result;
      if (result.issues.length > 0) {
        console.warn('[Mia]', `Sauvegarde importée avec pertes : ${result.issues.join(' ; ')}`);
      }
      await loaded;
      const prev = snapshot.state;
      const next: MiaSaveState = { ...result.state, settings: prev.settings };
      publish(next);
      if (await save(next)) return { ok: true, issues: result.issues };
      // Rien d'enregistré : l'écran et le stockage (dont le miroir natif, qui a pu recevoir l'import)
      // reviennent à l'état d'avant, sauf s'il y a plus récent depuis.
      if (snapshot.state === next) {
        publish(prev);
        await save(prev);
      }
      return importFailure('write_failed');
    },
  };
}

/** Écriture de la sauvegarde dans un autre onglet, ou `localStorage.clear()` (`key === null`). */
function isSaveStorageEvent(event: StorageEvent): boolean {
  return (event.key === null || event.key === STORAGE_KEY) && event.storageArea === localStorage;
}

const StorageContext = createContext<StorageContextValue | null>(null);

export interface StorageProviderProps {
  children: ReactNode;
}

/**
 * Sauvegarde locale de l'appareil (profils, progression, réglages) : chargement au montage,
 * stockage persistant demandé (Web), synchronisation entre onglets et au retour du cache de
 * navigation, mode TV (`data-tv`, avec la détection native dans l'APK) et contraste élevé
 * (`data-contrast`).
 */
export function StorageProvider({ children }: StorageProviderProps) {
  const [store] = useState(createStorageStore);
  // Détection native de la TV (APK, FEAT-15) : `null` tant que le plugin n'a pas répondu.
  const [nativeTv, setNativeTv] = useState<boolean | null>(() =>
    hasNativeTvDetection() ? null : false,
  );
  const { state, isLoaded } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    getServerSnapshot,
  );
  const { tvModeOverride, highContrastMode } = state.settings;

  useEffect(() => {
    void store.load();
    void requestPersistentStorage();
    let cancelled = false;
    void detectNativeTv().then((value) => {
      if (!cancelled) setNativeTv(value);
    });
    // Le disque fait foi, pas `event.newValue` : l'événement arrive parfois après une écriture plus
    // récente (de cet onglet ou d'un troisième), et chaque onglet afficherait l'écriture de l'autre.
    const onStorage = (event: StorageEvent) => {
      if (isSaveStorageEvent(event)) store.receive(readStoredSaveRaw());
    };
    // Retour par le cache de navigation (bfcache) : Firefox et WebKit ne rejouent pas les événements
    // `storage` manqués, et la prochaine écriture effacerait ce qu'un autre onglet a gagné entre-temps.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void store.reload();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [store]);

  // Avant le chargement, les attributs posés par le script inline du <head> restent en place ; en
  // `auto`, aussi tant que la détection native n'a pas répondu (les marges TV ne sautent pas).
  useEffect(() => {
    if (!isLoaded || (tvModeOverride === 'auto' && nativeTv === null)) return;
    applyTvModeOverride(tvModeOverride, document.documentElement, { nativeTv: nativeTv === true });
  }, [isLoaded, tvModeOverride, nativeTv]);

  useEffect(() => {
    if (isLoaded) applyHighContrastMode(highContrastMode);
  }, [isLoaded, highContrastMode]);

  const value = useMemo<StorageContextValue>(
    () => ({
      state,
      isLoaded,
      activeProfile: state.profiles.find((profile) => profile.id === state.activeProfileId) ?? null,
      updateState: store.update,
      updateSettings: store.updateSettings,
      resetAllData: store.resetAllData,
      exportBackup: store.exportBackup,
      importBackup: store.importBackup,
    }),
    [state, isLoaded, store],
  );

  return <StorageContext value={value}>{children}</StorageContext>;
}

export function useMiaStorage(): StorageContextValue {
  const value = use(StorageContext);
  if (!value) throw new Error('useMiaStorage exige un <StorageProvider> parent.');
  return value;
}
