// @vitest-environment node
import { DEFAULT_MEMORY_GAME_SETTINGS } from '@/core/storage';
import { applyMemorySettings, getMismatchDelayMs } from '@/games/memory/settings';
import type { MemoryLevelConfig } from '@/games/memory/types';
import { TIME_FACTORS, type MemoryGameSettings, type TimeFactor } from '@/types/mia';
import { describe, expect, it } from 'vitest';

/** Étoile #1 : 2 × 2 en paires, avec le socle d'aperçu uniforme du catalogue (5 s). */
const PREVIEW_CONFIG: MemoryLevelConfig = {
  cols: 2,
  rows: 2,
  matchSize: 2,
  visualMode: 'distinct_color_shape',
  previewSeconds: 5,
  maxMistakes: null,
  swapEveryNMistakes: null,
  perfectMaxMistakes: 0,
};

/** Étoile « Sans aperçu » : même grille, `previewSeconds` à 0. */
const NO_PREVIEW_CONFIG: MemoryLevelConfig = { ...PREVIEW_CONFIG, previewSeconds: 0 };

function settings(overrides: Partial<MemoryGameSettings> = {}): MemoryGameSettings {
  return { ...DEFAULT_MEMORY_GAME_SETTINGS, ...overrides };
}

describe('applyMemorySettings', () => {
  it('renvoie la configuration elle-même avec les réglages par défaut (× 1)', () => {
    expect(DEFAULT_MEMORY_GAME_SETTINGS).toEqual({ previewFactor: 1, mismatchFactor: 1 });
    expect(applyMemorySettings(PREVIEW_CONFIG, DEFAULT_MEMORY_GAME_SETTINGS)).toBe(PREVIEW_CONFIG);
    // Le facteur des erreurs ne concerne pas la configuration du niveau.
    expect(applyMemorySettings(PREVIEW_CONFIG, settings({ mismatchFactor: 2 }))).toBe(
      PREVIEW_CONFIG,
    );
  });

  it.each(TIME_FACTORS)(
    'ne donne jamais d’aperçu à une étoile qui n’en a pas (× %s : 0 reste 0)',
    (previewFactor) => {
      expect(applyMemorySettings(NO_PREVIEW_CONFIG, settings({ previewFactor }))).toBe(
        NO_PREVIEW_CONFIG,
      );
    },
  );

  it('multiplie l’aperçu (5 s × 1,5 = 7,5 s) sans toucher au reste ni à la configuration', () => {
    const config: MemoryLevelConfig = Object.freeze({ ...PREVIEW_CONFIG });

    const played = applyMemorySettings(config, settings({ previewFactor: 1.5 }));

    expect(played).not.toBe(config);
    expect(played).toEqual({ ...PREVIEW_CONFIG, previewSeconds: 7.5 });
    expect(config).toEqual(PREVIEW_CONFIG);
  });

  it.each<[TimeFactor, number]>([
    [0.5, 2.5],
    [1.5, 7.5],
    [2, 10],
  ])('joue un aperçu de 5 s × %s = %s s', (previewFactor, previewSeconds) => {
    expect(applyMemorySettings(PREVIEW_CONFIG, settings({ previewFactor }))).toMatchObject({
      previewSeconds,
    });
  });
});

describe('getMismatchDelayMs', () => {
  it.each<[TimeFactor, number]>([
    [0.5, 450],
    [1, 900],
    [1.5, 1350],
    [2, 1800],
  ])('multiplie les 900 ms d’une erreur par %s : %i ms', (mismatchFactor, delayMs) => {
    expect(getMismatchDelayMs(900, settings({ mismatchFactor }))).toBe(delayMs);
  });

  it('ignore le facteur de l’aperçu', () => {
    expect(getMismatchDelayMs(900, settings({ previewFactor: 2 }))).toBe(900);
  });
});
