'use client';

import {
  guardActivations,
  NavigationLayer,
  useIsLayerClosing,
  VIEW_CHANGE_GUARD_MS,
} from '@/core/navigation';
import { cn } from '@/lib/cn';
import { AnimatePresence, motion, MotionConfig, useIsPresent } from 'framer-motion';
import { X } from 'lucide-react';
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { FocusableButton } from './FocusableButton';

export interface ModalDialogProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  /** Modale sans texte à lire (jeux pour les petits, FEAT-21) : titres réservés aux lecteurs d'écran */
  isTextless?: boolean;
  /**
   * Fermeture par `Échap`, par le fond ou par le bouton ✕, et par Retour (Retour arrière, bouton
   * Android) quand aucune zone D-Pad de la modale ne le gère. Sans `onClose`, la modale impose un
   * choix (ex: fin de partie) et laisse `Échap` remonter au moteur de navigation D-Pad (FEAT-04).
   */
  onClose?: () => void;
  /** Élément focalisé à l'ouverture (défaut : la boîte de dialogue elle-même) */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Rend le focus à l'élément d'origine à la fermeture (défaut), sauf si l'écran place son curseur */
  restoreFocus?: boolean;
  /** Boutons et fond sans effet après l'ouverture : un double tap ne les atteint pas (FEAT-04 §5) */
  inputGuardMs?: number;
  children: ReactNode;
  /** Classes du panneau de la boîte de dialogue */
  className?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const subscribeToNothing = () => () => undefined;

/** `false` au pré-rendu statique (pas de `document`), `true` dans le navigateur. */
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

/** Garde le focus clavier dans la boîte de dialogue : Tab boucle du dernier au premier élément. */
function trapTabKey(event: KeyboardEvent, panel: HTMLElement): void {
  const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  const first = focusables[0];
  const last = focusables.at(-1);

  if (!first || !last) {
    event.preventDefault();
    panel.focus();
    return;
  }

  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Un clic sur le fond ne doit pas faire sortir le focus de la boîte de dialogue. */
const keepFocusInside = (event: ReactMouseEvent) => {
  event.preventDefault();
};

/** Modale en train de se fermer : Retour ne fait plus rien, sans pour autant quitter l'application. */
const ignoreBack = () => undefined;

/**
 * Boîte de dialogue modale animée, rendue dans un portail sur `document.body`.
 * Gère le focus (ouverture, Tab, restauration à la fermeture) et `Échap`. Fermée, elle l'est dès que
 * `isOpen` passe à `false` : pendant son animation de sortie, plus rien n'y réagit.
 */
export function ModalDialog({ isOpen, ...dialogProps }: ModalDialogProps) {
  const isClient = useIsClient();
  if (!isClient) return null;

  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen ? <DialogLayer key="modal-dialog" {...dialogProps} /> : null}
      </AnimatePresence>
    </MotionConfig>,
    document.body,
  );
}

function DialogLayer({
  title,
  subtitle,
  isTextless = false,
  onClose,
  initialFocusRef,
  restoreFocus = true,
  inputGuardMs = VIEW_CHANGE_GUARD_MS,
  children,
  className,
}: Omit<ModalDialogProps, 'isOpen'>) {
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Une modale imbriquée se ferme avec sa parente : celle-ci garde ses enfants le temps de son
  // animation de sortie, sans que leur `isOpen` change.
  const isPresent = useIsPresent();
  const isParentClosing = useIsLayerClosing();
  const isLive = isPresent && !isParentClosing;

  const handleKeyDown = useEffectEvent((event: KeyboardEvent, panel: HTMLElement) => {
    if (event.key === 'Escape') {
      if (!onClose) return;
      // Évite que le moteur D-Pad (écouteur sur window) traite aussi `Échap` comme un retour.
      event.preventDefault();
      event.stopPropagation();
      // Maintenue, `Échap` ne ferme qu'une modale, pas celles de dessous.
      if (!event.repeat) onClose();
    } else if (event.key === 'Tab') {
      trapTabKey(event, panel);
    }
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !isLive) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initialFocusRef?.current ?? panel).focus();

    // Écouteur natif : jsx-a11y interdit les gestionnaires clavier sur role="dialog".
    const listener = (event: KeyboardEvent) => {
      handleKeyDown(event, panel);
    };
    panel.addEventListener('keydown', listener);

    // Dès la fermeture : le panneau, inerte, perdrait le focus. Sauf si l'écran l'a déjà placé ailleurs ;
    // une modale imbriquée qui se ferme avec celle-ci ne compte pas comme un ailleurs.
    return () => {
      panel.removeEventListener('keydown', listener);
      const active = document.activeElement;
      const isFocusLeftBehind =
        !active ||
        active === document.body ||
        panel.contains(active) ||
        active.closest('[data-dialog-closing]') !== null;
      if (restoreFocus && isFocusLeftBehind) opener?.focus();
    };
  }, [initialFocusRef, restoreFocus, isLive]);

  // Ouverture et fermeture : le second tap d'un double tap n'atteint ni la modale, ni l'écran dessous.
  // Avant l'affichage : un effet ordinaire laisserait passer un tap pendant les premières millisecondes.
  useLayoutEffect(() => {
    guardActivations(isLive ? inputGuardMs : VIEW_CHANGE_GUARD_MS);
  }, [isLive, inputGuardMs]);

  return (
    <div
      data-dialog-root
      data-dialog-closing={isLive ? undefined : true}
      className="fixed inset-0 z-50 flex items-center justify-center tv-safe-container"
    >
      <motion.div
        aria-hidden="true"
        role="presentation"
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onMouseDown={keepFocusInside}
        onClick={isLive ? onClose : undefined}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        inert={!isLive}
        className={cn(
          'relative flex max-h-full w-full max-w-lg flex-col gap-6 overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl outline-hidden md:p-8 tv:max-w-2xl',
          className,
        )}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <div
          className={cn(
            'flex flex-col gap-2 text-center',
            onClose && 'px-10',
            isTextless && 'sr-only',
          )}
        >
          <h2 id={titleId} className="text-fluid-2xl font-bold text-slate-50">
            {title}
          </h2>
          {subtitle ? (
            <p id={subtitleId} className="text-fluid-base text-slate-300">
              {subtitle}
            </p>
          ) : null}
        </div>

        {/* Couche D-Pad (FEAT-04) : suspend les zones de l'écran sous-jacent tant que la modale est
            montée ; les zones déclarées dans son contenu s'empilent au-dessus. */}
        <NavigationLayer onBack={isLive ? onClose : ignoreBack} isClosing={!isLive}>
          {children}
        </NavigationLayer>

        {onClose ? (
          <FocusableButton
            variant="ghost"
            size="sm"
            aria-label="Fermer"
            className="absolute top-3 right-3"
            leftIcon={<X className="size-6" />}
            onClick={onClose}
          />
        ) : null}
      </motion.div>
    </div>
  );
}
