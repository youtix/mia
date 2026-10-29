'use client';

import type { LevelControls } from '@/components/progression';
import { AppShell, DEFAULT_REMOTE_HINTS, type RemoteHint } from '@/components/ui';
import {
  findNearestTarget,
  useGridNavigation,
  useNavigationScope,
  type Direction,
  type NavigationTarget,
} from '@/core/navigation';
import type { EnrichedLevelItem } from '@/core/progression';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, TrafficCone } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  applyMove,
  createTrafficJamGame,
  getVehicleBounds,
  isPerfectWin,
  resetLevel,
  undoLastMove,
  type VehicleBounds,
} from '../engine';
import { getNextBestMove } from '../solver';
import {
  HERO_VEHICLE_ID,
  type TrafficJamLevelConfig,
  type TrafficJamMove,
  type TrafficJamState,
  type VehicleAxis,
  type VehicleDef,
} from '../types';
import {
  getBoardLabel,
  getHintMessage,
  getObstacleLabel,
  HINT_UNAVAILABLE_MESSAGE,
  HINT_WON_MESSAGE,
} from './labels';
import { TrafficJamEndModal, type TrafficJamGameResult } from './TrafficJamEndModal';
import { HUD_ACTIONS, TrafficJamHud } from './TrafficJamHud';
import { VehiclePiece } from './VehiclePiece';

/** Sortie du hero par l'ouverture du muret, avant la modale de fin. */
export const EXIT_ANIMATION_MS = 600;

/** Durée d'affichage d'un indice, s'il n'est pas suivi d'un coup avant. */
export const HINT_DURATION_MS = 2500;

/** Épaisseur du muret du parking. */
const WALL_PX = 6;

/** Zones D-Pad : le HUD (Retour d'`AppShell`, Annuler, Indice, Recommencer), puis le parking. */
type BoardZone = 'hud' | 'board';

/** Index D-Pad du premier bouton du HUD, après le Retour d'`AppShell` (index 0). */
const HUD_FIRST_ACTION_INDEX = 1;
const HUD_ITEM_COUNT = HUD_FIRST_ACTION_INDEX + HUD_ACTIONS.length;

/** Machine à 2 états de la télécommande (SPECIFICATION §4.2). */
interface RemoteState {
  focusedVehicleId: string;
  /** État 2 : véhicule démarré, les flèches de son axe le déplacent case par case */
  isLocked: boolean;
  /**
   * Longueur de l'historique au démarrage du véhicule : un pas ne se cumule qu'avec un coup joué
   * depuis (`history.length` plus grand). Un cumul nul retire le coup et ramène l'historique à
   * cette longueur : le pas suivant ouvre un nouveau coup, jamais fusionné avec celui d'une
   * session précédente du même véhicule.
   */
  historyLengthAtLock: number;
}

const INITIAL_REMOTE: RemoteState = {
  focusedVehicleId: HERO_VEHICLE_ID,
  isLocked: false,
  historyLengthAtLock: 0,
};

/** Glissement d'un véhicule en cours (Pointer Events). */
interface DragState {
  vehicleId: string;
  pointerId: number;
  axis: VehicleAxis;
  /** Position du pointeur au premier contact, sur l'axe du véhicule (`clientX` ou `clientY`) */
  originPx: number;
  /** Côté d'une case, mesuré sur le parking au premier contact */
  cellPx: number;
  bounds: VehicleBounds;
  /** Décalage courant le long de l'axe, borné par `bounds` */
  offsetPx: number;
}

/** Indice calculé pour un état précis : effacé dès que l'état change (coup, annulation…). */
interface Hint {
  move: TrafficJamMove;
  state: TrafficJamState;
}

interface Announcement {
  /** Change à chaque message, même identique : il est de nouveau vocalisé. */
  id: number;
  text: string;
}

const ARROW_ICONS = {
  H: { backward: ArrowLeft, forward: ArrowRight },
  V: { backward: ArrowUp, forward: ArrowDown },
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Centre géométrique d'un véhicule, en cases (repère écran : `y` croît vers le bas). */
function getVehicleCenter(vehicle: VehicleDef): NavigationTarget {
  return {
    id: vehicle.id,
    x: vehicle.col + (vehicle.axis === 'H' ? vehicle.length / 2 : 0.5),
    y: vehicle.row + (vehicle.axis === 'V' ? vehicle.length / 2 : 0.5),
  };
}

/** Pas d'une flèche sur l'axe du véhicule (`0` : flèche hors axe, ignorée). */
function getStepDelta(axis: VehicleAxis, direction: Direction): number {
  switch (direction) {
    case 'left':
      return axis === 'H' ? -1 : 0;
    case 'right':
      return axis === 'H' ? 1 : 0;
    case 'up':
      return axis === 'V' ? -1 : 0;
    case 'down':
      return axis === 'V' ? 1 : 0;
  }
}

/** Rectangle de cases en pourcentage du parking. */
function getCellRect(row: number, col: number, rows: number, cols: number, gridSize: number) {
  const cell = 100 / gridSize;
  return {
    left: `${String(col * cell)}%`,
    top: `${String(row * cell)}%`,
    width: `${String(cols * cell)}%`,
    height: `${String(rows * cell)}%`,
  } satisfies CSSProperties;
}

/**
 * Capture du pointeur : le glissement suit le doigt même sorti du véhicule. jsdom ne l'implémente
 * pas et un pointeur déjà relâché lève `InvalidStateError` : sans capture, le glissement suit le
 * pointeur tant qu'il reste sur le véhicule.
 */
function capturePointer(element: HTMLElement, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Capture indisponible : voir ci-dessus.
  }
}

/** Aides de la télécommande selon l'état : OK démarre puis arrête le véhicule. */
function getRemoteHints(isLocked: boolean): RemoteHint[] {
  return DEFAULT_REMOTE_HINTS.map((hint) => {
    switch (hint.action) {
      case 'Naviguer':
        return isLocked ? { ...hint, action: 'Avancer / Reculer' } : hint;
      case 'Sélectionner':
        return { ...hint, action: isLocked ? 'Arrêter' : 'Démarrer' };
      default:
        return hint;
    }
  });
}

/**
 * Muret du parking, dessiné par segments autour de la zone des cases : le bord droit est
 * interrompu face à la ligne de sortie, avec un seuil vert dans l'ouverture. Le muret est sous les
 * véhicules, dont l'anneau de focus peut le chevaucher.
 */
function ParkingWalls({ gridSize, exitRow }: Pick<TrafficJamLevelConfig, 'gridSize' | 'exitRow'>) {
  const cell = 100 / gridSize;
  const wall = `${String(WALL_PX)}px`;
  const outside = `-${wall}`;
  const segment = 'pointer-events-none absolute bg-slate-500';
  return (
    <span aria-hidden="true" data-walls="true">
      <span
        className={segment}
        style={{ top: outside, left: outside, right: outside, height: wall }}
      />
      <span
        className={segment}
        style={{ bottom: outside, left: outside, right: outside, height: wall }}
      />
      <span
        className={segment}
        style={{ top: outside, bottom: outside, left: outside, width: wall }}
      />
      <span
        className={segment}
        style={{
          top: outside,
          right: outside,
          width: wall,
          height: `calc(${String(exitRow * cell)}% + ${wall})`,
        }}
      />
      <span
        className={segment}
        style={{
          bottom: outside,
          right: outside,
          width: wall,
          height: `calc(${String((gridSize - exitRow - 1) * cell)}% + ${wall})`,
        }}
      />
      <span
        className="pointer-events-none absolute bg-emerald-400/80"
        style={{
          top: `${String(exitRow * cell)}%`,
          right: outside,
          width: wall,
          height: `${String(cell)}%`,
        }}
      />
    </span>
  );
}

/** Marquage au sol « SORTIE → » dans la dernière case de la ligne de sortie, sous les véhicules. */
function ExitMarking({ gridSize, exitRow }: Pick<TrafficJamLevelConfig, 'gridSize' | 'exitRow'>) {
  return (
    <span
      aria-hidden="true"
      data-exit="true"
      className="pointer-events-none absolute flex flex-col items-center justify-center gap-0.5 bg-emerald-500/15 text-emerald-300"
      style={getCellRect(exitRow, gridSize - 1, 1, 1, gridSize)}
    >
      <span className="text-[0.625rem] leading-none font-black tracking-wider">SORTIE</span>
      <ArrowRight className="size-4" strokeWidth={3} />
    </span>
  );
}

/** Plot de chantier orange et blanc hachuré : case fixe, jamais déplaçable. */
function ObstacleMarker({ row, col, gridSize }: { row: number; col: number; gridSize: number }) {
  return (
    <span
      role="img"
      aria-label={getObstacleLabel(row, col)}
      data-obstacle="true"
      className="absolute p-[3px]"
      style={getCellRect(row, col, 1, 1, gridSize)}
    >
      <span className="flex size-full items-center justify-center rounded-lg border-2 border-orange-900/70 bg-[repeating-linear-gradient(135deg,var(--color-orange-500)_0_6px,var(--color-orange-100)_6px_12px)] text-slate-950">
        <TrafficCone className="size-1/2" strokeWidth={2.5} />
      </span>
    </span>
  );
}

/** Case cible d'un indice : silhouette pointillée du véhicule à sa destination, avec le sens du coup. */
function HintTarget({
  vehicle,
  delta,
  gridSize,
}: {
  vehicle: VehicleDef;
  delta: number;
  gridSize: number;
}) {
  const horizontal = vehicle.axis === 'H';
  const Icon = ARROW_ICONS[vehicle.axis][delta < 0 ? 'backward' : 'forward'];
  return (
    <span
      aria-hidden="true"
      data-hint-target="true"
      className="pointer-events-none absolute z-10 flex items-center justify-center rounded-xl border-4 border-dashed border-sky-300 bg-sky-400/15 text-sky-200 motion-safe:animate-pulse"
      style={getCellRect(
        vehicle.row + (horizontal ? 0 : delta),
        vehicle.col + (horizontal ? delta : 0),
        horizontal ? 1 : vehicle.length,
        horizontal ? vehicle.length : 1,
        gridSize,
      )}
    >
      <Icon className="size-1/2" strokeWidth={3} />
    </span>
  );
}

export interface TrafficJamBoardProps {
  /** Niveau lancé (`renderLevel` de `GameScreen`) : configuration, numéro d'étoile, palier */
  level: EnrichedLevelItem<TrafficJamLevelConfig>;
  /** Commandes du niveau : victoire, étoile suivante, retour à la Carte des Étoiles */
  controls: LevelControls<TrafficJamLevelConfig>;
}

/**
 * Plateau de Traffic Jam : parking carré sans défilement, véhicules glissés au doigt ou à la
 * souris le long de leur axe (aimantés à la case au relâchement), ou pilotés à la télécommande en
 * deux états (choisir un véhicule, puis le déplacer case par case ; FEAT-13 §3.4). Orchestre le
 * moteur (FEAT-12) : coups, annulation, recommencement, indice, victoire enregistrée. Remonté par
 * `GameScreen` à chaque changement de niveau.
 */
export function TrafficJamBoard({ level, controls }: TrafficJamBoardProps) {
  const { config, tier } = level.definition;
  const { gridSize } = config;
  const [game, setGame] = useState(() => createTrafficJamGame(config));
  const [remote, setRemote] = useState(INITIAL_REMOTE);
  const [activeZone, setActiveZone] = useState<BoardZone>('board');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [result, setResult] = useState<TrafficJamGameResult | null>(null);
  const [isEndOpen, setIsEndOpen] = useState(false);
  // Début de la partie : `performance.now()` est monotone, contrairement à `Date.now()` qui recule
  // si l'horloge du téléviseur est réglée pendant la partie.
  const startedAtRef = useRef<number | null>(null);
  const vehiclesRef = useRef<Map<string, HTMLButtonElement>>(null);
  const parkingRef = useRef<HTMLDivElement>(null);

  const nextLevel = controls.summary.allLevels[level.globalIndex + 1] ?? null;
  const focusedVehicle = game.vehicles.find((vehicle) => vehicle.id === remote.focusedVehicleId);
  // Un indice ne vaut que pour l'état qui l'a produit : tout coup, annulation ou recommencement l'efface.
  const activeHint = hint !== null && hint.state === game ? hint.move : null;
  const hintedVehicle =
    activeHint === null
      ? null
      : (game.vehicles.find((vehicle) => vehicle.id === activeHint.vehicleId) ?? null);

  const announce = (text: string) => {
    setAnnouncement((previous) => ({ id: (previous?.id ?? 0) + 1, text }));
  };

  /** Victoire : résultat figé pour la modale, étoile enregistrée (une seule fois, ici même). */
  const finish = (won: TrafficJamState) => {
    const isPerfect = isPerfectWin(won);
    const startedAt = startedAtRef.current;
    const timeSeconds = startedAt === null ? 0 : Math.round((performance.now() - startedAt) / 1000);
    setResult({
      moves: won.moves,
      optimalMoves: config.optimalMoves,
      isPerfect,
      hadCrown: level.isPerfect,
    });
    void controls.recordVictory({ moves: won.moves, timeSeconds, isPerfect });
  };

  /**
   * Coup joué au doigt ou à la télécommande : jamais enregistré par un effet (StrictMode). Le coup
   * gagnant coupe le moteur : pendant la sortie du hero, Retour mène déjà à la Carte des Étoiles,
   * comme depuis la modale.
   */
  const play = (next: TrafficJamState) => {
    if (next === game) return;
    setGame(next);
    if (!next.isWon) return;
    setRemote((current) => (current.isLocked ? { ...current, isLocked: false } : current));
    finish(next);
  };

  /** État 1 : saute au véhicule voisin dans la direction ; au-delà du plateau, Haut rejoint le HUD. */
  const navigateVehicles = (direction: Direction) => {
    if (!focusedVehicle) return;
    const others = game.vehicles.filter((vehicle) => vehicle.id !== focusedVehicle.id);
    const targetId = findNearestTarget(
      getVehicleCenter(focusedVehicle),
      others.map(getVehicleCenter),
      direction,
    );
    if (targetId !== null) {
      setRemote((current) => ({ ...current, focusedVehicleId: targetId }));
    } else if (direction === 'up') {
      setActiveZone('hud');
    }
  };

  /** État 2 : une flèche dans l'axe avance d'une case ; les pas d'une même session font un coup. */
  const stepVehicle = (direction: Direction) => {
    if (!focusedVehicle) return;
    const delta = getStepDelta(focusedVehicle.axis, direction);
    if (delta === 0) return;
    const { minDelta, maxDelta } = getVehicleBounds(game, focusedVehicle.id);
    if (delta < minDelta || delta > maxDelta) return;
    play(
      applyMove(game, focusedVehicle.id, delta, {
        mergeWithPreviousIfSameVehicle: game.history.length > remote.historyLengthAtLock,
      }),
    );
  };

  const hud = useGridNavigation({
    scopeId: 'traffic-jam-hud',
    rows: 1,
    cols: HUD_ITEM_COUNT,
    initialIndex: HUD_FIRST_ACTION_INDEX,
    isActive: activeZone === 'hud',
    onBack: controls.exitToMap,
    onEdge: (direction) => {
      if (direction === 'down') setActiveZone('board');
    },
  });

  const board = useNavigationScope({
    scopeId: 'traffic-jam-board',
    isActive: activeZone === 'board',
    onDirection: (direction) => {
      if (game.isWon) return;
      if (remote.isLocked) stepVehicle(direction);
      else navigateVehicles(direction);
    },
    onSelect: () => {
      if (game.isWon) return;
      setRemote((current) =>
        current.isLocked
          ? { ...current, isLocked: false }
          : { ...current, isLocked: true, historyLengthAtLock: game.history.length },
      );
    },
    onBack: () => {
      if (remote.isLocked) setRemote((current) => ({ ...current, isLocked: false }));
      else controls.exitToMap();
    },
    getFocusedElement: () => vehiclesRef.current?.get(remote.focusedVehicleId) ?? null,
    ownsElement: (element) =>
      Array.from(vehiclesRef.current?.values() ?? []).some((vehicle) => vehicle.contains(element)),
  });
  const { isFocusVisible } = board;

  useEffect(() => {
    startedAtRef.current ??= performance.now();
  }, []);

  // Curseur → focus DOM (annonces TalkBack), au D-Pad uniquement : `useNavigationScope` ne déplace
  // pas le focus lui-même (FEAT-04 §5).
  useEffect(() => {
    if (!isFocusVisible) return;
    const element = vehiclesRef.current?.get(remote.focusedVehicleId);
    if (!element) return;
    if (element !== document.activeElement) element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [isFocusVisible, remote.focusedVehicleId]);

  // Victoire : le hero sort du parking, puis la modale de fin s'ouvre.
  useEffect(() => {
    if (!game.isWon) return;
    const timer = setTimeout(() => {
      setIsEndOpen(true);
    }, EXIT_ANIMATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [game.isWon]);

  // Un indice s'efface de lui-même, s'il n'est pas suivi d'un coup avant.
  useEffect(() => {
    if (hint === null) return;
    const timer = setTimeout(() => {
      setHint(null);
    }, HINT_DURATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [hint]);

  const getVehicleRef = useCallback(
    (id: string) => (element: HTMLButtonElement | null) => {
      if (!element) return;
      const vehicles = (vehiclesRef.current ??= new Map<string, HTMLButtonElement>());
      vehicles.set(id, element);
      // React détache l'ancien élément d'un identifiant avant d'attacher le nouveau.
      return () => {
        vehicles.delete(id);
      };
    },
    [],
  );

  /** Focus DOM (Tab, clic) sur un véhicule : il devient le curseur et sa zone s'active. */
  const focusVehicle = (id: string) => {
    setActiveZone('board');
    setRemote((current) =>
      current.focusedVehicleId === id
        ? current
        : { ...current, focusedVehicleId: id, isLocked: false },
    );
  };

  const focusHud = () => {
    setActiveZone('hud');
  };

  const undo = () => {
    const next = undoLastMove(game);
    if (next !== game) setGame(next);
  };

  /** « Recommencer », « Rejouer » : positions de départ, curseur sur le hero, moteur coupé. */
  const restart = () => {
    startedAtRef.current = performance.now();
    setGame(resetLevel(game));
    setRemote(INITIAL_REMOTE);
    setActiveZone('board');
    setDrag(null);
    setHint(null);
    setResult(null);
    setIsEndOpen(false);
  };

  /** Indice : premier coup d'une solution optimale, montré et vocalisé ; le curseur le cible. */
  const showHint = () => {
    if (game.isWon) {
      announce(HINT_WON_MESSAGE);
      return;
    }
    const move = getNextBestMove(game);
    const vehicle =
      move === null
        ? undefined
        : game.vehicles.find((candidate) => candidate.id === move.vehicleId);
    if (move === null || !vehicle) {
      setHint(null);
      announce(HINT_UNAVAILABLE_MESSAGE);
      return;
    }
    setHint({ move, state: game });
    setRemote((current) => ({ ...current, focusedVehicleId: vehicle.id, isLocked: false }));
    announce(getHintMessage(vehicle, move.delta));
  };

  const startDrag = (vehicle: VehicleDef, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (game.isWon || drag !== null || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const parking = parkingRef.current;
    if (!parking) return;
    const cellPx = parking.getBoundingClientRect().width / gridSize;
    // Sans mise en page (jsdom), aucune case mesurable : pas de glissement.
    if (!(cellPx > 0)) return;
    capturePointer(event.currentTarget, event.pointerId);
    setDrag({
      vehicleId: vehicle.id,
      pointerId: event.pointerId,
      axis: vehicle.axis,
      originPx: vehicle.axis === 'H' ? event.clientX : event.clientY,
      cellPx,
      bounds: getVehicleBounds(game, vehicle.id),
      offsetPx: 0,
    });
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag?.pointerId !== event.pointerId) return;
    const raw = (drag.axis === 'H' ? event.clientX : event.clientY) - drag.originPx;
    const offsetPx = clamp(
      raw,
      drag.bounds.minDelta * drag.cellPx,
      drag.bounds.maxDelta * drag.cellPx,
    );
    if (offsetPx !== drag.offsetPx) setDrag({ ...drag, offsetPx });
  };

  /** Relâchement : aimanté à la case la plus proche, dans les bornes du moment (un coup, ou rien). */
  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag?.pointerId !== event.pointerId) return;
    setDrag(null);
    const { minDelta, maxDelta } = getVehicleBounds(game, drag.vehicleId);
    const delta = clamp(Math.round(drag.offsetPx / drag.cellPx), minDelta, maxDelta);
    if (delta !== 0) play(applyMove(game, drag.vehicleId, delta));
  };

  return (
    <AppShell
      title={`Étoile #${String(level.starNumber)}`}
      onBack={controls.exitToMap}
      isBackFocused={hud.isItemFocused(0)}
      backButtonRef={hud.getItemRef(0)}
      onBackFocus={focusHud}
      footerHints={getRemoteHints(remote.isLocked)}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 landscape:flex-row landscape:gap-4">
        <TrafficJamHud
          moves={game.moves}
          optimalMoves={config.optimalMoves}
          tier={tier}
          hasCrown={level.isPerfect}
          canUndo={game.history.length > 0 && !game.isWon}
          onUndo={undo}
          onHint={showHint}
          onReset={restart}
          firstActionIndex={HUD_FIRST_ACTION_INDEX}
          getActionRef={hud.getItemRef}
          isActionFocused={hud.isItemFocused}
          onActionFocus={focusHud}
          className="shrink-0 landscape:w-64 landscape:overflow-y-auto md:landscape:w-80"
        />
        {/* Conteneur de taille : le parking prend le plus grand carré qui tient dans l'espace
            restant (largeur et hauteur), sans jamais défiler. */}
        <div className="@container-size relative flex min-h-0 min-w-0 flex-1 items-center justify-center p-2">
          <div
            role="group"
            aria-label={getBoardLabel(gridSize, config.exitRow)}
            data-locked={remote.isLocked || undefined}
            className="relative aspect-square w-[min(100cqw,100cqh)] max-w-[520px]"
          >
            {/* Enceinte rognée au bord extérieur du muret : le hero disparaît en sortant. */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl bg-slate-900 shadow-inner shadow-black/60">
              <div
                ref={parkingRef}
                data-parking="true"
                className="absolute"
                style={{ inset: `${String(WALL_PX)}px` }}
              >
                {/* Lignes de stationnement : une par frontière de case. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 opacity-70"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, var(--color-slate-700) 1px, transparent 1px), linear-gradient(to bottom, var(--color-slate-700) 1px, transparent 1px)',
                    backgroundSize: `${String(100 / gridSize)}% ${String(100 / gridSize)}%`,
                  }}
                />
                <ExitMarking gridSize={gridSize} exitRow={config.exitRow} />
                <ParkingWalls gridSize={gridSize} exitRow={config.exitRow} />
                {config.obstacles.map((obstacle) => (
                  <ObstacleMarker
                    key={`${String(obstacle.row)}-${String(obstacle.col)}`}
                    row={obstacle.row}
                    col={obstacle.col}
                    gridSize={gridSize}
                  />
                ))}
                {activeHint && hintedVehicle ? (
                  <HintTarget
                    vehicle={hintedVehicle}
                    delta={activeHint.delta}
                    gridSize={gridSize}
                  />
                ) : null}
                {game.vehicles.map((vehicle) => {
                  const isFocused = isFocusVisible && vehicle.id === remote.focusedVehicleId;
                  const isLocked = isFocused && remote.isLocked;
                  return (
                    <VehiclePiece
                      key={vehicle.id}
                      ref={getVehicleRef(vehicle.id)}
                      vehicle={vehicle}
                      gridSize={gridSize}
                      isFocused={isFocused}
                      isLocked={isLocked}
                      bounds={isLocked ? getVehicleBounds(game, vehicle.id) : undefined}
                      isHinted={activeHint?.vehicleId === vehicle.id}
                      dragOffsetPx={drag?.vehicleId === vehicle.id ? drag.offsetPx : null}
                      isExiting={game.isWon && vehicle.type === 'hero'}
                      onPointerDown={(event) => {
                        startDrag(vehicle, event);
                      }}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onFocus={() => {
                        focusVehicle(vehicle.id);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Région toujours présente : ses messages (indice, position bloquée) sont vocalisés. */}
      <p role="status" className="sr-only">
        {announcement ? <span key={announcement.id}>{announcement.text}</span> : null}
      </p>

      <TrafficJamEndModal
        isOpen={isEndOpen}
        result={result}
        starNumber={level.starNumber}
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
