'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * `true` tant que la media query `query` correspond, mis à jour quand la fenêtre change. Sans
 * `matchMedia` (pré-rendu statique, jsdom), `fallback`.
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
}
