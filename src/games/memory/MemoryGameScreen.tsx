'use client';

import { GameScreen } from '@/components/progression/GameScreen';
import { MemoryBoard } from '@/games/memory/components/MemoryBoard';
import { MEMORY_CATALOG } from './catalog';

/**
 * Écran de la page `/memory` : Carte des Étoiles du catalogue initial, et plateau de l'étoile
 * lancée (`?level=<id>`), de `mem-001` à `mem-020`. Composant client : `renderLevel` est une
 * fonction, intransmissible depuis le composant serveur de la page. Modules importés directement
 * (pas les barrels) : le JS client de la route se limite à son écran.
 */
export function MemoryGameScreen() {
  return (
    <GameScreen
      gameId="memory"
      catalog={MEMORY_CATALOG}
      renderLevel={(level, controls) => <MemoryBoard level={level} controls={controls} />}
    />
  );
}
