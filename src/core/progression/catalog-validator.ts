import { DIFFICULTY_TIERS, type GameId } from '@/types/mia';
import type { BaseLevelDefinition, CatalogValidationResult } from './types';

/** Identifiant de niveau : minuscules et chiffres, mots séparés par un tiret (ex: « mem-001 »). */
export const LEVEL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Règles communes à tous les catalogues, reprises par le validateur de chaque jeu et par
 * `npm run validate:levels` : identifiant au format `LEVEL_ID_PATTERN` et unique, niveau du jeu
 * attendu, palier connu, `order` fini et unique dans son palier (un nouveau niveau s'intercale
 * toujours sans ambiguïté). Un message français par anomalie.
 */
export function validateLevelCatalog(
  gameId: GameId,
  catalog: readonly BaseLevelDefinition[],
): CatalogValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  /** `palier/order` → identifiant du premier niveau qui l'occupe */
  const places = new Map<string, string>();

  for (const [index, level] of catalog.entries()) {
    const name = `niveau n° ${String(index + 1)} « ${level.id} »`;
    if (!LEVEL_ID_PATTERN.test(level.id)) {
      errors.push(
        `${name} : identifiant invalide (minuscules, chiffres et tirets, ex: « mem-001 »)`,
      );
    } else if (ids.has(level.id)) {
      errors.push(`${name} : identifiant en double`);
    }
    ids.add(level.id);

    if (level.gameId !== gameId) {
      errors.push(`${name} : niveau du jeu « ${level.gameId} » au lieu de « ${gameId} »`);
    }
    if (!Object.hasOwn(DIFFICULTY_TIERS, level.tier)) {
      errors.push(`${name} : palier « ${level.tier} » inconnu`);
    }

    const order = String(level.order);
    if (!Number.isFinite(level.order)) {
      errors.push(`${name} : order ${order} invalide (nombre fini attendu)`);
      continue;
    }
    const place = `${level.tier}/${order}`;
    const holder = places.get(place);
    if (holder === undefined) {
      places.set(place, level.id);
    } else {
      errors.push(
        `${name} : order ${order} déjà pris par « ${holder} » dans le palier « ${level.tier} »`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
