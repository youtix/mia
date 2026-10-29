'use client';

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useNavigation } from './NavigationContext';

/** Chemin sans barre finale : `/mia/` et `/mia` désignent le même écran. */
function trimTrailingSlash(pathname: string): string {
  return pathname.replace(/\/+$/, '');
}

/**
 * Le Hub est servi à `basePath + '/'` (`/` dans l'APK, `/mia/` sur GitHub Pages). `basePath` est lu
 * à l'appel, pas au chargement du module, pour rester testable (Next.js remplace
 * `NEXT_PUBLIC_BASE_PATH` à la compilation).
 */
export function isHubPathname(pathname: string): boolean {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return trimTrailingSlash(pathname) === trimTrailingSlash(basePath);
}

/**
 * Bouton Retour physique d'Android (télécommande Android TV, geste ou bouton du téléphone) :
 * `@capacitor/app` l'émet sans aucun `keydown` (contrat FEAT-04 §5). Il suit le routage des touches
 * (`dispatchBack` : zone active de la couche du dessus, sinon fermeture de la modale) ; si rien ne
 * l'a géré, Mia quitte depuis le Hub (`App.exitApp()`) et revient au Hub depuis tout autre écran :
 * le joueur n'est jamais piégé, même par une modale imposée. Sans effet hors de l'APK.
 */
export function useAndroidBackButton(): void {
  const { dispatchBack } = useNavigation();
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const onBackButton = (): void => {
      if (dispatchBack()) return;
      if (isHubPathname(window.location.pathname)) void App.exitApp();
      else router.replace('/');
    };
    const listener = App.addListener('backButton', onBackButton).catch((error: unknown) => {
      console.warn('[Mia]', 'Bouton Retour Android non branché :', error);
      return null;
    });
    return () => {
      void listener.then((handle) => handle?.remove());
    };
  }, [dispatchBack, router]);
}
