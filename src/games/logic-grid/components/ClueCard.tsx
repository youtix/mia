'use client';

import { cn } from '@/lib/cn';
import { motion } from 'framer-motion';
import { getSubjectPieces } from '../clues';
import { CELL_COUNT, cellBit, colOf, getPieceColor, getPieceShape, rowOf, zoneMask } from '../grid';
import { getClueLabel } from '../labels';
import type { Clue, ClueSubject, PieceId } from '../types';
import { CROSS_COLOR, PIECE_FILLS, PIECE_OUTLINE, SHAPE_PATHS } from './art';

/**
 * État d'une carte : au repos, désignée par la cloche (`unmet`, elle pulse), rappel discret de la
 * dernière carte désignée (`reminder`), ou lue par la main fantôme (`guide`).
 */
export type ClueCardState = 'idle' | 'unmet' | 'reminder' | 'guide';

export interface ClueCardProps {
  clue: Clue;
  state?: ClueCardState;
  /** Change à chaque vérification ratée : relance la pulsation, même sur la même carte */
  pulseKey?: number;
  className?: string;
}

/** Case d'une mini-grille : fond ardoise, comme les cases du plateau. */
const CELL_FILL = '#334155';
const CELL_STROKE = '#64748b';
/** Zone d'une carte : éclairée comme une case où poser la pièce. */
const ZONE_FILL = '#e0f2fe';

const MINI_CELL = 16;
const MINI_STEP = 19;
const MINI_LEFT = 58;
const MINI_TOP = 13;

/** Pièce nommée par une carte de place ou « se touchent » : toujours à gauche, au même endroit. */
const SUBJECT_X = 6;
const SUBJECT_Y = 20;
const SUBJECT_SIZE = 40;

/** Pièce dans le dessin d'une carte, `size` pixels de côté, coin en (`x`, `y`). */
function Glyph({ piece, x, y, size }: { piece: PieceId; x: number; y: number; size: number }) {
  return (
    <g
      data-glyph={piece}
      transform={`translate(${String(x)} ${String(y)}) scale(${String(size / 100)})`}
    >
      <path
        d={SHAPE_PATHS[getPieceShape(piece)]}
        fill={PIECE_FILLS[getPieceColor(piece)]}
        stroke={PIECE_OUTLINE}
        strokeWidth={7}
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Croix d'une place exclue, centrée en (`cx`, `cy`), de demi-largeur `half`. */
function Cross({ cx, cy, half }: { cx: number; cy: number; half: number }) {
  const path = `M${String(cx - half)} ${String(cy - half)}L${String(cx + half)} ${String(cy + half)}M${String(cx + half)} ${String(cy - half)}L${String(cx - half)} ${String(cy + half)}`;
  return (
    <g data-cross="true" strokeLinecap="round">
      <path d={path} stroke={PIECE_OUTLINE} strokeWidth={half * 0.7} />
      <path d={path} stroke={CROSS_COLOR} strokeWidth={half * 0.38} />
    </g>
  );
}

/** Sujet d'une carte de place : la pièce, ou les trois pièces de sa famille dans un cadre. */
function SubjectDrawing({ subject }: { subject: ClueSubject }) {
  if (subject.kind === 'piece') {
    return <Glyph piece={subject.piece} x={SUBJECT_X} y={SUBJECT_Y} size={SUBJECT_SIZE} />;
  }
  return (
    <g data-family={subject.kind === 'shape' ? subject.shape : subject.color}>
      <rect
        x={9}
        y={5}
        width={34}
        height={70}
        rx={9}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth={2.5}
        strokeDasharray="5 4"
      />
      {getSubjectPieces(subject).map((piece, index) => (
        <Glyph key={piece} piece={piece} x={16} y={9 + index * 21} size={20} />
      ))}
    </g>
  );
}

/** Mini-grille 3 × 3 : la zone de la carte éclairée, ou barrée case par case. */
function MiniGrid({ zone, isNegated }: { zone: number; isNegated: boolean }) {
  return (
    <g data-mini-grid="true">
      {Array.from({ length: CELL_COUNT }, (_, cell) => {
        const x = MINI_LEFT + colOf(cell) * MINI_STEP;
        const y = MINI_TOP + rowOf(cell) * MINI_STEP;
        const isInZone = (zone & cellBit(cell)) !== 0;
        return (
          <g key={cell} data-zone-cell={isInZone || undefined}>
            <rect
              x={x}
              y={y}
              width={MINI_CELL}
              height={MINI_CELL}
              rx={3}
              fill={isInZone && !isNegated ? ZONE_FILL : CELL_FILL}
              stroke={CELL_STROKE}
              strokeWidth={1.5}
            />
            {isInZone && isNegated ? (
              <Cross cx={x + MINI_CELL / 2} cy={y + MINI_CELL / 2} half={5.5} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

/** Case d'une carte « collées » ou « se touchent », du même ardoise que le plateau, ou éclairée. */
function SlotFrame({
  x,
  y,
  size,
  isLit = false,
}: {
  x: number;
  y: number;
  size: number;
  isLit?: boolean;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={size}
      height={size}
      rx={5}
      fill={isLit ? ZONE_FILL : CELL_FILL}
      stroke={CELL_STROKE}
      strokeWidth={2}
    />
  );
}

/** Deux pièces collées, comme elles seront posées : côte à côte ou l'une sous l'autre. */
function PairDrawing({ clue }: { clue: Clue & { kind: 'pair' } }) {
  const size = 38;
  const [firstX, firstY, secondX, secondY] =
    clue.direction === 'right' ? [22, 21, 60, 21] : [41, 2, 41, 40];
  return (
    <g data-direction={clue.direction}>
      <SlotFrame x={firstX} y={firstY} size={size} />
      <SlotFrame x={secondX} y={secondY} size={size} />
      <Glyph piece={clue.first} x={firstX + 4} y={firstY + 4} size={size - 8} />
      <Glyph piece={clue.second} x={secondX + 4} y={secondY + 4} size={size - 8} />
    </g>
  );
}

/** Places autour de la pièce du centre (en haut, à gauche, à droite, en bas). */
const AROUND = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
] as const;

/** Croix de cases de la carte « se touchent », à droite de la pièce nommée. */
const AROUND_SLOT = 20;
const AROUND_STEP = 22;
const AROUND_LEFT = 53;
const AROUND_TOP = 8;

/**
 * Pièce qui en touche une autre, dessinée comme une carte de place : à gauche la pièce nommée ; à
 * droite l'autre pièce, au centre de ses quatre côtés, éclairés (la pièce nommée est sur l'un d'eux)
 * ou barrés (elle n'est sur aucun). Les places barrées sont vides : aucune croix ne cache une pièce.
 * Les coins ne sont pas dessinés : ils ne touchent pas.
 */
function NextDrawing({ clue }: { clue: Clue & { kind: 'next' } }) {
  const centerX = AROUND_LEFT + AROUND_STEP;
  const centerY = AROUND_TOP + AROUND_STEP;
  return (
    <g data-negated={clue.isNegated || undefined}>
      <Glyph piece={clue.second} x={SUBJECT_X} y={SUBJECT_Y} size={SUBJECT_SIZE} />
      <SlotFrame x={centerX} y={centerY} size={AROUND_SLOT} />
      {/* Le tracé d'une forme a sa propre marge : la pièce peut remplir sa case. */}
      <Glyph piece={clue.first} x={centerX + 1} y={centerY + 1} size={AROUND_SLOT - 2} />
      {AROUND.map(([dx, dy]) => {
        const x = centerX + dx * AROUND_STEP;
        const y = centerY + dy * AROUND_STEP;
        return (
          <g key={`${String(dx)}:${String(dy)}`} data-around="true">
            <SlotFrame x={x} y={y} size={AROUND_SLOT} isLit={!clue.isNegated} />
            {clue.isNegated ? (
              <Cross cx={x + AROUND_SLOT / 2} cy={y + AROUND_SLOT / 2} half={6.5} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function ClueDrawing({ clue }: { clue: Clue }) {
  switch (clue.kind) {
    case 'place':
      return (
        <>
          <SubjectDrawing subject={clue.subject} />
          <MiniGrid zone={zoneMask(clue.zone)} isNegated={clue.isNegated} />
        </>
      );
    case 'pair':
      return <PairDrawing clue={clue} />;
    case 'next':
      return <NextDrawing clue={clue} />;
  }
}

const STATE_CLASSES: Readonly<Record<ClueCardState, string>> = {
  idle: 'ring-2 ring-slate-700',
  unmet: 'z-10 ring-4 ring-amber-300 shadow-lg shadow-amber-400/30',
  reminder: 'ring-4 ring-amber-300/60',
  guide: 'ring-4 ring-sky-300 shadow-lg shadow-sky-400/30',
};

/**
 * Carte d'indice, sans aucun mot : une image qui dit où va une pièce (ou toute une famille). Les
 * lecteurs d'écran en lisent la phrase (`getClueLabel`). Désignée par la cloche, elle pulse ; la
 * réduction des animations ne garde que son anneau.
 */
export function ClueCard({ clue, state = 'idle', pulseKey = 0, className }: ClueCardProps) {
  const isPulsing = state === 'unmet' || state === 'guide';
  return (
    <motion.div
      // Nouvelle vérification ratée : la carte repart de zéro, la pulsation recommence.
      key={state === 'unmet' ? `unmet-${String(pulseKey)}` : state}
      role="img"
      aria-label={getClueLabel(clue)}
      data-clue-state={state}
      className={cn(
        'relative flex aspect-[3/2] items-center justify-center rounded-2xl bg-slate-800 p-[4%]',
        STATE_CLASSES[state],
        className,
      )}
      animate={isPulsing ? { scale: [1, 1.07, 1] } : { scale: 1 }}
      transition={
        isPulsing
          ? { duration: 0.9, ease: 'easeInOut', repeat: state === 'guide' ? Infinity : 2 }
          : { duration: 0.2 }
      }
    >
      <svg aria-hidden="true" viewBox="0 0 120 80" className="block size-full overflow-visible">
        <ClueDrawing clue={clue} />
      </svg>
    </motion.div>
  );
}
