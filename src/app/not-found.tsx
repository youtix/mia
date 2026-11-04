// Module direct, pas le barrel : la page n'embarque dans son JS client que son propre écran.
import { NotFoundScreen } from '@/components/ui/NotFoundScreen';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Page introuvable' };

/** Adresse inconnue : l'export statique en fait `404.html` (GitHub Pages, service worker). */
export default function NotFound() {
  return <NotFoundScreen />;
}
