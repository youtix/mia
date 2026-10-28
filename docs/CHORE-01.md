# CHORE-01 : Vulnérabilités `undici` embarquées dans npm (outillage de release)

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Chore** : `CHORE-01`
> **Origine** : [FEAT-02](./FEAT-02.md) (release automatique `semantic-release`)
> **Statut** : en attente d'un correctif amont — alertes Dependabot #3 à #6 rejetées le 28/10/2026 (motif « tolerable risk », commentaire renvoyant vers ce document)

---

## 1. Contexte

Au premier passage de Dependabot (merge de FEAT-02, 27/10/2026), 4 alertes ont été ouvertes sur `undici`, une dépendance **transitive de développement** :

| Alerte | Sévérité | Avis | Résumé (GitHub) |
| :--- | :--- | :--- | :--- |
| [#3](https://github.com/youtix/mia/security/dependabot/3) | Haute | [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c) | Denial of Service via unhandled error on excessive content-encodings |
| [#4](https://github.com/youtix/mia/security/dependabot/4) | Moyenne | [GHSA-9fm3-97px-rjf6](https://github.com/advisories/GHSA-9fm3-97px-rjf6) | WebSocket client Denial of Service via unbounded automatic PONG buffering |
| [#5](https://github.com/youtix/mia/security/dependabot/5) | Haute | [GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm) | Denial of Service via TLS 1.2 certificate-changing renegotiation |
| [#6](https://github.com/youtix/mia/security/dependabot/6) | Haute | [GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx) | TLS certificate validation bypass via dropped tls options in Agent |

Version installée : `undici@6.29.0` (`node_modules/npm/node_modules/undici`) ; corrigée à partir de `6.29.1` (branche 6.x).

Chaîne de dépendances :

```text
semantic-release@25.0.9
└── @semantic-release/npm@13.2.0   dépendance directe de semantic-release ("npm": "^11.6.2")
    └── npm@11.21.1                 dernière 11.x publiée (dist-tag next-11)
        └── node-gyp@12.4.0         embarqué dans npm ("undici": "^6.25.0")
            └── undici@6.29.0       embarqué dans npm ("inBundle": true dans package-lock.json)
```

Les alertes #1 (`ip-address`, [GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5)) et #2 (`undici`, [GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685)), rejetées automatiquement par GitHub, ont la même origine (paquets embarqués dans npm).

---

## 2. Pourquoi les alertes sont rejetées plutôt que corrigées

* **Aucun correctif applicable aujourd'hui** :
  * la mise à jour de sécurité Dependabot échoue (`security_update_not_possible` : « the available update path still resolves it to 6.29.0 ») ; les runs « Dependabot Updates » en échec des 27 et 28/10/2026 sont attendus ;
  * `overrides` ne s'applique pas aux dépendances embarquées (bundled) d'un paquet ;
  * retirer `@semantic-release/npm` de nos `devDependencies` ne le retire pas de l'arbre : `semantic-release` en dépend directement ;
  * npm 12 ne corrige rien : `npm@12.2.1` embarque aussi `undici@6.29.0` (et reste hors de la plage `^11.6.2`).
* **Exposition faible** :
  * dans le paquet npm, `undici` n'est utilisé que par `node-gyp` (`lib/download.js`), pour télécharger les en-têtes de Node lors de la compilation d'un addon natif ;
  * ce npm 11 s'exécute dans le job `release` (`npm version`, `npmPublish: false` : aucune publication) et, son binaire étant exposé dans `node_modules/.bin`, dans les hooks Husky et les scripts imbriqués (`validate:all`). Aucun de ces usages ne compile d'addon natif (les installations passent par le npm du système ou du runner) ;
  * rien n'est embarqué dans la PWA ni dans l'APK.
* ⚠️ **Ne pas compter sur Dependabot** : les alertes sont rejetées, et ses mises à jour hebdomadaires ne visent que les dépendances directes. Le correctif devra être appliqué à la main (cette chore).

---

## 3. Quand reprendre cette chore

Dès qu'une version **npm 11.x** embarque `undici >= 6.29.1`, ou qu'une version de `@semantic-release/npm` dépend d'un npm qui l'embarque :

```sh
npm view npm dist-tags.next-11                      # dernière 11.x publiée (11.21.1 au 28/10/2026)
curl -sL https://registry.npmjs.org/npm/-/npm-<version>.tgz \
  | tar -xzO package/node_modules/undici/package.json | grep '"version"'
npm view @semantic-release/npm dependencies.npm     # plage de npm requise ("^11.6.2" au 28/10/2026)
```

Points de contrôle : chaque PR Dependabot qui met à jour `semantic-release` ou `@semantic-release/*`, et **au plus tard au démarrage de [FEAT-16](./FEAT-16.md)**, qui modifie la chaîne de release.

---

## 4. Procédure

1. Créer une branche à jour depuis `main`.
2. Mettre à jour la dépendance transitive `npm` dans sa plage : `npm update npm` (ou merger la PR Dependabot de `@semantic-release/npm` si c'est elle qui apporte le correctif).
3. Vérifier :
   ```sh
   node -p "require('./node_modules/npm/node_modules/undici/package.json').version"   # >= 6.29.1
   npm audit
   ```
4. `npm run validate:all`.
5. Ouvrir une PR titrée `chore(deps-dev): update bundled npm to fix undici advisories` (aucune release).
6. Après le merge : vérifier qu'aucune alerte `undici` n'est ouverte sur la [page des alertes Dependabot](https://github.com/youtix/mia/security/dependabot), puis passer le statut de ce document à « Terminé » (date + PR).

---

## 5. Critères d'Acceptation (Definition of Done)

- [ ] `node_modules/npm/node_modules/undici` est en version `6.29.1` ou plus (ou npm n'embarque plus `undici`).
- [ ] `npm audit` ne signale plus `undici` (idéalement plus rien sous `node_modules/npm/`, voir `ip-address` #1).
- [ ] `npm run validate:all` passe.
- [ ] Le job `release` de la version suivante passe (`@semantic-release/npm` y exécute `npm version` avec ce npm).
