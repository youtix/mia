'use client';

import { FocusableButton, StarBadge } from '@/components/ui';
import { useGridNavigation, type Direction, type GridCoord } from '@/core/navigation';
import type { GameManifest, GameProgressSummary } from '@/core/progression';
import { cn } from '@/lib/cn';
import type { GameId } from '@/types/mia';
import { Crown, MapIcon, Play, Sparkles, Trophy } from 'lucide-react';
import { useId } from 'react';
import { GAME_ICONS } from './game-icons';
import { describeCrowns, getHubGoalLabel, getStarCounter } from './labels';
import { getGoalLevel, getNextGoal } from './next-goal';
import { useZoneController, type ZoneRegistry } from './zone-chain';

export interface GameHubCardProps {
  game: GameManifest;
  /** Progression du profil actif dans ce jeu */
  summary: GameProgressSummary;
  /** Zone D-Pad des actions de la carte active (une seule zone active par écran) */
  isActive: boolean;
  /** Action ciblée au montage */
  initialIndex?: number;
  register: ZoneRegistry<GameId>['register'];
  /** Flèche bloquée au bord des actions : l'écran passe à la carte voisine ou au profil */
  onEdge: (gameId: GameId, direction: Direction, coord: GridCoord) => void;
  /** Une action reçoit le focus DOM (Tab, clic) : activer la zone de la carte */
  onFocusZone: (gameId: GameId) => void;
  onPlayLevel: (game: GameManifest, levelId: string) => void;
  onOpenMap: (game: GameManifest) => void;
}

/**
 * Carte d'un jeu sur le Hub : icône, titre, faculté travaillée, progression (étoiles et
 * couronnes) et deux actions, l'objectif (« Continuer (Étoile #X) ») et la Carte des Étoiles.
 * Ses actions forment une liste verticale navigable au D-Pad.
 */
export function GameHubCard({
  game,
  summary,
  isActive,
  initialIndex = 0,
  register,
  onEdge,
  onFocusZone,
  onPlayLevel,
  onOpenMap,
}: GameHubCardProps) {
  const titleId = useId();
  const goal = getNextGoal(summary);
  const goalLevel = getGoalLevel(goal);
  const goalLabel = getHubGoalLabel(goal);
  const actionCount = goalLevel ? 2 : 1;
  const mapIndex = actionCount - 1;
  const actions = useGridNavigation({
    scopeId: `hub-game-${game.id}`,
    rows: actionCount,
    cols: 1,
    initialIndex,
    isActive,
    onEdge: (direction, coord) => {
      onEdge(game.id, direction, coord);
    },
  });
  useZoneController(register, game.id, { count: actionCount, cols: 1 }, actions.setFocusedIndex);
  const { Icon, badgeClass } = GAME_ICONS[game.id];
  const progress =
    summary.totalStars > 0 ? Math.round((summary.earnedStars / summary.totalStars) * 100) : 0;
  const focusZone = () => {
    onFocusZone(game.id);
  };

  return (
    <article
      aria-labelledby={titleId}
      className="flex h-full flex-col gap-4 rounded-3xl border-2 border-slate-700 bg-slate-800/60 p-5 md:p-6"
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-14 shrink-0 items-center justify-center rounded-2xl text-slate-950',
            badgeClass,
          )}
        >
          <Icon className="size-8" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 id={titleId} className="text-fluid-xl font-bold">
            {game.title}
          </h2>
          <p className="text-fluid-sm text-slate-300">{game.skill}</p>
        </div>
      </div>

      {goal.kind === 'empty' ? (
        <p className="flex items-center gap-2 self-start rounded-full border border-slate-600 bg-slate-900/60 px-3 py-1 text-fluid-sm font-semibold text-slate-200">
          <Sparkles aria-hidden="true" className="size-4 text-sky-300" />
          Bientôt disponible
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Barre décorative : le compteur ci-dessous est vocalisé. */}
          <div aria-hidden="true" className="h-3 overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full bg-amber-400 motion-safe:transition-[width]"
              style={{ width: `${String(progress)}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StarBadge {...getStarCounter(summary)} size="sm" />
            <span
              role="img"
              aria-label={describeCrowns(summary.perfectCount)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-fluid-sm font-bold tabular-nums"
            >
              <Crown className="size-4 fill-amber-300 text-amber-300" />
              {summary.perfectCount}
            </span>
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3">
        {goalLevel && goalLabel ? (
          <FocusableButton
            ref={actions.getItemRef(0)}
            isFocused={actions.isItemFocused(0)}
            className="w-full"
            leftIcon={
              goal.kind === 'crown' ? <Crown className="size-5" /> : <Play className="size-5" />
            }
            onClick={() => {
              onPlayLevel(game, goalLevel.definition.id);
            }}
            onFocus={focusZone}
          >
            {goalLabel}
          </FocusableButton>
        ) : null}
        {goal.kind === 'complete' ? (
          <p className="flex items-center justify-center gap-2 text-center text-fluid-base font-semibold text-amber-100">
            <Trophy aria-hidden="true" className="size-5 shrink-0 text-amber-300" />
            Toutes les étoiles et couronnes !
          </p>
        ) : null}
        <FocusableButton
          ref={actions.getItemRef(mapIndex)}
          isFocused={actions.isItemFocused(mapIndex)}
          variant="secondary"
          className="w-full"
          leftIcon={<MapIcon className="size-5" />}
          onClick={() => {
            onOpenMap(game);
          }}
          onFocus={focusZone}
        >
          Carte des Étoiles
        </FocusableButton>
      </div>
    </article>
  );
}
