import { GameScreen, type LevelControls } from '@/components/progression';
import { useLevelPlayer } from '@/components/progression/GameScreen';
import { NavigationProvider } from '@/core/navigation';
import type { BaseLevelDefinition, EnrichedLevelItem } from '@/core/progression';
import { createDefaultSaveState, STORAGE_KEY, StorageProvider } from '@/core/storage';
import type { LevelCompletion, MiaSaveState, UserProfile } from '@/types/mia';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Plateforme Web : la sauvegarde vit dans localStorage, Preferences n'est jamais appelé.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: vi.fn(), set: vi.fn() } }));

const { router, LOCATION_EVENT } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  /** Émis par `history.pushState` / `replaceState` (espionnés) : `useSearchParams` suit l'adresse. */
  LOCATION_EVENT: 'mia-test:location',
}));

// Routeur simulé : `useSearchParams` lit l'adresse de jsdom, comme Next.js après un `pushState`.
vi.mock('next/navigation', async () => {
  const { useMemo, useSyncExternalStore } = await import('react');
  const subscribe = (onChange: () => void) => {
    window.addEventListener('popstate', onChange);
    window.addEventListener(LOCATION_EVENT, onChange);
    return () => {
      window.removeEventListener('popstate', onChange);
      window.removeEventListener(LOCATION_EVENT, onChange);
    };
  };
  return {
    useRouter: () => router,
    useSearchParams: () => {
      const search = useSyncExternalStore(
        subscribe,
        () => window.location.search,
        () => '',
      );
      return useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

const CREATED_AT = '2026-10-01T09:00:00.000Z';
const SELECTOR_TITLE = 'Qui joue aujourd’hui ?';

const CATALOG: BaseLevelDefinition[] = ['mem-001', 'mem-002', 'mem-003'].map((id, index) => ({
  id,
  gameId: 'memory',
  tier: 'very_easy',
  order: (index + 1) * 10,
  config: {},
}));

function won(levelId: string): LevelCompletion {
  return {
    levelId,
    completed: true,
    isPerfect: false,
    bestMoves: 12,
    bestTimeSeconds: 30,
    timesPlayed: 1,
    completedAt: CREATED_AT,
  };
}

function player(id: string, name: string, levels: LevelCompletion[] = []): UserProfile {
  return {
    id,
    name,
    avatarId: 'fox',
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

/** Léo (actif) a gagné les étoiles #1 et #2 ; Zoé, aucune : pour elle, seule la #1 est débloquée. */
function familySave(overrides: Partial<MiaSaveState> = {}): MiaSaveState {
  return {
    ...createDefaultSaveState(),
    activeProfileId: 'leo',
    profiles: [player('leo', 'Léo', [won('mem-001'), won('mem-002')]), player('zoe', 'Zoé')],
    ...overrides,
  };
}

function readSave(): MiaSaveState {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as MiaSaveState;
}

/** Étoiles enregistrées d'un profil, identifiants de niveau triés. */
function savedStars(profileId: string): string[] {
  const profile = readSave().profiles.find((candidate) => candidate.id === profileId);
  return Object.keys(profile?.gamesProgress.memory?.levels ?? {}).sort();
}

/** Écriture de la sauvegarde par un autre onglet : le disque, puis l'événement `storage`. */
function writeFromOtherTab(save: MiaSaveState): void {
  const json = JSON.stringify(save);
  localStorage.setItem(STORAGE_KEY, json);
  act(() => {
    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, newValue: json, storageArea: localStorage }),
    );
  });
}

function getButton(name: string | RegExp): HTMLElement {
  return screen.getByRole('button', { name });
}

/** Plateau de test : un état local (les coups joués), perdu seulement si le plateau est remonté. */
function TestBoard({ level, controls }: { level: EnrichedLevelItem; controls: LevelControls }) {
  const [moves, setMoves] = useState(0);
  const next = controls.summary.allLevels[level.globalIndex + 1];
  return (
    <section>
      <h1>Plateau de l’étoile #{level.starNumber}</h1>
      <output aria-label="Coups joués">{moves}</output>
      <output aria-label="Étoiles du joueur">{controls.summary.earnedStars}</output>
      <button
        type="button"
        onClick={() => {
          setMoves((count) => count + 1);
        }}
      >
        Jouer un coup
      </button>
      <button
        type="button"
        onClick={() => void controls.recordVictory({ moves: 7, timeSeconds: 42, isPerfect: true })}
      >
        Gagner
      </button>
      {next ? (
        <button
          type="button"
          onClick={() => {
            controls.playLevel(next.definition.id);
          }}
        >
          Étoile suivante
        </button>
      ) : null}
      <button type="button" onClick={controls.exitToMap}>
        Carte des Étoiles
      </button>
    </section>
  );
}

function getMoves(): string | null {
  return screen.getByRole('status', { name: 'Coups joués' }).textContent;
}

function getBoardStars(): string | null {
  return screen.getByRole('status', { name: 'Étoiles du joueur' }).textContent;
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <StorageProvider>
      <NavigationProvider>{children}</NavigationProvider>
    </StorageProvider>
  );
}

/** Page d'un jeu ouverte à ce niveau ; `controlsSeen` reçoit les commandes de chaque rendu. */
async function renderLevel(
  save: MiaSaveState,
  levelId: string,
  controlsSeen: LevelControls[] = [],
): Promise<void> {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  window.history.replaceState(null, '', `/memory/?level=${levelId}`);
  render(
    <GameScreen
      gameId="memory"
      catalog={CATALOG}
      renderLevel={(level, controls) => {
        controlsSeen.push(controls);
        return <TestBoard level={level} controls={controls} />;
      }}
    />,
    { wrapper: Providers },
  );
  await waitFor(() => {
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument();
  });
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  const originalReplaceState = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, url) => {
    originalReplaceState(data, unused, url);
    window.dispatchEvent(new Event(LOCATION_EVENT));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  localStorage.clear();
});

describe('GameScreen : plateau du niveau lancé', () => {
  it('remonte le plateau à chaque changement de niveau, et seulement alors', async () => {
    await renderLevel(familySave(), 'mem-002');

    fireEvent.click(getButton('Jouer un coup'));
    expect(getMoves()).toBe('1');

    // Une victoire change la sauvegarde et les commandes : la partie reste affichée telle quelle.
    fireEvent.click(getButton('Gagner'));
    await waitFor(() => {
      expect(readSave().profiles[0]?.gamesProgress.memory?.lastPlayedLevelId).toBe('mem-002');
    });
    expect(getMoves()).toBe('1');

    fireEvent.click(getButton('Étoile suivante'));
    expect(
      await screen.findByRole('heading', { name: 'Plateau de l’étoile #3' }),
    ).toBeInTheDocument();
    expect(getMoves()).toBe('0');
  });
});

describe('GameScreen : le profil actif change dans un autre onglet', () => {
  it('crédite la victoire au profil qui a lancé le niveau', async () => {
    await renderLevel(familySave(), 'mem-003');

    writeFromOtherTab(familySave({ activeProfileId: 'zoe' }));
    fireEvent.click(getButton('Gagner'));

    await waitFor(() => {
      expect(savedStars('leo')).toEqual(['mem-001', 'mem-002', 'mem-003']);
    });
    expect(savedStars('zoe')).toEqual([]);
    expect(readSave().activeProfileId).toBe('zoe');
  });

  it('ne détruit pas la partie, même sur un niveau verrouillé pour le nouveau profil', async () => {
    await renderLevel(familySave(), 'mem-003');
    fireEvent.click(getButton('Jouer un coup'));

    writeFromOtherTab(familySave({ activeProfileId: 'zoe' }));

    expect(screen.getByRole('heading', { name: 'Plateau de l’étoile #3' })).toBeInTheDocument();
    expect(getMoves()).toBe('1');
    expect(window.location.search).toBe('?level=mem-003');
    // La progression fournie au plateau reste celle du joueur de la partie.
    expect(getBoardStars()).toBe('2');
  });

  it('rend la carte au profil actif une fois la partie quittée', async () => {
    await renderLevel(familySave(), 'mem-003');
    writeFromOtherTab(familySave({ activeProfileId: 'zoe' }));

    fireEvent.click(getButton('Carte des Étoiles'));

    expect(await screen.findByRole('heading', { level: 1, name: 'Memory' })).toBeInTheDocument();
    expect(getButton(/^Étoile #3,/)).toHaveAccessibleName(expect.stringContaining('verrouillé'));
    expect(getButton('Jouer l’Étoile #1')).toBeInTheDocument();
  });

  it('donne le niveau suivant au profil actif à son montage', async () => {
    const zoeHasFirstStar = familySave({
      activeProfileId: 'zoe',
      profiles: [
        player('leo', 'Léo', [won('mem-001'), won('mem-002')]),
        player('zoe', 'Zoé', [won('mem-001')]),
      ],
    });
    await renderLevel(familySave(), 'mem-001');
    writeFromOtherTab(zoeHasFirstStar);
    expect(getBoardStars()).toBe('2');

    fireEvent.click(getButton('Étoile suivante'));
    await screen.findByRole('heading', { name: 'Plateau de l’étoile #2' });
    expect(getBoardStars()).toBe('1');

    fireEvent.click(getButton('Gagner'));
    await waitFor(() => {
      expect(savedStars('zoe')).toEqual(['mem-001', 'mem-002']);
    });
    expect(savedStars('leo')).toEqual(['mem-001', 'mem-002']);
    expect(readSave().profiles[0]?.gamesProgress.memory?.lastPlayedLevelId).toBeNull();
  });

  it('juge le niveau suivant pour le profil actif : verrouillé pour lui, la carte s’affiche', async () => {
    await renderLevel(familySave(), 'mem-001');
    writeFromOtherTab(familySave({ activeProfileId: 'zoe' }));

    fireEvent.click(getButton('Étoile suivante'));

    expect(await screen.findByRole('heading', { level: 1, name: 'Memory' })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.search).toBe('');
    });
  });
});

describe('GameScreen : le joueur disparaît dans un autre onglet', () => {
  /** Léo supprimé, Zoé active, comme après une suppression du profil actif. */
  const withoutLeo = () => familySave({ activeProfileId: 'zoe', profiles: [player('zoe', 'Zoé')] });

  it('n’enregistre rien pour lui : une victoire encore en main ne va pas au suivant', async () => {
    const controlsSeen: LevelControls[] = [];
    await renderLevel(familySave(), 'mem-001', controlsSeen);
    const [leoControls] = controlsSeen as [LevelControls];

    writeFromOtherTab(withoutLeo());
    const writeSave = vi.spyOn(Storage.prototype, 'setItem');
    await act(async () => {
      await leoControls.recordVictory({ moves: 7, timeSeconds: 42, isPerfect: true });
    });

    expect(writeSave).not.toHaveBeenCalled();
    expect(readSave()).toEqual(withoutLeo());
  });

  it('repart de zéro pour le profil actif quand le niveau est débloqué pour lui', async () => {
    await renderLevel(familySave(), 'mem-001');
    fireEvent.click(getButton('Jouer un coup'));

    writeFromOtherTab(withoutLeo());

    expect(screen.getByRole('heading', { name: 'Plateau de l’étoile #1' })).toBeInTheDocument();
    expect(getMoves()).toBe('0');

    fireEvent.click(getButton('Gagner'));
    await waitFor(() => {
      expect(savedStars('zoe')).toEqual(['mem-001']);
    });
  });

  it('affiche la carte du profil actif quand le niveau est verrouillé pour lui', async () => {
    await renderLevel(familySave(), 'mem-003');

    writeFromOtherTab(withoutLeo());

    expect(await screen.findByRole('heading', { level: 1, name: 'Memory' })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.search).toBe('');
    });
  });
});

describe('GameScreen : sans profil actif', () => {
  it('ne monte pas le plateau, même de l’étoile #1 : il jouerait derrière le choix du joueur', async () => {
    await renderLevel(familySave({ activeProfileId: null }), 'mem-001');

    expect(screen.getByRole('dialog', { name: SELECTOR_TITLE })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Plateau/ })).not.toBeInTheDocument();
  });

  it('retire le plateau si le profil actif disparaît, puis le rend au joueur choisi', async () => {
    await renderLevel(familySave(), 'mem-001');
    fireEvent.click(getButton('Jouer un coup'));

    writeFromOtherTab(familySave({ activeProfileId: null }));

    const dialog = await screen.findByRole('dialog', { name: SELECTOR_TITLE });
    expect(screen.queryByRole('heading', { name: /^Plateau/ })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /^Zoé/ }));
    await screen.findByRole('heading', { name: 'Plateau de l’étoile #1' });
    expect(getMoves()).toBe('0');
    expect(getBoardStars()).toBe('0');
  });
});

describe('GameScreen : joueur du niveau', () => {
  /** Plateau qui montre le joueur dont il lirait les réglages de jeu (FEAT-19). */
  function PlayerBoard() {
    const player = useLevelPlayer();
    return <output aria-label="Joueur du niveau">{player?.name}</output>;
  }

  const getPlayer = () => screen.getByRole('status', { name: 'Joueur du niveau' });

  it('donne au plateau le joueur qui a lancé le niveau, même quand un autre onglet en change', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(familySave()));
    window.history.replaceState(null, '', '/memory/?level=mem-001');
    render(<GameScreen gameId="memory" catalog={CATALOG} renderLevel={() => <PlayerBoard />} />, {
      wrapper: Providers,
    });
    await waitFor(() => {
      expect(getPlayer()).toHaveTextContent('Léo');
    });

    writeFromOtherTab({ ...familySave(), activeProfileId: 'zoe' });

    expect(getPlayer()).toHaveTextContent('Léo');
  });

  it('hors d’un niveau, renvoie le profil actif', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...familySave(), activeProfileId: 'zoe' }));
    render(<PlayerBoard />, { wrapper: Providers });

    await waitFor(() => {
      expect(getPlayer()).toHaveTextContent('Zoé');
    });
  });
});
