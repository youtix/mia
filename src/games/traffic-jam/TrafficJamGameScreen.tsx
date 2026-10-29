'use client';

import { GameScreen } from '@/components/progression/GameScreen';
import { TrafficJamBoard } from '@/games/traffic-jam/components/TrafficJamBoard';
import { TRAFFIC_JAM_CATALOG } from './catalog';

/**
 * Écran de la page `/traffic-jam` : Carte des Étoiles du catalogue initial, et parking de l'étoile
 * lancée (`?level=<id>`), de `tj-001` à `tj-020`. Composant client : `renderLevel` est une
 * fonction, intransmissible depuis le composant serveur de la page. Modules importés directement
 * (pas les barrels) : le JS client de la route se limite à son écran.
 */
export function TrafficJamGameScreen() {
  return (
    <GameScreen
      gameId="traffic-jam"
      catalog={TRAFFIC_JAM_CATALOG}
      renderLevel={(level, controls) => <TrafficJamBoard level={level} controls={controls} />}
    />
  );
}
