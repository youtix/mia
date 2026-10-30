'use client';

import type { LevelControls } from '@/components/progression';
import { AppShell } from '@/components/ui';
import { FOCUSED_CLASSES, FOCUS_VISIBLE_CLASSES } from '@/components/ui/focus-styles';
import { useGameAudio } from '@/core/audio';
import {
  isSelectKey,
  useGridNavigation,
  useNavigationScope,
  type Direction,
  type Point2D,
} from '@/core/navigation';
import type { EnrichedLevelItem } from '@/core/progression';
import { cn } from '@/lib/cn';
import { MotionConfig, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ArrowUp, SkipForward, type LucideIcon } from 'lucide-react';
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import {
  continueAfterStop,
  createBearSortGame,
  dropBear,
  getFadedFeature,
  getHintLevel,
  getNextBearUid,
  getTargetZoneId,
  getUpcomingRule,
  isBearForbidden,
  isPerfectWin,
} from '../engine';
import { getBearLabel, getBoxLabel, getRuleLabel } from '../labels';
import type {
  Bear,
  BearBounce,
  BearSortLevelConfig,
  BearSortRule,
  BearSortState,
  BearSortZone,
  BearSortZoneId,
  SortFeature,
} from '../types';
import { getRuleClipId, getVoiceClipPath, type BearSortClipId } from '../voice-script';
import { BearBox } from './BearBox';
import { BearFigure } from './BearFigure';
import { BearSortEndScreen } from './BearSortEndScreen';
import { DROP_TOLERANCE_PX, findDropZone, isPointInRect } from './drop-zones';
import { GestureHand } from './GestureHand';
import { NoBadge } from './NoBadge';
import { OwlMascot, type MascotMood } from './OwlMascot';
import { RulePicture } from './RulePicture';
import { StopOverlay } from './StopOverlay';
import { TAP_SLOP_PX, useBearDrag, type HeldBear } from './useBearDrag';
import { MIN_MIME_MS, useMascotSpeech, type SpeakingMood } from './useMascotSpeech';
import { useTransient } from './useTransient';

export { DROP_TOLERANCE_PX, MIN_MIME_MS, TAP_SLOP_PX };

/** Inaction avant un rappel, répété à cet intervalle tant que l'enfant ne fait rien. */
export const IDLE_NUDGE_MS = 12000;

/** Attente imposée du panneau STOP : il ne s'active pas avant, même si la voix est déjà finie. */
export const STOP_MIN_WAIT_MS = 5000;

/** Panneau actif et pas touché : la voix le rappelle à cet intervalle. */
export const STOP_NUDGE_MS = 6000;

/** Rappels d'affilée sans aucun geste : un écran laissé allumé finit par se taire. */
export const MAX_NUDGES = 3;

/** Victoire : l'enfant voit le dernier ours rangé, puis la fin de partie s'ouvre. */
export const END_SCREEN_DELAY_MS = 900;

/** Mascotte contente après un ours bien rangé. */
const HAPPY_MS = 700;

/** Pulsation de la boîte qui reçoit un ours. */
const BOX_PULSE_MS = 450;

/** Image de la règle qui attire l'œil, après un rebond ou une inaction. */
const RULE_PULSE_MS = 2400;

/** Ours qui remue, après un rebond ou une inaction (l'échelon 3 le fait remuer plus longtemps). */
const WIGGLE_MS = 1400;

/** Une boucle du geste montré à la première étoile, en secondes. */
const GESTURE_LOOP_S = 2.2;

/** Hauteur visée sur la face d'une boîte, en part de son carré : valable pour les deux tailles. */
const BOX_FACE_HEIGHT = 0.3;

const REMOTE_ARROWS: Readonly<Record<BearSortZoneId, LucideIcon>> = {
  left: ArrowLeft,
  right: ArrowRight,
  open: ArrowUp,
};

/** Rangée, en paysage, de chaque boîte de part et d'autre du guide. */
const ZONE_PLACEMENTS: Readonly<Record<BearSortZoneId, string>> = {
  left: 'landscape:col-start-1 landscape:row-start-1',
  right: 'landscape:col-start-3 landscape:row-start-1',
  open: '',
};

/** Portrait : le guide, puis les deux boîtes côte à côte. Paysage : boîte, guide, boîte. */
const SORT_GRID_CLASSES =
  'grid-cols-2 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] landscape:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] landscape:grid-rows-[minmax(0,1fr)]';

/** Portrait : le guide, puis la grande boîte ouverte. Paysage : guide à gauche de la boîte. */
const EXCEPT_GRID_CLASSES =
  'grid-cols-1 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] landscape:grid-cols-[auto_minmax(0,1fr)] landscape:grid-rows-[minmax(0,1fr)]';

const SORT_GUIDE_CLASSES =
  'col-span-2 landscape:col-span-1 landscape:col-start-2 landscape:row-start-1';

/** Anneau de l'ours choisi d'un tap : ambré, distinct de l'anneau bleu du D-Pad. */
const SELECTED_CLASSES = 'z-10 ring-4 ring-amber-300 ring-offset-2 ring-offset-slate-950';

const IDLE_ANIMATION = { rotate: 0, scale: 1 };
const HELD_ANIMATION = { rotate: 0, scale: 1.12 };
const WIGGLE_ANIMATION = { rotate: [0, -10, 9, -6, 4, 0], scale: 1 };
const WIGGLE_TRANSITION = {
  duration: 0.7,
  ease: 'easeInOut',
  repeat: Infinity,
  repeatDelay: 0.3,
} as const;
const SETTLE_TRANSITION = { type: 'spring', stiffness: 380, damping: 18 } as const;

interface Announcement {
  /** Change à chaque message, même identique : il est de nouveau vocalisé. */
  id: number;
  text: string;
}

/** Les deux conditions du panneau STOP : l'attente imposée, et la fin de la voix. */
interface StopGate {
  isWaitOver: boolean;
  isVoiceOver: boolean;
}

/** Trajet de la main du geste, dans le repère de l'écran. */
interface GesturePath {
  from: Point2D;
  to: Point2D;
}

/** Échelon 3 : la boîte qui s'éclaire, et l'ours qui remue pour la désigner. */
interface GlowHint {
  zoneId: BearSortZoneId;
  bearUid: string | null;
}

/**
 * Horloge de la partie, monotone : `Date.now()` reculerait si l'heure du téléviseur était réglée en
 * cours de partie. Lue par les gestionnaires, jamais au rendu.
 */
function readClock(): number {
  return performance.now();
}

/**
 * Éléments DOM par identifiant (ours, boîtes), hors de l'état : le moteur D-Pad et le glissement les
 * lisent dans leurs gestionnaires, jamais au rendu.
 */
function createElementMap<TKey>() {
  const elements = new Map<TKey, HTMLButtonElement>();
  return {
    getRef: (key: TKey) => (element: HTMLButtonElement | null) => {
      if (!element) return;
      elements.set(key, element);
      // React détache l'ancien élément d'un identifiant avant d'attacher le nouveau.
      return () => {
        elements.delete(key);
      };
    },
    get: (key: TKey) => elements.get(key) ?? null,
    values: () => [...elements.values()],
  };
}

/** Clips que cette étoile peut jouer, chargés à l'avance : la voix part sans délai. */
function getStarClipIds({ phases }: BearSortLevelConfig): BearSortClipId[] {
  const clips = new Set<BearSortClipId>(['hint-look', 'hint-here', 'star-won', 'crown-won']);
  phases.forEach(({ rule }, index) => {
    clips.add(getRuleClipId(rule));
    if (index > 0) {
      clips.add('stop-warning');
      clips.add('stop-go');
    }
    if (rule.kind === 'except') clips.add('nudge-more');
    // Un rebond « ancienne règle » suppose un tri après un autre tri.
    if (rule.kind === 'sort' && phases[index - 1]?.rule.kind === 'sort') clips.add('bounce-trap');
  });
  return [...clips];
}

/**
 * Ours permis à faire remuer : l'ours `preferred` s'il l'est (celui que l'enfant regarde), sinon le
 * premier de la réserve. En phase de tri, tous le sont.
 */
function getAllowedBear(state: BearSortState, preferred: Bear | null): Bear | null {
  if (preferred && getTargetZoneId(state, preferred) !== null) return preferred;
  return state.reserve.find((bear) => getTargetZoneId(state, bear) !== null) ?? null;
}

/** Échelon 3 pour l'ours `relevantUid` ; s'il est interdit, c'est un ours permis qui remue. */
function getGlowHint(state: BearSortState, relevantUid: string | null): GlowHint | null {
  if (getHintLevel(state) < 3) return null;
  const bear = state.reserve.find((candidate) => candidate.uid === relevantUid);
  if (!bear) return null;
  const zoneId = getTargetZoneId(state, bear);
  if (zoneId !== null) return { zoneId, bearUid: bear.uid };
  return { zoneId: 'open', bearUid: getAllowedBear(state, null)?.uid ?? null };
}

/**
 * Entrée ou Espace sur un bouton atteint au Tab : clic natif, comme au doigt. L'évènement ne remonte
 * pas au moteur D-Pad, qui y verrait un OK (rejouer la règle) et ramènerait le focus sur l'ours avant
 * que le navigateur n'émette le clic.
 */
function keepNativeActivation(event: ReactKeyboardEvent) {
  if (isSelectKey(event.key)) event.stopPropagation();
}

export interface BearSortBoardProps {
  /** Niveau lancé (`renderLevel` de `GameScreen`) : configuration, numéro d'étoile */
  level: EnrichedLevelItem<BearSortLevelConfig>;
  /** Commandes du niveau : victoire, étoile suivante, retour à la Carte des Étoiles */
  controls: LevelControls<BearSortLevelConfig>;
}

/**
 * Plateau d'Attrape-Piège, au doigt comme à la télécommande, sans aucun texte du début de l'étoile à
 * sa fin : la mascotte parle, l'image de la règle reste à l'écran (elle porte seule la consigne quand
 * le son est coupé). Orchestre le moteur (FEAT-23), les dessins et la voix (FEAT-22) : un ours se
 * glisse ou se choisit d'un tap, un rebond fait monter l'échelle d'indices, le panneau STOP impose
 * une pause avant la règle suivante. Remonté par `GameScreen` à chaque changement de niveau.
 *
 * Sons et victoire partent des gestionnaires et des minuteurs, jamais d'un `setState` ni d'un effet
 * rejoué (StrictMode) : les effets ne font que poser et retirer des minuteurs.
 */
export function BearSortBoard({ level, controls }: BearSortBoardProps) {
  // En premier (voir `useGameAudio`) : le réglage « Son » est appliqué avant la première voix.
  const audio = useGameAudio();
  const { config } = level.definition;
  const [game, setGame] = useState(() => createBearSortGame(config));
  // Numéro de la partie : une nouvelle partie remonte la réserve et relance l'annonce de la règle.
  const [round, setRound] = useState(0);
  const [cursorUid, setCursorUid] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  // Le bouton Retour a le focus DOM (Tab, clic) : sa zone reçoit les touches, OK le déclenche.
  const [isBackZone, setIsBackZone] = useState(false);
  const [stopGate, setStopGate] = useState<StopGate | null>(null);
  const [hasEarnedCrown, setHasEarnedCrown] = useState(false);
  const [isEndOpen, setIsEndOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  // Change à chaque geste : relance le compte à rebours de l'inaction.
  const [idleEpoch, setIdleEpoch] = useState(0);
  const [gesturePath, setGesturePath] = useState<GesturePath | null>(null);
  const [isHappy, showHappy] = useTransient<true>(HAPPY_MS);
  const [isRulePulsing, pulseRule] = useTransient<true>(RULE_PULSE_MS);
  const [pulsingZoneId, pulseZone] = useTransient<BearSortZoneId>(BOX_PULSE_MS);
  const [wigglingUid, wiggleBear, stopWiggle] = useTransient<string>(WIGGLE_MS);
  const { speakingMood, speak, stopSpeaking } = useMascotSpeech(audio);
  const [bearElements] = useState(() => createElementMap<string>());
  const [zoneElements] = useState(() => createElementMap<BearSortZoneId>());
  const stopButtonRef = useRef<HTMLButtonElement>(null);
  const reserveRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef<number | null>(null);
  const nudgeCountRef = useRef(0);
  // Dernière touche : une flèche maintenue se répète, et l'on ne range qu'un ours par appui.
  const isKeyRepeatRef = useRef(false);

  const isPlaying = game.status === 'playing';
  const isStopped = game.status === 'stop';
  const currentBear =
    game.reserve.find((bear) => bear.uid === cursorUid) ?? game.reserve[0] ?? null;
  const currentUid = currentBear?.uid ?? null;
  const upcomingRule = getUpcomingRule(game);
  const isStopActive = isStopped && stopGate?.isWaitOver === true && stopGate.isVoiceOver;
  const nextLevel = controls.summary.allLevels[level.globalIndex + 1] ?? null;

  const announce = (text: string) => {
    setAnnouncement((previous) => ({ id: (previous?.id ?? 0) + 1, text }));
  };

  /** Annonce une règle : à la voix, précédée de `lead`, et au lecteur d'écran. */
  const announceRule = (
    rule: BearSortRule,
    lead: readonly BearSortClipId[] = [],
    mood?: SpeakingMood,
  ) => {
    announce(getRuleLabel(rule));
    return speak([...lead, getRuleClipId(rule)], mood);
  };

  /** Tout geste de l'enfant : l'inaction repart de zéro. */
  const noteAction = () => {
    nudgeCountRef.current = 0;
    setIdleEpoch((epoch) => epoch + 1);
    stopWiggle();
  };

  /**
   * Échelle d'indices : chaque rebond rappelle la règle, de plus en plus clairement. La mascotte parle
   * simplement : sa tête qui dit non se lirait comme un reproche.
   */
  const reactToBounce = (bounced: BearSortState, bounce: BearBounce) => {
    audio.playEffect('bounce');
    pulseRule(true);
    const hintLevel = getHintLevel(bounced);
    // Dernier échelon sur un ours interdit : la main passe à un ours permis, le seul qui remue. Sinon
    // la flèche ou la boîte éclairée referaient rebondir le même, sans jamais aboutir à une réussite.
    const allowedBear =
      hintLevel >= 3 && bounce.kind === 'forbidden' ? getAllowedBear(bounced, null) : null;
    if (allowedBear) {
      setCursorUid(allowedBear.uid);
      if (selectedUid !== null) setSelectedUid(allowedBear.uid);
    } else {
      wiggleBear(bounce.bearUid);
    }
    if (hintLevel === 1) {
      const lead: BearSortClipId[] = bounce.kind === 'old-rule' ? ['bounce-trap'] : [];
      void announceRule(bounced.rule, lead, 'talking');
    } else if (hintLevel === 2) {
      void announceRule(bounced.rule, ['hint-look'], 'talking');
    } else {
      void speak(['hint-here']);
      const hint = getGlowHint(bounced, allowedBear?.uid ?? selectedUid ?? bounce.bearUid);
      const zone = bounced.zones.find((candidate) => candidate.id === hint?.zoneId);
      const bearHint = allowedBear ? `, avec ${getBearLabel(allowedBear).toLowerCase()}` : '';
      if (zone) announce(`Essaie ici : ${getBoxLabel(zone.traits)}${bearHint}`);
    }
  };

  /**
   * Panneau STOP : l'attente imposée court (effet plus bas) pendant que la voix met en garde et que
   * l'image montre la règle suivante. La voix ne dit cette règle qu'au redémarrage.
   */
  const enterStop = (stopped: BearSortState) => {
    const upcoming = getUpcomingRule(stopped);
    if (!upcoming) return;
    setStopGate({ isWaitOver: false, isVoiceOver: false });
    audio.playEffect('stop');
    announce(`Stop ! ${getRuleLabel(upcoming)}`);
    void speak(['stop-warning']).then(() => {
      setStopGate((gate) => gate && { ...gate, isVoiceOver: true });
    });
  };

  /** Victoire : enregistrée ici, une seule fois, jamais par un effet rejoué. */
  const finish = (won: BearSortState) => {
    const isPerfect = isPerfectWin(won);
    const startedAt = startedAtRef.current;
    const timeSeconds = startedAt === null ? 0 : Math.round((readClock() - startedAt) / 1000);
    setHasEarnedCrown(isPerfect);
    audio.playEffect('victory');
    void speak(isPerfect ? ['star-won', 'crown-won'] : ['star-won']);
    void controls.recordVictory({ moves: won.moves, timeSeconds, isPerfect });
  };

  /**
   * Dépôt au doigt, au tap ou à la télécommande, calculé hors de `setGame`. Le dépôt qui termine une
   * phase ne joue que le son du panneau STOP ou de la victoire : deux effets superposés seraient
   * confus.
   */
  const placeBear = (uid: string, zoneId: BearSortZoneId) => {
    const next = dropBear(game, uid, zoneId);
    if (next === game) return;
    setGame(next);
    noteAction();
    if (next.lastBounce) {
      reactToBounce(next, next.lastBounce);
      return;
    }
    setSelectedUid(null);
    if (uid === currentUid) setCursorUid(getNextBearUid(game, uid));
    pulseZone(zoneId);
    showHappy(true);
    if (next.status === 'won') finish(next);
    else if (next.status === 'stop') enterStop(next);
    else audio.playEffect('success');
  };

  /** Le panneau, déjà actif, est touché : le jeu repart et la voix dit la nouvelle règle. */
  const continueGame = () => {
    if (!isStopActive) return;
    const next = continueAfterStop(game);
    setGame(next);
    setStopGate(null);
    setCursorUid(next.reserve[0]?.uid ?? null);
    noteAction();
    void announceRule(next.rule);
  };

  /** Mascotte touchée, ou OK : la voix répète la règle. */
  const replayRule = () => {
    if (!isPlaying) return;
    noteAction();
    void announceRule(game.rule);
  };

  /** Une nouvelle partie : nouvel ordre des ours, règle annoncée de nouveau (effet sur `round`). */
  const restart = () => {
    stopSpeaking();
    startedAtRef.current = readClock();
    setGame(createBearSortGame(config));
    setRound((value) => value + 1);
    setCursorUid(null);
    setSelectedUid(null);
    setStopGate(null);
    setIsEndOpen(false);
    noteAction();
  };

  const releaseBear = (uid: string, point: Point2D) => {
    // Lâché sur la réserve, même à portée d'une boîte : l'ours n'a rien visé (doigt qui tremble, ours
    // ramené à sa place). Il revient doucement à sa place, et rien n'est compté.
    const reserve = reserveRef.current?.getBoundingClientRect();
    if (reserve && isPointInRect(point, reserve)) return;
    const zones = game.zones.flatMap(({ id }) => {
      const element = zoneElements.get(id);
      return element ? [{ id, rect: element.getBoundingClientRect() }] : [];
    });
    const zoneId = findDropZone(point, zones, DROP_TOLERANCE_PX);
    // Lâché hors de toute boîte : même retour.
    if (zoneId !== null) placeBear(uid, zoneId);
  };

  const drag = useBearDrag({
    isEnabled: isPlaying,
    onDragStart: (uid) => {
      setSelectedUid(null);
      setCursorUid(uid);
      noteAction();
    },
    onRelease: releaseBear,
  });

  /** Une flèche par ours. Tri : gauche et droite rangent. Négation : haut range, le reste laisse. */
  const pressDirection = (direction: Direction) => {
    if (isKeyRepeatRef.current || !isPlaying || drag.held || currentUid === null) return;
    if (game.rule.kind === 'sort') {
      if (direction === 'left' || direction === 'right') placeBear(currentUid, direction);
      return;
    }
    if (direction === 'up') {
      placeBear(currentUid, 'open');
      return;
    }
    setCursorUid(getNextBearUid(game, currentUid));
    setSelectedUid(null);
    noteAction();
  };

  const back = useGridNavigation({
    scopeId: 'bear-sort-back',
    rows: 1,
    cols: 1,
    isActive: isBackZone,
    onBack: controls.exitToMap,
    onEdge: () => {
      setIsBackZone(false);
    },
  });

  /** Élément du curseur D-Pad : l'ours courant, ou le panneau STOP. */
  const getCursorElement = () => {
    if (isStopped) return stopButtonRef.current;
    return currentUid === null ? null : bearElements.get(currentUid);
  };

  const { isFocusVisible, inputMode } = useNavigationScope({
    scopeId: 'bear-sort-board',
    isActive: !isBackZone,
    onDirection: pressDirection,
    onSelect: () => {
      if (isStopped) continueGame();
      else replayRule();
    },
    onBack: controls.exitToMap,
    getFocusedElement: getCursorElement,
    ownsElement: (element) =>
      [...bearElements.values(), stopButtonRef.current].some((owned) => owned?.contains(element)),
  });
  const isDpad = inputMode === 'dpad';

  /** Tap sur un ours (aussi TalkBack et le clavier) : il devient l'ours choisi, sans bascule. */
  const tapBear = (uid: string, event: ReactMouseEvent) => {
    if (drag.isDragClick(event) || !isPlaying) return;
    setSelectedUid(uid);
    setCursorUid(uid);
    noteAction();
  };

  /** Tap sur une boîte : y dépose l'ours choisi, ou l'ours du curseur quand il est montré. */
  const tapZone = (zoneId: BearSortZoneId) => {
    if (!isPlaying) return;
    const uid = selectedUid ?? (isFocusVisible ? currentUid : null);
    if (uid === null) announce('Choisis d’abord un ours');
    else placeBear(uid, zoneId);
  };

  const focusBoard = () => {
    setIsBackZone(false);
  };

  /** Focus DOM (Tab, clic) sur un ours : il devient le curseur et la zone du plateau s'active. */
  const focusBear = (uid: string) => {
    setIsBackZone(false);
    setCursorUid(uid);
  };

  /** Inaction : la règle est rappelée, et un ours montre où commencer. */
  const nudge = useEffectEvent(() => {
    if (nudgeCountRef.current >= MAX_NUDGES) return;
    nudgeCountRef.current += 1;
    pulseRule(true);
    const shown = (isFocusVisible ? currentBear : null) ?? game.reserve[0] ?? null;
    if (game.rule.kind === 'sort') {
      void announceRule(game.rule);
      if (shown) wiggleBear(shown.uid);
      return;
    }
    void speak(['nudge-more']);
    const allowed = nudgeCountRef.current >= 2 ? getAllowedBear(game, shown) : null;
    if (allowed) wiggleBear(allowed.uid);
  });

  const isIdleWatched = isPlaying && drag.held === null;

  useEffect(() => {
    if (!isIdleWatched) return;
    const timer = setInterval(nudge, IDLE_NUDGE_MS);
    return () => {
      clearInterval(timer);
    };
  }, [isIdleWatched, idleEpoch]);

  // Annonce de la partie : un minuteur plutôt qu'un appel direct, l'effet rejoué sous StrictMode ne
  // parle qu'une fois, et après le son coupé par le faux démontage de `useGameAudio`.
  const announceStart = useEffectEvent(() => {
    void audio.preloadClips(getStarClipIds(config).map(getVoiceClipPath));
    void announceRule(game.rule);
  });

  useEffect(() => {
    const timer = setTimeout(announceStart, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [round]);

  useEffect(() => {
    startedAtRef.current ??= readClock();
  }, []);

  // Une flèche maintenue se répète : écouteur en capture, avant le moteur D-Pad sur `window`.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      isKeyRepeatRef.current = event.repeat;
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, []);

  // Curseur → focus DOM (annonces TalkBack), au D-Pad uniquement : `useNavigationScope` ne déplace
  // pas le focus lui-même (FEAT-04 §5).
  const focusCursor = useEffectEvent(() => {
    const element = getCursorElement();
    if (element && element !== document.activeElement) element.focus({ preventScroll: true });
  });

  useEffect(() => {
    if (isFocusVisible) focusCursor();
  }, [isFocusVisible, isStopped, currentUid, round]);

  // Attente imposée du panneau STOP.
  useEffect(() => {
    if (!isStopped) return;
    const timer = setTimeout(() => {
      setStopGate((gate) => gate && { ...gate, isWaitOver: true });
    }, STOP_MIN_WAIT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isStopped]);

  // Panneau actif et pas touché : la voix le rappelle. Le dernier dépôt a remis le compte à zéro.
  const remindStop = useEffectEvent(() => {
    if (nudgeCountRef.current >= MAX_NUDGES) return;
    nudgeCountRef.current += 1;
    void speak(['stop-go']);
  });

  useEffect(() => {
    if (!isStopActive) return;
    const timer = setInterval(remindStop, STOP_NUDGE_MS);
    return () => {
      clearInterval(timer);
    };
  }, [isStopActive]);

  // Victoire : l'enfant voit le dernier ours rangé, puis la fin de partie s'ouvre.
  const isWon = game.status === 'won';

  useEffect(() => {
    if (!isWon) return;
    const timer = setTimeout(() => {
      setIsEndOpen(true);
    }, END_SCREEN_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isWon]);

  // Geste de la première étoile : tant que le premier ours n'est pas rangé, ni pris, ni choisi. Un
  // rebond ne le retire pas : c'est justement là que l'enfant en a besoin.
  const isFirstBearWaiting =
    game.phaseIndex === 0 && game.zones.every(({ bears }) => bears.length === 0);
  const gestureBear = getAllowedBear(game, null);
  const gestureZoneId =
    config.showGestureHint && isFirstBearWaiting && drag.held === null && selectedUid === null
      ? gestureBear && getTargetZoneId(game, gestureBear)
      : null;
  const gestureBearUid = gestureZoneId ? (gestureBear?.uid ?? null) : null;
  const isHandWanted = gestureBearUid !== null && !isDpad;

  // Mesuré après la mise en page, et de nouveau à chaque rotation de l'écran ; rien à montrer si les
  // éléments ne sont pas mesurables (jsdom).
  const measureGesture = useEffectEvent(() => {
    const bear = gestureBearUid === null ? null : bearElements.get(gestureBearUid);
    const zone = gestureZoneId ? zoneElements.get(gestureZoneId) : null;
    const from = bear?.getBoundingClientRect();
    const to = zone?.getBoundingClientRect();
    if (!from || !to || from.width === 0 || to.width === 0) {
      setGesturePath(null);
      return;
    }
    // Le dessin de la boîte est ancré en bas de sa case : la main vise sa face, pas le vide au-dessus.
    const boxSide = Math.min(to.width, to.height);
    setGesturePath({
      from: { x: from.x + from.width / 2, y: from.y + from.height / 2 },
      to: { x: to.x + to.width / 2, y: to.bottom - boxSide * BOX_FACE_HEIGHT },
    });
  });

  useEffect(() => {
    if (!isHandWanted) return;
    const frame = requestAnimationFrame(measureGesture);
    window.addEventListener('resize', measureGesture);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measureGesture);
    };
  }, [isHandWanted, gestureBearUid, gestureZoneId, round]);

  const hintLevel = getHintLevel(game);
  const fadedFeature = getFadedFeature(game);
  const glowHint = getGlowHint(
    game,
    drag.held?.uid ?? selectedUid ?? game.lastBounce?.bearUid ?? null,
  );
  const mood: MascotMood = isHappy ? 'happy' : (speakingMood ?? 'idle');
  const isExcept = game.rule.kind === 'except';

  return (
    <AppShell
      title={`Étoile #${String(level.starNumber)}`}
      isHeaderTextHidden
      onBack={controls.exitToMap}
      isBackFocused={back.isItemFocused(0)}
      backButtonRef={back.getItemRef(0)}
      onBackFocus={() => {
        setIsBackZone(true);
      }}
    >
      <MotionConfig reducedMotion="user">
        {/* Rogné : un ours glissé jusqu'au bord de l'écran ne fait pas défiler le contenu. Marge
            interne : l'anneau de focus des ours du bord reste visible. En paysage, 8vw : les dix ours
            d'une longue série tiennent sur une rangée, et les boîtes ne bougent pas en cours de série. */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden [--bear-slot:clamp(3.25rem,13vmin,6.5rem)] landscape:[--bear-slot:clamp(3.25rem,min(13vmin,8vw),6.5rem)]">
          <div inert={isStopped} className="flex min-h-0 flex-1 flex-col gap-2 p-2 md:gap-3">
            <div
              className={cn(
                'grid min-h-0 flex-1 gap-2 md:gap-3',
                isExcept ? EXCEPT_GRID_CLASSES : SORT_GRID_CLASSES,
              )}
            >
              <div
                className={cn(
                  'flex min-h-0 min-w-0 items-center justify-center gap-3 landscape:w-[clamp(7rem,30vmin,15rem)] landscape:flex-col',
                  !isExcept && SORT_GUIDE_CLASSES,
                )}
              >
                <button
                  type="button"
                  aria-label="Réécouter la règle"
                  data-mood={mood}
                  className={cn(
                    'aspect-square w-[clamp(4.5rem,24vmin,10rem)] shrink-0 cursor-pointer rounded-full',
                    FOCUS_VISIBLE_CLASSES,
                  )}
                  onClick={replayRule}
                  onFocus={focusBoard}
                  onKeyDown={keepNativeActivation}
                >
                  <OwlMascot mood={mood} className="size-full" />
                </button>
                {/* Conteneur de taille : la carte 8:5 prend la plus grande place qui lui reste. */}
                <div
                  data-rule-picture="true"
                  data-pulsing={isRulePulsing === true || undefined}
                  className="@container-size flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center"
                >
                  <RulePicture
                    rule={game.rule}
                    leftBox={config.zones[0]}
                    isPulsing={isRulePulsing === true}
                    className="w-[min(100cqw,calc(100cqh*1.6))]"
                  />
                </div>
              </div>

              {game.zones.map((zone) => (
                <ZoneBox
                  key={zone.id}
                  ref={zoneElements.getRef(zone.id)}
                  zone={zone}
                  fadedFeature={fadedFeature}
                  isGlowing={glowHint?.zoneId === zone.id}
                  isPulsing={pulsingZoneId === zone.id}
                  arrow={isDpad ? REMOTE_ARROWS[zone.id] : null}
                  isArrowPulsing={isDpad && gestureZoneId === zone.id}
                  className={ZONE_PLACEMENTS[zone.id]}
                  onClick={() => {
                    tapZone(zone.id);
                  }}
                  onFocus={focusBoard}
                />
              ))}
            </div>

            <div
              key={round}
              ref={reserveRef}
              role="group"
              aria-label="Réserve d'ours"
              className="relative flex shrink-0 flex-wrap content-center items-center justify-center gap-2 portrait:min-h-[calc(2*var(--bear-slot)+0.5rem)]"
            >
              {game.reserve.map((bear) => {
                const isHeld = drag.held?.uid === bear.uid;
                return (
                  <ReserveBear
                    key={bear.uid}
                    ref={bearElements.getRef(bear.uid)}
                    bear={bear}
                    held={isHeld ? drag.held : null}
                    isFocused={isFocusVisible && !isStopped && bear.uid === currentUid}
                    isSelected={bear.uid === selectedUid}
                    isWiggling={bear.uid === wigglingUid || bear.uid === glowHint?.bearUid}
                    hasNoBadge={hintLevel >= 2 && isBearForbidden(game.rule, bear)}
                    fadedFeature={fadedFeature}
                    canDrag={isPlaying}
                    onPointerDown={(event) => {
                      drag.startGesture(bear.uid, event);
                    }}
                    onPointerMove={drag.moveGesture}
                    onPointerUp={drag.endGesture}
                    onPointerCancel={drag.cancelGesture}
                    onClick={(event) => {
                      tapBear(bear.uid, event);
                    }}
                    onFocus={() => {
                      focusBear(bear.uid);
                    }}
                    // Au D-Pad, OK va au moteur et rejoue la règle ; sinon il choisit l'ours.
                    onKeyDown={isFocusVisible ? undefined : keepNativeActivation}
                  />
                );
              })}
              {isDpad && isExcept ? (
                <span
                  aria-hidden="true"
                  data-skip-hint="true"
                  className="flex size-10 items-center justify-center rounded-full bg-slate-800 text-sky-200"
                >
                  <SkipForward className="size-6" />
                </span>
              ) : null}
            </div>
          </div>

          {isStopped && upcomingRule ? (
            <StopOverlay
              ref={stopButtonRef}
              upcomingRule={upcomingRule}
              leftBox={config.zones[0]}
              isActive={isStopActive}
              isFocused={isFocusVisible}
              onContinue={continueGame}
            />
          ) : null}

          {isHandWanted && gesturePath ? <GestureHint path={gesturePath} /> : null}
        </div>
      </MotionConfig>

      {/* Région toujours présente : chaque annonce de la règle est aussi vocalisée. */}
      <p role="status" className="sr-only">
        {announcement ? <span key={announcement.id}>{announcement.text}</span> : null}
      </p>

      <BearSortEndScreen
        isOpen={isEndOpen}
        starNumber={level.starNumber}
        hasCrown={hasEarnedCrown || level.isPerfect}
        hasNextStar={nextLevel !== null}
        onNext={() => {
          if (nextLevel) controls.playLevel(nextLevel.definition.id);
        }}
        onReplay={restart}
        onExitToMap={controls.exitToMap}
      />
    </AppShell>
  );
}

interface ZoneBoxProps {
  zone: BearSortZone;
  fadedFeature: SortFeature | null;
  isGlowing: boolean;
  isPulsing: boolean;
  /** Flèche de la télécommande, au D-Pad uniquement */
  arrow: LucideIcon | null;
  /** Geste de la première étoile, au D-Pad : la flèche à presser */
  isArrowPulsing: boolean;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  onClick: () => void;
  onFocus: () => void;
}

/**
 * Boîte : un bouton qui occupe toute sa case (cible large), le dessin dans le plus grand carré qui y
 * tient, et les ours déjà rangés en miniature. Conteneur de taille : tout est proportionnel au carré.
 */
function ZoneBox({
  zone,
  fadedFeature,
  isGlowing,
  isPulsing,
  arrow: Arrow,
  isArrowPulsing,
  className,
  ref,
  onClick,
  onFocus,
}: ZoneBoxProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={getBoxLabel(zone.traits)}
      data-zone-id={zone.id}
      data-glowing={isGlowing || undefined}
      data-pulsing={isPulsing || undefined}
      data-faded={fadedFeature ?? undefined}
      className={cn(
        '@container-size relative flex min-h-0 min-w-0 cursor-pointer items-end justify-center rounded-2xl',
        FOCUS_VISIBLE_CLASSES,
        className,
      )}
      onClick={onClick}
      onFocus={onFocus}
      onKeyDown={keepNativeActivation}
    >
      <motion.span
        className="relative block size-[min(100cqw,100cqh)]"
        animate={{ scale: isPulsing ? [1, 1.06, 1] : 1 }}
        transition={{ duration: BOX_PULSE_MS / 1000 }}
      >
        <BearBox traits={zone.traits} fadedFeature={fadedFeature} isGlowing={isGlowing} />
        <span className="absolute inset-x-[10%] bottom-[5%] flex flex-wrap content-end items-end justify-center">
          {zone.bears.map((bear) => (
            <motion.span
              key={bear.uid}
              data-placed-bear={bear.uid}
              data-color={bear.color}
              data-size={bear.size}
              className="block size-[calc(min(100cqw,100cqh)*0.2)] drop-shadow-[0_0_2px_rgb(255_255_255/0.9)]"
              initial={{ scale: 0.4 }}
              animate={{ scale: 1 }}
              transition={SETTLE_TRANSITION}
            >
              <BearFigure color={bear.color} size={bear.size} fadedFeature={fadedFeature} />
            </motion.span>
          ))}
        </span>
        {Arrow ? (
          <span
            aria-hidden="true"
            data-remote-arrow={zone.id}
            data-gesture-arrow={isArrowPulsing || undefined}
            className={cn(
              'absolute left-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full bg-slate-950/85 text-sky-200 tv:size-12',
              // Le dessin est ancré en bas de son carré : une petite boîte laisse du vide au-dessus.
              zone.traits?.size === 'small' && fadedFeature !== 'size' ? 'top-[28%]' : 'top-0',
              isArrowPulsing && 'text-amber-200 ring-4 ring-amber-300 motion-safe:animate-pulse',
            )}
          >
            <Arrow className="size-6 tv:size-8" strokeWidth={3} />
          </span>
        ) : null}
      </motion.span>
    </button>
  );
}

type BearPointerHandler = (event: ReactPointerEvent<HTMLButtonElement>) => void;

interface ReserveBearProps {
  bear: Bear;
  /** Décalage du glissement en cours, `null` au repos */
  held: HeldBear | null;
  isFocused: boolean;
  isSelected: boolean;
  isWiggling: boolean;
  /** Échelon 2 d'une règle « sauf » : ours interdit, signe « non » gris par-dessus */
  hasNoBadge: boolean;
  fadedFeature: SortFeature | null;
  /** Plateau figé : le curseur ne promet plus de glissement */
  canDrag: boolean;
  ref?: Ref<HTMLButtonElement>;
  onPointerDown: BearPointerHandler;
  onPointerMove: BearPointerHandler;
  onPointerUp: BearPointerHandler;
  onPointerCancel: BearPointerHandler;
  onClick: (event: ReactMouseEvent) => void;
  onFocus: () => void;
  onKeyDown?: (event: ReactKeyboardEvent) => void;
}

/**
 * Ours de la réserve, dans sa case carrée. `touch-action: none` : un doigt posé sur un ours le fait
 * glisser (décision prise au premier contact, trop tôt pour un changement de style). La case est
 * élevée, pas le bouton : la position animée de la case crée un contexte d'empilement.
 */
function ReserveBear({
  bear,
  held,
  isFocused,
  isSelected,
  isWiggling,
  hasNoBadge,
  fadedFeature,
  canDrag,
  ref,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClick,
  onFocus,
  onKeyDown,
}: ReserveBearProps) {
  const isHeld = held !== null;
  let animation: typeof IDLE_ANIMATION | typeof WIGGLE_ANIMATION = IDLE_ANIMATION;
  if (isHeld) animation = HELD_ANIMATION;
  else if (isWiggling) animation = WIGGLE_ANIMATION;

  return (
    <motion.div
      layout="position"
      className={cn('relative size-(--bear-slot)', isHeld ? 'z-30' : isFocused && 'z-10')}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <button
        ref={ref}
        type="button"
        aria-label={getBearLabel(bear)}
        aria-pressed={isSelected}
        data-bear-uid={bear.uid}
        data-color={bear.color}
        data-size={bear.size}
        data-focused={isFocused || undefined}
        data-dragging={isHeld || undefined}
        data-wiggling={isWiggling || undefined}
        data-faded={fadedFeature ?? undefined}
        style={
          held ? { transform: `translate(${String(held.dx)}px, ${String(held.dy)}px)` } : undefined
        }
        className={cn(
          'relative block size-full touch-none rounded-2xl select-none',
          canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          // Glissement : l'ours suit le doigt sans délai. Relâché, il revient avec un petit ressort.
          isHeld
            ? 'transition-none'
            : 'motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          FOCUS_VISIBLE_CLASSES,
          isSelected && SELECTED_CLASSES,
          // Réduction des animations : le liseré désigne l'ours qui ne peut plus remuer.
          isWiggling && 'motion-reduce:ring-2 motion-reduce:ring-sky-300/70',
          isFocused && FOCUSED_CLASSES,
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={onClick}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      >
        <motion.span
          className="block size-full"
          animate={animation}
          transition={isWiggling && !isHeld ? WIGGLE_TRANSITION : SETTLE_TRANSITION}
        >
          <BearFigure color={bear.color} size={bear.size} fadedFeature={fadedFeature} />
        </motion.span>
        {hasNoBadge ? (
          <span data-no-badge="true" className="pointer-events-none absolute inset-0">
            <NoBadge className="size-full" />
          </span>
        ) : null}
      </button>
    </motion.div>
  );
}

/**
 * Main du geste : elle va en boucle de l'ours à sa boîte, et ne capte aucun doigt. Le point animé est
 * le bout de son index (en haut, à 42 % de sa largeur). Position fixe : sous le dernier rang d'ours,
 * sa paume dépasse du plateau sans y être rognée ni le faire défiler.
 */
function GestureHint({ path: { from, to } }: { path: GesturePath }) {
  return (
    <motion.div
      aria-hidden="true"
      data-gesture-hand="true"
      className="pointer-events-none fixed top-0 left-0 z-40"
      initial={{ x: from.x, y: from.y, opacity: 0 }}
      animate={{
        x: [from.x, from.x, to.x, to.x],
        y: [from.y, from.y, to.y, to.y],
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        duration: GESTURE_LOOP_S,
        times: [0, 0.15, 0.8, 1],
        ease: 'easeInOut',
        repeat: Infinity,
        repeatDelay: 0.4,
      }}
    >
      <GestureHand className="absolute top-0 left-0 size-[clamp(3rem,12vmin,5.5rem)] -translate-x-[42%]" />
    </motion.div>
  );
}
