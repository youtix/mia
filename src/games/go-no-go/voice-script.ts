import { getVoiceClipPath as getBearSortClipPath } from '@/games/bear-sort/voice-script';
import { isImageId } from './subjects';
import type { GoNoGoLevelConfig, ImageId, SubjectId } from './types';
import manifest from './voice-manifest.json';
import script from './voice-script.json';

/**
 * Phrases propres à Pas si vite ! (FEAT-28 §11.2), dites par la chouette d'Attrape-Piège avec la même
 * voix (FEAT-22). Le JSON est lu aussi par `scripts/generate-voice-clips.py`, qui en tire les fichiers
 * de `public/audio/go-no-go/` ; après un changement de texte, relancer ce script (`voice-manifest.json`
 * vérifie l'accord en test). Quatre phrases d'Attrape-Piège sont reprises telles quelles (`SHARED_CLIPS`).
 */
export type GoNoGoClipId = keyof typeof script;

export const VOICE_SCRIPT: Readonly<Record<GoNoGoClipId, string>> = script;

export const GO_NO_GO_CLIP_IDS = Object.keys(script) as GoNoGoClipId[];

/** Chemin d'un clip relatif à la racine de l'export (`basePath` ajouté par le service audio). */
export function getVoiceClipPath(id: GoNoGoClipId): string {
  return `audio/go-no-go/${id}.mp3`;
}

/**
 * Phrases nouvelles réellement générées : celles du manifeste que `generate-voice-clips.py` réécrit. Tant
 * qu'il est vide (aucun clip n'a encore été généré ni écouté), le jeu ne demande aucun fichier absent :
 * la chouette est mimée, les phrases reprises d'Attrape-Piège sont dites. Une fois les clips générés, le
 * manifeste les liste et la voix s'active sans toucher au jeu.
 */
const GENERATED_CLIP_PATHS: ReadonlySet<string> = new Set(
  Object.keys(manifest.clips).map((id) => `audio/go-no-go/${id}.mp3`),
);

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

/** Le clip de ce chemin existe-t-il ? Une phrase d'Attrape-Piège reprise, ou une phrase nouvelle générée. */
export function isClipAvailable(path: string): boolean {
  return Object.values<string>(SHARED_CLIPS).includes(path) || GENERATED_CLIP_PATHS.has(path);
}

/** Phrase de rappel de la règle de l'étoile (§9) : au palier 4, la chouette prévient qu'elle tend un piège. */
export function getRuleClipId({ rule, hasLure }: GoNoGoLevelConfig): GoNoGoClipId {
  if (hasLure) return 'rule-lure';
  if (rule === 'owl-says') return 'rule-owl-says';
  return rule === 'flies' ? 'rule-flies' : 'rule-late-stop';
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
    getVoiceClipPath(getRuleClipId(config)),
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
