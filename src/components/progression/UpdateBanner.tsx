'use client';

import { FocusableButton } from '@/components/ui';
import { useGridNavigation, type Direction } from '@/core/navigation';
import { appUpdate } from '@/core/pwa';
import { cn } from '@/lib/cn';
import { RefreshCw } from 'lucide-react';
import { useId } from 'react';
import { UPDATE_BANNER_TEXTS } from './labels';

export interface UpdateBannerProps {
  /** Une nouvelle version est prête : le bandeau s'affiche ; sinon, seule sa région d'annonce reste */
  isVisible: boolean;
  /** Zone D-Pad du bouton (une seule zone active par écran) */
  isActive: boolean;
  /** Flèche bloquée au bord du bouton : l'écran passe au profil ou à la dernière carte */
  onEdge: (direction: Direction) => void;
  /** Le bouton reçoit le focus DOM (Tab, clic) : activer la zone du bandeau */
  onFocusZone: () => void;
}

/**
 * Bandeau de mise à jour (FEAT-20) : une nouvelle version est téléchargée, « Mettre à jour » active
 * le worker en attente et toutes les pages ouvertes se rechargent. Sur le Hub uniquement (en plein
 * niveau, le rechargement perdrait la partie en cours ; ici, il ne coûte rien) et sans bouton de
 * fermeture. Toujours monté, pour que sa région d'annonce existe avant l'arrivée de la version.
 */
export function UpdateBanner({ isVisible, isActive, onEdge, onFocusZone }: UpdateBannerProps) {
  const noteId = useId();
  const action = useGridNavigation({ scopeId: 'hub-update', rows: 1, cols: 1, isActive, onEdge });

  return (
    <div
      className={cn(
        isVisible &&
          'mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl border-2 border-sky-400 bg-slate-800/60 p-5 md:mb-6 md:p-6 contrast:bg-slate-800',
      )}
    >
      <div className="flex min-w-0 grow basis-64 flex-col gap-1">
        {/* Région toujours présente, même vide : seul un changement de son contenu est annoncé.
            Le bouton reste en dehors, le titre suffit à l'annonce. */}
        <p role="status" className="text-fluid-lg font-bold">
          {isVisible ? UPDATE_BANNER_TEXTS.title : null}
        </p>
        {isVisible ? (
          <p id={noteId} className="text-fluid-sm text-slate-300">
            {UPDATE_BANNER_TEXTS.note}
          </p>
        ) : null}
      </div>
      {isVisible ? (
        <FocusableButton
          ref={action.getItemRef(0)}
          isFocused={action.isItemFocused(0)}
          aria-describedby={noteId}
          className="w-full sm:w-auto"
          leftIcon={<RefreshCw className="size-5" />}
          onClick={() => {
            appUpdate.apply();
          }}
          onFocus={onFocusZone}
        >
          {UPDATE_BANNER_TEXTS.button}
        </FocusableButton>
      ) : null}
    </div>
  );
}
