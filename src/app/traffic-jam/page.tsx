// Module direct, pas le barrel : chaque route n'embarque dans son JS client que son propre écran.
import { GAME_REGISTRY } from '@/core/progression';
import { TrafficJamGameScreen } from '@/games/traffic-jam/TrafficJamGameScreen';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: GAME_REGISTRY['traffic-jam'].title };

export default function TrafficJamPage() {
  return <TrafficJamGameScreen />;
}
