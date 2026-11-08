import { OwlMascot } from '@/games/bear-sort/components/OwlMascot';
import * as tokens from '@/games/go-no-go/components/art-tokens';
import { CatPuppet, FoxPuppet } from '@/games/go-no-go/components/art/puppets';
import { Buzzer } from '@/games/go-no-go/components/Buzzer';
import { Garland } from '@/games/go-no-go/components/Garland';
import { ImageArt } from '@/games/go-no-go/components/ImageArt';
import { Stage } from '@/games/go-no-go/components/Stage';
import type { MascotPose, Scene } from '@/games/go-no-go/run';
import { EMPTY_SCENE } from '@/games/go-no-go/run';
import { FLYING_IMAGES, GROUNDED_IMAGES, IMAGE_IDS } from '@/games/go-no-go/subjects';
import type { ImageId, SubjectId } from '@/games/go-no-go/types';
import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { GO_NO_GO_KEYFRAMES } = tokens;

/** Teinte (0-360), saturation et clarté (0-1) d'une couleur `#rgb` ou `#rrggbb`. */
function toHsl(hex: string): { h: number; s: number; l: number } {
  const digits =
    hex.length === 4
      ? hex
          .slice(1)
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : hex.slice(1);
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/** Un rouge franc : celui que le jeu réserve au panneau STOP. Les roses clairs et les oranges n'en sont pas. */
function isRed(hex: string): boolean {
  const { h, s, l } = toHsl(hex);
  return s > 0.45 && l > 0.15 && l < 0.85 && (h <= 14 || h >= 346);
}

function colorsIn(markup: string): string[] {
  return [...markup.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)].map((match) => match[0]);
}

const FLYING_SET: ReadonlySet<ImageId> = new Set(FLYING_IMAGES);

describe('Dessins des images (FEAT-28 §4.2)', () => {
  it.each(IMAGE_IDS)('« %s » est un dessin plat, décoratif, sans texte ni identifiant', (image) => {
    const { container } = render(<ImageArt image={image} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('viewBox', '0 0 100 100');
    expect(svg).toHaveAttribute('data-image', image);
    expect(svg?.hasAttribute('data-flies')).toBe(FLYING_SET.has(image));
    expect(
      container.querySelectorAll('path, circle, ellipse, rect, polygon').length,
    ).toBeGreaterThan(6);
    for (const forbidden of ['text', 'image', 'filter', 'linearGradient', 'radialGradient']) {
      expect(container.querySelector(forbidden)).toBeNull();
    }
    expect(container.querySelector('[id]')).toBeNull();
  });

  it('compte six images qui volent et douze qui ne volent pas', () => {
    expect(FLYING_IMAGES).toHaveLength(6);
    expect(GROUNDED_IMAGES).toHaveLength(12);
    const { container } = render(
      <>
        {IMAGE_IDS.map((image) => (
          <ImageArt key={image} image={image} />
        ))}
      </>,
    );
    expect(container.querySelectorAll('[data-flies]')).toHaveLength(6);
    expect(container.querySelectorAll('svg')).toHaveLength(18);
  });

  it('accepte une classe de mise en page', () => {
    const { container } = render(<ImageArt image="cow" className="size-8" />);
    expect(container.querySelector('svg')).toHaveClass('size-8');
  });
});

describe('Marionnettes du castelet', () => {
  it.each([
    ['le renard', FoxPuppet],
    ['le chat', CatPuppet],
  ])('%s a deux bras et une tête animables', (_name, Puppet) => {
    const { container } = render(<Puppet />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.go-no-go-arm-left')).not.toBeNull();
    expect(container.querySelector('.go-no-go-arm-right')).not.toBeNull();
    expect(container.querySelector('.go-no-go-head')).not.toBeNull();
    expect(container.querySelector('.go-no-go-arm-left')).toHaveStyle({ transformBox: 'view-box' });
  });

  it.each([
    ['le renard', FoxPuppet],
    ['le chat', CatPuppet],
  ])('%s change de mine : neutre, clin d’œil, bouderie', (_name, Puppet) => {
    const markups = (['neutral', 'wink', 'sulk'] as const).map(
      (expression) => render(<Puppet expression={expression} />).container.innerHTML,
    );
    expect(new Set(markups).size).toBe(3);
    // Sans mine précisée : neutre.
    expect(render(<Puppet />).container.innerHTML).toBe(markups[0]);
  });
});

describe('Pas de rouge hors du panneau STOP', () => {
  it('ne se trompe pas sur les teintes : un rouge est un rouge, un rose ou un orange non', () => {
    expect(isRed('#dc2626')).toBe(true);
    expect(isRed('#ef4444')).toBe(true);
    expect(isRed('#e11d48')).toBe(true);
    expect(isRed('#fb923c')).toBe(false);
    expect(isRed('#f9a8d4')).toBe(false);
    expect(isRed('#fbcfe8')).toBe(false);
    expect(isRed('#8b5cf6')).toBe(false);
    expect(isRed('#1e293b')).toBe(false);
    expect(toHsl('#fff')).toEqual({ h: 0, s: 0, l: 1 });
  });

  it('aucun dessin d’image ni de marionnette n’est rouge', () => {
    const { container } = render(
      <>
        {IMAGE_IDS.map((image) => (
          <ImageArt key={image} image={image} />
        ))}
        {(['neutral', 'wink', 'sulk'] as const).map((expression) => (
          <div key={expression}>
            <FoxPuppet expression={expression} />
            <CatPuppet expression={expression} />
          </div>
        ))}
      </>,
    );
    const colors = colorsIn(container.innerHTML);
    expect(colors.length).toBeGreaterThan(200);
    expect(colors.filter(isRed)).toEqual([]);
  });

  it('aucun jeton de couleur n’est rouge : scène, castelet, collines, buzzer, perles', () => {
    const palette = Object.entries(tokens).flatMap(([name, value]) =>
      typeof value === 'string' && /^#[0-9a-f]{3,6}$/i.test(value) ? [[name, value] as const] : [],
    );
    expect(palette.length).toBeGreaterThan(15);
    expect(palette.filter(([, value]) => isRed(value)).map(([name]) => name)).toEqual([]);
  });

  it('aucune scène n’est rouge hors du panneau STOP', () => {
    for (const rule of ['owl-says', 'flies', 'late-stop'] as const) {
      const { container } = render(
        <Stage
          config={{ rule, hideouts: 3 }}
          scene={{ ...EMPTY_SCENE, subject: rule === 'owl-says' ? 'owl' : 'cow' }}
          mascot={{ isVisible: true, mood: 'idle' }}
        />,
      );
      expect(colorsIn(container.innerHTML).filter(isRed)).toEqual([]);
    }
  });
});

describe('Images clés CSS', () => {
  const blocks = [...GO_NO_GO_KEYFRAMES.matchAll(/@keyframes ([\w-]+)\{(.*?)\}\}?(?=@|\.|$)/g)];

  it('n’anime que `transform` et `opacity` : 60 images par seconde sur un boîtier modeste', () => {
    const names = [...GO_NO_GO_KEYFRAMES.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(18);
    const properties = new Set(
      [...GO_NO_GO_KEYFRAMES.matchAll(/@keyframes [\w-]+\{(?:[^{}]*\{[^{}]*\})+\}/g)].flatMap(
        ([block]) => [...block.matchAll(/([a-z-]+):/g)].map((m) => m[1]),
      ),
    );
    expect([...properties].sort()).toEqual(['opacity', 'transform']);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('adoucit tout sous « animations réduites » : fondus, poses fixes, bras levés', () => {
    expect(GO_NO_GO_KEYFRAMES).toContain('@media (prefers-reduced-motion:reduce)');
    const reduced = GO_NO_GO_KEYFRAMES.slice(GO_NO_GO_KEYFRAMES.indexOf('@media'));
    for (const name of ['gng-rise', 'gng-fly-away', 'gng-sulk', 'gng-try-fly', 'gng-statue']) {
      expect(reduced).toContain(`.${name}`);
    }
    expect(reduced).toContain('rotate(70deg)');
  });

  it('chaque animation utilisée par la scène est définie', () => {
    const defined = new Set(
      [...GO_NO_GO_KEYFRAMES.matchAll(/@keyframes ([\w-]+)/g)].map((match) => match[1]),
    );
    const moments = ['entering', 'caught', 'missed', 'trapped', 'passed'] as const;
    const subjects: [SubjectId, Scene['kind']][] = [
      ['owl', 'target'],
      ['fox', 'trap'],
      ['cow', 'trap'],
      ['pigeon', 'stop'],
    ];
    const used = new Set<string>();
    for (const moment of moments) {
      for (const [subject, kind] of subjects) {
        const { container } = render(
          <Stage
            config={{
              rule: subject === 'owl' || subject === 'fox' ? 'owl-says' : 'flies',
              hideouts: 1,
            }}
            scene={{
              ...EMPTY_SCENE,
              subject,
              kind,
              moment,
              hasStop: kind === 'stop',
              hasNoBadge: true,
            }}
            mascot={{ isVisible: false, mood: 'idle' }}
          />,
        );
        for (const element of container.querySelectorAll<HTMLElement>('[style*="animation"]')) {
          const animation = element.style.animation;
          for (const name of animation.match(/gng-[\w-]+/g) ?? []) used.add(name);
        }
      }
    }
    expect(used.size).toBeGreaterThan(8);
    for (const name of used) expect(defined.has(name)).toBe(true);
  });
});

function stage(
  scene: Partial<Scene>,
  rule: 'owl-says' | 'flies' | 'late-stop' = 'owl-says',
  hideouts: 1 | 3 = 1,
) {
  return render(
    <Stage
      config={{ rule, hideouts }}
      scene={{ ...EMPTY_SCENE, ...scene }}
      mascot={{ isVisible: false, mood: 'idle' }}
    />,
  );
}

describe('Scène', () => {
  it('est décorative : aucune annonce, aucun texte', () => {
    const { container } = stage({ subject: 'owl' });
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('svg, style').forEach((node) => {
      node.remove();
    });
    expect(clone.textContent).toBe('');
  });

  it('hisse ses images clés dans le <head>, une seule fois', () => {
    stage({ subject: 'owl' });
    stage({ subject: 'fox' });
    const styles = [...document.head.querySelectorAll('style')].filter((style) =>
      style.textContent.includes('@keyframes gng-rise'),
    );
    expect(styles).toHaveLength(1);
  });

  it('règle 1 : le castelet a une fenêtre, ou trois, et le personnage sort de la sienne', () => {
    expect(stage({ subject: 'owl' }).container.querySelectorAll('[data-hideout]')).toHaveLength(1);
    const { container } = stage({ subject: 'fox', kind: 'trap', hideout: 2 }, 'owl-says', 3);
    expect(container.querySelectorAll('[data-hideout]')).toHaveLength(3);
    expect(container.querySelector('[data-hideout="2"] [data-figure="fox"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-figure]')).toHaveLength(1);
  });

  it('règles 2 et 3 : les collines, sans castelet', () => {
    const { container } = stage({ subject: 'plane' }, 'flies');
    expect(container.querySelector('[data-hills]')).not.toBeNull();
    expect(container.querySelector('[data-castelet]')).toBeNull();
    expect(container.querySelector('[data-figure="plane"]')).not.toBeNull();
  });

  it('une scène vide ne montre aucune silhouette', () => {
    expect(stage({}).container.querySelector('[data-figure]')).toBeNull();
    expect(stage({}, 'flies').container.querySelector('[data-figure]')).toBeNull();
  });

  it('même entrée pour tous : la même animation, lente seulement sous l’aide', () => {
    const animations = (subject: SubjectId, rule: 'owl-says' | 'flies', isSlow = false) =>
      stage({ subject, isSlow }, rule).container.querySelector<HTMLElement>('[data-figure]')?.style
        .animation;
    expect(animations('owl', 'owl-says')).toBe(animations('fox', 'owl-says'));
    expect(animations('cow', 'flies')).toBe(animations('plane', 'flies'));
    expect(animations('cow', 'flies')).toBe(animations('owl', 'owl-says'));
    expect(animations('cow', 'flies')).toContain('250ms');
    expect(animations('cow', 'flies', true)).toContain('600ms');
  });

  it('le signal : le renard et le chat battent des bras, la chouette bat des ailes', () => {
    expect(
      stage({ subject: 'fox', kind: 'trap' }).container.querySelector('.gng-signal'),
    ).not.toBeNull();
    expect(
      stage({ subject: 'cat', kind: 'trap' }).container.querySelector('.gng-signal'),
    ).not.toBeNull();
    const owl = stage({ subject: 'owl' }).container;
    expect(owl.querySelector('.gng-signal')).toBeNull();
    expect(owl.querySelector('svg[data-mood="flap"]')).not.toBeNull();
    // Une image n'a pas de bras à lever.
    expect(stage({ subject: 'plane' }, 'flies').container.querySelector('.gng-signal')).toBeNull();
    // Le signal n'est que celui de l'attente.
    expect(
      stage({ subject: 'fox', kind: 'trap', moment: 'trapped' }).container.querySelector(
        '.gng-signal',
      ),
    ).toBeNull();
  });

  it('attrapée : la chouette saute de joie dans un éclat d’étincelles, une image s’envole', () => {
    const owl = stage({ subject: 'owl', moment: 'caught' }).container;
    expect(owl.querySelector('[data-figure]')).toHaveClass('gng-hoot');
    expect(owl.querySelector('svg[data-mood="happy"]')).not.toBeNull();
    expect(owl.querySelectorAll('[data-sparks] > span')).toHaveLength(6);
    const plane = stage({ subject: 'plane', moment: 'caught' }, 'flies').container;
    expect(plane.querySelector('[data-figure]')).toHaveClass('gng-fly-away');
    expect(plane.querySelector('[data-sparks]')).toBeNull();
  });

  it('ratée : elle s’en va doucement, l’oiseau s’envole tout seul', () => {
    expect(
      stage({ subject: 'owl', moment: 'missed' }).container.querySelector('[data-figure]'),
    ).toHaveClass('gng-sink');
    expect(
      stage({ subject: 'pigeon', moment: 'missed' }, 'flies').container.querySelector(
        '[data-figure]',
      ),
    ).toHaveClass('gng-fly-away');
  });

  it('piège touché : rien de drôle, le renard fait un clin d’œil, la vache reste là', () => {
    const fox = stage({ subject: 'fox', kind: 'trap', moment: 'trapped' }).container;
    expect(fox.querySelector<HTMLElement>('[data-figure]')?.style.animation).toBe('none');
    const wink = fox.innerHTML;
    const neutral = stage({ subject: 'fox', kind: 'trap' }).container.innerHTML;
    expect(wink).not.toBe(neutral);
    const cow = stage({ subject: 'cow', kind: 'trap', moment: 'trapped' }, 'flies').container;
    expect(cow.querySelector<HTMLElement>('[data-figure]')?.style.animation).toBe('none');
  });

  it('le gag, seulement sur un piège laissé passer : le renard boude, l’image tente de s’envoler', () => {
    const fox = stage({ subject: 'fox', kind: 'trap', moment: 'passed' }).container;
    expect(fox.querySelector('[data-figure]')).toHaveClass('gng-sulk');
    const cow = stage({ subject: 'cow', kind: 'trap', moment: 'passed' }, 'flies').container;
    expect(cow.querySelector('[data-figure]')).toHaveClass('gng-try-fly');
    expect(cow.querySelector('[data-ice]')).toBeNull();
    for (const moment of ['entering', 'caught', 'missed', 'trapped'] as const) {
      const { container } = stage({ subject: 'cow', kind: 'trap', moment }, 'flies');
      const figure = container.querySelector('[data-figure]');
      expect(figure).not.toHaveClass('gng-try-fly');
      expect(figure).not.toHaveClass('gng-sulk');
      expect(figure).not.toHaveClass('gng-statue');
    }
  });

  it('STOP tardif laissé passer : l’oiseau se fige comme une statue, sous un voile de givre', () => {
    const { container } = stage(
      { subject: 'pigeon', kind: 'stop', moment: 'passed', hasStop: true },
      'late-stop',
    );
    expect(container.querySelector('[data-figure]')).toHaveClass('gng-statue');
    expect(container.querySelector('[data-ice]')).not.toBeNull();
    expect(container.querySelector('[data-stop-sign]')).not.toBeNull();
  });

  it('le panneau STOP surgit sur l’image, aux collines seulement, et seulement quand il est arrivé', () => {
    expect(
      stage({ subject: 'pigeon', kind: 'stop' }, 'late-stop').container.querySelector(
        '[data-stop-sign]',
      ),
    ).toBeNull();
    const { container } = stage({ subject: 'pigeon', kind: 'stop', hasStop: true }, 'late-stop');
    const sign = container.querySelector('[data-stop-sign]');
    expect(sign).not.toBeNull();
    expect(sign?.querySelector('svg[data-pulsing], svg')).not.toBeNull();
  });

  it('le signe « non » se pose sur le piège qui porte l’aide la plus forte', () => {
    expect(
      stage({ subject: 'fox', kind: 'trap', hasNoBadge: true }).container.querySelector(
        '[data-no-badge]',
      ),
    ).not.toBeNull();
    expect(
      stage({ subject: 'fox', kind: 'trap' }).container.querySelector('[data-no-badge]'),
    ).toBeNull();
  });

  it.each(['idle', 'happy', 'flap', 'talking', 'no'] as const)(
    'la mascotte du coin prend l’humeur « %s » quand elle est visible',
    (mood) => {
      const { container } = render(
        <Stage
          config={{ rule: 'flies', hideouts: 1 }}
          scene={EMPTY_SCENE}
          mascot={{ isVisible: true, mood }}
        />,
      );
      expect(container.querySelector('[data-mascot]')).toHaveAttribute('data-mood', mood);
    },
  );

  it('la mascotte du coin est absente tant qu’elle n’est pas visible', () => {
    expect(stage({}, 'flies').container.querySelector('[data-mascot]')).toBeNull();
  });

  it('expose la règle, le moment et l’image pour les essais', () => {
    const { container } = stage({ subject: 'cow', kind: 'trap', moment: 'trapped' }, 'flies');
    const root = container.firstElementChild;
    expect(root).toHaveAttribute('data-stage', 'flies');
    expect(root).toHaveAttribute('data-moment', 'trapped');
    expect(root).toHaveAttribute('data-subject', 'cow');
    expect(stage({}).container.firstElementChild?.hasAttribute('data-subject')).toBe(false);
  });
});

describe('Buzzer', () => {
  function buzzer(props: Partial<Parameters<typeof Buzzer>[0]> = {}) {
    const onAssistiveClick = vi.fn();
    const view = render(
      <Buzzer
        isPressed={false}
        isDisabled={false}
        isPulsing={false}
        isRemote={false}
        hand="none"
        onAssistiveClick={onAssistiveClick}
        {...props}
      />,
    );
    return {
      ...view,
      onAssistiveClick,
      button: within(view.container).getByRole('button', { name: 'Taper' }),
    };
  }

  it('est un bouton nommé « Taper », jamais rouge', () => {
    const { button, container } = buzzer();
    expect(button).toBeInTheDocument();
    expect(colorsIn(container.innerHTML).filter(isRed)).toEqual([]);
    for (const state of [{ isPressed: true }, { isDisabled: true }, { isPulsing: true }]) {
      expect(colorsIn(buzzer(state).container.innerHTML).filter(isRed)).toEqual([]);
    }
  });

  it('s’enfonce et s’illumine à l’appui, et se relève', () => {
    const idle = buzzer();
    expect(idle.button).not.toHaveAttribute('data-pressed');
    const pressed = buzzer({ isPressed: true });
    expect(pressed.button).toHaveAttribute('data-pressed', 'true');
    expect(pressed.container.innerHTML).toContain('translate-y-[6%]');
    expect(pressed.container.innerHTML).toContain('0 0 0 0.6rem');
  });

  it('se grise pendant une pause : un bouton désactivé pour le lecteur d’écran, sans l’être pour le focus', () => {
    const { button } = buzzer({ isDisabled: true });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('data-disabled', 'true');
    expect(button).not.toBeDisabled();
  });

  it('pulse quand il attend, sauf pendant qu’il est enfoncé', () => {
    const waiting = buzzer({ isPulsing: true });
    expect(waiting.button).toHaveAttribute('data-pulsing');
    expect(
      waiting.container.querySelector<HTMLElement>('button > span')?.style.animation,
    ).toContain('gng-buzzer-pulse');
    const pressed = buzzer({ isPulsing: true, isPressed: true });
    expect(pressed.container.querySelector<HTMLElement>('button > span')?.style.animation).toBe(
      'none',
    );
  });

  it('porte l’icône du bouton OK de la télécommande au D-Pad, sans texte', () => {
    expect(buzzer().container.querySelector('[data-remote-icon]')).toBeNull();
    const { container, button } = buzzer({ isRemote: true });
    expect(container.querySelector('[data-remote-icon]')).not.toBeNull();
    expect(button.textContent).toBe('');
  });

  it('montre la main fantôme : elle tape, ou se fige en l’air', () => {
    expect(buzzer().container.querySelector('[data-hand]')).toBeNull();
    const tap = buzzer({ hand: 'tap' }).container.querySelector('[data-hand]');
    expect(tap).toHaveAttribute('data-hand', 'tap');
    expect(tap?.querySelector('.gng-hand-tap')).not.toBeNull();
    const freeze = buzzer({ hand: 'freeze' }).container.querySelector('[data-hand]');
    expect(freeze?.querySelector('.gng-hand-freeze')).not.toBeNull();
    expect(tap).toHaveClass('pointer-events-none');
  });

  it('transmet un clic de lecteur d’écran, et le focus', () => {
    const onFocus = vi.fn();
    const { button, onAssistiveClick } = buzzer({ onFocus });
    fireEvent.click(button);
    expect(onAssistiveClick).toHaveBeenCalledOnce();
    button.focus();
    expect(onFocus).toHaveBeenCalledOnce();
  });
});

describe('Guirlande', () => {
  it('compte une perle par apparition prévue, allumée quand elle est réussie, sans chiffre', () => {
    const { container, getByRole } = render(<Garland total={12} cleared={5} />);
    expect(getByRole('img', { name: '5 sur 12 réussies' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-pearl="lit"]')).toHaveLength(5);
    expect(container.querySelectorAll('[data-pearl="dark"]')).toHaveLength(7);
    expect(container.textContent).toBe('');
  });

  it('allume les perles de gauche à droite', () => {
    const { container } = render(<Garland total={6} cleared={2} />);
    const states = [...container.querySelectorAll('[data-pearl]')].map((pearl) =>
      pearl.getAttribute('data-pearl'),
    );
    expect(states).toEqual(['lit', 'lit', 'dark', 'dark', 'dark', 'dark']);
  });

  it('distingue l’état sans la couleur : disque plein doré, simple contour', () => {
    const { container } = render(<Garland total={2} cleared={1} />);
    const [lit, dark] = [...container.querySelectorAll<HTMLElement>('[data-pearl]')];
    expect(lit?.style.backgroundColor).not.toBe('');
    expect(dark?.style.backgroundColor).toBe('');
    expect(dark).toHaveClass('bg-transparent');
  });

  it('tient jusqu’à 40 perles sans déborder : elles passent à la ligne', () => {
    const { container } = render(<Garland total={40} cleared={0} />);
    expect(container.querySelectorAll('[data-pearl]')).toHaveLength(40);
    expect(container.firstElementChild).toHaveClass('flex-wrap');
  });
});

describe('Chouette du castelet', () => {
  it.each(['idle', 'happy', 'flap'] as const satisfies readonly MascotPose[])(
    'prend la pose « %s »',
    (pose) => {
      const { container } = render(<OwlMascot mood={pose} />);
      expect(container.querySelector('svg')).toHaveAttribute('data-mood', pose);
    },
  );

  it('l’humeur « flap » lève les ailes : un battement, et des ailes levées sans animation', () => {
    const { container } = render(<OwlMascot mood="flap" />);
    const html = container.innerHTML;
    expect(html).toContain('bear-sort-owl-wave-left');
    expect(html).toContain('bear-sort-owl-wave-right');
    expect(html).toContain('motion-reduce:rotate-[62deg]');
    expect(html).toContain('motion-reduce:-rotate-[62deg]');
    // Le bec s'entrouvre, les yeux restent ouverts.
    expect(container.querySelector('[data-eyes="smiling"]')).toBeNull();
    expect(container.querySelector<SVGElement>('[data-beak="lower"]')?.style.transform).toBe(
      'translateY(3.5px)',
    );
  });
});
