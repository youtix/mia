# FEAT-18 : Écran Réglages & Sauvegarde (Mode TV, Son, Contraste, Export / Import)

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-18`
> **Dépendances** : [FEAT-05](./FEAT-05.md), [FEAT-08](./FEAT-08.md)
> **Statut** : brouillon issu de la session de cadrage de [FEAT-05](./FEAT-05.md#5-décisions-dimplémentation-session-de-cadrage), à cadrer avant implémentation.

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
