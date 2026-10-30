'use client';

import { FocusableButton, ModalDialog } from '@/components/ui';
import { useGridNavigation } from '@/core/navigation';
import { cn } from '@/lib/cn';
import { motion } from 'framer-motion';
import { ArrowRight, Crown, MapIcon, RotateCcw, Star } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { END_ACTION_LABELS, formatEndTitle, getCrownSentence } from './labels';

/**
 * Boutons sans effet pendant que l'étoile et la couronne se posent : un enfant qui tape encore, au
 * même endroit que sa réponse, ne saute pas sa récompense. Retour reste actif.
 */
export const END_INPUT_GUARD_MS = 800;

/** Partie gagnée, figée à la victoire (la modale la garde pendant son animation de sortie). */
export interface PatternsGameResult {
  /** Victoire « Parfait » (`isPerfectWin`) */
  isPerfect: boolean;
  /** Couronne déjà gagnée avant cette partie (le résumé est recalculé après la victoire) */
  hadCrown: boolean;
}

export interface PatternsEndModalProps {
  isOpen: boolean;
  /** Dernière partie gagnée ; `null` tant qu'aucune ne l'est */
  result: PatternsGameResult | null;
  starNumber: number;
  /** Faux après la dernière étoile du catalogue : le bouton « Étoile suivante » disparaît */
  hasNextStar: boolean;
  onNext: () => void;
  onReplay: () => void;
  onExitToMap: () => void;
}

/**
 * Fin d'une étoile, sans aucun texte à lire : grande étoile, couronne et trois boutons en icônes,
 * choix imposé (ni ✕, ni fond, ni Échap : Retour mène à la Carte des Étoiles). Modèle : la modale de
 * fin de Memory (FEAT-10).
 */
export function PatternsEndModal({
  isOpen,
  result,
  starNumber,
  hasNextStar,
  onNext,
  onReplay,
  onExitToMap,
}: PatternsEndModalProps) {
  const actions: EndAction[] = [];
  if (hasNextStar) {
    actions.push({
      id: 'next',
      label: END_ACTION_LABELS.next,
      icon: <ArrowRight className="size-8 tv:size-10" />,
      onClick: onNext,
    });
  }
  actions.push(
    {
      id: 'replay',
      label: END_ACTION_LABELS.replay,
      icon: <RotateCcw className="size-8 tv:size-10" />,
      onClick: onReplay,
    },
    {
      id: 'map',
      label: END_ACTION_LABELS.map,
      icon: <MapIcon className="size-8 tv:size-10" />,
      onClick: onExitToMap,
    },
  );

  return (
    <ModalDialog
      isTextless
      // « Rejouer » replace le curseur sur les propositions : pas de retour au bouton d'origine.
      restoreFocus={false}
      isOpen={isOpen && result !== null}
      title={formatEndTitle(starNumber)}
      subtitle={result ? getCrownSentence(result.isPerfect, result.hadCrown) : undefined}
    >
      {result ? (
        <>
          <EndTrophy result={result} />
          <EndActions actions={actions} onBack={onExitToMap} />
        </>
      ) : null}
    </ModalDialog>
  );
}

/** Grande étoile animée, coiffée d'une couronne : dorée si elle est acquise, sinon simple contour. */
function EndTrophy({ result }: { result: PatternsGameResult }) {
  const hasCrown = result.isPerfect || result.hadCrown;

  return (
    <div className="flex flex-col items-center">
      <motion.span
        aria-hidden="true"
        data-crown={hasCrown ? 'gold' : 'outline'}
        className="-mb-[2dvh] block"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.25, type: 'spring', stiffness: 320, damping: 12 }}
      >
        <Crown
          className={cn(
            'size-[clamp(2.75rem,15dvh,5.5rem)]',
            hasCrown ? 'fill-amber-300 text-amber-200' : 'text-slate-500',
          )}
        />
      </motion.span>
      <motion.span
        aria-hidden="true"
        data-end-star
        className="block"
        initial={{ scale: 0, rotate: -35 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 11 }}
      >
        <Star className="size-[clamp(5rem,28dvh,10rem)] fill-amber-300 text-amber-300" />
      </motion.span>
    </div>
  );
}

interface EndAction {
  id: string;
  /** Nom vocalisé : les boutons n'affichent qu'une icône */
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

/**
 * Zone D-Pad déclarée dans la modale (FEAT-04 §5) : sa couche suspend le plateau. Curseur sur la
 * première action ; Retour → Carte des Étoiles (la modale n'a pas d'`onClose`).
 */
function EndActions({ actions, onBack }: { actions: EndAction[]; onBack: () => void }) {
  const zone = useGridNavigation({
    scopeId: 'patterns-end-actions',
    rows: 1,
    cols: actions.length,
    onBack,
  });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, END_INPUT_GUARD_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="flex w-full gap-3">
      {actions.map((action, index) => (
        <FocusableButton
          key={action.id}
          ref={zone.getItemRef(index)}
          isFocused={zone.isItemFocused(index)}
          aria-label={action.label}
          variant={index === 0 ? 'primary' : 'secondary'}
          size="lg"
          className="min-h-16 flex-1 tv:min-h-20"
          leftIcon={action.icon}
          // Tape et OK : le moteur D-Pad clique le bouton, comme au doigt.
          onClick={isReady ? action.onClick : undefined}
        />
      ))}
    </div>
  );
}
