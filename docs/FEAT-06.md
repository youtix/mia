# FEAT-06 : Gestion Multi-Profils Familiaux Locaux

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-06`
> **Dépendances** : [FEAT-03](./FEAT-03.md), [FEAT-04](./FEAT-04.md), [FEAT-05](./FEAT-05.md)

---

## 1. Contexte & Objectif pour l'IA

Sur une **Android TV de salon** ou une **tablette familiale**, plusieurs personnes (enfants, parents, grands-parents) utilisent le même appareil. Chacun doit pouvoir suivre sa propre progression d'étoiles sans écraser celle des autres, et sans jamais avoir à créer un compte en ligne.

L'objectif de cette **FEAT-06** est d'implémenter :
1. Les fonctions pures de gestion des profils (`ensureDefaultProfile`, `addProfile`, `setActiveProfile`, `deleteProfile`) dans `src/core/storage/profile-manager.ts`.
2. La galerie d'avatars vectoriels (`AVATARS`).
3. Le composant/modale de sélection et de création rapide de profil (`ProfileSelectorModal`), optimisé pour être utilisable **en quelques clics à la télécommande TV** (avec des suggestions de noms en 1 clic pour éviter de taper sur le clavier virtuel TV si on ne le souhaite pas).

---

## 2. Fichiers à Créer / Modifier

```text
src/
├── core/
│   ├── navigation/
│   │   ├── useGridColumns.ts          # Colonnes affichées d'une grille CSS responsive (voir §5)
│   │   └── index.ts                   # Exporter useGridColumns
│   └── storage/
│       ├── avatars.ts                 # Liste des 8 avatars (couleur, label ; icônes : voir §5)
│       ├── profile-manager.ts         # Fonctions pures CRUD sur les profils dans MiaSaveState
│       ├── useProfileGate.ts          # « Joueur 1 » au démarrage + choix du joueur imposé (voir §5)
│       └── index.ts                   # Exporter avatars, profile-manager et useProfileGate
└── components/
    └── profile/
        ├── avatar-icons.tsx           # Icône de chaque avatar (renard et chouette dessinés)
        ├── AvatarBadge.tsx            # Rendu graphique d'un avatar (cercle coloré + icône)
        ├── ProfileSelectorModal.tsx   # Écran/Modale "Qui joue aujourd'hui ?" + Création rapide
        ├── NewProfileModal.tsx        # Formulaire de création rapide (modale imbriquée)
        ├── DeleteProfileModal.tsx     # Confirmation de suppression (modale imbriquée)
        └── index.ts
tests/
├── profile-manager.test.ts            # Tests unitaires CRUD multi-profils
├── profile-selector.test.tsx          # AvatarBadge, useProfileGate, modale au doigt et au D-Pad
└── navigation.test.tsx                # + useGridColumns
```

---

## 3. Spécifications Détaillées

> Les décisions de la session de cadrage ([§5](#5-décisions-dimplémentation-session-de-cadrage)) précisent ces spécifications : suppression seule (mode « Gérer les profils »), formulaire et confirmation en modales imbriquées, prénom rapide qui remplit le champ, règles des prénoms et plafond de 8 profils, icônes du renard et de la chouette, colonnes D-Pad mesurées (`useGridColumns`), démarrage par `useProfileGate`, étoiles sans catalogue, identifiants UUID v4.

### 3.1. Catalogue d'Avatars (`src/core/storage/avatars.ts`)
Définis 8 avatars joyeux et distincts avec des couleurs très contrastées :
* `fox` (Renard rusé — Orange)
* `owl` (Chouette sage — Violet)
* `robot` (Robot logique — Cyan)
* `rocket` (Fusée spatiale — Bleu)
* `cat` (Chat agile — Émeraude)
* `crown` (Couronne royale — Or)
* `star` (Étoile filante — Rose)
* `brain` (Super Cerveau — Indigo)

Définis également une liste de **prénoms/rôles rapides en 1 clic** adaptés à la TV :
`QUICK_PROFILE_NAMES = ['Mia', 'Joueur 1', 'Joueur 2', 'Parents', 'Enfants', 'Invité']`.

### 3.2. Fonctions Pures de Gestion de Profils (`src/core/storage/profile-manager.ts`)
Implémente ces fonctions pures prenant `state: MiaSaveState` et retournant un nouveau `MiaSaveState` :
1. `ensureDefaultProfile(state: MiaSaveState): MiaSaveState`
   * Si `state.profiles.length === 0`, crée automatiquement un premier profil par défaut (`name: "Joueur 1"`, `avatarId: "fox"`) et le définit comme `activeProfileId`.
2. `addProfile(state: MiaSaveState, name: string, avatarId: string): MiaSaveState`
   * Crée un nouveau `UserProfile` avec un `id` unique, l'ajoute à `state.profiles` et le sélectionne immédiatement comme `activeProfileId`.
3. `setActiveProfile(state: MiaSaveState, profileId: string): MiaSaveState`
   * Change `activeProfileId` si le profil existe.
4. `deleteProfile(state: MiaSaveState, profileId: string): MiaSaveState`
   * Supprime le profil demandé. S'il s'agissait du profil actif, sélectionne le premier profil restant (ou recrée un profil par défaut via `ensureDefaultProfile`).
* **Contrat FEAT-05** ([§5](./FEAT-05.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * Appliquer ces fonctions par `updateState` (`useMiaStorage`) : il attend la fin du chargement initial et sérialise les écritures (`ensureDefaultProfile` au démarrage n'écrase jamais la sauvegarde chargée).
  * `createDefaultSaveState()` ne contient aucun profil (`activeProfileId: null`). `activeProfileId` peut aussi valoir `null` alors que des profils existent (profil actif introuvable au chargement) : l'interface doit alors proposer le choix du profil.
  * Chaque profil doit avoir un `id` non vide et unique et des champs `name` / `avatarId` / `createdAt` textuels : un profil invalide est écarté au chargement (copie de secours). Un `avatarId` inconnu du catalogue est conservé : `AvatarBadge` doit prévoir un repli.

### 3.3. Interface `ProfileSelectorModal` (`src/components/profile/ProfileSelectorModal.tsx`)
* Affiche la grille des profils existants sous forme de `FocusableCard` navigables au D-Pad (`useGridNavigation`) et au tactile.
* Chaque carte de profil affiche son `AvatarBadge`, son nom, et le total d'étoiles qu'il a déjà gagnées tous jeux confondus.
* Une carte **"+ Nouveau Joueur"** permet d'ouvrir le formulaire de création rapide :
  * Choix de l'avatar en grille navigable au D-Pad.
  * Rangée de boutons de **Noms Rapides en 1 clic** (`Mia`, `Joueur 1`, `Joueur 2`, etc.) très pratique sur Android TV + champ `<input type="text">` accessible pour saisir un prénom personnalisé.
* **Contrat FEAT-04** ([§5](./FEAT-04.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * Les zones (`useGridNavigation`) de la grille des profils, des avatars et des noms rapides sont déclarées **dans des composants rendus à l'intérieur de `ModalDialog`** (sinon elles restent sous la couche de la modale, suspendues), et enchaînées avec `onEdge`. Un formulaire ouvert dans une seconde modale forme une couche imbriquée.
  * Dans le champ prénom, Gauche / Droite / Retour arrière / Espace / Entrée restent au champ ; Haut / Bas en sortent vers la zone active ; Échap vaut Retour.
  * Avec `onClose`, Retour (Retour arrière, bouton Android) ferme la modale sauf si la zone active a son propre `onBack` (ex: formulaire → retour à la grille des profils).

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/profile-manager.test.ts` valide la création par défaut, l'ajout, la sélection et la suppression de profils avec une couverture `>= 80%`.
- [ ] `ProfileSelectorModal` est entièrement navigable au clavier/télécommande (`Flèches` + `Entrée` + `Échap`) et conforme aux règles `jsx-a11y`.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(profile): add local multi-profile management and selector modal`).

---

## 5. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Gestion des profils** | Suppression seule (ni renommage ni changement d'avatar) : le bouton « Gérer les profils », sous la grille, bascule la modale en mode gestion (titre « Gérer les profils », badge 🗑 sur chaque carte, « Supprimer » vocalisé en tête du nom, carte « Nouveau joueur » masquée, bouton « Terminé »). OK sur une carte ouvre la confirmation, curseur sur « Annuler » ; on reste en mode gestion après une suppression. En mode gestion, Retour, Échap, ✕ et le fond reviennent au choix du joueur ; chaque ouverture repart du choix du joueur. |
| **Couches** | Formulaire de création (`NewProfileModal`) et confirmation (`DeleteProfileModal`) : `ModalDialog` imbriquées, rendues dans le contenu de la modale (couches FEAT-04 empilées ; focus à l'ouverture, retour du focus au déclencheur, Échap et Retour déjà gérés par FEAT-03/04). Modules internes, hors barrel. |
| **Formulaire** | De haut en bas : champ « Prénom », prénoms rapides, avatars, [Annuler] [Créer]. Un prénom rapide remplit le champ (bouton pressé, `aria-pressed`) ; seul « Créer » crée. Le curseur D-Pad part du premier prénom rapide libre (du champ s'il n'y en a plus) : il ne traverse jamais le champ par mégarde (sur Android TV, y placer le focus peut ouvrir le clavier virtuel). OK sur un prénom rapide passe le curseur à l'avatar proposé (premier libre, `suggestAvatarId`) : chemin le plus court à la télécommande OK → Bas → OK. Refus : message `role="alert"` sous le champ (`aria-invalid`, `aria-describedby`), curseur ramené aux prénoms rapides (prénom vide) ou au champ (prénom pris). Profil créé : actif, les deux modales se ferment (`onClose`). |
| **Entrée dans le champ** | Pas de `<form>` (soumission implicite à Entrée) : au D-Pad, Entrée reste native (sur Android TV, OK sur le champ ouvre le clavier virtuel ; une soumission créerait le profil par mégarde). Au doigt ou à la souris (`inputMode: 'touch'`), Entrée (touche « OK » du clavier virtuel) passe le focus à « Créer », ce qui referme le clavier. |
| **Règles** | Prénom normalisé (espaces de début et de fin retirés, espaces intérieurs réduits), de 1 à 20 caractères (points de code), unique sans tenir compte de la casse ni des accents (`getProfileNameKey`) ; messages français prêts à afficher (`checkProfileName`, `PROFILE_NAME_ERROR_MESSAGES`). 8 profils au plus (`MAX_PROFILES`) : carte « Nouveau joueur » masquée, `PROFILE_LIMIT_MESSAGE` affiché. Prénoms rapides déjà pris masqués (`getAvailableQuickNames`). Une demande invalide (prénom refusé, avatar inconnu, plafond atteint, profil introuvable ou déjà actif) renvoie `state` lui-même : `updateState` n'écrit rien. |
| **Identifiants** | UUID v4 tiré de `crypto.getRandomValues` (disponible hors contexte sécurisé, contrairement à `crypto.randomUUID` : PWA testée sur une TV en `http://` sur le réseau local), tiré de nouveau en cas de collision (`createProfileId`). Options `{ id, now }` d'`addProfile`, `ensureDefaultProfile` et `deleteProfile` pour des tests déterministes (`createdAt` = `now.toISOString()`). |
| **Dernier profil** | Supprimable : la confirmation l'annonce (« Ses 2 étoiles seront perdues. Un profil « Joueur 1 » vide le remplacera. ») et `deleteProfile` recrée « Joueur 1 » (renard), actif. Profil actif supprimé : le premier profil restant devient actif ; sans profil actif, le choix reste ouvert. |
| **Démarrage** | `useProfileGate()` (`src/core/storage/useProfileGate.ts`, barrel) : une fois la sauvegarde chargée, applique `updateState(ensureDefaultProfile)` dès que la liste des profils est vide (premier lancement, `resetAllData`, import sans profil, `localStorage.clear()` dans un autre onglet) ; renvoie `mustChooseProfile` (`needsProfileChoice` : des profils, aucun actif). L'écran ouvre alors `ProfileSelectorModal` **sans `onClose`** : ni ✕, ni Échap, ni fond ; Retour n'est pas géré (`dispatchBack` → `false`, FEAT-15 quitte l'application). |
| **API de `ProfileSelectorModal`** | `isOpen`, `onClose?` : fermeture sans changement (Échap, Retour, ✕, fond), appelée aussi après un choix ou une création ; absent, choix imposé. Composant connecté (`useMiaStorage`, `updateState`), à monter sous `StorageProvider` et `NavigationProvider` une fois `isLoaded`. Profils dans l'ordre de création, carte « Nouveau joueur » en dernier ; curseur initial sur le profil actif (sinon le premier) ; choisir le profil déjà actif ferme la modale. Zones D-Pad : cartes, puis bouton de gestion (`onEdge`) ; le focus DOM (Tab, clic) active la zone de l'élément focalisé (de même dans le formulaire). |
| **Avatars** | `avatars.ts` : données seules (`AvatarId`, `AVATARS` : libellé et fond clair sous une icône `slate-950`, `DEFAULT_AVATAR_ID`, `QUICK_PROFILE_NAMES`, `getAvatar`, `isAvatarId`) ; icônes associées dans `src/components/profile/avatar-icons.tsx` (table exhaustive `AVATAR_ICONS`), comme `DIFFICULTY_TIERS` et ses icônes. Lucide n'a ni renard ni chouette : `FoxIcon` et `OwlIcon` dessinées au format Lucide (24 × 24, trait de 2 px arrondi, `currentColor`) ; les 6 autres viennent de Lucide (`Bot`, `Rocket`, `Cat`, `Crown`, `Star`, `Brain`). `AvatarBadge` : tailles `sm` / `md` / `lg` (32 / 48 / 64 px), décoratif (`aria-hidden`) sauf avec `label` (`role="img"`) ; avatar inconnu : silhouette `UserRound` sur fond ardoise à bordure pointillée. |
| **Étoiles** | `countProfileStars(profile)` : niveaux `completed` de la sauvegarde, tous jeux confondus, sans catalogue (FEAT-07 n'existe pas encore) ; égal au décompte du catalogue tant qu'aucun niveau publié n'en est retiré (contrat noté dans FEAT-07). Carte : `StarBadge` sans total. |
| **Colonnes D-Pad** | `useGridColumns(fallback)` (`src/core/navigation/useGridColumns.ts`, barrel) renvoie `[ref, cols]` : nombre de pistes de `grid-template-columns` calculé, suivi par `ResizeObserver` ; la feuille de style reste la seule source de la mise en page (`auto-fill`, points de rupture, `tv:`), sans navigation géométrique sur le DOM. `fallback` au pré-rendu, dans jsdom ou si la valeur n'est pas résolue. Paire plutôt qu'objet : le React Compiler (`react-hooks/refs`) tient pour une ref tout objet dont une propriété sert de `ref` JSX et refuse alors d'en lire les autres propriétés pendant le rendu. Grilles : profils `repeat(auto-fill, minmax(8rem, 1fr))` (repli 2), prénoms rapides `minmax(7rem, 1fr)` (repli 2), avatars 4 puis 8 colonnes dès `md:` (repli 4). |
| **Périmètre** | `src/app/page.tsx` et `src/app/layout.tsx` **inchangés** : FEAT-08 monte les providers, `useProfileGate` et la modale. Ajouts à l'arborescence §2 : `useGridColumns.ts`, `useProfileGate.ts`, `avatar-icons.tsx`, `NewProfileModal.tsx`, `DeleteProfileModal.tsx`. |
| **Tests** | `tests/profile-manager.test.ts` (fonctions pures, catalogue, relecture sans perte par `parseSaveStateReport`) ; `tests/profile-selector.test.tsx` (`AvatarBadge`, `useProfileGate`, modale au doigt et au D-Pad sous `StorageProvider` + `NavigationProvider`, Capacitor simulé) ; `useGridColumns` dans `tests/navigation.test.tsx`. |
| **Contrats aval** | Notes ajoutées dans [FEAT-07 §3.2](./FEAT-07.md), [FEAT-08 §4.1 et §4.2](./FEAT-08.md) et [FEAT-18 §3.2](./FEAT-18.md). |
| **Git** | Branche `feat/profile` depuis `main`, commit `feat(profile): add local multi-profile management and selector modal`. |
