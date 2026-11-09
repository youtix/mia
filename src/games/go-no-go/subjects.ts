import type { DecoyId, FlyingImageId, GroundedImageId, ImageId, SubjectId } from './types';

/**
 * Ce qui entre sur la scène (FEAT-28 §4). Une image n'entre au catalogue que si une enfant de 3 ans y
 * répond sans hésiter : les cas discutables (nuage, ballon, poule, chauve-souris, dragon…) en sont
 * exclus. La liste est relue par l'adulte avant toute publication.
 */

/** Ce qui vole vraiment : les cibles des règles 2 et 3. */
export const FLYING_IMAGES: readonly [FlyingImageId, ...FlyingImageId[]] = [
  'pigeon',
  'plane',
  'helicopter',
  'butterfly',
  'bee',
  'rocket',
];

/** Ce qui ne vole pas : les pièges de la règle 2. */
export const GROUNDED_IMAGES: readonly [GroundedImageId, ...GroundedImageId[]] = [
  'cow',
  'pig',
  'dog',
  'fish',
  'snail',
  'turtle',
  'car',
  'train',
  'boat',
  'chair',
  'house',
  'tree',
];

export const IMAGE_IDS: readonly ImageId[] = [...FLYING_IMAGES, ...GROUNDED_IMAGES];

/** Imposteurs de la règle 1, dans l'ordre où le catalogue les introduit. */
export const DECOY_IDS: readonly DecoyId[] = ['fox', 'cat'];

export function isImageId(subject: string): subject is ImageId {
  return (IMAGE_IDS as readonly string[]).includes(subject);
}

/** Vrai pour une image qui vole vraiment. */
export function isFlyingImage(subject: SubjectId): subject is FlyingImageId {
  return (FLYING_IMAGES as readonly string[]).includes(subject);
}
