# FEAT-08 : Hub des Jeux & Carte de Progression des Étoiles

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-08`
> **Dépendances** : [FEAT-03](./FEAT-03.md), [FEAT-04](./FEAT-04.md), [FEAT-06](./FEAT-06.md), [FEAT-07](./FEAT-07.md)

---

## 1. Contexte & Objectif pour l'IA

L'objectif de cette **FEAT-08** est de construire les deux écrans de navigation principaux de **Mia** :
1. **Le Hub Principal (`src/app/page.tsx`)** : Affiche le profil familial actif (avec possibilité d'en changer), le résumé global des étoiles, et les cartes permettant de lancer **Memory** ou **Traffic Jam**.
2. **La Carte de Progression des Étoiles d'un Jeu (`StarMapScreen`)** : Affiche les **5 paliers de difficulté** (*Très Facile*, *Facile*, *Moyen*, *Difficile*, *Très Difficile*) et toutes les **Étoiles (niveaux)** de chaque palier, avec une navigation fluide au doigt (Mobile/Tablette) comme à la télécommande D-Pad (Android TV).

---

## 2. Architecture de Routage Compatible Export Statique (`output: 'export'`)

Organise les routes statiques ainsi :
* `/` (`src/app/page.tsx`) : Hub principal des jeux.
* `/memory` (`src/app/memory/page.tsx`) : Carte des Étoiles du jeu *Memory* (et lancement d'un niveau).
* `/traffic-jam` (`src/app/traffic-jam/page.tsx`) : Carte des Étoiles du jeu *Traffic Jam* (et lancement d'un niveau).

---

## 3. Fichiers à Créer / Modifier

```text
src/
├── components/
│   ├── ui/
│   │   ├── AppShell.tsx               # + backButtonRef / onBackFocus : bouton Retour dans une zone D-Pad (voir §6)
│   │   ├── FocusableCard.tsx          # + onLockedSelect : activation d'une carte verrouillée (voir §6)
│   │   ├── FadeIn.tsx                 # Déplacé depuis src/app/_components/ (voir §6)
│   │   └── index.ts
│   ├── profile/
│   │   ├── ProfileGate.tsx            # useProfileGate + choix du joueur imposé, monté par chaque écran racine (voir §6)
│   │   └── index.ts
│   └── progression/
│       ├── GameHubCard.tsx            # Carte d'un jeu sur l'écran d'accueil (progression, bouton Continuer)
│       ├── StarLevelTile.tsx          # Tuile individuelle d'une Étoile (#1 à #N) sur la carte d'un jeu
│       ├── StarMapScreen.tsx          # Composant réutilisable affichant les 5 paliers et leurs étoiles
│       ├── HubScreen.tsx              # Écran du Hub (jeux injectables pour les tests, voir §6)
│       ├── GameScreen.tsx             # Page d'un jeu : carte ou niveau lancé (?level=), renderLevel (voir §6)
│       ├── WaitingScreen.tsx          # Attente du chargement de la sauvegarde
│       ├── game-icons.ts              # Icône de chaque jeu (table exhaustive sur GameId)
│       ├── next-goal.ts               # Objectif suivant : jouer, viser la couronne, terminé (voir §6)
│       ├── labels.ts                  # Libellés (coups, couronnes, boutons) et compteurs d'étoiles
│       ├── routes.ts                  # Paramètre ?level= et retours dans l'historique (voir §6)
│       ├── zone-chain.ts              # Enchaînement des zones D-Pad déclarées par les composants enfants (voir §6)
│       └── index.ts
└── app/
    ├── layout.tsx                     # Intègre StorageProvider + NavigationProvider
    ├── page.tsx                       # Hub Principal (Sélection du jeu + Profil actif)
    ├── memory/
    │   └── page.tsx                   # Page Memory (Carte des Étoiles + conteneur de jeu)
    └── traffic-jam/
        └── page.tsx                   # Page Traffic Jam (Carte des Étoiles + conteneur de jeu)
tests/
├── star-map.test.tsx                  # Tests de rendu du Hub et de la Carte des Étoiles
└── ui-components.test.tsx             # + backButtonRef, onBackFocus, onLockedSelect
```

---

## 4. Spécifications Fonctionnelles & UX Détaillées

> Les décisions de la session de cadrage ([§6](#6-décisions-dimplémentation-session-de-cadrage)) précisent ces spécifications : niveau adressé par `?level=`, écrans partagés `HubScreen` / `GameScreen`, garde de profil sur chaque écran racine, jeux et paliers vides annoncés, chasse aux couronnes, colonne des paliers sur grand écran, ordre de lecture au D-Pad, Retour du navigateur aligné sur celui de Mia, message d'une étoile verrouillée.

### 4.1. Hub Principal (`src/app/page.tsx`)
* **Barre supérieure (`AppShell`)** :
  * Bouton du profil actif (Avatar + Nom) qui ouvre `ProfileSelectorModal` (`FEAT-06`) au clic ou avec `OK`.
  * Compteur total d'étoiles cumulées par le joueur (`Memory + Traffic Jam`).
* **Grille des Jeux (`GameHubCard`)** :
  * Affiche les 2 jeux (**Memory** et **Traffic Jam**) côte à côte sur Tablette/TV (`md:grid-cols-2`) et l'un sous l'autre sur Smartphone portrait (`grid-cols-1`).
  * Chaque `GameHubCard` affiche :
    * L'icône et le titre du jeu.
    * La faculté cérébrale travaillée (*"Mémoire visuelle & spatiale"* / *"Planification & Logique séquentielle"*).
    * Une barre de progression visuelle et le score `earnedStars / totalStars ⭐` (ainsi que le nombre de couronnes `perfectCount 👑`).
    * Deux actions accessibles au tactile ou au D-Pad : **"Continuer (Étoile #X)"** (lance directement `nextPlayableLevel`) et **"Carte des Étoiles"** (ouvre `StarMapScreen`).
* **Contrat FEAT-05** ([§5](./FEAT-05.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * `layout.tsx` monte `StorageProvider` (import depuis le barrel `@/core/storage`, compatible avec un composant serveur) et conserve le script inline du mode TV dans `<head>` ainsi que `suppressHydrationWarning` sur `<html>`.
  * Tant que `isLoaded` vaut `false` (pré-rendu statique, premier rendu), `state` est l'état par défaut : afficher un état d'attente plutôt qu'un Hub vide, et n'ouvrir `ProfileSelectorModal` qu'une fois la sauvegarde chargée.
  * Aucun écran de réglages ni de sauvegarde n'est prévu ici : voir [FEAT-18](./FEAT-18.md) (point d'entrée depuis le Hub).
* **Contrat FEAT-06** ([§5](./FEAT-06.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * Appeler `useProfileGate()` (`@/core/storage`) dans le Hub : il crée « Joueur 1 » dès que la sauvegarde chargée n'a aucun profil (premier lancement, réinitialisation, import vide) et renvoie `mustChooseProfile` (des profils, aucun actif).
  * Monter `<ProfileSelectorModal isOpen={isSelectorOpen || mustChooseProfile} onClose={mustChooseProfile ? undefined : closeSelector} />` (`@/components/profile`) une fois `isLoaded` : sans `onClose`, le choix est imposé (ni ✕, ni Échap) ; `onClose` est aussi appelé après un choix ou une création. La modale gère seule création et suppression.
  * Bouton du profil actif : `AvatarBadge` (`size="sm"`, décoratif) et prénom dans un `FocusableButton`, placé dans l'emplacement `profile` d'`AppShell`.
  * Les cartes de profil comptent les étoiles sans catalogue (`countProfileStars`) ; le compteur du Hub s'appuie sur FEAT-07.
* **Contrat FEAT-07** ([§5](./FEAT-07.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * `getProfileProgressSummary(activeProfile)` (`@/core/progression`) donne le compteur du Hub (`earnedStars`, `totalStars`, `perfectCount`, tous jeux confondus) et, dans `games`, le résumé de chaque jeu dans l'ordre de `GAMES` (une `GameHubCard` par jeu). Fonctions pures, sans hook fourni : `useMemo` sur `activeProfile`.
  * `GameManifest` fournit `title`, `skill` (faculté travaillée) et `path` (route à passer telle quelle à `next/link`, qui ajoute `basePath` et la barre finale). Icônes des jeux à déclarer dans `src/components/progression/` (table exhaustive sur `GameId`, comme `avatar-icons.tsx`).
  * `nextPlayableLevel` vaut `null` quand toutes les étoiles du jeu sont gagnées : remplacer « Continuer » (ex: « Toutes les étoiles gagnées ! »). Les catalogues restent vides jusqu'à FEAT-11 et FEAT-14 : prévoir un jeu sans niveau (`totalStars === 0`, ex: « Bientôt disponible ») ; les tests injectent leurs catalogues (`getProfileProgressSummary(profile, games)`).
  * Seuls les niveaux des catalogues comptent : le compteur du Hub peut être inférieur au total des cartes de profil si la sauvegarde contient des niveaux d'une version plus récente de Mia.

### 4.2. Carte des Étoiles (`src/components/progression/StarMapScreen.tsx`)
* **En-tête du jeu** : Bouton Retour vers le Hub, titre du jeu, compteur `earnedStars / totalStars ⭐`, et bouton **"Jouer l'Étoile #X"** (accès rapide au prochain niveau non résolu).
* **Affichage des 5 Paliers Cognitifs** :
  * Parcourt les 5 paliers (`tiers`) fournis par `getGameProgressSummary`.
  * Chaque palier affiche son `DifficultyPill` (*1. Très Facile*, *2. Facile*, *3. Moyen*, *4. Difficile*, *5. Très Difficile*) et son compteur de palier (`ex: 4 / 4 ⭐`).
  * Sous chaque palier, affiche la grille de ses niveaux sous forme de `StarLevelTile`.
* **Tuile `StarLevelTile`** :
  * Affiche le numéro global de l'étoile (`#1`, `#2`, ..., `#20`, ...).
  * **4 états visuels clairs** :
    1. **Verrouillé (`!isUnlocked`)** : Icône cadenas 🔒, opacité réduite.
    2. **À conquérir (`isUnlocked && !isCompleted`)** : Bordure animée/lumineuse invitant à jouer 🎯.
    3. **Complété (`isCompleted && !isPerfect`)** : Grande étoile dorée ⭐ + meilleur nombre de coups.
    4. **Parfait (`isPerfect`)** : Grande étoile dorée ⭐ + badge Couronne 👑.
* **Ergonomie Télécommande Android TV** :
  * À l'ouverture de `StarMapScreen`, le focus D-Pad (`focusedIndex`) se place **automatiquement sur la tuile du prochain niveau à jouer (`nextPlayableLevel`)** et fait défiler la vue (`scrollIntoView`) jusqu'à cette étoile.
* **Contrat FEAT-07** ([§5](./FEAT-07.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * Résumé : `getGameProgressSummary(gameId, GAME_REGISTRY[gameId].catalog, activeProfile)`. `tiers` contient toujours les 5 paliers, même vides (les masquer ou les annoncer). `starNumber` est recalculé à chaque publication de niveaux : seul `definition.id` est stable.
  * `nextPlayableLevel` (niveau qui suit le niveau réussi le plus avancé, sinon le premier non réussi) est toujours débloqué. Il vaut `null` quand tout est réussi : curseur initial alors sur une autre tuile (ex: la première sans couronne, sinon la première) et bouton « Jouer l'Étoile #X » masqué ou remplacé. Après l'insertion de niveaux plus tôt dans un catalogue, plusieurs tuiles peuvent être « à conquérir ».
* **Contrat FEAT-04** ([§5](./FEAT-04.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * `layout.tsx` monte `NavigationProvider` (import depuis le barrel `@/core/navigation`, compatible avec un composant serveur).
  * Chaque groupe (boutons de l'en-tête, tuiles de chaque palier, actions des `GameHubCard`) est une zone `useGridNavigation` ; une seule est active à la fois, l'écran les enchaîne avec `onEdge` (bascule de `isActive` + `setFocusedIndex` sur la zone cible, ex: conserver la colonne d'un palier à l'autre).
  * `initialIndex` place le curseur sur `nextPlayableLevel` ; avec `getItemRef`, focus DOM et défilement suivent le curseur en mode D-Pad. En mode tactile, rien ne défile automatiquement : le défilement initial vers cette étoile sur mobile est à la charge de `StarMapScreen`.
  * Le bouton Retour d'`AppShell` n'expose pas de `ref` : l'ajouter (ex: `backButtonRef`) pour l'inclure dans une zone avec focus DOM synchronisé, sinon se limiter à `isBackFocused`.
* **Contrat FEAT-06** ([§5](./FEAT-06.md#5-décisions-dimplémentation-session-de-cadrage)) :
  * Grilles responsives (tuiles d'un palier, cartes de jeux) : `const [gridRef, cols] = useGridColumns(fallback)` (`@/core/navigation`) donne à `useGridNavigation` le nombre de colonnes réellement affiché par la feuille de style (`grid-cols-*`, `auto-fill`, `tv:`), sans navigation géométrique sur le DOM.

---

## 5. Critères d'Acceptation (Definition of Done)

- [ ] `tests/star-map.test.tsx` valide le rendu du Hub et de `StarMapScreen` ainsi que la sélection du prochain niveau jouable avec une couverture globale `>= 80%`.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(hub): add game hub and 5-tier star progression map`).

---

## 6. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Niveau lancé (`?level=`)** | Adressé par `?level=<definition.id>` (`/memory/?level=mem-005`) : identifiant stable (les numéros d'étoile changent à chaque publication), rechargement possible, Retour du navigateur cohérent. Lu par `useSearchParams` sous `<Suspense>` (au pré-rendu statique, la page s'arrête à cette limite : écran d'attente). Carte ↔ niveau : `history.pushState` / `replaceState` natifs, synchronisés par Next.js, sans requête réseau. Hub → jeu : `router.push(getLevelHref(path, id))` ou `router.push(path)`, routes préchargées (`router.prefetch`). Niveau inconnu ou verrouillé : la carte s'affiche et `?level` est retiré (`replaceState`), une fois un profil actif (sinon un niveau débloqué plus tard s'ouvrirait de lui-même). Pas de route dynamique `[levelId]` : elle exigerait `generateStaticParams` sur des catalogues encore vides. |
| **Écrans partagés** | Pages serveur minces (`metadata` : « Memory · Mia » par le gabarit de titre du layout) qui importent le module de leur écran, pas le barrel : le JS client de chaque route se limite à son écran. `HubScreen({ games = GAMES })` et `GameScreen({ gameId, catalog?, renderLevel? })` (`components/progression/`) : catalogues injectés par les tests, typés par FEAT-11 / FEAT-14. `renderLevel(level, controls)` rend le plateau, remonté à chaque changement de niveau ; `LevelControls` : `summary`, `playLevel(id)` (remplace l'entrée d'historique, ex: « Étoile Suivante »), `exitToMap()`, `recordVictory({ moves, timeSeconds, isPerfect })` (`recordLevelVictory` sur le profil actif). Sans `renderLevel` : écran « Le plateau de Memory arrive bientôt » (Retour → carte). Carte remontée au changement de joueur (curseur sur l'objectif du nouveau profil). |
| **Profil** | `ProfileGate` (`components/profile`, barrel) : `useProfileGate` + `ProfileSelectorModal` imposé sans profil actif, ouverture volontaire par `isOpen` / `onClose`. Monté par le Hub **et** par `GameScreen` : une page de jeu ouverte directement (rechargement, favori, réinitialisation dans un autre onglet) ne perd jamais de victoire (`recordLevelVictory` n'écrit rien sans profil actif). Tant qu'aucun profil n'existe, écran d'attente (« Joueur 1 » est créé aussitôt). Bouton du profil actif : `AvatarBadge` + prénom, nom accessible « Joueur : Léo », `aria-haspopup="dialog"`. |
| **Jeux et paliers vides** | Jeu sans niveau : « Bientôt disponible » à la place de la progression et de « Continuer », « Carte des Étoiles » conservée. La carte affiche toujours les 5 paliers ; un palier vide annonce « Bientôt de nouvelles étoiles », sans compteur, et le D-Pad le saute. Compteurs d'étoiles sans total tant qu'aucun niveau n'est publié (« 0 » plutôt que « 0 / 0 »), halo doré quand chaque étoile a sa couronne. |
| **Objectif suivant** | `getNextGoal(summary)` : `empty`, `play` (`nextPlayableLevel`), `crown` (toutes les étoiles gagnées : premier niveau sans couronne), `complete`. Hub : « Commencer (Étoile #1) » sans étoile gagnée, sinon « Continuer (Étoile #X) », puis « Viser la couronne (Étoile #X) », puis « Toutes les étoiles et couronnes ! » (sans bouton). Carte : « Jouer l'Étoile #X » / « Viser la couronne (Étoile #X) » dans l'en-tête (réduit à « #X » sous `sm:`, texte vocalisé), bandeau de félicitations quand tout est couronné. Curseur initial : l'objectif, sinon la première étoile. |
| **Carte des Étoiles** | Paliers empilés sur smartphone ; dès `md:` et en mode TV, pastille et compteur dans une colonne de largeur fixe (15rem) à gauche : toutes les grilles ont la même largeur, donc les mêmes colonnes (`auto-fill`, `useGridColumns`, repli 4). Tuile : numéro global, état vocalisé (« Étoile #3, réussie, meilleur score : 12 coups », « Étoile #9, verrouillé »), icônes en plus des couleurs (cible, étoile dorée, couronne), bordure « à conquérir » pulsée sous `motion-safe:` par un calque distinct (l'anneau de focus n'est pas touché). `data-state` et `data-level-id` sur chaque tuile. |
| **D-Pad** | Zones : en-tête (Retour, Jouer) puis une zone par palier ; Hub : bouton du profil puis une zone par carte de jeu (ses actions en colonne). Enchaînement par `onEdge` avec `useZoneRegistry` / `useZoneController` (`zone-chain.ts`) : l'écran positionne la zone cible puis l'active dans le même gestionnaire (un rendu, focus DOM posé directement). Carte : ordre de lecture (Gauche / Droite = étoile précédente / suivante, d'une ligne ou d'un palier à l'autre), Haut / Bas gardent la colonne (bornée à la dernière étoile), paliers vides sautés ; Haut depuis la première ligne → « Jouer » (sinon Retour), Bas depuis l'en-tête → dernière étoile quittée. Hub : cartes suivant la grille mesurée (Gauche / Droite entre cartes côte à côte, même action), Haut depuis la première ligne → profil, Bas depuis le profil → dernière carte quittée, curseur initial sur le dernier jeu ouvert (`sessionStorage`, `mia_hub_last_game`). Focus DOM (Tab, clic) → zone de l'élément activée. Au doigt, la carte défile elle-même jusqu'à l'objectif (`block: 'center'`). |
| **Retour et historique** | Retour de Mia = Retour du navigateur : avancer empile une entrée ; revenir dépile (`router.back()`) quand l'entrée précédente est l'écran parent (Navigation API : Chromium, WebView Android), sinon remplace l'entrée par lui (`replaceState` vers la carte, `router.replace('/')` vers le Hub) : adresse ouverte directement, niveau lancé depuis le Hub (son parent est la carte). Retour ne quitte jamais Mia, sauf depuis le Hub (aucun gestionnaire : `dispatchBack()` → `false`). |
| **Étoile verrouillée** | Tap ou OK : message temporaire (4 s, région `role="status"`) « L'Étoile #9 est verrouillée : gagne l'Étoile #5 pour avancer. » (`nextPlayableLevel`, toujours défini tant qu'une étoile est verrouillée), sans déplacer le curseur. |
| **Attente** | `WaitingScreen` (`AppShell` + indicateur `role="status"` « Chargement… ») : pré-rendu statique, chargement de la sauvegarde, création de « Joueur 1 ». L'indicateur apparaît après 0,4 s (`FadeIn`) : pas de clignotement quand la sauvegarde se lit aussitôt. |
| **Design system** | `AppShell` : `backButtonRef` et `onBackFocus` (bouton Retour dans une zone D-Pad). `FocusableCard` : `onLockedSelect`, appelée à la place d'`onSelect` sur une carte verrouillée. `FadeIn` déplacé de `src/app/_components/` vers `components/ui` (barrel). `layout.tsx` : `StorageProvider` et `NavigationProvider` (barrels), script du mode TV importé du barrel (le Provider embarque déjà `StorageContext`), titre `{ default, template: '%s · Mia' }`. Icônes des jeux : `GAME_ICONS` (Lucide `Grid2x2`, `CarFront`). |
| **Tests** | `tests/star-map.test.tsx` : objectif suivant, entrée de zone, historique, Hub (attente, « Joueur 1 », résumés, couronnes, jeux vides, navigation, choix du joueur, D-Pad empilé et côte à côte, curseur restauré), carte (paliers, états, curseur initial, défilement au doigt, ordre de lecture, colonnes, en-tête, étoile verrouillée, Retour), niveau lancé (`?level`, adresse nettoyée, choix du joueur, `renderLevel`), pages et titres. `next/navigation` simulé (`useSearchParams` suit `pushState` / `replaceState`), Navigation API simulée au besoin. `tests/home-page.test.tsx` (ancienne page d'attente) retiré ; nouvelles props dans `tests/ui-components.test.tsx`. |
| **Contrats aval** | Notes ajoutées dans [FEAT-10 §3.3](./FEAT-10.md), [FEAT-11 §3.2](./FEAT-11.md), [FEAT-13 §3.4](./FEAT-13.md), [FEAT-14 §3.2](./FEAT-14.md), [FEAT-15 §3.3](./FEAT-15.md), [FEAT-17 §4.2](./FEAT-17.md) et [FEAT-18 §4](./FEAT-18.md). |
| **Git** | Branche `feat/hub` depuis `main`, commit `feat(hub): add game hub and 5-tier star progression map`. |
