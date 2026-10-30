# FEAT-20 : Mises à jour de la PWA, Réparation & Écran d'Erreur

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-20`
> **Dépendances** : [FEAT-04](./FEAT-04.md), [FEAT-08](./FEAT-08.md), [FEAT-17](./FEAT-17.md), [FEAT-18](./FEAT-18.md)
> **Statut** : cadrée et implémentée ; les décisions prises pendant la session de cadrage sont consignées au [§6](#6-décisions-dimplémentation-session-de-cadrage).

---

## 1. Contexte & Objectif pour l'IA

Une nouvelle version déployée n'atteignait jamais une PWA installée. Le service worker de [FEAT-17](./FEAT-17.md) sert les pages **cache d'abord** et n'appelle jamais `skipWaiting()` : une fois téléchargée, la nouvelle version attend et ne prend la main que lorsque **toutes** les fenêtres de Mia sont fermées. Un rechargement ne compte pas, car la page rechargée garde l'ancien worker en vie. Or une PWA installée sur un téléphone ou une tablette est rarement fermée pour de bon, et une application reprise de l'arrière-plan ne cherche pas de mise à jour : le navigateur ne cherche un nouveau `sw.js` qu'au chargement d'une page. Aucun écran n'affichait non plus le numéro de version : impossible de savoir ce qui tournait sur un appareil. Une vérification en direct du site déployé a confirmé que le déploiement lui-même était sain (les 59 URLs pré-cachées répondaient toutes 200) : le défaut était côté client, pas côté hébergement.

L'objectif de cette **FEAT-20** est de faire arriver les mises à jour jusqu'au joueur et de lui donner une issue quand l'application se comporte mal, sans jamais toucher à sa sauvegarde :
1. **Mise à jour proposée** : dès qu'une nouvelle version est entièrement téléchargée, une **bannière du Hub** ([FEAT-08](./FEAT-08.md)) la propose ; un appui active le nouveau service worker et recharge toutes les pages ouvertes. Le worker n'appelle toujours pas `skipWaiting()` de lui-même.
2. **Détection** : une recherche au lancement et à chaque retour au premier plan, au plus une par minute.
3. **Section « Application »** de l'écran Réglages ([FEAT-18](./FEAT-18.md)) : numéro de version, recherche de mise à jour à la demande et **réparation** (désinscrit le service worker de Mia, supprime ses caches, recharge depuis le réseau).
4. **Écran d'erreur global** : un plantage propose « Recharger » et, là où un service worker peut exister, « Réparer l’application », au lieu de la page d'erreur par défaut de Next.js, qui ne laissait aucune issue au joueur (pas d'accès aux Réglages).

Le périmètre est la **PWA**. L'APK embarque ses assets et n'enregistre aucun service worker ([FEAT-17 §2](./FEAT-17.md)) : il n'a pas ce problème de cache, garde ses mises à jour par F-Droid ou GitHub Releases et affiche seulement son numéro de version dans les Réglages.

---

## 2. Fichiers à Créer / Modifier

```text
next.config.ts                         # env.NEXT_PUBLIC_APP_VERSION : version de package.json
vitest.config.ts                       # coverage.exclude : src/app/global-error.tsx (enveloppe qui rend <html>, comme layout.tsx)
src/
├── app/
│   └── global-error.tsx               # Nouveau : écran d'erreur global (document propre, NavigationProvider, CrashScreen)
├── core/
│   ├── navigation/
│   │   ├── useAndroidBackButton.ts    # useAndroidBackExit() : Retour physique sur l'écran d'erreur
│   │   └── index.ts                   # Exporte useAndroidBackExit
│   └── pwa/
│       ├── precache.ts                # SKIP_WAITING_MESSAGE, RESTORE_PRECACHE_MESSAGE : messages de la page aux workers
│       ├── appUpdate.ts               # Nouveau : createAppUpdateController(), appUpdate, repairApp(), getAppVersion(), FOREGROUND_CHECK_INTERVAL_MS
│       ├── useAppUpdateStatus.ts      # Nouveau : hook (useSyncExternalStore) sur appUpdate
│       ├── reloadPage.ts              # Nouveau : reloadPage(), reloadToHub(), isolés pour être simulés dans les tests
│       ├── registerServiceWorker.ts   # readServiceWorkerEnvironment(), deletePrecaches() : partagés avec appUpdate
│       ├── ServiceWorkerRegistrar.tsx # Démarre le suivi (appUpdate.start) une fois le worker enregistré
│       ├── index.ts                   # Exporte les nouveautés
│       └── sw/
│           └── service-worker.ts      # Gestionnaire `message` (skipWaiting(), restorePrecache()) ; precacheAll échoue si son cache a été purgé
└── components/
    ├── progression/
    │   ├── UpdateBanner.tsx           # Nouveau : bannière « nouvelle version disponible » du Hub, zone D-Pad `hub-update`
    │   ├── HubScreen.tsx              # Bannière en tête du Hub, enchaînement profil → bannière → cartes
    │   ├── labels.ts                  # UPDATE_BANNER_TEXTS
    │   └── index.ts                   # Barrel : UpdateBanner, UPDATE_BANNER_TEXTS
    ├── settings/
    │   ├── ApplicationSection.tsx     # Nouveau : section « Application » (version, mise à jour, réparation), zone `settings-application`
    │   ├── SettingsGroup.tsx          # Nouveau : SettingsGroup et SettingsFeedback, extraits de BackupPanel.tsx
    │   ├── SettingsSection.tsx        # Prop `ref` : la section que l'écran fait défiler
    │   ├── ConfirmActions.tsx         # Nouveau : boutons [Annuler] [Confirmer] d'une modale, extraits de BackupPanel.tsx
    │   ├── BackupPanel.tsx            # Utilise les composants extraits ; onExitDown : Bas depuis « Tout effacer »
    │   ├── SettingsScreen.tsx         # Section « Application » en dernier, zone chaînée sous la sauvegarde ; sans bouton, Bas la fait défiler
    │   ├── labels.ts                  # APPLICATION_TEXTS, describeAppVersion(), describeAppUpdate()
    │   └── index.ts                   # Barrel : section, composants extraits, textes
    └── ui/
        └── CrashScreen.tsx            # Nouveau : écran d'erreur (Recharger, Réparer l’application), CRASH_SCREEN_TEXTS
tests/
├── pwa-update.test.ts                 # Nouveau : contrôleur de mise à jour, repairApp, version injectée par next.config.ts
├── pwa-service-worker.test.ts         # Gestionnaire `message` du worker, pré-cache purgé pendant le téléchargement
├── pwa-register.test.ts               # Démarrage du suivi par le registrar, readServiceWorkerEnvironment, deletePrecaches
├── android-back-button.test.tsx       # useAndroidBackExit
├── hub-update-banner.test.tsx         # Nouveau : bannière du Hub (visibilité, activation, enchaînement D-Pad)
├── settings-application.test.tsx      # Nouveau : section « Application » (version, recherche, mise à jour, réparation, D-Pad)
├── settings-screen.test.tsx           # Quatrième section de l'écran
├── quality-setup.test.ts              # coverage.exclude figé : + src/app/global-error.tsx
└── crash-screen.test.tsx              # Nouveau : écran d'erreur (Recharger, Réparer, Retour Android)
docs/
├── FEAT-20.md                         # Ce document
├── SPECIFICATION.md                   # §5 (graphe), §6 (liste et section FEAT-20)
└── FEAT-17.md                         # Renvois : bannière hors périmètre, skipWaiting, gestionnaire message
README.md                              # Installation de la PWA et de l'APK, fonctionnalités, release, arborescence
```

---

## 3. Spécifications

> Les décisions de la session de cadrage ([§6](#6-décisions-dimplémentation-session-de-cadrage)) donnent les motivations de ces spécifications et les alternatives écartées.

### 3.1. Activation à la demande du joueur (`src/core/pwa/sw/service-worker.ts`, `precache.ts`)

* `SKIP_WAITING_MESSAGE` (`'mia-skip-waiting'`) et `RESTORE_PRECACHE_MESSAGE` (`'mia-restore-precache'`, §3.7) sont exportés par `precache.ts`, le module pur déjà partagé par la page, le worker, le script de build et les tests : les deux côtés d'un message ne peuvent pas diverger.
* Le worker gère l'événement `message` : si `event.data === SKIP_WAITING_MESSAGE`, `event.waitUntil(self.skipWaiting())` ; si `event.data === RESTORE_PRECACHE_MESSAGE`, `event.waitUntil(restorePrecache())` ; tout autre message est ignoré.
* **`install` n'appelle toujours jamais `skipWaiting()`** : la contrainte 6 de [FEAT-17 §2](./FEAT-17.md) reste vraie. Une version prête s'active donc soit quand toutes les fenêtres de Mia sont fermées (comme avant), soit **à la demande du joueur** (nouveau).
* `activate` est inchangé : purge des caches `mia-precache-*` des autres versions, puis `clients.claim()`. L'activation d'un nouveau worker déclenche `controllerchange` dans chaque page contrôlée, que la page transforme en rechargement (§3.2).
* **Pré-cache purgé pendant son téléchargement** : cette purge touche aussi le cache d'un worker encore en téléchargement (une version acceptée alors qu'une troisième arrive), dont `addAll` remplit ensuite un objet orphelin. `precacheAll` le détecte (`caches.has`) et échoue : le worker devient `redundant` au lieu d'attendre sans cache, et la recherche qui suit le rechargement le retélécharge.

### 3.2. Suivi de la mise à jour (`src/core/pwa/appUpdate.ts`)

```typescript
/** Où en est la mise à jour de la PWA */
export type AppUpdateStatus = 'unsupported' | 'idle' | 'downloading' | 'ready';
/** Issue d'une recherche : `found` couvre le téléchargement en cours comme la version déjà prête */
export type AppUpdateCheckResult = 'up-to-date' | 'found' | 'unreachable';
/** Issue d'une réparation : `unreachable` signifie que rien n'a été supprimé */
export type AppRepairResult = 'reloading' | 'unreachable';

/** Retour au premier plan : au plus une recherche par minute, chacune retélécharge `sw.js` */
export const FOREGROUND_CHECK_INTERVAL_MS = 60_000;

/** Version de Mia (`package.json`), injectée au build ; « inconnue » si elle manque */
export function getAppVersion(): string;

export interface AppUpdateController {
  subscribe: (listener: () => void) => () => void;
  getStatus: () => AppUpdateStatus;
  /** Suit l'inscription pour toute la vie de la page ; seul le premier appel compte */
  start: (registration: ServiceWorkerRegistration) => void;
  /** Cherche une nouvelle version ; `unreachable` si le réseau ou l'inscription manquent */
  check: () => Promise<AppUpdateCheckResult>;
  /** Active la version prête : la page se recharge au changement de worker, sinon sans effet */
  apply: () => void;
}

export function createAppUpdateController(): AppUpdateController;
/** Suivi unique de la page, démarré par `ServiceWorkerRegistrar` */
export const appUpdate: AppUpdateController;
export function repairApp(): Promise<AppRepairResult>; // §3.7
```

* **Statuts** :

  | Statut | Sens |
  | :--- | :--- |
  | `unsupported` | Rien à gérer : APK, développement ou navigateur sans service worker (`shouldRegisterServiceWorker` faux). C'est aussi le seul statut au pré-rendu statique (instantané serveur). |
  | `idle` | Aucune nouvelle version connue. Vaut aussi pour le tout premier worker (aucun worker actif) : il s'active seul, il n'y a rien à proposer. |
  | `downloading` | Un worker `installing` pré-cache en arrière-plan la nouvelle version. Si l'installation échoue (worker `redundant`), le statut retombe à `idle`. |
  | `ready` | Un worker `waiting` a pré-caché la nouvelle version en entier et attend l'accord du joueur. |

* **Lecture sur l'inscription** : à chaque `updatefound`, à chaque `statechange` d'un worker suivi (`installing`, `waiting`), à la fin de chaque recherche et au retour par le cache de navigation (`pageshow` avec `persisted`), le statut est relu sur `registration.active`, `waiting` et `installing`, et les abonnés ne sont prévenus que si la valeur change. Une page ouverte alors qu'une version attend déjà (téléchargée pendant une session précédente, jamais activée) affiche `ready` aussitôt.
* **`start(registration)`** : seul le premier appel compte (remontage, rechargement à chaud). Il branche `controllerchange` et le `statechange` du worker de la page (rechargement, ci-dessous), `updatefound` + `statechange`, `visibilitychange` et `pageshow`, lit l'état de l'inscription, lance la **recherche du lancement**, puis demande aux workers actif et en attente de vérifier leur pré-cache (§3.7).
* **`check()`** : `registration.update()` ; `unreachable` sans inscription ou si `update()` échoue (réseau coupé, `sw.js` injoignable) ; sinon `up-to-date` si le statut est `idle` après relecture, `found` s'il est `downloading` ou `ready`.
* **Retour au premier plan** : `visibilitychange` vers `visible` et dernière recherche vieille d'au moins `FOREGROUND_CHECK_INTERVAL_MS` → `check()`. Toute recherche (lancement, retour au premier plan, bouton des Réglages) remet le compteur à zéro. Une PWA reprise de l'arrière-plan ne recharge jamais sa page : sans cet écouteur, le navigateur ne chercherait rien.
* **`apply()`** : s'il existe un worker `waiting`, mémorise la demande (`isApplying`) et lui envoie `SKIP_WAITING_MESSAGE` ; sinon sans effet.
* **Rechargement au `controllerchange`** : la page retient le worker dont elle attend ses chunks (`pageWorker` : son contrôleur ou, sans contrôleur comme après un rechargement forcé, le worker actif) et se recharge (`reloadPage()`) dès qu'un autre prend la main, car les chunks de l'ancienne version disparaissent avec son cache, **une seule fois** (`isReloading`). Rien à recharger si elle n'avait **aucun worker au démarrage** (première visite : le premier worker appelle `clients.claim()`) ou si le worker retenu la réclame lui-même (§3.7), sauf si c'est elle qui a demandé la mise à jour (`isApplying`).
* **Worker de la page devenu `redundant`** → rechargement aussi. WebKit peut remplacer le worker pendant que la page dort dans le cache de navigation (bfcache) : à son retour, seul le `statechange` de ce worker le signale, juste après `pageshow`, où l'état lu est encore l'ancien, et `controllerchange` ne vient jamais (§4).
* **Retour par le cache de navigation** : `pageshow` avec `persisted` relit le statut, sans lancer de recherche. Les événements du worker ne suivent pas une page endormie : un Hub quitté par une navigation de document, puis retrouvé par Retour, restait sans bannière alors qu'une version attendait (constaté sous Firefox), jusqu'à la prochaine recherche.
* **Fabrique et singleton** : `createAppUpdateController()` renvoie un suivi neuf (état en fermeture, aucun effet de bord à l'import ni au pré-rendu) ; `appUpdate` est celui de la page, partagé par le Hub et les Réglages sans fournisseur React.

### 3.3. Hook, rechargement et démarrage (`useAppUpdateStatus.ts`, `reloadPage.ts`, `ServiceWorkerRegistrar.tsx`)

* `useAppUpdateStatus()` (`'use client'`) : `useSyncExternalStore(appUpdate.subscribe, appUpdate.getStatus, () => 'unsupported')`. L'instantané serveur vaut `unsupported` : au pré-rendu statique (aucun service worker côté serveur) et à l'hydratation, la bannière et les boutons de la section « Application » sont absents ; l'état réel s'affiche ensuite, sans erreur d'hydratation.
* `reloadPage()` : `window.location.reload()`, isolé dans son module parce que jsdom n'implémente pas la navigation (les tests le simulent). Utilisé par le suivi (changement de worker) et par la réparation. `reloadToHub()` : ``window.location.replace(`${basePath}/`)``, utilisé par « Recharger » de l'écran d'erreur (§3.8).
* `ServiceWorkerRegistrar` : quand `registerServiceWorker()` renvoie une inscription, appelle `appUpdate.start(registration)`, donc toujours après l'événement `load` ([FEAT-17 §4.4](./FEAT-17.md)). Hors production, dans l'APK ou sans service worker, `registerServiceWorker()` renvoie `null` : le suivi ne démarre pas.
* `registerServiceWorker.ts` : `readServiceWorkerEnvironment()` (environnement évalué à l'appel, partagé avec le suivi) et `deletePrecaches()` (suppression des seuls caches `mia-precache-*`, partagée avec `unregisterStaleServiceWorkers` et `repairApp`). Le barrel `src/core/pwa/index.ts` exporte les nouveautés.

### 3.4. Version affichée (`next.config.ts`)

* `next.config.ts` importe `version` de `package.json` et l'expose en `env.NEXT_PUBLIC_APP_VERSION` ; Next la fige dans le JS client au build (`getAppVersion()` renvoie « inconnue » si elle manque).
* semantic-release met `package.json` à jour (`@semantic-release/npm`) **avant** le build de l'APK (`prepareCmd`), et le job `deploy-pwa` compile l'export depuis le **tag** de release (FEAT-02) : l'APK et la PWA déployée affichent la version de leur release.

### 3.5. Bannière du Hub (`src/components/progression/UpdateBanner.tsx`, `HubScreen.tsx`)

* `UpdateBanner` ouvre le contenu du Hub, au-dessus des cartes des jeux, et n'est **affichée que si le statut est `ready`** (`useAppUpdateStatus`) : « Nouvelle version disponible », la note « Tes profils et tes étoiles sont conservés. » (liée au bouton par `aria-describedby`) et le bouton « Mettre à jour » (`UPDATE_BANNER_TEXTS`, `labels.ts`). **Aucun bouton de rejet.**
* Le bouton appelle `appUpdate.apply()` : le worker en attente exécute `skipWaiting()` (§3.1), puis `controllerchange` recharge la page (§3.2).
* **Annonce** : la région `role="status"` est toujours montée, vide tant qu'aucune version n'est prête, pour que l'arrivée du titre soit annoncée par les lecteurs d'écran.
* **D-Pad** : zone `hub-update` (1 × 1), active seulement quand la bannière est affichée. Chaîne : profil → bannière → dernière carte visitée ; première ligne de cartes → bannière → profil. Sans bannière, l'enchaînement de [FEAT-08](./FEAT-08.md) est inchangé (profil ↔ cartes). Bas depuis la bannière arrive sur la première action de la dernière carte visitée ; Gauche et Droite n'y font rien. **L'arrivée de la bannière ne déplace jamais le curseur** (ni au D-Pad, ni au toucher) : elle prend sa place dans la chaîne, le curseur reste où il est, et un Hub monté avec une version déjà prête démarre sur la carte comme avant.
* **Disparition sous le curseur** : une fois la version activée, la bannière disparaît juste avant le rechargement. La zone active est **dérivée au rendu** : si elle est « bannière » alors que la bannière n'est plus affichée, elle retombe sur la dernière carte visitée (le profil sans jeu), et l'état suit, sans effet correctif, pour que la bannière ne reprenne pas le curseur en revenant.

### 3.6. Section « Application » de l'écran Réglages (`src/components/settings/ApplicationSection.tsx`)

* **Section** `SettingsSection` « Application » (icône `AppWindow`), la **dernière** de l'écran, après « Sauvegarde ». Elle affiche toujours le numéro de version (« Version 0.12.0 », `describeAppVersion(getAppVersion())`).
* **Sans service worker** (`unsupported` : APK, développement, navigateur sans service worker), elle s'arrête là : ni bouton, ni zone D-Pad. Bas depuis « Tout effacer » la fait alors défiler (`scrollIntoView`), seul moyen de voir le numéro de version à la télécommande, le curseur restant sur « Tout effacer ».
* **Avec un service worker**, deux `SettingsGroup` (groupes `role="group"` nommés et décrits, comme ceux de la sauvegarde) :
  * **« Mises à jour »** : un seul bouton, dont le rôle suit l'état. « Rechercher une mise à jour » (secondaire) lance `appUpdate.check()` ; quand le statut est `ready`, le même bouton devient « Mettre à jour » (principal) et appelle `appUpdate.apply()`. Le curseur D-Pad reste dessus quand son rôle change, et un appui pendant une recherche est ignoré (le bouton n'est pas `disabled`, ce qui lui ferait perdre le focus). Une ligne d'état (`SettingsFeedback`, région `role="status"`, erreurs en `role="alert"`) annonce ce qui se passe : « Recherche en cours… », « Mia est à jour. », « Recherche impossible : vérifie ta connexion. », « Téléchargement de la nouvelle version… » (`downloading`), « Une nouvelle version est prête. Tes profils et tes étoiles sont conservés. » (`ready`), « Le téléchargement a échoué. Réessaie plus tard. » (recherche `found`, mais le statut est retombé à `idle` sans version prête). Ce qui se passe maintenant l'emporte sur l'issue de la dernière recherche (`describeAppUpdate`).
  * **« Réparer »** : bouton « Réparer l’application » → `ModalDialog` « Réparer Mia ? » (retéléchargement depuis Internet puis redémarrage, profils, étoiles et réglages conservés) avec `ConfirmActions` [Annuler] [Réparer], curseur sur Annuler. Confirmer appelle `repairApp()` (§3.7). Une seule réparation par confirmation : la modale se ferme **avant** l'appel et la demande est consommée avant l'`await` (même mécanisme que l'import et la réinitialisation de [FEAT-18](./FEAT-18.md)). Résultat `unreachable` → « Réparation impossible : pas de connexion. Réessaie une fois connecté. » (rien n'a été supprimé, le joueur peut réessayer).
* **D-Pad** : zone `settings-application` (2 lignes × 1 colonne : mise à jour, réparation), chaînée **sous la sauvegarde** : en-tête → mode TV → Son → Contraste → (section « Jeux », [FEAT-19](./FEAT-19.md)) → sauvegarde (export → fichier → collage → « Tout effacer ») → **application**. Bas depuis « Tout effacer » descend sur le bouton de mise à jour (`onExitDown` de `BackupPanel`) ; Haut depuis ce bouton revient sur « Tout effacer ». Le curseur fait défiler **tout le groupe de son bouton** : la ligne d'état est dessous, et aucune touche ne fait défiler plus bas que le dernier bouton (les flèches ne font jamais défiler la page d'elles-mêmes). Focus DOM (Tab, clic) → zone de l'élément activée ; `onBack` = retour au Hub.
* **Composants extraits** de `BackupPanel.tsx`, pour être partagés : `SettingsGroup` (ex-`BackupGroup`) et `SettingsFeedback` (ex-`Feedback`, avec un ton `info` pour « en cours ») dans `SettingsGroup.tsx` ; `ConfirmActions.tsx` (zone 1 × 2 déclarée dans la modale, curseur sur Annuler). Comportement de la sauvegarde inchangé.

### 3.7. Réparation (`repairApp()`)

Dans l'ordre :
1. **Vérifier le réseau** : ``fetch(`${basePath}/sw.js`, { cache: 'no-store' })``. Réponse non-2xx ou erreur réseau → `'unreachable'`, **rien n'est supprimé**. `sw.js` n'est jamais pré-caché (`isPrecacheable`) : le worker ne peut pas répondre à cette requête, qui teste donc vraiment le réseau.
2. **Désinscrire le worker de Mia seulement** : `navigator.serviceWorker.getRegistration(scope)` puis `unregister()`, uniquement si `registration.scope === scope` : sans inscription de Mia, le navigateur rend celle d'un scope parent, qui appartient à une autre application et reste intacte. Pas de `getRegistrations()` : GitHub Pages partage l'origine entre les dépôts d'un même compte.
3. **Supprimer les caches** `mia-precache-*` seulement (`deletePrecaches()`), jamais ceux des autres applications.
4. **Recharger** (`reloadPage()`) : la page repart du réseau, enregistre un nouveau worker après `load` et re-pré-cache la version courante ; renvoie `'reloading'`. Les étapes 2 et 3 sont indépendantes : si l'une échoue, l'erreur est journalisée (`console.warn`), l'autre a quand même lieu et la page se recharge (un worker resté inscrit, privé de ses caches, repart du réseau).

La sauvegarde (profils, étoiles, réglages) est dans `localStorage` : elle n'est jamais touchée.

**Avec un autre onglet de Mia ouvert**, le résultat dépend du moteur (constaté dans de vrais navigateurs, invisible dans les tests simulés) :

* **Firefox et WebKit** : après `unregister`, `register` crée une nouvelle inscription ; son worker prend la main sur l'autre onglet, qui se recharge. Un niveau en cours dans cet onglet serait perdu ; réparation confirmée et cas rare, accepté.
* **Chromium** : l'inscription désinscrite survit à ce client restant, et le `register` de la page rechargée la reprend sans nouvelle installation, puisque `sw.js` n'a pas changé ; l'autre onglet ne se recharge pas, mais le cache supprimé ne reviendrait pas, et le hors-ligne resterait perdu jusqu'à la prochaine version. Limite : un worker réellement défectueux ne disparaît qu'une fois ces autres onglets fermés.

D'où `RESTORE_PRECACHE_MESSAGE` : à chaque démarrage du suivi, la page demande aux workers actif et en attente de vérifier leur pré-cache ; s'il est vide, chacun le refait (`cache: 'reload'`), puis le worker actif réclame la page (`clients.claim()`, interdit à un worker en attente). Le même message répare une éviction du cache par le navigateur. Une version en attente retrouve ainsi un cache complet même si les fichiers de l'ancienne version ont disparu du serveur : la reconstruction du worker actif échoue alors, et la page reste sans contrôleur jusqu'à l'activation de la nouvelle version (bannière ou fermeture des fenêtres).

### 3.8. Écran d'erreur (`src/app/global-error.tsx`, `src/components/ui/CrashScreen.tsx`)

* `global-error.tsx` (`'use client'`) est la limite d'erreur de dernier recours de Next.js : il **remplace le layout racine**, dont les fournisseurs et le `<head>` disparaissent. Il rend donc son propre document : `<html lang="fr">`, un `<head>` (titre « Mia », `viewport`), un `<body>` aux classes du layout, et il importe lui-même la police et `globals.css`. Il monte `NavigationProvider` (D-Pad) et `CrashScreen`, **jamais `StorageProvider`** : l'écran ne lit pas la sauvegarde, qui est peut-être la cause du plantage. L'erreur est journalisée (`console.error('[Mia]', error)`).
* `CrashScreen` (`src/components/ui/`, textes dans `CRASH_SCREEN_TEXTS`) : « Mia a rencontré un problème », la note « Tes profils et tes étoiles ne sont pas touchés. Recharge Mia pour retrouver tes jeux. », puis **« Recharger »** (`reloadToHub()`) et **« Réparer l’application »** (`repairApp()`, §3.7) avec une note qui l'explique. « Recharger » repart du Hub plutôt que de la page courante : un plantage propre à une route (un niveau, par exemple) reviendrait sinon à chaque appui, et une PWA installée n'a pas de barre d'adresse ; `replace` évite aussi que Retour y ramène. La réparation n'est proposée que là où un service worker peut exister (`useAppUpdateStatus() !== 'unsupported'` : ni dans l'APK, ni en développement) ; ailleurs, « Recharger » reste seul. Refus faute de réseau (`unreachable`) → « Réparation impossible : pas de connexion. Réessaie une fois connecté. » (`role="alert"`, ligne réservée) ; une seule réparation à la fois, par un verrou et non par `disabled` (un bouton désactivé ne garde pas le focus du D-Pad).
* **D-Pad** : zone `crash-actions` (1 × 2, ou 1 × 1 sans réparation). Le premier bouton reçoit aussi le **focus DOM** à l'affichage : React retire de `<html>` ses attributs (`data-tv`) quand `global-error` remplace le layout, le mode TV peut donc manquer, et sans focus DOM le premier appui ne ferait que révéler le curseur du D-Pad.
* **Bouton Retour d'Android** (`useAndroidBackExit`) : le plantage démonte `useAndroidBackButton` ([FEAT-15](./FEAT-15.md)), et sans écouteur Capacitor ne quitte jamais l'application. Retour la quitte donc ici (`App.exitApp()`), plutôt que de revenir à un Hub peut-être en cause.
* **Limite connue** : l'écran ne peut pas aider si le JavaScript ne se charge pas du tout.

---

## 4. Points d'attention

* **Le statut vient de l'inscription, pas des événements** : relire `active`, `waiting` et `installing` évite qu'un événement manqué laisse un statut périmé, et fait apparaître la bannière dès le lancement quand une version attend depuis une session précédente. Avec `active` absent (toute première installation), le statut reste `idle` : le premier worker s'active seul.
* **Pourquoi toutes les pages se rechargent** : à l'activation, `purgeStaleCaches` supprime le cache de l'ancienne version ; une page restée sur l'ancienne version casserait au prochain chunk demandé. `skipWaiting()` + `clients.claim()` donnent donc un `controllerchange` à chaque onglet, et chacun se recharge, y compris ceux qui n'ont rien demandé ([§6](#6-décisions-dimplémentation-session-de-cadrage), « Second onglet »). `isReloading` évite un second rechargement si l'événement se répète.
* **Première visite** : le premier worker appelle `clients.claim()` et la page ouverte reçoit un `controllerchange` sans version à recharger. Elle l'ignore (aucun `pageWorker` au démarrage), sauf si elle a demandé la mise à jour (`isApplying`), puis suit ce worker : sans cette règle, chaque première visite se rechargerait toute seule.
* **Rechargement forcé** (Maj+F5) : la page n'a pas de contrôleur, mais elle dépend quand même du worker actif, dont le remplacement purge ses fichiers : elle se recharge alors comme les autres. Si le déploiement a précédé ce rechargement forcé, elle était déjà à jour et ce rechargement est de trop, une seule fois et sans conséquence (vérifié).
* **La version affichée est celle du code qui tourne** : `NEXT_PUBLIC_APP_VERSION` est figée dans le JS. Tant qu'une mise à jour est `ready`, les Réglages montrent encore l'ancienne version ; la nouvelle s'affiche après le rechargement.
* **La recherche coûte le téléchargement de `sw.js`** : c'est pourquoi le retour au premier plan est limité à une recherche par minute, et pourquoi aucun minuteur ne tourne pendant que l'application est ouverte.
* **Réparation sans réseau = refus** : sans service worker ni cache, plus rien ne se chargerait hors-ligne. D'où la vérification de `sw.js` **avant** toute suppression, et le message « Réparation impossible : pas de connexion ».
* **Chunk défaillant au chargement direct d'une page** : l'écran d'erreur couvre un chunk qui échoue pendant une navigation dans l'application (vérifié : `ChunkLoadError`, écran d'erreur, « Réparer », tout revient). Si c'est un `<script>` de la page initiale qui échoue, aucune erreur n'est levée (constaté dans un vrai navigateur avec un chunk du cache remplacé par une réponse 404) : la page reste sur « Chargement… », sans écran d'erreur ni accès à la réparation. Cas improbable, puisque `cache.addAll` est atomique, mais sans issue dans l'application si la page touchée est le Hub ; le rattraper demanderait un script hors de React, comme la page de secours écartée en [§6](#6-décisions-dimplémentation-session-de-cadrage).
* **WebKit active parfois seul un worker en attente** (constaté sur WebKitGTK, dont le moteur de service workers est celui de Safari ; non vérifié sur iOS). Lors d'une navigation de document (favori, barre d'adresse, repli `doMpaNavigation` de Next) depuis une page contrôlée dès son chargement, l'ancien worker répond avec l'ancienne page, puis le nouveau s'active sans l'accord du joueur et purge l'ancien cache ; la cause probable est le cache de navigation, qui retire la page de ses clients. Si les chunks de l'ancienne version ne sont plus dans le cache HTTP, la page reste sur « Chargement… » ; sinon elle tourne sur l'ancienne version, sans bannière, jusqu'au prochain chunk qui échoue (écran d'erreur). Dans les deux cas, le chargement suivant donne la nouvelle version : fermer puis rouvrir l'application suffit. `location.reload()` et `location.replace()` ne le déclenchent pas (vérifié). Un « Retour » entre deux documents (Réglages ouverts par leur adresse ou rechargés) déclenche la même activation ; le Hub s'est alors ouvert directement sur la nouvelle version, sans blocage (vérifié). Mia ne fait elle-même aucune autre navigation de document : ses changements d'écran restent dans la même page (Hub, Réglages, « Retour » : vérifié sur les trois moteurs), et une PWA installée, sans barre d'adresse, y est peu exposée. Accepté. Le rattraper demanderait un script hors de React, ou de garder l'ancien cache une activation de plus.
* **Installations existantes** : voir [§6](#6-décisions-dimplémentation-session-de-cadrage), « Déploiement » : aucune passerelle, la première preuve réelle sur un appareil vient avec la seconde release suivant cette feature.
* **Cycle de vie non protégé par un test automatisé** : les tests du worker tournent dans un contexte `node:vm` simulé et ne peuvent pas exercer la séquence attente, activation, rechargement d'un vrai navigateur ([§6](#6-décisions-dimplémentation-session-de-cadrage), « Vérification »). Toute modification de `appUpdate.ts` ou du gestionnaire `message` du worker se revérifie donc à la main, dans un navigateur réel.

---

## 5. Critères d'Acceptation (Definition of Done)

- [x] Une version déployée est cherchée au lancement et à chaque retour au premier plan (au plus une recherche par minute), téléchargée en arrière-plan (`downloading`), puis proposée par la bannière du Hub (`ready`) ; l'appui active le worker en attente et recharge **toutes** les pages ouvertes sur la nouvelle version. Le worker n'appelle jamais `skipWaiting()` à l'installation.
- [x] La section « Application » de `/settings` (dernière section) affiche le numéro de version dans la PWA comme dans l'APK ; dans la PWA, elle cherche une mise à jour à la demande (à jour, trouvée, injoignable), propose « Mettre à jour » quand une version est prête et « Réparer l’application » derrière une confirmation ; tout se pilote au doigt et à la télécommande (`Flèches` + `OK` + `Retour`), l'enchaînement D-Pad passant de « Tout effacer » à la section et inversement.
- [x] La réparation désinscrit le seul service worker de Mia, supprime les seuls caches `mia-precache-*` et recharge depuis le réseau ; la sauvegarde et les autres applications de l'origine ne sont pas touchées ; sans réseau, elle refuse et ne supprime rien.
- [x] Un plantage de l'application affiche l'écran d'erreur (« Recharger » et, là où un service worker peut exister, « Réparer l’application ») à la place de la page d'erreur par défaut de Next.js ; l'écran n'a besoin ni de la sauvegarde ni des fournisseurs du layout racine.
- [x] `tests/pwa-update.test.ts`, `tests/pwa-service-worker.test.ts`, `tests/pwa-register.test.ts`, `tests/hub-update-banner.test.tsx`, `tests/settings-application.test.tsx` et `tests/crash-screen.test.tsx` couvrent ces comportements ([§6](#6-décisions-dimplémentation-session-de-cadrage), « Tests ») ; seuils de couverture inchangés.
- [x] Vérification unique dans un navigateur réel, sur une émulation locale de GitHub Pages où un déploiement est simulé (nouveau `sw.js`, chunk renommé, numéro de déploiement dans les pages) : worker en attente (`ready`) → bannière → appui → page rechargée sur la nouvelle version ; retour au premier plan après plus d'une minute → nouvelle recherche ; un second onglet ouvert se recharge aussi ; « Réparer l’application » recharge sans perdre la sauvegarde et refuse hors-ligne.
- [x] `npm run validate:all` (`format:check`, `lint`, `typecheck` des deux programmes, `validate:levels`, `test:coverage`, `build`) passe sans aucune erreur.
- [x] Si un commit est créé, il respecte le format **Conventional Commits** (ex: `feat(pwa): add update prompt, repair and crash screen`).

---

## 6. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation, avec leurs motivations et les alternatives écartées.

| Sujet | Décision |
| :--- | :--- |
| **Activation** | **Sur demande du joueur** : une bannière propose la version prête ; l'appui envoie `SKIP_WAITING_MESSAGE` au worker en attente, qui appelle `skipWaiting()`, et chaque page ouverte se recharge au `controllerchange`. La règle de FEAT-17 « pas de `skipWaiting()` automatique » reste vraie (l'installation n'active rien) : l'activation a désormais lieu aussi à la demande du joueur. Écartés : une activation silencieuse à un « moment sûr » (rechargement inexpliqué, et « sûr » est à définir écran par écran) ; un `skipWaiting()` automatique à l'installation (perdrait la partie en cours, la progression d'un niveau n'étant pas enregistrée avant sa fin, et casserait les pages ouvertes dont les chunks disparaissent avec l'ancien cache). |
| **Bannière** | Sur le **Hub seulement**, **sans bouton de rejet** : la PWA installée s'ouvre sur le Hub (`start_url`), où un rechargement ne coûte rien, et une seule zone D-Pad est ajoutée ; un joueur qui reste dans un même jeu la voit à son retour. Écartés : toutes les pages sauf un niveau en cours, avec un bouton « Plus tard » (les zones D-Pad sont propres à chaque écran, donc à câbler une à une, et « Plus tard » exige une règle de retour de la bannière) ; toutes les pages, niveaux compris, avec une modale de confirmation (distrayant en jeu chronométré, coût de câblage maximal). |
| **Commandes manuelles** | Nouvelle section **« Application »** de l'écran Réglages, la dernière : numéro de version, un seul bouton « Rechercher une mise à jour » qui devient « Mettre à jour » quand une version est prête, et « Réparer l’application » derrière une modale de confirmation. Écartés : la version et la recherche seules (aucune issue quand l'application est coincée) ; un unique bouton « Vider le cache » (retélécharge tout sans rien apporter de nouveau, et n'affiche pas la version). |
| **Réparation** | Désinscrit le service worker **de Mia seulement** (`getRegistration(scope)`, pas `getRegistrations()`), supprime **les seuls caches `mia-precache-*`** et recharge depuis le réseau. La sauvegarde est dans `localStorage` : intacte, comme les autres applications de l'origine partagée de GitHub Pages. Avant toute suppression, elle télécharge `sw.js` avec `cache: 'no-store'` : réseau injoignable → elle refuse, car plus rien ne se chargerait ensuite. `sw.js` n'est jamais pré-caché : le worker ne peut pas répondre à cette requête. |
| **Détection** | Au lancement et à chaque retour au premier plan (`visibilitychange`), au plus une fois par minute (`FOREGROUND_CHECK_INTERVAL_MS`), par `registration.update()`. Écartés : un minuteur supplémentaire pendant que l'application est ouverte (trafic en arrière-plan pour une application qui change rarement) ; le lancement seul (une application reprise de l'arrière-plan resterait périmée jusqu'à une fermeture complète). |
| **Périmètre** | **PWA seulement.** L'APK embarque ses assets et n'enregistre aucun worker : pas de problème de cache. Il continue de se mettre à jour par F-Droid ou GitHub Releases et affiche seulement son numéro de version dans les Réglages. Écarté : interroger GitHub Releases depuis l'APK (requête vers un tiers, contraire à la contrainte 1 de FEAT-17 et à la conformité F-Droid). Conséquence : les utilisateurs d'un APK installé à la main ne sont pas prévenus des nouvelles releases. |
| **Écran d'erreur** | `src/app/global-error.tsx` rend `src/components/ui/CrashScreen.tsx` : « Recharger », qui repart du Hub (recharger la même adresse ramènerait un plantage propre à une route, sans issue dans une PWA installée), et, là où un service worker peut exister (ni dans l'APK, ni en développement), « Réparer l’application ». Il remplace le layout racine : document propre, `NavigationProvider` pour le D-Pad, jamais `StorageProvider`. Sans lui, un plantage laisse le joueur sur la page d'erreur par défaut de Next.js, sans accès aux Réglages, et la seule issue est d'effacer les données du site dans le navigateur, ce qui efface aussi profils et étoiles. Écartés : une page de secours autonome hors du worker, du type `/mia/reset/` (plus à maintenir, et il faut en connaître l'adresse) ; les seuls Réglages. Limite connue : l'écran ne peut rien si le JavaScript ne se charge pas du tout. |
| **Déploiement** | **Aucune passerelle.** Les installations qui tournent encore sur le worker d'avant FEAT-20 ne peuvent pas afficher la bannière, leurs pages ne contenant pas ce code : chacune a besoin d'une dernière fermeture complète puis d'une réouverture après la release, et n'est pas plus mal lotie qu'avant d'ici là. Écarté : une passerelle ponctuelle qui forcerait le nouveau worker à prendre la main et à recharger les fenêtres ouvertes (un rechargement forcé peut faire perdre un niveau en cours, et ajoute du code sur un chemin difficile à tester). Conséquence : la première preuve réelle sur un appareil vient avec la **seconde** release suivant FEAT-20, car la première ne livre que le code de mise à jour. |
| **Vérification** | Vitest pour la logique, plus une **vérification unique dans un navigateur réel avec deux builds locaux**. Les tests du worker tournent dans un contexte `node:vm` simulé et ne peuvent pas exercer la séquence attente, activation, rechargement d'un vrai navigateur. Écarté : un test Playwright en CI (dépendance de développement, téléchargement de navigateurs, minutes de CI, et il ne couvrirait pas le vrai Safari iOS). Conséquence : rien d'automatisé ne protège ce cycle de vie d'une régression ultérieure. |
| **Second onglet** | Appuyer sur « Mettre à jour » recharge aussi tout autre onglet Mia ouvert, car les fichiers de l'ancienne version disparaissent avec son cache. Un niveau en cours dans cet autre onglet serait perdu ; cas rare, accepté. Sous Firefox et WebKit, une réparation le recharge aussi (§3.7). |
| **Suivi** | `createAppUpdateController()` : fabrique d'un suivi en fermeture (statut, abonnés, inscription, drapeaux), sans effet de bord à l'import ni au pré-rendu, plus le singleton `appUpdate` partagé par le Hub et les Réglages, lu par `useSyncExternalStore` (`useAppUpdateStatus`, `unsupported` à l'instantané serveur). Quatre statuts : `unsupported`, `idle`, `downloading`, `ready`, relus sur l'inscription plutôt que déduits des événements. `check()` renvoie `up-to-date`, `found` ou `unreachable` ; `repairApp()` renvoie `reloading` ou `unreachable`. |
| **Version** | `next.config.ts` : `env.NEXT_PUBLIC_APP_VERSION` lue dans `package.json`. semantic-release met `package.json` à jour avant le build de l'APK et le déploiement de la PWA part du tag de release : les deux affichent la version de leur release. |
| **Structure des Réglages** | `SettingsGroup`, `SettingsFeedback` et `ConfirmActions` extraits de `BackupPanel.tsx` (aucun changement de comportement de la sauvegarde) pour que la section « Application » réutilise les mêmes groupes, lignes d'état et boutons de confirmation. Zone D-Pad `settings-application` (2 × 1) chaînée sous « Tout effacer » (`onExitDown` de `BackupPanel`) ; absente sans service worker. |
| **Tests** | `tests/pwa-update.test.ts` (nouveau : contrôleur de mise à jour avec une inscription simulée — statut selon l'environnement, relu sur l'inscription, abonnés, cycle de vie des workers, `start`, `check`, `apply`, rechargement au changement de worker avec et sans worker au départ, rechargement forcé, worker de la page devenu `redundant`, retour par le cache de navigation, recherche au retour au premier plan — puis `repairApp`, `getAppVersion`, `reloadPage`, `reloadToHub`, `useAppUpdateStatus` (`unsupported` au pré-rendu) et l'injection de la version par `next.config.ts`) ; `tests/pwa-service-worker.test.ts` (gestionnaire `message` : `skipWaiting()` sur `SKIP_WAITING_MESSAGE`, sa promesse passée à `waitUntil` ; `RESTORE_PRECACHE_MESSAGE` : pré-cache intact, supprimé, recréé vide, téléchargement échoué, worker en attente ; installation en échec si le cache est purgé pendant le téléchargement ; ni `install` ni `activate` n'appellent `skipWaiting()`) ; `tests/pwa-register.test.ts` (`readServiceWorkerEnvironment`, `deletePrecaches` : seuls les caches `mia-precache-*`, `CacheStorage` absent toléré ; le registrar démarre le suivi avec l'inscription obtenue, et pas en cas d'échec, en développement ni dans l'APK) ; `tests/hub-update-banner.test.tsx` (nouveau : bannière en tête du Hub, activation une seule fois au clic et à OK, région d'annonce, arrivée sans voler le curseur, enchaînement D-Pad avec et sans bannière, disparition sous le curseur) ; `tests/settings-application.test.tsx` (nouveau : version seule sans service worker, recherche et ses issues, version prête, réparation et sa confirmation, annulation, refus faute de réseau, double appui, enchaînement D-Pad dans les deux sens, défilement au D-Pad du groupe et de la section sans bouton, `describeAppUpdate`, `SettingsFeedback`) ; `tests/crash-screen.test.tsx` (nouveau : titre et note, « Recharger » seul sans service worker et retour au Hub, réparation unique et refus, focus et curseur D-Pad dès l'affichage, bouton Retour d'Android, `global-error` qui rend son propre document sans les fournisseurs du layout) ; `tests/android-back-button.test.tsx` (`useAndroidBackExit`) ; `tests/settings-screen.test.tsx` (quatrième section). `src/app/global-error.tsx` est exclu de la couverture comme `layout.tsx` : mince enveloppe qui rend `<html>`, impossible à imbriquer dans un conteneur jsdom (`vitest.config.ts`, liste figée par `tests/quality-setup.test.ts`). Seuils de couverture inchangés. |
| **Vérifié dans un navigateur réel** | Sur une émulation locale de GitHub Pages (`/mia/`, `max-age=600`, 301 vers la barre finale, `404.html`), un déploiement étant simulé par un nouveau `sw.js`, un chunk renommé (l'ancien nom répond 404) et un numéro de déploiement dans les pages. **Avant FEAT-20**, sous Chromium : le bug est reproduit (nouvelle version téléchargée, en attente, deux rechargements servent encore l'ancienne). **Build final** : Chrome for Testing 153 (27 scénarios), Firefox 158 (20) et WebKitGTK 2.52 (23), aucun échec : première visite sans rechargement ; recherche, téléchargement lent ou échoué, version prête, bannière, appui, ancien cache purgé, aucune boucle de rechargement ; deux onglets rechargés ; deux déploiements à la suite ; acceptation pendant le téléchargement de la version suivante, puis hors-ligne ; fermeture complète et réouverture ; réparation avec un ou deux onglets, avec une version en attente, refus hors-ligne, sauvegarde intacte ; cache évincé, avec ou sans nouvelle version ; écran d'erreur (vrai `ChunkLoadError` en navigation interne, plantage sur une route, avec une version en attente, « Recharger » vers le Hub, réparation) ; tout le parcours au D-Pad en mode TV, du Hub jusqu'à la mise à jour acceptée sur la bannière ; retour par le cache de navigation. Sous Chromium seulement : défilement au D-Pad à 1920 × 1080, avec et sans service worker, et rechargement forcé. Sous WebKit seulement : `location.reload()`, `location.replace()` et navigation de document avec une version en attente (§4). **Sur un build antérieur, sous Chromium** : passage depuis l'ancien worker (aucune bannière, nouvelle version après fermeture complète) ; recherche au lancement et au retour au premier plan (limitée à une par minute) ; rechargement hors-ligne ; cache d'une autre application intact après une réparation ; mise en page de la bannière à la largeur d'un téléphone. **Cette vérification a trouvé** la réparation avec un autre onglet ouvert (§3.7), le pré-cache purgé pendant un téléchargement (§3.1), le worker remplacé pendant que la page dort sous WebKit et la bannière absente au retour par le cache de navigation sous Firefox (§3.2), la ligne d'état hors de vue au D-Pad (§3.6), le plantage propre à une route (§3.8), et les limites du chargement direct et de WebKit (§4). |
| **Non vérifié** | Le cycle complet sur un appareil réel (PWA installée sur Android et iOS, reprise de l'arrière-plan) : à faire avec la seconde release suivant FEAT-20 (voir « Déploiement »). Safari lui-même n'a pas été essayé : WebKitGTK partage son moteur de service workers, pas son comportement sous iOS. Dans l'APK, la version affichée et le bouton Retour d'Android sur l'écran d'erreur ne sont couverts que par les tests, et la section réduite par les tests et une émulation sous Chromium (ni JDK ni SDK Android en local). |
| **Git** | Commit suggéré : `feat(pwa): add update prompt, repair and crash screen` (scope `pwa` existant dans `commitlint.config.mjs`). |
