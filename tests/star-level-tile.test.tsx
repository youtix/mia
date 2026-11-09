import { StarLevelTile, formatMoves, formatSpeed, getBestScore } from '@/components/progression';
import { BEST_SCORE_KINDS } from '@/components/progression/labels';
import type { EnrichedLevelItem } from '@/core/progression';
import { GAME_REGISTRY } from '@/core/progression';
import type { GameId, LevelCompletion } from '@/types/mia';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function completion(overrides: Partial<LevelCompletion> = {}): LevelCompletion {
  return {
    levelId: 'x-001',
    completed: true,
    isPerfect: false,
    bestMoves: 12,
    bestTimeSeconds: 1.25,
    timesPlayed: 1,
    completedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

function level(
  gameId: GameId,
  overrides: Partial<EnrichedLevelItem> = {},
  entry: LevelCompletion | null = completion(),
): EnrichedLevelItem {
  return {
    definition: { id: 'x-001', gameId, tier: 'very_easy', order: 10, config: {} },
    starNumber: 3,
    globalIndex: 2,
    isUnlocked: true,
    isCompleted: entry?.completed === true,
    isPerfect: false,
    completion: entry,
    ...overrides,
  };
}

describe('formatSpeed', () => {
  it.each([
    [1.2, '1,2 s'],
    [1.25, '1,3 s'],
    [1.23, '1,2 s'],
    [3, '3 s'],
    [2.04, '2 s'],
  ])('écrit %s seconde(s) « %s »', (seconds, text) => {
    expect(formatSpeed(seconds)).toBe(text);
  });
});

describe('getBestScore', () => {
  it('donne les coups pour un jeu ordinaire', () => {
    expect(getBestScore(level('memory'))).toEqual({
      announcement: ', meilleur score :',
      text: formatMoves(12),
    });
  });

  it('donne la vitesse tenue pour Pas si vite !, jamais les pièges touchés', () => {
    expect(getBestScore(level('go-no-go'))).toEqual({
      announcement: ', vitesse tenue :',
      text: '1,3 s',
    });
  });

  it('chaque jeu du registre déclare ce que montre son étoile : seul Pas si vite ! montre une vitesse', () => {
    expect(Object.keys(BEST_SCORE_KINDS).sort()).toEqual(Object.keys(GAME_REGISTRY).sort());
    expect(Object.entries(BEST_SCORE_KINDS).filter(([, kind]) => kind === 'heldSpeed')).toEqual([
      ['go-no-go', 'heldSpeed'],
    ]);
  });

  it('ne donne rien tant que l’étoile n’est pas réussie', () => {
    expect(getBestScore(level('go-no-go', {}, null))).toBeNull();
    expect(getBestScore(level('go-no-go', {}, completion({ completed: false })))).toBeNull();
    expect(getBestScore(level('memory', { isCompleted: false }))).toBeNull();
  });
});

describe('StarLevelTile', () => {
  function renderTile(gameId: GameId) {
    return render(<StarLevelTile level={level(gameId)} onPlay={vi.fn()} onLocked={vi.fn()} />);
  }

  it('montre la vitesse tenue de Pas si vite ! sous le numéro, et la dit à voix haute', () => {
    renderTile('go-no-go');
    const tile = screen.getByRole('button');
    expect(tile).toHaveAccessibleName('Étoile #3, réussie, vitesse tenue : 1,3 s');
    expect(tile).toHaveTextContent('1,3 s');
    expect(tile).not.toHaveTextContent('coup');
  });

  it('montre les coups des autres jeux, comme avant', () => {
    renderTile('bear-sort');
    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Étoile #3, réussie, meilleur score : 12 coups',
    );
  });
});
