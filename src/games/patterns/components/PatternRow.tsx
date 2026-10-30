'use client';

import type { SoundBeat } from '@/core/audio/types';
import { cn } from '@/lib/cn';
import { AnimatePresence, motion, type MotionProps } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { PatternChoice, PatternItem } from '../types';
import { formatRowLabel } from './labels';
import { PatternBeatIcon, PatternItemIcon } from './PatternItemIcon';
import { PatternParticles } from './PatternParticles';

/** Passage d'un défi au suivant : 400 ms au total, dans les 450 ms de `INTRO_MS`. */
const ROW_EXIT_SECONDS = 0.15;
const ROW_ENTER_SECONDS = 0.25;

/** Pulsation d'une unité de l'aide : les unités se passent le relais, sans pause entre elles. */
const UNIT_PULSE_SECONDS = 0.7;

/**
 * Mouvement d'un élément dans sa case : temps de la révélation, unité de l'aide, ou repos. La case ne
 * bouge pas : ni chevauchement des voisines, ni débordement au bord de l'écran. `opacity` en plus de
 * `transform` : elle seule subsiste quand le système demande de réduire les animations.
 */
function getIconMotion(
  isBeatActive: boolean,
  unit: number | null,
  unitCount: number,
): Pick<MotionProps, 'animate' | 'transition'> {
  if (isBeatActive) {
    return {
      animate: { scale: [1, 1.25, 1], opacity: [0.6, 1, 1] },
      transition: { duration: 0.45, ease: 'easeOut' },
    };
  }
  if (unit !== null) {
    return {
      animate: { scale: [1, 1.2, 1], opacity: [1, 0.55, 1] },
      transition: {
        duration: UNIT_PULSE_SECONDS,
        ease: 'easeInOut',
        delay: unit * UNIT_PULSE_SECONDS,
        repeat: Infinity,
        repeatDelay: (unitCount - 1) * UNIT_PULSE_SECONDS,
      },
    };
  }
  return { animate: { scale: 1, opacity: 1 }, transition: { duration: 0.15 } };
}

interface RowCellProps {
  item: PatternItem;
  /** Unité de l'élément pendant l'aide, `null` sinon */
  unit: number | null;
  unitCount: number;
  /** La révélation passe sur cet élément */
  isBeatActive: boolean;
  /** Image du son de l'élément (son coupé, révélation), `null` sinon */
  badge: SoundBeat | null;
}

/** Élément de la ligne : une case pleine, qui fait ressortir la cible vide au bout de la ligne. */
function RowCell({ item, unit, unitCount, isBeatActive, badge }: RowCellProps) {
  return (
    <span
      aria-hidden="true"
      data-row-item={item.id}
      data-unit={unit ?? undefined}
      data-beat-active={isBeatActive || undefined}
      className="relative flex size-full items-center justify-center rounded-[18%] border-2 border-slate-700 bg-slate-800/60 p-[10%]"
    >
      <motion.span className="block size-full" {...getIconMotion(isBeatActive, unit, unitCount)}>
        <PatternItemIcon itemId={item.id} colorClass={item.colorClass} className="size-full" />
      </motion.span>
      {badge ? (
        <motion.span
          data-beat-badge={badge}
          // Sans dépasser par le haut : une ligne peut occuper toute la hauteur de sa zone, qui la découpe.
          className="absolute top-0 -right-[12%] flex size-1/2 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-950 p-[6%]"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
        >
          <PatternBeatIcon beat={badge} className="size-full" />
        </motion.span>
      ) : null}
    </span>
  );
}

/** Cible : case vide à bordure pointillée pulsée, jamais de « ? » (c'est un caractère à lire). */
function RowTarget({ answer }: { answer: PatternChoice | null }) {
  return (
    <span
      aria-hidden="true"
      data-target={answer ? 'filled' : 'empty'}
      className={cn(
        'relative flex size-full items-center justify-center rounded-[18%] border-[3px] p-[10%] sm:border-4',
        answer
          ? 'border-solid border-amber-300 bg-amber-400/15'
          : 'border-dashed border-slate-300 motion-safe:animate-pulse',
      )}
    >
      {answer ? (
        <>
          {/* La réponse se pose en ressort, puis se dandine de joie. */}
          <motion.span
            className="flex size-full items-center justify-center"
            initial={{ scale: 0.3, y: '60%', opacity: 0 }}
            animate={{ scale: 1, y: '0%', opacity: 1, rotate: [0, -12, 10, -6, 3, 0] }}
            transition={{
              scale: { type: 'spring', stiffness: 420, damping: 13 },
              y: { type: 'spring', stiffness: 420, damping: 16 },
              opacity: { duration: 0.1 },
              rotate: { duration: 0.8, ease: 'easeInOut' },
            }}
          >
            {answer.kind === 'item' ? (
              <PatternItemIcon
                itemId={answer.item.id}
                colorClass={answer.item.colorClass}
                className="size-full"
              />
            ) : (
              <Volume2 className="size-full text-sky-200" />
            )}
          </motion.span>
          <PatternParticles />
        </>
      ) : null}
    </span>
  );
}

export interface PatternRowProps {
  /** Éléments de la ligne, de gauche à droite ; la cible la termine */
  row: readonly PatternItem[];
  /** Défi en cours : la ligne précédente sort, puis la nouvelle entre */
  roundIndex: number;
  /** Longueur de l'unité répétée (`getUnitLength`) */
  unitLength: number;
  /** Aide de niveau 1 : les unités pulsent l'une après l'autre */
  showsUnits?: boolean;
  /** Temps de la bonne suite pendant sa révélation, `null` sinon */
  revealedBeats?: readonly SoundBeat[] | null;
  /** Temps révélé en cours (`revealedBeats.length` : révélation terminée) */
  revealBeat?: number;
  /** Son coupé : une image de cloche ou de tambour reste sur chaque élément révélé */
  showsBeatBadges?: boolean;
  /** Bonne réponse placée dans la cible, `null` tant que la cible est vide */
  answer?: PatternChoice | null;
}

/**
 * Ligne de lecture : une seule ligne de cases carrées terminée par la cible, sans retour à la ligne
 * ni défilement (`patterns-row`, à monter dans un conteneur de taille `@container-size`).
 */
export function PatternRow({
  row,
  roundIndex,
  unitLength,
  showsUnits = false,
  revealedBeats = null,
  revealBeat = 0,
  showsBeatBadges = false,
  answer = null,
}: PatternRowProps) {
  const unitCount = Math.ceil(row.length / unitLength);
  const rowStyle = { '--patterns-cells': row.length + 1 } as CSSProperties;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={roundIndex}
        role="group"
        aria-label={formatRowLabel(row, answer)}
        data-help={showsUnits ? 'units' : undefined}
        className="patterns-row"
        style={rowStyle}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0, transition: { duration: ROW_ENTER_SECONDS, ease: 'easeOut' } }}
        exit={{ opacity: 0, x: -24, transition: { duration: ROW_EXIT_SECONDS, ease: 'easeIn' } }}
      >
        {row.map((item, index) => (
          <RowCell
            key={index}
            item={item}
            unit={showsUnits ? Math.floor(index / unitLength) : null}
            unitCount={unitCount}
            isBeatActive={revealedBeats !== null && index === revealBeat}
            badge={
              revealedBeats !== null && showsBeatBadges && index <= revealBeat
                ? (revealedBeats[index] ?? null)
                : null
            }
          />
        ))}
        <RowTarget answer={answer} />
      </motion.div>
    </AnimatePresence>
  );
}
