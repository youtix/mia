import { cn } from '@/lib/cn';
import { ArrowLeft, Move, Undo2 } from 'lucide-react';
import { type ReactNode } from 'react';
import { FocusableButton } from './FocusableButton';
import { StarBadge, type StarBadgeProps } from './StarBadge';

export interface RemoteHint {
  /** Touche de la télécommande : texte court (« OK ») ou icône */
  button: ReactNode;
  /** Action déclenchée (ex: « Sélectionner ») */
  action: string;
}

/**
 * « ✛ Naviguer • OK Sélectionner • ↩ Retour ». Icônes plutôt que glyphes :
 * la police Atkinson Hyperlegible Next ne contient ni ✛ ni ↩.
 */
export const DEFAULT_REMOTE_HINTS: readonly RemoteHint[] = [
  { button: <Move className="size-[1.1em]" />, action: 'Naviguer' },
  { button: 'OK', action: 'Sélectionner' },
  { button: <Undo2 className="size-[1.1em]" />, action: 'Retour' },
];

export interface AppShellProps {
  /** Titre de l'écran (`h1`) */
  title: string;
  /** Affiche le bouton Retour de l'en-tête */
  onBack?: () => void;
  /** Indique si le moteur de navigation D-Pad cible le bouton Retour */
  isBackFocused?: boolean;
  /** Badge du profil actif (ex: bouton avatar de FEAT-06) */
  profile?: ReactNode;
  /** Compteur d'étoiles global */
  stars?: Pick<StarBadgeProps, 'earned' | 'total' | 'isPerfect'>;
  /** Aides de la télécommande, affichées en pied de page en mode TV uniquement */
  footerHints?: readonly RemoteHint[];
  children: ReactNode;
  className?: string;
}

/**
 * Structure commune des écrans : zone de sécurité (overscan TV, encoches), en-tête compact,
 * contenu défilant et aides de la télécommande. Rend le `<main>` de la page.
 */
export function AppShell({
  title,
  onBack,
  isBackFocused = false,
  profile,
  stars,
  footerHints,
  children,
  className,
}: AppShellProps) {
  return (
    <div className={cn('flex h-dvh flex-col gap-3 tv-safe-container md:gap-4', className)}>
      <header className="flex shrink-0 items-center gap-3">
        {onBack ? (
          <FocusableButton
            variant="ghost"
            size="sm"
            isFocused={isBackFocused}
            leftIcon={<ArrowLeft className="size-6" />}
            onClick={onBack}
          >
            <span className="sr-only sm:not-sr-only">Retour</span>
          </FocusableButton>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-fluid-2xl font-bold">{title}</h1>
        {profile}
        {stars ? <StarBadge {...stars} /> : null}
      </header>

      {/* Marge interne compensée : l'anneau de focus zoomé n'est pas rogné par le défilement. */}
      <main className="-mx-3 flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2">
        {children}
      </main>

      {footerHints && footerHints.length > 0 ? (
        <footer className="hidden shrink-0 justify-center tv:flex">
          <ul
            aria-label="Commandes de la télécommande"
            className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-fluid-sm text-slate-300"
          >
            {footerHints.map((hint) => (
              <li key={hint.action} className="flex items-center gap-2">
                <kbd className="inline-flex min-w-9 items-center justify-center rounded-md border border-slate-500 bg-slate-800 px-2 py-0.5 font-sans font-bold text-slate-50">
                  {hint.button}
                </kbd>{' '}
                {hint.action}
              </li>
            ))}
          </ul>
        </footer>
      ) : null}
    </div>
  );
}
