/** Attribut de `<html>` lu par la variante `contrast:` et les règles globales de `globals.css`. */
export const CONTRAST_ATTRIBUTE = 'data-contrast';

/** Seule valeur posée : en contraste standard, l'attribut est retiré. */
export const HIGH_CONTRAST_VALUE = 'high';

/**
 * Reflète `settings.highContrastMode` sur `<html>` (FEAT-18), comme `applyTvModeOverride` pour
 * `data-tv` : appliqué par le Provider une fois la sauvegarde chargée, puis à chaque changement ;
 * avant, l'attribut posé par le script inline du `<head>` reste en place.
 */
export function applyHighContrastMode(
  enabled: boolean,
  root: HTMLElement = document.documentElement,
): void {
  if (enabled) root.setAttribute(CONTRAST_ATTRIBUTE, HIGH_CONTRAST_VALUE);
  else root.removeAttribute(CONTRAST_ATTRIBUTE);
}
