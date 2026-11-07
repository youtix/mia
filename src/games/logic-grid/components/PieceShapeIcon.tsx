import { cn } from '@/lib/cn';
import { getPieceColor, getPieceShape } from '../grid';
import type { PieceId } from '../types';
import { PIECE_FILLS, PIECE_OUTLINE, SHAPE_PATHS } from './art';

export interface PieceShapeIconProps {
  piece: PieceId;
  className?: string;
}

/** Pièce dessinée (forme et couleur), décorative : son nom est porté par l'élément qui la contient. */
export function PieceShapeIcon({ piece, className }: PieceShapeIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      data-piece-icon={piece}
      className={cn('block size-full overflow-visible', className)}
    >
      <path
        d={SHAPE_PATHS[getPieceShape(piece)]}
        fill={PIECE_FILLS[getPieceColor(piece)]}
        stroke={PIECE_OUTLINE}
        strokeWidth={6}
        strokeLinejoin="round"
      />
    </svg>
  );
}
