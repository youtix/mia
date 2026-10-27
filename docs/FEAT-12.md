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
