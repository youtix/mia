// Module direct, pas le barrel : chaque route n'embarque dans son JS client que son propre écran.
import { GAME_REGISTRY } from '@/core/progression';
import { GoNoGoGameScreen } from '@/games/go-no-go/GoNoGoGameScreen';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: GAME_REGISTRY['go-no-go'].title };

export default function GoNoGoPage() {
  return <GoNoGoGameScreen />;
}
