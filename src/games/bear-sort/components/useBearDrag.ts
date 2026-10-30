'use client';

import type { Point2D } from '@/core/navigation';
import { useRef, useState, type PointerEvent, type MouseEvent as ReactMouseEvent } from 'react';

/** En deçà de ce déplacement, en pixels, le geste reste un tap : il sélectionne l'ours (`click`). */
export const TAP_SLOP_PX = 8;

/** Ours tenu au doigt ou à la souris, et son décalage depuis le premier contact. */
export interface HeldBear {
  uid: string;
  dx: number;
  dy: number;
}

interface Gesture {
  uid: string;
  pointerId: number;
  originX: number;
  originY: number;
  /** Le pointeur a dépassé `TAP_SLOP_PX` : ce n'est plus un tap, même s'il revient à son point */
  isDragging: boolean;
}

type BearPointerEvent = PointerEvent<HTMLButtonElement>;

export interface UseBearDragOptions {
  /** Plateau figé (panneau STOP, victoire) : aucun geste ne commence */
  isEnabled: boolean;
  /** Le geste devient un glissement : l'ours quitte sa place */
  onDragStart: (uid: string) => void;
  /** Ours lâché en `point` */
  onRelease: (uid: string, point: Point2D) => void;
}

export interface UseBearDragResult {
  /** Ours qui suit le pointeur, `null` au repos et pendant un tap */
  held: HeldBear | null;
  startGesture: (uid: string, event: BearPointerEvent) => void;
  moveGesture: (event: BearPointerEvent) => void;
  endGesture: (event: BearPointerEvent) => void;
  /** Geste interrompu par le système : l'ours revient, sans dépôt */
  cancelGesture: (event: BearPointerEvent) => void;
  /** `true` pour le clic que le navigateur émet à la fin d'un glissement : à ignorer */
  isDragClick: (event: ReactMouseEvent) => boolean;
}

/**
 * Capture du pointeur : le glissement suit le doigt même sorti de l'ours. jsdom ne l'implémente pas
 * et un pointeur déjà relâché lève `InvalidStateError` : le glissement suit alors le pointeur tant
 * qu'il reste sur l'ours.
 */
function capturePointer(element: HTMLElement, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Capture indisponible : voir ci-dessus.
  }
}

/**
 * Glissement d'un ours (Pointer Events). Un tap n'est pas traité ici : il reste au `click` du bouton,
 * le même que celui de TalkBack et du clavier. Geste suivi par une ref : `pointerup` peut arriver
 * avant le rendu du dernier `pointermove`.
 */
export function useBearDrag({
  isEnabled,
  onDragStart,
  onRelease,
}: UseBearDragOptions): UseBearDragResult {
  const [held, setHeld] = useState<HeldBear | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const hasDraggedRef = useRef(false);

  const startGesture = (uid: string, event: BearPointerEvent) => {
    // Un ours à la fois, mais seul un glissement en cours refuse un autre doigt : une main posée sur
    // l'écran, même sur un ours, ne bloque pas le jeu. Un nouveau pointeur principal remplace tout
    // geste : le sien est forcément relâché, même si `pointerup` n'est jamais arrivé (ours rangé par
    // un autre doigt, bouton démonté).
    if (!isEnabled || (!event.isPrimary && gestureRef.current?.isDragging)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    hasDraggedRef.current = false;
    setHeld(null);
    capturePointer(event.currentTarget, event.pointerId);
    gestureRef.current = {
      uid,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      isDragging: false,
    };
  };

  const moveGesture = (event: BearPointerEvent) => {
    const gesture = gestureRef.current;
    if (gesture?.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.originX;
    const dy = event.clientY - gesture.originY;
    if (!gesture.isDragging) {
      if (Math.hypot(dx, dy) < TAP_SLOP_PX) return;
      gesture.isDragging = true;
      onDragStart(gesture.uid);
    }
    setHeld({ uid: gesture.uid, dx, dy });
  };

  /** Termine le geste du pointeur `event` ; renvoie le glissement achevé, `null` s'il n'y en a pas. */
  const finishGesture = (event: BearPointerEvent): Gesture | null => {
    const gesture = gestureRef.current;
    if (gesture?.pointerId !== event.pointerId) return null;
    gestureRef.current = null;
    if (!gesture.isDragging) return null;
    hasDraggedRef.current = true;
    setHeld(null);
    return gesture;
  };

  const endGesture = (event: BearPointerEvent) => {
    const gesture = finishGesture(event);
    if (gesture) onRelease(gesture.uid, { x: event.clientX, y: event.clientY });
  };

  const cancelGesture = (event: BearPointerEvent) => {
    finishGesture(event);
  };

  // `detail` vaut 0 pour un clic sans pointeur (clavier, lecteur d'écran) : jamais celui d'un
  // glissement, même si le dernier geste au doigt n'a été suivi d'aucun clic.
  const isDragClick = (event: ReactMouseEvent) => {
    const hasDragged = hasDraggedRef.current;
    hasDraggedRef.current = false;
    return hasDragged && event.detail > 0;
  };

  return { held, startGesture, moveGesture, endGesture, cancelGesture, isDragClick };
}
