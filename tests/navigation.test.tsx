import { FocusableButton, FocusableCard, ModalDialog } from '@/components/ui';
import {
  coordToIndex,
  findNearestTarget,
  getGridItemCount,
  indexToCoord,
  isBackKey,
  isSelectKey,
  mapKeyToDirection,
  moveInGrid,
  NavigationLayer,
  NavigationProvider,
  useGridNavigation,
  useNavigation,
  useNavigationScope,
  type Direction,
  type GridCoord,
  type NavigationTarget,
  type UseGridNavigationOptions,
} from '@/core/navigation';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const TV_MEDIA_QUERY = '(hover: none) and (pointer: none)';

/** Appuie sur une touche (cible : élément focalisé) ; `true` si le moteur l'a consommée. */
function press(
  key: string,
  init: KeyboardEventInit = {},
  target: Element = document.activeElement ?? document.body,
): boolean {
  return !fireEvent.keyDown(target, { key, ...init });
}

/** Mode TV forcé (réglage FEAT-05) : le moteur démarre en mode D-Pad. */
function forceTvMode(): void {
  document.documentElement.dataset.tv = 'on';
}

function getButton(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

/** Libellés des éléments qui affichent l'anneau de focus du moteur D-Pad. */
function ringedLabels(): string[] {
  return Array.from(document.querySelectorAll('[data-focused]'), (element) => {
    return element.textContent;
  });
}

function getCursor(label = 'Carte'): string {
  return screen.getByRole('status', { name: `Curseur ${label}` }).textContent;
}

afterEach(() => {
  delete document.documentElement.dataset.tv;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

interface GridProps extends Partial<UseGridNavigationOptions> {
  count: number;
  label?: string;
  onActivate?: (index: number) => void;
}

/** Grille de boutons pilotée par `useGridNavigation` (une ligne par défaut). */
function Grid({ count, cols = count, label = 'Carte', onActivate, ...options }: GridProps) {
  const grid = useGridNavigation({
    scopeId: label,
    rows: Math.ceil(count / Math.max(cols, 1)),
    cols,
    totalItems: count,
    ...options,
  });

  return (
    <div>
      <output aria-label={`Curseur ${label}`}>{grid.focusedIndex}</output>
      {Array.from({ length: count }, (_, index) => (
        <FocusableButton
          key={index}
          ref={grid.getItemRef(index)}
          isFocused={grid.isItemFocused(index)}
          onClick={() => {
            onActivate?.(index);
          }}
        >
          {`${label} ${String(index)}`}
        </FocusableButton>
      ))}
    </div>
  );
}

function NavigationProbe() {
  const { inputMode, activeScopeId } = useNavigation();
  return <output aria-label="Navigation">{`${inputMode} ${activeScopeId ?? 'aucune'}`}</output>;
}

function getProbe(): string {
  return screen.getByRole('status', { name: 'Navigation' }).textContent;
}

describe('Touches de la télécommande et du clavier', () => {
  it.each<[string, Direction]>([
    ['ArrowUp', 'up'],
    ['Up', 'up'],
    ['ArrowDown', 'down'],
    ['Down', 'down'],
    ['ArrowLeft', 'left'],
    ['Left', 'left'],
    ['ArrowRight', 'right'],
    ['Right', 'right'],
  ])('traduit %s en direction « %s »', (key, direction) => {
    expect(mapKeyToDirection(key)).toBe(direction);
  });

  it('ignore les touches qui ne sont pas des flèches', () => {
    for (const key of ['Enter', 'Tab', 'a', 'PageDown', '']) {
      expect(mapKeyToDirection(key)).toBeNull();
    }
  });

  it('reconnaît OK / Entrée / Espace et Retour / Échap', () => {
    for (const key of ['Enter', ' ', 'NumpadEnter', 'Select']) expect(isSelectKey(key)).toBe(true);
    for (const key of ['Escape', 'Backspace', 'GoBack', 'BrowserBack']) {
      expect(isBackKey(key)).toBe(true);
    }

    for (const key of ['Escape', 'Spacebar', 'a']) expect(isSelectKey(key)).toBe(false);
    for (const key of ['Enter', 'Delete', 'ArrowLeft']) expect(isBackKey(key)).toBe(false);
  });
});

describe('Calcul de grille', () => {
  /** 14 éléments sur 4 colonnes : la dernière ligne n'a que 2 cases (12 et 13). */
  const PARTIAL = { rows: 4, cols: 4, totalItems: 14 };

  it('convertit index et coordonnées dans les deux sens', () => {
    expect(indexToCoord(13, 4)).toEqual({ row: 3, col: 1 });
    expect(coordToIndex({ row: 3, col: 1 }, 4)).toBe(13);
    expect(indexToCoord(0, 4)).toEqual({ row: 0, col: 0 });
    // Aucune division par zéro pour une grille sans colonne.
    expect(indexToCoord(2, 0)).toEqual({ row: 2, col: 0 });
    expect(coordToIndex({ row: 2, col: 0 }, 0)).toBe(2);
  });

  it('compte les éléments présents, bornés à rows x cols', () => {
    expect(getGridItemCount(PARTIAL)).toBe(14);
    expect(getGridItemCount({ rows: 4, cols: 4 })).toBe(16);
    expect(getGridItemCount({ rows: 2, cols: 3, totalItems: 20 })).toBe(6);
    expect(getGridItemCount({ rows: -1, cols: 3 })).toBe(0);
  });

  it.each<[Direction, GridCoord]>([
    ['up', { row: 0, col: 1 }],
    ['down', { row: 2, col: 1 }],
    ['left', { row: 1, col: 0 }],
    ['right', { row: 1, col: 2 }],
  ])('déplace le curseur d’une case vers %s', (direction, expected) => {
    expect(moveInGrid({ row: 1, col: 1 }, direction, { rows: 3, cols: 3 })).toEqual(expected);
  });

  it('s’arrête aux bords sans boucler par défaut', () => {
    const size = { rows: 3, cols: 3 };
    expect(moveInGrid({ row: 0, col: 0 }, 'up', size)).toEqual({ row: 0, col: 0 });
    expect(moveInGrid({ row: 0, col: 0 }, 'left', size)).toEqual({ row: 0, col: 0 });
    expect(moveInGrid({ row: 2, col: 2 }, 'down', size)).toEqual({ row: 2, col: 2 });
    expect(moveInGrid({ row: 2, col: 2 }, 'right', size)).toEqual({ row: 2, col: 2 });
  });

  it('rabat sur le dernier élément en descendant vers une case vide de la dernière ligne', () => {
    expect(moveInGrid({ row: 2, col: 2 }, 'down', PARTIAL)).toEqual({ row: 3, col: 1 });
    expect(moveInGrid({ row: 2, col: 3 }, 'down', PARTIAL)).toEqual({ row: 3, col: 1 });
    expect(moveInGrid({ row: 2, col: 0 }, 'down', PARTIAL)).toEqual({ row: 3, col: 0 });
    expect(moveInGrid({ row: 3, col: 1 }, 'right', PARTIAL)).toEqual({ row: 3, col: 1 });
    expect(moveInGrid({ row: 3, col: 1 }, 'up', PARTIAL)).toEqual({ row: 2, col: 1 });
  });

  it('boucle sur la ligne ou la colonne avec wrap, y compris sur une dernière ligne incomplète', () => {
    const wrapped = { ...PARTIAL, wrap: true };
    expect(moveInGrid({ row: 0, col: 3 }, 'right', wrapped)).toEqual({ row: 0, col: 0 });
    expect(moveInGrid({ row: 0, col: 0 }, 'left', wrapped)).toEqual({ row: 0, col: 3 });
    expect(moveInGrid({ row: 0, col: 0 }, 'up', wrapped)).toEqual({ row: 3, col: 0 });
    // La colonne 3 s'arrête à la ligne 2 : elle boucle sur sa dernière case existante.
    expect(moveInGrid({ row: 0, col: 3 }, 'up', wrapped)).toEqual({ row: 2, col: 3 });
    expect(moveInGrid({ row: 3, col: 0 }, 'down', wrapped)).toEqual({ row: 0, col: 0 });
    expect(moveInGrid({ row: 3, col: 1 }, 'right', wrapped)).toEqual({ row: 3, col: 0 });
    expect(moveInGrid({ row: 3, col: 0 }, 'left', wrapped)).toEqual({ row: 3, col: 1 });
    // La règle de la case vide l'emporte sur la boucle.
    expect(moveInGrid({ row: 2, col: 3 }, 'down', wrapped)).toEqual({ row: 3, col: 1 });
  });

  it('pilote une liste horizontale ou verticale', () => {
    const row = { rows: 1, cols: 3 };
    expect(moveInGrid({ row: 0, col: 1 }, 'right', row)).toEqual({ row: 0, col: 2 });
    expect(moveInGrid({ row: 0, col: 1 }, 'down', row)).toEqual({ row: 0, col: 1 });
    expect(moveInGrid({ row: 0, col: 0 }, 'up', { ...row, wrap: true })).toEqual({
      row: 0,
      col: 0,
    });

    const column = { rows: 3, cols: 1 };
    expect(moveInGrid({ row: 1, col: 0 }, 'down', column)).toEqual({ row: 2, col: 0 });
    expect(moveInGrid({ row: 1, col: 0 }, 'right', column)).toEqual({ row: 1, col: 0 });
  });

  it('ignore une grille vide et ramène une position hors grille sur le dernier élément', () => {
    const current = { row: 1, col: 1 };
    expect(moveInGrid(current, 'right', { rows: 3, cols: 3, totalItems: 0 })).toBe(current);
    expect(moveInGrid({ row: 9, col: 9 }, 'left', { rows: 2, cols: 3 })).toEqual({
      row: 1,
      col: 1,
    });
  });
});

describe('findNearestTarget', () => {
  const ORIGIN = { x: 0, y: 0 };

  it.each<[Direction, string]>([
    ['up', 'haut'],
    ['down', 'bas'],
    ['left', 'gauche'],
    ['right', 'droite'],
  ])('trouve la cible située vers %s (y croît vers le bas)', (direction, expected) => {
    const cross: NavigationTarget[] = [
      { id: 'haut', x: 0, y: -2 },
      { id: 'bas', x: 0, y: 2 },
      { id: 'gauche', x: -2, y: 0 },
      { id: 'droite', x: 2, y: 0 },
    ];
    expect(findNearestTarget(ORIGIN, cross, direction)).toBe(expected);
  });

  it('préfère une cible alignée à une cible en diagonale à peine plus proche', () => {
    const aligned = { id: 'alignée', x: 3, y: 0 };
    expect(findNearestTarget(ORIGIN, [{ id: 'diagonale', x: 2, y: 1.5 }, aligned], 'right')).toBe(
      'alignée',
    );
    expect(findNearestTarget(ORIGIN, [{ id: 'voisine', x: 1, y: 1 }, aligned], 'right')).toBe(
      'voisine',
    );
  });

  it('cherche d’abord dans le cône de ±45°, puis dans tout le demi-plan', () => {
    const steep = { id: 'raide', x: 0.5, y: 2 };
    expect(findNearestTarget(ORIGIN, [steep, { id: 'lointaine', x: 5, y: 0 }], 'right')).toBe(
      'lointaine',
    );
    expect(findNearestTarget(ORIGIN, [steep], 'right')).toBe('raide');
  });

  it('renvoie null quand rien ne se trouve plus loin dans cette direction', () => {
    const targets = [
      { id: 'origine', x: 0, y: 0 },
      { id: 'derrière', x: -1, y: 0 },
      { id: 'à niveau', x: 0, y: 2 },
    ];
    expect(findNearestTarget(ORIGIN, targets, 'right')).toBeNull();
    expect(findNearestTarget(ORIGIN, [], 'up')).toBeNull();
  });

  it('départage les égalités par l’ordre du tableau', () => {
    const symmetric = [
      { id: 'première', x: 2, y: 1 },
      { id: 'seconde', x: 2, y: -1 },
    ];
    expect(findNearestTarget(ORIGIN, symmetric, 'right')).toBe('première');
  });

  it('saute au véhicule voisin sur un parking 6x6 (centres en unités de case)', () => {
    // Joueur (ligne 2, colonnes 0-1), voiture verticale (colonne 2, lignes 1-2),
    // camion horizontal (ligne 2, colonnes 3-5) et voiture verticale (colonne 2, lignes 4-5).
    const hero = { x: 1, y: 2.5 };
    const vehicles = [
      { id: 'voiture-haute', x: 2.5, y: 2 },
      { id: 'camion', x: 4.5, y: 2.5 },
      { id: 'voiture-basse', x: 2.5, y: 5 },
    ];
    expect(findNearestTarget(hero, vehicles, 'right')).toBe('voiture-haute');
    expect(findNearestTarget(hero, vehicles, 'down')).toBe('voiture-basse');
    expect(findNearestTarget(hero, vehicles, 'up')).toBe('voiture-haute');
    expect(findNearestTarget(hero, vehicles, 'left')).toBeNull();
  });
});

describe('NavigationProvider', () => {
  it('exige un NavigationProvider parent', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useNavigation())).toThrow('NavigationProvider');
  });

  it('démarre en mode tactile hors TV', () => {
    render(<NavigationProbe />, { wrapper: NavigationProvider });

    expect(getProbe()).toBe('touch aucune');
  });

  it('démarre en mode D-Pad quand le mode TV est forcé', () => {
    forceTvMode();
    render(<NavigationProbe />, { wrapper: NavigationProvider });

    expect(getProbe()).toBe('dpad aucune');
  });

  it('démarre en mode D-Pad sur un appareil sans écran tactile ni souris, sauf mode TV désactivé', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query === TV_MEDIA_QUERY }));
    vi.stubGlobal('matchMedia', matchMedia);

    const { unmount } = render(<NavigationProbe />, { wrapper: NavigationProvider });
    expect(getProbe()).toBe('dpad aucune');
    expect(matchMedia).toHaveBeenCalledWith(TV_MEDIA_QUERY);
    unmount();

    document.documentElement.dataset.tv = 'off';
    render(<NavigationProbe />, { wrapper: NavigationProvider });
    expect(getProbe()).toBe('touch aucune');
  });

  it('pré-rend le mode tactile, sans zone active ni anneau de focus', () => {
    forceTvMode();
    const html = renderToString(
      <NavigationProvider>
        <NavigationProbe />
        <Grid count={2} />
      </NavigationProvider>,
    );

    expect(html).toContain('touch aucune');
    expect(html).not.toContain('data-focused');
  });

  it('passe en mode D-Pad avec une flèche ou OK, et en mode tactile au premier contact', () => {
    render(<NavigationProbe />, { wrapper: NavigationProvider });

    expect(press('ArrowDown')).toBe(false);
    expect(getProbe()).toBe('dpad aucune');

    for (const pointerType of ['touch', 'mouse', 'pen']) {
      fireEvent.pointerDown(document.body, { pointerType });
      expect(getProbe()).toBe('touch aucune');
      press('Enter');
      expect(getProbe()).toBe('dpad aucune');
    }

    // Un clic synthétique (ex: element.click()) n'a pas de type de pointeur.
    fireEvent.pointerDown(document.body, { pointerType: '' });
    expect(getProbe()).toBe('dpad aucune');
  });

  it('ne change pas de mode sur Retour ni sur les autres touches', () => {
    render(<NavigationProbe />, { wrapper: NavigationProvider });

    for (const key of ['Escape', 'Tab', 'a']) {
      expect(press(key)).toBe(false);
      expect(getProbe()).toBe('touch aucune');
    }
  });
});

describe('useGridNavigation', () => {
  it('déplace le curseur, son anneau, le focus DOM et le défilement au D-Pad', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    forceTvMode();
    render(<Grid count={6} cols={3} />, { wrapper: NavigationProvider });

    expect(ringedLabels()).toEqual(['Carte 0']);
    expect(getButton('Carte 0')).toHaveFocus();

    expect(press('ArrowRight')).toBe(true);
    expect(press('ArrowDown')).toBe(true);

    expect(getCursor()).toBe('4');
    expect(ringedLabels()).toEqual(['Carte 4']);
    expect(getButton('Carte 4')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(getButton('Carte 4'));
  });

  it('expose la position, initialIndex et setFocusedIndex borné à la grille', () => {
    const { result } = renderHook(
      () =>
        useGridNavigation({ scopeId: 'liste', rows: 3, cols: 4, totalItems: 10, initialIndex: 5 }),
      { wrapper: NavigationProvider },
    );

    expect(result.current.focusedIndex).toBe(5);
    expect(result.current.focusedCoord).toEqual({ row: 1, col: 1 });
    expect(result.current.isActive).toBe(true);
    expect(result.current.inputMode).toBe('touch');

    act(() => {
      result.current.setFocusedIndex(42);
    });
    expect(result.current.focusedIndex).toBe(9);

    act(() => {
      result.current.setFocusedIndex(-3);
    });
    expect(result.current.focusedCoord).toEqual({ row: 0, col: 0 });
  });

  it('fonctionne sans élément enregistré par getItemRef', () => {
    const { result } = renderHook(
      () => useGridNavigation({ scopeId: 'sans-dom', rows: 1, cols: 3 }),
      { wrapper: NavigationProvider },
    );

    // Aucun élément n'a le focus DOM : le premier appui révèle seulement le curseur.
    expect(press('ArrowRight', {}, document.body)).toBe(true);
    expect(result.current.focusedIndex).toBe(0);
    expect(result.current.isItemFocused(0)).toBe(true);

    press('ArrowRight', {}, document.body);
    // Événement envoyé sur window (cible non élément) : routé comme les autres.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(result.current.focusedIndex).toBe(2);
    expect(press('Enter', {}, document.body)).toBe(true);

    const outside = document.createElement('button');
    document.body.append(outside);
    act(() => {
      outside.focus();
    });
    expect(press('Enter')).toBe(false);
    expect(result.current.focusedIndex).toBe(2);
    outside.remove();

    // React n'appelle jamais la ref avec null (elle renvoie une fonction de nettoyage).
    expect(result.current.getItemRef(0)(null)).toBeUndefined();
  });

  it('borne le curseur quand la grille rétrécit', () => {
    forceTvMode();
    const { rerender } = render(<Grid count={5} initialIndex={4} />, {
      wrapper: NavigationProvider,
    });
    expect(getCursor()).toBe('4');

    rerender(<Grid count={2} initialIndex={4} />);

    expect(getCursor()).toBe('1');
    expect(ringedLabels()).toEqual(['Carte 1']);
  });

  it('OK clique l’élément ciblé sans onSelect, comme au doigt (cartes verrouillées comprises)', () => {
    forceTvMode();
    const onPlay = vi.fn();

    function LevelTiles() {
      const tiles = useGridNavigation({ scopeId: 'étoiles', rows: 1, cols: 2 });
      return [false, true].map((isLocked, index) => (
        <FocusableCard
          key={index}
          ref={tiles.getItemRef(index)}
          isFocused={tiles.isItemFocused(index)}
          isLocked={isLocked}
          onSelect={() => {
            onPlay(index);
          }}
        >
          {`Étoile ${String(index + 1)}`}
        </FocusableCard>
      ));
    }

    render(<LevelTiles />, { wrapper: NavigationProvider });

    expect(press('Enter')).toBe(true);
    expect(onPlay).toHaveBeenCalledExactlyOnceWith(0);

    press('ArrowRight');
    expect(press('Enter')).toBe(true);
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('OK appelle onSelect à la place du clic, et Espace bloque aussi le clic au relâchement', () => {
    forceTvMode();
    const onSelect = vi.fn();
    const onActivate = vi.fn();
    render(<Grid count={4} cols={2} onSelect={onSelect} onActivate={onActivate} />, {
      wrapper: NavigationProvider,
    });

    press('ArrowDown');
    expect(press(' ')).toBe(true);
    expect(fireEvent.keyUp(document.activeElement ?? document.body, { key: ' ' })).toBe(false);

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(2, { row: 1, col: 0 });
    expect(onActivate).not.toHaveBeenCalled();
    // Un relâchement d'Espace sans appui traité garde son comportement natif.
    expect(fireEvent.keyUp(document.body, { key: ' ' })).toBe(true);
  });

  it('Retour appelle onBack ; sans onBack, la touche reste au navigateur', () => {
    forceTvMode();
    const onBack = vi.fn();
    const { rerender } = render(<Grid count={2} onBack={onBack} />, {
      wrapper: NavigationProvider,
    });

    expect(press('Backspace')).toBe(true);
    expect(onBack).toHaveBeenCalledOnce();

    rerender(<Grid count={2} />);
    expect(press('Escape')).toBe(false);
  });

  it('signale le bord atteint par onEdge, et boucle avec wrap', () => {
    forceTvMode();
    const onEdge = vi.fn();
    const { rerender } = render(<Grid count={3} onEdge={onEdge} />, {
      wrapper: NavigationProvider,
    });

    press('ArrowRight');
    expect(onEdge).not.toHaveBeenCalled();
    expect(press('ArrowUp')).toBe(true);
    expect(onEdge).toHaveBeenCalledExactlyOnceWith('up', { row: 0, col: 1 });

    rerender(<Grid count={3} onEdge={onEdge} wrap />);
    press('ArrowRight');
    press('ArrowRight');
    expect(getCursor()).toBe('0');
    expect(onEdge).toHaveBeenCalledOnce();
  });

  it('répète les flèches maintenues, mais pas OK ni Retour', () => {
    forceTvMode();
    const onActivate = vi.fn();
    const onBack = vi.fn();
    render(<Grid count={3} onActivate={onActivate} onBack={onBack} />, {
      wrapper: NavigationProvider,
    });

    press('ArrowRight');
    press('ArrowRight', { repeat: true });
    expect(getCursor()).toBe('2');

    expect(press('Enter', { repeat: true })).toBe(true);
    expect(press('Escape', { repeat: true })).toBe(true);
    expect(onActivate).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('ignore les raccourcis avec modificateur, la composition IME et les touches déjà traitées', () => {
    forceTvMode();
    render(<Grid count={3} />, { wrapper: NavigationProvider });

    expect(press('ArrowRight', { ctrlKey: true })).toBe(false);
    expect(press('ArrowRight', { altKey: true })).toBe(false);
    expect(press('ArrowRight', { metaKey: true })).toBe(false);
    expect(press('ArrowRight', { isComposing: true })).toBe(false);

    const item = getButton('Carte 0');
    item.addEventListener('keydown', (event) => {
      event.preventDefault();
    });
    press('ArrowRight', {}, item);

    expect(getCursor()).toBe('0');
  });

  it('n’affiche l’anneau qu’au D-Pad', () => {
    render(<Grid count={3} />, { wrapper: NavigationProvider });
    expect(ringedLabels()).toEqual([]);

    press('ArrowRight');
    expect(ringedLabels()).toEqual(['Carte 0']);

    fireEvent.pointerDown(getButton('Carte 2'), { pointerType: 'touch' });
    expect(ringedLabels()).toEqual([]);
  });

  it('après le tactile, le premier appui révèle seulement le curseur', () => {
    const onActivate = vi.fn();
    render(<Grid count={3} onActivate={onActivate} />, { wrapper: NavigationProvider });

    expect(press('ArrowRight')).toBe(true);
    expect(getCursor()).toBe('0');
    expect(getButton('Carte 0')).toHaveFocus();

    press('ArrowRight');
    expect(getCursor()).toBe('1');

    fireEvent.pointerDown(document.body, { pointerType: 'mouse' });
    act(() => {
      getButton('Carte 1').blur();
    });
    expect(press('Enter')).toBe(true);
    expect(onActivate).not.toHaveBeenCalled();

    press('Enter');
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('agit dès le premier appui quand l’élément ciblé a déjà le focus DOM (Tab, clic)', () => {
    const onActivate = vi.fn();
    render(<Grid count={4} onActivate={onActivate} />, { wrapper: NavigationProvider });

    act(() => {
      getButton('Carte 2').focus();
    });
    expect(getCursor()).toBe('2');

    press('Enter');
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(2);

    fireEvent.pointerDown(getButton('Carte 2'), { pointerType: 'mouse' });
    press('ArrowRight');
    expect(getCursor()).toBe('3');
  });

  it('laisse OK au navigateur sur un élément interactif hors zone ; les flèches y ramènent', () => {
    forceTvMode();
    const onActivate = vi.fn();
    render(
      <>
        <Grid count={3} onActivate={onActivate} />
        <FocusableButton>Recommencer</FocusableButton>
      </>,
      { wrapper: NavigationProvider },
    );
    const restart = getButton('Recommencer');
    act(() => {
      restart.focus();
    });

    expect(press('Enter')).toBe(false);
    expect(press(' ')).toBe(false);
    expect(onActivate).not.toHaveBeenCalled();

    expect(press('ArrowRight')).toBe(true);
    expect(getButton('Carte 1')).toHaveFocus();
  });

  it('laisse les touches d’édition aux champs de saisie ; Haut / Bas et Échap en sortent', () => {
    forceTvMode();
    const onBack = vi.fn();
    const onActivate = vi.fn();
    render(
      <>
        <Grid count={2} onBack={onBack} onActivate={onActivate} />
        <input type="text" aria-label="Prénom" />
        <textarea aria-label="Note" />
        <input type="number" aria-label="Âge" />
        <div role="textbox" aria-label="Commentaire" contentEditable tabIndex={0} />
        <input type="checkbox" aria-label="Son" />
      </>,
      { wrapper: NavigationProvider },
    );
    const firstName = screen.getByRole('textbox', { name: 'Prénom' });
    act(() => {
      firstName.focus();
    });

    for (const key of ['ArrowLeft', 'ArrowRight', 'Backspace', ' ', 'Enter']) {
      expect(press(key)).toBe(false);
    }
    expect(getCursor()).toBe('0');
    expect(onBack).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();

    expect(press('Escape')).toBe(true);
    expect(onBack).toHaveBeenCalledOnce();

    // Bloqué au bord, Bas ramène quand même le focus DOM dans la zone.
    expect(press('ArrowDown')).toBe(true);
    expect(getButton('Carte 0')).toHaveFocus();

    for (const name of ['Note', 'Âge', 'Commentaire']) {
      const field = screen.getByRole(name === 'Âge' ? 'spinbutton' : 'textbox', { name });
      act(() => {
        field.focus();
      });
      expect(press('ArrowDown')).toBe(false);
      expect(press('ArrowUp')).toBe(false);
    }
    expect(press('Escape')).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(2);

    // Une case à cocher n'est pas un champ de saisie : seul OK lui revient.
    act(() => {
      screen.getByRole('checkbox', { name: 'Son' }).focus();
    });
    expect(press(' ')).toBe(false);
    expect(press('ArrowRight')).toBe(true);
  });

  it('ne fait rien sur une grille vide, sauf signaler le bord', () => {
    forceTvMode();
    const onSelect = vi.fn();
    const onEdge = vi.fn();
    render(<Grid count={0} onSelect={onSelect} onEdge={onEdge} />, {
      wrapper: NavigationProvider,
    });

    press('Enter');
    press('ArrowDown');

    expect(onSelect).not.toHaveBeenCalled();
    expect(onEdge).toHaveBeenCalledExactlyOnceWith('down', { row: 0, col: 0 });
  });

  it('enchaîne les zones d’un écran avec onEdge ; la zone activée en dernier l’emporte', () => {
    forceTvMode();

    function StarMap() {
      const [zone, setZone] = useState<'header' | 'tiles'>('tiles');
      return (
        <>
          <NavigationProbe />
          <Grid
            count={2}
            label="Entête"
            isActive={zone === 'header'}
            onEdge={(direction) => {
              if (direction === 'down') setZone('tiles');
            }}
          />
          <Grid
            count={4}
            cols={2}
            label="Étoile"
            isActive={zone === 'tiles'}
            onEdge={(direction) => {
              if (direction === 'up') setZone('header');
            }}
          />
        </>
      );
    }

    render(<StarMap />, { wrapper: NavigationProvider });
    expect(getProbe()).toBe('dpad Étoile');

    press('ArrowRight');
    press('ArrowUp');
    expect(getProbe()).toBe('dpad Entête');
    expect(ringedLabels()).toEqual(['Entête 0']);
    expect(getButton('Entête 0')).toHaveFocus();

    press('ArrowDown');
    expect(getProbe()).toBe('dpad Étoile');
    expect(ringedLabels()).toEqual(['Étoile 1']);
  });
});

describe('Couches de navigation (ModalDialog)', () => {
  beforeAll(() => {
    MotionGlobalConfig.skipAnimations = true;
  });

  afterAll(() => {
    MotionGlobalConfig.skipAnimations = false;
  });

  function PauseActions({ onBack }: { onBack?: () => void }) {
    const actions = useGridNavigation({ scopeId: 'modal-pause', rows: 1, cols: 2, onBack });
    return ['Reprendre', 'Quitter'].map((label, index) => (
      <FocusableButton
        key={label}
        ref={actions.getItemRef(index)}
        isFocused={actions.isItemFocused(index)}
      >
        {label}
      </FocusableButton>
    ));
  }

  interface PauseScreenProps {
    withActions?: boolean;
    closable?: boolean;
    initiallyOpen?: boolean;
    onBoardBack?: () => void;
    onModalBack?: () => void;
  }

  function PauseScreen({
    withActions = true,
    closable = true,
    initiallyOpen = false,
    onBoardBack,
    onModalBack,
  }: PauseScreenProps) {
    const [isOpen, setIsOpen] = useState(initiallyOpen);
    const { dispatchBack } = useNavigation();
    return (
      <>
        <NavigationProbe />
        <Grid count={3} onBack={onBoardBack} />
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
          }}
        >
          Pause
        </button>
        <button
          type="button"
          onClick={() => {
            if (!dispatchBack()) document.title = 'Quitter';
          }}
        >
          Retour Android
        </button>
        <ModalDialog
          isOpen={isOpen}
          title="Jeu en pause"
          onClose={
            closable
              ? () => {
                  setIsOpen(false);
                }
              : undefined
          }
        >
          {withActions ? <PauseActions onBack={onModalBack} /> : <p>Pause</p>}
        </ModalDialog>
      </>
    );
  }

  function openPause(): void {
    fireEvent.click(getButton('Pause'));
  }

  /**
   * Attend la fermeture complète : React retire le DOM de la modale après l'animation de sortie,
   * puis désenregistre sa couche et sa zone au nettoyage des effets, dans une tâche séparée.
   */
  async function waitForBoard(): Promise<void> {
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(getProbe()).toBe('dpad Carte');
    });
  }

  it('suspend l’écran sous une modale, même sans zone dans la modale', () => {
    forceTvMode();
    render(<PauseScreen withActions={false} />, { wrapper: NavigationProvider });
    openPause();

    expect(getProbe()).toBe('dpad aucune');
    expect(ringedLabels()).toEqual([]);
    expect(press('ArrowRight')).toBe(false);
    expect(press('Enter')).toBe(false);
    expect(getCursor()).toBe('0');
  });

  it('donne les touches à la zone de la modale, puis les rend à l’écran à la fermeture', async () => {
    forceTvMode();
    render(<PauseScreen />, { wrapper: NavigationProvider });
    press('ArrowRight');
    openPause();

    expect(getProbe()).toBe('dpad modal-pause');
    expect(getButton('Reprendre')).toHaveFocus();
    press('ArrowRight');
    expect(ringedLabels()).toEqual(['Quitter']);
    expect(getCursor()).toBe('1');

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitForBoard();

    expect(ringedLabels()).toEqual(['Carte 1']);
    expect(getButton('Carte 1')).toHaveFocus();
  });

  it('active la zone d’une modale déjà ouverte au montage', () => {
    forceTvMode();
    render(<PauseScreen initiallyOpen />, { wrapper: NavigationProvider });

    expect(getProbe()).toBe('dpad modal-pause');
    expect(ringedLabels()).toEqual(['Reprendre']);
  });

  it('Retour : zone de la modale d’abord, sinon onClose de la modale, jamais l’écran', async () => {
    forceTvMode();
    const onBoardBack = vi.fn();
    const onModalBack = vi.fn();
    const { rerender } = render(
      <PauseScreen onBoardBack={onBoardBack} onModalBack={onModalBack} />,
      { wrapper: NavigationProvider },
    );
    openPause();

    expect(press('Backspace')).toBe(true);
    expect(onModalBack).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(<PauseScreen onBoardBack={onBoardBack} />);
    expect(press('Backspace')).toBe(true);
    await waitForBoard();

    expect(onBoardBack).not.toHaveBeenCalled();
  });

  it('Échap ferme une modale avec onClose une seule fois, sans toucher sa zone', async () => {
    forceTvMode();
    const onModalBack = vi.fn();
    render(<PauseScreen onModalBack={onModalBack} />, { wrapper: NavigationProvider });
    openPause();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitForBoard();

    expect(onModalBack).not.toHaveBeenCalled();
  });

  it('sans onClose, Échap remonte à la zone de la modale (fin de partie)', () => {
    forceTvMode();
    const onModalBack = vi.fn();
    render(<PauseScreen closable={false} onModalBack={onModalBack} initiallyOpen />, {
      wrapper: NavigationProvider,
    });

    expect(press('Escape', {}, screen.getByRole('dialog'))).toBe(true);
    expect(onModalBack).toHaveBeenCalledOnce();
  });

  it('dispatchBack route le bouton Retour Android et signale quand rien ne le gère', async () => {
    forceTvMode();
    const onBoardBack = vi.fn();
    const { rerender } = render(<PauseScreen />, { wrapper: NavigationProvider });

    fireEvent.click(getButton('Retour Android'));
    expect(document.title).toBe('Quitter');
    document.title = '';

    openPause();
    fireEvent.click(getButton('Retour Android'));
    await waitForBoard();

    rerender(<PauseScreen onBoardBack={onBoardBack} />);
    fireEvent.click(getButton('Retour Android'));
    expect(onBoardBack).toHaveBeenCalledOnce();
    expect(document.title).toBe('');
  });

  it('empile les couches imbriquées sans laisser Retour traverser la couche du dessus', () => {
    forceTvMode();
    const onOuterBack = vi.fn();
    render(
      <>
        <NavigationProbe />
        <Grid count={2} label="Écran" />
        <NavigationLayer onBack={onOuterBack}>
          <Grid count={2} label="Profils" />
          <NavigationLayer>
            <Grid count={2} label="Avatars" />
          </NavigationLayer>
        </NavigationLayer>
      </>,
      { wrapper: NavigationProvider },
    );

    expect(getProbe()).toBe('dpad Avatars');
    expect(press('Escape')).toBe(false);
    expect(onOuterBack).not.toHaveBeenCalled();
  });

  it('NavigationLayer se contente d’afficher ses enfants sans NavigationProvider', () => {
    render(
      <NavigationLayer onBack={vi.fn()}>
        <p>Contenu</p>
      </NavigationLayer>,
    );

    expect(screen.getByText('Contenu')).toBeInTheDocument();
  });
});

describe('useNavigationScope', () => {
  const VEHICLES: NavigationTarget[] = [
    { id: 'joueur', x: 1, y: 2.5 },
    { id: 'camion', x: 4.5, y: 2.5 },
    { id: 'voiture', x: 2.5, y: 5 },
  ];

  function Parking({ onSelect, onBack }: { onSelect?: () => void; onBack?: () => void }) {
    const [focusedId, setFocusedId] = useState('joueur');
    const { isFocusVisible } = useNavigationScope({
      scopeId: 'parking',
      onDirection: (direction) => {
        const from = VEHICLES.find((vehicle) => vehicle.id === focusedId) ?? VEHICLES[0];
        const others = VEHICLES.filter((vehicle) => vehicle.id !== focusedId);
        const next = from ? findNearestTarget(from, others, direction) : null;
        if (next) setFocusedId(next);
      },
      onSelect,
      onBack,
    });
    return (
      <output aria-label="Parking">{`${focusedId} ${isFocusVisible ? 'visible' : 'masqué'}`}</output>
    );
  }

  function getParking(): string {
    return screen.getByRole('status', { name: 'Parking' }).textContent;
  }

  it('pilote une zone libre avec findNearestTarget, avec réveil après le tactile', () => {
    const onSelect = vi.fn();
    const onBack = vi.fn();
    render(<Parking onSelect={onSelect} onBack={onBack} />, { wrapper: NavigationProvider });
    expect(getParking()).toBe('joueur masqué');

    expect(press('ArrowRight')).toBe(true);
    expect(getParking()).toBe('joueur visible');

    press('ArrowRight');
    expect(getParking()).toBe('camion visible');
    press('ArrowLeft');
    press('ArrowDown');
    expect(getParking()).toBe('voiture visible');

    expect(press('Enter')).toBe(true);
    expect(press('GoBack')).toBe(true);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('laisse au navigateur les touches que la zone ne gère pas', () => {
    function BackOnly() {
      useNavigationScope({ scopeId: 'retour' });
      return null;
    }

    render(<BackOnly />, { wrapper: NavigationProvider });

    expect(press('ArrowDown')).toBe(false);
    expect(press('Enter')).toBe(false);
    expect(press('Escape')).toBe(false);
  });

  it('sans ownsElement, OK sur un bouton focalisé reste au navigateur', () => {
    forceTvMode();
    const onSelect = vi.fn();
    render(
      <>
        <Parking onSelect={onSelect} />
        <FocusableButton>Indice</FocusableButton>
      </>,
      { wrapper: NavigationProvider },
    );
    act(() => {
      getButton('Indice').focus();
    });

    expect(press('Enter')).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
