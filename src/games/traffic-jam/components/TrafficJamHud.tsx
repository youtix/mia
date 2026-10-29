'use client';

import { DifficultyPill, FocusableButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { DifficultyTier } from '@/types/mia';
import { Crown, Footprints, Lightbulb, RotateCcw, Undo2 } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { getCrownTargetLabel } from './labels';

type ChipTone = 'default' | 'crown' | 'missed';

const TONE_CLASSES: Record<ChipTone, string> = {
  default: 'border-slate-600 bg-slate-800/80 text-slate-100',
  crown: 'border-amber-300/70 bg-amber-400/10 text-amber-100',
  missed: 'border-slate-700 bg-slate-800/60 text-slate-400',
};

interface HudChipProps {
  icon: ReactNode;
  tone?: ChipTone;
  children: ReactNode;
}

/** Pastille d'information : icône décorative (doublant la couleur) et texte. */
function HudChip({ icon, tone = 'default', children }: HudChipProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-fluid-sm font-semibold',
        TONE_CLASSES[tone],
      )}
    >
      <span aria-hidden="true" className="inline-flex shrink-0">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

interface CrownChipProps {
  optimalMoves: number;
  moves: number;
  hasCrown: boolean;
}

/**
 * Objectif de la couronne (« Objectif Parfait : ≤ 10 coups »), barré une fois hors d'atteinte ;
 * « Couronne déjà gagnée » sur un niveau déjà couronné. Rien tant que l'optimal est inconnu (0).
 */
function CrownChip({ optimalMoves, moves, hasCrown }: CrownChipProps) {
  if (hasCrown) {
    return (
      <HudChip tone="crown" icon={<Crown className="size-4 fill-amber-300 text-amber-300" />}>
        Couronne déjà gagnée
      </HudChip>
    );
  }
  if (optimalMoves <= 0) return null;
  const isMissed = moves > optimalMoves;
  return (
    <HudChip tone={isMissed ? 'missed' : 'crown'} icon={<Crown className="size-4" />}>
      {/* Espace hors des balises : séparateur du texte vocalisé (« Objectif Parfait : ≤ 10 coups »). */}
      Objectif Parfait :{' '}
      <span className={cn('tabular-nums', isMissed && 'line-through')}>
        {getCrownTargetLabel(optimalMoves)}
      </span>
      {isMissed ? <span className="sr-only">, hors d’atteinte</span> : null}
    </HudChip>
  );
}

/** Actions du HUD, dans l'ordre de la zone D-Pad (après le Retour d'`AppShell`). */
export const HUD_ACTIONS = ['undo', 'hint', 'reset'] as const;

export type HudAction = (typeof HUD_ACTIONS)[number];

export interface TrafficJamHudProps {
  moves: number;
  /** Nombre minimal de coups du niveau (0 : inconnu, aucun objectif affiché) */
  optimalMoves: number;
  tier: DifficultyTier;
  /** Couronne de ce niveau déjà gagnée (victoire parfaite enregistrée) */
  hasCrown: boolean;
  /** « Annuler » n'a rien à annuler (aucun coup, ou partie gagnée) */
  canUndo: boolean;
  onUndo: () => void;
  onHint: () => void;
  onReset: () => void;
  /** Index D-Pad du premier bouton (`HUD_ACTIONS[0]`) dans la zone du HUD ; 0 est le Retour */
  firstActionIndex?: number;
  /** `getItemRef` de la zone D-Pad du HUD (`useGridNavigation`), indexée comme `isActionFocused` */
  getActionRef?: (index: number) => Ref<HTMLButtonElement>;
  /** `isItemFocused` de la zone D-Pad du HUD */
  isActionFocused?: (index: number) => boolean;
  /** Un bouton reçoit le focus DOM (Tab, clic) : activer la zone du HUD */
  onActionFocus?: () => void;
  className?: string;
}

const ACTION_LABELS: Record<HudAction, string> = {
  undo: 'Annuler',
  hint: 'Indice',
  reset: 'Recommencer',
};

const ACTION_ICONS: Record<HudAction, ReactNode> = {
  undo: <Undo2 className="size-5" />,
  hint: <Lightbulb className="size-5" />,
  reset: <RotateCcw className="size-5" />,
};

/**
 * Barre d'état de Traffic Jam : palier, compteur de coups, objectif de la couronne, puis les
 * boutons Annuler, Indice et Recommencer (zone D-Pad partagée avec le Retour d'`AppShell`).
 * Bandeau au-dessus du plateau en portrait, colonne à sa gauche en paysage.
 */
export function TrafficJamHud({
  moves,
  optimalMoves,
  tier,
  hasCrown,
  canUndo,
  onUndo,
  onHint,
  onReset,
  firstActionIndex = 1,
  getActionRef,
  isActionFocused,
  onActionFocus,
  className,
}: TrafficJamHudProps) {
  const handlers: Record<HudAction, () => void> = { undo: onUndo, hint: onHint, reset: onReset };

  return (
    <section aria-label="État de la partie" className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <DifficultyPill tier={tier} size="sm" />
        <HudChip icon={<Footprints className="size-4" />}>
          Coups : <span className="tabular-nums">{moves}</span>
        </HudChip>
        <CrownChip optimalMoves={optimalMoves} moves={moves} hasCrown={hasCrown} />
      </div>
      <div className="flex flex-wrap gap-2">
        {HUD_ACTIONS.map((action, offset) => {
          const index = firstActionIndex + offset;
          // `aria-disabled` plutôt que `disabled` : le bouton reste focalisable, le curseur de la
          // télécommande peut s'y poser (zone en ligne fixe) et le lecteur d'écran l'annonce inactif.
          const isDisabled = action === 'undo' && !canUndo;
          return (
            <FocusableButton
              key={action}
              ref={getActionRef?.(index)}
              isFocused={isActionFocused?.(index) ?? false}
              variant="secondary"
              size="sm"
              data-action={action}
              aria-disabled={isDisabled || undefined}
              className={cn(isDisabled && 'cursor-not-allowed opacity-50 hover:bg-slate-800')}
              leftIcon={ACTION_ICONS[action]}
              onClick={isDisabled ? undefined : handlers[action]}
              onFocus={onActionFocus}
            >
              {ACTION_LABELS[action]}
            </FocusableButton>
          );
        })}
      </div>
    </section>
  );
}
