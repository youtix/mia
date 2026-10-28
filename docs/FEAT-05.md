# FEAT-05 : Service de Stockage Local Résilient & Versionné (`StorageService`)

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-05`
> **Dépendances** : [FEAT-01](./FEAT-01.md), [FEAT-02](./FEAT-02.md)

---

## 1. Contexte & Objectif pour l'IA

L'application **Mia** est **100% gratuite et sans serveur backend**. Toutes les données des joueurs (profils familiaux, progression des étoiles, meilleurs scores, paramètres) sont stockées localement sur l'appareil (Smartphone, Tablette, Android TV ou Navigateur Web).

L'objectif de cette **FEAT-05** est d'implémenter dans `src/core/storage/` un service de persistance robuste utilisant **`@capacitor/preferences`** (qui écrit dans les `SharedPreferences` natives d'Android sur l'APK) avec un **fallback synchrone sur `localStorage`** pour le Web, un **système de migration de schéma**, et des fonctions d'**export/import JSON** de sauvegarde.

---

## 2. Fichiers à Créer / Modifier

```text
src/
├── app/
│   └── layout.tsx                     # Script inline du mode TV dans <head> + suppressHydrationWarning (§3.4)
├── types/
│   └── mia.ts                         # Enrichir avec MiaSaveState, UserProfile, GameProgress, LevelCompletion
└── core/
    └── storage/
        ├── default-state.ts           # État initial par défaut et constantes
        ├── migrations.ts              # Validation et migration de schéma (résilience JSON corrompu)
        ├── storage-service.ts         # Classe/module StorageService (Load, Save, Export, Import)
        ├── tv-mode.ts                 # data-tv : application du réglage et script inline d'avant hydratation
        ├── StorageContext.tsx         # Provider React exposant l'état sauvegardé et les mutateurs
        └── index.ts                   # Barrel export
tests/
└── storage.test.tsx                   # Tests unitaires complets (CRUD, corruption, migration, import/export)
```

---

## 3. Spécifications Techniques Détaillées

> Les décisions de la session de cadrage ([§5](#5-décisions-dimplémentation-session-de-cadrage)) précisent ces spécifications : stockage par plateforme (`localStorage` seul sur le Web), écritures qui ne rejettent jamais, réparation granulaire et copie de secours, sauvegardes d'une version plus récente, import qui conserve les réglages de l'appareil, `importBackup` → `ImportResult`, synchronisation entre onglets.

### 3.1. Schéma de Données Exact (`src/types/mia.ts`)
Ajoute les interfaces suivantes dans `src/types/mia.ts` :
```typescript
export interface DeviceSettings {
  soundEnabled: boolean;
  highContrastMode: boolean;
  tvModeOverride: 'auto' | 'always_tv' | 'always_touch';
}

export interface LevelCompletion {
  levelId: string;
  completed: boolean;
  isPerfect: boolean;
  bestMoves: number;
  bestTimeSeconds: number;
  timesPlayed: number;
  completedAt: string;
}

export interface GameProgress {
  gameId: GameId;
  /** Dictionnaire indexé par levelId immuable (ex: "mem-001", "tj-005") */
  levels: Record<string, LevelCompletion>;
  lastPlayedLevelId: string | null;
}

export interface UserProfile {
  id: string;
  name: string;
  avatarId: string;
  createdAt: string;
  gamesProgress: Record<string, GameProgress>;
}

export interface MiaSaveState {
  schemaVersion: 1;
  activeProfileId: string | null;
  profiles: UserProfile[];
  settings: DeviceSettings;
}
```

### 3.2. Clé de Stockage & Persistance (`src/core/storage/storage-service.ts`)
* Clé unique de stockage : `STORAGE_KEY = 'mia_save_state_v1'`.
* **Lecture (`loadSaveState(): Promise<MiaSaveState>`)** :
  1. Tente de lire depuis `@capacitor/preferences` (`Preferences.get({ key: STORAGE_KEY })`).
  2. Si vide, tente de lire depuis `window.localStorage.getItem(STORAGE_KEY)`.
  3. Passe la chaîne JSON dans `parseAndMigrateSaveState(raw)` : si la chaîne est absente ou malformée (JSON invalide), ne lance **jamais** d'exception non gérée et retourne proprement `createDefaultSaveState()`.
* **Écriture (`saveState(state: MiaSaveState): Promise<void>`)** :
  1. Sérialise `state` en JSON.
  2. Écrit dans `window.localStorage` (pour un accès synchrone immédiat) **ET** dans `@capacitor/preferences` (`Preferences.set`).
* **Demande de stockage persistant navigateur** :
  * Au premier chargement côté client, appelle `void navigator.storage?.persist?.()` en arrière-plan pour éviter l'éviction du cache PWA.
* **Export / Import (`exportSaveJson(state)` / `importSaveJson(jsonString)`)** :
  * `importSaveJson` vérifie que le JSON fourni contient bien un tableau `profiles` valide et un objet `settings`, applique `parseAndMigrateSaveState`, sauvegarde le tout et retourne le nouvel état (ou lève une erreur explicite si le fichier importé n'est pas une sauvegarde Mia).

### 3.3. Provider React (`src/core/storage/StorageContext.tsx`)
Expose via le hook `useMiaStorage()` :
* `state: MiaSaveState`
* `isLoaded: boolean`
* `activeProfile: UserProfile | null`
* `updateState: (updater: (prev: MiaSaveState) => MiaSaveState) => Promise<void>`
* `updateSettings: (partial: Partial<DeviceSettings>) => Promise<void>`
* `resetAllData: () => Promise<void>`
* `exportBackup: () => string`
* `importBackup: (json: string) => Promise<boolean>`

### 3.4. Mode TV du Design System ([FEAT-03 §5](./FEAT-03.md#5-décisions-dimplémentation-session-de-cadrage))
* Refléter `settings.tvModeOverride` sur `<html>` : `'always_tv'` → `data-tv="on"`, `'always_touch'` → `data-tv="off"`, `'auto'` → retirer l'attribut (détection CSS `(hover: none) and (pointer: none)`).
* Le poser au plus tôt (idéalement avant l'hydratation, par exemple via un court script inline lisant le miroir `localStorage`) : le mode TV change les marges, l'écran sauterait sinon au démarrage.

---

## 4. Critères d'Acceptation (Definition of Done)

- [ ] `tests/storage.test.ts` valide l'initialisation à vide, la persistance, la résilience face à un JSON corrompu, et l'export/import JSON avec une couverture `>= 80%`.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(storage): add local storage service with schema migration`).

---

## 5. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Stockage par plateforme** | Natif (`Capacitor.isNativePlatform()`) : `@capacitor/preferences` (SharedPreferences) est la source de vérité, `localStorage` un miroir lu par le script inline du mode TV. Web : `localStorage` seul. Sur le Web, `Preferences` n'est qu'un `localStorage` préfixé `CapacitorStorage.` : double copie, chunk chargé à la demande, et clé exposée au `Preferences.clear()` de toute application Capacitor de l'origine partagée `youtix.github.io`. Lecture native : Preferences, puis le miroir si vide ou en échec ; un miroir différent est réparé. Écriture native : Preferences **puis** miroir (un arrêt entre les deux laisse la source de vérité à jour). Clé `mia_save_state_v1` définitive : le format évolue par `schemaVersion`. |
| **Échecs d'écriture** | `saveState` / `updateState` ne rejettent jamais : chaque support est tenté indépendamment, l'échec (quota, stockage bloqué, pont natif, état non sérialisable) est journalisé (`console.warn`) et l'état en mémoire garde la modification : la partie continue. Sur natif, un échec du seul miroir est sans conséquence. |
| **Validation** | Sauvegarde absente ou vide → état par défaut, sans perte ; JSON illisible ou non-objet → état par défaut. Sinon, réparation granulaire, sans valeur inventée : sont écartés un niveau invalide (booléens, nombres finis ≥ 0, `completedAt` texte ; `Infinity` devient `null` en JSON), une progression non-objet ou d'un jeu hors `GameId`, un profil invalide (`id` non vide, `name` / `avatarId` / `createdAt` texte ; `id` en double : le premier gagne). Conteneurs illisibles (`profiles`, `gamesProgress`, `levels`) → vides ; réglages réparés champ par champ (`DEFAULT_DEVICE_SETTINGS`) ; `activeProfileId` / `lastPlayedLevelId` invalides → `null` ; `gameId` / `levelId` réalignés sur leur clé ; champs inconnus retirés (sans perte signalée). Dictionnaires reconstruits par `Object.fromEntries` : une clé `__proto__` reste inoffensive. |
| **Copie de secours** | Toute lecture avec pertes (illisible, entrée écartée, champ réparé, version plus récente) copie la chaîne brute dans `mia_save_state_v1_backup` (mêmes supports, un seul emplacement, écrasé à la prochaine lecture avec pertes) et journalise les pertes. Aucune interface : un correctif peut la restaurer par une migration. Aucune autre écriture au chargement. |
| **Versions & migrations** | `MIGRATIONS[n]` transforme vN en vN+1 (vide en v1) via `migrateSaveData` ; registre injectable (`ParseOptions.migrations`) pour tester une migration. `schemaVersion` absente ou invalide → lue comme v1 (avec pertes). Version **plus récente** (retour à un APK antérieur, sauvegarde d'un autre appareil) : chargement au mieux comme version courante (avec pertes, donc copie de secours) ; import refusé (`newer_version`). Migration manquante ou en échec → état par défaut (avec pertes). |
| **Import / export** | `exportSaveJson` : état complet, JSON indenté (2 espaces). `parseBackupJson` (pur) : JSON (BOM retiré) → objet avec `schemaVersion` entière ≤ version courante → migrations → tableau `profiles` et objet `settings` → réparation granulaire ; un tableau `profiles` non vide sans profil valide est refusé. L'import remplace `profiles` et `activeProfileId` et **conserve les réglages de l'appareil** (`DeviceSettings` : un `always_touch` venu d'une tablette retirerait les marges TV du salon, sans écran pour le corriger). `importSaveJson` (service, hors React) lève `SaveImportError` (`reason`, message français). |
| **API du Provider** | §3.3, sauf **`importBackup(json): Promise<ImportResult>`** = `{ ok: true } \| { ok: false; reason; message }` (`reason` : `invalid_json`, `not_a_mia_save`, `newer_version`, `no_valid_profile` ; `message` français prêt à afficher, `IMPORT_FAILURE_MESSAGES`). Store externe (`useSyncExternalStore`) : état par défaut et `isLoaded: false` au pré-rendu et au premier rendu. Les mutateurs (références stables) attendent la fin du chargement initial et s'appliquent sur le dernier état dans l'ordre des appels ; les écritures sont sérialisées ; un `updater` qui renvoie `prev` n'écrit rien. `updateSettings` fusionne les champs définis. `resetAllData` écrit l'état par défaut (réglages compris). `useMiaStorage()` hors `StorageProvider` lève une erreur. |
| **Onglets (Web)** | Événement `storage` : une écriture de `mia_save_state_v1` dans un autre onglet recharge l'état (même analyse, sans copie de secours) ; clé supprimée ou `localStorage.clear()` → état par défaut. Éditions simultanées : le dernier écrivain gagne, mais un onglet périmé n'écrase plus une progression plus récente. Une écriture reçue pendant le chargement initial l'emporte sur lui. |
| **Stockage persistant** | `requestPersistentStorage()` appelé au montage du Provider : Web uniquement, à chaque démarrage, ignoré si `navigator.storage.persisted()` vaut déjà `true` (Chromium décide en silence et peut accorder plus tard ; Firefox peut afficher une demande). Jamais sur natif (SharedPreferences). |
| **Mode TV** | `tv-mode.ts` : `applyTvModeOverride` (`always_tv` → `data-tv="on"`, `always_touch` → `"off"`, `auto` → attribut retiré), appliqué par le Provider une fois la sauvegarde chargée puis à chaque changement (avant, l'attribut posé par le script reste en place). `TV_MODE_BOOTSTRAP_SCRIPT` : script inline autonome en ES5 (`try/catch`, valeurs connues uniquement) qui lit le miroir `localStorage` et pose `data-tv` avant le premier rendu ; `<script>` brut dans le `<head>` de `layout.tsx`, plutôt que `next/script` `beforeInteractive`, dont le moment d'exécution est moins déterministe dans l'App Router. `<html suppressHydrationWarning>` : l'attribut change avant l'hydratation. `layout.tsx` importe le script depuis `@/core/storage/tv-mode`, pas depuis le barrel : un composant serveur qui importe le barrel embarque dans le JS client chaque module `'use client'` réexporté (`StorageContext` et Capacitor, ~23 Ko), même non rendu (constaté sur `next build`). |
| **Types** | Interfaces de §3.1 dans `src/types/mia.ts`, plus l'alias `TvModeOverride`. `DEFAULT_DEVICE_SETTINGS` : son activé, contraste standard, mode TV `auto`. `createDefaultSaveState()` : aucun profil, `activeProfileId: null` (FEAT-06 crée « Joueur 1 »). |
| **Périmètre** | `src/app/layout.tsx` : script inline et `suppressHydrationWarning` seulement ; FEAT-08 monte `StorageProvider` (chargement, `persist()`, synchronisation des onglets et de `data-tv` inactifs d'ici là). `tv-mode.ts` et `layout.tsx` ajoutés à l'arborescence §2 ; `src/core/storage/.gitkeep` supprimé. Aucun écran de réglages ni bouton de sauvegarde n'est prévu par FEAT-06 à FEAT-17 : voir [FEAT-18](./FEAT-18.md) (brouillon). |
| **Tests** | `tests/storage.test.tsx` (JSX, comme FEAT-04) au lieu de `storage.test.ts`. `@capacitor/core` et `@capacitor/preferences` simulés (`vi.mock`) pour les chemins Web et natif ; le script inline est exécuté par jsdom (`runScripts: 'dangerously'`, défaut de Vitest). |
| **Contrats aval** | Notes ajoutées dans [FEAT-06 §3.2](./FEAT-06.md), [FEAT-07 §3.2](./FEAT-07.md), [FEAT-08 §4.1](./FEAT-08.md) et [FEAT-15 §3.5](./FEAT-15.md) ; nouvelle [FEAT-18](./FEAT-18.md) ajoutée à la [SPECIFICATION](./SPECIFICATION.md). |
| **Git** | Branche `feat/storage` depuis `main`, commit `feat(storage): add local storage service with schema migration`. |
