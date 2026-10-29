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
└── games/
    └── memory/
        ├── components/
        │   ├── MemorySymbolIcon.tsx   # Rendu vectoriel du symbole de la carte (avec couleur et rotation)
        │   ├── MemoryCardView.tsx     # Carte individuelle (face cachée / face visible, focus TV, état trouvé)
        │   ├── MemoryHud.tsx          # Barre d'état supérieure (Étoile #N, Paires/Triplets, Erreurs, Aperçu)
        │   ├── MemoryBoard.tsx        # Plateau complet avec gestion des timers (preview, evaluating) et D-Pad
        │   └── index.ts
        └── index.ts                   # Exporter les composants
tests/
└── memory-board.test.tsx              # Tests d'intégration UI (clic, clavier D-Pad, victoire)
```

---

## 3. Spécifications Fonctionnelles & UX Détaillées

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
