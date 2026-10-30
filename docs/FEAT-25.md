# FEAT-25 : Jeu n°4 (Attrape-Piège) — Catalogue Initial des 20 Étoiles & Validateur

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-25`
> **Dépendances** : [FEAT-08](./FEAT-08.md), [FEAT-14](./FEAT-14.md), [FEAT-23](./FEAT-23.md), [FEAT-24](./FEAT-24.md)
> **Statut** : cadrée et implémentée ; les décisions prises pendant la session de cadrage sont consignées au [§6](#6-décisions-dimplémentation-session-de-cadrage). La courbe reste à éprouver avec de vrais enfants ([§6, « Non vérifié »](#6-décisions-dimplémentation-session-de-cadrage)).

---

## 1. Contexte & Objectif pour l'IA

L'objectif de cette **FEAT-25** est de peupler **Attrape-Piège** avec son catalogue initial de **20 étoiles progressives** (`bs-001` à `bs-020`), réparties sur les 5 paliers de Mia, de les valider dans `npm run validate:levels` et de rendre la page `/bear-sort` jouable de l'Étoile #1 à l'Étoile #20.

Le catalogue vise les **enfants de 3 à 6 ans** : la règle est toujours dite à voix haute et toujours visible en image. La difficulté monte par la longueur des séries, la part d'ours en conflit, le nombre de changements de règle, puis la négation, qui en est le plafond. Le modèle d'une étoile est celui de [FEAT-23](./FEAT-23.md). **Mia exerce, elle ne soigne pas** : la courbe n'est pas un protocole clinique et aucun effet thérapeutique n'est revendiqué.

---

## 2. Fichiers à Créer / Modifier

```text
src/
├── app/
│   └── bear-sort/
│       └── page.tsx                   # Route /bear-sort : metadata (titre du registre) et écran client
├── components/
│   └── progression/
│       └── game-icons.ts              # Icône du jeu dans le Hub : PawPrint, pastille bg-sky-300
├── core/
│   └── progression/
│       └── game-registry.ts           # Entrée 'bear-sort' : titre, faculté, route, catalogue
└── games/
    └── bear-sort/
        ├── catalog.ts                 # BEAR_SORT_CATALOG (20 étoiles) + validateBearSortCatalog()
        ├── BearSortGameScreen.tsx     # Composant client : GameScreen + plateau de FEAT-24
        └── index.ts                   # Exporter BEAR_SORT_CATALOG et validateBearSortCatalog
scripts/
└── validate-levels.ts                 # Troisième catalogue validé et résumé (règles de chaque étoile)
tests/
└── bear-sort-catalog.test.ts          # Les 20 étoiles, la courbe et le validateur
docs/
├── FEAT-25.md                         # Ce document
└── SPECIFICATION.md                   # §4.4 (table des 20 étoiles), §7.5 (ajouter un niveau)
```

---

## 3. Spécifications Détaillées

### 3.1. Catalogue des 20 Étoiles (`src/games/bear-sort/catalog.ts`)

`BEAR_SORT_CATALOG: readonly BaseLevelDefinition<BearSortLevelConfig>[]`, 20 objets littéraux dans l'ordre de la Carte des Étoiles, `order` de 10 en 10 dans chaque palier. Seule `bs-001` a `showGestureHint: true`.

> **Lecture de la colonne « Phases »** : chaque flèche est un panneau STOP. `Couleur 8 (4) / 6` = règle de tri par couleur, 8 ours ajoutés dont 4 en conflit, STOP après 6 ours rangés ; `fin` = phase jouée jusqu'au bout ; `(2 interdits)` = dont 2 ours exclus par la règle « sauf ». Les ours non rangés avant un STOP restent et s'ajoutent à la phase suivante. **À ranger** compte les ours à placer pour finir l'étoile : ce nombre varie quand l'étoile finit par une négation, car les ours restés du STOP précédent peuvent être permis ou interdits.

| Étoile | `id` | `tier` | `order` | `title` | `zones` (gauche / droite) | Phases | Ours | À ranger | STOP |
| :---: | :--- | :--- | :---: | :--- | :--- | :--- | :---: | :---: | :---: |
| ⭐ 1 | `bs-001` | `very_easy` | 10 | Premier rangement | Petite bleue / Grande jaune | Couleur 6 (2) / fin | 6 | 6 | 0 |
| ⭐ 2 | `bs-002` | `very_easy` | 20 | Premier piège | Petite bleue / Grande jaune | Couleur 8 (4) / 6 → Taille 4 (2) / fin | 12 | 12 | 1 |
| ⭐ 3 | `bs-003` | `very_easy` | 30 | Boîtes échangées | Grande jaune / Petite bleue | Couleur 8 (4) / 6 → Taille 4 (3) / fin | 12 | 12 | 1 |
| ⭐ 4 | `bs-004` | `very_easy` | 40 | La taille d'abord | Petite bleue / Grande jaune | Taille 8 (4) / 6 → Couleur 4 (2) / fin | 12 | 12 | 1 |
| ⭐ 5 | `bs-005` | `easy` | 10 | Longue série | Grande bleue / Petite jaune | Couleur 10 (4) / 8 → Taille 6 (4) / fin | 16 | 16 | 1 |
| ⭐ 6 | `bs-006` | `easy` | 20 | Longue série, taille d'abord | Petite jaune / Grande bleue | Taille 10 (4) / 8 → Couleur 6 (4) / fin | 16 | 16 | 1 |
| ⭐ 7 | `bs-007` | `easy` | 30 | Presque que des pièges | Petite bleue / Grande jaune | Couleur 10 (4) / 8 → Taille 6 (5) / fin | 16 | 16 | 1 |
| ⭐ 8 | `bs-008` | `easy` | 40 | Pièges en sens inverse | Grande jaune / Petite bleue | Taille 10 (4) / 8 → Couleur 6 (5) / fin | 16 | 16 | 1 |
| ⭐ 9 | `bs-009` | `medium` | 10 | Aller-retour | Petite bleue / Grande jaune | Couleur 8 (4) / 6 → Taille 4 (3) / 4 → Couleur 4 (3) / fin | 16 | 16 | 2 |
| ⭐ 10 | `bs-010` | `medium` | 20 | Retour à la taille | Grande bleue / Petite jaune | Taille 8 (4) / 6 → Couleur 4 (3) / 4 → Taille 4 (3) / fin | 16 | 16 | 2 |
| ⭐ 11 | `bs-011` | `medium` | 30 | Quatre règles | Petite jaune / Grande bleue | Couleur 6 (2) / 4 → Taille 4 (3) / 4 → Couleur 4 (3) / 4 → Taille 2 (2) / fin | 16 | 16 | 3 |
| ⭐ 12 | `bs-012` | `medium` | 40 | Quatre règles, taille d'abord | Grande jaune / Petite bleue | Taille 6 (2) / 4 → Couleur 4 (3) / 4 → Taille 4 (3) / 4 → Couleur 2 (2) / fin | 16 | 16 | 3 |
| ⭐ 13 | `bs-013` | `hard` | 10 | Sauf les bleus | Petite bleue / Grande jaune | Couleur 8 (4) / 6 → Sauf les bleus 6 (2 interdits) / fin | 14 | 10 à 12 | 1 |
| ⭐ 14 | `bs-014` | `hard` | 20 | Sauf les petits | Grande bleue / Petite jaune | Taille 8 (4) / 6 → Sauf les petits 6 (2 interdits) / fin | 14 | 10 à 12 | 1 |
| ⭐ 15 | `bs-015` | `hard` | 30 | Sauf les jaunes | Petite jaune / Grande bleue | Couleur 8 (4) / 6 → Taille 4 (3) / 4 → Sauf les jaunes 6 (2 interdits) / fin | 18 | 14 à 16 | 2 |
| ⭐ 16 | `bs-016` | `hard` | 40 | Sauf les grands | Grande jaune / Petite bleue | Taille 8 (4) / 6 → Couleur 4 (3) / 4 → Sauf les grands 6 (2 interdits) / fin | 18 | 14 à 16 | 2 |
| ⭐ 17 | `bs-017` | `very_hard` | 10 | Sauf le petit bleu | Petite bleue / Grande jaune | Couleur 8 (4) / 6 → Sauf le petit bleu 7 (2 interdits) / fin | 15 | 11 à 13 | 1 |
| ⭐ 18 | `bs-018` | `very_hard` | 20 | Sauf le grand jaune | Grande bleue / Petite jaune | Taille 8 (4) / 6 → Sauf le grand jaune 7 (2 interdits) / fin | 15 | 11 à 13 | 1 |
| ⭐ 19 | `bs-019` | `very_hard` | 30 | Sauf le petit jaune | Petite jaune / Grande bleue | Couleur 8 (4) / 6 → Taille 4 (3) / 4 → Sauf le petit jaune 7 (2 interdits) / fin | 19 | 15 à 17 | 2 |
| ⭐ 20 | `bs-020` | `very_hard` | 40 | Le grand piège | Grande bleue / Petite jaune | Couleur 8 (4) / 6 → Taille 4 (3) / 4 → Couleur 4 (3) / 4 → Sauf le grand bleu 7 (2 interdits) / fin | 23 | 19 à 21 | 3 |

### 3.2. Progression par palier

* **Palier 1 — `very_easy` (Éveil, Étoiles #1 à #4)** : le geste d'abord (couleur seule, 6 ours, main qui montre le geste), puis un seul changement, 6 ours avant et 6 après comme dans le DCCS, dans les deux sens et avec les boîtes échangées.
* **Palier 2 — `easy` (Initié, Étoiles #5 à #8)** : une habitude plus longue à briser (8 ours avant le STOP et 8 après) et plus d'ours en conflit : 4 des 6 nouveaux ours, puis 5 sur 6.
* **Palier 3 — `medium` (Confirmé, Étoiles #9 à #12)** : aller-retour entre les règles, le plus dur étant de revenir à la première ; 2 STOP, puis 3 STOP avec des séries de 4 ours.
* **Palier 4 — `hard` (Expert, Étoiles #13 à #16)** : la négation d'une seule caractéristique (« sauf un ours bleu »), après un changement dès `bs-015`. Une seule boîte ouverte, et les ours interdits attendent sans être rangés.
* **Palier 5 — `very_hard` (Maître, Étoiles #17 à #20)** : la négation de deux caractéristiques à la fois (« sauf un petit ours bleu ») et ses faux amis, qui ne partagent qu'une caractéristique avec l'ours interdit et restent permis. `bs-020` y arrive après deux changements de règle.

Les 8 règles « sauf » possibles ont chacune leur étoile et leur phrase de la mascotte (`rule-except-*`, [FEAT-22 §3.5](./FEAT-22.md#35-voix-de-la-mascotte)).

### 3.3. Validateur (`validateBearSortCatalog`)

`validateBearSortCatalog(catalog = BEAR_SORT_CATALOG): CatalogValidationResult` enchaîne :
1. `validateLevelCatalog('bear-sort', catalog)` : identifiant `LEVEL_ID_PATTERN` unique, niveau du bon jeu, palier connu, `order` fini et unique dans son palier ([FEAT-07](./FEAT-07.md)).
2. `getBearSortConfigErrors(level.config)` pour chaque niveau, préfixé de son nom (« niveau n° 3 « bs-003 » : … ») : boîtes opposées, contenu de chaque phase, conflit après un changement, négation en dernière phase, STOP qui interrompt ([FEAT-23 §3.5](./FEAT-23.md#35-validation-dune-configuration-getbearsortconfigerrors)).

Le validateur vérifie qu'une étoile se joue, pas qu'elle est à sa place dans la courbe : c'est `tests/bear-sort-catalog.test.ts` qui fige l'identifiant, le palier, l'`order` et la suite des règles de chaque étoile, ainsi que la forme de la courbe. Les nombres d'ours restent libres tant que le validateur les accepte ; la table ci-dessus se lit dans `catalog.ts`.

### 3.4. Branchements

* **Registre** (`game-registry.ts`) : `GAME_REGISTRY['bear-sort']` = `{ id: 'bear-sort', title: 'Attrape-Piège', skill: 'Flexibilité mentale & Inhibition', path: '/bear-sort', catalog: BEAR_SORT_CATALOG }`, quatrième carte du Hub.
* **Icône** (`game-icons.ts`) : `PawPrint` sur une pastille `bg-sky-300` (l'exhaustivité sur `GameId` est imposée par le compilateur).
* **Page** (`src/app/bear-sort/page.tsx`) : `metadata` avec le titre du registre, rend `BearSortGameScreen` importé en module direct.
* **`validate:levels`** (`scripts/validate-levels.ts`) : quatrième `CatalogCheck`, résumé de chaque étoile par ses règles (`getRuleLabel`, par exemple « Ranger par couleur → Tous les ours, sauf un ours bleu ») ; le bilan devient « 80 niveaux valides dans 4 catalogues ».

---

## 4. Points d'attention

* **Un niveau publié n'est jamais retiré ni renommé** (contrat [FEAT-07](./FEAT-07.md)) : son `id` est la clé de la sauvegarde. Un nouveau niveau s'intercale avec un `order` libre ; changer un palier ou un `order` ne touche pas à la sauvegarde.
* **Cycle d'imports** : `catalog.ts` importe `@/core/progression/catalog-validator` et `@/core/progression/types`, jamais le barrel `@/core/progression`, qui ré-exporte le registre, lui-même importateur du catalogue. `validate-levels.ts` et `game-registry.ts` importent les modules du jeu directement, jamais `@/games/bear-sort`.
* **Une nouvelle phrase pour une nouvelle règle** : le catalogue ne peut utiliser que les règles qui ont un clip (`getRuleClipId`, [FEAT-22](./FEAT-22.md)) ; les 8 règles « sauf » et les 2 règles de tri sont déjà couvertes. Une règle d'un nouveau type demande un nouveau clip et un nouveau type de règle dans le moteur.
* **Le Hub et la carte restent écrits** : l'absence de texte vaut du début d'une étoile à son écran de fin ([FEAT-24](./FEAT-24.md)) ; un jeune enfant peut avoir besoin d'un adulte pour démarrer.
* **Les adultes trouveront le haut de la carte facile** : la négation est le plafond voulu pour ce public. Les étoiles à règle cachée, le vrai mécanisme du Wisconsin, pourront rejoindre le catalogue plus tard ([§6](#6-décisions-dimplémentation-session-de-cadrage)).

---

## 5. Critères d'Acceptation (Definition of Done)

- [x] `npm run validate:levels` s'exécute avec succès et valide les 20 étoiles de *Memory*, de *Traffic Jam*, de *Suites Logiques* et d'*Attrape-Piège* (80 niveaux, code de sortie `0`).
- [x] `tests/bear-sort-catalog.test.ts` fige les 20 étoiles (identifiant, palier, `order`, suite des règles) et la courbe, joue chaque étoile en parties simulées (joueur parfait : couronne ; joueur maladroit : étoile sans couronne) et exerce chaque règle du validateur sur des catalogues invalides.
- [x] La page `/bear-sort` affiche la Carte des Étoiles et lance le plateau de [FEAT-24](./FEAT-24.md), de l'Étoile #1 à l'Étoile #20 ; le Hub compte les étoiles du jeu.
- [ ] Recette avec de vrais enfants : compréhension et rythme de la courbe, notamment « sauf un petit ours bleu » à 3 ans (voir [§6](#6-décisions-dimplémentation-session-de-cadrage), « Non vérifié »).
- [x] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `validate:levels`, `test:coverage`, `build`) passe sans aucune erreur.
- [x] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(bear-sort): add initial 20-star catalog and level validation`).

---

## 6. Décisions d'implémentation (session de cadrage)

Décisions prises avec le propriétaire au fil de trois séries de questions, avec leurs motivations et les alternatives écartées. Les arbitrages de Claude pendant l'implémentation sont signalés comme tels, pour relecture par le propriétaire ; les lignes purement techniques sont des choix d'implémentation.

| Sujet | Décision |
| :--- | :--- |
| **Public** | **Enfants de 3 à 6 ans seulement pour l'instant, règle toujours dite.** La négation est le plafond. Les adultes trouveront le dernier palier facile ; des étoiles à règle cachée (le vrai mécanisme du Wisconsin) pourront rejoindre le catalogue plus tard. Écartés : **cacher la règle aux paliers 4 et 5** ; une **troisième caractéristique pour toute la famille** (la forme). |
| **Courbe** | **20 étoiles avec un départ tout en douceur.** L'Étoile #1 est en couleur seule, pour apprendre le geste (l'unique exception à « chaque étoile a un changement », avec une main qui montre le geste) ; le premier changement arrive à l'Étoile #2, environ six ours par série comme dans le DCCS. Le palier 2 allonge les séries et ajoute des ours en conflit, le palier 3 fait des allers-retours, le palier 4 apporte « tous sauf les bleus », le palier 5 « tous sauf le petit bleu ». Écartés : un **changement dès l'Étoile #1** (le geste, la règle et le STOP tous à la fois) ; **dix étoiles au lancement**. |
| **Couleurs** | **Ours bleus et jaunes, rouge réservé au STOP.** La paire reste distincte en cas de daltonisme rouge-vert, et le rouge ne veut jamais dire que « stop » : un panneau rouge à côté de « sauf le petit rouge » pousserait l'enfant à réduire la règle à « pas rouge ». L'exemple du brief d'origine devient « sauf un petit ours bleu ». Écartés : des **ours rouges et bleus**. |
| **Nom, faculté, route** *(arbitrage de Claude, à relire)* | **« Attrape-Piège »**, tiré du mécanisme décrit par le brief d'origine ; faculté affichée par le Hub : **« Flexibilité mentale & Inhibition »** ; route `/bear-sort` ; identifiant de jeu `bear-sort` et préfixe de niveau `bs-`. L'identifiant et la route restent en anglais comme `traffic-jam`, et ne changeront pas si le nom affiché change : seul le registre le montre au joueur (Hub, Carte des Étoiles, titre de la page). |
| **Valeurs retenues** | Série d'ouverture de 8 ours dont 6 à ranger (`OPENING_BEARS`, 2 ours de chaque sorte) : 2 attendent quand le STOP arrive et 4 ours nouveaux portent la série suivante à 6, comme les 6 + 6 du DCCS. Boîtes : les deux appariements (petite bleue + grande jaune, grande bleue + petite jaune), chacun des deux côtés. Chaque étoile existe en général dans les deux sens (couleur d'abord, taille d'abord). |
| **Validation** | `validateBearSortCatalog` : règles communes puis `getBearSortConfigErrors`, sans règle sur la progression entre étoiles. Contrairement à Traffic Jam (`optimalMoves`, [FEAT-14](./FEAT-14.md)), il n'y a pas de mesure objective de difficulté à comparer d'un palier à l'autre : la courbe est un choix de conception, figé par le test. |
| **Écran** | `src/games/bear-sort/BearSortGameScreen.tsx` (`'use client'`) rend `GameScreen` avec le catalogue typé et le plateau, modules importés directement ([FEAT-14](./FEAT-14.md), contrat FEAT-08 : `renderLevel` est une fonction, intransmissible depuis le composant serveur de la page). `page.tsx` garde `metadata`. |
| **Tests** | `tests/bear-sort-catalog.test.ts` (environnement `node`, modules importés directement) : les 20 étoiles (identifiant, palier, `order`, suite des règles), titres uniques, 5 paliers de 4 étoiles numérotées de 1 à 20, Étoile #1 seule débloquée, branchement sur le registre ; courbe (phase unique et geste réservés à l'Étoile #1, un seul changement aux paliers 1 et 2, retour à la première règle au palier 3, négation d'une caractéristique au palier 4 et de deux au palier 5, toujours en dernière phase) ; parties simulées à graine pour chaque étoile : joueur parfait (10 graines, couronne, un STOP par changement avec des ours qui attendent, un ours en conflit à ranger après chaque changement de tri, aucun ours perdu), joueur maladroit (étoile gagnée sans couronne, rebonds `old-rule` et `forbidden`) ; `validateBearSortCatalog` (règles communes, chaque anomalie de configuration, ordre des messages) ; libellés ; script de la voix (phrases uniques, chemins, chaque règle du catalogue a son clip, aucun clip de règle orphelin). `tests/progression-engine.test.ts` : registre (titre, faculté, route, ordre du Hub). |
| **Non vérifié** | **Aucune partie jouée avec un vrai enfant** : la courbe vient de la conception et du DCCS, pas d'une observation. À éprouver notamment : un enfant de 3 ans s'en sort-il avec « sauf un petit ours bleu » ? La durée d'une séance convient-elle ? Aucune partie non plus sur un **vrai Android TV ni dans l'APK** (ni JDK ni SDK Android en local, seule la CI compile l'APK). |
| **Git** | Commit prévu à l'intégration : `feat(bear-sort): add initial 20-star catalog and level validation`. |
