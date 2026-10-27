import { DIFFICULTY_TIERS, type DifficultyTier } from '@/types/mia';
import { describe, expect, it } from 'vitest';

const EXPECTED_TIERS: DifficultyTier[] = ['very_easy', 'easy', 'medium', 'hard', 'very_hard'];

describe('DIFFICULTY_TIERS', () => {
  it('déclare exactement les 5 paliers cognitifs', () => {
    expect(Object.keys(DIFFICULTY_TIERS)).toEqual(EXPECTED_TIERS);
  });

  it('ordonne les paliers de 1 à 5', () => {
    expect(EXPECTED_TIERS.map((tier) => DIFFICULTY_TIERS[tier].order)).toEqual([1, 2, 3, 4, 5]);
  });

  it('indexe chaque palier par son propre identifiant', () => {
    for (const [key, meta] of Object.entries(DIFFICULTY_TIERS)) {
      expect(meta.id).toBe(key);
    }
  });
});
