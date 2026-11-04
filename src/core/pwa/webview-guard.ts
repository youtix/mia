/** Version minimale de la WebView (Chromium) : Tailwind v4 et Next 16 l'exigent (FEAT-01 §6). */
export const MIN_WEBVIEW_VERSION = 111;

/** Page d'erreur autonome de `public/`, celle que Capacitor affiche aussi (`server.errorPath`). */
export const WEBVIEW_ERROR_PAGE = 'webview-obsolete.html';

/**
 * Garde-fou WebView de l'application (FEAT-15) : Capacitor ne juge la WebView que par son paquet, et
 * laisse passer celle de Huawei, numérotée à part, dès sa version 10. Script inline du `<head>`, en ES3
 * et avant tout le reste : dans l'APK (`https://localhost`), une WebView qui se dit Chrome antérieur à
 * 111 affiche la page d'erreur plutôt qu'une interface cassée. La page ne renvoie vers Mia qu'à partir
 * de la même version : pas de boucle. Sur le Web, rien.
 */
export const WEBVIEW_GUARD_SCRIPT = [
  '(function(){try{',
  "if(location.protocol!=='https:'||location.hostname!=='localhost')return;",
  'var m=/Chrome\\/(\\d+)/.exec(navigator.userAgent);',
  `if(m&&parseInt(m[1],10)<${String(MIN_WEBVIEW_VERSION)})location.replace(${JSON.stringify(`/${WEBVIEW_ERROR_PAGE}`)})`,
  '}catch(e){}})();',
].join('');
