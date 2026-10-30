import { HubScreen } from '@/components/progression';
import { NavigationProvider } from '@/core/navigation';
import { GAME_REGISTRY, type BaseLevelDefinition, type GameManifest } from '@/core/progression';
import { appUpdate, type AppUpdateStatus } from '@/core/pwa';
import {
  createDefaultSaveState,
  DEFAULT_DEVICE_SETTINGS,
  STORAGE_KEY,
  StorageProvider,
} from '@/core/storage';
import type { GameId, MiaSaveState } from '@/types/mia';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Plateforme Web : la sauvegarde vit dans localStorage, Preferences n'est jamais appelé.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: vi.fn(), set: vi.fn() } }));

const { router, updateStatus } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let status: AppUpdateStatus = 'unsupported';
  return {
    router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
    /** Statut simulé : le Hub s'y abonne comme le vrai hook suit `appUpdate`. */
    updateStatus: {
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
    },
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock('@/core/pwa/useAppUpdateStatus', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useAppUpdateStatus: () => useSyncExternalStore(updateStatus.subscribe, updateStatus.get),
  };
});

const TITLE = 'Nouvelle version disponible';
const NOTE = 'Tes profils et tes étoiles sont conservés.';
const UPDATE_BUTTON = 'Mettre à jour';
const GOAL = 'Commencer (Étoile #1)';
const MAP = 'Carte des Étoiles';

/** Sans le bandeau, avec ou sans service worker : le Hub ne doit rien en montrer. */
const NOT_READY_STATUSES: readonly AppUpdateStatus[] = ['unsupported', 'idle', 'downloading'];

function definition(gameId: GameId, id: string): BaseLevelDefinition {
  return { id, gameId, tier: 'very_easy', order: 10, config: {} };
}

/** Deux jeux d'une étoile : chaque carte a ses deux actions (objectif, Carte des Étoiles). */
const TEST_GAMES: readonly GameManifest[] = [
  { ...GAME_REGISTRY.memory, catalog: [definition('memory', 'mem-001')] },
  { ...GAME_REGISTRY['traffic-jam'], catalog: [definition('traffic-jam', 'tj-001')] },
];

function Providers({ children }: { children: ReactNode }) {
  return (
    <StorageProvider>
      <NavigationProvider>{children}</NavigationProvider>
    </StorageProvider>
  );
}

/** Monte le Hub sur la sauvegarde donnée (`null` : premier lancement, « Joueur 1 » est créé). */
async function renderHub(
  save: MiaSaveState | null,
  games: readonly GameManifest[] = TEST_GAMES,
): Promise<void> {
  if (save) localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  render(<HubScreen games={games} />, { wrapper: Providers });
  await waitFor(() => {
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument();
  });
}

/** Mode TV forcé avant le montage : le moteur D-Pad démarre en mode `dpad`. */
function tvSave(): MiaSaveState {
  document.documentElement.dataset.tv = 'on';
  return {
    ...createDefaultSaveState(),
    settings: { ...DEFAULT_DEVICE_SETTINGS, tvModeOverride: 'always_tv' },
  };
}

/** Hub à la télécommande, curseur posé sur l'objectif de la première carte. */
async function renderTvHub(status: AppUpdateStatus): Promise<void> {
  updateStatus.set(status);
  await renderHub(tvSave());
  await waitFor(() => {
    expect(getCardButton('Memory', GOAL)).toHaveFocus();
  });
}

/** Le statut change Hub monté : rendu et effets (focus DOM du curseur) sont appliqués au retour. */
function setStatus(status: AppUpdateStatus): void {
  act(() => {
    updateStatus.set(status);
  });
}

/** Appuie sur une touche (cible : élément focalisé) ; `true` si le moteur D-Pad l'a consommée. */
function press(key: string): boolean {
  return !fireEvent.keyDown(document.activeElement ?? document.body, { key });
}

function getCardButton(title: string, name: string): HTMLElement {
  return within(screen.getByRole('article', { name: title })).getByRole('button', { name });
}

function getUpdateButton(): HTMLElement {
  return screen.getByRole('button', { name: UPDATE_BUTTON });
}

function getProfileButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Joueur : Joueur 1' });
}

function getSettingsButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Réglages' });
}

/** jsdom ne lit pas Tailwind : gabarit à deux colonnes simulé pour la grille des jeux du Hub. */
function simulateTwoGameColumns(): void {
  const realGetComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
    if (!element.classList.contains('md:grid-cols-2')) {
      return realGetComputedStyle(element, pseudoElement);
    }
    return {
      getPropertyValue: (property: string) =>
        property === 'grid-template-columns' ? '320px 320px' : '',
    } as unknown as CSSStyleDeclaration;
  });
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  // Ici plutôt qu'en `afterEach` : aucun Hub n'est monté, personne n'écoute le changement.
  updateStatus.set('unsupported');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  delete document.documentElement.dataset.tv;
});

describe('Bandeau de mise à jour du Hub', () => {
  describe('affichage', () => {
    it.each(NOT_READY_STATUSES)(
      'reste masqué tant qu’aucune version n’est prête (%s)',
      async (status) => {
        updateStatus.set(status);
        await renderHub(null);

        expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
        expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: UPDATE_BUTTON })).not.toBeInTheDocument();
      },
    );

    it('s’affiche en tête du Hub, au-dessus des cartes, quand une version est prête', async () => {
      updateStatus.set('ready');
      await renderHub(null);

      const main = screen.getByRole('main');
      expect(main).toHaveTextContent(/^Nouvelle version disponible/);
      expect(within(main).getByText(NOTE)).toBeInTheDocument();
      expect(getUpdateButton().compareDocumentPosition(getCardButton('Memory', GOAL))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it('apparaît quand le téléchargement se termine, sans recharger le Hub', async () => {
      updateStatus.set('downloading');
      await renderHub(null);

      setStatus('ready');

      expect(screen.getByText(TITLE)).toBeInTheDocument();
      expect(getUpdateButton()).toBeInTheDocument();
    });

    it('n’offre aucune fermeture : « Mettre à jour » est son seul bouton', async () => {
      updateStatus.set('ready');
      await renderHub(null);

      const outsideCards = within(screen.getByRole('main'))
        .getAllByRole('button')
        .filter((button) => !button.closest('article'));

      expect(outsideCards).toEqual([getUpdateButton()]);
    });

    it('rappelle au lecteur d’écran, sur le bouton, que la progression est conservée', async () => {
      updateStatus.set('ready');
      await renderHub(null);

      expect(getUpdateButton()).toHaveAccessibleDescription(NOTE);
    });
  });

  describe('mise à jour', () => {
    it('lance la mise à jour une seule fois au clic', async () => {
      const apply = vi.spyOn(appUpdate, 'apply');
      updateStatus.set('ready');
      await renderHub(null);

      expect(apply).not.toHaveBeenCalled();
      fireEvent.click(getUpdateButton());

      expect(apply).toHaveBeenCalledOnce();
    });

    it('lance la mise à jour une seule fois avec OK de la télécommande', async () => {
      const apply = vi.spyOn(appUpdate, 'apply');
      await renderTvHub('ready');

      press('ArrowUp');
      expect(press('Enter')).toBe(true);

      expect(apply).toHaveBeenCalledOnce();
    });
  });

  describe('annonce', () => {
    it('existe vide avant la version, puis ne contient que le titre', async () => {
      updateStatus.set('downloading');
      await renderHub(null);

      const region = screen.getByRole('status');
      expect(region).toBeEmptyDOMElement();

      setStatus('ready');

      // Même nœud : un lecteur d'écran n'annonce que les changements d'une région déjà présente.
      expect(screen.getByRole('status')).toBe(region);
      expect(region.textContent).toBe(TITLE);
      expect(region).not.toContainElement(getUpdateButton());
    });

    it('reste en place, vide, quand le bandeau disparaît', async () => {
      updateStatus.set('ready');
      await renderHub(null);
      const region = screen.getByRole('status');

      setStatus('idle');

      expect(screen.getByRole('status')).toBe(region);
      expect(region).toBeEmptyDOMElement();
    });
  });

  describe('arrivée sans voler le curseur', () => {
    it('laisse le curseur et les touches à la carte', async () => {
      await renderTvHub('downloading');
      const goal = getCardButton('Memory', GOAL);

      setStatus('ready');

      expect(goal).toHaveFocus();
      expect(goal).toHaveAttribute('data-focused', 'true');
      expect(getUpdateButton()).not.toHaveAttribute('data-focused');
      press('ArrowDown');
      expect(getCardButton('Memory', MAP)).toHaveFocus();
    });

    it('laisse le curseur et les touches au profil', async () => {
      await renderTvHub('downloading');
      press('ArrowUp');
      expect(getProfileButton()).toHaveFocus();

      setStatus('ready');

      expect(getProfileButton()).toHaveFocus();
      expect(getProfileButton()).toHaveAttribute('data-focused', 'true');
      expect(getUpdateButton()).not.toHaveAttribute('data-focused');
      press('ArrowRight');
      expect(getSettingsButton()).toHaveFocus();
    });

    it('ne prend pas le focus au doigt', async () => {
      updateStatus.set('downloading');
      await renderHub(null);

      setStatus('ready');

      expect(document.body).toHaveFocus();
    });

    it('démarre sur la carte quand la version est déjà prête au montage', async () => {
      await renderTvHub('ready');

      expect(getCardButton('Memory', GOAL)).toHaveAttribute('data-focused', 'true');
      expect(getUpdateButton()).not.toHaveAttribute('data-focused');
    });
  });

  describe('enchaînement au D-Pad avec le bandeau', () => {
    it('passe de la première carte au profil par le bandeau, et revient', async () => {
      await renderTvHub('ready');

      press('ArrowUp');
      expect(getUpdateButton()).toHaveFocus();
      expect(getUpdateButton()).toHaveAttribute('data-focused', 'true');
      press('ArrowUp');
      expect(getProfileButton()).toHaveFocus();
      press('ArrowDown');
      expect(getUpdateButton()).toHaveFocus();
      press('ArrowDown');
      expect(getCardButton('Memory', GOAL)).toHaveFocus();
    });

    it('descend aussi depuis Réglages, et y remonte', async () => {
      await renderTvHub('ready');
      press('ArrowUp');
      press('ArrowUp');
      press('ArrowRight');
      expect(getSettingsButton()).toHaveFocus();

      press('ArrowDown');
      expect(getUpdateButton()).toHaveFocus();
      press('ArrowUp');
      expect(getSettingsButton()).toHaveFocus();
    });

    it('rejoint la première action de la dernière carte, pas celle quittée', async () => {
      await renderTvHub('ready');
      press('ArrowDown');
      expect(getCardButton('Memory', MAP)).toHaveFocus();
      // Tab vers le profil : le curseur quitte la carte depuis sa seconde action.
      act(() => {
        getProfileButton().focus();
      });

      press('ArrowDown');
      press('ArrowDown');

      expect(getCardButton('Memory', GOAL)).toHaveFocus();
    });

    it('remonte de toute la première ligne et revient sur la carte quittée', async () => {
      simulateTwoGameColumns();
      await renderTvHub('ready');

      press('ArrowRight');
      expect(getCardButton('Traffic Jam', GOAL)).toHaveFocus();
      press('ArrowUp');
      expect(getUpdateButton()).toHaveFocus();
      press('ArrowDown');
      expect(getCardButton('Traffic Jam', GOAL)).toHaveFocus();
    });

    it('garde les cartes empilées reliées entre elles', async () => {
      await renderTvHub('ready');

      press('ArrowDown');
      press('ArrowDown');
      expect(getCardButton('Traffic Jam', GOAL)).toHaveFocus();
      press('ArrowUp');
      expect(getCardButton('Memory', MAP)).toHaveFocus();
    });

    it('reste sur le bandeau avec Gauche / Droite et laisse Retour au système', async () => {
      await renderTvHub('ready');
      press('ArrowUp');

      press('ArrowLeft');
      expect(getUpdateButton()).toHaveFocus();
      press('ArrowRight');
      expect(getUpdateButton()).toHaveFocus();
      expect(press('Escape')).toBe(false);
    });

    it('active sa zone quand le bouton reçoit le focus (Tab, clic)', async () => {
      await renderTvHub('ready');

      act(() => {
        getUpdateButton().focus();
      });

      expect(getUpdateButton()).toHaveAttribute('data-focused', 'true');
      expect(getCardButton('Memory', GOAL)).not.toHaveAttribute('data-focused');
      press('ArrowUp');
      expect(getProfileButton()).toHaveFocus();
    });
  });

  describe('enchaînement au D-Pad sans le bandeau', () => {
    it.each(NOT_READY_STATUSES)('reste celui d’aujourd’hui (%s)', async (status) => {
      await renderTvHub(status);

      press('ArrowUp');
      expect(getProfileButton()).toHaveFocus();
      press('ArrowDown');
      expect(getCardButton('Memory', GOAL)).toHaveFocus();

      press('ArrowUp');
      press('ArrowRight');
      expect(getSettingsButton()).toHaveFocus();
      press('ArrowDown');
      expect(getCardButton('Memory', GOAL)).toHaveFocus();
    });

    it('remonte au profil depuis toute la première ligne', async () => {
      simulateTwoGameColumns();
      await renderTvHub('idle');

      press('ArrowRight');
      press('ArrowUp');
      expect(getProfileButton()).toHaveFocus();
      press('ArrowDown');
      expect(getCardButton('Traffic Jam', GOAL)).toHaveFocus();
    });
  });

  describe('disparition sous le curseur', () => {
    it('retombe sur la dernière carte, avec l’enchaînement sans bandeau', async () => {
      await renderTvHub('ready');
      press('ArrowUp');
      expect(getUpdateButton()).toHaveFocus();

      setStatus('idle');

      expect(screen.queryByRole('button', { name: UPDATE_BUTTON })).not.toBeInTheDocument();
      expect(getCardButton('Memory', GOAL)).toHaveFocus();
      expect(getCardButton('Memory', GOAL)).toHaveAttribute('data-focused', 'true');
      press('ArrowUp');
      expect(getProfileButton()).toHaveFocus();
    });

    it('retombe sur la carte quittée, pas sur la première', async () => {
      simulateTwoGameColumns();
      await renderTvHub('ready');
      press('ArrowRight');
      press('ArrowUp');
      expect(getUpdateButton()).toHaveFocus();

      setStatus('idle');

      expect(getCardButton('Traffic Jam', GOAL)).toHaveFocus();
    });

    it('retombe sur le profil quand le Hub n’a aucun jeu', async () => {
      updateStatus.set('ready');
      await renderHub(tvSave(), []);
      await waitFor(() => {
        expect(getProfileButton()).toHaveFocus();
      });
      press('ArrowDown');
      expect(getUpdateButton()).toHaveFocus();
      // Aucune carte à rejoindre : le curseur reste sur le bandeau.
      press('ArrowDown');
      expect(getUpdateButton()).toHaveFocus();

      setStatus('idle');

      expect(getProfileButton()).toHaveFocus();
      expect(getProfileButton()).toHaveAttribute('data-focused', 'true');
    });

    it('rend les touches à la carte après un focus au doigt', async () => {
      updateStatus.set('ready');
      await renderHub(null);
      act(() => {
        getUpdateButton().focus();
      });

      setStatus('idle');

      // Premier appui après le tactile : il révèle le curseur, sur la carte.
      press('ArrowDown');
      expect(getCardButton('Memory', GOAL)).toHaveFocus();
      press('ArrowDown');
      expect(getCardButton('Memory', MAP)).toHaveFocus();
    });

    it('ne reprend pas le curseur en revenant', async () => {
      await renderTvHub('ready');
      press('ArrowUp');
      setStatus('idle');
      expect(getCardButton('Memory', GOAL)).toHaveFocus();

      setStatus('ready');

      expect(getCardButton('Memory', GOAL)).toHaveFocus();
      expect(getCardButton('Memory', GOAL)).toHaveAttribute('data-focused', 'true');
      expect(getUpdateButton()).not.toHaveAttribute('data-focused');
      press('ArrowUp');
      expect(getUpdateButton()).toHaveFocus();
    });
  });
});
