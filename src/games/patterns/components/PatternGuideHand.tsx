'use client';

import { motion } from 'framer-motion';
import { Pointer } from 'lucide-react';

/**
 * Main fantôme (`hasGuide`, premier défi) : mime la tape sur la bonne proposition, seul mode d'emploi
 * d'un jeu sans texte. Décorative, elle laisse passer les tapes ; immobile si le système demande de
 * réduire les animations (`MotionConfig` du plateau : `transform` seul).
 */
export function PatternGuideHand() {
  return (
    <motion.span
      aria-hidden="true"
      data-guide-hand
      className="pointer-events-none absolute top-1/2 left-1/2 z-10 block aspect-square h-1/2 max-w-3/5 -translate-x-1/4"
      animate={{ y: ['0%', '-20%', '0%'], scale: [1, 0.86, 1] }}
      transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.3 }}
    >
      <Pointer className="size-full fill-white text-slate-900" />
    </motion.span>
  );
}
