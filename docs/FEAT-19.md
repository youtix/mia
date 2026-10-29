# FEAT-19 : Réglages de Jeu par Profil (Temps de Mémorisation & d'Affichage des Erreurs de Memory)

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-19`
> **Dépendances** : [FEAT-05](./FEAT-05.md), [FEAT-06](./FEAT-06.md), [FEAT-09](./FEAT-09.md), [FEAT-10](./FEAT-10.md), [FEAT-11](./FEAT-11.md), [FEAT-18](./FEAT-18.md)
> **Statut** : cadrée et implémentée ; les décisions prises pendant la session de cadrage sont consignées au [§6](#6-décisions-dimplémentation-session-de-cadrage).

---

## 1. Contexte & Objectif pour l'IA

Mia est une application familiale : sur la TV du salon ou la tablette partagée, un enfant qui découvre la règle de **Memory** ou un grand-parent qui apprivoise la télécommande ont besoin de plus de temps pour mémoriser les cartes avant qu'elles ne se cachent, ou pour voir les deux cartes d'une erreur avant qu'elles ne se retournent ; un joueur aguerri préfère au contraire un rythme plus vif. Avant cette feature, le seul levier était le catalogue (`previewSeconds`, [FEAT-11](./FEAT-11.md)) : le même pour tout le monde sur l'appareil, et modifiable seulement en changeant le code ; le temps d'affichage d'une erreur (`MISMATCH_DELAY_MS`, 900 ms, [FEAT-10](./FEAT-10.md)) n'était même pas un paramètre du niveau.

L'objectif de cette **FEAT-19** est une section **« Jeux »** sur l'écran Réglages ([FEAT-18](./FEAT-18.md)) où chaque profil ([FEAT-06](./FEAT-06.md)) ajuste **deux facteurs de temps de Memory** (temps de mémorisation, temps d'affichage des erreurs), enregistrés avec le profil ([FEAT-05](./FEAT-05.md)), appliqués par le plateau ([FEAT-10](./FEAT-10.md)) aux valeurs du catalogue ([FEAT-11](./FEAT-11.md)), sans toucher à la progression (étoiles et couronnes). La structure (`ProfileGameSettings`, un objet par jeu) est prête pour les réglages d'un autre jeu.

---

## 2. Fichiers à Créer / Modifier

```text
src/
├── types/
│   └── mia.ts                         # TIME_FACTORS, TimeFactor, MemoryGameSettings, ProfileGameSettings, UserProfile.gameSettings
├── core/
│   └── storage/
│       ├── default-state.ts           # DEFAULT_MEMORY_GAME_SETTINGS, createDefaultGameSettings()
│       ├── profile-manager.ts         # addProfile (réglages par défaut), updateMemorySettings()
│       ├── migrations.ts              # sanitizeGameSettings(), sanitizeMemorySettings() : réparation champ par champ
│       └── index.ts                   # Exporter les défauts et updateMemorySettings
├── games/
│   └── memory/
│       ├── settings.ts                # applyMemorySettings(), getMismatchDelayMs() (TypeScript pur, sans React)
│       ├── index.ts                   # Exporter les fonctions de settings.ts
│       ├── catalog.ts                 # previewSeconds: 5 sur les huit étoiles avec aperçu
│       └── components/
│           ├── MemoryBoard.tsx        # Configuration jouée (facteurs du profil actif), délai d'erreur multiplié
│           └── MemoryHud.tsx          # PreviewCountdown aligné sur la fin de l'aperçu (secondes fractionnaires)
└── components/
    └── settings/
        ├── SettingsScreen.tsx         # Zones D-Pad des deux groupes (enchaînement contraste → mémorisation → erreurs → sauvegarde)
        ├── GameSettingsSection.tsx    # Nouveau : section « Jeux » (profil actif, bloc Memory : deux groupes radio TimeFactorGroup)
        ├── labels.ts                  # TIME_FACTOR_OPTIONS, GAME_SETTINGS_TEXTS, describeProfileSettings(), formatTimeFactor()
        └── index.ts                   # Barrel : GameSettingsSection, textes, options et formatTimeFactor
tests/
├── memory-settings.test.ts            # Nouveau : applyMemorySettings, getMismatchDelayMs
├── memory-board.test.tsx              # Facteurs appliqués par le plateau (aperçu, erreurs, sans profil)
├── memory-catalog.test.ts             # previewSeconds: 5 sur les huit étoiles avec aperçu
├── settings-screen.test.tsx           # Section « Jeux », persistance par profil, enchaînement D-Pad, libellés
├── storage.test.tsx                   # Réparation et export / import de gameSettings
└── profile-manager.test.ts            # addProfile (défauts), updateMemorySettings
docs/
├── FEAT-19.md                         # Ce document
├── SPECIFICATION.md                   # §3.2 (schéma), §5 (graphe), §6 (liste), §7.3 (guide d'extension)
└── FEAT-10.md, FEAT-11.md, FEAT-18.md # Renvois : compte à rebours et délai d'erreur, aperçu du catalogue, section « Jeux »
README.md                              # Fonctionnalités, tableau des champs de Memory, arborescence de docs/
```

---

## 3. Spécifications

> Les décisions de la session de cadrage ([§6](#6-décisions-dimplémentation-session-de-cadrage)) donnent les motivations de ces spécifications et les alternatives écartées.

### 3.1. Modèle de données (`src/types/mia.ts`, `src/core/storage/`)

```typescript
/**
 * Pas du facteur de temps, dans l'ordre d'affichage : `1` = temps du niveau tel quel,
 * `0.5` le divise par deux, `2` le double.
 */
export const TIME_FACTORS = [0.5, 1, 1.5, 2] as const;

/** Multiplicateur d'un temps de jeu (aperçu, affichage d'une erreur), parmi `TIME_FACTORS`. */
export type TimeFactor = (typeof TIME_FACTORS)[number];

/** Réglages de Memory propres à un profil, appliqués aux temps de chaque niveau. */
export interface MemoryGameSettings {
  /** Multiplie l'aperçu du niveau (`previewSeconds`) ; une étoile sans aperçu (0) n'en gagne pas */
  previewFactor: TimeFactor;
  /** Multiplie le temps pendant lequel les cartes d'une erreur restent visibles (`MISMATCH_DELAY_MS`) */
  mismatchFactor: TimeFactor;
}

/** Réglages de jeu d'un profil : un objet par jeu qui en propose (Traffic Jam n'en a pas encore). */
export interface ProfileGameSettings {
  memory: MemoryGameSettings;
}

export interface UserProfile {
  // … id, name, avatarId, createdAt, gamesProgress (FEAT-05 / FEAT-06)
  /** Réglages de jeu du joueur : toujours complets, réparés aux valeurs par défaut à la lecture */
  gameSettings: ProfileGameSettings;
}
```

* **Sémantique** : une **couche d'assistance** au-dessus du catalogue, jamais une réécriture du niveau. Chaque facteur multiplie la valeur du niveau : `previewFactor` × `previewSeconds` (une étoile conçue sans aperçu, `0`, n'en gagne jamais : `0 × 2 = 0`), `mismatchFactor` × `MISMATCH_DELAY_MS` (900 ms). Le délai d'un groupe trouvé (`MATCH_DELAY_MS`, 350 ms) et l'indicateur de permutation (`SWAP_HIGHLIGHT_MS`) ne changent pas.
* **Valeurs par défaut** (`src/core/storage/default-state.ts`) : `DEFAULT_MEMORY_GAME_SETTINGS` (`{ previewFactor: 1, mismatchFactor: 1 }`, lecture seule) et `createDefaultGameSettings()`, qui renvoie un **nouvel objet** à chaque appel (jamais partagé entre deux profils). `addProfile` (`profile-manager.ts`) les pose sur tout nouveau profil, « Joueur 1 » compris.
* **Mise à jour pure** (`profile-manager.ts`) : `updateMemorySettings(state, profileId, partial: Partial<MemoryGameSettings>)` conserve les champs absents de `partial` et renvoie **`state` lui-même** si le profil est introuvable ou si aucune valeur ne change (contrat FEAT-06 : `updateState` n'écrit alors rien). Exportée par le barrel `@/core/storage`, avec `DEFAULT_MEMORY_GAME_SETTINGS` et `createDefaultGameSettings`.
* **Lecture et réparation** (`migrations.ts` : `sanitizeProfile` → `sanitizeGameSettings` → `sanitizeMemorySettings`) : **aucune montée de version du schéma** (`schemaVersion` reste `1`, changement purement additif).
  * `gameSettings` **absent** (sauvegarde antérieure à FEAT-19) → `createDefaultGameSettings()`, **sans perte signalée** : ni message, ni copie de secours (`BACKUP_STORAGE_KEY`, [FEAT-05 §5](./FEAT-05.md#5-décisions-dimplémentation-session-de-cadrage)).
  * `gameSettings` présent mais non objet → défauts, avec le message « réglages de jeu du profil « p1 » illisibles, valeurs par défaut » ; `memory` absent → défauts sans perte ; `memory` non objet → « réglages Memory du profil « p1 » illisibles, valeurs par défaut ».
  * Chaque champ est réparé **séparément**, comme les réglages de l'appareil : une valeur hors de `TIME_FACTORS` (`isTimeFactor`) revient au défaut avec le message « réglage Memory « previewFactor » du profil « p1 » invalide, valeur par défaut » ; les champs inconnus sont retirés.
* **Export / import** : `exportSaveJson` sérialise l'état complet, `gameSettings` compris : les réglages **voyagent avec le profil**. L'import remplace les profils (et donc leurs réglages de jeu) et conserve les réglages de l'appareil (`DeviceSettings`), comme avant ([FEAT-05 §5](./FEAT-05.md#5-décisions-dimplémentation-session-de-cadrage), [FEAT-18 §6](./FEAT-18.md#6-décisions-dimplémentation-session-de-cadrage)). Une version de Mia **antérieure** à FEAT-19 qui importe une sauvegarde plus récente l'accepte (même `schemaVersion`) et retire simplement le champ qu'elle ne connaît pas.

### 3.2. Catalogue (`src/games/memory/catalog.ts`)

* Les **huit étoiles avec aperçu** passent à une base **uniforme de 5 s** : `mem-001`, `mem-002`, `mem-015`, `mem-018` (3 s jusque-là) et `mem-004`, `mem-006`, `mem-009`, `mem-010` (2 s jusque-là) ont `previewSeconds: 5` ; les douze autres gardent `0`. Table de [FEAT-11 §3.1](./FEAT-11.md) mise à jour.
* Le catalogue reste la **source de vérité** : la valeur jouée est `previewSeconds × previewFactor`, et une étoile future peut avoir une autre base (le réglage ne possède pas les secondes).

### 3.3. Application dans le jeu (`src/games/memory/settings.ts`, `components/MemoryBoard.tsx`)

* `settings.ts` (TypeScript pur, sans React ni DOM, exporté par le barrel `@/games/memory`) :
  * `applyMemorySettings(config, settings): MemoryLevelConfig` : configuration jouée, `previewSeconds` multiplié par `previewFactor` (5 s × 0,5 = 2,5 s ; 0 reste 0) ; renvoie **`config` lui-même** quand rien ne change (× 1 ou niveau sans aperçu).
  * `getMismatchDelayMs(baseDelayMs, settings): number` : `baseDelayMs × mismatchFactor` (900 ms → 450, 900, 1 350 ou 1 800 ms).
* `MemoryBoard` lit `useMiaStorage().activeProfile?.gameSettings.memory` (`DEFAULT_MEMORY_GAME_SETTINGS` sans profil actif), dérive la configuration jouée (`useMemo` sur les deux facteurs, [§4](#4-points-dattention)) et la **joue** : `createMemoryGame`, HUD (`game.config`), modale de fin, minuterie de l'aperçu (`previewSeconds × 1000` ms) ; le délai d'une erreur devient `getMismatchDelayMs(MISMATCH_DELAY_MS, settings)`, celui d'un groupe reste `MATCH_DELAY_MS`.
* **Progression inchangée** : `controls.recordVictory` reçoit les mêmes `{ moves, timeSeconds, isPerfect }` ; étoiles et couronnes sont gagnées normalement, quel que soit le réglage, et rien de plus n'est enregistré par victoire.

### 3.4. Compte à rebours de l'aperçu (`components/MemoryHud.tsx`)

* Les facteurs créent des durées **fractionnaires** (2,5 s, 7,5 s). `PreviewCountdown` est désormais **aligné sur la fin** de l'aperçu : il affiche `ceil(restant)`, son premier tic survient après la partie fractionnaire, puis chaque seconde, et il ne descend jamais sous 1. Pour 2,5 s : « 3 » pendant 0,5 s, puis « 2 », puis « 1 » ; pour 5 s : 5, 4, 3, 2, 1, comme avant. Vocalisation inchangée (« 3 secondes »), compte à rebours remonté à chaque nouvelle partie (`key={round}`).

### 3.5. Écran Réglages : section « Jeux » (`src/components/settings/`)

* **Section** `SettingsSection` « Jeux » (`GameSettingsSection.tsx`, icône `Gamepad2`), entre « Appareil » et « Sauvegarde », rendue **seulement avec un profil actif** : l'en-tête du bloc montre l'avatar du profil (`AvatarBadge`, module importé directement) et « Réglages de {prénom} » (`describeProfileSettings`), suivis de la note « Ces réglages suivent le joueur : chaque profil a les siens. ». Les zones D-Pad des deux groupes restent déclarées par `SettingsScreen` (l'enchaînement vit en un seul endroit, comme pour le mode TV, le son et le contraste) et sont passées à la section avec le profil actif.
* **Bloc « Memory »** (libellé littéral, voir [§4](#4-points-dattention)) : deux groupes radio indépendants, même balisage que le sélecteur « Mode TV » de FEAT-18 : `role="radiogroup"` nommé (`aria-labelledby`) et décrit (`aria-describedby`), options `FocusableButton role="radio" aria-checked`, option en vigueur pleine (`primary`) avec une coche (invisible sinon, pour que le libellé ne bouge pas).
  * **« Temps de mémorisation »** (`previewFactor`), note : « Multiplie l'aperçu des cartes au début d'une étoile : « Très long » le double. Les étoiles sans aperçu n'en gagnent pas. »
  * **« Temps d'affichage des erreurs »** (`mismatchFactor`), note : « Multiplie le temps pendant lequel deux cartes différentes restent visibles avant de se cacher. »
  * Options partagées `TIME_FACTOR_OPTIONS` (`labels.ts`), dans l'ordre de `TIME_FACTORS` : 0,5 → « Court », 1 → « Normal », 1,5 → « Long », 2 → « Très long », chacune avec son facteur affiché « × 0,5 », « × 1 », « × 1,5 », « × 2 » (`formatTimeFactor`, virgule décimale). Textes dans `GAME_SETTINGS_TEXTS`.
  * OK ou tap → `updateState((state) => updateMemorySettings(state, activeProfile.id, { previewFactor }))` (ou `{ mismatchFactor }`) ; choisir l'option déjà en vigueur n'écrit rien.
* **D-Pad** : en-tête (Retour) → mode TV (1 × 3) → Son → Contraste → **mémorisation (1 × 4)** → **erreurs (1 × 4)** → `BackupPanel`. L'arrivée dans un groupe, par le haut comme par le bas, pose le curseur sur l'option en vigueur (comme le mode TV) ; Haut depuis le panneau de sauvegarde revient sur le groupe des erreurs (sur Contraste sans profil actif), Bas depuis Contraste descend sur le groupe de mémorisation (sur la sauvegarde sans profil actif). Focus DOM (Tab, clic) → zone de l'élément ; `onBack` = retour au Hub pour chaque zone.

---

## 4. Points d'attention

* **Ordre des clés et égalité JSON dans les tests** : `gameSettings` est un champ obligatoire de `UserProfile` ; toutes les fabriques de profils des tests (`storage`, `profile-manager`, `settings-screen`, `memory-board`, `star-map`, `traffic-jam-board`, `profile-selector`, `progression-engine`) doivent le fournir. `sanitizeProfile` le place après `gamesProgress` : une comparaison de **chaînes** JSON (export relu, sauvegarde brute) dépend de cet ordre ; comparer des objets (`JSON.parse` + `toEqual`) plutôt que des chaînes.
* **Identité de `activeProfile` et `useMemo`** : `useMiaStorage().activeProfile` est recalculé à chaque sauvegarde (`useMemo` sur `state`) et le profil est un nouvel objet dès qu'il change (victoire enregistrée, réglage modifié). `MemoryBoard` dérive la configuration jouée des **deux facteurs primitifs**, pas de l'objet profil : la référence de `config` reste stable d'un rendu à l'autre (elle alimente `createMemoryGame`, les dépendances d'effets et la minuterie de l'aperçu, qui ne doit pas repartir). `applyMemorySettings` renvoie `config` lui-même quand rien ne change pour la même raison.
* **Secondes fractionnaires** : 2,5 s et 7,5 s existent (× 0,5 et × 1,5 de 5 s). La minuterie (`previewSeconds × 1000`) les gère ; le compte à rebours doit aligner ses tics sur la **fin** de l'aperçu, faute de quoi « 1 » resterait affiché après que les cartes se sont cachées, ou les cartes se cacheraient sur « 2 ». `getMemoryConfigErrors` accepte un `previewSeconds` fini ≥ 0, pas forcément entier ([FEAT-09 §5](./FEAT-09.md#5-décisions-dimplémentation-session-de-cadrage)) : la configuration jouée reste valide pour le moteur ; le catalogue, lui, garde des entiers.
* **Pas de montée de version du schéma, et ce que font les versions antérieures** : l'absence de `gameSettings` n'est **pas une perte** ; sinon, au premier lancement après la mise à jour, chaque sauvegarde existante serait copiée dans `BACKUP_STORAGE_KEY` et journalisée comme endommagée. Une version de Mia antérieure à FEAT-19 charge ou importe sans broncher une sauvegarde qui contient `gameSettings` (même `schemaVersion`, champ inconnu retiré, progression intacte) ; une v2 aurait fait refuser ces fichiers (« version plus récente ») aux anciens APK.
* **JS de la route `/settings` léger** : le libellé « Memory » du bloc est un **littéral** de l'écran, pas `GAME_REGISTRY.memory.title` : importer le registre embarquerait les deux catalogues (et, par le barrel de Memory, les composants du plateau) dans le JS de l'écran Réglages, de même que `SETTINGS_PATH` vit dans `labels.ts` pour ne pas embarquer l'écran dans le Hub ([FEAT-18 §6](./FEAT-18.md#6-décisions-dimplémentation-session-de-cadrage)). `settings.ts` n'importe aucun composant.
* **Section conditionnelle et zones D-Pad** : les hooks `useGridNavigation` des deux groupes doivent être déclarés inconditionnellement (`isActive` faux sans profil actif) ; l'enchaînement Contraste ↔ Sauvegarde se branche selon la présence du profil actif, et le curseur ne doit jamais rester sur une zone de la section « Jeux » si le profil actif disparaît (import d'une sauvegarde sans profil actif sans passer par le focus DOM, profil supprimé par un autre onglet) : la zone active est **dérivée au rendu** (`zone`) et retombe sur Contraste dans ce cas, plutôt que corrigée après coup par un effet.
* **Changement de facteur pendant une partie** : la minuterie de l'aperçu lit `game.config.previewSeconds` (la configuration de la création de la partie), comme le compte à rebours du HUD ; si le profil actif change pendant l'aperçu (choix du joueur imposé par `ProfileGate` au-dessus du plateau, autre onglet), la partie en cours garde sa durée et le nouveau facteur vaut pour la partie suivante (Recommencer, étoile suivante). Le délai d'une erreur, lui, suit les réglages courants : il n'est affiché nulle part.
* **Réglages par profil, pas par appareil** : un changement de joueur (Hub, `ProfileSelectorModal`) change les valeurs affichées par la section et jouées par le plateau ; `DeviceSettings` ne porte rien de FEAT-19.

---

## 5. Critères d'Acceptation (Definition of Done)

- [x] Les deux réglages de Memory sont modifiables au doigt et à la télécommande (`Flèches` + `OK` + `Retour`) depuis la section « Jeux » de `/settings`, persistent après rechargement et sont propres à chaque profil (changer de joueur change les valeurs affichées et jouées).
- [x] Sur le plateau, l'aperçu d'une étoile dure `previewSeconds × previewFactor` (5 s → 2,5 s, 5 s, 7,5 s ou 10 s ; une étoile sans aperçu n'en gagne pas), les cartes d'une erreur restent visibles `900 ms × mismatchFactor` (450 à 1 800 ms) et le compte à rebours affiche des secondes entières alignées sur la fin de l'aperçu.
- [x] La progression est inchangée : étoiles et couronnes gagnées normalement quel que soit le réglage, rien de plus enregistré par victoire.
- [x] Une sauvegarde antérieure à FEAT-19 (sans `gameSettings`) se charge avec les valeurs par défaut, sans perte signalée ni copie de secours ; une valeur invalide est réparée champ par champ avec un message ; export puis import conservent les réglages de chaque profil.
- [x] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur, seuils de couverture inchangés.
- [x] Si un commit est créé, il respecte le format **Conventional Commits** (ex: `feat(settings): add per-profile memory time settings`).

---

## 6. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation, avec leurs motivations et les alternatives écartées.

| Sujet | Décision |
| :--- | :--- |
| **Sémantique** | Une **couche d'assistance** au-dessus du catalogue : chaque profil porte des **facteurs de temps** appliqués aux valeurs du niveau (`previewFactor` × `previewSeconds` ; `mismatchFactor` × `MISMATCH_DELAY_MS`, 900 ms dans `MemoryBoard.tsx`). `0` reste `0` : une étoile conçue sans aperçu (« Sans aperçu », `mem-003`) n'en gagne jamais. Le délai d'un groupe trouvé (350 ms) et l'indicateur de permutation ne bougent pas. Écartés : une **valeur absolue** qui remplacerait celle du niveau (aplatit la courbe du catalogue et réécrit en silence les étoiles sans aperçu) ; un **mode libre** (éditeur de niveau : périmètre bien plus vaste). |
| **Progression** | Inchangée : étoiles et couronnes se gagnent normalement avec n'importe quel réglage, rien de plus n'est enregistré par victoire. Les réglages sont une **accommodation** (enfants, grands-parents), pas un niveau de difficulté. Écartés : couronne réservée aux réglages par défaut ; mode entraînement sans enregistrement. |
| **Propriété** | **Par profil** (`UserProfile.gameSettings`), pas par appareil : un grand-parent et un enfant qui partagent la TV du salon gardent chacun leur rythme, et les réglages voyagent avec le profil à l'export / import. Les réglages de l'appareil (`DeviceSettings`) restent partagés et conservés à l'import, comme avant. |
| **Périmètre v1** | Memory seulement, deux réglages (temps de mémorisation, temps d'affichage des erreurs). Structure générique dès maintenant : `ProfileGameSettings` indexé par jeu, pour que Traffic Jam s'y branche plus tard ; aucun bloc Traffic Jam pour l'instant. |
| **Base du catalogue** | Les huit étoiles avec aperçu (`mem-001`, `mem-002`, `mem-015`, `mem-018` à 3 s ; `mem-004`, `mem-006`, `mem-009`, `mem-010` à 2 s) passent à une base **uniforme de 5 s** ; les douze autres restent à `0`. Le catalogue reste la source de vérité (une étoile future peut avoir une autre base). Écartés : garder 3 s / 2 s (× 0,5 de 2 s = 1 s, illisible) ; faire porter les secondes par le réglage (le catalogue ne pourrait plus ajuster une étoile). |
| **Commandes** | Deux commandes **indépendantes** partageant la liste de pas × 0,5 / × 1 / × 1,5 / × 2 (`TIME_FACTORS` dans `src/types/mia.ts`, type `TimeFactor`). Écartés : un facteur « rythme » unique (couple deux besoins différents) ; un curseur (maladroit au D-Pad, demi-pas invisibles dans un compte à rebours en secondes entières). |
| **Emplacement** | Section **« Jeux »** de l'écran Réglages existant (`/settings`, FEAT-18), entre « Appareil » et « Sauvegarde », rendue seulement avec un profil actif : avatar du profil et « Réglages de {prénom} », note indiquant que ces réglages suivent le joueur ; bloc « Memory » à deux groupes radio (balisage du sélecteur « Mode TV » : `role="radiogroup"`, `FocusableButton role="radio"`, option en vigueur `primary` avec coche) : « Temps de mémorisation » et « Temps d'affichage des erreurs », avec les notes du §3.5. Écartés : une modale sur la Carte des Étoiles de Memory ; une commande en jeu dans le HUD. |
| **Libellés** | Options 0,5 → « Court », 1 → « Normal », 1,5 → « Long », 2 → « Très long », facteur affiché sous le libellé « × 0,5 » (`formatTimeFactor` dans `src/components/settings/labels.ts`, table exhaustive sur `TimeFactor`), options `TIME_FACTOR_OPTIONS`, textes `GAME_SETTINGS_TEXTS`, en-tête `describeProfileSettings` (« Réglages de Léo »). Le facteur est un texte visible, donc annoncé : le nom accessible d'une option est « Long × 1,5 ». Le titre du bloc, « Memory », est un littéral (pas le registre des jeux : JS de la route maintenu léger, [§4](#4-points-dattention)) ; un test vérifie qu'il reste égal à `GAME_REGISTRY.memory.title`. |
| **D-Pad** | Enchaînement : en-tête → mode TV → son → contraste → mémorisation (1 × 4) → erreurs (1 × 4) → sauvegarde ; l'arrivée dans un groupe pose le curseur sur l'option en vigueur ; Haut depuis le panneau de sauvegarde revient sur le groupe des erreurs (sur le contraste sans profil actif). |
| **Modèle de données** | `TIME_FACTORS = [0.5, 1, 1.5, 2]`, `MemoryGameSettings { previewFactor; mismatchFactor }`, `ProfileGameSettings { memory }`, `UserProfile.gameSettings` **obligatoire et toujours complet**. Défauts `DEFAULT_MEMORY_GAME_SETTINGS` (× 1, × 1) et `createDefaultGameSettings()` (nouvel objet à chaque appel) dans `src/core/storage/default-state.ts` ; `addProfile` les pose. Mise à jour pure `updateMemorySettings(state, profileId, partial)` dans `src/core/storage/profile-manager.ts` (renvoie `state` lui-même quand rien ne change), appliquée par l'écran via `updateState`. |
| **Compatibilité** | **Aucune montée de version du schéma** (changement additif) : une sauvegarde antérieure à FEAT-19 (sans `gameSettings`) se charge avec les défauts et **sans perte signalée** (ni copie de secours, ni message) ; une valeur présente mais invalide est réparée champ par champ avec un message (« réglage Memory « previewFactor » du profil « p1 » invalide, valeur par défaut »), comme les réglages de l'appareil (`sanitizeGameSettings`, `sanitizeMemorySettings` dans `migrations.ts`). Une version antérieure de Mia qui importe une sauvegarde plus récente retire simplement le champ inconnu. |
| **Côté jeu** | `src/games/memory/settings.ts` (pur, sans React) : `applyMemorySettings(config, settings)` (configuration jouée, `previewSeconds` multiplié, même objet quand rien ne change) et `getMismatchDelayMs(baseDelayMs, settings)`. `MemoryBoard` lit `useMiaStorage().activeProfile?.gameSettings.memory` (défauts sans profil), joue la configuration dérivée (HUD, modale de fin, minuteries) et utilise le délai d'erreur multiplié. |
| **Compte à rebours** | `PreviewCountdown` (`MemoryHud.tsx`) aligné sur la **fin** de l'aperçu : affiche `ceil(restant)`, premier tic après la partie fractionnaire puis chaque seconde, jamais sous 1 (2,5 s → « 3 » pendant 0,5 s, « 2 », « 1 » ; 5 s → 5, 4, 3, 2, 1, inchangé). |
| **Tests** | `tests/memory-settings.test.ts` (nouveau, fonctions pures) ; `tests/memory-board.test.tsx` (facteurs appliqués : 2,5 s, 10 s, 0 reste 0, 1 800 ms, 450 ms, sans profil) ; `tests/memory-catalog.test.ts` (5 s sur les huit étoiles) ; `tests/settings-screen.test.tsx` (section, persistance par profil, enchaînement D-Pad, libellés) ; `tests/storage.test.tsx` (réparation et export / import de `gameSettings`) ; `tests/profile-manager.test.ts` (défauts d'`addProfile`, `updateMemorySettings`). Seuils de couverture inchangés. |
| **Non vérifié** | Recette sur un vrai Android TV et dans l'APK (lisibilité des quatre options à la télécommande) : à faire avec FEAT-15. |
| **Git** | Commit suggéré : `feat(settings): add per-profile memory time settings` (scope `settings` existant dans `commitlint.config.mjs`). |
