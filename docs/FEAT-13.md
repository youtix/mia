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

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/traffic-jam-board.test.tsx` vérifie le pilotage au clavier/télécommande (Mode 1 Sélection $\rightarrow$ Mode 2 Déplacement $\rightarrow$ fusion des pas en 1 seul coup $\rightarrow$ Victoire) et le bouton Indice, en maintenant la couverture globale `>= 80%`.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(traffic-jam): add parking board ui with drag and 2-state tv remote mode`).
