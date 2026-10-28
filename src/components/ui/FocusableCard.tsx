import { cn } from '@/lib/cn';
import { Check, Lock } from 'lucide-react';
import { type ButtonHTMLAttributes, type Ref } from 'react';
import { FOCUSED_CLASSES, FOCUS_TRANSITION_CLASSES, FOCUS_VISIBLE_CLASSES } from './focus-styles';

export interface FocusableCardProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onSelect' | 'onClick' | 'type'
> {
  /** Indique si le moteur de navigation D-Pad cible actuellement cette carte */
  isFocused?: boolean;
  /** Carte verrouillée : reste atteignable (Tab / D-Pad) mais `onSelect` n'est jamais appelé */
  isLocked?: boolean;
  /** Élément courant de la collection (ex: profil actif), annoncé via `aria-current` */
  isActive?: boolean;
  /** Activation au tap, au clic, à `Entrée` ou à `Espace` (bouton natif) */
  onSelect?: () => void;
  /** Prop React 19 : permet au moteur D-Pad (FEAT-04) de synchroniser le focus DOM. */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Carte interactive (jeux, tuiles d'Étoiles, profils). `<button>` natif : le contenu doit rester
 * du contenu « phrasé » (`span`, `svg`, `img`… mis en forme en `block` / `flex`), sans élément interactif.
 */
export function FocusableCard({
  isFocused = false,
  isLocked = false,
  isActive = false,
  onSelect,
  className,
  children,
  ref,
  ...rest
}: FocusableCardProps) {
  const handleClick = () => {
    if (!isLocked) onSelect?.();
  };

  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      onClick={handleClick}
      aria-disabled={isLocked || undefined}
      aria-current={isActive || undefined}
      data-focused={isFocused || undefined}
      className={cn(
        'relative flex min-h-12 min-w-12 cursor-pointer flex-col gap-2 rounded-2xl border-2 border-slate-700 bg-slate-800 p-4 text-left text-slate-50 hover:border-slate-500',
        FOCUS_TRANSITION_CLASSES,
        FOCUS_VISIBLE_CLASSES,
        isActive && 'border-emerald-400 bg-emerald-950/40 hover:border-emerald-300',
        isLocked && 'cursor-not-allowed opacity-60 hover:border-slate-700',
        isFocused && FOCUSED_CLASSES,
        className,
      )}
    >
      {children}
      {isActive ? (
        // Indice non coloré de l'état actif (daltonisme), en plus de la bordure émeraude.
        <span
          aria-hidden="true"
          className="absolute -top-2 -left-2 flex size-7 items-center justify-center rounded-full bg-emerald-400 text-slate-950"
        >
          <Check className="size-4" strokeWidth={3} />
        </span>
      ) : null}
      {isLocked ? (
        <span className="absolute top-2 right-2 flex items-center rounded-full bg-slate-950/70 p-1.5 text-slate-300">
          <Lock aria-hidden="true" className="size-4" />
          <span className="sr-only">, verrouillé</span>
        </span>
      ) : null}
    </button>
  );
}
