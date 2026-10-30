'use client';

import { cn } from '@/lib/cn';
import { motion } from 'framer-motion';

const PARTICLE_COUNT = 12;

const PARTICLE_COLORS: readonly string[] = [
  'bg-amber-300',
  'bg-sky-300',
  'bg-rose-300',
  'bg-emerald-300',
];

/** Distance parcourue, en % de la taille d'une particule : elle suit donc la taille de la cible. */
const NEAR_TRAVEL = 520;
const FAR_TRAVEL = 720;

/**
 * Petites formes rayonnant depuis la cible à la réussite. Angles calculés depuis l'index, sans hasard ;
 * `transform` et `opacity` seulement (boîtiers TV modestes). Décoratives.
 */
export function PatternParticles() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
      {Array.from({ length: PARTICLE_COUNT }, (_, index) => {
        const angle = (index / PARTICLE_COUNT) * 2 * Math.PI;
        const travel = index % 2 === 0 ? FAR_TRAVEL : NEAR_TRAVEL;
        return (
          <motion.span
            key={index}
            data-particle
            className={cn(
              'absolute top-[43%] left-[43%] block size-[14%]',
              index % 2 === 0 ? 'rounded-full' : 'rounded-[2px]',
              PARTICLE_COLORS[index % PARTICLE_COLORS.length],
            )}
            initial={{ x: '0%', y: '0%', scale: 0, opacity: 1 }}
            animate={{
              x: `${String(Math.round(Math.cos(angle) * travel))}%`,
              y: `${String(Math.round(Math.sin(angle) * travel))}%`,
              scale: [0, 1, 0.5],
              opacity: [1, 1, 0],
            }}
            transition={{ duration: 0.85, ease: 'easeOut' }}
          />
        );
      })}
    </span>
  );
}
