'use client';

import {
  FOCUS_TRANSITION_CLASSES,
  FOCUS_VISIBLE_CLASSES,
  FOCUSED_CLASSES,
} from '@/components/ui/focus-styles';
import type { SoundBeat } from '@/core/audio/types';
import { cn } from '@/lib/cn';
import { motion } from 'framer-motion';
import { Check, Volume2 } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import type { PatternChoice } from '../types';
import { formatHintedLabel, getChoiceLabel } from './labels';
import { PatternBeatIcon, PatternItemIcon } from './PatternItemIcon';

/**
 * Rebond d'une mauvaise réponse : deux sauts de plus en plus petits. `opacity` en plus de `transform` :
 * elle seule subsiste quand le système demande de réduire les animations, et l'enfant voit sa tape.
 */
const WRONG_BOUNCE = { y: ['0%', '-14%', '0%', '-6%', '0%'], opacity: [1, 0.55, 1, 0.8, 1] };

/**
 * Sons coupés : deux lignes de deux pour A-B-A-B, sinon des lignes de trois (une unité A-B-B). Taille
 * relative au bouton, du téléphone au grand téléviseur : l'image doit se lire à 3 mètres.
 */
function getPictogramGrid(beatCount: number): { columns: string; cell: string } {
  if (beatCount === 4) return { columns: 'grid-cols-2', cell: 'size-[44cqmin]' };
  return {
    columns: 'grid-cols-3',
    cell: beatCount === 3 ? 'size-[min(30cqw,80cqh)]' : 'size-[min(30cqw,44cqh)]',
  };
}

/** Son coupé : la suite s'affiche en images, une par temps, et elles restent tant que c'est armé. */
function BeatPictograms({ beats, shown }: { beats: readonly SoundBeat[]; shown: number }) {
  const { columns, cell } = getPictogramGrid(beats.length);

  return (
    <span className="@container-size flex size-full items-center justify-center">
      <span className={cn('grid place-items-center gap-1', columns)}>
        {beats.map((beat, index) => (
          // Case réservée d'avance : les images déjà là ne bougent pas quand la suivante apparaît.
          <span key={index} className={cell}>
            {index < shown ? (
              <motion.span
                data-beat-icon={beat}
                className="block size-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              >
                <PatternBeatIcon beat={beat} className="size-full" />
              </motion.span>
            ) : null}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Proposition sonore : un haut-parleur neutre qui ne révèle jamais le motif. Avec le son, même
 * pulsation à chaque temps, pour la cloche comme pour le tambour ; les images n'apparaissent qu'avec
 * le son coupé (FEAT-21 §4).
 */
function SoundFace({
  beats,
  state,
  beatIndex,
  isSoundEnabled,
}: {
  beats: readonly SoundBeat[];
  state: PatternChoiceState;
  beatIndex: number;
  isSoundEnabled: boolean;
}) {
  if (!isSoundEnabled && state !== 'idle') {
    const shown = state === 'armed' ? beats.length : Math.min(beatIndex + 1, beats.length);
    return <BeatPictograms beats={beats} shown={shown} />;
  }

  const isPulsing = state === 'playing' && beatIndex < beats.length;
  return (
    <motion.span
      // Clé : la pulsation repart à chaque temps ; rien ne bouge une fois la suite terminée.
      key={isPulsing ? beatIndex : 'still'}
      data-pulse={isPulsing ? beatIndex : undefined}
      className="flex size-1/2 items-center justify-center"
      initial={isPulsing ? { scale: 1.35, opacity: 0.55 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <Volume2 className="size-full text-sky-200" />
    </motion.span>
  );
}

/** `playing` : proposition en cours d'écoute ; `armed` : écoutée, un nouvel appui la valide. */
export type PatternChoiceState = 'idle' | 'playing' | 'armed';

export interface PatternChoiceButtonProps {
  choice: PatternChoice;
  /** Position de la proposition (base 0) : numéro vocalisé d'un son */
  index: number;
  /** Défi en cours : le contenu du bouton apparaît à chaque nouveau défi, le bouton reste monté */
  roundIndex: number;
  state?: PatternChoiceState;
  /** Temps en cours de la suite, lu seulement pendant `playing` */
  beatIndex?: number;
  /** Réglage « Son » : coupé, une proposition sonore affiche sa suite en images */
  isSoundEnabled?: boolean;
  /** Le moteur de navigation D-Pad cible cette proposition */
  isFocused?: boolean;
  /** Une tape n'y répondrait pas pour l'instant : `aria-disabled`, jamais `disabled` (FEAT-21 §3.7) */
  isInert?: boolean;
  /** STOP : assombrie mais visible, l'enfant peut réfléchir à sa réponse */
  isDimmed?: boolean;
  /** Aide de niveau 2 : la bonne proposition luit doucement */
  isHinted?: boolean;
  /** Mauvaises réponses (`wrongTick`) si elle est la dernière refusée, sinon 0 : relance le rebond */
  bounceTick?: number;
  /** Prop React 19 : focus DOM synchronisé par le moteur D-Pad (FEAT-04) */
  ref?: Ref<HTMLButtonElement>;
  /** Tap, clic ou OK : même gestionnaire au doigt et à la télécommande */
  onSelect: () => void;
  /** La proposition reçoit le focus DOM (Tab, clic) : activer sa zone D-Pad */
  onFocus?: () => void;
  /** Calque décoratif par-dessus la proposition (main du guide) */
  children?: ReactNode;
}

/**
 * Grande proposition de réponse, en icônes seules : la pièce, ou un haut-parleur pour un son. Une
 * mauvaise réponse rebondit et reste disponible : ni rouge, ni croix, ni grisé. Les états diffèrent
 * aussi par la forme ou le mouvement, jamais par la seule couleur.
 */
export function PatternChoiceButton({
  choice,
  index,
  roundIndex,
  state = 'idle',
  beatIndex = 0,
  isSoundEnabled = true,
  isFocused = false,
  isInert = false,
  isDimmed = false,
  isHinted = false,
  bounceTick = 0,
  ref,
  onSelect,
  onFocus,
  children,
}: PatternChoiceButtonProps) {
  const label = getChoiceLabel(choice, index, state === 'armed');

  return (
    <button
      ref={ref}
      type="button"
      aria-label={isHinted ? formatHintedLabel(label) : label}
      aria-disabled={isInert || undefined}
      data-state={state}
      data-focused={isFocused || undefined}
      data-dimmed={isDimmed || undefined}
      data-hint={isHinted || undefined}
      data-bounce-tick={bounceTick}
      className={cn(
        'relative block size-full cursor-pointer rounded-2xl active:scale-[0.97] tv:rounded-3xl',
        FOCUS_TRANSITION_CLASSES,
        FOCUS_VISIBLE_CLASSES,
        isFocused && FOCUSED_CLASSES,
      )}
      onClick={onSelect}
      onFocus={onFocus}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 flex items-center justify-center rounded-[inherit] border-4 motion-safe:transition-opacity motion-safe:duration-200',
          state === 'idle' ? 'border-slate-600 bg-slate-800' : 'border-sky-300 bg-sky-400/25',
          isDimmed && 'opacity-40',
        )}
      >
        {isHinted ? (
          // Sous l'icône, assombrie avec elle pendant un STOP. Seul ambre des propositions : le curseur
          // D-Pad reste bleu ciel, l'enfant ne le prend pas pour la bonne réponse.
          <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-amber-300/25 shadow-[0_0_0.75rem_0.25rem] ring-4 shadow-amber-300/60 ring-amber-300 ring-inset motion-safe:animate-pulse" />
        ) : null}
        <motion.span
          key={roundIndex}
          className="flex size-full items-center justify-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <motion.span
            // Clé : le rebond repart à chaque mauvaise réponse, même sur la même proposition. Le bouton
            // lui-même n'est jamais remonté : il perdrait le focus de la télécommande.
            key={bounceTick}
            data-bounce={bounceTick > 0 || undefined}
            className="flex size-full items-center justify-center"
            animate={bounceTick > 0 ? WRONG_BOUNCE : undefined}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            {choice.kind === 'item' ? (
              <PatternItemIcon
                itemId={choice.item.id}
                colorClass={choice.item.colorClass}
                className="size-3/5"
              />
            ) : (
              <SoundFace
                beats={choice.beats}
                state={state}
                beatIndex={beatIndex}
                isSoundEnabled={isSoundEnabled}
              />
            )}
          </motion.span>
        </motion.span>
        {state === 'armed' ? (
          // Sur le coin, à cheval sur la bordure : les images d'un son coupé restent toutes visibles.
          <span
            data-armed-badge
            className="absolute -top-2 -right-2 z-10 flex size-8 items-center justify-center rounded-full bg-sky-300 text-slate-950 ring-2 ring-slate-950 tv:size-10"
          >
            <Check className="size-3/4" strokeWidth={3} />
          </span>
        ) : null}
      </span>
      {children}
    </button>
  );
}
