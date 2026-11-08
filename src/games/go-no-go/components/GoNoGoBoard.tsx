'use client';

import type { LevelControls } from '@/components/progression';
import { AppShell } from '@/components/ui';
import { useGameAudio } from '@/core/audio';
import { useGridNavigation, useNavigationScope } from '@/core/navigation';
import type { EnrichedLevelItem } from '@/core/progression';
import type { MascotMood } from '@/games/bear-sort/components/OwlMascot';
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
import { createRun, type RunPhase } from '../run';
import type { GoNoGoLevelConfig } from '../types';
import { isClipAvailable } from '../voice-script';
import { Buzzer } from './Buzzer';
import { Garland } from './Garland';
import { GoNoGoEndScreen } from './GoNoGoEndScreen';
import { Stage } from './Stage';
import { useMascotVoice } from './useMascotVoice';

/**
 * Un clic de lecteur d'écran (TalkBack) n'est précédé d'aucun contact ; un clic au doigt ou à la souris
 * suit un contact déjà compté, comme celui que la garde d'activation clique elle-même (FEAT-04).
 */
const ASSISTIVE_CLICK_GUARD_MS = 1000;

/** Texte de la région `role="status"` : la consigne au départ, la pause, la démo, les essais (§8.3). */
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
      return ANNOUNCEMENTS.starting;
    case 'won':
      return '';
  }
}

/**
 * L'instant d'un évènement dans l'horloge de la partie (`performance.now`), ou `undefined` s'il n'en a
 * pas qui s'y rapporte (jsdom date en millisecondes depuis 1970) : l'appui est alors daté à son
 * traitement. L'horodatage de l'évènement, jamais l'image suivante (§10).
 */
function getEventTime(event: { timeStamp: number }): number | undefined {
  const time = event.timeStamp;
  return Number.isFinite(time) && time > 0 && time <= performance.now() ? time : undefined;
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
  const voice = useMascotVoice(audio);
  const { config } = level.definition;
  const [run] = useState(() =>
    createRun({
      config,
      hasWon: level.isCompleted,
      playEffect: (effect) => {
        audio.playEffect(effect);
      },
      speak: voice.speak,
      isClipAvailable,
      preload: (paths) => {
        void audio.preloadClips(paths);
      },
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
  const lastContactRef = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    run.start();
    return () => {
      run.dispose();
    };
  }, [run]);

  // Page masquée (appel, autre application, écran éteint) : pause immédiate, rien n'est compté.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) run.pause();
    };
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

  const pressFromRemote = () => {
    run.press();
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
    lastContactRef.current = performance.now();
    const isMascot = event.target instanceof Element && event.target.closest('[data-mascot]');
    // La mascotte touchée pendant une pause répète la règle sans relancer le jeu ; pendant le
    // défilement, la toucher serait un appui comme un autre.
    if (isMascot && run.getSnapshot().phase === 'paused') {
      run.replayRule();
      return;
    }
    run.press(getEventTime(event));
  };

  const onAssistiveClick = (event: ReactMouseEvent) => {
    if (
      event.detail !== 0 ||
      performance.now() - lastContactRef.current < ASSISTIVE_CLICK_GUARD_MS
    ) {
      return;
    }
    run.press();
  };

  const nextLevel = controls.summary.allLevels[level.globalIndex + 1] ?? null;
  const mood: MascotMood = voice.speakingMood ?? snapshot.mascot.pose;

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
        <Buzzer
          ref={buzzerRef}
          className="min-h-0 flex-[35] landscape:flex-[42]"
          isPressed={snapshot.isBuzzerPressed}
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

      {/* Région toujours présente : la consigne au départ, la pause, la démo, les essais. Aucune
          annonce par apparition : elle arriverait après la fenêtre. */}
      <p role="status" className="sr-only">
        {getStatusText(snapshot.phase, config)}
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
