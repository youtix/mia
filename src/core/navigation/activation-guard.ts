/**
 * Activations au doigt, à la souris et au D-Pad, en un seul écouteur `click` posé en capture sur
 * `window`, donc avant React (FEAT-04 §5).
 *
 * Garde : ce qui vient d'apparaître (modale, étape de confirmation, écran suivant) ne s'active pas
 * aussitôt. Le second tap d'un double tap, ou un OK répété, tomberait sinon sur le bouton apparu sous
 * le doigt : tout effacer, supprimer un profil, sauter la récompense d'une étoile.
 *
 * Tap sans clic : Chromium n'émet aucun `click` pour un doigt posé alors qu'un autre est déjà sur
 * l'écran, ni après un appui long, ni juste après un doigt levé en plein mouvement. Si le clic ne
 * suit pas le relâchement, le bouton est cliqué ici : une main posée ne bloque aucun écran. Sauf
 * pour le doigt qui arrête un défilement : là, le navigateur a raison de ne rien cliquer.
 */

/** Modale, étape de confirmation ou écran qui change : couvre un double tap, même lent. */
export const VIEW_CHANGE_GUARD_MS = 600;

/** Écran de fin : l'enfant tape encore au même endroit pendant que l'étoile se pose (FEAT-21). */
export const END_SCREEN_GUARD_MS = 800;

/** Confirmation d'une action irréversible : couvre le double tap le plus lent, le temps de lire. */
export const CONFIRM_GUARD_MS = 1000;

/** Attente du clic du navigateur après le relâchement, imperceptible. */
const NATIVE_CLICK_WAIT_MS = 120;

/** Un clic du navigateur qui arrive en retard sur le même bouton ne l'active pas deux fois. */
const LATE_CLICK_WINDOW_MS = 450;

/** Déplacement au-delà duquel le contact n'est plus un tap (celui du glissement d'un ours). */
const TAP_SLOP_PX = 8;

/** Contact plus long : une main posée qui se relève, pas un tap. */
const MAX_TAP_MS = 1000;

/**
 * Un doigt posé pendant un défilement l'arrête : le navigateur ne clique rien, à juste titre, et le
 * bouton qui passait sous le doigt ne doit pas s'activer.
 */
const SCROLL_SETTLE_MS = 100;

/** Ce qu'un tap peut activer ; pas les champs de saisie, qui ne vivent pas de leur clic. */
const TAPPABLE_SELECTOR =
  'button, a[href], summary, label, [role="button"], [role="radio"], [role="switch"], [role="checkbox"]';

interface TouchPress {
  control: HTMLElement | null;
  startX: number;
  startY: number;
  startedAt: number;
  /** Faux dès que le doigt bouge, ou qu'un autre se pose : seul le dernier doigt posé tape */
  isTap: boolean;
}

interface PendingTap {
  timer: ReturnType<typeof setTimeout>;
  control: HTMLElement;
  x: number;
  y: number;
}

interface ReplacedClick {
  control: HTMLElement;
  until: number;
}

let installCount = 0;
let guardedUntil = 0;
let lastPopAt = Number.NEGATIVE_INFINITY;

/**
 * Ignore les activations pendant `durationMs`. Sans `installActivationGuard` (composant rendu seul,
 * dans un test), rien n'est gardé.
 */
export function guardActivations(durationMs: number = VIEW_CHANGE_GUARD_MS): void {
  if (installCount === 0) return;
  guardedUntil = Math.max(guardedUntil, performance.now() + durationMs);
}

export function isActivationGuarded(): boolean {
  return installCount > 0 && performance.now() < guardedUntil;
}

/**
 * Retour pressé deux fois de suite : la navigation n'a pas abouti au second appui, qui lirait encore
 * l'ancienne entrée d'historique et dépilerait une entrée de trop. `true` si ce retour peut dépiler.
 */
export function claimHistoryPop(): boolean {
  if (installCount === 0) return true;
  const now = performance.now();
  if (now - lastPopAt < VIEW_CHANGE_GUARD_MS) return false;
  lastPopAt = now;
  return true;
}

function swallow(event: Event): void {
  event.stopImmediatePropagation();
  event.preventDefault();
}

/** Écouteurs de la page (`window`) ; renvoie de quoi les retirer. */
export function installActivationGuard(): () => void {
  const presses = new Map<number, TouchPress>();
  let pendingTap: PendingTap | null = null;
  let replacedClick: ReplacedClick | null = null;
  let isClickingControl = false;
  let lastScrollAt = Number.NEGATIVE_INFINITY;

  const cancelPendingTap = () => {
    if (pendingTap) clearTimeout(pendingTap.timer);
    pendingTap = null;
  };

  /** Le clic n'est pas venu : clique le bouton, s'il est toujours sous le doigt. */
  const clickControl = ({ timer, control, x, y }: PendingTap) => {
    clearTimeout(timer);
    pendingTap = null;
    const hit = document.elementFromPoint(x, y);
    if (!control.isConnected || !hit || !control.contains(hit)) return;
    replacedClick = { control, until: performance.now() + LATE_CLICK_WINDOW_MS };
    control.focus({ preventScroll: true });
    isClickingControl = true;
    control.click();
    isClickingControl = false;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    for (const press of presses.values()) press.isTap = false;
    const now = performance.now();
    presses.set(event.pointerId, {
      control: event.target instanceof Element ? findControl(event.target) : null,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: now,
      isTap: now - lastScrollAt >= SCROLL_SETTLE_MS,
    });
  };

  const onPointerMove = (event: PointerEvent) => {
    const press = presses.get(event.pointerId);
    if (!press?.isTap) return;
    const distance = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
    if (distance >= TAP_SLOP_PX) press.isTap = false;
  };

  const onPointerUp = (event: PointerEvent) => {
    const press = presses.get(event.pointerId);
    if (!press) return;
    presses.delete(event.pointerId);
    const { control } = press;
    if (!control || !press.isTap || performance.now() - press.startedAt > MAX_TAP_MS) return;
    // Le tap précédent n'a pas eu son clic non plus (deux doigts qui tapent, une main posée) : il
    // part maintenant plutôt que d'être perdu.
    if (pendingTap) clickControl(pendingTap);
    const pending: PendingTap = {
      timer: setTimeout(() => {
        clickControl(pending);
      }, NATIVE_CLICK_WAIT_MS),
      control,
      x: event.clientX,
      y: event.clientY,
    };
    pendingTap = pending;
  };

  const onScroll = () => {
    lastScrollAt = performance.now();
  };

  const onPointerCancel = (event: PointerEvent) => {
    presses.delete(event.pointerId);
  };

  const onClick = (event: MouseEvent) => {
    if (!isClickingControl) {
      cancelPendingTap();
      const replaced = replacedClick;
      replacedClick = null;
      if (
        replaced &&
        performance.now() < replaced.until &&
        event.target instanceof Node &&
        replaced.control.contains(event.target)
      ) {
        swallow(event);
        return;
      }
    }
    if (isActivationGuarded()) swallow(event);
  };

  const passiveCapture = { capture: true, passive: true };
  window.addEventListener('pointerdown', onPointerDown, passiveCapture);
  window.addEventListener('pointermove', onPointerMove, passiveCapture);
  window.addEventListener('pointerup', onPointerUp, passiveCapture);
  window.addEventListener('pointercancel', onPointerCancel, passiveCapture);
  // En capture : `scroll` ne remonte pas, et c'est le plus souvent le `<main>` d'un écran qui défile.
  window.addEventListener('scroll', onScroll, passiveCapture);
  window.addEventListener('click', onClick, { capture: true });
  installCount += 1;

  return () => {
    installCount -= 1;
    if (installCount === 0) {
      guardedUntil = 0;
      lastPopAt = Number.NEGATIVE_INFINITY;
    }
    cancelPendingTap();
    window.removeEventListener('pointerdown', onPointerDown, { capture: true });
    window.removeEventListener('pointermove', onPointerMove, { capture: true });
    window.removeEventListener('pointerup', onPointerUp, { capture: true });
    window.removeEventListener('pointercancel', onPointerCancel, { capture: true });
    window.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('click', onClick, { capture: true });
  };
}

function findControl(target: Element): HTMLElement | null {
  const control = target.closest(TAPPABLE_SELECTOR);
  return control instanceof HTMLElement ? control : null;
}
