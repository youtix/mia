import { getArtPalette, GREY_PALETTE } from '@/games/bear-sort/components/art-tokens';
import { BearBox } from '@/games/bear-sort/components/BearBox';
import { BearFigure } from '@/games/bear-sort/components/BearFigure';
import { GestureHand } from '@/games/bear-sort/components/GestureHand';
import { NoBadge } from '@/games/bear-sort/components/NoBadge';
import { OwlMascot, type MascotMood } from '@/games/bear-sort/components/OwlMascot';
import { RulePicture } from '@/games/bear-sort/components/RulePicture';
import { StarAward } from '@/games/bear-sort/components/StarAward';
import { StopSign } from '@/games/bear-sort/components/StopSign';
import { getRuleLabel } from '@/games/bear-sort/labels';
import type {
  BearColor,
  BearSize,
  BearSortRule,
  BearTraits,
  SortFeature,
} from '@/games/bear-sort/types';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

const COLORS: readonly BearColor[] = ['blue', 'yellow'];
const SIZES: readonly BearSize[] = ['small', 'big'];
const FADED: readonly (SortFeature | null)[] = [null, 'color', 'size'];
const MOODS: readonly MascotMood[] = ['idle', 'talking', 'happy', 'no'];

const TRAITS: readonly BearTraits[] = COLORS.flatMap((color) =>
  SIZES.map((size) => ({ color, size })),
);

const SORT_RULES: readonly BearSortRule[] = [
  { kind: 'sort', feature: 'color' },
  { kind: 'sort', feature: 'size' },
];

const EXCEPT_RULES: readonly BearSortRule[] = [
  ...COLORS.map((color): BearSortRule => ({ kind: 'except', forbidden: { color } })),
  ...SIZES.map((size): BearSortRule => ({ kind: 'except', forbidden: { size } })),
  ...TRAITS.map((forbidden): BearSortRule => ({ kind: 'except', forbidden })),
];

const ALL_RULES: readonly BearSortRule[] = [...SORT_RULES, ...EXCEPT_RULES];

/** Tous les dessins, dans toutes les combinaisons de leurs props, hors panneau STOP. */
const ART_WITHOUT_STOP: readonly (readonly [string, ReactElement])[] = [
  ...TRAITS.flatMap(({ color, size }) =>
    FADED.map(
      (faded) =>
        [
          `BearFigure ${color} ${size} ${String(faded)}`,
          <BearFigure key="bear" color={color} size={size} fadedFeature={faded} />,
        ] as const,
    ),
  ),
  ...[...TRAITS, null].flatMap((traits) =>
    FADED.flatMap((faded) =>
      [false, true].map(
        (isGlowing) =>
          [
            `BearBox ${JSON.stringify(traits)} ${String(faded)} ${String(isGlowing)}`,
            <BearBox key="box" traits={traits} fadedFeature={faded} isGlowing={isGlowing} />,
          ] as const,
      ),
    ),
  ),
  ...MOODS.map((mood) => [`OwlMascot ${mood}`, <OwlMascot key="owl" mood={mood} />] as const),
  ...ALL_RULES.flatMap((rule) =>
    [false, true].map(
      (isPulsing) =>
        [
          `RulePicture ${JSON.stringify(rule)} ${String(isPulsing)}`,
          <RulePicture key="rule" rule={rule} isPulsing={isPulsing} />,
        ] as const,
    ),
  ),
  ['StarAward sans couronne', <StarAward key="star" hasCrown={false} />],
  ['StarAward avec couronne', <StarAward key="star" hasCrown />],
  ['GestureHand', <GestureHand key="hand" />],
  ['NoBadge', <NoBadge key="no" />],
];

const STOP_SIGNS: readonly (readonly [string, ReactElement])[] = [
  ['StopSign au repos', <StopSign key="stop" />],
  ['StopSign pulsant', <StopSign key="stop" isPulsing />],
];

function getSvg(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('Aucun <svg> rendu');
  return svg;
}

function getElement(root: ParentNode, selector: string): Element {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Aucun élément pour ${selector}`);
  return element;
}

/** Le groupe qui porte l'échelle du dessin, juste sous le `<svg>`. */
function getDrawingStyle(svg: SVGSVGElement): CSSStyleDeclaration {
  const drawing = svg.querySelector('svg > g');
  if (!(drawing instanceof SVGElement)) throw new Error('Aucun groupe de dessin');
  return drawing.style;
}

/** Teinte (0–360), saturation et luminosité (0–1) d'une couleur `#rrggbb`. */
function toHsl(hex: string): { hue: number; saturation: number; lightness: number } {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = ((value >> 16) & 0xff) / 255;
  const green = ((value >> 8) & 0xff) / 255;
  const blue = (value & 0xff) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = (green - blue) / delta;
  if (max === green) hue = (blue - red) / delta + 2;
  if (max === blue) hue = (red - green) / delta + 4;
  return { hue: (hue * 60 + 360) % 360, saturation, lightness };
}

/** Rouge, rose vif ou vermillon : tout ce qu'un enfant pourrait lire comme le rouge du STOP. */
function isReddish(hex: string): boolean {
  const { hue, saturation, lightness } = toHsl(hex);
  return (hue <= 20 || hue >= 330) && saturation >= 0.25 && lightness > 0.1 && lightness < 0.96;
}

/** Couleurs hexadécimales d'un balisage, en `#rrggbb` minuscule. */
function getHexColors(markup: string): string[] {
  return [...markup.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map(([, hex = '']) =>
    `#${hex.length === 3 ? hex.replace(/./g, '$&$&') : hex}`.toLowerCase(),
  );
}

function getAllStyleText(): string {
  return [...document.head.querySelectorAll('style')].map((style) => style.textContent).join('');
}

/** Classes d'animation de tous les éléments du balisage. */
function getAnimationClasses(root: Element): string[] {
  return [root, ...root.querySelectorAll('*')].flatMap((element) =>
    (element.getAttribute('class') ?? '').split(/\s+/).filter((name) => name.includes('animate-')),
  );
}

describe('BearFigure', () => {
  it.each(TRAITS)('dessine le même ours décoratif pour $color $size', ({ color, size }) => {
    const { container } = render(<BearFigure color={color} size={size} />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('data-color', color);
    expect(svg).toHaveAttribute('data-size', size);
    expect(svg).not.toHaveAttribute('data-faded');
    expect(container.textContent).toBe('');
  });

  it('remplit son parent et accepte une classe', () => {
    const { container, rerender } = render(<BearFigure color="blue" size="big" />);
    expect(getSvg(container)).toHaveClass('size-full');

    rerender(<BearFigure color="blue" size="big" className="size-10" />);
    expect(getSvg(container)).toHaveClass('size-10');
    expect(getSvg(container)).not.toHaveClass('size-full');
  });

  it('dessine les quatre sortes avec les mêmes formes', () => {
    const shapesOf = (color: BearColor, size: BearSize): string => {
      const { container, unmount } = render(<BearFigure color={color} size={size} />);
      const shapes = [...getSvg(container).querySelectorAll('g > *')].map((shape) =>
        [shape.tagName, shape.getAttribute('d'), shape.getAttribute('cx')].join(':'),
      );
      unmount();
      return shapes.join('|');
    };

    const reference = shapesOf('blue', 'big');
    expect(reference.split('|').length).toBeGreaterThan(15);
    TRAITS.forEach(({ color, size }) => {
      expect(shapesOf(color, size)).toBe(reference);
    });
  });

  it('ancre le dessin en bas au centre, et le petit ours à 62 %', () => {
    const { container, rerender } = render(<BearFigure color="blue" size="big" />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMax meet');
    expect(getDrawingStyle(svg).transform).toBe('scale(1)');
    expect(getDrawingStyle(svg).transformOrigin).toBe('50px 100px');

    rerender(<BearFigure color="blue" size="small" />);
    expect(getDrawingStyle(svg).transform).toBe('scale(0.62)');
  });

  it.each(TRAITS)('passe $color $size en gris quand la couleur est estompée', ({ color, size }) => {
    const { container } = render(<BearFigure color={color} size={size} fadedFeature="color" />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('data-faded', 'color');
    expect(svg).toHaveAttribute('data-color', color);
    expect(svg.innerHTML).toContain(GREY_PALETTE.body);
    expect(svg.innerHTML).not.toContain(getArtPalette(color, null).body);
    // La couleur s'estompe, la taille reste.
    expect(getDrawingStyle(svg).transform).toBe(size === 'big' ? 'scale(1)' : 'scale(0.62)');
  });

  it.each(TRAITS)(
    'égalise la taille de $color $size quand elle est estompée',
    ({ color, size }) => {
      const { container } = render(<BearFigure color={color} size={size} fadedFeature="size" />);
      const svg = getSvg(container);

      expect(svg).toHaveAttribute('data-faded', 'size');
      expect(getDrawingStyle(svg).transform).toBe('scale(0.8)');
      // La taille s'estompe, la couleur reste.
      expect(svg.innerHTML).toContain(getArtPalette(color, null).body);
    },
  );

  it('estompe la couleur et la taille par une transition de 400 ms, coupée si les animations sont réduites', () => {
    const { container } = render(<BearFigure color="yellow" size="big" />);
    const drawing = getElement(getSvg(container), 'svg > g');

    expect(drawing).toHaveClass(
      'motion-safe:transition-transform',
      'motion-safe:duration-400',
      'motion-safe:[&>*]:transition-colors',
      'motion-safe:[&>*]:duration-400',
    );
  });
});

describe('BearBox', () => {
  it.each(TRAITS)('reprend la couleur des ours pour la boîte $color $size', ({ color, size }) => {
    const { container } = render(<BearBox traits={{ color, size }} />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('data-box-color', color);
    expect(svg).toHaveAttribute('data-box-size', size);
    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMax meet');
    expect(svg).not.toHaveAttribute('data-faded');
    expect(svg).not.toHaveAttribute('data-glowing');
    expect(svg.innerHTML).toContain(getArtPalette(color, null).body);
    expect(getDrawingStyle(svg).transform).toBe(size === 'big' ? 'scale(1)' : 'scale(0.68)');
    expect(getDrawingStyle(svg).transformOrigin).toBe('50px 100px');
  });

  it('dessine une grande boîte ardoise quand elle n’a ni couleur ni taille', () => {
    const { container } = render(<BearBox traits={null} />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('data-box-color', 'neutral');
    expect(svg).not.toHaveAttribute('data-box-size');
    expect(svg.innerHTML).toContain(GREY_PALETTE.body);
    COLORS.forEach((color) => {
      expect(svg.innerHTML).not.toContain(getArtPalette(color, null).body);
    });
    expect(getDrawingStyle(svg).transform).toBe('scale(1)');
  });

  it.each(TRAITS)('estompe la couleur de la boîte $color $size', ({ color, size }) => {
    const { container } = render(<BearBox traits={{ color, size }} fadedFeature="color" />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('data-faded', 'color');
    expect(svg.innerHTML).toContain(GREY_PALETTE.body);
    expect(svg.innerHTML).not.toContain(getArtPalette(color, null).body);
  });

  it.each(TRAITS)('égalise la taille de la boîte $color $size', ({ color, size }) => {
    const { container } = render(<BearBox traits={{ color, size }} fadedFeature="size" />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('data-faded', 'size');
    expect(getDrawingStyle(svg).transform).toBe('scale(0.84)');
    expect(svg.innerHTML).toContain(getArtPalette(color, null).body);
  });

  it('garde la boîte ouverte entière même si la taille est estompée', () => {
    const { container } = render(<BearBox traits={null} fadedFeature="size" />);
    expect(getDrawingStyle(getSvg(container)).transform).toBe('scale(1)');
  });

  it('allume un halo doux et pulsant seulement sur la bonne boîte', () => {
    const { container, rerender } = render(
      <BearBox traits={{ color: 'blue', size: 'small' }} isGlowing />,
    );
    const svg = getSvg(container);
    const glow = getElement(svg, '[data-glow]');

    expect(svg).toHaveAttribute('data-glowing', 'true');
    expect(glow).toHaveClass('motion-safe:animate-pulse');
    expect(glow.getAttribute('stroke')).toBe('#dcfce7');

    rerender(<BearBox traits={{ color: 'blue', size: 'small' }} />);
    expect(svg).not.toHaveAttribute('data-glowing');
    expect(svg.querySelector('[data-glow]')).toBeNull();
  });

  it('fait varier la couleur par une transition de 400 ms', () => {
    const { container } = render(<BearBox traits={{ color: 'blue', size: 'big' }} />);
    expect(getElement(getSvg(container), 'svg > g')).toHaveClass(
      'motion-safe:transition-transform',
      'motion-safe:[&>*]:transition-colors',
      'motion-safe:[&>*]:duration-400',
    );
  });
});

describe('OwlMascot', () => {
  it.each(MOODS)('reflète l’humeur %s sur une mascotte décorative', (mood) => {
    const { container } = render(<OwlMascot mood={mood} />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('data-mood', mood);
    expect(container.textContent).toBe('');
  });

  it('idle : se balance et cligne des yeux', () => {
    const { container } = render(<OwlMascot mood="idle" />);
    const classes = getAnimationClasses(getSvg(container)).join(' ');

    expect(classes).toContain('bear-sort-owl-sway');
    expect(classes).toContain('bear-sort-owl-blink');
    expect(classes).not.toContain('bear-sort-owl-beak');
    expect(classes).not.toContain('bear-sort-owl-hop');
    expect(classes).not.toContain('bear-sort-owl-shake');
    expect(getElement(getSvg(container), '[data-beak="lower"]')).not.toHaveAttribute('style');
  });

  it('talking : ouvre et ferme le bec en boucle, et le garde entrouvert sans animation', () => {
    const { container } = render(<OwlMascot mood="talking" />);
    const beak = getElement(getSvg(container), '[data-beak="lower"]');

    expect(beak.getAttribute('class')).toContain(
      'motion-safe:animate-[bear-sort-owl-beak_0.46s_ease-in-out_infinite]',
    );
    expect(beak.getAttribute('style')).toContain('translateY(3.5px)');
  });

  it('happy : saute, bat des ailes et plisse les yeux de joie', () => {
    const { container } = render(<OwlMascot mood="happy" />);
    const svg = getSvg(container);
    const classes = getAnimationClasses(svg).join(' ');

    expect(classes).toContain('bear-sort-owl-hop');
    expect(classes).toContain('bear-sort-owl-flap-left');
    expect(classes).toContain('bear-sort-owl-flap-right');
    expect(svg.querySelector('[data-eyes="smiling"]')).not.toBeNull();
    expect(classes).not.toContain('bear-sort-owl-blink');
  });

  it.each(MOODS.filter((mood) => mood !== 'happy'))('%s : garde les yeux ouverts', (mood) => {
    const { container } = render(<OwlMascot mood={mood} />);
    expect(getSvg(container).querySelector('[data-eyes="smiling"]')).toBeNull();
  });

  it('no : secoue la tête, le corps ne bouge pas', () => {
    const { container } = render(<OwlMascot mood="no" />);
    const svg = getSvg(container);
    const head = getElement(svg, '[class*="bear-sort-owl-shake"]');

    expect(head.tagName.toLowerCase()).toBe('g');
    expect(head.querySelector('[data-beak="lower"]')).not.toBeNull();
    expect(getAnimationClasses(svg).join(' ')).not.toContain('bear-sort-owl-sway');
    expect(getAnimationClasses(svg).join(' ')).not.toContain('bear-sort-owl-hop');
  });
});

describe('RulePicture', () => {
  it.each(ALL_RULES.map((rule) => [getRuleLabel(rule), rule] as const))(
    'expose le nom accessible « %s »',
    (label, rule) => {
      const { container } = render(<RulePicture rule={rule} />);
      const picture = screen.getByRole('img', { name: label });

      expect(picture).toHaveAttribute('data-rule', rule.kind === 'sort' ? rule.feature : 'except');
      expect(picture).not.toHaveAttribute('data-pulsing');
      expect(getSvg(container)).toHaveAttribute('aria-hidden', 'true');
      expect(container.textContent).toBe('');
    },
  );

  it('couleur : une goutte bleue et une goutte jaune, aucun ours', () => {
    const { container } = render(<RulePicture rule={{ kind: 'sort', feature: 'color' }} />);

    expect(
      [...container.querySelectorAll('[data-rule-drop]')].map((drop) =>
        drop.getAttribute('data-rule-drop'),
      ),
    ).toEqual(['blue', 'yellow']);
    expect(container.querySelector('[data-rule-bear]')).toBeNull();
    expect(container.innerHTML).toContain('#3b82f6');
    expect(container.innerHTML).toContain('#facc15');
  });

  it('taille : un petit et un grand ours gris côte à côte, sans goutte ni couleur', () => {
    const { container } = render(<RulePicture rule={{ kind: 'sort', feature: 'size' }} />);

    expect(
      [...container.querySelectorAll('[data-rule-bear]')].map((bear) =>
        bear.getAttribute('data-rule-bear'),
      ),
    ).toEqual(['grey-small', 'grey-big']);
    expect(container.querySelector('[data-rule-drop]')).toBeNull();
    expect(container.innerHTML).toContain(GREY_PALETTE.body);
    expect(container.innerHTML).not.toContain('#3b82f6');
    expect(container.innerHTML).not.toContain('#facc15');
  });

  it('suit la boîte de gauche : gouttes et ours se lisent dans le sens des boîtes', () => {
    const leftBox = { color: 'yellow', size: 'big' } as const;
    const getOrder = (root: Element, attribute: string) =>
      [...root.querySelectorAll(`[${attribute}]`)].map((element) =>
        element.getAttribute(attribute),
      );

    const { container: color } = render(
      <RulePicture rule={{ kind: 'sort', feature: 'color' }} leftBox={leftBox} />,
    );
    const { container: size } = render(
      <RulePicture rule={{ kind: 'sort', feature: 'size' }} leftBox={leftBox} />,
    );

    expect(getOrder(color, 'data-rule-drop')).toEqual(['yellow', 'blue']);
    expect(getOrder(size, 'data-rule-bear')).toEqual(['grey-big', 'grey-small']);
  });

  it.each([
    [{ color: 'blue', size: 'small' }, ['blue-small']],
    [{ color: 'yellow', size: 'big' }, ['yellow-big']],
    [{ color: 'yellow' }, ['yellow-small', 'yellow-big']],
    [{ color: 'blue' }, ['blue-small', 'blue-big']],
    [{ size: 'small' }, ['grey-small']],
    [{ size: 'big' }, ['grey-big']],
  ] as const)('sauf %j : montre %j dans le signe « non »', (forbidden, bears) => {
    const { container } = render(<RulePicture rule={{ kind: 'except', forbidden }} />);

    expect(
      [...container.querySelectorAll('[data-rule-bear]')].map((bear) =>
        bear.getAttribute('data-rule-bear'),
      ),
    ).toEqual(bears);
    expect(container.querySelector('[data-rule-drop]')).toBeNull();
    // Le signe, gris clair, passe devant les ours.
    const noSign = getElement(container, 'g[transform="translate(30 0)"]');
    expect(noSign.innerHTML).toContain('#e2e8f0');
    expect(noSign.compareDocumentPosition(getElement(container, '[data-rule-bear]'))).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
  });

  it('attire l’œil en douceur quand elle pulse', () => {
    const { container } = render(
      <RulePicture rule={{ kind: 'sort', feature: 'size' }} isPulsing />,
    );
    const picture = screen.getByRole('img', { name: 'Ranger par taille' });

    expect(picture).toHaveAttribute('data-pulsing', 'true');
    // Sans animation, le bord éclairci attire encore l'œil.
    expect(picture).toHaveClass('border-slate-100');
    expect(picture.className).toContain(
      'motion-safe:animate-[bear-sort-pulse_1.6s_ease-in-out_infinite]',
    );
    expect(container.querySelector('style')).toBeNull();
  });

  it('accepte une classe du parent', () => {
    render(<RulePicture rule={{ kind: 'sort', feature: 'color' }} className="w-40" />);
    expect(screen.getByRole('img', { name: 'Ranger par couleur' })).toHaveClass(
      'w-40',
      'aspect-8/5',
    );
  });
});

describe('StopSign', () => {
  it('dessine un octogone rouge à large bord blanc et quatre lettres, sans police', () => {
    const { container } = render(<StopSign />);
    const svg = getSvg(container);
    const octagons = [...svg.querySelectorAll('polygon')];

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('data-pulsing');
    expect(octagons.map((octagon) => octagon.getAttribute('fill'))).toEqual(['#ffffff', '#dc2626']);
    octagons.forEach((octagon) => {
      expect(octagon.getAttribute('points')?.split(' ')).toHaveLength(8);
    });
    expect(svg.querySelectorAll('g[stroke="#ffffff"] > *')).toHaveLength(4);
    expect(svg.querySelector('text')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('pulse doucement quand il peut être touché', () => {
    const { container, rerender } = render(<StopSign isPulsing />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('data-pulsing', 'true');
    expect(svg.getAttribute('class')).toContain(
      'motion-safe:animate-[bear-sort-pulse_1.6s_ease-in-out_infinite]',
    );

    rerender(<StopSign />);
    expect(svg).not.toHaveAttribute('data-pulsing');
    expect(getAnimationClasses(svg)).toEqual([]);
  });
});

describe('StarAward', () => {
  it('sans couronne : une étoile qui scintille, et aucune trace d’une couronne', () => {
    const { container } = render(<StarAward hasCrown={false} />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('data-crown');
    expect(svg.querySelector('[data-star-crown]')).toBeNull();
    expect(svg.querySelectorAll('[data-sparkle]')).toHaveLength(4);
    expect(getAnimationClasses(svg).join(' ')).toContain(
      'motion-safe:animate-[bear-sort-twinkle_1.8s_ease-in-out_infinite]',
    );
    expect(container.textContent).toBe('');
  });

  it('avec couronne : la couronne s’ajoute au-dessus de l’étoile', () => {
    const { container } = render(<StarAward hasCrown />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('data-crown', 'true');
    expect(svg.querySelector('[data-star-crown]')).not.toBeNull();
    expect(svg.querySelectorAll('[data-sparkle]')).toHaveLength(4);
  });
});

describe('GestureHand', () => {
  it('dessine une main décorative claire au contour sombre, sans mouvement propre', () => {
    const { container } = render(<GestureHand className="size-12" />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('size-12');
    expect(svg.innerHTML).toContain('#f1f5f9');
    expect(svg.innerHTML).toContain('#1e293b');
    expect(getAnimationClasses(svg)).toEqual([]);
    expect(container.textContent).toBe('');
  });
});

describe('NoBadge', () => {
  it('reprend le signe de l’image de la règle, en gris', () => {
    const { container } = render(<NoBadge className="size-8" />);
    const svg = getSvg(container);
    const rule = render(
      <RulePicture rule={{ kind: 'except', forbidden: { color: 'blue', size: 'big' } }} />,
    );

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('size-8');
    expect(svg.innerHTML).toBe(
      getElement(rule.container, 'g[transform="translate(30 0)"]').innerHTML,
    );
    expect(getHexColors(svg.innerHTML).every((hex) => toHsl(hex).saturation < 0.5)).toBe(true);
    expect(container.textContent).toBe('');
  });
});

describe('Réduction des animations et images clés', () => {
  it.each([...ART_WITHOUT_STOP, ...STOP_SIGNS])(
    '%s : aucune animation hors de motion-safe, et ses images clés existent',
    (_name, art) => {
      const { container } = render(art);

      getAnimationClasses(container).forEach((name) => {
        expect(name.startsWith('motion-safe:animate-')).toBe(true);

        const custom = /^motion-safe:animate-\[([a-z-]+)_/.exec(name)?.[1];
        if (custom !== undefined) {
          expect(getAllStyleText()).toContain(`@keyframes ${custom}{`);
        }
      });
    },
  );

  it('hisse une seule fois les images clés dans le <head>, et rien dans le plateau', () => {
    const { container } = render(
      <>
        <OwlMascot mood="idle" />
        <OwlMascot mood="happy" />
        <StopSign isPulsing />
        <RulePicture rule={{ kind: 'sort', feature: 'color' }} isPulsing />
      </>,
    );

    expect(container.querySelector('style')).toBeNull();
    expect(document.head.querySelectorAll('style[data-href="bear-sort-owl"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('style[data-href="bear-sort-pulse"]')).toHaveLength(1);
  });
});

describe('Le rouge est réservé au panneau STOP', () => {
  it('sait reconnaître un rouge, sans confondre le brun des contours', () => {
    expect(isReddish('#dc2626')).toBe(true);
    expect(isReddish('#ef4444')).toBe(true);
    expect(isReddish('#f43f5e')).toBe(true);
    expect(isReddish('#fda4af')).toBe(true);
    expect(isReddish('#854d0e')).toBe(false);
    expect(isReddish('#fdba74')).toBe(false);
    expect(isReddish('#8b5cf6')).toBe(false);
    expect(isReddish('#facc15')).toBe(false);
    expect(isReddish('#ffffff')).toBe(false);
  });

  it.each(ART_WITHOUT_STOP)('%s : aucun rouge', (_name, art) => {
    const { container } = render(art);
    const markup = container.innerHTML;

    expect(getHexColors(markup).length).toBeGreaterThan(0);
    expect(getHexColors(markup).filter(isReddish)).toEqual([]);
    expect(markup).not.toMatch(/\b(red|rose|crimson|tomato|firebrick|maroon)\b/i);
    expect(markup).not.toMatch(/\b(red|rose|pink)-\d/);
  });

  it('les images clés hissées ne portent aucune couleur', () => {
    ART_WITHOUT_STOP.forEach(([, art]) => {
      render(art);
    });
    expect(getHexColors(getAllStyleText()).filter(isReddish)).toEqual([]);
  });

  it.each(STOP_SIGNS)('%s : son unique rouge est celui du panneau', (_name, art) => {
    const { container } = render(art);

    expect([...new Set(getHexColors(container.innerHTML).filter(isReddish))]).toEqual(['#dc2626']);
  });
});
