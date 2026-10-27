# FEAT-01 : Socle Next.js Statique (PWA) & Structure du Projet

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-01`
> **Dépendances** : Aucune (Première feature à implémenter)

---

## 1. Contexte & Objectif pour l'IA

Tu développes **Mia**, une application d'entraînement cérébral gratuite et open-source destinée à fonctionner sur **Smartphone, Tablette, Android TV (télécommande D-Pad)** et **Navigateur Web (PWA)**.

L'objectif de cette **FEAT-01** est d'initialiser le socle technique dans le dossier courant (`/home/alexeiananenko/Workspace/mia`) avec **Next.js (App Router)** configuré en **export statique (`output: 'export'`)**, **TypeScript strict**, **Tailwind CSS**, **Framer Motion**, **Lucide React**, **Vitest** pour les tests unitaires, et le manifeste **PWA**.

⚠️ **Périmètre strict** : N'implémente aucun jeu ni logique métier complexe dans cette feature. Crée uniquement le socle fonctionnel, l'arborescence normalisée, la configuration PWA et la suite de tests.

---

## 2. Contraintes Techniques Globales

1. **Export 100% Statique (`output: 'export'`)** : Aucune route API serveur, aucune Server Action, aucun SSR dynamique au runtime. Toute l'application doit compiler dans le dossier `out/` pour pouvoir être embarquée hors-ligne dans l'APK Android/TV (Capacitor) et hébergée sur GitHub Pages.
2. **Zéro service propriétaire** : N'utilise pas `next/font/google` avec téléchargement distant au runtime (préfère des polices système ou locales pour une conformité 100% hors-ligne et F-Droid).
3. **TypeScript strict** : `strict: true` dans `tsconfig.json`, aucun `any` implicite.

---

## 3. Fichiers à Créer / Configurer

```text
/home/alexeiananenko/Workspace/mia/
├── .gitignore
├── LICENSE                        # GPL-3.0-or-later (texte officiel GPLv3)
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.ts
├── eslint.config.mjs              # Config minimale exigée par ESLint 9 (remplacée par FEAT-02)
├── vitest.config.ts
├── vitest.setup.ts                # Matchers jest-dom + cleanup Testing Library
├── postcss.config.mjs
├── public/
│   ├── manifest.json
│   └── icons/
│       ├── icon-192.svg
│       ├── icon-512.svg
│       └── tv-banner.svg
├── src/
│   ├── app/
│   │   ├── _components/
│   │   │   └── FadeIn.tsx         # Fondu Framer Motion (client) de la page d'attente
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── types/
│   │   └── mia.ts
│   ├── components/
│   │   └── ui/.gitkeep
│   ├── core/
│   │   ├── navigation/.gitkeep
│   │   ├── storage/.gitkeep
│   │   └── progression/.gitkeep
│   └── games/
│       ├── memory/.gitkeep
│       └── traffic-jam/.gitkeep
└── tests/
    ├── setup.test.ts
    └── home-page.test.tsx
```

---

## 4. Spécifications Détaillées

### 4.1. Dépendances (`package.json`)
* **Dependencies** :
  * `next` (dernière version stable)
  * `react`, `react-dom`
  * `framer-motion`
  * `lucide-react`
  * `clsx`, `tailwind-merge`
  * `@capacitor/core`, `@capacitor/preferences`, `@capacitor/app`
* **DevDependencies** :
  * `typescript`, `@types/node`, `@types/react`, `@types/react-dom`
  * `tailwindcss`, `@tailwindcss/postcss`, `postcss`
  * `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`
  * `eslint`, `eslint-config-next`
  * `tsx` (pour exécuter les scripts CLI de validation de niveaux plus tard)
  * Ajouts : `@testing-library/dom` (peer de `@testing-library/react`) et `@fontsource-variable/atkinson-hyperlegible-next` (police, en `dependencies`). Bornes de versions : voir §6.
* **Scripts obligatoires dans `package.json`** :
  * `"dev": "next dev"`
  * `"build": "next build"`
  * `"start": "npx serve@latest out"`
  * `"lint": "eslint src tests"`
  * `"test": "vitest run"`
  * `"test:watch": "vitest"`
  * `"typecheck": "tsc --noEmit"`

### 4.2. Configuration Next.js (`next.config.ts`)
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  // Vide en local et pour l'APK Capacitor ; '/mia' en CI pour GitHub Pages (voir §6).
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
```

### 4.3. Types de Base Globaux (`src/types/mia.ts`)
Crée les types fondamentaux partagés par toutes les features suivantes :
```typescript
export type DifficultyTier = 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard';

export type GameId = 'memory' | 'traffic-jam';

export type InputMode = 'touch' | 'dpad';

export interface DifficultyTierMeta {
  id: DifficultyTier;
  order: number;
  label: string;
  subtitle: string;
  colorClass: string;
  badgeBgClass: string;
}

export const DIFFICULTY_TIERS: Record<DifficultyTier, DifficultyTierMeta> = {
  very_easy: {
    id: 'very_easy',
    order: 1,
    label: 'Très Facile',
    subtitle: 'Éveil',
    colorClass: 'text-emerald-400',
    badgeBgClass: 'bg-emerald-500/20 border-emerald-400',
  },
  easy: {
    id: 'easy',
    order: 2,
    label: 'Facile',
    subtitle: 'Initié',
    colorClass: 'text-sky-400',
    badgeBgClass: 'bg-sky-500/20 border-sky-400',
  },
  medium: {
    id: 'medium',
    order: 3,
    label: 'Moyen',
    subtitle: 'Confirmé',
    colorClass: 'text-amber-400',
    badgeBgClass: 'bg-amber-500/20 border-amber-400',
  },
  hard: {
    id: 'hard',
    order: 4,
    label: 'Difficile',
    subtitle: 'Expert',
    colorClass: 'text-orange-400',
    badgeBgClass: 'bg-orange-500/20 border-orange-400',
  },
  very_hard: {
    id: 'very_hard',
    order: 5,
    label: 'Très Difficile',
    subtitle: 'Maître',
    colorClass: 'text-purple-400',
    badgeBgClass: 'bg-purple-500/20 border-purple-400',
  },
};
```

### 4.4. Manifeste PWA (`public/manifest.json`)
* `name`: `"Mia - Entraînement Cérébral"`
* `short_name`: `"Mia"`
* `display`: `"standalone"`
* `orientation`: `"any"` (pour autoriser le portrait sur mobile et le paysage sur tablette/TV)
* `background_color`: `"#0f172a"` (Slate 900, doux pour les yeux sur une grande TV dans un salon sombre)
* `theme_color`: `"#38bdf8"`

### 4.5. Page d'attente minimale (`src/app/page.tsx`)
* Affiche le titre `"Mia"`, son sous-titre `"Entraînement cérébral pour Mobile, Tablette & TV"` et la liste des 5 paliers cognitifs à partir de `DIFFICULTY_TIERS`.

---

## 5. Critères d'Acceptation (Definition of Done)

Avant de terminer cette tâche, vérifie impérativement que toutes les commandes suivantes passent avec un code de retour `0` :
- [ ] `npm run typecheck` passe sans aucune erreur TypeScript.
- [ ] `npm run lint` passe sans erreur.
- [ ] `npm run test` exécute `tests/setup.test.ts` (qui vérifie que les 5 paliers `DIFFICULTY_TIERS` sont bien ordonnés de 1 à 5) et réussit.
- [ ] `npm run build` génère le dossier statique `out/` contenant `index.html`.

---

## 6. Décisions d'implémentation (session de cadrage)

Décisions prises avant l'implémentation ; elles complètent ou précisent les sections ci-dessus.

| Sujet | Décision |
| :--- | :--- |
| **Gestionnaire de paquets** | **npm** (`package-lock.json` versionné). |
| **`package.json`** | `"private": true`, `"license": "GPL-3.0-or-later"`, `"type": "module"` (requis par le futur chargeur natif de config de Vite/Vitest ; les configs `.mjs`/`.ts` restent compatibles). |
| **Bornes de versions** | `typescript ~6.0.x` (peer de `typescript-eslint` : `<6.1.0`, TS 7 non supporté) · `eslint ^9` (les plugins de `eslint-config-next` s'arrêtent à ESLint 9) · `jsdom ^29` (jsdom 30 exige Node ≥ 22.22) · `@types/node ^22`. **Node minimum réel : 22.13** (jsdom 29, Vitest 5, Vite 8). |
| **`basePath`** | Lu depuis `NEXT_PUBLIC_BASE_PATH` (vide par défaut → local et APK Capacitor servis à la racine). Le job de déploiement GitHub Pages de FEAT-02 le définit (ex. `/mia`). Le manifeste n'utilise que des URL relatives (`./`, `icons/…`). Dans `layout.tsx`, `metadata.manifest` et `metadata.icons` sont préfixés explicitement : Next n'applique **pas** le `basePath` aux URL texte des métadonnées. |
| **TypeScript** | `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride` + `noFallthroughCasesInSwitch`. Alias `@/*` → `src/*`. |
| **Typecheck sur clone vierge** | `next-env.d.ts` est ignoré par Git et `.next/` n'existe pas en CI avant le build : ne pas utiliser les helpers générés `LayoutProps` / `PageProps`, typer les props explicitement pour que `npm run typecheck` passe avant `npm run build`. |
| **Police** | **Atkinson Hyperlegible Next** (variable, licence OFL-1.1), auto-hébergée via `@fontsource-variable/atkinson-hyperlegible-next` importé dans `layout.tsx`, exposée comme `--font-sans` dans le bloc `@theme` de `globals.css`, avec repli sur la pile système. Aucun `next/font/google`. |
| **Tailwind** | `@import 'tailwindcss' source('../');` dans `globals.css` : seul `src/` est scanné (les `docs/*.md` citent de nombreuses classes qui gonfleraient le CSS). `<body>` en `bg-slate-900` (aligné sur `background_color` du manifeste). |
| **Navigateurs / WebView minimum** | **Chrome / Android System WebView 111+, Safari 16.4+** (exigence de Tailwind v4 et Next 16). Garde-fou APK (`minWebViewVersion` + page d'erreur) : voir FEAT-15 §3.1. |
| **Page d'attente** | Une icône Lucide par palier (`Sprout`, `Footprints`, `Target`, `Mountain`, `GraduationCap`), fondu Framer Motion via `src/app/_components/FadeIn.tsx` (`MotionConfig reducedMotion="user"`), liste `<ol>` nommée par son titre. |
| **Tests** | Vitest sans `globals` (imports explicites depuis `vitest`). `vitest.setup.ts` charge `@testing-library/jest-dom/vitest` et appelle `cleanup()` après chaque test. `tests/home-page.test.tsx` vérifie le rendu de la page en plus de `tests/setup.test.ts`. |
| **Icônes** | SVG uniquement : monogramme « M » tracé comme un chemin neuronal (trait sky-400, nœuds, fond slate-900 plein), symbole contenu dans le cercle central de 80 % (zone sûre `maskable`). La bannière TV réutilise le « M » comme initiale de « Mia » (lettres en chemins, sans police). PNG, `maskable` et `apple-touch-icon` → **FEAT-17**. |
| **Hors-ligne Web** | Aucun service worker dans FEAT-01 → **FEAT-17**. |
| **Licence** | **GPL-3.0-or-later** (fichier `LICENSE`). |
| **Git** | Dépôt initialisé sur `main`, sans commit (le premier commit est laissé au mainteneur). |
