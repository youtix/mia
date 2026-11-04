import type { MiaSaveState } from '@/types/mia';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { BACKUP_STORAGE_KEY, createDefaultSaveState, STORAGE_KEY } from './default-state';
import {
  importFailure,
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
 * Natif : marque du miroir qui a reçu une écriture refusée par Preferences, plus récent qu'elle. Elle
 * porte l'empreinte de ce miroir-là : réécrit depuis, il n'est plus en avance.
 */
const MIRROR_AHEAD_KEY = `${STORAGE_KEY}_mirror_ahead`;

/** Empreinte courte d'une chaîne (FNV-1a, 32 bits). */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Natif : Preferences n'a pas pu être lue au chargement, sans miroir pour la remplacer. La sauvegarde
 * qu'elle contient peut-être n'est jamais écrasée : cette session n'écrit que le miroir, et le
 * lancement suivant relit Preferences.
 */
let isPreferencesUnread = false;

type PreferencesRead = { ok: true; value: string | null } | { ok: false };

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

/** `false` si l'écriture a échoué (journalisée). */
function writeLocal(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    warn(`Écriture locale de « ${key} » impossible :`, error);
    return false;
  }
}

function removeLocal(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    warn(`Suppression locale de « ${key} » impossible :`, error);
  }
}

/** Distingue une clé absente (`value: null`) d'une lecture en échec (journalisée). */
async function readPreferences(key: string): Promise<PreferencesRead> {
  try {
    return { ok: true, value: (await Preferences.get({ key })).value };
  } catch (error) {
    warn(`Lecture de « ${key} » dans Preferences impossible :`, error);
    return { ok: false };
  }
}

/** JSON illisible ou non-objet : sa lecture ne donnerait que l'état par défaut. */
function isUnreadableSave(raw: string): boolean {
  try {
    const data: unknown = JSON.parse(raw);
    return typeof data !== 'object' || data === null || Array.isArray(data);
  } catch {
    return true;
  }
}

/**
 * Natif : Preferences d'abord, miroir si vide ou en échec ; un miroir différent est réparé, sauf s'il
 * est plus récent (écriture refusée par Preferences) ou si lui seul est lisible : c'est alors
 * Preferences qui est réparée, la chaîne illisible gardée dans la copie de secours.
 */
async function readSaveRaw(): Promise<string | null> {
  const mirror = readLocal(STORAGE_KEY);
  if (!isNativePlatform()) return mirror;
  const read = await readPreferences(STORAGE_KEY);
  isPreferencesUnread = !read.ok && mirror === null;
  if (!read.ok || read.value === null) return mirror;
  const { value } = read;
  if (value === mirror) return value;
  if (mirror !== null && readLocal(MIRROR_AHEAD_KEY) === fingerprint(mirror)) {
    await writeRaw(STORAGE_KEY, mirror);
    return mirror;
  }
  if (mirror !== null && isUnreadableSave(value) && !isUnreadableSave(mirror)) {
    warn(
      `Sauvegarde illisible dans Preferences, remplacée par le miroir (copie brute dans « ${BACKUP_STORAGE_KEY} »)`,
    );
    await writeRaw(BACKUP_STORAGE_KEY, value);
    await writeRaw(STORAGE_KEY, mirror);
    return mirror;
  }
  writeLocal(STORAGE_KEY, value);
  return value;
}

/**
 * Natif : Preferences puis miroir (un arrêt entre les deux laisse la source de vérité à jour).
 * `true` si la source de vérité a été écrite ; un échec du seul miroir est sans conséquence. Une
 * écriture de la sauvegarde refusée par Preferences marque le miroir, plus récent qu'elle, jusqu'à
 * la suivante réussie.
 */
async function writeRaw(key: string, value: string): Promise<boolean> {
  if (!isNativePlatform()) return writeLocal(key, value);
  const isSave = key === STORAGE_KEY;
  if (isSave && isPreferencesUnread) {
    writeLocal(key, value);
    return false;
  }
  let isWritten = true;
  try {
    await Preferences.set({ key, value });
  } catch (error) {
    warn(`Écriture de « ${key} » dans Preferences impossible :`, error);
    isWritten = false;
  }
  const isMirrored = writeLocal(key, value);
  if (isSave && !isWritten && isMirrored) writeLocal(MIRROR_AHEAD_KEY, fingerprint(value));
  else if (isSave && isWritten && readLocal(MIRROR_AHEAD_KEY) !== null) {
    removeLocal(MIRROR_AHEAD_KEY);
  }
  return isWritten;
}

/** Retire une clé de chaque support ; ne rejette jamais (échecs journalisés). */
async function removeRaw(key: string): Promise<void> {
  if (isNativePlatform()) {
    try {
      await Preferences.remove({ key });
    } catch (error) {
      warn(`Suppression de « ${key} » dans Preferences impossible :`, error);
    }
  }
  removeLocal(key);
}

/**
 * Sauvegarde telle qu'elle est maintenant dans `localStorage`, après l'écriture d'un autre onglet :
 * l'événement `storage` arrive parfois après une écriture plus récente (de cet onglet ou d'un
 * troisième), et la valeur qu'il transporte ferait alors diverger les onglets.
 */
export function readStoredSaveRaw(): string | null {
  return readLocal(STORAGE_KEY);
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

/**
 * Écrit la sauvegarde ; ne rejette jamais (échecs journalisés, l'état en mémoire fait foi). `true` si
 * la source de vérité a été écrite : seul l'import s'en sert, la partie, elle, continue sans.
 */
export async function saveState(state: MiaSaveState): Promise<boolean> {
  let json: string;
  try {
    json = JSON.stringify(state);
  } catch (error) {
    warn('Sauvegarde impossible à sérialiser :', error);
    return false;
  }
  return writeRaw(STORAGE_KEY, json);
}

/** Efface la copie de secours : anciens prénoms et étoiles n'ont plus à rester sur l'appareil. */
export function removeSaveBackup(): Promise<void> {
  return removeRaw(BACKUP_STORAGE_KEY);
}

/** JSON indenté : fichier de sauvegarde lisible. */
export function exportSaveJson(state: MiaSaveState): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Importe une sauvegarde exportée : remplace profils et profil actif, conserve les réglages de
 * l'appareil (`DeviceSettings`), enregistre et renvoie le nouvel état. Lève `SaveImportError` si
 * le fichier n'est pas une sauvegarde Mia utilisable ou s'il n'a pas pu être enregistré.
 */
export async function importSaveJson(json: string): Promise<MiaSaveState> {
  const result = parseBackupJson(json);
  if (!result.ok) throw new SaveImportError(result);
  if (result.issues.length > 0) {
    warn(`Sauvegarde importée avec pertes : ${result.issues.join(' ; ')}`);
  }
  const { settings } = await loadSaveState();
  const state: MiaSaveState = { ...result.state, settings };
  if (!(await saveState(state))) throw new SaveImportError(importFailure('write_failed'));
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
