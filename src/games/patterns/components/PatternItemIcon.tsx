import type { SoundBeat } from '@/core/audio/types';
import { cn } from '@/lib/cn';
import {
  Bell,
  Bird,
  Cat,
  Circle,
  Cross,
  Diamond,
  Dog,
  Drum,
  Fish,
  Heart,
  Hexagon,
  Rabbit,
  Snail,
  Square,
  Squirrel,
  Star,
  Triangle,
  Turtle,
  type LucideIcon,
} from 'lucide-react';
import { PATTERN_ITEMS } from '../items';
import type { PatternItemId } from '../types';

/**
 * Dessin de chaque élément, table exhaustive propre à ce jeu : le JS de la route n'embarque pas le
 * module d'icônes de Memory (FEAT-08).
 */
const ITEM_ICONS: Readonly<Record<PatternItemId, LucideIcon>> = {
  cat: Cat,
  dog: Dog,
  fish: Fish,
  bird: Bird,
  rabbit: Rabbit,
  turtle: Turtle,
  squirrel: Squirrel,
  snail: Snail,
  circle: Circle,
  square: Square,
  triangle: Triangle,
  star: Star,
  heart: Heart,
  diamond: Diamond,
  hexagon: Hexagon,
  cross: Cross,
};

export interface PatternItemIconProps {
  itemId: PatternItemId;
  /** Couleur de l'élément : classe `text-*` tirée par le moteur (jamais seule à le distinguer) */
  colorClass?: string;
  /** Taille et mise en page */
  className?: string;
}

/**
 * Élément d'une suite : animal en contour ou forme pleine. Décoratif : la ligne et les boutons portent
 * les noms vocalisés (`getPatternItemLabel`).
 */
export function PatternItemIcon({ itemId, colorClass, className }: PatternItemIconProps) {
  const ItemGlyph = ITEM_ICONS[itemId];

  return (
    <span
      aria-hidden="true"
      data-item={itemId}
      className={cn('inline-flex shrink-0', colorClass, className)}
    >
      <ItemGlyph
        className={cn('size-full', PATTERN_ITEMS.shapes.includes(itemId) && 'fill-current')}
      />
    </span>
  );
}

const BEAT_ICONS: Readonly<Record<SoundBeat, LucideIcon>> = { bell: Bell, drum: Drum };

/** La forme distingue les deux sons, la couleur ne fait que le renforcer. */
const BEAT_COLOR_CLASSES: Readonly<Record<SoundBeat, string>> = {
  bell: 'text-amber-300',
  drum: 'text-sky-300',
};

export interface PatternBeatIconProps {
  beat: SoundBeat;
  /** Taille et mise en page */
  className?: string;
}

/** Image d'un temps, à la place du son quand il est coupé, et à la révélation. Décorative. */
export function PatternBeatIcon({ beat, className }: PatternBeatIconProps) {
  const BeatGlyph = BEAT_ICONS[beat];

  return <BeatGlyph aria-hidden="true" className={cn(BEAT_COLOR_CLASSES[beat], className)} />;
}
