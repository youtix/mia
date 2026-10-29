import { AppShell, FadeIn } from '@/components/ui';
import { LoaderCircle } from 'lucide-react';

export interface WaitingScreenProps {
  /** Titre de l'écran en attente (ex: « Mia », « Memory ») */
  title: string;
}

/**
 * Écran d'attente du chargement de la sauvegarde (pré-rendu statique, premier rendu) : l'indicateur
 * n'apparaît qu'après un court délai, pour ne pas clignoter quand la sauvegarde se lit aussitôt.
 */
export function WaitingScreen({ title }: WaitingScreenProps) {
  return (
    <AppShell title={title}>
      <div role="status" className="flex flex-1 items-center justify-center">
        <FadeIn delay={0.4} className="flex flex-col items-center gap-3 text-slate-300">
          <LoaderCircle aria-hidden="true" className="size-10 motion-safe:animate-spin" />
          <span className="text-fluid-base">Chargement…</span>
        </FadeIn>
      </div>
    </AppShell>
  );
}
