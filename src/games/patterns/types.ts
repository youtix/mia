import type { SoundBeat } from '@/core/audio/types';

/**
 * Types du jeu Suites Logiques (FEAT-21). Le moteur est en TypeScript pur, sans React ni DOM : il
 * reste importable par un composant serveur et par le script `validate:levels`.
 */

/** Unité répétée de la suite : A-B (symétrique) ou A-B-B (asymétrique). */
export type PatternRule = 'ab' | 'abb';

/** Rôle d'un élément dans l'unité répétée. */
export type PatternRole = 'A' | 'B';

/** Famille des éléments d'une suite. */
export type PatternFamily = 'animals' | 'shapes';

/** Couleurs : une par élément (`distinct`), ou une seule et la forme les distingue (`same`). */
export type PatternColorMode = 'distinct' | 'same';

/** Réponses du défi : des pièces à placer (`visual`) ou des suites de sons à écouter (`sound`). */
export type PatternAnswerMode = 'visual' | 'sound';

/**
 * Association des éléments et des sons : chaque élément garde son son pendant toute l'étoile
 * (`fixed`, entrée en matière), ou elle change à chaque défi (`varied`) : seule la structure mène
 * à la réponse.
 */
export type PatternSoundPairing = 'fixed' | 'varied';

export interface PatternLevelConfig {
  rule: PatternRule;
  family: PatternFamily;
  colorMode: PatternColorMode;
  /**
   * Éléments de la ligne de lecture, avant la cible. Pièces : de la longueur de l'unité + 2 à
   * `MAX_VISIBLE_ITEMS` (A-B : 4 à 6 ; A-B-B : 5 ou 6). Sons : nombre de temps d'une réponse, un
   * nombre entier d'unités (A-B : 4 ; A-B-B : 3 ou 6).
   */
  visibleItems: number;
  answerMode: PatternAnswerMode;
  /** Obligatoire pour `answerMode: 'sound'`, `null` pour `visual` */
  soundPairing: PatternSoundPairing | null;
  /** Défis de l'étoile, enchaînés sans écran de fin */
  rounds: number;
  /** Défis ouverts par un STOP, tirés au hasard à chaque partie */
  stopRounds: number;
  /** Durée d'un STOP (prévu, ou déclenché par une erreur trop rapide) */
  stopSeconds: number;
  /** Main fantôme sur la bonne réponse au premier défi : apprend le geste sans texte */
  hasGuide: boolean;
}

/** Animaux de la famille `animals`. */
export type PatternAnimalId =
  'cat' | 'dog' | 'fish' | 'bird' | 'rabbit' | 'turtle' | 'squirrel' | 'snail';

/** Formes pleines de la famille `shapes`. */
export type PatternShapeId =
  'circle' | 'square' | 'triangle' | 'star' | 'heart' | 'diamond' | 'hexagon' | 'cross';

export type PatternItemId = PatternAnimalId | PatternShapeId;

/** Élément d'une suite : données seules, l'icône est associée par `PatternItemIcon`. */
export interface PatternItem {
  id: PatternItemId;
  /** Couleur de l'élément (classe Tailwind `text-*`) */
  colorClass: string;
}

/** Proposition de réponse : une pièce à placer. */
export interface PatternItemChoice {
  kind: 'item';
  item: PatternItem;
}

/** Proposition de réponse : une suite de sons à écouter (mêmes sons et même durée pour les trois). */
export interface PatternSoundChoice {
  kind: 'sound';
  beats: readonly SoundBeat[];
}

export type PatternChoice = PatternItemChoice | PatternSoundChoice;

export interface PatternRound {
  /** Ligne de lecture, de gauche à droite ; la cible vide la termine */
  row: readonly PatternItem[];
  /** Les propositions, toujours au nombre de `CHOICE_COUNT` */
  choices: readonly PatternChoice[];
  /** Index de la bonne réponse dans `choices` */
  correctIndex: number;
  /** Ce défi s'ouvre par un STOP */
  startsWithStop: boolean;
}

/**
 * Déroulé d'une étoile : `intro` (la ligne apparaît, propositions inertes), éventuellement `stop`,
 * puis `choosing`, entrecoupé de `listening` pour les sons, jusqu'à `success` ; le défi suivant
 * repart de `intro`, et le dernier mène à `won`. Une erreur trop rapide ramène à `stop`.
 */
export type PatternPhase = 'intro' | 'stop' | 'choosing' | 'listening' | 'success' | 'won';

export interface PatternGameState {
  config: PatternLevelConfig;
  phase: PatternPhase;
  /** Tous les défis de l'étoile, tirés à la création de la partie */
  rounds: readonly PatternRound[];
  /** Défi en cours (`rounds[roundIndex]`) */
  round: PatternRound;
  roundIndex: number;
  /** Sons : proposition écoutée (`listening`) ou prête à être validée (`choosing`) */
  armedIndex: number | null;
  /** Mauvaises réponses du défi en cours : nourrit l'échelle d'aide (`getHelpLevel`) */
  roundMistakes: number;
  /** Mauvaises réponses de l'étoile */
  mistakes: number;
  /** Tapes pendant un STOP : font perdre la couronne, sans abréger ni allonger la pause */
  impulsiveTaps: number;
  /** Réponses validées, bonnes ou mauvaises */
  moves: number;
  /** Instant du dernier déverrouillage (horloge de l'appelant) : mesure une erreur trop rapide */
  unlockedAtMs: number;
  /** Dernière mauvaise réponse, tant que le défi dure : la pièce qui rebondit */
  lastWrongIndex: number | null;
  /** Compteur de mauvaises réponses : relance le rebond, même sur la même pièce */
  wrongTick: number;
}
