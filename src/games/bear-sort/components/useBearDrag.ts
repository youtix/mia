'use client';

import type { Point2D } from '@/core/navigation';
import { capturePointer } from '@/lib/pointer-capture';
import { useRef, useState, type PointerEvent, type MouseEvent as ReactMouseEvent } from 'react';

/** En deçà de ce déplacement, en pixels, le geste reste un tap : il sélectionne l'ours (`click`). */
export const TAP_SLOP_PX = 8;

interface Gesture {
  uid: string;
  /** Bouton de l'ours, que le glissement déplace */
  element: HTMLElement;
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
  /** Ours lâché en `point`, à au moins sa propre taille de son point de départ */
  onRelease: (uid: string, point: Point2D) => void;
}

export interface UseBearDragResult {
  /** Ours qui suit le pointeur, `null` au repos et pendant un tap */
  heldUid: string | null;
  startGesture: (uid: string, event: BearPointerEvent) => void;
  moveGesture: (event: BearPointerEvent) => void;
  endGesture: (event: BearPointerEvent) => void;
  /** Geste interrompu par le système : l'ours revient, sans dépôt */
  cancelGesture: (event: BearPointerEvent) => void;
  /** Capture perdue sans `pointerup` (`lostpointercapture`) : l'ours revient, sans dépôt */
  loseGesture: (event: BearPointerEvent) => void;
  /** `true` pour le clic que le navigateur émet à la fin d'un glissement : à ignorer */
  isDragClick: (event: ReactMouseEvent) => boolean;
}

/** L'ours suit le doigt sans délai. */
function followPointer(element: HTMLElement, dx: number, dy: number): void {
  element.style.transition = 'none';
  element.style.transform = `translate(${String(dx)}px, ${String(dy)}px)`;
}

/** L'ours rendu retrouve sa transition (classes du plateau) : il revient avec un petit ressort. */
function sendBack(element: HTMLElement): void {
  element.style.removeProperty('transition');
  element.style.removeProperty('transform');
}

/**
 * Glissement d'un ours (Pointer Events). Un tap n'est pas traité ici : il reste au `click` du bouton,
 * le même que celui de TalkBack et du clavier. Geste suivi par une ref : `pointerup` peut arriver
 * avant le rendu du dernier `pointermove`. La position s'écrit directement sur le bouton : un rendu du
 * plateau à chaque `pointermove` ferait traîner l'ours derrière le doigt sur un téléphone modeste.
 */
export function useBearDrag({
  isEnabled,
  onDragStart,
  onRelease,
}: UseBearDragOptions): UseBearDragResult {
  const [heldUid, setHeldUid] = useState<string | null>(null);
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
    const replaced = gestureRef.current;
    if (replaced?.isDragging) sendBack(replaced.element);
    setHeldUid(null);
    capturePointer(event.currentTarget, event.pointerId);
    gestureRef.current = {
      uid,
      element: event.currentTarget,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      isDragging: false,
    };
  };

  const moveGesture = (event: BearPointerEvent) => {
    const gesture = gestureRef.current;
    if (gesture?.pointerId !== event.pointerId) return;
    // Souris relâchée sans `pointerup` (fenêtre quittée en plein glissement, Alt+Tab) : plus aucun
    // bouton enfoncé, l'ours ne suit plus le curseur et revient.
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      finishGesture(event);
      return;
    }
    const dx = event.clientX - gesture.originX;
    const dy = event.clientY - gesture.originY;
    if (!gesture.isDragging) {
      if (Math.hypot(dx, dy) < TAP_SLOP_PX) return;
      gesture.isDragging = true;
      setHeldUid(gesture.uid);
      onDragStart(gesture.uid);
    }
    followPointer(gesture.element, dx, dy);
  };

  /** Termine le geste du pointeur `event` ; renvoie le glissement achevé, `null` s'il n'y en a pas. */
  const finishGesture = (event: BearPointerEvent): Gesture | null => {
    const gesture = gestureRef.current;
    if (gesture?.pointerId !== event.pointerId) return null;
    gestureRef.current = null;
    if (!gesture.isDragging) return null;
    hasDraggedRef.current = true;
    sendBack(gesture.element);
    setHeldUid(null);
    return gesture;
  };

  const endGesture = (event: BearPointerEvent) => {
    const gesture = finishGesture(event);
    if (!gesture) return;
    // Lâché à moins de sa propre taille de son point de départ, l'ours n'a rien visé : un doigt qui
    // glisse sur le premier rang sort vite de la réserve, et une boîte est juste au-dessus.
    const travel = Math.hypot(event.clientX - gesture.originX, event.clientY - gesture.originY);
    if (travel < gesture.element.getBoundingClientRect().width) return;
    onRelease(gesture.uid, { x: event.clientX, y: event.clientY });
  };

  const cancelGesture = (event: BearPointerEvent) => {
    finishGesture(event);
  };

  // Seulement sur le bouton du geste en cours : la souris garde le même identifiant de pointeur, et
  // un nouvel ours saisi retire la capture au précédent.
  const loseGesture = (event: BearPointerEvent) => {
    if (gestureRef.current?.element === event.currentTarget) finishGesture(event);
  };

  // `detail` vaut 0 pour un clic sans pointeur (clavier, lecteur d'écran) : jamais celui d'un
  // glissement, même si le dernier geste au doigt n'a été suivi d'aucun clic.
  const isDragClick = (event: ReactMouseEvent) => {
    const hasDragged = hasDraggedRef.current;
    hasDraggedRef.current = false;
    return hasDragged && event.detail > 0;
  };

  return {
    heldUid,
    startGesture,
    moveGesture,
    endGesture,
    cancelGesture,
    loseGesture,
    isDragClick,
  };
}
