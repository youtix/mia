# FEAT-18 : Écran Réglages & Sauvegarde (Mode TV, Son, Contraste, Export / Import)

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-18`
> **Dépendances** : [FEAT-05](./FEAT-05.md), [FEAT-08](./FEAT-08.md)
> **Statut** : cadrée et implémentée ; les décisions prises sur les points ouverts de ce brouillon sont consignées au [§6](#6-décisions-dimplémentation-session-de-cadrage).

---

## 1. Contexte & Objectif pour l'IA

`FEAT-05` fournit toute la mécanique via `useMiaStorage()` (`updateSettings`, `exportBackup`, `importBackup`, `resetAllData`), mais aucune feature de `FEAT-06` à `FEAT-17` ne permet à l'utilisateur de s'en servir :
* le mode TV (`tvModeOverride`) ne peut pas être forcé, alors que `FEAT-03` et `FEAT-15` comptent sur ce réglage quand la détection automatique échoue (télécommandes à pointeur « air mouse ») ;
* `soundEnabled` et `highContrastMode` n'ont ni interrupteur ni effet ;
* sans export / import, la progression d'une famille ne peut ni être mise à l'abri avant une réinstallation, ni passer de la tablette à la TV du salon.

L'objectif de cette **FEAT-18** est un écran **Réglages & Sauvegarde**, accessible depuis le Hub (`FEAT-08`), entièrement utilisable au doigt comme à la télécommande.

---

## 2. Fichiers à Créer / Modifier (proposition)

```text
src/
├── app/
│   ├── globals.css                    # Effet de highContrastMode (ex: variante `contrast:`)
│   └── settings/
│       └── page.tsx                   # Route statique /settings/ (ou modale ouverte depuis le Hub : à trancher)
└── components/
    └── settings/
        ├── SettingsScreen.tsx         # Réglages de l'appareil (mode TV, son, contraste)
        ├── BackupPanel.tsx            # Export, import, réinitialisation
        └── index.ts
tests/
└── settings-screen.test.tsx           # Rendu, navigation D-Pad, export / import / réinitialisation
```

---

## 3. Spécifications (à cadrer)

### 3.1. Réglages de l'appareil
* **Mode TV** : sélecteur à 3 états (*Automatique* / *Toujours TV* / *Toujours tactile*) → `updateSettings({ tvModeOverride })`. L'effet est immédiat (`data-tv`, [FEAT-05 §3.4](./FEAT-05.md)) : la mise en page change sous le curseur, le focus doit rester sur le sélecteur.
* **Son** : interrupteur `soundEnabled` (aucun son n'existe encore : préciser son effet ou masquer le réglage).
* **Contraste élevé** : interrupteur `highContrastMode` ; définir son effet (ex: `<html data-contrast="high">` posé comme `data-tv`, script inline compris, et variante Tailwind `contrast:`).

### 3.2. Sauvegarde
* **Exporter** : `exportBackup()` → fichier `mia-sauvegarde-AAAA-MM-JJ.json`.
* **Importer** : lecture d'un fichier → `importBackup(json)` ; en cas d'échec, afficher `result.message` (déjà en français, ex: version plus récente de Mia). Confirmer avant de remplacer les profils (`ModalDialog`) en suggérant d'exporter d'abord. Les réglages de l'appareil sont conservés ([FEAT-05 §5](./FEAT-05.md#5-décisions-dimplémentation-session-de-cadrage)).
* **Réinitialiser** : `resetAllData()` après une double confirmation (efface profils, étoiles et réglages).
* **Profils** ([FEAT-06 §5](./FEAT-06.md#5-décisions-dimplémentation-session-de-cadrage)) : après `resetAllData()` ou l'import d'une sauvegarde sans profil, `useProfileGate` (monté par le Hub) recrée « Joueur 1 » ; un import sans profil actif (`activeProfileId: null`) ouvre le choix du joueur imposé. La suppression d'un profil est déjà proposée par `ProfileSelectorModal` (mode « Gérer les profils »).

---

## 4. Points d'attention (relevés pendant le cadrage de FEAT-05)

* **Export dans l'APK** : `<a download>` (Blob) ne fait rien dans la WebView Android de Capacitor. Prévoir `@capacitor/filesystem` + `@capacitor/share` (dépendances à vérifier pour F-Droid : licences libres, aucun service Google) ou une copie dans le presse-papiers.
* **Import sur Android TV** : de nombreux boîtiers n'ont ni gestionnaire de fichiers ni sélecteur utilisable à la télécommande. Prévoir une autre voie pour passer de la tablette à la TV (copier-coller du JSON, code QR, …).
* **Import Web** : `<input type="file" accept="application/json,.json">` masqué derrière un `FocusableButton`, puis `File.text()` ; respecter `jsx-a11y` strict (`FEAT-02`) et la navigation D-Pad (`FEAT-04`).
* **Contraste élevé** : aucune règle CSS n'existe encore ; tout l'effet est à concevoir ici.
* **Commit** : ajouter un scope (ex: `settings`) à `commitlint.config.mjs` ([FEAT-02 §3.4](./FEAT-02.md)).
* **Point d'entrée dans le Hub** ([FEAT-08 §6](./FEAT-08.md#6-décisions-dimplémentation-session-de-cadrage)) : bouton à côté de celui du profil actif (emplacement `profile` d'`AppShell`, `HubScreen`) ; élargir la zone D-Pad `hub-profile` à ces deux boutons. Une route `/settings/` suivrait les retours de FEAT-08 (`useGameNavigation` : historique dépilé quand le Hub précède, sinon remplacé) ; une modale garderait le Hub monté et son curseur.

---

## 5. Critères d'Acceptation (Definition of Done)

- [ ] Les trois réglages de l'appareil sont modifiables au doigt et à la télécommande (`Flèches` + `OK` + `Retour`) et persistent après rechargement.
- [ ] Export puis import restaurent profils et étoiles sur le Web ; un fichier invalide affiche le message renvoyé par `importBackup`.
- [ ] Recette dans l'APK (`FEAT-15`, si disponible) : l'export produit un fichier exploitable ou une copie dans le presse-papiers.
- [ ] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`) passe sans aucune erreur.
- [ ] Si un commit est créé, il respecte le format **Conventional Commits** (ex: `feat(settings): add settings and backup screen`).

---

## 6. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles tranchent les points « à cadrer » des sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Écran** | Route statique `/settings/` (`src/app/settings/page.tsx`, titre « Réglages · Mia » par le gabarit du layout), écran complet `AppShell` plutôt qu'une modale : l'écran est long (deux sections, modales de confirmation) et une route se partage, se recharge et suit l'historique comme les jeux. `SettingsScreen` attend `isLoaded` (`WaitingScreen` sinon). Retour → `useGameNavigation().backToHub` (`components/progression/routes.ts`, importé en module direct) : historique dépilé quand le Hub précède, sinon `router.replace('/')` ; relié au bouton Retour d'`AppShell` (`backButtonRef`, `isBackFocused`, `onBackFocus`) et à Retour / Échap par l'`onBack` de chaque zone D-Pad, donc au bouton physique Android (`dispatchBack`, FEAT-15). Aucun bouton de l'en-tête à droite. |
| **Point d'entrée** | Hub : bouton « Réglages » (Lucide `Settings`, texte `sr-only sm:not-sr-only` comme Retour, `aria-label="Réglages"`) à droite du bouton du profil actif, dans l'emplacement `profile` d'`AppShell` (conteneur flex). Zone `hub-profile` à 2 colonnes (profil, réglages) ; Bas depuis l'un ou l'autre → dernière carte visitée, Haut depuis les cartes revient sur le dernier des deux boutons visité. `router.push('/settings')`, route préchargée avec celles des jeux. `SETTINGS_PATH` vit dans `components/settings/labels.ts`, importé par le Hub en module direct (le barrel embarquerait l'écran Réglages dans le JS du Hub). |
| **Mode TV** | `role="radiogroup"` (nommé « Mode TV », décrit par une aide) de 3 `FocusableButton role="radio" aria-checked` : Automatique / Toujours TV / Toujours tactile (`TV_MODE_OPTIONS`) ; l'option en vigueur est pleine (`primary`) avec une coche (indice non coloré ; coche invisible sinon pour que le libellé ne bouge pas). OK ou tap → `updateSettings({ tvModeOverride })`, effet immédiat (`data-tv` posé par le Provider) ; la zone (1 × 3) garde son curseur, qui reste donc sur l'option choisie. Le curseur initial de l'écran et toute arrivée dans la zone (depuis Retour ou depuis Son) se posent sur l'option en vigueur. 3 colonnes dès `sm:` (le viewport TV de 960 px les affiche côte à côte), empilées sur smartphone. |
| **Son et contraste** | Interrupteurs `FocusableButton role="switch" aria-checked` (nom accessible = libellé, note liée par `aria-describedby`) avec une glissière décorative : position du bouton et coche en plus de la couleur. Son : « Aucun son pour l'instant : les futurs effets sonores respecteront ce réglage. » (réglage conservé, pas masqué : contrat pour les futurs effets). Contraste élevé : note « Texte plus clair, bordures et anneau de focus renforcés, fonds opaques. ». |
| **Contraste élevé : attribut** | `src/core/storage/contrast-mode.ts` : `applyHighContrastMode(enabled)` pose `<html data-contrast="high">` ou retire l'attribut (`CONTRAST_ATTRIBUTE`, `HIGH_CONTRAST_VALUE`, barrel) ; appliqué par `StorageProvider` une fois la sauvegarde chargée puis à chaque changement, comme `data-tv`. `TV_MODE_BOOTSTRAP_SCRIPT` (toujours une seule constante, injectée par `layout.tsx`) lit désormais `settings` une fois et pose aussi `data-contrast` avant l'hydratation (ES5, `highContrastMode === true` strictement : « oui » ou 1 ne posent rien). `resetAllData` et l'import (réglages conservés) suivent naturellement. |
| **Contraste élevé : effet CSS** | `globals.css` : variante `@custom-variant contrast (&:where([data-contrast='high'], [data-contrast='high'] *))` (utilisée par les sections des réglages : `contrast:bg-slate-800`) et un effet **global** sans retoucher les composants `ui` (hors périmètre) : (1) dans `@layer base`, sur `[data-contrast='high']`, redéfinition des jetons que les utilitaires référencent (`text-slate-300` → `color: var(--color-slate-300)`) : `--color-slate-300` → valeur de slate-100, 400 → 200 (texte secondaire, placeholders, icônes), 500 → 300, 600 → 400, 700 → 500 (bordures des boutons secondaires, champs, cartes, modales, `kbd` ; aussi `bg-slate-700` : piste de progression et survol, plus clairs). Valeurs littérales (`oklch`) de la palette : des jetons chaînés se résoudraient en cascade jusqu'à slate-100. (2) Hors de tout `@layer` (une règle non stratifiée l'emporte sur la couche `utilities`, `:where()` garde la spécificité nulle) : `[data-contrast='high'] :where(.bg-slate-800\/60, .bg-slate-800\/80, .bg-slate-900\/60)` → `slate-800` opaque (cartes du Hub, pastilles, HUD), `:where(.bg-slate-950\/70, .bg-slate-950\/80)` → `slate-950` opaque (fond des modales, badge de cadenas) : les variantes d'opacité sont figées en hexadécimal à la compilation et ne suivent pas les jetons ; `:where([data-focused], :focus-visible)` → `--tw-ring-shadow` recalculée avec 6 px au lieu de 4 (`ring-4` compose `box-shadow` à partir de cette variable). Compilation vérifiée avec `@tailwindcss/node`. |
| **Export** | Web : `Blob` + `<a download>` `mia-sauvegarde-AAAA-MM-JJ.json` (date locale, `getBackupFileName`), lien ajouté au document le temps du clic, URL révoquée 1 s après (`EXPORT_URL_REVOKE_DELAY_MS` : certains navigateurs lisent le Blob après le clic) ; message « Sauvegarde téléchargée : … ». « Copier » (voie de l'APK et de la TV) : `navigator.clipboard.writeText(exportBackup())`, confirmation dans une région `role="status"` ; API absente (contexte non sécurisé, WebView) ou refus → `role="alert"` « Copie impossible : le presse-papiers n'est pas disponible sur cet appareil. ». `Capacitor.isNativePlatform()` (lu au rendu, l'écran n'est jamais pré-rendu) masque le téléchargement dans l'APK, où `<a download>` ne fait rien. Aucune dépendance ajoutée (`@capacitor/filesystem` et `@capacitor/share` écartés : conformité F-Droid et simplicité). |
| **Import par fichier** | « Choisir un fichier » (`FocusableButton`) déclenche un `<input type="file" accept="application/json,.json">` masqué visuellement (`sr-only`, `tabIndex={-1}`, `aria-label="Fichier de sauvegarde"`), lu par `File.text()` ; valeur remise à vide après lecture (le même fichier peut être rechoisi après une annulation) ; lecture impossible → « Lecture du fichier impossible. ». |
| **Import par collage** | Champ étiqueté « Coller une sauvegarde » + bouton « Importer » en colonne (voie Android TV : saisie par l'application télécommande ou un clavier). **Écart assumé** : `<input type="text">` plutôt que `<textarea>` : au D-Pad, Haut / Bas sortent d'un champ d'une ligne alors qu'un `textarea` ne rend que Échap au moteur (FEAT-04 §5) et piégerait le curseur ; le champ retire les retours à la ligne du JSON collé sans le casser. Au doigt, Entrée (touche « OK » du clavier virtuel) lance l'import ; au D-Pad elle reste native (sur Android TV, OK ouvre le clavier). Champ vide → « Colle d'abord le contenu d'une sauvegarde. » ; vidé après un import réussi. |
| **Confirmation d'import** | Pré-validation par `parseBackupJson` (barrel) **avant** la confirmation : un contenu inutilisable affiche aussitôt `message` (`IMPORT_FAILURE_MESSAGES`, ex: version plus récente) sans modale. Sinon `ModalDialog` « Remplacer les profils actuels ? » : nombre de profils de la sauvegarde (`describeBackupProfiles` : « aucun profil : un profil « Joueur 1 » sera créé », « 1 profil », « 3 profils »), rappel que les réglages sont conservés, « Exporte d'abord ta progression si tu veux la garder. » ; [Annuler] [Remplacer], curseur sur Annuler ; Retour / Échap / ✕ / fond annulent. Puis la modale se ferme **avant** `importBackup(json)` (réglages de l'appareil conservés, contrat FEAT-05) → « Sauvegarde restaurée. » ; échec → `result.message`. Un seul import par confirmation : la sauvegarde en attente est aussi tenue dans une ref, consommée avant l'`await`, car `AnimatePresence` garde la modale fermée (et les anciennes props de ses boutons) le temps de l'animation de sortie ; un double appui sur « Remplacer » n'importe qu'une fois. Un import sans profil actif est pris en charge par le Hub au retour (`useProfileGate`). |
| **Réinitialisation** | « Tout effacer » (`danger`) → modale 1 « Réinitialiser Mia ? » (profils, étoiles et réglages effacés, suggestion d'exporter) [Annuler] [Continuer] → modale 2 « Tout effacer définitivement ? », **imbriquée** dans la première (couche FEAT-04 au-dessus), panneau bordé de rose, avertissement rouge « Cette action est irréversible », bouton `danger` « Tout effacer définitivement » → `resetAllData()` puis `backToHub` (le Hub recrée « Joueur 1 »). Les modales se ferment **avant** `resetAllData()` et l'étape est aussi tenue dans une ref consommée avant l'`await` (même mécanisme que l'import) : un double appui sur « Tout effacer définitivement » ne réinitialise qu'une fois et ne revient au Hub qu'une fois (un second `backToHub` dépilerait l'historique au-delà du Hub). Annuler, Retour, Échap ou ✕ à l'une ou l'autre étape abandonnent tout. Imbriquée plutôt que successive : une modale qui se ferme rend le focus à son déclencheur et volerait celui de la suivante. |
| **D-Pad** | Zones empilées, `onEdge` + `useZoneRegistry` / `register('backup', …)` (`zone-chain.ts`) : en-tête (Retour) → mode TV (1 × 3) → Son → Contraste → (section « Jeux » depuis [FEAT-19](./FEAT-19.md), ligne « Jeux (FEAT-19) » ci-dessous) → `BackupPanel` (export 1 × 2, 1 × 1 dans l'APK → fichier → collage 2 × 1 : champ puis Importer → réinitialisation). L'arrivée dans le panneau se fait sur le premier bouton d'export ; le collage s'aborde par le champ en descendant, par « Importer » en remontant ; l'export garde son curseur en remontant. Focus DOM (Tab, clic) → zone de l'élément activée. `onBack` = retour au Hub pour chaque zone. Modales : zone déclarée dans la modale (`ConfirmActions`, 1 × 2), curseur sur Annuler. |
| **Messages** | Par groupe (export, import) : région `role="status"` persistante (annonce polie des confirmations) + `role="alert"` conditionnel pour les erreurs, sur une ligne réservée (`min-h-6`) pour que la mise en page ne saute pas. Textes dans `labels.ts` (`BACKUP_MESSAGES`, `SETTINGS_TEXTS`), tutoiement. |
| **Structure** | `SettingsSection` (`components/settings/SettingsSection.tsx`, ajouté à l'arborescence §2) : carte `<section aria-labelledby>` (« Appareil », « Sauvegarde ») ; groupes `role="group"` nommés et décrits (« Exporter », « Importer », « Réinitialiser ») dans `BackupPanel`. Barrel `components/settings/index.ts` ; la page importe `SettingsScreen` en module direct. Scope `settings` ajouté à `commitlint.config.mjs`. |
| **Jeux (FEAT-19)** | [FEAT-19](./FEAT-19.md) insère une section « Jeux » (`SettingsSection`, rendue seulement avec un profil actif : réglages de Memory du joueur, deux groupes radio au balisage du sélecteur « Mode TV ») entre « Appareil » et « Sauvegarde », et étend l'enchaînement D-Pad : contraste → mémorisation (1 × 4) → erreurs (1 × 4) → sauvegarde ; Haut depuis la sauvegarde revient sur le groupe des erreurs (sur le contraste sans profil actif). |
| **Tests** | `tests/settings-screen.test.tsx` : page et titre, sections et états, changement des trois réglages au doigt et à la télécommande (persistance, `data-tv`, `data-contrast`, curseur conservé), focus DOM → zone, Retour (bouton, Échap, historique), export (URL d'objet et presse-papiers simulés, APK), import par fichier et par collage (succès, échec avec message, fichier illisible, annulation, double appui sur « Remplacer » → une seule écriture de la sauvegarde, Entrée au doigt / à la télécommande), réinitialisation (double confirmation, abandons, double appui sur « Tout effacer définitivement » → une seule réinitialisation et un seul retour au Hub), enchaînement D-Pad complet, libellés. `tests/storage.test.tsx` : `applyHighContrastMode`, script inline (`data-contrast`), Provider. `tests/star-map.test.tsx` : bouton Réglages (clic, préchargement) et zone à 2 colonnes au D-Pad. |
| **Non vérifié** | Recette dans l'APK et sur Android TV (copie dans le presse-papiers, saisie du collage par l'application télécommande) : à faire avec FEAT-15. |
| **Git** | Commit suggéré : `feat(settings): add settings and backup screen`. |
