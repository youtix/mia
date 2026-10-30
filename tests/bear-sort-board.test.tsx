import { NavigationProvider } from '@/core/navigation';
import { getGameProgressSummary, type BaseLevelDefinition } from '@/core/progression';
import {
  BearSortBoard,
  DROP_TOLERANCE_PX,
  END_SCREEN_DELAY_MS,
  IDLE_NUDGE_MS,
  MAX_NUDGES,
  MIN_MIME_MS,
  STOP_MIN_WAIT_MS,
  STOP_NUDGE_MS,
  TAP_SLOP_PX,
  findDropZone,
  getVoiceClipPath,
  isPointInRect,
  type BearSortClipId,
  type BearSortLevelConfig,
  type BearTraits,
  type DropZoneRect,
} from '@/games/bear-sort';
import type { UserProfile } from '@/types/mia';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const audio = vi.hoisted(() => ({
  setEnabled: vi.fn(),
  preloadClips: vi.fn((_paths: readonly string[]) => Promise.resolve()),
  playClips: vi.fn((_paths: readonly string[]) => Promise.resolve()),
  stopClips: vi.fn(),
  playEffect: vi.fn(),
}));

vi.mock('@/core/audio', () => ({ useGameAudio: () => audio }));

const LEFT_BOX = 'Petite boîte bleue';
const RIGHT_BOX = 'Grande boîte jaune';
const OPEN_BOX = 'Boîte ouverte';
const COLOR_RULE = 'Ranger par couleur';
const SIZE_RULE = 'Ranger par taille';

const SMALL_BLUE: BearTraits = { color: 'blue', size: 'small' };
const BIG_BLUE: BearTraits = { color: 'blue', size: 'big' };
const SMALL_YELLOW: BearTraits = { color: 'yellow', size: 'small' };
const BIG_YELLOW: BearTraits = { color: 'yellow', size: 'big' };

/** Une seule phase, trois ours : petit bleu et grand bleu à gauche, grand jaune à droite. */
const COLOR_ONLY: BearSortLevelConfig = {
  zones: [SMALL_BLUE, BIG_YELLOW],
  phases: [
    {
      rule: { kind: 'sort', feature: 'color' },
      addBears: { 'blue-small': 1, 'blue-big': 1, 'yellow-big': 1 },
      placements: null,
    },
  ],
  showGestureHint: false,
};

/**
 * Par couleur, STOP après deux ours, puis par taille. Avec `Math.random` à 0, l'ordre de la réserve
 * reste celui de création : au retour du STOP, le grand bleu resté, puis petit bleu, grand bleu, petit
 * jaune. Grand bleu et petit jaune sont en conflit, le petit bleu va à gauche selon les deux règles.
 */
const COLOR_THEN_SIZE: BearSortLevelConfig = {
  zones: [SMALL_BLUE, BIG_YELLOW],
  phases: [
    {
      rule: { kind: 'sort', feature: 'color' },
      addBears: { 'blue-small': 1, 'blue-big': 1, 'yellow-big': 1 },
      placements: 2,
    },
    {
      rule: { kind: 'sort', feature: 'size' },
      addBears: { 'blue-small': 1, 'blue-big': 1, 'yellow-small': 1 },
      placements: null,
    },
  ],
  showGestureHint: false,
};

/** Par couleur, STOP, puis tous les ours sauf les bleus. */
const COLOR_THEN_EXCEPT: BearSortLevelConfig = {
  zones: [SMALL_BLUE, BIG_YELLOW],
  phases: [
    {
      rule: { kind: 'sort', feature: 'color' },
      addBears: { 'blue-small': 1, 'blue-big': 1, 'yellow-big': 1 },
      placements: 2,
    },
    {
      rule: { kind: 'except', forbidden: { color: 'blue' } },
      addBears: { 'blue-small': 1, 'yellow-small': 1 },
      placements: null,
    },
  ],
  showGestureHint: false,
};

/** Règle « sauf » d'emblée : petit bleu interdit, puis petit jaune et grand jaune permis. */
const EXCEPT_BLUE: BearSortLevelConfig = {
  zones: [SMALL_BLUE, BIG_YELLOW],
  phases: [
    {
      rule: { kind: 'except', forbidden: { color: 'blue' } },
      addBears: { 'blue-small': 1, 'yellow-small': 1, 'yellow-big': 1 },
      placements: null,
    },
  ],
  showGestureHint: false,
};

const CREATED_AT = '2026-10-01T09:00:00.000Z';

function definition(
  id: string,
  order: number,
  config: BearSortLevelConfig,
): BaseLevelDefinition<BearSortLevelConfig> {
  return { id, gameId: 'bear-sort', tier: 'very_easy', order, config };
}

/** Léo : Étoile #1 déjà gagnée avec la couronne. */
function crownedPlayer(): UserProfile {
  return {
    id: 'p1',
    name: 'Léo',
    avatarId: 'fox',
    createdAt: CREATED_AT,
    gamesProgress: {
      'bear-sort': {
        gameId: 'bear-sort',
        levels: {
          'bs-001': {
            levelId: 'bs-001',
            completed: true,
            isPerfect: true,
            bestMoves: 3,
            bestTimeSeconds: 4,
            timesPlayed: 1,
            completedAt: CREATED_AT,
          },
        },
        lastPlayedLevelId: 'bs-001',
      },
    },
    gameSettings: { memory: { previewFactor: 1, mismatchFactor: 1 } },
  };
}

interface BoardOptions {
  config?: BearSortLevelConfig;
  /** Niveau joué : 0 (Étoile #1, suivie de l'Étoile #2) ou 1 (dernière étoile du catalogue) */
  levelIndex?: number;
  profile?: UserProfile | null;
  /** Rendu sous `<StrictMode>` : rendus et effets doublés, comme en développement */
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
function renderBoard({
  config = COLOR_ONLY,
  levelIndex = 0,
  profile = null,
  strict = false,
}: BoardOptions = {}) {
  const catalog = [definition('bs-001', 10, config), definition('bs-002', 20, COLOR_ONLY)];
  const summary = getGameProgressSummary('bear-sort', catalog, profile);
  const level = summary.allLevels[levelIndex];
  if (!level) throw new Error(`Niveau ${String(levelIndex)} absent du catalogue de test`);
  const controls = {
    summary,
    playLevel: vi.fn(),
    exitToMap: vi.fn(),
    recordVictory: vi.fn(() => Promise.resolve()),
  };
  const board = <BearSortBoard level={level} controls={controls} />;
  render(strict ? <StrictMode>{board}</StrictMode> : board, { wrapper: NavigationProvider });
  advance(0);
  return controls;
}

/** Mode TV forcé avant le montage : le moteur D-Pad démarre en mode `dpad`. */
function forceTvMode(): void {
  document.documentElement.dataset.tv = 'on';
}

/** Appuie sur une touche (cible : élément focalisé) ; `true` si le moteur D-Pad l'a consommée. */
function press(key: string, init: { repeat?: boolean } = {}): boolean {
  return !fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
}

function clips(...ids: BearSortClipId[]): string[] {
  return ids.map(getVoiceClipPath);
}

function lastVoice(): readonly string[] | undefined {
  return audio.playClips.mock.lastCall?.[0];
}

/** Promesse résolue à la demande : une voix qui dure jusqu'à l'appel de `resolve`. */
function deferred(): { promise: Promise<void>; resolve: () => Promise<void> } {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () =>
      act(async () => {
        resolvePromise();
        await Promise.resolve();
      }),
  };
}

function getReserve(): HTMLElement {
  return screen.getByRole('group', { name: "Réserve d'ours" });
}

function getBears(): HTMLElement[] {
  return Array.from(getReserve().querySelectorAll<HTMLElement>('button[data-bear-uid]'));
}

function queryBear({ color, size }: BearTraits): HTMLElement | null {
  return getReserve().querySelector<HTMLElement>(
    `button[data-color="${color}"][data-size="${size}"]`,
  );
}

function getBear(traits: BearTraits): HTMLElement {
  const bear = queryBear(traits);
  if (!bear) throw new Error(`Ours ${traits.color} ${traits.size} absent de la réserve`);
  return bear;
}

function getFocusedBear(): HTMLElement | null {
  return getReserve().querySelector<HTMLElement>('button[data-focused]');
}

function getBox(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

function getMascot(): HTMLElement {
  return screen.getByRole('button', { name: 'Réécouter la règle' });
}

function getRulePicture(): Element {
  const picture = document.querySelector('[data-rule-picture]');
  if (!picture) throw new Error('Image de la règle absente');
  return picture;
}

function getStopSign(): HTMLElement {
  return screen.getByRole('button', { name: 'Panneau stop : continuer' });
}

function queryStopOverlay(): Element | null {
  return document.querySelector('[data-stop-overlay]');
}

function getStatus(): HTMLElement {
  return screen.getByRole('status');
}

function getPlacedBears(box: HTMLElement): Element[] {
  return Array.from(box.querySelectorAll('[data-placed-bear]'));
}

/** Tap sur un ours, puis sur une boîte. */
function tapBearThenBox(traits: BearTraits, boxName: string): void {
  fireEvent.click(getBear(traits));
  fireEvent.click(getBox(boxName));
}

/** Texte visible d'un élément : ni le texte réservé aux lecteurs d'écran, ni le tracé des dessins. */
function getVisibleText(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll('.sr-only, svg, style').forEach((element) => {
    element.remove();
  });
  return clone.textContent.trim();
}

const ZONE_RECTS: Readonly<Record<string, { left: number; top: number; size: number }>> = {
  left: { left: 0, top: 0, size: 100 },
  right: { left: 300, top: 0, size: 100 },
  open: { left: 100, top: 0, size: 200 },
};

/** Réserve hors de portée des boîtes. */
const FAR_RESERVE: DropZoneRect = { left: 0, top: 380, right: 500, bottom: 500 };

/** Réserve 8 px sous les boîtes, comme à l'écran : son haut est à portée de leur tolérance. */
const NEAR_RESERVE: DropZoneRect = { left: 0, top: 108, right: 500, bottom: 500 };

/**
 * jsdom n'a pas de mise en page : boîtes de `ZONE_RECTS`, ours en (150, 400), réserve `reserve`,
 * plateau en (0, 0).
 */
function mockLayout(reserve = FAR_RESERVE) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.getAttribute('role') === 'group') {
      const { left, top, right, bottom } = reserve;
      return new DOMRect(left, top, right - left, bottom - top);
    }
    const zone = ZONE_RECTS[this.dataset.zoneId ?? ''];
    let left = zone?.left ?? 0;
    let top = zone?.top ?? 0;
    let size = zone?.size ?? 500;
    if (this.dataset.bearUid !== undefined) {
      left = 150;
      top = 400;
      size = 50;
    }
    return {
      x: left,
      y: top,
      left,
      top,
      right: left + size,
      bottom: top + size,
      width: size,
      height: size,
      toJSON: () => ({}),
    };
  });
}

const POINTER = { pointerId: 7, isPrimary: true };
const ORIGIN = { clientX: 175, clientY: 425 };

/** Glissement complet d'un ours : contact, déplacement, relâchement. */
function dragBear(
  bear: HTMLElement,
  to: { x: number; y: number },
  release: 'pointerUp' | 'pointerCancel' = 'pointerUp',
): void {
  const point = { clientX: to.x, clientY: to.y };
  fireEvent.pointerDown(bear, { ...ORIGIN, ...POINTER });
  fireEvent.pointerMove(bear, { ...point, ...POINTER });
  fireEvent[release](bear, { ...point, ...POINTER });
}

/** Passe le panneau STOP : attente imposée, voix finie (`playClips` résolue), panneau touché. */
async function passStop(): Promise<void> {
  await advanceAsync(STOP_MIN_WAIT_MS);
  fireEvent.click(getStopSign());
}

/** `COLOR_THEN_SIZE` jusqu'à la seconde phase, le grand bleu étant resté dans la réserve. */
async function reachSizePhase(): Promise<void> {
  tapBearThenBox(SMALL_BLUE, LEFT_BOX);
  tapBearThenBox(BIG_YELLOW, RIGHT_BOX);
  await passStop();
}

/** Termine l'étoile `COLOR_THEN_SIZE` depuis le panneau STOP actif. */
function continueAndWin(): void {
  fireEvent.click(getStopSign());
  tapBearThenBox(BIG_BLUE, RIGHT_BOX);
  tapBearThenBox(SMALL_BLUE, LEFT_BOX);
  tapBearThenBox(BIG_BLUE, RIGHT_BOX);
  tapBearThenBox(SMALL_YELLOW, LEFT_BOX);
}

const setPointerCapture = vi.fn();

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  // jsdom n'implémente pas la capture du pointeur.
  Element.prototype.setPointerCapture = setPointerCapture;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
  delete (Element.prototype as Partial<Element>).setPointerCapture;
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  audio.playClips.mockReset();
  // Réserve dans l'ordre de création : `shuffle` tire toujours le premier ours restant.
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.tv;
});

describe('findDropZone', () => {
  const zones = [
    { id: 'left', rect: { left: 0, top: 0, right: 100, bottom: 100 } },
    { id: 'right', rect: { left: 150, top: 0, right: 250, bottom: 100 } },
  ];

  it('tolère 40 px autour d’une boîte', () => {
    expect(DROP_TOLERANCE_PX).toBe(40);
  });

  it('trouve la boîte qui contient le point', () => {
    expect(findDropZone({ x: 50, y: 50 }, zones, 40)).toBe('left');
    expect(findDropZone({ x: 200, y: 50 }, zones, 40)).toBe('right');
  });

  it('accepte un point dans le rectangle agrandi, bord compris, et pas au-delà', () => {
    expect(findDropZone({ x: 50, y: 140 }, zones, 40)).toBe('left');
    expect(findDropZone({ x: 50, y: 141 }, zones, 40)).toBeNull();
    expect(findDropZone({ x: -40, y: -40 }, zones, 40)).toBe('left');
    expect(findDropZone({ x: -41, y: 50 }, zones, 40)).toBeNull();
    expect(findDropZone({ x: 50, y: 110 }, zones, 0)).toBeNull();
  });

  it('préfère la boîte la plus proche quand deux rectangles agrandis contiennent le point', () => {
    expect(findDropZone({ x: 120, y: 50 }, zones, 40)).toBe('left');
    expect(findDropZone({ x: 130, y: 50 }, zones, 40)).toBe('right');
  });

  it('départage une égalité en faveur de la première boîte', () => {
    expect(findDropZone({ x: 125, y: 50 }, zones, 40)).toBe('left');
    const overlapping = [
      { id: 'a', rect: { left: 0, top: 0, right: 100, bottom: 100 } },
      { id: 'b', rect: { left: 50, top: 0, right: 150, bottom: 100 } },
    ];
    expect(findDropZone({ x: 75, y: 50 }, overlapping, 40)).toBe('a');
  });

  it('ignore un rectangle vide et une liste vide', () => {
    const empty = [{ id: 'none', rect: { left: 0, top: 0, right: 0, bottom: 0 } }];
    expect(findDropZone({ x: 0, y: 0 }, empty, 40)).toBeNull();
    expect(findDropZone({ x: 0, y: 0 }, [], 40)).toBeNull();
  });
});

describe('isPointInRect', () => {
  const rect = { left: 10, top: 20, right: 110, bottom: 120 };

  it('contient un point intérieur ou sur un bord, et rien au-delà', () => {
    expect(isPointInRect({ x: 50, y: 50 }, rect)).toBe(true);
    expect(isPointInRect({ x: 10, y: 20 }, rect)).toBe(true);
    expect(isPointInRect({ x: 110, y: 120 }, rect)).toBe(true);
    expect(isPointInRect({ x: 9, y: 50 }, rect)).toBe(false);
    expect(isPointInRect({ x: 111, y: 50 }, rect)).toBe(false);
    expect(isPointInRect({ x: 50, y: 19 }, rect)).toBe(false);
    expect(isPointInRect({ x: 50, y: 121 }, rect)).toBe(false);
  });

  it('ne contient rien quand le rectangle est vide (élément non mesurable)', () => {
    expect(isPointInRect({ x: 0, y: 0 }, { left: 0, top: 0, right: 0, bottom: 0 })).toBe(false);
  });
});

describe('Écran', () => {
  it('nomme tout pour les lecteurs d’écran, sans aucun texte visible', () => {
    const controls = renderBoard();

    const title = screen.getByRole('heading', { level: 1, name: 'Étoile #1' });
    expect(title).toHaveClass('sr-only');
    const back = screen.getByRole('button', { name: 'Retour' });
    expect(within(back).getByText('Retour')).toHaveClass('sr-only');
    expect(within(back).getByText('Retour')).not.toHaveClass('sm:not-sr-only');
    expect(screen.queryByRole('contentinfo')).toBeNull();

    expect(getBears().map((bear) => bear.getAttribute('aria-label'))).toEqual([
      'Petit ours bleu',
      'Grand ours bleu',
      'Grand ours jaune',
    ]);
    expect(getBox(LEFT_BOX)).toHaveAttribute('data-zone-id', 'left');
    expect(getBox(RIGHT_BOX)).toHaveAttribute('data-zone-id', 'right');
    expect(getMascot()).toBeInTheDocument();
    expect(within(getRulePicture() as HTMLElement).getByRole('img')).toHaveAccessibleName(
      COLOR_RULE,
    );
    expect(getStatus()).toHaveClass('sr-only');
    expect(getStatus()).toHaveTextContent(COLOR_RULE);

    expect(getVisibleText(document.body)).toBe('');

    fireEvent.click(back);
    expect(controls.exitToMap).toHaveBeenCalledOnce();
  });

  it('montre une seule grande boîte ouverte pendant une règle « sauf »', () => {
    renderBoard({ config: EXCEPT_BLUE });

    expect(getBox(OPEN_BOX)).toHaveAttribute('data-zone-id', 'open');
    expect(screen.queryByRole('button', { name: LEFT_BOX })).toBeNull();
    expect(screen.queryByRole('button', { name: RIGHT_BOX })).toBeNull();
    expect(getStatus()).toHaveTextContent('Tous les ours, sauf un ours bleu');
  });

  it('charge les clips de l’étoile, puis annonce la règle de la première phase', () => {
    renderBoard({ config: COLOR_THEN_SIZE });

    expect(audio.preloadClips).toHaveBeenCalledOnce();
    expect(new Set(audio.preloadClips.mock.lastCall?.[0])).toEqual(
      new Set(
        clips(
          'rule-color',
          'rule-size',
          'stop-warning',
          'stop-go',
          'bounce-trap',
          'hint-look',
          'hint-here',
          'star-won',
          'crown-won',
        ),
      ),
    );
    expect(audio.playClips).toHaveBeenCalledExactlyOnceWith(clips('rule-color'));
  });

  it('ne charge que les clips utiles à une étoile sans STOP ou avec une règle « sauf »', () => {
    renderBoard({ config: EXCEPT_BLUE });

    const preloaded = audio.preloadClips.mock.lastCall?.[0];
    expect(preloaded).toContain(getVoiceClipPath('rule-except-blue'));
    expect(preloaded).toContain(getVoiceClipPath('nudge-more'));
    expect(preloaded).not.toContain(getVoiceClipPath('stop-warning'));
    expect(preloaded).not.toContain(getVoiceClipPath('bounce-trap'));
  });

  it('n’annonce la règle qu’une fois sous StrictMode', () => {
    renderBoard({ strict: true });

    expect(audio.playClips).toHaveBeenCalledExactlyOnceWith(clips('rule-color'));
    expect(audio.preloadClips).toHaveBeenCalledOnce();
  });

  it('rejoue la règle quand on touche la mascotte, et vocalise de nouveau', () => {
    renderBoard();
    const firstAnnouncement = getStatus().firstElementChild;

    fireEvent.click(getMascot());

    expect(audio.playClips).toHaveBeenCalledTimes(2);
    expect(lastVoice()).toEqual(clips('rule-color'));
    expect(getStatus()).toHaveTextContent(COLOR_RULE);
    expect(getStatus().firstElementChild).not.toBe(firstAnnouncement);
  });

  it('dessine l’image de la règle dans le sens des boîtes, jusque sur le panneau STOP', () => {
    renderBoard({ config: { ...COLOR_THEN_SIZE, zones: [BIG_YELLOW, SMALL_BLUE] } });
    const getOrder = (root: Element, attribute: string) =>
      Array.from(root.querySelectorAll(`[${attribute}]`)).map((element) =>
        element.getAttribute(attribute),
      );

    expect(getOrder(getRulePicture(), 'data-rule-drop')).toEqual(['yellow', 'blue']);

    tapBearThenBox(SMALL_BLUE, LEFT_BOX);
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);

    expect(getOrder(queryStopOverlay() as HTMLElement, 'data-rule-bear')).toEqual([
      'grey-big',
      'grey-small',
    ]);
  });
});

describe('Au tap (aussi TalkBack et le clavier)', () => {
  it('sélectionne un ours, puis le dépose dans la boîte touchée', () => {
    renderBoard();
    const bear = getBear(SMALL_BLUE);
    expect(bear).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(bear);
    expect(bear).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(getBox(LEFT_BOX));
    expect(queryBear(SMALL_BLUE)).toBeNull();
    expect(getPlacedBears(getBox(LEFT_BOX))).toHaveLength(1);
    expect(audio.playEffect).toHaveBeenCalledExactlyOnceWith('success');
    expect(getBox(LEFT_BOX)).toHaveAttribute('data-pulsing', 'true');
    // Aucune voix à chaque réussite : seule l'annonce de départ a été jouée.
    expect(audio.playClips).toHaveBeenCalledOnce();
  });

  it('déplace la sélection d’un ours à l’autre, sans bascule', () => {
    renderBoard();

    fireEvent.click(getBear(SMALL_BLUE));
    fireEvent.click(getBear(SMALL_BLUE));
    expect(getBear(SMALL_BLUE)).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(getBear(BIG_YELLOW));
    expect(getBear(SMALL_BLUE)).toHaveAttribute('aria-pressed', 'false');
    expect(getBear(BIG_YELLOW)).toHaveAttribute('aria-pressed', 'true');
  });

  it('fait rebondir un ours : il reste choisi, sans rouge ni compteur', () => {
    renderBoard();

    tapBearThenBox(SMALL_BLUE, RIGHT_BOX);

    const bear = getBear(SMALL_BLUE);
    expect(bear).toHaveAttribute('aria-pressed', 'true');
    expect(bear).toHaveAttribute('data-wiggling', 'true');
    expect(getPlacedBears(getBox(RIGHT_BOX))).toHaveLength(0);
    expect(audio.playEffect).toHaveBeenCalledExactlyOnceWith('bounce');
    expect(getVisibleText(document.body)).toBe('');

    // Il suffit alors de toucher la bonne boîte.
    fireEvent.click(getBox(LEFT_BOX));
    expect(queryBear(SMALL_BLUE)).toBeNull();
  });

  it('ne fait rien sur une boîte sans ours choisi, à part le dire au lecteur d’écran', () => {
    renderBoard();

    fireEvent.click(getBox(LEFT_BOX));

    expect(getBears()).toHaveLength(3);
    expect(audio.playEffect).not.toHaveBeenCalled();
    expect(getStatus()).toHaveTextContent('Choisis d’abord un ours');
  });

  it('traite un petit déplacement comme un tap', () => {
    mockLayout();
    renderBoard();
    const bear = getBear(SMALL_BLUE);

    fireEvent.pointerDown(bear, { ...ORIGIN, ...POINTER });
    fireEvent.pointerMove(bear, {
      clientX: ORIGIN.clientX + TAP_SLOP_PX - 1,
      clientY: ORIGIN.clientY,
      ...POINTER,
    });
    expect(bear).not.toHaveAttribute('data-dragging');
    expect(bear.style.transform).toBe('');
    fireEvent.pointerUp(bear, ORIGIN);
    fireEvent.pointerUp(bear, { ...ORIGIN, ...POINTER });
    fireEvent.click(bear, { detail: 1 });

    expect(bear).toHaveAttribute('aria-pressed', 'true');
    expect(getBears()).toHaveLength(3);
  });

  it('garde au clavier le clic natif des boutons atteints au Tab, sans réveiller le D-Pad', () => {
    renderBoard();
    const bear = getBear(SMALL_BLUE);
    act(() => {
      bear.focus();
    });

    // Entrée ne remonte pas au moteur D-Pad : le navigateur émet le clic, le mode reste tactile.
    expect(press('Enter')).toBe(false);
    fireEvent.click(bear);
    expect(bear).toHaveAttribute('aria-pressed', 'true');
    expect(bear).not.toHaveAttribute('data-focused');

    act(() => {
      getBox(LEFT_BOX).focus();
    });
    expect(press(' ')).toBe(false);
    fireEvent.click(getBox(LEFT_BOX));
    expect(queryBear(SMALL_BLUE)).toBeNull();

    act(() => {
      getMascot().focus();
    });
    expect(press('Enter')).toBe(false);
    expect(press('a')).toBe(false);
    expect(audio.playClips).toHaveBeenCalledOnce();
  });
});

describe('Au doigt', () => {
  it('fait suivre l’ours au-dessus des autres, puis le dépose dans la boîte visée', () => {
    mockLayout();
    renderBoard();
    const bear = getBear(SMALL_BLUE);

    fireEvent.pointerDown(bear, { ...ORIGIN, ...POINTER });
    expect(setPointerCapture).toHaveBeenCalledExactlyOnceWith(POINTER.pointerId);
    fireEvent.pointerMove(bear, { clientX: 100, clientY: 75, ...POINTER });

    expect(bear).toHaveAttribute('data-dragging', 'true');
    expect(bear.style.transform).toBe('translate(-75px, -350px)');
    expect(bear).toHaveClass('touch-none', 'transition-none');
    expect(bear.parentElement).toHaveClass('z-30');
    // Un autre pointeur n'influence pas le glissement en cours.
    fireEvent.pointerMove(bear, { clientX: 400, clientY: 400, pointerId: 8, isPrimary: false });
    expect(bear.style.transform).toBe('translate(-75px, -350px)');
    fireEvent.pointerUp(bear, { clientX: 400, clientY: 400, pointerId: 8, isPrimary: false });
    expect(bear).toHaveAttribute('data-dragging', 'true');

    fireEvent.pointerUp(bear, { clientX: 50, clientY: 50, ...POINTER });

    expect(queryBear(SMALL_BLUE)).toBeNull();
    expect(getPlacedBears(getBox(LEFT_BOX))).toHaveLength(1);
    expect(audio.playEffect).toHaveBeenCalledExactlyOnceWith('success');
  });

  it('compte un dépôt lâché à moins de 40 px d’une boîte', () => {
    mockLayout();
    renderBoard();

    dragBear(getBear(SMALL_BLUE), { x: 50, y: 100 + DROP_TOLERANCE_PX });

    expect(queryBear(SMALL_BLUE)).toBeNull();
  });

  it('fait rebondir un ours glissé dans la mauvaise boîte, sans le sélectionner', () => {
    mockLayout();
    renderBoard();

    dragBear(getBear(SMALL_BLUE), { x: 350, y: 50 });

    const bear = getBear(SMALL_BLUE);
    expect(bear).not.toHaveAttribute('data-dragging');
    expect(bear.style.transform).toBe('');
    expect(bear).toHaveAttribute('aria-pressed', 'false');
    expect(bear).toHaveAttribute('data-wiggling', 'true');
    expect(audio.playEffect).toHaveBeenCalledExactlyOnceWith('bounce');
  });

  it('rend l’ours lâché hors de toute boîte, sans rien compter', () => {
    mockLayout();
    const controls = renderBoard();

    dragBear(getBear(SMALL_BLUE), { x: 200, y: 300 });

    const bear = getBear(SMALL_BLUE);
    expect(bear).not.toHaveAttribute('data-dragging');
    expect(bear.style.transform).toBe('');
    expect(audio.playEffect).not.toHaveBeenCalled();
    expect(audio.playClips).toHaveBeenCalledOnce();

    // Le dépôt manqué ne compte ni comme coup, ni comme erreur.
    dragBear(getBear(SMALL_BLUE), { x: 50, y: 50 });
    dragBear(getBear(BIG_BLUE), { x: 50, y: 50 });
    dragBear(getBear(BIG_YELLOW), { x: 350, y: 50 });
    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 3,
      timeSeconds: 0,
      isPerfect: true,
    });
  });

  it('rend l’ours lâché sur la réserve, même à portée d’une boîte, sans rien compter', () => {
    mockLayout(NEAR_RESERVE);
    const controls = renderBoard();

    // Un doigt qui glisse sur le premier rang : à moins de 40 px de la boîte, mais sans rien viser.
    dragBear(getBear(SMALL_BLUE), { x: 50, y: 120 });
    dragBear(getBear(BIG_YELLOW), { x: 50, y: 120 });

    expect(getBears()).toHaveLength(3);
    expect(getBear(BIG_YELLOW)).not.toHaveAttribute('data-wiggling');
    expect(audio.playEffect).not.toHaveBeenCalled();
    expect(audio.playClips).toHaveBeenCalledOnce();

    // Ni coup ni erreur : la couronne reste à portée.
    dragBear(getBear(SMALL_BLUE), { x: 50, y: 50 });
    dragBear(getBear(BIG_BLUE), { x: 50, y: 50 });
    dragBear(getBear(BIG_YELLOW), { x: 350, y: 50 });
    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 3,
      timeSeconds: 0,
      isPerfect: true,
    });
  });

  it('compte encore un dépôt lâché entre la boîte et la réserve', () => {
    mockLayout(NEAR_RESERVE);
    renderBoard();

    dragBear(getBear(SMALL_BLUE), { x: 50, y: 104 });

    expect(queryBear(SMALL_BLUE)).toBeNull();
  });

  it('rend l’ours quand le système interrompt le geste, même au-dessus d’une boîte', () => {
    mockLayout();
    renderBoard();

    dragBear(getBear(SMALL_BLUE), { x: 50, y: 50 }, 'pointerCancel');

    const bear = getBear(SMALL_BLUE);
    expect(bear).not.toHaveAttribute('data-dragging');
    expect(bear.style.transform).toBe('');
    expect(audio.playEffect).not.toHaveBeenCalled();
  });

  it('ignore le clic qui suit un glissement, mais pas un clic au clavier', () => {
    mockLayout();
    renderBoard();
    const bear = getBear(SMALL_BLUE);

    dragBear(bear, { x: 200, y: 300 });
    fireEvent.click(bear, { detail: 1 });
    expect(bear).toHaveAttribute('aria-pressed', 'false');

    dragBear(bear, { x: 200, y: 300 });
    fireEvent.click(bear, { detail: 0 });
    expect(bear).toHaveAttribute('aria-pressed', 'true');
  });

  it('annule la sélection quand un glissement commence', () => {
    mockLayout();
    renderBoard();

    fireEvent.click(getBear(BIG_YELLOW));
    fireEvent.pointerDown(getBear(SMALL_BLUE), { ...ORIGIN, ...POINTER });
    expect(getBear(BIG_YELLOW)).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerMove(getBear(SMALL_BLUE), { clientX: 100, clientY: 75, ...POINTER });

    expect(getBear(BIG_YELLOW)).toHaveAttribute('aria-pressed', 'false');
  });

  it('ignore un bouton de souris secondaire', () => {
    mockLayout();
    renderBoard();
    const bear = getBear(SMALL_BLUE);

    fireEvent.pointerDown(bear, {
      ...ORIGIN,
      pointerId: 3,
      isPrimary: true,
      pointerType: 'mouse',
      button: 2,
    });
    fireEvent.pointerMove(bear, { clientX: 100, clientY: 75, pointerId: 3, isPrimary: true });

    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(bear).not.toHaveAttribute('data-dragging');
  });

  it('laisse glisser un doigt quand une autre main est posée sur l’écran', () => {
    mockLayout();
    renderBoard();
    // La main posée ailleurs tient le pointeur principal : ce doigt est secondaire.
    const finger = { pointerId: 2, isPrimary: false };
    const bear = getBear(SMALL_BLUE);

    fireEvent.pointerDown(bear, { ...ORIGIN, ...finger });
    fireEvent.pointerMove(bear, { clientX: 100, clientY: 75, ...finger });
    expect(bear).toHaveAttribute('data-dragging', 'true');

    fireEvent.pointerUp(bear, { clientX: 50, clientY: 50, ...finger });
    expect(queryBear(SMALL_BLUE)).toBeNull();
  });

  it('laisse glisser un autre ours quand un doigt reste posé, immobile, sur un ours', () => {
    mockLayout();
    renderBoard();
    const finger = { pointerId: 9, isPrimary: false };
    const resting = getBear(SMALL_BLUE);
    const bear = getBear(BIG_YELLOW);

    fireEvent.pointerDown(resting, { ...ORIGIN, ...POINTER });
    fireEvent.pointerDown(bear, { ...ORIGIN, ...finger });
    fireEvent.pointerMove(bear, { clientX: 350, clientY: 50, ...finger });
    expect(bear).toHaveAttribute('data-dragging', 'true');

    // Le doigt posé ne commande plus rien : il peut bouger, ou se lever.
    fireEvent.pointerMove(resting, { clientX: 100, clientY: 75, ...POINTER });
    expect(resting).not.toHaveAttribute('data-dragging');
    fireEvent.pointerUp(resting, { ...ORIGIN, ...POINTER });
    expect(bear).toHaveAttribute('data-dragging', 'true');

    fireEvent.pointerUp(bear, { clientX: 350, clientY: 50, ...finger });
    expect(queryBear(BIG_YELLOW)).toBeNull();
  });

  it('refuse un second doigt pendant un glissement : un ours à la fois', () => {
    mockLayout();
    renderBoard();
    const bear = getBear(SMALL_BLUE);

    fireEvent.pointerDown(bear, { ...ORIGIN, ...POINTER });
    fireEvent.pointerMove(bear, { clientX: 100, clientY: 75, ...POINTER });
    fireEvent.pointerDown(getBear(BIG_BLUE), { ...ORIGIN, pointerId: 9, isPrimary: false });

    expect(setPointerCapture).toHaveBeenCalledExactlyOnceWith(POINTER.pointerId);
    expect(bear).toHaveAttribute('data-dragging', 'true');

    fireEvent.pointerUp(bear, { clientX: 50, clientY: 50, ...POINTER });
    expect(queryBear(SMALL_BLUE)).toBeNull();
  });

  it('rend l’ours d’un glissement jamais relâché au contact suivant, même un simple tap', () => {
    mockLayout();
    renderBoard();
    const bear = getBear(SMALL_BLUE);
    fireEvent.pointerDown(bear, { ...ORIGIN, ...POINTER });
    fireEvent.pointerMove(bear, { clientX: 100, clientY: 75, ...POINTER });

    // Le système a perdu `pointerup` : un nouveau contact est de nouveau le pointeur principal.
    const next = { pointerId: 10, isPrimary: true };
    fireEvent.pointerDown(getBear(BIG_BLUE), { ...ORIGIN, ...next });
    fireEvent.pointerUp(getBear(BIG_BLUE), { ...ORIGIN, ...next });

    expect(bear).not.toHaveAttribute('data-dragging');
    expect(bear.style.transform).toBe('');
  });

  it('reprend les gestes après un ours rangé par un autre doigt pendant son contact', () => {
    mockLayout();
    renderBoard();

    // Un doigt reste posé sur l'ours choisi, l'autre touche la boîte : `pointerup` n'arrivera jamais.
    fireEvent.click(getBear(SMALL_BLUE));
    fireEvent.pointerDown(getBear(SMALL_BLUE), { ...ORIGIN, ...POINTER });
    fireEvent.click(getBox(LEFT_BOX));
    expect(queryBear(SMALL_BLUE)).toBeNull();

    dragBear(getBear(BIG_BLUE), { x: 50, y: 50 });
    expect(queryBear(BIG_BLUE)).toBeNull();
  });

  it('glisse même si la capture du pointeur échoue', () => {
    mockLayout();
    setPointerCapture.mockImplementationOnce(() => {
      throw new Error('InvalidStateError');
    });
    renderBoard();

    dragBear(getBear(SMALL_BLUE), { x: 50, y: 50 });

    expect(queryBear(SMALL_BLUE)).toBeNull();
  });
});

describe('Échelle d’indices', () => {
  /** Dépôts faux du petit bleu dans la boîte de droite (par couleur, sa place est à gauche). */
  function bounceSmallBlue(times: number): void {
    fireEvent.click(getBear(SMALL_BLUE));
    for (let index = 0; index < times; index += 1) fireEvent.click(getBox(RIGHT_BOX));
  }

  it('échelon 1, sans règle précédente : la règle seule, et son image qui pulse', () => {
    renderBoard();
    expect(getRulePicture()).not.toHaveAttribute('data-pulsing');

    bounceSmallBlue(1);

    expect(lastVoice()).toEqual(clips('rule-color'));
    expect(getRulePicture()).toHaveAttribute('data-pulsing', 'true');
    expect(getBox(LEFT_BOX)).not.toHaveAttribute('data-glowing');
    expect(getBear(SMALL_BLUE)).not.toHaveAttribute('data-faded');
    expect(getStatus()).toHaveTextContent(COLOR_RULE);

    // L'image cesse de pulser, l'ours de remuer : rien ne reste à l'écran.
    advance(5000);
    expect(getRulePicture()).not.toHaveAttribute('data-pulsing');
    expect(getBear(SMALL_BLUE)).not.toHaveAttribute('data-wiggling');
  });

  it('échelon 1 après un changement : le piège quand l’ancienne règle a joué', async () => {
    renderBoard({ config: COLOR_THEN_SIZE });
    await reachSizePhase();

    // Par taille, le grand bleu va à droite ; à gauche, c'est l'ancienne règle (couleur).
    tapBearThenBox(BIG_BLUE, LEFT_BOX);

    expect(lastVoice()).toEqual(clips('bounce-trap', 'rule-size'));
    expect(getRulePicture()).toHaveAttribute('data-pulsing', 'true');
    expect(getStatus()).toHaveTextContent(SIZE_RULE);
  });

  it('échelon 1 après un changement : la règle seule pour une simple maladresse', async () => {
    renderBoard({ config: COLOR_THEN_SIZE });
    await reachSizePhase();

    // Le petit bleu va à gauche selon les deux règles : à droite, ce n'est pas l'ancienne règle.
    tapBearThenBox(SMALL_BLUE, RIGHT_BOX);

    expect(lastVoice()).toEqual(clips('rule-size'));
  });

  it('échelon 2 : « Regarde bien », et l’ancien critère estompé partout', () => {
    renderBoard();
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);

    bounceSmallBlue(2);

    expect(lastVoice()).toEqual(clips('hint-look', 'rule-color'));
    expect(getRulePicture()).toHaveAttribute('data-pulsing', 'true');
    for (const element of [...getBears(), getBox(LEFT_BOX), getBox(RIGHT_BOX)]) {
      expect(element).toHaveAttribute('data-faded', 'size');
    }
    // Même les miniatures déjà rangées.
    const placed = getPlacedBears(getBox(RIGHT_BOX))[0];
    expect(placed?.querySelector('svg')).toHaveAttribute('data-faded', 'size');
    expect(getBox(LEFT_BOX)).not.toHaveAttribute('data-glowing');
  });

  it('échelon 3 : « Essaie ici », la bonne boîte s’éclaire, tout s’efface au dépôt réussi', () => {
    renderBoard();

    bounceSmallBlue(3);

    expect(lastVoice()).toEqual(clips('hint-here'));
    expect(getBox(LEFT_BOX)).toHaveAttribute('data-glowing', 'true');
    expect(getBox(RIGHT_BOX)).not.toHaveAttribute('data-glowing');
    expect(getBear(SMALL_BLUE)).toHaveAttribute('data-wiggling', 'true');
    expect(getBear(SMALL_BLUE)).toHaveAttribute('data-faded', 'size');
    expect(getStatus()).toHaveTextContent(`Essaie ici : ${LEFT_BOX}`);

    // L'ours continue de remuer tant que l'indice vaut.
    advance(10_000);
    expect(getBear(SMALL_BLUE)).toHaveAttribute('data-wiggling', 'true');

    fireEvent.click(getBox(LEFT_BOX));
    expect(getBox(LEFT_BOX)).not.toHaveAttribute('data-glowing');
    expect(getBear(BIG_YELLOW)).not.toHaveAttribute('data-faded');
    expect(getBear(BIG_YELLOW)).not.toHaveAttribute('data-wiggling');
  });

  it('échelon 3 : reste à l’échelon au-delà de trois rebonds', () => {
    renderBoard();

    bounceSmallBlue(4);

    expect(lastVoice()).toEqual(clips('hint-here'));
    expect(audio.playClips).toHaveBeenCalledTimes(5);
  });

  it('échelon 3 : la lumière suit l’ours choisi, sinon celui du dernier rebond', () => {
    renderBoard();
    bounceSmallBlue(3);

    fireEvent.click(getBear(BIG_YELLOW));

    expect(getBox(RIGHT_BOX)).toHaveAttribute('data-glowing', 'true');
    expect(getBox(LEFT_BOX)).not.toHaveAttribute('data-glowing');
    expect(getBear(BIG_YELLOW)).toHaveAttribute('data-wiggling', 'true');
  });

  it('échelon 3 : la lumière suit l’ours tenu', () => {
    mockLayout();
    renderBoard();
    bounceSmallBlue(3);
    expect(getBox(LEFT_BOX)).toHaveAttribute('data-glowing', 'true');

    const bear = getBear(BIG_YELLOW);
    fireEvent.pointerDown(bear, { ...ORIGIN, ...POINTER });
    fireEvent.pointerMove(bear, { clientX: 100, clientY: 75, ...POINTER });

    expect(getBox(RIGHT_BOX)).toHaveAttribute('data-glowing', 'true');
    expect(getBox(LEFT_BOX)).not.toHaveAttribute('data-glowing');
    fireEvent.pointerUp(bear, { clientX: 200, clientY: 300, ...POINTER });
  });

  it('un dépôt réussi fait repartir l’échelle de zéro', () => {
    renderBoard();
    bounceSmallBlue(2);
    fireEvent.click(getBox(LEFT_BOX));

    tapBearThenBox(BIG_YELLOW, LEFT_BOX);

    expect(lastVoice()).toEqual(clips('rule-color'));
  });

  describe('règle « sauf »', () => {
    /** Dépôts du petit bleu, interdit, dans la boîte ouverte. */
    function bounceForbidden(times: number): void {
      fireEvent.click(getBear(SMALL_BLUE));
      for (let index = 0; index < times; index += 1) fireEvent.click(getBox(OPEN_BOX));
    }

    it('échelon 1 : la règle seule, jamais le piège', () => {
      renderBoard({ config: EXCEPT_BLUE });

      bounceForbidden(1);

      expect(lastVoice()).toEqual(clips('rule-except-blue'));
      expect(audio.playEffect).toHaveBeenCalledExactlyOnceWith('bounce');
    });

    it('échelon 2 : signe « non » sur les ours interdits, rien d’estompé', () => {
      renderBoard({ config: EXCEPT_BLUE });

      bounceForbidden(2);

      expect(lastVoice()).toEqual(clips('hint-look', 'rule-except-blue'));
      expect(getBear(SMALL_BLUE).querySelector('[data-no-badge]')).not.toBeNull();
      expect(getBear(SMALL_YELLOW).querySelector('[data-no-badge]')).toBeNull();
      expect(getBear(SMALL_BLUE)).not.toHaveAttribute('data-faded');
      expect(getBox(OPEN_BOX)).not.toHaveAttribute('data-faded');
    });

    it('échelon 3, ours interdit : la boîte ouverte s’éclaire et un ours permis remue', () => {
      renderBoard({ config: EXCEPT_BLUE });

      bounceForbidden(3);

      expect(lastVoice()).toEqual(clips('hint-here'));
      expect(getBox(OPEN_BOX)).toHaveAttribute('data-glowing', 'true');
      expect(getBear(SMALL_YELLOW)).toHaveAttribute('data-wiggling', 'true');
      expect(getBear(SMALL_BLUE).querySelector('[data-no-badge]')).not.toBeNull();
      expect(getStatus()).toHaveTextContent(`Essaie ici : ${OPEN_BOX}, avec petit ours jaune`);

      // L'ours interdit ne remue pas : seul l'ours permis attire l'œil, et continue de le faire.
      expect(getBear(SMALL_BLUE)).not.toHaveAttribute('data-wiggling');
      advance(5000);
      expect(getBear(SMALL_YELLOW)).toHaveAttribute('data-wiggling', 'true');
    });

    it('échelon 3, ours interdit choisi : le choix passe à l’ours permis, que la boîte range', () => {
      renderBoard({ config: EXCEPT_BLUE });

      bounceForbidden(3);

      expect(getBear(SMALL_BLUE)).toHaveAttribute('aria-pressed', 'false');
      expect(getBear(SMALL_YELLOW)).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(getBox(OPEN_BOX));
      expect(queryBear(SMALL_YELLOW)).toBeNull();
      expect(audio.playEffect).toHaveBeenLastCalledWith('success');
    });

    it('échelon 3, ours interdit au D-Pad : le curseur passe à l’ours permis, que Haut range', () => {
      forceTvMode();
      renderBoard({ config: EXCEPT_BLUE });

      press('ArrowUp');
      press('ArrowUp');
      expect(getFocusedBear()).toBe(getBear(SMALL_BLUE));

      press('ArrowUp');
      expect(getFocusedBear()).toBe(getBear(SMALL_YELLOW));
      expect(getBear(SMALL_YELLOW)).toHaveFocus();
      expect(getBear(SMALL_BLUE)).not.toHaveAttribute('data-wiggling');

      press('ArrowUp');
      expect(queryBear(SMALL_YELLOW)).toBeNull();
      expect(audio.playEffect).toHaveBeenLastCalledWith('success');
    });

    it('échelon 3, ours interdit glissé : un ours permis remue, sans rien choisir à sa place', () => {
      mockLayout();
      renderBoard({ config: EXCEPT_BLUE });

      for (let index = 0; index < 3; index += 1) {
        dragBear(getBear(SMALL_BLUE), { x: 150, y: 100 });
      }

      expect(getBear(SMALL_YELLOW)).toHaveAttribute('data-wiggling', 'true');
      expect(getBear(SMALL_YELLOW)).toHaveAttribute('aria-pressed', 'false');
      expect(getBear(SMALL_BLUE)).not.toHaveAttribute('data-wiggling');
      expect(getBox(OPEN_BOX)).toHaveAttribute('data-glowing', 'true');
    });

    it('échelon 3, ours permis choisi : c’est lui qui remue', () => {
      renderBoard({ config: EXCEPT_BLUE });
      bounceForbidden(3);

      fireEvent.click(getBear(BIG_YELLOW));

      expect(getBear(BIG_YELLOW)).toHaveAttribute('data-wiggling', 'true');
      expect(getBear(SMALL_YELLOW)).not.toHaveAttribute('data-wiggling');
      expect(getBox(OPEN_BOX)).toHaveAttribute('data-glowing', 'true');
    });
  });
});

describe('Inaction', () => {
  it('rappelle la règle en phase de tri, et recommence tant que rien ne se passe', () => {
    renderBoard();
    audio.playClips.mockClear();

    advance(IDLE_NUDGE_MS - 1);
    expect(audio.playClips).not.toHaveBeenCalled();
    expect(getBear(SMALL_BLUE)).not.toHaveAttribute('data-wiggling');

    advance(1);
    expect(audio.playClips).toHaveBeenCalledExactlyOnceWith(clips('rule-color'));
    expect(getRulePicture()).toHaveAttribute('data-pulsing', 'true');
    expect(getBear(SMALL_BLUE)).toHaveAttribute('data-wiggling', 'true');
    expect(getBear(BIG_BLUE)).not.toHaveAttribute('data-wiggling');

    advance(IDLE_NUDGE_MS);
    expect(audio.playClips).toHaveBeenCalledTimes(2);
    expect(getRulePicture()).toHaveAttribute('data-pulsing', 'true');
  });

  it('en règle « sauf », dit qu’il reste des ours, et fait remuer un ours permis au 2ᵉ rappel', () => {
    renderBoard({ config: EXCEPT_BLUE });
    audio.playClips.mockClear();

    advance(IDLE_NUDGE_MS);
    expect(audio.playClips).toHaveBeenCalledExactlyOnceWith(clips('nudge-more'));
    expect(getRulePicture()).toHaveAttribute('data-pulsing', 'true');
    expect(getReserve().querySelector('[data-wiggling]')).toBeNull();

    advance(IDLE_NUDGE_MS);
    expect(audio.playClips).toHaveBeenCalledTimes(2);
    expect(lastVoice()).toEqual(clips('nudge-more'));
    expect(getBear(SMALL_YELLOW)).toHaveAttribute('data-wiggling', 'true');
    expect(getBear(SMALL_BLUE)).not.toHaveAttribute('data-wiggling');
  });

  it('remet le compte à zéro à chaque geste, en règle « sauf » comme en tri', () => {
    renderBoard({ config: EXCEPT_BLUE });
    advance(IDLE_NUDGE_MS);
    audio.playClips.mockClear();

    fireEvent.click(getBear(SMALL_YELLOW));
    advance(IDLE_NUDGE_MS - 1);
    expect(audio.playClips).not.toHaveBeenCalled();

    advance(1);
    expect(audio.playClips).toHaveBeenCalledOnce();
    // Premier rappel depuis le geste : pas encore d'ours qui remue.
    expect(getReserve().querySelector('[data-wiggling]')).toBeNull();
  });

  it('relance le compte à rebours à chaque sélection, dépôt ou rappel de la mascotte', () => {
    renderBoard();
    audio.playClips.mockClear();

    advance(IDLE_NUDGE_MS - 1);
    fireEvent.click(getBear(SMALL_BLUE));
    advance(IDLE_NUDGE_MS - 1);
    fireEvent.click(getBox(LEFT_BOX));
    advance(IDLE_NUDGE_MS - 1);
    expect(audio.playClips).not.toHaveBeenCalled();

    fireEvent.click(getMascot());
    expect(audio.playClips).toHaveBeenCalledOnce();
    advance(IDLE_NUDGE_MS - 1);
    expect(audio.playClips).toHaveBeenCalledOnce();
    advance(1);
    expect(audio.playClips).toHaveBeenCalledTimes(2);
  });

  it('se tait après trois rappels sans geste, et reprend au geste suivant', () => {
    renderBoard();
    audio.playClips.mockClear();

    advance(IDLE_NUDGE_MS * MAX_NUDGES);
    expect(MAX_NUDGES).toBe(3);
    expect(audio.playClips).toHaveBeenCalledTimes(MAX_NUDGES);

    advance(IDLE_NUDGE_MS * 5);
    expect(audio.playClips).toHaveBeenCalledTimes(MAX_NUDGES);
    expect(getRulePicture()).not.toHaveAttribute('data-pulsing');
    expect(getReserve().querySelector('[data-wiggling]')).toBeNull();

    fireEvent.click(getBear(SMALL_BLUE));
    advance(IDLE_NUDGE_MS);
    expect(audio.playClips).toHaveBeenCalledTimes(MAX_NUDGES + 1);
  });

  it('attend que l’ours tenu soit lâché, et s’arrête de remuer au premier geste', () => {
    mockLayout();
    renderBoard();
    advance(IDLE_NUDGE_MS);
    audio.playClips.mockClear();
    expect(getBear(SMALL_BLUE)).toHaveAttribute('data-wiggling', 'true');

    const bear = getBear(BIG_BLUE);
    fireEvent.pointerDown(bear, { ...ORIGIN, ...POINTER });
    fireEvent.pointerMove(bear, { clientX: 100, clientY: 75, ...POINTER });
    expect(getBear(SMALL_BLUE)).not.toHaveAttribute('data-wiggling');

    advance(IDLE_NUDGE_MS * 2);
    expect(audio.playClips).not.toHaveBeenCalled();

    fireEvent.pointerUp(bear, { clientX: 200, clientY: 300, ...POINTER });
    advance(IDLE_NUDGE_MS);
    expect(audio.playClips).toHaveBeenCalledOnce();
  });

  it('se tait pendant le panneau STOP et après la victoire', async () => {
    renderBoard({ config: COLOR_THEN_SIZE });
    tapBearThenBox(SMALL_BLUE, LEFT_BOX);
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);
    await advanceAsync(STOP_MIN_WAIT_MS);
    audio.playClips.mockClear();

    await advanceAsync(IDLE_NUDGE_MS);
    expect(audio.playClips).not.toHaveBeenCalledWith(clips('rule-color'));
    expect(audio.playClips).not.toHaveBeenCalledWith(clips('rule-size'));

    continueAndWin();
    audio.playClips.mockClear();
    advance(IDLE_NUDGE_MS);
    expect(audio.playClips).not.toHaveBeenCalled();
  });
});

describe('Panneau STOP', () => {
  it('gèle le plateau et impose l’attente : rien ne marche, sauf Retour', () => {
    mockLayout();
    forceTvMode();
    const controls = renderBoard({ config: COLOR_THEN_SIZE });
    // Par couleur : petit bleu à gauche, deux rebonds du grand bleu à droite, puis à gauche : STOP.
    press('ArrowLeft');
    press('ArrowRight');
    press('ArrowRight');
    audio.playClips.mockClear();
    press('ArrowLeft');

    expect(queryStopOverlay()).not.toBeNull();
    expect(audio.playEffect).toHaveBeenLastCalledWith('stop');
    // Pendant l'attente, la voix met seulement en garde : la nouvelle règle est dite au redémarrage.
    expect(audio.playClips).toHaveBeenCalledExactlyOnceWith(clips('stop-warning'));
    expect(getStatus()).toHaveTextContent(`Stop ! ${SIZE_RULE}`);

    const sign = getStopSign();
    expect(sign).toHaveAttribute('aria-disabled', 'true');
    expect(sign).toHaveFocus();
    expect(sign).toHaveAttribute('data-focused', 'true');
    expect(getFocusedBear()).toBeNull();
    expect(within(queryStopOverlay() as HTMLElement).getByRole('img')).toHaveAccessibleName(
      SIZE_RULE,
    );
    expect(sign.closest('[data-stop-overlay]')?.previousElementSibling).toHaveAttribute('inert');

    // Ni tap, ni OK, ni flèche, ni glissement, ni la boîte, ni la mascotte.
    const bearsBefore = getBears().length;
    fireEvent.click(sign);
    press('Enter');
    press('ArrowLeft');
    fireEvent.click(getBox(LEFT_BOX));
    dragBear(getBear(BIG_YELLOW), { x: 350, y: 50 });
    fireEvent.click(getBear(BIG_YELLOW));
    fireEvent.click(getMascot());
    expect(queryStopOverlay()).not.toBeNull();
    expect(getBears()).toHaveLength(bearsBefore);
    expect(getBear(BIG_YELLOW)).toHaveAttribute('aria-pressed', 'false');
    expect(audio.playClips).toHaveBeenCalledOnce();

    expect(press('Backspace')).toBe(true);
    expect(controls.exitToMap).toHaveBeenCalledOnce();
  });

  it('ne s’active qu’à 5 s, même si la voix a fini avant', async () => {
    renderBoard({ config: COLOR_THEN_SIZE });
    tapBearThenBox(SMALL_BLUE, LEFT_BOX);
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);

    await advanceAsync(STOP_MIN_WAIT_MS - 1);
    expect(getStopSign()).toHaveAttribute('aria-disabled', 'true');
    expect(getStopSign()).not.toHaveAttribute('data-active');

    await advanceAsync(1);
    expect(getStopSign()).toHaveAttribute('aria-disabled', 'false');
    expect(getStopSign()).toHaveAttribute('data-active', 'true');
    expect(getStopSign().querySelector('svg')).toHaveAttribute('data-pulsing', 'true');
  });

  it('attend la fin de la voix si elle dure plus de 5 s', async () => {
    renderBoard({ config: COLOR_THEN_SIZE });
    const voice = deferred();
    audio.playClips.mockImplementationOnce(() => voice.promise);
    tapBearThenBox(SMALL_BLUE, LEFT_BOX);
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);

    await advanceAsync(STOP_MIN_WAIT_MS * 2);
    expect(getStopSign()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(getStopSign());
    expect(queryStopOverlay()).not.toBeNull();

    await voice.resolve();
    expect(getStopSign()).toHaveAttribute('aria-disabled', 'false');
  });

  it('continue au tap : le jeu repart et la voix dit la nouvelle règle, une seule fois', async () => {
    renderBoard({ config: COLOR_THEN_SIZE });
    tapBearThenBox(SMALL_BLUE, LEFT_BOX);
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);
    await advanceAsync(STOP_MIN_WAIT_MS);
    audio.playClips.mockClear();

    fireEvent.click(getStopSign());

    expect(queryStopOverlay()).toBeNull();
    expect(audio.playClips).toHaveBeenCalledExactlyOnceWith(clips('rule-size'));
    expect(getStatus()).toHaveTextContent(SIZE_RULE);
    expect(getMascot()).toHaveAttribute('data-mood', 'talking');
    await advanceAsync(MIN_MIME_MS);
    expect(audio.playClips).toHaveBeenCalledOnce();
    expect(getMascot()).toHaveAttribute('data-mood', 'idle');

    expect(within(getRulePicture() as HTMLElement).getByRole('img')).toHaveAccessibleName(
      SIZE_RULE,
    );
    // L'ours resté et les trois nouveaux ; les boîtes sont vidées.
    expect(getBears()).toHaveLength(4);
    expect(getPlacedBears(getBox(LEFT_BOX))).toHaveLength(0);
    expect(getPlacedBears(getBox(RIGHT_BOX))).toHaveLength(0);
  });

  it('continue avec OK à la télécommande, et rend le curseur au premier ours', async () => {
    forceTvMode();
    renderBoard({ config: COLOR_THEN_SIZE });
    press('ArrowLeft');
    press('ArrowRight');
    press('ArrowLeft');
    expect(queryStopOverlay()).not.toBeNull();

    expect(press('Enter')).toBe(true);
    expect(queryStopOverlay()).not.toBeNull();

    await advanceAsync(STOP_MIN_WAIT_MS);
    expect(press('Enter')).toBe(true);

    expect(queryStopOverlay()).toBeNull();
    expect(getFocusedBear()).toBe(getBears()[0]);
    expect(getBears()[0]).toHaveFocus();
  });

  it('rappelle toutes les 6 s de toucher le panneau, une fois actif seulement', async () => {
    renderBoard({ config: COLOR_THEN_SIZE });
    tapBearThenBox(SMALL_BLUE, LEFT_BOX);
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);
    audio.playClips.mockClear();

    await advanceAsync(STOP_MIN_WAIT_MS);
    await advanceAsync(STOP_NUDGE_MS - 1);
    expect(audio.playClips).not.toHaveBeenCalled();

    await advanceAsync(1);
    expect(audio.playClips).toHaveBeenCalledExactlyOnceWith(clips('stop-go'));

    await advanceAsync(STOP_NUDGE_MS);
    expect(audio.playClips).toHaveBeenCalledTimes(2);
    expect(lastVoice()).toEqual(clips('stop-go'));

    fireEvent.click(getStopSign());
    audio.playClips.mockClear();
    await advanceAsync(STOP_NUDGE_MS);
    expect(audio.playClips).not.toHaveBeenCalled();
  });

  it('se tait après trois rappels, et le panneau reste actif', async () => {
    renderBoard({ config: COLOR_THEN_SIZE });
    tapBearThenBox(SMALL_BLUE, LEFT_BOX);
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);
    audio.playClips.mockClear();

    await advanceAsync(STOP_MIN_WAIT_MS);
    await advanceAsync(STOP_NUDGE_MS * (MAX_NUDGES + 3));

    expect(audio.playClips).toHaveBeenCalledTimes(MAX_NUDGES);
    expect(getStopSign()).toHaveAttribute('data-active', 'true');

    fireEvent.click(getStopSign());
    expect(queryStopOverlay()).toBeNull();
    expect(lastVoice()).toEqual(clips('rule-size'));
  });

  it('n’empile pas les minuteurs sous StrictMode', async () => {
    renderBoard({ config: COLOR_THEN_SIZE, strict: true });
    tapBearThenBox(SMALL_BLUE, LEFT_BOX);
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);
    expect(audio.playEffect).toHaveBeenLastCalledWith('stop');
    audio.playClips.mockClear();

    await advanceAsync(STOP_MIN_WAIT_MS);
    await advanceAsync(STOP_NUDGE_MS);

    expect(audio.playClips).toHaveBeenCalledExactlyOnceWith(clips('stop-go'));
  });

  it('annonce une règle « sauf » au redémarrage, la mascotte disant non', async () => {
    renderBoard({ config: COLOR_THEN_EXCEPT });
    tapBearThenBox(SMALL_BLUE, LEFT_BOX);
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);
    expect(lastVoice()).toEqual(clips('stop-warning'));
    expect(getMascot()).toHaveAttribute('data-mood', 'happy');
    advance(700);
    expect(getMascot()).toHaveAttribute('data-mood', 'talking');

    await passStop();

    expect(lastVoice()).toEqual(clips('rule-except-blue'));
    expect(getMascot()).toHaveAttribute('data-mood', 'no');
  });
});

describe('Fin d’une règle « sauf »', () => {
  it('s’achève d’elle-même quand il ne reste que des ours interdits', async () => {
    const controls = renderBoard({ config: COLOR_THEN_EXCEPT });
    tapBearThenBox(SMALL_BLUE, LEFT_BOX);
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);
    await passStop();
    expect(getBox(OPEN_BOX)).toBeInTheDocument();
    // Restent le grand bleu, le nouveau petit bleu (interdits) et le petit jaune (permis).
    expect(getBears()).toHaveLength(3);

    tapBearThenBox(SMALL_YELLOW, OPEN_BOX);

    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 3,
      timeSeconds: 5,
      isPerfect: true,
    });
    expect(audio.playEffect).toHaveBeenLastCalledWith('victory');
    // Les ours interdits restent à leur place, et rien ne les pousse plus.
    expect(getBears()).toHaveLength(2);
    fireEvent.click(getBox(OPEN_BOX));
    advance(END_SCREEN_DELAY_MS);
    expect(screen.getByRole('dialog', { name: 'Étoile #1 gagnée' })).toBeInTheDocument();
    expect(getBears()).toHaveLength(2);
    expect(controls.recordVictory).toHaveBeenCalledOnce();
  });
});

describe('Télécommande', () => {
  it('cible le premier ours d’emblée, l’anneau restant réservé au D-Pad', () => {
    forceTvMode();
    renderBoard();

    const first = getBears()[0];
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('data-focused', 'true');
    expect(first).toHaveClass('ring-sky-400');
    expect(getBears().filter((bear) => bear.hasAttribute('data-focused'))).toHaveLength(1);
  });

  it('ne montre ni anneau ni flèches au doigt', () => {
    renderBoard();

    expect(getFocusedBear()).toBeNull();
    expect(document.querySelector('[data-remote-arrow]')).toBeNull();
  });

  it('range l’ours courant à gauche ou à droite, puis passe au suivant', () => {
    forceTvMode();
    renderBoard();

    expect(press('ArrowLeft')).toBe(true);
    expect(queryBear(SMALL_BLUE)).toBeNull();
    expect(getPlacedBears(getBox(LEFT_BOX))).toHaveLength(1);
    expect(audio.playEffect).toHaveBeenLastCalledWith('success');
    expect(getFocusedBear()).toBe(getBear(BIG_BLUE));
    expect(getBear(BIG_BLUE)).toHaveFocus();

    press('ArrowLeft');
    expect(getFocusedBear()).toBe(getBear(BIG_YELLOW));
    press('ArrowRight');
    expect(getBears()).toHaveLength(0);
    expect(getPlacedBears(getBox(RIGHT_BOX))).toHaveLength(1);
  });

  it('garde l’ours courant après un rebond', () => {
    forceTvMode();
    renderBoard();

    press('ArrowRight');

    expect(audio.playEffect).toHaveBeenLastCalledWith('bounce');
    expect(getFocusedBear()).toBe(getBear(SMALL_BLUE));
    expect(getBear(SMALL_BLUE)).toHaveFocus();
    expect(getBears()).toHaveLength(3);
  });

  it('ne fait rien avec Haut et Bas en phase de tri', () => {
    forceTvMode();
    renderBoard();

    expect(press('ArrowUp')).toBe(true);
    press('ArrowDown');

    expect(getBears()).toHaveLength(3);
    expect(getFocusedBear()).toBe(getBear(SMALL_BLUE));
    expect(audio.playEffect).not.toHaveBeenCalled();
  });

  it('ne range qu’un ours par appui : une flèche maintenue ne se répète pas', () => {
    forceTvMode();
    renderBoard();

    press('ArrowLeft');
    press('ArrowLeft', { repeat: true });
    press('ArrowLeft', { repeat: true });

    expect(getBears()).toHaveLength(2);
    expect(audio.playEffect).toHaveBeenCalledOnce();

    press('ArrowLeft');
    expect(getBears()).toHaveLength(1);
  });

  it('en règle « sauf », Haut range et les autres flèches laissent l’ours', () => {
    forceTvMode();
    renderBoard({ config: EXCEPT_BLUE });
    expect(getFocusedBear()).toBe(getBear(SMALL_BLUE));

    press('ArrowRight');
    expect(getFocusedBear()).toBe(getBear(SMALL_YELLOW));
    expect(getBear(SMALL_YELLOW)).toHaveFocus();
    press('ArrowDown');
    expect(getFocusedBear()).toBe(getBear(BIG_YELLOW));
    press('ArrowLeft');
    expect(getFocusedBear()).toBe(getBear(SMALL_BLUE));
    expect(audio.playEffect).not.toHaveBeenCalled();
    expect(getBears()).toHaveLength(3);

    // Haut sur l'ours interdit : il rebondit et reste ciblé.
    press('ArrowUp');
    expect(audio.playEffect).toHaveBeenLastCalledWith('bounce');
    expect(getFocusedBear()).toBe(getBear(SMALL_BLUE));

    press('ArrowDown');
    press('ArrowUp');
    expect(audio.playEffect).toHaveBeenLastCalledWith('success');
    expect(queryBear(SMALL_YELLOW)).toBeNull();
    expect(getPlacedBears(getBox(OPEN_BOX))).toHaveLength(1);
    expect(getFocusedBear()).toBe(getBear(BIG_YELLOW));
  });

  it('ne range pas l’ours tenu au doigt avec une flèche', () => {
    mockLayout();
    forceTvMode();
    renderBoard();
    const bear = getBear(SMALL_BLUE);

    fireEvent.pointerDown(bear, { ...ORIGIN, ...POINTER });
    fireEvent.pointerMove(bear, { clientX: 200, clientY: 300, ...POINTER });
    press('ArrowLeft');
    expect(queryBear(SMALL_BLUE)).toBe(bear);

    fireEvent.pointerUp(bear, { clientX: 50, clientY: 50, ...POINTER });
    expect(queryBear(SMALL_BLUE)).toBeNull();
  });

  it('laisser un ours ne compte pas et relance l’inaction', () => {
    forceTvMode();
    renderBoard({ config: EXCEPT_BLUE });
    audio.playClips.mockClear();

    advance(IDLE_NUDGE_MS - 1);
    press('ArrowDown');
    advance(IDLE_NUDGE_MS - 1);
    expect(audio.playClips).not.toHaveBeenCalled();
  });

  it('rejoue la règle avec OK pendant la partie, et l’ignore ensuite', () => {
    forceTvMode();
    renderBoard();
    audio.playClips.mockClear();

    expect(press('Enter')).toBe(true);
    expect(audio.playClips).toHaveBeenCalledExactlyOnceWith(clips('rule-color'));
    expect(getStatus()).toHaveTextContent(COLOR_RULE);

    press('ArrowLeft');
    press('ArrowLeft');
    press('ArrowRight');
    audio.playClips.mockClear();
    expect(press('Enter')).toBe(true);
    expect(audio.playClips).not.toHaveBeenCalled();
  });

  it('revient à la carte avec Retour', () => {
    forceTvMode();
    const controls = renderBoard();

    expect(press('Backspace')).toBe(true);
    expect(controls.exitToMap).toHaveBeenCalledOnce();
    expect(press('Escape')).toBe(true);
    expect(controls.exitToMap).toHaveBeenCalledTimes(2);
  });

  it('montre des flèches sur les boîtes, sans aucun texte', () => {
    forceTvMode();
    renderBoard();

    expect(getBox(LEFT_BOX).querySelector('[data-remote-arrow="left"]')).not.toBeNull();
    expect(getBox(RIGHT_BOX).querySelector('[data-remote-arrow="right"]')).not.toBeNull();
    expect(document.querySelector('[data-skip-hint]')).toBeNull();
    expect(getVisibleText(document.body)).toBe('');
  });

  it('montre la flèche Haut et l’icône « laisser » en règle « sauf »', () => {
    forceTvMode();
    renderBoard({ config: EXCEPT_BLUE });

    expect(getBox(OPEN_BOX).querySelector('[data-remote-arrow="open"]')).not.toBeNull();
    expect(getReserve().querySelector('[data-skip-hint]')).not.toBeNull();
    expect(getVisibleText(document.body)).toBe('');
  });

  it('après le tactile, le premier appui révèle le curseur sans ranger d’ours', () => {
    renderBoard();

    expect(press('ArrowLeft')).toBe(true);

    expect(getBears()).toHaveLength(3);
    expect(getFocusedBear()).toBe(getBear(SMALL_BLUE));
    expect(getBear(SMALL_BLUE)).toHaveFocus();
    expect(getBox(LEFT_BOX).querySelector('[data-remote-arrow="left"]')).not.toBeNull();

    press('ArrowLeft');
    expect(getBears()).toHaveLength(2);
  });

  it('agit dès le premier appui si l’ours a déjà le focus DOM, et le prend pour curseur', () => {
    renderBoard();
    act(() => {
      getBear(BIG_YELLOW).focus();
    });

    press('ArrowRight');

    expect(queryBear(BIG_YELLOW)).toBeNull();
    expect(getFocusedBear()).toBe(getBear(SMALL_BLUE));
  });

  it('dépose l’ours du curseur sur une boîte atteinte au Tab', () => {
    forceTvMode();
    renderBoard();

    act(() => {
      getBox(LEFT_BOX).focus();
    });
    expect(press('Enter')).toBe(false);
    fireEvent.click(getBox(LEFT_BOX));

    expect(queryBear(SMALL_BLUE)).toBeNull();
    expect(getFocusedBear()).toBe(getBear(BIG_BLUE));
  });

  it('active le bouton Retour atteint au Tab, et une flèche ramène au plateau', () => {
    forceTvMode();
    const controls = renderBoard();
    const back = screen.getByRole('button', { name: 'Retour' });

    act(() => {
      back.focus();
    });
    expect(back).toHaveAttribute('data-focused', 'true');
    expect(getFocusedBear()).toBeNull();

    press('ArrowDown');
    expect(back).not.toHaveAttribute('data-focused');
    expect(getFocusedBear()).toBe(getBear(SMALL_BLUE));
    expect(getBear(SMALL_BLUE)).toHaveFocus();

    act(() => {
      back.focus();
    });
    expect(press('Enter')).toBe(true);
    expect(controls.exitToMap).toHaveBeenCalledOnce();

    expect(press('Escape')).toBe(true);
    expect(controls.exitToMap).toHaveBeenCalledTimes(2);

    // Tab vers la mascotte : le plateau reprend les touches.
    act(() => {
      getMascot().focus();
    });
    expect(back).not.toHaveAttribute('data-focused');
    expect(getFocusedBear()).toBe(getBear(SMALL_BLUE));
  });
});

describe('Fin de partie', () => {
  /** Range les trois ours de `COLOR_ONLY`, sans erreur. */
  function winPerfectly(): void {
    tapBearThenBox(SMALL_BLUE, LEFT_BOX);
    tapBearThenBox(BIG_BLUE, LEFT_BOX);
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);
  }

  function getDialog(): HTMLElement {
    return screen.getByRole('dialog', { name: 'Étoile #1 gagnée' });
  }

  it('enregistre la victoire une fois, joue son son et la voix, puis ouvre l’écran de fin', () => {
    const controls = renderBoard();
    advance(10_000);
    audio.playClips.mockClear();
    audio.playEffect.mockClear();

    winPerfectly();

    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 3,
      timeSeconds: 10,
      isPerfect: true,
    });
    expect(audio.playEffect).toHaveBeenLastCalledWith('victory');
    expect(audio.playEffect).not.toHaveBeenCalledWith('bounce');
    expect(lastVoice()).toEqual(clips('star-won', 'crown-won'));

    advance(END_SCREEN_DELAY_MS - 1);
    expect(screen.queryByRole('dialog')).toBeNull();
    advance(1);
    expect(getDialog()).toBeInTheDocument();
    expect(controls.recordVictory).toHaveBeenCalledOnce();
  });

  it('n’enregistre qu’une fois sous StrictMode, sans doubler sons ni écran', () => {
    const controls = renderBoard({ strict: true });
    audio.playClips.mockClear();
    audio.playEffect.mockClear();

    winPerfectly();

    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 3,
      timeSeconds: 0,
      isPerfect: true,
    });
    expect(audio.playEffect.mock.calls.filter(([effect]) => effect === 'victory')).toHaveLength(1);
    expect(audio.playClips).toHaveBeenCalledOnce();

    advance(END_SCREEN_DELAY_MS * 2);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(controls.recordVictory).toHaveBeenCalledOnce();
  });

  it('couronne une partie sans rebond, et la montre sans aucun texte', () => {
    renderBoard();

    winPerfectly();
    advance(END_SCREEN_DELAY_MS);

    const dialog = getDialog();
    expect(dialog.querySelector('[data-star-award]')).toHaveAttribute('data-crown', 'true');
    expect(getVisibleText(document.body)).toBe('');
    expect(within(dialog).getByRole('heading', { level: 2 }).parentElement).toHaveClass('sr-only');
  });

  it('ne couronne pas après un rebond, et n’en parle jamais', () => {
    const controls = renderBoard();

    tapBearThenBox(SMALL_BLUE, RIGHT_BOX);
    fireEvent.click(getBox(LEFT_BOX));
    tapBearThenBox(BIG_BLUE, LEFT_BOX);
    audio.playClips.mockClear();
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);
    advance(END_SCREEN_DELAY_MS);

    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 4,
      timeSeconds: 0,
      isPerfect: false,
    });
    expect(audio.playClips).toHaveBeenCalledExactlyOnceWith(clips('star-won'));
    const dialog = getDialog();
    expect(dialog.querySelector('[data-star-award]')).not.toHaveAttribute('data-crown');
    expect(getVisibleText(dialog)).toBe('');
    expect(dialog).not.toHaveAttribute('aria-describedby');
    expect(dialog.textContent).not.toMatch(/couronne|coup|erreur|rejoue pour/i);
  });

  it('garde la couronne déjà gagnée, même après une partie avec rebond', () => {
    renderBoard({ profile: crownedPlayer() });

    tapBearThenBox(SMALL_BLUE, RIGHT_BOX);
    fireEvent.click(getBox(LEFT_BOX));
    tapBearThenBox(BIG_BLUE, LEFT_BOX);
    tapBearThenBox(BIG_YELLOW, RIGHT_BOX);
    advance(END_SCREEN_DELAY_MS);

    expect(getDialog().querySelector('[data-star-award]')).toHaveAttribute('data-crown', 'true');
  });

  it('propose étoile suivante, rejouer et carte, en boutons-icônes', () => {
    const controls = renderBoard();
    winPerfectly();
    advance(END_SCREEN_DELAY_MS);

    const buttons = within(getDialog()).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Étoile suivante',
      'Rejouer',
      'Carte des étoiles',
    ]);
    for (const button of buttons) {
      expect(button.textContent).toBe('');
      expect(button.querySelector('svg')).not.toBeNull();
      expect(button).toHaveClass('min-h-20', 'min-w-20');
    }
    expect(buttons[0]).toHaveClass('bg-sky-400');

    fireEvent.click(within(getDialog()).getByRole('button', { name: 'Étoile suivante' }));
    expect(controls.playLevel).toHaveBeenCalledExactlyOnceWith('bs-002');
    fireEvent.click(within(getDialog()).getByRole('button', { name: 'Carte des étoiles' }));
    expect(controls.exitToMap).toHaveBeenCalledOnce();
  });

  it('ne propose pas d’étoile suivante après la dernière étoile', () => {
    renderBoard({ levelIndex: 1, config: COLOR_ONLY });
    winPerfectly();
    advance(END_SCREEN_DELAY_MS);

    const dialog = screen.getByRole('dialog', { name: 'Étoile #2 gagnée' });
    expect(within(dialog).queryByRole('button', { name: 'Étoile suivante' })).toBeNull();
    expect(within(dialog).getAllByRole('button')[0]).toHaveAccessibleName('Rejouer');
  });

  it('se pilote à la télécommande : curseur sur la première action, Retour vers la carte', () => {
    forceTvMode();
    const controls = renderBoard();
    press('ArrowLeft');
    press('ArrowLeft');
    press('ArrowRight');
    advance(END_SCREEN_DELAY_MS);

    const next = within(getDialog()).getByRole('button', { name: 'Étoile suivante' });
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute('data-focused', 'true');

    press('ArrowRight');
    expect(within(getDialog()).getByRole('button', { name: 'Rejouer' })).toHaveFocus();
    press('ArrowLeft');
    expect(press('Enter')).toBe(true);
    expect(controls.playLevel).toHaveBeenCalledExactlyOnceWith('bs-002');

    expect(press('Backspace')).toBe(true);
    expect(controls.exitToMap).toHaveBeenCalledOnce();
  });

  it('rejoue une nouvelle partie, et annonce de nouveau la règle', async () => {
    const controls = renderBoard();
    winPerfectly();
    advance(END_SCREEN_DELAY_MS);
    audio.playClips.mockClear();
    audio.preloadClips.mockClear();
    audio.stopClips.mockClear();

    fireEvent.click(within(getDialog()).getByRole('button', { name: 'Rejouer' }));
    expect(audio.stopClips).toHaveBeenCalledOnce();
    await advanceAsync(1000);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getBears()).toHaveLength(3);
    expect(getPlacedBears(getBox(LEFT_BOX))).toHaveLength(0);
    expect(audio.preloadClips).toHaveBeenCalledOnce();
    expect(audio.playClips).toHaveBeenCalledExactlyOnceWith(clips('rule-color'));

    // Le temps repart de zéro, et une seconde victoire s'enregistre.
    advance(4000);
    winPerfectly();
    expect(controls.recordVictory).toHaveBeenCalledTimes(2);
    expect(controls.recordVictory).toHaveBeenLastCalledWith({
      moves: 3,
      timeSeconds: 5,
      isPerfect: true,
    });
  });

  it('ramène le curseur sur le premier ours après « Rejouer » à la télécommande', async () => {
    forceTvMode();
    renderBoard();
    press('ArrowLeft');
    press('ArrowLeft');
    press('ArrowRight');
    advance(END_SCREEN_DELAY_MS);

    press('ArrowRight');
    press('Enter');
    await advanceAsync(1000);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getFocusedBear()).toBe(getBear(SMALL_BLUE));
    expect(getBear(SMALL_BLUE)).toHaveFocus();
  });
});

describe('Geste de la première étoile', () => {
  const WITH_GESTURE: BearSortLevelConfig = { ...COLOR_ONLY, showGestureHint: true };

  function queryHand(): Element | null {
    return document.querySelector('[data-gesture-hand]');
  }

  it('montre la main quand les éléments sont mesurés, à la place de rien dans jsdom', () => {
    renderBoard({ config: WITH_GESTURE });
    advance(16);
    expect(queryHand()).toBeNull();
  });

  it('ne montre pas la main sur une autre étoile', () => {
    mockLayout();
    renderBoard();
    advance(16);
    expect(queryHand()).toBeNull();
  });

  it('montre la main jusqu’au premier geste, et la cache pendant une sélection', () => {
    mockLayout();
    renderBoard({ config: WITH_GESTURE });
    advance(16);
    expect(queryHand()).not.toBeNull();

    fireEvent.click(getBear(SMALL_BLUE));
    expect(queryHand()).toBeNull();

    fireEvent.click(getBox(LEFT_BOX));
    advance(16);
    expect(queryHand()).toBeNull();
  });

  it('garde la main après un rebond : seul un ours rangé la retire', () => {
    mockLayout();
    renderBoard({ config: WITH_GESTURE });
    advance(16);

    // Le petit bleu lâché sur la boîte jaune : il rebondit, l'enfant a encore besoin du geste.
    dragBear(getBear(SMALL_BLUE), { x: 350, y: 50 });
    advance(16);
    expect(queryHand()).not.toBeNull();

    dragBear(getBear(SMALL_BLUE), { x: 50, y: 50 });
    advance(16);
    expect(queryHand()).toBeNull();
  });

  it('garde la flèche de la bonne boîte après un rebond, au D-Pad', () => {
    mockLayout();
    forceTvMode();
    renderBoard({ config: WITH_GESTURE });
    advance(16);

    press('ArrowRight');
    expect(getBox(LEFT_BOX).querySelector('[data-gesture-arrow]')).not.toBeNull();
  });

  it('cache la main pendant un glissement, et la remontre si l’ours est rendu sans dépôt', () => {
    mockLayout();
    renderBoard({ config: WITH_GESTURE });
    advance(16);

    const bear = getBear(SMALL_BLUE);
    fireEvent.pointerDown(bear, { ...ORIGIN, ...POINTER });
    fireEvent.pointerMove(bear, { clientX: 200, clientY: 300, ...POINTER });
    expect(queryHand()).toBeNull();

    fireEvent.pointerUp(bear, { clientX: 200, clientY: 300, ...POINTER });
    advance(16);
    expect(queryHand()).not.toBeNull();
  });

  it('remesure la main quand l’écran tourne, et la retire si la mesure échoue', () => {
    const measure = mockLayout();
    renderBoard({ config: WITH_GESTURE });
    advance(16);
    expect(queryHand()).not.toBeNull();

    measure.mockReturnValue(new DOMRect(0, 0, 0, 0));
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(queryHand()).toBeNull();
  });

  it('part du centre de l’ours', () => {
    mockLayout();
    renderBoard({ config: WITH_GESTURE });
    advance(16);

    // Animations coupées dans les tests : la main reste à son point de départ.
    expect(queryHand()).toHaveStyle({ transform: 'translateX(175px) translateY(425px)' });
  });

  it('remplace la main par une flèche sur la boîte visée, au D-Pad', () => {
    mockLayout();
    forceTvMode();
    renderBoard({ config: WITH_GESTURE });
    advance(16);

    expect(queryHand()).toBeNull();
    expect(getBox(LEFT_BOX).querySelector('[data-gesture-arrow]')).not.toBeNull();
    expect(getBox(RIGHT_BOX).querySelector('[data-gesture-arrow]')).toBeNull();

    press('ArrowLeft');
    expect(document.querySelector('[data-gesture-arrow]')).toBeNull();
  });

  it('vise un ours permis quand le premier est interdit', () => {
    mockLayout();
    forceTvMode();
    renderBoard({ config: { ...EXCEPT_BLUE, showGestureHint: true } });

    expect(getBox(OPEN_BOX).querySelector('[data-gesture-arrow]')).not.toBeNull();
  });
});

describe('Humeur de la mascotte', () => {
  it('parle au moins 2 s même son coupé, puis se repose', async () => {
    renderBoard();
    expect(getMascot()).toHaveAttribute('data-mood', 'talking');

    await advanceAsync(MIN_MIME_MS - 1);
    expect(getMascot()).toHaveAttribute('data-mood', 'talking');

    await advanceAsync(1);
    expect(getMascot()).toHaveAttribute('data-mood', 'idle');
  });

  it('parle jusqu’à la fin de la voix quand elle dure plus de 2 s', async () => {
    const voice = deferred();
    audio.playClips.mockImplementationOnce(() => voice.promise);
    renderBoard();

    await advanceAsync(MIN_MIME_MS * 3);
    expect(getMascot()).toHaveAttribute('data-mood', 'talking');

    await voice.resolve();
    expect(getMascot()).toHaveAttribute('data-mood', 'idle');
  });

  it('dit non en annonçant une règle « sauf », et parle simplement pour le reste', async () => {
    renderBoard({ config: EXCEPT_BLUE });
    expect(getMascot()).toHaveAttribute('data-mood', 'no');
    await advanceAsync(MIN_MIME_MS);
    expect(getMascot()).toHaveAttribute('data-mood', 'idle');

    await advanceAsync(IDLE_NUDGE_MS - MIN_MIME_MS);
    expect(lastVoice()).toEqual(clips('nudge-more'));
    expect(getMascot()).toHaveAttribute('data-mood', 'talking');
  });

  it('ne dit pas non après un rebond, même en rappelant une règle « sauf »', async () => {
    renderBoard({ config: EXCEPT_BLUE });
    await advanceAsync(MIN_MIME_MS);

    tapBearThenBox(SMALL_BLUE, OPEN_BOX);
    expect(lastVoice()).toEqual(clips('rule-except-blue'));
    expect(getMascot()).toHaveAttribute('data-mood', 'talking');

    fireEvent.click(getBox(OPEN_BOX));
    expect(lastVoice()).toEqual(clips('hint-look', 'rule-except-blue'));
    expect(getMascot()).toHaveAttribute('data-mood', 'talking');

    // La règle demandée en touchant la mascotte n'est pas un reproche : elle redit non.
    fireEvent.click(getMascot());
    expect(lastVoice()).toEqual(clips('rule-except-blue'));
    expect(getMascot()).toHaveAttribute('data-mood', 'no');
  });

  it('est contente 700 ms après un ours bien rangé, puis retrouve son repos', async () => {
    renderBoard();
    await advanceAsync(MIN_MIME_MS);
    expect(getMascot()).toHaveAttribute('data-mood', 'idle');

    tapBearThenBox(SMALL_BLUE, LEFT_BOX);
    expect(getMascot()).toHaveAttribute('data-mood', 'happy');
    expect(getBox(LEFT_BOX)).toHaveAttribute('data-pulsing', 'true');

    advance(699);
    expect(getMascot()).toHaveAttribute('data-mood', 'happy');
    advance(1);
    expect(getMascot()).toHaveAttribute('data-mood', 'idle');
    expect(getBox(LEFT_BOX)).not.toHaveAttribute('data-pulsing');
  });

  it('préfère être contente à parler, et reprend sa parole si elle n’a pas fini', () => {
    const voice = deferred();
    audio.playClips.mockImplementationOnce(() => voice.promise);
    renderBoard();

    tapBearThenBox(SMALL_BLUE, LEFT_BOX);
    expect(getMascot()).toHaveAttribute('data-mood', 'happy');
    advance(700);
    expect(getMascot()).toHaveAttribute('data-mood', 'talking');
  });

  it('ne laisse pas une parole ancienne clore une parole récente', async () => {
    const first = deferred();
    const second = deferred();
    audio.playClips
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    renderBoard();

    await advanceAsync(1000);
    fireEvent.click(getMascot());

    // La première voix est remplacée (promesse résolue), et son mime est largement écoulé.
    await first.resolve();
    await advanceAsync(MIN_MIME_MS);
    expect(getMascot()).toHaveAttribute('data-mood', 'talking');

    await second.resolve();
    expect(getMascot()).toHaveAttribute('data-mood', 'idle');
  });
});
