import type { BearSortRule, ForbiddenBears } from './types';
import script from './voice-script.json';

/**
 * Texte de chaque phrase de la mascotte (FEAT-22). Le JSON est lu aussi par
 * `scripts/generate-voice-clips.py`, qui en tire les fichiers de `public/audio/bear-sort/` ; après
 * un changement de texte, relancer ce script (`voice-manifest.json` vérifie l'accord en test).
 */
export type BearSortClipId = keyof typeof script;

export const VOICE_SCRIPT: Readonly<Record<BearSortClipId, string>> = script;

export const BEAR_SORT_CLIP_IDS = Object.keys(script) as BearSortClipId[];

/** Chemin d'un clip relatif à la racine de l'export (`basePath` ajouté par le service audio). */
export function getVoiceClipPath(id: BearSortClipId): string {
  return `audio/bear-sort/${id}.mp3`;
}

function getExceptClipId(forbidden: ForbiddenBears): BearSortClipId {
  if (forbidden.color === undefined) return `rule-except-${forbidden.size}`;
  if (forbidden.size === undefined) return `rule-except-${forbidden.color}`;
  return `rule-except-${forbidden.size}-${forbidden.color}`;
}

/** Phrase qui annonce une règle, rejouée à chaque rappel. */
export function getRuleClipId(rule: BearSortRule): BearSortClipId {
  if (rule.kind === 'except') return getExceptClipId(rule.forbidden);
  return rule.feature === 'color' ? 'rule-color' : 'rule-size';
}
