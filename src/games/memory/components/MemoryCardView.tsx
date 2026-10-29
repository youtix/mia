import { FOCUS_TRANSITION_CLASSES } from '@/components/ui/focus-styles';
import { cn } from '@/lib/cn';
import { Check, Sparkles } from 'lucide-react';
import type { Ref } from 'react';
import { getMemorySymbolLabel } from '../symbols';
import type { MemoryCard } from '../types';
import { MemorySymbolIcon } from './MemorySymbolIcon';

/**
 * Anneau D-Pad des cartes (FEAT-10 §3.2) : ambré plutôt que bleu (`FOCUSED_CLASSES`), la face
 * visible ayant déjà une bordure bleue. Même indicateur pour la navigation clavier native (Tab).
 */
const CARD_FOCUSED_CLASSES =
  'z-10 scale-[1.05] shadow-xl ring-4 shadow-amber-500/20 ring-amber-400 ring-offset-2 ring-offset-slate-950';

const CARD_FOCUS_VISIBLE_CLASSES =
  'focus-visible:z-10 focus-visible:scale-[1.05] focus-visible:shadow-xl focus-visible:ring-4 focus-visible:shadow-amber-500/20 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus-visible:outline-hidden';

/**
 * Nom vocalisé d'une carte : son symbole une fois visible (jamais sa couleur), puis sa position
 * affichée, repère indispensable pour jouer avec un lecteur d'écran.
 */
export function getMemoryCardLabel(card: MemoryCard, row: number, col: number): string {
  const position = `ligne ${String(row + 1)}, colonne ${String(col + 1)}`;
  if (card.state === 'hidden') return `Carte cachée, ${position}`;
  const symbol = getMemorySymbolLabel(card.symbolId, card.rotationDeg);
  return card.state === 'matched' ? `${symbol}, trouvée, ${position}` : `${symbol}, ${position}`;
}

export interface MemoryCardViewProps {
  card: MemoryCard;
  /** Ligne affichée (base 0), annoncée par les lecteurs d'écran */
  row: number;
  /** Colonne affichée (base 0), annoncée par les lecteurs d'écran */
  col: number;
  /** Le moteur de navigation D-Pad cible cette carte */
  isFocused?: boolean;
  /** La carte vient d'être permutée (`lastSwappedPair`) : anneau violet pulsé */
  isSwapping?: boolean;
  /** Prop React 19 : focus DOM synchronisé par le moteur D-Pad (FEAT-04) */
  ref?: Ref<HTMLButtonElement>;
  /** Tap, clic ou OK : même gestionnaire au doigt et à la télécommande */
  onSelect: () => void;
  /** La carte reçoit le focus DOM (Tab, clic) : activer la zone du plateau */
  onFocus?: () => void;
}

/**
 * Carte de Memory : dos (cachée), face (retournée) ou face validée avec coche (trouvée).
 * Retournement 3D en CSS, coupé si le système demande de réduire les animations.
 */
export function MemoryCardView({
  card,
  row,
  col,
  isFocused = false,
  isSwapping = false,
  ref,
  onSelect,
  onFocus,
}: MemoryCardViewProps) {
  const isFaceUp = card.state !== 'hidden';
  const isMatched = card.state === 'matched';

  return (
    <button
      ref={ref}
      type="button"
      aria-label={getMemoryCardLabel(card, row, col)}
      data-state={card.state}
      data-focused={isFocused || undefined}
      data-swapping={isSwapping || undefined}
      className={cn(
        'relative block size-full cursor-pointer rounded-xl perspective-midrange active:scale-[0.97]',
        FOCUS_TRANSITION_CLASSES,
        CARD_FOCUS_VISIBLE_CLASSES,
        isFocused && CARD_FOCUSED_CLASSES,
      )}
      onClick={onSelect}
      onFocus={onFocus}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative block size-full rounded-[inherit] transform-3d motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out',
          isFaceUp && 'rotate-y-180',
        )}
      >
        <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] border-2 border-slate-700 bg-slate-800 backface-hidden">
          <Sparkles className="size-1/3 text-slate-600" />
        </span>
        <span
          className={cn(
            'absolute inset-0 flex rotate-y-180 items-center justify-center rounded-[inherit] border-2 backface-hidden',
            isMatched ? 'border-emerald-500/50 bg-emerald-950/40' : 'border-sky-400 bg-slate-900',
          )}
        >
          <MemorySymbolIcon
            symbolId={card.symbolId}
            rotationDeg={card.rotationDeg}
            colorClass={card.colorClass}
            className={cn('size-3/5', isMatched && 'opacity-75')}
          />
          {isMatched ? (
            <span className="absolute top-[6%] right-[6%] flex size-1/4 items-center justify-center rounded-full bg-emerald-400 text-slate-950">
              <Check className="size-3/4" strokeWidth={3} />
            </span>
          ) : null}
        </span>
      </span>
      {isSwapping ? (
        // Calque distinct (comme la bordure « à conquérir » de FEAT-08) : l'anneau de focus reste visible.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] ring-4 ring-purple-500 ring-inset motion-safe:animate-pulse"
        />
      ) : null}
    </button>
  );
}
