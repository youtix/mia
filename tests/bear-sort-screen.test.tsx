import BearSortPage, { metadata } from '@/app/bear-sort/page';
import type { GameScreenProps, LevelControls } from '@/components/progression/GameScreen';
import { GAME_REGISTRY, type EnrichedLevelItem } from '@/core/progression';
import { BEAR_SORT_CATALOG, BearSortBoard, type BearSortLevelConfig } from '@/games/bear-sort';
import { BearSortGameScreen } from '@/games/bear-sort/BearSortGameScreen';
import { render } from '@testing-library/react';
import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gameScreen = vi.hoisted(() => vi.fn());

// La porte de l'écran (joueur, étoile verrouillée) est couverte par tests/star-map.test.tsx : ici, ce
// que la page d'Attrape-Piège lui confie.
vi.mock('@/components/progression/GameScreen', () => ({
  GameScreen: (props: unknown) => {
    gameScreen(props);
    return null;
  },
}));

function getScreenProps(): GameScreenProps<BearSortLevelConfig> {
  const props: unknown = gameScreen.mock.lastCall?.[0];
  if (!props) throw new Error('GameScreen n’a pas été rendu');
  return props as GameScreenProps<BearSortLevelConfig>;
}

beforeEach(() => {
  gameScreen.mockClear();
});

describe('BearSortGameScreen (FEAT-25)', () => {
  it('branche GameScreen sur Attrape-Piège : identifiant, catalogue et plateau', () => {
    render(<BearSortGameScreen />);
    const { gameId, catalog, renderLevel } = getScreenProps();

    // La sauvegarde range la progression sous cet identifiant : un autre égarerait les étoiles.
    expect(gameId).toBe('bear-sort');
    expect(catalog).toBe(BEAR_SORT_CATALOG);
    expect(new Set(BEAR_SORT_CATALOG.map((level) => level.gameId))).toEqual(new Set([gameId]));

    const level = { starNumber: 1 } as EnrichedLevelItem<BearSortLevelConfig>;
    const controls = { exitToMap: vi.fn() } as unknown as LevelControls<BearSortLevelConfig>;
    const board = renderLevel?.(level, controls);
    expect(isValidElement(board)).toBe(true);
    expect(board).toMatchObject({ type: BearSortBoard, props: { level, controls } });
  });
});

describe('Page /bear-sort', () => {
  it('rend l’écran du jeu, sous le titre du registre', () => {
    render(<BearSortPage />);

    expect(getScreenProps().gameId).toBe('bear-sort');
    expect(metadata.title).toBe(GAME_REGISTRY['bear-sort'].title);
  });
});
