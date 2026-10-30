'use client';

import { GameScreen } from '@/components/progression/GameScreen';
import { PatternsBoard } from '@/games/patterns/components/PatternsBoard';
import { PATTERNS_CATALOG } from './catalog';

/**
 * Écran de la page `/patterns` : Carte des Étoiles du catalogue, et plateau de l'étoile lancée
 * (`?level=<id>`), de `pat-001` à `pat-020`. Composant client : `renderLevel` est une fonction,
 * intransmissible depuis le composant serveur de la page. Modules importés directement (pas les
 * barrels) : le JS client de la route se limite à son écran.
 */
export function PatternsGameScreen() {
  return (
    <GameScreen
      gameId="patterns"
      catalog={PATTERNS_CATALOG}
      renderLevel={(level, controls) => <PatternsBoard level={level} controls={controls} />}
    />
  );
}
