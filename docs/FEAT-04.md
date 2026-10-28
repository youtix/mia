# FEAT-04 : Moteur de Navigation Spatiale D-Pad (Télécommande TV) & Clavier

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-04`
> **Dépendances** : [FEAT-01](./FEAT-01.md), [FEAT-02](./FEAT-02.md)

---

## 1. Contexte & Objectif pour l'IA

Sur **Android TV**, l'utilisateur n'a ni souris ni écran tactile : il utilise exclusivement une **télécommande (D-Pad)** qui émet des événements clavier (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Enter`, `Escape` / `Backspace`). Sur **Smartphone et Tablette**, l'utilisateur touche directement l'écran (`Touch`).

L'objectif de cette **FEAT-04** est de créer dans `src/core/navigation/` un moteur de navigation spatiale léger, déterministe et testé unitairement, permettant :
1. De détecter automatiquement si l'utilisateur utilise le tactile (`'touch'`) ou la télécommande/clavier (`'dpad'`).
2. De naviguer facilement dans n'importe quelle **grille 2D ou liste 1D** avec les 4 flèches directionnelles.
3. D'intercepter proprement le bouton `OK` (`Enter`) et le bouton `Retour` (`Escape` / `Backspace` / bouton physique Android).
4. De gérer une pile de couches de focus (pour que lorsqu'une modale s'ouvre, la télécommande pilote uniquement la modale et plus le plateau de jeu en arrière-plan).

---

## 2. Fichiers à Créer

```text
src/
├── core/
│   └── navigation/
│       ├── types.ts                   # Types Direction, Coordinates, NavigationScope
│       ├── grid-math.ts               # Fonctions pures de calcul de déplacement dans une grille/liste
│       ├── NavigationContext.tsx      # Provider global (inputMode, pile de scopes, écouteurs clavier)
│       ├── useGridNavigation.ts       # Hook React clé-en-main pour naviguer dans une grille N x M
│       └── index.ts                   # Barrel export
└── components/
    └── ui/
        └── ModalDialog.tsx            # Contenu enveloppé dans une NavigationLayer (voir §5)
tests/
└── navigation.test.tsx                # Tests unitaires exhaustifs de la logique de déplacement 2D
vitest.setup.ts                        # scrollIntoView vide (absent de jsdom)
```

---

## 3. Spécifications Techniques Détaillées

> Les décisions de la session de cadrage ([§5](#5-décisions-dimplémentation-session-de-cadrage)) précisent ces spécifications : couches de modales, enchaînement des zones (`onEdge`), synchronisation du focus DOM (`getItemRef`), réveil après le tactile, champs de saisie, `dispatchBack` pour le bouton Retour Android.

### 3.1. Normalisation des Touches Télécommande Android TV & Clavier (`src/core/navigation/types.ts`)
```typescript
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface GridCoord {
  row: number;
  col: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export function mapKeyToDirection(key: string): Direction | null {
  switch (key) {
    case 'ArrowUp':
    case 'Up':
      return 'up';
    case 'ArrowDown':
    case 'Down':
      return 'down';
    case 'ArrowLeft':
    case 'Left':
      return 'left';
    case 'ArrowRight':
    case 'Right':
      return 'right';
    default:
      return null;
  }
}

export function isSelectKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'NumpadEnter' || key === 'Select';
}

export function isBackKey(key: string): boolean {
  return key === 'Escape' || key === 'Backspace' || key === 'GoBack' || key === 'BrowserBack';
}
```

### 3.2. Logique Pure de Déplacement sur Grille (`src/core/navigation/grid-math.ts`)
Implémente et exporte les fonctions pures suivantes :
1. `moveInGrid(current: GridCoord, direction: Direction, options: { rows: number; cols: number; totalItems?: number; wrap?: boolean }): GridCoord`
   * Déplace `(row, col)` d'une case dans la direction demandée.
   * Si `totalItems` est inférieur à `rows * cols` (ex: dernière ligne incomplète avec 14 éléments dans une grille de 4 colonnes), descendre sur une colonne vide de la dernière ligne rabat automatiquement le curseur sur le dernier élément existant (`totalItems - 1`).
   * Si `wrap === false` (défaut), le curseur s'arrête aux bords de la grille sans déborder.
2. `indexToCoord(index: number, cols: number): GridCoord` et `coordToIndex(coord: GridCoord, cols: number): number`.
3. `findNearestTarget(from: Point2D, candidates: Array<{ id: string; x: number; y: number }>, direction: Direction): string | null`
   * Fonction géométrique très utile pour **Traffic Jam** (`FEAT-13`) où les véhicules ont des tailles et positions variées sur la grille `6x6` : trouve l'identifiant de l'élément candidat situé dans le cône directionnel demandé (`up`, `down`, `left`, `right`) dont la distance euclidienne pondérée est minimale.

### 3.3. Contexte Global (`src/core/navigation/NavigationContext.tsx`)
* Gère l'état `inputMode: 'touch' | 'dpad'` :
  * Passe automatiquement à `'dpad'` dès réception d'une touche directionnelle ou de validation.
  * Passe automatiquement à `'touch'` lors d'un événement `pointerdown` de type `touch` ou `mouse`.
* Gère l'enregistrement de la couche active (`activeScopeId`) pour qu'une modale ouverte suspende les raccourcis clavier de l'écran sous-jacent.

### 3.4. Hook `useGridNavigation` (`src/core/navigation/useGridNavigation.ts`)
```typescript
export interface UseGridNavigationOptions {
  /** Identifiant unique de la zone (ex: "memory-board", "modal-victory") */
  scopeId: string;
  rows: number;
  cols: number;
  totalItems?: number;
  initialIndex?: number;
  isActive?: boolean;
  onSelect?: (index: number, coord: GridCoord) => void;
  onBack?: () => void;
}
```
Retourne :
* `focusedIndex: number`
* `focusedCoord: GridCoord`
* `setFocusedIndex: (index: number) => void`
* `inputMode: InputMode`
* `isItemFocused: (index: number) => boolean` (retourne `true` si la zone est active et `focusedIndex === index`)

### 3.5. Contrat avec le Design System ([FEAT-03 §5](./FEAT-03.md#5-décisions-dimplémentation-session-de-cadrage))
* **Focus visuel** : `isFocused` (`FocusableButton`, `FocusableCard`, `AppShell.isBackFocused`) ne fait qu'afficher l'anneau ; les composants ne déplacent jamais le focus DOM. Pour le synchroniser (annonces TalkBack, défilement), utiliser leur prop `ref`.
* **`preventDefault()` sur chaque touche traitée** : flèches (sinon le `<main>` défilant d'`AppShell` défile aussi) et `OK` / `Entrée` / `Espace` (si le focus DOM est sur un bouton, après un clic par exemple, le navigateur déclencherait aussi un clic natif : double activation).
* **Écoute en bouillonnement** sur `window` (pas `capture: true`) : `ModalDialog` stoppe la propagation de `Échap` quand elle se ferme elle-même (`onClose`) ; sans `onClose`, `Échap` remonte et le scope de la modale décide (ex. fin de partie → Carte des Étoiles).
* **Mode TV** : ne pas basculer `data-tv` selon `inputMode` ; le mode TV modifie la mise en page (marges anti-overscan, cibles de 56 px) et l'écran sauterait à chaque changement de saisie. Le réglage relève de FEAT-05.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/navigation.test.tsx` teste unitairement `moveInGrid`, `findNearestTarget`, `mapKeyToDirection`, `isSelectKey`, `isBackKey` et le hook `useGridNavigation` avec une couverture `>= 80%`.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(navigation): add spatial dpad navigation engine`).

---

## 5. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Couches (modales)** | `NavigationLayer` (contexte React + barrière) : tant qu'elle est montée, les zones des couches inférieures sont suspendues, **même si elle ne déclare aucune zone** (OK reste alors natif sur les boutons de la modale). `ModalDialog` enveloppe son contenu dans une `NavigationLayer` (sans `NavigationProvider`, elle ne fait rien : tests FEAT-03 inchangés). La profondeur vient du contexte, pas de l'ordre de montage : une modale déjà ouverte au montage reste au-dessus de l'écran. Les couches imbriquées s'empilent (`ProfileSelectorModal` → formulaire). **Une zone pilotant une modale doit être déclarée dans un composant rendu à l'intérieur de la modale** (sinon elle reste dessous, suspendue). |
| **Zone active** | Dans la couche du dessus, la zone (`useNavigationScope` / `useGridNavigation` avec `isActive`) activée en dernier reçoit les touches ; seule elle les reçoit (aucune remontée vers les autres zones). `activeScopeId` (`useNavigation`) expose son `scopeId`. |
| **Plusieurs zones par écran** | `onEdge(direction, coord)` : flèche bloquée au bord (sans `wrap`). L'écran enchaîne ses zones (en-tête, paliers, HUD) en basculant `isActive` et en positionnant la zone cible par `setFocusedIndex` (ex: conserver la colonne d'un palier à l'autre). Pas de navigation géométrique sur le DOM. |
| **Focus DOM** | `getItemRef(index)` (refs de rappel). Au D-Pad, chaque déplacement, activation de zone ou réveil appelle `focus({ preventScroll: true })` puis `scrollIntoView({ block: 'nearest', inline: 'nearest' })` (annonces TalkBack, défilement du `<main>` d'`AppShell`). Une flèche bloquée au bord ramène aussi le focus DOM dans la zone. Sens inverse : un élément de la zone qui reçoit le focus DOM (Tab, clic) devient le curseur. En mode tactile, aucun focus ni défilement automatique (le défilement initial de FEAT-08 sur mobile reste à sa charge). |
| **OK** | Sans `onSelect`, OK appelle `element.click()` sur l'élément ciblé : même gestionnaire qu'au doigt, `isLocked` / `disabled` respectés. Avec `onSelect`, il est appelé **à la place** du clic. `preventDefault()` empêche le clic natif (et le relâchement d'Espace, que Firefox active). **Si le focus DOM est sur un élément interactif hors de la zone** (bouton atteint avec Tab, cliqué à la souris), OK et Espace restent natifs ; les flèches et Retour vont au moteur. |
| **Anneau de focus** | `isItemFocused` (et `isFocusVisible` de `useNavigationScope`) vaut `true` uniquement en mode `dpad`, zone active et curseur sur l'élément. |
| **Réveil** | En mode tactile, le premier appui de flèche ou d'OK passe en `dpad` et révèle seulement le curseur (focus + défilement), sans déplacer ni activer. **Exception** : si l'élément du curseur a déjà le focus DOM (Tab, clic), l'appui agit immédiatement. |
| **Mode initial** | Même détection que la variante CSS `tv:` : `dpad` si `<html data-tv="on">`, ou si `(hover: none) and (pointer: none)` correspond et que `data-tv` ne vaut pas `"off"` ; sinon `touch`. Lecture seule de `data-tv` (§3.5). Le pré-rendu statique rend `touch` sans zone active (`useSyncExternalStore`) ; la détection suit l'hydratation. |
| **Bascule de mode** | `dpad` sur toute flèche ou OK (sauf touche laissée à un champ de saisie) ; `touch` sur `pointerdown` de type `touch`, `mouse` (y compris télécommandes « air mouse ») ou `pen`, écouté en capture. Retour, Tab et les autres touches ne changent pas le mode. |
| **Champs de saisie** | Champs d'une ligne (`text`, `search`, `email`, `password`, `tel`, `url`) : Gauche / Droite / Retour arrière / Espace / Entrée restent au champ, Haut / Bas naviguent (sortie du champ après fermeture du clavier virtuel TV), Échap = Retour. `textarea`, `select`, champs nombre / date et `contenteditable` : seule Échap est traitée. |
| **Touches filtrées** | Ignorées : Ctrl / Alt / Meta (raccourcis du navigateur), composition IME (`isComposing`), événements déjà traités (`defaultPrevented`). Flèches maintenues : répétées. OK et Retour maintenus : une seule action, répétitions absorbées (`preventDefault()` sans action) quand le moteur possède la touche. |
| **Retour** | Couche du dessus : `onBack` de sa zone active, sinon `onBack` de la couche (`onClose` de la modale), sinon rien (touche laissée au navigateur). `dispatchBack(): boolean` (`useNavigation`) applique le même routage hors clavier et renvoie `false` si rien ne l'a géré : FEAT-15 y branche `App.addListener('backButton')` et quitte l'application sur `false`. `Échap` reste gérée par `ModalDialog` quand elle a `onClose` (jamais de double fermeture). |
| **`findNearestTarget`** | Distance euclidienne, décalage perpendiculaire pondéré ×2 ; cône de ±45° d'abord, puis tout le demi-plan situé devant ; `null` = aucune cible plus loin dans cette direction (signal pour quitter le plateau vers le HUD). Repère écran (`y` vers le bas) ; égalités départagées par l'ordre du tableau. |
| **`moveInGrid`** | `wrap` torique : une ligne boucle sur ses éléments existants, une colonne sur sa dernière case existante. La règle de la case vide (rabat sur `totalItems - 1`) l'emporte sur la boucle. Grille vide : position inchangée ; position hors grille ramenée dans la grille. Utilitaire exporté `getGridItemCount`. |
| **API** | `useGridNavigation` : options de §3.4 + `wrap` + `onEdge` ; retourne en plus `getItemRef` et `isActive`. `initialIndex` lu au montage seulement ; curseur borné à la lecture si la grille rétrécit. `useNavigationScope` (zone libre, ex: Traffic Jam) : `onDirection`, `onSelect`, `onBack`, `getFocusedElement`, `ownsElement` ; retourne `isActive`, `isFocusVisible`, `inputMode`. `useNavigation` : `inputMode`, `activeScopeId`, `dispatchBack`. Sans `NavigationProvider`, ces hooks lèvent une erreur. `InputMode` vient de `@/types/mia`. Modules React marqués `'use client'` : le barrel reste importable depuis `layout.tsx` (composant serveur), vérifié par `next build`. |
| **Périmètre** | `src/app/layout.tsx` **inchangé** : FEAT-08 y monte `NavigationProvider`. `src/core/navigation/.gitkeep` supprimé. |
| **Tests** | `tests/navigation.test.tsx` (JSX, comme `tests/ui-components.test.tsx`) au lieu de `navigation.test.ts`. `vitest.setup.ts` définit un `scrollIntoView` vide (absent de jsdom, gardé pour l'environnement `node` des tests de configuration). Les tests de fermeture de modale attendent le nettoyage des effets (retrait de la couche, focus rendu) dans `waitFor`, exécuté après le retrait du DOM. |
| **Contrats aval** | Notes ajoutées dans [FEAT-06 §3.3](./FEAT-06.md), [FEAT-08 §4.2](./FEAT-08.md), [FEAT-10 §3.3](./FEAT-10.md), [FEAT-13 §3.4](./FEAT-13.md) et [FEAT-15 §3.3](./FEAT-15.md). |
| **Git** | Branche `feat/navigation` depuis `main`, commit `feat(navigation): add spatial dpad navigation engine`. |
