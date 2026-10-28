import { cn } from '@/lib/cn';
import { type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { FOCUSED_CLASSES, FOCUS_TRANSITION_CLASSES, FOCUS_VISIBLE_CLASSES } from './focus-styles';

export type FocusableButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

export type FocusableButtonSize = 'sm' | 'md' | 'lg' | 'tv';

export interface FocusableButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: FocusableButtonVariant;
  size?: FocusableButtonSize;
  /** Indique si le moteur de navigation D-Pad cible actuellement ce bouton */
  isFocused?: boolean;
  /** Raccourci de télécommande affiché en badge discret (ex: "OK", "Retour") */
  tvHint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** Prop React 19 : permet au moteur D-Pad (FEAT-04) de synchroniser le focus DOM. */
  ref?: Ref<HTMLButtonElement>;
}

// Fonds clairs + texte slate-950 : contraste WCAG AA (≥ 4,5:1) pour chaque variante pleine.
const VARIANT_CLASSES: Record<FocusableButtonVariant, string> = {
  primary: 'bg-sky-400 text-slate-950 hover:bg-sky-300',
  secondary: 'border-2 border-slate-600 bg-slate-800 text-slate-50 hover:bg-slate-700',
  ghost: 'bg-transparent text-slate-100 hover:bg-slate-800',
  danger: 'bg-rose-400 text-slate-950 hover:bg-rose-300',
  success: 'bg-emerald-400 text-slate-950 hover:bg-emerald-300',
};

// Cible tactile minimale de 48 px (56 px en mode TV) ; `tv` reste le format le plus grand.
const SIZE_CLASSES: Record<FocusableButtonSize, string> = {
  sm: 'gap-1.5 px-3 text-fluid-sm',
  md: 'gap-2 px-5 text-fluid-base',
  lg: 'gap-2.5 px-6 text-fluid-lg',
  tv: 'min-h-16 gap-3 px-8 text-fluid-xl tv:min-h-16',
};

export function FocusableButton({
  variant = 'primary',
  size = 'md',
  isFocused = false,
  tvHint,
  leftIcon,
  rightIcon,
  className,
  children,
  type = 'button',
  ref,
  ...rest
}: FocusableButtonProps) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      data-focused={isFocused || undefined}
      className={cn(
        'relative inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center rounded-xl font-semibold enabled:active:brightness-90 disabled:cursor-not-allowed disabled:opacity-50 tv:min-h-14',
        FOCUS_TRANSITION_CLASSES,
        FOCUS_VISIBLE_CLASSES,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        isFocused && FOCUSED_CLASSES,
        className,
      )}
    >
      {leftIcon ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {leftIcon}
        </span>
      ) : null}
      {children}
      {rightIcon ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {rightIcon}
        </span>
      ) : null}
      {tvHint ? (
        // Aide visuelle propre à la télécommande : masquée hors mode TV et des lecteurs d'écran.
        <kbd
          aria-hidden="true"
          className="hidden rounded-md border border-current/40 px-1.5 font-sans text-fluid-xs font-bold opacity-80 tv:inline-flex"
        >
          {tvHint}
        </kbd>
      ) : null}
    </button>
  );
}
