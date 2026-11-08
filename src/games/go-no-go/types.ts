/** Règle d'une étoile (FEAT-28 §4) : « La chouette a dit », « Ça vole ? » (avec ou sans leurre), STOP tardif. */
export type GoNoGoRule = 'owl-says' | 'flies' | 'late-stop';

/** Personnages du castelet (règle 1) : la chouette est la cible, les deux autres des imposteurs. */
export type PuppetId = 'owl' | 'fox' | 'cat';
export type DecoyId = Exclude<PuppetId, 'owl'>;

/** Images qui volent vraiment : les cibles des règles 2 et 3 (FEAT-28 §4.2). */
export type FlyingImageId = 'pigeon' | 'plane' | 'helicopter' | 'butterfly' | 'bee' | 'rocket';

/** Images qui ne volent pas : les pièges de la règle 2. */
export type GroundedImageId =
  | 'cow'
  | 'pig'
  | 'dog'
  | 'fish'
  | 'snail'
  | 'turtle'
  | 'car'
  | 'train'
  | 'boat'
  | 'chair'
  | 'house'
  | 'tree';

export type ImageId = FlyingImageId | GroundedImageId;

/** Ce qui entre sur la scène : un personnage du castelet, ou une image. */
export type SubjectId = PuppetId | ImageId;

/**
 * Ce qu'une apparition demande à l'enfant : appuyer (`target`), se retenir (`trap`), ou appuyer
 * seulement tant que le STOP n'est pas arrivé (`stop`, règle 3).
 */
export type AppearanceKind = 'target' | 'trap' | 'stop';

/** Une apparition de la file : stable à travers ses remises (`id`). */
export interface Appearance {
  /** Numéro dans l'étoile (1 à `appearances`), clé de rendu et identité de la remise */
  id: number;
  kind: AppearanceKind;
  subject: SubjectId;
  /** Cachette du castelet (règle 1) : de 0 à 2, toujours 0 avec une seule cachette */
  hideout: number;
}

/** Introduction de la première étoile de chaque règle : démo complète, ou courte (leurre, ⭐ 13). */
export type GoNoGoIntro = 'full' | 'lure';

export interface GoNoGoLevelConfig {
  rule: GoNoGoRule;
  /** Apparitions prévues, remises exclues (une perle de la guirlande chacune) */
  appearances: number;
  /** Pièges parmi elles : imposteurs (règle 1) ou images qui ne volent pas (règles 2 et 3 mêlées) */
  traps: number;
  /** STOP tardifs parmi elles (règle 3) */
  stops: number;
  /** Fenêtre de départ, en ms */
  startWindowMs: number;
  /** Vitesse maximale de l'étoile : la fenêtre ne descend pas en dessous, en ms */
  fastestWindowMs: number;
  /** Cachettes du castelet (règle 1) : une, ou trois qui demandent d'orienter l'attention */
  hideouts: 1 | 3;
  /** Imposteurs de la règle 1, dans l'ordre où le catalogue les introduit */
  decoys: readonly DecoyId[];
  /** Palier 4 : la chouette bat des ailes et annonce chaque image, cible ou piège */
  hasLure: boolean;
  /** Délai maximal du STOP tardif depuis l'entrée, en ms ; `null` hors règle 3 */
  stopDelayCeilingMs: number | null;
  /** Démo et essais guidés tant que l'étoile n'est pas gagnée, essais seuls ensuite ; `null` : un rappel */
  intro: GoNoGoIntro | null;
  /** Pièges consécutifs permis dans la file : 1 aux paliers 1 et 2, 2 ensuite */
  maxTrapRun: 1 | 2;
}

/** Les quatre issues d'une apparition (FEAT-28 §3.1). */
export type GoNoGoOutcome = 'caught' | 'missed' | 'trapped' | 'passed';

export type GoNoGoStatus = 'between' | 'window' | 'won';

/** Échelon d'aide d'une apparition (FEAT-28 §6.4) : les erreurs d'affilée de sa famille, jusqu'à 3. */
export type HelpStage = 0 | 1 | 2 | 3;

/** Paramètres d'une apparition sur scène, figés à son entrée. */
export interface Presentation {
  /** Fenêtre d'appui en ms depuis l'entrée ; `null` : la cible attend sans limite de temps (échelon 3) */
  windowMs: number | null;
  /** Délai d'arrivée du STOP en ms depuis l'entrée ; `null` hors STOP tardif */
  stopAtMs: number | null;
  help: HelpStage;
  /** Le piège (ou le STOP) entre plus lentement, sa fenêtre est plus longue (échelon 2) */
  isSlow: boolean;
  /** Le piège porte le signe « non » gris (échelon 3) */
  hasNoBadge: boolean;
  /** Le buzzer pulse (cible, échelon 2) */
  pulsesBuzzer: boolean;
  /** La main fantôme montre le geste (cible qui attend, échelon 3) */
  showsHand: boolean;
}

/** Dernière apparition résolue : ce que l'écran doit montrer, et ce que la voix doit dire. */
export interface AppearanceResult {
  appearance: Appearance;
  outcome: GoNoGoOutcome;
  /** Échelon d'aide atteint par la famille d'erreurs de cette issue (0 si c'est une réussite) */
  help: HelpStage;
}

export interface GoNoGoState {
  config: GoNoGoLevelConfig;
  status: GoNoGoStatus;
  /** Apparitions à venir, dans l'ordre ; les remises y sont insérées */
  queue: readonly Appearance[];
  /** Apparition sur scène (`window`) ; `null` entre deux apparitions */
  current: Appearance | null;
  /** Paramètres de l'apparition sur scène, `null` hors `window` */
  presentation: Presentation | null;
  /** Fenêtre de la cadence, en ms : accélère après 3 réussites, ralentit à chaque erreur */
  windowMs: number;
  /** Délai du STOP tardif, en ms (règle 3) */
  stopDelayMs: number;
  /** Réussites depuis la dernière accélération ou erreur : à 3, la fenêtre raccourcit */
  paceStreak: number;
  /** Réussites d'affilée : à 8, la fenêtre en cours devient la vitesse tenue */
  runLength: number;
  /** Fenêtre la plus courte sur laquelle 8 réussites ont été enchaînées, `null` sans telle série */
  heldWindowMs: number | null;
  /** Pièges touchés d'affilée (échelle d'aide), remis à zéro par un piège laissé passer */
  trapStreak: number;
  /** Cibles ratées d'affilée (échelle d'aide), remises à zéro par une cible attrapée */
  missStreak: number;
  /** Apparitions montrées, remises comprises (garde-fou de durée) */
  shown: number;
  /** Apparitions réussies (perles allumées) */
  cleared: number;
  /** Pièges touchés de toute l'étoile, STOP tardifs compris : la couronne exige zéro */
  trapped: number;
  /** Cibles ratées de toute l'étoile */
  missed: number;
  lastResult: AppearanceResult | null;
}
