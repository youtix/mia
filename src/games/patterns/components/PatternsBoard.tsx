'use client';

import type { LevelControls } from '@/components/progression';
import { AppShell } from '@/components/ui';
import { useSoundPlayer } from '@/core/audio';
import type { SoundBeat } from '@/core/audio/types';
import { useGridNavigation } from '@/core/navigation';
import type { EnrichedLevelItem } from '@/core/progression';
import { MotionConfig } from 'framer-motion';
import { useEffect, useEffectEvent, useReducer, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  advanceRound,
  beginRound,
  CHOICE_COUNT,
  createPatternsGame,
  endListening,
  endStop,
  getHelpLevel,
  getUnitLength,
  isPerfectWin,
  tapChoice,
} from '../engine';
import type { PatternGameState, PatternLevelConfig, PatternRound } from '../types';
import {
  ANNOUNCEMENTS,
  CHOICES_LABEL,
  formatArmedAnnouncement,
  formatBoardTitle,
  formatRoundAnnouncement,
} from './labels';
import { PatternChoiceButton, type PatternChoiceState } from './PatternChoiceButton';
import { PatternGuideHand } from './PatternGuideHand';
import { PatternProgressDots } from './PatternProgressDots';
import { PatternRow } from './PatternRow';
import { PatternsEndModal, type PatternsGameResult } from './PatternsEndModal';
import { PatternStopOverlay } from './PatternStopOverlay';

/** La ligne apparaît, propositions inertes : une tape n'y est pas comptée. */
export const INTRO_MS = 450;

/** Intervalle entre deux temps d'une suite sonore. */
export const BEAT_MS = 550;

/** Fin de résonance d'une suite écoutée, avant de pouvoir la valider. */
export const LISTEN_TAIL_MS = 250;

/** Célébration avant le défi suivant (après la révélation pour un défi sonore). */
export const SUCCESS_MS = 1300;

/** Position du curseur D-Pad à chaque nouveau défi : la proposition du milieu. */
const MIDDLE_CHOICE = Math.floor(CHOICE_COUNT / 2);

/** Zones D-Pad du plateau : l'en-tête (Retour), puis les propositions. */
type BoardZone = 'header' | 'choices';

interface Announcement {
  /** Change à chaque message, même identique : il est de nouveau vocalisé. */
  id: number;
  text: string;
}

function nextAnnouncement(previous: Announcement | null, text: string): Announcement {
  return { id: (previous?.id ?? 0) + 1, text };
}

/** Temps de la proposition `index`, aucun pour une pièce. */
function getChoiceBeats(round: PatternRound, index: number | null): readonly SoundBeat[] {
  const choice = index === null ? undefined : round.choices[index];
  return choice?.kind === 'sound' ? choice.beats : [];
}

/** Suite que la phase fait entendre : la proposition écoutée, ou la bonne réponse révélée. */
function getPlayedBeats({ phase, round, armedIndex }: PatternGameState): readonly SoundBeat[] {
  if (phase === 'listening') return getChoiceBeats(round, armedIndex);
  return phase === 'success' ? getChoiceBeats(round, round.correctIndex) : [];
}

function getChoiceState(
  { phase, armedIndex }: PatternGameState,
  index: number,
): PatternChoiceState {
  if (armedIndex !== index) return 'idle';
  return phase === 'listening' ? 'playing' : 'armed';
}

/**
 * Tap à l'instant présent. Hors du composant : `react-hooks/purity` prend un gestionnaire de clic
 * capturé par le JSX enfant pour du code de rendu, et y refuse `performance.now()`.
 */
function tapChoiceNow(game: PatternGameState, index: number): PatternGameState {
  return tapChoice(game, index, performance.now());
}

export interface PatternsBoardProps {
  /** Niveau lancé (`renderLevel` de `GameScreen`) : configuration, numéro d'étoile */
  level: EnrichedLevelItem<PatternLevelConfig>;
  /** Commandes du niveau : victoire, étoile suivante, retour à la Carte des Étoiles */
  controls: LevelControls<PatternLevelConfig>;
}

/**
 * Plateau de Suites Logiques (FEAT-21), au doigt comme à la télécommande, sans aucun texte visible :
 * une ligne de lecture et trois grandes propositions, de 360 × 640 à 960 × 540. Orchestre le moteur :
 * chaque phase a son minuteur, les règles restent dans `engine.ts`. Le déroulé ne dépend jamais de
 * l'audio : temps et états sont cadencés ici, que le son soit coupé ou non. Remonté par `GameScreen`
 * à chaque changement de niveau.
 */
export function PatternsBoard({ level, controls }: PatternsBoardProps) {
  const { config } = level.definition;
  const { stopSeconds } = config;
  const isSoundRound = config.answerMode === 'sound';
  const player = useSoundPlayer();
  const [game, setGame] = useState(() => createPatternsGame(config));
  // Numéro de la partie : une nouvelle partie remonte la ligne et les propositions.
  const [gameKey, setGameKey] = useState(0);
  const [result, setResult] = useState<PatternsGameResult | null>(null);
  // `useReducer` : `announce` est stable, les minuteurs ci-dessous n'en dépendent pas.
  const [announcement, announce] = useReducer(nextAnnouncement, null);
  const [activeZone, setActiveZone] = useState<BoardZone>('choices');
  // Temps en cours de la suite jouée : remis à zéro par le clic qui la lance.
  const [beatIndex, setBeatIndex] = useState(0);
  // Début de la partie (première phase `choosing`) : `performance.now()` est monotone, contrairement
  // à `Date.now()` qui recule si l'horloge du téléviseur est réglée pendant la partie.
  const startedAtRef = useRef<number | null>(null);

  const { phase, round, roundIndex } = game;
  const helpLevel = getHelpLevel(game);
  const isRoundOpen = phase !== 'success' && phase !== 'won';
  const playedBeats = getPlayedBeats(game);
  const isBeating = beatIndex < playedBeats.length;
  // Sons : la célébration attend la fin de la révélation ; pièces : aucun temps, elle suit le clic.
  const isCelebrating = phase === 'success' && !isBeating;
  const nextLevel = controls.summary.allLevels[level.globalIndex + 1] ?? null;

  const header = useGridNavigation({
    scopeId: 'patterns-header',
    rows: 1,
    cols: 1,
    isActive: activeZone === 'header',
    onBack: controls.exitToMap,
    onEdge: (direction) => {
      if (direction === 'down') setActiveZone('choices');
    },
  });

  // Active pendant le STOP et l'écoute : OK y est le même geste qu'une tape (FEAT-21 §3.7).
  const choices = useGridNavigation({
    scopeId: 'patterns-choices',
    rows: 1,
    cols: CHOICE_COUNT,
    initialIndex: MIDDLE_CHOICE,
    isActive: activeZone === 'choices',
    onBack: controls.exitToMap,
    onEdge: (direction) => {
      if (direction === 'up') setActiveZone('header');
    },
  });

  const celebrate = () => {
    player.playJingle('round');
    announce(ANNOUNCEMENTS.wellDone);
  };

  /** Fin de partie : résultat figé pour la modale, étoile enregistrée, jingle. */
  const finish = (won: PatternGameState) => {
    const isPerfect = isPerfectWin(won);
    setResult({ isPerfect, hadCrown: level.isPerfect });
    const startedAt = startedAtRef.current;
    const timeSeconds = startedAt === null ? 0 : Math.round((performance.now() - startedAt) / 1000);
    void controls.recordVictory({ moves: won.moves, timeSeconds, isPerfect });
    player.playJingle('star');
  };

  const openRound = useEffectEvent(() => {
    const next = beginRound(game, performance.now());
    setGame(next);
    const roundMessage = formatRoundAnnouncement(next.roundIndex, config.rounds, next.round.row);
    announce(next.phase === 'stop' ? `${roundMessage} ${ANNOUNCEMENTS.stop}` : roundMessage);
  });

  const startCelebration = useEffectEvent(() => {
    // Pièces : déjà fait par le clic, seul moment où le contexte audio se débloque à coup sûr.
    if (isSoundRound) celebrate();
  });

  // Calculé hors de `setGame` : la victoire est enregistrée ici, jamais par une mise à jour rejouée.
  const closeRound = useEffectEvent(() => {
    const next = advanceRound(game);
    setGame(next);
    if (next.phase === 'won') finish(next);
    else choices.setFocusedIndex(MIDDLE_CHOICE);
  });

  // Apparition du défi : propositions inertes, puis STOP ou déverrouillage.
  useEffect(() => {
    if (game.phase !== 'intro') return;
    const timer = setTimeout(() => {
      openRound();
    }, INTRO_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [game.phase, game.roundIndex]);

  // STOP : une tape crée un nouvel objet `game` (`impulsiveTaps`) sans abréger ni rallonger la pause.
  // Ce minuteur ne doit donc surtout pas dépendre de `game`, seulement d'un nouveau STOP.
  useEffect(() => {
    if (game.phase !== 'stop') return;
    const timer = setTimeout(() => {
      const nowMs = performance.now();
      // Rendu immédiat : une tape arrivant juste après lit déjà `choosing`. Sinon, elle réécrirait un
      // état `stop` périmé par-dessus `endStop`, et plus aucun minuteur ne terminerait ce STOP.
      flushSync(() => {
        setGame((current) => endStop(current, nowMs));
        announce(ANNOUNCEMENTS.stopOver);
      });
    }, stopSeconds * 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [game.phase, game.roundIndex, game.wrongTick, stopSeconds]);

  // Temps de la suite jouée (écoute ou révélation). `setInterval` plutôt qu'un minuteur par temps :
  // les images ne dérivent pas des sons, programmés d'avance sur la même grille.
  useEffect(() => {
    if (!isBeating) return;
    const ticker = setInterval(() => {
      setBeatIndex((beat) => beat + 1);
    }, BEAT_MS);
    return () => {
      clearInterval(ticker);
    };
  }, [isBeating]);

  // Écoute : la proposition reste prête une fois la suite et sa résonance terminées.
  useEffect(() => {
    if (game.phase !== 'listening' || game.armedIndex === null) return;
    const listenedIndex = game.armedIndex;
    const timer = setTimeout(
      () => {
        const nowMs = performance.now();
        setGame((current) => endListening(current, nowMs));
        announce(formatArmedAnnouncement(listenedIndex));
      },
      playedBeats.length * BEAT_MS + LISTEN_TAIL_MS,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [game.phase, game.armedIndex, playedBeats.length]);

  // Célébration : jingle des sons (après la révélation), puis défi suivant ou victoire.
  useEffect(() => {
    if (!isCelebrating) return;
    startCelebration();
    const timer = setTimeout(() => {
      closeRound();
    }, SUCCESS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isCelebrating]);

  useEffect(() => {
    if (game.phase === 'choosing') startedAtRef.current ??= performance.now();
  }, [game.phase]);

  /**
   * Tap, clic ou OK sur une proposition. Les sons partent d'ici, pas d'un effet : le contexte audio
   * ne se débloque que pendant un geste (FEAT-21 §4). OK à la télécommande passe aussi par ce clic.
   */
  const selectChoice = (index: number) => {
    const next = tapChoiceNow(game, index);
    if (next === game) return;
    setGame(next);

    if (next.phase === 'listening' || (next.phase === 'success' && isSoundRound)) {
      setBeatIndex(0);
      player.playBeats(getChoiceBeats(next.round, index), BEAT_MS);
    } else if (next.phase === 'success') {
      celebrate();
    } else if (next.impulsiveTaps > game.impulsiveTaps) {
      announce(ANNOUNCEMENTS.stopTap);
    } else {
      announce(
        next.phase === 'stop'
          ? `${ANNOUNCEMENTS.tryAgain} ${ANNOUNCEMENTS.stop}`
          : ANNOUNCEMENTS.tryAgain,
      );
    }
  };

  /** « Rejouer » : nouvelle partie, nouveaux défis. */
  const restart = () => {
    startedAtRef.current = null;
    player.stop();
    setGame(createPatternsGame(config));
    setGameKey((key) => key + 1);
    setActiveZone('choices');
    choices.setFocusedIndex(MIDDLE_CHOICE);
  };

  const focusHeader = () => {
    setActiveZone('header');
  };

  const focusChoices = () => {
    setActiveZone('choices');
  };

  return (
    <MotionConfig reducedMotion="user">
      <AppShell
        isTextless
        title={formatBoardTitle(level.starNumber)}
        onBack={controls.exitToMap}
        isBackFocused={header.isItemFocused(0)}
        backButtonRef={header.getItemRef(0)}
        onBackFocus={focusHeader}
        profile={
          <PatternProgressDots
            rounds={config.rounds}
            roundIndex={roundIndex}
            isRoundSolved={!isRoundOpen}
          />
        }
      >
        <div key={gameKey} className="flex min-h-0 flex-1 flex-col gap-2">
          {/* Conteneur de taille : les cases se dimensionnent sur l'espace restant (patterns-row).
              Marge et découpe : ni les pulsations ni les particules ne font jamais défiler. */}
          <div className="@container-size relative min-h-0 min-w-0 flex-1 overflow-clip p-1">
            <PatternRow
              row={round.row}
              roundIndex={roundIndex}
              unitLength={getUnitLength(config.rule)}
              showsUnits={helpLevel >= 1 && isRoundOpen}
              revealedBeats={phase === 'success' && isSoundRound ? playedBeats : null}
              revealBeat={beatIndex}
              showsBeatBadges={!player.isEnabled}
              answer={
                isCelebrating || phase === 'won'
                  ? (round.choices[round.correctIndex] ?? null)
                  : null
              }
            />
          </div>
          {/* Marge interne : l'anneau de focus zoomé n'est jamais rogné et ne fait pas défiler. */}
          <div className="relative shrink-0 p-2">
            <div
              role="group"
              aria-label={CHOICES_LABEL}
              className="grid h-[clamp(96px,26dvh,11rem)] grid-cols-3 grid-rows-1 gap-2 sm:gap-3 tv:h-[clamp(8rem,32dvh,14rem)] tv:gap-4"
            >
              {round.choices.map((choice, index) => (
                // Clé stable : les boutons survivent aux défis, le focus de la télécommande avec eux.
                <PatternChoiceButton
                  key={index}
                  ref={choices.getItemRef(index)}
                  choice={choice}
                  index={index}
                  roundIndex={roundIndex}
                  state={getChoiceState(game, index)}
                  beatIndex={beatIndex}
                  isSoundEnabled={player.isEnabled}
                  isFocused={choices.isItemFocused(index)}
                  isInert={phase !== 'choosing'}
                  isDimmed={phase === 'stop'}
                  isHinted={helpLevel === 2 && isRoundOpen && index === round.correctIndex}
                  bounceTick={index === game.lastWrongIndex ? game.wrongTick : 0}
                  onSelect={() => {
                    selectChoice(index);
                  }}
                  onFocus={focusChoices}
                >
                  {/* Jusqu'à la validation, sauf pendant un STOP : une main qui tape dirait le contraire. */}
                  {config.hasGuide &&
                  roundIndex === 0 &&
                  isRoundOpen &&
                  phase !== 'stop' &&
                  index === round.correctIndex ? (
                    <PatternGuideHand />
                  ) : null}
                </PatternChoiceButton>
              ))}
            </div>
            {phase === 'stop' ? (
              <PatternStopOverlay stopSeconds={stopSeconds} wobbleTick={game.impulsiveTaps} />
            ) : null}
          </div>
        </div>

        {/* Région toujours présente : ses messages (défi, STOP, erreur, réussite) sont vocalisés. */}
        <p role="status" className="sr-only">
          {announcement ? <span key={announcement.id}>{announcement.text}</span> : null}
        </p>

        <PatternsEndModal
          isOpen={phase === 'won'}
          result={result}
          starNumber={level.starNumber}
          hasNextStar={nextLevel !== null}
          onNext={() => {
            if (nextLevel) controls.playLevel(nextLevel.definition.id);
          }}
          onReplay={restart}
          onExitToMap={controls.exitToMap}
        />
      </AppShell>
    </MotionConfig>
  );
}
