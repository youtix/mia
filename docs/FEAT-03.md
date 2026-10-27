# FEAT-03 : Design System Adaptatif (Mobile, Tablette & "10-Foot UI" TV)

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-03`
> **Dépendances** : [FEAT-01](./FEAT-01.md), [FEAT-02](./FEAT-02.md)

---

## 1. Contexte & Objectif pour l'IA

L'application **Mia** doit être aussi agréable à utiliser à 30 cm des yeux sur un petit smartphone en orientation portrait qu'à 3 mètres de distance sur un téléviseur Android TV 16:9 ("10-Foot UI").

L'objectif de cette **FEAT-03** est de créer les composants d'interface réutilisables du Design System dans `src/components/ui/` en prenant en charge :
1. Les **zones de sécurité (Safe Area / Overscan TV)** pour qu'aucun bouton ne soit rogné sur un téléviseur.
2. Un **état de focus visuel haute visibilité** (anneau lumineux, zoom léger, fort contraste) indispensable pour savoir quel élément est sélectionné avec une télécommande TV.
3. Les composants de base : `AppShell`, `FocusableButton`, `FocusableCard`, `StarBadge`, `DifficultyPill`, et `ModalDialog`.

---

## 2. Fichiers à Créer / Modifier

```text
src/
├── lib/
│   └── cn.ts                          # Utilitaire clsx + tailwind-merge
├── components/
│   └── ui/
│       ├── AppShell.tsx               # Conteneur global avec Safe Area TV + Header
│       ├── FocusableButton.tsx        # Bouton supportant Touch + Focus D-Pad TV
│       ├── FocusableCard.tsx          # Carte cliquable/focalisable (Jeux, Profils, Étoiles)
│       ├── StarBadge.tsx              # Affichage du compteur d'étoiles et icône étoile/couronne
│       ├── DifficultyPill.tsx         # Badge coloré des 5 paliers cognitifs
│       ├── ModalDialog.tsx            # Modale centrée responsive (Fin de partie, Pause)
│       └── index.ts                   # Barrel export de tous les composants UI
└── app/
    └── globals.css                    # Variables CSS, safe-areas, animations de focus
tests/
└── ui-components.test.tsx             # Tests unitaires de rendu des composants UI
```

---

## 3. Spécifications Détaillées des Composants

### 3.1. Styles Globaux & Ergonomie TV (`src/app/globals.css`)
* Thème sombre reposant (fond `bg-slate-950` / `bg-slate-900`, texte `text-slate-50`) évitant l'éblouissement sur un écran TV de 55+ pouces.
* Désactivation de la sélection de texte parasite (`user-select: none`) et du délai de tap mobile (`touch-action: manipulation`).
* Classe utilitaire `.tv-safe-container` appliquant un padding adaptatif :
  * Mobile : `px-4 py-3`
  * Tablette (`md:`) : `px-8 py-6`
  * Grand écran / TV (`xl:`) : `px-[5vw] py-[4vh]` (zone de sécurité anti-overscan de 5%).
* **Conserver les acquis de FEAT-01** (voir [FEAT-01 §6](./FEAT-01.md#6-décisions-dimplémentation-session-de-cadrage)) : `@import 'tailwindcss' source('../');`, la police Atkinson Hyperlegible Next (`--font-sans` dans `@theme` + import `@fontsource-variable/atkinson-hyperlegible-next` dans `layout.tsx`) et le fond `bg-slate-900` du `<body>` (aligné sur `background_color` du manifeste).

### 3.2. `FocusableButton` (`src/components/ui/FocusableButton.tsx`)
Props :
```typescript
export interface FocusableButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'tv';
  /** Indique si le moteur de navigation D-Pad cible actuellement ce bouton */
  isFocused?: boolean;
  /** Raccourci de télécommande affiché en badge discret (ex: "OK", "Retour") */
  tvHint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}
```
* **Règle d'affichage du focus** : Si `isFocused === true` (ou `:focus-visible`), appliquer impérativement :
  * Un anneau de focus très visible : `ring-4 ring-sky-400 ring-offset-2 ring-offset-slate-950`
  * Une légère mise à l'échelle : `scale-[1.04]`
  * Une ombre lumineuse : `shadow-lg shadow-sky-500/30`
* Taille minimale de cible tactile : `min-h-[48px] min-w-[48px]` sur mobile, `min-h-[56px]` sur TV.

### 3.3. `FocusableCard` (`src/components/ui/FocusableCard.tsx`)
* Conteneur interactif utilisé pour les cartes de jeux, les tuiles de niveaux (Étoiles) et les cartes de profils.
* Supporte les props `isFocused?: boolean`, `isLocked?: boolean`, `isActive?: boolean`, `onSelect?: () => void`.
* Respecte les règles strictes `jsx-a11y` (`FEAT-02`) : utilise un `<button type="button">` ou possède `role="button"`, `tabIndex={0}` et gère `onKeyDown` (`Enter` / `Space`).

### 3.4. `StarBadge` (`src/components/ui/StarBadge.tsx`)
* Affiche le nombre d'étoiles acquises par rapport au total (`earned: number`, `total?: number`, `isPerfect?: boolean`, `size?: 'sm' | 'md' | 'lg'`).
* Si `isPerfect === true`, ajoute une icône de couronne ou un halo doré distinctif.

### 3.5. `DifficultyPill` (`src/components/ui/DifficultyPill.tsx`)
* Prend `tier: DifficultyTier` en prop et utilise `DIFFICULTY_TIERS[tier]` défini en `FEAT-01` pour afficher le nom du palier (*Très Facile*, *Facile*, *Moyen*, *Difficile*, *Très Difficile*) ainsi qu'un indicateur visuel de barres de niveau (1 à 5 barres) pour ne pas dépendre uniquement de la couleur (accessibilité daltonisme).

### 3.6. `AppShell` (`src/components/ui/AppShell.tsx`)
* Structure toutes les pages de l'application avec :
  * Un `header` compact contenant : le bouton Retour (si `onBack` est fourni), le titre de l'écran, le badge du profil actif (si fourni) et le compteur d'étoiles global.
  * Une zone principale `main` occupant la hauteur restante (`flex-1 flex flex-col overflow-y-auto`).
  * Une barre de pied de page optionnelle (`footerHints`) affichant sur TV les aides contextuelles de la télécommande (ex: `✛ Naviguer • OK Sélectionner • ↩ Retour`).

### 3.7. `ModalDialog` (`src/components/ui/ModalDialog.tsx`)
* Affiche une boîte de dialogue animée (Framer Motion) par-dessus l'écran avec fond flouté (`backdrop-blur-md bg-slate-950/80`), `role="dialog"`, `aria-modal="true"` et `aria-labelledby`.
* Props : `isOpen: boolean`, `title: string`, `subtitle?: string`, `onClose?: () => void`, `children: React.ReactNode`.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] Tous les composants sont exportés proprement depuis `src/components/ui/index.ts`.
- [ ] Les tests unitaires dans `tests/ui-components.test.tsx` vérifient tous les composants et maintiennent la couverture globale `>= 80%`.
- [ ] `npm run validate:all` (`format:check`, `lint` avec 0 warning `jsx-a11y`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(ui): add adaptive design system for mobile and tv`).
