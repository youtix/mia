'use client';

import {
  AppShell,
  DEFAULT_REMOTE_HINTS,
  DifficultyPill,
  FocusableButton,
  StarBadge,
} from '@/components/ui';
import {
  useGridColumns,
  useGridNavigation,
  useNavigation,
  type Direction,
  type GridCoord,
} from '@/core/navigation';
import type {
  EnrichedLevelItem,
  GameProgressSummary,
  TierProgressSummary,
} from '@/core/progression';
import type { DifficultyTier } from '@/types/mia';
import { Crown, Lock, Play, Trophy } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { getStarCounter } from './labels';
import { getGoalLevel, getInitialLevel, getNextGoal, type NextGoal } from './next-goal';
import { StarLevelTile } from './StarLevelTile';
import {
  useZoneController,
  useZoneRegistry,
  type ZoneEntry,
  type ZoneRegistry,
  type ZoneShape,
} from './zone-chain';

/** Colonnes des tuiles tant qu'elles ne sont pas mesurées (pré-rendu, jsdom). */
const TILE_COLUMNS_FALLBACK = 4;

/** Durée d'affichage du message d'une étoile verrouillée. */
export const LOCKED_HINT_DURATION_MS = 4000;

/** Zones D-Pad de la carte : l'en-tête (Retour, Jouer), puis un palier par zone. */
type MapZone = 'header' | DifficultyTier;

interface LockedHint {
  /** Change à chaque message, même identique : le délai d'effacement repart. */
  id: number;
  text: string;
}

export interface StarMapScreenProps {
  /** Titre du jeu (en-tête) */
  title: string;
  /** Progression du profil actif dans ce jeu (`getGameProgressSummary`) */
  summary: GameProgressSummary;
  /** Lance un niveau débloqué (identifiant stable `definition.id`) */
  onPlayLevel: (levelId: string) => void;
  /** Retour au Hub (bouton, Retour de la télécommande ou d'Android) */
  onBack: () => void;
}

/**
 * Carte des Étoiles d'un jeu : les 5 paliers et toutes leurs étoiles, au doigt comme au D-Pad.
 * Le curseur s'ouvre sur l'objectif (prochaine étoile, sinon première étoile sans couronne) ;
 * les flèches suivent l'ordre de lecture (Gauche / Droite : étoile précédente / suivante, d'une
 * ligne ou d'un palier à l'autre), Haut / Bas gardent la colonne d'un palier à l'autre.
 */
export function StarMapScreen({ title, summary, onPlayLevel, onBack }: StarMapScreenProps) {
  const { inputMode } = useNavigation();
  const goal = getNextGoal(summary);
  const goalLevel = getGoalLevel(goal);
  const [initialLevel] = useState(() => getInitialLevel(summary));
  const initialTier = initialLevel?.definition.tier ?? null;
  const [activeZone, setActiveZone] = useState<MapZone>(initialTier ?? 'header');
  // Palier rejoint par Bas depuis l'en-tête : celui que le curseur a quitté.
  const [lastTier, setLastTier] = useState<DifficultyTier | null>(initialTier);
  const [hint, setHint] = useState<LockedHint | null>(null);
  const zones = useZoneRegistry<DifficultyTier>();
  const mapRef = useRef<HTMLDivElement>(null);
  const filledTiers = summary.tiers
    .filter((tier) => tier.levels.length > 0)
    .map(({ tier }) => tier);
  const headerCount = goalLevel ? 2 : 1;

  const activateTier = (tier: DifficultyTier, entry: ZoneEntry) => {
    zones.enter(tier, entry);
    setActiveZone(tier);
    setLastTier(tier);
  };

  const header = useGridNavigation({
    scopeId: 'star-map-header',
    rows: 1,
    cols: headerCount,
    isActive: activeZone === 'header',
    onBack,
    onEdge: (direction) => {
      if (direction === 'down' && lastTier) activateTier(lastTier, { kind: 'keep' });
    },
  });

  /** Arrivée dans l'en-tête par le haut de la carte : sur « Jouer », sinon sur Retour. */
  const enterHeader = () => {
    header.setFocusedIndex(headerCount - 1);
    setActiveZone('header');
  };

  const handleTierEdge = (
    tier: DifficultyTier,
    direction: Direction,
    coord: GridCoord,
    { count, cols }: ZoneShape,
  ) => {
    const index = coord.row * cols + coord.col;
    const position = filledTiers.indexOf(tier);
    const previous = filledTiers[position - 1];
    const next = filledTiers[position + 1];
    switch (direction) {
      case 'right':
        if (index < count - 1) zones.enter(tier, { kind: 'index', index: index + 1 });
        else if (next) activateTier(next, { kind: 'first' });
        return;
      case 'left':
        if (index > 0) zones.enter(tier, { kind: 'index', index: index - 1 });
        else if (previous) activateTier(previous, { kind: 'last' });
        return;
      case 'down':
        if (next) activateTier(next, { kind: 'top', col: coord.col });
        return;
      case 'up':
        if (previous) activateTier(previous, { kind: 'bottom', col: coord.col });
        else enterHeader();
        return;
    }
  };

  const showLockedHint = (level: EnrichedLevelItem) => {
    const next = summary.nextPlayableLevel;
    const locked = `L’Étoile #${String(level.starNumber)} est verrouillée`;
    const text = next
      ? `${locked} : gagne l’Étoile #${String(next.starNumber)} pour avancer.`
      : `${locked}.`;
    setHint((previous) => ({ id: (previous?.id ?? 0) + 1, text }));
  };

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => {
      setHint(null);
    }, LOCKED_HINT_DURATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [hint]);

  // Au doigt, rien ne suit le curseur (FEAT-04 §5) : la carte défile elle-même jusqu'à l'objectif.
  // Au D-Pad, la zone active s'en charge (focus DOM et défilement).
  const revealInitialTile = useEffectEvent(() => {
    if (inputMode !== 'touch' || !initialLevel) return;
    const tiles = mapRef.current?.querySelectorAll<HTMLElement>('[data-level-id]') ?? [];
    Array.from(tiles)
      .find((tile) => tile.dataset.levelId === initialLevel.definition.id)
      ?.scrollIntoView({ block: 'center', inline: 'nearest' });
  });

  useEffect(() => {
    revealInitialTile();
  }, []);

  const focusTier = (tier: DifficultyTier) => {
    setActiveZone(tier);
    setLastTier(tier);
  };

  const focusHeader = () => {
    setActiveZone('header');
  };

  const playLevel = (level: EnrichedLevelItem) => {
    onPlayLevel(level.definition.id);
  };

  return (
    <AppShell
      title={title}
      onBack={onBack}
      isBackFocused={header.isItemFocused(0)}
      backButtonRef={header.getItemRef(0)}
      onBackFocus={focusHeader}
      profile={
        goalLevel ? (
          <FocusableButton
            ref={header.getItemRef(1)}
            isFocused={header.isItemFocused(1)}
            size="sm"
            leftIcon={
              goal.kind === 'crown' ? <Crown className="size-5" /> : <Play className="size-5" />
            }
            onClick={() => {
              playLevel(goalLevel);
            }}
            onFocus={focusHeader}
          >
            <GoalButtonLabel goal={goal} starNumber={goalLevel.starNumber} />
          </FocusableButton>
        ) : null
      }
      stars={getStarCounter(summary)}
      footerHints={DEFAULT_REMOTE_HINTS}
    >
      <div ref={mapRef} className="flex flex-col gap-6 pb-2 md:gap-7">
        {goal.kind === 'complete' ? (
          <p className="flex items-center justify-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-400/15 px-4 py-3 text-center text-fluid-lg font-semibold text-amber-100">
            <Trophy aria-hidden="true" className="size-6 shrink-0 text-amber-300" />
            Toutes les étoiles et couronnes !
            <Crown aria-hidden="true" className="size-6 shrink-0 fill-amber-300 text-amber-300" />
          </p>
        ) : null}
        {summary.tiers.map((tierSummary) => (
          <TierSection
            key={tierSummary.tier}
            summary={tierSummary}
            isActive={activeZone === tierSummary.tier}
            initialIndex={
              tierSummary.tier === initialTier && initialLevel
                ? Math.max(
                    tierSummary.levels.findIndex(
                      (level) => level.definition.id === initialLevel.definition.id,
                    ),
                    0,
                  )
                : 0
            }
            register={zones.register}
            onEdge={handleTierEdge}
            onBack={onBack}
            onFocusTier={focusTier}
            onPlay={playLevel}
            onLocked={showLockedHint}
          />
        ))}
      </div>

      {/* Région toujours présente : son contenu est annoncé par les lecteurs d'écran. */}
      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--safe-area-y)_+_1rem)] z-40 flex justify-center px-4 tv:bottom-[calc(var(--safe-area-y)_+_4rem)]"
      >
        {hint ? (
          <p
            key={hint.id}
            className="flex max-w-xl items-center gap-3 rounded-2xl border border-amber-300/60 bg-slate-800 px-4 py-3 text-fluid-base text-slate-50 shadow-2xl"
          >
            <Lock aria-hidden="true" className="size-5 shrink-0 text-amber-300" />
            {hint.text}
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}

/**
 * « Jouer l'Étoile #7 » / « Viser la couronne (Étoile #7) », réduit à « #7 » sur petit écran
 * (texte masqué visuellement mais vocalisé), pour que l'en-tête tienne sur un smartphone. Espace
 * hors des balises : séparateur du nom accessible.
 */
function GoalButtonLabel({ goal, starNumber }: { goal: NextGoal; starNumber: number }) {
  const isCrown = goal.kind === 'crown';
  return (
    <span>
      <span className="sr-only sm:not-sr-only">
        {isCrown ? 'Viser la couronne (Étoile' : 'Jouer l’Étoile'}
      </span>{' '}
      #{starNumber}
      {isCrown ? <span className="sr-only sm:not-sr-only">)</span> : null}
    </span>
  );
}

interface TierSectionProps {
  summary: TierProgressSummary;
  isActive: boolean;
  /** Curseur au montage (l'objectif dans son palier) */
  initialIndex: number;
  register: ZoneRegistry<DifficultyTier>['register'];
  onEdge: (tier: DifficultyTier, direction: Direction, coord: GridCoord, shape: ZoneShape) => void;
  onBack: () => void;
  onFocusTier: (tier: DifficultyTier) => void;
  onPlay: (level: EnrichedLevelItem) => void;
  onLocked: (level: EnrichedLevelItem) => void;
}

/**
 * Un palier : pastille et compteur, puis la grille de ses étoiles (zone D-Pad). Sur tablette et
 * TV, la pastille forme une colonne de largeur fixe : toutes les grilles ont la même largeur, donc
 * les mêmes colonnes, et Haut / Bas gardent la colonne d'un palier à l'autre.
 */
function TierSection({
  summary,
  isActive,
  initialIndex,
  register,
  onEdge,
  onBack,
  onFocusTier,
  onPlay,
  onLocked,
}: TierSectionProps) {
  const { tier, levels } = summary;
  const headingId = useId();
  const [gridRef, cols] = useGridColumns<HTMLDivElement>(TILE_COLUMNS_FALLBACK);
  const count = levels.length;
  const tiles = useGridNavigation({
    scopeId: `star-map-${tier}`,
    rows: Math.ceil(count / cols),
    cols,
    totalItems: count,
    initialIndex,
    isActive: isActive && count > 0,
    onBack,
    onEdge: (direction, coord) => {
      onEdge(tier, direction, coord, { count, cols });
    },
  });
  useZoneController(register, tier, { count, cols }, tiles.setFocusedIndex);

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 md:flex-col md:items-start md:justify-start md:pt-1">
        <h2 id={headingId}>
          <DifficultyPill tier={tier} showSubtitle />
        </h2>
        {count > 0 ? <StarBadge {...getStarCounter(summary)} size="sm" /> : null}
      </div>
      {count > 0 ? (
        <div
          ref={gridRef}
          className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3 tv:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]"
        >
          {levels.map((level, index) => (
            <StarLevelTile
              key={level.definition.id}
              ref={tiles.getItemRef(index)}
              isFocused={tiles.isItemFocused(index)}
              level={level}
              onPlay={onPlay}
              onLocked={onLocked}
              onFocus={() => {
                onFocusTier(tier);
              }}
            />
          ))}
        </div>
      ) : (
        <p className="flex min-h-16 items-center rounded-2xl border-2 border-dashed border-slate-700 px-4 text-fluid-sm text-slate-400">
          Bientôt de nouvelles étoiles
        </p>
      )}
    </section>
  );
}
