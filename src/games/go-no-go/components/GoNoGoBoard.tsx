'use client';

import type { LevelControls } from '@/components/progression';
import { AppShell } from '@/components/ui';
import { useGameAudio } from '@/core/audio';
import { isSynthesizedActivation, useGridNavigation, useNavigationScope } from '@/core/navigation';
import type { EnrichedLevelItem } from '@/core/progression';
import type { MascotMood } from '@/games/bear-sort/components/OwlMascot';
import { useMascotVoice } from '@/games/bear-sort/components/useMascotSpeech';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { isPerfectWin } from '../engine';
import { ANNOUNCEMENTS, getRuleSentence, MASCOT_LABEL } from '../labels';
import { createRun, type Run, type RunPhase } from '../run';
import type { GoNoGoLevelConfig, VoiceMood } from '../types';
import { Buzzer, type BuzzerProps } from './Buzzer';
import { Garland } from './Garland';
import { GoNoGoEndScreen } from './GoNoGoEndScreen';
import { Stage } from './Stage';

/**
 * Texte de la région `role="status"` à l'entrée de chaque phase (§8.3) : la consigne au départ, la
 * démo, les essais, la pause ; au départ de la partie, et à chaque reprise, la consigne encore.
 */
function getStatusText(phase: RunPhase, config: GoNoGoLevelConfig): string {
  switch (phase) {
    case 'starting':
      return getRuleSentence(config);
    case 'demo':
      return ANNOUNCEMENTS.demo;
    case 'trial':
      return ANNOUNCEMENTS.trials;
    case 'paused':
      return ANNOUNCEMENTS.paused;
    case 'live':
      return `${ANNOUNCEMENTS.starting} ${getRuleSentence(config)}`;
    case 'won':
      return '';
  }
}

/**
 * L'instant d'un évènement dans l'horloge de la partie (`performance.now`), ou `undefined` s'il n'en a
 * pas qui s'y rapporte (jsdom date en millisecondes depuis 1970) : l'appui est alors daté à son
 * traitement. L'horodatage de l'évènement, jamais l'image suivante (§10), au doigt comme à la
 * télécommande ou au lecteur d'écran.
 */
function getEventTime(event: { timeStamp: number }): number | undefined {
  const time = event.timeStamp;
  return Number.isFinite(time) && time > 0 && time <= performance.now() ? time : undefined;
}

/** Le buzzer abonné à son seul état enfoncé : un appui ne redessine pas tout le plateau. */
function RunBuzzer({ run, ...props }: Omit<BuzzerProps, 'isPressed'> & { run: Run }) {
  const isPressed = useSyncExternalStore(
    run.subscribeBuzzer,
    run.isBuzzerPressed,
    run.isBuzzerPressed,
  );
  return <Buzzer {...props} isPressed={isPressed} />;
}

export interface GoNoGoBoardProps {
  /** Niveau lancé (`renderLevel` de `GameScreen`) : configuration, numéro d'étoile */
  level: EnrichedLevelItem<GoNoGoLevelConfig>;
  /** Commandes du niveau : victoire, étoile suivante, retour à la Carte des Étoiles */
  controls: LevelControls<GoNoGoLevelConfig>;
}

/**
 * Plateau de Pas si vite ! (FEAT-28), au doigt comme à la télécommande, sans aucun texte du début de
 * l'étoile à sa fin : la guirlande de perles en haut, la scène au milieu (le castelet de la chouette
 * ou les collines), un énorme buzzer en bas. Un seul geste : un nouveau contact n'importe où dans l'aire
 * de jeu, ou `OK`. Le temps réel (fenêtres, STOP, pauses, démo, essais) est géré par `createRun` ; le
 * plateau n'en affiche que l'instantané et lui transmet les gestes. Remonté par `GameScreen` à chaque
 * changement de niveau.
 */
export function GoNoGoBoard({ level, controls }: GoNoGoBoardProps) {
  // En premier (voir `useGameAudio`) : le réglage « Son » est appliqué avant la première voix.
  const audio = useGameAudio();
  const voice = useMascotVoice<VoiceMood>(audio);
  const { config } = level.definition;
  const [run] = useState(() =>
    createRun({
      config,
      hasWon: level.isCompleted,
      playEffect: (effect) => {
        audio.playEffect(effect);
      },
      speak: (clips, mood = 'talking') => voice.speak(clips, mood),
      stopVoice: voice.stop,
      preload: (paths) => audio.preloadClips(paths),
      isHidden: () => document.hidden,
      // Remplacé à chaque rendu juste après : `controls.recordVictory` change à chaque rendu.
      onWin: () => undefined,
    }),
  );
  const { recordVictory } = controls;
  useEffect(() => {
    run.setOnWin((result) => {
      void recordVictory(result);
    });
  }, [run, recordVictory]);
  const snapshot = useSyncExternalStore(run.subscribe, run.getSnapshot, run.getSnapshot);
  const [isBackZone, setIsBackZone] = useState(false);
  const buzzerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    run.start();
    return () => {
      run.dispose();
    };
  }, [run]);

  // Page masquée (appel, autre application, écran éteint) : pause immédiate, rien n'est compté. Une
  // page déjà masquée au montage (onglet rouvert en arrière-plan) n'enverra aucun évènement : la pause
  // est demandée tout de suite, et part dès le début de la démo ou à la fin du rappel.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) run.pause();
    };
    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [run]);

  const back = useGridNavigation({
    scopeId: 'go-no-go-back',
    rows: 1,
    cols: 1,
    isActive: isBackZone,
    onBack: controls.exitToMap,
    onEdge: () => {
      setIsBackZone(false);
    },
  });

  const pressFromRemote = (event: KeyboardEvent) => {
    run.press(getEventTime(event));
  };

  const { isFocusVisible, inputMode } = useNavigationScope({
    scopeId: 'go-no-go-board',
    isActive: !isBackZone,
    // Les flèches ne font rien pendant le défilement (§8.2) ; la déclarer retient le défilement de la page.
    onDirection: () => undefined,
    onSelect: pressFromRemote,
    onBack: controls.exitToMap,
    getFocusedElement: () => buzzerRef.current,
    ownsElement: (element) => buzzerRef.current?.contains(element) ?? false,
  });
  const isRemote = inputMode === 'dpad';

  // Curseur → focus DOM (annonces TalkBack, premier OK sans réveil), au D-Pad uniquement.
  useEffect(() => {
    if (isFocusVisible) buzzerRef.current?.focus({ preventScroll: true });
  }, [isFocusVisible]);

  const onPlayAreaPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Un clic droit n'est pas un appui ; tout nouveau contact l'est, y compris celui d'une main posée.
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const isMascot = event.target instanceof Element && event.target.closest('[data-mascot]');
    // La mascotte touchée pendant une pause répète la règle sans relancer le jeu ; pendant le
    // défilement, la toucher serait un appui comme un autre.
    if (isMascot && run.getSnapshot().phase === 'paused') {
      run.replayRule();
      return;
    }
    run.press(getEventTime(event));
  };

  // Un clic sans contact (`detail` à 0) est celui d'un lecteur d'écran (TalkBack) : un appui. Le clic
  // que la garde d'activation donne au buzzer après un doigt resté posé (FEAT-04) suit un contact déjà
  // compté au `pointerdown` : la garde le signale, il ne compte pas.
  const onAssistiveClick = (event: ReactMouseEvent) => {
    if (event.detail !== 0 || isSynthesizedActivation()) return;
    run.press(getEventTime(event));
  };

  const nextLevel = controls.summary.allLevels[level.globalIndex + 1] ?? null;
  const mood: MascotMood = voice.speakingMood ?? snapshot.mascot.pose;
  const statusText = snapshot.statusKey > 0 ? getStatusText(snapshot.phase, config) : '';

  return (
    <AppShell
      title={`Étoile #${String(level.starNumber)}`}
      isTextless
      onBack={controls.exitToMap}
      isBackFocused={back.isItemFocused(0)}
      backButtonRef={back.getItemRef(0)}
      onBackFocus={() => {
        setIsBackZone(true);
      }}
    >
      {/* L'aire de jeu : tout contact posé ici est un appui, le buzzer comme la scène (une enfant de
          3 ans touche l'oiseau lui-même). Seul le bouton Retour de l'en-tête en est exclu. */}
      <div
        data-play-area="true"
        data-phase={snapshot.phase}
        className="relative flex min-h-0 flex-1 flex-col gap-[clamp(0.25rem,1.5vmin,0.75rem)] overflow-hidden"
        onPointerDown={onPlayAreaPointerDown}
      >
        <Garland total={config.appearances} cleared={snapshot.game.cleared} />
        <div className="min-h-0 flex-[55] landscape:flex-[58]">
          <Stage
            config={config}
            scene={snapshot.scene}
            mascot={{ isVisible: snapshot.mascot.isVisible, mood }}
          />
        </div>
        <RunBuzzer
          run={run}
          ref={buzzerRef}
          className="min-h-0 flex-[35] landscape:flex-[42]"
          isDisabled={!snapshot.isBuzzerEnabled}
          isPulsing={snapshot.isBuzzerPulsing}
          isRemote={isRemote}
          hand={snapshot.hand}
          onAssistiveClick={onAssistiveClick}
          onFocus={() => {
            setIsBackZone(false);
          }}
        />
      </div>

      {/* Pendant une pause seulement : la mascotte se touche pour réentendre la règle (§8.1). */}
      {snapshot.phase === 'paused' ? (
        <button type="button" className="sr-only" onClick={run.replayRule}>
          {MASCOT_LABEL}
        </button>
      ) : null}

      {/* Région toujours présente, vide au montage (son contenu initial ne serait pas lu) : une
          annonce par entrée dans une phase, la consigne au départ et à chaque reprise. Aucune annonce
          par apparition : elle arriverait après la fenêtre. */}
      <p role="status" className="sr-only">
        {statusText ? <span key={snapshot.statusKey}>{statusText}</span> : null}
      </p>

      <GoNoGoEndScreen
        isOpen={snapshot.isEndOpen}
        starNumber={level.starNumber}
        hasCrown={isPerfectWin(snapshot.game) || level.isPerfect}
        hasNextStar={nextLevel !== null}
        onNext={() => {
          if (nextLevel) controls.playLevel(nextLevel.definition.id);
        }}
        onReplay={run.restart}
        onExitToMap={controls.exitToMap}
      />
    </AppShell>
  );
}
