import {
  TIME_FACTORS,
  type DeviceSettings,
  type GameId,
  type GameProgress,
  type LevelCompletion,
  type MemoryGameSettings,
  type MiaSaveState,
  type ProfileGameSettings,
  type TimeFactor,
  type TvModeOverride,
  type UserProfile,
} from '@/types/mia';
import {
  createDefaultGameSettings,
  createDefaultSaveState,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DEVICE_SETTINGS,
  DEFAULT_MEMORY_GAME_SETTINGS,
} from './default-state';

type UnknownRecord = Record<string, unknown>;

/** Transforme une sauvegarde vN (objet JSON brut) en vN+1. */
export type SaveMigration = (data: UnknownRecord) => UnknownRecord;

/**
 * `MIGRATIONS[n]` transforme une sauvegarde vN en vN+1. La v1 est la première version publiée :
 * aucune migration. Pour une v2 : passer `MiaSaveState['schemaVersion']` à 2 et ajouter ici
 * `1: (data) => ({ ...data, schemaVersion: 2, … })`.
 */
export const MIGRATIONS: Readonly<Record<number, SaveMigration>> = {};

/** Version attribuée à une sauvegarde sans `schemaVersion` exploitable. */
const FIRST_SCHEMA_VERSION = 1;

export interface ParseOptions {
  /** Registre des migrations (défaut : `MIGRATIONS`), injectable pour tester une migration */
  migrations?: Readonly<Record<number, SaveMigration>>;
}

/** Résultat détaillé d'une lecture : `issues` liste les pertes (vide si la lecture est fidèle). */
export interface SaveParseReport {
  state: MiaSaveState;
  issues: string[];
}

export type ImportFailureReason =
  'invalid_json' | 'not_a_mia_save' | 'newer_version' | 'no_valid_profile';

export const IMPORT_FAILURE_MESSAGES: Readonly<Record<ImportFailureReason, string>> = {
  invalid_json: 'Fichier illisible : ce n’est pas une sauvegarde Mia.',
  not_a_mia_save: 'Ce fichier n’est pas une sauvegarde Mia.',
  newer_version:
    'Cette sauvegarde provient d’une version plus récente de Mia : mettez l’application à jour.',
  no_valid_profile: 'Cette sauvegarde est endommagée : aucun profil n’a pu être récupéré.',
};

export interface ImportFailure {
  ok: false;
  reason: ImportFailureReason;
  /** Message français prêt à afficher */
  message: string;
}

export interface ImportedSave {
  ok: true;
  state: MiaSaveState;
  /** Entrées écartées ou réparées pendant l'import */
  issues: string[];
}

export type BackupParseResult = ImportedSave | ImportFailure;

/** Tables exhaustives (le compilateur exige chaque valeur du type) pour valider les chaînes lues. */
const KNOWN_GAMES: Record<GameId, true> = { memory: true, 'traffic-jam': true, patterns: true };
const TV_MODE_OVERRIDES: Record<TvModeOverride, true> = {
  auto: true,
  always_tv: true,
  always_touch: true,
};

const INVALID_JSON = Symbol('invalid-json');
const BYTE_ORDER_MARK = '\uFEFF';

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** `Infinity` et `NaN` sont exclus : JSON les sérialise en `null`. */
function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isKnownGameId(value: string): value is GameId {
  return Object.hasOwn(KNOWN_GAMES, value);
}

function isTvModeOverride(value: unknown): value is TvModeOverride {
  return typeof value === 'string' && Object.hasOwn(TV_MODE_OVERRIDES, value);
}

function isTimeFactor(value: unknown): value is TimeFactor {
  return typeof value === 'number' && (TIME_FACTORS as readonly number[]).includes(value);
}

/** Les fichiers enregistrés par certains éditeurs (Bloc-notes) commencent par un BOM. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text) as unknown;
  } catch {
    return INVALID_JSON;
  }
}

function readSchemaVersion(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Applique `migrations[n]` de `fromVersion` à `targetVersion` ; lève si une étape manque. */
export function migrateSaveData(
  data: UnknownRecord,
  fromVersion: number,
  migrations: Readonly<Record<number, SaveMigration>> = MIGRATIONS,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): UnknownRecord {
  let migrated = data;
  for (let version = fromVersion; version < targetVersion; version += 1) {
    const step = `v${String(version)} → v${String(version + 1)}`;
    const migrate = migrations[version];
    if (!migrate) throw new Error(`Migration ${step} manquante.`);
    migrated = migrate(migrated);
    if (!isRecord(migrated)) throw new Error(`La migration ${step} n’a pas renvoyé d’objet.`);
  }
  return migrated;
}

function sanitizeSettings(value: unknown, issues: string[]): DeviceSettings {
  if (!isRecord(value)) {
    issues.push('réglages illisibles, valeurs par défaut');
    return { ...DEFAULT_DEVICE_SETTINGS };
  }
  const { soundEnabled, highContrastMode, tvModeOverride } = value;
  const settings: DeviceSettings = {
    soundEnabled:
      typeof soundEnabled === 'boolean' ? soundEnabled : DEFAULT_DEVICE_SETTINGS.soundEnabled,
    highContrastMode:
      typeof highContrastMode === 'boolean'
        ? highContrastMode
        : DEFAULT_DEVICE_SETTINGS.highContrastMode,
    tvModeOverride: isTvModeOverride(tvModeOverride)
      ? tvModeOverride
      : DEFAULT_DEVICE_SETTINGS.tvModeOverride,
  };
  for (const key of Object.keys(settings) as (keyof DeviceSettings)[]) {
    if (settings[key] !== value[key]) issues.push(`réglage « ${key} » invalide, valeur par défaut`);
  }
  return settings;
}

function sanitizeLevel(
  levelId: string,
  value: unknown,
  path: string,
  issues: string[],
): LevelCompletion | null {
  if (levelId === '' || !isRecord(value)) return null;
  const { completed, isPerfect, bestMoves, bestTimeSeconds, timesPlayed, completedAt } = value;
  if (
    typeof completed !== 'boolean' ||
    typeof isPerfect !== 'boolean' ||
    !isNonNegativeNumber(bestMoves) ||
    !isNonNegativeNumber(bestTimeSeconds) ||
    !isNonNegativeNumber(timesPlayed) ||
    typeof completedAt !== 'string'
  ) {
    return null;
  }
  if (value.levelId !== levelId) issues.push(`niveau « ${path} » : levelId réaligné sur sa clé`);
  return { levelId, completed, isPerfect, bestMoves, bestTimeSeconds, timesPlayed, completedAt };
}

/** `Object.fromEntries` crée des propriétés propres : une clé « __proto__ » reste inoffensive. */
function sanitizeLevels(
  value: unknown,
  path: string,
  issues: string[],
): Record<string, LevelCompletion> {
  if (!isRecord(value)) {
    issues.push(`niveaux de « ${path} » illisibles`);
    return {};
  }
  const levels: [string, LevelCompletion][] = [];
  for (const [levelId, entry] of Object.entries(value)) {
    const levelPath = `${path}/${levelId}`;
    const level = sanitizeLevel(levelId, entry, levelPath, issues);
    if (level) levels.push([levelId, level]);
    else issues.push(`niveau « ${levelPath} » invalide, écarté`);
  }
  return Object.fromEntries(levels);
}

function sanitizeGameProgress(
  gameId: GameId,
  value: unknown,
  path: string,
  issues: string[],
): GameProgress | null {
  if (!isRecord(value)) return null;
  if (value.gameId !== gameId) issues.push(`progression « ${path} » : gameId réaligné sur sa clé`);
  return {
    gameId,
    levels: sanitizeLevels(value.levels, path, issues),
    lastPlayedLevelId: sanitizeLastPlayedLevelId(value.lastPlayedLevelId, path, issues),
  };
}

function sanitizeLastPlayedLevelId(value: unknown, path: string, issues: string[]): string | null {
  if (value === null || isNonEmptyString(value)) return value;
  issues.push(`progression « ${path} » : lastPlayedLevelId invalide, remis à null`);
  return null;
}

function sanitizeGamesProgress(
  value: unknown,
  profileId: string,
  issues: string[],
): Record<string, GameProgress> {
  if (!isRecord(value)) {
    issues.push(`progression du profil « ${profileId} » illisible`);
    return {};
  }
  const games: [string, GameProgress][] = [];
  for (const [gameId, entry] of Object.entries(value)) {
    const path = `${profileId}/${gameId}`;
    if (!isKnownGameId(gameId)) {
      issues.push(`jeu inconnu « ${path} », écarté`);
      continue;
    }
    const progress = sanitizeGameProgress(gameId, entry, path, issues);
    if (progress) games.push([gameId, progress]);
    else issues.push(`progression « ${path} » invalide, écartée`);
  }
  return Object.fromEntries(games);
}

/**
 * Réglages de Memory d'un profil (FEAT-19) : réparés champ par champ, comme ceux de l'appareil.
 * Absents (sauvegarde d'une version antérieure), ils valent les défauts sans perte signalée.
 */
function sanitizeMemorySettings(
  value: unknown,
  profileId: string,
  issues: string[],
): MemoryGameSettings {
  if (value === undefined) return { ...DEFAULT_MEMORY_GAME_SETTINGS };
  if (!isRecord(value)) {
    issues.push(`réglages Memory du profil « ${profileId} » illisibles, valeurs par défaut`);
    return { ...DEFAULT_MEMORY_GAME_SETTINGS };
  }
  const { previewFactor, mismatchFactor } = value;
  const settings: MemoryGameSettings = {
    previewFactor: isTimeFactor(previewFactor)
      ? previewFactor
      : DEFAULT_MEMORY_GAME_SETTINGS.previewFactor,
    mismatchFactor: isTimeFactor(mismatchFactor)
      ? mismatchFactor
      : DEFAULT_MEMORY_GAME_SETTINGS.mismatchFactor,
  };
  for (const key of Object.keys(settings) as (keyof MemoryGameSettings)[]) {
    if (settings[key] !== value[key]) {
      issues.push(
        `réglage Memory « ${key} » du profil « ${profileId} » invalide, valeur par défaut`,
      );
    }
  }
  return settings;
}

/** Réglages de jeu d'un profil : absents, valeurs par défaut sans perte ; illisibles, avec perte. */
function sanitizeGameSettings(
  value: unknown,
  profileId: string,
  issues: string[],
): ProfileGameSettings {
  if (value === undefined) return createDefaultGameSettings();
  if (!isRecord(value)) {
    issues.push(`réglages de jeu du profil « ${profileId} » illisibles, valeurs par défaut`);
    return createDefaultGameSettings();
  }
  return { memory: sanitizeMemorySettings(value.memory, profileId, issues) };
}

function sanitizeProfile(value: unknown, issues: string[]): UserProfile | null {
  if (!isRecord(value)) return null;
  const { id, name, avatarId, createdAt } = value;
  if (
    !isNonEmptyString(id) ||
    typeof name !== 'string' ||
    typeof avatarId !== 'string' ||
    typeof createdAt !== 'string'
  ) {
    return null;
  }
  return {
    id,
    name,
    avatarId,
    createdAt,
    gamesProgress: sanitizeGamesProgress(value.gamesProgress, id, issues),
    gameSettings: sanitizeGameSettings(value.gameSettings, id, issues),
  };
}

function sanitizeProfiles(value: unknown, issues: string[]): UserProfile[] {
  if (!Array.isArray(value)) {
    issues.push('liste des profils illisible');
    return [];
  }
  const entries: unknown[] = value;
  const profiles: UserProfile[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const profile = sanitizeProfile(entry, issues);
    if (!profile) {
      issues.push(`profil n° ${String(index + 1)} invalide, écarté`);
    } else if (ids.has(profile.id)) {
      issues.push(`profil « ${profile.id} » en double, écarté`);
    } else {
      ids.add(profile.id);
      profiles.push(profile);
    }
  }
  return profiles;
}

function sanitizeActiveProfileId(
  value: unknown,
  profiles: readonly UserProfile[],
  issues: string[],
): string | null {
  if (value === null) return null;
  if (typeof value === 'string' && profiles.some((profile) => profile.id === value)) return value;
  issues.push('profil actif introuvable, aucun profil actif');
  return null;
}

/**
 * Réparation granulaire : les entrées invalides sont écartées au plus petit niveau (niveau, jeu,
 * profil), les conteneurs illisibles vidés, les réglages réparés champ par champ ; aucune valeur
 * n'est inventée et les champs inconnus sont retirés.
 */
function sanitizeSaveState(data: UnknownRecord, issues: string[]): MiaSaveState {
  const profiles = sanitizeProfiles(data.profiles, issues);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeProfileId: sanitizeActiveProfileId(data.activeProfileId, profiles, issues),
    profiles,
    settings: sanitizeSettings(data.settings, issues),
  };
}

function lostSave(issues: string[]): SaveParseReport {
  return { state: createDefaultSaveState(), issues };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Lecture détaillée d'une sauvegarde stockée. Absente ou vide : état par défaut, sans perte.
 * Illisible : état par défaut, avec perte. Version plus récente : lecture au mieux comme
 * version courante, avec perte. Ne lève jamais d'exception.
 */
export function parseSaveStateReport(
  raw: string | null,
  options: ParseOptions = {},
): SaveParseReport {
  if (raw === null || raw.trim() === '') return lostSave([]);
  const data = parseJson(raw);
  if (data === INVALID_JSON) return lostSave(['sauvegarde illisible (JSON invalide)']);
  if (!isRecord(data)) return lostSave(['sauvegarde illisible (objet JSON attendu)']);

  const issues: string[] = [];
  let version = readSchemaVersion(data.schemaVersion);
  if (version === null) {
    issues.push(
      `version de schéma absente ou invalide, lue comme v${String(FIRST_SCHEMA_VERSION)}`,
    );
    version = FIRST_SCHEMA_VERSION;
  } else if (version > CURRENT_SCHEMA_VERSION) {
    issues.push(
      `version ${String(version)} plus récente que la v${String(CURRENT_SCHEMA_VERSION)} prise en charge, lecture partielle`,
    );
    version = CURRENT_SCHEMA_VERSION;
  }

  try {
    const migrated = migrateSaveData(data, version, options.migrations);
    return { state: sanitizeSaveState(migrated, issues), issues };
  } catch (error) {
    return lostSave([...issues, `migration impossible : ${describeError(error)}`]);
  }
}

/** Lecture tolérante (§3.2) : ne lève jamais d'exception, état par défaut si absente ou illisible. */
export function parseAndMigrateSaveState(raw: string | null, options?: ParseOptions): MiaSaveState {
  return parseSaveStateReport(raw, options).state;
}

function importFailure(reason: ImportFailureReason): ImportFailure {
  return { ok: false, reason, message: IMPORT_FAILURE_MESSAGES[reason] };
}

/**
 * Validation d'un fichier importé : JSON, objet avec `schemaVersion` entière au plus égale à la
 * version courante, migration, puis tableau `profiles` et objet `settings` ; enfin réparation
 * granulaire. Un tableau `profiles` non vide dont aucun profil n'est valide est refusé.
 */
export function parseBackupJson(json: string, options: ParseOptions = {}): BackupParseResult {
  const data = parseJson(json);
  if (data === INVALID_JSON) return importFailure('invalid_json');
  if (!isRecord(data)) return importFailure('not_a_mia_save');
  const version = readSchemaVersion(data.schemaVersion);
  if (version === null) return importFailure('not_a_mia_save');
  if (version > CURRENT_SCHEMA_VERSION) return importFailure('newer_version');

  let migrated: UnknownRecord;
  try {
    migrated = migrateSaveData(data, version, options.migrations);
  } catch {
    return importFailure('not_a_mia_save');
  }
  const { profiles } = migrated;
  if (!Array.isArray(profiles) || !isRecord(migrated.settings)) {
    return importFailure('not_a_mia_save');
  }

  const issues: string[] = [];
  const state = sanitizeSaveState(migrated, issues);
  if (profiles.length > 0 && state.profiles.length === 0) return importFailure('no_valid_profile');
  return { ok: true, state, issues };
}
