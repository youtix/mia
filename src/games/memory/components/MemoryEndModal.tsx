'use client';

// Module direct, pas le barrel : le JS de la page d'un jeu se limite à ce qu'elle affiche (FEAT-08).
import { formatMoves } from '@/components/progression/labels';
import { FocusableButton, ModalDialog } from '@/components/ui';
import { useGridNavigation } from '@/core/navigation';
import { cn } from '@/lib/cn';
import { ArrowRight, Crown, MapIcon, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MemoryLevelConfig } from '../types';
import { formatGroups, formatMistakes, getCrownTargetLabel, getDefeatTitle } from './labels';

/** Partie terminée, figée au moment de la fin (la modale la garde pendant son animation de sortie). */
export interface MemoryGameResult {
  outcome: 'won' | 'lost';
  moves: number;
  mistakes: number;
  matchedGroups: number;
  totalGroups: number;
  /** Victoire « Parfait » (`isPerfectWin`) */
  isPerfect: boolean;
  /** Couronne déjà gagnée avant cette partie (le résumé est recalculé après la victoire) */
  hadCrown: boolean;
}

export interface MemoryEndModalProps {
  isOpen: boolean;
  /** Dernière partie terminée ; `null` tant qu'aucune ne l'est */
  result: MemoryGameResult | null;
  starNumber: number;
  config: Pick<MemoryLevelConfig, 'matchSize' | 'maxMistakes' | 'perfectMaxMistakes'>;
  /** Numéro de l'étoile suivante du catalogue, `null` après la dernière */
  nextStarNumber: number | null;
  onNext: () => void;
  onReplay: () => void;
  onExitToMap: () => void;
}

/**
 * Fin de niveau, choix imposé (ni ✕, ni fond, ni Échap : Retour mène à la Carte des Étoiles).
 * Victoire : « Étoile Suivante » (pré-focalisée), « Rejouer », « Carte des Étoiles » ; défaite :
 * « Réessayer » (pré-focalisé), « Carte des Étoiles ».
 */
export function MemoryEndModal({
  isOpen,
  result,
  starNumber,
  config,
  nextStarNumber,
  onNext,
  onReplay,
  onExitToMap,
}: MemoryEndModalProps) {
  const isWon = result?.outcome === 'won';
  let title = '';
  let subtitle: string | undefined;
  if (result) {
    title = isWon ? `Étoile #${String(starNumber)} gagnée !` : getDefeatTitle(config.maxMistakes);
    subtitle = isWon
      ? `${formatMoves(result.moves)} · ${formatMistakes(result.mistakes)}`
      : `Tu avais trouvé ${formatGroups(result.matchedGroups, config.matchSize)} sur ${String(result.totalGroups)}.`;
  }

  const actions: EndAction[] = [];
  if (isWon && nextStarNumber !== null) {
    actions.push({
      id: 'next',
      label: `Étoile Suivante (#${String(nextStarNumber)})`,
      rightIcon: <ArrowRight className="size-5" />,
      onClick: onNext,
    });
  }
  actions.push(
    {
      id: 'replay',
      label: isWon ? 'Rejouer' : 'Réessayer',
      leftIcon: <RotateCcw className="size-5" />,
      onClick: onReplay,
    },
    {
      id: 'map',
      label: 'Carte des Étoiles',
      leftIcon: <MapIcon className="size-5" />,
      onClick: onExitToMap,
    },
  );

  return (
    <ModalDialog isOpen={isOpen && result !== null} title={title} subtitle={subtitle}>
      {result ? (
        <>
          {isWon ? (
            <CrownMessage result={result} perfectMaxMistakes={config.perfectMaxMistakes} />
          ) : null}
          <EndActions actions={actions} onBack={onExitToMap} />
        </>
      ) : null}
    </ModalDialog>
  );
}

/** Couronne gagnée, ou objectif manqué et invitation à rejouer ; rien si elle était déjà gagnée. */
function CrownMessage({
  result,
  perfectMaxMistakes,
}: {
  result: MemoryGameResult;
  perfectMaxMistakes: number;
}) {
  let text: string | null = null;
  if (result.isPerfect) {
    text = result.hadCrown ? 'Parfait !' : 'Parfait ! Couronne gagnée';
  } else if (!result.hadCrown) {
    const target = getCrownTargetLabel(perfectMaxMistakes).toLowerCase();
    text = `Couronne : ${target}, tu en as fait ${String(result.mistakes)}. Rejoue pour la gagner !`;
  }
  if (text === null) return null;

  return (
    <p
      className={cn(
        'flex items-center justify-center gap-3 rounded-2xl border-2 px-4 py-3 text-center text-fluid-base font-semibold',
        result.isPerfect
          ? 'border-amber-300 bg-amber-400/15 text-amber-100'
          : 'border-slate-700 bg-slate-800/60 text-slate-200',
      )}
    >
      <Crown
        aria-hidden="true"
        className={cn(
          'size-6 shrink-0',
          result.isPerfect ? 'fill-amber-300 text-amber-300' : 'text-slate-400',
        )}
      />
      {text}
    </p>
  );
}

interface EndAction {
  id: string;
  label: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  onClick: () => void;
}

/**
 * Zone D-Pad déclarée dans la modale (FEAT-04 §5) : sa couche suspend le plateau. Curseur sur la
 * première action ; Retour → Carte des Étoiles (la modale n'a pas d'`onClose`).
 */
function EndActions({ actions, onBack }: { actions: EndAction[]; onBack: () => void }) {
  const zone = useGridNavigation({
    scopeId: 'memory-end-actions',
    rows: actions.length,
    cols: 1,
    onBack,
  });

  return (
    <div className="flex flex-col gap-3">
      {actions.map((action, index) => (
        <FocusableButton
          key={action.id}
          ref={zone.getItemRef(index)}
          isFocused={zone.isItemFocused(index)}
          variant={index === 0 ? 'primary' : 'secondary'}
          size="lg"
          className="w-full"
          leftIcon={action.leftIcon}
          rightIcon={action.rightIcon}
          onClick={action.onClick}
        >
          {action.label}
        </FocusableButton>
      ))}
    </div>
  );
}
