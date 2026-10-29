'use client';

import { useAndroidBackButton } from './useAndroidBackButton';

/**
 * Branche le bouton Retour physique d'Android sur le moteur D-Pad (FEAT-15). Monté une seule fois
 * sous `NavigationProvider` dans le layout racine ; ne rend rien.
 */
export function AndroidBackButtonBridge(): null {
  useAndroidBackButton();
  return null;
}
