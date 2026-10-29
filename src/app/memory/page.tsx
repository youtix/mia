// Module direct, pas le barrel : chaque route n'embarque dans son JS client que son propre écran.
import { GAME_REGISTRY } from '@/core/progression';
import { MemoryGameScreen } from '@/games/memory/MemoryGameScreen';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: GAME_REGISTRY.memory.title };

export default function MemoryPage() {
  return <MemoryGameScreen />;
}
