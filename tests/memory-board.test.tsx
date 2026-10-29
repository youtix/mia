import { NavigationProvider } from '@/core/navigation';
import { getGameProgressSummary, type BaseLevelDefinition } from '@/core/progression';
import type * as MiaStorage from '@/core/storage';
import { DEFAULT_MEMORY_GAME_SETTINGS, type StorageContextValue } from '@/core/storage';
import {
  getMemoryCardLabel,
  MATCH_DELAY_MS,
  MEMORY_ICONS,
  MEMORY_ROTATIONS,
  MEMORY_SHAPES,
  MemoryBoard,
  MemorySymbolIcon,
  MISMATCH_DELAY_MS,
  SWAP_HIGHLIGHT_MS,
  type MemoryCard,
  type MemoryLevelConfig,
} from '@/games/memory';
import {
  formatGroups,
  getCrownTargetLabel,
  getDefeatTitle,
  getSwapRuleLabel,
} from '@/games/memory/components/labels';
import type { MemoryGameSettings, TimeFactor, UserProfile } from '@/types/mia';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Profil actif vu par le plateau (`useMiaStorage`, FEAT-19). Le `StorageProvider` réel charge la
 * sauvegarde après le montage, puis rejoue le mode TV : le plateau est monté sur un contexte
 * simulé, profil déjà connu, comme `GameScreen` le monte une fois la sauvegarde chargée. Le reste
 * du module (`DEFAULT_MEMORY_GAME_SETTINGS`) est réel.
 */
const storage = vi.hoisted((): { activeProfile: UserProfile | null } => ({ activeProfile: null }));

vi.mock('@/core/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof MiaStorage>();
  // Nouvel objet de contexte à chaque rendu : le plateau ne doit pas dépendre de son identité.
  const useMiaStorage = (): Pick<StorageContextValue, 'activeProfile'> => ({
    activeProfile: storage.activeProfile,
  });
  return { ...actual, useMiaStorage };
});

/**
 * Configuration de base : 2 × 2 en paires, sans aperçu ni limite d'erreurs. Avec `Math.random`
 * simulé à 0, chaque mélange conserve l'ordre : les cartes d'un groupe se suivent (Soleil, Soleil,
 * Chat, Chat, Cœur, Cœur, Lune, Lune…), une icône de chaque thème à tour de rôle.
 */
const BASE_CONFIG: MemoryLevelConfig = {
  cols: 2,
  rows: 2,
  matchSize: 2,
  visualMode: 'distinct_color_shape',
  previewSeconds: 0,
  maxMistakes: null,
  swapEveryNMistakes: null,
  perfectMaxMistakes: 0,
};

const CREATED_AT = '2026-10-01T09:00:00.000Z';

function definition(
  id: string,
  order: number,
  config: MemoryLevelConfig,
): BaseLevelDefinition<MemoryLevelConfig> {
  return { id, gameId: 'memory', tier: 'very_easy', order, config };
}

/** Léo : Étoile #1 déjà gagnée avec la couronne. */
function crownedPlayer(): UserProfile {
  return {
    id: 'p1',
    name: 'Léo',
    avatarId: 'fox',
    createdAt: CREATED_AT,
    gamesProgress: {
      memory: {
        gameId: 'memory',
        levels: {
          'mem-001': {
            levelId: 'mem-001',
            completed: true,
            isPerfect: true,
            bestMoves: 2,
            bestTimeSeconds: 4,
            timesPlayed: 1,
            completedAt: CREATED_AT,
          },
        },
        lastPlayedLevelId: 'mem-001',
      },
    },
    gameSettings: { memory: { previewFactor: 1, mismatchFactor: 1 } },
  };
}

/** Mia : aucune progression, réglages de Memory donnés (FEAT-19), les autres par défaut. */
function playerWithSettings(memory: Partial<MemoryGameSettings>): UserProfile {
  return {
    id: 'p2',
    name: 'Mia',
    avatarId: 'owl',
    createdAt: CREATED_AT,
    gamesProgress: {},
    gameSettings: { memory: { ...DEFAULT_MEMORY_GAME_SETTINGS, ...memory } },
  };
}

interface BoardOptions {
  config?: Partial<MemoryLevelConfig>;
  /** Niveau joué : 0 (Étoile #1, suivie de l'Étoile #2) ou 1 (dernière étoile du catalogue) */
  levelIndex?: number;
  /** Profil actif : progression (`summary`) et réglages de Memory lus par le plateau (FEAT-19) */
  profile?: UserProfile | null;
}

/** Monte le plateau comme `GameScreen.renderLevel` : niveau du résumé et commandes simulées. */
function renderBoard({ config = {}, levelIndex = 0, profile = null }: BoardOptions = {}) {
  storage.activeProfile = profile;
  const catalog = [
    definition('mem-001', 10, { ...BASE_CONFIG, ...config }),
    definition('mem-002', 20, BASE_CONFIG),
  ];
  const summary = getGameProgressSummary('memory', catalog, profile);
  const level = summary.allLevels[levelIndex];
  if (!level) throw new Error(`Niveau ${String(levelIndex)} absent du catalogue de test`);
  const controls = {
    summary,
    playLevel: vi.fn(),
    exitToMap: vi.fn(),
    // Comme après `recordLevelVictory` : la sauvegarde remplace le profil actif par un nouvel objet
    // (mêmes valeurs) ; la partie en cours et ses minuteurs ne doivent pas y réagir.
    recordVictory: vi.fn(() => {
      if (storage.activeProfile) storage.activeProfile = structuredClone(storage.activeProfile);
      return Promise.resolve();
    }),
  };
  const view = render(<MemoryBoard level={level} controls={controls} />, {
    wrapper: NavigationProvider,
  });
  /** Nouveau rendu du même plateau (ex: après un changement de `storage.activeProfile`). */
  const rerender = () => {
    view.rerender(<MemoryBoard level={level} controls={controls} />);
  };
  return { ...controls, rerender };
}

/** Mode TV forcé avant le montage : le moteur D-Pad démarre en mode `dpad`. */
function forceTvMode(): void {
  document.documentElement.dataset.tv = 'on';
}

/** Appuie sur une touche (cible : élément focalisé) ; `true` si le moteur D-Pad l'a consommée. */
function press(key: string): boolean {
  return !fireEvent.keyDown(document.activeElement ?? document.body, { key });
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Comme `advance`, en laissant aussi s'exécuter les promesses (fin de sortie d'une modale). */
async function advanceAsync(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function getBoard(): HTMLElement {
  return screen.getByRole('group', { name: /^Plateau de/ });
}

/** Cartes dans l'ordre du moteur (ordre du DOM) */
function getCards(): HTMLElement[] {
  return within(getBoard()).getAllByRole('button');
}

function getCard(index: number): HTMLElement {
  const card = getCards()[index];
  if (!card) throw new Error(`Carte ${String(index)} absente du plateau`);
  return card;
}

function clickCards(...indices: number[]): void {
  for (const index of indices) fireEvent.click(getCard(index));
}

function getHud(): HTMLElement {
  return screen.getByRole('region', { name: 'État de la partie' });
}

function getButton(name: string | RegExp): HTMLElement {
  return screen.getByRole('button', { name });
}

function getStatus(): HTMLElement {
  return screen.getByRole('status');
}

/** jsdom ne lit pas Tailwind : colonnes affichées par `memory-grid` simulées (zone en portrait). */
function simulateShownColumns(count: number): void {
  const realGetComputedStyle = window.getComputedStyle.bind(window);
  const template = Array.from({ length: count }, () => '80px').join(' ');
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
    if (!element.classList.contains('memory-grid')) {
      return realGetComputedStyle(element, pseudoElement);
    }
    return {
      getPropertyValue: (property: string) =>
        property === 'grid-template-columns' ? template : '',
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
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  storage.activeProfile = null;
  delete document.documentElement.dataset.tv;
});

describe('Partie au doigt', () => {
  it('retourne les cartes, valide les paires et ouvre la modale de victoire', () => {
    const controls = renderBoard();

    expect(screen.getByRole('heading', { level: 1, name: 'Étoile #1' })).toBeInTheDocument();
    expect(getCards()).toHaveLength(4);
    expect(getCard(0)).toHaveAccessibleName('Carte cachée, ligne 1, colonne 1');
    expect(getCard(3)).toHaveAccessibleName('Carte cachée, ligne 2, colonne 2');

    clickCards(0);
    expect(getCard(0)).toHaveAttribute('data-state', 'flipped');
    expect(getCard(0)).toHaveAccessibleName('Soleil, ligne 1, colonne 1');

    clickCards(1);
    advance(MATCH_DELAY_MS - 1);
    expect(getCard(1)).toHaveAttribute('data-state', 'flipped');
    advance(1);
    expect(getCard(0)).toHaveAttribute('data-state', 'matched');
    expect(getCard(1)).toHaveAccessibleName('Soleil, trouvée, ligne 1, colonne 2');
    expect(getHud()).toHaveTextContent('Paires : 1 / 2');

    clickCards(2, 3);
    advance(MATCH_DELAY_MS);

    const dialog = screen.getByRole('dialog', { name: 'Étoile #1 gagnée !' });
    expect(dialog).toHaveAccessibleDescription('2 coups · 0 erreur');
    expect(within(dialog).getByText('Parfait ! Couronne gagnée')).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Étoile Suivante (#2)', 'Rejouer', 'Carte des Étoiles']);
    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 2,
      timeSeconds: 1,
      isPerfect: true,
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Étoile Suivante (#2)' }));
    expect(controls.playLevel).toHaveBeenCalledExactlyOnceWith('mem-002');
  });

  it('laisse une erreur visible 900 ms, ignore les cartes pendant l’évaluation puis les cache', () => {
    renderBoard({ config: { cols: 3 } });

    clickCards(0, 2);
    // Coup complet : une troisième carte est ignorée par le moteur.
    clickCards(4);
    expect(getCard(4)).toHaveAttribute('data-state', 'hidden');
    advance(MISMATCH_DELAY_MS - 1);
    expect(getCard(0)).toHaveAccessibleName('Soleil, ligne 1, colonne 1');
    expect(getCard(2)).toHaveAccessibleName('Chat, ligne 1, colonne 3');
    advance(1);

    expect(getCards().map((card) => card.dataset.state)).toEqual(Array(6).fill('hidden'));
    expect(getHud()).toHaveTextContent('Erreurs : 1');
  });

  it('enregistre une victoire sans couronne et invite à rejouer pour la gagner', () => {
    const controls = renderBoard();

    clickCards(0, 2);
    advance(MISMATCH_DELAY_MS);
    expect(within(getHud()).getByText('Sans erreur')).toHaveClass('line-through');
    clickCards(0, 1);
    advance(MATCH_DELAY_MS);
    clickCards(2, 3);
    advance(MATCH_DELAY_MS);

    const dialog = screen.getByRole('dialog', { name: 'Étoile #1 gagnée !' });
    expect(dialog).toHaveAccessibleDescription('3 coups · 1 erreur');
    expect(
      within(dialog).getByText('Couronne : sans erreur, tu en as fait 1. Rejoue pour la gagner !'),
    ).toBeInTheDocument();
    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 3,
      timeSeconds: 2,
      isPerfect: false,
    });
  });

  it('rejoue une nouvelle partie et enregistre chaque victoire', async () => {
    const controls = renderBoard();
    clickCards(0, 1);
    advance(MATCH_DELAY_MS);
    clickCards(2, 3);
    advance(MATCH_DELAY_MS);

    fireEvent.click(getButton('Rejouer'));
    await advanceAsync(1000);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getCards().map((card) => card.dataset.state)).toEqual(Array(4).fill('hidden'));
    expect(getHud()).toHaveTextContent('Paires : 0 / 2');

    clickCards(0, 1);
    advance(MATCH_DELAY_MS);
    clickCards(2, 3);
    advance(MATCH_DELAY_MS);
    expect(controls.recordVictory).toHaveBeenCalledTimes(2);
  });

  it('ne propose pas d’étoile suivante après la dernière étoile du catalogue', () => {
    renderBoard({ levelIndex: 1 });

    clickCards(0, 1);
    advance(MATCH_DELAY_MS);
    clickCards(2, 3);
    advance(MATCH_DELAY_MS);

    const dialog = screen.getByRole('dialog', { name: 'Étoile #2 gagnée !' });
    expect(within(dialog).queryByRole('button', { name: /Étoile Suivante/ })).toBeNull();
    expect(within(dialog).getAllByRole('button')[0]).toHaveAccessibleName('Rejouer');
  });

  it.each([
    [true, 'Parfait !'],
    [false, null],
  ])(
    'tient compte d’une couronne déjà gagnée (victoire parfaite : %s)',
    (isPerfect, crownMessage) => {
      renderBoard({ profile: crownedPlayer() });
      expect(within(getHud()).getByText('Couronne déjà gagnée')).toBeInTheDocument();

      if (!isPerfect) {
        clickCards(0, 2);
        advance(MISMATCH_DELAY_MS);
      }
      clickCards(0, 1);
      advance(MATCH_DELAY_MS);
      clickCards(2, 3);
      advance(MATCH_DELAY_MS);

      const dialog = screen.getByRole('dialog', { name: 'Étoile #1 gagnée !' });
      expect(within(dialog).queryByText(/Couronne/)).toBeNull();
      if (crownMessage) expect(within(dialog).getByText(crownMessage)).toBeInTheDocument();
      else expect(within(dialog).queryByText(/Parfait/)).toBeNull();
    },
  );

  it('revient à la Carte des Étoiles depuis l’en-tête ou la modale', () => {
    const controls = renderBoard();

    fireEvent.click(getButton('Retour'));
    expect(controls.exitToMap).toHaveBeenCalledOnce();

    clickCards(0, 1);
    advance(MATCH_DELAY_MS);
    clickCards(2, 3);
    advance(MATCH_DELAY_MS);
    fireEvent.click(getButton('Carte des Étoiles'));
    expect(controls.exitToMap).toHaveBeenCalledTimes(2);
  });

  it('recommence une partie en cours avec de nouvelles cartes cachées', () => {
    renderBoard({ config: { cols: 3 } });
    clickCards(0, 1);
    advance(MATCH_DELAY_MS);
    clickCards(2);

    fireEvent.click(getButton('Recommencer'));

    expect(getCards().map((card) => card.dataset.state)).toEqual(Array(6).fill('hidden'));
    expect(getHud()).toHaveTextContent('Paires : 0 / 3');
  });
});

describe('Partie à la télécommande', () => {
  it('se joue avec les flèches et OK jusqu’à la modale de victoire', () => {
    forceTvMode();
    const controls = renderBoard();

    expect(getCard(0)).toHaveFocus();
    expect(getCard(0)).toHaveAttribute('data-focused', 'true');

    expect(press('Enter')).toBe(true);
    expect(press('ArrowRight')).toBe(true);
    expect(getCard(1)).toHaveFocus();
    press('Enter');
    advance(MATCH_DELAY_MS);
    press('ArrowDown');
    press('Enter');
    press('ArrowLeft');
    press('Enter');
    advance(MATCH_DELAY_MS);

    const dialog = screen.getByRole('dialog', { name: 'Étoile #1 gagnée !' });
    const next = within(dialog).getByRole('button', { name: 'Étoile Suivante (#2)' });
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute('data-focused', 'true');
    expect(controls.recordVictory).toHaveBeenCalledOnce();

    press('ArrowDown');
    expect(within(dialog).getByRole('button', { name: 'Rejouer' })).toHaveFocus();
    press('ArrowUp');
    expect(press('Enter')).toBe(true);
    expect(controls.playLevel).toHaveBeenCalledExactlyOnceWith('mem-002');
  });

  it('rejoint l’en-tête par le haut (Retour à gauche, Recommencer à droite) et en revient', () => {
    forceTvMode();
    renderBoard();

    // Bords sans voisin : le curseur reste en place.
    press('ArrowLeft');
    expect(getCard(0)).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Retour')).toHaveFocus();
    expect(getButton('Retour')).toHaveAttribute('data-focused', 'true');
    press('ArrowLeft');
    expect(getButton('Retour')).toHaveFocus();
    press('ArrowRight');
    expect(getButton('Recommencer')).toHaveFocus();
    press('ArrowDown');
    expect(getCard(0)).toHaveFocus();

    press('ArrowRight');
    press('Enter');
    expect(getCard(1)).toHaveAttribute('data-state', 'flipped');
    press('ArrowUp');
    expect(getButton('Recommencer')).toHaveFocus();
    press('Enter');

    expect(getCards().map((card) => card.dataset.state)).toEqual(Array(4).fill('hidden'));
    expect(getCard(1)).toHaveFocus();
  });

  it('revient à la Carte des Étoiles avec Retour, depuis le plateau comme depuis la modale', () => {
    forceTvMode();
    const controls = renderBoard();

    expect(press('Backspace')).toBe(true);
    expect(controls.exitToMap).toHaveBeenCalledOnce();

    press('Enter');
    press('ArrowRight');
    press('Enter');
    advance(MATCH_DELAY_MS);
    press('ArrowDown');
    press('Enter');
    press('ArrowLeft');
    press('Enter');
    advance(MATCH_DELAY_MS);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    expect(press('Escape')).toBe(true);
    expect(controls.exitToMap).toHaveBeenCalledTimes(2);
  });

  it('suit la grille tournée quand la zone du plateau est en portrait', () => {
    simulateShownColumns(2);
    forceTvMode();
    renderBoard({ config: { cols: 4, rows: 2 } });

    expect(getBoard()).toHaveAttribute('data-shape', 'wide');
    // Ordre du moteur conservé ; la ligne du moteur devient la colonne affichée.
    expect(getCard(1)).toHaveAccessibleName('Carte cachée, ligne 2, colonne 1');
    expect(getCard(4)).toHaveAccessibleName('Carte cachée, ligne 1, colonne 2');
    expect(getCard(0)).toHaveFocus();

    press('ArrowRight');
    expect(getCard(4)).toHaveFocus();
    press('ArrowDown');
    expect(getCard(5)).toHaveFocus();
    press('ArrowLeft');
    expect(getCard(1)).toHaveFocus();
  });
});

describe('Aperçu', () => {
  it('montre les cartes avec un compte à rebours, puis les cache', () => {
    renderBoard({ config: { previewSeconds: 2 } });

    const banner = screen.getByText('Mémorise les cartes !').closest('p');
    expect(banner).toHaveTextContent('Touche une carte pour commencer');
    expect(banner).toHaveTextContent('2 secondes');
    expect(getCards().map((card) => card.dataset.state)).toEqual(Array(4).fill('flipped'));
    expect(getCard(2)).toHaveAccessibleName('Chat, ligne 2, colonne 1');

    advance(1000);
    expect(banner).toHaveTextContent('1 seconde');
    expect(banner).not.toHaveTextContent('secondes');
    expect(getCard(0)).toHaveAttribute('data-state', 'flipped');

    advance(1000);
    expect(getCards().map((card) => card.dataset.state)).toEqual(Array(4).fill('hidden'));
  });

  it('se termine plus tôt au premier tap, sans retourner la carte touchée', () => {
    renderBoard({ config: { previewSeconds: 3 } });

    clickCards(2);
    expect(getCards().map((card) => card.dataset.state)).toEqual(Array(4).fill('hidden'));

    clickCards(2);
    expect(getCard(2)).toHaveAttribute('data-state', 'flipped');
  });

  it('se termine avec OK et garde Retour actif à la télécommande', () => {
    forceTvMode();
    const controls = renderBoard({ config: { previewSeconds: 3 } });

    expect(screen.getByText('Appuie sur OK pour commencer')).toBeInTheDocument();
    press('Enter');
    expect(getCards().map((card) => card.dataset.state)).toEqual(Array(4).fill('hidden'));

    press('Backspace');
    expect(controls.exitToMap).toHaveBeenCalledOnce();
  });

  it('mesure le temps de jeu à partir de la fin de l’aperçu', () => {
    const controls = renderBoard({ config: { previewSeconds: 3 } });
    advance(3000);

    clickCards(0, 1);
    advance(10_000);
    clickCards(2, 3);
    advance(MATCH_DELAY_MS);

    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 2,
      timeSeconds: 10,
      isPerfect: true,
    });
  });
});

describe('Réglages du profil (FEAT-19)', () => {
  function getBanner(): HTMLElement | null {
    return screen.getByText('Mémorise les cartes !').closest('p');
  }

  function expectAllCards(state: 'flipped' | 'hidden', count = 4): void {
    expect(getCards().map((card) => card.dataset.state)).toEqual(Array<string>(count).fill(state));
  }

  it('réduit l’aperçu de moitié (5 s × 0,5) avec un compte à rebours calé sur sa fin', () => {
    renderBoard({
      config: { previewSeconds: 5 },
      profile: playerWithSettings({ previewFactor: 0.5 }),
    });
    const banner = getBanner();

    // 2,5 s : « 3 » pendant 0,5 s, puis « 2 » et « 1 » pendant 1 s chacun ; cartes cachées à 2,5 s.
    expect(banner).toHaveTextContent('3 secondes');
    advance(499);
    expect(banner).toHaveTextContent('3 secondes');
    advance(1);
    expect(banner).toHaveTextContent('2 secondes');
    advance(1000);
    expect(banner).toHaveTextContent('1 seconde');
    expect(banner).not.toHaveTextContent('secondes');
    advance(999);
    expectAllCards('flipped');
    expect(banner).toHaveTextContent('1 seconde');
    advance(1);
    expectAllCards('hidden');
  });

  it('joue l’aperçu de la partie en cours même si le facteur change pendant l’aperçu', () => {
    const { rerender } = renderBoard({
      config: { previewSeconds: 5 },
      profile: playerWithSettings({ previewFactor: 1 }),
    });
    expect(getBanner()).toHaveTextContent('5 secondes');

    // Choix du joueur imposé (ou autre onglet) : le profil actif change pendant l'aperçu.
    advance(1000);
    storage.activeProfile = playerWithSettings({ previewFactor: 2 });
    rerender();

    // La partie garde ses 5 s, comme son compte à rebours : cartes cachées à 5 s, pas à 10 s.
    advance(3999);
    expectAllCards('flipped');
    expect(getBanner()).toHaveTextContent('1 seconde');
    advance(1);
    expectAllCards('hidden');

    // La partie suivante joue le nouveau facteur : 10 s.
    fireEvent.click(screen.getByRole('button', { name: 'Recommencer' }));
    expect(getBanner()).toHaveTextContent('10 secondes');
    expectAllCards('flipped');
  });

  it('double l’aperçu (5 s × 2) : compte à rebours depuis 10, cartes cachées à 10 s', () => {
    renderBoard({
      config: { previewSeconds: 5 },
      profile: playerWithSettings({ previewFactor: 2 }),
    });
    const banner = getBanner();

    expect(banner).toHaveTextContent('10 secondes');
    advance(1000);
    expect(banner).toHaveTextContent('9 secondes');
    advance(8999);
    expectAllCards('flipped');
    expect(banner).toHaveTextContent('1 seconde');
    advance(1);
    expectAllCards('hidden');
  });

  it('ne donne jamais d’aperçu à une étoile qui n’en a pas, quel que soit le facteur', () => {
    renderBoard({
      config: { previewSeconds: 0 },
      profile: playerWithSettings({ previewFactor: 2 }),
    });

    expect(screen.queryByText('Mémorise les cartes !')).not.toBeInTheDocument();
    expectAllCards('hidden');
    expect(getHud()).toHaveTextContent('Paires : 0 / 2');
  });

  it.each<[TimeFactor, number]>([
    [2, 1800],
    [0.5, 450],
  ])(
    'laisse une erreur visible 900 ms × %s = %i ms, sans toucher aux 350 ms d’un groupe',
    (mismatchFactor, delay) => {
      renderBoard({ config: { cols: 3 }, profile: playerWithSettings({ mismatchFactor }) });

      clickCards(0, 2);
      advance(delay - 1);
      expect(getCard(0)).toHaveAttribute('data-state', 'flipped');
      expect(getCard(2)).toHaveAttribute('data-state', 'flipped');
      advance(1);
      expectAllCards('hidden', 6);

      clickCards(0, 1);
      advance(MATCH_DELAY_MS - 1);
      expect(getCard(1)).toHaveAttribute('data-state', 'flipped');
      advance(1);
      expect(getCard(0)).toHaveAttribute('data-state', 'matched');
      expect(getCard(1)).toHaveAttribute('data-state', 'matched');
    },
  );

  it('garde les temps du niveau sans profil actif', () => {
    renderBoard({ config: { cols: 3, previewSeconds: 2 }, profile: null });
    const banner = getBanner();

    expect(banner).toHaveTextContent('2 secondes');
    advance(1999);
    expectAllCards('flipped', 6);
    advance(1);
    expectAllCards('hidden', 6);

    clickCards(0, 2);
    advance(MISMATCH_DELAY_MS - 1);
    expect(getCard(0)).toHaveAttribute('data-state', 'flipped');
    advance(1);
    expectAllCards('hidden', 6);
  });

  it('termine un aperçu fractionnaire au premier tap, sans retourner la carte touchée', () => {
    renderBoard({
      config: { previewSeconds: 5 },
      profile: playerWithSettings({ previewFactor: 0.5 }),
    });
    advance(700);

    clickCards(2);
    expectAllCards('hidden');

    // Le minuteur de l'aperçu est annulé : la partie suit son cours au-delà des 2,5 s.
    clickCards(2);
    expect(getCard(2)).toHaveAttribute('data-state', 'flipped');
    advance(1800);
    expect(getCard(2)).toHaveAttribute('data-state', 'flipped');
    expect(getHud()).toHaveTextContent('Paires : 0 / 2');
  });

  it('termine un aperçu fractionnaire avec OK à la télécommande', () => {
    forceTvMode();
    renderBoard({
      config: { previewSeconds: 5 },
      profile: playerWithSettings({ previewFactor: 1.5 }),
    });

    expect(getBanner()).toHaveTextContent('8 secondes');
    advance(500);
    expect(getBanner()).toHaveTextContent('7 secondes');
    press('Enter');
    expectAllCards('hidden');
  });

  it('garde la partie et ses réglages quand la sauvegarde remplace le profil actif', () => {
    renderBoard({
      config: { previewSeconds: 5 },
      profile: playerWithSettings({ previewFactor: 2 }),
    });
    clickCards(0);
    clickCards(0, 1);
    advance(MATCH_DELAY_MS);
    clickCards(2, 3);
    advance(MATCH_DELAY_MS);

    // `recordVictory` a remplacé le profil (nouvel objet) : rien n'est recréé.
    expect(screen.getByRole('dialog', { name: 'Étoile #1 gagnée !' })).toBeInTheDocument();
    expect(getCards().map((card) => card.dataset.state)).toEqual(Array(4).fill('matched'));

    fireEvent.click(getButton('Rejouer'));
    expect(getBanner()).toHaveTextContent('10 secondes');
  });
});

describe('Limite d’erreurs', () => {
  it('annonce le dernier essai puis la défaite, sans jamais afficher « 2 / 1 »', async () => {
    const controls = renderBoard({ config: { cols: 3, maxMistakes: 1 } });
    expect(getHud()).toHaveTextContent('Erreurs : 0 / 1');

    clickCards(0, 2);
    advance(MISMATCH_DELAY_MS);
    expect(getHud()).toHaveTextContent('Erreurs : 1 / 1');
    expect(getHud()).toHaveTextContent('Dernier essai !');
    expect(getStatus()).toHaveTextContent('Dernier essai !');

    clickCards(0, 2);
    advance(MISMATCH_DELAY_MS);

    const dialog = screen.getByRole('dialog', { name: 'Trop d’erreurs : plus d’une' });
    expect(dialog).toHaveAccessibleDescription('Tu avais trouvé 0 paire sur 3.');
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Réessayer', 'Carte des Étoiles']);
    expect(getHud()).toHaveTextContent('Erreurs : plus de 1');
    expect(getHud()).not.toHaveTextContent('2 / 1');
    expect(controls.recordVictory).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Réessayer' }));
    await advanceAsync(1000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getHud()).toHaveTextContent('Erreurs : 0 / 1');
  });

  it('pré-focalise « Réessayer » à la télécommande', () => {
    forceTvMode();
    renderBoard({ config: { maxMistakes: 0 } });
    expect(getHud()).toHaveTextContent('Aucune erreur permise');

    press('Enter');
    press('ArrowDown');
    press('Enter');
    advance(MISMATCH_DELAY_MS);

    const dialog = screen.getByRole('dialog', { name: 'Trop d’erreurs : aucune n’était permise' });
    expect(within(dialog).getByRole('button', { name: 'Réessayer' })).toHaveFocus();
  });
});

describe('Permutation', () => {
  it('signale les deux cartes échangées pendant 1 s', () => {
    renderBoard({ config: { cols: 3, maxMistakes: 3, swapEveryNMistakes: 1 } });
    const swapRule = within(getHud())
      .getByText('Permutation à chaque erreur')
      .closest('[data-tone]');
    expect(swapRule).toHaveAttribute('data-tone', 'swap');

    clickCards(0, 2);
    advance(MISMATCH_DELAY_MS);

    // Les deux cartes déjà vues de groupes différents (Soleil et Chat) ont échangé leur place.
    expect(getCards().map((card) => card.dataset.swapping ?? null)).toEqual([
      'true',
      null,
      'true',
      null,
      null,
      null,
    ]);
    expect(swapRule).toHaveAttribute('data-tone', 'swapping');
    expect(getStatus()).toHaveTextContent('Attention : deux cartes ont échangé leur place !');

    advance(SWAP_HIGHLIGHT_MS);
    expect(getCards().some((card) => card.dataset.swapping)).toBe(false);
    expect(swapRule).toHaveAttribute('data-tone', 'swap');

    clickCards(0);
    expect(getCard(0)).toHaveAccessibleName('Chat, ligne 1, colonne 1');
  });
});

describe('Barre d’état', () => {
  it.each<[string, Partial<MemoryLevelConfig>, string[]]>([
    ['paires sans limite', {}, ['Trouve les paires (2)', 'Paires : 0 / 2', 'Erreurs : 0']],
    [
      'triplets',
      { cols: 3, matchSize: 3, perfectMaxMistakes: 1 },
      ['Trouve les triplets (3)', 'Triplets : 0 / 2', '1 erreur max'],
    ],
    [
      'permutation et limite',
      { maxMistakes: 10, swapEveryNMistakes: 4, perfectMaxMistakes: 4 },
      ['Permutation toutes les 4 erreurs', 'Erreurs : 0 / 10', '4 erreurs max'],
    ],
  ])('affiche les règles et compteurs (%s)', (_, config, texts) => {
    renderBoard({ config });

    for (const text of texts) expect(getHud()).toHaveTextContent(text);
    expect(screen.getByText('Très Facile')).toBeInTheDocument();
  });

  it('dimensionne la grille selon sa forme configurée', () => {
    renderBoard({ config: { cols: 2, rows: 3 } });

    expect(getBoard()).toHaveClass('memory-grid');
    expect(getBoard()).toHaveAttribute('data-shape', 'tall');
    expect(getBoard().style.getPropertyValue('--memory-cols')).toBe('2');
    expect(getBoard().style.getPropertyValue('--memory-rows')).toBe('3');
  });
});

describe('Symboles et libellés', () => {
  const ALL_SYMBOLS = [...MEMORY_ICONS, ...MEMORY_SHAPES].map((symbol) => symbol.id);

  it('dessine chaque symbole de la banque, coloré et orienté', () => {
    for (const symbolId of ALL_SYMBOLS) {
      for (const rotationDeg of MEMORY_ROTATIONS) {
        const { container, unmount } = render(
          <MemorySymbolIcon
            symbolId={symbolId}
            rotationDeg={rotationDeg}
            colorClass="text-red-400"
            className="size-3/5"
          />,
        );
        const icon = container.firstElementChild;
        expect(icon, symbolId).toHaveAttribute('data-symbol', symbolId);
        expect(icon).toHaveClass('text-red-400', 'size-3/5');
        expect(icon?.querySelector('svg'), symbolId).not.toBeNull();
        if (rotationDeg !== 0) expect(icon).toHaveClass(`rotate-${String(rotationDeg)}`);
        unmount();
      }
    }
  });

  it('associe les icônes Lucide attendues (bolt → Zap, diamond → Gem, tree → TreePine)', () => {
    const iconClass = (symbolId: 'bolt' | 'diamond' | 'tree') =>
      render(<MemorySymbolIcon symbolId={symbolId} />).container.querySelector('svg')?.classList;

    expect(iconClass('bolt')).toContain('lucide-zap');
    expect(iconClass('diamond')).toContain('lucide-gem');
    expect(iconClass('tree')).toContain('lucide-tree-pine');
  });

  it('nomme une carte par son symbole et sa position, jamais par sa couleur', () => {
    const arrow: MemoryCard = {
      uid: 'arrow@90#1',
      groupId: 'arrow@90',
      symbolId: 'arrow',
      colorClass: 'text-cyan-300',
      rotationDeg: 90,
      state: 'flipped',
      seen: true,
    };

    expect(getMemoryCardLabel(arrow, 0, 1)).toBe('Flèche, vers la droite, ligne 1, colonne 2');
    expect(getMemoryCardLabel({ ...arrow, state: 'matched' }, 2, 0)).toBe(
      'Flèche, vers la droite, trouvée, ligne 3, colonne 1',
    );
    expect(getMemoryCardLabel({ ...arrow, state: 'hidden' }, 0, 0)).toBe(
      'Carte cachée, ligne 1, colonne 1',
    );
  });

  it('formule défaites, permutations, couronnes et groupes en français', () => {
    expect(getDefeatTitle(10)).toBe('Trop d’erreurs : plus de 10');
    expect(getDefeatTitle(1)).toBe('Trop d’erreurs : plus d’une');
    expect(getDefeatTitle(0)).toBe('Trop d’erreurs : aucune n’était permise');
    expect(getDefeatTitle(null)).toBe('Trop d’erreurs');
    expect(getSwapRuleLabel(1)).toBe('Permutation à chaque erreur');
    expect(getSwapRuleLabel(5)).toBe('Permutation toutes les 5 erreurs');
    expect(getCrownTargetLabel(0)).toBe('Sans erreur');
    expect(getCrownTargetLabel(6)).toBe('6 erreurs max');
    expect(formatGroups(1, 3)).toBe('1 triplet');
    expect(formatGroups(4, 2)).toBe('4 paires');
  });
});
