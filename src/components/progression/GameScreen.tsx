'use client';

import { ProfileGate } from '@/components/profile';
import { AppShell, DEFAULT_REMOTE_HINTS, DifficultyPill } from '@/components/ui';
import { useGridNavigation } from '@/core/navigation';
import {
  GAME_REGISTRY,
  getGameProgressSummary,
  recordLevelVictory,
  type BaseLevelDefinition,
  type EnrichedLevelItem,
  type GameProgressSummary,
  type LevelVictoryParams,
} from '@/core/progression';
import { useMiaStorage } from '@/core/storage';
import type { GameId } from '@/types/mia';
import { Hourglass } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { LEVEL_SEARCH_PARAM, useGameNavigation } from './routes';
import { StarMapScreen } from './StarMapScreen';
import { WaitingScreen } from './WaitingScreen';

/** Partie gagnée, complétée par le jeu et le niveau affichés (`recordLevelVictory`). */
export type LevelResult = Omit<LevelVictoryParams, 'gameId' | 'levelId'>;

/** Commandes d'un niveau lancé, fournies au plateau du jeu (FEAT-10, FEAT-13). */
export interface LevelControls<TConfig = unknown> {
  /** Progression du jeu, recalculée après chaque victoire (ex: `allLevels[globalIndex + 1]`) */
  summary: GameProgressSummary<TConfig>;
  /** Passe à un autre niveau (ex: « Étoile Suivante ») en remplaçant l'entrée d'historique */
  playLevel: (levelId: string) => void;
  /** Retour à la Carte des Étoiles (bouton « Carte des Étoiles », Retour) */
  exitToMap: () => void;
  /** Enregistre la victoire du niveau affiché dans le profil actif (étoile, couronne, scores) */
  recordVictory: (result: LevelResult) => Promise<void>;
}

export interface GameScreenProps<TConfig = unknown> {
  gameId: GameId;
  /** Catalogue typé du jeu (FEAT-11, FEAT-14) ou de test ; défaut : celui du registre */
  catalog?: readonly BaseLevelDefinition<TConfig>[];
  /**
   * Plateau du niveau lancé (`?level=<id>`), remonté à chaque changement de niveau. Absent :
   * écran d'attente « bientôt jouable » (le plateau arrive avec FEAT-10 / FEAT-13).
   */
  renderLevel?: (level: EnrichedLevelItem<TConfig>, controls: LevelControls<TConfig>) => ReactNode;
}

/**
 * Page d'un jeu : Carte des Étoiles, ou niveau lancé désigné par `?level=<definition.id>`
 * (identifiant stable : les numéros d'étoile changent quand des niveaux sont publiés). Un niveau
 * inconnu ou verrouillé affiche la carte. Le choix du joueur est imposé sans profil actif.
 */
export function GameScreen<TConfig = unknown>(props: GameScreenProps<TConfig>) {
  // `useSearchParams` : au pré-rendu statique, la page s'arrête à cette limite (écran d'attente).
  return (
    <Suspense fallback={<WaitingScreen title={GAME_REGISTRY[props.gameId].title} />}>
      <GameScreenContent {...props} />
    </Suspense>
  );
}

function GameScreenContent<TConfig>({ gameId, catalog, renderLevel }: GameScreenProps<TConfig>) {
  const game = GAME_REGISTRY[gameId];
  const { state, isLoaded, activeProfile, updateState } = useMiaStorage();
  const levelId = useSearchParams().get(LEVEL_SEARCH_PARAM);
  const navigation = useGameNavigation();
  // Le registre type ses catalogues en `unknown` : sans catalogue fourni, `TConfig` vaut `unknown`.
  const levels = catalog ?? (game.catalog as readonly BaseLevelDefinition<TConfig>[]);
  const summary = useMemo(
    () => getGameProgressSummary(gameId, levels, activeProfile),
    [gameId, levels, activeProfile],
  );
  const requested =
    levelId === null
      ? null
      : (summary.allLevels.find((level) => level.definition.id === levelId) ?? null);
  const level = requested?.isUnlocked ? requested : null;
  const isUnplayableRequest = levelId !== null && level === null;
  const hasActiveProfile = activeProfile !== null;

  // Niveau inconnu ou verrouillé (adresse périmée ou modifiée) : la carte s'affiche et l'adresse
  // est nettoyée, sinon le niveau s'ouvrirait de lui-même une fois débloqué. Avec un profil actif
  // seulement : avant le choix du joueur, sa progression n'est pas encore connue.
  useEffect(() => {
    if (isLoaded && hasActiveProfile && isUnplayableRequest) navigation.clearLevel();
  }, [isLoaded, hasActiveProfile, isUnplayableRequest, navigation]);

  let screen: ReactNode;
  if (!isLoaded || state.profiles.length === 0) {
    // Sans profil, `ProfileGate` crée « Joueur 1 » : attendre plutôt que d'afficher une carte vide.
    screen = <WaitingScreen title={game.title} />;
  } else if (level && hasActiveProfile) {
    // Avec un profil actif seulement : un plateau jouerait, et parlerait, derrière ce choix.
    const controls: LevelControls<TConfig> = {
      summary,
      playLevel: navigation.replaceLevel,
      exitToMap: navigation.exitToMap,
      recordVictory: (result) =>
        updateState((prev) =>
          recordLevelVictory(prev, { ...result, gameId, levelId: level.definition.id }),
        ),
    };
    screen = (
      <Fragment key={level.definition.id}>
        {renderLevel ? (
          renderLevel(level, controls)
        ) : (
          <LevelPlaceholder gameTitle={game.title} level={level} onExit={navigation.exitToMap} />
        )}
      </Fragment>
    );
  } else {
    screen = (
      <StarMapScreen
        // Changement de joueur : le curseur repart de l'objectif du nouveau profil.
        key={activeProfile?.id ?? 'aucun-profil'}
        title={game.title}
        summary={summary}
        onPlayLevel={navigation.openLevel}
        onBack={navigation.backToHub}
      />
    );
  }

  return (
    <>
      {screen}
      <ProfileGate />
    </>
  );
}

interface LevelPlaceholderProps {
  gameTitle: string;
  level: EnrichedLevelItem;
  onExit: () => void;
}

/** Niveau lancé avant l'arrivée du plateau du jeu (FEAT-10, FEAT-13) : Retour ramène à la carte. */
function LevelPlaceholder({ gameTitle, level, onExit }: LevelPlaceholderProps) {
  const back = useGridNavigation({
    scopeId: 'level-placeholder',
    rows: 1,
    cols: 1,
    onBack: onExit,
  });

  return (
    <AppShell
      title={`Étoile #${String(level.starNumber)}`}
      onBack={onExit}
      isBackFocused={back.isItemFocused(0)}
      backButtonRef={back.getItemRef(0)}
      footerHints={DEFAULT_REMOTE_HINTS}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <DifficultyPill tier={level.definition.tier} showSubtitle />
        <Hourglass aria-hidden="true" className="size-12 text-sky-300" />
        <p className="text-fluid-xl font-semibold">Le plateau de {gameTitle} arrive bientôt.</p>
        <p className="max-w-prose text-fluid-base text-slate-300">
          Cette étoile sera jouable dans une prochaine version de Mia.
        </p>
      </div>
    </AppShell>
  );
}
