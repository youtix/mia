import { NavigationProvider } from '@/core/navigation';
import { getGameProgressSummary, type BaseLevelDefinition } from '@/core/progression';
import {
  EXIT_ANIMATION_MS,
  formatCells,
  getBoardLabel,
  getCrownMissedMessage,
  getDirectionLabel,
  getHintMessage,
  getObstacleLabel,
  getVehicleLabel,
  getVehicleName,
  HINT_DURATION_MS,
  HINT_UNAVAILABLE_MESSAGE,
  HINT_WON_MESSAGE,
  parseTrafficJamAscii,
  TrafficJamBoard,
  TrafficJamHud,
  VehiclePiece,
  type TrafficJamLevelConfig,
  type VehicleDef,
} from '@/games/traffic-jam';
import type { UserProfile } from '@/types/mia';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Niveau de base, 2 coups optimaux : la voiture A (verticale, lignes 2 à 3, colonne 4) bloque la
 * sortie du hero (ligne 3, colonnes 1 à 2). Solution : A d'une case vers le haut, hero de 4 cases
 * vers la droite (ou A de 2 cases vers le bas).
 */
const LEVEL = ['......', '...A..', 'HH.A..', '......', '......', '......'];

/** Ligne de sortie libre : 1 coup (étoile suivante du catalogue de test). */
const TRIVIAL = ['......', '......', 'HH....', '......', '......', '......'];

/** Camion horizontal et plot de chantier devant le hero : insoluble. */
const WALLED = ['......', '......', 'HH#...', '......', 'BBB...', '......'];

const CELL_PX = 50;
const CREATED_AT = '2026-10-01T09:00:00.000Z';

function definition(
  id: string,
  order: number,
  config: TrafficJamLevelConfig,
): BaseLevelDefinition<TrafficJamLevelConfig> {
  return { id, gameId: 'traffic-jam', tier: 'very_easy', order, config };
}

/** Léo : Étoile #1 déjà gagnée avec la couronne. */
function crownedPlayer(): UserProfile {
  return {
    id: 'p1',
    name: 'Léo',
    avatarId: 'fox',
    createdAt: CREATED_AT,
    gamesProgress: {
      'traffic-jam': {
        gameId: 'traffic-jam',
        levels: {
          'tj-001': {
            levelId: 'tj-001',
            completed: true,
            isPerfect: true,
            bestMoves: 2,
            bestTimeSeconds: 4,
            timesPlayed: 1,
            completedAt: CREATED_AT,
          },
        },
        lastPlayedLevelId: 'tj-001',
      },
    },
  };
}

interface BoardOptions {
  lines?: string[];
  optimalMoves?: number;
  /** Niveau joué : 0 (Étoile #1, suivie de l'Étoile #2) ou 1 (dernière étoile du catalogue) */
  levelIndex?: number;
  profile?: UserProfile | null;
  /** Rendu sous `<StrictMode>` : rendus et effets doublés, comme en développement */
  strict?: boolean;
}

/** Monte le plateau comme `GameScreen.renderLevel` : niveau du résumé et commandes simulées. */
function renderBoard({
  lines = LEVEL,
  optimalMoves = 2,
  levelIndex = 0,
  profile = null,
  strict = false,
}: BoardOptions = {}) {
  const catalog = [
    definition('tj-001', 10, parseTrafficJamAscii(lines, { optimalMoves })),
    definition('tj-002', 20, parseTrafficJamAscii(TRIVIAL, { optimalMoves: 1 })),
  ];
  const summary = getGameProgressSummary('traffic-jam', catalog, profile);
  const level = summary.allLevels[levelIndex];
  if (!level) throw new Error(`Niveau ${String(levelIndex)} absent du catalogue de test`);
  const controls = {
    summary,
    playLevel: vi.fn(),
    exitToMap: vi.fn(),
    recordVictory: vi.fn(() => Promise.resolve()),
  };
  const board = <TrafficJamBoard level={level} controls={controls} />;
  render(strict ? <StrictMode>{board}</StrictMode> : board, { wrapper: NavigationProvider });
  return controls;
}

/** Mode TV forcé avant le montage : le moteur D-Pad démarre en mode `dpad`. */
function forceTvMode(): void {
  document.documentElement.dataset.tv = 'on';
}

/** Appuie sur une touche (cible : élément focalisé) ; `true` si le moteur D-Pad l'a consommée. */
function press(key: string, times = 1): boolean {
  let consumed = true;
  for (let index = 0; index < times; index += 1) {
    consumed = !fireEvent.keyDown(document.activeElement ?? document.body, { key });
  }
  return consumed;
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

/** jsdom n'a pas de mise en page : le parking mesure `CELL_PX` × 6 de côté. */
function mockParkingSize(): void {
  const size = CELL_PX * 6;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: size,
    bottom: size,
    width: size,
    height: size,
    toJSON: () => ({}),
  });
}

function getBoard(): HTMLElement {
  return screen.getByRole('group', { name: /^Parking/ });
}

function getVehicle(id: string): HTMLElement {
  const vehicle = getBoard().querySelector<HTMLElement>(`[data-vehicle-id="${id}"]`);
  if (!vehicle) throw new Error(`Véhicule « ${id} » absent du parking`);
  return vehicle;
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

function getRemoteHints(): HTMLElement {
  return screen.getByRole('list', { name: 'Commandes de la télécommande' });
}

interface DragOptions {
  pointerId?: number;
  release?: 'pointerUp' | 'pointerCancel';
}

/** Glissement complet d'un véhicule : contact, déplacement, relâchement (même pointeur). */
function drag(
  vehicle: HTMLElement,
  axis: 'x' | 'y',
  distancePx: number,
  { pointerId = 1, release = 'pointerUp' }: DragOptions = {},
): void {
  const origin = { clientX: 100, clientY: 100 };
  const moved =
    axis === 'x'
      ? { ...origin, clientX: origin.clientX + distancePx }
      : { ...origin, clientY: origin.clientY + distancePx };
  fireEvent.pointerDown(vehicle, { ...origin, pointerId, isPrimary: true });
  fireEvent.pointerMove(vehicle, { ...moved, pointerId, isPrimary: true });
  fireEvent[release](vehicle, { ...moved, pointerId, isPrimary: true });
}

const setPointerCapture = vi.fn();

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  // jsdom n'implémente pas la capture du pointeur (FEAT-13 §5).
  Element.prototype.setPointerCapture = setPointerCapture;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
  delete (Element.prototype as Partial<Element>).setPointerCapture;
});

beforeEach(() => {
  vi.useFakeTimers();
  setPointerCapture.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.tv;
});

describe('Rendu du parking', () => {
  it('dessine la grille, la sortie, les obstacles et nomme chaque véhicule', () => {
    renderBoard({
      lines: ['......', '......', 'HH..#.', '......', 'BBBC..', '...C..'],
      optimalMoves: 3,
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Étoile #1' })).toBeInTheDocument();
    expect(getBoard()).toHaveAccessibleName(
      'Parking de 6 × 6 cases, sortie à droite sur la ligne 3',
    );
    expect(screen.getByText('SORTIE')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Plot fixe, ligne 3, colonne 5' })).toBeInTheDocument();

    expect(getVehicle('hero')).toHaveAccessibleName(
      'Ta voiture, horizontale, 2 cases, ligne 3, colonnes 1 à 2',
    );
    expect(getVehicle('hero')).toHaveClass('bg-red-500');
    expect(getVehicle('hero')).toHaveAttribute('data-axis', 'H');
    expect(getVehicle('B')).toHaveAccessibleName(
      'Camion B, horizontal, 3 cases, ligne 5, colonnes 1 à 3',
    );
    expect(getVehicle('C')).toHaveAccessibleName(
      'Voiture C, verticale, 2 cases, lignes 5 à 6, colonne 4',
    );
    expect(getVehicle('C')).toHaveAttribute('data-axis', 'V');
    // jsdom arrondit les pourcentages : ligne 5 → 4 / 6 du parking, 2 cases → 2 / 6.
    expect(getVehicle('C').style.top).toMatch(/^calc\(66\.66\d*% \+ 3px\)$/);
    expect(getVehicle('C').style.height).toMatch(/^calc\(33\.33\d*% - 6px\)$/);

    expect(getHud()).toHaveTextContent('Très Facile');
    expect(getHud()).toHaveTextContent('Coups : 0');
    expect(getHud()).toHaveTextContent('Objectif Parfait : ≤ 3 coups');
    expect(getButton('Annuler')).toHaveAttribute('aria-disabled', 'true');
    expect(getRemoteHints()).toHaveTextContent('Démarrer');
  });

  it('affiche « Couronne déjà gagnée » sur un niveau déjà couronné', () => {
    renderBoard({ profile: crownedPlayer() });

    expect(within(getHud()).getByText('Couronne déjà gagnée')).toBeInTheDocument();
    expect(getHud()).not.toHaveTextContent('Objectif Parfait');
  });

  it('masque l’objectif tant que le nombre optimal de coups est inconnu', () => {
    renderBoard({ optimalMoves: 0 });

    expect(getHud()).not.toHaveTextContent('Objectif Parfait');
  });
});

describe('Partie à la télécommande', () => {
  it('cible le hero, saute de véhicule en véhicule puis le démarre', () => {
    forceTvMode();
    renderBoard();

    expect(getVehicle('hero')).toHaveFocus();
    expect(getVehicle('hero')).toHaveAttribute('data-focused', 'true');
    expect(getVehicle('hero')).not.toHaveAttribute('data-locked');
    expect(within(getVehicle('hero')).getByText('OK : Déplacer')).toBeInTheDocument();

    // Aucun véhicule à gauche ni en dessous du hero : le curseur reste.
    expect(press('ArrowLeft')).toBe(true);
    expect(getVehicle('hero')).toHaveFocus();
    press('ArrowDown');
    expect(getVehicle('hero')).toHaveFocus();

    press('ArrowRight');
    expect(getVehicle('A')).toHaveFocus();
    expect(getVehicle('A')).toHaveAttribute('data-focused', 'true');

    expect(press('Enter')).toBe(true);
    expect(getVehicle('A')).toHaveAttribute('data-locked', 'true');
    expect(getVehicle('A')).toHaveAccessibleName(
      'Voiture A, verticale, 2 cases, lignes 2 à 3, colonne 4, en marche',
    );
    expect(within(getVehicle('A')).queryByText('OK : Déplacer')).toBeNull();
    // Libre d'une case vers le haut et de trois vers le bas : une flèche à chaque bout.
    expect(getVehicle('A').querySelector('[data-arrow="start"]')).not.toBeNull();
    expect(getVehicle('A').querySelector('[data-arrow="end"]')).not.toBeNull();
    expect(getRemoteHints()).toHaveTextContent('Arrêter');
    expect(getRemoteHints()).toHaveTextContent('Avancer / Reculer');
  });

  it('cumule les pas d’une même session en un seul coup et compte un nouveau coup par session', () => {
    forceTvMode();
    renderBoard();

    press('ArrowRight');
    press('Enter');
    press('ArrowDown', 3);
    expect(getHud()).toHaveTextContent('Coups : 1');
    expect(getVehicle('A')).toHaveAccessibleName(/lignes 5 à 6, colonne 4/);
    expect(getVehicle('A').querySelector('[data-arrow="end"]')).toBeNull();

    // Flèche bloquée par le muret, puis flèche hors de l'axe : rien ne bouge.
    press('ArrowDown');
    press('ArrowLeft');
    expect(getHud()).toHaveTextContent('Coups : 1');
    expect(getVehicle('A')).toHaveAccessibleName(/lignes 5 à 6/);

    press('Enter');
    expect(getVehicle('A')).not.toHaveAttribute('data-locked');
    press('Enter');
    press('ArrowUp');
    expect(getHud()).toHaveTextContent('Coups : 2');
    expect(getVehicle('A')).toHaveAccessibleName(/lignes 4 à 5/);
    expect(getButton('Annuler')).not.toHaveAttribute('aria-disabled');
  });

  it('ne fusionne jamais un pas avec le coup d’une session précédente', () => {
    forceTvMode();
    renderBoard();

    // Session 1 : A d'une case vers le bas (coup 1).
    press('ArrowRight');
    press('Enter');
    press('ArrowDown');
    press('Enter');
    expect(getHud()).toHaveTextContent('Coups : 1');

    // Session 2 : un pas en avant puis un pas en arrière (cumul nul : le coup 2 disparaît).
    press('Enter');
    press('ArrowDown');
    expect(getHud()).toHaveTextContent('Coups : 2');
    press('ArrowUp');
    expect(getHud()).toHaveTextContent('Coups : 1');
    expect(getVehicle('A')).toHaveAccessibleName(/lignes 3 à 4/);
    // Le pas suivant ouvre un nouveau coup, sans rejoindre le coup 1.
    press('ArrowDown');
    expect(getHud()).toHaveTextContent('Coups : 2');
    expect(getVehicle('A')).toHaveAccessibleName(/lignes 4 à 5/);

    // Annuler ne recule que d'une case (le coup 1 est intact).
    press('Enter');
    press('ArrowUp');
    expect(getVehicle('hero')).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Annuler')).toHaveFocus();
    press('Enter');
    expect(getHud()).toHaveTextContent('Coups : 1');
    expect(getVehicle('A')).toHaveAccessibleName(/lignes 3 à 4/);
  });

  it('gagne en 3 coups : sortie du hero, enregistrement puis modale sans couronne', () => {
    forceTvMode();
    const controls = renderBoard();

    // Deux sessions d'une case chacune sur A (2 coups), puis le hero sort (3e coup).
    press('ArrowRight');
    press('Enter');
    press('ArrowDown');
    press('Enter');
    press('Enter');
    press('ArrowDown');
    press('Enter');
    press('ArrowLeft');
    expect(getVehicle('hero')).toHaveFocus();
    press('Enter');
    press('ArrowRight', 4);

    expect(getHud()).toHaveTextContent('Coups : 3');
    expect(getVehicle('hero')).toHaveAttribute('data-exiting', 'true');
    expect(getVehicle('hero').style.left).toContain('calc(108.33');
    expect(within(getHud()).getByText('≤ 2 coups')).toHaveClass('line-through');
    expect(getButton('Annuler')).toHaveAttribute('aria-disabled', 'true');
    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 3,
      timeSeconds: 0,
      isPerfect: false,
    });
    // Après la victoire, les flèches et OK n'agissent plus sur le parking.
    press('ArrowRight');
    press('Enter');
    expect(getHud()).toHaveTextContent('Coups : 3');
    expect(screen.queryByRole('dialog')).toBeNull();

    advance(EXIT_ANIMATION_MS);
    const dialog = screen.getByRole('dialog', { name: 'Étoile #1 gagnée !' });
    expect(dialog).toHaveAccessibleDescription('3 coups · optimal 2');
    expect(within(dialog).getByText(getCrownMissedMessage(2, 3))).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Étoile Suivante (#2)', 'Rejouer', 'Carte des Étoiles']);
    const next = within(dialog).getByRole('button', { name: 'Étoile Suivante (#2)' });
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute('data-focused', 'true');

    press('ArrowDown');
    expect(within(dialog).getByRole('button', { name: 'Rejouer' })).toHaveFocus();
    press('ArrowUp');
    expect(press('Enter')).toBe(true);
    expect(controls.playLevel).toHaveBeenCalledExactlyOnceWith('tj-002');
  });

  it('gagne en 2 coups avec la couronne et mesure le temps de jeu', () => {
    forceTvMode();
    const controls = renderBoard();

    press('ArrowRight');
    press('Enter');
    press('ArrowUp');
    press('Enter');
    press('ArrowLeft');
    expect(getVehicle('hero')).toHaveFocus();
    advance(10_000);
    press('Enter');
    press('ArrowRight', 4);

    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 2,
      timeSeconds: 10,
      isPerfect: true,
    });
    advance(EXIT_ANIMATION_MS);
    const dialog = screen.getByRole('dialog', { name: 'Étoile #1 gagnée !' });
    expect(dialog).toHaveAccessibleDescription('2 coups · optimal 2');
    expect(within(dialog).getByText('Parfait ! Couronne gagnée')).toBeInTheDocument();
  });

  it.each([
    [true, 'Parfait !'],
    [false, null],
  ])(
    'tient compte d’une couronne déjà gagnée (victoire parfaite : %s)',
    (isPerfect, crownMessage) => {
      forceTvMode();
      renderBoard({ profile: crownedPlayer() });

      press('ArrowRight');
      press('Enter');
      if (isPerfect) {
        press('ArrowUp');
      } else {
        press('ArrowDown');
        press('Enter');
        press('Enter');
        press('ArrowDown');
      }
      press('Enter');
      press('ArrowLeft');
      press('Enter');
      press('ArrowRight', 4);
      advance(EXIT_ANIMATION_MS);

      const dialog = screen.getByRole('dialog', { name: 'Étoile #1 gagnée !' });
      expect(within(dialog).queryByText(/Couronne/)).toBeNull();
      if (crownMessage) expect(within(dialog).getByText(crownMessage)).toBeInTheDocument();
      else expect(within(dialog).queryByText(/Parfait/)).toBeNull();
    },
  );

  it('coupe le moteur dès le coup gagnant joué en état 2', () => {
    forceTvMode();
    const controls = renderBoard();

    press('ArrowRight');
    press('Enter');
    press('ArrowUp');
    press('Enter');
    press('ArrowLeft');
    press('Enter');
    expect(getVehicle('hero')).toHaveAttribute('data-locked', 'true');
    press('ArrowRight', 4);

    expect(getVehicle('hero')).toHaveAttribute('data-exiting', 'true');
    expect(getVehicle('hero')).not.toHaveAttribute('data-locked');
    expect(getBoard()).not.toHaveAttribute('data-locked');
    expect(getBoard().querySelector('[data-locked]')).toBeNull();
    expect(getRemoteHints()).toHaveTextContent('Démarrer');
    // Pendant la sortie du hero, Retour mène déjà à la Carte des Étoiles, comme depuis la modale.
    expect(press('Backspace')).toBe(true);
    expect(controls.exitToMap).toHaveBeenCalledOnce();
  });

  it('ramène le curseur sur le hero après « Rejouer » depuis la modale', async () => {
    forceTvMode();
    renderBoard();

    press('ArrowRight');
    press('Enter');
    press('ArrowUp');
    press('Enter');
    press('ArrowLeft');
    press('Enter');
    press('ArrowRight', 4);
    advance(EXIT_ANIMATION_MS);

    const dialog = screen.getByRole('dialog', { name: 'Étoile #1 gagnée !' });
    press('ArrowDown');
    expect(within(dialog).getByRole('button', { name: 'Rejouer' })).toHaveFocus();
    press('Enter');
    await advanceAsync(1000);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getHud()).toHaveTextContent('Coups : 0');
    expect(getVehicle('hero')).toHaveAccessibleName(/colonnes 1 à 2/);
    expect(getVehicle('hero')).toHaveFocus();
    expect(getVehicle('hero')).toHaveAttribute('data-focused', 'true');
    expect(getVehicle('hero')).not.toHaveAttribute('data-locked');
  });

  it('ignore pour le hero démarré les flèches hors axe et la flèche bloquée par le muret', () => {
    forceTvMode();
    renderBoard();

    press('Enter');
    press('ArrowUp');
    press('ArrowDown');
    press('ArrowLeft');
    expect(getHud()).toHaveTextContent('Coups : 0');
    expect(getVehicle('hero').querySelector('[data-arrow="start"]')).toBeNull();
    expect(getVehicle('hero').querySelector('[data-arrow="end"]')).not.toBeNull();

    press('ArrowRight');
    expect(getHud()).toHaveTextContent('Coups : 1');
    expect(getVehicle('hero')).toHaveAccessibleName(/colonnes 2 à 3/);
    // Bloqué par la voiture A : plus aucune extrémité libre vers la droite.
    expect(getVehicle('hero').querySelector('[data-arrow="end"]')).toBeNull();
    expect(getVehicle('hero').querySelector('[data-arrow="start"]')).not.toBeNull();
  });

  it('revient à la carte avec Retour en état 1, coupe seulement le moteur en état 2', () => {
    forceTvMode();
    const controls = renderBoard();

    press('Enter');
    expect(getVehicle('hero')).toHaveAttribute('data-locked', 'true');
    expect(press('Backspace')).toBe(true);
    expect(getVehicle('hero')).not.toHaveAttribute('data-locked');
    expect(controls.exitToMap).not.toHaveBeenCalled();

    expect(press('Escape')).toBe(true);
    expect(controls.exitToMap).toHaveBeenCalledOnce();
  });

  it('rejoint le HUD par le haut, le parcourt, et redescend sur le dernier véhicule ciblé', () => {
    forceTvMode();
    const controls = renderBoard();

    // Au-dessus du hero, la voiture A est encore devant : elle est ciblée avant le HUD.
    press('ArrowUp');
    expect(getVehicle('A')).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Annuler')).toHaveFocus();
    expect(getButton('Annuler')).toHaveAttribute('data-focused', 'true');
    expect(getVehicle('A')).not.toHaveAttribute('data-focused');

    press('ArrowUp');
    expect(getButton('Annuler')).toHaveFocus();
    press('ArrowLeft');
    expect(getButton('Retour')).toHaveFocus();
    press('ArrowLeft');
    expect(getButton('Retour')).toHaveFocus();
    press('ArrowRight', 3);
    expect(getButton('Recommencer')).toHaveFocus();
    press('ArrowRight');
    expect(getButton('Recommencer')).toHaveFocus();
    press('ArrowDown');
    expect(getVehicle('A')).toHaveFocus();
    expect(getVehicle('A')).toHaveAttribute('data-focused', 'true');

    press('ArrowUp');
    press('ArrowLeft', 3);
    press('Enter');
    expect(controls.exitToMap).toHaveBeenCalledOnce();
  });

  it('annule et recommence depuis le HUD, le curseur revenant sur le hero', () => {
    forceTvMode();
    renderBoard();

    press('ArrowRight');
    press('Enter');
    press('ArrowDown', 2);
    press('Enter');
    press('ArrowUp');
    expect(getVehicle('hero')).toHaveFocus();
    press('ArrowUp');
    expect(getButton('Annuler')).toHaveFocus();
    press('Enter');
    expect(getHud()).toHaveTextContent('Coups : 0');
    expect(getVehicle('A')).toHaveAccessibleName(/lignes 2 à 3/);
    expect(getButton('Annuler')).toHaveAttribute('aria-disabled', 'true');
    expect(getButton('Annuler')).toHaveFocus();
    // Plus rien à annuler : OK sur le bouton inactif ne fait rien.
    press('Enter');
    expect(getHud()).toHaveTextContent('Coups : 0');

    press('ArrowDown');
    press('ArrowRight');
    press('Enter');
    press('ArrowDown');
    expect(getHud()).toHaveTextContent('Coups : 1');
    press('Enter');
    press('ArrowUp');
    press('ArrowUp');
    press('ArrowRight', 2);
    expect(getButton('Recommencer')).toHaveFocus();
    press('Enter');

    expect(getHud()).toHaveTextContent('Coups : 0');
    expect(getVehicle('A')).toHaveAccessibleName(/lignes 2 à 3/);
    expect(getVehicle('hero')).toHaveFocus();
    expect(getVehicle('hero')).not.toHaveAttribute('data-locked');
  });

  it('agit dès le premier appui après le tactile si le véhicule a déjà le focus DOM', () => {
    renderBoard();
    expect(getVehicle('hero')).not.toHaveAttribute('data-focused');

    // Clic (ou Tab) sur la voiture A : elle a le focus DOM, OK la démarre sans réveil préalable.
    act(() => {
      getVehicle('A').focus();
    });
    expect(press('Enter')).toBe(true);
    expect(getVehicle('A')).toHaveAttribute('data-focused', 'true');
    expect(getVehicle('A')).toHaveAttribute('data-locked', 'true');
    press('ArrowUp');
    expect(getHud()).toHaveTextContent('Coups : 1');
  });

  it('active le parking et cible le véhicule qui reçoit le focus DOM', () => {
    forceTvMode();
    renderBoard();

    press('ArrowRight');
    press('ArrowUp');
    expect(getButton('Annuler')).toHaveFocus();

    act(() => {
      getVehicle('hero').focus();
    });
    expect(getVehicle('hero')).toHaveAttribute('data-focused', 'true');
    expect(getButton('Annuler')).not.toHaveAttribute('data-focused');
    press('ArrowRight');
    expect(getVehicle('A')).toHaveFocus();
  });
});

describe('Partie au doigt', () => {
  it('glisse un véhicule le long de son axe et aimante la case la plus proche', () => {
    mockParkingSize();
    const controls = renderBoard();

    const car = getVehicle('A');
    fireEvent.pointerDown(car, { clientX: 100, clientY: 100, pointerId: 7, isPrimary: true });
    expect(setPointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    fireEvent.pointerMove(car, { clientX: 100, clientY: 190, pointerId: 7, isPrimary: true });
    expect(car).toHaveAttribute('data-dragging', 'true');
    expect(car.style.transform).toBe('translateY(90px)');
    expect(car).toHaveClass('transition-none');
    // Un autre pointeur n'influence pas le glissement en cours.
    fireEvent.pointerMove(car, { clientX: 100, clientY: 400, pointerId: 8, isPrimary: false });
    expect(car.style.transform).toBe('translateY(90px)');

    fireEvent.pointerUp(car, { clientX: 100, clientY: 190, pointerId: 7, isPrimary: true });
    expect(car).not.toHaveAttribute('data-dragging');
    expect(car.style.transform).toBe('');
    expect(car).toHaveAccessibleName(/lignes 4 à 5, colonne 4/);
    expect(getHud()).toHaveTextContent('Coups : 1');
    expect(controls.recordVictory).not.toHaveBeenCalled();
  });

  it('borne le glissement aux véhicules voisins et au muret', () => {
    mockParkingSize();
    renderBoard();

    // Le hero bute sur la voiture A : une seule case libre à droite.
    const hero = getVehicle('hero');
    fireEvent.pointerDown(hero, { clientX: 100, clientY: 100, pointerId: 1, isPrimary: true });
    fireEvent.pointerMove(hero, { clientX: 400, clientY: 100, pointerId: 1, isPrimary: true });
    expect(hero.style.transform).toBe(`translateX(${String(CELL_PX)}px)`);
    fireEvent.pointerMove(hero, { clientX: 0, clientY: 100, pointerId: 1, isPrimary: true });
    expect(hero.style.transform).toBe('translateX(0px)');
    fireEvent.pointerMove(hero, { clientX: 400, clientY: 100, pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(hero, { clientX: 400, clientY: 100, pointerId: 1, isPrimary: true });
    expect(hero).toHaveAccessibleName(/colonnes 2 à 3/);
    expect(getHud()).toHaveTextContent('Coups : 1');

    // La voiture A descend au plus de trois cases, jusqu'au muret.
    drag(getVehicle('A'), 'y', 1000);
    expect(getVehicle('A')).toHaveAccessibleName(/lignes 5 à 6/);
    expect(getHud()).toHaveTextContent('Coups : 2');
  });

  it('ne joue aucun coup sans déplacement d’au moins une demi-case', () => {
    mockParkingSize();
    renderBoard();

    drag(getVehicle('A'), 'y', 20);
    expect(getHud()).toHaveTextContent('Coups : 0');
    drag(getVehicle('A'), 'y', 30, { release: 'pointerCancel' });
    expect(getHud()).toHaveTextContent('Coups : 1');
    expect(getVehicle('A')).toHaveAccessibleName(/lignes 3 à 4/);
  });

  it('ignore un pointeur secondaire, un bouton de souris secondaire et un parking non mesuré', () => {
    renderBoard();
    drag(getVehicle('A'), 'y', 100);
    expect(getVehicle('A').style.transform).toBe('');
    expect(getHud()).toHaveTextContent('Coups : 0');

    mockParkingSize();
    const car = getVehicle('A');
    fireEvent.pointerDown(car, { clientX: 100, clientY: 100, pointerId: 2, isPrimary: false });
    fireEvent.pointerDown(car, {
      clientX: 100,
      clientY: 100,
      pointerId: 3,
      isPrimary: true,
      pointerType: 'mouse',
      button: 2,
    });
    fireEvent.pointerMove(car, { clientX: 100, clientY: 200, pointerId: 2, isPrimary: false });
    expect(car).not.toHaveAttribute('data-dragging');
    expect(setPointerCapture).not.toHaveBeenCalled();
  });

  it('gagne au doigt, puis rejoue ou revient à la carte depuis la modale', async () => {
    mockParkingSize();
    const controls = renderBoard();

    drag(getVehicle('A'), 'y', -CELL_PX);
    drag(getVehicle('hero'), 'x', 4 * CELL_PX);
    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 2,
      timeSeconds: 0,
      isPerfect: true,
    });
    // Le hero sorti ne se déplace plus.
    drag(getVehicle('hero'), 'x', -CELL_PX);
    expect(getHud()).toHaveTextContent('Coups : 2');

    advance(EXIT_ANIMATION_MS);
    fireEvent.click(getButton('Rejouer'));
    await advanceAsync(1000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getHud()).toHaveTextContent('Coups : 0');
    expect(getVehicle('hero')).toHaveAccessibleName(/colonnes 1 à 2/);
    expect(getVehicle('hero')).not.toHaveAttribute('data-exiting');

    drag(getVehicle('A'), 'y', -CELL_PX);
    drag(getVehicle('hero'), 'x', 4 * CELL_PX);
    advance(EXIT_ANIMATION_MS);
    fireEvent.click(getButton('Carte des Étoiles'));
    expect(controls.exitToMap).toHaveBeenCalledOnce();
    expect(controls.recordVictory).toHaveBeenCalledTimes(2);
  });

  it('n’enregistre la victoire et n’ouvre la modale qu’une fois sous StrictMode', () => {
    mockParkingSize();
    const controls = renderBoard({ strict: true });

    drag(getVehicle('A'), 'y', -CELL_PX);
    drag(getVehicle('hero'), 'x', 4 * CELL_PX);
    expect(getHud()).toHaveTextContent('Coups : 2');
    expect(controls.recordVictory).toHaveBeenCalledExactlyOnceWith({
      moves: 2,
      timeSeconds: 0,
      isPerfect: true,
    });

    advance(EXIT_ANIMATION_MS);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    advance(EXIT_ANIMATION_MS);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(controls.recordVictory).toHaveBeenCalledOnce();
  });

  it('ne mentionne ni optimal ni couronne tant que le nombre optimal de coups est inconnu', () => {
    mockParkingSize();
    renderBoard({ lines: TRIVIAL, optimalMoves: 0 });

    drag(getVehicle('hero'), 'x', 4 * CELL_PX);
    advance(EXIT_ANIMATION_MS);

    const dialog = screen.getByRole('dialog', { name: 'Étoile #1 gagnée !' });
    expect(dialog).toHaveAccessibleDescription('1 coup');
    expect(within(dialog).queryByText(/Couronne|Parfait/)).toBeNull();
  });

  it('ne propose pas d’étoile suivante après la dernière étoile du catalogue', () => {
    mockParkingSize();
    renderBoard({ levelIndex: 1 });

    drag(getVehicle('hero'), 'x', 4 * CELL_PX);
    advance(EXIT_ANIMATION_MS);

    const dialog = screen.getByRole('dialog', { name: 'Étoile #2 gagnée !' });
    expect(dialog).toHaveAccessibleDescription('1 coup · optimal 1');
    expect(within(dialog).queryByRole('button', { name: /Étoile Suivante/ })).toBeNull();
    expect(within(dialog).getAllByRole('button')[0]).toHaveAccessibleName('Rejouer');
  });

  it('annule et recommence avec les boutons du HUD', () => {
    mockParkingSize();
    const controls = renderBoard();

    drag(getVehicle('A'), 'y', 2 * CELL_PX);
    drag(getVehicle('hero'), 'x', CELL_PX);
    expect(getHud()).toHaveTextContent('Coups : 2');

    fireEvent.click(getButton('Annuler'));
    expect(getHud()).toHaveTextContent('Coups : 1');
    expect(getVehicle('hero')).toHaveAccessibleName(/colonnes 1 à 2/);

    fireEvent.click(getButton('Recommencer'));
    expect(getHud()).toHaveTextContent('Coups : 0');
    expect(getVehicle('A')).toHaveAccessibleName(/lignes 2 à 3/);

    fireEvent.click(getButton('Retour'));
    expect(controls.exitToMap).toHaveBeenCalledOnce();
  });
});

describe('Indice', () => {
  it('montre le véhicule à déplacer et sa case cible, puis s’efface au coup suivant', () => {
    mockParkingSize();
    forceTvMode();
    renderBoard();

    fireEvent.click(getButton('Indice'));
    expect(getStatus()).toHaveTextContent('Indice : déplace la voiture A de 1 case vers le haut');
    expect(getVehicle('A')).toHaveAttribute('data-hint', 'true');
    const target = getBoard().querySelector<HTMLElement>('[data-hint-target]');
    expect(target).not.toBeNull();
    expect(target?.style.top).toBe('0%');
    expect(target?.style.left).toBe('50%');
    // Le curseur de la télécommande cible le véhicule de l'indice.
    expect(getVehicle('A')).toHaveAttribute('data-focused', 'true');

    drag(getVehicle('A'), 'y', -CELL_PX);
    expect(getVehicle('A')).not.toHaveAttribute('data-hint');
    expect(getBoard().querySelector('[data-hint-target]')).toBeNull();
  });

  it('s’efface quand on annule un coup ou qu’on recommence', () => {
    mockParkingSize();
    renderBoard();

    drag(getVehicle('A'), 'y', CELL_PX);
    expect(getHud()).toHaveTextContent('Coups : 1');
    fireEvent.click(getButton('Indice'));
    expect(getVehicle('A')).toHaveAttribute('data-hint', 'true');
    expect(getBoard().querySelector('[data-hint-target]')).not.toBeNull();

    fireEvent.click(getButton('Annuler'));
    expect(getHud()).toHaveTextContent('Coups : 0');
    expect(getVehicle('A')).not.toHaveAttribute('data-hint');
    expect(getBoard().querySelector('[data-hint-target]')).toBeNull();

    fireEvent.click(getButton('Indice'));
    expect(getVehicle('A')).toHaveAttribute('data-hint', 'true');
    fireEvent.click(getButton('Recommencer'));
    expect(getVehicle('A')).not.toHaveAttribute('data-hint');
    expect(getBoard().querySelector('[data-hint-target]')).toBeNull();
  });

  it('s’efface de lui-même après un délai', () => {
    renderBoard();

    fireEvent.click(getButton('Indice'));
    expect(getVehicle('A')).toHaveAttribute('data-hint', 'true');
    advance(HINT_DURATION_MS - 1);
    expect(getVehicle('A')).toHaveAttribute('data-hint', 'true');
    advance(1);
    expect(getVehicle('A')).not.toHaveAttribute('data-hint');
  });

  it('explique qu’une position bloquée n’a pas d’indice', () => {
    renderBoard({ lines: WALLED, optimalMoves: 0 });

    fireEvent.click(getButton('Indice'));
    expect(getStatus()).toHaveTextContent(HINT_UNAVAILABLE_MESSAGE);
    expect(getBoard().querySelector('[data-hint-target]')).toBeNull();
  });

  it('rappelle que la partie est gagnée pendant la sortie du hero', () => {
    mockParkingSize();
    renderBoard({ levelIndex: 1 });

    drag(getVehicle('hero'), 'x', 4 * CELL_PX);
    fireEvent.click(getButton('Indice'));
    expect(getStatus()).toHaveTextContent(HINT_WON_MESSAGE);
  });
});

describe('Composants isolés', () => {
  it('rend le HUD sans zone D-Pad et un véhicule démarré sans extrémité libre', () => {
    render(
      <TrafficJamHud
        moves={4}
        optimalMoves={3}
        tier="medium"
        hasCrown={false}
        canUndo
        onUndo={vi.fn()}
        onHint={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(getHud()).toHaveTextContent('Coups : 4');
    expect(within(getHud()).getByText('≤ 3 coups')).toHaveClass('line-through');
    expect(getHud()).toHaveTextContent('hors d’atteinte');
    expect(getButton('Annuler')).not.toHaveAttribute('data-focused');

    const truck: VehicleDef = {
      id: 'B',
      type: 'truck',
      axis: 'H',
      length: 3,
      row: 5,
      col: 0,
      colorClass: 'bg-sky-500',
    };
    const { container } = render(
      <VehiclePiece
        vehicle={truck}
        gridSize={6}
        isFocused
        isLocked
        bounds={{ minDelta: 0, maxDelta: 2 }}
        isHinted
      />,
    );
    expect(container.querySelector('[data-arrow="start"]')).toBeNull();
    expect(container.querySelector('[data-arrow="end"]')).not.toBeNull();
    expect(container.querySelector('[data-hint]')).not.toBeNull();
  });
});

describe('Libellés', () => {
  it('nomme les véhicules, leur sens et les cases en français', () => {
    const hero: VehicleDef = {
      id: 'hero',
      type: 'hero',
      axis: 'H',
      length: 2,
      row: 2,
      col: 0,
      colorClass: 'bg-red-500',
    };
    const truck: VehicleDef = { ...hero, id: 'B', type: 'truck', axis: 'V', length: 3, col: 5 };

    expect(getVehicleName(hero)).toBe('ta voiture');
    expect(getVehicleName({ id: 'A', type: 'car' })).toBe('la voiture A');
    expect(getVehicleName(truck)).toBe('le camion B');
    expect(getVehicleLabel(truck, true)).toBe(
      'Camion B, vertical, 3 cases, lignes 3 à 5, colonne 6, en marche',
    );
    expect(getVehicleLabel({ ...truck, axis: 'H' })).toBe(
      'Camion B, horizontal, 3 cases, ligne 3, colonnes 6 à 8',
    );
    expect(getHintMessage(hero, 2)).toBe('Indice : déplace ta voiture de 2 cases vers la droite');
    expect(getHintMessage(truck, -1)).toBe('Indice : déplace le camion B de 1 case vers le haut');
    expect(getDirectionLabel('H', -1)).toBe('vers la gauche');
    expect(getDirectionLabel('V', 3)).toBe('vers le bas');
    expect(formatCells(0)).toBe('0 case');
    expect(getObstacleLabel(0, 0)).toBe('Plot fixe, ligne 1, colonne 1');
    expect(getBoardLabel(7, 3)).toBe('Parking de 7 × 7 cases, sortie à droite sur la ligne 4');
    expect(getCrownMissedMessage(10, 12)).toBe(
      'Couronne : ≤ 10 coups, tu en as fait 12. Rejoue pour la gagner !',
    );
  });
});
