'use client';

import {
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useId,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  isBackKey,
  isSelectKey,
  mapKeyToDirection,
  type Direction,
  type InputMode,
  type NavigationScope,
} from './types';

/** Même détection que la variante CSS `tv:` (FEAT-03 §5) : appareil piloté uniquement au D-Pad. */
const TV_MEDIA_QUERY = '(hover: none) and (pointer: none)';

/** Pointeurs qui ramènent au mode tactile (la souris inclut les télécommandes « air mouse »). */
const TOUCH_POINTER_TYPES = new Set(['touch', 'mouse', 'pen']);

/** Champs d'une ligne : Haut / Bas en sortent, les autres touches restent au champ. */
const SINGLE_LINE_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'tel', 'url']);

/** `<input>` qui se comportent comme des boutons : aucune touche d'édition. */
const BUTTON_INPUT_TYPES = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'image',
  'file',
  'color',
]);

/** Éléments qu'Entrée / Espace activent nativement (le panneau `tabindex="-1"` d'une modale, non). */
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface ScopeEntry {
  token: string;
  scopeId: string;
  depth: number;
  getScope: () => NavigationScope;
}

interface LayerEntry {
  token: string;
  depth: number;
  getOnBack: () => (() => void) | undefined;
}

interface NavigationSnapshot {
  inputMode: InputMode;
  /** Jeton (`useId`) de la zone qui reçoit les touches */
  activeToken: string | null;
  activeScopeId: string | null;
}

interface NavigationStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => NavigationSnapshot;
  setInputMode: (mode: InputMode) => void;
  registerScope: (entry: ScopeEntry) => () => void;
  registerLayer: (entry: LayerEntry) => () => void;
  getActiveScope: () => NavigationScope | null;
  getBackHandler: () => (() => void) | null;
  dispatchBack: () => boolean;
}

/** Pré-rendu statique : mode tactile, aucune zone active (la détection TV suit l'hydratation). */
const SERVER_SNAPSHOT: NavigationSnapshot = {
  inputMode: 'touch',
  activeToken: null,
  activeScopeId: null,
};

const getServerSnapshot = () => SERVER_SNAPSHOT;

/** Entrée de la couche `depth` enregistrée en dernier (une `Map` itère dans l'ordre d'insertion). */
function latestAt<T extends { depth: number }>(entries: Map<string, T>, depth: number): T | null {
  let latest: T | null = null;
  for (const entry of entries.values()) {
    if (entry.depth === depth) latest = entry;
  }
  return latest;
}

/**
 * Pile des couches : la couche la plus profonde (modale ouverte en dernier) suspend les autres ;
 * dans cette couche, la zone activée en dernier reçoit les touches.
 */
function createNavigationStore(): NavigationStore {
  const scopes = new Map<string, ScopeEntry>();
  const layers = new Map<string, LayerEntry>();
  const listeners = new Set<() => void>();
  let inputMode: InputMode = 'touch';
  let snapshot = SERVER_SNAPSHOT;

  function resolveTop(): { scope: ScopeEntry | null; layer: LayerEntry | null } {
    let depth = 0;
    for (const entry of scopes.values()) depth = Math.max(depth, entry.depth);
    for (const entry of layers.values()) depth = Math.max(depth, entry.depth);
    return { scope: latestAt(scopes, depth), layer: latestAt(layers, depth) };
  }

  function update(): void {
    const { scope } = resolveTop();
    const activeToken = scope?.token ?? null;
    const activeScopeId = scope?.scopeId ?? null;
    if (
      snapshot.inputMode === inputMode &&
      snapshot.activeToken === activeToken &&
      snapshot.activeScopeId === activeScopeId
    ) {
      return;
    }
    snapshot = { inputMode, activeToken, activeScopeId };
    for (const listener of listeners) listener();
  }

  // React nettoie toujours l'enregistrement précédent d'une zone avant de la réenregistrer : une
  // zone réactivée est donc réinsérée en fin de `Map`, au sommet de sa couche.
  function register<T extends { token: string }>(entries: Map<string, T>, entry: T): () => void {
    entries.set(entry.token, entry);
    update();
    return () => {
      entries.delete(entry.token);
      update();
    };
  }

  function getBackHandler(): (() => void) | null {
    const { scope, layer } = resolveTop();
    return scope?.getScope().onBack ?? layer?.getOnBack() ?? null;
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    setInputMode: (mode) => {
      inputMode = mode;
      update();
    },
    registerScope: (entry) => register(scopes, entry),
    registerLayer: (entry) => register(layers, entry),
    getActiveScope: () => resolveTop().scope?.getScope() ?? null,
    getBackHandler,
    dispatchBack: () => {
      const onBack = getBackHandler();
      onBack?.();
      return onBack !== null;
    },
  };
}

function detectInitialInputMode(): InputMode {
  const { tv } = document.documentElement.dataset;
  if (tv === 'on') return 'dpad';
  if (tv === 'off') return 'touch';
  return typeof window.matchMedia === 'function' && window.matchMedia(TV_MEDIA_QUERY).matches
    ? 'dpad'
    : 'touch';
}

/** `line` : champ d'une ligne ; `field` : champ qui garde toutes ses touches sauf Échap. */
function getFieldKind(target: EventTarget | null): 'line' | 'field' | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target instanceof HTMLInputElement) {
    if (SINGLE_LINE_INPUT_TYPES.has(target.type)) return 'line';
    return BUTTON_INPUT_TYPES.has(target.type) ? null : 'field';
  }
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return 'field';
  return target.closest('[contenteditable]:not([contenteditable="false"])') ? 'field' : null;
}

/** Touches d'édition laissées au champ focalisé ; Échap y reste un Retour. */
function isLeftToField(event: KeyboardEvent, direction: Direction | null): boolean {
  if (event.key === 'Escape') return false;
  const kind = getFieldKind(event.target);
  if (kind === 'line') return direction !== 'up' && direction !== 'down';
  return kind === 'field';
}

function hasDomFocus(scope: NavigationScope): boolean {
  const element = scope.getFocusedElement?.() ?? null;
  return element !== null && element === document.activeElement;
}

/** Élément interactif hors de la zone (ex: bouton atteint avec Tab) : le navigateur l'active. */
function isForeignControl(scope: NavigationScope, target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.matches(INTERACTIVE_SELECTOR) &&
    !(scope.ownsElement?.(target) ?? false)
  );
}

function createInputListeners(store: NavigationStore) {
  let suppressSpaceKeyUp = false;

  function onKeyDown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    ) {
      return;
    }
    const direction = mapKeyToDirection(event.key);
    const isSelect = isSelectKey(event.key);
    if (!direction && !isSelect && !isBackKey(event.key)) return;
    if (isLeftToField(event, direction)) return;

    if (!direction && !isSelect) {
      // Retour ne change pas le mode de saisie ; maintenu, il ne recule que d'un écran.
      const onBack = store.getBackHandler();
      if (!onBack) return;
      event.preventDefault();
      if (!event.repeat) onBack();
      return;
    }

    const wasTouch = store.getSnapshot().inputMode === 'touch';
    store.setInputMode('dpad');
    const scope = store.getActiveScope();
    if (!scope) return;
    // Après le tactile, le premier appui révèle le curseur, sauf s'il a déjà le focus DOM.
    const isWakeUp = wasTouch && !hasDomFocus(scope);

    if (direction) {
      if (!scope.onDirection) return;
      // Sans preventDefault(), le <main> défilant d'AppShell défilerait aussi.
      event.preventDefault();
      if (!isWakeUp) scope.onDirection(direction);
      return;
    }

    if (!scope.onSelect || isForeignControl(scope, event.target)) return;
    // Sans preventDefault(), un bouton focalisé recevrait aussi un clic natif (double activation).
    event.preventDefault();
    if (event.key === ' ') suppressSpaceKeyUp = true;
    if (!event.repeat && !isWakeUp) scope.onSelect();
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (event.key !== ' ' || !suppressSpaceKeyUp) return;
    suppressSpaceKeyUp = false;
    // Firefox active le bouton focalisé au relâchement d'Espace, même si l'appui a été annulé.
    event.preventDefault();
  }

  function onPointerDown(event: PointerEvent): void {
    if (TOUCH_POINTER_TYPES.has(event.pointerType)) store.setInputMode('touch');
  }

  return { onKeyDown, onKeyUp, onPointerDown };
}

const NavigationStoreContext = createContext<NavigationStore | null>(null);

/** Profondeur de couche : 0 pour l'écran, +1 par `NavigationLayer` (modale) imbriquée. */
const LayerDepthContext = createContext(0);

function useNavigationStore(): NavigationStore {
  const store = use(NavigationStoreContext);
  if (!store) throw new Error('La navigation D-Pad exige un <NavigationProvider> parent.');
  return store;
}

function useNavigationSnapshot(store: NavigationStore): NavigationSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
}

export interface NavigationProviderProps {
  children: ReactNode;
}

/**
 * Moteur de navigation D-Pad global : mode de saisie (`touch` / `dpad`), pile des couches et des
 * zones, écouteurs clavier en bouillonnement sur `window` (FEAT-03 : `ModalDialog` stoppe `Échap`
 * quand elle se ferme elle-même).
 */
export function NavigationProvider({ children }: NavigationProviderProps) {
  const [store] = useState(createNavigationStore);

  useEffect(() => {
    store.setInputMode(detectInitialInputMode());
    const { onKeyDown, onKeyUp, onPointerDown } = createInputListeners(store);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
    };
  }, [store]);

  return <NavigationStoreContext value={store}>{children}</NavigationStoreContext>;
}

export interface NavigationContextValue {
  inputMode: InputMode;
  /** Zone qui reçoit les touches (`scopeId`), `null` si aucune */
  activeScopeId: string | null;
  /**
   * Retour hors clavier (bouton physique Android via `@capacitor/app`, FEAT-15) : même routage que
   * les touches. Renvoie `false` si rien ne l'a géré (ex: quitter l'application).
   */
  dispatchBack: () => boolean;
}

export function useNavigation(): NavigationContextValue {
  const store = useNavigationStore();
  const { inputMode, activeScopeId } = useNavigationSnapshot(store);
  return { inputMode, activeScopeId, dispatchBack: store.dispatchBack };
}

export interface NavigationLayerProps {
  /** Retour quand aucune zone de la couche ne le gère (ex: `onClose` d'une modale) */
  onBack?: () => void;
  children: ReactNode;
}

/**
 * Couche de focus (ex: modale) : tant qu'elle est montée, les zones des couches inférieures sont
 * suspendues, même si elle n'en déclare aucune. Les zones déclarées dans ses enfants s'empilent
 * au-dessus. Sans `NavigationProvider`, ne fait rien.
 */
export function NavigationLayer({ onBack, children }: NavigationLayerProps) {
  const store = use(NavigationStoreContext);
  const depth = use(LayerDepthContext) + 1;
  const token = useId();
  const getOnBack = useEffectEvent(() => onBack);

  useEffect(() => {
    if (!store) return;
    return store.registerLayer({ token, depth, getOnBack: () => getOnBack() });
  }, [store, token, depth]);

  return <LayerDepthContext value={depth}>{children}</LayerDepthContext>;
}

export interface UseNavigationScopeOptions extends NavigationScope {
  /** Identifiant de la zone (ex: "traffic-jam-board"), exposé par `activeScopeId` */
  scopeId: string;
  /** Demande à recevoir les touches (défaut : `true`) ; dans une couche, la dernière activée l'emporte */
  isActive?: boolean;
}

export interface NavigationScopeState {
  /** La zone reçoit les touches (couche du dessus, activée en dernier) */
  isActive: boolean;
  /** Afficher l'anneau de focus : zone active et saisie au D-Pad */
  isFocusVisible: boolean;
  inputMode: InputMode;
}

/**
 * Zone de navigation bas niveau (ex: parking de Traffic Jam avec `findNearestTarget`) ;
 * `useGridNavigation` repose sur elle. Doit être déclarée à l'intérieur de la modale qu'elle pilote.
 */
export function useNavigationScope(options: UseNavigationScopeOptions): NavigationScopeState {
  const { scopeId, isActive: isRequested = true } = options;
  const store = useNavigationStore();
  const depth = use(LayerDepthContext);
  const token = useId();
  const getScope = useEffectEvent((): NavigationScope => options);

  useEffect(() => {
    if (!isRequested) return;
    return store.registerScope({ token, scopeId, depth, getScope: () => getScope() });
  }, [store, token, scopeId, depth, isRequested]);

  const { inputMode, activeToken } = useNavigationSnapshot(store);
  const isActive = activeToken === token;
  return { isActive, isFocusVisible: isActive && inputMode === 'dpad', inputMode };
}
