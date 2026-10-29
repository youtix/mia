// Module direct, pas le barrel : chaque route n'embarque dans son JS client que son propre écran.
import { HubScreen } from '@/components/progression/HubScreen';

export default function HomePage() {
  return <HubScreen />;
}
