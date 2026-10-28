import { AvatarBadge, ProfileSelectorModal } from '@/components/profile';
import { NavigationProvider } from '@/core/navigation';
import {
  AVATARS,
  createDefaultSaveState,
  DEFAULT_DEVICE_SETTINGS,
  MAX_PROFILES,
  PROFILE_LIMIT_MESSAGE,
  PROFILE_NAME_ERROR_MESSAGES,
  STORAGE_KEY,
  StorageProvider,
  useMiaStorage,
  useProfileGate,
} from '@/core/storage';
import type { LevelCompletion, MiaSaveState, UserProfile } from '@/types/mia';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Plateforme Web : la sauvegarde vit dans localStorage, Preferences n'est jamais appelé.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: vi.fn(), set: vi.fn() } }));

const CREATED_AT = '2026-10-01T09:00:00.000Z';
const SELECTOR_TITLE = 'Qui joue aujourd’hui ?';

function completed(levelId: string): LevelCompletion {
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
  const levels = Array.from({ length: stars }, (_, index) => completed(`mem-00${String(index)}`));
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

/** Famille de 3 profils, Léo actif ; grille de repli à 2 colonnes : [Mia, Léo] / [Mamie, +]. */
function familySave(overrides: Partial<MiaSaveState> = {}): MiaSaveState {
  return {
    ...createDefaultSaveState(),
    activeProfileId: 'p2',
    profiles: [
      player('p1', 'Mia', 'fox', 2),
      player('p2', 'Léo', 'cat', 1),
      player('p3', 'Mamie', 'owl'),
    ],
    ...overrides,
  };
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
  return { ...save, settings: { ...DEFAULT_DEVICE_SETTINGS, tvModeOverride: 'always_tv' } };
}

/** Appuie sur une touche (cible : élément focalisé) ; `true` si le moteur l'a consommée. */
function press(key: string, target: Element = document.activeElement ?? document.body): boolean {
  return !fireEvent.keyDown(target, { key });
}

function getButton(name: string | RegExp): HTMLElement {
  return screen.getByRole('button', { name });
}

/** Libellés des éléments qui portent l'anneau de focus du moteur D-Pad. */
function ringed(): (string | null)[] {
  return Array.from(document.querySelectorAll('[data-focused]'), (element) => {
    if (element instanceof HTMLInputElement) return element.labels?.[0]?.textContent ?? null;
    return element.getAttribute('aria-label') ?? element.textContent;
  });
}

function getActivePlayer(): string {
  return screen.getByRole('status', { name: 'Joueur actif' }).textContent;
}

function getDialog(name: string): HTMLElement {
  return screen.getByRole('dialog', { name });
}

/**
 * Écran racine type (FEAT-08) : `useProfileGate` garantit un profil et impose le choix du joueur
 * quand aucun n'est actif (modale sans `onClose`).
 */
function Screen({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const { isLoaded, activeProfile, resetAllData } = useMiaStorage();
  const { mustChooseProfile } = useProfileGate();
  const close = () => {
    setIsOpen(false);
  };

  return (
    <>
      <output aria-label="Joueur actif">
        {isLoaded ? (activeProfile?.name ?? 'aucun') : 'chargement'}
      </output>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        Changer de joueur
      </button>
      <button type="button" onClick={close}>
        Fermer depuis l’écran
      </button>
      <button type="button" onClick={() => void resetAllData()}>
        Tout effacer
      </button>
      {isLoaded ? (
        <ProfileSelectorModal
          isOpen={isOpen || mustChooseProfile}
          onClose={mustChooseProfile ? undefined : close}
        />
      ) : null}
    </>
  );
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <StorageProvider>
      <NavigationProvider>{children}</NavigationProvider>
    </StorageProvider>
  );
}

/** Monte l'écran sur la sauvegarde donnée et attend son chargement. */
async function renderScreen(save: MiaSaveState | null, initiallyOpen = true): Promise<void> {
  if (save) storeSave(save);
  render(<Screen initiallyOpen={initiallyOpen} />, { wrapper: Providers });
  await waitFor(() => {
    expect(getActivePlayer()).not.toBe('chargement');
  });
}

async function waitForClosed(name: string): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument();
  });
}

async function openNewProfileForm(): Promise<HTMLElement> {
  fireEvent.click(getButton('Nouveau joueur'));
  return screen.findByRole('dialog', { name: 'Nouveau joueur' });
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.tv;
  vi.restoreAllMocks();
});

describe('AvatarBadge', () => {
  it('dessine l’avatar dans son cercle de couleur, décoratif par défaut', () => {
    const { container } = render(<AvatarBadge avatarId="fox" />);

    const badge = container.querySelector('[data-avatar="fox"]');
    expect(badge).toHaveClass('bg-orange-400', 'text-slate-950', 'size-12', 'rounded-full');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(badge?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('dessine une icône vectorielle pour chacun des 8 avatars', () => {
    for (const avatar of AVATARS) {
      const { container, unmount } = render(<AvatarBadge avatarId={avatar.id} size="sm" />);
      expect(container.querySelector(`[data-avatar="${avatar.id}"] svg`)).toBeInTheDocument();
      unmount();
    }
  });

  it('se replie sur une silhouette neutre pour un avatar inconnu', () => {
    const { container } = render(<AvatarBadge avatarId="dragon" />);

    expect(container.querySelector('[data-avatar="unknown"]')).toHaveClass('bg-slate-700');
  });

  it('se vocalise quand il reçoit un libellé, à la taille demandée', () => {
    render(<AvatarBadge avatarId="owl" label="Chouette sage" size="lg" />);

    expect(screen.getByRole('img', { name: 'Chouette sage' })).toHaveClass('size-16');
  });
});

describe('useProfileGate', () => {
  it('crée « Joueur 1 » au premier lancement, sans ouvrir le choix du joueur', async () => {
    await renderScreen(null, false);

    await waitFor(() => {
      expect(getActivePlayer()).toBe('Joueur 1');
    });
    expect(readSave().profiles).toMatchObject([{ name: 'Joueur 1', avatarId: 'fox' }]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('recrée « Joueur 1 » après une réinitialisation', async () => {
    await renderScreen(familySave(), false);

    fireEvent.click(getButton('Tout effacer'));

    await waitFor(() => {
      expect(getActivePlayer()).toBe('Joueur 1');
    });
    expect(readSave().profiles).toHaveLength(1);
  });

  it('impose le choix du joueur quand aucun profil n’est actif', async () => {
    await renderScreen(familySave({ activeProfileId: null }), false);

    const dialog = getDialog(SELECTOR_TITLE);
    expect(screen.queryByRole('button', { name: 'Fermer' })).not.toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(getButton(/^Mamie/));

    await waitForClosed(SELECTOR_TITLE);
    expect(getActivePlayer()).toBe('Mamie');
  });
});

describe('ProfileSelectorModal : choix du joueur', () => {
  it('affiche avatar, prénom et étoiles de chaque profil, le profil actif signalé', async () => {
    await renderScreen(familySave());

    const dialog = getDialog(SELECTOR_TITLE);
    expect(dialog).toHaveAccessibleDescription('Chaque joueur suit ses propres étoiles.');
    const cards = within(dialog).getAllByRole('button', { name: /étoile|Nouveau/ });
    expect(cards).toHaveLength(4);
    ['Mia 2 étoiles', 'Léo 1 étoile', 'Mamie 0 étoile', 'Nouveau joueur'].forEach((name, index) => {
      expect(cards[index]).toHaveAccessibleName(name);
    });
    expect(getButton('Mia 2 étoiles')).not.toHaveAttribute('aria-current');
    expect(getButton('Léo 1 étoile')).toHaveAttribute('aria-current', 'true');
    expect(getButton('Mamie 0 étoile').querySelector('[data-avatar="owl"]')).toBeInTheDocument();
    expect(getButton('Gérer les profils')).toBeInTheDocument();
  });

  it('change de joueur au doigt puis se ferme', async () => {
    await renderScreen(familySave());

    fireEvent.click(getButton('Mia 2 étoiles'));

    await waitForClosed(SELECTOR_TITLE);
    expect(getActivePlayer()).toBe('Mia');
    await waitFor(() => {
      expect(readSave().activeProfileId).toBe('p1');
    });
  });

  it('se pilote à la télécommande : curseur sur le joueur actif, flèches, OK', async () => {
    await renderScreen(forceTvMode(familySave()));

    await waitFor(() => {
      expect(getButton('Léo 1 étoile')).toHaveFocus();
    });
    expect(ringed()).toEqual(['Léo 1']);

    expect(press('ArrowLeft')).toBe(true);
    expect(ringed()).toEqual(['Mia 2']);
    press('ArrowDown');
    expect(getButton('Mamie 0 étoile')).toHaveFocus();

    expect(press('Enter')).toBe(true);
    await waitForClosed(SELECTOR_TITLE);
    expect(getActivePlayer()).toBe('Mamie');
  });

  it('ferme sans changer de joueur avec Échap ou Retour', async () => {
    await renderScreen(familySave());

    fireEvent.keyDown(getDialog(SELECTOR_TITLE), { key: 'Escape' });
    await waitForClosed(SELECTOR_TITLE);

    fireEvent.click(getButton('Changer de joueur'));
    getDialog(SELECTOR_TITLE).focus();
    expect(press('Backspace')).toBe(true);
    await waitForClosed(SELECTOR_TITLE);

    expect(getActivePlayer()).toBe('Léo');
  });

  it('passe au bouton de gestion par le bas de la grille, et revient', async () => {
    await renderScreen(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getButton('Léo 1 étoile')).toHaveFocus();
    });

    press('ArrowDown');
    expect(ringed()).toEqual(['Nouveau joueur']);
    press('ArrowDown');
    expect(getButton('Gérer les profils')).toHaveFocus();
    expect(ringed()).toEqual(['Gérer les profils']);
    press('ArrowDown');
    expect(getButton('Gérer les profils')).toHaveFocus();

    press('ArrowUp');
    expect(getButton('Nouveau joueur')).toHaveFocus();
  });

  it('suit le focus clavier (Tab) d’une zone à l’autre', async () => {
    await renderScreen(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getButton('Léo 1 étoile')).toHaveFocus();
    });

    getButton('Gérer les profils').focus();
    press('ArrowUp');
    expect(getButton('Léo 1 étoile')).toHaveFocus();
  });

  it('ne propose plus « Nouveau joueur » au-delà de 8 profils', async () => {
    const profiles = Array.from({ length: MAX_PROFILES }, (_, index) =>
      player(`p${String(index)}`, `Joueur ${String(index + 1)}`, 'star'),
    );
    await renderScreen(familySave({ activeProfileId: 'p0', profiles }));

    expect(screen.queryByRole('button', { name: 'Nouveau joueur' })).not.toBeInTheDocument();
    expect(screen.getByText(PROFILE_LIMIT_MESSAGE)).toBeInTheDocument();
  });
});

describe('ProfileSelectorModal : création rapide', () => {
  it('crée un profil d’un prénom rapide, avec le premier avatar libre proposé', async () => {
    await renderScreen(familySave());

    const form = await openNewProfileForm();
    const quickNames = within(form).getByRole('group', { name: 'Prénoms rapides' });
    expect(
      within(quickNames)
        .getAllByRole('button')
        .map((chip) => chip.textContent),
    ).toEqual(['Joueur 1', 'Joueur 2', 'Parents', 'Enfants', 'Invité']);
    // Renard, chat et chouette sont pris : le robot est proposé.
    expect(within(form).getByRole('button', { name: 'Robot logique' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(within(quickNames).getByRole('button', { name: 'Parents' }));
    expect(within(form).getByRole('textbox', { name: 'Prénom' })).toHaveValue('Parents');
    expect(within(quickNames).getByRole('button', { name: 'Parents' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(form).getByRole('button', { name: 'Créer' }));

    await waitForClosed(SELECTOR_TITLE);
    await waitForClosed('Nouveau joueur');
    expect(getActivePlayer()).toBe('Parents');
    await waitFor(() => {
      expect(readSave().profiles.at(-1)).toMatchObject({ name: 'Parents', avatarId: 'robot' });
    });
  });

  it('enchaîne prénom rapide, avatar et Créer à la télécommande', async () => {
    await renderScreen(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getButton('Léo 1 étoile')).toHaveFocus();
    });

    press('ArrowDown');
    press('Enter');
    await screen.findByRole('dialog', { name: 'Nouveau joueur' });
    await waitFor(() => {
      expect(getButton('Joueur 1')).toHaveFocus();
    });

    // OK sur un prénom : le curseur passe à l'avatar proposé.
    press('Enter');
    expect(getButton('Robot logique')).toHaveFocus();
    press('ArrowRight');
    press('Enter');
    expect(getButton('Fusée spatiale')).toHaveAttribute('aria-pressed', 'true');
    press('ArrowDown');
    press('ArrowDown');
    expect(ringed()).toEqual(['Créer']);
    press('Enter');

    await waitForClosed(SELECTOR_TITLE);
    expect(getActivePlayer()).toBe('Joueur 1');
    expect(readSave().profiles.at(-1)).toMatchObject({ name: 'Joueur 1', avatarId: 'rocket' });
  });

  it('enchaîne les zones du formulaire par leurs bords, de haut en bas et retour', async () => {
    await renderScreen(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getButton('Léo 1 étoile')).toHaveFocus();
    });
    press('ArrowDown');
    press('Enter');
    await waitFor(() => {
      expect(getButton('Joueur 1')).toHaveFocus();
    });

    // Prénoms rapides sur 2 colonnes (repli jsdom) : [Joueur 1, Joueur 2] [Parents, Enfants] [Invité].
    press('ArrowLeft');
    expect(getButton('Joueur 1')).toHaveFocus();
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    // Avatars sur 4 colonnes : le curseur part de l'avatar proposé.
    expect(getButton('Robot logique')).toHaveFocus();
    press('ArrowLeft');
    press('ArrowLeft');
    press('ArrowLeft');
    expect(getButton('Renard rusé')).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Invité')).toHaveFocus();
    press('ArrowDown');
    press('ArrowDown');
    expect(getButton('Chat agile')).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Créer')).toHaveFocus();
    press('ArrowLeft');
    press('ArrowLeft');
    expect(getButton('Annuler')).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Chat agile')).toHaveFocus();

    for (let step = 0; step < 5; step += 1) press('ArrowUp');
    expect(screen.getByRole('textbox', { name: 'Prénom' })).toHaveFocus();
    press('ArrowUp');
    expect(screen.getByRole('textbox', { name: 'Prénom' })).toHaveFocus();
    press('ArrowDown');
    expect(getButton('Joueur 1')).toHaveFocus();
  });

  it('sans prénom rapide libre, part du champ prénom', async () => {
    const takenNames = ['Mia', 'Joueur 1', 'Joueur 2', 'Parents', 'Enfants', 'Invité'];
    const profiles = takenNames.map((name, index) =>
      player(`p${String(index)}`, name, AVATARS[index]?.id ?? 'fox'),
    );
    await renderScreen(forceTvMode(familySave({ activeProfileId: 'p0', profiles })));
    await waitFor(() => {
      expect(getButton('Mia 0 étoile')).toHaveFocus();
    });

    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    press('Enter');
    const form = await screen.findByRole('dialog', { name: 'Nouveau joueur' });
    const field = within(form).getByRole('textbox', { name: 'Prénom' });

    expect(within(form).queryByRole('group', { name: 'Prénoms rapides' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    press('ArrowDown');
    // Six avatars pris : l'étoile filante est proposée.
    expect(getButton('Étoile filante')).toHaveFocus();
    press('ArrowUp');
    press('ArrowUp');
    expect(field).toHaveFocus();

    fireEvent.click(within(form).getByRole('button', { name: 'Créer' }));
    expect(within(form).getByRole('alert')).toHaveTextContent(PROFILE_NAME_ERROR_MESSAGES.empty);
    expect(field).toHaveFocus();
  });

  it('signale le nombre maximal de profils atteint depuis un autre onglet', async () => {
    const profiles = Array.from({ length: MAX_PROFILES - 1 }, (_, index) =>
      player(`p${String(index)}`, `Joueur ${String(index + 1)}`, 'star'),
    );
    const save = familySave({ activeProfileId: 'p0', profiles });
    await renderScreen(save);
    const form = await openNewProfileForm();

    const fullSave = { ...save, profiles: [...profiles, player('p7', 'Papi', 'owl')] };
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: JSON.stringify(fullSave),
          storageArea: localStorage,
        }),
      );
    });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Prénom' }), {
      target: { value: 'Zoé' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Créer' }));

    expect(within(form).getByRole('alert')).toHaveTextContent(PROFILE_LIMIT_MESSAGE);
    expect(screen.queryByRole('button', { name: /Zoé/ })).not.toBeInTheDocument();
  });

  it('resserre ses espacements en mode TV pour tenir sur un écran de 960 × 540', async () => {
    await renderScreen(familySave());
    const form = await openNewProfileForm();

    // Classes vérifiées par nom : jsdom ne calcule pas la mise en page (hauteur mesurée dans Chromium).
    expect(form).toHaveClass('tv:max-w-3xl', 'tv:gap-4', 'tv:p-6');
    expect(within(form).getByRole('textbox', { name: 'Prénom' })).toHaveClass('tv:min-h-14');
  });

  it('refuse un prénom vide ou déjà pris, avec un message', async () => {
    await renderScreen(familySave());
    const form = await openNewProfileForm();
    const create = within(form).getByRole('button', { name: 'Créer' });
    const field = within(form).getByRole('textbox', { name: 'Prénom' });

    fireEvent.click(create);
    expect(within(form).getByRole('alert')).toHaveTextContent(PROFILE_NAME_ERROR_MESSAGES.empty);

    fireEvent.change(field, { target: { value: 'mía' } });
    expect(within(form).queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(create);

    expect(within(form).getByRole('alert')).toHaveTextContent(
      PROFILE_NAME_ERROR_MESSAGES.duplicate,
    );
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(PROFILE_NAME_ERROR_MESSAGES.duplicate);
    expect(readSave().profiles).toHaveLength(3);
  });

  it('guide le joueur vers les prénoms rapides, puis le champ, après un refus au D-Pad', async () => {
    await renderScreen(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getButton('Léo 1 étoile')).toHaveFocus();
    });
    press('ArrowDown');
    press('Enter');
    await waitFor(() => {
      expect(getButton('Joueur 1')).toHaveFocus();
    });

    fireEvent.click(getButton('Créer'));
    expect(getButton('Joueur 1')).toHaveFocus();

    fireEvent.change(screen.getByRole('textbox', { name: 'Prénom' }), {
      target: { value: 'MAMIE' },
    });
    fireEvent.click(getButton('Créer'));
    expect(screen.getByRole('textbox', { name: 'Prénom' })).toHaveFocus();
  });

  it('laisse les touches d’édition au champ prénom ; Haut / Bas en sortent', async () => {
    await renderScreen(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getButton('Léo 1 étoile')).toHaveFocus();
    });
    press('ArrowDown');
    press('Enter');
    await waitFor(() => {
      expect(getButton('Joueur 1')).toHaveFocus();
    });

    press('ArrowUp');
    const field = screen.getByRole('textbox', { name: 'Prénom' });
    expect(field).toHaveFocus();
    expect(ringed()).toEqual(['Prénom']);
    for (const key of ['ArrowLeft', 'ArrowRight', 'Backspace', ' ', 'Enter']) {
      expect(press(key)).toBe(false);
    }
    expect(screen.getByRole('dialog', { name: 'Nouveau joueur' })).toBeInTheDocument();

    press('ArrowDown');
    expect(getButton('Joueur 1')).toHaveFocus();
  });

  it('au doigt, Entrée dans le champ passe au bouton Créer', async () => {
    await renderScreen(familySave());
    const form = await openNewProfileForm();
    const field = within(form).getByRole('textbox', { name: 'Prénom' });

    fireEvent.change(field, { target: { value: '  Zoé ' } });
    expect(press('Enter', field)).toBe(true);
    const create = within(form).getByRole('button', { name: 'Créer' });
    expect(create).toHaveFocus();
    fireEvent.click(create);

    await waitForClosed(SELECTOR_TITLE);
    expect(getActivePlayer()).toBe('Zoé');
  });

  it('Annuler, Échap et Retour ferment le formulaire seul', async () => {
    await renderScreen(familySave());

    let form = await openNewProfileForm();
    fireEvent.click(within(form).getByRole('button', { name: 'Annuler' }));
    await waitForClosed('Nouveau joueur');

    form = await openNewProfileForm();
    fireEvent.keyDown(form, { key: 'Escape' });
    await waitForClosed('Nouveau joueur');

    form = await openNewProfileForm();
    form.focus();
    expect(press('Backspace')).toBe(true);
    await waitForClosed('Nouveau joueur');

    expect(getDialog(SELECTOR_TITLE)).toBeInTheDocument();
    expect(readSave().profiles).toHaveLength(3);
  });

  it('rend le curseur et le focus à « Nouveau joueur » quand le formulaire se ferme', async () => {
    await renderScreen(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getButton('Léo 1 étoile')).toHaveFocus();
    });
    press('ArrowDown');
    press('Enter');
    await waitFor(() => {
      expect(getButton('Joueur 1')).toHaveFocus();
    });

    press('Backspace');

    await waitForClosed('Nouveau joueur');
    await waitFor(() => {
      expect(getButton('Nouveau joueur')).toHaveFocus();
    });
    expect(ringed()).toEqual(['Nouveau joueur']);
  });
});

describe('ProfileSelectorModal : gestion des profils', () => {
  async function openManagement(): Promise<void> {
    fireEvent.click(getButton('Gérer les profils'));
    await screen.findByRole('dialog', { name: 'Gérer les profils' });
  }

  it('supprime un profil après confirmation et reste en mode gestion', async () => {
    await renderScreen(familySave());
    await openManagement();

    expect(getDialog('Gérer les profils')).toHaveAccessibleDescription(
      'Sélectionner le profil à supprimer.',
    );
    expect(screen.queryByRole('button', { name: 'Nouveau joueur' })).not.toBeInTheDocument();

    fireEvent.click(getButton('Supprimer Mamie 0 étoile'));
    let confirm = await screen.findByRole('dialog', { name: 'Supprimer « Mamie » ?' });
    expect(confirm).toHaveAccessibleDescription('Ce profil n’a encore gagné aucune étoile.');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Annuler' }));
    await waitForClosed('Supprimer « Mamie » ?');
    expect(getButton('Supprimer Mamie 0 étoile')).toBeInTheDocument();

    // Comme Chrome au doigt : la carte touchée prend le focus, rendu à la fermeture de la confirmation.
    getButton('Supprimer Mamie 0 étoile').focus();
    fireEvent.click(getButton('Supprimer Mamie 0 étoile'));
    confirm = await screen.findByRole('dialog', { name: 'Supprimer « Mamie » ?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Supprimer' }));

    await waitForClosed('Supprimer « Mamie » ?');
    expect(screen.queryByRole('button', { name: /Mamie/ })).not.toBeInTheDocument();
    expect(getDialog('Gérer les profils')).toBeInTheDocument();
    // La carte supprimée ne peut plus reprendre le focus : il reste dans la modale.
    expect(getButton('Terminé')).toHaveFocus();
    await waitFor(() => {
      expect(readSave().profiles.map((profile) => profile.name)).toEqual(['Mia', 'Léo']);
    });
  });

  it('à la télécommande, la confirmation part d’« Annuler »', async () => {
    await renderScreen(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getButton('Léo 1 étoile')).toHaveFocus();
    });

    press('ArrowDown');
    press('ArrowDown');
    press('Enter');
    await screen.findByRole('dialog', { name: 'Gérer les profils' });
    expect(getButton('Terminé')).toHaveFocus();
    // Sans la carte « Nouveau joueur », le curseur revient sur la dernière carte : Mamie.
    press('ArrowUp');
    expect(getButton('Supprimer Mamie 0 étoile')).toHaveFocus();
    press('Enter');

    const confirm = await screen.findByRole('dialog', { name: 'Supprimer « Mamie » ?' });
    await waitFor(() => {
      expect(within(confirm).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    });
    press('ArrowRight');
    press('Enter');

    await waitForClosed('Supprimer « Mamie » ?');
    expect(readSave().profiles).toHaveLength(2);
    await waitFor(() => {
      expect(getButton('Supprimer Léo 1 étoile')).toHaveFocus();
    });
  });

  it('supprimer le joueur actif donne la main au premier profil restant', async () => {
    await renderScreen(familySave());
    await openManagement();

    fireEvent.click(getButton('Supprimer Léo 1 étoile'));
    const confirm = await screen.findByRole('dialog', { name: 'Supprimer « Léo » ?' });
    expect(confirm).toHaveAccessibleDescription('Son étoile sera perdue.');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => {
      expect(getActivePlayer()).toBe('Mia');
    });
  });

  it('remplace le dernier profil par un « Joueur 1 » vide, annoncé dans la confirmation', async () => {
    await renderScreen(
      familySave({ activeProfileId: 'p1', profiles: [player('p1', 'Mia', 'fox', 2)] }),
    );
    await openManagement();

    fireEvent.click(getButton('Supprimer Mia 2 étoiles'));
    const confirm = await screen.findByRole('dialog', { name: 'Supprimer « Mia » ?' });
    expect(confirm).toHaveAccessibleDescription(
      'Ses 2 étoiles seront perdues. Un profil « Joueur 1 » vide le remplacera.',
    );
    fireEvent.click(within(confirm).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => {
      expect(getActivePlayer()).toBe('Joueur 1');
    });
    expect(readSave().profiles).toMatchObject([{ name: 'Joueur 1', avatarId: 'fox' }]);
  });

  it('Retour, Échap et Terminé reviennent au choix du joueur', async () => {
    await renderScreen(familySave());

    await openManagement();
    getDialog('Gérer les profils').focus();
    expect(press('Backspace')).toBe(true);
    expect(getDialog(SELECTOR_TITLE)).toBeInTheDocument();

    await openManagement();
    fireEvent.keyDown(getDialog('Gérer les profils'), { key: 'Escape' });
    expect(getDialog(SELECTOR_TITLE)).toBeInTheDocument();

    await openManagement();
    fireEvent.click(getButton('Terminé'));
    expect(getDialog(SELECTOR_TITLE)).toBeInTheDocument();
    expect(getButton('Nouveau joueur')).toBeInTheDocument();
  });

  it('chaque ouverture repart du choix du joueur', async () => {
    await renderScreen(familySave());
    await openManagement();

    fireEvent.click(getButton('Fermer depuis l’écran'));
    await waitForClosed('Gérer les profils');
    fireEvent.click(getButton('Changer de joueur'));

    expect(await screen.findByRole('dialog', { name: SELECTOR_TITLE })).toBeInTheDocument();
  });
});
