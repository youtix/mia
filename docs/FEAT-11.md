# FEAT-11 : Jeu n°1 (Memory) — Catalogue Initial des 20 Étoiles & Générateur

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-11`
> **Dépendances** : [FEAT-08](./FEAT-08.md), [FEAT-09](./FEAT-09.md), [FEAT-10](./FEAT-10.md)

---

## 1. Contexte & Objectif pour l'IA

L'objectif de cette **FEAT-11** est de peupler le jeu **Memory** avec son catalogue initial de **20 niveaux progressifs (20 Étoiles)** allant du *Très Facile* (grille `2x2` avec aperçu) au *Très Difficile* (grille `6x6`, triplets, mode monochrome/abstrait et cartes qui permutent), de l'enregistrer dans le `GameRegistry` (`FEAT-07`), et de rendre la page `/memory` 100% jouable de l'Étoile #1 à l'Étoile #20.

---

## 2. Fichiers à Créer / Modifier

```text
src/
├── games/
│   └── memory/
│       ├── catalog.ts                 # Les 20 niveaux initiaux + validateMemoryCatalog()
│       └── index.ts                   # Exporter MEMORY_CATALOG et validateMemoryCatalog
├── core/
│   └── progression/
│       └── game-registry.ts           # Brancher MEMORY_CATALOG sur l'entrée 'memory'
└── app/
    └── memory/
        └── page.tsx                   # Connecter StarMapScreen et MemoryBoard pour jouer les 20 étoiles
tests/
└── memory-catalog.test.ts             # Validation mathématique de l'intégralité du catalogue Memory
```

---

## 3. Spécifications Détaillées

### 3.1. Catalogue des 20 Étoiles (`src/games/memory/catalog.ts`)

Crée le tableau `MEMORY_CATALOG: BaseLevelDefinition<MemoryLevelConfig>[]` contenant exactement ces **20 niveaux initiaux** (avec `order` espacé de 10 en 10 au sein de chaque palier : `10, 20, 30, 40`) :

| Étoile | `id` | `tier` | `order` | Grille (`cols x rows`) | `matchSize` | `visualMode` | `previewSeconds` | `maxMistakes` | `swapEveryNMistakes` | `perfectMaxMistakes` |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- | :---: | :---: | :---: | :---: |
| ⭐ 1 | `mem-001` | `very_easy` | 10 | `2 x 2` (4) | `2` | `distinct_color_shape` | `3` | `null` | `null` | `0` |
| ⭐ 2 | `mem-002` | `very_easy` | 20 | `3 x 2` (6) | `2` | `distinct_color_shape` | `3` | `null` | `null` | `1` |
| ⭐ 3 | `mem-003` | `very_easy` | 30 | `3 x 2` (6) | `2` | `distinct_color_shape` | `0` | `null` | `null` | `2` |
| ⭐ 4 | `mem-004` | `very_easy` | 40 | `4 x 2` (8) | `2` | `distinct_color_shape` | `2` | `null` | `null` | `2` |
| ⭐ 5 | `mem-005` | `easy` | 10 | `4 x 2` (8) | `2` | `thematic_palette` | `0` | `null` | `null` | `3` |
| ⭐ 6 | `mem-006` | `easy` | 20 | `5 x 2` (10) | `2` | `distinct_color_shape` | `2` | `null` | `null` | `3` |
| ⭐ 7 | `mem-007` | `easy` | 30 | `5 x 2` (10) | `2` | `thematic_palette` | `0` | `null` | `null` | `4` |
| ⭐ 8 | `mem-008` | `easy` | 40 | `4 x 3` (12) | `2` | `thematic_palette` | `0` | `null` | `null` | `4` |
| ⭐ 9 | `mem-009` | `medium` | 10 | `4 x 3` (12) | `2` | `monochrome` | `2` | `10` | `null` | `4` |
| ⭐ 10 | `mem-010` | `medium` | 20 | `4 x 4` (16) | `2` | `thematic_palette` | `2` | `12` | `null` | `5` |
| ⭐ 11 | `mem-011` | `medium` | 30 | `4 x 4` (16) | `2` | `monochrome` | `0` | `12` | `null` | `6` |
| ⭐ 12 | `mem-012` | `medium` | 40 | `5 x 4` (20) | `2` | `thematic_palette` | `0` | `14` | `null` | `7` |
| ⭐ 13 | `mem-013` | `hard` | 10 | `5 x 4` (20) | `2` | `monochrome` | `0` | `12` | `null` | `6` |
| ⭐ 14 | `mem-014` | `hard` | 20 | `6 x 4` (24) | `2` | `thematic_palette` | `0` | `15` | `null` | `8` |
| ⭐ 15 | `mem-015` | `hard` | 30 | `5 x 3` (15) | `3` (Triplets) | `distinct_color_shape` | `3` | `10` | `null` | `4` |
| ⭐ 16 | `mem-016` | `hard` | 40 | `6 x 4` (24) | `2` | `abstract_orientation` | `0` | `14` | `null` | `8` |
| ⭐ 17 | `mem-017` | `very_hard` | 10 | `6 x 5` (30) | `2` | `monochrome` | `0` | `18` | `null` | `10` |
| ⭐ 18 | `mem-018` | `very_hard` | 20 | `6 x 4` (24) | `3` (Triplets) | `thematic_palette` | `3` | `14` | `null` | `6` |
| ⭐ 19 | `mem-019` | `very_hard` | 30 | `5 x 4` (20) | `2` | `monochrome` | `0` | `12` | `4` | `6` |
| ⭐ 20 | `mem-020` | `very_hard` | 40 | `6 x 6` (36) | `2` | `abstract_orientation` | `0` | `20` | `5` | `10` |

### 3.2. Fonction de Validation du Catalogue (`validateMemoryCatalog`)
Implémente `validateMemoryCatalog(catalog = MEMORY_CATALOG): { valid: boolean; errors: string[] }` qui vérifie :
1. Qu'aucun `id` n'est dupliqué.
2. Que pour chaque niveau, `(cols * rows) >= matchSize * 2` et `(cols * rows) % matchSize === 0`.
3. Que le nombre de groupes `(cols * rows) / matchSize` ne dépasse pas le nombre de symboles disponibles dans `symbols.ts`.
4. Que chaque niveau peut être instancié par `createMemoryGame(level.config)` sans erreur.

* **Contrat FEAT-07** ([§5](./FEAT-07.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * `validateMemoryCatalog` commence par `validateLevelCatalog('memory', catalog)` (`@/core/progression` : identifiant `LEVEL_ID_PATTERN` unique, ce qui couvre la règle 1 ; `gameId`, palier, `order` fini et unique dans son palier), puis ajoute ses règles propres.
  * Brancher `MEMORY_CATALOG` sur `GAME_REGISTRY.memory.catalog` : le test du registre le valide alors par `validateLevelCatalog`.
  * Un niveau publié n'est jamais retiré ni renommé : son `id` est la clé de la sauvegarde, et `countProfileStars` divergerait du Hub. Changer son palier ou son `order` ne touche pas à la sauvegarde (numéros d'étoile recalculés, niveaux réussis toujours débloqués).
  * Le registre type les configurations en `unknown` : la page `/memory` appelle `getGameProgressSummary('memory', MEMORY_CATALOG, activeProfile)` pour obtenir des `MemoryLevelConfig`.
* **Contrat FEAT-08** ([§6](./FEAT-08.md#6-décisions-dimplémentation-session-de-cadrage)) :
  * `GameScreen` calcule déjà ce résumé : la page rend `<GameScreen gameId="memory" catalog={MEMORY_CATALOG} renderLevel={(level, controls) => <MemoryBoard … />} />` (`level.definition.config` typé en `MemoryLevelConfig`, `controls` : `recordVictory`, `playLevel`, `exitToMap`, `summary`).
  * `renderLevel` est une fonction : non transmissible d'un composant serveur à un composant client. Déclarer ce rendu dans un composant client (ex: `src/games/memory/MemoryGameScreen.tsx`, `'use client'`) que `page.tsx` importe directement (pas un barrel), en gardant son export `metadata`.
* **Contrat FEAT-09** ([§5](./FEAT-09.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * Les règles 2 à 4 sont celles de `getMemoryConfigErrors(level.config)` (`@/games/memory`), dont chaque message est préfixé du nom du niveau (comme `validateLevelCatalog`). Il couvre aussi les champs entiers et positifs, le mode visuel connu et la cohérence `perfectMaxMistakes ≤ maxMistakes`, `swapEveryNMistakes ≤ maxMistakes`. Une configuration sans anomalie est instanciée par `createMemoryGame` sans erreur.
  * Règle 3 : le nombre de symboles disponibles dépend du mode (`getMemoryModeCapacity`) : 10 groupes en `distinct_color_shape` (une couleur unique par groupe), 36 en `thematic_palette` et `monochrome`, 32 en `abstract_orientation`.
  * `catalog.ts` est couvert par le seuil de 90 % de `src/games/memory/*.ts`.
* **Contrat FEAT-10** ([§5](./FEAT-10.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * `renderLevel={(level, controls) => <MemoryBoard level={level} controls={controls} />}` : le plateau reçoit le niveau et les commandes de `GameScreen` tels quels (victoire par `recordVictory`, « Étoile Suivante » par `playLevel`, Carte des Étoiles et Retour par `exitToMap`). Importer le module `@/games/memory/components/MemoryBoard`, pas le barrel.
  * Toute grille valide se joue sans défilement ; une grille large (ou haute) tourne d'elle-même quand la zone du plateau est en portrait (ou en paysage). Une configuration invalide lèverait une erreur au montage (`createMemoryGame`) : `validateMemoryCatalog` doit rester sans anomalie.
  * Textes du plateau au tutoiement (« Trouve les paires (2) ») ; `title` d'un niveau n'est pas affiché (en-tête « Étoile #N »).

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/memory-catalog.test.ts` exécute `validateMemoryCatalog(MEMORY_CATALOG)` et vérifie que `{ valid: true, errors: [] }` est retourné et que les 5 paliers contiennent chacun 4 niveaux (20 étoiles au total).
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(memory): add initial 20-star catalog and level validator`).
