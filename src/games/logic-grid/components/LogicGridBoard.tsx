'use client';

import type { LevelControls } from '@/components/progression';
import { AppShell } from '@/components/ui';
import { FOCUSED_CLASSES, FOCUS_VISIBLE_CLASSES } from '@/components/ui/focus-styles';
import { useSoundPlayer } from '@/core/audio';
import {
  findNearestTarget,
  useGridNavigation,
  useNavigationScope,
  type Direction,
  type NavigationTarget,
  type Point2D,
} from '@/core/navigation';
import type { EnrichedLevelItem } from '@/core/progression';
// Briques d'Attrape-Piège et de Suites Logiques, réutilisées telles quelles plutôt que dupliquées :
// glissement au doigt, cible de dépôt, main du geste, valeur éphémère, points de progression.
import {
  DROP_TOLERANCE_PX,
  findDropZone,
  isPointInRect,
} from '@/games/bear-sort/components/drop-zones';
import { GestureHand } from '@/games/bear-sort/components/GestureHand';
import { useBearDrag } from '@/games/bear-sort/components/useBearDrag';
import { useTransient } from '@/games/bear-sort/components/useTransient';
import { PatternProgressDots } from '@/games/patterns/components/PatternProgressDots';
import { cn } from '@/lib/cn';
import { MotionConfig, motion, useReducedMotion, type TargetAndTransition } from 'framer-motion';
import { BellRing, Pin } from 'lucide-react';
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import {
  advancePuzzle,
  checkBoard,
  createLogicGridGame,
  getGuideStep,
  getHelpStage,
  getMovableCluePieces,
  getReservePieces,
  isBoardFull,
  isCellLocked,
  isPerfectWin,
  isPieceMovable,
  movePiece,
  returnPiece,
} from '../engine';
import { CELL_COUNT, isPieceId } from '../grid';
import {
  ANNOUNCEMENTS,
  formatBoardTitle,
  formatMissAnnouncement,
  getCellLabel,
  getPieceLabel,
} from '../labels';
import type { LogicGridGameState, LogicGridLevelConfig, PieceId } from '../types';
import { ClueCard, type ClueCardState } from './ClueCard';
import { LogicGridEndScreen } from './LogicGridEndScreen';
import { PieceShapeIcon } from './PieceShapeIcon';

/** Cases de la grille. */
export const GRID_CELL_COUNT = CELL_COUNT;

/** Célébration d'un puzzle réussi : les pièces sautent, puis le puzzle suivant arrive. */
export const SUCCESS_MS = 1400;

/** Le jingle suit la cloche : jouer l'un coupe l'autre (une seule sortie de lecture). */
const JINGLE_DELAY_MS = 450;

/** Étoile gagnée : l'enfant voit son dernier puzzle réussi, puis la fin de partie s'ouvre. */
const END_SCREEN_DELAY_MS = 700;

/** Carte désignée qui pulse, avant de rester simplement entourée. */
const UNMET_PULSE_MS = 2700;

/** Échelon 2 : les pièces de la carte remuent ce temps-là. */
const WIGGLE_MS = 1800;

/** Échelon 3 : la pièce que l'aide vient de placer brille ce temps-là. */
const HELPED_GLOW_MS = 1800;

/** Une boucle du geste de la main fantôme, en secondes. */
const GESTURE_LOOP_S = 2.2;

/**
 * Une case de la réserve par pièce, toujours la même : la réserve ne bouge pas pendant un puzzle.
 * Portrait : au plus quatre par rangée (`--tray-cols`), la cloche à côté tient encore sur 360 px.
 * Paysage : deux colonnes ; sur un écran bas (téléphone couché, 360 px), trois au-delà de six pièces
 * (`--tray-cols-landscape`) : réserve et cloche y tiennent en hauteur, et la grille garde sa largeur
 * partout ailleurs.
 */
const TRAY_CLASSES =
  'grid shrink-0 grid-cols-[repeat(var(--tray-cols),var(--slot))] gap-2 [--slot:clamp(3rem,12vmin,5.5rem)] landscape:grid-cols-[repeat(2,var(--slot))] landscape:[@media(max-height:30rem)]:grid-cols-[repeat(var(--tray-cols-landscape),var(--slot))] tv:[--slot:clamp(3.5rem,12vmin,6.5rem)]';

/** Pièces par rangée de la réserve, en portrait. */
const TRAY_MAX_COLUMNS = 4;

/** Colonnes de la réserve en paysage, selon le nombre de pièces à placer. */
function getLandscapeTrayColumns(freePieces: number): number {
  return freePieces > 6 ? 3 : 2;
}

/** Anneau de la pièce choisie d'un tap : ambré, distinct de l'anneau bleu du D-Pad. */
const SELECTED_CLASSES = 'z-10 ring-4 ring-amber-300 ring-offset-2 ring-offset-slate-950';

const WIGGLE_ANIMATION = { rotate: [0, -12, 10, -7, 4, 0], scale: 1, y: 0 };
const WIGGLE_TRANSITION = { duration: 0.7, ease: 'easeInOut', repeat: 2 } as const;
const SETTLE_TRANSITION = { type: 'spring', stiffness: 420, damping: 20 } as const;

/** Cible du curseur de la télécommande : une pièce de la réserve, une case, ou la cloche. */
type TargetId = `reserve:${PieceId}` | `cell:${string}` | 'bell';

interface Announcement {
  /** Change à chaque message, même identique : il est de nouveau vocalisé. */
  id: number;
  text: string;
}

/** Trajet de la main fantôme, dans le repère de l'écran. */
interface GesturePath {
  from: Point2D;
  to: Point2D;
}

/**
 * Horloge de la partie, monotone. Hors du composant, comme ce qui suit : `react-hooks/purity` prend un
 * gestionnaire capturé par le JSX pour du code de rendu, et y refuse `performance.now()`.
 */
function readClock(): number {
  return performance.now();
}

function cellTarget(cell: number): TargetId {
  return `cell:${String(cell)}`;
}

function reserveTarget(piece: PieceId): TargetId {
  return `reserve:${piece}`;
}

/** Cibles où le curseur peut se poser : pièces de la réserve, cases libres ou pièces à l'enfant. */
function getTargetIds(game: LogicGridGameState): TargetId[] {
  const cells = game.board.flatMap((piece, cell) =>
    isCellLocked(game, cell) || (piece !== null && !isPieceMovable(game, piece))
      ? []
      : [cellTarget(cell)],
  );
  return [...getReservePieces(game).map(reserveTarget), ...cells, 'bell'];
}

/** Cible de départ : la première pièce de la réserve, sinon la cloche. */
function getDefaultTarget(game: LogicGridGameState): TargetId {
  const [first] = getReservePieces(game);
  return first ? reserveTarget(first) : 'bell';
}

/** Éléments DOM par clé, hors de l'état : lus par les gestionnaires, jamais au rendu. */
function createElementMap<TKey>() {
  const elements = new Map<TKey, HTMLElement>();
  return {
    getRef:
      (key: TKey) =>
      (element: HTMLElement | null): (() => void) | undefined => {
        if (!element) return undefined;
        elements.set(key, element);
        // React détache l'ancien élément d'une clé avant d'attacher le nouveau.
        return () => {
          if (elements.get(key) === element) elements.delete(key);
        };
      },
    get: (key: TKey) => elements.get(key) ?? null,
    entries: () => [...elements.entries()],
    values: () => [...elements.values()],
  };
}

/** Centre d'un élément, dans le repère de l'écran. */
function getCenter(element: Element): Point2D {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Pièce portée par un bouton (`data-piece`), lue dans l'évènement plutôt que capturée au rendu. */
function readPiece(element: HTMLElement): PieceId | null {
  const piece = element.dataset.piece ?? '';
  return isPieceId(piece) ? piece : null;
}

/** Case portée par un élément (`data-cell`). */
function readCell(element: HTMLElement): number | null {
  const cell = Number(element.dataset.cell);
  return Number.isInteger(cell) ? cell : null;
}

export interface LogicGridBoardProps {
  /** Niveau lancé (`renderLevel` de `GameScreen`) : configuration, numéro d'étoile */
  level: EnrichedLevelItem<LogicGridLevelConfig>;
  /** Commandes du niveau : victoire, étoile suivante, retour à la Carte des Étoiles */
  controls: LevelControls<LogicGridLevelConfig>;
}

/**
 * Plateau de Chacun sa Place (FEAT-27), au doigt comme à la télécommande, sans aucun texte : les
 * cartes en haut (ou à gauche), la grille au centre, la réserve et la cloche en bas (ou à droite).
 * Une pièce se glisse, ou se choisit d'un tap (OK) puis se pose d'un tap (OK) sur une case ; deux
 * pièces échangent leur place. La cloche ne vérifie qu'un plateau plein : la carte non respectée
 * pulse, puis ses pièces remuent, puis une pièce rejoint sa case. Orchestre le moteur, les règles
 * restent dans `engine.ts`. Remonté par `GameScreen` à chaque changement de niveau.
 */
export function LogicGridBoard({ level, controls }: LogicGridBoardProps) {
  const player = useSoundPlayer();
  const { config } = level.definition;
  const [game, setGame] = useState(() => createLogicGridGame(config));
  // Numéro de la partie : une nouvelle partie remonte la grille et la réserve.
  const [round, setRound] = useState(0);
  const [selected, setSelected] = useState<PieceId | null>(null);
  const [cursor, setCursor] = useState<TargetId | null>(null);
  // Le bouton Retour a le focus (D-Pad, Tab, clic) : sa zone reçoit les touches.
  const [isBackZone, setIsBackZone] = useState(false);
  const [isEndOpen, setIsEndOpen] = useState(false);
  const [hasCrown, setHasCrown] = useState(false);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [gesturePath, setGesturePath] = useState<GesturePath | null>(null);
  const [pulsingClue, pulseClue, stopPulse] = useTransient<number>(UNMET_PULSE_MS);
  const [wiggling, wiggle, stopWiggle] = useTransient<readonly PieceId[]>(WIGGLE_MS);
  const [glowingPiece, glow] = useTransient<PieceId>(HELPED_GLOW_MS);
  const [targets] = useState(() => createElementMap<TargetId>());
  const [cellBoxes] = useState(() => createElementMap<number>());
  const trayRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef<number | null>(null);
  // Dernière touche Tab : elle pose le focus là où l'enfant le veut, et le curseur ne le lui reprend pas.
  const isTabKeyRef = useRef(false);

  const { puzzle, phase } = game;
  const isPlaying = phase === 'placing';
  const isFull = isBoardFull(game);
  const reserve = getReservePieces(game);
  const targetIds = getTargetIds(game);
  const currentTarget =
    cursor !== null && targetIds.includes(cursor) ? cursor : getDefaultTarget(game);
  const nextLevel = controls.summary.allLevels[level.globalIndex + 1] ?? null;
  const guideStep = getGuideStep(game);

  const announce = (text: string) => {
    setAnnouncement((previous) => ({ id: (previous?.id ?? 0) + 1, text }));
  };

  /** Coup joué : nouvel état, et le plateau plein s'annonce (la cloche peut sonner). */
  const applyMove = (next: LogicGridGameState): boolean => {
    if (next === game) return false;
    setGame(next);
    stopWiggle();
    if (isBoardFull(next) && !isFull) announce(ANNOUNCEMENTS.ready);
    return true;
  };

  /** Après une pièce posée depuis la réserve, le curseur passe à la suivante, ou à la cloche. */
  const advanceCursor = (next: LogicGridGameState) => {
    setCursor(getDefaultTarget(next));
  };

  /** Victoire : enregistrée dès la vérification réussie du dernier puzzle, une seule fois. */
  const recordWin = (solved: LogicGridGameState) => {
    const won = advancePuzzle(solved);
    const isPerfect = isPerfectWin(won);
    setHasCrown(isPerfect || level.isPerfect);
    const startedAt = startedAtRef.current;
    const timeSeconds = startedAt === null ? 0 : Math.round((readClock() - startedAt) / 1000);
    void controls.recordVictory({ moves: solved.moves, timeSeconds, isPerfect });
  };

  /**
   * La cloche : vérifie un plateau plein. Ses sons partent d'ici, pendant le geste : le contexte audio
   * ne se débloque qu'ainsi (FEAT-21 §4). OK à la télécommande passe par le même clic.
   */
  const ring = () => {
    if (!isPlaying) return;
    if (!isFull) {
      // Des pièces attendent : elles remuent dans la réserve, sans rien compter.
      wiggle(reserve);
      return;
    }
    player.playBeats(['bell'], JINGLE_DELAY_MS);
    const next = checkBoard(game);
    setGame(next);
    setSelected(null);
    stopWiggle();
    if (next.phase === 'success') {
      stopPulse();
      announce(ANNOUNCEMENTS.wellDone);
      if (advancePuzzle(next).phase === 'won') recordWin(next);
      return;
    }
    const clue = next.puzzle.clues[next.unmetClueIndex ?? -1];
    if (!clue) return;
    pulseClue(next.unmetClueIndex ?? -1);
    if (getHelpStage(next) === 2) wiggle(getMovableCluePieces(next, clue));
    const helped = next.helpedPiece;
    if (helped) glow(helped);
    announce(
      formatMissAnnouncement(clue, helped, helped ? next.puzzle.solution.indexOf(helped) : -1),
    );
  };

  /** Pose la pièce choisie sur une case (échange avec la pièce qui s'y trouve). */
  const placeOn = (piece: PieceId, cell: number) => {
    const fromReserve = !game.board.includes(piece);
    const next = movePiece(game, piece, cell);
    if (!applyMove(next)) return;
    setSelected(null);
    if (fromReserve) advanceCursor(next);
    else setCursor(cellTarget(cell));
  };

  /** Tap (ou OK) sur une pièce de la réserve : la choisir, ou l'échanger avec la pièce choisie. */
  const tapReservePiece = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const piece = readPiece(event.currentTarget);
    if (drag.isDragClick(event) || !isPlaying || piece === null) return;
    const selectedCell = selected === null ? -1 : game.board.indexOf(selected);
    if (selectedCell >= 0) {
      // Pièce de la grille choisie : celle de la réserve prend sa case, elle retourne à la réserve.
      placeOn(piece, selectedCell);
      return;
    }
    setSelected((current) => (current === piece ? null : piece));
    setCursor(reserveTarget(piece));
  };

  /** Tap (ou OK) sur une case : y poser la pièce choisie, ou choisir la pièce qui s'y trouve. */
  const tapCell = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const cell = readCell(event.currentTarget);
    if (drag.isDragClick(event) || !isPlaying || cell === null) return;
    const occupant = game.board[cell] ?? null;
    if (selected !== null && selected !== occupant) {
      placeOn(selected, cell);
      return;
    }
    if (occupant !== null && isPieceMovable(game, occupant)) {
      setSelected((current) => (current === occupant ? null : occupant));
    } else if (occupant === null && selected === null) {
      // Case vide sans pièce choisie : les pièces qui attendent remuent pour montrer où commencer.
      wiggle(reserve);
      announce(ANNOUNCEMENTS.pickFirst);
    }
    setCursor(cellTarget(cell));
  };

  /** Pièce lâchée : sur une case, elle s'y pose ; sur la réserve, elle y retourne ; ailleurs, rien. */
  const releasePiece = (uid: string, point: Point2D) => {
    if (!isPieceId(uid)) return;
    const tray = trayRef.current?.getBoundingClientRect();
    if (tray && isPointInRect(point, tray)) {
      if (applyMove(returnPiece(game, uid))) setCursor(reserveTarget(uid));
      return;
    }
    const zones = cellBoxes.entries().map(([id, element]) => ({
      id,
      rect: element.getBoundingClientRect(),
    }));
    const cell = findDropZone(point, zones, DROP_TOLERANCE_PX);
    if (cell !== null) placeOn(uid, cell);
  };

  const drag = useBearDrag({
    isEnabled: isPlaying,
    onDragStart: (uid) => {
      setSelected(null);
      if (isPieceId(uid)) {
        const cell = game.board.indexOf(uid);
        setCursor(cell >= 0 ? cellTarget(cell) : reserveTarget(uid));
      }
    },
    onRelease: releasePiece,
  });

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const piece = readPiece(event.currentTarget);
    if (piece !== null && isPieceMovable(game, piece)) drag.startGesture(piece, event);
  };

  /** Une nouvelle partie : nouveaux puzzles. */
  const restart = () => {
    startedAtRef.current = readClock();
    setGame(createLogicGridGame(config));
    setRound((value) => value + 1);
    setSelected(null);
    setCursor(null);
    setIsEndOpen(false);
    setHasCrown(false);
    stopPulse();
    stopWiggle();
  };

  const back = useGridNavigation({
    scopeId: 'logic-grid-back',
    rows: 1,
    cols: 1,
    isActive: isBackZone,
    onBack: controls.exitToMap,
    onEdge: (direction) => {
      if (direction === 'down') setIsBackZone(false);
    },
  });

  /** Flèche : la cible la plus proche dans cette direction ; tout en haut, le bouton Retour. */
  const moveCursor = (direction: Direction) => {
    const from = targets.get(currentTarget);
    if (!from) return;
    const candidates: NavigationTarget[] = targets
      .entries()
      .filter(([id]) => id !== currentTarget && targetIds.includes(id))
      .map(([id, element]) => ({ id, ...getCenter(element) }));
    const next = findNearestTarget(getCenter(from), candidates, direction);
    if (next !== null) setCursor(next as TargetId);
    else if (direction === 'up') setIsBackZone(true);
  };

  const { isFocusVisible, inputMode } = useNavigationScope({
    scopeId: 'logic-grid-board',
    isActive: !isBackZone && !isEndOpen,
    onDirection: moveCursor,
    // OK : le même clic qu'un tap sur la cible du curseur.
    onSelect: () => {
      targets.get(currentTarget)?.click();
    },
    onBack: controls.exitToMap,
    getFocusedElement: () => targets.get(currentTarget),
    ownsElement: (element) => targets.values().some((owned) => owned.contains(element)),
  });
  const isDpad = inputMode === 'dpad';
  const isCursor = (id: TargetId) => isFocusVisible && currentTarget === id;

  /** Focus DOM (Tab, clic) sur une cible : elle devient le curseur et la zone du plateau s'active. */
  const focusTarget = (event: { currentTarget: HTMLElement }) => {
    setIsBackZone(false);
    const element = event.currentTarget;
    const found = targets.entries().find(([, owned]) => owned === element);
    if (found) setCursor(found[0]);
  };

  // Curseur → focus DOM (annonces TalkBack), au D-Pad uniquement (FEAT-04 §5).
  const focusCursor = useEffectEvent(() => {
    const element = targets.get(currentTarget);
    if (element && element !== document.activeElement) element.focus({ preventScroll: true });
  });

  useEffect(() => {
    if (isFocusVisible && !isTabKeyRef.current) focusCursor();
  }, [isFocusVisible, currentTarget, round, game.puzzleIndex]);

  // Écouteur en capture, avant le moteur D-Pad sur `window` et avant le focus que déplace Tab.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      isTabKeyRef.current = event.key === 'Tab';
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, []);

  useEffect(() => {
    startedAtRef.current ??= readClock();
  }, []);

  const finishPuzzle = useEffectEvent(() => {
    const next = advancePuzzle(game);
    setGame(next);
    setCursor(null);
    if (next.phase === 'won') {
      player.playJingle('star');
      announce(ANNOUNCEMENTS.starWon);
    }
  });

  const celebrate = useEffectEvent(() => {
    player.playJingle('round');
  });

  // Puzzle réussi : le jingle après la cloche, puis le puzzle suivant (ou l'étoile).
  useEffect(() => {
    if (phase !== 'success') return;
    const jingle = setTimeout(celebrate, JINGLE_DELAY_MS);
    const timer = setTimeout(finishPuzzle, SUCCESS_MS);
    return () => {
      clearTimeout(jingle);
      clearTimeout(timer);
    };
  }, [phase, game.puzzleIndex]);

  // Étoile gagnée : l'enfant voit le dernier puzzle réussi, puis la fin de partie s'ouvre.
  useEffect(() => {
    if (phase !== 'won') return;
    const timer = setTimeout(() => {
      setIsEndOpen(true);
    }, END_SCREEN_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [phase]);

  // Main fantôme, au doigt seulement : de la pièce du premier pas à sa case, mesurées après la mise
  // en page et à chaque rotation de l'écran ; rien à montrer si rien n'est mesurable (jsdom).
  const isHandWanted = guideStep !== null && !isDpad && drag.heldUid === null && selected === null;
  const measureGesture = useEffectEvent(() => {
    const piece = guideStep ? targets.get(reserveTarget(guideStep.piece)) : null;
    const cell = guideStep ? cellBoxes.get(guideStep.cell) : null;
    const from = piece?.getBoundingClientRect();
    const to = cell?.getBoundingClientRect();
    if (!from || !to || from.width === 0 || to.width === 0) {
      setGesturePath(null);
      return;
    }
    setGesturePath({ from: getCenter(piece as Element), to: getCenter(cell as Element) });
  });

  useEffect(() => {
    if (!isHandWanted) return;
    const frame = requestAnimationFrame(measureGesture);
    window.addEventListener('resize', measureGesture);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measureGesture);
    };
  }, [isHandWanted, round]);

  const getClueState = (index: number): ClueCardState => {
    if (guideStep?.clueIndices.includes(index)) return 'guide';
    if (pulsingClue === index) return 'unmet';
    return game.unmetClueIndex === index && isPlaying ? 'reminder' : 'idle';
  };

  const isWiggling = (piece: PieceId) => wiggling?.includes(piece) === true;
  const isCelebrating = phase === 'success' || phase === 'won';
  const puzzleCount = game.puzzles.length;

  return (
    <AppShell
      isTextless
      title={formatBoardTitle(level.starNumber)}
      onBack={controls.exitToMap}
      isBackFocused={back.isItemFocused(0)}
      backButtonRef={back.getItemRef(0)}
      onBackFocus={() => {
        setIsBackZone(true);
      }}
      profile={
        puzzleCount > 1 ? (
          <PatternProgressDots
            rounds={puzzleCount}
            roundIndex={game.puzzleIndex}
            isRoundSolved={!isPlaying}
          />
        ) : undefined
      }
    >
      <MotionConfig reducedMotion="user">
        {/* Rogné : une pièce glissée jusqu'au bord de l'écran ne fait pas défiler le contenu. */}
        <div
          key={`${String(round)}-${String(game.puzzleIndex)}`}
          className="relative flex min-h-0 flex-1 flex-col items-center gap-2 overflow-hidden p-2 md:gap-3 landscape:flex-row landscape:items-stretch landscape:gap-4"
        >
          <ul
            aria-label="Cartes"
            data-clue-count={puzzle.clues.length}
            className="grid w-full max-w-[36rem] shrink-0 grid-cols-3 content-start gap-2 md:gap-3 landscape:w-auto landscape:grid-cols-2 landscape:content-center"
          >
            {puzzle.clues.map((clue, index) => (
              <li
                key={index}
                data-clue-index={index}
                className="min-w-0 landscape:w-[clamp(6.25rem,19vmin,10.5rem)] tv:landscape:w-[clamp(7.5rem,24vmin,13rem)]"
              >
                <ClueCard clue={clue} state={getClueState(index)} pulseKey={game.checkTick} />
              </li>
            ))}
          </ul>

          {/* Conteneur de taille : la grille prend le plus grand carré qui reste. */}
          <div className="@container-size relative flex min-h-0 w-full min-w-0 flex-1 items-center justify-center">
            <div
              role="group"
              aria-label="Grille"
              data-helped={game.helpedPiece ?? undefined}
              className="grid size-[min(100cqw,100cqh)] grid-cols-3 grid-rows-3 gap-[2.5%] rounded-3xl bg-slate-900 p-[2.5%] ring-2 ring-slate-700"
            >
              {game.board.map((piece, cell) => (
                <div
                  key={cell}
                  ref={cellBoxes.getRef(cell)}
                  data-cell-box={cell}
                  className="relative min-h-0 min-w-0"
                >
                  <GridCell
                    cell={cell}
                    piece={piece}
                    isLocked={isCellLocked(game, cell)}
                    isFocused={isCursor(cellTarget(cell))}
                    isSelected={piece !== null && piece === selected}
                    isGuideTarget={guideStep?.cell === cell && isDpad}
                    isWiggling={piece !== null && isWiggling(piece)}
                    isGlowing={piece !== null && piece === glowingPiece}
                    isCelebrating={isCelebrating}
                    preview={isCursor(cellTarget(cell)) && piece === null ? selected : null}
                    canDrag={isPlaying}
                    heldPiece={drag.heldUid}
                    targetRef={targets.getRef(cellTarget(cell))}
                    onClick={tapCell}
                    onFocus={focusTarget}
                    onPointerDown={startDrag}
                    onPointerMove={drag.moveGesture}
                    onPointerUp={drag.endGesture}
                    onPointerCancel={drag.cancelGesture}
                    onLostPointerCapture={drag.loseGesture}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-center gap-3 md:gap-4 landscape:flex-col">
            <div
              ref={trayRef}
              role="group"
              aria-label="Réserve"
              data-reserve-count={reserve.length}
              className={TRAY_CLASSES}
              style={
                {
                  '--tray-cols': String(Math.min(puzzle.freePieces.length, TRAY_MAX_COLUMNS)),
                  '--tray-cols-landscape': String(
                    getLandscapeTrayColumns(puzzle.freePieces.length),
                  ),
                } as CSSProperties
              }
            >
              {puzzle.freePieces.map((piece) => {
                const isWaiting = reserve.includes(piece);
                return (
                  <div key={piece} className="relative size-(--slot)">
                    {/* Place de la pièce dans la réserve : un contour quand elle est sur la grille. */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-[8%] rounded-xl border-2 border-dashed border-slate-700"
                    />
                    {isWaiting ? (
                      <ReservePiece
                        piece={piece}
                        isFocused={isCursor(reserveTarget(piece))}
                        isSelected={piece === selected}
                        isGuided={guideStep?.piece === piece && isDpad}
                        isWiggling={isWiggling(piece)}
                        isHeld={drag.heldUid === piece}
                        canDrag={isPlaying}
                        targetRef={targets.getRef(reserveTarget(piece))}
                        onClick={tapReservePiece}
                        onFocus={focusTarget}
                        onPointerDown={startDrag}
                        onPointerMove={drag.moveGesture}
                        onPointerUp={drag.endGesture}
                        onPointerCancel={drag.cancelGesture}
                        onLostPointerCapture={drag.loseGesture}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
            <BellButton
              targetRef={targets.getRef('bell')}
              isReady={isFull && isPlaying}
              isFocused={isCursor('bell')}
              onClick={ring}
              onFocus={focusTarget}
            />
          </div>

          {isHandWanted && gesturePath ? <GuideHint path={gesturePath} /> : null}
        </div>
      </MotionConfig>

      {/* Région toujours présente : ses messages (plateau plein, vérification, réussite) sont vocalisés. */}
      <p role="status" className="sr-only">
        {announcement ? <span key={announcement.id}>{announcement.text}</span> : null}
      </p>

      <LogicGridEndScreen
        isOpen={isEndOpen}
        starNumber={level.starNumber}
        hasCrown={hasCrown || level.isPerfect}
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

type PieceButtonHandler = (event: ReactPointerEvent<HTMLButtonElement>) => void;

interface PieceHandlers {
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onFocus: (event: { currentTarget: HTMLElement }) => void;
  onPointerDown: PieceButtonHandler;
  onPointerMove: PieceButtonHandler;
  onPointerUp: PieceButtonHandler;
  onPointerCancel: PieceButtonHandler;
  onLostPointerCapture: PieceButtonHandler;
}

interface GridCellProps extends PieceHandlers {
  cell: number;
  piece: PieceId | null;
  isLocked: boolean;
  isFocused: boolean;
  isSelected: boolean;
  /** Télécommande, étoile guidée : la case du premier pas */
  isGuideTarget: boolean;
  isWiggling: boolean;
  /** Pièce que l'aide vient de placer */
  isGlowing: boolean;
  isCelebrating: boolean;
  /** Télécommande : la pièce choisie, montrée en transparence sur la case vide du curseur */
  preview: PieceId | null;
  canDrag: boolean;
  /** Pièce qui suit le doigt : elle passe devant tout le plateau */
  heldPiece: string | null;
  targetRef: Ref<HTMLButtonElement>;
}

const CELL_CLASSES =
  'relative flex size-full items-center justify-center rounded-[18%] p-[13%] select-none';

/**
 * Case de la grille. Verrouillée : une image (pièce posée d'avance, punaise), que la télécommande saute.
 * Vide : un bouton où poser la pièce choisie. Occupée par une pièce de l'enfant : un bouton qui se
 * glisse ou se choisit. `touch-action: none` : un doigt posé sur une pièce la fait glisser.
 */
function GridCell({
  cell,
  piece,
  isLocked,
  isFocused,
  isSelected,
  isGuideTarget,
  isWiggling,
  isGlowing,
  isCelebrating,
  preview,
  canDrag,
  heldPiece,
  targetRef,
  ...handlers
}: GridCellProps) {
  const celebration = isCelebrating
    ? {
        animate: { scale: [1, 1.18, 1], y: [0, -6, 0] },
        transition: { duration: 0.55, delay: (cell % 3) * 0.06 + Math.floor(cell / 3) * 0.08 },
      }
    : null;

  if (isLocked && piece !== null) {
    return (
      <div
        role="img"
        aria-label={getCellLabel(cell, piece, true)}
        data-cell={cell}
        data-piece={piece}
        data-locked="true"
        data-glowing={isGlowing || undefined}
        className={cn(
          CELL_CLASSES,
          'bg-slate-700/80',
          isGlowing && 'shadow-lg ring-4 shadow-emerald-400/40 ring-emerald-300',
        )}
      >
        <motion.span
          className="block size-full"
          initial={isGlowing ? { scale: 0.5 } : false}
          animate={celebration?.animate ?? { scale: 1 }}
          transition={celebration?.transition ?? SETTLE_TRANSITION}
        >
          <PieceShapeIcon piece={piece} />
        </motion.span>
        <Pin
          aria-hidden="true"
          className="absolute top-[6%] right-[6%] size-[24%] rotate-45 fill-slate-300 text-slate-900"
          strokeWidth={1.5}
        />
      </div>
    );
  }

  let animation: TargetAndTransition = { rotate: 0, scale: 1, y: 0 };
  if (celebration) animation = celebration.animate;
  else if (isWiggling) animation = WIGGLE_ANIMATION;
  else if (heldPiece === piece && piece !== null) animation = { rotate: 0, scale: 1.12, y: 0 };

  return (
    <button
      ref={targetRef}
      type="button"
      aria-label={getCellLabel(cell, piece, false)}
      aria-pressed={piece === null ? undefined : isSelected}
      data-cell={cell}
      data-piece={piece ?? undefined}
      data-focused={isFocused || undefined}
      data-selected={isSelected || undefined}
      data-wiggling={isWiggling || undefined}
      data-guide-target={isGuideTarget || undefined}
      data-dragging={(piece !== null && heldPiece === piece) || undefined}
      className={cn(
        CELL_CLASSES,
        'cursor-pointer bg-slate-800',
        piece === null ? 'ring-2 ring-slate-700 ring-inset' : 'touch-none',
        piece !== null && canDrag && 'cursor-grab active:cursor-grabbing',
        piece !== null && heldPiece === piece && 'z-30',
        // Relâchée, la pièce revient avec un petit ressort (glissement : voir `useBearDrag`).
        'motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        FOCUS_VISIBLE_CLASSES,
        isSelected && SELECTED_CLASSES,
        // Anneau fixe : une pulsation d'opacité ferait pâlir la pièce elle-même.
        isGuideTarget && !isSelected && 'ring-4 ring-sky-300',
        isWiggling && 'motion-reduce:ring-2 motion-reduce:ring-sky-300/70',
        isFocused && FOCUSED_CLASSES,
      )}
      {...handlers}
    >
      {piece !== null ? (
        <motion.span
          key={piece}
          className="block size-full drop-shadow-[0_4px_3px_rgb(0_0_0/0.45)]"
          initial={{ scale: 0.6 }}
          animate={animation}
          transition={
            celebration?.transition ?? (isWiggling ? WIGGLE_TRANSITION : SETTLE_TRANSITION)
          }
        >
          <PieceShapeIcon piece={piece} />
        </motion.span>
      ) : null}
      {piece === null && preview !== null ? (
        <span aria-hidden="true" data-preview={preview} className="block size-full opacity-45">
          <PieceShapeIcon piece={preview} />
        </span>
      ) : null}
    </button>
  );
}

interface ReservePieceProps extends PieceHandlers {
  piece: PieceId;
  isFocused: boolean;
  isSelected: boolean;
  /** Télécommande, étoile guidée : la pièce du premier pas */
  isGuided: boolean;
  isWiggling: boolean;
  /** Pièce tenue : `useBearDrag` écrit sa position sur le bouton, hors du rendu */
  isHeld: boolean;
  canDrag: boolean;
  targetRef: Ref<HTMLButtonElement>;
}

/** Pièce de la réserve, dans sa case. `touch-action: none` : un doigt posé dessus la fait glisser. */
function ReservePiece({
  piece,
  isFocused,
  isSelected,
  isGuided,
  isWiggling,
  isHeld,
  canDrag,
  targetRef,
  ...handlers
}: ReservePieceProps) {
  let animation: TargetAndTransition = { rotate: 0, scale: 1 };
  if (isHeld) animation = { rotate: 0, scale: 1.15 };
  else if (isWiggling) animation = WIGGLE_ANIMATION;

  return (
    <button
      ref={targetRef}
      type="button"
      aria-label={getPieceLabel(piece)}
      aria-pressed={isSelected}
      data-piece={piece}
      data-reserve-piece="true"
      data-focused={isFocused || undefined}
      data-selected={isSelected || undefined}
      data-wiggling={isWiggling || undefined}
      data-dragging={isHeld || undefined}
      data-guided={isGuided || undefined}
      className={cn(
        'relative block size-full touch-none rounded-2xl p-[8%] select-none',
        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        isHeld ? 'z-30' : isFocused && 'z-10',
        'motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        FOCUS_VISIBLE_CLASSES,
        isSelected && SELECTED_CLASSES,
        isGuided && !isSelected && 'ring-4 ring-sky-300',
        isWiggling && 'motion-reduce:ring-2 motion-reduce:ring-sky-300/70',
        isFocused && FOCUSED_CLASSES,
      )}
      {...handlers}
    >
      <motion.span
        className="block size-full drop-shadow-[0_4px_3px_rgb(0_0_0/0.45)]"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, ...animation }}
        transition={isWiggling && !isHeld ? WIGGLE_TRANSITION : SETTLE_TRANSITION}
      >
        <PieceShapeIcon piece={piece} />
      </motion.span>
    </button>
  );
}

interface BellButtonProps {
  targetRef: Ref<HTMLButtonElement>;
  /** Plateau plein : la cloche peut vérifier */
  isReady: boolean;
  isFocused: boolean;
  onClick: () => void;
  onFocus: (event: { currentTarget: HTMLElement }) => void;
}

/**
 * La cloche qui vérifie tout le plateau d'un coup. Toujours dans le parcours de la télécommande ;
 * tant qu'une pièce attend, elle reste éteinte et ne vérifie rien (`aria-disabled`).
 */
function BellButton({ targetRef, isReady, isFocused, onClick, onFocus }: BellButtonProps) {
  return (
    <motion.button
      ref={targetRef}
      type="button"
      aria-label="Vérifier"
      aria-disabled={!isReady}
      data-bell-ready={isReady || undefined}
      data-focused={isFocused || undefined}
      className={cn(
        'flex size-[clamp(3.5rem,14vmin,6.5rem)] shrink-0 cursor-pointer items-center justify-center rounded-full',
        isReady
          ? 'bg-amber-300 text-slate-950 shadow-lg shadow-amber-400/40'
          : 'bg-slate-800 text-slate-500',
        FOCUS_VISIBLE_CLASSES,
        isFocused && FOCUSED_CLASSES,
      )}
      animate={isReady ? { rotate: [0, -14, 12, -8, 0] } : { rotate: 0 }}
      transition={
        isReady ? { duration: 0.8, repeat: Infinity, repeatDelay: 1.6 } : { duration: 0.2 }
      }
      onClick={onClick}
      onFocus={onFocus}
    >
      <BellRing aria-hidden="true" className="size-[55%]" strokeWidth={2.4} />
    </motion.button>
  );
}

/**
 * Main fantôme : elle va en boucle de la pièce du premier pas à sa case, et ne capte aucun doigt. Le
 * point animé est le bout de son index. Si le système réduit les animations, elle reste sur la pièce à
 * prendre : seule son opacité varie.
 */
function GuideHint({ path: { from, to: end } }: { path: GesturePath }) {
  const to = useReducedMotion() === true ? from : end;

  return (
    <motion.div
      aria-hidden="true"
      data-guide-hand="true"
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
