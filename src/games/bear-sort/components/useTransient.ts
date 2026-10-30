'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type UseTransientResult<T> = [
  value: T | null,
  /** Montre `value` pendant `durationMs`, en relançant le délai s'il court déjà */
  show: (value: T) => void,
  /** Efface la valeur sans attendre */
  clear: () => void,
];

/**
 * Valeur éphémère (ex: ours qui remue, boîte qui pulse) : posée par un geste, elle s'efface seule.
 * Le délai part de `show`, jamais d'un effet : rejoué sous StrictMode, il ne doublerait rien.
 */
export function useTransient<T>(durationMs: number): UseTransientResult<T> {
  const [value, setValue] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clear = useCallback(() => {
    clearTimeout(timerRef.current);
    setValue(null);
  }, []);

  const show = useCallback(
    (next: T) => {
      clearTimeout(timerRef.current);
      setValue(next);
      timerRef.current = setTimeout(() => {
        setValue(null);
      }, durationMs);
    },
    [durationMs],
  );

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
    },
    [],
  );

  return [value, show, clear];
}
