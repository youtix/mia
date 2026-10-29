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
        ├── random.ts                  # Tirages injectables (rng) : mélange de Fisher-Yates, entier borné (voir §5)
        └── index.ts                   # Barrel export
tests/
└── memory-engine.test.ts              # Tests unitaires complets de toutes les règles de Memory
```

---

## 3. Spécifications Techniques Détaillées

> Les décisions de la session de cadrage ([§5](#5-décisions-dimplémentation-session-de-cadrage)) précisent ces spécifications : banque de 36 icônes en 3 thèmes et 8 formes orientables, règles de chaque mode visuel et capacités, tirages par `rng`, carte « vue » (`seen`), triplets évalués à la 3e carte, limite d'erreurs inclusive, cible des permutations, validation complète des configurations, actions ignorées sans nouvel état.

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

---

## 5. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Banque de symboles** | `symbols.ts` : données seules, comme `avatars.ts` ; FEAT-10 associe les icônes par une table exhaustive sur `MemorySymbolId` (Lucide, ou SVG dessiné comme `avatar-icons.tsx`). 36 icônes figuratives (`MEMORY_ICONS`, dont les 24 de §3.2) en 3 thèmes de 12 (`MEMORY_THEMES` : Nature & ciel, Animaux, Objets & trésors) ; 8 formes géométriques sans symétrie de rotation (`MEMORY_SHAPES` : flèche, chevron, triangle, triangle rectangle, demi-disque, quart de disque, formes en L et en T), dessinées pointe vers le haut à 0°, dans 4 orientations (`MEMORY_ROTATIONS` : 0, 90, 180, 270). Couleurs : classes Tailwind littérales `text-*`, couleur du symbole sur la face `bg-slate-900` de FEAT-10 (et non du fond : [SPECIFICATION §4.1](./SPECIFICATION.md) corrigée), contraste ≥ 4,5:1. Nom vocalisé unique par symbole et orientation (`getMemorySymbolLabel` : « Soleil », « Flèche, vers la droite »). |
| **Modes visuels** | `buildCardGroups(config, totalGroups, rng = Math.random)` (3e paramètre optionnel). `distinct_color_shape` : une icône de chaque thème à tour de rôle (formes de familles différentes), une couleur unique par groupe parmi 10 très distinctes (`DISTINCT_COLOR_CLASSES`). `thematic_palette` : icônes d'un thème tiré, complétées par un autre thème au-delà de 12 groupes, sur les 3 couleurs bien distinctes du thème tiré, réparties à parts égales. `monochrome` : icônes tirées dans toute la banque, une seule couleur tirée. `abstract_orientation` : une seule couleur, chaque forme tirée utilisée dans ses 4 orientations (18 groupes = 4 formes complètes + 2 orientations d'une cinquième) : chaque forme a ses jumelles tournées sur le plateau, difficulté constante d'une partie à l'autre. Deux groupes ne diffèrent jamais par la seule couleur (`groupId` = `symbolId@rotationDeg`) : jouable sans distinguer les couleurs. |
| **Capacités** | `getMemoryModeCapacity` : 10 groupes en `distinct_color_shape` (limite stricte : une couleur unique par groupe), 36 en `thematic_palette` et `monochrome`, 32 en `abstract_orientation`. Au-delà, `createMemoryGame` lève une erreur (validation) et `buildCardGroups` une `RangeError`. Une grille 6 × 6 en paires (18 groupes) tient dans tous les modes sauf `distinct_color_shape`. |
| **Hasard** | Symboles, thème, couleurs, formes et mélange tirés par le même `rng` (`Math.random` par défaut) : chaque partie est différente (rejouer pour la couronne), reproductible avec un générateur à graine. Mélange de Fisher-Yates dans sa forme d'origine (`random.ts`) ; un générateur hors de [0, 1[ (1, négatif, `NaN`) reste dans les bornes. |
| **Partie** | Plateau ligne par ligne (`index = row * cols + col`, comme `useGridNavigation`). `uid` = `groupId#n`, stable : il suit la carte lors d'une permutation (clé React et animation de FEAT-10). `MemoryCard.seen` : carte déjà montrée (aperçu ou retournement). Une action ignorée (phase inattendue, carte non cachée, index hors du plateau, coup déjà complet) renvoie l'état reçu lui-même ; aucune fonction ne modifie l'état reçu. `endPreviewPhase` hors `preview` et `resolveEvaluation` hors `evaluating` sont ignorées. Types précisés : `symbolId: MemorySymbolId`, `rotationDeg: MemoryRotation`. |
| **Triplets** | Évalués à la 3e carte comme en §3.3, même si les deux premières diffèrent : chaque coup raté montre 3 cartes (plus d'information, limites de FEAT-11 inchangées). Une erreur recache toutes les cartes du coup. |
| **Erreurs** | Limite inclusive : `maxMistakes` erreurs tolérées, la suivante fait perdre (`mistakes > maxMistakes`), comme la couronne (`mistakes <= perfectMaxMistakes`) ; `0` : la première erreur fait perdre. FEAT-10 annonce le dernier essai sans jamais afficher « 11 / 10 ». |
| **Permutation** | Toutes les `swapEveryNMistakes` erreurs, si la partie n'est pas perdue, deux cartes cachées de groupes différents s'échangent : deux cartes déjà vues de préférence, à défaut une vue et une jamais vue, en dernier recours deux jamais vues. Les cartes de l'erreur étant toujours vues, la permutation touche en pratique des cartes que le joueur a pu mémoriser. `lastSwappedPair` (index croissants) ne décrit que la permutation de la dernière résolution : toute autre résolution le remet à `null`. |
| **Évaluation** | `isEvaluationMatch(state)` : le coup en cours forme un groupe (toujours faux hors `evaluating`) ; FEAT-10 en déduit son délai (350 ms ou 900 ms) sans dupliquer la règle. |
| **Validation** | `getMemoryConfigErrors(config)` : un message français par anomalie, sans anomalie déduite d'une valeur déjà signalée. `cols` et `rows` entiers ≥ 1 ; `matchSize` 2 ou 3 ; grille divisible en au moins 2 groupes ; mode connu (`isMemoryVisualMode`) et capacité ; `previewSeconds` fini ≥ 0 ; `maxMistakes` `null` ou entier ≥ 0 ; `swapEveryNMistakes` `null` ou entier ≥ 1 ; `perfectMaxMistakes` entier ≥ 0. Cohérence : `perfectMaxMistakes ≤ maxMistakes` (au-delà, chaque victoire serait couronnée ; égalité permise, ex. mort subite à 0 erreur) et `swapEveryNMistakes ≤ maxMistakes` (sinon aucune permutation avant la défaite). `createMemoryGame` lève une `Error` qui les liste ; reprise par `validateMemoryCatalog` (FEAT-11). |
| **Couverture** | Seuil de 90 % sur `src/games/memory/*.ts` dans `vitest.config.ts` (moteur, symboles, tirages, puis catalogue de FEAT-11 ; pas les composants de FEAT-10), vérifié par `tests/quality-setup.test.ts`. |
| **Tests** | `tests/memory-engine.test.ts` : banque de symboles, modes visuels et capacités, tirages reproductibles, validation, création (paires, triplets, aperçu, générateur défaillant), retournements, évaluation, erreurs et défaite, permutations (cartes vues, effacement, défaite prioritaire, états incohérents), couronne, 20 configurations du catalogue initial instanciées et gagnées, parties complètes de `mem-019` et `mem-020` ; couverture complète du moteur. |
| **Périmètre** | TypeScript pur, sans React ni DOM. Ajout à l'arborescence §2 : `random.ts` ; `src/games/memory/.gitkeep` supprimé. |
| **Contrats aval** | Notes ajoutées dans [FEAT-10 §3.1, §3.2 et §3.3](./FEAT-10.md) et [FEAT-11 §3.2](./FEAT-11.md) ; [SPECIFICATION §4.1](./SPECIFICATION.md) corrigée. |
| **Git** | Branche `feat/memory-engine` depuis `main`, commit `feat(memory): implement pure memory game engine`. |
