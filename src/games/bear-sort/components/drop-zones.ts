import type { Point2D } from '@/core/navigation';

/**
 * Marge autour d'une boîte, en pixels, où un dépôt compte encore : un jeune enfant vise large, et un
 * ours lâché tout près de sa boîte ne doit pas lui revenir sans raison.
 */
export const DROP_TOLERANCE_PX = 40;

/** Rectangle d'une boîte dans le repère de l'écran (`getBoundingClientRect`). */
export interface DropZoneRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DropZone<TId> {
  id: TId;
  rect: DropZoneRect;
}

/** Le point est-il dans le rectangle, bord compris ? Un rectangle vide ne contient rien. */
export function isPointInRect({ x, y }: Point2D, rect: DropZoneRect): boolean {
  const { left, top, right, bottom } = rect;
  return right > left && bottom > top && x >= left && x <= right && y >= top && y <= bottom;
}

/**
 * Boîte visée par un ours lâché en `point` : la plus proche de celles dont le rectangle, agrandi de
 * `tolerancePx` de chaque côté, contient le point. À égalité (point dans deux rectangles), la
 * première de la liste l'emporte. `null` hors de toute boîte. Un rectangle vide (boîte non mesurable,
 * comme dans jsdom) ne compte pas.
 */
export function findDropZone<TId>(
  { x, y }: Point2D,
  zones: readonly DropZone<TId>[],
  tolerancePx: number,
): TId | null {
  let nearest: TId | null = null;
  let nearestDistance = Infinity;
  for (const { id, rect } of zones) {
    if (rect.right <= rect.left || rect.bottom <= rect.top) continue;
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    const distance = Math.hypot(dx, dy);
    if (dx <= tolerancePx && dy <= tolerancePx && distance < nearestDistance) {
      nearest = id;
      nearestDistance = distance;
    }
  }
  return nearest;
}
