'use client';

import { useMiaStorage, useProfileGate } from '@/core/storage';
import { ProfileSelectorModal } from './ProfileSelectorModal';

export interface ProfileGateProps {
  /** Ouverture volontaire du choix du joueur (ex: bouton du profil actif du Hub) */
  isOpen?: boolean;
  /** Fermeture de l'ouverture volontaire, sans effet quand le choix est imposé */
  onClose?: () => void;
}

/**
 * Garde de profil d'un écran racine (Hub, page d'un jeu) : crée « Joueur 1 » quand la sauvegarde
 * n'a aucun profil (`useProfileGate`) et impose le choix du joueur quand aucun n'est actif, pour
 * qu'aucune victoire ne soit perdue. À monter sous `StorageProvider` et `NavigationProvider`.
 */
export function ProfileGate({ isOpen = false, onClose }: ProfileGateProps) {
  const { isLoaded } = useMiaStorage();
  const { mustChooseProfile } = useProfileGate();
  if (!isLoaded) return null;

  return (
    <ProfileSelectorModal
      isOpen={isOpen || mustChooseProfile}
      onClose={mustChooseProfile ? undefined : onClose}
    />
  );
}
