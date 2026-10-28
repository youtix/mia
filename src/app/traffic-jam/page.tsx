// Module direct, pas le barrel : chaque route n'embarque dans son JS client que son propre écran.
import { GameScreen } from '@/components/progression/GameScreen';
import { GAME_REGISTRY } from '@/core/progression';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: GAME_REGISTRY['traffic-jam'].title };

export default function TrafficJamPage() {
  return <GameScreen gameId="traffic-jam" />;
}
