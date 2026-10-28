'use client';

import { FocusableButton, ModalDialog } from '@/components/ui';
import { useGridNavigation } from '@/core/navigation';
import { countProfileStars, DEFAULT_PROFILE_NAME } from '@/core/storage';
import type { UserProfile } from '@/types/mia';
import { Trash2 } from 'lucide-react';

export interface DeleteProfileModalProps {
  /** Profil à supprimer ; `null` : modale fermée */
  profile: UserProfile | null;
  /** Dernier profil de l'appareil : un « Joueur 1 » vide le remplacera */
  isLastProfile: boolean;
  onCancel: () => void;
  onConfirm: (profileId: string) => void;
}

/** Ce que la suppression fait perdre, ex : « Ses 12 étoiles seront perdues. » */
function describeProfileLoss(profile: UserProfile, isLastProfile: boolean): string {
  const stars = countProfileStars(profile);
  let loss = `Ses ${String(stars)} étoiles seront perdues.`;
  if (stars === 0) loss = 'Ce profil n’a encore gagné aucune étoile.';
  else if (stars === 1) loss = 'Son étoile sera perdue.';
  return isLastProfile ? `${loss} Un profil « ${DEFAULT_PROFILE_NAME} » vide le remplacera.` : loss;
}

/**
 * Confirmation de suppression, couche imbriquée au-dessus du choix du joueur : le curseur part
 * d'« Annuler », Retour et Échap annulent.
 */
export function DeleteProfileModal({
  profile,
  isLastProfile,
  onCancel,
  onConfirm,
}: DeleteProfileModalProps) {
  // Fermée, la modale garde le dernier contenu affiché le temps de son animation de sortie.
  return (
    <ModalDialog
      isOpen={profile !== null}
      title={profile ? `Supprimer « ${profile.name} » ?` : ''}
      subtitle={profile ? describeProfileLoss(profile, isLastProfile) : undefined}
      onClose={onCancel}
    >
      {profile ? (
        <DeleteActions
          onCancel={onCancel}
          onConfirm={() => {
            onConfirm(profile.id);
          }}
        />
      ) : null}
    </ModalDialog>
  );
}

interface DeleteActionsProps {
  onCancel: () => void;
  onConfirm: () => void;
}

/** Zone déclarée dans la modale : elle s'empile au-dessus de la grille des profils (FEAT-04). */
function DeleteActions({ onCancel, onConfirm }: DeleteActionsProps) {
  const actions = useGridNavigation({ scopeId: 'profile-delete-actions', rows: 1, cols: 2 });

  return (
    <div className="flex flex-wrap justify-center gap-3">
      <FocusableButton
        ref={actions.getItemRef(0)}
        isFocused={actions.isItemFocused(0)}
        variant="secondary"
        size="lg"
        onClick={onCancel}
      >
        Annuler
      </FocusableButton>
      <FocusableButton
        ref={actions.getItemRef(1)}
        isFocused={actions.isItemFocused(1)}
        variant="danger"
        size="lg"
        leftIcon={<Trash2 className="size-5" />}
        onClick={onConfirm}
      >
        Supprimer
      </FocusableButton>
    </div>
  );
}
