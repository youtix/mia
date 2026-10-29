'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

/** Paramètre d'adresse du niveau lancé (`/memory/?level=mem-005`) : identifiant stable du niveau. */
export const LEVEL_SEARCH_PARAM = 'level';

/** `basePath` de l'export statique (ex: `/mia` sur GitHub Pages), vide en local et dans l'APK. */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Route d'un niveau, à passer au routeur (qui ajoute `basePath` et la barre finale). */
export function getLevelHref(path: string, levelId: string): string {
  return `${path}?${new URLSearchParams({ [LEVEL_SEARCH_PARAM]: levelId }).toString()}`;
}

/** Chemin sans barre finale : `/mia/memory/` et `/mia/memory` désignent la même page. */
function trimTrailingSlash(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * L'entrée d'historique précédente est-elle `target` (même chemin, même requête) ? Lue avec la
 * Navigation API (Chromium, WebView Android) ; `false` si elle est absente ou si l'entrée
 * précédente est inconnue (premier écran de l'onglet, autre site).
 */
export function isPreviousHistoryEntry(target: URL): boolean {
  const { navigation } = window as { navigation?: Navigation };
  const current = navigation?.currentEntry;
  if (!navigation || !current) return false;
  const previousUrl = navigation.entries()[current.index - 1]?.url;
  if (!previousUrl) return false;
  const previous = new URL(previousUrl);
  return (
    previous.origin === target.origin &&
    trimTrailingSlash(previous.pathname) === trimTrailingSlash(target.pathname) &&
    previous.search === target.search
  );
}

/** Adresse actuelle avec le niveau donné, ou sans niveau (`null` : Carte des Étoiles). */
function withLevel(levelId: string | null): string {
  const url = new URL(window.location.href);
  if (levelId === null) url.searchParams.delete(LEVEL_SEARCH_PARAM);
  else url.searchParams.set(LEVEL_SEARCH_PARAM, levelId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export interface GameNavigation {
  /** Lance un niveau depuis la carte : nouvelle entrée (le Retour du navigateur ramène à la carte). */
  openLevel: (levelId: string) => void;
  /** Passe à un autre niveau (ex: Étoile suivante) en remplaçant l'entrée du niveau en cours. */
  replaceLevel: (levelId: string) => void;
  /** Retire le niveau de l'adresse sans nouvelle entrée (niveau inconnu ou verrouillé). */
  clearLevel: () => void;
  /** Retour à la Carte des Étoiles. */
  exitToMap: () => void;
  /** Retour au Hub. */
  backToHub: () => void;
}

/**
 * Navigation d'une page de jeu. Carte ↔ niveau : `history.pushState` / `replaceState` natifs, que
 * Next.js synchronise avec `useSearchParams`, sans requête réseau (jeu hors-ligne). Retour à
 * l'écran parent : l'historique est dépilé quand l'entrée précédente est ce parent (le Retour du
 * navigateur et celui de Mia coïncident), sinon l'entrée est remplacée par lui (adresse ouverte
 * directement, niveau lancé depuis le Hub) : Retour ne quitte jamais Mia.
 */
export function useGameNavigation(): GameNavigation {
  const router = useRouter();

  return useMemo(
    () => ({
      openLevel: (levelId) => {
        window.history.pushState(null, '', withLevel(levelId));
      },
      replaceLevel: (levelId) => {
        window.history.replaceState(null, '', withLevel(levelId));
      },
      clearLevel: () => {
        window.history.replaceState(null, '', withLevel(null));
      },
      exitToMap: () => {
        const map = withLevel(null);
        if (isPreviousHistoryEntry(new URL(map, window.location.href))) router.back();
        else window.history.replaceState(null, '', map);
      },
      backToHub: () => {
        if (isPreviousHistoryEntry(new URL(`${BASE_PATH}/`, window.location.href))) router.back();
        else router.replace('/');
      },
    }),
    [router],
  );
}
