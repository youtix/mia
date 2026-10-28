import type { MiaSaveState } from '@/types/mia';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { BACKUP_STORAGE_KEY, createDefaultSaveState, STORAGE_KEY } from './default-state';
import {
  parseBackupJson,
  parseSaveStateReport,
  type ImportFailure,
  type ImportFailureReason,
} from './migrations';

/** `navigator.storage` manque dans les contextes non sécurisés (http) et les anciens navigateurs. */
type PersistentStorageApi = Partial<Pick<StorageManager, 'persist' | 'persisted'>>;

/** Erreur explicite d'`importSaveJson` : `message` est prêt à afficher. */
export class SaveImportError extends Error {
  readonly reason: ImportFailureReason;

  constructor(failure: ImportFailure) {
    super(failure.message);
    this.name = 'SaveImportError';
    this.reason = failure.reason;
  }
}

function warn(...details: unknown[]): void {
  console.warn('[Mia]', ...details);
}

/**
 * Natif (APK) : Preferences (SharedPreferences Android) est la source de vérité, localStorage un
 * miroir lu par le script inline du mode TV. Web : localStorage seul (Preferences n'y est qu'un
 * localStorage préfixé « CapacitorStorage. », exposé aux autres applications de l'origine).
 */
function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** L'accès à `window.localStorage` lève lui-même quand le navigateur bloque les données de site. */
function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    warn(`Lecture locale de « ${key} » impossible :`, error);
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    warn(`Écriture locale de « ${key} » impossible :`, error);
  }
}

async function readPreferences(key: string): Promise<string | null> {
  try {
    return (await Preferences.get({ key })).value;
  } catch (error) {
    warn(`Lecture de « ${key} » dans Preferences impossible :`, error);
    return null;
  }
}

/** Natif : Preferences d'abord, miroir si vide ou en échec ; un miroir différent est réparé. */
async function readSaveRaw(): Promise<string | null> {
  const mirror = readLocal(STORAGE_KEY);
  if (!isNativePlatform()) return mirror;
  const value = await readPreferences(STORAGE_KEY);
  if (value === null) return mirror;
  if (value !== mirror) writeLocal(STORAGE_KEY, value);
  return value;
}

/** Natif : Preferences puis miroir (un arrêt entre les deux laisse la source de vérité à jour). */
async function writeRaw(key: string, value: string): Promise<void> {
  if (isNativePlatform()) {
    try {
      await Preferences.set({ key, value });
    } catch (error) {
      warn(`Écriture de « ${key} » dans Preferences impossible :`, error);
    }
  }
  writeLocal(key, value);
}

/**
 * Charge la sauvegarde sans jamais lever d'exception. Une lecture avec pertes (illisible, entrées
 * écartées, version plus récente) garde une copie brute dans `BACKUP_STORAGE_KEY`.
 */
export async function loadSaveState(): Promise<MiaSaveState> {
  const raw = await readSaveRaw();
  if (raw === null) return createDefaultSaveState();
  const { state, issues } = parseSaveStateReport(raw);
  if (issues.length > 0) {
    warn(
      `Sauvegarde chargée avec pertes (copie brute dans « ${BACKUP_STORAGE_KEY} ») : ${issues.join(' ; ')}`,
    );
    await writeRaw(BACKUP_STORAGE_KEY, raw);
  }
  return state;
}

/** Écrit la sauvegarde ; ne rejette jamais (échecs journalisés, l'état en mémoire fait foi). */
export async function saveState(state: MiaSaveState): Promise<void> {
  let json: string;
  try {
    json = JSON.stringify(state);
  } catch (error) {
    warn('Sauvegarde impossible à sérialiser :', error);
    return;
  }
  await writeRaw(STORAGE_KEY, json);
}

/** JSON indenté : fichier de sauvegarde lisible. */
export function exportSaveJson(state: MiaSaveState): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Importe une sauvegarde exportée : remplace profils et profil actif, conserve les réglages de
 * l'appareil (`DeviceSettings`), enregistre et renvoie le nouvel état. Lève `SaveImportError` si
 * le fichier n'est pas une sauvegarde Mia utilisable.
 */
export async function importSaveJson(json: string): Promise<MiaSaveState> {
  const result = parseBackupJson(json);
  if (!result.ok) throw new SaveImportError(result);
  if (result.issues.length > 0) {
    warn(`Sauvegarde importée avec pertes : ${result.issues.join(' ; ')}`);
  }
  const { settings } = await loadSaveState();
  const state: MiaSaveState = { ...result.state, settings };
  await saveState(state);
  return state;
}

/**
 * Demande au navigateur de ne pas évincer les données (PWA). Web uniquement, sans effet si la
 * persistance est déjà acquise ; Firefox peut afficher une demande d'autorisation.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (isNativePlatform()) return false;
  const storage = navigator.storage as PersistentStorageApi | undefined;
  if (!storage?.persist) return false;
  try {
    if (await storage.persisted?.()) return true;
    return await storage.persist();
  } catch (error) {
    warn('Demande de stockage persistant impossible :', error);
    return false;
  }
}
