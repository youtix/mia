import PatternsPage, { metadata as patternsMetadata } from '@/app/patterns/page';
import { NavigationProvider } from '@/core/navigation';
import {
  GAME_REGISTRY,
  getGameProgressSummary,
  type BaseLevelDefinition,
} from '@/core/progression';
import type * as MiaStorage from '@/core/storage';
import {
  BEAT_MS,
  END_INPUT_GUARD_MS,
  INTRO_MS,
  LISTEN_TAIL_MS,
  PATTERN_ITEMS,
  PatternItemIcon,
  PatternsBoard,
  SUCCESS_MS,
  TOO_FAST_MS,
  type PatternLevelConfig,
} from '@/games/patterns';
import {
  formatRowLabel,
  getChoiceLabel,
  getCrownSentence,
} from '@/games/patterns/components/labels';
import type { UserProfile } from '@/types/mia';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { storage, synth } = vi.hoisted(() => ({
  storage: { soundEnabled: true, activeProfile: null as UserProfile | null },
  synth: { playSoundBeats: vi.fn(), playSoundJingle: vi.fn(), stopSounds: vi.fn() },
}));

/**
 * Réglage « Son » et profil actif vus par le plateau (`useMiaStorage`), comme une fois la sauvegarde
 * chargée par `GameScreen`. Le reste du module est réel.
 */
vi.mock('@/core/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof MiaStorage>();
  const useMiaStorage = () => ({
    state: { profiles: [{ id: 'p1' }], settings: { soundEnabled: storage.soundEnabled } },
    isLoaded: true,
    activeProfile: storage.activeProfile,
    updateState: vi.fn(() => Promise.resolve()),
  });
  return { ...actual, useMiaStorage };
});

/** Ce qui est joué, sans Web Audio : le déroulé du jeu n'en dépend pas (FEAT-21 §3.4). */
vi.mock('@/core/audio/synth', () => synth);

// Page `/patterns` : niveau lancé par l'adresse, choix du joueur déjà fait.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams({ level: 'pat-001' }),
}));
vi.mock('@/components/profile', () => ({ ProfileGate: () => null }));

/**
 * Configuration de base : A-B à 4 éléments, en pièces, 2 défis. Avec `Math.random` simulé à 0, chaque
 * mélange conserve l'ordre : A est le premier animal de la famille (Chat), B le suivant (Chien),
 * l'intrus le troisième (Poisson), et la bonne réponse, A, est à l'index 0 (FEAT-21 §4).
 */
const VISUAL_CONFIG: PatternLevelConfig = {
  rule: 'ab',
  family: 'animals',
  colorMode: 'distinct',
  visibleItems: 4,
  answerMode: 'visual',
  soundPairing: null,
  rounds: 2,
  stopRounds: 0,
  stopSeconds: 2,
  hasGuide: false,
};

/**
 * Mêmes défis en sons. Hasard à 0 : la bonne réponse reste à l'index 0 ; au premier défi, A est la
 * cloche ; au suivant, A et B échangent leurs sons.
 */
const SOUND_CONFIG: Partial<PatternLevelConfig> = { answerMode: 'sound', soundPairing: 'fixed' };

/** Propositions du premier défi en sons : A-B-A-B, A-A-B-B, A-B-B-A. */
const SOUND_0 = ['bell', 'drum', 'bell', 'drum'];
const SOUND_1 = ['bell', 'bell', 'drum', 'drum'];

/** Durée de l'écoute d'une proposition de 4 temps. */
const LISTEN_MS = 4 * BEAT_MS + LISTEN_TAIL_MS;

const CREATED_AT = '2026-10-01T09:00:00.000Z';

function definition(
  id: string,
  order: number,
  config: PatternLevelConfig,
): BaseLevelDefinition<PatternLevelConfig> {
  return { id, gameId: 'patterns', tier: 'very_easy', order, config };
}

/** Léo : Étoile #1 déjà gagnée avec la couronne. */
function crownedPlayer(): UserProfile {
  return {
    id: 'p1',
    name: 'Léo',
    avatarId: 'fox',
    createdAt: CREATED_AT,
    gamesProgress: {
      patterns: {
        gameId: 'patterns',
        levels: {
          'pat-001': {
            levelId: 'pat-001',
            completed: true,
            isPerfect: true,
            bestMoves: 2,
            bestTimeSeconds: 4,
            timesPlayed: 1,
            completedAt: CREATED_AT,
          },
        },
        lastPlayedLevelId: 'pat-001',
      },
    },
    gameSettings: { memory: { previewFactor: 1, mismatchFactor: 1 } },
  };
}

interface BoardOptions {
  config?: Partial<PatternLevelConfig>;
  /** Niveau joué : 0 (Étoile #1, suivie de l'Étoile #2) ou 1 (dernière étoile du catalogue) */
  levelIndex?: number;
  profile?: UserProfile | null;
  soundEnabled?: boolean;
}

/** Monte le plateau comme `GameScreen.renderLevel` : niveau du résumé et commandes simulées. */
function renderBoard({
  config = {},
  levelIndex = 0,
  profile = null,
  soundEnabled = true,
}: BoardOptions = {}) {
  storage.activeProfile = profile;
  storage.soundEnabled = soundEnabled;
  const catalog = [
    definition('pat-001', 10, { ...VISUAL_CONFIG, ...config }),
    definition('pat-002', 20, { ...VISUAL_CONFIG, ...config }),
  ];
  const summary = getGameProgressSummary('patterns', catalog, profile);
  const level = summary.allLevels[levelIndex];
  if (!level) throw new Error(`Niveau ${String(levelIndex)} absent du catalogue de test`);
  const controls = {
    summary,
    playLevel: vi.fn(),
    exitToMap: vi.fn(),
    recordVictory: vi.fn(() => Promise.resolve()),
  };
  render(<PatternsBoard level={level} controls={controls} />, { wrapper: NavigationProvider });
  return controls;
}

/** Mode TV forcé avant le montage : le moteur D-Pad démarre en mode `dpad`. */
function forceTvMode(): void {
  document.documentElement.dataset.tv = 'on';
}

/** Appuie sur une touche (cible : élément focalisé) ; `true` si le moteur D-Pad l'a consommée. */
function press(key: string): boolean {
  return !fireEvent.keyDown(document.activeElement ?? document.body, { key });
}

/**
 * Laisse aussi s'exécuter les promesses : fin de sortie de l'ancienne ligne et de la modale. Un appel
 * par phase : React n'exécute les effets, donc le minuteur de la phase suivante, qu'à la fin de `act`.
 */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Fin de l'apparition, puis assez d'attente pour qu'une mauvaise réponse ne soit pas trop rapide. */
async function unlockCalmly(): Promise<void> {
  await advance(INTRO_MS);
  await advance(TOO_FAST_MS);
}

function getRow(): HTMLElement {
  return screen.getByRole('group', { name: /^Suite :/ });
}

function getChoices(): HTMLElement[] {
  return within(screen.getByRole('group', { name: 'Réponses' })).getAllByRole('button');
}

function getChoice(index: number): HTMLElement {
  const choice = getChoices()[index];
  if (!choice) throw new Error(`Proposition ${String(index)} absente`);
  return choice;
}

function tap(...indices: number[]): void {
  for (const index of indices) fireEvent.click(getChoice(index));
}

function getTarget(): Element {
  const target = getRow().querySelector('[data-target]');
  if (!target) throw new Error('Cible absente de la ligne');
  return target;
}

/** États des points de progression, dans l'ordre. */
function getDots(): (string | undefined)[] {
  const dots = screen.getByRole('img', { name: /^Défi / });
  return Array.from(dots.querySelectorAll<HTMLElement>('[data-state]')).map(
    (dot) => dot.dataset.state,
  );
}

function getStatus(): HTMLElement {
  return screen.getByRole('status');
}

function getOverlay(): Element | null {
  return document.querySelector('[data-stop-overlay]');
}

function getMascot(): Element | null {
  return document.querySelector('[data-mascot]');
}

/** Index des éléments de la ligne sur lesquels passe la révélation. */
function getActiveCells(): number[] {
  return Array.from(getRow().querySelectorAll('[data-row-item]')).flatMap((cell, index) =>
    cell.hasAttribute('data-beat-active') ? [index] : [],
  );
}

/** Images des sons d'un élément : une par temps déjà apparu. */
function getBeatIcons(index: number): (string | null)[] {
  return Array.from(getChoice(index).querySelectorAll('[data-beat-icon]')).map((icon) =>
    icon.getAttribute('data-beat-icon'),
  );
}

function getBeatBadges(): (string | null)[] {
  return Array.from(getRow().querySelectorAll('[data-beat-badge]')).map((badge) =>
    badge.getAttribute('data-beat-badge'),
  );
}

/** Texte visible de la page : tout, sauf ce qui est réservé aux lecteurs d'écran. */
function getVisibleText(): string {
  const page = document.body.cloneNode(true) as HTMLElement;
  for (const hidden of page.querySelectorAll('.sr-only')) hidden.remove();
  return page.textContent.trim();
}

/** Valide une proposition sonore : écoute, puis deuxième appui. */
async function listenAndValidate(index: number): Promise<void> {
  tap(index);
  await advance(LISTEN_MS);
  tap(index);
}

/** Réussit le défi en pièces en cours et enchaîne : fin de la célébration, puis apparition. */
async function solveVisualRound(): Promise<void> {
  tap(0);
  await advance(SUCCESS_MS);
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
  vi.clearAllMocks();
  storage.activeProfile = null;
  storage.soundEnabled = true;
  delete document.documentElement.dataset.tv;
});

describe('Zéro texte', () => {
  it('n’affiche aucun texte en pièces, de la première image à l’écran de fin', async () => {
    renderBoard({ config: { hasGuide: true, rounds: 1 } });
    expect(getVisibleText()).toBe('');

    await unlockCalmly();
    tap(1);
    expect(getVisibleText()).toBe('');
    await advance(TOO_FAST_MS);
    tap(2);
    await advance(TOO_FAST_MS);
    tap(1);
    expect(getChoice(0)).toHaveAttribute('data-hint', 'true');
    expect(getVisibleText()).toBe('');

    tap(0);
    expect(getVisibleText()).toBe('');
    await advance(SUCCESS_MS);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(getVisibleText()).toBe('');
  });

  it.each([
    ['actif', true],
    ['coupé', false],
  ])('n’affiche aucun texte en sons, STOP compris (son %s)', async (_, soundEnabled) => {
    renderBoard({
      config: { ...SOUND_CONFIG, rounds: 1, stopRounds: 1 },
      soundEnabled,
    });
    await advance(INTRO_MS);
    expect(getOverlay()).not.toBeNull();
    tap(0);
    expect(getVisibleText()).toBe('');

    await advance(2000);
    tap(1);
    expect(getVisibleText()).toBe('');
    await advance(LISTEN_MS);
    expect(getChoice(1)).toHaveAttribute('data-state', 'armed');
    expect(getVisibleText()).toBe('');

    await listenAndValidate(0);
    expect(getVisibleText()).toBe('');
    await advance(4 * BEAT_MS);
    expect(getVisibleText()).toBe('');
    await advance(SUCCESS_MS);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(getVisibleText()).toBe('');
  });

  it('garde les noms accessibles : titre, Retour, ligne, propositions, progression', () => {
    renderBoard();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Suites Logiques, Étoile #1' }),
    ).toHaveClass('sr-only');
    expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument();
    expect(getRow()).toHaveAccessibleName('Suite : Chat, Chien, Chat, Chien, puis une case vide');
    expect(getChoices().map((choice) => choice.getAttribute('aria-label'))).toEqual([
      'Chat',
      'Chien',
      'Poisson',
    ]);
    expect(screen.getByRole('img', { name: 'Défi 1 sur 2' })).toBeInTheDocument();
  });
});

describe('Boucle de jeu', () => {
  it('garde les propositions inertes pendant l’apparition, sans compter de tape', async () => {
    const controls = renderBoard({ config: { rounds: 1 } });

    for (const choice of getChoices()) {
      expect(choice).toHaveAttribute('aria-disabled', 'true');
      expect(choice).not.toBeDisabled();
    }
    tap(0, 1);
    await advance(INTRO_MS - 1);
    expect(getTarget()).toHaveAttribute('data-target', 'empty');
    expect(synth.playSoundJingle).not.toHaveBeenCalled();
    expect(getChoice(1)).toHaveAttribute('data-bounce-tick', '0');

    await advance(1);
    expect(getChoice(0)).not.toHaveAttribute('aria-disabled');
    expect(getStatus()).toHaveTextContent('Défi 1 sur 1.');

    await solveVisualRound();
    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 1,
      timeSeconds: 1,
      isPerfect: true,
    });
  });

  it('place la bonne réponse dans la cible, puis passe au défi suivant', async () => {
    renderBoard();
    expect(getDots()).toEqual(['current', 'todo']);

    await advance(INTRO_MS);
    tap(0);

    // Réussite : la pièce est posée, particules et jingle partent tout de suite (geste utilisateur).
    expect(getTarget()).toHaveAttribute('data-target', 'filled');
    expect(getTarget().querySelector('[data-item="cat"]')).not.toBeNull();
    expect(getTarget().querySelectorAll('[data-particle]')).toHaveLength(12);
    expect(synth.playSoundJingle).toHaveBeenCalledExactlyOnceWith('round');
    expect(synth.playSoundBeats).not.toHaveBeenCalled();
    expect(getDots()).toEqual(['done', 'todo']);
    expect(getRow()).toHaveAccessibleName('Suite : Chat, Chien, Chat, Chien, puis Chat');
    expect(getStatus()).toHaveTextContent('Bravo !');
    for (const choice of getChoices()) expect(choice).toHaveAttribute('aria-disabled', 'true');

    // Un double tap est ignoré : la réussite ne compte qu'une fois.
    tap(0);
    expect(synth.playSoundJingle).toHaveBeenCalledOnce();

    await advance(SUCCESS_MS - 1);
    expect(getDots()).toEqual(['done', 'todo']);
    expect(getTarget()).toHaveAttribute('data-target', 'filled');

    await advance(1);
    expect(getDots()).toEqual(['done', 'current']);
    expect(getTarget()).toHaveAttribute('data-target', 'empty');
    expect(screen.getByRole('img', { name: 'Défi 2 sur 2' })).toBeInTheDocument();
    await advance(INTRO_MS);
    expect(getStatus()).toHaveTextContent('Défi 2 sur 2.');
    expect(getChoice(0)).not.toHaveAttribute('aria-disabled');
  });

  it('dimensionne la ligne sur une seule rangée : éléments et cible', () => {
    renderBoard({ config: { visibleItems: 6 } });

    expect(getRow()).toHaveClass('patterns-row');
    expect(getRow().style.getPropertyValue('--patterns-cells')).toBe('7');
    expect(getRow().querySelectorAll('[data-row-item]')).toHaveLength(6);
    expect(getRow().querySelectorAll('[data-target]')).toHaveLength(1);
  });

  it('remet à zéro la ligne d’un nouveau défi, même sans changer d’élément', async () => {
    renderBoard({ config: { rounds: 3 } });
    await advance(INTRO_MS);
    await solveVisualRound();
    await advance(INTRO_MS);
    expect(getTarget()).toHaveAttribute('data-target', 'empty');
    expect(getRow().querySelectorAll('[data-row-item]')).toHaveLength(4);
    expect(getDots()).toEqual(['done', 'current', 'todo']);
  });
});

describe('Erreurs et échelle d’aide', () => {
  it('fait rebondir une mauvaise réponse, qui reste disponible', async () => {
    renderBoard({ config: { rounds: 1 } });
    await unlockCalmly();

    tap(1);

    expect(getChoice(1)).toHaveAttribute('data-bounce-tick', '1');
    expect(getChoice(1).querySelector('[data-bounce]')).not.toBeNull();
    expect(getChoice(1)).not.toHaveAttribute('aria-disabled');
    expect(getChoice(1)).not.toBeDisabled();
    expect(getChoice(1)).not.toHaveAttribute('data-dimmed');
    expect(getOverlay()).toBeNull();
    expect(getStatus()).toHaveTextContent('Essaie encore.');
    expect(synth.playSoundJingle).not.toHaveBeenCalled();
    expect(synth.playSoundBeats).not.toHaveBeenCalled();
  });

  it('relance le rebond à chaque mauvaise réponse, même sur la même proposition', async () => {
    renderBoard({ config: { rounds: 1 } });
    await unlockCalmly();
    const button = getChoice(1);

    tap(1);
    const firstBounce = button.querySelector('[data-bounce]');
    await advance(TOO_FAST_MS);
    tap(1);
    const secondBounce = button.querySelector('[data-bounce]');

    expect(button).toHaveAttribute('data-bounce-tick', '2');
    // Nouveau nœud : l'animation repart. Le bouton, lui, garde le focus de la télécommande.
    expect(secondBounce).not.toBeNull();
    expect(secondBounce).not.toBe(firstBounce);
    expect(getChoice(1)).toBe(button);

    await advance(TOO_FAST_MS);
    tap(2);
    expect(getChoice(1)).toHaveAttribute('data-bounce-tick', '0');
    expect(getChoice(1).querySelector('[data-bounce]')).toBeNull();
    expect(getChoice(2)).toHaveAttribute('data-bounce-tick', '3');
  });

  it('monte l’aide à la 2e puis à la 3e mauvaise réponse du défi', async () => {
    renderBoard();
    await unlockCalmly();

    tap(1);
    expect(getRow()).not.toHaveAttribute('data-help');
    expect(document.querySelector('[data-hint]')).toBeNull();

    // 2e erreur : les unités de la ligne pulsent l'une après l'autre.
    await advance(TOO_FAST_MS);
    tap(2);
    expect(getRow()).toHaveAttribute('data-help', 'units');
    expect(
      Array.from(getRow().querySelectorAll<HTMLElement>('[data-row-item]')).map(
        (cell) => cell.dataset.unit,
      ),
    ).toEqual(['0', '0', '1', '1']);
    expect(document.querySelector('[data-hint]')).toBeNull();

    // 3e erreur : la bonne proposition luit, l'aide de la ligne reste.
    await advance(TOO_FAST_MS);
    tap(1);
    expect(getChoice(0)).toHaveAttribute('data-hint', 'true');
    expect(getChoice(0)).toHaveAccessibleName('Chat, c’est la bonne réponse');
    expect(getChoice(1)).not.toHaveAttribute('data-hint');
    expect(getChoice(2)).not.toHaveAttribute('data-hint');
    expect(getRow()).toHaveAttribute('data-help', 'units');

    // Défi réussi : plus d'aide. Le défi suivant repart sans aide.
    tap(0);
    expect(document.querySelector('[data-hint]')).toBeNull();
    expect(getRow()).not.toHaveAttribute('data-help');
    await advance(SUCCESS_MS);
    expect(getChoice(0)).not.toHaveAttribute('data-hint');
    expect(getRow()).not.toHaveAttribute('data-help');
  });

  it('découpe la ligne selon l’unité de la règle (A-B-B, unité de 3)', async () => {
    renderBoard({ config: { rule: 'abb', visibleItems: 5 } });
    await unlockCalmly();

    // A-B-B-A-B : le suivant est B, à l'index 1.
    tap(0);
    await advance(TOO_FAST_MS);
    tap(2);

    expect(
      Array.from(getRow().querySelectorAll<HTMLElement>('[data-row-item]')).map(
        (cell) => cell.dataset.unit,
      ),
    ).toEqual(['0', '0', '0', '1', '1']);
  });
});

describe('STOP', () => {
  it('suit une mauvaise réponse trop rapide, jamais une bonne', async () => {
    const { recordVictory } = renderBoard();
    await advance(INTRO_MS);

    // Bonne réponse immédiate : aucun STOP.
    await solveVisualRound();
    expect(getOverlay()).toBeNull();
    await advance(INTRO_MS);

    // Mauvaise réponse immédiate : STOP de 2 s.
    tap(2);
    expect(getOverlay()).not.toBeNull();
    expect(getStatus()).toHaveTextContent('Essaie encore. Stop ! Attends sans toucher.');
    for (const choice of getChoices()) {
      expect(choice).toHaveAttribute('data-dimmed', 'true');
      expect(choice).toHaveAttribute('aria-disabled', 'true');
      expect(choice).not.toBeDisabled();
    }
    expect(getChoice(2)).toHaveAttribute('data-bounce-tick', '1');

    await advance(1999);
    expect(getOverlay()).not.toBeNull();
    await advance(1);
    expect(getOverlay()).toBeNull();
    expect(getChoice(0)).not.toHaveAttribute('data-dimmed');
    expect(getChoice(0)).not.toHaveAttribute('aria-disabled');
    expect(getStatus()).toHaveTextContent('À toi !');

    await solveVisualRound();
    expect(recordVictory).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ moves: 3, isPerfect: false }),
    );
  });

  it('garde sa durée malgré les tapes, fait gigoter la mascotte et perd la couronne', async () => {
    const { recordVictory } = renderBoard({ config: { rounds: 1, stopRounds: 1 } });
    await advance(INTRO_MS);
    expect(getOverlay()).not.toBeNull();
    expect(getMascot()).toHaveAttribute('data-wobble-tick', '0');
    expect(getMascot()).not.toHaveAttribute('data-wobbling');
    const firstMascot = getMascot();

    await advance(500);
    tap(0);
    expect(getMascot()).toHaveAttribute('data-wobble-tick', '1');
    expect(getMascot()).toHaveAttribute('data-wobbling', 'true');
    // Nouveau nœud : l'animation repart à chaque tape, même rapprochée.
    expect(getMascot()).not.toBe(firstMascot);
    expect(getStatus()).toHaveTextContent('Pas encore, attends.');

    await advance(500);
    tap(1, 2);
    expect(getMascot()).toHaveAttribute('data-wobble-tick', '3');
    // Rien de plus : pas de rebond, pas d'erreur, pas de réponse donnée.
    expect(getChoice(1)).toHaveAttribute('data-bounce-tick', '0');
    expect(getTarget()).toHaveAttribute('data-target', 'empty');

    // Ni rallongé : le STOP finit à 2 s pile. Ni abrégé : il dure jusque-là.
    await advance(999);
    expect(getOverlay()).not.toBeNull();
    tap(0);
    await advance(1);
    expect(getOverlay()).toBeNull();

    await solveVisualRound();
    expect(recordVictory).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ moves: 1, isPerfect: false }),
    );
  });

  it('repart de zéro à chaque STOP : durée entière, mascotte immobile avant la première tape', async () => {
    renderBoard({ config: { rounds: 1 } });
    await advance(INTRO_MS);
    tap(1);
    await advance(500);
    tap(1);
    expect(getMascot()).toHaveAttribute('data-wobbling', 'true');
    await advance(1500);
    expect(getOverlay()).toBeNull();

    tap(2);
    expect(getOverlay()).not.toBeNull();
    expect(getMascot()).toHaveAttribute('data-wobble-tick', '1');
    expect(getMascot()).not.toHaveAttribute('data-wobbling');
    await advance(1999);
    expect(getOverlay()).not.toBeNull();
    await advance(1);
    expect(getOverlay()).toBeNull();
  });

  it('ouvre un défi prévu avec STOP, sans erreur ni couronne perdue si l’enfant attend', async () => {
    const { recordVictory } = renderBoard({ config: { stopRounds: 1, stopSeconds: 3 } });

    // Pas de STOP pendant l'apparition.
    expect(getOverlay()).toBeNull();
    await advance(INTRO_MS);
    expect(getOverlay()).not.toBeNull();
    expect(getStatus()).toHaveTextContent('Stop ! Attends sans toucher.');
    await advance(2999);
    expect(getOverlay()).not.toBeNull();
    await advance(1);
    expect(getOverlay()).toBeNull();
    expect(getChoice(0)).not.toHaveAttribute('aria-disabled');

    await solveVisualRound();
    // Hasard à 0 : le STOP prévu est sur le premier défi seulement.
    await advance(INTRO_MS);
    expect(getOverlay()).toBeNull();
    await solveVisualRound();

    expect(recordVictory).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ moves: 2, isPerfect: true }),
    );
  });

  it('déclare le calque transparent aux tapes et caché aux lecteurs d’écran', async () => {
    renderBoard({ config: { stopRounds: 1 } });
    await advance(INTRO_MS);

    expect(getOverlay()).toHaveClass('pointer-events-none');
    expect(getOverlay()).toHaveAttribute('aria-hidden', 'true');
  });

  it('compte comme une réponse la tape tombée entre la fin du STOP et le rendu', async () => {
    const { recordVictory } = renderBoard({ config: { rounds: 1, stopRounds: 1 } });
    await advance(INTRO_MS);
    expect(getOverlay()).not.toBeNull();

    // Même `act` : le minuteur du STOP a tiré, React n'a encore rien redessiné. Sans rendu immédiat,
    // cette tape réécrirait un STOP périmé, que plus aucun minuteur ne terminerait.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      tap(0);
    });

    expect(getOverlay()).toBeNull();
    expect(getTarget()).toHaveAttribute('data-target', 'filled');
    await advance(SUCCESS_MS);
    expect(recordVictory).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ moves: 1, isPerfect: true }),
    );
  });
});

describe('Réponses en sons', () => {
  it('écoute au premier appui, ignore les tapes pendant la lecture, valide au second', async () => {
    renderBoard({ config: SOUND_CONFIG });
    await advance(INTRO_MS);
    expect(getChoice(1)).toHaveAccessibleName('Son 2, appuie pour écouter');
    expect(getChoices().map((choice) => choice.dataset.state)).toEqual(['idle', 'idle', 'idle']);

    tap(1);
    expect(synth.playSoundBeats).toHaveBeenCalledExactlyOnceWith(SOUND_1, BEAT_MS);
    expect(getChoices().map((choice) => choice.dataset.state)).toEqual(['idle', 'playing', 'idle']);
    for (const choice of getChoices()) expect(choice).toHaveAttribute('aria-disabled', 'true');

    // Un double tap ne valide jamais, et une autre proposition n'interrompt pas l'écoute.
    tap(1, 0, 2);
    expect(synth.playSoundBeats).toHaveBeenCalledOnce();
    expect(getChoice(1)).toHaveAttribute('data-bounce-tick', '0');
    expect(getChoices().map((choice) => choice.dataset.state)).toEqual(['idle', 'playing', 'idle']);

    await advance(LISTEN_MS - 1);
    expect(getChoice(1)).toHaveAttribute('data-state', 'playing');
    await advance(1);

    expect(getChoice(1)).toHaveAttribute('data-state', 'armed');
    expect(getChoice(1).querySelector('[data-armed-badge]')).not.toBeNull();
    expect(getChoice(1)).toHaveAccessibleName('Son 2, appuie encore pour valider');
    expect(getChoice(1)).not.toHaveAttribute('aria-disabled');
    expect(getStatus()).toHaveTextContent('Son 2 prêt, appuie encore pour valider.');

    // Second appui sur une mauvaise proposition : elle rebondit, désarmée et toujours disponible.
    await advance(TOO_FAST_MS);
    tap(1);
    expect(getChoice(1)).toHaveAttribute('data-state', 'idle');
    expect(getChoice(1)).toHaveAttribute('data-bounce-tick', '1');
    expect(getChoice(1)).toHaveAccessibleName('Son 2, appuie pour écouter');
    expect(getOverlay()).toBeNull();
    expect(getStatus()).toHaveTextContent('Essaie encore.');
    expect(synth.playSoundBeats).toHaveBeenCalledOnce();
  });

  it('écoute une autre proposition : elle prend la place de la précédente', async () => {
    renderBoard({ config: SOUND_CONFIG });
    await advance(INTRO_MS);
    tap(1);
    await advance(LISTEN_MS);
    expect(getChoice(1)).toHaveAttribute('data-state', 'armed');

    tap(0);
    expect(synth.playSoundBeats).toHaveBeenLastCalledWith(SOUND_0, BEAT_MS);
    expect(getChoice(0)).toHaveAttribute('data-state', 'playing');
    expect(getChoice(1)).toHaveAttribute('data-state', 'idle');
    expect(getChoice(1).querySelector('[data-armed-badge]')).toBeNull();
  });

  it('fait suivre un STOP à la validation trop rapide d’une mauvaise proposition', async () => {
    renderBoard({ config: SOUND_CONFIG });
    await advance(INTRO_MS);
    await listenAndValidate(1);

    expect(getOverlay()).not.toBeNull();
    expect(getChoice(1)).toHaveAttribute('data-state', 'idle');
    // Pendant un STOP, un son ne s'écoute pas : la tape est seulement comptée.
    tap(2);
    expect(synth.playSoundBeats).toHaveBeenCalledOnce();
    expect(getChoice(2)).toHaveAttribute('data-state', 'idle');
    expect(getMascot()).toHaveAttribute('data-wobble-tick', '1');
  });

  it('donne la même apparence à la cloche et au tambour pendant la lecture', async () => {
    renderBoard({ config: SOUND_CONFIG });
    await advance(INTRO_MS);

    /** Image du bouton à chaque temps : les trois suites changent d'ordre, pas d'apparence. */
    async function recordPlayback(index: number): Promise<string[]> {
      tap(index);
      const frames: string[] = [];
      for (let beat = 0; beat < 4; beat += 1) {
        expect(getChoice(index).querySelector('[data-pulse]')).toHaveAttribute(
          'data-pulse',
          String(beat),
        );
        expect(getBeatIcons(index)).toEqual([]);
        frames.push(getChoice(index).innerHTML);
        await advance(BEAT_MS);
      }
      // Fin de la suite : la pulsation s'arrête, sans image.
      expect(getChoice(index).querySelector('[data-pulse]')).toBeNull();
      await advance(LISTEN_TAIL_MS);
      return frames;
    }

    const bellDrumBellDrum = await recordPlayback(0);
    const bellBellDrumDrum = await recordPlayback(1);
    const bellDrumDrumBell = await recordPlayback(2);

    expect(bellBellDrumDrum).toEqual(bellDrumBellDrum);
    expect(bellDrumDrumBell).toEqual(bellDrumBellDrum);
  });

  it('remplace les sons coupés par des images, une par temps, qui restent tant que c’est armé', async () => {
    renderBoard({ config: SOUND_CONFIG, soundEnabled: false });
    await advance(INTRO_MS);
    expect(getBeatIcons(1)).toEqual([]);
    expect(getChoice(1).querySelector('.lucide-volume-2')).not.toBeNull();

    tap(1);
    expect(synth.playSoundBeats).not.toHaveBeenCalled();
    expect(getBeatIcons(1)).toEqual(['bell']);
    expect(getChoice(1)).toHaveAttribute('data-state', 'playing');
    await advance(BEAT_MS);
    expect(getBeatIcons(1)).toEqual(['bell', 'bell']);
    await advance(BEAT_MS);
    expect(getBeatIcons(1)).toEqual(['bell', 'bell', 'drum']);
    await advance(BEAT_MS);
    expect(getBeatIcons(1)).toEqual(SOUND_1);

    // Fin de l'écoute, sur le même minutage qu'avec le son : les images restent.
    await advance(BEAT_MS + LISTEN_TAIL_MS);
    expect(getChoice(1)).toHaveAttribute('data-state', 'armed');
    expect(getBeatIcons(1)).toEqual(SOUND_1);
    expect(getChoice(1).querySelector('.lucide-bell')).not.toBeNull();
    expect(getChoice(1).querySelector('.lucide-drum')).not.toBeNull();

    // Une autre proposition prend le relais : celle-ci redevient neutre.
    tap(0);
    expect(getBeatIcons(1)).toEqual([]);
    expect(getBeatIcons(0)).toEqual(['bell']);
    expect(synth.playSoundBeats).not.toHaveBeenCalled();
  });

  it.each([
    ['A-B, 4 temps', { rule: 'ab', visibleItems: 4 }, 'grid-cols-2'],
    ['A-B-B, 3 temps', { rule: 'abb', visibleItems: 3 }, 'grid-cols-3'],
    ['A-B-B, 6 temps', { rule: 'abb', visibleItems: 6 }, 'grid-cols-3'],
  ] as const)('range les images son coupé, coche à part (%s)', async (_, config, columns) => {
    renderBoard({ config: { ...SOUND_CONFIG, ...config }, soundEnabled: false });
    await advance(INTRO_MS);
    tap(1);
    await advance(config.visibleItems * BEAT_MS + LISTEN_TAIL_MS);

    expect(getChoice(1)).toHaveAttribute('data-state', 'armed');
    expect(getBeatIcons(1)).toHaveLength(config.visibleItems);
    const grid = getChoice(1).querySelector('.grid');
    expect(grid).toHaveClass(columns);
    // La coche chevauche le coin du bouton, hors de la grille : elle ne couvre aucune image.
    const badge = getChoice(1).querySelector('[data-armed-badge]');
    expect(badge).not.toBeNull();
    expect(grid?.contains(badge)).toBe(false);
  });

  it('révèle la bonne suite sur la ligne, puis célèbre, avant le défi suivant', async () => {
    renderBoard({ config: SOUND_CONFIG });
    await advance(INTRO_MS);
    tap(0);
    await advance(LISTEN_MS);
    synth.playSoundBeats.mockClear();

    tap(0);
    expect(synth.playSoundBeats).toHaveBeenCalledExactlyOnceWith(SOUND_0, BEAT_MS);
    expect(getDots()).toEqual(['done', 'todo']);

    // Chaque élément pulse sur son temps ; ni cible ni jingle tant que la révélation dure.
    for (let beat = 0; beat < 4; beat += 1) {
      expect(getActiveCells()).toEqual([beat]);
      expect(getBeatBadges()).toEqual([]);
      expect(getTarget()).toHaveAttribute('data-target', 'empty');
      expect(synth.playSoundJingle).not.toHaveBeenCalled();
      await advance(BEAT_MS);
    }

    expect(getActiveCells()).toEqual([]);
    expect(getTarget()).toHaveAttribute('data-target', 'filled');
    expect(getTarget().querySelector('.lucide-volume-2')).not.toBeNull();
    expect(getTarget().querySelectorAll('[data-particle]')).toHaveLength(12);
    expect(getRow()).toHaveAccessibleName('Suite : Chat, Chien, Chat, Chien, puis le bon son');
    expect(synth.playSoundJingle).toHaveBeenCalledExactlyOnceWith('round');
    expect(getStatus()).toHaveTextContent('Bravo !');

    await advance(SUCCESS_MS - 1);
    expect(getDots()).toEqual(['done', 'todo']);
    await advance(1);
    expect(getDots()).toEqual(['done', 'current']);
    expect(getTarget()).toHaveAttribute('data-target', 'empty');
    expect(synth.playSoundJingle).toHaveBeenCalledOnce();
  });

  it('avec le son coupé, révèle chaque temps par une image sur son élément', async () => {
    renderBoard({ config: SOUND_CONFIG, soundEnabled: false });
    await advance(INTRO_MS);
    await listenAndValidate(0);

    expect(getBeatBadges()).toEqual(['bell']);
    expect(getActiveCells()).toEqual([0]);
    await advance(BEAT_MS);
    expect(getBeatBadges()).toEqual(['bell', 'drum']);
    expect(getActiveCells()).toEqual([1]);
    await advance(2 * BEAT_MS);
    expect(getBeatBadges()).toEqual(SOUND_0);

    await advance(BEAT_MS);
    expect(getBeatBadges()).toEqual(SOUND_0);
    expect(getActiveCells()).toEqual([]);
    expect(getTarget()).toHaveAttribute('data-target', 'filled');
    expect(synth.playSoundBeats).not.toHaveBeenCalled();
    expect(synth.playSoundJingle).not.toHaveBeenCalled();
  });

  it('échange les sons de A et B au défi suivant, à structure identique', async () => {
    renderBoard({ config: { ...SOUND_CONFIG, rounds: 2 } });
    await advance(INTRO_MS);
    await listenAndValidate(0);
    await advance(4 * BEAT_MS);
    await advance(SUCCESS_MS);
    await advance(INTRO_MS);

    synth.playSoundBeats.mockClear();
    tap(0);
    expect(synth.playSoundBeats).toHaveBeenCalledExactlyOnceWith(
      ['drum', 'bell', 'drum', 'bell'],
      BEAT_MS,
    );
  });
});

describe('Guide', () => {
  function getHand(index: number): Element | null {
    return getChoice(index).querySelector('[data-guide-hand]');
  }

  it('montre la bonne proposition au premier défi, jusqu’à sa réussite', async () => {
    renderBoard({ config: { hasGuide: true } });

    expect(getHand(0)).not.toBeNull();
    expect(getHand(0)).toHaveAttribute('aria-hidden', 'true');
    expect(getHand(0)).toHaveClass('pointer-events-none');
    expect(getHand(1)).toBeNull();
    expect(getHand(2)).toBeNull();

    await advance(INTRO_MS);
    expect(getHand(0)).not.toBeNull();
    tap(0);
    expect(getHand(0)).toBeNull();

    await advance(SUCCESS_MS);
    await advance(INTRO_MS);
    expect(getHand(0)).toBeNull();
    expect(getHand(1)).toBeNull();
  });

  it('reste jusqu’à la validation d’un son : elle apprend les deux appuis', async () => {
    renderBoard({ config: { ...SOUND_CONFIG, hasGuide: true } });
    await advance(INTRO_MS);

    tap(0);
    expect(getHand(0)).not.toBeNull();
    await advance(LISTEN_MS);
    expect(getChoice(0)).toHaveAttribute('data-state', 'armed');
    expect(getHand(0)).not.toBeNull();

    tap(0);
    expect(getHand(0)).toBeNull();
  });

  it('s’efface pendant un STOP : une main qui tape dirait le contraire', async () => {
    renderBoard({ config: { hasGuide: true } });
    await advance(INTRO_MS);

    tap(1);
    expect(getOverlay()).not.toBeNull();
    expect(getHand(0)).toBeNull();

    await advance(2000);
    expect(getHand(0)).not.toBeNull();
  });

  it('n’apparaît pas sans `hasGuide`', () => {
    renderBoard();
    expect(document.querySelector('[data-guide-hand]')).toBeNull();
  });
});

describe('Victoire', () => {
  it('enregistre une seule fois une victoire parfaite, avec son temps de jeu', async () => {
    const controls = renderBoard();
    await advance(INTRO_MS);

    // Le temps part du premier `choosing`, pas de l'apparition.
    await advance(3000);
    await solveVisualRound();
    await advance(INTRO_MS);
    await advance(2000);
    tap(0);
    await advance(SUCCESS_MS - 1);
    expect(controls.recordVictory).not.toHaveBeenCalled();
    await advance(1);

    // 3 s + 1,3 s + 0,45 s + 2 s + 1,3 s = 8,05 s
    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 2,
      timeSeconds: 8,
      isPerfect: true,
    });
    expect(synth.playSoundJingle).toHaveBeenLastCalledWith('star');
    expect(getDots()).toEqual(['done', 'done']);
    expect(screen.getByRole('dialog', { name: 'Étoile #1 gagnée' })).toBeInTheDocument();

    // Rien n'est rejoué une fois la partie gagnée.
    await advance(10_000);
    expect(controls.recordVictory).toHaveBeenCalledOnce();
  });

  it('compte chaque réponse validée et perd la couronne après une erreur', async () => {
    const { recordVictory } = renderBoard({ config: { rounds: 1 } });
    await unlockCalmly();
    tap(1);
    await advance(1000);
    await solveVisualRound();

    // 1,2 s + 1 s + 1,3 s = 3,5 s
    expect(recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 2,
      timeSeconds: 4,
      isPerfect: false,
    });
  });

  it('enregistre une victoire en sons : écouter n’est pas un coup', async () => {
    const { recordVictory } = renderBoard({ config: { ...SOUND_CONFIG, rounds: 1 } });
    await advance(INTRO_MS);
    tap(1);
    await advance(LISTEN_MS);
    await listenAndValidate(0);
    await advance(4 * BEAT_MS);
    await advance(SUCCESS_MS);

    expect(recordVictory).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ moves: 1, isPerfect: true }),
    );
    expect(synth.playSoundJingle).toHaveBeenCalledTimes(2);
    expect(synth.playSoundJingle).toHaveBeenLastCalledWith('star');
  });

  it('ne joue ni son ni jingle avec le son coupé, et gagne quand même', async () => {
    const { recordVictory } = renderBoard({ config: { rounds: 1 }, soundEnabled: false });
    await advance(INTRO_MS);
    await solveVisualRound();

    expect(recordVictory).toHaveBeenCalledOnce();
    expect(synth.playSoundJingle).not.toHaveBeenCalled();
  });
});

/**
 * A-B à 5 éléments : la réponse est B, à l'index 1 avec le hasard à 0. Tous les autres tests, en A-B
 * à 4 éléments, ont leur réponse à l'index 0 : ils ne voient pas un plateau qui confondrait les deux.
 */
describe('Bonne réponse ailleurs qu’à la première place', () => {
  const ANSWER_AT_1: Partial<PatternLevelConfig> = { visibleItems: 5, rounds: 1 };

  it('place dans la cible la pièce trouvée, pas la première', async () => {
    renderBoard({ config: ANSWER_AT_1 });
    await advance(INTRO_MS);
    tap(1);

    expect(getTarget()).toHaveAttribute('data-target', 'filled');
    expect(getRow()).toHaveAccessibleName('Suite : Chat, Chien, Chat, Chien, Chat, puis Chien');
  });

  it('fait luire la bonne proposition, pas la première', async () => {
    renderBoard({ config: ANSWER_AT_1 });
    await unlockCalmly();
    tap(0);
    await advance(TOO_FAST_MS);
    tap(2);
    await advance(TOO_FAST_MS);
    tap(0);

    expect(getChoices().map((choice) => choice.hasAttribute('data-hint'))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('pose la main du guide sur la bonne proposition, pas la première', () => {
    renderBoard({ config: { ...ANSWER_AT_1, hasGuide: true } });

    expect(
      getChoices().map((choice) => choice.querySelector('[data-guide-hand]') !== null),
    ).toEqual([false, true, false]);
  });

  it('révèle la suite de la bonne proposition, pas de la première', async () => {
    // Hasard au plus haut : chaque mélange inverse sa liste, la bonne réponse passe à l'index 2.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    renderBoard({ config: { ...SOUND_CONFIG, rounds: 1 }, soundEnabled: false });
    await advance(INTRO_MS);
    await listenAndValidate(2);
    await advance(4 * BEAT_MS);

    expect(getBeatBadges()).toEqual(['drum', 'bell', 'drum', 'bell']);
    expect(getTarget()).toHaveAttribute('data-target', 'filled');
  });
});

describe('Écran de fin', () => {
  /** Écran de fin à peine ouvert : ses boutons n'agissent pas encore. */
  async function reachEnd(options: BoardOptions = {}) {
    const controls = renderBoard({ ...options, config: { rounds: 1, ...options.config } });
    await advance(INTRO_MS);
    await solveVisualRound();
    return controls;
  }

  async function win(options: BoardOptions = {}) {
    const controls = await reachEnd(options);
    await advance(END_INPUT_GUARD_MS);
    return controls;
  }

  function getDialog(): HTMLElement {
    return screen.getByRole('dialog');
  }

  function getCrown(): Element | null {
    return getDialog().querySelector('[data-crown]');
  }

  it('propose l’étoile suivante, rejouer et la carte, en icônes seules', async () => {
    const controls = await win();

    expect(getDialog()).toHaveAccessibleName('Étoile #1 gagnée');
    expect(getDialog().querySelector('[data-end-star]')).not.toBeNull();
    const buttons = within(getDialog()).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Étoile suivante',
      'Rejouer',
      'Carte des Étoiles',
    ]);
    for (const button of buttons) expect(button).toHaveTextContent('');

    fireEvent.click(screen.getByRole('button', { name: 'Étoile suivante' }));
    expect(controls.playLevel).toHaveBeenCalledExactlyOnceWith('pat-002');

    fireEvent.click(screen.getByRole('button', { name: 'Carte des Étoiles' }));
    expect(controls.exitToMap).toHaveBeenCalledOnce();
  });

  it('ignore les tapes le temps que la récompense se pose', async () => {
    const controls = await reachEnd();
    const next = screen.getByRole('button', { name: 'Étoile suivante' });

    // Le doigt qui vient de répondre tape encore, au même endroit.
    fireEvent.click(next);
    await advance(END_INPUT_GUARD_MS - 1);
    fireEvent.click(next);
    fireEvent.click(screen.getByRole('button', { name: 'Rejouer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Carte des Étoiles' }));
    expect(controls.playLevel).not.toHaveBeenCalled();
    expect(controls.exitToMap).not.toHaveBeenCalled();
    expect(getDialog()).toBeInTheDocument();

    await advance(1);
    fireEvent.click(next);
    expect(controls.playLevel).toHaveBeenCalledExactlyOnceWith('pat-002');
  });

  it('retire l’étoile suivante après la dernière étoile du catalogue', async () => {
    await win({ levelIndex: 1 });

    expect(getDialog()).toHaveAccessibleName('Étoile #2 gagnée');
    expect(screen.queryByRole('button', { name: 'Étoile suivante' })).toBeNull();
    expect(within(getDialog()).getAllByRole('button')[0]).toHaveAccessibleName('Rejouer');
  });

  it('rejoue une nouvelle partie et enregistre chaque victoire', async () => {
    const controls = await win();

    fireEvent.click(screen.getByRole('button', { name: 'Rejouer' }));
    await advance(INTRO_MS);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getDots()).toEqual(['current']);
    expect(getTarget()).toHaveAttribute('data-target', 'empty');
    expect(synth.stopSounds).toHaveBeenCalled();

    // Le temps de la nouvelle partie repart de zéro : 2 s + 1,3 s.
    await advance(2000);
    await solveVisualRound();
    expect(controls.recordVictory).toHaveBeenCalledTimes(2);
    expect(controls.recordVictory).toHaveBeenLastCalledWith({
      moves: 1,
      timeSeconds: 3,
      isPerfect: true,
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('dore la couronne d’une victoire parfaite', async () => {
    await win();

    expect(getCrown()).toHaveAttribute('data-crown', 'gold');
    expect(getDialog()).toHaveAccessibleDescription('Parfait ! Couronne gagnée.');
    expect(getVisibleText()).toBe('');
  });

  it('laisse un contour gris sans couronne, avec une phrase pour les lecteurs d’écran', async () => {
    renderBoard({ config: { rounds: 1 } });
    await advance(INTRO_MS);
    tap(1);
    await advance(2000);
    await solveVisualRound();

    expect(getCrown()).toHaveAttribute('data-crown', 'outline');
    expect(getDialog()).toHaveAccessibleDescription(/^Pas de couronne/);
  });

  it('dore aussi une couronne déjà acquise, même après une partie imparfaite', async () => {
    renderBoard({ config: { rounds: 1 }, profile: crownedPlayer() });
    await advance(INTRO_MS);
    tap(1);
    await advance(2000);
    await solveVisualRound();

    expect(getCrown()).toHaveAttribute('data-crown', 'gold');
    expect(getDialog()).toHaveAccessibleDescription('Tu as déjà la couronne.');
  });
});

describe('Télécommande', () => {
  function getBack(): HTMLElement {
    return screen.getByRole('button', { name: 'Retour' });
  }

  it('démarre au milieu et rejoint Retour par le haut, et en revient', () => {
    forceTvMode();
    renderBoard();

    expect(getChoice(1)).toHaveFocus();
    expect(getChoice(1)).toHaveAttribute('data-focused', 'true');

    expect(press('ArrowRight')).toBe(true);
    expect(getChoice(2)).toHaveFocus();
    press('ArrowRight');
    expect(getChoice(2)).toHaveFocus();
    press('ArrowLeft');
    press('ArrowLeft');
    expect(getChoice(0)).toHaveFocus();

    press('ArrowUp');
    expect(getBack()).toHaveFocus();
    expect(getBack()).toHaveAttribute('data-focused', 'true');
    expect(getChoice(0)).not.toHaveAttribute('data-focused');
    press('ArrowLeft');
    expect(getBack()).toHaveFocus();

    press('ArrowDown');
    expect(getChoice(0)).toHaveFocus();
    expect(getChoice(0)).toHaveAttribute('data-focused', 'true');
  });

  it('agit avec OK comme une tape, et replace le curseur au milieu à chaque défi', async () => {
    forceTvMode();
    const controls = renderBoard();
    const middle = getChoice(1);

    // OK pendant l'apparition : ignoré.
    press('ArrowLeft');
    expect(press('Enter')).toBe(true);
    await advance(INTRO_MS - 1);
    expect(getTarget()).toHaveAttribute('data-target', 'empty');
    await advance(1);

    press('Enter');
    expect(getTarget()).toHaveAttribute('data-target', 'filled');
    expect(synth.playSoundJingle).toHaveBeenCalledExactlyOnceWith('round');
    await advance(SUCCESS_MS);

    // Défi suivant : curseur au milieu, sur le même bouton (jamais remonté : le focus y reste).
    expect(getChoice(1)).toBe(middle);
    expect(getChoice(1)).toHaveFocus();
    expect(getChoice(1)).toHaveAttribute('data-focused', 'true');

    await advance(INTRO_MS);
    press('ArrowLeft');
    press('Enter');
    await advance(SUCCESS_MS);

    // Écran de fin : la première action est pré-focalisée, OK la déclenche.
    const dialog = screen.getByRole('dialog');
    const next = within(dialog).getByRole('button', { name: 'Étoile suivante' });
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute('data-focused', 'true');
    expect(controls.recordVictory).toHaveBeenCalledOnce();

    // Les flèches répondent tout de suite ; OK, une fois la récompense posée.
    press('ArrowRight');
    expect(within(dialog).getByRole('button', { name: 'Rejouer' })).toHaveFocus();
    press('ArrowLeft');
    expect(press('Enter')).toBe(true);
    expect(controls.playLevel).not.toHaveBeenCalled();
    await advance(END_INPUT_GUARD_MS);
    expect(press('Enter')).toBe(true);
    expect(controls.playLevel).toHaveBeenCalledExactlyOnceWith('pat-002');
  });

  it('remet le curseur au milieu même depuis l’en-tête', async () => {
    forceTvMode();
    renderBoard();
    await advance(INTRO_MS);
    press('ArrowLeft');
    press('Enter');

    press('ArrowUp');
    expect(getBack()).toHaveFocus();
    await advance(SUCCESS_MS);

    // Le curseur de la zone a bougé sans voler le focus de la zone active.
    expect(getBack()).toHaveFocus();
    press('ArrowDown');
    expect(getChoice(1)).toHaveFocus();
  });

  it('compte OK pendant un STOP comme le même geste impulsif qu’une tape', async () => {
    forceTvMode();
    const { recordVictory } = renderBoard({ config: { rounds: 1, stopRounds: 1 } });
    await advance(INTRO_MS);
    expect(getChoice(1)).toHaveFocus();

    expect(press('Enter')).toBe(true);
    expect(getMascot()).toHaveAttribute('data-wobble-tick', '1');
    await advance(1999);
    expect(getOverlay()).not.toBeNull();
    await advance(1);

    press('ArrowLeft');
    press('Enter');
    await advance(SUCCESS_MS);
    expect(recordVictory).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ moves: 1, isPerfect: false }),
    );
  });

  it('écoute et valide un son avec OK', async () => {
    forceTvMode();
    renderBoard({ config: SOUND_CONFIG });
    await advance(INTRO_MS);

    press('Enter');
    expect(synth.playSoundBeats).toHaveBeenCalledExactlyOnceWith(SOUND_1, BEAT_MS);
    expect(getChoice(1)).toHaveAttribute('data-state', 'playing');

    // OK pendant l'écoute : ignoré ; les flèches restent actives.
    press('Enter');
    expect(synth.playSoundBeats).toHaveBeenCalledOnce();
    press('ArrowLeft');
    expect(getChoice(0)).toHaveFocus();

    await advance(LISTEN_MS);
    expect(getChoice(1)).toHaveAttribute('data-state', 'armed');

    // Curseur ailleurs : OK écoute cette autre proposition. Hasard à 0 : c'est la bonne réponse.
    press('Enter');
    expect(getChoice(0)).toHaveAttribute('data-state', 'playing');
    expect(getChoice(1)).toHaveAttribute('data-state', 'idle');
    await advance(LISTEN_MS);

    // Deuxième OK sur la proposition prête : validée, la révélation la rejoue.
    press('Enter');
    expect(synth.playSoundBeats).toHaveBeenLastCalledWith(SOUND_0, BEAT_MS);
    expect(getActiveCells()).toEqual([0]);
    await advance(4 * BEAT_MS);
    expect(getTarget()).toHaveAttribute('data-target', 'filled');
  });

  it('revient à la Carte des Étoiles avec Retour, du plateau, de l’en-tête et de l’écran de fin', async () => {
    forceTvMode();
    const controls = renderBoard({ config: { rounds: 1 } });

    expect(press('Backspace')).toBe(true);
    expect(controls.exitToMap).toHaveBeenCalledOnce();

    press('ArrowUp');
    press('Backspace');
    expect(controls.exitToMap).toHaveBeenCalledTimes(2);
    press('Enter');
    expect(controls.exitToMap).toHaveBeenCalledTimes(3);
    press('ArrowDown');

    await advance(INTRO_MS);
    press('ArrowLeft');
    press('Enter');
    await advance(SUCCESS_MS);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    expect(press('Escape')).toBe(true);
    expect(controls.exitToMap).toHaveBeenCalledTimes(4);
  });

  it('rejoue depuis l’écran de fin et rend le focus au milieu des propositions', async () => {
    forceTvMode();
    renderBoard({ config: { rounds: 1 } });
    await advance(INTRO_MS);
    press('ArrowLeft');
    press('Enter');
    await advance(SUCCESS_MS);
    await advance(END_INPUT_GUARD_MS);

    press('ArrowRight');
    press('Enter');
    await advance(1000);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getChoice(1)).toHaveFocus();
    expect(getChoice(1)).toHaveAttribute('data-focused', 'true');
  });

  it('rejoue au milieu des propositions même si le curseur finissait sur Retour', async () => {
    forceTvMode();
    renderBoard({ config: { rounds: 1 } });
    await advance(INTRO_MS);
    press('ArrowLeft');
    press('Enter');
    // Pendant la célébration, le curseur monte sur Retour : la modale s'ouvre depuis ce bouton.
    press('ArrowUp');
    expect(getBack()).toHaveFocus();
    await advance(SUCCESS_MS);
    await advance(END_INPUT_GUARD_MS);

    press('ArrowRight');
    press('Enter');
    await advance(1000);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getChoice(1)).toHaveFocus();
    expect(getChoice(1)).toHaveAttribute('data-focused', 'true');
    expect(getBack()).not.toHaveAttribute('data-focused');
  });

  it('garde le curseur bleu ciel sur la proposition qui luit : seule la lueur est ambrée', async () => {
    forceTvMode();
    renderBoard();
    await unlockCalmly();
    press('ArrowRight');
    press('Enter');
    await advance(TOO_FAST_MS);
    press('Enter');
    await advance(TOO_FAST_MS);
    press('Enter');
    press('ArrowLeft');
    press('ArrowLeft');

    const hinted = getChoice(0);
    expect(hinted).toHaveAttribute('data-hint', 'true');
    expect(hinted).toHaveAttribute('data-focused', 'true');
    expect(hinted).toHaveClass('ring-sky-400');
    expect(hinted.className).not.toContain('amber');
    expect(hinted.querySelector('.ring-amber-300')).not.toBeNull();
  });

  it('active la zone de l’élément qui reçoit le focus (Tab, clic)', () => {
    forceTvMode();
    renderBoard();

    act(() => {
      getBack().focus();
    });
    expect(getBack()).toHaveAttribute('data-focused', 'true');
    act(() => {
      getChoice(2).focus();
    });
    expect(getChoice(2)).toHaveAttribute('data-focused', 'true');
    expect(getBack()).not.toHaveAttribute('data-focused');
  });
});

describe('En-tête', () => {
  it('revient à la Carte des Étoiles au doigt', () => {
    const controls = renderBoard();

    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(controls.exitToMap).toHaveBeenCalledOnce();
  });
});

describe('Page /patterns', () => {
  it('publie le titre du registre et lance le plateau de l’étoile demandée', () => {
    expect(patternsMetadata.title).toBe(GAME_REGISTRY.patterns.title);

    render(<PatternsPage />, { wrapper: NavigationProvider });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Suites Logiques, Étoile #1' }),
    ).toBeInTheDocument();
    expect(getRow()).toBeInTheDocument();
    expect(getChoices()).toHaveLength(3);
  });
});

describe('Icônes et libellés', () => {
  it('dessine chaque élément : animaux en contour, formes pleines', () => {
    for (const itemId of PATTERN_ITEMS.animals) {
      const { container, unmount } = render(
        <PatternItemIcon itemId={itemId} colorClass="text-rose-300" className="size-3/5" />,
      );
      const icon = container.firstElementChild;
      expect(icon, itemId).toHaveAttribute('data-item', itemId);
      expect(icon, itemId).toHaveClass('text-rose-300', 'size-3/5');
      expect(icon?.querySelector('svg'), itemId).not.toHaveClass('fill-current');
      unmount();
    }
    for (const itemId of PATTERN_ITEMS.shapes) {
      const { container, unmount } = render(<PatternItemIcon itemId={itemId} />);
      expect(container.querySelector('svg'), itemId).toHaveClass('fill-current');
      unmount();
    }
  });

  it('nomme la ligne sans jamais dévoiler ce que contient un son', () => {
    const cat = { id: 'cat', colorClass: 'text-rose-300' } as const;
    const dog = { id: 'dog', colorClass: 'text-sky-300' } as const;

    expect(formatRowLabel([dog, cat, dog, cat])).toBe(
      'Suite : Chien, Chat, Chien, Chat, puis une case vide',
    );
    expect(getChoiceLabel({ kind: 'item', item: cat }, 0, false)).toBe('Chat');
    expect(getChoiceLabel({ kind: 'sound', beats: ['bell', 'drum'] }, 1, false)).toBe(
      'Son 2, appuie pour écouter',
    );
    expect(getChoiceLabel({ kind: 'sound', beats: ['drum', 'bell'] }, 1, true)).toBe(
      'Son 2, appuie encore pour valider',
    );
  });

  it('formule chaque situation de la couronne', () => {
    expect(getCrownSentence(true, false)).toBe('Parfait ! Couronne gagnée.');
    expect(getCrownSentence(true, true)).toBe('Parfait ! Tu avais déjà la couronne.');
    expect(getCrownSentence(false, true)).toBe('Tu as déjà la couronne.');
    expect(getCrownSentence(false, false)).toMatch(/^Pas de couronne/);
  });
});
