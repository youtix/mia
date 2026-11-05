# FEAT-26 : Jeu n°1 (Memory) — Aperçu Obligatoire & Catalogue Rééquilibré

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-26`
> **Dépendances** : [FEAT-09](./FEAT-09.md), [FEAT-10](./FEAT-10.md), [FEAT-11](./FEAT-11.md), [FEAT-19](./FEAT-19.md)
> **Statut** : cadrée et implémentée ; les décisions prises avec le propriétaire sont consignées au [§6](#6-décisions-dimplémentation-session-de-cadrage). Trois paris restent à éprouver avec de vrais enfants ([§6, « Paris connus »](#6-décisions-dimplémentation-session-de-cadrage)).

---

## 1. Contexte & Objectif pour l'IA

Au début d'une étoile de **Memory**, l'aperçu montre toutes les cartes face visible, puis les cache : c'est le moment où l'on mémorise leurs places. Avant cette feature, douze étoiles sur vingt n'en avaient pas (`previewSeconds: 0`, [FEAT-11](./FEAT-11.md)), et le réglage « Temps de mémorisation » de [FEAT-19](./FEAT-19.md) n'y changeait rien (« Les étoiles sans aperçu n'en gagnent pas. »). Sur les huit autres, un tap sur une carte ou OK le terminait sur-le-champ ([FEAT-10 §5](./FEAT-10.md#5-décisions-dimplémentation-session-de-cadrage)), et l'aide du bandeau y invitait (« Touche une carte pour commencer ») : un enfant qui touchait une carte pendant l'aperçu perdait d'un coup tout son temps de mémorisation.

L'objectif de cette **FEAT-26** est un aperçu **obligatoire** : chaque étoile commence par montrer ses cartes (5 s, multipliées par le facteur du profil : 2,5 s à 10 s), et personne ne peut abréger cet aperçu, ni au doigt ni à la télécommande : seule la fin du compte à rebours cache les cartes. Le catalogue est rééquilibré en conséquence (`mem-003` et `mem-005` revues, couronnes resserrées d'une erreur sur les douze étoiles qui gagnent un aperçu) sans changer un seul identifiant : étoiles, couronnes et records déjà enregistrés sont conservés. Les permutations (`mem-019`, `mem-020`) visent toujours d'abord les cartes que l'enfant a retournées lui-même : l'aperçu, qui montre tout le plateau, ne rend aucune carte « vue ».

---

## 2. Fichiers à Créer / Modifier

```text
src/
├── types/
│   └── mia.ts                         # Commentaire de previewFactor : 5 s sur chaque étoile du catalogue
├── games/
│   └── memory/
│       ├── catalog.ts                 # previewSeconds: 5 sur les 20 étoiles, mem-003 et mem-005 revues, couronnes, refus de l'aperçu à 0
│       ├── engine.ts                  # Aucune carte vue à la création, aperçu compris : seuls les retournements du joueur orientent les permutations
│       ├── settings.ts                # Commentaires : 5 s sur chaque étoile du catalogue, 0 reste 0 hors catalogue
│       ├── types.ts                   # Commentaire de MemoryCard.seen : déjà retournée par le joueur
│       └── components/
│           ├── MemoryBoard.tsx        # Tap et OK ignorés pendant l'aperçu (selectCard seul), minuterie liée à sa partie, useNavigation retiré
│           └── MemoryHud.tsx          # Aide du bandeau « Les cartes vont se cacher », prop inputMode retirée
└── components/
    └── settings/
        └── labels.ts                  # Note « Temps de mémorisation » (GAME_SETTINGS_TEXTS.previewNote)
tests/
├── memory-board.test.tsx              # Tap et OK ignorés pendant l'aperçu, minuterie intacte, « Recommencer » pendant l'aperçu, garde d'activation sans aperçu, nouvelle aide
├── memory-catalog.test.ts             # 5 s partout, mem-003 et mem-005, couronnes, refus de previewSeconds 0
├── memory-engine.test.ts              # Aucune carte vue à la création, permutations sur les cartes retournées ; configurations d'origine de FEAT-11, jeux d'essai du moteur
├── memory-settings.test.ts            # Commentaire et intitulé : 0 reste 0 pour une configuration hors catalogue
└── star-map.test.tsx                  # Étoile #5 lancée depuis la carte : le plateau s'ouvre sur l'aperçu
docs/
├── FEAT-26.md                         # Ce document
├── SPECIFICATION.md                   # §3.2 (previewFactor), §4.1 (aperçu, table des 20 étoiles, « Non vérifié »), §5 (graphe), §6 (liste)
├── FEAT-09.md, FEAT-10.md, FEAT-11.md # Renvois : jeux d'essai du moteur, aperçu sans raccourci, catalogue et validateur
└── FEAT-19.md                         # Renvois : note du réglage, plus d'étoile sans aperçu
README.md                              # Fonctionnalités (Memory), champ previewSeconds, arborescence de docs/
```

---

## 3. Spécifications

> Les décisions prises avec le propriétaire ([§6](#6-décisions-dimplémentation-session-de-cadrage)) donnent les motivations de ces spécifications et les alternatives écartées.

### 3.1. Catalogue (`src/games/memory/catalog.ts`)

* **Un aperçu sur chaque étoile** : les 20 étoiles ont `previewSeconds: 5`, la base uniforme de FEAT-19 ; les douze qui en étaient privées l'obtiennent. Durée jouée inchangée : `previewSeconds × previewFactor` du profil, soit 2,5 s, 5 s, 7,5 s ou 10 s, jamais 0.
* **Le reste de la structure ne bouge pas** : identifiants, paliers, `order` (donc numéros d'étoile), grilles, `matchSize`, `maxMistakes` et `swapEveryNMistakes` restent ceux de [FEAT-11 §3.1](./FEAT-11.md), table mise à jour. Les huit étoiles qui avaient déjà un aperçu (`mem-001`, `mem-002`, `mem-004`, `mem-006`, `mem-009`, `mem-010`, `mem-015`, `mem-018`) ne changent pas.
* **Les douze étoiles qui gagnent un aperçu** :

| Étoile | `id` | Grille | `title` | `visualMode` | `previewSeconds` | `perfectMaxMistakes` | `maxMistakes` |
| :---: | :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| ⭐ 3 | `mem-003` | `3 x 2` (6) | « Sans aperçu » → **« Premier thème »** | `distinct_color_shape` → **`thematic_palette`** | `0` → `5` | `2` → `1` | `null` |
| ⭐ 5 | `mem-005` | `4 x 2` (8) | « Première palette » → **« Huit cartes à thème »** | `thematic_palette` | `0` → `5` | `3` → `2` | `null` |
| ⭐ 7 | `mem-007` | `5 x 2` (10) | « Dix cartes à thème » | `thematic_palette` | `0` → `5` | `4` → `3` | `null` |
| ⭐ 8 | `mem-008` | `4 x 3` (12) | « Douze cartes » | `thematic_palette` | `0` → `5` | `4` → `3` | `null` |
| ⭐ 11 | `mem-011` | `4 x 4` (16) | « Seize en monochrome » | `monochrome` | `0` → `5` | `6` → `5` | `12` |
| ⭐ 12 | `mem-012` | `5 x 4` (20) | « Vingt cartes » | `thematic_palette` | `0` → `5` | `7` → `6` | `14` |
| ⭐ 13 | `mem-013` | `5 x 4` (20) | « Vingt en monochrome » | `monochrome` | `0` → `5` | `6` → `5` | `12` |
| ⭐ 14 | `mem-014` | `6 x 4` (24) | « Vingt-quatre cartes » | `thematic_palette` | `0` → `5` | `8` → `7` | `15` |
| ⭐ 16 | `mem-016` | `6 x 4` (24) | « Formes tournées » | `abstract_orientation` | `0` → `5` | `8` → `7` | `14` |
| ⭐ 17 | `mem-017` | `6 x 5` (30) | « Trente cartes » | `monochrome` | `0` → `5` | `10` → `9` | `18` |
| ⭐ 19 | `mem-019` | `5 x 4` (20) | « Cartes qui permutent » | `monochrome` | `0` → `5` | `6` → `5` | `12` |
| ⭐ 20 | `mem-020` | `6 x 6` (36) | « Grand final » | `abstract_orientation` | `0` → `5` | `10` → `9` | `20` |

* **`mem-003` « Premier thème »** : même grille 3 × 2 que `mem-002` « Trois paires », mais en `thematic_palette` : ses trois icônes viennent d'un même thème, et chaque paire garde sa propre couleur (3 groupes sur les 3 couleurs de la palette du thème, réparties à parts égales par `buildThematicGroups`, [FEAT-09 §5](./FEAT-09.md#5-décisions-dimplémentation-session-de-cadrage)). La règle du palier Très Facile tient donc : chaque paire a sa couleur et son icône. Couronne à 1 erreur, comme `mem-002`.
* **`perfectMaxMistakes`** baisse de 1 sur les douze étoiles du tableau (une erreur de moins pour la couronne) ; `perfectMaxMistakes ≤ maxMistakes` (règle de `getMemoryConfigErrors`) tient partout.
* Les commentaires du catalogue suivent : en-tête (« Aperçu (`previewSeconds`) : 5 s sur chaque étoile (FEAT-26), jamais 0 (`validateMemoryCatalog`) ») et palier Très Facile (les icônes de « Premier thème » viennent d'un même thème).

### 3.2. Validateur (`validateMemoryCatalog`)

* **Nouvelle règle du catalogue** (`getMemoryLevelErrors`), ajoutée après les anomalies de `getMemoryConfigErrors` : un niveau à `previewSeconds` 0 est refusé avec le message « previewSeconds 0 : chaque étoile commence par montrer ses cartes (aperçu > 0 attendu) », préfixé comme les autres (« niveau n° 3 « mem-003 » : previewSeconds 0 : … »). Un niveau en anomalie n'est pas instancié ([FEAT-11 §5](./FEAT-11.md#5-décisions-dimplémentation-session-de-cadrage)), et `npm run validate:levels` échoue (code de sortie `1`).
* **Un message par anomalie** : un aperçu négatif ou non fini reste signalé par `getMemoryConfigErrors` seul (« previewSeconds -1 invalide (nombre fini ≥ 0 attendu) ») ; la règle du catalogue ne vise que `0`.
* **Le moteur accepte toujours 0** : `getMemoryConfigErrors` et `createMemoryGame` acceptent `previewSeconds` 0 (partie ouverte en `playing`, cartes cachées) ; `applyMemorySettings` garde 0 à 0 et le HUD n'affiche alors aucun bandeau d'aperçu. Une telle configuration se joue encore hors catalogue (dans les tests notamment). Côté moteur, seule la carte « vue » change ([§3.6](#36-permutations-moteur-enginets)).
* **Le validateur n'impose pas 5 s** : toute durée finie > 0 passe. `tests/memory-catalog.test.ts` fige 5 s sur chaque étoile (table de [FEAT-11 §3.1](./FEAT-11.md) vérifiée colonne par colonne).

### 3.3. Plateau (`components/MemoryBoard.tsx`)

* **Tap, clic ou OK sur une carte** (`selectAt`) : `selectCard(game, index)`, et plus `endPreviewPhase` pendant l'aperçu. Hors `playing` (aperçu, évaluation), le moteur ignore l'action et renvoie l'état reçu lui-même ([FEAT-09 §5](./FEAT-09.md#5-décisions-dimplémentation-session-de-cadrage)) : `selectAt` s'arrête sur `next === game`, sans `setGame` ni rendu. Rien ne se retourne, l'aperçu continue, et sa minuterie (effet sur `[game, isPageHidden]`) n'est ni relancée ni arrêtée : seule sa fin, au bout de `game.config.previewSeconds × 1000` ms, appelle `endPreviewPhase` et cache les cartes.
* **Tape entre la minuterie et le rendu** : `selectAt` lit l'état du dernier rendu. Une tape tombée après la fin de la minuterie, avant le rendu qui cache les cartes, voit encore la phase `preview` : elle est ignorée comme toute tape pendant l'aperçu, et la suivante retourne une carte.
* **Minuterie liée à sa partie** : à son échéance, la minuterie de l'aperçu ne termine que la partie qui l'a armée (`setGame((current) => (current === game ? endPreviewPhase(current) : current))`). Une échéance traitée dans la même tâche que « Recommencer », avant le nettoyage de l'effet, laisse donc le nouvel aperçu entier. Reproduit en jsdom seulement (dans Chromium, React termine le clic avant toute minuterie), mais la garde ne coûte rien.
* **D-Pad** : la zone de la grille reste active pendant l'aperçu ([FEAT-10 §5](./FEAT-10.md#5-décisions-dimplémentation-session-de-cadrage)) : le curseur se déplace et Retour répond ; OK, qui clique la carte ciblée (même gestionnaire qu'une tape), est ignoré.
* **Aucun retour ajouté sur une tape ignorée** : ni son, ni message vocalisé, ni animation propre ; la carte garde l'enfoncement commun à tous ses états (`active:scale-[0.97]` de `MemoryCardView`, carte trouvée comprise). Le bandeau d'aperçu (§3.4) et son compte à rebours disent ce qui se passe.
* **Inchangé** : Retour ramène à la Carte des Étoiles et « Recommencer » lance une nouvelle partie, donc un nouvel aperçu entier avec son compte à rebours (`round`), pendant l'aperçu comme après ; une page cachée (autre onglet, appel, téléphone verrouillé) suspend l'aperçu, qui repart en entier au retour ; le temps de partie se mesure toujours à partir de la première phase `playing`, après l'aperçu.
* `MemoryBoard` ne lit plus `useNavigation()` : le mode de saisie ne servait qu'à l'aide du bandeau.

### 3.4. Bandeau d'aperçu (`components/MemoryHud.tsx`)

* `PreviewBanner` : « Mémorise les cartes ! », puis l'aide **« Les cartes vont se cacher »**, la même au doigt et à la télécommande, à la place de « Touche une carte pour commencer » et « Appuie sur OK pour commencer », devenues fausses. Elle est plus courte que ces deux aides : « Regarde bien, les cartes vont se cacher », essayée d'abord, débordait de la colonne la plus étroite du HUD en paysage (568 × 320 sur `mem-019` et `mem-020` : trois lignes, « cacher » sous le bord, colonne débordant de 25 px au lieu de 8) et prenait deux lignes en portrait sur 320 px (HUD plus haut de 17 px, cartes plus petites de 1,4 px). L'aide retenue tient sur autant de lignes que les anciennes (2 à 568 × 320, 1 à 320 × 568) : débordement de 8 px comme avant, cartes de même taille. Le compte à rebours ne change pas ([FEAT-19](./FEAT-19.md), §3.4 : aligné sur la fin de l'aperçu, « 3 secondes » vocalisé).
* La prop `inputMode` de `MemoryHud` et de `PreviewBanner` est retirée.

### 3.5. Réglage « Temps de mémorisation » (`src/components/settings/labels.ts`)

* Note (`GAME_SETTINGS_TEXTS.previewNote`) : « Multiplie l'aperçu de 5 s qui montre les cartes au début de chaque étoile : « Court » le ramène à 2,5 s, « Très long » le double. » Elle remplace « Multiplie l'aperçu des cartes au début d'une étoile : « Très long » le double. Les étoiles sans aperçu n'en gagnent pas. »
* Options, facteurs et enregistrement inchangés ([FEAT-19](./FEAT-19.md), §3.5) : « Court » × 0,5 (2,5 s), « Normal » × 1 (5 s), « Long » × 1,5 (7,5 s), « Très long » × 2 (10 s) ; le réglage agit désormais sur les vingt étoiles.
* Commentaires alignés : `MemoryGameSettings.previewFactor` (`src/types/mia.ts` : « Multiplie l'aperçu du niveau (`previewSeconds`, 5 s sur chaque étoile du catalogue) »), `src/games/memory/settings.ts` et `MemoryBoard`.

### 3.6. Permutations (moteur, `engine.ts`)

* **Carte « vue » = retournée par le joueur** : `createMemoryGame` crée chaque carte avec `seen: false`, aperçu compris (avant : `seen: isPreview`), et seul `selectCard` la passe à `true` ; `endPreviewPhase` cache les cartes sans y toucher. Commentaire de `MemoryCard.seen` (`types.ts`) : « Déjà retournée par le joueur ».
* **Pourquoi** : l'aperçu montre tout le plateau. Avec « vue = montrée », toutes les cartes de chaque étoile étaient vues dès le départ, et la préférence de `swapHiddenCards` pour les cartes vues ne départageait plus rien : à la revue, 85 % (`mem-019`) et 92 % (`mem-020`) des premières permutations touchaient au moins une carte que le joueur n'avait jamais retournée, contre 0 % avant FEAT-26 (ces deux étoiles n'avaient pas d'aperçu). Après correction, sur 2 000 parties tirées par étoile, aucune première permutation ne touche une carte jamais retournée (84,7 % et 92,2 % avec « vue = montrée », dans le même banc d'essai).
* **Inchangé** : l'ordre de préférence de [FEAT-09 §5](./FEAT-09.md#5-décisions-dimplémentation-session-de-cadrage) (deux cartes vues, à défaut une vue et une jamais vue, en dernier recours deux jamais vues), la fréquence des permutations (`swapEveryNMistakes`) et `lastSwappedPair`. Les cartes d'une erreur étant toujours vues, la permutation touche de nouveau des cartes que l'enfant a retournées lui-même.

---

## 4. Points d'attention

* **Une tape ignorée ne crée aucun état** : la minuterie de l'aperçu dépend de `game`, et un nouvel objet `game` pendant l'aperçu la relancerait pour une durée entière. Le contrat du moteur (action ignorée = état reçu lui-même) et l'arrêt de `selectAt` sur `next === game` l'évitent. Un futur retour sur une tape (secousse, son) devra vivre dans un état à part, jamais dans `game`.
* **Une minuterie, une partie** : à son échéance, la minuterie de l'aperçu ne termine que la partie qui l'a armée (§3.3) ; sans cette garde, une échéance traitée dans la même tâche que « Recommencer », avant le nettoyage de l'effet, couperait le nouvel aperçu.
* **« Vue » ne veut plus dire « montrée »** : `seen` ne compte que les retournements du joueur (§3.6). Une future aide qui montrerait des cartes (indice, second aperçu) ne doit pas les marquer vues, sinon les permutations retomberaient au hasard.
* **Pas de `flushSync` à la fin de l'aperçu** : contrairement au STOP de Suites Logiques ([FEAT-21 §4](./FEAT-21.md#4-points-dattention)), la phase `preview` ignore les tapes, qui n'écrivent donc rien : une tape tombée entre la fin de la minuterie et le rendu qui cache les cartes est perdue, la suivante joue normalement.
* **La règle vit au catalogue** : le moteur accepte toujours `previewSeconds` 0. Une configuration à 0 passée directement au plateau (tests, futur mode hors catalogue) s'ouvre cartes cachées, sans bandeau ; seul `validateMemoryCatalog` empêche d'en publier une.
* **« 5 s » écrit dans la note du réglage** : le validateur accepte toute base > 0, mais la note de « Temps de mémorisation » cite 5 s et 2,5 s. Une étoile à une autre base resterait valide et rendrait la note fausse : changer la base demande de réécrire la note (le réglage ne possède toujours pas les secondes, [FEAT-19](./FEAT-19.md), §3.2).
* **Sauvegardes** : aucun identifiant ni champ de sauvegarde ne change (`schemaVersion` inchangé). Une couronne gagnée avec l'ancien seuil reste gagnée (`recordLevelVictory` garde `isPerfect` une fois vrai, le HUD affiche « Couronne déjà gagnée ») ; les records faits sans aperçu restent, et un meilleur score les remplace comme d'habitude. `mem-003` change de mode visuel sous le même identifiant : la sauvegarde ne connaît que celui-ci, et son plateau garde 6 cartes, si bien que ses records restent comparables.
* **Durées fractionnaires sur chaque étoile** : × 0,5 et × 1,5 donnent 2,5 s et 7,5 s sur les vingt étoiles ; le compte à rebours aligné sur la fin de l'aperçu ([FEAT-19](./FEAT-19.md), §3.4) les affiche déjà correctement.
* **Lecteur d'écran** : pendant l'aperçu, les cartes restent nommées par leur symbole ([FEAT-10 §5](./FEAT-10.md#5-décisions-dimplémentation-session-de-cadrage), « Aperçu ») ; en activer une ne change rien et rien n'est annoncé. L'aide et les secondes restantes se lisent dans le HUD (« État de la partie »).

---

## 5. Critères d'Acceptation (Definition of Done)

- [x] Les 20 étoiles ont `previewSeconds: 5` (joué 2,5 s, 5 s, 7,5 s ou 10 s selon le profil, jamais 0) ; `mem-003` est « Premier thème » (3 × 2, `thematic_palette`, couronne à 1 erreur), `mem-005` « Huit cartes à thème » ; `perfectMaxMistakes` baisse d'un sur les douze étoiles qui gagnent un aperçu ; identifiants, paliers et `order` inchangés.
- [x] `validateMemoryCatalog`, donc `npm run validate:levels`, refuse un niveau à `previewSeconds` 0 (« previewSeconds 0 : chaque étoile commence par montrer ses cartes (aperçu > 0 attendu) ») ; `getMemoryConfigErrors` et `createMemoryGame` l'acceptent toujours ; `npm run validate:levels` valide les 80 niveaux des quatre catalogues (code de sortie `0`).
- [x] Pendant l'aperçu, un tap, un clic ou OK sur une carte ne retourne rien, ne termine pas l'aperçu et ne relance ni n'arrête sa minuterie : seule la fin du compte à rebours cache les cartes ; Retour et « Recommencer » répondent ; une page cachée suspend l'aperçu, qui repart en entier au retour.
- [x] Les permutations visent d'abord les cartes retournées par le joueur : `createMemoryGame` ne marque aucune carte vue, aperçu compris.
- [x] Le bandeau affiche « Les cartes vont se cacher » au doigt comme à la télécommande ; la note « Temps de mémorisation » annonce l'aperçu de 5 s, ramené à 2,5 s par « Court » et doublé par « Très long ».
- [x] Étoiles, couronnes et records déjà enregistrés sont conservés : aucun identifiant ni champ de sauvegarde ne change.
- [x] `tests/memory-board.test.tsx`, `tests/memory-engine.test.ts`, `tests/memory-catalog.test.ts` et `tests/star-map.test.tsx` couvrent ces comportements ; `npm run validate:all` (`format:check`, `lint`, `typecheck`, `validate:levels`, `test:coverage`, `build`) passe sans aucune erreur, seuils de couverture inchangés.
- [ ] Recette avec de vrais enfants : les trois paris du [§6](#6-décisions-dimplémentation-session-de-cadrage) (« Paris connus »).
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(memory): make the card preview mandatory on every star`).

---

## 6. Décisions d'implémentation (session de cadrage)

Décisions prises avec le propriétaire, avec leurs motivations et les alternatives écartées ; les lignes purement techniques sont des choix d'implémentation.

| Sujet | Décision |
| :--- | :--- |
| **Aperçu sur chaque étoile** | Les 20 étoiles ont `previewSeconds: 5`, la base uniforme de FEAT-19 ; la durée jouée reste `previewSeconds × previewFactor` du profil (2,5 s, 5 s, 7,5 s ou 10 s, jamais 0). Chaque étoile commence donc par montrer ses cartes, et le réglage « Temps de mémorisation » agit sur les vingt (il n'agissait que sur huit). La difficulté se règle par la grille, le mode visuel et les limites d'erreurs, jamais par l'aperçu (en-tête de `catalog.ts`). |
| **Règle du catalogue, pas du moteur** | `validateMemoryCatalog` (donc `npm run validate:levels`) refuse un niveau à `previewSeconds` 0 : « previewSeconds 0 : chaque étoile commence par montrer ses cartes (aperçu > 0 attendu) ». Le moteur (`getMemoryConfigErrors`, `createMemoryGame`) accepte toujours 0 : une partie sans aperçu reste possible hors catalogue, la règle appartient au catalogue. |
| **Aucun raccourci** | Pendant l'aperçu, un tap, un clic ou OK sur une carte est ignoré : il ne termine plus l'aperçu, ne retourne rien, et ne relance ni n'arrête la minuterie ; seule la fin du compte à rebours cache les cartes. Motivation : un enfant qui touchait une carte pendant l'aperçu perdait d'un coup tout le temps de mémorisation. Aucun raccourci ni au doigt ni à la télécommande, et pas de bouton « Prêt ! » : un joueur pressé choisit « Court » (2,5 s) dans les réglages de son profil. Écartés : un raccourci réservé au doigt ou à la télécommande ; un bouton « Prêt ! ». |
| **Tape silencieuse** | Aucun retour ajouté sur une tape ignorée, par choix : ni son, ni message vocalisé, ni animation propre ; la carte garde l'enfoncement commun à tous ses états (`active:scale-[0.97]`). L'aide du bandeau devient « Les cartes vont se cacher », la même au doigt et à la télécommande : « Touche une carte pour commencer » et « Appuie sur OK pour commencer » seraient devenues fausses. Elle est plus courte qu'elles : « Regarde bien, les cartes vont se cacher », essayée d'abord, débordait du HUD le plus étroit (§3.4). |
| **Inchangé** | Retour et « Recommencer » répondent pendant l'aperçu (« Recommencer » relance un aperçu entier) ; une page cachée suspend l'aperçu, qui repart en entier au retour ; une tape tombée entre la fin de la minuterie et le rendu suivant est ignorée comme toute tape pendant l'aperçu (`selectAt` lit l'état du dernier rendu, encore en `preview`). |
| **`mem-003` « Premier thème »** | Ancienne « Sans aperçu ». Avec un aperçu partout, elle serait devenue une copie exacte de `mem-002` « Trois paires » (même grille 3 × 2, même mode) avec une couronne plus large (2 erreurs au lieu de 1), donc plus facile que l'étoile d'avant. Aucune taille de grille ne tient entre 6 et 8 cartes : la marche vient des icônes, désormais d'un même thème (`thematic_palette`), tandis que chaque paire garde sa couleur (3 groupes, 3 couleurs de la palette), ce qui respecte la règle du palier Très Facile ; le plateau garde 6 cartes, ses records restent comparables. Couronne à 1 erreur. Écartés : garder la copie de `mem-002` ; changer la grille. |
| **`mem-005` « Huit cartes à thème »** | Ancienne « Première palette » : ce n'est plus la première étoile en palette thématique (`mem-003` l'est désormais) ; le nom répond à `mem-007` « Dix cartes à thème ». Un titre n'est jamais affiché (en-tête « Étoile #N », [FEAT-11 §5](./FEAT-11.md#5-décisions-dimplémentation-session-de-cadrage)). |
| **Couronnes** | `perfectMaxMistakes` baisse d'un sur les douze étoiles qui gagnent un aperçu, pour compenser l'aide qu'il apporte : `mem-003` 2 → 1, `mem-005` 3 → 2, `mem-007` 4 → 3, `mem-008` 4 → 3, `mem-011` 6 → 5, `mem-012` 7 → 6, `mem-013` 6 → 5, `mem-014` 8 → 7, `mem-016` 8 → 7, `mem-017` 10 → 9, `mem-019` 6 → 5, `mem-020` 10 → 9. Les huit autres ne changent pas ; la règle `perfectMaxMistakes ≤ maxMistakes` du validateur tient partout. |
| **Permutations** | Décision du propriétaire, après la revue : les permutations (`mem-019`, `mem-020`) visent d'abord les cartes que l'enfant a retournées lui-même, comme avant FEAT-26. `createMemoryGame` crée donc chaque carte avec `seen: false`, aperçu compris ; seul un retournement du joueur la rend « vue » (§3.6). Motivation : l'aperçu montre tout le plateau ; avec « vue = montrée », 85 % (`mem-019`) et 92 % (`mem-020`) des premières permutations touchaient au moins une carte jamais retournée par le joueur, contre 0 % avant. Écarté : accepter des permutations au hasard et le documenter. |
| **Sauvegarde** | Identifiants inchangés, aucun champ ajouté, pas de montée de version du schéma : étoiles, couronnes et records déjà enregistrés sont conservés ; une couronne gagnée avec l'ancien seuil reste gagnée. |
| **Réglage** | Note de « Temps de mémorisation » : « Multiplie l'aperçu de 5 s qui montre les cartes au début de chaque étoile : « Court » le ramène à 2,5 s, « Très long » le double. » Options et facteurs de FEAT-19 inchangés. |
| **Paris connus** | Relevés à la revue de l'idée : (1) la marche de `mem-003` est mince : avec 3 paires, la palette donne encore sa couleur à chaque paire, seules les icônes se ressemblent. Sur la couleur, `mem-003` est peut-être même plus facile que `mem-002` : la palette de chaque thème est choisie bien séparée (jaune, émeraude et bleu ; orange, rose et cyan ; rouge, violet et citron vert), alors que `mem-002` tire 3 des 10 couleurs distinctes au hasard, et 63 des 120 tirages possibles (52,5 %) réunissent deux teintes voisines comme `red-400` et `orange-400` (calcul de la revue) ; seul le thème commun des icônes rend `mem-003` plus difficile ; (2) la tape silencieuse compte sur la lecture du bandeau : un enfant qui ne lit pas encore n'a que les chiffres du compte à rebours ; (3) les couronnes resserrées d'une erreur sont un pari sans données de jeu, à ajuster après avoir regardé jouer des enfants. |
| **Code** | Choix d'implémentation : `selectAt` n'appelle plus que `selectCard` ; la minuterie de l'aperçu ne termine que la partie qui l'a armée (`current === game`) ; la règle du catalogue vit dans `getMemoryLevelErrors` (`catalog.ts`) ; `createMemoryGame` crée les cartes avec `seen: false` ; `MemoryHud` et `PreviewBanner` perdent la prop `inputMode`, et `MemoryBoard` ne lit plus `useNavigation()` ; commentaires alignés dans `catalog.ts`, `engine.ts`, `settings.ts`, `types.ts`, `src/types/mia.ts`, `MemoryBoard.tsx` et `MemoryHud.tsx`. |
| **Tests** | `tests/memory-board.test.tsx` : taps et OK ignorés pendant l'aperçu, y compris fractionnaire (aucune carte retournée, ni coup ni erreur comptés, cartes cachées à la fin du compte à rebours compté depuis le début de l'aperçu, pas depuis le geste), Retour actif pendant l'aperçu, aide « Les cartes vont se cacher » au doigt et à la télécommande, « Recommencer » pendant l'aperçu (« relance un aperçu entier avec « Recommencer » pendant l’aperçu », « garde le nouvel aperçu quand l’ancien minuteur tombe dans la tâche de « Recommencer » ») ; les deux tests de la garde d'activation au lancement (« un double tap qui lance le niveau ne retourne aucune carte », « un OK répété qui lance le niveau ne retourne aucune carte ») passent sur un plateau sans aperçu : avec un aperçu, le moteur ignorait déjà le geste et ils ne vérifiaient plus la garde (sans elle, ils échouent bien) ; `tests/memory-engine.test.ts` : « ouvre l’aperçu avec toutes les cartes visibles, mais aucune encore vue (FEAT-26) », « cache toutes les cartes et lance la partie, aucune encore vue (FEAT-26) » et « vise les cartes retournées par le joueur, pas celles de l’aperçu (FEAT-26) » ; `tests/memory-catalog.test.ts` : table de FEAT-11 §3.1 (5 s sur chaque étoile, `mem-003` en `thematic_palette`, couronnes), chaque étoile ouverte sur son aperçu, refus de `previewSeconds` 0 après les anomalies de la configuration, moteur qui l'accepte toujours ; `tests/star-map.test.tsx` : l'Étoile #5 (`mem-005`) lancée depuis la carte s'ouvre sur l'aperçu (8 cartes montrées) ; dans `tests/memory-engine.test.ts`, les configurations d'origine de FEAT-11, aperçus nuls compris, restent des jeux d'essai du moteur (« instancie %s dans sa configuration d’origine (FEAT-11) ») ; `tests/memory-settings.test.ts` : un commentaire et un intitulé, assertions inchangées. Seuils de couverture inchangés. |
| **Vérifié dans un navigateur réel** | Build statique du `src/` final (corrections de la revue comprises) servi en local, Chromium headless piloté par CDP : tactile réel (`Input.dispatchTouchEvent`, profil `always_touch`) et télécommande (profil `always_tv`), début de l'aperçu daté dans la page. `mem-001` × 1 : une tape à 1,5 s puis deux à 3 s, cartes toutes montrées à 4,8 s, toutes cachées à 4 999 ms ; la tape suivante retourne une carte. `mem-003` × 0,5 (thème « Nature & ciel », une couleur par paire) : tape à 1 s, cartes cachées à 2 499 ms. `mem-001` à la télécommande : OK deux fois à 1 s puis à 2,5 s, cartes cachées à 4 998 puis 4 999 ms (deux passes) ; après l'aperçu, un seul OK retourne la carte ciblée, preuve que les OK de l'aperçu l'atteignaient bien. L'aide « Les cartes vont se cacher » s'affiche dans les trois cas, sans les anciennes. Mise en page de `mem-019` et `mem-020` (revue) : à 568 × 320, l'aide tient sur 2 lignes comme les anciennes, la colonne du HUD déborde de 8 px comme avant, cartes de même taille ; à 320 × 568, une ligne, HUD de 160 px, cartes de même taille qu'avec les anciennes aides ; même résultat avec « 10 » (× 2) et « 3 » (× 0,5) au compte à rebours, et le plateau garde sa taille à la fin de l'aperçu. |
| **Non vérifié** | Aucune partie jouée avec un vrai enfant (les trois paris ci-dessus), ni sur un vrai Android TV ni dans l'APK (ni JDK ni SDK Android en local, seule la CI compile l'APK). |
| **Git** | Branche `feat/memory-mandatory-preview` depuis `main` ; commit suggéré : `feat(memory): make the card preview mandatory on every star` (scope `memory` existant dans `commitlint.config.mjs`). |
