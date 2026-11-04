'use client';

import type { LevelControls } from '@/components/progression';
// Module direct, pas le barrel : le JS de la page d'un jeu se limite à ce qu'elle affiche (FEAT-08).
import { useLevelPlayer } from '@/components/progression/GameScreen';
import { AppShell, DEFAULT_REMOTE_HINTS, FocusableButton } from '@/components/ui';
import { useGridColumns, useGridNavigation, useNavigation } from '@/core/navigation';
import type { EnrichedLevelItem } from '@/core/progression';
import { DEFAULT_MEMORY_GAME_SETTINGS } from '@/core/storage';
import { cn } from '@/lib/cn';
import { MotionConfig, motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import {
  createMemoryGame,
  endPreviewPhase,
  isEvaluationMatch,
  isPerfectWin,
  resolveEvaluation,
  selectCard,
} from '../engine';
import { applyMemorySettings, getMismatchDelayMs } from '../settings';
import type { MemoryGameState, MemoryLevelConfig } from '../types';
import { MemoryCardView } from './MemoryCardView';
import { MemoryEndModal, type MemoryGameResult } from './MemoryEndModal';
import { MemoryHud } from './MemoryHud';

/** Groupe trouvé : affiché brièvement avant de passer à `matched` (`isEvaluationMatch`). */
export const MATCH_DELAY_MS = 350;

/**
 * Erreur : cartes laissées visibles avant de se cacher. Socle multiplié par le `mismatchFactor` du
 * profil (FEAT-19, `getMismatchDelayMs`) ; le délai d'un groupe trouvé n'en dépend pas.
 */
export const MISMATCH_DELAY_MS = 900;

/** Indicateur d'une permutation (`lastSwappedPair`) sur les deux cartes échangées. */
export const SWAP_HIGHLIGHT_MS = 1000;

/** Zones D-Pad du plateau : l'en-tête (Retour, Recommencer), puis la grille des cartes. */
type BoardZone = 'header' | 'grid';

interface Announcement {
  /** Change à chaque message, même identique : il est de nouveau vocalisé. */
  id: number;
  text: string;
}

/** Page cachée (autre onglet, appel, téléphone verrouillé), lue par `useSyncExternalStore`. */
function subscribeToVisibility(listener: () => void): () => void {
  document.addEventListener('visibilitychange', listener);
  return () => {
    document.removeEventListener('visibilitychange', listener);
  };
}

const readIsPageHidden = () => document.hidden;

const readIsPageHiddenOnServer = () => false;

/**
 * Secondes de jeu à la résolution du dernier groupe, `MATCH_DELAY_MS` après la carte qui le complète :
 * même mesure que les meilleurs temps déjà enregistrés. Hors du composant : `react-hooks/purity` prend
 * un gestionnaire de clic capturé par le JSX enfant pour du code de rendu, et y refuse `performance.now()`.
 */
function getWinSeconds(startedAt: number | null): number {
  if (startedAt === null) return 0;
  return Math.round((performance.now() + MATCH_DELAY_MS - startedAt) / 1000);
}

/** Forme de la grille configurée : une grille large tourne en portrait, une haute en paysage. */
function getGridShape({ cols, rows }: MemoryLevelConfig): 'wide' | 'tall' | 'square' {
  if (cols === rows) return 'square';
  return cols > rows ? 'wide' : 'tall';
}

export interface MemoryBoardProps {
  /** Niveau lancé (`renderLevel` de `GameScreen`) : configuration, numéro d'étoile, palier */
  level: EnrichedLevelItem<MemoryLevelConfig>;
  /** Commandes du niveau : victoire, étoile suivante, retour à la Carte des Étoiles */
  controls: LevelControls<MemoryLevelConfig>;
}

/**
 * Plateau de Memory, au doigt comme à la télécommande, sans défilement de 2 × 2 à 6 × 6 : cartes
 * carrées dimensionnées par la feuille de style (`memory-grid`), grille tournée quand la zone du
 * plateau est en portrait. Orchestre le moteur (FEAT-09) : aperçu, évaluation, permutations, fin
 * de partie et enregistrement de la victoire. Remonté par `GameScreen` à chaque changement de niveau.
 * Joue le niveau aux réglages de Memory du profil actif (FEAT-19) : aperçu multiplié par
 * `previewFactor` (une étoile sans aperçu n'en gagne pas), erreur laissée visible
 * `MISMATCH_DELAY_MS` × `mismatchFactor` ; étoiles et couronnes n'en dépendent pas.
 */
export function MemoryBoard({ level, controls }: MemoryBoardProps) {
  const { config: levelConfig, tier } = level.definition;
  const { inputMode } = useNavigation();
  // Réglages du joueur qui a lancé le niveau (FEAT-19), même si un autre onglet change de joueur. Suivis
  // par leurs valeurs : le profil est un nouvel objet après chaque sauvegarde (`recordVictory`), et la
  // configuration jouée ne doit changer qu'avec le niveau ou un facteur, jamais pour une identité (la
  // partie et ses minuteurs y survivent).
  const player = useLevelPlayer();
  const settings = player?.gameSettings.memory ?? DEFAULT_MEMORY_GAME_SETTINGS;
  const { previewFactor, mismatchFactor } = settings;
  const config = useMemo(
    () => applyMemorySettings(levelConfig, { previewFactor, mismatchFactor }),
    [levelConfig, previewFactor, mismatchFactor],
  );
  const mismatchDelayMs = getMismatchDelayMs(MISMATCH_DELAY_MS, settings);
  const [game, setGame] = useState(() => createMemoryGame(config));
  // Numéro de la partie : une nouvelle partie remonte la grille (aucune carte ne glisse de l'une à
  // l'autre) et le compte à rebours.
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<MemoryGameResult | null>(null);
  const [expiredSwap, setExpiredSwap] = useState<MemoryGameState['lastSwappedPair']>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [activeZone, setActiveZone] = useState<BoardZone>('grid');
  // Début de la partie (première phase `playing`) : `performance.now()` est monotone, contrairement
  // à `Date.now()` qui recule si l'horloge du téléviseur est réglée pendant la partie.
  const startedAtRef = useRef<number | null>(null);
  const [gridRef, shownCols] = useGridColumns<HTMLDivElement>(config.cols);
  const isPageHidden = useSyncExternalStore(
    subscribeToVisibility,
    readIsPageHidden,
    readIsPageHiddenOnServer,
  );

  // La feuille de style décide de la rotation ; le D-Pad suit les colonnes affichées.
  const isRotated = config.cols !== config.rows && shownCols === config.rows;
  const cols = isRotated ? config.rows : config.cols;
  const rows = isRotated ? config.cols : config.rows;
  const swapPair = game.lastSwappedPair === expiredSwap ? null : game.lastSwappedPair;
  const isOver = game.phase === 'won' || game.phase === 'lost';
  const nextLevel = controls.summary.allLevels[level.globalIndex + 1] ?? null;

  /** Index affiché (ligne par ligne à l'écran) de la carte `index` du moteur. */
  const toShownIndex = (index: number): number => {
    if (!isRotated) return index;
    // Rotation : la ligne du moteur devient la colonne affichée, et inversement.
    const engineRow = Math.floor(index / config.cols);
    const engineCol = index % config.cols;
    return engineCol * config.rows + engineRow;
  };

  const announce = (text: string) => {
    setAnnouncement((previous) => ({ id: (previous?.id ?? 0) + 1, text }));
  };

  const header = useGridNavigation({
    scopeId: 'memory-header',
    rows: 1,
    cols: 2,
    isActive: activeZone === 'header',
    onBack: controls.exitToMap,
    onEdge: (direction) => {
      if (direction === 'down') setActiveZone('grid');
    },
  });

  // Active pendant l'aperçu et l'évaluation (FEAT-04 §5) : Retour reste disponible, OK pendant
  // l'aperçu le termine, et le moteur ignore les autres actions hors `playing`.
  const grid = useGridNavigation({
    scopeId: 'memory-grid',
    rows,
    cols,
    isActive: activeZone === 'grid',
    onBack: controls.exitToMap,
    onEdge: (direction, coord) => {
      if (direction !== 'up') return;
      // Retour au-dessus de la moitié gauche du plateau, Recommencer au-dessus de la moitié droite.
      header.setFocusedIndex(coord.col < cols / 2 ? 0 : 1);
      setActiveZone('header');
    },
  });

  /** Partie terminée : résultat figé pour la modale, couronne lue avant que la victoire ne la change. */
  const freezeResult = (ended: MemoryGameState) => {
    setResult({
      outcome: ended.phase === 'won' ? 'won' : 'lost',
      moves: ended.moves,
      mistakes: ended.mistakes,
      matchedGroups: ended.matchedGroups,
      totalGroups: ended.totalGroups,
      isPerfect: isPerfectWin(ended),
      hadCrown: level.isPerfect,
    });
  };

  /**
   * Dernière carte du dernier groupe : l'étoile est gagnée dès ce geste, le joueur peut quitter avant
   * la modale sans la perdre. Enregistrée ici, une seule fois, jamais par un effet rejoué.
   */
  const recordWin = (won: MemoryGameState) => {
    freezeResult(won);
    void controls.recordVictory({
      moves: won.moves,
      timeSeconds: getWinSeconds(startedAtRef.current),
      isPerfect: isPerfectWin(won),
    });
  };

  // Calculé hors de `setGame` : la résolution tire au hasard (permutations) et ne doit être
  // jouée qu'une fois.
  const settle = useEffectEvent((evaluated: MemoryGameState) => {
    const next = resolveEvaluation(evaluated);
    setGame(next);
    const isLastTry =
      next.phase === 'playing' &&
      next.mistakes > evaluated.mistakes &&
      next.mistakes === next.config.maxMistakes;
    // Une permutation peut tomber sur la même erreur que le dernier essai : les deux sont dits.
    const messages: string[] = [];
    if (next.lastSwappedPair) messages.push('Attention : deux cartes ont échangé leur place !');
    if (isLastTry) messages.push('Dernier essai !');
    if (messages.length > 0) announce(messages.join(' '));
    if (next.phase === 'lost') freezeResult(next);
  });

  // Aperçu : les cartes se cachent au bout du `previewSeconds` joué (déjà multiplié par
  // `previewFactor`), ou plus tôt, par un tap ou OK. Lu dans `game.config`, comme le compte à
  // rebours du HUD : une partie joue jusqu'au bout la configuration de sa création, même si le
  // profil actif (donc le facteur) change pendant l'aperçu (autre onglet) ; le nouveau facteur vaut
  // pour la partie suivante (Recommencer, étoile suivante). Page cachée (appel, téléphone verrouillé) :
  // personne ne regarde, l'aperçu repart en entier au retour, avec son compte à rebours.
  useEffect(() => {
    if (game.phase !== 'preview' || isPageHidden) return;
    const timer = setTimeout(() => {
      setGame(endPreviewPhase);
    }, game.config.previewSeconds * 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [game, isPageHidden]);

  // Évaluation : 350 ms (groupe) ou 900 ms × `mismatchFactor` (erreur), puis résolution du coup.
  useEffect(() => {
    if (game.phase !== 'evaluating') return;
    const delay = isEvaluationMatch(game) ? MATCH_DELAY_MS : mismatchDelayMs;
    const timer = setTimeout(() => {
      settle(game);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [game, mismatchDelayMs]);

  useEffect(() => {
    if (game.phase === 'playing') startedAtRef.current ??= performance.now();
  }, [game]);

  // Indicateur de permutation : déclenché par chaque nouveau `lastSwappedPair` (nouvelle référence).
  useEffect(() => {
    const pair = game.lastSwappedPair;
    if (!pair) return;
    const timer = setTimeout(() => {
      setExpiredSwap(pair);
    }, SWAP_HIGHLIGHT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [game.lastSwappedPair]);

  /**
   * Tap, clic ou OK sur une carte : termine l'aperçu, sinon retourne la carte. Lit l'état du dernier
   * rendu : après la fin de l'aperçu ou d'une évaluation, une tape tombée avant ce rendu ne réécrit
   * rien de faux (fin d'aperçu identique, évaluation qui ignore les tapes).
   */
  const selectAt = (index: number) => {
    const next = game.phase === 'preview' ? endPreviewPhase(game) : selectCard(game, index);
    if (next === game) return;
    setGame(next);
    // Un groupe trouvé se résout sans hasard : `settle` retrouvera ce résultat à la fin du délai.
    const outcome = isEvaluationMatch(next) ? resolveEvaluation(next) : next;
    if (outcome.phase === 'won') recordWin(outcome);
  };

  /** « Recommencer », « Rejouer », « Réessayer » : nouveaux symboles, nouvelles positions. */
  const restart = () => {
    startedAtRef.current = null;
    setGame(createMemoryGame(config));
    setResult(null);
    setRound((value) => value + 1);
    setActiveZone('grid');
  };

  const focusHeader = () => {
    setActiveZone('header');
  };

  const focusGrid = () => {
    setActiveZone('grid');
  };

  const gridStyle = {
    '--memory-cols': config.cols,
    '--memory-rows': config.rows,
  } as CSSProperties;

  return (
    <AppShell
      title={`Étoile #${String(level.starNumber)}`}
      onBack={controls.exitToMap}
      isBackFocused={header.isItemFocused(0)}
      backButtonRef={header.getItemRef(0)}
      onBackFocus={focusHeader}
      profile={
        <FocusableButton
          ref={header.getItemRef(1)}
          isFocused={header.isItemFocused(1)}
          variant="secondary"
          size="sm"
          leftIcon={<RotateCcw className="size-5" />}
          onClick={restart}
          onFocus={focusHeader}
        >
          <span className="sr-only sm:not-sr-only">Recommencer</span>
        </FocusableButton>
      }
      footerHints={DEFAULT_REMOTE_HINTS}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 landscape:flex-row landscape:gap-4">
        <MemoryHud
          game={game}
          tier={tier}
          // Couronne d'avant cette partie : la victoire, enregistrée à la dernière carte, ne change pas
          // le HUD sous les yeux du joueur.
          hasCrown={result?.hadCrown ?? level.isPerfect}
          isSwapping={swapPair !== null}
          isPreviewPaused={isPageHidden}
          round={round}
          inputMode={inputMode}
          className="shrink-0 landscape:w-52 landscape:overflow-y-auto md:landscape:w-60"
        />
        {/* Conteneur de taille : les cartes se dimensionnent sur l'espace restant (memory-grid).
            Marge interne : l'anneau de focus zoomé n'est jamais rogné et ne fait pas défiler. */}
        <div className="@container-size relative min-h-0 min-w-0 flex-1 p-2">
          <MotionConfig reducedMotion="user">
            <div
              key={round}
              ref={gridRef}
              role="group"
              aria-label={`Plateau de ${String(game.cards.length)} cartes`}
              data-shape={getGridShape(config)}
              className="memory-grid"
              style={gridStyle}
            >
              {game.cards.map((card, index) => {
                const shown = toShownIndex(index);
                const isFocused = grid.isItemFocused(shown);
                return (
                  // La position suit `card.uid` : une permutation fait glisser les deux cartes.
                  <motion.div
                    key={card.uid}
                    layout="position"
                    layoutDependency={game.lastSwappedPair}
                    className={cn('relative has-[:focus-visible]:z-10', isFocused && 'z-10')}
                  >
                    <MemoryCardView
                      ref={grid.getItemRef(shown)}
                      card={card}
                      row={Math.floor(shown / cols)}
                      col={shown % cols}
                      isFocused={isFocused}
                      isSwapping={swapPair?.includes(index) ?? false}
                      onSelect={() => {
                        selectAt(index);
                      }}
                      onFocus={focusGrid}
                    />
                  </motion.div>
                );
              })}
            </div>
          </MotionConfig>
        </div>
      </div>

      {/* Région toujours présente : ses messages (permutation, dernier essai) sont vocalisés. */}
      <p role="status" className="sr-only">
        {announcement ? <span key={announcement.id}>{announcement.text}</span> : null}
      </p>

      <MemoryEndModal
        isOpen={isOver}
        result={result}
        starNumber={level.starNumber}
        config={config}
        nextStarNumber={nextLevel?.starNumber ?? null}
        onNext={() => {
          if (nextLevel) controls.playLevel(nextLevel.definition.id);
        }}
        onReplay={restart}
        onExitToMap={controls.exitToMap}
      />
    </AppShell>
  );
}
