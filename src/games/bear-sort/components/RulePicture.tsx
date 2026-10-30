import { cn } from '@/lib/cn';
import { getRuleLabel } from '../labels';
import type {
  BearColor,
  BearSize,
  BearSortRule,
  BearTraits,
  ForbiddenBears,
  SortFeature,
} from '../types';
import {
  ART_STYLE_PRECEDENCE,
  getArtPalette,
  INK,
  PULSE_CLASSES,
  PULSE_KEYFRAMES,
  PULSE_STYLE_ID,
} from './art-tokens';
import { BearDrawing } from './BearFigure';
import { NoSignShape } from './NoBadge';

/** Couleur d'un ours gris dessiné par `BearDrawing` : sans effet, la couleur y est estompée. */
const ANY_COLOR: BearColor = 'blue';

const OTHER_COLOR: Readonly<Record<BearColor, BearColor>> = { blue: 'yellow', yellow: 'blue' };

/** Boîte de gauche par défaut, hors d'un plateau. */
const DEFAULT_LEFT_BOX: BearTraits = { color: 'blue', size: 'small' };

interface PlacedBearProps {
  color: BearColor;
  size: BearSize;
  fadedFeature?: SortFeature;
  /** Coin haut gauche et côté du carré de l'ours, dans le repère de la carte */
  x: number;
  y: number;
  side: number;
}

/** Un ours dans la carte : son dessin garde son repère 100 × 100 et son ancrage en bas au centre. */
function PlacedBear({ color, size, fadedFeature, x, y, side }: PlacedBearProps) {
  return (
    <svg
      x={x}
      y={y}
      width={side}
      height={side}
      viewBox="0 0 100 100"
      data-rule-bear={`${fadedFeature === 'color' ? 'grey' : color}-${size}`}
    >
      <BearDrawing color={color} size={size} fadedFeature={fadedFeature} />
    </svg>
  );
}

/** Goutte de peinture, pointe en haut, dans un repère 60 × 84. */
function PaintDrop({ color, x }: { color: BearColor; x: number }) {
  const palette = getArtPalette(color, null);
  return (
    <g
      transform={`translate(${String(x)} 8)`}
      data-rule-drop={color}
      stroke={palette.outline}
      strokeWidth={3.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M30 2C30 2 58 34 58 54A28 28 0 0 1 2 54C2 34 30 2 30 2Z" fill={palette.body} />
      <path
        d="M13.5 54A16.5 16.5 0 0 0 24 69.5"
        fill="none"
        stroke={palette.light}
        strokeWidth={5}
      />
    </g>
  );
}

/** « Ranger par couleur » : deux gouttes de peinture, une bleue et une jaune, côté de leur boîte. */
function ColorRule({ leftColor }: { leftColor: BearColor }) {
  return (
    <>
      <PaintDrop color={leftColor} x={17} />
      <PaintDrop color={OTHER_COLOR[leftColor]} x={83} />
    </>
  );
}

/** « Ranger par taille » : un petit et un grand ours gris, côte à côte, côté de leur boîte. */
function SizeRule({ leftSize }: { leftSize: BearSize }) {
  return leftSize === 'small' ? (
    <>
      <PlacedBear color={ANY_COLOR} size="small" fadedFeature="color" x={-4} y={7} side={88} />
      <PlacedBear color={ANY_COLOR} size="big" fadedFeature="color" x={62} y={7} side={88} />
    </>
  ) : (
    <>
      <PlacedBear color={ANY_COLOR} size="big" fadedFeature="color" x={10} y={7} side={88} />
      <PlacedBear color={ANY_COLOR} size="small" fadedFeature="color" x={76} y={7} side={88} />
    </>
  );
}

/**
 * L'ours interdit, dans le signe : la barre du signe descend de gauche à droite, les ours se placent
 * surtout en haut à droite (visage dégagé) ; un petit et un grand de part et d'autre de la barre.
 */
function ForbiddenBearsDrawing({ color, size }: ForbiddenBears) {
  if (size === undefined) {
    return (
      <>
        <PlacedBear color={color} size="small" x={40} y={28} side={50} />
        <PlacedBear color={color} size="big" x={70} y={14} side={50} />
      </>
    );
  }
  const placement = size === 'big' ? { x: 52, y: 16, side: 64 } : { x: 54, y: -1, side: 68 };
  return color === undefined ? (
    <PlacedBear color={ANY_COLOR} size={size} fadedFeature="color" {...placement} />
  ) : (
    <PlacedBear color={color} size={size} {...placement} />
  );
}

/** « Tous les ours, sauf… » : l'ours interdit dans le signe « non », neutre et gris. */
function ExceptRule({ forbidden }: { forbidden: ForbiddenBears }) {
  return (
    <>
      <circle cx={80} cy={50} r={43} fill={INK} />
      <ForbiddenBearsDrawing {...forbidden} />
      <g transform="translate(30 0)">
        <NoSignShape />
      </g>
    </>
  );
}

export interface RulePictureProps {
  rule: BearSortRule;
  /** Boîte de gauche : son critère est dessiné à gauche, pour ne pas contredire les boîtes */
  leftBox?: BearTraits;
  /** Attire l'œil (rappel de la règle après un rebond ou une inaction) */
  isPulsing?: boolean;
  className?: string;
}

/**
 * Image de la règle, toujours à l'écran : elle porte seule la consigne quand le son est coupé. Carte
 * arrondie au format 8:5 par défaut ; son dessin garde ses proportions dans n'importe quel parent.
 */
export function RulePicture({
  rule,
  leftBox = DEFAULT_LEFT_BOX,
  isPulsing = false,
  className,
}: RulePictureProps) {
  return (
    <>
      <style href={PULSE_STYLE_ID} precedence={ART_STYLE_PRECEDENCE}>
        {PULSE_KEYFRAMES}
      </style>
      <span
        role="img"
        aria-label={getRuleLabel(rule)}
        data-rule={rule.kind === 'sort' ? rule.feature : 'except'}
        data-pulsing={isPulsing || undefined}
        className={cn(
          'block aspect-8/5 max-h-full max-w-full rounded-[10%/16%] border-4 border-slate-500 bg-slate-800 tv:border-[6px] contrast:border-slate-100',
          isPulsing && cn('border-slate-100', PULSE_CLASSES),
          className,
        )}
      >
        {/* Repère 160 × 100, avec une marge proportionnelle à la carte */}
        <svg aria-hidden="true" viewBox="-4 -2.5 168 105" className="size-full">
          {rule.kind === 'except' ? (
            <ExceptRule forbidden={rule.forbidden} />
          ) : rule.feature === 'color' ? (
            <ColorRule leftColor={leftBox.color} />
          ) : (
            <SizeRule leftSize={leftBox.size} />
          )}
        </svg>
      </span>
    </>
  );
}
