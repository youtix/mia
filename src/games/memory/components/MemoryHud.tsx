'use client';

import { DifficultyPill } from '@/components/ui';
import type { InputMode } from '@/core/navigation';
import { cn } from '@/lib/cn';
import type { DifficultyTier } from '@/types/mia';
import { Copy, Crown, Eye, Layers, TriangleAlert, Zap } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { MemoryGameState } from '../types';
import { getCrownTargetLabel, getGroupsTitle, getMatchRuleLabel, getSwapRuleLabel } from './labels';

type ChipTone = 'default' | 'warning' | 'swap' | 'swapping' | 'crown' | 'missed';

const TONE_CLASSES: Record<ChipTone, string> = {
  default: 'border-slate-600 bg-slate-800/80 text-slate-100',
  warning: 'border-amber-300 bg-amber-400/20 text-amber-50',
  swap: 'border-purple-400/70 bg-purple-500/15 text-purple-100',
  swapping: 'border-purple-300 bg-purple-500/45 text-slate-50 ring-2 ring-purple-400',
  crown: 'border-amber-300/70 bg-amber-400/10 text-amber-100',
  missed: 'border-slate-700 bg-slate-800/60 text-slate-400',
};

interface HudChipProps {
  icon?: ReactNode;
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
      {icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/** « 3 / 8 » à l'écran, « 3 sur 8 » pour les lecteurs d'écran. */
function Fraction({ value, total }: { value: number; total: number }) {
  return (
    <>
      <span aria-hidden="true" className="tabular-nums">
        {value} / {total}
      </span>
      <span className="sr-only">
        {value} sur {total}
      </span>
    </>
  );
}

/**
 * Erreurs de la partie. Limite inclusive (FEAT-09 §5) : « Erreurs : 10 / 10 » annonce le dernier
 * essai ; après la défaite, « plus de 10 », jamais « 11 / 10 ».
 */
function MistakesChip({ mistakes, maxMistakes }: { mistakes: number; maxMistakes: number | null }) {
  const warningIcon = <TriangleAlert className="size-4" />;
  if (maxMistakes === 0) {
    return (
      <HudChip tone="warning" icon={warningIcon}>
        Aucune erreur permise
      </HudChip>
    );
  }
  if (maxMistakes === null) {
    return (
      <HudChip>
        Erreurs : <span className="tabular-nums">{mistakes}</span>
      </HudChip>
    );
  }
  if (mistakes > maxMistakes) {
    return <HudChip tone="warning">Erreurs : plus de {maxMistakes}</HudChip>;
  }
  const isLastTry = mistakes === maxMistakes;
  return (
    <HudChip tone={isLastTry ? 'warning' : 'default'} icon={isLastTry ? warningIcon : null}>
      Erreurs : <Fraction value={mistakes} total={maxMistakes} />
      {isLastTry ? <strong> · Dernier essai !</strong> : null}
    </HudChip>
  );
}

interface CrownChipProps {
  perfectMaxMistakes: number;
  mistakes: number;
  hasCrown: boolean;
}

/** Objectif de la couronne (« 4 erreurs max »), barré une fois hors d'atteinte. */
function CrownChip({ perfectMaxMistakes, mistakes, hasCrown }: CrownChipProps) {
  if (hasCrown) {
    return (
      <HudChip tone="crown" icon={<Crown className="size-4 fill-amber-300 text-amber-300" />}>
        Couronne déjà gagnée
      </HudChip>
    );
  }
  const isMissed = mistakes > perfectMaxMistakes;
  return (
    <HudChip tone={isMissed ? 'missed' : 'crown'} icon={<Crown className="size-4" />}>
      {/* Espaces hors des balises : séparateurs du texte vocalisé (« Couronne : 4 erreurs max »). */}
      <span className="sr-only">Couronne :</span>{' '}
      <span className={cn(isMissed && 'line-through')}>
        {getCrownTargetLabel(perfectMaxMistakes)}
      </span>
      {isMissed ? <span className="sr-only">, hors d’atteinte</span> : null}
    </HudChip>
  );
}

/** « 3 » à l'écran, « 3 secondes » pour les lecteurs d'écran. */
function SecondsLeft({ value }: { value: number }) {
  return (
    <>
      {value}
      <span className="sr-only">{value > 1 ? ' secondes' : ' seconde'}</span>
    </>
  );
}

/** Secondes d'aperçu restantes : « 3 », « 2 », « 1 » (remonté à chaque nouvelle partie). */
function PreviewCountdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(() => Math.max(1, Math.ceil(seconds)));

  useEffect(() => {
    const timer = setInterval(() => {
      setLeft((value) => Math.max(1, value - 1));
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  return <SecondsLeft value={left} />;
}

interface PreviewBannerProps {
  seconds: number;
  isRunning: boolean;
  round: number;
  inputMode: InputMode;
}

/** « Mémorise les cartes ! » et compte à rebours ; un tap ou OK termine l'aperçu plus tôt. */
function PreviewBanner({ seconds, isRunning, round, inputMode }: PreviewBannerProps) {
  return (
    <p className="flex items-center gap-3 rounded-2xl border-2 border-sky-400 bg-sky-950/60 px-3 py-2 text-slate-50">
      <Eye aria-hidden="true" className="size-6 shrink-0 text-sky-300" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-fluid-base font-bold">Mémorise les cartes !</span>
        <span className="text-fluid-xs text-slate-300">
          {inputMode === 'dpad'
            ? 'Appuie sur OK pour commencer'
            : 'Touche une carte pour commencer'}
        </span>
      </span>
      <span className="text-fluid-2xl leading-none font-bold text-sky-200 tabular-nums">
        {isRunning ? (
          <PreviewCountdown key={round} seconds={seconds} />
        ) : (
          <SecondsLeft value={Math.max(1, Math.ceil(seconds))} />
        )}
      </span>
    </p>
  );
}

export interface MemoryHudProps {
  game: MemoryGameState;
  tier: DifficultyTier;
  /** Couronne de ce niveau déjà gagnée (victoire parfaite enregistrée) */
  hasCrown: boolean;
  /** Une permutation vient d'avoir lieu : le badge de la règle s'illumine (1 s) */
  isSwapping: boolean;
  /** Numéro de la partie : le compte à rebours repart à chaque nouvelle partie */
  round: number;
  /** Aide de l'aperçu : « Touche une carte » au doigt, « Appuie sur OK » à la télécommande */
  inputMode: InputMode;
  className?: string;
}

/**
 * Informations de la partie, sans élément interactif (les boutons sont dans l'en-tête
 * d'`AppShell`) : palier, règles, puis compteurs ou aperçu. Bandeau au-dessus du plateau en
 * portrait, colonne à sa gauche en paysage. L'aperçu et les compteurs partagent la même cellule :
 * la hauteur ne change pas à la fin de l'aperçu, donc le plateau ne se redimensionne pas.
 */
export function MemoryHud({
  game,
  tier,
  hasCrown,
  isSwapping,
  round,
  inputMode,
  className,
}: MemoryHudProps) {
  const { config, phase, mistakes } = game;
  const isPreview = phase === 'preview';

  return (
    <section aria-label="État de la partie" className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <DifficultyPill tier={tier} size="sm" />
        <HudChip
          icon={
            config.matchSize === 3 ? <Layers className="size-4" /> : <Copy className="size-4" />
          }
        >
          {getMatchRuleLabel(config.matchSize)}
        </HudChip>
        {config.swapEveryNMistakes === null ? null : (
          <HudChip tone={isSwapping ? 'swapping' : 'swap'} icon={<Zap className="size-4" />}>
            {getSwapRuleLabel(config.swapEveryNMistakes)}
          </HudChip>
        )}
      </div>
      <div className="grid">
        {config.previewSeconds > 0 ? (
          <div
            aria-hidden={!isPreview || undefined}
            className={cn('[grid-area:1/1]', !isPreview && 'invisible')}
          >
            <PreviewBanner
              seconds={config.previewSeconds}
              isRunning={isPreview}
              round={round}
              inputMode={inputMode}
            />
          </div>
        ) : null}
        <div
          aria-hidden={isPreview || undefined}
          className={cn(
            'flex flex-wrap items-start gap-2 [grid-area:1/1] landscape:flex-col',
            isPreview && 'invisible',
          )}
        >
          <HudChip>
            {getGroupsTitle(config.matchSize)} :{' '}
            <Fraction value={game.matchedGroups} total={game.totalGroups} />
          </HudChip>
          <MistakesChip mistakes={mistakes} maxMistakes={config.maxMistakes} />
          <CrownChip
            perfectMaxMistakes={config.perfectMaxMistakes}
            mistakes={mistakes}
            hasCrown={hasCrown}
          />
        </div>
      </div>
    </section>
  );
}
