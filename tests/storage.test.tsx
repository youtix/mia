import {
  applyHighContrastMode,
  applyTvModeOverride,
  BACKUP_STORAGE_KEY,
  createDefaultSaveState,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DEVICE_SETTINGS,
  exportSaveJson,
  IMPORT_FAILURE_MESSAGES,
  importSaveJson,
  loadSaveState,
  migrateSaveData,
  parseAndMigrateSaveState,
  parseBackupJson,
  parseSaveStateReport,
  requestPersistentStorage,
  SaveImportError,
  saveState,
  STORAGE_KEY,
  StorageProvider,
  TV_MODE_BOOTSTRAP_SCRIPT,
  useMiaStorage,
  type ImportFailureReason,
  type ImportResult,
  type SaveMigration,
} from '@/core/storage';
import type {
  DeviceSettings,
  LevelCompletion,
  MiaSaveState,
  TvModeOverride,
  UserProfile,
} from '@/types/mia';
import { act, renderHook, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

/** Plateforme simulée : `true` pour l'APK Capacitor (Preferences = SharedPreferences). */
const platform = vi.hoisted(() => ({ native: false }));

/** Preferences natif simulé par une `Map` ; `mockReset()` restaure ces implémentations. */
const preferences = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    get: vi.fn(({ key }: { key: string }) => Promise.resolve({ value: values.get(key) ?? null })),
    set: vi.fn(({ key, value }: { key: string; value: string }) => {
      values.set(key, value);
      return Promise.resolve();
    }),
  };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform.native },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: preferences.get, set: preferences.set },
}));

const CREATED_AT = '2026-10-01T09:00:00.000Z';
const COMPLETED_AT = '2026-10-28T10:00:00.000Z';

function level(levelId: string, overrides: Partial<LevelCompletion> = {}): LevelCompletion {
  return {
    levelId,
    completed: true,
    isPerfect: false,
    bestMoves: 12,
    bestTimeSeconds: 30.5,
    timesPlayed: 1,
    completedAt: COMPLETED_AT,
    ...overrides,
  };
}

function profile(id: string, overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id,
    name: `Joueur ${id}`,
    avatarId: 'fox',
    createdAt: CREATED_AT,
    gamesProgress: {
      memory: {
        gameId: 'memory',
        levels: { 'mem-001': level('mem-001') },
        lastPlayedLevelId: 'mem-001',
      },
    },
    ...overrides,
  };
}

/** Sauvegarde valide : deux profils, le premier actif. */
function sampleSave(overrides: Partial<MiaSaveState> = {}): MiaSaveState {
  return {
    ...createDefaultSaveState(),
    activeProfileId: 'p1',
    profiles: [profile('p1'), profile('p2')],
    ...overrides,
  };
}

const toJson = (value: unknown): string => JSON.stringify(value);

/** Sauvegarde brute aux types relâchés, pour simuler une corruption. */
function rawSave(profiles: unknown[], extra: Record<string, unknown> = {}): string {
  return toJson({
    schemaVersion: 1,
    activeProfileId: null,
    profiles,
    settings: DEFAULT_DEVICE_SETTINGS,
    ...extra,
  });
}

function rawProfile(
  id: unknown,
  gamesProgress: unknown = {},
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { id, name: 'Mia', avatarId: 'fox', createdAt: CREATED_AT, gamesProgress, ...extra };
}

/** Profil produit par `rawProfile(id)` après lecture. */
function miaProfile(id: string): UserProfile {
  return { id, name: 'Mia', avatarId: 'fox', createdAt: CREATED_AT, gamesProgress: {} };
}

function withTvMode(tvModeOverride: TvModeOverride): MiaSaveState {
  return { ...createDefaultSaveState(), settings: { ...DEFAULT_DEVICE_SETTINGS, tvModeOverride } };
}

function withContrast(highContrastMode: boolean): MiaSaveState {
  return {
    ...createDefaultSaveState(),
    settings: { ...DEFAULT_DEVICE_SETTINGS, highContrastMode },
  };
}

function storeLocally(value: unknown, key = STORAGE_KEY): void {
  localStorage.setItem(key, typeof value === 'string' ? value : toJson(value));
}

function readLocally(key = STORAGE_KEY): unknown {
  const raw = localStorage.getItem(key);
  return raw === null ? null : (JSON.parse(raw) as unknown);
}

let warnSpy: MockInstance<typeof console.warn>;

/** Avertissements `console.warn` aplatis en texte. */
function warnings(): string[] {
  return warnSpy.mock.calls.map((args) => args.map(String).join(' '));
}

function stubStorageManager(manager: Partial<Pick<StorageManager, 'persist' | 'persisted'>>): void {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: manager });
}

/** Exécute le script inline du <head> comme le navigateur (jsdom : `runScripts: 'dangerously'`). */
function runBootstrapScript(): void {
  const script = document.createElement('script');
  script.textContent = TV_MODE_BOOTSTRAP_SCRIPT;
  document.head.append(script);
  script.remove();
}

/** Laisse s'achever les promesses en cours (chargement, écritures). */
async function flushAsync(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      }),
  );
}

/** Chargement natif suspendu jusqu'à l'appel de la fonction renvoyée. */
function holdNativeLoad(): (raw: string | null) => void {
  platform.native = true;
  let finish: (raw: string | null) => void = () => undefined;
  preferences.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = (raw) => {
          resolve({ value: raw });
        };
      }),
  );
  return (raw) => {
    finish(raw);
  };
}

function renderStorage() {
  return renderHook(() => useMiaStorage(), { wrapper: StorageProvider });
}

function Probe() {
  const { isLoaded, state } = useMiaStorage();
  return (
    <p>{`${isLoaded ? 'chargé' : 'non chargé'}, ${String(state.profiles.length)} profil(s)`}</p>
  );
}

async function renderLoadedStorage() {
  const view = renderStorage();
  await waitFor(() => {
    expect(view.result.current.isLoaded).toBe(true);
  });
  return view;
}

function dispatchStorageEvent(init: StorageEventInit): void {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { storageArea: localStorage, ...init }));
  });
}

beforeEach(() => {
  platform.native = false;
  preferences.values.clear();
  preferences.get.mockReset();
  preferences.set.mockReset();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute('data-tv');
  document.documentElement.removeAttribute('data-contrast');
  Reflect.deleteProperty(navigator, 'storage');
});

describe('État par défaut', () => {
  it('ne contient aucun profil et des réglages par défaut', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    expect(createDefaultSaveState()).toEqual({
      schemaVersion: 1,
      activeProfileId: null,
      profiles: [],
      settings: { soundEnabled: true, highContrastMode: false, tvModeOverride: 'auto' },
    });
  });

  it('renvoie un nouvel objet à chaque appel', () => {
    const first = createDefaultSaveState();
    first.settings.soundEnabled = false;
    first.profiles.push(profile('p1'));

    expect(createDefaultSaveState().settings.soundEnabled).toBe(true);
    expect(createDefaultSaveState().profiles).toEqual([]);
    expect(DEFAULT_DEVICE_SETTINGS.soundEnabled).toBe(true);
  });
});

describe('parseAndMigrateSaveState', () => {
  it.each([null, '', '   '])('renvoie l’état par défaut, sans perte, pour %j', (raw) => {
    expect(parseSaveStateReport(raw)).toEqual({ state: createDefaultSaveState(), issues: [] });
  });

  it.each(['{"schemaVersion":1,"profiles":[', 'undefined', 'null', '[]', '42', '"texte"'])(
    'résiste à une sauvegarde corrompue sans lever d’exception (%s)',
    (raw) => {
      const report = parseSaveStateReport(raw);

      expect(report.state).toEqual(createDefaultSaveState());
      expect(report.issues).toEqual([expect.stringContaining('illisible')]);
      expect(parseAndMigrateSaveState(raw)).toEqual(createDefaultSaveState());
    },
  );

  it('relit fidèlement une sauvegarde valide', () => {
    const save = sampleSave({
      settings: { soundEnabled: false, highContrastMode: true, tvModeOverride: 'always_tv' },
    });

    expect(parseSaveStateReport(toJson(save))).toEqual({ state: save, issues: [] });
  });

  it('ignore le BOM des fichiers enregistrés par certains éditeurs', () => {
    expect(parseAndMigrateSaveState(`\uFEFF${toJson(sampleSave())}`)).toEqual(sampleSave());
  });
});

describe('Réparation granulaire', () => {
  it('écarte un niveau invalide sans toucher aux autres étoiles du profil', () => {
    const levels = {
      'mem-001': level('mem-001'),
      // Infinity devient null une fois sérialisé en JSON.
      'mem-002': { ...level('mem-002'), bestTimeSeconds: null },
      'mem-003': { ...level('mem-003'), bestMoves: -1 },
      'mem-004': { ...level('mem-004'), timesPlayed: '3' },
      'mem-005': { ...level('mem-005'), completed: 'oui' },
      'mem-006': { ...level('mem-006'), isPerfect: undefined },
      'mem-007': { ...level('mem-007'), completedAt: 1_730_000_000 },
      'mem-008': 'illisible',
      '': level(''),
    };
    const memory = { gameId: 'memory', levels, lastPlayedLevelId: 'mem-001' };

    const report = parseSaveStateReport(rawSave([rawProfile('p1', { memory })]));

    expect(report.state.profiles[0]?.gamesProgress).toEqual({
      memory: {
        gameId: 'memory',
        levels: { 'mem-001': level('mem-001') },
        lastPlayedLevelId: 'mem-001',
      },
    });
    expect(report.issues).toHaveLength(8);
    expect(report.issues).toContain('niveau « p1/memory/mem-002 » invalide, écarté');
    expect(report.issues).toContain('niveau « p1/memory/ » invalide, écarté');
  });

  it('réaligne levelId et gameId sur leur clé', () => {
    const memory = { gameId: 'traffic-jam', levels: { 'mem-002': level('autre') } };

    const report = parseSaveStateReport(
      rawSave([rawProfile('p1', { memory: { ...memory, lastPlayedLevelId: null } })]),
    );

    expect(report.state.profiles[0]?.gamesProgress).toEqual({
      memory: {
        gameId: 'memory',
        levels: { 'mem-002': level('mem-002') },
        lastPlayedLevelId: null,
      },
    });
    expect(report.issues).toEqual([
      'progression « p1/memory » : gameId réaligné sur sa clé',
      'niveau « p1/memory/mem-002 » : levelId réaligné sur sa clé',
    ]);
  });

  it('écarte les jeux inconnus et les progressions illisibles', () => {
    const memory = {
      gameId: 'memory',
      levels: { 'mem-001': level('mem-001') },
      lastPlayedLevelId: 'mem-001',
    };

    const report = parseSaveStateReport(
      rawSave([rawProfile('p1', { memory, chess: memory, 'traffic-jam': 'illisible' })]),
    );

    expect(report.state.profiles[0]?.gamesProgress).toEqual({ memory });
    expect(report.issues).toEqual([
      'jeu inconnu « p1/chess », écarté',
      'progression « p1/traffic-jam » invalide, écartée',
    ]);
  });

  it('vide les conteneurs illisibles et remet à null un dernier niveau invalide', () => {
    const report = parseSaveStateReport(
      rawSave([
        rawProfile('p1', 'illisible'),
        rawProfile('p2', { memory: { gameId: 'memory', levels: [], lastPlayedLevelId: 7 } }),
      ]),
    );

    expect(report.state.profiles.map(({ gamesProgress }) => gamesProgress)).toEqual([
      {},
      { memory: { gameId: 'memory', levels: {}, lastPlayedLevelId: null } },
    ]);
    expect(report.issues).toEqual([
      'progression du profil « p1 » illisible',
      'niveaux de « p2/memory » illisibles',
      'progression « p2/memory » : lastPlayedLevelId invalide, remis à null',
    ]);
    expect(
      parseSaveStateReport(toJson({ ...createDefaultSaveState(), profiles: {} })).issues,
    ).toEqual(['liste des profils illisible']);
  });

  it('écarte les profils invalides et les doublons (le premier gagne)', () => {
    const report = parseSaveStateReport(
      rawSave(
        [
          rawProfile('p1'),
          rawProfile(''),
          rawProfile('p3', {}, { name: 7 }),
          rawProfile('p4', {}, { createdAt: undefined }),
          'illisible',
          rawProfile('p1', {}, { name: 'Copie' }),
        ],
        { activeProfileId: 'p1' },
      ),
    );

    expect(report.state.profiles).toEqual([miaProfile('p1')]);
    expect(report.state.activeProfileId).toBe('p1');
    expect(report.issues).toEqual([
      'profil n° 2 invalide, écarté',
      'profil n° 3 invalide, écarté',
      'profil n° 4 invalide, écarté',
      'profil n° 5 invalide, écarté',
      'profil « p1 » en double, écarté',
    ]);
  });

  it('remet à null un profil actif introuvable', () => {
    const lostActive = ['profil actif introuvable, aucun profil actif'];

    expect(
      parseSaveStateReport(rawSave([rawProfile('p1')], { activeProfileId: 'fantome' })),
    ).toEqual({
      state: { ...createDefaultSaveState(), profiles: [miaProfile('p1')] },
      issues: lostActive,
    });
    expect(parseSaveStateReport(rawSave([], { activeProfileId: 42 })).issues).toEqual(lostActive);
  });

  it('répare les réglages champ par champ', () => {
    const report = parseSaveStateReport(
      rawSave([], {
        settings: { soundEnabled: false, highContrastMode: 'oui', tvModeOverride: 'toujours' },
      }),
    );

    expect(report.state.settings).toEqual({
      soundEnabled: false,
      highContrastMode: false,
      tvModeOverride: 'auto',
    });
    expect(report.issues).toEqual([
      'réglage « highContrastMode » invalide, valeur par défaut',
      'réglage « tvModeOverride » invalide, valeur par défaut',
    ]);
    expect(parseSaveStateReport(rawSave([], { settings: 'illisible' }))).toEqual({
      state: createDefaultSaveState(),
      issues: ['réglages illisibles, valeurs par défaut'],
    });
  });

  it('retire les champs inconnus sans les signaler', () => {
    const save = sampleSave();
    const withExtras = {
      ...save,
      cloudSync: true,
      settings: { ...save.settings, volume: 3 },
      profiles: save.profiles.map((entry) => ({
        ...entry,
        color: 'red',
        gamesProgress: {
          memory: {
            ...entry.gamesProgress.memory,
            hint: 1,
            levels: { 'mem-001': { ...level('mem-001'), stars: 3 } },
          },
        },
      })),
    };

    expect(parseSaveStateReport(toJson(withExtras))).toEqual({ state: save, issues: [] });
  });

  it('neutralise une clé « __proto__ » (aucune pollution de prototype)', () => {
    const memory = `{"gameId":"memory","lastPlayedLevelId":null,"levels":{"__proto__":${toJson(level('__proto__'))}}}`;
    const raw = rawSave([rawProfile('p1')]).replace(
      '"gamesProgress":{}',
      `"gamesProgress":{"__proto__":{"gameId":"memory"},"memory":${memory}}`,
    );

    const { state, issues } = parseSaveStateReport(raw);
    const progress = state.profiles[0]?.gamesProgress ?? {};
    const levels = progress.memory?.levels ?? {};

    expect(Object.keys(progress)).toEqual(['memory']);
    expect(issues).toEqual(['jeu inconnu « p1/__proto__ », écarté']);
    expect(Object.getPrototypeOf(levels)).toBe(Object.prototype);
    expect(Object.hasOwn(levels, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).completed).toBeUndefined();
  });
});

describe('Versions de schéma et migrations', () => {
  it('lit une sauvegarde sans version comme une v1, avec perte signalée', () => {
    const report = parseSaveStateReport(toJson({ ...sampleSave(), schemaVersion: undefined }));

    expect(report.state).toEqual(sampleSave());
    expect(report.issues).toEqual(['version de schéma absente ou invalide, lue comme v1']);
  });

  it('lit au mieux une sauvegarde d’une version plus récente, avec perte signalée', () => {
    const report = parseSaveStateReport(
      toJson({ ...sampleSave(), schemaVersion: 7, cloudSync: true }),
    );

    expect(report.state).toEqual(sampleSave());
    expect(report.issues).toEqual([
      'version 7 plus récente que la v1 prise en charge, lecture partielle',
    ]);
  });

  it('enchaîne les migrations dans l’ordre jusqu’à la version cible', () => {
    const steps: string[] = [];
    const migrations: Record<number, SaveMigration> = {
      1: (data) => {
        steps.push('v1 → v2');
        return { ...data, schemaVersion: 2, players: data.profiles };
      },
      2: (data) => {
        steps.push('v2 → v3');
        return { ...data, schemaVersion: 3 };
      },
    };

    expect(migrateSaveData({ schemaVersion: 1, profiles: [] }, 1, migrations, 3)).toEqual({
      schemaVersion: 3,
      profiles: [],
      players: [],
    });
    expect(steps).toEqual(['v1 → v2', 'v2 → v3']);
    expect(migrateSaveData({ schemaVersion: 1 }, 1)).toEqual({ schemaVersion: 1 });
  });

  it('refuse une migration manquante ou qui ne renvoie pas d’objet', () => {
    const broken: SaveMigration = () => null as unknown as Record<string, unknown>;

    expect(() => migrateSaveData({}, 1, {}, 2)).toThrow('Migration v1 → v2 manquante.');
    expect(() => migrateSaveData({}, 1, { 1: broken }, 2)).toThrow(
      'La migration v1 → v2 n’a pas renvoyé d’objet.',
    );
  });

  it('applique les migrations enregistrées avant la réparation', () => {
    const legacy = {
      ...sampleSave(),
      schemaVersion: 0,
      profiles: undefined,
      players: [profile('p1')],
    };
    const migrations: Record<number, SaveMigration> = {
      0: ({ players, ...data }) => ({ ...data, schemaVersion: 1, profiles: players }),
    };

    expect(parseAndMigrateSaveState(toJson(legacy), { migrations })).toEqual(
      sampleSave({ profiles: [profile('p1')] }),
    );
  });

  it('repart de l’état par défaut si une migration manque ou échoue', () => {
    const raise = (value: unknown): never => {
      throw value;
    };
    const legacy = toJson({ ...sampleSave(), schemaVersion: 0 });

    expect(parseSaveStateReport(legacy)).toEqual({
      state: createDefaultSaveState(),
      issues: ['migration impossible : Migration v0 → v1 manquante.'],
    });
    expect(
      parseSaveStateReport(legacy, { migrations: { 0: () => raise('format inconnu') } }).issues,
    ).toEqual(['migration impossible : format inconnu']);
  });
});

describe('parseBackupJson (import)', () => {
  it.each<[string, string, ImportFailureReason]>([
    ['du texte', 'pas du JSON', 'invalid_json'],
    ['un tableau', '[]', 'not_a_mia_save'],
    ['un objet sans version', toJson({ profiles: [], settings: {} }), 'not_a_mia_save'],
    [
      'une version texte',
      toJson({ schemaVersion: '1', profiles: [], settings: {} }),
      'not_a_mia_save',
    ],
    ['un objet sans profils', toJson({ schemaVersion: 1, settings: {} }), 'not_a_mia_save'],
    [
      'des profils hors tableau',
      toJson({ schemaVersion: 1, profiles: {}, settings: {} }),
      'not_a_mia_save',
    ],
    ['un objet sans réglages', toJson({ schemaVersion: 1, profiles: [] }), 'not_a_mia_save'],
    [
      'une version sans migration',
      toJson({ schemaVersion: 0, profiles: [], settings: {} }),
      'not_a_mia_save',
    ],
    ['une version plus récente', toJson({ ...sampleSave(), schemaVersion: 2 }), 'newer_version'],
    [
      'aucun profil valide',
      toJson({ schemaVersion: 1, profiles: [{ id: '' }], settings: {} }),
      'no_valid_profile',
    ],
  ])('refuse %s avec un message explicite', (_label, json, reason) => {
    expect(parseBackupJson(json)).toEqual({
      ok: false,
      reason,
      message: IMPORT_FAILURE_MESSAGES[reason],
    });
  });

  it('accepte une sauvegarde Mia et signale les entrées écartées', () => {
    expect(
      parseBackupJson(rawSave([rawProfile('p1'), 'illisible'], { activeProfileId: 'p1' })),
    ).toEqual({
      ok: true,
      state: { ...createDefaultSaveState(), activeProfileId: 'p1', profiles: [miaProfile('p1')] },
      issues: ['profil n° 2 invalide, écarté'],
    });
  });

  it('accepte une sauvegarde sans profil (appareil neuf)', () => {
    expect(parseBackupJson(toJson(createDefaultSaveState()))).toEqual({
      ok: true,
      state: createDefaultSaveState(),
      issues: [],
    });
  });

  it('applique les migrations enregistrées avant de valider', () => {
    const legacy = toJson({ schemaVersion: 0, players: [rawProfile('p1')], settings: {} });
    const migrations: Record<number, SaveMigration> = {
      0: ({ players, ...data }) => ({ ...data, schemaVersion: 1, profiles: players }),
    };

    expect(parseBackupJson(legacy, { migrations })).toMatchObject({
      ok: true,
      state: { profiles: [miaProfile('p1')] },
    });
  });
});

describe('StorageService (Web)', () => {
  it('charge l’état par défaut quand rien n’est stocké, sans appeler Preferences', async () => {
    await expect(loadSaveState()).resolves.toEqual(createDefaultSaveState());
    expect(preferences.get).not.toHaveBeenCalled();
  });

  it('persiste dans localStorage seulement, puis relit la sauvegarde', async () => {
    const save = sampleSave();

    await saveState(save);

    expect(localStorage.getItem(STORAGE_KEY)).toBe(toJson(save));
    expect(localStorage.getItem(`CapacitorStorage.${STORAGE_KEY}`)).toBeNull();
    expect(preferences.set).not.toHaveBeenCalled();
    await expect(loadSaveState()).resolves.toEqual(save);
  });

  it('garde une copie brute et avertit quand la lecture perd des données', async () => {
    const raw = rawSave([rawProfile('p1'), 'illisible']);
    storeLocally(raw);

    const state = await loadSaveState();

    expect(state.profiles).toEqual([miaProfile('p1')]);
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBe(raw);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    expect(warnings()).toEqual([expect.stringContaining('profil n° 2 invalide, écarté')]);
  });

  it('résiste à un JSON corrompu : état par défaut et copie de secours', async () => {
    const truncated = '{"schemaVersion":1,"profiles":[{"id":"p1"';
    storeLocally(truncated);

    await expect(loadSaveState()).resolves.toEqual(createDefaultSaveState());
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBe(truncated);
  });

  it('ne rejette jamais quand localStorage refuse l’écriture', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota dépassé', 'QuotaExceededError');
    });

    await expect(saveState(sampleSave())).resolves.toBeUndefined();
    expect(warnings()).toEqual([
      expect.stringContaining(`Écriture locale de « ${STORAGE_KEY} » impossible`),
    ]);
  });

  it('ne rejette jamais quand l’état ne peut pas être sérialisé', async () => {
    const circular = sampleSave() as MiaSaveState & { self?: unknown };
    circular.self = circular;

    await expect(saveState(circular)).resolves.toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(warnings()).toEqual([expect.stringContaining('impossible à sérialiser')]);
  });

  it('charge l’état par défaut quand localStorage est inaccessible', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Données de site bloquées', 'SecurityError');
    });

    await expect(loadSaveState()).resolves.toEqual(createDefaultSaveState());
    expect(warnings()).toEqual([expect.stringContaining('Lecture locale')]);
  });
});

describe('StorageService (natif)', () => {
  beforeEach(() => {
    platform.native = true;
  });

  it('lit Preferences en priorité et répare le miroir localStorage', async () => {
    preferences.values.set(STORAGE_KEY, toJson(sampleSave()));
    storeLocally(createDefaultSaveState());

    await expect(loadSaveState()).resolves.toEqual(sampleSave());
    expect(localStorage.getItem(STORAGE_KEY)).toBe(toJson(sampleSave()));
  });

  it('ne réécrit pas un miroir déjà à jour', async () => {
    preferences.values.set(STORAGE_KEY, toJson(sampleSave()));
    storeLocally(sampleSave());
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    await expect(loadSaveState()).resolves.toEqual(sampleSave());
    expect(setItem).not.toHaveBeenCalled();
    expect(preferences.set).not.toHaveBeenCalled();
  });

  it('se rabat sur le miroir quand Preferences est vide ou en échec', async () => {
    storeLocally(sampleSave());

    await expect(loadSaveState()).resolves.toEqual(sampleSave());

    preferences.get.mockRejectedValueOnce(new Error('Pont natif indisponible'));
    await expect(loadSaveState()).resolves.toEqual(sampleSave());
    expect(warnings()).toEqual([expect.stringContaining('dans Preferences impossible')]);
  });

  it('écrit Preferences puis le miroir', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    await saveState(sampleSave());

    expect(preferences.values.get(STORAGE_KEY)).toBe(toJson(sampleSave()));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(toJson(sampleSave()));
    expect(preferences.set.mock.invocationCallOrder[0]).toBeLessThan(
      setItem.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('écrit encore le miroir quand Preferences échoue', async () => {
    preferences.set.mockRejectedValueOnce(new Error('Disque plein'));

    await expect(saveState(sampleSave())).resolves.toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(toJson(sampleSave()));
    expect(warnings()).toEqual([
      expect.stringContaining(`Écriture de « ${STORAGE_KEY} » dans Preferences impossible`),
    ]);
  });

  it('écrit la copie de secours dans les deux supports', async () => {
    preferences.values.set(STORAGE_KEY, 'corrompu');

    await expect(loadSaveState()).resolves.toEqual(createDefaultSaveState());
    expect(preferences.values.get(BACKUP_STORAGE_KEY)).toBe('corrompu');
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBe('corrompu');
  });
});

describe('Export / import JSON', () => {
  const tvSettings: DeviceSettings = { ...DEFAULT_DEVICE_SETTINGS, tvModeOverride: 'always_tv' };
  const tabletSave = sampleSave({
    settings: { soundEnabled: false, highContrastMode: true, tvModeOverride: 'always_touch' },
  });

  it('exporte un JSON indenté, relu à l’identique par l’import', () => {
    const json = exportSaveJson(sampleSave());

    expect(json).toContain('\n  "schemaVersion": 1,');
    expect(JSON.parse(json)).toEqual(sampleSave());
    expect(parseBackupJson(json)).toEqual({ ok: true, state: sampleSave(), issues: [] });
  });

  it('importe en conservant les réglages de l’appareil', async () => {
    storeLocally({ ...createDefaultSaveState(), settings: tvSettings });

    const imported = await importSaveJson(exportSaveJson(tabletSave));

    expect(imported).toEqual({ ...tabletSave, settings: tvSettings });
    expect(readLocally()).toEqual(imported);
  });

  it('lève une SaveImportError explicite pour un fichier qui n’est pas une sauvegarde Mia', async () => {
    const error = await importSaveJson('{"nom":"photo.png"}').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SaveImportError);
    expect(error).toMatchObject({
      name: 'SaveImportError',
      reason: 'not_a_mia_save',
      message: IMPORT_FAILURE_MESSAGES.not_a_mia_save,
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('avertit des entrées écartées à l’import', async () => {
    await importSaveJson(rawSave([rawProfile('p1'), 'illisible']));

    expect(warnings()).toEqual([expect.stringContaining('Sauvegarde importée avec pertes')]);
  });
});

describe('Stockage persistant (navigator.storage.persist)', () => {
  it('demande la persistance sur le Web quand elle n’est pas acquise', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    stubStorageManager({ persisted: () => Promise.resolve(false), persist });

    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('ne redemande pas une persistance déjà acquise', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    stubStorageManager({ persisted: () => Promise.resolve(true), persist });

    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('ne fait rien sans API de stockage ni sur natif', async () => {
    await expect(requestPersistentStorage()).resolves.toBe(false);

    const persist = vi.fn(() => Promise.resolve(true));
    stubStorageManager({ persist });
    platform.native = true;

    await expect(requestPersistentStorage()).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it('absorbe un refus de l’API', async () => {
    stubStorageManager({ persist: () => Promise.reject(new Error('Refusé')) });

    await expect(requestPersistentStorage()).resolves.toBe(false);
    expect(warnings()).toEqual([expect.stringContaining('stockage persistant impossible')]);
  });
});

describe('Mode TV (data-tv)', () => {
  const CASES: [TvModeOverride, string | null][] = [
    ['always_tv', 'on'],
    ['always_touch', 'off'],
    ['auto', null],
  ];

  it.each(CASES)('applyTvModeOverride(%s) → data-tv = %s', (override, expected) => {
    document.documentElement.setAttribute('data-tv', 'on');

    applyTvModeOverride(override);

    expect(document.documentElement.getAttribute('data-tv')).toBe(expected);
  });

  it.each(CASES)('le script inline pose data-tv avant l’hydratation (%s)', (override, expected) => {
    storeLocally(withTvMode(override));

    runBootstrapScript();

    expect(document.documentElement.getAttribute('data-tv')).toBe(expected);
  });

  it.each([
    ['absente', null],
    ['illisible', '{"settings":'],
    ['sans réglages', '{"schemaVersion":1}'],
    ['à la valeur héritée du prototype', toJson({ settings: { tvModeOverride: 'toString' } })],
    ['réduite à un nombre', '5'],
  ])('le script inline ne pose rien, sans erreur, pour une sauvegarde %s', (_label, raw) => {
    const onError = vi.fn();
    window.addEventListener('error', onError);
    if (raw !== null) storeLocally(raw);

    runBootstrapScript();

    window.removeEventListener('error', onError);
    expect(onError).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute('data-tv')).toBe(false);
    expect(document.documentElement.hasAttribute('data-contrast')).toBe(false);
  });

  it('reste autonome et en ES5 (exécuté avant tout bundle)', () => {
    expect(TV_MODE_BOOTSTRAP_SCRIPT).toContain(JSON.stringify(STORAGE_KEY));
    expect(TV_MODE_BOOTSTRAP_SCRIPT).not.toMatch(/=>|\blet\b|\bconst\b|`/);
  });
});

describe('Contraste élevé (data-contrast)', () => {
  it('applyHighContrastMode pose puis retire data-contrast', () => {
    applyHighContrastMode(true);
    expect(document.documentElement.getAttribute('data-contrast')).toBe('high');

    applyHighContrastMode(false);
    expect(document.documentElement.hasAttribute('data-contrast')).toBe(false);
  });

  it('le script inline pose data-contrast avant l’hydratation, avec data-tv', () => {
    storeLocally({
      ...createDefaultSaveState(),
      settings: { ...DEFAULT_DEVICE_SETTINGS, tvModeOverride: 'always_tv', highContrastMode: true },
    });

    runBootstrapScript();

    expect(document.documentElement.getAttribute('data-contrast')).toBe('high');
    expect(document.documentElement.getAttribute('data-tv')).toBe('on');
  });

  it.each([
    ['standard', withContrast(false)],
    ['à la valeur « oui »', { settings: { highContrastMode: 'oui' } }],
    ['à la valeur 1', { settings: { highContrastMode: 1 } }],
  ])('le script inline ne pose rien en contraste %s', (_label, raw) => {
    storeLocally(raw);

    runBootstrapScript();

    expect(document.documentElement.hasAttribute('data-contrast')).toBe(false);
  });
});

describe('StorageProvider & useMiaStorage', () => {
  it('exige un StorageProvider parent', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useMiaStorage())).toThrow('StorageProvider');
  });

  it('pré-rend l’état par défaut, non chargé', () => {
    storeLocally(sampleSave());

    expect(
      renderToString(
        <StorageProvider>
          <Probe />
        </StorageProvider>,
      ),
    ).toContain('non chargé, 0 profil(s)');
  });

  it('charge la sauvegarde au montage et expose le profil actif', async () => {
    storeLocally(sampleSave({ activeProfileId: 'p2' }));

    const { result } = renderStorage();

    expect(result.current.isLoaded).toBe(false);
    expect(result.current.state).toEqual(createDefaultSaveState());
    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    expect(result.current.state).toEqual(sampleSave({ activeProfileId: 'p2' }));
    expect(result.current.activeProfile).toEqual(profile('p2'));
  });

  it('expose activeProfile à null sans profil actif', async () => {
    storeLocally(sampleSave({ activeProfileId: null }));

    const { result } = await renderLoadedStorage();

    expect(result.current.activeProfile).toBeNull();
  });

  it('applique les mises à jour dans l’ordre des appels et les persiste dans cet ordre', async () => {
    storeLocally(sampleSave());
    const { result } = await renderLoadedStorage();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const seen: (string | null)[] = [];
    const activate = (id: string) => (prev: MiaSaveState) => {
      seen.push(prev.activeProfileId);
      return { ...prev, activeProfileId: id };
    };

    await act(async () => {
      await Promise.all([
        result.current.updateState(activate('p2')),
        result.current.updateState(activate('p1')),
      ]);
    });

    expect(seen).toEqual(['p1', 'p2']);
    expect(result.current.state.activeProfileId).toBe('p1');
    expect(
      setItem.mock.calls.map(([, value]) => (JSON.parse(value) as MiaSaveState).activeProfileId),
    ).toEqual(['p2', 'p1']);
  });

  it('applique une mise à jour demandée avant la fin du chargement sur la sauvegarde chargée', async () => {
    const finishLoading = holdNativeLoad();
    const { result } = renderStorage();
    let pending = Promise.resolve();

    act(() => {
      pending = result.current.updateState((prev) => ({ ...prev, activeProfileId: 'p2' }));
    });
    expect(result.current.isLoaded).toBe(false);

    await act(async () => {
      finishLoading(toJson(sampleSave()));
      await pending;
    });

    expect(result.current.state).toEqual(sampleSave({ activeProfileId: 'p2' }));
    expect(preferences.values.get(STORAGE_KEY)).toBe(toJson(sampleSave({ activeProfileId: 'p2' })));
  });

  it('n’écrit rien quand updater renvoie le même état', async () => {
    const { result } = await renderLoadedStorage();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    await act(async () => {
      await result.current.updateState((prev) => prev);
    });

    expect(setItem).not.toHaveBeenCalled();
  });

  it('updateSettings fusionne les réglages, persiste et pilote data-tv', async () => {
    const { result } = await renderLoadedStorage();

    await act(async () => {
      await result.current.updateSettings({ tvModeOverride: 'always_tv' });
    });

    expect(result.current.state.settings).toEqual({
      ...DEFAULT_DEVICE_SETTINGS,
      tvModeOverride: 'always_tv',
    });
    expect(readLocally()).toEqual(result.current.state);
    expect(document.documentElement.getAttribute('data-tv')).toBe('on');

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await act(async () => {
      await result.current.updateSettings({ soundEnabled: undefined, tvModeOverride: 'always_tv' });
    });
    expect(setItem).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.updateSettings({ highContrastMode: true });
    });
    expect(result.current.state.settings).toEqual({
      soundEnabled: true,
      highContrastMode: true,
      tvModeOverride: 'always_tv',
    });

    await act(async () => {
      await result.current.updateSettings({ tvModeOverride: 'auto' });
    });
    expect(document.documentElement.hasAttribute('data-tv')).toBe(false);
  });

  it('ne touche à data-tv qu’une fois la sauvegarde chargée', async () => {
    storeLocally(withTvMode('always_touch'));
    document.documentElement.setAttribute('data-tv', 'on');

    const { result } = renderStorage();

    expect(document.documentElement.getAttribute('data-tv')).toBe('on');
    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    expect(document.documentElement.getAttribute('data-tv')).toBe('off');
  });

  it('applique le contraste élevé une fois la sauvegarde chargée, puis à chaque changement', async () => {
    storeLocally(withContrast(true));

    const { result } = renderStorage();

    expect(document.documentElement.hasAttribute('data-contrast')).toBe(false);
    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    expect(document.documentElement.getAttribute('data-contrast')).toBe('high');

    await act(async () => {
      await result.current.updateSettings({ highContrastMode: false });
    });
    expect(document.documentElement.hasAttribute('data-contrast')).toBe(false);
    expect(readLocally()).toEqual(withContrast(false));
  });

  it('resetAllData efface profils et réglages', async () => {
    storeLocally(sampleSave({ settings: { ...DEFAULT_DEVICE_SETTINGS, soundEnabled: false } }));
    const { result } = await renderLoadedStorage();

    await act(async () => {
      await result.current.resetAllData();
    });

    expect(result.current.state).toEqual(createDefaultSaveState());
    expect(readLocally()).toEqual(createDefaultSaveState());
  });

  it('exportBackup renvoie le JSON de l’état courant', async () => {
    storeLocally(sampleSave());
    const { result } = await renderLoadedStorage();

    expect(result.current.exportBackup()).toBe(exportSaveJson(sampleSave()));
  });

  it('importBackup remplace les profils et conserve les réglages de l’appareil', async () => {
    const tvSettings: DeviceSettings = { ...DEFAULT_DEVICE_SETTINGS, tvModeOverride: 'always_tv' };
    const tabletSave = sampleSave({
      settings: { soundEnabled: false, highContrastMode: true, tvModeOverride: 'always_touch' },
    });
    storeLocally({ ...createDefaultSaveState(), settings: tvSettings });
    const { result } = await renderLoadedStorage();
    let outcome: ImportResult | undefined;

    await act(async () => {
      outcome = await result.current.importBackup(exportSaveJson(tabletSave));
    });

    expect(outcome).toEqual({ ok: true });
    expect(result.current.state).toEqual({ ...tabletSave, settings: tvSettings });
    expect(readLocally()).toEqual({ ...tabletSave, settings: tvSettings });
    expect(document.documentElement.getAttribute('data-tv')).toBe('on');
  });

  it('importBackup renvoie un échec explicite sans rien modifier', async () => {
    storeLocally(sampleSave());
    const { result } = await renderLoadedStorage();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    let outcome: ImportResult | undefined;

    await act(async () => {
      outcome = await result.current.importBackup(toJson({ ...sampleSave(), schemaVersion: 2 }));
    });

    expect(outcome).toEqual({
      ok: false,
      reason: 'newer_version',
      message: IMPORT_FAILURE_MESSAGES.newer_version,
    });
    expect(result.current.state).toEqual(sampleSave());
    expect(setItem).not.toHaveBeenCalled();
  });

  it('importBackup avertit des entrées écartées', async () => {
    const { result } = await renderLoadedStorage();

    await act(async () => {
      await result.current.importBackup(rawSave([rawProfile('p1'), 'illisible']));
    });

    expect(result.current.state.profiles).toEqual([miaProfile('p1')]);
    expect(warnings()).toEqual([expect.stringContaining('Sauvegarde importée avec pertes')]);
  });

  it('suit les écritures des autres onglets', async () => {
    storeLocally(sampleSave());
    const { result } = await renderLoadedStorage();

    dispatchStorageEvent({
      key: STORAGE_KEY,
      newValue: toJson(sampleSave({ activeProfileId: 'p2' })),
    });
    expect(result.current.state.activeProfileId).toBe('p2');

    dispatchStorageEvent({ key: 'autre-application', newValue: '{}' });
    dispatchStorageEvent({ key: STORAGE_KEY, newValue: '{}', storageArea: sessionStorage });
    expect(result.current.state.activeProfileId).toBe('p2');

    // localStorage.clear() dans un autre onglet
    dispatchStorageEvent({ key: null, newValue: null });
    expect(result.current.state).toEqual(createDefaultSaveState());
  });

  it('garde l’écriture d’un autre onglet reçue pendant le chargement', async () => {
    const finishLoading = holdNativeLoad();
    const { result } = renderStorage();

    dispatchStorageEvent({
      key: STORAGE_KEY,
      newValue: toJson(sampleSave({ activeProfileId: 'p2' })),
    });
    expect(result.current.isLoaded).toBe(true);

    finishLoading(toJson(sampleSave()));
    await flushAsync();

    expect(result.current.state).toEqual(sampleSave({ activeProfileId: 'p2' }));
  });

  it('demande le stockage persistant au montage (Web)', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    stubStorageManager({ persisted: () => Promise.resolve(false), persist });

    await renderLoadedStorage();

    await waitFor(() => {
      expect(persist).toHaveBeenCalledOnce();
    });
  });
});
