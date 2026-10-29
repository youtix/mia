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
import { parseAndMigrateSaveState, parseBackupJson, type ImportFailure } from './migrations';
import {
  exportSaveJson,
  loadSaveState,
  requestPersistentStorage,
  saveState,
} from './storage-service';
import { applyTvModeOverride, detectNativeTv, hasNativeTvDetection } from './tv-mode';

/** Résultat d'`importBackup` : en cas d'échec, `message` est prêt à afficher. */
export type ImportResult = { ok: true } | ImportFailure;

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
  /** Efface profils et réglages (état par défaut) */
  resetAllData: () => Promise<void>;
  /** JSON de l'état courant (à appeler une fois `isLoaded`) */
  exportBackup: () => string;
  /** Remplace profils et profil actif, conserve les réglages de l'appareil */
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
  /** Écriture de la sauvegarde par un autre onglet (`null` : clé supprimée) */
  receive: (raw: string | null) => void;
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
  let writes = Promise.resolve();
  let markLoaded: () => void = () => undefined;
  const loaded = new Promise<void>((resolve) => {
    markLoaded = resolve;
  });

  function publish(state: MiaSaveState): void {
    snapshot = { state, isLoaded: true };
    markLoaded();
    for (const listener of listeners) listener();
  }

  async function update(updater: SaveUpdater): Promise<void> {
    await loaded;
    const prev = snapshot.state;
    const next = updater(prev);
    if (next === prev) return;
    publish(next);
    writes = writes.then(() => saveState(next));
    await writes;
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
    update,
    updateSettings: (partial) => update((prev) => withSettings(prev, partial)),
    resetAllData: () => update(createDefaultSaveState),
    exportBackup: () => exportSaveJson(snapshot.state),
    importBackup: async (json) => {
      const result = parseBackupJson(json);
      if (!result.ok) return result;
      if (result.issues.length > 0) {
        console.warn('[Mia]', `Sauvegarde importée avec pertes : ${result.issues.join(' ; ')}`);
      }
      await update((prev) => ({ ...result.state, settings: prev.settings }));
      return { ok: true };
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
 * stockage persistant demandé (Web), synchronisation entre onglets, mode TV (`data-tv`, avec la
 * détection native dans l'APK) et contraste élevé (`data-contrast`).
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
    const onStorage = (event: StorageEvent) => {
      if (isSaveStorageEvent(event)) store.receive(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
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
