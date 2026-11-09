import { getVoiceClipPath as getBearSortClipPath } from '@/games/bear-sort/voice-script';
import { isImageId } from './subjects';
import type { GoNoGoLevelConfig, ImageId, SubjectId } from './types';
import script from './voice-script.json';

/**
 * Phrases propres à Pas si vite ! (FEAT-28 §11.2), dites par la chouette d'Attrape-Piège avec la même
 * voix (FEAT-22). Le JSON est lu aussi par `scripts/generate-voice-clips.py`, qui en tire les fichiers
 * de `public/audio/go-no-go/` et réécrit `voice-manifest.json` ; les tests exigent que le manifeste
 * liste exactement ces phrases, chacune avec son MP3. Après un changement de texte, relancer ce script.
 * Quatre phrases d'Attrape-Piège sont reprises telles quelles (`SHARED_CLIPS`).
 */
export type GoNoGoClipId = keyof typeof script;

export const VOICE_SCRIPT: Readonly<Record<GoNoGoClipId, string>> = script;

export const GO_NO_GO_CLIP_IDS = Object.keys(script) as GoNoGoClipId[];

/** Dossier des phrases propres au jeu, relatif à la racine de l'export. */
export const VOICE_CLIP_PREFIX = 'audio/go-no-go/';

/** Chemin d'un clip relatif à la racine de l'export (`basePath` ajouté par le service audio). */
export function getVoiceClipPath(id: GoNoGoClipId): string {
  return `${VOICE_CLIP_PREFIX}${id}.mp3`;
}

/**
 * Phrases d'Attrape-Piège reprises telles quelles (FEAT-22) : l'erreur d'un piège touché (« Oh, ton
 * cerveau a voulu te piéger. »), l'indice « Regarde bien. », l'étoile gagnée et la couronne.
 */
export const SHARED_CLIPS = {
  trapped: getBearSortClipPath('bounce-trap'),
  lookCarefully: getBearSortClipPath('hint-look'),
  starWon: getBearSortClipPath('star-won'),
  crownWon: getBearSortClipPath('crown-won'),
} as const;

/**
 * Phrases de rappel de la règle de l'étoile (§9), dans l'ordre où la chouette les dit : au palier 4,
 * elle prévient qu'elle tend un piège ; aux étoiles 19 et 20, « Ça vole ? » et le STOP tardif sont
 * mêlés, elle dit les deux règles (« Tape seulement si ça vole ! », puis « Tape, sauf si le STOP
 * arrive ! ») : la voix seule suffit à jouer, comme la phrase des lecteurs d'écran (§4.3).
 */
export function getRuleClipIds({ rule, hasLure, traps }: GoNoGoLevelConfig): GoNoGoClipId[] {
  if (hasLure) return ['rule-lure'];
  if (rule === 'owl-says') return ['rule-owl-says'];
  if (rule === 'flies') return ['rule-flies'];
  return traps > 0 ? ['rule-flies', 'rule-late-stop'] : ['rule-late-stop'];
}

/** Chemins des phrases de rappel de la règle (`getRuleClipIds`). */
export function getRuleClipPaths(config: GoNoGoLevelConfig): string[] {
  return getRuleClipIds(config).map(getVoiceClipPath);
}

/** « Vache vole ! » : ce que dit la chouette de chaque image au palier 4, cibles comme pièges. */
export function getLureClipId(image: ImageId): GoNoGoClipId {
  return `lure-${image}`;
}

/**
 * Chemins des phrases que cette étoile peut dire en jouant (hors démo), à charger avant le départ : la
 * phrase de rappel d'abord, puis l'erreur et l'indice d'un piège touché, la victoire et, au palier 4,
 * le « … vole ! » de chaque image de la file.
 */
export function getStarClipPaths(
  config: GoNoGoLevelConfig,
  subjects: readonly SubjectId[],
): string[] {
  const paths = [
    ...getRuleClipPaths(config),
    SHARED_CLIPS.trapped,
    SHARED_CLIPS.lookCarefully,
    SHARED_CLIPS.starWon,
    SHARED_CLIPS.crownWon,
  ];
  if (config.hasLure) {
    for (const subject of new Set(subjects)) {
      if (isImageId(subject)) paths.push(getVoiceClipPath(getLureClipId(subject)));
    }
  }
  return paths;
}
