# FEAT-10 : Jeu n°1 (Memory) — Interface, Animations & Contrôles Hybrides

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-10`
> **Dépendances** : [FEAT-03](./FEAT-03.md), [FEAT-04](./FEAT-04.md), [FEAT-08](./FEAT-08.md), [FEAT-09](./FEAT-09.md)

---

## 1. Contexte & Objectif pour l'IA

Maintenant que le moteur logique pur de **Memory** est prêt (`FEAT-09`), l'objectif de cette **FEAT-10** est de construire l'interface graphique interactive du jeu dans `src/games/memory/components/`.

L'interface doit respecter **3 impératifs UX** :
1. **Zéro défilement pendant la partie** : Quelle que soit la taille de la grille (`2x2` en *Très Facile* jusqu'à `6x6` en *Très Difficile*), le plateau s'adapte dynamiquement à l'espace disponible sur Mobile portrait, Tablette et Android TV 16:9.
2. **Double Ergonomie (Tactile + Télécommande TV D-Pad)** :
   * Au doigt : Tap direct sur une carte pour la retourner.
   * À la télécommande TV : Déplacement d'un curseur lumineux avec les 4 flèches directionnelles (`useGridNavigation`) + touche `OK/Entrée` pour retourner la carte ciblée.
3. **Feedback visuel clair** : Compte à rebours d'aperçu initial, retournement animé des cartes, alerte visuelle lors d'une permutation de cartes (niveaux *Très Difficile*), et modale de fin de partie permettant d'enchaîner directement sur l'Étoile suivante.

---

## 2. Fichiers à Créer / Modifier

```text
src/
├── app/
│   └── globals.css                    # + utilitaire memory-grid : cartes carrées sans défilement, rotation (voir §5)
└── games/
    └── memory/
        ├── components/
        │   ├── MemorySymbolIcon.tsx   # Rendu vectoriel du symbole de la carte (avec couleur et rotation)
        │   ├── MemoryCardView.tsx     # Carte individuelle (face cachée / face visible, focus TV, état trouvé)
        │   ├── MemoryHud.tsx          # Barre d'état supérieure (Étoile #N, Paires/Triplets, Erreurs, Aperçu)
        │   ├── MemoryBoard.tsx        # Plateau complet avec gestion des timers (preview, evaluating) et D-Pad
        │   ├── MemoryEndModal.tsx     # Modale de fin de niveau et sa zone D-Pad (voir §5)
        │   ├── labels.ts              # Libellés français (erreurs, groupes, couronne, défaite) (voir §5)
        │   └── index.ts
        └── index.ts                   # Exporter les composants
tests/
└── memory-board.test.tsx              # Tests d'intégration UI (clic, clavier D-Pad, victoire)
```

---

## 3. Spécifications Fonctionnelles & UX Détaillées

> Les décisions de la session de cadrage ([§5](#5-décisions-dimplémentation-session-de-cadrage)) précisent ces spécifications : plateau `{ level, controls }`, en-tête d'`AppShell` et HUD sans bouton (bandeau en portrait, colonne en paysage), dimensionnement par la feuille de style et grille tournée en portrait, zone D-Pad active pendant l'aperçu, fin d'aperçu au premier tap, objectif de la couronne, modale dédiée, tutoiement.

### 3.1. `MemoryHud` (`src/games/memory/components/MemoryHud.tsx`)
Affiche de façon compacte au-dessus du plateau :
* Le numéro de l'Étoile en cours (ex: `⭐ Étoile #15`) et son `DifficultyPill`.
* Un badge indiquant la règle du niveau :
  * `"Trouvez les Paires (2)"` ou `"Trouvez les Triplets (3)"`.
  * Si `swapEveryNMistakes` est actif : badge d'avertissement `"⚡ Permutation toutes les X erreurs"`.
* Le compteur de progression : `Groupes : matchedGroups / totalGroups`.
* Le compteur d'erreurs : `Erreurs : X` (ou `X / maxMistakes`).
* Un bouton **Recommencer** (`↻`) et un bouton **Carte des Étoiles** (`↩`).
* **Contrat FEAT-09** ([§5](./FEAT-09.md#5-décisions-dimplémentation-session-de-cadrage)) : la limite d'erreurs est inclusive (`maxMistakes` erreurs tolérées, défaite à la suivante). « Erreurs : 10 / 10 » annonce le dernier essai ; la défaite (`mistakes === maxMistakes + 1`) ne s'affiche jamais « 11 / 10 » (ex: « Trop d'erreurs : plus de 10 »).

### 3.2. `MemoryCardView` (`src/games/memory/components/MemoryCardView.tsx`)
* Utilise une balise `<button type="button">` accessible (`aria-label` explicite selon l'état de la carte pour respecter `jsx-a11y`).
* **États visuels** :
  * `hidden` : Dos de carte élégant (`bg-slate-800 border-slate-700`).
  * `flipped` : Face claire/contrastée (`bg-slate-900 border-sky-400`) affichant `MemorySymbolIcon` centré.
  * `matched` : Face validée (`bg-emerald-950/40 border-emerald-500/50 opacity-75`) avec coche verte.
* **Focus Télécommande TV (`isFocused === true`)** :
  * Applique un anneau très lumineux (`ring-4 ring-amber-400 scale-[1.05] z-10 shadow-xl shadow-amber-500/20`).
* **Indicateur de Permutation (`isSwapping === true`)** :
  * Lorsqu'une carte fait partie de `lastSwappedPair`, applique une bordure violette animée (`ring-4 ring-purple-500 animate-pulse`) pendant `1000ms`.
* **Contrat FEAT-09** ([§5](./FEAT-09.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * `MemorySymbolIcon` : table exhaustive sur `MemorySymbolId`. Icônes Lucide (ex: `bolt` → `Zap`, `diamond` → `Gem`, `tree` → `TreePine`) ; formes géométriques dessinées comme `avatar-icons.tsx`, pointe vers le haut à 0°. `colorClass` (`text-*`) colore le symbole ; `rotationDeg` le fait tourner (sens horaire).
  * `aria-label` d'une carte visible : `getMemorySymbolLabel(symbolId, rotationDeg)` (noms uniques : « Soleil », « Flèche, vers la droite »). Le texte ne dépend jamais de la couleur, qui ne distingue jamais seule deux groupes.
  * Clé React : `card.uid`, stable lors d'une permutation (les deux cartes échangent leur place dans `cards`, l'animation de position suit l'`uid`).

### 3.3. Orchestration dans `MemoryBoard` (`src/games/memory/components/MemoryBoard.tsx`)
* **Timer de la phase `preview`** :
  * Si `phase === 'preview'`, affiche une bannière *"Mémorisez les cartes !"* et déclenche `endPreviewPhase` automatiquement au bout de `config.previewSeconds` secondes (ou immédiatement si le joueur appuie sur `OK` / touche une carte).
* **Timer de la phase `evaluating`** :
  * Si les cartes forment un groupe valide (`groupId` identique) : appelle `resolveEvaluation` après `350ms`.
  * Si les cartes ne correspondent pas : laisse les cartes visibles pendant `900ms` avant d'appeler `resolveEvaluation`.
* **Navigation D-Pad (`useGridNavigation`)** :
  * Configure `useGridNavigation({ scopeId: 'memory-grid', rows: config.rows, cols: config.cols, isActive: phase === 'playing' })`.
  * **Contrat FEAT-04** ([§5](./FEAT-04.md#5-décisions-dimplémentation-session-de-cadrage)) : passer `ref={getItemRef(i)}` et `isFocused={isItemFocused(i)}` à chaque `MemoryCardView` (anneau en mode D-Pad uniquement, focus DOM et défilement automatiques). Sans `onSelect`, OK clique la carte ciblée : même gestionnaire qu'au tap. Les boutons du HUD forment une autre zone, rejointe par `onEdge`. Une zone inactive ne reçoit pas Retour : si Retour doit rester disponible pendant `preview` / `evaluating`, garder la zone active et ignorer OK pendant ces phases.
  * La modale de fin de niveau déclare sa propre zone (`useGridNavigation`, `initialIndex` sur « Étoile Suivante ») **dans un composant rendu à l'intérieur de `ModalDialog`** : sa couche suspend le plateau automatiquement. Sans `onClose`, Retour est routé vers l'`onBack` de cette zone (ex: Carte des Étoiles).
* **Modale de Fin de Niveau (`ModalDialog`)** :
  * En cas de victoire (`phase === 'won'`) : appelle le callback `onVictory({ moves, mistakes, isPerfect })` et propose **"Étoile Suivante (#N+1) →"** (pré-focalisé), **"Rejouer"** et **"Carte des Étoiles"**.
  * En cas de défaite (`phase === 'lost'`) : propose **"Réessayer"** (pré-focalisé).
* **Contrat FEAT-07** ([§5](./FEAT-07.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * La victoire est enregistrée par `updateState((state) => recordLevelVictory(state, { gameId: 'memory', levelId, moves, timeSeconds, isPerfect }))` (`isPerfect` : `isPerfectWin`). Mesurer `timeSeconds` avec `performance.now()` : `Date.now()` recule si l'horloge de la TV est réglée pendant la partie. Une valeur invalide ne devient jamais un meilleur score, mais l'étoile est toujours gagnée.
  * « Étoile Suivante (#N+1) » : `allLevels[globalIndex + 1]` du résumé (`getGameProgressSummary`), débloqué par cette victoire ; absent après la dernière étoile du catalogue.
* **Contrat FEAT-08** ([§6](./FEAT-08.md#6-décisions-dimplémentation-session-de-cadrage)) :
  * Le plateau est rendu par `renderLevel(level, controls)` de `GameScreen` (branché par FEAT-11) et remonté à chaque changement de niveau ; « Rejouer » se gère dans le plateau. `controls.recordVictory({ moves, timeSeconds, isPerfect })` applique `recordLevelVictory` au profil actif ; `controls.playLevel(id)` lance « Étoile Suivante » (`controls.summary.allLevels[level.globalIndex + 1]`) en remplaçant l'entrée d'historique ; `controls.exitToMap()` répond à « Carte des Étoiles » et à Retour (historique dépilé ou remplacé, jamais de sortie de Mia).
  * Le niveau n'est joué que débloqué et avec un profil actif (`ProfileGate` de `GameScreen`) : le plateau n'a pas à le vérifier.
* **Contrat FEAT-09** ([§5](./FEAT-09.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * Délai de la phase `evaluating` : `isEvaluationMatch(state)` (350 ms si vrai, 900 ms sinon), puis `resolveEvaluation(state)`.
  * Une action ignorée renvoie l'état reçu lui-même (`selectCard` hors `playing` ou sur une carte non cachée, `endPreviewPhase` hors `preview`, `resolveEvaluation` hors `evaluating`) : aucune garde à dupliquer dans le plateau, aucun rendu inutile.
  * `lastSwappedPair` n'est renseigné que par la résolution qui permute (nouveau tableau à chaque permutation, `null` dès la résolution suivante) : déclencher l'indicateur de 1000 ms sur son changement de référence.
  * « Rejouer » et « Recommencer » : `createMemoryGame(config)`, qui tire de nouveaux symboles et de nouvelles positions.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/memory-board.test.tsx` vérifie le déroulement complet d'une partie au clic et au clavier D-Pad (`ArrowRight` + `Enter`) jusqu'à la modale de victoire, en maintenant la couverture globale `>= 80%`.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(memory): add memory board ui with 3d flip and dpad controls`).

---

## 5. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **API du plateau** | `MemoryBoard({ level, controls })` : `EnrichedLevelItem<MemoryLevelConfig>` et `LevelControls` de `GameScreen` tels quels ; FEAT-11 rend `renderLevel={(level, controls) => <MemoryBoard level={level} controls={controls} />}`. Le callback `onVictory({ moves, mistakes, isPerfect })` de §3.3 devient `controls.recordVictory({ moves, timeSeconds, isPerfect })` ; les erreurs ne servent qu'à la modale. Plateau remonté à chaque changement de niveau (`key` de `GameScreen`). |
| **Écran** | `AppShell` : titre « Étoile #N » (`h1`), Retour → Carte des Étoiles (`exitToMap`), « Recommencer » (↻, texte masqué sous `sm:`) dans l'emplacement de droite, comme « Jouer l'Étoile #X » sur la carte. `MemoryHud` ne contient aucun bouton : palier (`DifficultyPill`), règle, permutation (« Permutation toutes les N erreurs », « à chaque erreur » pour 1), compteurs, objectif de la couronne, bandeau d'aperçu. Pied de page TV : `DEFAULT_REMOTE_HINTS`. |
| **Mise en page** | HUD en bandeau au-dessus du plateau en portrait, en colonne à sa gauche en paysage (`landscape:`, 13 rem, 15 rem dès `md:`) : la largeur libre d'un écran 16:9 sert au HUD, environ 20 % de taille de carte gagnée sur téléviseur (6 × 6 ≈ 51 px au lieu de 42 sur 960 × 540). Compteurs et bandeau d'aperçu superposés dans la même cellule (`invisible`) : la hauteur du HUD ne change pas à la fin de l'aperçu, le plateau ne se redimensionne jamais en cours de partie. |
| **Zéro défilement** | Cartes carrées dimensionnées par la seule feuille de style : zone du plateau en conteneur de taille (`@container-size`), utilitaire `memory-grid` (`globals.css`) : côté d'une carte = minimum de la largeur et de la hauteur disponibles par colonne et par ligne (unités `cqw` / `cqh`), espacement `clamp(0.25rem, 2cqmin, 0.75rem)`, marge interne pour l'anneau de focus zoomé. Unités de conteneur : Chrome 105+, sous le plancher de Tailwind v4 (Chrome 111+). |
| **Rotation** | Une grille large (`cols > rows`, tout le catalogue initial) tourne quand la zone du plateau est en portrait, une grille haute quand elle est en paysage (`data-shape`, requêtes `@container (orientation)`) ; une grille carrée jamais. Lignes et colonnes s'échangent par `grid-auto-flow: column` : l'ordre des cartes du moteur (et du DOM) ne change pas. Smartphone de 360 px : 6 × 4 ≈ 72 px au lieu de 45, 5 × 3 ≈ 98 px au lieu de 56. Le D-Pad lit les colonnes affichées (`useGridColumns`, contrat FEAT-06) : `useGridNavigation` reçoit les dimensions affichées (et non `config.rows` / `config.cols` de §3.3), chaque carte son index affiché (`ref`, anneau, position vocalisée) ; les flèches suivent toujours l'écran. |
| **D-Pad** | Deux zones : en-tête (Retour, Recommencer) et grille. Haut depuis la première ligne → Retour au-dessus de la moitié gauche du plateau, Recommencer au-dessus de la moitié droite ; Bas depuis l'en-tête → dernière carte quittée. Zone de la grille active pendant `preview`, `playing` et `evaluating` (et non `phase === 'playing'` de §3.3) : Retour reste disponible (contrat FEAT-04), OK pendant l'aperçu le termine, le moteur ignore le reste. Focus DOM (Tab, clic) → zone de l'élément. Une nouvelle partie ramène le curseur sur la grille. |
| **Aperçu** | Bandeau « Mémorise les cartes ! » et compte à rebours (3, 2, 1, « 3 secondes » vocalisé) ; aide « Touche une carte pour commencer » au doigt, « Appuie sur OK pour commencer » à la télécommande. Un tap ou OK termine seulement l'aperçu : toutes les cartes se cachent ensemble, la carte touchée n'est pas retournée (aucun premier coup involontaire). Pendant l'aperçu, les cartes visibles sont nommées par leur symbole : l'équivalent accessible de l'aperçu. |
| **Évaluation** | Délai `isEvaluationMatch` (350 ms / 900 ms), puis `resolveEvaluation` calculé hors de `setGame` : une seule résolution, tirages de permutation compris. La victoire est enregistrée dans ce rappel, jamais par un effet (StrictMode rejoue les effets). Les taps pendant l'évaluation sont ignorés par le moteur. |
| **Animations** | Retournement 3D en CSS (`perspective-midrange`, `transform-3d`, `backface-hidden`, `rotate-y-180`, 300 ms sous `motion-safe:`). Permutation : les deux cartes glissent vers leur nouvelle place (framer-motion `layout="position"`, clé `card.uid`, mesures limitées aux permutations par `layoutDependency={lastSwappedPair}`, coupé par `MotionConfig reducedMotion="user"`). Nouvelle partie : grille remontée (`key`), aucune carte ne glisse d'une partie à l'autre. |
| **Permutation** | Indicateur de 1 000 ms déclenché par chaque nouvelle référence de `lastSwappedPair` : anneau violet intérieur pulsé (`ring-inset`, `motion-safe:animate-pulse`) dans un calque distinct (l'anneau de focus ambré reste visible), badge ⚡ de la règle illuminé, message vocalisé « Attention : deux cartes ont échangé leur place ! » (région `role="status"`). |
| **Cartes** | `<button type="button">` avec `data-state`, `data-focused`, `data-swapping`. Dos `bg-slate-800 border-slate-700` (motif `Sparkles`), face `bg-slate-900 border-sky-400`, carte trouvée `bg-emerald-950/40 border-emerald-500/50` (symbole à 75 %) avec coche. Anneau D-Pad ambré de §3.2 (+ `ring-offset`, identique sur `:focus-visible`) : la face visible a déjà une bordure bleue. Nom vocalisé (`getMemoryCardLabel`) : « Carte cachée, ligne 1, colonne 2 », « Soleil, ligne 1, colonne 2 », « Soleil, trouvée, ligne 1, colonne 2 » ; la position affichée est le repère indispensable au lecteur d'écran, la couleur n'est jamais nommée. |
| **Symboles** | `MemorySymbolIcon` : table exhaustive `Record<MemorySymbolId, …>`. 36 icônes Lucide (`bolt` → `Zap`, `diamond` → `Gem`, `tree` → `TreePine`, `flower` → `Flower`…) ; 8 formes pleines dessinées sur la grille 24 × 24 d'aires voisines (flèche, chevron, triangle, triangle rectangle, demi-disque, quart de disque en part de tarte pointe en haut pour ne jamais ressembler au triangle rectangle, L, T), pointe vers le haut à 0°. `colorClass` colore, `rotationDeg` tourne (propriété `rotate`, classes littérales). |
| **Compteurs** | « Paires : 3 / 8 » ou « Triplets : 1 / 5 » (plutôt que « Groupes »), « 3 sur 8 » vocalisé. Erreurs : « Erreurs : 3 » sans limite, « 3 / 10 », « 10 / 10 · Dernier essai ! » (vocalisé une fois), « Aucune erreur permise » (`maxMistakes: 0`), « plus de 10 » après la défaite (jamais « 11 / 10 »). |
| **Couronne** | Objectif affiché dans le HUD (couronne et « 4 erreurs max », « Sans erreur » ; barré une fois hors d'atteinte ; « Couronne déjà gagnée » sur un niveau couronné) et dans la modale : « Parfait ! Couronne gagnée », « Parfait ! » (déjà couronné), « Couronne : 4 erreurs max, tu en as fait 6. Rejoue pour la gagner ! », rien si elle était déjà gagnée. Couronne antérieure lue à la fin de la partie (le résumé est recalculé après l'enregistrement). |
| **Fin de niveau** | `MemoryEndModal` (fichier dédié), sans `onClose` : ni ✕, ni fond ; Retour / Échap → `onBack` de sa zone → Carte des Étoiles. Zone déclarée dans un composant rendu dans `ModalDialog`, actions empilées, curseur sur la première. Victoire : « Étoile #N gagnée ! », « 12 coups · 3 erreurs », « Étoile Suivante (#N+1) » (flèche Lucide, absente après la dernière étoile), « Rejouer », « Carte des Étoiles ». Défaite : « Trop d'erreurs : plus de 10 » (« plus d'une », « aucune n'était permise »), « Tu avais trouvé 5 paires sur 8. », « Réessayer », « Carte des Étoiles ». Résultat figé à la fin de la partie. |
| **Temps** | `performance.now()` de la première phase `playing` (après l'aperçu) jusqu'à la victoire, arrondi à la seconde, remis à zéro à chaque nouvelle partie. Non affiché (indicatif, [SPECIFICATION §3.2](./SPECIFICATION.md)). |
| **Confirmation** | Aucune : Retour et « Recommencer » agissent immédiatement (contrat FEAT-08), un niveau dure au plus quelques minutes. |
| **Voix** | Tutoiement de Mia (FEAT-08 : « gagne l'Étoile #5 pour avancer ») : « Mémorise les cartes ! » et « Trouve les paires (2) » / « Trouve les triplets (3) » au lieu de « Mémorisez… » et « Trouvez… » de §3. Libellés centralisés dans `components/labels.ts` (`Intl.PluralRules` : 0 et 1 au singulier). |
| **Périmètre** | Ajouts à l'arborescence §2 : `MemoryEndModal.tsx`, `labels.ts`, utilitaire `memory-grid` dans `src/app/globals.css`. Composants exportés par `components/index.ts` et par le barrel `@/games/memory` (modules du moteur toujours sans React ; composants à état marqués `'use client'`). `/memory` reste branché par FEAT-11 (catalogue vide jusque-là) : `page.tsx` inchangée. |
| **Tests** | `tests/memory-board.test.tsx` : partie complète au doigt et au D-Pad (`ArrowRight` + `Enter`) jusqu'à la modale, délais d'évaluation, couronne (gagnée, manquée, déjà gagnée), rejouer, dernière étoile, Retour (en-tête, modale, aperçu), en-tête au D-Pad, grille tournée (colonnes simulées), aperçu (compte à rebours, fin anticipée au tap et à OK, temps mesuré après l'aperçu), limite d'erreurs et défaite, permutation, HUD, symboles et libellés. `Math.random` simulé à 0 (cartes d'un groupe consécutives), minuteries simulées (`performance.now()` compris). |
| **Contrats aval** | Note ajoutée dans [FEAT-11 §3.2](./FEAT-11.md) (branchement de `MemoryBoard`). |
| **Git** | Branche `feat/memory-board` depuis `main`, commit `feat(memory): add memory board ui with 3d flip and dpad controls`. |
