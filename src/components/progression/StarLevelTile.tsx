import { FocusableCard } from '@/components/ui';
import type { EnrichedLevelItem } from '@/core/progression';
import { cn } from '@/lib/cn';
import { Crown, Star, Target } from 'lucide-react';
import type { Ref } from 'react';
import { formatMoves } from './labels';

/** États visuels d'une étoile : verrouillée, à conquérir, réussie, parfaite (couronne). */
export type StarTileState = 'locked' | 'open' | 'completed' | 'perfect';

export function getStarTileState(level: EnrichedLevelItem): StarTileState {
  if (!level.isUnlocked) return 'locked';
  if (level.isPerfect) return 'perfect';
  return level.isCompleted ? 'completed' : 'open';
}

/** État vocalisé après « Étoile #N » ; l'état verrouillé est annoncé par `FocusableCard`. */
const STATE_LABELS: Record<StarTileState, string> = {
  locked: '',
  open: ', à conquérir',
  completed: ', réussie',
  perfect: ', parfaite',
};

const STATE_CLASSES: Record<StarTileState, string> = {
  locked: 'bg-slate-800/60',
  open: 'border-sky-400 bg-sky-950/50 hover:border-sky-300',
  completed: 'border-amber-400/60 bg-amber-400/10 hover:border-amber-300',
  perfect: 'border-amber-300 bg-amber-400/20 hover:border-amber-200',
};

export interface StarLevelTileProps {
  level: EnrichedLevelItem;
  /** Indique si le moteur de navigation D-Pad cible cette étoile */
  isFocused?: boolean;
  /** Prop React 19 : focus DOM synchronisé par le moteur D-Pad (FEAT-04) */
  ref?: Ref<HTMLButtonElement>;
  /** Étoile débloquée activée (tap, clic, OK) */
  onPlay: (level: EnrichedLevelItem) => void;
  /** Étoile verrouillée activée : expliquer comment la débloquer */
  onLocked: (level: EnrichedLevelItem) => void;
  /** L'étoile reçoit le focus DOM (Tab, clic) : activer sa zone D-Pad */
  onFocus?: () => void;
}

/**
 * Tuile d'une étoile de la Carte des Étoiles : numéro global (`#N`) et 4 états visuels, distincts
 * aussi sans la couleur (icônes) : verrouillée (cadenas, opacité réduite), à conquérir (cible et
 * bordure lumineuse), réussie (grande étoile dorée et meilleur nombre de coups), parfaite (couronne).
 */
export function StarLevelTile({
  level,
  isFocused = false,
  ref,
  onPlay,
  onLocked,
  onFocus,
}: StarLevelTileProps) {
  const state = getStarTileState(level);
  const bestMoves = level.isCompleted ? (level.completion?.bestMoves ?? null) : null;

  return (
    <FocusableCard
      ref={ref}
      isFocused={isFocused}
      isLocked={state === 'locked'}
      data-state={state}
      data-level-id={level.definition.id}
      className={cn(
        'min-h-24 items-center justify-center gap-1 p-2.5 text-center tv:min-h-20',
        STATE_CLASSES[state],
      )}
      onSelect={() => {
        onPlay(level);
      }}
      onLockedSelect={() => {
        onLocked(level);
      }}
      onFocus={onFocus}
    >
      {/* Espaces hors des balises : séparateurs du nom accessible (« Étoile #3, réussie… »). */}
      <span className="text-fluid-lg leading-none font-bold tabular-nums">
        <span className="sr-only">Étoile</span> #{level.starNumber}
      </span>
      <span aria-hidden="true" className="flex items-center justify-center">
        {state === 'open' ? <Target className="size-7 text-sky-300" /> : null}
        {state === 'locked' ? <Star className="size-7 text-slate-500" /> : null}
        {state === 'completed' || state === 'perfect' ? (
          <Star className="size-8 fill-amber-400 text-amber-400" />
        ) : null}
      </span>
      {STATE_LABELS[state] ? <span className="sr-only">{STATE_LABELS[state]}</span> : null}
      {bestMoves === null ? null : (
        <span className="text-fluid-xs text-slate-300">
          <span className="sr-only">, meilleur score :</span> {formatMoves(bestMoves)}
        </span>
      )}
      {state === 'perfect' ? (
        <span
          aria-hidden="true"
          className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-amber-300 text-slate-950"
        >
          <Crown className="size-4" strokeWidth={2.5} />
        </span>
      ) : null}
      {state === 'open' ? (
        // Bordure lumineuse « à conquérir » : seule animation en boucle du design system (FEAT-03).
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-0.5 rounded-[inherit] border-2 border-sky-300 motion-safe:animate-pulse"
        />
      ) : null}
    </FocusableCard>
  );
}
