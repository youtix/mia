'use client';

// Module direct, pas le barrel : le JS de la page d'un jeu se limite à ce qu'elle affiche (FEAT-08).
import { formatMoves } from '@/components/progression/labels';
import { FocusableButton, ModalDialog } from '@/components/ui';
import { useGridNavigation } from '@/core/navigation';
import { cn } from '@/lib/cn';
import { ArrowRight, Crown, MapIcon, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { getCrownMissedMessage } from './labels';

/** Partie gagnée, figée au moment de la victoire (la modale la garde pendant son animation de sortie). */
export interface TrafficJamGameResult {
  moves: number;
  /** Nombre minimal de coups du niveau (0 : inconnu, aucune couronne possible) */
  optimalMoves: number;
  /** Victoire « Parfait » (`isPerfectWin`) */
  isPerfect: boolean;
  /** Couronne déjà gagnée avant cette partie (le résumé est recalculé après la victoire) */
  hadCrown: boolean;
}

export interface TrafficJamEndModalProps {
  isOpen: boolean;
  /** Dernière partie gagnée ; `null` tant qu'aucune ne l'est */
  result: TrafficJamGameResult | null;
  starNumber: number;
  /** Numéro de l'étoile suivante du catalogue, `null` après la dernière */
  nextStarNumber: number | null;
  onNext: () => void;
  onReplay: () => void;
  onExitToMap: () => void;
}

/**
 * Fin de niveau, choix imposé (ni ✕, ni fond, ni Échap : Retour mène à la Carte des Étoiles) :
 * « Étoile Suivante » (pré-focalisée), « Rejouer », « Carte des Étoiles ». Modèle : la modale de
 * fin de Memory (FEAT-10).
 */
export function TrafficJamEndModal({
  isOpen,
  result,
  starNumber,
  nextStarNumber,
  onNext,
  onReplay,
  onExitToMap,
}: TrafficJamEndModalProps) {
  let subtitle: string | undefined;
  if (result) {
    subtitle = formatMoves(result.moves);
    if (result.optimalMoves > 0) subtitle += ` · optimal ${String(result.optimalMoves)}`;
  }

  const actions: EndAction[] = [];
  if (nextStarNumber !== null) {
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
      label: 'Rejouer',
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
    <ModalDialog
      isOpen={isOpen && result !== null}
      title={`Étoile #${String(starNumber)} gagnée !`}
      subtitle={subtitle}
    >
      {result ? (
        <>
          <CrownMessage result={result} />
          <EndActions actions={actions} onBack={onExitToMap} />
        </>
      ) : null}
    </ModalDialog>
  );
}

/** Couronne gagnée, ou objectif manqué et invitation à rejouer ; rien si elle était déjà gagnée. */
function CrownMessage({ result }: { result: TrafficJamGameResult }) {
  let text: string | null = null;
  if (result.isPerfect) {
    text = result.hadCrown ? 'Parfait !' : 'Parfait ! Couronne gagnée';
  } else if (!result.hadCrown && result.optimalMoves > 0) {
    text = getCrownMissedMessage(result.optimalMoves, result.moves);
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
    scopeId: 'traffic-jam-end-actions',
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
