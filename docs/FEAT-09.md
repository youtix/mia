# FEAT-09 : Jeu n°1 (Memory) — Moteur Logique Pur

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-09`
> **Dépendances** : [FEAT-07](./FEAT-07.md)

---

## 1. Contexte & Objectif pour l'IA

Le premier jeu de **Mia** est **Memory** (entraînement de la mémoire de travail visuo-spatiale).
Pour garantir une qualité irréprochable et une extensibilité totale des niveaux (de *Très Facile* à *Très Difficile*), toute la logique du jeu doit être isolée dans un moteur TypeScript pur (`src/games/memory/engine.ts`), sans aucune dépendance à React ou au DOM.

L'objectif de cette **FEAT-09** est de développer et tester unitairement ce moteur logique pur prenant en charge :
1. Les grilles de toute dimension (`2x2` jusqu'à `6x6` et plus).
2. Les associations par **Paires (2 cartes)** OU par **Triplets (3 cartes identiques)** pour les niveaux avancés.
3. Les **4 modes de complexité visuelle** (`distinct_color_shape`, `thematic_palette`, `monochrome`, `abstract_orientation`).
4. Le **temps d'aperçu initial (`previewSeconds`)**.
5. La **limite optionnelle d'erreurs (`maxMistakes`)**.
6. La **mécanique de permutation dynamique (`swapEveryNMistakes`)** dans les niveaux *Très Difficile* (toutes les $N$ erreurs, deux cartes face cachée non encore résolues échangent leur place sur le plateau).

---

## 2. Fichiers à Créer

```text
src/
└── games/
    └── memory/
        ├── types.ts                   # MemoryLevelConfig, MemoryCard, MemoryGameState, VisualSymbol
        ├── symbols.ts                 # Banque de 24+ symboles vectoriels et palettes par mode visuel
        ├── engine.ts                  # Fonctions pures (création, retournement, résolution, permutation)
        └── index.ts                   # Barrel export
tests/
└── memory-engine.test.ts              # Tests unitaires complets de toutes les règles de Memory
```

---

## 3. Spécifications Techniques Détaillées

### 3.1. Types du Jeu Memory (`src/games/memory/types.ts`)
```typescript
export type MemoryVisualMode =
  | 'distinct_color_shape' // Chaque groupe a une forme ET une couleur très différentes (Très Facile / Facile)
  | 'thematic_palette'     // Icônes proches avec palette restreinte (Facile / Moyen)
  | 'monochrome'           // Toutes les cartes ont exactement la même couleur ! (Moyen / Difficile)
  | 'abstract_orientation';// Symboles géométriques orientés ou abstraits (Difficile / Très Difficile)

export interface MemoryLevelConfig {
  cols: number;
  rows: number;
  /** 2 = paires classiques, 3 = triplets de cartes identiques */
  matchSize: 2 | 3;
  visualMode: MemoryVisualMode;
  /** Temps d'aperçu initial où toutes les cartes sont visibles (0 = pas d'aperçu) */
  previewSeconds: number;
  /** Nombre max d'erreurs avant défaite (null = illimité) */
  maxMistakes: number | null;
  /** Si défini, permute 2 cartes face cachée toutes les N erreurs */
  swapEveryNMistakes: number | null;
  /** Nombre max d'erreurs pour obtenir la mention "Parfait" (Couronne) */
  perfectMaxMistakes: number;
}

export interface MemoryCard {
  uid: string;
  groupId: string;
  symbolId: string;
  colorClass: string;
  rotationDeg: number; // 0, 90, 180, 270
  state: 'hidden' | 'flipped' | 'matched';
}

export type MemoryPhase = 'preview' | 'playing' | 'evaluating' | 'won' | 'lost';

export interface MemoryGameState {
  config: MemoryLevelConfig;
  phase: MemoryPhase;
  cards: MemoryCard[];
  flippedIndices: number[];
  moves: number;
  mistakes: number;
  matchedGroups: number;
  totalGroups: number;
  lastSwappedPair: [number, number] | null;
}
```

### 3.2. Banque de Symboles (`src/games/memory/symbols.ts`)
Fournis au moins **24 identifiants de symboles** associés à des icônes `lucide-react` ou formes géométriques SVG claires (`sun`, `moon`, `star`, `heart`, `apple`, `car`, `rocket`, `cat`, `dog`, `fish`, `bird`, `tree`, `flower`, `music`, `crown`, `diamond`, `anchor`, `bell`, `bolt`, `cloud`, `compass`, `feather`, `flame`, `key`), ainsi qu'une fonction `buildCardGroups(config, totalGroups)` qui attribue les couleurs et rotations selon `config.visualMode`.

### 3.3. Fonctions Pures du Moteur (`src/games/memory/engine.ts`)
1. `createMemoryGame(config: MemoryLevelConfig, rng?: () => number): MemoryGameState`
   * Vérifie que `(config.cols * config.rows) % config.matchSize === 0`.
   * Génère `totalGroups = (cols * rows) / matchSize` groupes de `matchSize` cartes et les mélange via Fisher-Yates.
   * Si `config.previewSeconds > 0`, initialise `phase = 'preview'` et toutes les cartes en `'flipped'`, sinon `phase = 'playing'` et toutes les cartes en `'hidden'`.
2. `endPreviewPhase(state: MemoryGameState): MemoryGameState`
   * Passe toutes les cartes en `'hidden'` et `phase = 'playing'`.
3. `selectCard(state: MemoryGameState, index: number): MemoryGameState`
   * Ignore l'action si `phase !== 'playing'` ou si la carte cible n'est pas `'hidden'` ou si `flippedIndices.length >= config.matchSize`.
   * Retourne la carte (`state: 'flipped'`) et ajoute `index` à `flippedIndices`.
   * Dès que `flippedIndices.length === config.matchSize`, incrémente `moves + 1` et passe `phase = 'evaluating'`.
4. `resolveEvaluation(state: MemoryGameState, rng?: () => number): MemoryGameState`
   * **Si toutes les cartes de `flippedIndices` ont le même `groupId`** : passe ces cartes à `'matched'`, vide `flippedIndices`, incrémente `matchedGroups + 1`, et passe `phase` à `'won'` si `matchedGroups === totalGroups` (sinon `'playing'`).
   * **Sinon (Erreur)** : remet les cartes à `'hidden'`, vide `flippedIndices`, incrémente `mistakes + 1`. Si `config.maxMistakes !== null && mistakes > config.maxMistakes`, passe `phase = 'lost'`. Sinon, si `config.swapEveryNMistakes && mistakes % config.swapEveryNMistakes === 0`, échange 2 cartes `'hidden'` de groupes différents et renseigne `lastSwappedPair = [idxA, idxB]`.
5. `isPerfectWin(state: MemoryGameState): boolean`
   * Retourne `state.phase === 'won' && state.mistakes <= state.config.perfectMaxMistakes`.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/memory-engine.test.ts` couvre paires, triplets, aperçu, limite d'erreurs, permutation et modes visuels avec une couverture `>= 90%` sur le moteur.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(memory): implement pure memory game engine`).
