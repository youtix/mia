'use client';

import { useEffect } from 'react';
import { ensureDefaultProfile, needsProfileChoice } from './profile-manager';
import { useMiaStorage } from './StorageContext';

export interface ProfileGate {
  /**
   * Des profils existent mais aucun n'est actif (profil actif introuvable au chargement, import) :
   * ouvrir `ProfileSelectorModal` sans `onClose` pour imposer le choix. `false` avant le chargement.
   */
  mustChooseProfile: boolean;
}

/**
 * Garantit un profil jouable, à monter une fois par écran racine (Hub, FEAT-08) : dès que la
 * sauvegarde est chargée sans aucun profil (premier lancement, `resetAllData`, import vide,
 * `localStorage.clear()` dans un autre onglet), crée « Joueur 1 » par `updateState`, qui
 * n'écrase jamais la sauvegarde chargée.
 */
export function useProfileGate(): ProfileGate {
  const { state, isLoaded, updateState } = useMiaStorage();
  const hasNoProfile = state.profiles.length === 0;

  useEffect(() => {
    // Appels répétés sans effet (StrictMode, autre onglet) : l'updater renvoie alors `prev`.
    if (isLoaded && hasNoProfile) void updateState(ensureDefaultProfile);
  }, [isLoaded, hasNoProfile, updateState]);

  return { mustChooseProfile: isLoaded && needsProfileChoice(state) };
}
