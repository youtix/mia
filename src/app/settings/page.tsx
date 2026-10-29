// Module direct, pas le barrel : chaque route n'embarque dans son JS client que son propre écran.
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Réglages' };

export default function SettingsPage() {
  return <SettingsScreen />;
}
