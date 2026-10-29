import type { TvModeOverride } from '@/types/mia';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { CONTRAST_ATTRIBUTE, HIGH_CONTRAST_VALUE } from './contrast-mode';
import { STORAGE_KEY } from './default-state';

/** Valeur de `<html data-tv>` lue par la variante `tv:` (FEAT-03 §5) ; `null` = attribut retiré. */
export const TV_ATTRIBUTE_VALUES: Readonly<Record<TvModeOverride, 'on' | 'off' | null>> = {
  auto: null,
  always_tv: 'on',
  always_touch: 'off',
};

/**
 * Marqueur `localStorage` de la détection native (`'on'` / `'off'`), écrit par `detectNativeTv`
 * dans l'APK et lu par le script inline en `auto` : dès le deuxième lancement, le mode TV est posé
 * avant le premier rendu, sans attendre le plugin.
 */
export const TV_DETECTED_STORAGE_KEY = 'mia_tv_detected';

/** Plugin natif `TvModePlugin.java` (android/, FEAT-15 §3.5) : `UiModeManager` → téléviseur ? */
export interface TvModePlugin {
  isTelevision: () => Promise<{ value: boolean }>;
}

const TV_MODE_PLUGIN_NAME = 'TvMode';

let tvModePlugin: TvModePlugin | null = null;

/**
 * Enregistré à la demande : le module est évalué au pré-rendu et par des tests qui simulent
 * `@capacitor/core` sans `registerPlugin`. Implémentation Web : jamais un téléviseur.
 */
function getTvModePlugin(): TvModePlugin {
  tvModePlugin ??= registerPlugin<TvModePlugin>(TV_MODE_PLUGIN_NAME, {
    web: () => Promise.resolve({ isTelevision: () => Promise.resolve({ value: false }) }),
  });
  return tvModePlugin;
}

export interface ApplyTvModeOptions {
  /** Détection native (APK) : en `auto`, `true` pose `on`, `false` laisse la détection CSS. */
  nativeTv?: boolean;
}

/**
 * Reflète le réglage sur `<html>` : forcé (`on` / `off`) ; en `auto`, `on` si la détection native
 * a reconnu un téléviseur, sinon attribut retiré (détection CSS).
 */
export function applyTvModeOverride(
  override: TvModeOverride,
  root: HTMLElement = document.documentElement,
  { nativeTv = false }: ApplyTvModeOptions = {},
): void {
  const value = TV_ATTRIBUTE_VALUES[override] ?? (nativeTv ? 'on' : null);
  if (value === null) root.removeAttribute('data-tv');
  else root.setAttribute('data-tv', value);
}

/**
 * La détection native est-elle possible ici : APK dont le pont expose le plugin `TvMode` ? Jamais
 * sur le Web. `isPluginAvailable` manque dans les simulations partielles de `@capacitor/core`
 * (tests) : aucune exception ne sort d'ici.
 */
export function hasNativeTvDetection(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(TV_MODE_PLUGIN_NAME);
  } catch {
    return false;
  }
}

function rememberNativeTv(value: boolean): void {
  try {
    window.localStorage.setItem(TV_DETECTED_STORAGE_KEY, value ? 'on' : 'off');
  } catch (error) {
    console.warn('[Mia]', `Écriture locale de « ${TV_DETECTED_STORAGE_KEY} » impossible :`, error);
  }
}

/**
 * Interroge le plugin natif (APK seulement), mémorise le résultat pour le script inline et le
 * renvoie ; `false` sans détection native, sans appel ni écriture. Ne rejette jamais : un échec du
 * pont est journalisé et vaut « pas un téléviseur ».
 */
export async function detectNativeTv(): Promise<boolean> {
  if (!hasNativeTvDetection()) return false;
  try {
    const { value } = await getTvModePlugin().isTelevision();
    rememberNativeTv(value);
    return value;
  } catch (error) {
    console.warn('[Mia]', 'Détection native du mode TV impossible :', error);
    return false;
  }
}

const FORCED_TV_VALUES = Object.fromEntries(
  Object.entries(TV_ATTRIBUTE_VALUES).filter(([, value]) => value !== null),
);

/**
 * Script inline placé dans le `<head>` de `layout.tsx` : pose `data-tv` avant le premier rendu,
 * sinon les marges TV sauteraient à l'hydratation : réglage forcé lu dans le miroir localStorage,
 * sinon (`auto`) marqueur de la détection native (APK) ; pose aussi `data-contrast="high"`
 * (FEAT-18), sinon les couleurs changeraient sous les yeux du joueur. Autonome et en ES5 ; une
 * sauvegarde absente ou illisible, ou une valeur inconnue (même « toString »), ne force rien.
 */
export const TV_MODE_BOOTSTRAP_SCRIPT = [
  '(function(){try{',
  'var h=document.documentElement;',
  `var v=localStorage.getItem(${JSON.stringify(TV_DETECTED_STORAGE_KEY)})==='on'?'on':null;`,
  'var t;',
  `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}));t=s&&s.settings}catch(e){}`,
  `var f=t&&${JSON.stringify(FORCED_TV_VALUES)}[t.tvModeOverride];`,
  "if(typeof f==='string')v=f;",
  "if(typeof v==='string')h.setAttribute('data-tv',v);",
  `if(t&&t.highContrastMode===true)h.setAttribute(${JSON.stringify(CONTRAST_ATTRIBUTE)},${JSON.stringify(HIGH_CONTRAST_VALUE)})`,
  '}catch(e){}})();',
].join('');
