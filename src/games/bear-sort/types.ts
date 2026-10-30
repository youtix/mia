/**
 * Types du jeu Attrape-Piège (FEAT-23) : ranger des ours selon une règle qui change en cours de
 * partie. Le moteur est en TypeScript pur, sans React ni DOM : il reste importable par un composant
 * serveur et par le script `validate:levels`.
 */

export type BearColor = 'blue' | 'yellow';

export type BearSize = 'small' | 'big';

/** Caractéristique selon laquelle une règle de tri classe les ours. */
export type SortFeature = 'color' | 'size';

/** Couleur et taille d'un ours, ou d'une boîte. */
export interface BearTraits {
  color: BearColor;
  size: BearSize;
}

/** Les quatre sortes d'ours (`couleur-taille`). */
export type BearKind = `${BearColor}-${BearSize}`;

/** Ours ajoutés par une phase, par sorte ; une sorte absente n'en compte aucun. */
export type BearCounts = Partial<Record<BearKind, number>>;

/** Ours exclus par une règle « sauf » : une couleur, une taille, ou les deux à la fois. */
export type ForbiddenBears =
  | { color: BearColor; size?: undefined }
  | { color?: undefined; size: BearSize }
  | { color: BearColor; size: BearSize };

/**
 * Règle en vigueur :
 * - `sort` : ranger chaque ours dans la boîte de sa couleur, ou de sa taille ;
 * - `except` : ranger n'importe quel ours dans la boîte ouverte, sauf ceux de `forbidden`.
 */
export type BearSortRule =
  { kind: 'sort'; feature: SortFeature } | { kind: 'except'; forbidden: ForbiddenBears };

export interface BearSortPhaseConfig {
  rule: BearSortRule;
  /** Ours ajoutés à la réserve au début de la phase, aux côtés de ceux restés de la précédente */
  addBears: BearCounts;
  /**
   * Ours à ranger avant le STOP suivant, toujours moins que la réserve : la règle change alors que
   * d'autres ours attendent. `null` pour la dernière phase, jouée jusqu'au bout (réserve vide, ou
   * seuls les ours interdits restants).
   */
  placements: number | null;
}

export interface BearSortLevelConfig {
  /**
   * Les deux boîtes des phases `sort`, de gauche à droite, fixes pour toute l'étoile : chacune porte
   * une couleur et une taille, opposées à celles de l'autre. L'ancienne règle reste donc toujours
   * une réponse possible : c'est le conflit que l'enfant apprend à inhiber.
   */
  zones: readonly [BearTraits, BearTraits];
  /** Au moins une phase ; chaque changement de phase passe par le panneau STOP */
  phases: readonly BearSortPhaseConfig[];
  /** Montre le geste tant que le premier ours n'est pas rangé (première étoile) */
  showGestureHint: boolean;
}

export interface Bear extends BearTraits {
  /** Identifiant stable dans la partie (`phase-rang`) : clé React, cible d'un dépôt */
  uid: string;
}

/** Boîtes `left` et `right` des phases `sort`, boîte `open` des phases `except`. */
export type BearSortZoneId = 'left' | 'right' | 'open';

export interface BearSortZone {
  id: BearSortZoneId;
  /** `null` : boîte ouverte, neutre, de la phase `except` */
  traits: BearTraits | null;
  /** Ours rangés dans cette boîte pendant la phase, dans l'ordre */
  bears: readonly Bear[];
}

/**
 * Nature d'un rebond :
 * - `old-rule` : l'ours a été déposé là où le voulait la règle précédente ;
 * - `slip` : erreur sans lien avec une règle précédente ;
 * - `forbidden` : ours interdit déposé dans la boîte ouverte.
 */
export type BearBounceKind = 'old-rule' | 'slip' | 'forbidden';

export interface BearBounce {
  bearUid: string;
  zoneId: BearSortZoneId;
  kind: BearBounceKind;
}

/** `playing` : l'enfant range ; `stop` : panneau STOP, plateau figé ; `won` : étoile gagnée. */
export type BearSortStatus = 'playing' | 'stop' | 'won';

export interface BearSortState {
  config: BearSortLevelConfig;
  status: BearSortStatus;
  phaseIndex: number;
  rule: BearSortRule;
  /** Règle de la phase précédente, `null` dans la première phase */
  previousRule: BearSortRule | null;
  /** Ours à ranger avant le prochain STOP, `null` si la phase se joue jusqu'au bout */
  placementsLeft: number | null;
  /** Ours qui attendent, dans l'ordre de présentation à la télécommande */
  reserve: readonly Bear[];
  /** Boîtes de la phase en cours, de gauche à droite */
  zones: readonly BearSortZone[];
  /** Dépôts dans une boîte, rebonds compris : un dépôt hors boîte n'est pas compté */
  moves: number;
  /** Rebonds de toute la partie */
  mistakes: number;
  /** Rebonds d'affilée depuis le dernier dépôt réussi : ils font monter l'échelle d'indices */
  errorStreak: number;
  /** Dernier rebond, `null` dès qu'un ours est rangé */
  lastBounce: BearBounce | null;
}

/** Échelon de l'échelle d'indices : 1 rappel de la règle, 2 ancien critère estompé, 3 bonne boîte. */
export type BearSortHintLevel = 0 | 1 | 2 | 3;
