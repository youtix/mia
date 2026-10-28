'use client';

import { MotionConfig, motion } from 'framer-motion';
import type { ReactNode } from 'react';

export interface FadeInProps {
  children: ReactNode;
  /** Délai avant l'apparition, en secondes (ex: indicateur de chargement sans clignotement) */
  delay?: number;
  className?: string;
}

/** Apparition en fondu (et légère montée, sauf si le système demande de réduire les animations). */
export function FadeIn({ children, delay = 0, className }: FadeInProps) {
  return (
    // reducedMotion="user" : respecte le réglage système « réduire les animations ».
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
