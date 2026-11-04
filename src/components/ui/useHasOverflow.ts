'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Contenu plus haut que sa boîte : seule une colonne qui déborde vraiment laisse le navigateur
 * défiler (`data-touch-scroll`), car un défilement, même sans rien à faire défiler, annule tous les
 * pointeurs de l'écran. Mesuré à chaque rendu (le contenu change) et quand la boîte change de taille
 * (rotation, fenêtre).
 */
export function useHasOverflow<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  const measure = () => {
    const element = ref.current;
    if (element) setHasOverflow(element.scrollHeight > element.clientHeight + 1);
  };

  useLayoutEffect(measure);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setHasOverflow(element.scrollHeight > element.clientHeight + 1);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return [ref, hasOverflow];
}
