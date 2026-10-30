// Module direct, pas le barrel : chaque route n'embarque dans son JS client que son propre écran.
import { GAME_REGISTRY } from '@/core/progression';
import { BearSortGameScreen } from '@/games/bear-sort/BearSortGameScreen';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: GAME_REGISTRY['bear-sort'].title };

export default function BearSortPage() {
  return <BearSortGameScreen />;
}
