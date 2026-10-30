import {
  describeAppUpdate,
  SettingsFeedback,
  SettingsScreen,
  type SettingsFeedbackMessage,
} from '@/components/settings';
import { NavigationProvider } from '@/core/navigation';
import {
  appUpdate,
  repairApp,
  type AppRepairResult,
  type AppUpdateCheckResult,
  type AppUpdateStatus,
} from '@/core/pwa';
import type * as AppUpdateModule from '@/core/pwa/appUpdate';
import { createDefaultSaveState, STORAGE_KEY, StorageProvider } from '@/core/storage';
import type { MiaSaveState } from '@/types/mia';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** État de la mise à jour simulé : `set` prévient l'écran monté, comme le vrai suivi. */
const updateStatus = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let status: AppUpdateStatus = 'unsupported';
  return {
    get: () => status,
    set: (next: AppUpdateStatus) => {
      status = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});

vi.mock('@/core/pwa/useAppUpdateStatus', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useAppUpdateStatus: () => useSyncExternalStore(updateStatus.subscribe, updateStatus.get),
  };
});

// Le reste du module est réel ; `appUpdate.check` et `appUpdate.apply` sont espionnés plus bas.
vi.mock('@/core/pwa/appUpdate', async (importOriginal) => {
  const actual = await importOriginal<typeof AppUpdateModule>();
  return { ...actual, repairApp: vi.fn() };
});

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

const CHECK_LABEL = 'Rechercher une mise à jour';
const APPLY_LABEL = 'Mettre à jour';
const REPAIR_LABEL = 'Réparer l’application';
const UPDATE_GROUP = 'Mises à jour';
const REPAIR_GROUP = 'Réparer';
const REPAIR_DIALOG = 'Réparer Mia ?';
const REPAIR_ERROR = 'Réparation impossible : pas de connexion. Réessaie une fois connecté.';
const READY_TEXT = 'Une nouvelle version est prête. Tes profils et tes étoiles sont conservés.';
const DOWNLOADING_TEXT = 'Téléchargement de la nouvelle version…';
const CHECKING_TEXT = 'Recherche en cours…';
const UP_TO_DATE_TEXT = 'Mia est à jour.';
const CHECK_ERROR = 'Recherche impossible : vérifie ta connexion.';
const DOWNLOAD_ERROR = 'Le téléchargement a échoué. Réessaie plus tard.';
/**
 * Appuis sur Bas pour atteindre « Tout effacer » depuis le mode TV avec un profil actif : Son,
 * Contraste, les deux sélecteurs de temps de Memory, puis les boutons de la sauvegarde.
 */
const PRESSES_TO_RESET = 9;
/** Idem sans profil actif : la section « Jeux » et ses deux sélecteurs sont absents. */
const PRESSES_TO_RESET_WITHOUT_PROFILE = 7;

/** Sauvegarde de l'appareil : Léo, profil actif (section « Jeux » présente). */
function familySave(overrides: Partial<MiaSaveState> = {}): MiaSaveState {
  return {
    ...createDefaultSaveState(),
    activeProfileId: 'p1',
    profiles: [
      {
        id: 'p1',
        name: 'Léo',
        avatarId: 'cat',
        createdAt: '2026-10-01T09:00:00.000Z',
        gamesProgress: {},
        gameSettings: { memory: { previewFactor: 1, mismatchFactor: 1 } },
      },
    ],
    ...overrides,
  };
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <StorageProvider>
      <NavigationProvider>{children}</NavigationProvider>
    </StorageProvider>
  );
}

/** Monte l'écran dans l'état donné et attend la fin de l'attente de la sauvegarde. */
async function renderSettings(
  status: AppUpdateStatus,
  save: MiaSaveState = familySave(),
): Promise<void> {
  updateStatus.set(status);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  render(<SettingsScreen />, { wrapper: Providers });
  await waitFor(() => {
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument();
  });
}

/** Mode TV forcé avant le montage : attend que le curseur D-Pad soit posé sur l'option en vigueur. */
async function renderSettingsOnTv(
  status: AppUpdateStatus,
  save: MiaSaveState = familySave(),
): Promise<void> {
  document.documentElement.dataset.tv = 'on';
  await renderSettings(status, {
    ...save,
    settings: { ...save.settings, tvModeOverride: 'always_tv' },
  });
  await waitFor(() => {
    expect(screen.getByRole('radio', { name: 'Toujours TV' })).toHaveFocus();
  });
}

/** Le suivi change d'état pendant que l'écran est monté. */
function setStatus(status: AppUpdateStatus): void {
  act(() => {
    updateStatus.set(status);
  });
}

/** La prochaine recherche reste en cours jusqu'à `settle`. */
function holdNextCheck(): PromiseWithResolvers<AppUpdateCheckResult> {
  const pending = Promise.withResolvers<AppUpdateCheckResult>();
  vi.mocked(appUpdate.check).mockReturnValueOnce(pending.promise);
  return pending;
}

/** La prochaine réparation reste en cours jusqu'à `settle`. */
function holdNextRepair(): PromiseWithResolvers<AppRepairResult> {
  const pending = Promise.withResolvers<AppRepairResult>();
  vi.mocked(repairApp).mockReturnValueOnce(pending.promise);
  return pending;
}

/** Termine une opération retenue ; `act` laisse l'écran prendre en compte son issue. */
async function settle<T>(pending: PromiseWithResolvers<T>, value: T): Promise<void> {
  await act(async () => {
    pending.resolve(value);
    await pending.promise;
  });
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

function getButton(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

function getSection(): HTMLElement {
  return screen.getByRole('region', { name: 'Application' });
}

/** Option en vigueur du dernier sélecteur de temps de Memory, juste au-dessus de la sauvegarde. */
function getLastSettingAboveBackup(): HTMLElement {
  return within(
    screen.getByRole('radiogroup', { name: 'Temps d’affichage des erreurs' }),
  ).getByRole('radio', { name: 'Normal × 1' });
}

/** Région persistante du groupe : confirmations et actions en cours. */
function getStatusLine(group: string): HTMLElement {
  return within(screen.getByRole('group', { name: group })).getByRole('status');
}

function getAlert(group: string): HTMLElement {
  return within(screen.getByRole('group', { name: group })).getByRole('alert');
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

/** Ouvre la confirmation de la réparation et renvoie son bouton « Réparer ». */
async function openRepairDialog(): Promise<HTMLElement> {
  fireEvent.click(getButton(REPAIR_LABEL));
  const dialog = await findDialog(REPAIR_DIALOG);
  return within(dialog).getByRole('button', { name: 'Réparer' });
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  vi.spyOn(appUpdate, 'check').mockResolvedValue('up-to-date');
  vi.spyOn(appUpdate, 'apply').mockImplementation(() => undefined);
  vi.mocked(repairApp).mockResolvedValue('reloading');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.mocked(repairApp).mockReset();
  vi.unstubAllEnvs();
  localStorage.clear();
  delete document.documentElement.dataset.tv;
});

describe('Section « Application »', () => {
  it.each<AppUpdateStatus>(['unsupported', 'idle', 'downloading', 'ready'])(
    'affiche le numéro de version, en dernière section de l’écran (%s)',
    async (status) => {
      vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.2.3');
      await renderSettings(status);

      expect(
        screen
          .getAllByRole('region')
          .map((region) => within(region).getByRole('heading', { level: 2 }).textContent),
      ).toEqual(['Appareil', 'Jeux', 'Sauvegarde', 'Application']);
      expect(within(getSection()).getByText('Version 1.2.3')).toBeInTheDocument();
    },
  );

  it('n’affiche que le numéro de version sans service worker (APK, développement)', async () => {
    await renderSettings('unsupported');

    const section = getSection();
    expect(within(section).queryAllByRole('button')).toEqual([]);
    expect(within(section).queryAllByRole('group')).toEqual([]);
    expect(within(section).queryByRole('status')).not.toBeInTheDocument();
    expect(appUpdate.check).not.toHaveBeenCalled();
  });

  it('présente les mises à jour puis la réparation, avec leur description', async () => {
    await renderSettings('idle');

    const section = getSection();
    expect(within(section).getAllByRole('group')).toEqual([
      screen.getByRole('group', { name: UPDATE_GROUP }),
      screen.getByRole('group', { name: REPAIR_GROUP }),
    ]);
    expect(screen.getByRole('group', { name: UPDATE_GROUP })).toHaveAccessibleDescription(
      'Mia cherche les nouvelles versions toute seule. Tu peux aussi lancer une recherche maintenant.',
    );
    expect(screen.getByRole('group', { name: REPAIR_GROUP })).toHaveAccessibleDescription(
      'Retélécharge tous les fichiers de Mia si l’application se comporte mal. Les profils, les étoiles et les réglages sont conservés. Une connexion est nécessaire.',
    );
    expect(within(section).getAllByRole('button')).toEqual([
      getButton(CHECK_LABEL),
      getButton(REPAIR_LABEL),
    ]);
    expect(getStatusLine(UPDATE_GROUP)).toBeEmptyDOMElement();
    expect(getStatusLine(REPAIR_GROUP)).toBeEmptyDOMElement();
  });
});

describe('Recherche de mise à jour', () => {
  it.each<[AppUpdateStatus, string]>([
    ['idle', ''],
    ['downloading', DOWNLOADING_TEXT],
  ])('propose la recherche en bouton secondaire (%s)', async (status, line) => {
    await renderSettings(status);

    const button = getButton(CHECK_LABEL);
    expect(button).toHaveClass('border-slate-600');
    expect(button).not.toHaveClass('bg-sky-400');
    expect(getStatusLine(UPDATE_GROUP).textContent).toBe(line);

    fireEvent.click(button);

    expect(appUpdate.check).toHaveBeenCalledOnce();
    expect(appUpdate.apply).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(getStatusLine(UPDATE_GROUP).textContent).toBe(
        status === 'idle' ? UP_TO_DATE_TEXT : DOWNLOADING_TEXT,
      );
    });
  });

  it('propose la mise à jour en bouton principal quand une version est prête', async () => {
    await renderSettings('ready');

    expect(screen.queryByRole('button', { name: CHECK_LABEL })).not.toBeInTheDocument();
    const button = getButton(APPLY_LABEL);
    expect(button).toHaveClass('bg-sky-400');
    expect(getStatusLine(UPDATE_GROUP)).toHaveTextContent(READY_TEXT);

    fireEvent.click(button);

    expect(appUpdate.apply).toHaveBeenCalledOnce();
    expect(appUpdate.check).not.toHaveBeenCalled();
  });

  it('annonce la recherche en cours, puis confirme que Mia est à jour', async () => {
    const pending = holdNextCheck();
    await renderSettings('idle');

    fireEvent.click(getButton(CHECK_LABEL));

    const line = getStatusLine(UPDATE_GROUP);
    expect(line).toHaveTextContent(CHECKING_TEXT);
    expect(line).toHaveClass('text-slate-300');

    await settle(pending, 'up-to-date');

    expect(line).toHaveTextContent(UP_TO_DATE_TEXT);
    expect(line).toHaveClass('text-emerald-300');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('suit une version trouvée jusqu’au bouton « Mettre à jour », qui l’applique', async () => {
    const pending = holdNextCheck();
    await renderSettings('idle');

    fireEvent.click(getButton(CHECK_LABEL));
    // Le vrai suivi passe à `downloading` avant que la recherche ne rende son issue.
    setStatus('downloading');
    expect(getStatusLine(UPDATE_GROUP)).toHaveTextContent(DOWNLOADING_TEXT);
    await settle(pending, 'found');
    expect(getStatusLine(UPDATE_GROUP)).toHaveTextContent(DOWNLOADING_TEXT);
    expect(getButton(CHECK_LABEL)).toBeInTheDocument();

    setStatus('ready');

    expect(getStatusLine(UPDATE_GROUP)).toHaveTextContent(READY_TEXT);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(getButton(APPLY_LABEL));
    expect(appUpdate.apply).toHaveBeenCalledOnce();
    expect(appUpdate.check).toHaveBeenCalledOnce();
  });

  it('signale un téléchargement qui s’arrête sans laisser de version prête', async () => {
    const pending = holdNextCheck();
    await renderSettings('idle');

    fireEvent.click(getButton(CHECK_LABEL));
    setStatus('downloading');
    await settle(pending, 'found');
    setStatus('idle');

    expect(getAlert(UPDATE_GROUP)).toHaveTextContent(DOWNLOAD_ERROR);
    expect(getStatusLine(UPDATE_GROUP)).toBeEmptyDOMElement();
    expect(getButton(CHECK_LABEL)).toBeInTheDocument();
  });

  it('ne fait pas croire à un échec quand la version prête s’active avant le rechargement', async () => {
    const pending = holdNextCheck();
    await renderSettings('idle');

    fireEvent.click(getButton(CHECK_LABEL));
    setStatus('downloading');
    await settle(pending, 'found');
    setStatus('ready');
    fireEvent.click(getButton(APPLY_LABEL));
    // Le worker en attente s'active : l'inscription retombe à `idle` jusqu'au `controllerchange`.
    setStatus('idle');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getStatusLine(UPDATE_GROUP)).toBeEmptyDOMElement();
  });

  it('oublie aussi une recherche terminée pendant que la version est prête', async () => {
    const pending = holdNextCheck();
    await renderSettings('idle');

    fireEvent.click(getButton(CHECK_LABEL));
    setStatus('ready');
    await settle(pending, 'found');
    setStatus('idle');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getStatusLine(UPDATE_GROUP)).toBeEmptyDOMElement();
  });

  it('signale une recherche impossible, et permet de réessayer', async () => {
    const pending = holdNextCheck();
    await renderSettings('idle');

    fireEvent.click(getButton(CHECK_LABEL));
    await settle(pending, 'unreachable');

    expect(getAlert(UPDATE_GROUP)).toHaveTextContent(CHECK_ERROR);
    expect(getStatusLine(UPDATE_GROUP)).toBeEmptyDOMElement();

    const retry = holdNextCheck();
    fireEvent.click(getButton(CHECK_LABEL));
    expect(appUpdate.check).toHaveBeenCalledTimes(2);
    expect(getStatusLine(UPDATE_GROUP)).toHaveTextContent(CHECKING_TEXT);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await settle(retry, 'up-to-date');

    expect(getStatusLine(UPDATE_GROUP)).toHaveTextContent(UP_TO_DATE_TEXT);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignore les appuis pendant une recherche, sans désactiver le bouton', async () => {
    const pending = holdNextCheck();
    await renderSettings('idle');

    const button = getButton(CHECK_LABEL);
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(appUpdate.check).toHaveBeenCalledOnce();
    expect(button).toBeEnabled();

    await settle(pending, 'up-to-date');

    // Recherche terminée : le bouton répond de nouveau.
    const next = holdNextCheck();
    fireEvent.click(button);
    expect(appUpdate.check).toHaveBeenCalledTimes(2);
    await settle(next, 'up-to-date');
  });

  it('laisse « Mettre à jour » répondre pendant une recherche', async () => {
    const pending = holdNextCheck();
    await renderSettings('idle');

    fireEvent.click(getButton(CHECK_LABEL));
    setStatus('ready');
    fireEvent.click(getButton(APPLY_LABEL));

    expect(appUpdate.apply).toHaveBeenCalledOnce();
    await settle(pending, 'found');
  });

  it('annonce un téléchargement lancé en arrière-plan, sans recherche du joueur', async () => {
    await renderSettings('idle');
    expect(getStatusLine(UPDATE_GROUP)).toBeEmptyDOMElement();

    setStatus('downloading');
    expect(getStatusLine(UPDATE_GROUP)).toHaveTextContent(DOWNLOADING_TEXT);

    // Échec en arrière-plan : aucune recherche à laquelle répondre, le message disparaît.
    setStatus('idle');
    expect(getStatusLine(UPDATE_GROUP)).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Réparation', () => {
  it('demande confirmation avant de réparer', async () => {
    await renderSettings('idle');

    fireEvent.click(getButton(REPAIR_LABEL));

    const dialog = await findDialog(REPAIR_DIALOG);
    expect(dialog).toHaveAccessibleDescription(
      'Mia va retélécharger ses fichiers depuis Internet, puis redémarrer. Les profils, les étoiles et les réglages sont conservés.',
    );
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Réparer' })).toHaveClass('bg-sky-400');
    expect(repairApp).not.toHaveBeenCalled();
  });

  it('annule par le bouton ou par Échap, sans réparer ni quitter l’écran', async () => {
    await renderSettings('idle');

    await openRepairDialog();
    fireEvent.click(
      within(screen.getByRole('dialog', { name: REPAIR_DIALOG })).getByRole('button', {
        name: 'Annuler',
      }),
    );
    await waitForClosed(REPAIR_DIALOG);

    await openRepairDialog();
    expect(press('Escape')).toBe(true);
    await waitForClosed(REPAIR_DIALOG);

    expect(repairApp).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('répare après confirmation : la modale se ferme, sans message d’erreur', async () => {
    await renderSettings('idle');

    fireEvent.click(await openRepairDialog());

    expect(repairApp).toHaveBeenCalledOnce();
    await waitForClosed(REPAIR_DIALOG);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getStatusLine(REPAIR_GROUP)).toBeEmptyDOMElement();
  });

  it('explique un refus faute de connexion, et permet de réessayer', async () => {
    const refused = holdNextRepair();
    await renderSettings('idle');

    fireEvent.click(await openRepairDialog());
    await settle(refused, 'unreachable');

    await waitForClosed(REPAIR_DIALOG);
    expect(getAlert(REPAIR_GROUP)).toHaveTextContent(REPAIR_ERROR);
    expect(getAlert(REPAIR_GROUP)).toHaveClass('text-rose-300');

    // Nouvelle tentative : l'ancien message disparaît dès la confirmation.
    const retry = holdNextRepair();
    fireEvent.click(await openRepairDialog());
    expect(repairApp).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await settle(retry, 'reloading');
    await waitForClosed(REPAIR_DIALOG);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ne répare qu’une fois quand « Réparer » est pressé deux fois de suite', async () => {
    await renderSettings('idle');

    const confirm = await openRepairDialog();
    // Double appui : la modale se ferme au premier, mais ses boutons restent cliquables le temps
    // de l'animation de sortie.
    fireEvent.click(confirm);
    expect(confirm).toBeInTheDocument();
    fireEvent.click(confirm);

    expect(repairApp).toHaveBeenCalledOnce();
    await waitForClosed(REPAIR_DIALOG);
  });

  it('n’annule pas une réparation lancée quand « Annuler » est pressé pendant la fermeture', async () => {
    const pending = holdNextRepair();
    await renderSettings('idle');

    const confirm = await openRepairDialog();
    const cancel = within(screen.getByRole('dialog', { name: REPAIR_DIALOG })).getByRole('button', {
      name: 'Annuler',
    });
    fireEvent.click(confirm);
    expect(cancel).toBeInTheDocument();
    fireEvent.click(cancel);
    await waitForClosed(REPAIR_DIALOG);

    // La réparation court toujours : le bouton reste sans effet.
    fireEvent.click(getButton(REPAIR_LABEL));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await settle(pending, 'unreachable');
    expect(getAlert(REPAIR_GROUP)).toHaveTextContent(REPAIR_ERROR);
  });

  it('ignore « Réparer l’application » pendant une réparation et jusqu’au rechargement', async () => {
    const pending = holdNextRepair();
    await renderSettings('idle');

    fireEvent.click(await openRepairDialog());
    await waitForClosed(REPAIR_DIALOG);

    fireEvent.click(getButton(REPAIR_LABEL));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(repairApp).toHaveBeenCalledOnce();

    // `reloading` : la page va se recharger, rien ne se relance d'ici là.
    await settle(pending, 'reloading');
    fireEvent.click(getButton(REPAIR_LABEL));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(repairApp).toHaveBeenCalledOnce();
  });

  it('propose de nouveau la réparation une fois le refus connu', async () => {
    const pending = holdNextRepair();
    await renderSettings('idle');

    fireEvent.click(await openRepairDialog());
    await waitForClosed(REPAIR_DIALOG);
    fireEvent.click(getButton(REPAIR_LABEL));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await settle(pending, 'unreachable');
    fireEvent.click(getButton(REPAIR_LABEL));

    expect(await findDialog(REPAIR_DIALOG)).toBeInTheDocument();
  });

  it('se pilote à la télécommande : curseur sur Annuler, focus rendu au bouton à la fermeture', async () => {
    const refused = holdNextRepair();
    await renderSettingsOnTv('idle');
    pressTimes('ArrowDown', PRESSES_TO_RESET + 2);
    expect(getButton(REPAIR_LABEL)).toHaveFocus();

    // Retour (Échap) abandonne, sans quitter l'écran.
    expect(press('Enter')).toBe(true);
    const first = await findDialog(REPAIR_DIALOG);
    await waitFor(() => {
      expect(within(first).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    });
    expect(press('Escape')).toBe(true);
    await waitForClosed(REPAIR_DIALOG);
    await waitFor(() => {
      expect(getButton(REPAIR_LABEL)).toHaveFocus();
    });
    expect(router.replace).not.toHaveBeenCalled();

    expect(press('Enter')).toBe(true);
    const second = await findDialog(REPAIR_DIALOG);
    await waitFor(() => {
      expect(within(second).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    });
    press('ArrowRight');
    expect(within(second).getByRole('button', { name: 'Réparer' })).toHaveFocus();
    expect(press('Enter')).toBe(true);
    expect(repairApp).toHaveBeenCalledOnce();
    await settle(refused, 'unreachable');

    await waitForClosed(REPAIR_DIALOG);
    await waitFor(() => {
      expect(getButton(REPAIR_LABEL)).toHaveFocus();
    });
    expect(getAlert(REPAIR_GROUP)).toHaveTextContent(REPAIR_ERROR);
    // Le curseur a suivi : la zone reste active, sur le bouton de réparation.
    expect(getButton(REPAIR_LABEL)).toHaveAttribute('data-focused', 'true');
    press('ArrowUp');
    expect(getButton(CHECK_LABEL)).toHaveFocus();
  });
});

describe('Navigation D-Pad', () => {
  it('s’arrête à « Tout effacer » sans service worker, le reste de la chaîne étant inchangé', async () => {
    await renderSettingsOnTv('unsupported');

    pressTimes('ArrowDown', PRESSES_TO_RESET);
    expect(getButton('Tout effacer')).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Tout effacer')).toHaveFocus();
    expect(getButton('Tout effacer')).toHaveAttribute('data-focused', 'true');
    press('ArrowUp');
    expect(getButton('Importer')).toHaveFocus();
    pressTimes('ArrowUp', 3);
    expect(getButton('Télécharger le fichier')).toHaveFocus();
    press('ArrowUp');
    expect(getLastSettingAboveBackup()).toHaveFocus();
  });

  it('fait défiler la section sans bouton avec Bas depuis « Tout effacer » : le numéro de version reste atteignable', async () => {
    await renderSettingsOnTv('unsupported');
    pressTimes('ArrowDown', PRESSES_TO_RESET);
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');

    press('ArrowDown');

    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(getSection());
    expect(getButton('Tout effacer')).toHaveFocus();
  });

  it('montre tout le groupe du bouton sous le curseur : ligne d’état comprise, rien ne défile plus bas', async () => {
    await renderSettingsOnTv('idle');
    pressTimes('ArrowDown', PRESSES_TO_RESET);
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');

    press('ArrowDown');
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(
      screen.getByRole('group', { name: 'Mises à jour' }),
    );

    press('ArrowDown');
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(
      screen.getByRole('group', { name: 'Réparer' }),
    );
  });

  it('ne fait défiler aucun groupe au toucher', async () => {
    await renderSettings('idle');
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');

    fireEvent.click(getButton(CHECK_LABEL));
    focusElement(getButton(REPAIR_LABEL));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('enchaîne « Tout effacer » et la section dans les deux sens', async () => {
    await renderSettingsOnTv('idle');

    pressTimes('ArrowDown', PRESSES_TO_RESET);
    expect(getButton('Tout effacer')).toHaveFocus();

    press('ArrowDown');
    expect(getButton(CHECK_LABEL)).toHaveFocus();
    expect(getButton(CHECK_LABEL)).toHaveAttribute('data-focused', 'true');
    expect(getButton('Tout effacer')).not.toHaveAttribute('data-focused');

    // Vers le haut : « Tout effacer », pas le haut du panneau de sauvegarde.
    press('ArrowUp');
    expect(getButton('Tout effacer')).toHaveFocus();
    expect(getButton('Tout effacer')).toHaveAttribute('data-focused', 'true');
    expect(getButton(CHECK_LABEL)).not.toHaveAttribute('data-focused');

    press('ArrowDown');
    expect(getButton(CHECK_LABEL)).toHaveFocus();
    press('ArrowDown');
    expect(getButton(REPAIR_LABEL)).toHaveFocus();
    press('ArrowUp');
    expect(getButton(CHECK_LABEL)).toHaveFocus();
    press('ArrowDown');
    press('ArrowUp');
    press('ArrowUp');
    expect(getButton('Tout effacer')).toHaveFocus();

    // Le panneau reprend sa chaîne à partir de « Tout effacer », dans les deux sens.
    press('ArrowUp');
    expect(getButton('Importer')).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Tout effacer')).toHaveFocus();
  });

  it('arrive toujours sur le premier bouton de la section, d’où qu’on l’ait quittée', async () => {
    await renderSettingsOnTv('idle');
    pressTimes('ArrowDown', PRESSES_TO_RESET + 2);
    expect(getButton(REPAIR_LABEL)).toHaveFocus();

    // DOM : « Tout effacer » reprend le focus sans passer par le premier bouton de la section.
    focusElement(getButton('Tout effacer'));
    press('ArrowDown');

    expect(getButton(CHECK_LABEL)).toHaveFocus();
  });

  it('entre toujours par le haut de la sauvegarde en venant du dessus, même après un retour par le bas', async () => {
    await renderSettingsOnTv('idle');
    pressTimes('ArrowDown', PRESSES_TO_RESET + 1);
    press('ArrowUp');
    expect(getButton('Tout effacer')).toHaveFocus();

    // Remonte au-dessus du panneau, puis redescend : premier bouton d'export.
    pressTimes('ArrowUp', 5);
    expect(getLastSettingAboveBackup()).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Télécharger le fichier')).toHaveFocus();
  });

  it('enchaîne de la même façon sans profil actif', async () => {
    await renderSettingsOnTv('idle', familySave({ activeProfileId: null }));

    pressTimes('ArrowDown', PRESSES_TO_RESET_WITHOUT_PROFILE);
    expect(getButton('Tout effacer')).toHaveFocus();
    press('ArrowDown');
    expect(getButton(CHECK_LABEL)).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Tout effacer')).toHaveFocus();
  });

  it.each<[AppUpdateStatus, string]>([
    ['downloading', CHECK_LABEL],
    ['ready', APPLY_LABEL],
  ])('enchaîne de la même façon quand l’état est %s', async (status, label) => {
    await renderSettingsOnTv(status);

    pressTimes('ArrowDown', PRESSES_TO_RESET + 1);
    expect(getButton(label)).toHaveFocus();
    press('ArrowDown');
    expect(getButton(REPAIR_LABEL)).toHaveFocus();
    pressTimes('ArrowUp', 2);
    expect(getButton('Tout effacer')).toHaveFocus();
  });

  it('reste sur place à Gauche, à Droite et sous le dernier bouton', async () => {
    await renderSettingsOnTv('idle');
    pressTimes('ArrowDown', PRESSES_TO_RESET + 1);

    press('ArrowLeft');
    expect(getButton(CHECK_LABEL)).toHaveFocus();
    press('ArrowRight');
    expect(getButton(CHECK_LABEL)).toHaveFocus();
    press('ArrowDown');
    expect(getButton(REPAIR_LABEL)).toHaveFocus();
    press('ArrowDown');
    expect(getButton(REPAIR_LABEL)).toHaveFocus();
    press('ArrowLeft');
    expect(getButton(REPAIR_LABEL)).toHaveFocus();
    press('ArrowRight');
    expect(getButton(REPAIR_LABEL)).toHaveFocus();
  });

  it('active les boutons avec OK : recherche, puis mise à jour une fois la version prête', async () => {
    const pending = holdNextCheck();
    await renderSettingsOnTv('idle');
    pressTimes('ArrowDown', PRESSES_TO_RESET + 1);
    expect(getButton(CHECK_LABEL)).toHaveFocus();

    expect(press('Enter')).toBe(true);
    expect(appUpdate.check).toHaveBeenCalledOnce();
    // Deuxième OK pendant la recherche : ignoré, le bouton garde le focus.
    expect(press('Enter')).toBe(true);
    expect(appUpdate.check).toHaveBeenCalledOnce();
    expect(getButton(CHECK_LABEL)).toHaveFocus();

    await settle(pending, 'found');
    setStatus('ready');

    // Même bouton, nouveau rôle : le curseur y reste.
    expect(getButton(APPLY_LABEL)).toHaveFocus();
    expect(getButton(APPLY_LABEL)).toHaveAttribute('data-focused', 'true');
    expect(press('Enter')).toBe(true);
    expect(appUpdate.apply).toHaveBeenCalledOnce();
    expect(appUpdate.check).toHaveBeenCalledOnce();
  });

  it('revient au Hub avec Retour / Échap depuis les deux boutons', async () => {
    await renderSettingsOnTv('idle');
    pressTimes('ArrowDown', PRESSES_TO_RESET + 1);
    expect(getButton(CHECK_LABEL)).toHaveFocus();

    expect(press('Escape')).toBe(true);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenLastCalledWith('/');

    press('ArrowDown');
    expect(getButton(REPAIR_LABEL)).toHaveFocus();
    expect(press('Backspace')).toBe(true);
    expect(router.replace).toHaveBeenCalledTimes(2);
    expect(router.replace).toHaveBeenLastCalledWith('/');
  });

  it('active la zone du bouton qui reçoit le focus DOM (Tab, clic)', async () => {
    await renderSettingsOnTv('idle');

    focusElement(getButton(REPAIR_LABEL));
    press('ArrowUp');
    expect(getButton(CHECK_LABEL)).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Tout effacer')).toHaveFocus();

    focusElement(getButton(CHECK_LABEL));
    press('ArrowDown');
    expect(getButton(REPAIR_LABEL)).toHaveFocus();
  });
});

describe('describeAppUpdate', () => {
  const READY: SettingsFeedbackMessage = { tone: 'success', text: READY_TEXT };
  const DOWNLOADING: SettingsFeedbackMessage = { tone: 'info', text: DOWNLOADING_TEXT };
  const CHECKING: SettingsFeedbackMessage = { tone: 'info', text: CHECKING_TEXT };
  const UP_TO_DATE: SettingsFeedbackMessage = { tone: 'success', text: UP_TO_DATE_TEXT };
  const UNREACHABLE: SettingsFeedbackMessage = { tone: 'error', text: CHECK_ERROR };
  const DOWNLOAD_FAILED: SettingsFeedbackMessage = { tone: 'error', text: DOWNLOAD_ERROR };

  it.each<
    [string, AppUpdateStatus, AppUpdateCheckResult | null, boolean, SettingsFeedbackMessage | null]
  >([
    ['version prête', 'ready', null, false, READY],
    ['téléchargement', 'downloading', null, false, DOWNLOADING],
    ['recherche en cours', 'idle', null, true, CHECKING],
    ['dernière recherche : à jour', 'idle', 'up-to-date', false, UP_TO_DATE],
    ['dernière recherche : réseau injoignable', 'idle', 'unreachable', false, UNREACHABLE],
    ['dernière recherche : version trouvée, état retombé', 'idle', 'found', false, DOWNLOAD_FAILED],
    ['aucune recherche', 'idle', null, false, null],
    ['sans service worker', 'unsupported', null, false, null],
    ['version prête, avant une recherche en cours', 'ready', 'found', true, READY],
    ['version prête, avant une recherche échouée', 'ready', 'unreachable', false, READY],
    ['téléchargement, avant une recherche en cours', 'downloading', 'found', true, DOWNLOADING],
    ['téléchargement, avant une recherche à jour', 'downloading', 'up-to-date', false, DOWNLOADING],
    ['recherche en cours, avant la précédente à jour', 'idle', 'up-to-date', true, CHECKING],
    ['recherche en cours, avant la précédente échouée', 'idle', 'unreachable', true, CHECKING],
    ['recherche en cours, avant la précédente trouvée', 'idle', 'found', true, CHECKING],
  ])('%s', (_case, status, lastCheck, isChecking, expected) => {
    expect(describeAppUpdate(status, lastCheck, isChecking)).toEqual(expected);
  });
});

describe('SettingsFeedback', () => {
  it.each<[SettingsFeedbackMessage['tone'], string]>([
    ['success', 'text-emerald-300'],
    ['info', 'text-slate-300'],
  ])('annonce le ton %s dans la région persistante', (tone, colorClass) => {
    render(<SettingsFeedback message={{ tone, text: 'Message' }} />);

    const line = screen.getByRole('status');
    expect(line).toHaveTextContent('Message');
    expect(line).toHaveClass(colorClass);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('affiche une erreur en alerte, la région persistante restant vide', () => {
    render(<SettingsFeedback message={{ tone: 'error', text: 'Message' }} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Message');
    expect(screen.getByRole('alert')).toHaveClass('text-rose-300');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('garde la région persistante sans message', () => {
    render(<SettingsFeedback message={null} />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
