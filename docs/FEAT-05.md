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
├── types/
│   └── mia.ts                         # Enrichir avec MiaSaveState, UserProfile, GameProgress, LevelCompletion
└── core/
    └── storage/
        ├── default-state.ts           # État initial par défaut et constantes
        ├── migrations.ts              # Validation et migration de schéma (résilience JSON corrompu)
        ├── storage-service.ts         # Classe/module StorageService (Load, Save, Export, Import)
        ├── StorageContext.tsx         # Provider React exposant l'état sauvegardé et les mutateurs
        └── index.ts                   # Barrel export
tests/
└── storage.test.ts                    # Tests unitaires complets (CRUD, corruption, migration, import/export)
```

---

## 3. Spécifications Techniques Détaillées

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
