'use client';

import { cn } from '@/lib/cn';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  useEffect,
  useEffectEvent,
  useId,
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
  /**
   * Fermeture par `Échap`, par le fond ou par le bouton ✕. Sans `onClose`, la modale impose un choix
   * (ex: fin de partie) et laisse `Échap` remonter au moteur de navigation D-Pad (FEAT-04).
   */
  onClose?: () => void;
  /** Élément focalisé à l'ouverture (défaut : la boîte de dialogue elle-même) */
  initialFocusRef?: RefObject<HTMLElement | null>;
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

/**
 * Boîte de dialogue modale animée, rendue dans un portail sur `document.body`.
 * Gère le focus (ouverture, Tab, restauration à la fermeture) et `Échap`.
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
  onClose,
  initialFocusRef,
  children,
  className,
}: Omit<ModalDialogProps, 'isOpen'>) {
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useEffectEvent((event: KeyboardEvent, panel: HTMLElement) => {
    if (event.key === 'Escape') {
      if (!onClose) return;
      // Évite que le moteur D-Pad (écouteur sur window) traite aussi `Échap` comme un retour.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab') {
      trapTabKey(event, panel);
    }
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initialFocusRef?.current ?? panel).focus();

    // Écouteur natif : jsx-a11y interdit les gestionnaires clavier sur role="dialog".
    const listener = (event: KeyboardEvent) => {
      handleKeyDown(event, panel);
    };
    panel.addEventListener('keydown', listener);

    return () => {
      panel.removeEventListener('keydown', listener);
      opener?.focus();
    };
  }, [initialFocusRef]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center tv-safe-container">
      <motion.div
        aria-hidden="true"
        role="presentation"
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onMouseDown={keepFocusInside}
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-full w-full max-w-lg flex-col gap-6 overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl outline-hidden md:p-8 tv:max-w-2xl',
          className,
        )}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <div className={cn('flex flex-col gap-2 text-center', onClose && 'px-10')}>
          <h2 id={titleId} className="text-fluid-2xl font-bold text-slate-50">
            {title}
          </h2>
          {subtitle ? (
            <p id={subtitleId} className="text-fluid-base text-slate-300">
              {subtitle}
            </p>
          ) : null}
        </div>

        {children}

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
