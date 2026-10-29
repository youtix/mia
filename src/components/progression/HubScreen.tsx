'use client';

import { AvatarBadge, ProfileGate } from '@/components/profile';
// Module direct, pas le barrel des réglages : le Hub n'embarque pas l'écran Réglages.
import { SETTINGS_PATH } from '@/components/settings/labels';
import { AppShell, DEFAULT_REMOTE_HINTS, FadeIn, FocusableButton } from '@/components/ui';
import {
  coordToIndex,
  indexToCoord,
  moveInGrid,
  useGridColumns,
  useGridNavigation,
  type Direction,
  type GridCoord,
} from '@/core/navigation';
import { GAMES, getProfileProgressSummary, type GameManifest } from '@/core/progression';
import { useMiaStorage } from '@/core/storage';
import type { GameId } from '@/types/mia';
import { Settings, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { GameHubCard } from './GameHubCard';
import { getStarCounter } from './labels';
import { getLevelHref } from './routes';
import { WaitingScreen } from './WaitingScreen';
import { useZoneRegistry, type ZoneEntry } from './zone-chain';

/** Aides de la télécommande du Hub : Retour n'y fait rien (l'application se ferme, FEAT-15). */
const HUB_REMOTE_HINTS = DEFAULT_REMOTE_HINTS.filter((hint) => hint.action !== 'Retour');

/** Dernier jeu ouvert depuis le Hub (onglet en cours) : le curseur y revient au retour. */
export const LAST_GAME_STORAGE_KEY = 'mia_hub_last_game';

function readLastGameId(): string | null {
  try {
    return sessionStorage.getItem(LAST_GAME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberLastGame(gameId: GameId): void {
  try {
    sessionStorage.setItem(LAST_GAME_STORAGE_KEY, gameId);
  } catch {
    // Stockage indisponible : le curseur repartira du premier jeu.
  }
}

/** Arrivée dans la carte voisine : par le haut (dernière action), par le bas (première), ou de côté (même action). */
function getCardEntry(direction: Direction, coord: GridCoord): ZoneEntry {
  if (direction === 'up') return { kind: 'last' };
  if (direction === 'down') return { kind: 'first' };
  return { kind: 'index', index: coord.row };
}

/** Zones D-Pad du Hub : les boutons du profil actif et des Réglages, puis les actions de chaque carte. */
type HubZone = 'profile' | GameId;

export interface HubScreenProps {
  /** Jeux affichés, dans l'ordre (tests : catalogues injectés) ; défaut : le registre (`GAMES`) */
  games?: readonly GameManifest[];
}

/**
 * Hub principal : profil actif (choix du joueur), compteur d'étoiles de tous les jeux et une carte
 * par jeu. Tant que la sauvegarde n'est pas chargée (ou que « Joueur 1 » n'est pas encore créé),
 * un écran d'attente remplace le Hub vide.
 */
export function HubScreen({ games = GAMES }: HubScreenProps) {
  const { state, isLoaded } = useMiaStorage();
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const isReady = isLoaded && state.profiles.length > 0;

  return (
    <>
      {isReady ? (
        <HubContent
          games={games}
          onOpenSelector={() => {
            setIsSelectorOpen(true);
          }}
        />
      ) : (
        <WaitingScreen title="Mia" />
      )}
      <ProfileGate
        isOpen={isSelectorOpen}
        onClose={() => {
          setIsSelectorOpen(false);
        }}
      />
    </>
  );
}

interface HubContentProps {
  games: readonly GameManifest[];
  onOpenSelector: () => void;
}

function HubContent({ games, onOpenSelector }: HubContentProps) {
  const router = useRouter();
  const { activeProfile } = useMiaStorage();
  const progress = useMemo(
    () => getProfileProgressSummary(activeProfile, games),
    [activeProfile, games],
  );
  const [gridRef, cardCols] = useGridColumns<HTMLDivElement>(1);
  const zones = useZoneRegistry<GameId>();
  const [initialGameId] = useState<GameId | null>(() => {
    const lastGameId = readLastGameId();
    return (games.find((game) => game.id === lastGameId) ?? games[0])?.id ?? null;
  });
  const [activeZone, setActiveZone] = useState<HubZone>(initialGameId ?? 'profile');
  // Carte rejointe par Bas depuis le profil : celle que le curseur a quittée.
  const [lastGameId, setLastGameId] = useState<GameId | null>(initialGameId);

  const focusGame = (gameId: GameId) => {
    setActiveZone(gameId);
    setLastGameId(gameId);
  };

  const activateGame = (gameId: GameId, entry: ZoneEntry) => {
    zones.enter(gameId, entry);
    focusGame(gameId);
  };

  // Profil puis Réglages, côte à côte ; Bas depuis l'un ou l'autre descend vers la dernière carte.
  const profileZone = useGridNavigation({
    scopeId: 'hub-profile',
    rows: 1,
    cols: 2,
    isActive: activeZone === 'profile',
    onEdge: (direction) => {
      if (direction === 'down' && lastGameId) activateGame(lastGameId, { kind: 'first' });
    },
  });

  const focusProfile = () => {
    setActiveZone('profile');
  };

  // Les cartes suivent la grille affichée (une colonne sur smartphone, deux sur tablette et TV).
  const handleCardEdge = (gameId: GameId, direction: Direction, coord: GridCoord) => {
    const index = games.findIndex((game) => game.id === gameId);
    const to = moveInGrid(indexToCoord(index, cardCols), direction, {
      rows: Math.ceil(games.length / cardCols),
      cols: cardCols,
      totalItems: games.length,
    });
    const target = games[coordToIndex(to, cardCols)];
    if (target && target.id !== gameId) activateGame(target.id, getCardEntry(direction, coord));
    else if (direction === 'up') focusProfile();
  };

  const openGame = (game: GameManifest, href: string) => {
    rememberLastGame(game.id);
    router.push(href);
  };

  // Routes préchargées : la Carte des Étoiles s'ouvre sans attente sur un boîtier TV modeste.
  useEffect(() => {
    for (const game of games) router.prefetch(game.path);
    router.prefetch(SETTINGS_PATH);
  }, [games, router]);

  return (
    <AppShell
      title="Mia"
      profile={
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <FocusableButton
            ref={profileZone.getItemRef(0)}
            isFocused={profileZone.isItemFocused(0)}
            variant="secondary"
            size="sm"
            aria-haspopup="dialog"
            className="max-w-[40vw] sm:max-w-xs"
            leftIcon={
              activeProfile ? (
                <AvatarBadge avatarId={activeProfile.avatarId} size="sm" />
              ) : (
                <UserRound className="size-6" />
              )
            }
            onClick={onOpenSelector}
            onFocus={focusProfile}
          >
            {/* Espace hors des balises : séparateur du nom accessible (« Joueur : Léo »). */}
            <span className="sr-only">Joueur :</span>{' '}
            <span className="min-w-0 truncate">{activeProfile?.name ?? 'Choisir un joueur'}</span>
          </FocusableButton>
          {/* Réglages & Sauvegarde (FEAT-18) : texte masqué sur petit écran, comme Retour. */}
          <FocusableButton
            ref={profileZone.getItemRef(1)}
            isFocused={profileZone.isItemFocused(1)}
            variant="secondary"
            size="sm"
            aria-label="Réglages"
            leftIcon={<Settings className="size-6" />}
            onClick={() => {
              router.push(SETTINGS_PATH);
            }}
            onFocus={focusProfile}
          >
            <span className="sr-only sm:not-sr-only">Réglages</span>
          </FocusableButton>
        </div>
      }
      stars={getStarCounter(progress)}
      footerHints={HUB_REMOTE_HINTS}
    >
      <FadeIn>
        <div ref={gridRef} className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          {progress.games.map((summary, index) => {
            const game = games[index];
            if (!game) return null;
            return (
              <GameHubCard
                key={game.id}
                game={game}
                summary={summary}
                isActive={activeZone === game.id}
                register={zones.register}
                onEdge={handleCardEdge}
                onFocusZone={focusGame}
                onPlayLevel={(target, levelId) => {
                  openGame(target, getLevelHref(target.path, levelId));
                }}
                onOpenMap={(target) => {
                  openGame(target, target.path);
                }}
              />
            );
          })}
        </div>
      </FadeIn>
    </AppShell>
  );
}
