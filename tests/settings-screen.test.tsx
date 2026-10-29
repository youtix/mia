import SettingsPage, { metadata } from '@/app/settings/page';
import {
  BACKUP_MESSAGES,
  describeBackupProfiles,
  EXPORT_URL_REVOKE_DELAY_MS,
  getBackupFileName,
  SETTINGS_TEXTS,
  SettingsScreen,
  SettingsSection,
} from '@/components/settings';
import { NavigationProvider } from '@/core/navigation';
import {
  createDefaultSaveState,
  DEFAULT_DEVICE_SETTINGS,
  exportSaveJson,
  IMPORT_FAILURE_MESSAGES,
  STORAGE_KEY,
  StorageProvider,
} from '@/core/storage';
import type { DeviceSettings, LevelCompletion, MiaSaveState, UserProfile } from '@/types/mia';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi, type Mock } from 'vitest';

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

function storeSave(save: MiaSaveState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

function readSave(): MiaSaveState {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as MiaSaveState;
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

function getPasteField(): HTMLElement {
  return screen.getByLabelText('Coller une sauvegarde');
}

function findDialog(name: string): Promise<HTMLElement> {
  return screen.findByRole('dialog', { name });
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
      'Sauvegarde téléchargée : mia-sauvegarde-2026-10-29.json',
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
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
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
    expect(getButton('Tout effacer')).toHaveFocus();

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

    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
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
    press('ArrowUp');
    expect(getSwitch('Contraste élevé')).toHaveFocus();
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
});
