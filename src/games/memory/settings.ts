import type { MemoryGameSettings } from '@/types/mia';
import type { MemoryLevelConfig } from './types';

/**
 * Réglages de Memory d'un profil (FEAT-19) : fonctions pures, sans React ni DOM, qui appliquent
 * les facteurs de temps du joueur à un niveau du catalogue. Le catalogue reste la référence (une
 * étoile sans aperçu n'en gagne jamais) et la progression (étoiles, couronnes) n'en dépend pas.
 */

/**
 * Configuration jouée : l'aperçu du niveau multiplié par `previewFactor` (5 s × 0,5 = 2,5 s ;
 * 0 reste 0). Renvoie `config` lui-même quand rien ne change (×1 ou niveau sans aperçu).
 */
export function applyMemorySettings(
  config: MemoryLevelConfig,
  settings: MemoryGameSettings,
): MemoryLevelConfig {
  const previewSeconds = config.previewSeconds * settings.previewFactor;
  return previewSeconds === config.previewSeconds ? config : { ...config, previewSeconds };
}

/** Durée d'affichage des cartes d'une erreur : délai de base (900 ms) multiplié par `mismatchFactor`. */
export function getMismatchDelayMs(baseDelayMs: number, settings: MemoryGameSettings): number {
  return baseDelayMs * settings.mismatchFactor;
}
