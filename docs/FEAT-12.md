# FEAT-12 : Jeu n°2 (Traffic Jam) — Moteur Physique de Grille & Solveur BFS

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-12`
> **Dépendances** : [FEAT-07](./FEAT-07.md)

---

## 1. Contexte & Objectif pour l'IA

Le deuxième jeu cérébral de **Mia** est **Traffic Jam** (axé sur la planification séquentielle, l'anticipation spatiale et l'inhibition cognitive).
Sur une grille carrée (par défaut `6x6`), la voiture du joueur (`hero`, horizontale de longueur 2 située sur la ligne de la sortie `exitRow = 2`) est bloquée par d'autres voitures (`length = 2`), des camions (`length = 3`) et éventuellement des obstacles fixes (`1x1`).

L'objectif de cette **FEAT-12** est de développer en TypeScript pur (sans dépendance UI) dans `src/games/traffic-jam/` :
1. **Le moteur physique de grille (`engine.ts`)** : détection des collisions, calcul de la plage de déplacement autorisée (`minDelta..maxDelta`) d'un véhicule le long de son axe, exécution d'un coup, historique Annuler (`Undo`) / Recommencer (`Reset`), et détection de victoire.
2. **Un parseur de grilles ASCII (`ascii-parser.ts`)** : permettant de déclarer très facilement de nouveaux niveaux sous forme de chaîne texte `6x6` lisible !
3. **Un solveur automatique par parcours en largeur (`solver.ts` — Breadth-First Search / BFS)** : permettant de vérifier mathématiquement qu'un niveau est soluble, de calculer son nombre minimal exact de coups (`optimalMoves`), et de fournir la fonction **"Indice (Prochain meilleur coup)"** au joueur pendant la partie.

---

## 2. Fichiers à Créer

```text
src/
└── games/
    └── traffic-jam/
        ├── types.ts                   # VehicleDef, ObstacleDef, TrafficJamLevelConfig, TrafficJamState
        ├── ascii-parser.ts            # Conversion d'une grille ASCII 6x6 en TrafficJamLevelConfig
        ├── engine.ts                  # Logique pure de grille, collisions, déplacements, Undo/Reset
        ├── solver.ts                  # Solveur BFS (optimalMoves, vérification de solvabilité, Indice)
        └── index.ts                   # Barrel export
tests/
└── traffic-jam-engine.test.ts         # Tests unitaires (collisions, parseur ASCII, solveur BFS)
```

---

## 3. Spécifications Techniques Détaillées

### 3.1. Types du Jeu Traffic Jam (`src/games/traffic-jam/types.ts`)
```typescript
export type VehicleAxis = 'H' | 'V';
export type VehicleType = 'hero' | 'car' | 'truck';

export interface VehicleDef {
  /** "hero" pour le véhicule du joueur, "A", "B", "C"... pour les autres */
  id: string;
  type: VehicleType;
  axis: VehicleAxis;
  length: 2 | 3;
  /** Coordonnées 0-indexées de la case supérieure-gauche du véhicule */
  row: number;
  col: number;
  colorClass: string;
}

export interface ObstacleDef {
  row: number;
  col: number;
}

export interface TrafficJamLevelConfig {
  gridSize: number; // 6 par défaut
  exitRow: number;  // 2 par défaut
  /** Nombre minimal théorique de coups pour sortir (vérifié par le solveur BFS) */
  optimalMoves: number;
  vehicles: VehicleDef[];
  obstacles: ObstacleDef[];
}

export interface TrafficJamMove {
  vehicleId: string;
  /** Déplacement relatif sur l'axe : négatif = gauche/haut, positif = droite/bas */
  delta: number;
}

export interface TrafficJamState {
  config: TrafficJamLevelConfig;
  vehicles: VehicleDef[];
  moves: number;
  history: TrafficJamMove[];
  isWon: boolean;
}
```

### 3.2. Parseur ASCII (`src/games/traffic-jam/ascii-parser.ts`)
Implémente `parseTrafficJamAscii(lines: string[], options?: { optimalMoves?: number; exitRow?: number }): TrafficJamLevelConfig` :
* `.` représente une case vide.
* `#` représente un obstacle fixe (`ObstacleDef` `1x1`).
* `H` sur 2 cases horizontales consécutives représente le véhicule joueur (`id: 'hero'`, `type: 'hero'`, `axis: 'H'`, `length: 2`).
* Toute autre lettre majuscule (`A` à `Z`, hors `H`) répétée sur 2 ou 3 cases alignées horizontalement ou verticalement crée un `VehicleDef` (`length: 2` $\rightarrow$ `'car'`, `length: 3` $\rightarrow$ `'truck'`).

### 3.3. Moteur de Grille & Collisions (`src/games/traffic-jam/engine.ts`)
1. `validateBoardGeometry(config: TrafficJamLevelConfig): { valid: boolean; error?: string }`
2. `getVehicleBounds(state: TrafficJamState, vehicleId: string): { minDelta: number; maxDelta: number }`
3. `applyMove(state: TrafficJamState, vehicleId: string, delta: number, options?: { mergeWithPreviousIfSameVehicle?: boolean }): TrafficJamState`
   * Si `options?.mergeWithPreviousIfSameVehicle === true` et que le dernier coup dans `history` concernait déjà `vehicleId`, cumule le déplacement dans ce même coup sans incrémenter `moves` (indispensable pour que sur Android TV, avancer case par case de 3 cases avec la télécommande compte pour **1 seul coup** comme un glisser-déposer tactile !).
   * Détecte la victoire : `isWon = hero.col + hero.length >= config.gridSize`.
4. `undoLastMove(state: TrafficJamState): TrafficJamState` et `resetLevel(state: TrafficJamState): TrafficJamState`.
5. `isPerfectWin(state: TrafficJamState): boolean` : `state.isWon && state.moves <= state.config.optimalMoves`.

### 3.4. Solveur BFS & Indice (`src/games/traffic-jam/solver.ts`)
Implémente `solveTrafficJam(config: TrafficJamLevelConfig, maxStates = 50000): { solvable: boolean; optimalMoves: number; solution: TrafficJamMove[] }` et `getNextBestMove(state: TrafficJamState): TrafficJamMove | null`.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/traffic-jam-engine.test.ts` valide le parseur ASCII, les collisions, la fusion des pas successifs d'un même véhicule, `undoLastMove` et le solveur BFS avec une couverture `>= 90%` sur le moteur.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(traffic-jam): implement grid physics engine, ascii parser and bfs solver`).

---

## 5. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Types** | §3.1 tels quels. `VehicleDef.colorClass` est une classe Tailwind littérale (Tailwind v4 ne génère que les classes présentes telles quelles dans les sources) ; constantes dans `types.ts` : `HERO_VEHICLE_ID = 'hero'`, `HERO_COLOR_CLASS = 'bg-red-500'`, `VEHICLE_COLOR_CLASSES` (12 classes `bg-*` distinctes et contrastées sur fond sombre, reprises en boucle au-delà de 12 véhicules). `TrafficJamState.moves` vaut toujours `history.length` (invariant maintenu par chaque action). |
| **Parseur** | `parseTrafficJamAscii(lines, { optimalMoves = 0, exitRow = DEFAULT_EXIT_ROW (2) })` : `gridSize` = nombre de lignes, chaque ligne exactement de cette longueur (aucun `trim`). Véhicules dans l'ordre d'apparition en lecture ligne par ligne (hero compris) ; identifiants `'hero'` et la lettre ; couleurs de la palette dans l'ordre des véhicules hors hero (modulo 12). `Error` en français (coordonnées 0-indexées comme dans la configuration) : grille vide, non carrée, caractère inconnu (minuscule et espace compris), lettre non alignée, non contiguë (lettre ou `H` en double), 1 ou ≥ 4 cases, `H` vertical, de 3 cases, absent ou hors de la ligne de sortie, option `exitRow` hors grille ou `optimalMoves` invalide. Le résultat satisfait toujours `validateBoardGeometry`. |
| **Grille ASCII inverse** | `formatTrafficJamAscii(config \| state)` : `H` pour le hero, pour les autres l'initiale de l'identifiant en majuscule si c'est une lettre encore libre, sinon la première lettre libre de l'alphabet (identifiants déclaratifs `hat`, `a1` / `a2`, `7up` : grille lisible et re-parsable), `#` obstacles, `.` cases vides ; positions courantes pour un état ; cases hors de la grille ignorées (un niveau invalide se décrit aussi : messages du CLI de FEAT-14, tests, débogage). Aller-retour exact avec le parseur. |
| **Géométrie** | `validateBoardGeometry(config)` → `{ valid, error? }` (première anomalie) repose sur `getBoardGeometryError(config)` → `string \| undefined`, aussi exporté. Règles, dans cet ordre : `gridSize` entier ≥ 2 ; `exitRow` entier dans la grille ; `optimalMoves` entier ≥ 0 (ajout : `isPerfectWin` le compare) ; obstacles dans la grille et sans doublon ; puis par véhicule : identifiant non vide (ajout) et unique, type et axe connus, longueur 2 (voiture, hero) ou 3 (camion), hero unique, d'identifiant `HERO_VEHICLE_ID` (curseur initial de FEAT-13), horizontal et sur `exitRow`, cases dans la grille (entières), aucun chevauchement (véhicule / véhicule, véhicule / obstacle). `createTrafficJamGame` et le solveur lèvent `Error('Niveau Traffic Jam invalide : …')`. |
| **État** | `createTrafficJamGame(config)` : véhicules copiés, `config` partagé par référence, `moves: 0`, `history: []`, `isWon` calculé par `isHeroAtExit` (une position de départ déjà gagnante est acceptée). `resetLevel` rejoue cette construction sur la même `config`. |
| **Bornes** | `getVehicleBounds(state, id)` → `{ minDelta ≤ 0, maxDelta ≥ 0 }` entre murs, véhicules et obstacles ; le hero s'arrête contre le bord droit (`col + length === gridSize`, position de victoire), jamais au-delà ; identifiant inconnu → `RangeError`. Primitives exportées et partagées avec le solveur : `getVehicleCells`, `buildOccupancyGrid` (`Uint8Array`, index `row * gridSize + col`), `countFreeCells`, `isHeroAtExit`. |
| **Coup** | `applyMove(state, id, delta, { mergeWithPreviousIfSameVehicle })`, pur : partie gagnée ou `delta` nul → l'état reçu lui-même ; `delta` non entier, identifiant inconnu ou `delta` hors de `getVehicleBounds` → `RangeError`. Sans fusion : coup ajouté. Avec fusion et dernier coup du même véhicule : cumul dans ce coup sans incrément ; cumul nul → coup retiré (`moves` − 1) ; un coup d'un autre véhicule entre les deux empêche la fusion (FEAT-13 : `alreadyMovedInThisLockSession`). Les véhicules non déplacés gardent leur référence. |
| **Annuler / Recommencer** | `undoLastMove` : déplacement inverse du dernier coup (cumulé compris, en un seul retour), `moves` − 1, `isWon` recalculé (possible après la victoire) ; sans historique → l'état reçu. `resetLevel` : positions de `config.vehicles`, `moves: 0`, `history: []`. |
| **Couronne** | `isPerfectWin(state)` = `isWon && moves <= config.optimalMoves`. |
| **Solveur** | `solveTrafficJam(config, maxStates = DEFAULT_MAX_STATES (50 000))` et `solveFromVehicles(config, vehicles, maxStates)` (positions arbitraires, ex. état courant) → `TrafficJamSolution { solvable, optimalMoves, solution }`. BFS sur les positions : un coup = glissement d'un véhicule d'un nombre quelconque de cases dans un sens, comme le comptage du jeu. Déjà gagné → `{ true, 0, [] }` ; insoluble ou budget dépassé → `{ false, UNSOLVABLE_MOVES (−1), [] }` (sentinel exporté) ; géométrie invalide → `Error` (valider avant). `maxStates` = positions distinctes découvertes, départ et arrivée compris, dans l'ordre de génération (un niveau trivial à 1 coup en découvre 5) ; `maxStates` doit être un nombre ≥ 1 (`Infinity` lève le budget), sinon `RangeError` (`NaN`, `0`, négatif). La solution est rejouable par `applyMove` depuis `createTrafficJamGame(config)` et mène à `isWon` en exactement `optimalMoves` coups. |
| **Codage des positions** | Clé numérique en base mixte : position de chaque véhicule sur son axe × produit des nombres de positions des véhicules précédents ; position voisine = une addition, positions vues dans un `Set<number>` sans allocation ; décodage par division entière exacte (clé < 2^53). Au-delà de 2^53 positions possibles (ex. 9 × 9 avec 20 véhicules), clé chaîne (`charCodeAt`), même parcours. Grille d'occupation `Uint8Array` recopiée par position, file en tableau parcourue par `for…of` (l'itérateur relit la longueur), nœuds parents pour reconstruire la solution. Mesuré : 12 véhicules / 42 coups en moins de 20 ms ; test de performance sous la seconde sur trois niveaux denses. |
| **Indice** | `getNextBestMove(state, maxStates?)` : nouveau BFS depuis les positions courantes (`solveFromVehicles`), premier coup de la solution ; `null` si la partie est gagnée, la position insoluble ou le budget dépassé. |
| **Tests** | `tests/traffic-jam-engine.test.ts` (environnement `node`) : palette, parseur (cas valides, options, palette en boucle, chaque erreur), aller-retour ASCII, chaque règle géométrique, création, grille d'occupation, bornes, `applyMove` (pureté, chaque refus, fusion des pas : 3 pas = 1 coup, retour à zéro, coup intercalé, sans option), annuler / recommencer, couronne, solveur (trivial, déjà gagné, hero muré, budget, géométrie invalide, clés numériques > 2^31 et chaînes > 2^53, positions arbitraires), indice jusqu'à la victoire, performance. Un oracle indépendant (BFS naïf sur les états du moteur, clés ASCII) confirme `optimalMoves` sur six niveaux de 2 à 20 coups ; les niveaux de 23 et 42 coups (trouvés par recherche locale, réutilisables par FEAT-14) sont vérifiés par rejeu. |
| **Couverture** | Seuil de 90 % à ajouter par l'orchestrateur dans `vitest.config.ts` sur `src/games/traffic-jam/*.ts` (et dans `tests/quality-setup.test.ts`) ; le moteur est couvert à ~100 % (seule branche non exercée : repli impossible de `vehicleColorAt`). |
| **Périmètre** | TypeScript pur, sans React ni DOM ; barrel `index.ts` (FEAT-13 et FEAT-14 y ajouteront composants et catalogue) ; `src/games/traffic-jam/.gitkeep` supprimé. |
| **Contrats aval** | FEAT-13 : `getVehicleBounds` borne le glisser, `applyMove(…, ±1, { mergeWithPreviousIfSameVehicle })` pour le D-Pad, `undoLastMove`, `resetLevel`, `getNextBestMove`, `isPerfectWin`, `getVehicleCells` pour le rendu, `HERO_VEHICLE_ID`. FEAT-14 : `parseTrafficJamAscii(lines, { optimalMoves })`, `validateBoardGeometry` **avant** `solveTrafficJam` (qui lève pour une géométrie invalide), comparaison stricte avec `result.optimalMoves`, `formatTrafficJamAscii` pour les messages du CLI ; `maxStates` à augmenter pour un niveau qui dépasserait 50 000 positions. |
| **Git** | Commit `feat(traffic-jam): implement grid physics engine, ascii parser and bfs solver`. |
