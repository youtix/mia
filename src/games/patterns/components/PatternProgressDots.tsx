'use client';

import { cn } from '@/lib/cn';
import { motion } from 'framer-motion';
import { formatRoundLabel } from './labels';

type DotState = 'done' | 'current' | 'todo';

/** États distincts aussi sans la couleur : disque plein, grand anneau, petit contour. */
const DOT_CLASSES: Readonly<Record<DotState, string>> = {
  done: 'size-4 bg-emerald-300 tv:size-5',
  current: 'size-5 border-4 border-sky-300 tv:size-6',
  todo: 'size-3 border-2 border-slate-500 tv:size-4',
};

export interface PatternProgressDotsProps {
  /** Défis de l'étoile */
  rounds: number;
  /** Défi en cours (base 0) */
  roundIndex: number;
  /** Le défi en cours est réussi : son point est déjà plein */
  isRoundSolved: boolean;
}

/** Progression dans l'étoile, sans chiffre : un point par défi, centré dans l'en-tête. */
export function PatternProgressDots({
  rounds,
  roundIndex,
  isRoundSolved,
}: PatternProgressDotsProps) {
  return (
    <div
      role="img"
      aria-label={formatRoundLabel(roundIndex, rounds)}
      className="flex min-w-0 flex-1 items-center justify-center gap-2 tv:gap-3"
    >
      {Array.from({ length: rounds }, (_, index) => {
        let state: DotState = 'todo';
        if (index < roundIndex || (index === roundIndex && isRoundSolved)) state = 'done';
        else if (index === roundIndex) state = 'current';
        return (
          // Clé liée à l'état : le point gonfle quand il change, en `transform` seul.
          <motion.span
            key={`${String(index)}-${state}`}
            data-state={state}
            className={cn('shrink-0 rounded-full', DOT_CLASSES[state])}
            initial={{ scale: state === 'todo' ? 1 : 0.4 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          />
        );
      })}
    </div>
  );
}
