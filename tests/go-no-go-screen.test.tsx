import GoNoGoPage, { metadata } from '@/app/go-no-go/page';
import type { GameScreenProps, LevelControls } from '@/components/progression/GameScreen';
import { GAME_REGISTRY, type EnrichedLevelItem } from '@/core/progression';
import { GO_NO_GO_CATALOG } from '@/games/go-no-go/catalog';
import { GoNoGoBoard } from '@/games/go-no-go/components';
import { GoNoGoGameScreen } from '@/games/go-no-go/GoNoGoGameScreen';
import type { GoNoGoLevelConfig } from '@/games/go-no-go/types';
import { render } from '@testing-library/react';
import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gameScreen = vi.hoisted(() => vi.fn());

// La porte de l'écran (joueur, étoile verrouillée) est couverte par tests/star-map.test.tsx : ici, ce
// que la page de Pas si vite ! lui confie.
vi.mock('@/components/progression/GameScreen', () => ({
  GameScreen: (props: unknown) => {
    gameScreen(props);
    return null;
  },
}));

function getScreenProps(): GameScreenProps<GoNoGoLevelConfig> {
  const props: unknown = gameScreen.mock.lastCall?.[0];
  if (!props) throw new Error('GameScreen n’a pas été rendu');
  return props as GameScreenProps<GoNoGoLevelConfig>;
}

beforeEach(() => {
  gameScreen.mockClear();
});

describe('GoNoGoGameScreen (FEAT-28)', () => {
  it('branche GameScreen sur Pas si vite ! : identifiant, catalogue et plateau', () => {
    render(<GoNoGoGameScreen />);
    const { gameId, catalog, renderLevel } = getScreenProps();

    // La sauvegarde range la progression sous cet identifiant : un autre égarerait les étoiles.
    expect(gameId).toBe('go-no-go');
    expect(catalog).toBe(GO_NO_GO_CATALOG);
    expect(new Set(GO_NO_GO_CATALOG.map((level) => level.gameId))).toEqual(new Set([gameId]));

    const level = { starNumber: 1 } as EnrichedLevelItem<GoNoGoLevelConfig>;
    const controls = { exitToMap: vi.fn() } as unknown as LevelControls<GoNoGoLevelConfig>;
    const board = renderLevel?.(level, controls);
    expect(isValidElement(board)).toBe(true);
    expect(board).toMatchObject({ type: GoNoGoBoard, props: { level, controls } });
  });
});

describe('Page /go-no-go', () => {
  it('rend l’écran du jeu, sous le titre du registre', () => {
    render(<GoNoGoPage />);

    expect(getScreenProps().gameId).toBe('go-no-go');
    expect(metadata.title).toBe(GAME_REGISTRY['go-no-go'].title);
    expect(metadata.title).toBe('Pas si vite !');
  });
});
