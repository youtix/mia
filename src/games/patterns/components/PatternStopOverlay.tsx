'use client';

import { cn } from '@/lib/cn';
import { motion } from 'framer-motion';
import { Hand } from 'lucide-react';
import { useState } from 'react';

/**
 * Moitié d'anneau : un cercle dont deux côtés de la bordure seulement sont colorés, soit un demi-cercle
 * une fois tourné de 45°. Aussi large que l'anneau entier, dans une zone de découpe deux fois plus étroite.
 */
const RING_SEGMENT_CLASSES =
  'absolute top-0 h-full w-[200%] rounded-full border-[6px] border-transparent tv:border-8';

/**
 * Anneau qui se vide en `seconds`, dans le sens horaire, en `transform` seul (boîtiers TV modestes) :
 * chaque moitié tourne d'un demi-tour hors de sa zone de découpe, la droite d'abord, puis la gauche.
 */
function StopRing({ seconds }: { seconds: number }) {
  const halfSeconds = seconds / 2;

  return (
    <span className="absolute inset-0">
      <span className="absolute inset-0 rounded-full border-[6px] border-slate-700 bg-slate-950/85 tv:border-8" />
      <span className="absolute inset-y-0 right-0 w-1/2 overflow-hidden">
        <motion.span
          className={cn(RING_SEGMENT_CLASSES, 'right-0 border-t-amber-300 border-r-amber-300')}
          initial={{ rotate: 45 }}
          animate={{ rotate: 225 }}
          transition={{ duration: halfSeconds, ease: 'linear' }}
        />
      </span>
      <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
        <motion.span
          className={cn(RING_SEGMENT_CLASSES, 'left-0 border-b-amber-300 border-l-amber-300')}
          initial={{ rotate: 45 }}
          animate={{ rotate: 225 }}
          transition={{ duration: halfSeconds, delay: halfSeconds, ease: 'linear' }}
        />
      </span>
    </span>
  );
}

/** Panneau octogonal rouge orné d'une main ouverte, sans lettres : un dessin à reconnaître, pas à lire. */
function StopSign() {
  return (
    <span className="absolute inset-[13%]">
      <svg viewBox="0 0 100 100" className="size-full">
        <polygon
          points="30,3 70,3 97,30 97,70 70,97 30,97 3,70 3,30"
          strokeWidth="5"
          className="fill-red-600 stroke-white"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <Hand className="size-3/5 text-white" strokeWidth={2.5} />
      </span>
    </span>
  );
}

/** Rotation d'une tape : la mascotte gigote, rien de plus (une pause n'est pas une punition). */
const MASCOT_WOBBLE = [0, -16, 13, -8, 4, 0];

/** Petite mascotte amicale, dessinée ici : deux oreilles, de grands yeux et un sourire. */
function StopMascot({ wobbleTick, isWobbling }: { wobbleTick: number; isWobbling: boolean }) {
  return (
    <motion.svg
      // Clé : la même animation repart à chaque tape, même rapprochée.
      key={wobbleTick}
      data-mascot
      data-wobble-tick={wobbleTick}
      data-wobbling={isWobbling || undefined}
      viewBox="0 0 64 64"
      className="absolute aspect-square -translate-x-1/2 portrait:bottom-[66%] portrait:left-[74%] portrait:w-[clamp(3rem,11dvh,5rem)] landscape:top-[20%] landscape:left-2/3 landscape:h-3/5"
      initial={{ rotate: 0 }}
      animate={{ rotate: isWobbling ? MASCOT_WOBBLE : 0 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    >
      <path d="M10 18 19 5l8 13ZM54 18 45 5l-8 13Z" className="fill-emerald-300" />
      <circle cx="32" cy="35" r="25" className="fill-emerald-300" />
      <ellipse cx="32" cy="44" rx="15" ry="12" className="fill-emerald-100" />
      <circle cx="23" cy="29" r="7" className="fill-white" />
      <circle cx="41" cy="29" r="7" className="fill-white" />
      <circle cx="24" cy="30" r="3.5" className="fill-slate-900" />
      <circle cx="40" cy="30" r="3.5" className="fill-slate-900" />
      <path
        d="M24 42q8 8 16 0"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-slate-900"
      />
    </motion.svg>
  );
}

export interface PatternStopOverlayProps {
  /** Durée du STOP, sur laquelle l'anneau se vide */
  stopSeconds: number;
  /** Tapes pendant les STOP de la partie (`impulsiveTaps`) : chaque nouvelle tape fait gigoter la mascotte */
  wobbleTick: number;
}

/**
 * STOP : panneau et mascotte au-dessus des propositions, assombries mais visibles : l'enfant doit
 * pouvoir réfléchir à sa réponse, rien ne cache leurs icônes. En paysage, ils se placent entre deux
 * propositions ; en portrait, les colonnes sont trop étroites : ils sortent par le haut, dans l'espace
 * libre sous la ligne. Le calque laisse passer les tapes pour qu'elles soient comptées
 * (`impulsiveTaps`) ; monté uniquement pendant `stop`. Décoratif : le STOP est annoncé par la région
 * `role="status"` du plateau.
 */
export function PatternStopOverlay({ stopSeconds, wobbleTick }: PatternStopOverlayProps) {
  // Compteur à l'ouverture de ce STOP : les tapes d'un STOP précédent ne font pas gigoter celui-ci.
  const [firstTick] = useState(wobbleTick);

  return (
    <motion.div
      aria-hidden="true"
      data-stop-overlay
      className="pointer-events-none absolute inset-0 z-20"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <span className="absolute aspect-square -translate-x-1/2 portrait:bottom-[66%] portrait:left-[42%] portrait:w-[clamp(5rem,18dvh,8rem)] landscape:top-[3%] landscape:left-1/3 landscape:h-[94%]">
        <StopRing seconds={stopSeconds} />
        <StopSign />
      </span>
      <StopMascot wobbleTick={wobbleTick} isWobbling={wobbleTick > firstTick} />
    </motion.div>
  );
}
