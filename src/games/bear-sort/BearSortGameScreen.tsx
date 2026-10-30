'use client';

import { GameScreen } from '@/components/progression/GameScreen';
import { BearSortBoard } from '@/games/bear-sort/components/BearSortBoard';
import { BEAR_SORT_CATALOG } from './catalog';

/**
 * Écran de la page `/bear-sort` : Carte des Étoiles du catalogue initial, et plateau de l'étoile
 * lancée (`?level=<id>`), de `bs-001` à `bs-020`. Composant client : `renderLevel` est une
 * fonction, intransmissible depuis le composant serveur de la page. Modules importés directement
 * (pas les barrels) : le JS client de la route se limite à son écran.
 */
export function BearSortGameScreen() {
  return (
    <GameScreen
      gameId="bear-sort"
      catalog={BEAR_SORT_CATALOG}
      renderLevel={(level, controls) => <BearSortBoard level={level} controls={controls} />}
    />
  );
}
