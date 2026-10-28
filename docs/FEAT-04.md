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
└── core/
    └── navigation/
        ├── types.ts                   # Types Direction, Coordinates, NavigationScope
        ├── grid-math.ts               # Fonctions pures de calcul de déplacement dans une grille/liste
        ├── NavigationContext.tsx      # Provider global (inputMode, pile de scopes, écouteurs clavier)
        ├── useGridNavigation.ts       # Hook React clé-en-main pour naviguer dans une grille N x M
        └── index.ts                   # Barrel export
tests/
└── navigation.test.ts                 # Tests unitaires exhaustifs de la logique de déplacement 2D
```

---

## 3. Spécifications Techniques Détaillées

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

- [ ] `tests/navigation.test.ts` teste unitairement `moveInGrid`, `findNearestTarget`, `mapKeyToDirection`, `isSelectKey`, `isBackKey` et le hook `useGridNavigation` avec une couverture `>= 80%`.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(navigation): add spatial dpad navigation engine`).
