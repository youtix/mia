import { NavigationProvider } from '@/core/navigation';
import { getGameProgressSummary } from '@/core/progression';
import { BearSortBoard, type BearSortLevelConfig } from '@/games/bear-sort';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as FramerMotion from 'framer-motion';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const audio = vi.hoisted(() => ({
  setEnabled: vi.fn(),
  preloadClips: vi.fn(() => Promise.resolve()),
  playClips: vi.fn(() => Promise.resolve()),
  stopClips: vi.fn(),
  playEffect: vi.fn(),
}));

const pulses = vi.hoisted(() => ({ start: vi.fn() }));

vi.mock('@/core/audio', () => ({ useGameAudio: () => audio }));

// Chaque boîte reçoit ses vrais contrôles, et garde les mêmes : seul leur `start` est observé.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof FramerMotion>();
  const observed = new WeakSet();
  return {
    ...actual,
    useAnimationControls: () => {
      const controls = actual.useAnimationControls();
      if (!observed.has(controls)) {
        observed.add(controls);
        const start = controls.start.bind(controls);
        controls.start = (...args) => {
          pulses.start(args[0]);
          return start(...args);
        };
      }
      return controls;
    },
  };
});

const CONFIG: BearSortLevelConfig = {
  zones: [
    { color: 'blue', size: 'small' },
    { color: 'yellow', size: 'big' },
  ],
  phases: [
    {
      rule: { kind: 'sort', feature: 'color' },
      addBears: { 'blue-small': 2, 'blue-big': 1, 'yellow-big': 1 },
      placements: null,
    },
  ],
  showGestureHint: true,
};

/** Ours en (150, 400), de 50 px ; boîte de gauche en (0, 0), de droite en (300, 0), de 100 px. */
function mockLayout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.dataset.bearUid !== undefined) return new DOMRect(150, 400, 50, 50);
    if (this.dataset.zoneId === 'left') return new DOMRect(0, 0, 100, 100);
    if (this.dataset.zoneId === 'right') return new DOMRect(300, 0, 100, 100);
    return new DOMRect(0, 0, 500, 500);
  });
}

function renderBoard() {
  const summary = getGameProgressSummary(
    'bear-sort',
    [{ id: 'bs-001', gameId: 'bear-sort', tier: 'very_easy', order: 10, config: CONFIG }],
    null,
  );
  const level = summary.allLevels[0];
  if (!level) throw new Error('Niveau absent');
  const controls = {
    summary,
    playLevel: vi.fn(),
    exitToMap: vi.fn(),
    recordVictory: vi.fn(() => Promise.resolve()),
  };
  render(<BearSortBoard level={level} controls={controls} />, { wrapper: NavigationProvider });
}

function getBears(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('button[data-bear-uid]'));
}

function placeNextBear(boxName: string): void {
  const [bear] = getBears();
  if (!bear) throw new Error('Plus aucun ours');
  fireEvent.click(bear);
  fireEvent.click(screen.getByRole('button', { name: boxName }));
}

// Lu une fois, au premier composant animé du fichier : le réglage du système vaut pour tout ce fichier.
beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Animations réduites par le système', () => {
  it('garde la main du geste sur l’ours à prendre, pas sur la boîte où toucher ne fait rien', async () => {
    mockLayout();
    renderBoard();

    const hand = await waitFor(() => {
      const element = document.querySelector('[data-gesture-hand]');
      expect(element).not.toBeNull();
      return element;
    });
    // Le temps de plusieurs images : sans déplacement possible, la main sauterait à sa fin de course.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(hand).toHaveStyle({ transform: 'translateX(175px) translateY(425px)' });
  });
});

describe('Pulsation de la boîte', () => {
  it('repart à chaque ours rangé, même si la précédente n’est pas finie', () => {
    renderBoard();
    expect(pulses.start).not.toHaveBeenCalled();

    placeNextBear('Petite boîte bleue');
    expect(pulses.start).toHaveBeenCalledOnce();

    placeNextBear('Petite boîte bleue');
    expect(pulses.start).toHaveBeenCalledTimes(2);
    expect(pulses.start.mock.lastCall?.[0]).toMatchObject({ scale: [null, 1.06, 1] });
  });
});
