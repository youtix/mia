import {
  END_SCREEN_GUARD_MS as DEFAULT_GUARD_MS,
  installActivationGuard,
  NavigationProvider,
} from '@/core/navigation';
import { getGameProgressSummary, type BaseLevelDefinition } from '@/core/progression';
import { GoNoGoBoard } from '@/games/go-no-go/components';
import { END_SCREEN_GUARD_MS } from '@/games/go-no-go/components/GoNoGoEndScreen';
import { BREATH_MS, END_SCREEN_DELAY_MS, IDLE_MS, START_DELAY_MS } from '@/games/go-no-go/run';
import type { GoNoGoLevelConfig } from '@/games/go-no-go/types';
import type * as VoiceScript from '@/games/go-no-go/voice-script';
import { getVoiceClipPath, SHARED_CLIPS } from '@/games/go-no-go/voice-script';
import type { UserProfile } from '@/types/mia';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const audio = vi.hoisted(() => ({
  setEnabled: vi.fn(),
  preloadClips: vi.fn((_paths: readonly string[]) => Promise.resolve()),
  playClips: vi.fn((_paths: readonly string[]) => Promise.resolve()),
  stopClips: vi.fn(),
  playEffect: vi.fn(),
}));

vi.mock('@/core/audio', () => ({ useGameAudio: () => audio }));

// Ici, toutes les phrases existent : ce que le plateau demande à la voix. Quelles phrases existent
// vraiment, c'est tests/go-no-go-voice.test.ts.
vi.mock('@/games/go-no-go/voice-script', async (importOriginal) => ({
  ...(await importOriginal<typeof VoiceScript>()),
  isClipAvailable: () => true,
}));

/** Règle 1, une cachette : 6 apparitions dont 1 piège (le renard, en fin de file avec `Math.random` à 0). */
const OWL: GoNoGoLevelConfig = {
  rule: 'owl-says',
  appearances: 6,
  traps: 1,
  stops: 0,
  startWindowMs: 2500,
  fastestWindowMs: 2000,
  hideouts: 1,
  decoys: ['fox'],
  hasLure: false,
  stopDelayCeilingMs: null,
  intro: null,
  maxTrapRun: 1,
};

/** Règle 2 avec le leurre de la chouette. */
const FLIES: GoNoGoLevelConfig = {
  ...OWL,
  rule: 'flies',
  decoys: [],
  hasLure: true,
  maxTrapRun: 2,
};

/** Règle 3 : un STOP tardif parmi 6 apparitions. */
const LATE_STOP: GoNoGoLevelConfig = {
  ...OWL,
  rule: 'late-stop',
  traps: 0,
  stops: 1,
  decoys: [],
  startWindowMs: 1800,
  fastestWindowMs: 1400,
  stopDelayCeilingMs: 300,
  maxTrapRun: 2,
};

const CREATED_AT = '2026-10-01T09:00:00.000Z';

function definition(
  id: string,
  order: number,
  config: GoNoGoLevelConfig,
): BaseLevelDefinition<GoNoGoLevelConfig> {
  return { id, gameId: 'go-no-go', tier: 'very_easy', order, config };
}

/** Léo : Étoile #1 déjà gagnée avec la couronne. */
function crownedPlayer(): UserProfile {
  return {
    id: 'p1',
    name: 'Léo',
    avatarId: 'fox',
    createdAt: CREATED_AT,
    gamesProgress: {
      'go-no-go': {
        gameId: 'go-no-go',
        levels: {
          'gn-001': {
            levelId: 'gn-001',
            completed: true,
            isPerfect: true,
            bestMoves: 0,
            bestTimeSeconds: 1.8,
            timesPlayed: 1,
            completedAt: CREATED_AT,
          },
        },
        lastPlayedLevelId: 'gn-001',
      },
    },
    gameSettings: { memory: { previewFactor: 1, mismatchFactor: 1 } },
  };
}

interface BoardOptions {
  config?: GoNoGoLevelConfig;
  profile?: UserProfile | null;
  strict?: boolean;
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Comme `advance`, en laissant aussi s'exécuter les promesses (fin d'une voix, sortie de modale). */
async function advanceAsync(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Monte le plateau comme `GameScreen.renderLevel`, et laisse partir l'annonce de la règle. */
function renderBoard({ config = OWL, profile = null, strict = false }: BoardOptions = {}) {
  const catalog = [definition('gn-001', 10, config), definition('gn-002', 20, OWL)];
  const summary = getGameProgressSummary('go-no-go', catalog, profile);
  const level = summary.allLevels[0];
  if (!level) throw new Error('Niveau absent du catalogue de test');
  const controls = {
    summary,
    playLevel: vi.fn(),
    exitToMap: vi.fn(),
    recordVictory: vi.fn(() => Promise.resolve()),
  };
  const board = <GoNoGoBoard level={level} controls={controls} />;
  render(strict ? <StrictMode>{board}</StrictMode> : board, { wrapper: NavigationProvider });
  advance(0);
  return controls;
}

/** Attend la première apparition : le rappel de la règle, puis la respiration. */
async function toFirstAppearance(): Promise<void> {
  await advanceAsync(START_DELAY_MS + BREATH_MS);
}

function getPlayArea(): HTMLElement {
  const area = document.querySelector<HTMLElement>('[data-play-area]');
  if (!area) throw new Error('Aire de jeu absente');
  return area;
}

function getStage(): HTMLElement {
  const stage = document.querySelector<HTMLElement>('[data-stage]');
  if (!stage) throw new Error('Scène absente');
  return stage;
}

function getFigure(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-figure]');
}

function getBuzzer(): HTMLElement {
  return screen.getByRole('button', { name: 'Taper' });
}

function getStatus(): HTMLElement {
  return screen.getByRole('status');
}

function getMascot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-mascot]');
}

function getLitPearls(): number {
  return document.querySelectorAll('[data-pearl="lit"]').length;
}

/** Un nouveau contact au doigt posé sur `target`. */
function touch(target: Element): void {
  fireEvent.pointerDown(target, { pointerType: 'touch', button: 0 });
}

/** Mode TV forcé avant le montage : le moteur D-Pad démarre en mode `dpad`. */
function forceTvMode(): void {
  document.documentElement.dataset.tv = 'on';
}

/** Appuie sur une touche (cible : élément focalisé) ; `true` si le moteur D-Pad l'a consommée. */
function press(key: string, init: { repeat?: boolean } = {}): boolean {
  return !fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
}

/** Texte visible d'un élément : ni le texte réservé aux lecteurs d'écran, ni le tracé des dessins. */
function getVisibleText(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll('.sr-only, svg, style').forEach((element) => {
    element.remove();
  });
  return clone.textContent.trim();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  for (const mock of Object.values(audio)) mock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete document.documentElement.dataset.tv;
});

describe('Plateau de Pas si vite !', () => {
  it('montre la guirlande, la scène et le buzzer, tout nommé, sans aucun texte visible', () => {
    renderBoard();

    expect(screen.getByRole('heading', { name: 'Étoile #1' })).toBeInTheDocument();
    expect(getBuzzer()).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '0 sur 6 réussies' })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-pearl]')).toHaveLength(6);
    expect(getStage()).toHaveAttribute('data-stage', 'owl-says');
    expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument();
    expect(getVisibleText(document.body)).toBe('');
  });

  it('annonce la consigne de la règle aux lecteurs d’écran, sans une annonce par apparition', async () => {
    renderBoard();
    expect(getStatus()).toHaveTextContent('Tape quand c’est la chouette.');
    await toFirstAppearance();
    expect(getStatus()).toHaveTextContent('C’est parti !');
    touch(getPlayArea());
    await advanceAsync(600);
    expect(getStatus()).toHaveTextContent('C’est parti !');
  });

  it('dit la phrase de rappel au départ, une seule fois sous StrictMode, après l’avoir chargée', async () => {
    renderBoard({ strict: true });
    await advanceAsync(0);
    expect(audio.playClips).toHaveBeenCalledTimes(1);
    expect(audio.playClips.mock.calls[0]?.[0]).toEqual([getVoiceClipPath('rule-owl-says')]);
    expect(audio.preloadClips.mock.calls[0]?.[0]).toEqual([getVoiceClipPath('rule-owl-says')]);
    expect(audio.preloadClips.mock.calls.flat(2)).toEqual(
      expect.arrayContaining([SHARED_CLIPS.trapped, SHARED_CLIPS.starWon]),
    );
  });

  it('retient son départ : la scène est vide, le buzzer s’enfonce mais ne compte rien avant la première apparition', async () => {
    renderBoard();
    await advanceAsync(START_DELAY_MS - 100);
    expect(getFigure()).toBeNull();
    touch(getPlayArea());
    expect(getBuzzer()).toHaveAttribute('data-pressed');
    expect(getLitPearls()).toBe(0);
    await advanceAsync(START_DELAY_MS + BREATH_MS);
    expect(getFigure()).toHaveAttribute('data-moment', 'entering');
  });
});

describe('au doigt : un nouveau contact n’importe où dans l’aire de jeu', () => {
  it('compte un contact posé sur la scène, pas seulement sur le buzzer', async () => {
    renderBoard();
    await toFirstAppearance();
    const figure = getFigure();
    expect(figure).toHaveAttribute('data-figure', 'owl');
    touch(figure ?? getStage());
    expect(getFigure()).toHaveAttribute('data-moment', 'caught');
    expect(getLitPearls()).toBe(1);
    expect(audio.playEffect).toHaveBeenCalledWith('success');
  });

  it('compte un contact posé sur le buzzer', async () => {
    renderBoard();
    await toFirstAppearance();
    touch(getBuzzer());
    expect(getFigure()).toHaveAttribute('data-moment', 'caught');
  });

  it('enfonce le buzzer à l’appui, puis le relâche', async () => {
    renderBoard();
    await toFirstAppearance();
    touch(getBuzzer());
    expect(getBuzzer()).toHaveAttribute('data-pressed');
    await advanceAsync(300);
    expect(getBuzzer()).not.toHaveAttribute('data-pressed');
  });

  it('ignore un clic droit à la souris, compte un contact de souris principal', async () => {
    renderBoard();
    await toFirstAppearance();
    fireEvent.pointerDown(getStage(), { pointerType: 'mouse', button: 2 });
    expect(getFigure()).toHaveAttribute('data-moment', 'entering');
    fireEvent.pointerDown(getStage(), { pointerType: 'mouse', button: 0 });
    expect(getFigure()).toHaveAttribute('data-moment', 'caught');
  });

  it('un appui par apparition : les contacts suivants ne comptent pas', async () => {
    renderBoard();
    await toFirstAppearance();
    touch(getStage());
    touch(getStage());
    touch(getStage());
    expect(getLitPearls()).toBe(1);
  });

  it('un contact entre deux apparitions n’est pas compté', async () => {
    renderBoard();
    await toFirstAppearance();
    touch(getStage());
    await advanceAsync(500);
    expect(getFigure()).toBeNull();
    touch(getStage());
    expect(getLitPearls()).toBe(1);
  });

  it('un piège touché interrompt le rythme : buzzer grisé, rien ne compte, puis la reprise', async () => {
    renderBoard();
    await toFirstAppearance();
    for (let index = 0; index < 5; index += 1) {
      touch(getStage());
      await advanceAsync(400 + BREATH_MS + 50);
    }
    expect(getFigure()).toHaveAttribute('data-figure', 'fox');
    touch(getStage());
    expect(getFigure()).toHaveAttribute('data-moment', 'trapped');
    expect(getBuzzer()).toHaveAttribute('data-disabled');
    expect(getBuzzer()).toHaveAttribute('aria-disabled', 'true');
    expect(audio.playEffect).toHaveBeenCalledWith('oops');
    expect(audio.playClips.mock.lastCall?.[0]).toEqual([SHARED_CLIPS.trapped]);
    await advanceAsync(2100);
    expect(getBuzzer()).not.toHaveAttribute('data-disabled');
  });

  it('un clic de lecteur d’écran (sans contact) compte comme un appui', async () => {
    renderBoard();
    await toFirstAppearance();
    fireEvent.click(getBuzzer(), { detail: 0 });
    expect(getFigure()).toHaveAttribute('data-moment', 'caught');
  });

  it('un clic qui suit un contact déjà compté n’en fait pas un second, ni un clic au doigt', async () => {
    renderBoard();
    await toFirstAppearance();
    fireEvent.click(getBuzzer(), { detail: 1 });
    expect(getFigure()).toHaveAttribute('data-moment', 'entering');
    touch(getBuzzer());
    await advanceAsync(CAUGHT_AND_BREATH);
    // Le clic synthétique de la garde d'activation arrive juste après le contact.
    touch(getBuzzer());
    fireEvent.click(getBuzzer(), { detail: 0 });
    expect(getLitPearls()).toBe(1);
  });
});

/** Fin de l'animation d'une cible attrapée, plus la respiration : l'apparition suivante n'est pas encore là. */
const CAUGHT_AND_BREATH = 400 + BREATH_MS - 100;

describe('à la télécommande : OK est le buzzer', () => {
  it('montre l’icône du bouton OK sur le buzzer, sans texte, et lui donne le focus', async () => {
    forceTvMode();
    renderBoard();
    await toFirstAppearance();
    expect(document.querySelector('[data-remote-icon]')).not.toBeNull();
    expect(getBuzzer()).toHaveFocus();
    expect(getVisibleText(document.body)).toBe('');
  });

  it('n’affiche pas l’icône au doigt', async () => {
    renderBoard();
    await toFirstAppearance();
    expect(document.querySelector('[data-remote-icon]')).toBeNull();
  });

  it.each(['Enter', ' '])('« %s » au keydown est un appui', async (key) => {
    forceTvMode();
    renderBoard();
    await toFirstAppearance();
    expect(press(key)).toBe(true);
    expect(getFigure()).toHaveAttribute('data-moment', 'caught');
  });

  it('ignore les répétitions d’une touche maintenue', async () => {
    forceTvMode();
    renderBoard();
    await toFirstAppearance();
    press('Enter');
    await advanceAsync(CAUGHT_AND_BREATH);
    await advanceAsync(200);
    expect(getFigure()).not.toBeNull();
    press('Enter', { repeat: true });
    expect(getFigure()).toHaveAttribute('data-moment', 'entering');
  });

  it('les flèches ne font rien pendant le défilement, et la page ne défile pas', async () => {
    forceTvMode();
    renderBoard();
    await toFirstAppearance();
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(press(key)).toBe(true);
    }
    expect(getFigure()).toHaveAttribute('data-moment', 'entering');
    expect(getLitPearls()).toBe(0);
  });

  it('Retour mène à la Carte des Étoiles', async () => {
    forceTvMode();
    const controls = renderBoard();
    await toFirstAppearance();
    press('Escape');
    expect(controls.exitToMap).toHaveBeenCalledOnce();
  });

  it('le bouton Retour de l’en-tête n’est pas un appui', async () => {
    const controls = renderBoard();
    await toFirstAppearance();
    const back = screen.getByRole('button', { name: 'Retour' });
    touch(back);
    expect(getFigure()).toHaveAttribute('data-moment', 'entering');
    fireEvent.click(back);
    expect(controls.exitToMap).toHaveBeenCalledOnce();
  });
});

describe('la scène de chaque règle', () => {
  it('règle 1 : le castelet, une cachette puis trois, et la chouette qui fait le signal', async () => {
    renderBoard();
    await toFirstAppearance();
    expect(document.querySelectorAll('[data-hideout]')).toHaveLength(1);
    expect(getStage().querySelector('[data-castelet]')).not.toBeNull();
    expect(getFigure()).toHaveAttribute('data-figure', 'owl');
    expect(audio.playEffect).toHaveBeenCalledWith('signal');
  });

  it('règle 1 à trois cachettes : le personnage sort de l’une des trois', async () => {
    renderBoard({ config: { ...OWL, hideouts: 3 } });
    await toFirstAppearance();
    expect(document.querySelectorAll('[data-hideout]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-hideout] [data-figure]')).toHaveLength(1);
  });

  it('règle 1 : pas de seconde chouette à l’écran pendant le défilement', async () => {
    renderBoard();
    await toFirstAppearance();
    expect(getMascot()).toBeNull();
    // Une seule chouette dessinée : celle du castelet.
    expect(getStage().querySelectorAll('svg[data-mood]')).toHaveLength(1);
  });

  it('règle 2 : les collines, une image qui vole, la mascotte à côté de la scène', async () => {
    renderBoard({ config: { ...FLIES, hasLure: false } });
    await toFirstAppearance();
    expect(getStage()).toHaveAttribute('data-stage', 'flies');
    expect(getStage().querySelector('[data-hills]')).not.toBeNull();
    expect(getFigure()).toHaveAttribute('data-figure', 'pigeon');
    expect(getMascot()).not.toBeNull();
    expect(audio.playEffect).not.toHaveBeenCalledWith('signal');
  });

  it('règle 2 avec leurre : la chouette bat des ailes et dit « … vole ! » à chaque image', async () => {
    renderBoard({ config: FLIES });
    await toFirstAppearance();
    expect(getMascot()).toHaveAttribute('data-mood', 'flap');
    expect(audio.playClips.mock.lastCall?.[0]).toEqual([getVoiceClipPath('lure-pigeon')]);
  });

  it('règle 3 : le panneau STOP surgit sur l’image, avec son effet', async () => {
    renderBoard({ config: LATE_STOP });
    for (let guard = 0; guard < 8; guard += 1) {
      await advanceAsync(START_DELAY_MS + BREATH_MS);
      if (document.querySelector('[data-stage]')?.getAttribute('data-stage') !== 'late-stop') break;
      if (getFigure() && !document.querySelector('[data-stop-sign]')) {
        // Une cible simple : on l'attrape et on passe à l'apparition suivante.
        touch(getStage());
        await advanceAsync(600 + BREATH_MS);
      }
      if (document.querySelector('[data-stop-sign]')) break;
    }
    // Le STOP est en fin de file (tirage le plus bas) : il faut jouer les cinq cibles avant.
    for (let guard = 0; guard < 12 && !document.querySelector('[data-stop-sign]'); guard += 1) {
      await advanceAsync(200);
      if (getFigure()?.getAttribute('data-moment') === 'entering') touch(getStage());
      await advanceAsync(600 + BREATH_MS);
    }
    expect(audio.playEffect).toHaveBeenCalledWith('stop');
  });
});

describe('pause : inaction et page masquée', () => {
  it('au bout de 12 s sans appui, le défilement s’arrête : la chouette est là, le buzzer pulse', async () => {
    renderBoard();
    await toFirstAppearance();
    await advanceAsync(IDLE_MS);
    expect(getPlayArea()).toHaveAttribute('data-phase', 'paused');
    expect(getFigure()).toBeNull();
    expect(getBuzzer()).toHaveAttribute('data-pulsing');
    expect(getMascot()).not.toBeNull();
    expect(getStatus()).toHaveTextContent('Pause. Tape sur le buzzer pour continuer.');
    // La chouette rappelle la règle.
    expect(audio.playClips.mock.lastCall?.[0]).toEqual([getVoiceClipPath('rule-owl-says')]);
  });

  it('un appui relance le défilement sans rien compter', async () => {
    renderBoard();
    await toFirstAppearance();
    await advanceAsync(IDLE_MS);
    touch(getStage());
    expect(getPlayArea()).toHaveAttribute('data-phase', 'live');
    expect(getLitPearls()).toBe(0);
    await advanceAsync(BREATH_MS);
    expect(getFigure()).not.toBeNull();
    expect(getMascot()).toBeNull();
  });

  it('la mascotte touchée pendant la pause répète la règle sans relancer le jeu', async () => {
    renderBoard();
    await toFirstAppearance();
    await advanceAsync(IDLE_MS);
    audio.playClips.mockClear();
    const mascot = getMascot();
    expect(mascot).not.toBeNull();
    touch(mascot ?? getStage());
    expect(audio.playClips).toHaveBeenCalledTimes(1);
    expect(getPlayArea()).toHaveAttribute('data-phase', 'paused');
  });

  it('offre aux lecteurs d’écran un bouton pour réentendre la règle, pendant la pause seulement', async () => {
    renderBoard();
    await toFirstAppearance();
    expect(screen.queryByRole('button', { name: 'Réécouter la règle' })).toBeNull();
    await advanceAsync(IDLE_MS);
    audio.playClips.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Réécouter la règle' }));
    expect(audio.playClips).toHaveBeenCalledTimes(1);
    expect(getPlayArea()).toHaveAttribute('data-phase', 'paused');
  });

  it('pendant le défilement, toucher la mascotte est un appui comme un autre', async () => {
    renderBoard({ config: { ...FLIES, hasLure: false } });
    await toFirstAppearance();
    const mascot = getMascot();
    touch(mascot ?? getStage());
    expect(getFigure()).toHaveAttribute('data-moment', 'caught');
  });

  it('page masquée : pause immédiate, la voix se tait, un appui relance', async () => {
    renderBoard();
    await toFirstAppearance();
    audio.playClips.mockClear();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(getPlayArea()).toHaveAttribute('data-phase', 'paused');
    await advanceAsync(IDLE_MS * 2);
    expect(audio.playClips).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(getPlayArea()).toHaveAttribute('data-phase', 'paused');
    touch(getStage());
    expect(getPlayArea()).toHaveAttribute('data-phase', 'live');
    Reflect.deleteProperty(document, 'hidden');
  });

  it('retire son écouteur de visibilité au démontage', async () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    renderBoard();
    await toFirstAppearance();
    cleanup();
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});

describe('l’écran de fin', () => {
  /** Joue les six apparitions sans erreur : cinq cibles attrapées, le piège laissé passer. */
  async function playToTheEnd(): Promise<void> {
    await toFirstAppearance();
    for (let index = 0; index < 5; index += 1) {
      touch(getStage());
      await advanceAsync(CAUGHT_AND_BREATH + 150);
    }
    await advanceAsync(2600);
    await advanceAsync(1000);
  }

  it('enregistre la victoire une seule fois, dès la dernière apparition réussie', async () => {
    const controls = renderBoard();
    await playToTheEnd();
    expect(controls.recordVictory).toHaveBeenCalledTimes(1);
    const [result] = controls.recordVictory.mock.calls[0] as unknown as [
      { moves: number; timeSeconds: number; isPerfect: boolean },
    ];
    expect(result).toMatchObject({ moves: 0, isPerfect: true });
    expect(result.timeSeconds).toBeGreaterThan(1.5);
    expect(audio.playEffect).toHaveBeenCalledWith('victory');
    expect(audio.playClips.mock.lastCall?.[0]).toEqual([
      SHARED_CLIPS.starWon,
      SHARED_CLIPS.crownWon,
    ]);
    expect(getLitPearls()).toBe(6);
  });

  it('s’ouvre un instant après la victoire, avec la couronne et trois boutons-icônes', async () => {
    renderBoard();
    await playToTheEnd();
    await advanceAsync(END_SCREEN_DELAY_MS);
    const dialog = screen.getByRole('dialog', { name: 'Étoile #1 gagnée' });
    expect(dialog).toHaveAccessibleDescription('Tu as la couronne !');
    expect(within(dialog).getByRole('button', { name: 'Étoile suivante' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Rejouer' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Carte des étoiles' })).toBeInTheDocument();
    expect(getVisibleText(dialog)).toBe('');
    expect(dialog.querySelector('[data-star-crown]')).not.toBeNull();
  });

  it('résiste à une enfant qui tape encore : ses boutons n’agissent qu’après 1,5 s', async () => {
    expect(END_SCREEN_GUARD_MS).toBe(1500);
    expect(END_SCREEN_GUARD_MS).toBeGreaterThan(DEFAULT_GUARD_MS);
    const uninstall = installActivationGuard();
    try {
      const controls = renderBoard();
      await playToTheEnd();
      // La boîte s'ouvre à son heure : la garde court depuis cet instant.
      for (let spent = 0; spent < 5000 && !screen.queryByRole('dialog'); spent += 50) {
        await advanceAsync(50);
      }
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await advanceAsync(END_SCREEN_GUARD_MS - 300);
      fireEvent.click(screen.getByRole('button', { name: 'Carte des étoiles' }));
      expect(controls.exitToMap).not.toHaveBeenCalled();
      await advanceAsync(400);
      fireEvent.click(screen.getByRole('button', { name: 'Carte des étoiles' }));
      expect(controls.exitToMap).toHaveBeenCalledOnce();
    } finally {
      uninstall();
    }
  });

  it('place la boîte en haut de l’écran, jamais sous l’ancien buzzer', async () => {
    renderBoard();
    await playToTheEnd();
    await advanceAsync(END_SCREEN_DELAY_MS);
    expect(screen.getByRole('dialog').className).toContain('self-start');
  });

  it('Rejouer repart de zéro : nouvelle partie, rappel dit de nouveau, perles éteintes', async () => {
    renderBoard();
    await playToTheEnd();
    await advanceAsync(END_SCREEN_DELAY_MS + END_SCREEN_GUARD_MS + 100);
    audio.playClips.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Rejouer' }));
    await advanceAsync(400);
    expect(getLitPearls()).toBe(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(audio.playClips.mock.calls[0]?.[0]).toEqual([getVoiceClipPath('rule-owl-says')]);
  });

  it('Étoile suivante lance l’étoile suivante du catalogue ; Carte des étoiles revient à la carte', async () => {
    const controls = renderBoard();
    await playToTheEnd();
    await advanceAsync(END_SCREEN_DELAY_MS + END_SCREEN_GUARD_MS + 100);
    fireEvent.click(screen.getByRole('button', { name: 'Étoile suivante' }));
    expect(controls.playLevel).toHaveBeenCalledWith('gn-002');
    fireEvent.click(screen.getByRole('button', { name: 'Carte des étoiles' }));
    expect(controls.exitToMap).toHaveBeenCalled();
  });

  it('la couronne déjà acquise reste montrée, même si cette partie a touché un piège', async () => {
    const controls = renderBoard({ profile: crownedPlayer() });
    await toFirstAppearance();
    for (let index = 0; index < 5; index += 1) {
      touch(getStage());
      await advanceAsync(CAUGHT_AND_BREATH + 150);
    }
    // Le renard : touché, il revient ; laissé passer la seconde fois.
    touch(getStage());
    await advanceAsync(2000 + BREATH_MS + 100);
    await advanceAsync(2600);
    await advanceAsync(1000 + END_SCREEN_DELAY_MS);
    expect(controls.recordVictory).toHaveBeenCalledWith(
      expect.objectContaining({ moves: 1, isPerfect: false }),
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Tu as la couronne !');
  });

  it('une couronne manquée n’est jamais évoquée', async () => {
    const controls = renderBoard();
    await toFirstAppearance();
    for (let index = 0; index < 5; index += 1) {
      touch(getStage());
      await advanceAsync(CAUGHT_AND_BREATH + 150);
    }
    touch(getStage());
    await advanceAsync(2000 + BREATH_MS + 100);
    await advanceAsync(2600);
    await advanceAsync(1000 + END_SCREEN_DELAY_MS);
    expect(controls.recordVictory).toHaveBeenCalledOnce();
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveAccessibleDescription();
    expect(dialog.querySelector('[data-star-crown]')).toBeNull();
    expect(dialog).not.toHaveTextContent(/couronne/i);
  });

  it('une étoile déjà gagnée garde le rappel et saute la démo : les essais guidés suivent', async () => {
    renderBoard({ config: { ...OWL, intro: 'full' }, profile: crownedPlayer() });
    await advanceAsync(0);
    expect(getPlayArea()).toHaveAttribute('data-phase', 'starting');
    await advanceAsync(START_DELAY_MS);
    expect(getPlayArea()).toHaveAttribute('data-phase', 'trial');
  });
});

describe('la démo de la première étoile', () => {
  it('rejoue le film : la chouette dans le castelet, la main fantôme sur le buzzer, jamais de texte', async () => {
    renderBoard({ config: { ...OWL, intro: 'full' } });
    await advanceAsync(0);
    expect(getPlayArea()).toHaveAttribute('data-phase', 'demo');
    let sawHand = false;
    for (
      let elapsed = 0;
      elapsed < 60_000 && getPlayArea().dataset.phase === 'demo';
      elapsed += 100
    ) {
      await advanceAsync(100);
      if (document.querySelector('[data-hand]')) sawHand = true;
      expect(getVisibleText(document.body)).toBe('');
    }
    expect(sawHand).toBe(true);
    expect(getPlayArea()).toHaveAttribute('data-phase', 'trial');
    expect(getStatus()).toHaveTextContent('Quelques essais pour s’entraîner : rien n’est compté.');
  });

  it('un contact pendant la démo n’est pas un appui', async () => {
    renderBoard({ config: { ...OWL, intro: 'full' } });
    await advanceAsync(0);
    touch(getStage());
    expect(getBuzzer()).not.toHaveAttribute('data-pressed');
    expect(getLitPearls()).toBe(0);
  });

  it('à l’essai, la main fantôme montre le premier appui', async () => {
    renderBoard({ config: { ...OWL, intro: 'full' }, profile: crownedPlayer() });
    await advanceAsync(START_DELAY_MS + BREATH_MS + 100);
    expect(getPlayArea()).toHaveAttribute('data-phase', 'trial');
    expect(document.querySelector('[data-hand="tap"]')).not.toBeNull();
    expect(getBuzzer()).toHaveAttribute('data-pulsing');
  });
});

describe('le bouton Retour et la zone du plateau (D-Pad)', () => {
  it('atteint au Tab, le bouton Retour reçoit OK ; il mène à la Carte des Étoiles', async () => {
    forceTvMode();
    const controls = renderBoard();
    await toFirstAppearance();
    act(() => {
      screen.getByRole('button', { name: 'Retour' }).focus();
    });
    expect(press('Enter')).toBe(true);
    expect(controls.exitToMap).toHaveBeenCalledOnce();
    // Le plateau n'a rien compté : OK était celui du bouton.
    expect(getFigure()).toHaveAttribute('data-moment', 'entering');
  });

  it('une flèche rend la main au plateau : OK est de nouveau le buzzer', async () => {
    forceTvMode();
    renderBoard();
    await toFirstAppearance();
    act(() => {
      screen.getByRole('button', { name: 'Retour' }).focus();
    });
    press('ArrowRight');
    expect(getBuzzer()).toHaveFocus();
    press('Enter');
    expect(getFigure()).toHaveAttribute('data-moment', 'caught');
  });

  it('le focus donné au buzzer (Tab, clic) rend aussi la main au plateau', async () => {
    forceTvMode();
    renderBoard();
    await toFirstAppearance();
    act(() => {
      screen.getByRole('button', { name: 'Retour' }).focus();
    });
    act(() => {
      getBuzzer().focus();
    });
    press('Enter');
    expect(getFigure()).toHaveAttribute('data-moment', 'caught');
  });

  it('la région d’état se tait une fois l’étoile gagnée', async () => {
    renderBoard({ config: { ...OWL, appearances: 4, traps: 1 } });
    await toFirstAppearance();
    for (let index = 0; index < 3; index += 1) {
      touch(getStage());
      await advanceAsync(CAUGHT_AND_BREATH + 150);
    }
    await advanceAsync(2600 + 1000);
    expect(getPlayArea()).toHaveAttribute('data-phase', 'won');
    expect(getStatus()).toBeEmptyDOMElement();
  });
});
