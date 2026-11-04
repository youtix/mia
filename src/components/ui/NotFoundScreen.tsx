'use client';

import { useGridNavigation } from '@/core/navigation';
import { House } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FocusableButton } from './FocusableButton';

/** Textes de la page d'une adresse inconnue (FEAT-17). */
export const NOT_FOUND_TEXTS = {
  title: 'Cette page n’existe pas',
  note: 'Reviens à l’accueil pour retrouver tes jeux.',
  backToHub: 'Retour à l’accueil',
} as const;

/**
 * Page d'une adresse inconnue : le bouton et Retour ramènent au Hub. Une PWA installée n'a pas de barre
 * d'adresse, et le Hub est servi par le worker : la sortie marche aussi hors-ligne.
 */
export function NotFoundScreen() {
  const router = useRouter();
  const backToHub = () => {
    router.replace('/');
  };
  const actions = useGridNavigation({
    scopeId: 'not-found-actions',
    rows: 1,
    cols: 1,
    onBack: backToHub,
  });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 tv-safe-container text-center">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-fluid-2xl font-bold">{NOT_FOUND_TEXTS.title}</h1>
        <p className="text-fluid-base text-slate-300">{NOT_FOUND_TEXTS.note}</p>
      </div>
      <FocusableButton
        ref={actions.getItemRef(0)}
        isFocused={actions.isItemFocused(0)}
        size="lg"
        leftIcon={<House className="size-5" />}
        onClick={backToHub}
      >
        {NOT_FOUND_TEXTS.backToHub}
      </FocusableButton>
    </main>
  );
}
