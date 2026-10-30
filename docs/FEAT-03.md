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
│       ├── focus-styles.ts            # Classes de focus partagées (Button, Card), hors barrel
│       └── index.ts                   # Barrel export de tous les composants UI
└── app/
    └── globals.css                    # Variables CSS, safe-areas, animations de focus
tests/
└── ui-components.test.tsx             # Tests unitaires de rendu des composants UI
```

---

## 3. Spécifications Détaillées des Composants

> Les décisions de la session de cadrage ([§5](#5-décisions-dimplémentation-session-de-cadrage)) précisent ces spécifications : variante `tv:` (le seul `xl:` ne cible pas Android TV), encoches, typographie fluide, contrat de focus avec FEAT-04.

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

---

## 5. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Mode TV (`tv:`)** | Variante Tailwind à **3 états** (`@custom-variant` dans `globals.css`), alignée sur `tvModeOverride` (FEAT-05) : `<html data-tv="on">` → toujours (`always_tv`), `data-tv="off"` → jamais (`always_touch`), sans attribut → auto via `@media (hover: none) and (pointer: none)` (appareil piloté uniquement au D-Pad), sans JavaScript dès le premier rendu. Le seul `xl:` ne suffit pas : les WebView Android TV exposent un viewport d'environ **960 × 540 px CSS** (`xl:` ≥ 1280 px ne s'y applique jamais, mais s'applique aux ordinateurs). `tv:` pilote la zone anti-overscan, `tvHint`, `footerHints` et les cibles de 56 px ; `xl:` garde les marges larges des grands écrans. Tailwind émet les variantes personnalisées après `md:` / `xl:` : `tv:` l'emporte. Pose de l'attribut : FEAT-05 (réglage), FEAT-15 (détection native de secours). |
| **Zone de sécurité** | `@utility tv-safe-container` : `padding: max(var(--safe-area-*), env(safe-area-inset-*))`. Variables `--safe-area-x` / `--safe-area-y` : mobile `px-4 py-3`, `md:` `px-8 py-6`, `xl:` `5vw` / `4vh` (spec), `tv:` `5vw` / `5vh` (recommandation Android TV : 48 × 27 dp sur 960 × 540 dp). `viewport-fit=cover` **non activé** : les encarts `env()` valent 0 tant que FEAT-15/17 ne passent pas en plein écran (edge-to-edge). |
| **Typographie fluide** | Jetons `text-fluid-xs` … `text-fluid-3xl` dans `@theme` (`clamp()` linéaire de 360 px à 1280 px de viewport, `rem + vw`), utilisés par les composants ; les tailles Tailwind par défaut restent inchangées. Déclarés dans `cn()` (`extendTailwindMerge`, `FLUID_TEXT_SIZES`) : sinon tailwind-merge les prend pour des couleurs (`cn('text-slate-50', 'text-fluid-lg')` perdrait la couleur). |
| **Styles globaux** | `body` : `select-none` et `-webkit-tap-highlight-color: transparent`. `touch-action: manipulation` sur **chaque** élément (propriété non héritée, arrêtée par les conteneurs défilants ; le pincement reste possible). `input`, `textarea` et `contenteditable` restent sélectionnables (Safari iOS bloque la saisie sous `user-select: none`). Acquis FEAT-01 conservés. |
| **Focus D-Pad** | `isFocused` est **purement visuel** : classes de §3.2 + `z-10` (passe devant les voisins) + attribut `data-focused`, identiques sur `:focus-visible` (`outline-hidden` : contour conservé en mode contraste forcé). Aucun appel à `focus()` / `scrollIntoView()` : `FocusableButton` et `FocusableCard` acceptent `ref` (prop React 19) pour que FEAT-04 synchronise le focus DOM s'il le souhaite. Transitions sous `motion-safe:` ; aucune animation en boucle (réservée à l'état « à conquérir » de FEAT-08). |
| **`FocusableButton`** | Interface de §3.2 + `ref`, `type="button"` par défaut. Variantes pleines en fond clair et texte `slate-950` (contraste WCAG AA), `secondary` / `ghost` sombres. Cible `min-h-12 min-w-12` (48 px), `tv:min-h-14` (56 px) ; la taille `tv` (64 px) reste la plus grande en mode TV. `tvHint` : `<kbd aria-hidden>` visible en mode TV uniquement. |
| **`FocusableCard`** | `<button type="button">` natif (`Entrée` / `Espace` gérés par le navigateur ; contenu « phrasé » uniquement, sans élément interactif imbriqué) ; `onClick` remplacé par `onSelect`. `isLocked` → `aria-disabled="true"`, opacité réduite, badge cadenas (« , verrouillé » pour les lecteurs d'écran) ; reste focalisable (Tab / D-Pad) mais `onSelect` n'est jamais appelé. `isActive` → `aria-current="true"`, bordure émeraude et pastille ✓ (indice non coloré). |
| **`StarBadge`** | `role="img"` + libellé français (`describeStars` : « 1 étoile sur 20 », « 12 étoiles, parfait » ; 0 et 1 au singulier via `Intl.PluralRules`). Couronne Lucide + halo doré si `isPerfect`. |
| **`DifficultyPill`** | Barres croissantes (`aria-hidden`) + libellé du palier ; rang annoncé aux lecteurs d'écran (« Moyen, palier 3 sur 5 »). Props optionnelles `showSubtitle` et `size`. |
| **`AppShell`** | Props : `title`, `onBack`, `isBackFocused`, `profile` (emplacement libre : bouton avatar de FEAT-06/08), `stars` (`earned` / `total` / `isPerfect`), `footerHints` (`RemoteHint[]` = `{ button, action }`), `className`. Racine `tv-safe-container h-dvh` ; **rend le `<main>`** (une page qui utilise `AppShell` n'en déclare pas d'autre), avec une marge interne compensée pour que l'anneau de focus zoomé ne soit pas rogné par le défilement. Bouton Retour : icône + « Retour » (texte visuellement masqué sous `sm:`). Pied de page en mode TV uniquement ; `DEFAULT_REMOTE_HINTS` en icônes Lucide (Atkinson Hyperlegible Next n'a ni `✛` ni `↩`). |
| **`ModalDialog`** | Portail sur `document.body`, rendu côté client uniquement (`useSyncExternalStore` : rien au pré-rendu statique) ; `AnimatePresence` + `MotionConfig reducedMotion="user"`. À l'ouverture, focus sur la boîte de dialogue (`tabIndex={-1}`, pas un bouton : `Entrée` ne déclenche aucun clic natif concurrent du D-Pad) ou sur `initialFocusRef` (`autoFocus` interdit par `jsx-a11y/no-autofocus`) ; Tab / Maj+Tab bouclent ; un clic sur le fond ne fait pas sortir le focus ; focus rendu au déclencheur après l'animation de sortie, sauf avec `restoreFocus={false}` (l'écran place lui-même son curseur, ex. « Rejouer » de Suites Logiques). `Échap` → `onClose` + `preventDefault()` + `stopPropagation()`. **Sans `onClose`** : ni bouton ✕, ni fermeture par le fond, et `Échap` remonte au moteur D-Pad (le scope de la modale décide, ex. fin de partie). Écouteur clavier natif (`jsx-a11y/no-noninteractive-element-interactions` interdit `onKeyDown` sur `role="dialog"`). Prop `className` pour le panneau. |
| **Périmètre** | `src/app/page.tsx` **inchangée** : FEAT-08 est le premier consommateur. `focus-styles.ts` ajouté à l'arborescence §2 ; `src/components/ui/.gitkeep` supprimé. |
| **Tests** | `tests/ui-components.test.tsx` avec `fireEvent` (aucune nouvelle dépendance) et `MotionGlobalConfig.skipAnimations` pour les sorties `AnimatePresence`. Classes Tailwind vérifiées par nom (jsdom ne calcule pas la feuille de style) ; pré-rendu de `ModalDialog` vérifié (`renderToString` → chaîne vide). |
| **Contrats aval** | Notes ajoutées dans [FEAT-04 §3.5](./FEAT-04.md) (focus visuel, `preventDefault()`, écoute en bouillonnement), [FEAT-05 §3.4](./FEAT-05.md) (`tvModeOverride` → `data-tv`) et [FEAT-15 §3.5](./FEAT-15.md) (détection TV de secours, plein écran). |
| **Git** | Branche `feat/design-system` depuis `main`, commit `feat(ui): add adaptive design system for mobile and tv`. |
