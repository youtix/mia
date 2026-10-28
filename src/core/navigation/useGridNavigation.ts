'use client';

import { useCallback, useEffect, useRef, useState, type RefCallback } from 'react';
import { coordToIndex, getGridItemCount, indexToCoord, moveInGrid } from './grid-math';
import { useNavigationScope } from './NavigationContext';
import type { Direction, GridCoord, InputMode } from './types';

export interface UseGridNavigationOptions {
  /** Identifiant unique de la zone (ex: "memory-board", "modal-victory") */
  scopeId: string;
  rows: number;
  cols: number;
  totalItems?: number;
  /** Position du curseur au montage (lue une seule fois, comme `useState`) */
  initialIndex?: number;
  isActive?: boolean;
  /** Boucle d'un bord à l'autre de la ligne ou de la colonne (défaut : arrêt aux bords) */
  wrap?: boolean;
  /** OK sur l'élément ciblé. Absent : clic sur l'élément de `getItemRef`, comme au doigt. */
  onSelect?: (index: number, coord: GridCoord) => void;
  onBack?: () => void;
  /** Flèche bloquée au bord : passer à la zone voisine (`isActive` + `setFocusedIndex`). */
  onEdge?: (direction: Direction, coord: GridCoord) => void;
}

export interface UseGridNavigationResult {
  focusedIndex: number;
  focusedCoord: GridCoord;
  setFocusedIndex: (index: number) => void;
  inputMode: InputMode;
  /** Anneau de focus : zone active, saisie au D-Pad et curseur sur cet élément */
  isItemFocused: (index: number) => boolean;
  /** `ref` de l'élément `index` : au D-Pad, le focus DOM et le défilement suivent le curseur */
  getItemRef: (index: number) => RefCallback<HTMLElement>;
  /** La zone reçoit les touches (couche du dessus, activée en dernier) */
  isActive: boolean;
}

/** Focus DOM (annonces TalkBack) sur l'élément du curseur, défilé dans la vue au besoin. */
function revealElement(element: HTMLElement | undefined): void {
  if (!element) return;
  if (element !== document.activeElement) element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** Navigation clé-en-main dans une grille `rows x cols` (ou une liste : `rows` ou `cols` à 1). */
export function useGridNavigation(options: UseGridNavigationOptions): UseGridNavigationResult {
  const {
    scopeId,
    rows,
    cols,
    totalItems,
    initialIndex = 0,
    isActive: isRequested = true,
    wrap = false,
    onSelect,
    onBack,
    onEdge,
  } = options;
  const itemCount = getGridItemCount({ rows, cols, totalItems });
  const [storedIndex, setStoredIndex] = useState(initialIndex);
  // Borné à la lecture : la grille peut rétrécir (ex: profil supprimé).
  const focusedIndex = Math.min(Math.max(storedIndex, 0), Math.max(itemCount - 1, 0));
  const focusedCoord = indexToCoord(focusedIndex, cols);
  const itemsRef = useRef<Map<number, HTMLElement>>(null);

  const { isActive, isFocusVisible, inputMode } = useNavigationScope({
    scopeId,
    isActive: isRequested,
    onDirection: (direction) => {
      const next = moveInGrid(focusedCoord, direction, { rows, cols, totalItems, wrap });
      const nextIndex = coordToIndex(next, cols);
      if (nextIndex !== focusedIndex) {
        setStoredIndex(nextIndex);
        return;
      }
      // Bloqué au bord : ramène quand même le focus DOM dans la zone (ex: depuis un champ de saisie).
      revealElement(itemsRef.current?.get(focusedIndex));
      onEdge?.(direction, focusedCoord);
    },
    onSelect: () => {
      if (itemCount === 0) return;
      if (onSelect) onSelect(focusedIndex, focusedCoord);
      else itemsRef.current?.get(focusedIndex)?.click();
    },
    onBack,
    getFocusedElement: () => itemsRef.current?.get(focusedIndex) ?? null,
    ownsElement: (element) =>
      Array.from(itemsRef.current?.values() ?? []).some((item) => item.contains(element)),
  });

  // Curseur → focus DOM et défilement, au D-Pad uniquement (activation, réveil, déplacement).
  useEffect(() => {
    if (isFocusVisible) revealElement(itemsRef.current?.get(focusedIndex));
  }, [isFocusVisible, focusedIndex]);

  // Focus DOM (Tab, clic) → curseur.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      for (const [index, element] of itemsRef.current ?? []) {
        if (element === event.target) {
          setStoredIndex(index);
          return;
        }
      }
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  const getItemRef = useCallback(
    (index: number): RefCallback<HTMLElement> =>
      (element) => {
        if (!element) return;
        const items = (itemsRef.current ??= new Map<number, HTMLElement>());
        items.set(index, element);
        // React détache l'ancien élément d'un index avant d'attacher le nouveau.
        return () => {
          items.delete(index);
        };
      },
    [],
  );

  const setFocusedIndex = useCallback((index: number) => {
    setStoredIndex(Math.max(index, 0));
  }, []);

  return {
    focusedIndex,
    focusedCoord,
    setFocusedIndex,
    inputMode,
    isItemFocused: (index) => isFocusVisible && index === focusedIndex && index < itemCount,
    getItemRef,
    isActive,
  };
}
