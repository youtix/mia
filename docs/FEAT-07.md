# FEAT-07 : Moteur de Catalogue & Progression Extensible par Étoiles (`ProgressionEngine`)

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-07`
> **Dépendances** : [FEAT-05](./FEAT-05.md)

---

## 1. Contexte & Objectif pour l'IA

L'une des exigences centrales de **Mia** est que **la progression par étoiles soit extensible à l'infini** :
* Au lancement, chaque jeu possède un catalogue initial (ex: 20 niveaux = **20 Étoiles** réparties du *Très Facile* au *Très Difficile*).
* Plus tard, le développeur ajoutera régulièrement de nouveaux niveaux dans n'importe quel palier de difficulté simplement en ajoutant des entrées dans le fichier de catalogue du jeu.

L'objectif de cette **FEAT-07** est de développer dans `src/core/progression/` le moteur générique `ProgressionEngine` et le registre des jeux `GameRegistry`, qui :
1. Trient les niveaux d'un jeu par palier cognitif (`very_easy` $\rightarrow$ `very_hard`) puis par `order` (pas de 10 : `10, 20, 30...` pour permettre d'intercaler facilement un niveau `15` plus tard).
2. Calculent dynamiquement le nombre total d'étoiles disponibles et gagnées par le joueur.
3. Déterminent si un niveau est débloqué sans jamais bloquer un joueur existant lorsqu'on insère de nouveaux niveaux lors d'une mise à jour.
4. Enregistrent une victoire et décernent l'Étoile (et le statut "Parfait" 👑).

---

## 2. Fichiers à Créer

```text
src/
└── core/
    └── progression/
        ├── types.ts                   # BaseLevelDefinition, GameManifest, EnrichedLevelItem, TierProgressSummary
        ├── progression-engine.ts      # Fonctions pures de calcul d'étoiles, déblocage et victoire
        ├── game-registry.ts           # Registre central des jeux (Memory, Traffic Jam)
        └── index.ts                   # Barrel export
tests/
└── progression-engine.test.ts         # Tests unitaires (extensibilité, insertion de niveaux, déblocage)
```

---

## 3. Spécifications Techniques Détaillées

### 3.1. Contrats de Types (`src/core/progression/types.ts`)
```typescript
import type { DifficultyTier, GameId, LevelCompletion } from '@/types/mia';

export interface BaseLevelDefinition<TConfig = unknown> {
  /** Identifiant unique et immuable (ex: "mem-001", "tj-012") */
  id: string;
  gameId: GameId;
  tier: DifficultyTier;
  /** Ordre au sein du palier (convention : 10, 20, 30, 40... pour permettre d'insérer 15, 25 plus tard) */
  order: number;
  title?: string;
  config: TConfig;
}

export interface EnrichedLevelItem<TConfig = unknown> {
  definition: BaseLevelDefinition<TConfig>;
  /** Numéro d'étoile global (1 à N) calculé dynamiquement après tri */
  starNumber: number;
  /** Index 0-based dans le catalogue trié */
  globalIndex: number;
  isUnlocked: boolean;
  isCompleted: boolean;
  isPerfect: boolean;
  completion: LevelCompletion | null;
}

export interface TierProgressSummary<TConfig = unknown> {
  tier: DifficultyTier;
  earnedStars: number;
  totalStars: number;
  perfectCount: number;
  levels: EnrichedLevelItem<TConfig>[];
}

export interface GameProgressSummary<TConfig = unknown> {
  gameId: GameId;
  earnedStars: number;
  totalStars: number;
  perfectCount: number;
  nextPlayableLevel: EnrichedLevelItem<TConfig> | null;
  tiers: TierProgressSummary<TConfig>[];
  allLevels: EnrichedLevelItem<TConfig>[];
}
```

### 3.2. Algorithmes de `ProgressionEngine` (`src/core/progression/progression-engine.ts`)

1. **`sortLevels<T>(levels: BaseLevelDefinition<T>[]): BaseLevelDefinition<T>[]`**
   * Trie d'abord selon l'ordre du palier (`DIFFICULTY_TIERS[level.tier].order` de 1 à 5), puis par `level.order` croissant, puis par `level.id` en cas d'égalité.

2. **Règle de déblocage résiliente aux mises à jour (`isLevelUnlockedAtIndex`)** :
   Soit `sortedLevels` la liste triée des niveaux d'un jeu et `completedMap` le dictionnaire `profile.gamesProgress[gameId]?.levels ?? {}` :
   * Le niveau à `globalIndex === 0` (Étoile #1) est **toujours débloqué** (`true`).
   * Un niveau à `globalIndex > 0` est débloqué si **au moins l'une** de ces conditions est vraie :
     1. Le niveau lui-même a déjà été complété (`completedMap[level.id]?.completed === true`).
     2. Le niveau immédiatement précédent (`sortedLevels[globalIndex - 1]`) est complété.
     3. Le nombre total d'étoiles déjà gagnées par le joueur dans ce jeu (`earnedStars`) est supérieur ou égal à `globalIndex` (`earnedStars >= globalIndex`).

3. **`getGameProgressSummary<T>(gameId: GameId, catalog: BaseLevelDefinition<T>[], profile: UserProfile | null): GameProgressSummary<T>`**
   * Calcule la liste enrichie `allLevels`, les sous-totaux par palier `tiers` (les 5 paliers dans l'ordre), le total `earnedStars`, `totalStars`, `perfectCount`, et identifie `nextPlayableLevel`.

4. **`recordLevelVictory(state: MiaSaveState, params: { gameId: GameId; levelId: string; moves: number; timeSeconds: number; isPerfect: boolean }): MiaSaveState`**
   * Met à jour le profil actif dans `state` :
     * Marque `completed: true`.
     * Conserve `isPerfect: existing.isPerfect || params.isPerfect`.
     * Met à jour `bestMoves = Math.min(existing.bestMoves, params.moves)` et `bestTimeSeconds = Math.min(existing.bestTimeSeconds, params.timeSeconds)`.
     * Incrémente `timesPlayed + 1` et met à jour `lastPlayedLevelId = params.levelId`.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/progression-engine.test.ts` valide le tri sur 5 paliers, le déblocage progressif, l'ajout dynamique de nouveaux niveaux et la conservation des meilleurs scores avec une couverture `>= 80%`.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(progression): add infinitely extensible star progression engine`).
