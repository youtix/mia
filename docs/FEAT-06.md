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
│   └── storage/
│       ├── avatars.ts                 # Liste des 8 avatars (icône, couleur, label)
│       ├── profile-manager.ts         # Fonctions pures CRUD sur les profils dans MiaSaveState
│       └── index.ts                   # Exporter avatars et profile-manager
└── components/
    └── profile/
        ├── AvatarBadge.tsx            # Rendu graphique d'un avatar (cercle coloré + icône)
        ├── ProfileSelectorModal.tsx   # Écran/Modale "Qui joue aujourd'hui ?" + Création rapide
        └── index.ts
tests/
└── profile-manager.test.ts            # Tests unitaires CRUD multi-profils
```

---

## 3. Spécifications Détaillées

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

### 3.3. Interface `ProfileSelectorModal` (`src/components/profile/ProfileSelectorModal.tsx`)
* Affiche la grille des profils existants sous forme de `FocusableCard` navigables au D-Pad (`useGridNavigation`) et au tactile.
* Chaque carte de profil affiche son `AvatarBadge`, son nom, et le total d'étoiles qu'il a déjà gagnées tous jeux confondus.
* Une carte **"+ Nouveau Joueur"** permet d'ouvrir le formulaire de création rapide :
  * Choix de l'avatar en grille navigable au D-Pad.
  * Rangée de boutons de **Noms Rapides en 1 clic** (`Mia`, `Joueur 1`, `Joueur 2`, etc.) très pratique sur Android TV + champ `<input type="text">` accessible pour saisir un prénom personnalisé.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/profile-manager.test.ts` valide la création par défaut, l'ajout, la sélection et la suppression de profils avec une couverture `>= 80%`.
- [ ] `ProfileSelectorModal` est entièrement navigable au clavier/télécommande (`Flèches` + `Entrée` + `Échap`) et conforme aux règles `jsx-a11y`.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(profile): add local multi-profile management and selector modal`).
