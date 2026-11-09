'use client';

import { GameScreen } from '@/components/progression/GameScreen';
import { getAudioService } from '@/core/audio/audio-service';
import { GoNoGoBoard } from '@/games/go-no-go/components/GoNoGoBoard';
import { useEffect } from 'react';
import { GO_NO_GO_CATALOG } from './catalog';
import { VOICE_CLIP_PREFIX } from './voice-script';

/**
 * Écran de la page `/go-no-go` : Carte des Étoiles du catalogue, et plateau de l'étoile lancée
 * (`?level=<id>`), de `gn-001` à `gn-020`. Composant client : `renderLevel` est une fonction,
 * intransmissible depuis le composant serveur de la page. Modules importés directement (pas les
 * barrels) : le JS client de la route se limite à son écran.
 */
export function GoNoGoGameScreen() {
  // Les voix décodées du jeu (une quarantaine de secondes) ne restent pas en mémoire une fois le jeu
  // quitté : le plateau, lui, est remonté à chaque étoile et les garde d'une étoile à l'autre.
  useEffect(
    () => () => {
      getAudioService().releaseClips(VOICE_CLIP_PREFIX);
    },
    [],
  );
  return (
    <GameScreen
      gameId="go-no-go"
      catalog={GO_NO_GO_CATALOG}
      renderLevel={(level, controls) => <GoNoGoBoard level={level} controls={controls} />}
    />
  );
}
