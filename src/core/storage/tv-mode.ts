import type { TvModeOverride } from '@/types/mia';
import { CONTRAST_ATTRIBUTE, HIGH_CONTRAST_VALUE } from './contrast-mode';
import { STORAGE_KEY } from './default-state';

/** Valeur de `<html data-tv>` lue par la variante `tv:` (FEAT-03 §5) ; `null` = attribut retiré. */
export const TV_ATTRIBUTE_VALUES: Readonly<Record<TvModeOverride, 'on' | 'off' | null>> = {
  auto: null,
  always_tv: 'on',
  always_touch: 'off',
};

/** Reflète le réglage sur `<html>` : forcé (`on` / `off`) ou détection CSS (`auto`, sans attribut). */
export function applyTvModeOverride(
  override: TvModeOverride,
  root: HTMLElement = document.documentElement,
): void {
  const value = TV_ATTRIBUTE_VALUES[override];
  if (value === null) root.removeAttribute('data-tv');
  else root.setAttribute('data-tv', value);
}

const FORCED_TV_VALUES = Object.fromEntries(
  Object.entries(TV_ATTRIBUTE_VALUES).filter(([, value]) => value !== null),
);

/**
 * Script inline placé dans le `<head>` de `layout.tsx` : lit le miroir localStorage et pose
 * `data-tv` avant le premier rendu, sinon les marges TV sauteraient à l'hydratation ; pose aussi
 * `data-contrast="high"` (FEAT-18), sinon les couleurs changeraient sous les yeux du joueur.
 * Autonome et en ES5 ; une sauvegarde absente ou illisible, ou une valeur inconnue (même
 * « toString »), ne pose rien.
 */
export const TV_MODE_BOOTSTRAP_SCRIPT = [
  '(function(){try{',
  'var h=document.documentElement;',
  `var s=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}));`,
  'var t=s&&s.settings;',
  `var v=t&&${JSON.stringify(FORCED_TV_VALUES)}[t.tvModeOverride];`,
  "if(typeof v==='string')h.setAttribute('data-tv',v);",
  `if(t&&t.highContrastMode===true)h.setAttribute(${JSON.stringify(CONTRAST_ATTRIBUTE)},${JSON.stringify(HIGH_CONTRAST_VALUE)})`,
  '}catch(e){}})();',
].join('');
