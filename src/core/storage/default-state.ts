import type {
  DeviceSettings,
  MemoryGameSettings,
  MiaSaveState,
  ProfileGameSettings,
} from '@/types/mia';

/**
 * Clé unique de la sauvegarde. Elle ne change jamais : le format évolue par `schemaVersion`
 * (migrations), le suffixe « v1 » désigne seulement la première génération de clé.
 */
export const STORAGE_KEY = 'mia_save_state_v1';

/** Copie brute de la dernière sauvegarde lue avec pertes (un seul emplacement, écrasé ensuite). */
export const BACKUP_STORAGE_KEY = 'mia_save_state_v1_backup';

export const CURRENT_SCHEMA_VERSION: MiaSaveState['schemaVersion'] = 1;

export const DEFAULT_DEVICE_SETTINGS: Readonly<DeviceSettings> = {
  soundEnabled: true,
  highContrastMode: false,
  tvModeOverride: 'auto',
};

/** Réglages de Memory d'un nouveau profil (FEAT-19) : les temps du niveau, tels quels. */
export const DEFAULT_MEMORY_GAME_SETTINGS: Readonly<MemoryGameSettings> = {
  previewFactor: 1,
  mismatchFactor: 1,
};

/** Réglages de jeu d'un nouveau profil (nouvel objet à chaque appel, jamais partagé entre profils). */
export function createDefaultGameSettings(): ProfileGameSettings {
  return { memory: { ...DEFAULT_MEMORY_GAME_SETTINGS } };
}

/** État initial (nouvel objet à chaque appel) : aucun profil, FEAT-06 crée le premier. */
export function createDefaultSaveState(): MiaSaveState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeProfileId: null,
    profiles: [],
    settings: { ...DEFAULT_DEVICE_SETTINGS },
  };
}
