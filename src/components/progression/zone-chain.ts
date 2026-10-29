'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * Arrivée du curseur dans une zone D-Pad rejointe depuis une zone voisine (`onEdge`, FEAT-04 §5) :
 * - `keep` : position conservée (ex: retour à la dernière tuile depuis l'en-tête) ;
 * - `index` : élément donné ; `first` / `last` : premier / dernier élément ;
 * - `top` / `bottom` : arrivée par le haut / par le bas, même colonne (bornée aux éléments présents).
 */
export type ZoneEntry =
  | { kind: 'keep' }
  | { kind: 'index'; index: number }
  | { kind: 'first' }
  | { kind: 'last' }
  | { kind: 'top'; col: number }
  | { kind: 'bottom'; col: number };

/** Taille d'une zone : nombre d'éléments et colonnes affichées. */
export interface ZoneShape {
  count: number;
  cols: number;
}

/** Index d'arrivée dans la zone, `null` pour conserver le curseur. */
export function getZoneEntryIndex(entry: ZoneEntry, { count, cols }: ZoneShape): number | null {
  const last = Math.max(count - 1, 0);
  const width = Math.max(cols, 1);
  switch (entry.kind) {
    case 'keep':
      return null;
    case 'index':
      return Math.min(Math.max(entry.index, 0), last);
    case 'first':
      return 0;
    case 'last':
      return last;
    case 'top':
      return Math.min(Math.max(entry.col, 0), width - 1, last);
    case 'bottom': {
      const lastRowStart = Math.floor(last / width) * width;
      return Math.min(lastRowStart + Math.min(Math.max(entry.col, 0), width - 1), last);
    }
  }
}

/** Zone enfant inscrite auprès de l'écran qui enchaîne ses zones. */
export interface ZoneController {
  /** Place le curseur de la zone ; l'écran l'active (`isActive`) dans la même mise à jour. */
  enter: (entry: ZoneEntry) => void;
}

export interface ZoneRegistry<K> {
  /** Inscrit une zone ; renvoie sa désinscription. */
  register: (key: K, controller: ZoneController) => () => void;
  /** Positionne le curseur d'une zone inscrite (sans effet sinon). */
  enter: (key: K, entry: ZoneEntry) => void;
}

/**
 * Registre des zones D-Pad déclarées par les composants enfants d'un écran (cartes des jeux,
 * paliers) : depuis `onEdge`, l'écran positionne la zone cible puis l'active, dans le même
 * gestionnaire d'événement (un seul rendu, focus DOM posé directement au bon endroit).
 */
export function useZoneRegistry<K>(): ZoneRegistry<K> {
  const zonesRef = useRef<Map<K, ZoneController>>(null);

  const register = useCallback((key: K, controller: ZoneController) => {
    const zones = (zonesRef.current ??= new Map<K, ZoneController>());
    zones.set(key, controller);
    return () => {
      if (zones.get(key) === controller) zones.delete(key);
    };
  }, []);

  const enter = useCallback((key: K, entry: ZoneEntry) => {
    zonesRef.current?.get(key)?.enter(entry);
  }, []);

  return useMemo(() => ({ register, enter }), [register, enter]);
}

/** Inscrit une zone `useGridNavigation` auprès de l'écran (`useZoneRegistry`). */
export function useZoneController<K>(
  register: ZoneRegistry<K>['register'],
  key: K,
  { count, cols }: ZoneShape,
  setFocusedIndex: (index: number) => void,
): void {
  useEffect(
    () =>
      register(key, {
        enter: (entry) => {
          const index = getZoneEntryIndex(entry, { count, cols });
          if (index !== null) setFocusedIndex(index);
        },
      }),
    [register, key, count, cols, setFocusedIndex],
  );
}
