'use client';

import { FocusableButton, ModalDialog } from '@/components/ui';
import { useGridNavigation } from '@/core/navigation';
import { StarAward } from '@/games/bear-sort/components/StarAward';
import { ArrowRight, MapIcon, RotateCcw, type LucideIcon } from 'lucide-react';

/**
 * Les boutons de l'écran de fin n'agissent qu'après ce délai, plus long que celui d'Attrape-Piège
 * (800 ms) : l'enfant est lancé dans un jeu de vitesse et tapera sur l'écran de fin (FEAT-28 §10).
 */
export const END_SCREEN_GUARD_MS = 1500;

export interface GoNoGoEndScreenProps {
  isOpen: boolean;
  starNumber: number;
  /** Couronne à montrer : gagnée à l'instant ou déjà acquise. Manquée, elle n'est jamais évoquée */
  hasCrown: boolean;
  /** Une étoile suit dans le catalogue */
  hasNextStar: boolean;
  onNext: () => void;
  onReplay: () => void;
  onExitToMap: () => void;
}

/** Phrase réservée aux lecteurs d'écran : la couronne n'est qu'un dessin. */
const CROWN_SENTENCE = 'Tu as la couronne !';

interface EndAction {
  id: string;
  /** Nom vocalisé : le bouton n'affiche que son icône */
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

/**
 * Fin d'étoile, sans aucun texte : une grande étoile, sa couronne si elle est gagnée, et trois grands
 * boutons-icônes. Choix imposé (ni ✕, ni fond, ni Échap : Retour mène à la Carte des Étoiles). Ni
 * vitesse, ni erreurs : l'enfant finit toujours sur son étoile, la couronne manquée n'est jamais
 * évoquée. La boîte se place en haut de l'écran, jamais sous l'ancien buzzer, et ses boutons n'agissent
 * qu'après `END_SCREEN_GUARD_MS` : la récompense ne se saute pas par élan.
 */
export function GoNoGoEndScreen({
  isOpen,
  starNumber,
  hasCrown,
  hasNextStar,
  onNext,
  onReplay,
  onExitToMap,
}: GoNoGoEndScreenProps) {
  const actions: EndAction[] = [
    { id: 'replay', label: 'Rejouer', icon: RotateCcw, onClick: onReplay },
    { id: 'map', label: 'Carte des étoiles', icon: MapIcon, onClick: onExitToMap },
  ];
  if (hasNextStar) {
    actions.unshift({ id: 'next', label: 'Étoile suivante', icon: ArrowRight, onClick: onNext });
  }

  return (
    <ModalDialog
      isOpen={isOpen}
      title={`Étoile #${String(starNumber)} gagnée`}
      subtitle={hasCrown ? CROWN_SENTENCE : undefined}
      isTextless
      inputGuardMs={END_SCREEN_GUARD_MS}
      className="items-center self-start landscape:[@media(max-height:24rem)]:max-w-2xl landscape:[@media(max-height:24rem)]:flex-row landscape:[@media(max-height:24rem)]:justify-center"
    >
      <div data-star-award="true" data-crown={hasCrown || undefined}>
        <StarAward hasCrown={hasCrown} className="size-[clamp(8rem,38vmin,16rem)]" />
      </div>
      <EndActions actions={actions} onBack={onExitToMap} />
    </ModalDialog>
  );
}

/**
 * Zone D-Pad déclarée dans la modale (FEAT-04 §5) : sa couche suspend le plateau. Curseur sur la
 * première action ; Retour → Carte des Étoiles (la modale n'a pas d'`onClose`).
 */
function EndActions({ actions, onBack }: { actions: EndAction[]; onBack: () => void }) {
  const zone = useGridNavigation({
    scopeId: 'go-no-go-end-actions',
    rows: 1,
    cols: actions.length,
    onBack,
  });

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6">
      {actions.map(({ id, label, icon: Icon, onClick }, index) => (
        <FocusableButton
          key={id}
          ref={zone.getItemRef(index)}
          isFocused={zone.isItemFocused(index)}
          variant={index === 0 ? 'primary' : 'secondary'}
          size="lg"
          aria-label={label}
          className="min-h-20 min-w-20 rounded-2xl px-0 tv:min-h-24 tv:min-w-24"
          leftIcon={<Icon className="size-10 tv:size-12" strokeWidth={2.5} />}
          onClick={onClick}
        />
      ))}
    </div>
  );
}
