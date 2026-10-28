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
