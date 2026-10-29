import { validateLevelCatalog } from '@/core/progression/catalog-validator';
import { DIFFICULTY_TIER_IDS, sortLevels } from '@/core/progression/progression-engine';
import type { BaseLevelDefinition, CatalogValidationResult } from '@/core/progression/types';
import type { DifficultyTier } from '@/types/mia';
import { parseTrafficJamAscii } from './ascii-parser';
import { getBoardGeometryError } from './engine';
import { DEFAULT_MAX_STATES, solveTrafficJam } from './solver';
import type { TrafficJamLevelConfig } from './types';

/**
 * Catalogue initial de Traffic Jam (FEAT-14) : 20 étoiles dessinées en grilles ASCII 6 × 6
 * (`.` case libre, `#` plot fixe, `H` ta voiture sur la ligne de sortie 2, autre lettre = voiture
 * de 2 cases ou camion de 3), de 2 à 45 coups. `optimalMoves` est le minimum exact mesuré par le
 * solveur BFS (objectif de la couronne) : `validateTrafficJamCatalog` le vérifie. Données seules,
 * en TypeScript pur (sans React) : le registre des jeux, la page `/traffic-jam` et le script
 * `validate:levels` l'importent. Ce module n'importe que des modules, jamais le barrel
 * `@/core/progression` : il ré-exporte le registre, qui importe ce catalogue (cycle).
 *
 * Un niveau publié n'est jamais retiré ni renommé : son `id` est la clé de la sauvegarde des
 * joueurs (`countProfileStars` divergerait du Hub). Changer son palier ou son `order` est sans
 * risque (numéros d'étoile recalculés, niveaux réussis toujours débloqués). Un nouveau niveau se
 * dessine en ASCII avec `optimalMoves: 0`, `npm run validate:levels` indique alors le minimum
 * mesuré à reporter ; il s'intercale avec un `order` libre (15, 25…) sans faire redescendre
 * `optimalMoves` dans l'ordre de la carte.
 */

type TrafficJamLevel = BaseLevelDefinition<TrafficJamLevelConfig>;

/**
 * Les 20 étoiles initiales (FEAT-14 §3.1), déclarées dans l'ordre de la Carte des Étoiles.
 * Prettier replierait chaque grille sur une ligne : elle reste empilée, un caractère par case,
 * pour se lire comme le parking (formatage manuel aligné sur le style du projet).
 */
// prettier-ignore
export const TRAFFIC_JAM_CATALOG: readonly TrafficJamLevel[] = [
  // Très Facile (Éveil) : apprendre le geste, 2 à 5 coups. Un seul bloqueur, puis une chaîne de
  // deux, le premier camion (3 cases), enfin un véhicule à dégager au bas de la grille.
  {
    id: 'tj-001',
    gameId: 'traffic-jam',
    tier: 'very_easy',
    order: 10,
    title: 'Premier créneau',
    config: parseTrafficJamAscii(
      [
        '......',
        '......',
        'HH..A.',
        '....A.',
        '......',
        '......',
      ],
      { optimalMoves: 2 },
    ),
  },
  {
    id: 'tj-002',
    gameId: 'traffic-jam',
    tier: 'very_easy',
    order: 20,
    title: 'Chaîne de deux',
    config: parseTrafficJamAscii(
      [
        '...A..',
        '...A..',
        'HH.B..',
        '...B..',
        '...CC.',
        '......',
      ],
      { optimalMoves: 3 },
    ),
  },
  {
    id: 'tj-003',
    gameId: 'traffic-jam',
    tier: 'very_easy',
    order: 30,
    title: 'Premier camion',
    config: parseTrafficJamAscii(
      [
        '...A..',
        '...A..',
        'HH.A..',
        '......',
        '.B...C',
        '.B.DDC',
      ],
      { optimalMoves: 4 },
    ),
  },
  {
    id: 'tj-004',
    gameId: 'traffic-jam',
    tier: 'very_easy',
    order: 40,
    title: 'Dégager le bas',
    config: parseTrafficJamAscii(
      [
        '......',
        '....A.',
        'HH..A.',
        '....A.',
        '..BCC.',
        '..B.DD',
      ],
      { optimalMoves: 5 },
    ),
  },
  // Facile (Initié) : 7 à 11 coups, 5 à 7 véhicules. Premier aller-retour d'un camion, deux
  // camions à coordonner, un couloir central à libérer, puis ta voiture avancée à mi-chemin le
  // temps de dégager la sortie.
  {
    id: 'tj-005',
    gameId: 'traffic-jam',
    tier: 'easy',
    order: 10,
    title: 'Aller-retour',
    config: parseTrafficJamAscii(
      [
        '..A..B',
        '..A..B',
        'HHA..B',
        'CCDDD.',
        '......',
        '......',
      ],
      { optimalMoves: 7 },
    ),
  },
  {
    id: 'tj-006',
    gameId: 'traffic-jam',
    tier: 'easy',
    order: 20,
    title: 'Deux camions',
    config: parseTrafficJamAscii(
      [
        'AAA..B',
        '..C..B',
        'HHC...',
        '..D...',
        '..D..E',
        '..D..E',
      ],
      { optimalMoves: 8 },
    ),
  },
  {
    id: 'tj-007',
    gameId: 'traffic-jam',
    tier: 'easy',
    order: 30,
    title: 'Couloir central',
    config: parseTrafficJamAscii(
      [
        '..A...',
        '..A..B',
        'HHA..B',
        '..CCCB',
        '.DDEEE',
        '......',
      ],
      { optimalMoves: 10 },
    ),
  },
  {
    id: 'tj-008',
    gameId: 'traffic-jam',
    tier: 'easy',
    order: 40,
    title: 'À mi-chemin',
    config: parseTrafficJamAscii(
      [
        'AABCCC',
        '..B...',
        'HHB..D',
        '.....D',
        '.EEE.F',
        '.....F',
      ],
      { optimalMoves: 11 },
    ),
  },
  // Moyen (Confirmé) : 12 à 18 coups, 8 à 10 véhicules. Blocage mutuel en carré, premier plot
  // fixe (`#`), un véhicule déjà déplacé à faire reculer, puis un parking plein.
  {
    id: 'tj-009',
    gameId: 'traffic-jam',
    tier: 'medium',
    order: 10,
    title: 'Blocage en carré',
    config: parseTrafficJamAscii(
      [
        '..A...',
        '..ABBB',
        'HH.CD.',
        '...CDE',
        'FFGGGE',
        '.....E',
      ],
      { optimalMoves: 12 },
    ),
  },
  {
    id: 'tj-010',
    gameId: 'traffic-jam',
    tier: 'medium',
    order: 20,
    title: 'Premier plot',
    config: parseTrafficJamAscii(
      [
        'ABB#..',
        'A.CD..',
        'HHCD..',
        '..EEE.',
        '..FFF.',
        '..GGG.',
      ],
      { optimalMoves: 14 },
    ),
  },
  {
    id: 'tj-011',
    gameId: 'traffic-jam',
    tier: 'medium',
    order: 30,
    title: 'Marche arrière',
    config: parseTrafficJamAscii(
      [
        '.AAAB.',
        '..C.B.',
        'HHC.B.',
        'DDE...',
        '.FEGII',
        '.F.G..',
      ],
      { optimalMoves: 16 },
    ),
  },
  {
    id: 'tj-012',
    gameId: 'traffic-jam',
    tier: 'medium',
    order: 40,
    title: 'Parking plein',
    config: parseTrafficJamAscii(
      [
        'AAA.B.',
        '....BC',
        'HHD.BC',
        '..DEEF',
        '.GIJJF',
        '.GI...',
      ],
      { optimalMoves: 18 },
    ),
  },
  // Difficile (Expert) : 19 à 28 coups, 10 à 12 véhicules. Deux véhicules à inverser dans une
  // colonne, onze véhicules et un plot, un goulot central, puis une fausse piste au départ
  // (ta voiture doit d'abord reculer).
  {
    id: 'tj-013',
    gameId: 'traffic-jam',
    tier: 'hard',
    order: 10,
    title: 'Inversion',
    config: parseTrafficJamAscii(
      [
        '.AABCD',
        '...BCD',
        'HHEF.D',
        '..EF..',
        '.GIJJ.',
        '.GI...',
      ],
      { optimalMoves: 19 },
    ),
  },
  {
    id: 'tj-014',
    gameId: 'traffic-jam',
    tier: 'hard',
    order: 20,
    title: 'Onze et un plot',
    config: parseTrafficJamAscii(
      [
        '.AAABC',
        '..DDBC',
        '.EHHBF',
        '.EGIIF',
        '.#GJJF',
        '.KKK..',
      ],
      { optimalMoves: 22 },
    ),
  },
  {
    id: 'tj-015',
    gameId: 'traffic-jam',
    tier: 'hard',
    order: 30,
    title: 'Goulot central',
    config: parseTrafficJamAscii(
      [
        '.AA.B.',
        'CDDDB.',
        'CHHEB.',
        'F.GEII',
        'F.GJJJ',
        '.KKK..',
      ],
      { optimalMoves: 25 },
    ),
  },
  {
    id: 'tj-016',
    gameId: 'traffic-jam',
    tier: 'hard',
    order: 40,
    title: 'Fausse piste',
    config: parseTrafficJamAscii(
      [
        'ABB.CC',
        'ADD...',
        'A.HHEF',
        'GGG.EF',
        '..IJEF',
        'KKIJLL',
      ],
      { optimalMoves: 28 },
    ),
  },
  // Très Difficile (Maître) : 31 à 45 coups, 11 à 12 véhicules. Grande profondeur de recherche
  // (8 000 positions explorées), douze véhicules, deux plots asymétriques, puis le Défi Maître :
  // 45 coups (maximum théorique en 6 × 6 : 51) sur des voies qu'aucune autre étoile ne partage
  // (règle de diversité de `validateTrafficJamCatalog`).
  {
    id: 'tj-017',
    gameId: 'traffic-jam',
    tier: 'very_hard',
    order: 10,
    title: 'Grande profondeur',
    config: parseTrafficJamAscii(
      [
        '.AABCC',
        '..DB..',
        'HHD..E',
        '..DFFE',
        'G.IIJE',
        'GKKKJ.',
      ],
      { optimalMoves: 31 },
    ),
  },
  {
    id: 'tj-018',
    gameId: 'traffic-jam',
    tier: 'very_hard',
    order: 20,
    title: 'Douze véhicules',
    config: parseTrafficJamAscii(
      [
        '..ABBB',
        'C.AD.E',
        'CHHDFE',
        'GI.DFJ',
        'GIKKFJ',
        'G..LLL',
      ],
      { optimalMoves: 36 },
    ),
  },
  {
    id: 'tj-019',
    gameId: 'traffic-jam',
    tier: 'very_hard',
    order: 30,
    title: 'Deux plots',
    config: parseTrafficJamAscii(
      [
        'AAA...',
        '.BBC.#',
        'HH.C.D',
        'EFFG#D',
        'E.IGJJ',
        'KKILL.',
      ],
      { optimalMoves: 41 },
    ),
  },
  {
    id: 'tj-020',
    gameId: 'traffic-jam',
    tier: 'very_hard',
    order: 40,
    title: 'Défi Maître',
    config: parseTrafficJamAscii(
      [
        'ABBCDE',
        'A.FCDE',
        'HHFC..',
        'GGII.J',
        '..K..J',
        '..KLLL',
      ],
      { optimalMoves: 45 },
    ),
  },
];

/** Moyenne d'un palier dans un message : entier tel quel, sinon une décimale (« 12,5 »). */
function formatAverage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

/**
 * Signature structurelle d'un parking : multiensemble trié des voies de ses véhicules
 * (`${axe}${longueur}@${ligne ou colonne}`, ex: « H2@2 » pour ta voiture) suivi des plots
 * (`#ligne,colonne`). Deux niveaux de même signature ne diffèrent que par les positions de départ
 * sur les mêmes voies : à l'écran, le second est le premier décalé. La règle de diversité du
 * validateur et le test du catalogue s'appuient dessus.
 */
export function getLaneSignature(config: TrafficJamLevelConfig): string {
  const lanes = config.vehicles.map(
    (vehicle) =>
      `${vehicle.axis}${String(vehicle.length)}@${String(vehicle.axis === 'H' ? vehicle.row : vehicle.col)}`,
  );
  const obstacles = config.obstacles.map(
    (obstacle) => `#${String(obstacle.row)},${String(obstacle.col)}`,
  );
  return [...lanes.sort(), ...obstacles.sort()].join(' ');
}

/**
 * Règle de diversité : deux niveaux ne partagent jamais la même signature de voies (même
 * multiensemble de véhicules sur les mêmes lignes ou colonnes, mêmes plots), quelles que soient
 * leurs positions de départ. Le second niveau d'une paire est signalé, avec le premier.
 */
function getDuplicateLaneErrors(catalog: readonly TrafficJamLevel[]): string[] {
  const errors: string[] = [];
  /** signature → identifiant du premier niveau qui la porte */
  const owners = new Map<string, string>();
  for (const [index, level] of catalog.entries()) {
    const signature = getLaneSignature(level.config);
    const owner = owners.get(signature);
    if (owner === undefined) {
      owners.set(signature, level.id);
    } else {
      errors.push(
        `niveau n° ${String(index + 1)} « ${level.id} » : mêmes voies (véhicules et plots) que le niveau « ${owner} », seules les positions de départ diffèrent`,
      );
    }
  }
  return errors;
}

/**
 * Anomalies propres à un niveau, une seule à la fois (la suivante n'aurait pas de sens) :
 * géométrie (`getBoardGeometryError`, avant le solveur, qui lèverait), solvabilité dans le budget
 * par défaut du solveur (celui de l'indice du plateau), niveau non déjà gagné au départ (le
 * plateau masque l'objectif couronne d'un `optimalMoves` nul), puis égalité stricte entre
 * `optimalMoves` déclaré et minimum mesuré (règle d'exactitude : objectif de la couronne).
 */
function getTrafficJamLevelErrors(config: TrafficJamLevelConfig): string[] {
  const geometryError = getBoardGeometryError(config);
  if (geometryError !== undefined) return [`géométrie invalide : ${geometryError}`];
  const result = solveTrafficJam(config);
  if (!result.solvable) {
    return [
      `insoluble, ou plus de ${String(DEFAULT_MAX_STATES)} positions à explorer (budget par défaut du solveur)`,
    ];
  }
  if (result.optimalMoves === 0) return ['déjà gagné au départ (aucun coup à jouer)'];
  if (result.optimalMoves !== config.optimalMoves) {
    return [
      `optimalMoves ${String(config.optimalMoves)} au lieu de ${String(result.optimalMoves)} (minimum mesuré par le solveur)`,
    ];
  }
  return [];
}

/**
 * Progression du catalogue entier : `optimalMoves` moyen strictement croissant d'un palier au
 * suivant (règle 5 de FEAT-14 §3.2, palier vide ignoré), puis `optimalMoves` jamais décroissant
 * d'une étoile à la suivante dans l'ordre de la Carte des Étoiles (`sortLevels`) : la difficulté
 * de la carte ne redescend jamais, un niveau inséré doit s'y conformer. Les niveaux d'un palier
 * inconnu (déjà signalés par les règles communes) ne sont pas classés.
 */
function getProgressionErrors(catalog: readonly TrafficJamLevel[]): string[] {
  const errors: string[] = [];
  const nameOf = (level: TrafficJamLevel): string =>
    `niveau n° ${String(catalog.indexOf(level) + 1)} « ${level.id} »`;

  let previousTier: { tier: DifficultyTier; average: number } | undefined;
  for (const tier of DIFFICULTY_TIER_IDS) {
    const levels = catalog.filter(
      (level) => level.tier === tier && Number.isFinite(level.config.optimalMoves),
    );
    if (levels.length === 0) continue;
    const average =
      levels.reduce((sum, level) => sum + level.config.optimalMoves, 0) / levels.length;
    if (previousTier !== undefined && average <= previousTier.average) {
      errors.push(
        `palier « ${tier} » : optimalMoves moyen ${formatAverage(average)} non supérieur à celui du palier « ${previousTier.tier} » (${formatAverage(previousTier.average)})`,
      );
    }
    previousTier = { tier, average };
  }

  let previous: TrafficJamLevel | undefined;
  const known = catalog.filter((level) => DIFFICULTY_TIER_IDS.includes(level.tier));
  for (const level of sortLevels(known)) {
    if (previous !== undefined && level.config.optimalMoves < previous.config.optimalMoves) {
      errors.push(
        `${nameOf(level)} : optimalMoves ${String(level.config.optimalMoves)} inférieur à celui du niveau précédent sur la carte « ${previous.id} » (${String(previous.config.optimalMoves)})`,
      );
    }
    previous = level;
  }
  return errors;
}

/**
 * Validation du catalogue Traffic Jam (test du catalogue, `npm run validate:levels`) : règles
 * communes de `validateLevelCatalog` (identifiant `LEVEL_ID_PATTERN` unique, jeu, palier, `order`
 * unique dans son palier), puis règles propres de chaque niveau, préfixées de son nom comme les
 * règles communes (« niveau n° 3 « tj-003 » : … »), puis diversité des voies, puis règles de
 * progression. Un message français par anomalie. Résout chaque niveau avec le solveur BFS :
 * quelques millisecondes par niveau, le catalogue initial entier en moins de 100 ms.
 */
export function validateTrafficJamCatalog(
  catalog: readonly TrafficJamLevel[] = TRAFFIC_JAM_CATALOG,
): CatalogValidationResult {
  const errors = [...validateLevelCatalog('traffic-jam', catalog).errors];
  for (const [index, level] of catalog.entries()) {
    const name = `niveau n° ${String(index + 1)} « ${level.id} »`;
    errors.push(...getTrafficJamLevelErrors(level.config).map((error) => `${name} : ${error}`));
  }
  errors.push(...getDuplicateLaneErrors(catalog), ...getProgressionErrors(catalog));
  return { valid: errors.length === 0, errors };
}
