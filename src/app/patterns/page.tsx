// Module direct, pas le barrel : chaque route n'embarque dans son JS client que son propre écran.
import { GAME_REGISTRY } from '@/core/progression';
import { PatternsGameScreen } from '@/games/patterns/PatternsGameScreen';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: GAME_REGISTRY.patterns.title };

export default function PatternsPage() {
  return <PatternsGameScreen />;
}
