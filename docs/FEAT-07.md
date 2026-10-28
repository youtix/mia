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
        ├── catalog-validator.ts       # Règles communes des catalogues (validateLevelCatalog, voir §5)
        └── index.ts                   # Barrel export
tests/
└── progression-engine.test.ts         # Tests unitaires (extensibilité, insertion de niveaux, déblocage)
```

---

## 3. Spécifications Techniques Détaillées

> Les décisions de la session de cadrage ([§5](#5-décisions-dimplémentation-session-de-cadrage)) précisent ces spécifications : étoiles comptées sur le seul catalogue, prochain niveau à jouer, date de la première victoire, valeurs invalides corrigées, contenu de `GameManifest` et du registre, validation commune des catalogues, moteur sans React.

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
   * **Contrat FEAT-05** ([§5](./FEAT-05.md#5-décisions-dimplémentation-session-de-cadrage)) :
     * Enregistrer la victoire par `updateState((state) => recordLevelVictory(state, params))` (`useMiaStorage`).
     * Première victoire : initialiser `bestMoves` / `bestTimeSeconds` avec les valeurs de la partie, jamais `Infinity` (sérialisé en `null` par JSON, le niveau serait écarté au chargement suivant). Toutes les valeurs numériques doivent être finies et ≥ 0.
     * Indexer `levels` par `levelId` (le champ `levelId` est réaligné sur sa clé) et `gamesProgress` par un `GameId` connu : la progression d'un jeu hors `GameId` est écartée au chargement (ajouter le jeu au type `GameId` avant d'enregistrer sa progression).
   * **Contrat FEAT-06** ([§5](./FEAT-06.md#5-décisions-dimplémentation-session-de-cadrage)) :
     * Le sélecteur de profil compte les étoiles sans catalogue (`countProfileStars` : niveaux `completed` de la sauvegarde, tous jeux confondus). Ne jamais retirer un niveau publié d'un catalogue : ce total divergerait de `getGameProgressSummary`.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/progression-engine.test.ts` valide le tri sur 5 paliers, le déblocage progressif, l'ajout dynamique de nouveaux niveaux et la conservation des meilleurs scores avec une couverture `>= 80%`.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(progression): add infinitely extensible star progression engine`).

---

## 5. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Étoiles hors catalogue** | `earnedStars`, `perfectCount` et la règle 3 du déblocage ne comptent que les niveaux du catalogue : `earnedStars ≤ totalStars`, et la réussite d'un niveau inconnu (sauvegarde d'une version plus récente : retour à un APK antérieur, import depuis un autre appareil) ne débloque rien. Ces entrées restent dans la sauvegarde. `countProfileStars` (FEAT-06) reste sans catalogue : il ne dépasse le total du Hub que dans ce cas. |
| **Tri** | Paliers dans l'ordre de `DIFFICULTY_TIER_IDS` (`DIFFICULTY_TIERS[tier].order`), puis `order`, puis `id` comparé par unités de code : `localeCompare` dépend de la langue de l'appareil, les numéros d'étoile pourraient différer d'un appareil à l'autre. `sortLevels` renvoie un nouveau tableau (pas de `toSorted`, absent des WebView anciennes). |
| **Déblocage** | `isLevelUnlockedAtIndex(sortedLevels, globalIndex, completedMap, earnedStars)` applique la règle de §3.2 ; index hors du catalogue → `false`. Une entrée `completed: false` ne compte pas comme réussie. Sauvegarde lue par `Object.hasOwn` : un identifiant comme `constructor` ne lit rien d'hérité. |
| **Prochain niveau** | `nextPlayableLevel` : le niveau qui suit le niveau réussi le plus avancé (le joueur reprend là où il en était, même après l'insertion de niveaux plus tôt, qui apparaissent « à conquérir » sur la carte) ; si ce niveau réussi est le dernier, le premier niveau non réussi ; `null` quand tout est réussi (un niveau publié ensuite redevient le prochain). Toujours débloqué et non réussi. `lastPlayedLevelId` n'intervient pas : rejouer un niveau pour la couronne ne déplace pas le prochain niveau. |
| **Résumé** | `getGameProgressSummary` : `tiers` contient toujours les 5 paliers, même vides ; `tiers[n].levels` réutilise les objets de `allLevels`. `isPerfect` implique `isCompleted` ; `completion` expose l'entrée de la sauvegarde (même non réussie), `null` sans entrée. Catalogue vide : `0 / 0`, `nextPlayableLevel: null`. |
| **Victoire** | `recordLevelVictory(state, params, { now })` (`LevelVictoryParams` ; `now` pour les tests). `completedAt` : date de la première victoire, jamais modifiée. Couronne définitive. Un `moves` ou un `timeSeconds` non fini ou négatif ne devient jamais un meilleur score (ancien conservé, `0` faute d'ancien) : l'étoile est toujours enregistrée et relue sans perte. Une entrée `completed: false` (import, version future) compte comme une première victoire (scores et date de la partie, `timesPlayed` conservé puis incrémenté). Sans profil actif ou avec un `levelId` vide : `state` lui-même (`updateState` n'écrit rien). Seuls les objets modifiés sont recréés (autres profils, niveaux et jeux conservés). |
| **Registre** | `GameManifest` : données seules, `id`, `title`, `skill` (faculté affichée par le Hub), `path` (route sans `basePath` ni barre finale, ajoutés par `next/link`), `catalog`. Icônes dans `components/` (table exhaustive sur `GameId`, comme `DIFFICULTY_TIERS` et `avatar-icons.tsx`). `GAME_REGISTRY` : type `GameRegistry` exhaustif (une entrée par `GameId`, `id` égal à la clé) ; ordre de déclaration = ordre du Hub (`GAMES`). Catalogues vides jusqu'à FEAT-11 et FEAT-14 ; configurations typées `unknown` dans le registre (une page de jeu utilise son propre catalogue typé). `getProfileProgressSummary(profile, games = GAMES)` : totaux de tous les jeux et résumé de chacun (compteur et cartes du Hub). Fichier `game-registry.ts` ([SPECIFICATION §7.3](./SPECIFICATION.md) corrigée, qui indiquait `registry.ts`). |
| **Validation** | `validateLevelCatalog(gameId, catalog)` → `CatalogValidationResult` `{ valid, errors }` (un message français par anomalie) : identifiant au format `LEVEL_ID_PATTERN` (minuscules et chiffres, mots séparés par un tiret : `mem-001`, `memory-001b`) et unique, `gameId` attendu, palier connu, `order` fini et unique dans son palier (le départage par `id` du tri n'est qu'une défense). Repris par `validateMemoryCatalog`, `validateTrafficJamCatalog` et `validate:levels` ; un test du registre l'applique à chaque catalogue enregistré. |
| **Périmètre** | TypeScript pur, sans React ni hook : FEAT-08 compose `useMiaStorage()` et le moteur (`useMemo`) ; `core/progression` reste importable par un composant serveur et par le script `validate:levels`. Ajout à l'arborescence §2 : `catalog-validator.ts` ; `src/core/progression/.gitkeep` supprimé. |
| **Tests** | `tests/progression-engine.test.ts` : tri, déblocage, résumés, prochain niveau, insertion de niveaux et catalogue de 200 étoiles, victoires (meilleurs scores, couronne, valeurs invalides, relecture sans perte par `parseSaveStateReport`), validation et registre ; couverture complète du moteur, du registre et du validateur. |
| **Contrats aval** | Notes ajoutées dans [FEAT-08 §4.1 et §4.2](./FEAT-08.md), [FEAT-10 §3.3](./FEAT-10.md), [FEAT-11 §3.2](./FEAT-11.md), [FEAT-13 §3.4](./FEAT-13.md) et [FEAT-14 §3.2](./FEAT-14.md) ; [SPECIFICATION §7.3](./SPECIFICATION.md) corrigée. |
| **Git** | Branche `feat/progression` depuis `main`, commit `feat(progression): add infinitely extensible star progression engine`. |
