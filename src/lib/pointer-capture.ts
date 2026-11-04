/**
 * Capture du pointeur : un glissement suit le doigt même sorti de l'élément touché. jsdom ne
 * l'implémente pas et un pointeur déjà relâché lève `InvalidStateError` : le glissement suit alors le
 * pointeur tant qu'il reste sur l'élément.
 */
export function capturePointer(element: HTMLElement, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Capture indisponible : voir ci-dessus.
  }
}
