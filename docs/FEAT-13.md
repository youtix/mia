# FEAT-13 : Jeu n°2 (Traffic Jam) — Interface Parking, Drag Tactile & Mode TV à 2 États

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-13`
> **Dépendances** : [FEAT-03](./FEAT-03.md), [FEAT-04](./FEAT-04.md), [FEAT-08](./FEAT-08.md), [FEAT-12](./FEAT-12.md)

---

## 1. Contexte & Objectif pour l'IA

Maintenant que le moteur physique et le solveur BFS de **Traffic Jam** sont prêts (`FEAT-12`), l'objectif de cette **FEAT-13** est de construire l'interface graphique interactive du parking dans `src/games/traffic-jam/components/` avec une double ergonomie exemplaire :
1. **Sur Mobile, Tablette et Souris (Mode Tactile / Drag)** :
   * Le joueur pose le doigt sur un véhicule et le fait glisser de manière fluide le long de son axe (`H` ou `V`), borné par les obstacles/véhicules voisins, avec un magnétisme (snap) sur les cases de la grille au relâchement.
2. **Sur Android TV (Mode Télécommande D-Pad à 2 États)** :
   * **État 1 (`'navigating'`)** : Les 4 flèches de la télécommande permettent de sauter d'un véhicule à l'autre sur le parking (via `findNearestTarget` de `FEAT-04`). Le véhicule ciblé est entouré d'un anneau lumineux.
   * **État 2 (`'moving'`)** : Appuyer sur `OK/Entrée` "démarre" le véhicule ciblé (ses phares s'allument, des flèches directionnelles clignotent devant et derrière lui). Les flèches de la télécommande dans l'axe du véhicule le déplacent case par case (avec `mergeWithPreviousIfSameVehicle: true`). Appuyer à nouveau sur `OK/Entrée` (ou `Retour`) coupe le moteur et revient à l'État 1 !

---

## 2. Fichiers à Créer / Modifier

```text
src/
└── games/
    └── traffic-jam/
        ├── components/
        │   ├── VehiclePiece.tsx       # Rendu d'une voiture/camion (phares, pare-brise, Drag, état TV verrouillé)
        │   ├── TrafficJamHud.tsx      # Barre supérieure (Étoile #N, Coups / Optimal, boutons Undo, Reset, Indice)
        │   ├── TrafficJamBoard.tsx    # Grille 6x6 avec sortie, obstacles, gestion Drag + Machine 2 états TV
        │   └── index.ts
        └── index.ts                   # Exporter les composants
tests/
└── traffic-jam-board.test.tsx         # Tests d'intégration UI (Mode TV 2 états, Indice, Victoire)
```

---

## 3. Spécifications Fonctionnelles & UX Détaillées

### 3.1. `TrafficJamHud` (`src/games/traffic-jam/components/TrafficJamHud.tsx`)
* Affiche :
  * Le titre de l'étoile (`⭐ Étoile #N`) et son `DifficultyPill`.
  * Le compteur de coups : `Coups : X` ainsi que l'objectif optimal : `Objectif Parfait : ≤ Y coups`.
  * 3 boutons d'action accessibles au tactile et au D-Pad :
    * **Annuler (`Undo`)** : annule le dernier mouvement.
    * **Indice (`💡`)** : appelle `getNextBestMove(state)` (`FEAT-12`) et met en surbrillance clignotante le véhicule à déplacer ainsi qu'une flèche indiquant sa case cible.
    * **Recommencer (`↻`)** : remet le plateau à zéro.

### 3.2. Rendu du Parking & Sortie (`TrafficJamBoard.tsx`)
* Plateau carré responsive (`aspect-square max-h-[72vh] w-full max-w-[520px]`) divisé en `gridSize x gridSize` cases (`6x6`).
* Bordure extérieure imitant un muret de parking, **interrompue sur le bord droit en face de la ligne `exitRow`** avec un marquage au sol vert `"SORTIE →"`.
* Les obstacles fixes (`ObstacleDef`) sont rendus sous forme de plots de chantier orange/blancs hachurés.

### 3.3. `VehiclePiece` (`src/games/traffic-jam/components/VehiclePiece.tsx`)
* Chaque véhicule occupe `length` cases (`2` pour une voiture, `3` pour un camion) sur son axe (`H` ou `V`).
* Utilise une balise `<button type="button">` accessible (`aria-label` explicite décrivant le véhicule, sa position et son axe pour respecter `jsx-a11y`).
* **Indication visuelle des 2 États TV** :
  * Si `isFocused && !isVehicleLocked` : Anneau de sélection ambre autour du véhicule + badge discret `"OK : Déplacer"`.
  * Si `isFocused && isVehicleLocked` : Anneau vert émeraude vif + **flèches directionnelles visibles aux extrémités libres du véhicule** (`◀` / `▶` pour `H`, `▲` / `▼` pour `V`) + phares allumés.

### 3.4. Machine à 2 États pour Télécommande Android TV (`TrafficJamBoard.tsx`)
* **En État 1 (`isVehicleLocked === false`)** :
  * Flèches `Haut/Bas/Gauche/Droite` : utilise `findNearestTarget` (`FEAT-04`) sur les centres géométriques des véhicules pour déplacer `focusedVehicleId` vers le véhicule voisin dans cette direction.
  * Touche `OK / Entrée` : passe `isVehicleLocked = true`.
* **En État 2 (`isVehicleLocked === true`)** :
  * Si `axis === 'H'`, `ArrowLeft` déplace de `-1` case et `ArrowRight` de `+1` case (avec `mergeWithPreviousIfSameVehicle: alreadyMovedInThisLockSession`).
  * Si `axis === 'V'`, `ArrowUp` déplace de `-1` case et `ArrowDown` de `+1` case.
  * Touche `OK / Entrée` ou `Retour / Échap` : repasse `isVehicleLocked = false`.
* **Contrat FEAT-04** ([§5](./FEAT-04.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * Le parking n'est pas une grille : utiliser `useNavigationScope({ scopeId: 'traffic-jam-board', onDirection, onSelect, onBack })` et afficher l'anneau avec `isFocusVisible` (zone active **et** mode D-Pad). Le moteur gère déjà le réveil après le tactile, les répétitions (flèches maintenues répétées, OK / Retour une seule fois) et `preventDefault()`.
  * `findNearestTarget` cherche dans le cône de ±45° puis dans le demi-plan : `null` signifie qu'aucun véhicule ne se trouve plus loin dans cette direction, signal pour passer à la zone des boutons du HUD (`isActive`).
  * Fournir `getFocusedElement` et `ownsElement` (refs des `VehiclePiece`) : sans eux, OK sur un véhicule ayant le focus DOM reste natif (bouton hors zone) et le premier appui après le tactile ne fait que révéler le curseur. `useNavigationScope` ne déplace pas le focus DOM : le plateau appelle `focus()` sur le véhicule ciblé au D-Pad s'il veut les annonces TalkBack.
* **Contrat FEAT-07** ([§5](./FEAT-07.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * À la victoire (`isWon`), la page enregistre `updateState((state) => recordLevelVictory(state, { gameId: 'traffic-jam', levelId, moves, timeSeconds, isPerfect }))` (`moves` : `state.moves` ; `isPerfect` : `isPerfectWin`). Mesurer `timeSeconds` avec `performance.now()` : `Date.now()` recule si l'horloge de la TV est réglée pendant la partie. Une valeur invalide ne devient jamais un meilleur score, mais l'étoile est toujours gagnée.
* **Contrat FEAT-08** ([§6](./FEAT-08.md#6-décisions-dimplémentation-session-de-cadrage)) :
  * Le plateau est rendu par `renderLevel(level, controls)` de `GameScreen` (branché par FEAT-14) et remonté à chaque changement de niveau. `controls.recordVictory({ moves, timeSeconds, isPerfect })` réalise l'enregistrement ci-dessus ; `controls.playLevel(id)` passe à l'étoile suivante en remplaçant l'entrée d'historique ; `controls.exitToMap()` revient à la Carte des Étoiles (historique dépilé ou remplacé).
  * Retour en État 2 (`isVehicleLocked`) coupe le moteur ; en État 1, le router vers `controls.exitToMap()` (ou une pause), comme le bouton Retour d'`AppShell` (`backButtonRef`, `onBackFocus` pour l'inclure dans une zone D-Pad).

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/traffic-jam-board.test.tsx` vérifie le pilotage au clavier/télécommande (Mode 1 Sélection $\rightarrow$ Mode 2 Déplacement $\rightarrow$ fusion des pas en 1 seul coup $\rightarrow$ Victoire) et le bouton Indice, en maintenant la couverture globale `>= 80%`.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(traffic-jam): add parking board ui with drag and 2-state tv remote mode`).

---

## 5. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **API du plateau** | `TrafficJamBoard({ level, controls })` : `EnrichedLevelItem<TrafficJamLevelConfig>` et `LevelControls<TrafficJamLevelConfig>` de `GameScreen` tels quels, comme `MemoryBoard` ; FEAT-14 rend `renderLevel={(level, controls) => <TrafficJamBoard level={level} controls={controls} />}` depuis un composant client `src/games/traffic-jam/TrafficJamGameScreen.tsx` qui importe le module `@/games/traffic-jam/components/TrafficJamBoard` (pas le barrel). État du jeu par `createTrafficJamGame(level.definition.config)` dans un `useState` ; plateau remonté à chaque changement de niveau (`key` de `GameScreen`). |
| **Écran** | `AppShell` : titre « Étoile #N » (`h1`, non répété dans le HUD), Retour → `controls.exitToMap`, aucun bouton à droite. `TrafficJamHud` : `DifficultyPill`, « Coups : X », « Objectif Parfait : ≤ Y coups » (couronne ; barré et vocalisé « hors d'atteinte » dès que `moves > optimalMoves` ; « Couronne déjà gagnée » si `level.isPerfect` ; masqué tant que `optimalMoves` vaut 0), puis Annuler, Indice, Recommencer (`FocusableButton`, libellés toujours visibles). Mise en page de Memory : HUD en bandeau au-dessus du plateau en portrait, en colonne à sa gauche en paysage (16 rem, 20 rem dès `md:`, boutons en ligne qui se replient). Pied de page TV : `DEFAULT_REMOTE_HINTS` dont l'action d'OK devient « Démarrer » (état 1) ou « Arrêter » (état 2) et « Naviguer » devient « Avancer / Reculer » en état 2 (clés `action` uniques). |
| **Zéro défilement** | Zone du plateau en conteneur de taille (`@container-size`, comme `memory-grid`) ; le parking est le plus grand carré qui tient dans l'espace restant (`w-[min(100cqw,100cqh)] aspect-square`), au plus 520 px. Aucun utilitaire ajouté dans `globals.css` : classes Tailwind (valeurs arbitraires) et styles calculés uniquement. |
| **Parking** | Enceinte arrondie `overflow-hidden` (fond asphalte, ombre interne) contenant la zone des cases, en retrait de 6 px (épaisseur du muret) : lignes de stationnement par dégradés répétés (`background-size` = une case), marquage « SORTIE → » (`aria-hidden`) dans la dernière case de `exitRow` ; muret dessiné par segments (`bg-slate-500`, éclairci en contraste élevé par les jetons de FEAT-18), bord droit interrompu face à `exitRow` avec un seuil vert dans l'ouverture ; plots `role="img"` « Plot fixe, ligne R, colonne C », hachurés orange / blanc (`TrafficCone`). Nom du groupe : « Parking de 6 × 6 cases, sortie à droite sur la ligne 3 ». Le muret est sous les véhicules : l'anneau de focus (4 px + décalage 2 px = l'épaisseur du muret) le chevauche sans être rogné. |
| **Véhicules** | `VehiclePiece` : `<button type="button">` positionné en absolu en pourcentages (`left`, `top`, `width`, `height` en `calc(% ± 3 px)` : la marge de 3 px loge l'anneau de focus entre deux voisins), `touch-none` en permanence (le navigateur décide du défilement au premier contact, trop tôt pour un changement de style au `pointerdown`), `data-vehicle-id`, `data-axis`, `data-focused`, `data-locked`, `data-hint`, `data-dragging`, `data-exiting`. Vu de dessus : pare-brise et phares à l'avant (à droite en `H`, en bas en `V`), étoile sur le hero ; couleur par `colorClass` (classes littérales de `types.ts`). Nom vocalisé (`getVehicleLabel`) : « Voiture A, verticale, 2 cases, lignes 2 à 3, colonne 4 » (+ « , en marche » en état 2), « Ta voiture, horizontale, … », « Camion B, horizontal, … » ; la couleur n'est jamais nommée. Transitions `left` / `top` / `transform` de 200 ms (`motion-safe:`), coupées pendant le glissement (`transition-none`). |
| **Glisser** | Pointer Events sur le bouton : `onPointerDown` + `setPointerCapture` (dans un `try` : jsdom ne l'implémente pas, un pointeur déjà relâché lève `InvalidStateError`), `onPointerMove`, `onPointerUp` et `onPointerCancel` traités à l'identique. Au contact : pointeur primaire et bouton principal seuls ; côté de case = largeur mesurée de la zone des cases ÷ `gridSize` (aucun glissement sans mise en page) ; bornes `getVehicleBounds` converties en pixels. Déplacement par `transform: translate` borné sans élasticité ; au relâchement, `delta = round(offset / case)` borné aux bornes **recalculées** (un coup joué au clavier pendant le glissement ne fait jamais lever `applyMove`), puis `applyMove` (un glissement = 1 coup, `delta` 0 = rien). Aimantation par la transition CSS : `left` / `top` et `transform` changent dans le même rendu avec la même transition, leur somme reste continue (aucun saut). Un tap sans déplacement ne fait rien ; le focus DOM reçu (clic, Tab) cible le véhicule et active la zone du plateau. |
| **Télécommande** | `useNavigationScope({ scopeId: 'traffic-jam-board', onDirection, onSelect, onBack, getFocusedElement, ownsElement })` et un état `RemoteState` (`focusedVehicleId` initialisé sur `'hero'`, `isLocked`, `historyLengthAtLock` : longueur de l'historique mémorisée au démarrage du véhicule). État 1 : flèche → `findNearestTarget` sur les centres géométriques (x = col + length / 2 ou + 0,5 ; y de même) ; cible → nouveau curseur et `focus({ preventScroll: true })` (effet sur `isFocusVisible` et le curseur) ; `null` : Haut → zone du HUD, autres directions → rien. OK → état 2 ; Retour → `exitToMap`. État 2 : flèche dans l'axe → `applyMove(…, ±1, { mergeWithPreviousIfSameVehicle: history.length > historyLengthAtLock })` si dans `getVehicleBounds` (sinon rien) : les pas d'une même session se cumulent en un seul coup ; un cumul nul retire ce coup (le moteur ramène l'historique à sa longueur du démarrage) et le pas suivant ouvre un nouveau coup, jamais fusionné avec celui d'une session précédente du même véhicule ; flèche hors axe ignorée ; OK ou Retour → état 1 (nouvelle session = nouveau coup). Dès le coup gagnant, le moteur est coupé (`isLocked: false`) : pendant la sortie du hero, flèches et OK sont ignorés et Retour mène déjà à la Carte des Étoiles, comme depuis la modale. Visuels conditionnés par `isFocusVisible` : anneau ambre + badge « OK : Déplacer » (état 1), anneau émeraude + phares allumés + flèches ◀ ▶ / ▲ ▼ aux seules extrémités libres (état 2). `getFocusedElement` / `ownsElement` lisent une `Map` de refs de rappel. |
| **Zones D-Pad** | HUD : `useGridNavigation` 1 × 4 (`traffic-jam-hud` : Retour d'`AppShell` via `backButtonRef`, puis Annuler, Indice, Recommencer ; curseur initial sur Annuler), `onEdge` Bas → plateau ; plateau → HUD par Haut sans véhicule devant (curseur du HUD conservé). Focus DOM (Tab, clic) sur un bouton → zone du HUD ; sur un véhicule → zone du plateau et curseur sur lui (moteur coupé si c'est un autre véhicule). « Annuler » inactif par `aria-disabled` plutôt que `disabled` : il reste focalisable, le curseur de la zone en ligne peut s'y poser et le lecteur d'écran l'annonce inactif ; OK n'y fait rien. |
| **Indice** | `getNextBestMove(state)` : véhicule en surbrillance clignotante (`data-hint`, calque `ring-sky-300 motion-safe:animate-pulse` distinct de l'anneau de focus) et silhouette pointillée à la case cible avec la flèche du sens (`data-hint-target`), message vocalisé (`role="status"`) « Indice : déplace la voiture A de 2 cases vers la droite » ; le curseur de la télécommande cible ce véhicule, moteur coupé. L'indice vaut pour l'état qui l'a produit (comparaison d'identité : tout coup, annulation ou recommencement l'efface) et disparaît après `HINT_DURATION_MS` (2,5 s). Insoluble ou budget dépassé (`null`) : « Aucun indice : cette position est bloquée. Annule des coups ou recommence. » ; après la victoire (pendant la sortie du hero) : « La partie est déjà gagnée ! ». Aucune pénalité. |
| **Annuler / Recommencer** | Annuler = `undoLastMove` (inactif sans historique ou après la victoire ; curseur et état TV inchangés). Recommencer = `resetLevel` + curseur sur le hero, moteur coupé, zone du plateau, chronomètre remis à zéro, indice et modale effacés (« Rejouer » de la modale fait de même). |
| **Victoire** | Dès `isWon`, dans le gestionnaire du coup gagnant (jamais dans un effet, StrictMode) : `controls.recordVictory({ moves, timeSeconds, isPerfect: isPerfectWin(state) })` une seule fois, `timeSeconds` mesuré par `performance.now()` depuis le montage (ou le dernier Recommencer), arrondi à la seconde ; le hero sort par l'ouverture (`left` au-delà du parking, transition de 500 ms `motion-safe:`, rogné par l'enceinte) ; la modale s'ouvre après `EXIT_ANIMATION_MS` (600 ms). `TrafficJamEndModal` (sans `onClose` : ni ✕ ni fond ; Retour / Échap → Carte des Étoiles) : « Étoile #N gagnée ! », « 12 coups · optimal 10 » (sans « optimal » si inconnu), « Parfait ! Couronne gagnée » (« Parfait ! » si déjà couronné), sinon « Couronne : ≤ 10 coups, tu en as fait 12. Rejoue pour la gagner ! » (rien si déjà couronné) ; boutons « Étoile Suivante (#N+1) » (absent après la dernière étoile), « Rejouer », « Carte des Étoiles » ; zone D-Pad déclarée dans la modale, curseur sur la première action. |
| **Voix** | Tutoiement de Mia ; libellés centralisés dans `components/labels.ts` (`Intl.PluralRules` : « 1 case », « 2 cases »). |
| **Périmètre** | Ajouts à l'arborescence §2 : `TrafficJamEndModal.tsx`, `labels.ts`. Composants exportés par `components/index.ts` et par le barrel `@/games/traffic-jam` (modules du moteur toujours sans React ; composants à état marqués `'use client'`). `globals.css` inchangé. `/traffic-jam` reste branché par FEAT-14 (catalogue vide jusque-là) : `page.tsx` inchangée. |
| **Tests** | `tests/traffic-jam-board.test.tsx` : rendu (sortie, plot, libellés, HUD, couronne déjà gagnée, optimal inconnu), télécommande (sélection par `findNearestTarget`, démarrage, 3 pas = 1 coup, nouvelle session = nouveau coup, flèche bloquée et hors axe, victoire en 3 coups puis modale sans couronne, victoire parfaite avec temps mesuré, couronne déjà gagnée, Retour en état 1 et 2, HUD ↔ plateau, Annuler et Recommencer au D-Pad, focus DOM, premier appui après le tactile, cumul nul puis nouveau coup sans fusion avec la session précédente et Annuler d'une seule case, moteur coupé dès le coup gagnant, curseur sur le hero après « Rejouer »), glisser (aimantation, bornes, demi-case, pointeur secondaire, bouton droit, parking non mesuré, `pointercancel`, victoire puis Rejouer / Carte, dernière étoile, boutons du HUD), indice (surbrillance, cible, effacement au coup suivant, par Annuler et Recommencer, et après le délai, position bloquée, partie gagnée), rendu sous `StrictMode` (victoire enregistrée et modale ouverte une seule fois), composants isolés et libellés. `setPointerCapture` et `getBoundingClientRect` simulés, minuteries simulées (`performance.now()` compris). |
| **Contrats aval** | FEAT-14 : `<TrafficJamBoard level={level} controls={controls} />` dans `renderLevel` d'un composant client `TrafficJamGameScreen.tsx` (module direct) ; `optimalMoves` de chaque niveau doit être exact (objectif affiché, couronne par `isPerfectWin`). |
| **Git** | Commit prévu à l'intégration : `feat(traffic-jam): add parking board ui with drag and 2-state tv remote mode` (§4). |
