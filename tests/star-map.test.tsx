import MemoryPage, { metadata as memoryMetadata } from '@/app/memory/page';
import HomePage from '@/app/page';
import TrafficJamPage, { metadata as trafficJamMetadata } from '@/app/traffic-jam/page';
import {
  GameScreen,
  getNextGoal,
  getZoneEntryIndex,
  HubScreen,
  isPreviousHistoryEntry,
  LAST_GAME_STORAGE_KEY,
  LOCKED_HINT_DURATION_MS,
  type GameScreenProps,
  type LevelControls,
  type ZoneEntry,
} from '@/components/progression';
import { NavigationProvider } from '@/core/navigation';
import {
  GAME_REGISTRY,
  getGameProgressSummary,
  type BaseLevelDefinition,
  type EnrichedLevelItem,
  type GameManifest,
} from '@/core/progression';
import {
  createDefaultSaveState,
  DEFAULT_DEVICE_SETTINGS,
  STORAGE_KEY,
  StorageProvider,
} from '@/core/storage';
import type {
  DifficultyTier,
  GameId,
  LevelCompletion,
  MiaSaveState,
  UserProfile,
} from '@/types/mia';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

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
const ORIGIN = 'http://localhost:3000';

function definition(
  gameId: GameId,
  id: string,
  tier: DifficultyTier,
  order: number,
): BaseLevelDefinition {
  return { id, gameId, tier, order, config: {} };
}

/**
 * 12 étoiles Memory : Très Facile #1 à #6 (2 lignes avec les 4 colonnes de repli), Facile #7 à #9,
 * Moyen vide, Difficile #10 et #11, Très Difficile #12. Déclarées dans le désordre : le moteur trie.
 */
const MEMORY_CATALOG: BaseLevelDefinition[] = [
  definition('memory', 'mem-012', 'very_hard', 10),
  definition('memory', 'mem-001', 'very_easy', 10),
  definition('memory', 'mem-002', 'very_easy', 20),
  definition('memory', 'mem-003', 'very_easy', 30),
  definition('memory', 'mem-004', 'very_easy', 40),
  definition('memory', 'mem-005', 'very_easy', 50),
  definition('memory', 'mem-006', 'very_easy', 60),
  definition('memory', 'mem-007', 'easy', 10),
  definition('memory', 'mem-008', 'easy', 20),
  definition('memory', 'mem-009', 'easy', 30),
  definition('memory', 'mem-010', 'hard', 10),
  definition('memory', 'mem-011', 'hard', 20),
];

const MEMORY_IDS = MEMORY_CATALOG.map((entry) => entry.id);

const TRAFFIC_JAM_CATALOG: BaseLevelDefinition[] = [
  definition('traffic-jam', 'tj-001', 'very_easy', 10),
  definition('traffic-jam', 'tj-002', 'very_easy', 20),
  definition('traffic-jam', 'tj-003', 'easy', 10),
  definition('traffic-jam', 'tj-004', 'medium', 10),
];

/** Registre de test : catalogues injectés (ceux du registre restent vides jusqu'à FEAT-11 / 14). */
const TEST_GAMES: readonly GameManifest[] = [
  { ...GAME_REGISTRY.memory, catalog: MEMORY_CATALOG },
  { ...GAME_REGISTRY['traffic-jam'], catalog: TRAFFIC_JAM_CATALOG },
];

function won(levelId: string, { isPerfect = false, bestMoves = 12 } = {}): LevelCompletion {
  return {
    levelId,
    completed: true,
    isPerfect,
    bestMoves,
    bestTimeSeconds: 30,
    timesPlayed: 1,
    completedAt: CREATED_AT,
  };
}

function player(
  id: string,
  name: string,
  memory: LevelCompletion[] = [],
  trafficJam: LevelCompletion[] = [],
): UserProfile {
  const progress = (gameId: GameId, levels: LevelCompletion[]) => ({
    gameId,
    levels: Object.fromEntries(levels.map((entry) => [entry.levelId, entry])),
    lastPlayedLevelId: null,
  });
  return {
    id,
    name,
    avatarId: 'fox',
    createdAt: CREATED_AT,
    gamesProgress: {
      memory: progress('memory', memory),
      'traffic-jam': progress('traffic-jam', trafficJam),
    },
    gameSettings: { memory: { previewFactor: 1, mismatchFactor: 1 } },
  };
}

/**
 * Léo (actif) : Memory #1 parfaite en 8 coups, #2 à #4 réussies en 12 coups (prochaine : #5) ;
 * Traffic Jam #1 réussie (prochaine : #2). Mia : aucune étoile.
 */
function familySave(overrides: Partial<MiaSaveState> = {}): MiaSaveState {
  return {
    ...createDefaultSaveState(),
    activeProfileId: 'p1',
    profiles: [
      player(
        'p1',
        'Léo',
        [
          won('mem-001', { isPerfect: true, bestMoves: 8 }),
          won('mem-002'),
          won('mem-003'),
          won('mem-004'),
        ],
        [won('tj-001')],
      ),
      player('p2', 'Mia'),
    ],
    ...overrides,
  };
}

/** Toutes les étoiles Memory de Léo gagnées, couronnées sauf celles indiquées. */
function championSave(withoutCrown: string[] = []): MiaSaveState {
  const memory = MEMORY_IDS.map((id) => won(id, { isPerfect: !withoutCrown.includes(id) }));
  return {
    ...createDefaultSaveState(),
    activeProfileId: 'p1',
    profiles: [player('p1', 'Léo', memory)],
  };
}

function firstProfile(save: MiaSaveState): UserProfile | null {
  return save.profiles[0] ?? null;
}

function readSave(): MiaSaveState {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as MiaSaveState;
}

/** Mode TV forcé avant le montage : le moteur D-Pad démarre en mode `dpad`. */
function forceTvMode(save: MiaSaveState): MiaSaveState {
  document.documentElement.dataset.tv = 'on';
  return { ...save, settings: { ...DEFAULT_DEVICE_SETTINGS, tvModeOverride: 'always_tv' } };
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <StorageProvider>
      <NavigationProvider>{children}</NavigationProvider>
    </StorageProvider>
  );
}

/** Monte l'écran sur la sauvegarde donnée et attend la fin de l'attente (profil compris). */
async function renderLoaded(ui: ReactNode, save: MiaSaveState | null): Promise<void> {
  if (save) localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  render(ui, { wrapper: Providers });
  await waitFor(() => {
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument();
  });
}

function renderHub(save: MiaSaveState | null): Promise<void> {
  return renderLoaded(<HubScreen games={TEST_GAMES} />, save);
}

/** Page Memory (catalogue de test) ouverte à l'adresse donnée. */
function renderMemory(
  save: MiaSaveState | null,
  url = '/memory/',
  renderLevel?: GameScreenProps['renderLevel'],
): Promise<void> {
  window.history.replaceState(null, '', url);
  return renderLoaded(
    <GameScreen gameId="memory" catalog={MEMORY_CATALOG} renderLevel={renderLevel} />,
    save,
  );
}

/** Appuie sur une touche (cible : élément focalisé) ; `true` si le moteur D-Pad l'a consommée. */
function press(key: string): boolean {
  return !fireEvent.keyDown(document.activeElement ?? document.body, { key });
}

function getButton(name: string | RegExp): HTMLElement {
  return screen.getByRole('button', { name });
}

/** Tuile de l'étoile #n (« Étoile #5, à conquérir », « Étoile #6, verrouillé »…). */
function getTile(starNumber: number): HTMLElement {
  return getButton(new RegExp(`^Étoile #${String(starNumber)},`));
}

function getCard(title: string): HTMLElement {
  return screen.getByRole('article', { name: title });
}

function getCardButton(title: string, name: string): HTMLElement {
  return within(getCard(title)).getByRole('button', { name });
}

/** Entrées de session de la Navigation API ; la dernière est l'entrée courante. */
function stubNavigationHistory(...urls: string[]): void {
  const entries = urls.map((url, index) => ({ url, index }));
  Object.defineProperty(window, 'navigation', {
    configurable: true,
    value: { currentEntry: entries.at(-1) ?? null, entries: () => entries },
  });
}

/** jsdom ne lit pas Tailwind : gabarit à `count` colonnes simulé pour la grille des jeux du Hub. */
function simulateGameColumns(count: number): void {
  const realGetComputedStyle = window.getComputedStyle.bind(window);
  const template = Array.from({ length: count }, () => '320px').join(' ');
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
    if (!element.classList.contains('md:grid-cols-2')) {
      return realGetComputedStyle(element, pseudoElement);
    }
    return {
      getPropertyValue: (property: string) =>
        property === 'grid-template-columns' ? template : '',
    } as unknown as CSSStyleDeclaration;
  });
}

/** Plateau de test : reçoit le niveau lancé et les commandes de `GameScreen`. */
function TestBoard({ level, controls }: { level: EnrichedLevelItem; controls: LevelControls }) {
  const next = controls.summary.allLevels[level.globalIndex + 1];
  return (
    <section>
      <h1>Plateau de l’étoile #{level.starNumber}</h1>
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

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

/** `history.pushState` / `replaceState` espionnés : l'adresse change, puis `useSearchParams` suit. */
let pushState: MockInstance<History['pushState']>;
let replaceState: MockInstance<History['replaceState']>;

beforeEach(() => {
  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);
  pushState = vi.spyOn(window.history, 'pushState').mockImplementation((data, unused, url) => {
    originalPushState(data, unused, url);
    window.dispatchEvent(new Event(LOCATION_EVENT));
  });
  replaceState = vi
    .spyOn(window.history, 'replaceState')
    .mockImplementation((data, unused, url) => {
      originalReplaceState(data, unused, url);
      window.dispatchEvent(new Event(LOCATION_EVENT));
    });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  sessionStorage.clear();
  delete document.documentElement.dataset.tv;
  Reflect.deleteProperty(window, 'navigation');
});

describe('getNextGoal', () => {
  const goalFor = (catalog: readonly BaseLevelDefinition[], save: MiaSaveState | null) =>
    getNextGoal(getGameProgressSummary('memory', catalog, save ? firstProfile(save) : null));

  it('annonce un jeu sans niveau', () => {
    expect(goalFor([], familySave())).toEqual({ kind: 'empty' });
  });

  it('propose de commencer par l’Étoile #1, puis la prochaine étoile à jouer', () => {
    expect(goalFor(MEMORY_CATALOG, null)).toMatchObject({
      kind: 'play',
      isFirstStar: true,
      level: { starNumber: 1 },
    });
    expect(goalFor(MEMORY_CATALOG, familySave())).toMatchObject({
      kind: 'play',
      isFirstStar: false,
      level: { starNumber: 5 },
    });
  });

  it('vise la première couronne manquante, puis annonce un jeu terminé', () => {
    expect(goalFor(MEMORY_CATALOG, championSave(['mem-007', 'mem-002']))).toMatchObject({
      kind: 'crown',
      level: { starNumber: 2 },
    });
    expect(goalFor(MEMORY_CATALOG, championSave())).toEqual({ kind: 'complete' });
  });
});

describe('getZoneEntryIndex', () => {
  const shape = { count: 6, cols: 4 };

  it.each<[ZoneEntry, number | null]>([
    [{ kind: 'keep' }, null],
    [{ kind: 'index', index: 9 }, 5],
    [{ kind: 'index', index: -2 }, 0],
    [{ kind: 'first' }, 0],
    [{ kind: 'last' }, 5],
    [{ kind: 'top', col: 2 }, 2],
    [{ kind: 'top', col: 7 }, 3],
    [{ kind: 'bottom', col: 0 }, 4],
    [{ kind: 'bottom', col: 3 }, 5],
  ])('arrivée %o dans 6 éléments sur 4 colonnes → %s', (entry, expected) => {
    expect(getZoneEntryIndex(entry, shape)).toBe(expected);
  });

  it('reste sur l’index 0 dans une zone vide', () => {
    expect(getZoneEntryIndex({ kind: 'last' }, { count: 0, cols: 4 })).toBe(0);
  });
});

describe('isPreviousHistoryEntry', () => {
  it('compare l’entrée précédente sans tenir compte de la barre finale', () => {
    stubNavigationHistory(`${ORIGIN}/memory`, `${ORIGIN}/memory/?level=mem-005`);

    expect(isPreviousHistoryEntry(new URL(`${ORIGIN}/memory/`))).toBe(true);
    expect(isPreviousHistoryEntry(new URL(`${ORIGIN}/`))).toBe(false);
    expect(isPreviousHistoryEntry(new URL(`${ORIGIN}/memory/?level=mem-004`))).toBe(false);
    expect(isPreviousHistoryEntry(new URL('https://youtix.github.io/memory/'))).toBe(false);
  });

  it('répond non sans Navigation API ni entrée précédente', () => {
    expect(isPreviousHistoryEntry(new URL(`${ORIGIN}/`))).toBe(false);

    stubNavigationHistory(`${ORIGIN}/`);
    expect(isPreviousHistoryEntry(new URL(`${ORIGIN}/`))).toBe(false);
  });
});

describe('Hub', () => {
  it('attend la sauvegarde avant d’afficher les jeux', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(familySave()));
    render(<HubScreen games={TEST_GAMES} />, { wrapper: Providers });

    expect(screen.getByRole('heading', { level: 1, name: 'Mia' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();

    expect(await screen.findByRole('button', { name: 'Joueur : Léo' })).toBeInTheDocument();
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument();
  });

  it('crée « Joueur 1 » au premier lancement et propose de commencer chaque jeu', async () => {
    await renderHub(null);

    expect(getButton('Joueur : Joueur 1')).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.getAllByRole('button', { name: 'Commencer (Étoile #1)' })).toHaveLength(2);
    expect(
      within(screen.getByRole('banner')).getByRole('img', { name: '0 étoile sur 16' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('résume la progression de chaque jeu et le total du joueur', async () => {
    await renderHub(familySave());

    const memory = getCard('Memory');
    expect(within(memory).getByText('Mémoire visuelle & spatiale')).toBeInTheDocument();
    expect(within(memory).getByRole('img', { name: '4 étoiles sur 12' })).toBeInTheDocument();
    expect(within(memory).getByRole('img', { name: '1 couronne' })).toBeInTheDocument();
    expect(
      within(memory)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Continuer (Étoile #5)', 'Carte des Étoiles']);

    const trafficJam = getCard('Traffic Jam');
    expect(
      within(trafficJam).getByText('Planification & Logique séquentielle'),
    ).toBeInTheDocument();
    expect(within(trafficJam).getByRole('img', { name: '1 étoile sur 4' })).toBeInTheDocument();
    expect(within(trafficJam).getByRole('img', { name: '0 couronne' })).toBeInTheDocument();
    expect(getCardButton('Traffic Jam', 'Continuer (Étoile #2)')).toBeInTheDocument();

    expect(
      within(screen.getByRole('banner')).getByRole('img', { name: '5 étoiles sur 16' }),
    ).toBeInTheDocument();
  });

  it('vise les couronnes une fois les étoiles d’un jeu gagnées, puis félicite', async () => {
    const save: MiaSaveState = {
      ...createDefaultSaveState(),
      activeProfileId: 'p1',
      profiles: [
        player(
          'p1',
          'Léo',
          MEMORY_IDS.map((id) => won(id, { isPerfect: true })),
          [won('tj-001', { isPerfect: true }), won('tj-002'), won('tj-003'), won('tj-004')],
        ),
      ],
    };
    await renderHub(save);

    const memory = getCard('Memory');
    expect(within(memory).getByText('Toutes les étoiles et couronnes !')).toBeInTheDocument();
    expect(
      within(memory)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Carte des Étoiles']);
    expect(
      within(memory).getByRole('img', { name: '12 étoiles sur 12, parfait' }),
    ).toBeInTheDocument();
    expect(getCardButton('Traffic Jam', 'Viser la couronne (Étoile #2)')).toBeInTheDocument();
    expect(
      within(screen.getByRole('banner')).getByRole('img', { name: '16 étoiles sur 16' }),
    ).toBeInTheDocument();
  });

  it('annonce « Bientôt disponible » pour un jeu sans niveau, Carte des Étoiles comprise', async () => {
    // Catalogues vides injectés : le registre réel publie les 20 étoiles de Memory (FEAT-11).
    const emptyGames = TEST_GAMES.map((game) => ({ ...game, catalog: [] }));
    await renderLoaded(<HubScreen games={emptyGames} />, familySave());

    for (const title of ['Memory', 'Traffic Jam']) {
      const card = getCard(title);
      expect(within(card).getByText('Bientôt disponible')).toBeInTheDocument();
      expect(within(card).queryByRole('img')).not.toBeInTheDocument();
      expect(
        within(card)
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual(['Carte des Étoiles']);
    }
    expect(
      within(screen.getByRole('banner')).getByRole('img', { name: '0 étoile' }),
    ).toBeInTheDocument();
  });

  it('rend le Hub du registre réel : les 20 étoiles de Memory (FEAT-11)', async () => {
    await renderLoaded(<HomePage />, familySave());

    const memory = getCard('Memory');
    expect(within(memory).getByRole('img', { name: '4 étoiles sur 20' })).toBeInTheDocument();
    expect(getCardButton('Memory', 'Continuer (Étoile #5)')).toBeInTheDocument();
  });

  it('lance l’objectif ou ouvre la Carte des Étoiles d’un jeu', async () => {
    await renderHub(familySave());

    expect(router.prefetch).toHaveBeenCalledWith('/memory');
    expect(router.prefetch).toHaveBeenCalledWith('/traffic-jam');

    fireEvent.click(getCardButton('Memory', 'Continuer (Étoile #5)'));
    expect(router.push).toHaveBeenLastCalledWith('/memory?level=mem-005');
    expect(sessionStorage.getItem(LAST_GAME_STORAGE_KEY)).toBe('memory');

    fireEvent.click(getCardButton('Traffic Jam', 'Carte des Étoiles'));
    expect(router.push).toHaveBeenLastCalledWith('/traffic-jam');
    expect(sessionStorage.getItem(LAST_GAME_STORAGE_KEY)).toBe('traffic-jam');
  });

  it('change de joueur depuis le bouton du profil actif', async () => {
    await renderHub(familySave());

    fireEvent.click(getButton('Joueur : Léo'));
    const dialog = await screen.findByRole('dialog', { name: SELECTOR_TITLE });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Mia/ }));

    expect(await screen.findByRole('button', { name: 'Joueur : Mia' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: 'Commencer (Étoile #1)' })).toHaveLength(2);
    expect(
      within(screen.getByRole('banner')).getByRole('img', { name: '0 étoile sur 16' }),
    ).toBeInTheDocument();
  });

  it('impose le choix du joueur quand aucun profil n’est actif', async () => {
    await renderHub(familySave({ activeProfileId: null }));

    const dialog = screen.getByRole('dialog', { name: SELECTOR_TITLE });
    expect(within(dialog).queryByRole('button', { name: 'Fermer' })).not.toBeInTheDocument();
    expect(getButton('Joueur : Choisir un joueur')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /^Léo/ }));
    expect(await screen.findByRole('button', { name: 'Joueur : Léo' })).toBeInTheDocument();
  });

  it('se pilote à la télécommande : cartes empilées, profil au-dessus', async () => {
    await renderHub(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getCardButton('Memory', 'Continuer (Étoile #5)')).toHaveFocus();
    });
    expect(getCardButton('Memory', 'Continuer (Étoile #5)')).toHaveAttribute(
      'data-focused',
      'true',
    );

    press('ArrowDown');
    expect(getCardButton('Memory', 'Carte des Étoiles')).toHaveFocus();
    press('ArrowDown');
    expect(getCardButton('Traffic Jam', 'Continuer (Étoile #2)')).toHaveFocus();
    press('ArrowUp');
    expect(getCardButton('Memory', 'Carte des Étoiles')).toHaveFocus();
    press('ArrowUp');
    press('ArrowUp');
    expect(getButton('Joueur : Léo')).toHaveFocus();
    press('ArrowDown');
    expect(getCardButton('Memory', 'Continuer (Étoile #5)')).toHaveFocus();

    // Retour n'est pas géré sur le Hub : il reste au système (FEAT-15 ferme l'application).
    expect(press('Escape')).toBe(false);
    expect(press('Enter')).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/memory?level=mem-005');
  });

  it('passe d’une carte à l’autre de côté quand les jeux sont côte à côte', async () => {
    simulateGameColumns(2);
    await renderHub(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getCardButton('Memory', 'Continuer (Étoile #5)')).toHaveFocus();
    });

    press('ArrowRight');
    expect(getCardButton('Traffic Jam', 'Continuer (Étoile #2)')).toHaveFocus();
    press('ArrowDown');
    press('ArrowLeft');
    expect(getCardButton('Memory', 'Carte des Étoiles')).toHaveFocus();
    press('ArrowDown');
    expect(getCardButton('Memory', 'Carte des Étoiles')).toHaveFocus();
    press('ArrowRight');
    press('ArrowUp');
    press('ArrowUp');
    expect(getButton('Joueur : Léo')).toHaveFocus();
    press('ArrowDown');
    expect(getCardButton('Traffic Jam', 'Continuer (Étoile #2)')).toHaveFocus();
  });

  it('replace le curseur sur le dernier jeu ouvert au retour sur le Hub', async () => {
    sessionStorage.setItem(LAST_GAME_STORAGE_KEY, 'traffic-jam');
    await renderHub(forceTvMode(familySave()));

    await waitFor(() => {
      expect(getCardButton('Traffic Jam', 'Continuer (Étoile #2)')).toHaveFocus();
    });
  });

  it('ouvre les Réglages depuis l’en-tête, route préchargée', async () => {
    await renderHub(familySave());

    expect(router.prefetch).toHaveBeenCalledWith('/settings');
    const settings = within(screen.getByRole('banner')).getByRole('button', { name: 'Réglages' });
    expect(settings).toHaveTextContent('Réglages');
    fireEvent.click(settings);

    expect(router.push).toHaveBeenLastCalledWith('/settings');
  });

  it('place Réglages à droite du profil dans la zone de l’en-tête, à la télécommande', async () => {
    await renderHub(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getCardButton('Memory', 'Continuer (Étoile #5)')).toHaveFocus();
    });

    press('ArrowUp');
    expect(getButton('Joueur : Léo')).toHaveFocus();
    press('ArrowRight');
    expect(getButton('Réglages')).toHaveFocus();
    expect(getButton('Réglages')).toHaveAttribute('data-focused', 'true');
    press('ArrowRight');
    expect(getButton('Réglages')).toHaveFocus();
    // Bas depuis Réglages : la dernière carte visitée, comme depuis le profil.
    press('ArrowDown');
    expect(getCardButton('Memory', 'Continuer (Étoile #5)')).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Réglages')).toHaveFocus();
    press('ArrowLeft');
    expect(getButton('Joueur : Léo')).toHaveFocus();
    press('ArrowRight');
    expect(press('Enter')).toBe(true);

    expect(router.push).toHaveBeenLastCalledWith('/settings');
  });
});

describe('Carte des Étoiles', () => {
  it('affiche les 5 paliers dans l’ordre, leurs compteurs et leurs étoiles', async () => {
    await renderMemory(familySave());

    expect(screen.getByRole('heading', { level: 1, name: 'Memory' })).toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('button', { name: 'Retour' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Jouer l’Étoile #5' })).toBeInTheDocument();
    expect(within(header).getByRole('img', { name: '4 étoiles sur 12' })).toBeInTheDocument();

    expect(
      screen
        .getAllByRole('region')
        .map((region) => within(region).getByRole('heading', { level: 2 }).textContent),
    ).toEqual([
      'Très Facile · Éveil, palier 1 sur 5',
      'Facile · Initié, palier 2 sur 5',
      'Moyen · Confirmé, palier 3 sur 5',
      'Difficile · Expert, palier 4 sur 5',
      'Très Difficile · Maître, palier 5 sur 5',
    ]);

    const veryEasy = screen.getByRole('region', { name: /^Très Facile/ });
    expect(within(veryEasy).getByRole('img', { name: '4 étoiles sur 6' })).toBeInTheDocument();
    expect(
      within(veryEasy)
        .getAllByRole('button')
        .map((tile) => tile.dataset.levelId),
    ).toEqual(['mem-001', 'mem-002', 'mem-003', 'mem-004', 'mem-005', 'mem-006']);

    const easy = screen.getByRole('region', { name: /^Facile/ });
    expect(within(easy).getByRole('img', { name: '0 étoile sur 3' })).toBeInTheDocument();

    const medium = screen.getByRole('region', { name: /^Moyen/ });
    expect(within(medium).getByText('Bientôt de nouvelles étoiles')).toBeInTheDocument();
    expect(within(medium).queryByRole('img')).not.toBeInTheDocument();
    expect(within(medium).queryByRole('button')).not.toBeInTheDocument();

    expect(getTile(12)).toHaveAttribute('data-level-id', 'mem-012');
  });

  it('distingue les 4 états des étoiles', async () => {
    await renderMemory(familySave());

    expect(getTile(1)).toHaveAccessibleName('Étoile #1, parfaite, meilleur score : 8 coups');
    expect(getTile(1)).toHaveAttribute('data-state', 'perfect');
    expect(getTile(2)).toHaveAccessibleName('Étoile #2, réussie, meilleur score : 12 coups');
    expect(getTile(2)).toHaveAttribute('data-state', 'completed');
    expect(getTile(5)).toHaveAccessibleName('Étoile #5, à conquérir');
    expect(getTile(5)).toHaveAttribute('data-state', 'open');
    expect(getTile(6)).toHaveAccessibleName('Étoile #6, verrouillé');
    expect(getTile(6)).toHaveAttribute('data-state', 'locked');
    expect(getTile(6)).toHaveAttribute('aria-disabled', 'true');
  });

  it('place le curseur de la télécommande sur la prochaine étoile', async () => {
    await renderMemory(forceTvMode(familySave()));

    await waitFor(() => {
      expect(getTile(5)).toHaveFocus();
    });
    expect(getTile(5)).toHaveAttribute('data-focused', 'true');
  });

  it('fait défiler la carte jusqu’à la prochaine étoile au doigt, sans la focaliser', async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    await renderMemory(familySave());

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' });
    expect(scrollIntoView.mock.contexts).toContain(getTile(5));
    expect(getTile(5)).not.toHaveFocus();
  });

  it('suit l’ordre de lecture avec Gauche / Droite, d’une ligne et d’un palier à l’autre', async () => {
    await renderMemory(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getTile(5)).toHaveFocus();
    });

    press('ArrowRight');
    expect(getTile(6)).toHaveFocus();
    press('ArrowRight');
    expect(getTile(7)).toHaveFocus();
    press('ArrowLeft');
    expect(getTile(6)).toHaveFocus();
    press('ArrowLeft');
    press('ArrowLeft');
    expect(getTile(4)).toHaveFocus();
    press('ArrowRight');
    expect(getTile(5)).toHaveFocus();
    press('ArrowUp');
    press('ArrowLeft');
    expect(getTile(1)).toHaveFocus();
    // Première étoile du premier palier : bloqué.
    press('ArrowLeft');
    expect(getTile(1)).toHaveFocus();
  });

  it('garde la colonne avec Haut / Bas d’un palier à l’autre, palier vide sauté', async () => {
    await renderMemory(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getTile(5)).toHaveFocus();
    });

    press('ArrowDown');
    expect(getTile(7)).toHaveFocus();
    press('ArrowRight');
    press('ArrowRight');
    expect(getTile(9)).toHaveFocus();
    // Moyen est vide ; Difficile n'a que 2 étoiles : colonne bornée à la dernière.
    press('ArrowDown');
    expect(getTile(11)).toHaveFocus();
    press('ArrowDown');
    expect(getTile(12)).toHaveFocus();
    press('ArrowDown');
    expect(getTile(12)).toHaveFocus();
    press('ArrowUp');
    expect(getTile(10)).toHaveFocus();
    press('ArrowUp');
    expect(getTile(7)).toHaveFocus();
    // Arrivée par le bas : dernière ligne de Très Facile, même colonne.
    press('ArrowUp');
    expect(getTile(5)).toHaveFocus();
    press('ArrowUp');
    expect(getTile(1)).toHaveFocus();
  });

  it('rejoint l’en-tête par le haut et revient à la dernière étoile par le bas', async () => {
    await renderMemory(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getTile(5)).toHaveFocus();
    });

    press('ArrowRight');
    press('ArrowUp');
    expect(getTile(2)).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Jouer l’Étoile #5')).toHaveFocus();
    press('ArrowLeft');
    expect(getButton('Retour')).toHaveFocus();
    expect(getButton('Retour')).toHaveAttribute('data-focused', 'true');
    press('ArrowDown');
    expect(getTile(2)).toHaveFocus();

    press('ArrowUp');
    expect(press('Enter')).toBe(true);
    expect(await screen.findByRole('heading', { level: 1, name: 'Étoile #5' })).toBeInTheDocument();
    expect(window.location.search).toBe('?level=mem-005');
  });

  it('lance une étoile débloquée par sa tuile, dans une nouvelle entrée d’historique', async () => {
    await renderMemory(familySave());

    fireEvent.click(getTile(2));

    expect(pushState).toHaveBeenLastCalledWith(null, '', '/memory/?level=mem-002');
    expect(await screen.findByRole('heading', { level: 1, name: 'Étoile #2' })).toBeInTheDocument();
    expect(screen.getByText('Le plateau de Memory arrive bientôt.')).toBeInTheDocument();
  });

  it('explique comment débloquer une étoile verrouillée, puis efface le message', async () => {
    await renderMemory(familySave());
    vi.useFakeTimers();

    fireEvent.click(getTile(9));

    expect(screen.getByRole('status')).toHaveTextContent(
      'L’Étoile #9 est verrouillée : gagne l’Étoile #5 pour avancer.',
    );
    expect(pushState).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(LOCKED_HINT_DURATION_MS);
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('donne le même message avec OK de la télécommande', async () => {
    await renderMemory(forceTvMode(familySave()));
    await waitFor(() => {
      expect(getTile(5)).toHaveFocus();
    });

    press('ArrowRight');
    expect(press('Enter')).toBe(true);

    expect(screen.getByRole('status')).toHaveTextContent(
      'L’Étoile #6 est verrouillée : gagne l’Étoile #5 pour avancer.',
    );
  });

  it('revient au Hub en remplaçant l’entrée quand le Hub ne la précède pas', async () => {
    await renderMemory(familySave());

    fireEvent.click(getButton('Retour'));

    expect(router.replace).toHaveBeenCalledWith('/');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('revient au Hub en dépilant l’historique quand il la précède, aussi avec Retour', async () => {
    stubNavigationHistory(`${ORIGIN}/`, `${ORIGIN}/memory/`);
    await renderMemory(familySave());

    expect(press('Escape')).toBe(true);

    expect(router.back).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('vise la première couronne manquante quand toutes les étoiles sont gagnées', async () => {
    await renderMemory(forceTvMode(championSave(['mem-010', 'mem-002'])));

    expect(getButton('Viser la couronne (Étoile #2)')).toBeInTheDocument();
    await waitFor(() => {
      expect(getTile(2)).toHaveFocus();
    });
    expect(screen.queryByText('Toutes les étoiles et couronnes !')).not.toBeInTheDocument();
  });

  it('félicite le joueur quand toutes les couronnes sont gagnées', async () => {
    await renderMemory(forceTvMode(championSave()));

    expect(screen.getByText('Toutes les étoiles et couronnes !')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Jouer|Viser/ })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('banner')).getByRole('img', { name: '12 étoiles sur 12, parfait' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(getTile(1)).toHaveFocus();
    });
    // Sans bouton « Jouer », l'en-tête s'ouvre sur Retour.
    press('ArrowUp');
    expect(getButton('Retour')).toHaveFocus();
  });

  it('crée « Joueur 1 » quand la page d’un jeu s’ouvre sans aucun profil', async () => {
    await renderMemory(null);

    expect(getTile(1)).toHaveAccessibleName('Étoile #1, à conquérir');
    expect(getButton('Jouer l’Étoile #1')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('impose le choix du joueur sans profil actif, puis affiche sa progression', async () => {
    await renderMemory(familySave({ activeProfileId: null }));

    const dialog = screen.getByRole('dialog', { name: SELECTOR_TITLE });
    expect(within(dialog).queryByRole('button', { name: 'Fermer' })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /^Léo/ }));
    expect(await screen.findByRole('button', { name: 'Jouer l’Étoile #5' })).toBeInTheDocument();
  });
});

describe('Niveau lancé', () => {
  it('ouvre le niveau de l’adresse puis revient à la carte', async () => {
    await renderMemory(familySave(), '/memory/?level=mem-003');

    expect(screen.getByRole('heading', { level: 1, name: 'Étoile #3' })).toBeInTheDocument();
    expect(screen.getByText('Très Facile')).toBeInTheDocument();

    fireEvent.click(getButton('Retour'));

    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/memory/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Memory' })).toBeInTheDocument();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('dépile l’historique quand la carte précède le niveau, aussi avec Retour', async () => {
    stubNavigationHistory(`${ORIGIN}/memory/`, `${ORIGIN}/memory/?level=mem-003`);
    await renderMemory(forceTvMode(familySave()), '/memory/?level=mem-003');
    await waitFor(() => {
      expect(getButton('Retour')).toHaveFocus();
    });

    expect(press('Backspace')).toBe(true);

    expect(router.back).toHaveBeenCalledOnce();
  });

  it.each(['mem-009', 'inconnu'])(
    'affiche la carte et nettoie l’adresse d’un niveau verrouillé ou inconnu (%s)',
    async (levelId) => {
      await renderMemory(familySave(), `/memory/?level=${levelId}`);

      expect(screen.getByRole('heading', { level: 1, name: 'Memory' })).toBeInTheDocument();
      await waitFor(() => {
        expect(window.location.search).toBe('');
      });
      expect(window.location.pathname).toBe('/memory/');
    },
  );

  it('attend le choix du joueur avant de juger le niveau demandé', async () => {
    await renderMemory(familySave({ activeProfileId: null }), '/memory/?level=mem-005');

    const dialog = screen.getByRole('dialog', { name: SELECTOR_TITLE });
    expect(window.location.search).toBe('?level=mem-005');

    fireEvent.click(within(dialog).getByRole('button', { name: /^Léo/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Étoile #5' })).toBeInTheDocument();
  });

  it('ne monte le plateau qu’après le choix du joueur : il jouerait derrière ce choix', async () => {
    const renderLevel = vi.fn((current: EnrichedLevelItem, controls: LevelControls) => (
      <TestBoard level={current} controls={controls} />
    ));
    await renderMemory(
      familySave({ activeProfileId: null }),
      '/memory/?level=mem-005',
      renderLevel,
    );

    const dialog = screen.getByRole('dialog', { name: SELECTOR_TITLE });
    expect(renderLevel).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /^Léo/ }));
    expect(
      await screen.findByRole('heading', { name: 'Plateau de l’étoile #5' }),
    ).toBeInTheDocument();
  });

  it('fournit au plateau la victoire, l’étoile suivante et le retour à la carte', async () => {
    const renderLevel = (current: EnrichedLevelItem, controls: LevelControls) => (
      <TestBoard level={current} controls={controls} />
    );
    await renderMemory(familySave(), '/memory/?level=mem-005', renderLevel);

    expect(screen.getByRole('heading', { name: 'Plateau de l’étoile #5' })).toBeInTheDocument();
    fireEvent.click(getButton('Gagner'));
    await waitFor(() => {
      expect(readSave().profiles[0]?.gamesProgress.memory?.levels['mem-005']).toMatchObject({
        completed: true,
        isPerfect: true,
        bestMoves: 7,
        bestTimeSeconds: 42,
      });
    });

    fireEvent.click(getButton('Étoile suivante'));
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/memory/?level=mem-006');
    expect(
      await screen.findByRole('heading', { name: 'Plateau de l’étoile #6' }),
    ).toBeInTheDocument();

    fireEvent.click(getButton('Carte des Étoiles'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Memory' })).toBeInTheDocument();
    expect(getTile(5)).toHaveAccessibleName('Étoile #5, parfaite, meilleur score : 7 coups');
    expect(getButton('Jouer l’Étoile #6')).toBeInTheDocument();
  });
});

describe('Pages', () => {
  it('donne leur titre aux pages des jeux (« Memory · Mia »)', () => {
    expect(memoryMetadata.title).toBe('Memory');
    expect(trafficJamMetadata.title).toBe('Traffic Jam');
  });

  it('annonce les 5 paliers d’un jeu encore sans niveau', async () => {
    // Catalogue vide injecté : la page /memory publie ses 20 étoiles depuis FEAT-11.
    window.history.replaceState(null, '', '/memory/');
    await renderLoaded(<GameScreen gameId="memory" catalog={[]} />, forceTvMode(familySave()));

    expect(screen.getByRole('heading', { level: 1, name: 'Memory' })).toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(5);
    expect(screen.getAllByText('Bientôt de nouvelles étoiles')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /^Étoile|Jouer/ })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(getButton('Retour')).toHaveFocus();
    });
  });

  it('joue le catalogue réel de Memory : 20 étoiles sur la carte, puis le plateau', async () => {
    window.history.replaceState(null, '', '/memory/');
    await renderLoaded(<MemoryPage />, familySave());

    expect(screen.getByRole('heading', { level: 1, name: 'Memory' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('banner')).getByRole('img', { name: '4 étoiles sur 20' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Étoile #/ })).toHaveLength(20);
    expect(screen.queryByText('Bientôt de nouvelles étoiles')).not.toBeInTheDocument();

    fireEvent.click(getButton('Jouer l’Étoile #5'));

    expect(pushState).toHaveBeenLastCalledWith(null, '', '/memory/?level=mem-005');
    expect(await screen.findByRole('heading', { level: 1, name: 'Étoile #5' })).toBeInTheDocument();
    // Plateau de Memory (4 × 2 cartes cachées, sans aperçu) : le niveau est jouable.
    expect(screen.getAllByRole('button', { name: /^Carte cachée/ })).toHaveLength(8);
  });

  it('joue le catalogue réel de Traffic Jam : 20 étoiles sur la carte, puis le parking', async () => {
    window.history.replaceState(null, '', '/traffic-jam/');
    await renderLoaded(<TrafficJamPage />, familySave());

    expect(screen.getByRole('heading', { level: 1, name: 'Traffic Jam' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('banner')).getByRole('img', { name: '1 étoile sur 20' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(5);
    expect(screen.getAllByRole('button', { name: /^Étoile #/ })).toHaveLength(20);
    expect(screen.queryByText('Bientôt de nouvelles étoiles')).not.toBeInTheDocument();

    fireEvent.click(getButton('Jouer l’Étoile #2'));

    expect(pushState).toHaveBeenLastCalledWith(null, '', '/traffic-jam/?level=tj-002');
    expect(await screen.findByRole('heading', { level: 1, name: 'Étoile #2' })).toBeInTheDocument();
    // Parking de FEAT-13 (tj-002 « Chaîne de deux », 3 coups) : ta voiture et 3 autres véhicules.
    expect(
      screen.getByRole('group', { name: 'Parking de 6 × 6 cases, sortie à droite sur la ligne 3' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ta voiture, horizontale/ })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /^(Ta voiture|Voiture [A-Z]|Camion [A-Z]), / }),
    ).toHaveLength(4);
  });
});
