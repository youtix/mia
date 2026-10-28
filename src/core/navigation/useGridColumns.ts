'use client';

import { useMemo, useState, useSyncExternalStore, type RefCallback } from 'react';

/**
 * Colonnes affichées d'une grille CSS : pistes de la valeur calculée de `grid-template-columns`
 * (« 136px 136px 136px », noms de lignes ignorés). `0` si la grille n'est pas mesurable : élément
 * non affiché, valeur non résolue (`none`, `repeat(…)`) ou environnement sans mise en page (jsdom).
 */
export function countGridColumns(element: Element): number {
  const value = getComputedStyle(element)
    .getPropertyValue('grid-template-columns')
    .replace(/\[[^\]]*\]/g, ' ')
    .trim();
  if (value === '' || value === 'none' || value.includes('(')) return 0;
  return value.split(/\s+/).length;
}

interface ColumnStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => number;
}

function createColumnStore(element: HTMLElement | null): ColumnStore {
  let columns: number | null = null;
  const measure = () => (element ? countGridColumns(element) : 0);

  return {
    subscribe: (onChange) => {
      if (!element || typeof ResizeObserver === 'undefined') return () => undefined;
      // Les colonnes d'une grille `auto-fill` suivent la largeur du conteneur (rotation, mode TV).
      const observer = new ResizeObserver(() => {
        const next = measure();
        if (next === columns) return;
        columns = next;
        onChange();
      });
      observer.observe(element);
      return () => {
        observer.disconnect();
      };
    },
    getSnapshot: () => (columns ??= measure()),
  };
}

/** Pré-rendu statique : rien à mesurer. */
const getServerColumns = () => 0;

/**
 * `[ref, cols]` : `ref` du conteneur `display: grid` et colonnes affichées (`fallback` tant
 * qu'elles ne sont pas mesurables : pré-rendu, jsdom). Paire plutôt qu'objet, comme `useState` :
 * le React Compiler (`react-hooks/refs`) tient pour une ref tout objet dont une propriété sert de
 * `ref` JSX, et refuserait alors de lire `cols` pendant le rendu.
 */
export type UseGridColumnsResult<T extends HTMLElement> = [ref: RefCallback<T>, cols: number];

/**
 * Colonnes d'une grille responsive pour `useGridNavigation` : la feuille de style reste la seule
 * source de la mise en page (`grid-cols-*` par point de rupture, `tv:`, `auto-fill`), sans
 * navigation géométrique sur le DOM (FEAT-04 §5).
 */
export function useGridColumns<T extends HTMLElement = HTMLElement>(
  fallback: number,
): UseGridColumnsResult<T> {
  const [element, setElement] = useState<T | null>(null);
  const store = useMemo(() => createColumnStore(element), [element]);
  const measured = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerColumns);
  return [setElement, measured > 0 ? measured : Math.max(1, fallback)];
}
