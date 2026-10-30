import { FOCUSED_CLASSES, FOCUS_VISIBLE_CLASSES } from '@/components/ui/focus-styles';
import { cn } from '@/lib/cn';
import { motion } from 'framer-motion';
import type { Ref } from 'react';
import type { BearSortRule, BearTraits } from '../types';
import { RulePicture } from './RulePicture';
import { StopSign } from './StopSign';

export interface StopOverlayProps {
  /** Règle qui commence après le panneau : son image ici, la voix la dit au redémarrage */
  upcomingRule: BearSortRule;
  /** Boîte de gauche de l'étoile : l'image de la règle se lit dans le même sens que les boîtes */
  leftBox: BearTraits;
  /** Attente imposée terminée : le panneau pulse et peut être touché */
  isActive: boolean;
  /** Le moteur D-Pad cible le panneau */
  isFocused: boolean;
  /** Prop React 19 : focus DOM synchronisé par le plateau (FEAT-04) */
  ref?: Ref<HTMLButtonElement>;
  /** Le panneau, déjà actif, est touché */
  onContinue: () => void;
}

/**
 * Panneau STOP : voile sur tout le plateau, grand panneau et image de la prochaine règle. Le bouton
 * reste focalisable pendant l'attente (`aria-disabled`, jamais `disabled`) : il garde le focus D-Pad
 * et le lecteur d'écran le trouve, mais rien ne se passe avant la fin de l'attente.
 */
export function StopOverlay({
  upcomingRule,
  leftBox,
  isActive,
  isFocused,
  ref,
  onContinue,
}: StopOverlayProps) {
  return (
    <motion.div
      data-stop-overlay="true"
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-2xl bg-slate-950/80 p-2 backdrop-blur-sm landscape:flex-row landscape:gap-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <button
        ref={ref}
        type="button"
        aria-label="Panneau stop : continuer"
        aria-disabled={!isActive}
        data-active={isActive || undefined}
        data-focused={isFocused || undefined}
        className={cn(
          'relative aspect-square w-[min(58vmin,22rem)] max-w-full shrink rounded-full',
          isActive ? 'cursor-pointer' : 'cursor-default',
          FOCUS_VISIBLE_CLASSES,
          isFocused && FOCUSED_CLASSES,
        )}
        onClick={isActive ? onContinue : undefined}
      >
        <StopSign isPulsing={isActive} className="size-full" />
      </button>
      <RulePicture rule={upcomingRule} leftBox={leftBox} className="w-[min(56vmin,24rem)] shrink" />
    </motion.div>
  );
}
