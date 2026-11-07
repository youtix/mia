import SettingsPage, { metadata } from '@/app/settings/page';
import {
  BACKUP_MESSAGES,
  describeBackupProfiles,
  describeProfileSettings,
  EXPORT_URL_REVOKE_DELAY_MS,
  formatTimeFactor,
  GAME_RESET_ORDER,
  GAME_SETTINGS_TEXTS,
  GAME_TITLES,
  getBackupFileName,
  SETTINGS_TEXTS,
  SettingsScreen,
  SettingsSection,
  TIME_FACTOR_OPTIONS,
} from '@/components/settings';
import { CONFIRM_GUARD_MS, installActivationGuard, NavigationProvider } from '@/core/navigation';
import { GAME_REGISTRY, GAMES } from '@/core/progression';
import {
  createDefaultSaveState,
  DEFAULT_DEVICE_SETTINGS,
  exportSaveJson,
  IMPORT_FAILURE_MESSAGES,
  STORAGE_KEY,
  StorageProvider,
} from '@/core/storage';
import {
  TIME_FACTORS,
  type DeviceSettings,
  type LevelCompletion,
  type MemoryGameSettings,
  type MiaSaveState,
  type UserProfile,
} from '@/types/mia';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
  type Mock,
} from 'vitest';

/** Plateforme simulée : `true` pour l'APK Capacitor (export par le presse-papiers seulement). */
const platform = vi.hoisted(() => ({ native: false }));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => platform.native } }));
// Natif : Preferences vide, la sauvegarde vient du miroir localStorage ; Web : jamais appelé.
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(() => Promise.resolve({ value: null })),
    set: vi.fn(() => Promise.resolve()),
  },
}));

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

const CREATED_AT = '2026-10-01T09:00:00.000Z';
const ORIGIN = 'http://localhost:3000';
const IMPORT_TITLE = 'Remplacer les profils actuels ?';
const RESET_TITLE = 'Réinitialiser Mia ?';
const FINAL_RESET_TITLE = 'Tout effacer définitivement ?';
const PREVIEW_GROUP = 'Temps de mémorisation';
const MISMATCH_GROUP = 'Temps d’affichage des erreurs';
/** Réglages de Memory d'un profil qui n'a rien réglé (« Normal » dans les deux sélecteurs). */
const DEFAULT_MEMORY: MemoryGameSettings = { previewFactor: 1, mismatchFactor: 1 };
/**
 * Appuis sur Bas pour atteindre la sauvegarde depuis le mode TV avec un profil actif : Son,
 * Contraste, les deux sélecteurs de temps de Memory, la rangée de remise à zéro, puis la sauvegarde.
 */
const PRESSES_TO_BACKUP = 6;

function won(levelId: string): LevelCompletion {
  return {
    levelId,
    completed: true,
    isPerfect: false,
    bestMoves: 10,
    bestTimeSeconds: 20,
    timesPlayed: 1,
    completedAt: CREATED_AT,
  };
}

function player(id: string, name: string, avatarId: string, stars = 0): UserProfile {
  const levels = Array.from({ length: stars }, (_, index) => won(`mem-00${String(index)}`));
  return {
    id,
    name,
    avatarId,
    createdAt: CREATED_AT,
    gamesProgress: {
      memory: {
        gameId: 'memory',
        levels: Object.fromEntries(levels.map((level) => [level.levelId, level])),
        lastPlayedLevelId: null,
      },
    },
    gameSettings: { memory: { previewFactor: 1, mismatchFactor: 1 } },
  };
}

/** Sauvegarde de l'appareil : Léo (actif, 2 étoiles) et Mia, réglages par défaut. */
function familySave(overrides: Partial<MiaSaveState> = {}): MiaSaveState {
  return {
    ...createDefaultSaveState(),
    activeProfileId: 'p1',
    profiles: [player('p1', 'Léo', 'cat', 2), player('p2', 'Mia', 'fox')],
    ...overrides,
  };
}

const TABLET_SETTINGS: DeviceSettings = {
  soundEnabled: false,
  highContrastMode: true,
  tvModeOverride: 'always_touch',
};

/** Sauvegarde venue d'une tablette : un autre profil et des réglages différents (ignorés à l'import). */
function tabletSave(): MiaSaveState {
  return {
    ...createDefaultSaveState(),
    activeProfileId: 'p9',
    profiles: [player('p9', 'Papi', 'owl', 5)],
    settings: TABLET_SETTINGS,
  };
}

function withSettings(settings: Partial<DeviceSettings>): MiaSaveState {
  return familySave({ settings: { ...DEFAULT_DEVICE_SETTINGS, ...settings } });
}

/** Sauvegarde familiale où Léo (actif) a réglé Memory ; Mia garde les réglages par défaut. */
function withMemorySettings(memory: MemoryGameSettings): MiaSaveState {
  const save = familySave();
  return {
    ...save,
    profiles: save.profiles.map((profile) =>
      profile.id === 'p1' ? { ...profile, gameSettings: { memory } } : profile,
    ),
  };
}

function storeSave(save: MiaSaveState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

function readSave(): MiaSaveState {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as MiaSaveState;
}

/** Profil enregistré, par identifiant. */
function savedProfile(id: string): UserProfile | undefined {
  return readSave().profiles.find((profile) => profile.id === id);
}

/**
 * Léo (actif) : deux étoiles en Memory dont une couronne, une étoile en Traffic Jam, des réglages de
 * Memory ; Mia : une étoile en Memory.
 */
function progressSave(): MiaSaveState {
  const leo: UserProfile = {
    ...player('p1', 'Léo', 'cat'),
    gamesProgress: {
      memory: {
        gameId: 'memory',
        levels: {
          'mem-000': { ...won('mem-000'), isPerfect: true },
          'mem-001': won('mem-001'),
        },
        lastPlayedLevelId: 'mem-001',
      },
      'traffic-jam': {
        gameId: 'traffic-jam',
        levels: { 'tj-001': won('tj-001') },
        lastPlayedLevelId: 'tj-001',
      },
    },
    gameSettings: { memory: { previewFactor: 2, mismatchFactor: 1.5 } },
  };
  return {
    ...createDefaultSaveState(),
    activeProfileId: 'p1',
    profiles: [leo, player('p2', 'Mia', 'fox', 1)],
  };
}

/** Mode TV forcé avant le montage : le moteur D-Pad démarre en mode `dpad`. */
function forceTvMode(save: MiaSaveState): MiaSaveState {
  document.documentElement.dataset.tv = 'on';
  return { ...save, settings: { ...save.settings, tvModeOverride: 'always_tv' } };
}

/** Appuie sur une touche (cible : élément focalisé) ; `true` si le moteur l'a consommée. */
function press(key: string): boolean {
  return !fireEvent.keyDown(document.activeElement ?? document.body, { key });
}

function pressTimes(key: string, count: number): void {
  for (let index = 0; index < count; index += 1) press(key);
}

/** Focus DOM (Tab, clic) ; `act` laisse React activer la zone de l'élément (`onFocus`) avant la suite. */
function focusElement(element: HTMLElement): void {
  act(() => {
    element.focus();
  });
}

function getButton(name: string | RegExp): HTMLElement {
  return screen.getByRole('button', { name });
}

function getRadio(name: string): HTMLElement {
  return screen.getByRole('radio', { name });
}

function getSwitch(name: string): HTMLElement {
  return screen.getByRole('switch', { name });
}

function getGroup(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

function getFactorGroup(name: string): HTMLElement {
  return screen.getByRole('radiogroup', { name });
}

/** Option d'un sélecteur de temps, par son libellé ; le facteur (« × 1,5 ») complète son nom accessible. */
function getFactorRadio(groupName: string, label: string): HTMLElement {
  const option = TIME_FACTOR_OPTIONS.find((candidate) => candidate.label === label);
  if (!option) throw new Error(`Option de temps inconnue : ${label}`);
  return within(getFactorGroup(groupName)).getByRole('radio', {
    name: `${label} ${formatTimeFactor(option.value)}`,
  });
}

/** Réglages de Memory enregistrés, dans l'ordre des profils (Léo puis Mia). */
function readMemorySettings(): MemoryGameSettings[] {
  return readSave().profiles.map((profile) => profile.gameSettings.memory);
}

function getPasteField(): HTMLElement {
  return screen.getByLabelText('Coller une sauvegarde');
}

/**
 * Boîte de dialogue ouverte et prête : son focus initial et son écouteur clavier (Échap) sont
 * posés dans un effet passif, après l'insertion dans le DOM ; attendre le focus évite de lui
 * envoyer une touche avant qu'elle n'écoute.
 */
async function findDialog(name: string): Promise<HTMLElement> {
  const dialog = await screen.findByRole('dialog', { name });
  await waitFor(() => {
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
  return dialog;
}

async function waitForClosed(name: string): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument();
  });
}

/** Entrées de session de la Navigation API ; la dernière est l'entrée courante. */
function stubNavigationHistory(...urls: string[]): void {
  const entries = urls.map((url, index) => ({ url, index }));
  Object.defineProperty(window, 'navigation', {
    configurable: true,
    value: { currentEntry: entries.at(-1) ?? null, entries: () => entries },
  });
}

function stubClipboard(writeText: () => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
}

/** jsdom n'implémente pas les URL d'objet : simulées, pour vérifier création et révocation. */
function stubObjectUrls(): { create: Mock<(blob: Blob) => string>; revoke: Mock } {
  const create = vi.fn((_blob: Blob) => 'blob:mia');
  const revoke = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
  return { create, revoke };
}

/** Choisit un fichier dans le sélecteur masqué derrière « Choisir un fichier ». */
function chooseFile(content: string, name = 'mia-sauvegarde-2026-10-29.json'): void {
  const file = new File([content], name, { type: 'application/json' });
  fireEvent.change(screen.getByLabelText('Fichier de sauvegarde'), { target: { files: [file] } });
}

function pasteBackup(content: string): void {
  fireEvent.change(getPasteField(), { target: { value: content } });
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <StorageProvider>
      <NavigationProvider>{children}</NavigationProvider>
    </StorageProvider>
  );
}

/**
 * Garde d'activation installée, comme dans l'application, sur une horloge conduite par le test
 * (`tick`) : les minuteries restent réelles pour les attentes de Testing Library.
 */
function installGuardWithClock(): (ms: number) => void {
  onTestFinished(installActivationGuard());
  let now = 1_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  return (ms) => {
    now += ms;
  };
}

/** Laisse s'achever les écritures en cours : un clic ignoré n'en a lancé aucune. */
async function settle(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      }),
  );
}

/** Sauvegarde avec une entrée illisible de plus dans la liste des profils : import avec pertes. */
function damagedBackup(save: MiaSaveState): string {
  return JSON.stringify({ ...save, profiles: [...save.profiles, 'illisible'] });
}

/** Monte l'écran sur la sauvegarde donnée et attend la fin de l'attente. */
async function renderSettings(save: MiaSaveState = familySave()): Promise<void> {
  storeSave(save);
  render(<SettingsScreen />, { wrapper: Providers });
  await waitFor(() => {
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument();
  });
}

/** Mode TV forcé : attend que le curseur D-Pad soit posé sur l'option en vigueur. */
async function renderSettingsOnTv(save: MiaSaveState = familySave()): Promise<void> {
  await renderSettings(forceTvMode(save));
  await waitFor(() => {
    expect(getRadio('Toujours TV')).toHaveFocus();
  });
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  platform.native = false;
  localStorage.clear();
  delete document.documentElement.dataset.tv;
  delete document.documentElement.dataset.contrast;
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
  Reflect.deleteProperty(window, 'navigation');
});

describe('Page Réglages', () => {
  it('donne son titre à la page (« Réglages · Mia ») et attend la sauvegarde', async () => {
    expect(metadata.title).toBe('Réglages');
    storeSave(familySave());
    render(<SettingsPage />, { wrapper: Providers });

    expect(screen.getByRole('heading', { level: 1, name: 'Réglages' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    expect(await screen.findByRole('region', { name: 'Appareil' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sauvegarde' })).toBeInTheDocument();
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument();
  });
});

describe('Réglages de l’appareil', () => {
  it('affiche le mode TV, le son et le contraste avec leur état', async () => {
    await renderSettings(
      withSettings({ soundEnabled: false, highContrastMode: true, tvModeOverride: 'always_touch' }),
    );

    const group = screen.getByRole('radiogroup', { name: 'Mode TV' });
    expect(group).toHaveAccessibleDescription(SETTINGS_TEXTS.tvModeNote);
    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['Automatique', 'Toujours TV', 'Toujours tactile']);
    expect(getRadio('Toujours tactile')).toBeChecked();
    expect(getRadio('Automatique')).not.toBeChecked();
    expect(getSwitch('Son')).not.toBeChecked();
    expect(getSwitch('Son')).toHaveAccessibleDescription(SETTINGS_TEXTS.soundNote);
    expect(getSwitch('Contraste élevé')).toBeChecked();
    expect(getSwitch('Contraste élevé')).toHaveAccessibleDescription(SETTINGS_TEXTS.contrastNote);
    expect(document.documentElement.dataset.tv).toBe('off');
    expect(document.documentElement.dataset.contrast).toBe('high');
  });

  it('force le mode TV au doigt, avec effet immédiat, et le persiste', async () => {
    await renderSettings();
    expect(getRadio('Automatique')).toBeChecked();

    fireEvent.click(getRadio('Toujours TV'));

    await waitFor(() => {
      expect(getRadio('Toujours TV')).toBeChecked();
    });
    expect(getRadio('Automatique')).not.toBeChecked();
    expect(document.documentElement.dataset.tv).toBe('on');
    await waitFor(() => {
      expect(readSave().settings.tvModeOverride).toBe('always_tv');
    });

    fireEvent.click(getRadio('Automatique'));

    await waitFor(() => {
      expect(getRadio('Automatique')).toBeChecked();
    });
    expect(document.documentElement.hasAttribute('data-tv')).toBe(false);
    await waitFor(() => {
      expect(readSave().settings.tvModeOverride).toBe('auto');
    });
  });

  it('coupe le son et bascule le contraste élevé, persistés et appliqués', async () => {
    await renderSettings();

    fireEvent.click(getSwitch('Son'));
    await waitFor(() => {
      expect(getSwitch('Son')).not.toBeChecked();
    });
    await waitFor(() => {
      expect(readSave().settings.soundEnabled).toBe(false);
    });

    fireEvent.click(getSwitch('Contraste élevé'));
    await waitFor(() => {
      expect(getSwitch('Contraste élevé')).toBeChecked();
    });
    expect(document.documentElement.dataset.contrast).toBe('high');
    await waitFor(() => {
      expect(readSave().settings.highContrastMode).toBe(true);
    });

    fireEvent.click(getSwitch('Contraste élevé'));
    await waitFor(() => {
      expect(document.documentElement.hasAttribute('data-contrast')).toBe(false);
    });
    await waitFor(() => {
      expect(readSave().settings).toEqual({ ...DEFAULT_DEVICE_SETTINGS, soundEnabled: false });
    });
  });

  it('se pilote à la télécommande : le curseur part de l’option en vigueur et y reste', async () => {
    await renderSettingsOnTv();
    expect(getRadio('Toujours TV')).toHaveAttribute('data-focused', 'true');

    press('ArrowRight');
    expect(getRadio('Toujours tactile')).toHaveFocus();
    expect(press('Enter')).toBe(true);
    await waitFor(() => {
      expect(getRadio('Toujours tactile')).toBeChecked();
    });
    // La mise en page change (data-tv) : le curseur reste sur l'option choisie.
    expect(document.documentElement.dataset.tv).toBe('off');
    expect(getRadio('Toujours tactile')).toHaveFocus();
    expect(getRadio('Toujours tactile')).toHaveAttribute('data-focused', 'true');

    press('ArrowLeft');
    press('ArrowLeft');
    expect(getRadio('Automatique')).toHaveFocus();
    press('ArrowLeft');
    expect(getRadio('Automatique')).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Retour')).toHaveFocus();
    expect(getButton('Retour')).toHaveAttribute('data-focused', 'true');
    press('ArrowUp');
    expect(getButton('Retour')).toHaveFocus();
    // Retour dans le sélecteur : sur l'option en vigueur, pas sur la dernière visitée.
    press('ArrowDown');
    expect(getRadio('Toujours tactile')).toHaveFocus();

    press('ArrowDown');
    expect(getSwitch('Son')).toHaveFocus();
    expect(press('Enter')).toBe(true);
    await waitFor(() => {
      expect(getSwitch('Son')).not.toBeChecked();
    });
    expect(getSwitch('Son')).toHaveFocus();
    // Interrupteurs seuls sur leur ligne : Gauche / Droite ne bougent pas.
    press('ArrowRight');
    expect(getSwitch('Son')).toHaveFocus();
    press('ArrowDown');
    expect(getSwitch('Contraste élevé')).toHaveFocus();
    press('ArrowLeft');
    expect(getSwitch('Contraste élevé')).toHaveFocus();
    expect(press('Enter')).toBe(true);
    await waitFor(() => {
      expect(document.documentElement.dataset.contrast).toBe('high');
    });
    press('ArrowUp');
    expect(getSwitch('Son')).toHaveFocus();
    press('ArrowUp');
    expect(getRadio('Toujours tactile')).toHaveFocus();
    await waitFor(() => {
      expect(readSave().settings).toEqual({
        soundEnabled: false,
        highContrastMode: true,
        tvModeOverride: 'always_touch',
      });
    });
  });

  it('sous 640 px, chaque zone D-Pad suit la grille empilée : Bas descend d’une option', async () => {
    const lists = new Set<string>();
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    vi.stubGlobal('matchMedia', (query: string) => {
      lists.add(query);
      return { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    });
    await renderSettingsOnTv();
    expect(lists).toContain('(min-width: 40rem)');
    expect(getRadio('Toujours TV')).toHaveFocus();

    // Mode TV : une colonne de trois options.
    press('ArrowDown');
    expect(getRadio('Toujours tactile')).toHaveFocus();
    press('ArrowRight');
    expect(getRadio('Toujours tactile')).toHaveFocus();
    press('ArrowDown');
    expect(getSwitch('Son')).toHaveFocus();
    press('ArrowDown');
    expect(getSwitch('Contraste élevé')).toHaveFocus();

    // Temps de Memory : deux rangées de deux.
    press('ArrowDown');
    expect(getFactorRadio(PREVIEW_GROUP, 'Normal')).toHaveFocus();
    press('ArrowDown');
    expect(getFactorRadio(PREVIEW_GROUP, 'Très long')).toHaveFocus();
    press('ArrowLeft');
    expect(getFactorRadio(PREVIEW_GROUP, 'Long')).toHaveFocus();
    press('ArrowDown');
    expect(getFactorRadio(MISMATCH_GROUP, 'Normal')).toHaveFocus();
  });

  it('active la zone de l’élément qui reçoit le focus DOM (Tab, clic)', async () => {
    await renderSettings();

    focusElement(getButton('Copier'));
    press('ArrowDown');
    expect(getButton('Choisir un fichier')).toHaveFocus();

    focusElement(getSwitch('Son'));
    press('ArrowDown');
    expect(getSwitch('Contraste élevé')).toHaveFocus();

    focusElement(getButton('Retour'));
    press('ArrowDown');
    expect(getRadio('Automatique')).toHaveFocus();
  });

  it('revient au Hub par le bouton Retour, en remplaçant l’entrée quand le Hub ne précède pas', async () => {
    await renderSettings();

    fireEvent.click(getButton('Retour'));

    expect(router.replace).toHaveBeenCalledWith('/');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('revient au Hub avec Retour / Échap, en dépilant l’historique quand le Hub précède', async () => {
    stubNavigationHistory(`${ORIGIN}/`, `${ORIGIN}/settings/`);
    await renderSettingsOnTv();

    expect(press('Escape')).toBe(true);

    expect(router.back).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('Réglages de jeu', () => {
  it('affiche la section « Jeux » du profil actif, avec son avatar et ses réglages de Memory', async () => {
    await renderSettings(withMemorySettings({ previewFactor: 1.5, mismatchFactor: 2 }));

    // Entre l'appareil et la sauvegarde.
    expect(
      screen
        .getAllByRole('region')
        .map((region) => within(region).getByRole('heading', { level: 2 }).textContent),
    ).toEqual(['Appareil', 'Jeux', 'Progression', 'Sauvegarde', 'Application']);
    const section = screen.getByRole('region', { name: 'Jeux' });
    expect(within(section).getByText('Réglages de Léo')).toBeInTheDocument();
    expect(section.querySelector('[data-avatar="cat"]')).toHaveAttribute('aria-hidden', 'true');
    expect(within(section).getByText(GAME_SETTINGS_TEXTS.profileNote)).toBeInTheDocument();
    expect(within(section).getByRole('group', { name: 'Memory' })).toBeInTheDocument();

    const preview = getFactorGroup(PREVIEW_GROUP);
    expect(preview).toHaveAccessibleDescription(GAME_SETTINGS_TEXTS.previewNote);
    expect(
      within(preview)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['Court × 0,5', 'Normal × 1', 'Long × 1,5', 'Très long × 2']);
    expect(within(preview).getAllByRole('radio', { checked: true })).toEqual([
      getFactorRadio(PREVIEW_GROUP, 'Long'),
    ]);

    const mismatch = getFactorGroup(MISMATCH_GROUP);
    expect(mismatch).toHaveAccessibleDescription(GAME_SETTINGS_TEXTS.mismatchNote);
    expect(within(mismatch).getAllByRole('radio')).toHaveLength(TIME_FACTORS.length);
    expect(within(mismatch).getAllByRole('radio', { checked: true })).toEqual([
      getFactorRadio(MISMATCH_GROUP, 'Très long'),
    ]);
  });

  it('propose « Normal » par défaut dans les deux sélecteurs', async () => {
    await renderSettings();

    expect(getFactorRadio(PREVIEW_GROUP, 'Normal')).toBeChecked();
    expect(getFactorRadio(MISMATCH_GROUP, 'Normal')).toBeChecked();
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(3);
  });

  it.each([
    ['sans profil actif', familySave({ activeProfileId: null })],
    ['sans aucun profil', familySave({ activeProfileId: null, profiles: [] })],
  ])('est absente %s, la sauvegarde restant proposée', async (_case, save) => {
    await renderSettings(save);

    expect(screen.queryByRole('region', { name: 'Jeux' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: PREVIEW_GROUP })).not.toBeInTheDocument();
    expect(screen.queryByText(/Réglages de /)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Appareil' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sauvegarde' })).toBeInTheDocument();
  });

  it('change le temps de mémorisation au doigt, pour le profil actif seulement', async () => {
    await renderSettings();

    fireEvent.click(getFactorRadio(PREVIEW_GROUP, 'Très long'));

    await waitFor(() => {
      expect(getFactorRadio(PREVIEW_GROUP, 'Très long')).toBeChecked();
    });
    expect(getFactorRadio(PREVIEW_GROUP, 'Normal')).not.toBeChecked();
    expect(getFactorRadio(MISMATCH_GROUP, 'Normal')).toBeChecked();
    await waitFor(() => {
      expect(readMemorySettings()).toEqual([
        { previewFactor: 2, mismatchFactor: 1 },
        DEFAULT_MEMORY,
      ]);
    });
    // Rien d'autre ne bouge : étoiles, profil actif, réglages de l'appareil.
    expect(readSave()).toEqual(withMemorySettings({ previewFactor: 2, mismatchFactor: 1 }));
  });

  it('change le temps d’affichage des erreurs au doigt, sans toucher à la mémorisation', async () => {
    await renderSettings(withMemorySettings({ previewFactor: 1.5, mismatchFactor: 1 }));

    fireEvent.click(getFactorRadio(MISMATCH_GROUP, 'Court'));

    await waitFor(() => {
      expect(getFactorRadio(MISMATCH_GROUP, 'Court')).toBeChecked();
    });
    expect(getFactorRadio(PREVIEW_GROUP, 'Long')).toBeChecked();
    await waitFor(() => {
      expect(readMemorySettings()).toEqual([
        { previewFactor: 1.5, mismatchFactor: 0.5 },
        DEFAULT_MEMORY,
      ]);
    });
  });

  it('se pilote à la télécommande : arrivée sur l’option choisie, curseur conservé après un choix', async () => {
    await renderSettingsOnTv();

    pressTimes('ArrowDown', 2);
    expect(getSwitch('Contraste élevé')).toHaveFocus();
    press('ArrowDown');
    expect(getFactorRadio(PREVIEW_GROUP, 'Normal')).toHaveFocus();
    expect(getFactorRadio(PREVIEW_GROUP, 'Normal')).toHaveAttribute('data-focused', 'true');
    expect(getSwitch('Contraste élevé')).not.toHaveAttribute('data-focused');

    press('ArrowRight');
    expect(getFactorRadio(PREVIEW_GROUP, 'Long')).toHaveFocus();
    expect(press('Enter')).toBe(true);
    await waitFor(() => {
      expect(getFactorRadio(PREVIEW_GROUP, 'Long')).toBeChecked();
    });
    expect(getFactorRadio(PREVIEW_GROUP, 'Normal')).not.toBeChecked();
    // Le curseur reste sur l'option choisie.
    expect(getFactorRadio(PREVIEW_GROUP, 'Long')).toHaveFocus();
    expect(getFactorRadio(PREVIEW_GROUP, 'Long')).toHaveAttribute('data-focused', 'true');
    // Bords de la ligne : Droite s'arrête à « Très long », Gauche à « Court ».
    pressTimes('ArrowRight', 2);
    expect(getFactorRadio(PREVIEW_GROUP, 'Très long')).toHaveFocus();
    pressTimes('ArrowLeft', 4);
    expect(getFactorRadio(PREVIEW_GROUP, 'Court')).toHaveFocus();

    press('ArrowDown');
    expect(getFactorRadio(MISMATCH_GROUP, 'Normal')).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Remettre Memory à zéro')).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Télécharger le fichier')).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Remettre Chacun sa Place à zéro')).toHaveFocus();
    press('ArrowUp');
    expect(getFactorRadio(MISMATCH_GROUP, 'Normal')).toHaveFocus();
    // En remontant : sur l'option choisie (« Long »), pas sur la dernière visitée (« Court »).
    press('ArrowUp');
    expect(getFactorRadio(PREVIEW_GROUP, 'Long')).toHaveFocus();
    press('ArrowUp');
    expect(getSwitch('Contraste élevé')).toHaveFocus();
    press('ArrowDown');
    expect(getFactorRadio(PREVIEW_GROUP, 'Long')).toHaveFocus();

    await waitFor(() => {
      expect(readMemorySettings()).toEqual([
        { previewFactor: 1.5, mismatchFactor: 1 },
        DEFAULT_MEMORY,
      ]);
    });
  });

  it('ramène le curseur sur Contraste si le profil actif disparaît depuis un autre onglet', async () => {
    await renderSettingsOnTv();
    pressTimes('ArrowDown', 4);
    expect(getFactorRadio(MISMATCH_GROUP, 'Normal')).toHaveFocus();

    // Autre onglet : sauvegarde réécrite sans profil actif (import) ; la section « Jeux » disparaît.
    const raw = JSON.stringify(familySave({ activeProfileId: null }));
    window.localStorage.setItem(STORAGE_KEY, raw);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: raw,
          storageArea: window.localStorage,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole('radiogroup', { name: MISMATCH_GROUP })).toBeNull();
    });
    // Le curseur n'est pas resté sur une zone démontée : Contraste reprend la main.
    expect(getSwitch('Contraste élevé')).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Télécharger le fichier')).toHaveFocus();
    press('ArrowUp');
    expect(getSwitch('Contraste élevé')).toHaveFocus();
  });

  it('enchaîne Contraste et Sauvegarde directement sans profil actif', async () => {
    await renderSettingsOnTv(familySave({ activeProfileId: null }));

    pressTimes('ArrowDown', 2);
    expect(getSwitch('Contraste élevé')).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Télécharger le fichier')).toHaveFocus();
    press('ArrowUp');
    expect(getSwitch('Contraste élevé')).toHaveFocus();
  });

  it('active la zone de l’option qui reçoit le focus DOM (Tab, clic)', async () => {
    await renderSettings();

    focusElement(getFactorRadio(MISMATCH_GROUP, 'Court'));
    press('ArrowDown');
    expect(getButton('Remettre Memory à zéro')).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Télécharger le fichier')).toHaveFocus();

    focusElement(getFactorRadio(PREVIEW_GROUP, 'Très long'));
    press('ArrowUp');
    expect(getSwitch('Contraste élevé')).toHaveFocus();

    focusElement(getSwitch('Contraste élevé'));
    press('ArrowDown');
    expect(getFactorRadio(PREVIEW_GROUP, 'Normal')).toHaveFocus();
  });

  it('revient au Hub avec Retour / Échap depuis les sélecteurs de temps', async () => {
    stubNavigationHistory(`${ORIGIN}/`, `${ORIGIN}/settings/`);
    await renderSettingsOnTv();

    pressTimes('ArrowDown', 3);
    expect(getFactorRadio(PREVIEW_GROUP, 'Normal')).toHaveFocus();
    expect(press('Escape')).toBe(true);
    expect(router.back).toHaveBeenCalledOnce();

    press('ArrowDown');
    expect(getFactorRadio(MISMATCH_GROUP, 'Normal')).toHaveFocus();
    expect(press('Escape')).toBe(true);
    expect(router.back).toHaveBeenCalledTimes(2);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('Progression', () => {
  it('affiche le décompte de chaque jeu sur son bouton', async () => {
    await renderSettings(progressSave());

    expect(
      within(getButton('Remettre Memory à zéro')).getByText('2 étoiles · 1 couronne'),
    ).toBeInTheDocument();
    expect(
      within(getButton('Remettre Traffic Jam à zéro')).getByText('1 étoile · 0 couronne'),
    ).toBeInTheDocument();
    expect(
      within(getButton('Remettre Suites Logiques à zéro')).getByText('Aucune étoile'),
    ).toBeInTheDocument();
  });

  it('suit l’ordre et les noms du registre', () => {
    expect(GAME_RESET_ORDER).toEqual(GAMES.map((game) => game.id));
    for (const game of GAMES) {
      expect(GAME_TITLES[game.id]).toBe(game.title);
    }
  });

  it('n’apparaît qu’avec un profil actif', async () => {
    await renderSettings(familySave({ activeProfileId: null }));

    expect(screen.queryByRole('group', { name: 'Remettre un jeu à zéro' })).not.toBeInTheDocument();
  });

  it('remet un jeu à zéro après deux confirmations, pour le profil actif seulement', async () => {
    const before = progressSave();
    const [leoBefore, miaBefore] = before.profiles;
    await renderSettings(before);
    fireEvent.click(getButton('Remettre Memory à zéro'));

    const first = await findDialog('Remettre Memory à zéro ?');
    expect(
      within(first).getByText(/2 étoiles et 1 couronne de Memory seront effacées pour Léo/),
    ).toBeInTheDocument();
    fireEvent.click(within(first).getByRole('button', { name: 'Continuer' }));

    const second = await findDialog('Remettre Memory à zéro définitivement ?');
    expect(second).toHaveClass('border-rose-400');
    expect(within(second).getByText(/irréversible/)).toBeInTheDocument();
    fireEvent.click(within(second).getByRole('button', { name: 'Effacer définitivement' }));

    await waitFor(() => {
      expect(savedProfile('p1')?.gamesProgress).not.toHaveProperty('memory');
    });
    // Léo garde son autre jeu et ses réglages de Memory ; Mia n'est pas touchée.
    expect(Object.keys(savedProfile('p1')?.gamesProgress ?? {})).toEqual(['traffic-jam']);
    expect(savedProfile('p1')?.gameSettings).toEqual(leoBefore?.gameSettings);
    expect(savedProfile('p2')).toEqual(miaBefore);
    expect(screen.getByText('Memory est remis à zéro pour Léo.')).toBeInTheDocument();
    expect(
      within(getButton('Remettre Memory à zéro')).getByText('Aucune étoile'),
    ).toBeInTheDocument();
  });

  it('n’ouvre aucune confirmation pour un jeu sans étoile, et le dit', async () => {
    await renderSettings(progressSave());

    fireEvent.click(getButton('Remettre Suites Logiques à zéro'));

    expect(
      await screen.findByText('Suites Logiques n’a encore aucune étoile : rien à remettre à zéro.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(readSave()).toEqual(progressSave());
  });

  it('abandonne à chaque étape sans rien modifier', async () => {
    await renderSettings(progressSave());

    fireEvent.click(getButton('Remettre Memory à zéro'));
    const first = await findDialog('Remettre Memory à zéro ?');
    fireEvent.click(within(first).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    fireEvent.click(getButton('Remettre Memory à zéro'));
    fireEvent.click(
      within(await findDialog('Remettre Memory à zéro ?')).getByRole('button', {
        name: 'Continuer',
      }),
    );
    const second = await findDialog('Remettre Memory à zéro définitivement ?');
    fireEvent.click(within(second).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(readSave()).toEqual(progressSave());
  });

  it('garde chaque étape sans effet 1 s : un double tap lent n’efface rien', async () => {
    const tick = installGuardWithClock();
    await renderSettings(progressSave());
    tick(CONFIRM_GUARD_MS);

    fireEvent.click(getButton('Remettre Memory à zéro'));
    const first = await findDialog('Remettre Memory à zéro ?');
    const proceed = within(first).getByRole('button', { name: 'Continuer' });

    tick(CONFIRM_GUARD_MS - 1);
    fireEvent.click(proceed);
    await settle();
    expect(
      screen.queryByRole('dialog', { name: 'Remettre Memory à zéro définitivement ?' }),
    ).not.toBeInTheDocument();

    tick(1);
    fireEvent.click(proceed);
    const final = await findDialog('Remettre Memory à zéro définitivement ?');
    const erase = within(final).getByRole('button', { name: 'Effacer définitivement' });

    tick(CONFIRM_GUARD_MS - 1);
    fireEvent.click(erase);
    await settle();
    expect(readSave()).toEqual(progressSave());

    tick(1);
    fireEvent.click(erase);
    await waitFor(() => {
      expect(savedProfile('p1')?.gamesProgress).not.toHaveProperty('memory');
    });
  });

  it('se pilote à la télécommande : Memory sur la rangée, Annuler par défaut, confirmation au clavier', async () => {
    await renderSettingsOnTv(progressSave());

    pressTimes('ArrowDown', 5);
    expect(getButton('Remettre Memory à zéro')).toHaveFocus();
    expect(press('Enter')).toBe(true);
    const first = await findDialog('Remettre Memory à zéro ?');
    await waitFor(() => {
      expect(within(first).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    });
    press('ArrowRight');
    expect(within(first).getByRole('button', { name: 'Continuer' })).toHaveFocus();
    expect(press('Enter')).toBe(true);

    const second = await findDialog('Remettre Memory à zéro définitivement ?');
    await waitFor(() => {
      expect(within(second).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    });
    press('ArrowRight');
    expect(within(second).getByRole('button', { name: 'Effacer définitivement' })).toHaveFocus();
    expect(press('Enter')).toBe(true);

    await waitFor(() => {
      expect(savedProfile('p1')?.gamesProgress).not.toHaveProperty('memory');
    });
  });
});

describe('Sauvegarde', () => {
  it('télécharge la sauvegarde du jour sur le Web, puis révoque l’URL', async () => {
    await renderSettings();
    const { create, revoke } = stubObjectUrls();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 29, 15, 0));

    fireEvent.click(getButton('Télécharger le fichier'));

    expect(create).toHaveBeenCalledOnce();
    const blob = create.mock.calls[0]?.[0];
    expect(blob?.type).toBe('application/json');
    // `contexts` : les `this` des appels, le lien créé puis retiré du document.
    const link = click.mock.contexts[0] as HTMLAnchorElement | undefined;
    expect(link).toMatchObject({ download: 'mia-sauvegarde-2026-10-29.json', href: 'blob:mia' });
    expect(link?.isConnected).toBe(false);
    expect(within(getGroup('Exporter')).getByRole('status')).toHaveTextContent(
      'Téléchargement lancé : mia-sauvegarde-2026-10-29.json. Si aucun fichier n’apparaît, utilise « Copier ».',
    );
    expect(revoke).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(EXPORT_URL_REVOKE_DELAY_MS);
    });
    expect(revoke).toHaveBeenCalledWith('blob:mia');
    vi.useRealTimers();
    await expect(blob?.text()).resolves.toBe(exportSaveJson(familySave()));
  });

  it('copie la sauvegarde dans le presse-papiers', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    await renderSettings();

    fireEvent.click(getButton('Copier'));

    expect(writeText).toHaveBeenCalledWith(exportSaveJson(familySave()));
    await waitFor(() => {
      expect(within(getGroup('Exporter')).getByRole('status')).toHaveTextContent(
        BACKUP_MESSAGES.copied,
      );
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explique quand le presse-papiers manque ou refuse la copie', async () => {
    await renderSettings();

    fireEvent.click(getButton('Copier'));
    expect(await within(getGroup('Exporter')).findByRole('alert')).toHaveTextContent(
      BACKUP_MESSAGES.clipboardUnavailable,
    );

    stubClipboard(() => Promise.reject(new Error('Refusé')));
    fireEvent.click(getButton('Copier'));
    await waitFor(() => {
      expect(within(getGroup('Exporter')).getByRole('alert')).toHaveTextContent(
        BACKUP_MESSAGES.clipboardUnavailable,
      );
    });

    // API présente mais sans écriture (WebView restreinte) : même message.
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {} });
    fireEvent.click(getButton('Copier'));
    await waitFor(() => {
      expect(within(getGroup('Exporter')).getByRole('alert')).toHaveTextContent(
        BACKUP_MESSAGES.clipboardUnavailable,
      );
    });

    stubClipboard(() => Promise.resolve());
    fireEvent.click(getButton('Copier'));
    await waitFor(() => {
      expect(within(getGroup('Exporter')).getByRole('status')).toHaveTextContent(
        BACKUP_MESSAGES.copied,
      );
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ne propose que la copie dans l’APK', async () => {
    platform.native = true;
    await renderSettingsOnTv();

    expect(
      screen.queryByRole('button', { name: 'Télécharger le fichier' }),
    ).not.toBeInTheDocument();
    pressTimes('ArrowDown', PRESSES_TO_BACKUP);
    expect(getButton('Copier')).toHaveFocus();
    press('ArrowRight');
    expect(getButton('Copier')).toHaveFocus();
    press('ArrowLeft');
    expect(getButton('Copier')).toHaveFocus();
  });

  it('importe un fichier après confirmation, en conservant les réglages de l’appareil', async () => {
    await renderSettings(withSettings({ tvModeOverride: 'always_tv' }));

    chooseFile(exportSaveJson(tabletSave()));

    const dialog = await findDialog(IMPORT_TITLE);
    expect(within(dialog).getByText(/Cette sauvegarde contient 1 profil\./)).toBeInTheDocument();
    expect(within(dialog).getByText(/Exporte d’abord ta progression/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remplacer' }));

    await waitFor(() => {
      expect(within(getGroup('Importer')).getByRole('status')).toHaveTextContent(
        BACKUP_MESSAGES.restored,
      );
    });
    await waitForClosed(IMPORT_TITLE);
    await waitFor(() => {
      expect(readSave()).toEqual({
        ...tabletSave(),
        settings: { ...DEFAULT_DEVICE_SETTINGS, tvModeOverride: 'always_tv' },
      });
    });
    expect(document.documentElement.dataset.tv).toBe('on');
    expect(document.documentElement.hasAttribute('data-contrast')).toBe(false);
  });

  it('prévient d’un fichier en partie illisible avant de remplacer les profils, puis après', async () => {
    await renderSettings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    pasteBackup(damagedBackup(tabletSave()));
    fireEvent.click(getButton('Importer'));

    const dialog = await findDialog(IMPORT_TITLE);
    expect(within(dialog).getByText(/Cette sauvegarde contient 1 profil\./)).toHaveTextContent(
      BACKUP_MESSAGES.partialFile,
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remplacer' }));

    const alert = await within(getGroup('Importer')).findByRole('alert');
    expect(alert).toHaveTextContent(BACKUP_MESSAGES.restoredPartially);
    expect(within(getGroup('Importer')).getByRole('status')).toBeEmptyDOMElement();
    expect(getPasteField()).toHaveValue('');
    expect(readSave().profiles.map((profile) => profile.name)).toEqual(['Papi']);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('ne prévient de rien pour un fichier intact, même avec un jeu inconnu de cette version', async () => {
    const [papi] = tabletSave().profiles as [UserProfile];
    const chess = {
      gameId: 'chess',
      levels: { 'che-001': won('che-001') },
      lastPlayedLevelId: null,
    };
    const fromNewerVersion: MiaSaveState = {
      ...tabletSave(),
      profiles: [{ ...papi, gamesProgress: { ...papi.gamesProgress, chess } }],
    };
    await renderSettings();

    pasteBackup(exportSaveJson(fromNewerVersion));
    fireEvent.click(getButton('Importer'));

    const dialog = await findDialog(IMPORT_TITLE);
    expect(within(dialog).queryByText(new RegExp(BACKUP_MESSAGES.partialFile))).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remplacer' }));

    await waitFor(() => {
      expect(within(getGroup('Importer')).getByRole('status')).toHaveTextContent(
        BACKUP_MESSAGES.restored,
      );
    });
    expect(readSave().profiles[0]?.gamesProgress.chess).toEqual(chess);
  });

  it('dit qu’une sauvegarde n’a pas pu être enregistrée : les profils ne changent pas', async () => {
    await renderSettings();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    pasteBackup(exportSaveJson(tabletSave()));
    fireEvent.click(getButton('Importer'));
    const dialog = await findDialog(IMPORT_TITLE);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota dépassé', 'QuotaExceededError');
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remplacer' }));

    const alert = await within(getGroup('Importer')).findByRole('alert');
    expect(alert).toHaveTextContent(IMPORT_FAILURE_MESSAGES.write_failed);
    expect(within(getGroup('Importer')).getByRole('status')).toBeEmptyDOMElement();
    // L'écran affiche toujours le profil d'avant, et le contenu collé reste pour réessayer.
    expect(screen.getByText('Réglages de Léo')).toBeInTheDocument();
    expect(getPasteField()).not.toHaveValue('');
    expect(readSave()).toEqual(familySave());
  });

  it('ramène à l’écran le message de chaque action, une seule fois par action', async () => {
    stubClipboard(() => Promise.resolve());
    await renderSettings();
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const lastScrolled = () => scrollIntoView.mock.contexts.at(-1);

    fireEvent.click(getButton('Copier'));
    const copied = within(getGroup('Exporter')).getByRole('status');
    await waitFor(() => {
      expect(copied).toHaveTextContent(BACKUP_MESSAGES.copied);
    });
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(lastScrolled()).toContainElement(copied);

    // Même texte, nouvelle action : le joueur a pu faire défiler l'écran entre-temps.
    scrollIntoView.mockClear();
    fireEvent.click(getButton('Copier'));
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledOnce();
    });

    fireEvent.click(getButton('Importer'));
    expect(lastScrolled()).toContainElement(within(getGroup('Importer')).getByRole('alert'));

    // Un autre rendu de l'écran ne fait pas sauter la page vers les messages déjà affichés.
    scrollIntoView.mockClear();
    fireEvent.click(getSwitch('Son'));
    await waitFor(() => {
      expect(getSwitch('Son')).not.toBeChecked();
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('garde « Remplacer » sans effet 1 s : un double tap lent n’atteint pas la confirmation', async () => {
    const tick = installGuardWithClock();
    await renderSettings();
    tick(CONFIRM_GUARD_MS);

    pasteBackup(exportSaveJson(tabletSave()));
    fireEvent.click(getButton('Importer'));
    const dialog = await findDialog(IMPORT_TITLE);
    const replace = within(dialog).getByRole('button', { name: 'Remplacer' });

    tick(CONFIRM_GUARD_MS - 1);
    fireEvent.click(replace);
    await settle();
    expect(screen.getByRole('dialog', { name: IMPORT_TITLE })).toBeInTheDocument();
    expect(readSave()).toEqual(familySave());

    tick(1);
    fireEvent.click(replace);
    await waitFor(() => {
      expect(readSave().profiles.map((profile) => profile.name)).toEqual(['Papi']);
    });
  });

  it('garde chaque étape de la réinitialisation sans effet 1 s : un double tap lent n’efface rien', async () => {
    const tick = installGuardWithClock();
    await renderSettings();
    tick(CONFIRM_GUARD_MS);

    fireEvent.click(getButton('Tout effacer'));
    const first = await findDialog(RESET_TITLE);
    const proceed = within(first).getByRole('button', { name: 'Continuer' });

    tick(CONFIRM_GUARD_MS - 1);
    fireEvent.click(proceed);
    await settle();
    expect(screen.queryByRole('dialog', { name: FINAL_RESET_TITLE })).not.toBeInTheDocument();

    tick(1);
    fireEvent.click(proceed);
    const final = await findDialog(FINAL_RESET_TITLE);
    const erase = within(final).getByRole('button', { name: 'Tout effacer définitivement' });

    tick(CONFIRM_GUARD_MS - 1);
    fireEvent.click(erase);
    await settle();
    expect(readSave()).toEqual(familySave());

    tick(1);
    fireEvent.click(erase);
    await waitFor(() => {
      expect(readSave()).toEqual(createDefaultSaveState());
    });
  });

  it('n’importe qu’une fois quand « Remplacer » est pressé deux fois de suite', async () => {
    await renderSettings();
    // Un import = une écriture de la sauvegarde (`STORAGE_KEY`) ; les autres clés sont ignorées.
    const writeSave = vi.spyOn(Storage.prototype, 'setItem');

    chooseFile(exportSaveJson(tabletSave()));
    const replace = within(await findDialog(IMPORT_TITLE)).getByRole('button', {
      name: 'Remplacer',
    });
    // Double appui : la modale se ferme au premier, mais ses boutons restent cliquables le temps
    // de l'animation de sortie.
    fireEvent.click(replace);
    fireEvent.click(replace);

    await waitFor(() => {
      expect(within(getGroup('Importer')).getByRole('status')).toHaveTextContent(
        BACKUP_MESSAGES.restored,
      );
    });
    await waitForClosed(IMPORT_TITLE);
    expect(writeSave.mock.calls.filter(([key]) => key === STORAGE_KEY)).toHaveLength(1);
    expect(readSave().profiles.map((profile) => profile.name)).toEqual(['Papi']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ouvre le sélecteur de fichier depuis le bouton, et ignore une sélection vide', async () => {
    await renderSettings();
    const open = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const input = screen.getByLabelText('Fichier de sauvegarde');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'application/json,.json');

    fireEvent.click(getButton('Choisir un fichier'));
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.contexts[0]).toBe(input);

    fireEvent.change(input, { target: { files: [] } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuse un fichier qui n’est pas une sauvegarde Mia, sans demander confirmation', async () => {
    await renderSettings();

    chooseFile('{"nom":"photo.png"}', 'photo.json');

    expect(await within(getGroup('Importer')).findByRole('alert')).toHaveTextContent(
      IMPORT_FAILURE_MESSAGES.not_a_mia_save,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(readSave()).toEqual(familySave());
  });

  it('signale un fichier illisible', async () => {
    await renderSettings();
    vi.spyOn(File.prototype, 'text').mockRejectedValueOnce(new Error('Disque retiré'));

    chooseFile('{}');

    expect(await within(getGroup('Importer')).findByRole('alert')).toHaveTextContent(
      BACKUP_MESSAGES.fileUnreadable,
    );
  });

  it('annule le remplacement par le bouton ou par Échap, sans rien modifier', async () => {
    await renderSettings();

    chooseFile(exportSaveJson(tabletSave()));
    const dialog = await findDialog(IMPORT_TITLE);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitForClosed(IMPORT_TITLE);
    expect(readSave()).toEqual(familySave());

    // Le même fichier peut être choisi de nouveau.
    chooseFile(exportSaveJson(tabletSave()));
    fireEvent.keyDown(await findDialog(IMPORT_TITLE), { key: 'Escape' });
    await waitForClosed(IMPORT_TITLE);
    expect(readSave()).toEqual(familySave());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('importe une sauvegarde collée, puis vide le champ', async () => {
    await renderSettings();
    const otherFamily = familySave({
      activeProfileId: 'p8',
      profiles: [player('p8', 'Papi', 'owl', 1), player('p9', 'Mamie', 'crown')],
    });

    pasteBackup(exportSaveJson(otherFamily));
    fireEvent.click(getButton('Importer'));

    const dialog = await findDialog(IMPORT_TITLE);
    expect(within(dialog).getByText(/Cette sauvegarde contient 2 profils\./)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remplacer' }));

    await waitFor(() => {
      expect(within(getGroup('Importer')).getByRole('status')).toHaveTextContent(
        BACKUP_MESSAGES.restored,
      );
    });
    expect(getPasteField()).toHaveValue('');
    await waitFor(() => {
      expect(readSave()).toEqual(otherFamily);
    });
  });

  it('accepte une sauvegarde collée sans retour à la ligne et sans profil', async () => {
    await renderSettings();

    pasteBackup(JSON.stringify({ ...createDefaultSaveState(), settings: TABLET_SETTINGS }));
    fireEvent.click(getButton('Importer'));

    const dialog = await findDialog(IMPORT_TITLE);
    expect(within(dialog).getByText(/ne contient aucun profil/)).toBeInTheDocument();
  });

  it('demande de coller d’abord une sauvegarde', async () => {
    await renderSettings();

    pasteBackup('   ');
    fireEvent.click(getButton('Importer'));

    expect(within(getGroup('Importer')).getByRole('alert')).toHaveTextContent(
      BACKUP_MESSAGES.pasteEmpty,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lance l’import collé avec Entrée au doigt, pas à la télécommande', async () => {
    await renderSettings();

    pasteBackup('pas du JSON');
    fireEvent.keyDown(getPasteField(), { key: 'Enter' });

    expect(within(getGroup('Importer')).getByRole('alert')).toHaveTextContent(
      IMPORT_FAILURE_MESSAGES.invalid_json,
    );
  });

  it('laisse Entrée au champ de collage à la télécommande (clavier virtuel TV)', async () => {
    await renderSettingsOnTv();

    pasteBackup('pas du JSON');
    expect(fireEvent.keyDown(getPasteField(), { key: 'Enter' })).toBe(true);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('au D-Pad, traverse le champ de collage clavier virtuel fermé ; OK l’autorise, le quitter le referme', async () => {
    await renderSettingsOnTv();
    focusElement(getButton('Choisir un fichier'));

    press('ArrowDown');
    expect(getPasteField()).toHaveFocus();
    expect(getPasteField()).toHaveAttribute('inputmode', 'none');

    // OK : Entrée reste native, le champ reprend le focus sans `inputmode` (Chromium ouvre le clavier).
    const blur = vi.fn();
    getPasteField().addEventListener('blur', blur);
    expect(fireEvent.keyDown(getPasteField(), { key: 'Enter' })).toBe(true);
    expect(getPasteField()).toHaveFocus();
    expect(getPasteField()).not.toHaveAttribute('inputmode');
    expect(blur).toHaveBeenCalledOnce();

    // Un second OK ne refait rien : le clavier est déjà autorisé.
    fireEvent.keyDown(getPasteField(), { key: 'Enter' });
    expect(blur).toHaveBeenCalledOnce();

    press('ArrowDown');
    expect(getButton('Importer')).toHaveFocus();
    press('ArrowUp');
    expect(getPasteField()).toHaveFocus();
    expect(getPasteField()).toHaveAttribute('inputmode', 'none');
  });

  it('au doigt, le champ de collage garde le clavier virtuel', async () => {
    await renderSettings();

    focusElement(getPasteField());

    expect(getPasteField()).not.toHaveAttribute('inputmode');
  });

  it('réinitialise après une double confirmation, puis revient au Hub', async () => {
    await renderSettings(withSettings({ highContrastMode: true }));
    expect(document.documentElement.dataset.contrast).toBe('high');

    fireEvent.click(getButton('Tout effacer'));
    const first = await findDialog(RESET_TITLE);
    expect(within(first).getByText(/Exporte d’abord ta progression/)).toBeInTheDocument();
    fireEvent.click(within(first).getByRole('button', { name: 'Continuer' }));

    const second = await findDialog(FINAL_RESET_TITLE);
    expect(second).toHaveClass('border-rose-400');
    expect(within(second).getByText(/irréversible/)).toBeInTheDocument();
    fireEvent.click(within(second).getByRole('button', { name: 'Tout effacer définitivement' }));

    await waitFor(() => {
      expect(readSave()).toEqual(createDefaultSaveState());
    });
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.documentElement.hasAttribute('data-contrast')).toBe(false);
  });

  it('ne réinitialise qu’une fois quand « Tout effacer définitivement » est pressé deux fois de suite', async () => {
    await renderSettings();
    // Une réinitialisation = une écriture de la sauvegarde (`STORAGE_KEY`).
    const writeSave = vi.spyOn(Storage.prototype, 'setItem');

    fireEvent.click(getButton('Tout effacer'));
    fireEvent.click(
      within(await findDialog(RESET_TITLE)).getByRole('button', { name: 'Continuer' }),
    );
    const erase = within(await findDialog(FINAL_RESET_TITLE)).getByRole('button', {
      name: 'Tout effacer définitivement',
    });
    // Double appui : les modales se ferment au premier, mais leurs boutons restent cliquables le
    // temps de l'animation de sortie.
    fireEvent.click(erase);
    fireEvent.click(erase);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(router.replace).toHaveBeenCalledOnce();
    expect(router.back).not.toHaveBeenCalled();
    expect(writeSave.mock.calls.filter(([key]) => key === STORAGE_KEY)).toHaveLength(1);
    expect(readSave()).toEqual(createDefaultSaveState());
  });

  it('abandonne la réinitialisation à l’une ou l’autre étape', async () => {
    await renderSettings();
    focusElement(getButton('Tout effacer'));

    fireEvent.click(getButton('Tout effacer'));
    const first = await findDialog(RESET_TITLE);
    fireEvent.click(within(first).getByRole('button', { name: 'Annuler' }));
    await waitForClosed(RESET_TITLE);
    // Le focus revient à l'ouvreur dans le nettoyage d'un effet passif, après le retrait du DOM.
    await waitFor(() => {
      expect(getButton('Tout effacer')).toHaveFocus();
    });

    fireEvent.click(getButton('Tout effacer'));
    fireEvent.click(
      within(await findDialog(RESET_TITLE)).getByRole('button', { name: 'Continuer' }),
    );
    const second = await findDialog(FINAL_RESET_TITLE);
    fireEvent.click(within(second).getByRole('button', { name: 'Annuler' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(readSave()).toEqual(familySave());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('enchaîne les zones de la sauvegarde à la télécommande et confirme au clavier', async () => {
    const save = forceTvMode(familySave());
    await renderSettings(save);
    await waitFor(() => {
      expect(getRadio('Toujours TV')).toHaveFocus();
    });

    pressTimes('ArrowDown', PRESSES_TO_BACKUP);
    expect(getButton('Télécharger le fichier')).toHaveFocus();
    press('ArrowRight');
    expect(getButton('Copier')).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Choisir un fichier')).toHaveFocus();
    press('ArrowDown');
    expect(getPasteField()).toHaveFocus();
    expect(getPasteField()).toHaveAttribute('data-focused', 'true');
    // Champ d'une ligne : Gauche / Droite restent au champ, Bas en sort.
    expect(press('ArrowRight')).toBe(false);
    press('ArrowDown');
    expect(getButton('Importer')).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Tout effacer')).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Tout effacer')).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Importer')).toHaveFocus();
    press('ArrowUp');
    expect(getPasteField()).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Choisir un fichier')).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Copier')).toHaveFocus();
    // Au-dessus de la sauvegarde : la remise à zéro, sur le dernier jeu ; plus haut, le dernier
    // sélecteur de temps de Memory, sur l'option choisie.
    press('ArrowUp');
    expect(getButton('Remettre Chacun sa Place à zéro')).toHaveFocus();
    press('ArrowUp');
    expect(getFactorRadio(MISMATCH_GROUP, 'Normal')).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Remettre Memory à zéro')).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Télécharger le fichier')).toHaveFocus();

    // Double confirmation au clavier : curseur sur Annuler ; Retour abandonne tout.
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    expect(getButton('Tout effacer')).toHaveFocus();
    expect(press('Enter')).toBe(true);
    const first = await findDialog(RESET_TITLE);
    await waitFor(() => {
      expect(within(first).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    });
    press('ArrowRight');
    expect(within(first).getByRole('button', { name: 'Continuer' })).toHaveFocus();
    expect(press('Enter')).toBe(true);
    const second = await findDialog(FINAL_RESET_TITLE);
    await waitFor(() => {
      expect(within(second).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    });
    expect(press('Escape')).toBe(true);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(router.replace).not.toHaveBeenCalled();
    expect(readSave()).toEqual(save);
  });

  it('confirme l’import au clavier depuis le champ de collage', async () => {
    await renderSettingsOnTv();
    pasteBackup(exportSaveJson(tabletSave()));
    focusElement(getButton('Importer'));

    expect(press('Enter')).toBe(true);
    const dialog = await findDialog(IMPORT_TITLE);
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    });
    press('ArrowRight');
    expect(press('Enter')).toBe(true);

    await waitFor(() => {
      expect(readSave().profiles.map((profile) => profile.name)).toEqual(['Papi']);
    });
    await waitForClosed(IMPORT_TITLE);
  });
});

describe('SettingsSection', () => {
  it('nomme la région par son titre, avec ou sans icône', () => {
    render(
      <>
        <SettingsSection title="Appareil" icon={<svg data-testid="icone" />}>
          <p>Réglages</p>
        </SettingsSection>
        <SettingsSection title="Divers">
          <p>Autres</p>
        </SettingsSection>
      </>,
    );

    const device = screen.getByRole('region', { name: 'Appareil' });
    expect(within(device).getByTestId('icone').parentElement).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(within(device).getByText('Réglages')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Divers' })).queryByTestId('icone'),
    ).toBeNull();
  });
});

describe('Libellés', () => {
  it('nomme le fichier exporté à la date locale, mois et jour sur deux chiffres', () => {
    expect(getBackupFileName(new Date(2026, 0, 5))).toBe('mia-sauvegarde-2026-01-05.json');
    expect(getBackupFileName(new Date(2026, 9, 29))).toBe('mia-sauvegarde-2026-10-29.json');
  });

  it('décrit les profils d’une sauvegarde à importer', () => {
    expect(describeBackupProfiles(0)).toBe(
      'Cette sauvegarde ne contient aucun profil : un profil « Joueur 1 » sera créé.',
    );
    expect(describeBackupProfiles(1)).toBe('Cette sauvegarde contient 1 profil.');
    expect(describeBackupProfiles(3)).toBe('Cette sauvegarde contient 3 profils.');
  });

  it('formate les facteurs de temps à la française, avec une virgule', () => {
    expect(TIME_FACTORS.map((factor) => formatTimeFactor(factor))).toEqual([
      '× 0,5',
      '× 1',
      '× 1,5',
      '× 2',
    ]);
  });

  it('liste les options de temps du plus court au plus long, dans l’ordre de TIME_FACTORS', () => {
    expect(TIME_FACTOR_OPTIONS).toEqual([
      { value: 0.5, label: 'Court' },
      { value: 1, label: 'Normal' },
      { value: 1.5, label: 'Long' },
      { value: 2, label: 'Très long' },
    ]);
    expect(TIME_FACTOR_OPTIONS.map((option) => option.value)).toEqual([...TIME_FACTORS]);
  });

  it.each([
    ['Léo', 'Réglages de Léo'],
    ['Mia', 'Réglages de Mia'],
    ['Joueur 1', 'Réglages de Joueur 1'],
    ['Parents', 'Réglages de Parents'],
    ['Yann', 'Réglages de Yann'],
    ['🦊', 'Réglages de 🦊'],
    ['Alice', 'Réglages d’Alice'],
    ['Enfants', 'Réglages d’Enfants'],
    ['Invité', 'Réglages d’Invité'],
    ['élodie', 'Réglages d’élodie'],
    ['Émile', 'Réglages d’Émile'],
    ['Hugo', 'Réglages d’Hugo'],
    ['Yves', 'Réglages d’Yves'],
  ])('élide « de » devant un prénom qui l’appelle : %s', (name, title) => {
    expect(describeProfileSettings(name)).toBe(title);
  });

  it('crédite la voix dans la note du réglage Son : auteurs, licence et son adresse, modification', () => {
    const credit = [
      'Voix générée avec le modèle Piper « MLS »',
      'corpus Multilingual LibriSpeech',
      'Vineel Pratap, Qiantong Xu, Anuroop Sriram, Gabriel Synnaeve, Ronan Collobert',
      'puis modifiée : coupée et ralentie',
      'Licence CC BY 4.0 : https://creativecommons.org/licenses/by/4.0/',
    ];

    for (const part of credit) expect(SETTINGS_TEXTS.soundNote).toContain(part);
  });

  it('titre les réglages du profil et reprend le nom du jeu du registre', () => {
    expect(GAME_SETTINGS_TEXTS.memoryTitle).toBe(GAME_REGISTRY.memory.title);
    expect(GAME_SETTINGS_TEXTS.previewLabel).toBe(PREVIEW_GROUP);
    expect(GAME_SETTINGS_TEXTS.mismatchLabel).toBe(MISMATCH_GROUP);
  });
});
