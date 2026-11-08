'use client';

import { FOCUS_VISIBLE_CLASSES } from '@/components/ui/focus-styles';
import { GestureHand } from '@/games/bear-sort/components/GestureHand';
import { cn } from '@/lib/cn';
import type { MouseEvent as ReactMouseEvent, Ref } from 'react';
import type { DemoHand } from '../demo';
import { BUZZER_LABEL } from '../labels';
import {
  BUZZER_BODY,
  BUZZER_EDGE,
  BUZZER_GREY_BODY,
  BUZZER_GREY_EDGE,
  BUZZER_GREY_LIGHT,
  BUZZER_GREY_SHADE,
  BUZZER_LIGHT,
  BUZZER_SHADE,
} from './art-tokens';

export interface BuzzerProps {
  /** Enfoncé et allumé : un contact vient d'être posé (même quand rien n'est compté) */
  isPressed: boolean;
  /** Grisé pendant la pause d'un piège touché : rien n'y est compté */
  isDisabled: boolean;
  /** Il attend un appui : il pulse doucement */
  isPulsing: boolean;
  /** Au D-Pad : l'icône du bouton OK de la télécommande, dessinée (aucun texte) */
  isRemote: boolean;
  /** La main fantôme qui montre le geste, ou se fige en l'air */
  hand: DemoHand;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  /** Clic sans contact préalable : un lecteur d'écran (TalkBack), `detail` valant 0 */
  onAssistiveClick: (event: ReactMouseEvent) => void;
  onFocus?: () => void;
}

/** L'icône du bouton OK d'une télécommande : un anneau à quatre flèches et un disque plein. */
function RemoteOkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      data-remote-icon="true"
      className="absolute top-1/2 left-1/2 h-[62%] max-w-[62%] -translate-x-1/2 -translate-y-1/2"
    >
      <g
        fill="none"
        stroke={BUZZER_EDGE}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx={50} cy={50} r={44} />
        <circle cx={50} cy={50} r={17} fill={BUZZER_EDGE} />
      </g>
      <g fill={BUZZER_EDGE}>
        <polygon points="50,10 41,24 59,24" />
        <polygon points="50,90 41,76 59,76" />
        <polygon points="10,50 24,41 24,59" />
        <polygon points="90,50 76,41 76,59" />
      </g>
    </svg>
  );
}

/**
 * Le buzzer : un énorme bouton rond, jamais rouge, qui s'enfonce et s'illumine à l'appui et se grise
 * pendant les pauses (FEAT-28 §8.1). Un bouton nommé « Taper » pour les lecteurs d'écran. Tout le
 * plateau compte comme lui au doigt (le plateau capte le contact), mais il donne au geste un endroit
 * évident où taper, et où reposer la main. Le dôme est le plus grand cercle de sa zone, posé sur un
 * large socle ; en paysage, il s'étire en bandeau (une pastille deux fois plus large que haute).
 */
export function Buzzer({
  isPressed,
  isDisabled,
  isPulsing,
  isRemote,
  hand,
  className,
  ref,
  onAssistiveClick,
  onFocus,
}: BuzzerProps) {
  const body = isDisabled ? BUZZER_GREY_BODY : BUZZER_BODY;
  const light = isDisabled ? BUZZER_GREY_LIGHT : BUZZER_LIGHT;
  const shade = isDisabled ? BUZZER_GREY_SHADE : BUZZER_SHADE;
  const edge = isDisabled ? BUZZER_GREY_EDGE : BUZZER_EDGE;

  return (
    <button
      ref={ref}
      type="button"
      aria-label={BUZZER_LABEL}
      aria-disabled={isDisabled || undefined}
      data-buzzer="true"
      data-pressed={isPressed || undefined}
      data-disabled={isDisabled || undefined}
      data-pulsing={isPulsing || undefined}
      className={cn(
        '@container-size relative flex cursor-pointer items-center justify-center overflow-visible rounded-[2rem] bg-slate-800/70 outline-hidden',
        FOCUS_VISIBLE_CLASSES,
        // L'anneau de focus reste dans la zone, qui touche le bord rogné de l'aire de jeu.
        'focus-visible:scale-100 focus-visible:ring-offset-0 focus-visible:ring-inset',
        className,
      )}
      onClick={onAssistiveClick}
      onFocus={onFocus}
    >
      <span
        className="relative block h-[min(94cqh,78cqw)] w-[min(94cqh,78cqw)] rounded-full landscape:w-[min(calc(94cqh*2.1),82cqw)]"
        style={{
          animation:
            isPulsing && !isPressed ? 'gng-buzzer-pulse 1.4s ease-in-out infinite' : 'none',
        }}
      >
        {/* Socle : l'ombre portée du dôme, qui disparaît quand il s'enfonce. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[92%] rounded-full"
          style={{ backgroundColor: edge }}
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-x-0 top-0 block h-[92%] rounded-full border-[0.35rem] transition-transform duration-75',
            isPressed ? 'translate-y-[6%]' : 'translate-y-0',
          )}
          style={{
            borderColor: edge,
            backgroundColor: body,
            // Reflet et relief en dégradés radiaux : le dôme se lit comme un bouton, pas comme un disque plat.
            backgroundImage: `radial-gradient(circle at 34% 28%, ${light} 0, ${light} 12%, transparent 46%), radial-gradient(circle at 50% 120%, ${shade} 0, transparent 58%)`,
            boxShadow: isPressed
              ? `0 0 0 0.6rem rgb(255 255 255 / 0.7), 0 0 2.5rem 0.8rem ${light}`
              : 'none',
          }}
        >
          {isRemote ? <RemoteOkIcon /> : null}
        </span>
      </span>
      {hand === 'none' ? null : (
        <span
          aria-hidden="true"
          data-hand={hand}
          className="pointer-events-none absolute top-1/2 left-1/2 z-10 size-[clamp(4.5rem,40cqmin,9rem)] -translate-x-[42%]"
        >
          <span
            className={cn('block size-full', hand === 'tap' ? 'gng-hand-tap' : 'gng-hand-freeze')}
            style={{
              animation:
                hand === 'tap'
                  ? 'gng-hand-tap 1.6s ease-in-out infinite'
                  : 'gng-hand-freeze 1.1s ease-out both',
            }}
          >
            <GestureHand />
          </span>
        </span>
      )}
    </button>
  );
}
