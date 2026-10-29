# FEAT-14 : Jeu n°2 (Traffic Jam) — Catalogue Initial des 20 Étoiles & CLI de Validation

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-14`
> **Dépendances** : [FEAT-08](./FEAT-08.md), [FEAT-11](./FEAT-11.md), [FEAT-12](./FEAT-12.md), [FEAT-13](./FEAT-13.md)

---

## 1. Contexte & Objectif pour l'IA

L'objectif de cette **FEAT-14** est double :
1. Doter le jeu **Traffic Jam** de son catalogue initial de **20 niveaux progressifs (20 Étoiles)** (`tj-001` à `tj-020`) répartis dans les 5 paliers cognitifs (*Très Facile* $\rightarrow$ *Très Difficile*), tous **mathématiquement vérifiés par le solveur BFS** (`FEAT-12`).
2. Créer un outil en ligne de commande **`npm run validate:levels`** (`scripts/validate-levels.ts`) et l'intégrer dans `npm run validate:all` et dans `.github/workflows/ci.yml` pour vérifier automatiquement tous les catalogues de niveaux de **Mia** (*Memory* + *Traffic Jam*).

---

## 2. Fichiers à Créer / Modifier

```text
src/
├── games/
│   └── traffic-jam/
│       ├── catalog.ts                 # Les 20 niveaux initiaux (tj-001 à tj-020) + validateTrafficJamCatalog()
│       └── index.ts                   # Exporter TRAFFIC_JAM_CATALOG et validateTrafficJamCatalog
├── core/
│   └── progression/
│       └── game-registry.ts           # Brancher TRAFFIC_JAM_CATALOG sur l'entrée 'traffic-jam'
└── app/
    └── traffic-jam/
        └── page.tsx                   # Connecter StarMapScreen et TrafficJamBoard pour jouer les 20 étoiles
scripts/
└── validate-levels.ts                 # Script CLI validant tous les niveaux de Memory et Traffic Jam
package.json                           # Ajouter "validate:levels": "tsx scripts/validate-levels.ts" et l'inclure dans "validate:all"
tests/
└── traffic-jam-catalog.test.ts        # Test unitaire vérifiant que les 20 niveaux sont solubles et ordonnés
```

---

## 3. Spécifications Détaillées

### 3.1. Catalogue Initial des 20 Étoiles (`src/games/traffic-jam/catalog.ts`)
Crée les 20 niveaux initiaux (`tj-001` à `tj-020`) en utilisant le parseur ASCII `parseTrafficJamAscii` (`FEAT-12`) ou des objets déclaratifs, avec une progression strictement croissante du nombre minimal de coups (`optimalMoves`) mesuré par `solveTrafficJam` :

* **Palier 1 — `very_easy` (Très Facile — Étoiles #1 à #4)** :
  * `tj-001` à `tj-004` (`order: 10, 20, 30, 40`) : Résolutions optimales de **1 à 5 coups**.
* **Palier 2 — `easy` (Facile — Étoiles #5 à #8)** :
  * `tj-005` à `tj-008` (`order: 10, 20, 30, 40`) : Résolutions optimales croissantes entre **6 et 11 coups**.
* **Palier 3 — `medium` (Moyen — Étoiles #9 à #12)** :
  * `tj-009` à `tj-012` (`order: 10, 20, 30, 40`) : Résolutions optimales croissantes entre **12 et 18 coups** (incluant au moins 1 niveau avec obstacle fixe `#`).
* **Palier 4 — `hard` (Difficile — Étoiles #13 à #16)** :
  * `tj-013` à `tj-016` (`order: 10, 20, 30, 40`) : Résolutions optimales croissantes entre **19 et 28 coups**.
* **Palier 5 — `very_hard` (Très Difficile — Étoiles #17 à #20)** :
  * `tj-017` à `tj-020` (`order: 10, 20, 30, 40`) : Résolutions optimales croissantes de **29 à 40+ coups**.

⚠️ **Règle d'exactitude mathématique** : Pour chacun des 20 niveaux, la valeur `optimalMoves` enregistrée dans le catalogue DOIT être **strictement égale** au `optimalMoves` calculé par `solveTrafficJam(level.config)`.

### 3.2. Fonction `validateTrafficJamCatalog` (`src/games/traffic-jam/catalog.ts`)
Implémente `validateTrafficJamCatalog(catalog = TRAFFIC_JAM_CATALOG)` qui vérifie pour chaque niveau :
1. Unicité de l'`id`.
2. Validité géométrique (`validateBoardGeometry`).
3. Solvabilité via `solveTrafficJam(level.config)` (`solvable === true`).
4. Correspondance exacte entre `level.config.optimalMoves` et le `result.optimalMoves` trouvé par le solveur BFS.
5. Progression croissante : le `optimalMoves` moyen de chaque palier est strictement supérieur au palier précédent (`very_easy < easy < medium < hard < very_hard`).

* **Contrat FEAT-07** ([§5](./FEAT-07.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * `validateTrafficJamCatalog` commence par `validateLevelCatalog('traffic-jam', catalog)` (`@/core/progression` : identifiant `LEVEL_ID_PATTERN` unique, ce qui couvre la règle 1 ; `gameId`, palier, `order` fini et unique dans son palier), puis ajoute ses règles propres.
  * Brancher `TRAFFIC_JAM_CATALOG` sur `GAME_REGISTRY['traffic-jam'].catalog` : le test du registre le valide alors par `validateLevelCatalog`.
  * Un niveau publié n'est jamais retiré ni renommé : son `id` est la clé de la sauvegarde, et `countProfileStars` divergerait du Hub. Changer son palier ou son `order` ne touche pas à la sauvegarde (numéros d'étoile recalculés, niveaux réussis toujours débloqués).
  * Le registre type les configurations en `unknown` : la page `/traffic-jam` appelle `getGameProgressSummary('traffic-jam', TRAFFIC_JAM_CATALOG, activeProfile)` pour obtenir des `TrafficJamLevelConfig`.
* **Contrat FEAT-08** ([§6](./FEAT-08.md#6-décisions-dimplémentation-session-de-cadrage)) :
  * `GameScreen` calcule déjà ce résumé : la page rend `<GameScreen gameId="traffic-jam" catalog={TRAFFIC_JAM_CATALOG} renderLevel={(level, controls) => <TrafficJamBoard … />} />` (`level.definition.config` typé en `TrafficJamLevelConfig`, `controls` : `recordVictory`, `playLevel`, `exitToMap`, `summary`).
  * `renderLevel` est une fonction : non transmissible d'un composant serveur à un composant client. Déclarer ce rendu dans un composant client (ex: `src/games/traffic-jam/TrafficJamGameScreen.tsx`, `'use client'`) que `page.tsx` importe directement (pas un barrel), en gardant son export `metadata`.
* **Contrat FEAT-13** ([§5](./FEAT-13.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * `TrafficJamBoard({ level, controls })` : `EnrichedLevelItem<TrafficJamLevelConfig>` et `LevelControls<TrafficJamLevelConfig>` de `GameScreen` tels quels, comme `MemoryBoard`. `TrafficJamGameScreen` (`'use client'`) importe le module `@/games/traffic-jam/components/TrafficJamBoard` (pas le barrel) et rend `<GameScreen gameId="traffic-jam" catalog={TRAFFIC_JAM_CATALOG} renderLevel={(level, controls) => <TrafficJamBoard level={level} controls={controls} />} />`.
  * Le plateau masque l'objectif de la couronne tant que `optimalMoves` vaut 0 et calcule l'indice par un nouveau BFS à chaque appui (`getNextBestMove`, budget par défaut de 50 000 positions) : chaque niveau publié porte un `optimalMoves` exact et strictement positif, et reste résolu largement sous ce budget.

### 3.3. Outil CLI `scripts/validate-levels.ts`
* Exécutable via `npm run validate:levels`.
* Valide `MEMORY_CATALOG` et `TRAFFIC_JAM_CATALOG`.
* Retourne `process.exit(1)` si la moindre erreur est détectée.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `npm run validate:levels` s'exécute avec succès (code `0`) et valide les 20 étoiles de *Memory* + les 20 étoiles de *Traffic Jam*.
- [ ] `tests/traffic-jam-catalog.test.ts` vérifie que les 20 niveaux de `TRAFFIC_JAM_CATALOG` sont tous solubles par BFS et ordonnés par difficulté.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `validate:levels`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(traffic-jam): add initial 20-star catalog and cli level validator`).

---

## 5. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Catalogue** | `TRAFFIC_JAM_CATALOG` (`readonly BaseLevelDefinition<TrafficJamLevelConfig>[]`, lecture seule comme `MEMORY_CATALOG`) : 20 objets littéraux déclarés dans l'ordre de la carte (`tj-001` à `tj-020`, `order` 10 à 40 dans chaque palier), groupés par palier avec un commentaire sur l'intention de la progression. Chaque `config` est produite par `parseTrafficJamAscii(lines, { optimalMoves })` sur une grille ASCII 6 × 6 (`exitRow` 2 par défaut, `H` sur la ligne 2, lettres attribuées dans l'ordre de lecture). Un unique `// prettier-ignore` devant le tableau garde les six lignes de chaque grille empilées (Prettier les replierait sur une ligne) ; le bloc est formaté à la main dans le style du projet. Chaque niveau porte un `title` court en français, unique, jamais affiché (« Premier créneau », « Deux plots », « Défi Maître »…). Un niveau publié n'est jamais retiré ni renommé (contrat FEAT-07) ; un nouveau niveau se dessine avec `optimalMoves: 0`, `npm run validate:levels` indique le minimum mesuré à reporter. |
| **Valeurs retenues** | `optimalMoves` strictement croissant de `tj-001` à `tj-020`, dans les plages de §3.1 : Très Facile 2, 3, 4, 5 · Facile 7, 8, 10, 11 · Moyen 12, 14, 16, 18 · Difficile 19, 22, 25, 28 · Très Difficile 31, 36, 41, 45 (moyennes 3,5 / 9 / 15 / 23,5 / 38,25). Véhicules (hero compris) et obstacles : 2, 4, 5, 5 · 5, 6, 6, 7 · 8, 8 + 1 plot, 9, 10 · 10, 11 + 1 plot, 11, 12 · 11, 12, 12 + 2 plots, 12. Écarts assumés avec le tableau de [SPECIFICATION §4.2](./SPECIFICATION.md) : les plages de §3.1 priment (`tj-008` 11 au lieu de 12, `tj-009` à `tj-012` 12–18 au lieu de 14–22, `tj-013` à `tj-016` 19–28 au lieu de 25–34) ; en Très Difficile, 38 / 42 / 46 / 50 deviennent 31 / 36 / 41 / 45, les plus hautes valeurs trouvées sous les contraintes, diversité des voies comprise (le maximum théorique en 6 × 6 est 51). Caractéristiques conservées : premier camion à `tj-003`, véhicule horizontal à dégager au bas de la grille à `tj-004`, 5 véhicules et premier aller-retour à `tj-005`, 6 véhicules dont 2 camions à `tj-006`, couloir central à `tj-007`, ta voiture avancée à mi-chemin à `tj-008`, 8 véhicules à `tj-009`, premier plot à `tj-010`, marche arrière d'un véhicule déjà déplacé à `tj-011`, 10 véhicules à `tj-012`, 11 véhicules + 1 plot à `tj-014`, fausse piste au départ à `tj-016`, 12 véhicules à `tj-018` et `tj-020`, 2 plots asymétriques à `tj-019`, Défi Maître à `tj-020`. |
| **Génération** | Très Facile dessiné à la main ; les autres niveaux obtenus par recherche locale (script jetable hors dépôt : parkings aléatoires, mutations, conservation de la variante au `optimalMoves` le plus élevé sous contraintes de véhicules, d'obstacles et de colonne du hero), lettres renommées dans l'ordre de lecture, puis **tous** revérifiés par `solveTrafficJam` avec le budget par défaut, solution rejouée par `applyMove` et indice (`getNextBestMove`) vérifié à chaque coup. Mesures : au plus 8 051 positions explorées par niveau (`tj-017`) et composante atteignable d'au plus 8 063 positions, pour un budget de 50 000 : l'indice du plateau (nouveau BFS à chaque appui, depuis n'importe quelle position atteignable) reste toujours dans le budget ; les 20 niveaux se résolvent en moins de 100 ms au total. `tj-020` a été régénéré après relecture indépendante : sa première version partageait exactement les voies de `tj-016` (même parking, positions de départ décalées). Nouvelle recherche sous contrainte de distance de voies (somme des écarts de multiplicité) à chacun des 19 autres niveaux, ≥ 6 puis ≥ 8, ≈ 22 min sur 8 processus : 45 coups, 12 véhicules, 0 plot, 978 positions explorées, composante 1 168 ; distance 10 au niveau le plus proche (les paires existantes les plus proches, `tj-005`/`tj-007`, `tj-006`/`tj-008` et `tj-011`/`tj-012`, sont à 3). 46 n'a pas été atteint hors de la famille de `tj-016`. |
| **Validation** | `validateTrafficJamCatalog(catalog = TRAFFIC_JAM_CATALOG)` → `CatalogValidationResult` : erreurs de `validateLevelCatalog('traffic-jam', catalog)` (règle 1 et règles communes), puis, niveau par niveau et préfixées de son nom (« niveau n° 3 « tj-003 » : … »), une seule anomalie à la fois : géométrie (`getBoardGeometryError`, mêmes règles que `validateBoardGeometry`, **avant** le solveur qui lèverait), « insoluble, ou plus de 50000 positions à explorer (budget par défaut du solveur) », « déjà gagné au départ (aucun coup à jouer) » (ajout : le plateau masque l'objectif couronne d'un `optimalMoves` nul), puis « optimalMoves X au lieu de Y (minimum mesuré par le solveur) » (règle 4). Enfin les règles de progression : règle 5 (« palier « easy » : optimalMoves moyen 1 non supérieur à celui du palier « very_easy » (1,5) » ; palier vide ignoré, `optimalMoves` non fini exclu de la moyenne, décimale à la française) et règle ajoutée : `optimalMoves` **jamais décroissant** d'une étoile à la suivante dans l'ordre de la carte (`sortLevels` ; croissant au sens large, pour laisser insérer un niveau de même difficulté : message « niveau n° 2 « tj-002 » : optimalMoves 1 inférieur à celui du niveau précédent sur la carte « tj-001 » (2) ») ; les niveaux d'un palier inconnu, déjà signalés, ne sont pas classés. **Règle de diversité** (ajoutée après relecture) : `getLaneSignature(config)`, exportée, est le multiensemble trié des voies des véhicules (`${axe}${longueur}@${ligne ou colonne}`, ex: « H2@2 V2@4 ») suivi des plots (`#ligne,colonne`) ; deux niveaux de même signature sont le même parking aux positions de départ près (à l'écran, le second est le premier décalé) : le second est refusé (« niveau n° 20 « tj-020 » : mêmes voies (véhicules et plots) que le niveau « tj-016 », seules les positions de départ diffèrent »), entre les règles par niveau et la progression. Le catalogue initial est, lui, strictement croissant (test). |
| **Cycle d'imports** | `catalog.ts` importe les modules `@/core/progression/catalog-validator`, `@/core/progression/progression-engine` (`DIFFICULTY_TIER_IDS`, `sortLevels`), `@/core/progression/types`, `./ascii-parser`, `./engine`, `./solver`, `./types`, jamais les barrels (`@/core/progression` ré-exporte le registre, qui importe ce catalogue ; `@/games/traffic-jam` ré-exporte les composants). `game-registry.ts` importe `@/games/traffic-jam/catalog` et branche `GAME_REGISTRY['traffic-jam'].catalog = TRAFFIC_JAM_CATALOG` ; le barrel `@/games/traffic-jam` ré-exporte `TRAFFIC_JAM_CATALOG` et `validateTrafficJamCatalog`. |
| **Écran** | `src/games/traffic-jam/TrafficJamGameScreen.tsx` (`'use client'`) rend `<GameScreen gameId="traffic-jam" catalog={TRAFFIC_JAM_CATALOG} renderLevel={(level, controls) => <TrafficJamBoard level={level} controls={controls} />} />` en important `@/components/progression/GameScreen` et `@/games/traffic-jam/components/TrafficJamBoard` (modules directs, contrat FEAT-13). `page.tsx` l'importe directement et garde `metadata` (titre du registre). Non exporté par le barrel : une page importe son écran (FEAT-08). Ajout à l'arborescence §2 : `TrafficJamGameScreen.tsx`. |
| **CLI** | `scripts/validate-levels.ts`, exécuté par `tsx` (`npm run validate:levels`), inclus dans le `tsconfig` racine (strict) et linté : modules importés directement (`@/games/memory/catalog`, `@/games/traffic-jam/catalog`, `@/core/progression/progression-engine`, `@/types/mia` ; alias `@/` résolu par tsx via `paths`), sans React ni DOM. Pour chaque jeu : nombre de niveaux par palier, une ligne par étoile dans l'ordre de la carte (Memory : grille, paires ou triplets, mode visuel ; Traffic Jam : coups optimaux, véhicules, obstacles), les anomalies (`✘`, sur `stderr`) puis le verdict ; bilan final et `process.exit(1)` à la moindre anomalie. Environ une demi-seconde (démarrage de tsx compris). Seuls les paliers connus sont classés (`sortLevels`) et nommés (`DIFFICULTY_TIERS`) : un niveau au palier inconnu est listé en fin de catalogue avec son palier brut, puis signalé en français par le validateur, jamais par une trace de pile. `validate:all` = `format:check && lint && typecheck && validate:levels && test:coverage && build` ; étape `npm run validate:levels` de `ci.yml` entre `typecheck` et `test:coverage` (`tests/quality-setup.test.ts` mis à jour). |
| **Tests** | `tests/traffic-jam-catalog.test.ts` (environnement `node`, modules importés directement) : tableau des 20 étoiles colonne par colonne (id, palier, `order`, `optimalMoves`, véhicules, obstacles), titres uniques, 5 paliers de 4 étoiles numérotées de 1 à 20, Étoile #1 seule débloquée, branchement sur le registre, plages et croissance stricte, moyennes par palier, caractéristiques (camion, plots, parkings de 12 véhicules), 20 signatures de voies distinctes (`getLaneSignature`), et pour chaque niveau : parking 6 × 6 valide, instanciable, résolu par BFS en `optimalMoves` coups exactement, solution rejouée, premier coup égal à l'indice, résolution sous un quart du budget en moins de 10 s ; `validateTrafficJamCatalog` par défaut, explicite et sur un catalogue vide, règles communes, géométrie invalide (solveur non appelé, `optimalMoves` non fini exclu des moyennes), insoluble / déjà gagné / inexact, diversité (même parking décalé refusé, un plot distingue), paliers (vides ignorés, moyenne fractionnaire, égalité), ordre de la carte, palier inconnu, ordre des messages. `tests/star-map.test.tsx` : le test de la page `/traffic-jam` rend désormais le catalogue réel (« 1 étoile sur 20 », 20 étoiles, puis le parking de l'Étoile #2 après « Jouer l'Étoile #2 »), comme celui de `/memory`. Couverture complète de `catalog.ts` (seuil de 90 % de `src/games/traffic-jam/*.ts`). |
| **Git** | Commit prévu à l'intégration : `feat(traffic-jam): add initial 20-star catalog and cli level validator` (§4). |
