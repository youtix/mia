import { cn } from '@/lib/cn';
import {
  Anchor,
  Apple,
  Bell,
  Bird,
  Bug,
  Car,
  Cat,
  Cloud,
  Compass,
  Crown,
  Dog,
  Droplet,
  Feather,
  Fish,
  Flame,
  Flower,
  Gem,
  Gift,
  Heart,
  Key,
  Leaf,
  Moon,
  Music,
  Rabbit,
  Rat,
  Rocket,
  Shell,
  Snail,
  Snowflake,
  Squirrel,
  Star,
  Sun,
  TreePine,
  Trophy,
  Turtle,
  Zap,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import type { MemoryRotation, MemorySymbolId } from '../types';

/** Props communes aux icônes Lucide et aux formes dessinées ici. */
interface GlyphProps {
  className?: string;
}

type Glyph = ComponentType<GlyphProps>;

/** Forme pleine sur la grille 24 × 24 des icônes Lucide, en `currentColor`. */
function ShapeGlyph({ className, children }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

// Formes de `abstract_orientation` (FEAT-09) : pointe vers le haut à 0°, sans symétrie de
// rotation (4 orientations distinctes), d'aires voisines pour un poids visuel égal.

/** Flèche : pointe triangulaire et hampe. */
function ArrowShape({ className }: GlyphProps) {
  return (
    <ShapeGlyph className={className}>
      <path d="M12 2 20 11h-5v11H9V11H4Z" />
    </ShapeGlyph>
  );
}

/** Chevron épais en « ^ ». */
function ChevronShape({ className }: GlyphProps) {
  return (
    <ShapeGlyph className={className}>
      <path d="M12 5 22 15l-3.5 3.5L12 12l-6.5 6.5L2 15Z" />
    </ShapeGlyph>
  );
}

/** Triangle isocèle. */
function TriangleShape({ className }: GlyphProps) {
  return (
    <ShapeGlyph className={className}>
      <path d="M12 3 22 20H2Z" />
    </ShapeGlyph>
  );
}

/** Triangle rectangle : angle droit en bas à gauche, pointe en haut. */
function RightTriangleShape({ className }: GlyphProps) {
  return (
    <ShapeGlyph className={className}>
      <path d="M4 3v18h16Z" />
    </ShapeGlyph>
  );
}

/** Demi-disque, dôme en haut. */
function HalfDiscShape({ className }: GlyphProps) {
  return (
    <ShapeGlyph className={className}>
      <path d="M2 17a10 10 0 0 1 20 0Z" />
    </ShapeGlyph>
  );
}

/** Quart de disque en part de tarte, pointe en haut (jamais confondu avec le triangle rectangle). */
function QuarterDiscShape({ className }: GlyphProps) {
  return (
    <ShapeGlyph className={className}>
      <path d="M12 5 2.1 14.9a14 14 0 0 0 19.8 0Z" />
    </ShapeGlyph>
  );
}

/** Lettre L. */
function LShape({ className }: GlyphProps) {
  return (
    <ShapeGlyph className={className}>
      <path d="M5 3h5v13h9v5H5Z" />
    </ShapeGlyph>
  );
}

/** Lettre T. */
function TShape({ className }: GlyphProps) {
  return (
    <ShapeGlyph className={className}>
      <path d="M3 3h18v5h-6.5v13h-5V8H3Z" />
    </ShapeGlyph>
  );
}

/** Dessin de chaque symbole de la banque (FEAT-09), table exhaustive comme `AVATAR_ICONS`. */
const SYMBOL_GLYPHS: Readonly<Record<MemorySymbolId, Glyph>> = {
  // Nature & ciel
  sun: Sun,
  moon: Moon,
  star: Star,
  cloud: Cloud,
  bolt: Zap,
  flame: Flame,
  snowflake: Snowflake,
  droplet: Droplet,
  tree: TreePine,
  flower: Flower,
  leaf: Leaf,
  apple: Apple,
  // Animaux
  cat: Cat,
  dog: Dog,
  fish: Fish,
  bird: Bird,
  rabbit: Rabbit,
  turtle: Turtle,
  squirrel: Squirrel,
  snail: Snail,
  bug: Bug,
  rat: Rat,
  shell: Shell,
  feather: Feather,
  // Objets & trésors
  heart: Heart,
  car: Car,
  rocket: Rocket,
  music: Music,
  crown: Crown,
  diamond: Gem,
  anchor: Anchor,
  bell: Bell,
  compass: Compass,
  key: Key,
  gift: Gift,
  trophy: Trophy,
  // Formes orientables
  arrow: ArrowShape,
  chevron: ChevronShape,
  triangle: TriangleShape,
  'right-triangle': RightTriangleShape,
  'half-disc': HalfDiscShape,
  'quarter-disc': QuarterDiscShape,
  'l-shape': LShape,
  't-shape': TShape,
};

/** Classes littérales (détectées par Tailwind) : propriété `rotate`, sens horaire. */
const ROTATION_CLASSES: Readonly<Record<MemoryRotation, string>> = {
  0: '',
  90: 'rotate-90',
  180: 'rotate-180',
  270: 'rotate-270',
};

export interface MemorySymbolIconProps {
  symbolId: MemorySymbolId;
  /** Orientation, sens horaire (toujours 0 pour une icône figurative) */
  rotationDeg?: MemoryRotation;
  /** Couleur du symbole : classe `text-*` de la carte (jamais seule à distinguer deux groupes) */
  colorClass?: string;
  /** Taille et mise en page (ex: `size-3/5` de la face d'une carte) */
  className?: string;
}

/**
 * Symbole d'une carte de Memory : icône Lucide ou forme géométrique, colorée et orientée.
 * Décoratif : la carte porte le nom vocalisé (`getMemorySymbolLabel`).
 */
export function MemorySymbolIcon({
  symbolId,
  rotationDeg = 0,
  colorClass,
  className,
}: MemorySymbolIconProps) {
  const SymbolGlyph = SYMBOL_GLYPHS[symbolId];

  return (
    <span
      aria-hidden="true"
      data-symbol={symbolId}
      data-rotation={rotationDeg}
      className={cn('inline-flex shrink-0', colorClass, ROTATION_CLASSES[rotationDeg], className)}
    >
      <SymbolGlyph className="size-full" />
    </span>
  );
}
