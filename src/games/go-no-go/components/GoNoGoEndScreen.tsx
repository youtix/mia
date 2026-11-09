'use client';

import {
  BearSortEndScreen,
  type BearSortEndScreenProps,
} from '@/games/bear-sort/components/BearSortEndScreen';

/**
 * Les boutons de l'écran de fin n'agissent qu'après ce délai, plus long que celui des autres jeux
 * (`END_SCREEN_GUARD_MS`, 800 ms) : l'enfant est lancé dans un jeu de vitesse et tapera sur l'écran de
 * fin (FEAT-28 §10).
 */
export const GO_NO_GO_END_GUARD_MS = 1500;

export type GoNoGoEndScreenProps = Omit<
  BearSortEndScreenProps,
  'inputGuardMs' | 'scopeId' | 'isTopAligned'
>;

/**
 * Fin d'étoile : celle d'Attrape-Piège (grande étoile, couronne gagnée ou déjà acquise, trois
 * boutons-icônes, ni vitesse ni erreurs), avec une garde plus longue et la boîte en haut de l'écran,
 * jamais sous l'ancien buzzer : la récompense ne se saute pas par élan.
 */
export function GoNoGoEndScreen(props: GoNoGoEndScreenProps) {
  return (
    <BearSortEndScreen
      {...props}
      inputGuardMs={GO_NO_GO_END_GUARD_MS}
      scopeId="go-no-go-end-actions"
      isTopAligned
    />
  );
}
