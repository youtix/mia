// Module direct, pas le barrel : chaque route n'embarque dans son JS client que son propre écran.
import { GAME_REGISTRY } from '@/core/progression';
import { LogicGridGameScreen } from '@/games/logic-grid/LogicGridGameScreen';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: GAME_REGISTRY['logic-grid'].title };

export default function LogicGridPage() {
  return <LogicGridGameScreen />;
}
