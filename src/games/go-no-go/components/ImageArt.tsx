import { cn } from '@/lib/cn';
import { isFlyingImage } from '../subjects';
import type { ImageId } from '../types';
import { FLYING_ART } from './art/flying';
import { GROUNDED_ART } from './art/grounded';

export interface ImageArtProps {
  image: ImageId;
  className?: string;
}

/**
 * Dessin d'une image des règles 2 et 3 (FEAT-28 §4.2) : plat, contour sombre, jamais de rouge. Ce qui
 * vole et ce qui ne vole pas sont dessinés dans le même style : seule l'image décide. Décoratif, la
 * scène porte le nom vocalisé.
 */
export function ImageArt({ image, className }: ImageArtProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      data-image={image}
      data-flies={isFlyingImage(image) || undefined}
      className={cn('size-full overflow-visible', className)}
    >
      {isFlyingImage(image) ? FLYING_ART[image]() : GROUNDED_ART[image]()}
    </svg>
  );
}
