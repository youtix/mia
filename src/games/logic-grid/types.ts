/**
 * Types de Chacun sa Place (FEAT-27). Le moteur est en TypeScript pur, sans React ni DOM : il reste
 * importable par un composant serveur et par le script `validate:levels`.
 */

/** Formes des pièces. */
export type PieceShape = 'circle' | 'square' | 'triangle';

/** Couleurs des pièces. */
export type PieceColor = 'red' | 'yellow' | 'blue';

/** Pièce : une forme et une couleur (« red-circle ») ; les neuf pièces sont toutes différentes. */
export type PieceId = `${PieceColor}-${PieceShape}`;

/**
 * Contenu des 9 cases, ligne par ligne depuis le coin en haut à gauche (case 0) jusqu'au coin en bas
 * à droite (case 8) ; `null` : case vide.
 */
export type Board = readonly (PieceId | null)[];

/** Zone d'une carte de place : une case, une ou deux lignes voisines, une ou deux colonnes voisines. */
export type ClueZone =
  | { kind: 'cell'; cell: number }
  | { kind: 'rows'; rows: readonly number[] }
  | { kind: 'cols'; cols: readonly number[] };

/**
 * Sujet d'une carte de place : une pièce, ou une famille entière (les trois pièces d'une forme ou
 * d'une couleur). Une carte de famille vaut pour toutes ses pièces.
 */
export type ClueSubject =
  | { kind: 'piece'; piece: PieceId }
  | { kind: 'shape'; shape: PieceShape }
  | { kind: 'color'; color: PieceColor };

/**
 * Carte d'indice, toujours vraie pour la solution du puzzle.
 * - `place` : le sujet est dans la zone ; barrée (`isNegated`), il n'y est pas.
 * - `pair` : les deux pièces sont collées, `second` juste à droite de `first` (`right`) ou juste en
 *   dessous (`down`).
 * - `next` : `second` touche `first` par un côté, jamais par un coin ; barrée, il ne le touche pas.
 */
export type Clue =
  | { kind: 'place'; subject: ClueSubject; zone: ClueZone; isNegated: boolean }
  | { kind: 'pair'; first: PieceId; second: PieceId; direction: 'right' | 'down' }
  | { kind: 'next'; first: PieceId; second: PieceId; isNegated: boolean };

/**
 * Sortes de cartes qu'une étoile autorise : une case (`cell`), une ou deux lignes ou colonnes
 * (`line`), deux pièces collées (`pair`), deux pièces qui se touchent (`next`).
 */
export type ClueKind = 'cell' | 'line' | 'pair' | 'next';

/**
 * Raisonnements permis au solveur « enfant », du plus simple au plus exigeant : lire une carte seule
 * (`direct`, la dernière pièce dans la dernière case comprise), croiser les cartes d'une même pièce
 * (`combine`), ou trouver la seule pièce qui peut aller dans une case (`exclude`).
 */
export type Reasoning = 'direct' | 'combine' | 'exclude';

/**
 * Ce que chaque puzzle d'une étoile doit exiger : une carte d'une sorte (`next`, `line`, `pair`), une
 * carte barrée (`not`), une carte de famille (`group`), ou un raisonnement (`combine`, `exclude`).
 */
export type LogicGridFocus = 'next' | 'line' | 'pair' | 'not' | 'group' | 'combine' | 'exclude';

export interface LogicGridLevelConfig {
  /**
   * Pièces à placer, de 3 à 9 ; les autres sont posées d'avance et verrouillées. Fixe aussi le nombre
   * de puzzles de l'étoile (`getSeriesLength`).
   */
  freePieces: number;
  /** Sortes de cartes que le générateur peut tirer */
  clueKinds: readonly ClueKind[];
  /** Cartes barrées permises (« n'est pas », « ne touche pas ») */
  allowsNegation: boolean;
  /** Cartes de famille permises : elles valent pour les trois pièces d'une forme ou d'une couleur */
  allowsGroups: boolean;
  /** Raisonnement le plus exigeant que le puzzle peut demander */
  reasoning: Reasoning;
  /** Exigences de chaque puzzle de l'étoile, toutes remplies */
  focus: readonly LogicGridFocus[];
  /** Main fantôme sur le premier pas du premier puzzle : apprend le geste et la lecture des cartes */
  hasGuide: boolean;
}

/** Pas du solveur « enfant » : la règle qui a placé une pièce. */
export type SolveMove = 'direct' | 'last-hole' | 'combine' | 'exclude';

export interface SolveStep {
  piece: PieceId;
  cell: number;
  move: SolveMove;
  /** Cartes lues pour ce pas, en indices des cartes du puzzle (aucune pour la dernière case) */
  clueIndices: readonly number[];
}

export interface LogicGridPuzzle {
  /** Pièce de chaque case une fois le puzzle résolu (9 cases) */
  solution: readonly PieceId[];
  /** Cases dont la pièce est posée d'avance et verrouillée */
  lockedCells: readonly number[];
  /** Pièces à placer, dans l'ordre de la réserve */
  freePieces: readonly PieceId[];
  /** Cartes, dans l'ordre d'affichage : celui où un enfant s'en sert */
  clues: readonly Clue[];
  /** Raisonnement d'un enfant, pas à pas : le premier pas guide la main fantôme */
  steps: readonly SolveStep[];
}

/**
 * Déroulé d'une étoile : `placing` (l'enfant pose et vérifie), `success` (puzzle réussi, célébration),
 * puis le puzzle suivant repart de `placing` ; le dernier mène à `won`.
 */
export type LogicGridPhase = 'placing' | 'success' | 'won';

export interface LogicGridGameState {
  config: LogicGridLevelConfig;
  /** Tous les puzzles de l'étoile, tirés à la création de la partie */
  puzzles: readonly LogicGridPuzzle[];
  /** Puzzle en cours (`puzzles[puzzleIndex]`) */
  puzzle: LogicGridPuzzle;
  puzzleIndex: number;
  board: Board;
  /** Cases figées : pièces posées d'avance, puis celles que l'aide a mises en place */
  lockedCells: readonly number[];
  phase: LogicGridPhase;
  /** Vérifications ratées du puzzle en cours : nourrit l'échelle d'aide (`getHelpStage`) */
  failedChecks: number;
  /** Vérifications ratées de l'étoile : la couronne n'en admet aucune */
  totalFailedChecks: number;
  /** Carte non respectée à la dernière vérification ratée (indice), `null` sinon */
  unmetClueIndex: number | null;
  /** Compteur de vérifications ratées : relance la lueur, même sur la même carte */
  checkTick: number;
  /** Pièce que l'aide vient de mettre à sa place, `null` sinon */
  helpedPiece: PieceId | null;
  /** Pièces posées, déplacées ou rendues à la réserve */
  moves: number;
}
