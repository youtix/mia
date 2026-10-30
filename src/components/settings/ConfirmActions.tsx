'use client';

import { FocusableButton, type FocusableButtonVariant } from '@/components/ui';
import { useGridNavigation } from '@/core/navigation';
import type { ReactNode } from 'react';

export interface ConfirmActionsProps {
  scopeId: string;
  confirmLabel: string;
  confirmVariant?: FocusableButtonVariant;
  confirmIcon?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Zone déclarée dans la modale (elle s'empile au-dessus de l'écran, FEAT-04) ; curseur sur Annuler. */
export function ConfirmActions({
  scopeId,
  confirmLabel,
  confirmVariant = 'primary',
  confirmIcon,
  onCancel,
  onConfirm,
}: ConfirmActionsProps) {
  const actions = useGridNavigation({ scopeId, rows: 1, cols: 2 });

  return (
    <div className="flex flex-wrap justify-center gap-3">
      <FocusableButton
        ref={actions.getItemRef(0)}
        isFocused={actions.isItemFocused(0)}
        variant="secondary"
        size="lg"
        onClick={onCancel}
      >
        Annuler
      </FocusableButton>
      <FocusableButton
        ref={actions.getItemRef(1)}
        isFocused={actions.isItemFocused(1)}
        variant={confirmVariant}
        size="lg"
        leftIcon={confirmIcon}
        onClick={onConfirm}
      >
        {confirmLabel}
      </FocusableButton>
    </div>
  );
}
