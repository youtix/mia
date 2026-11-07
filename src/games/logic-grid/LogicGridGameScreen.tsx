'use client';

import { GameScreen } from '@/components/progression/GameScreen';
import { LogicGridBoard } from '@/games/logic-grid/components/LogicGridBoard';
import { LOGIC_GRID_CATALOG } from './catalog';

/**
 * Écran de la page `/logic-grid` : Carte des Étoiles du catalogue, et plateau de l'étoile lancée
 * (`?level=<id>`), de `lg-001` à `lg-020`. Composant client : `renderLevel` est une fonction,
 * intransmissible depuis le composant serveur de la page. Modules importés directement (pas les
 * barrels) : le JS client de la route se limite à son écran.
 */
export function LogicGridGameScreen() {
  return (
    <GameScreen
      gameId="logic-grid"
      catalog={LOGIC_GRID_CATALOG}
      renderLevel={(level, controls) => <LogicGridBoard level={level} controls={controls} />}
    />
  );
}
