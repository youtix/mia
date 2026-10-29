import { cn } from '@/lib/cn';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Star,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from 'react';
import type { VehicleBounds } from '../engine';
import type { VehicleDef } from '../types';
import { getVehicleLabel } from './labels';

/**
 * Marge entre le bouton d'un véhicule et le bord de ses cases : l'anneau de focus (4 px) et son
 * décalage (2 px) tiennent dans l'espace laissé entre deux véhicules voisins, sans les recouvrir.
 */
export const VEHICLE_GAP_PX = 3;

/** Colonne (en cases) où le hero disparaît derrière le muret droit une fois la sortie franchie. */
const EXIT_OVERSHOOT_CELLS = 0.5;

/** Anneau D-Pad de l'état 1 (véhicule ciblé) : ambré, comme les cartes de Memory (FEAT-10). */
const FOCUSED_CLASSES = 'z-10 ring-4 ring-amber-400 ring-offset-2 ring-offset-slate-950';

/** Anneau de l'état 2 (véhicule démarré) : émeraude vif. */
const LOCKED_CLASSES = 'z-10 ring-4 ring-emerald-400 ring-offset-2 ring-offset-slate-950';

/** Même anneau ambré pour la navigation clavier native (Tab), l'anneau remplaçant l'`outline`. */
const FOCUS_VISIBLE_CLASSES =
  'focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus-visible:outline-hidden';

type VehiclePointerHandler = (event: ReactPointerEvent<HTMLButtonElement>) => void;

export interface VehiclePieceProps {
  vehicle: VehicleDef;
  gridSize: number;
  /** Le moteur D-Pad cible ce véhicule (état 1 : anneau ambré, badge « OK : Déplacer ») */
  isFocused?: boolean;
  /** Véhicule démarré (état 2) : anneau émeraude, phares allumés, flèches aux extrémités libres */
  isLocked?: boolean;
  /** Plage de déplacement courante : les flèches de l'état 2 n'apparaissent qu'aux bouts libres */
  bounds?: VehicleBounds;
  /** Indice : c'est ce véhicule qu'il faut déplacer (surbrillance clignotante) */
  isHinted?: boolean;
  /** Décalage du glissement en cours, en pixels le long de l'axe (`null` au repos) */
  dragOffsetPx?: number | null;
  /** Victoire : le hero sort du parking par la droite */
  isExiting?: boolean;
  /** Prop React 19 : focus DOM synchronisé par le plateau (annonces TalkBack, FEAT-04) */
  ref?: Ref<HTMLButtonElement>;
  onPointerDown?: VehiclePointerHandler;
  onPointerMove?: VehiclePointerHandler;
  onPointerUp?: VehiclePointerHandler;
  onPointerCancel?: VehiclePointerHandler;
  /** Le véhicule reçoit le focus DOM (Tab, clic) : activer la zone du plateau et le cibler */
  onFocus?: () => void;
}

/**
 * Position et taille d'un véhicule en pourcentage du parking, retirées de `VEHICLE_GAP_PX` de
 * chaque côté. `left` et `top` sont animés par la feuille de style : un coup joué à la
 * télécommande, annulé ou recommencé fait glisser le véhicule jusqu'à sa nouvelle case.
 */
function getPlacement(vehicle: VehicleDef, gridSize: number, isExiting: boolean): CSSProperties {
  const cell = 100 / gridSize;
  const horizontal = vehicle.axis === 'H';
  const col = isExiting ? gridSize + EXIT_OVERSHOOT_CELLS : vehicle.col;
  const gap = `${String(VEHICLE_GAP_PX)}px`;
  const size = `${String(2 * VEHICLE_GAP_PX)}px`;
  return {
    left: `calc(${String(col * cell)}% + ${gap})`,
    top: `calc(${String(vehicle.row * cell)}% + ${gap})`,
    width: `calc(${String((horizontal ? vehicle.length : 1) * cell)}% - ${size})`,
    height: `calc(${String((horizontal ? 1 : vehicle.length) * cell)}% - ${size})`,
  };
}

type VehicleEnd = 'start' | 'end';

/** Flèches des extrémités d'un véhicule démarré : ◀ ▶ sur l'axe horizontal, ▲ ▼ sur le vertical. */
const END_ARROWS: Record<
  VehicleDef['axis'],
  Record<VehicleEnd, { icon: LucideIcon; placement: string }>
> = {
  H: {
    start: { icon: ChevronLeft, placement: 'top-1/2 left-0.5 -translate-y-1/2' },
    end: { icon: ChevronRight, placement: 'top-1/2 right-0.5 -translate-y-1/2' },
  },
  V: {
    start: { icon: ChevronUp, placement: 'top-0.5 left-1/2 -translate-x-1/2' },
    end: { icon: ChevronDown, placement: 'bottom-0.5 left-1/2 -translate-x-1/2' },
  },
};

/** Flèche clignotante à une extrémité libre d'un véhicule démarré. */
function EndArrow({ axis, end }: { axis: VehicleDef['axis']; end: VehicleEnd }) {
  const { icon: Icon, placement } = END_ARROWS[axis][end];
  return (
    <span
      data-arrow={end}
      className={cn(
        'absolute flex size-5 items-center justify-center rounded-full bg-slate-950/85 text-emerald-300 motion-safe:animate-pulse',
        placement,
      )}
    >
      <Icon className="size-4" strokeWidth={3} />
    </span>
  );
}

/**
 * Voiture (2 cases) ou camion (3 cases) vu de dessus : pare-brise et phares à l'avant (à droite
 * pour l'axe horizontal, en bas pour l'axe vertical), étoile sur la voiture du joueur. Bouton
 * accessible positionné en absolu sur le parking ; `touch-action: none` : un doigt posé sur un
 * véhicule le fait glisser, il ne fait jamais défiler l'écran (la décision est prise au premier
 * contact, trop tôt pour un changement de style au `pointerdown`).
 */
export function VehiclePiece({
  vehicle,
  gridSize,
  isFocused = false,
  isLocked = false,
  bounds,
  isHinted = false,
  dragOffsetPx = null,
  isExiting = false,
  ref,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onFocus,
}: VehiclePieceProps) {
  const horizontal = vehicle.axis === 'H';
  const isDragging = dragOffsetPx !== null;
  const isHero = vehicle.type === 'hero';
  const style = getPlacement(vehicle, gridSize, isExiting);
  if (isDragging) {
    style.transform = horizontal
      ? `translateX(${String(dragOffsetPx)}px)`
      : `translateY(${String(dragOffsetPx)}px)`;
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-label={getVehicleLabel(vehicle, isLocked)}
      data-vehicle-id={vehicle.id}
      data-axis={vehicle.axis}
      data-focused={isFocused || undefined}
      data-locked={isLocked || undefined}
      data-hint={isHinted || undefined}
      data-dragging={isDragging || undefined}
      data-exiting={isExiting || undefined}
      style={style}
      className={cn(
        'absolute block cursor-grab touch-none rounded-xl border border-white/25 shadow-md shadow-black/40 select-none active:cursor-grabbing',
        vehicle.colorClass,
        FOCUS_VISIBLE_CLASSES,
        // Glissement en cours : le véhicule suit le doigt sans délai. Sinon, chaque changement de
        // case (et le relâchement du doigt, aimanté à la case la plus proche) glisse en douceur.
        isDragging
          ? 'z-20 transition-none'
          : 'motion-safe:transition-[left,top,transform] motion-safe:duration-200 motion-safe:ease-out',
        isExiting && 'motion-safe:duration-500 motion-safe:ease-in',
        isFocused && (isLocked ? LOCKED_CLASSES : FOCUSED_CLASSES),
        isHinted && 'z-10',
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onFocus={onFocus}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      >
        {/* Pare-brise, juste derrière l'avant. */}
        <span
          className={cn(
            'absolute rounded-sm bg-slate-950/50',
            horizontal
              ? 'top-[18%] right-[26%] bottom-[18%] w-[12%]'
              : 'right-[18%] bottom-[26%] left-[18%] h-[12%]',
          )}
        />
        {/* Phares : éteints au repos, allumés (halo) quand le véhicule est démarré. */}
        {(['start', 'end'] as const).map((side) => (
          <span
            key={side}
            data-headlight={side}
            className={cn(
              'absolute aspect-square rounded-full',
              horizontal
                ? cn('right-[5%] h-[16%]', side === 'start' ? 'top-[14%]' : 'bottom-[14%]')
                : cn('bottom-[5%] w-[16%]', side === 'start' ? 'left-[14%]' : 'right-[14%]'),
              isLocked
                ? 'bg-amber-100 shadow-[0_0_10px_4px_var(--color-amber-200)]'
                : 'bg-amber-100/35',
            )}
          />
        ))}
        {isHero ? (
          <Star className="absolute top-1/2 left-[30%] size-[min(40%,1.5rem)] -translate-x-1/2 -translate-y-1/2 fill-white/80 text-white/80" />
        ) : null}
      </span>

      {/* Indice : calque clignotant distinct, l'anneau de focus reste visible. */}
      {isHinted ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-[inherit] ring-4 ring-sky-300 motion-safe:animate-pulse"
        />
      ) : null}

      {/* État 1 : aide « OK : Déplacer » ; état 2 : flèches aux extrémités libres. */}
      {isFocused && !isLocked ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <kbd className="rounded-md bg-slate-950/85 px-1.5 py-0.5 font-sans text-[0.65rem] leading-tight font-bold whitespace-nowrap text-amber-100">
            OK : Déplacer
          </kbd>
        </span>
      ) : null}
      {isFocused && isLocked ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          {bounds && bounds.minDelta < 0 ? <EndArrow axis={vehicle.axis} end="start" /> : null}
          {bounds && bounds.maxDelta > 0 ? <EndArrow axis={vehicle.axis} end="end" /> : null}
        </span>
      ) : null}
    </button>
  );
}
