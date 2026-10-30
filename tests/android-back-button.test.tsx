import {
  AndroidBackButtonBridge,
  isHubPathname,
  NavigationLayer,
  NavigationProvider,
  useAndroidBackButton,
  useAndroidBackExit,
  useGridNavigation,
} from '@/core/navigation';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Plateforme simulée : `true` pour l'APK Capacitor (le hook ne fait rien ailleurs). */
const platform = vi.hoisted(() => ({ native: true }));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => platform.native } }));

/** `@capacitor/app` simulé : écouteur `backButton` (poignée `remove`) et sortie de l'application. */
const app = vi.hoisted(() => {
  const remove = vi.fn(() => Promise.resolve());
  return {
    remove,
    addListener: vi.fn((_event: string, _listener: () => void) => Promise.resolve({ remove })),
    exitApp: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('@capacitor/app', () => ({ App: { addListener: app.addListener, exitApp: app.exitApp } }));

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

interface ScreenProps {
  /** Retour géré par la zone de l'écran (ex: retour à la Carte des Étoiles). */
  onBack?: () => void;
  /** Modale imposée (couche sans `onBack`, ex: choix du joueur) : rien ne gère Retour. */
  trapped?: boolean;
}

function Screen({ onBack, trapped = false }: ScreenProps) {
  const grid = useGridNavigation({ scopeId: 'screen', rows: 1, cols: 1, onBack });
  return (
    <>
      <button type="button" ref={grid.getItemRef(0)}>
        Jouer
      </button>
      {trapped && (
        <NavigationLayer>
          <p>Qui joue aujourd’hui ?</p>
        </NavigationLayer>
      )}
    </>
  );
}

function renderBridge(props: ScreenProps = {}) {
  return render(
    <>
      <AndroidBackButtonBridge />
      <Screen {...props} />
    </>,
    { wrapper: NavigationProvider },
  );
}

/** Appui sur le bouton Retour physique : dernier écouteur `backButton` enregistré. */
function pressBack(): void {
  const listener = app.addListener.mock.calls.at(-1)?.[1];
  if (!listener) throw new Error('Aucun écouteur backButton enregistré');
  act(() => {
    listener();
  });
}

function goTo(path: string): void {
  window.history.replaceState(null, '', path);
}

beforeEach(() => {
  platform.native = true;
  goTo('/');
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('isHubPathname', () => {
  it('reconnaît le Hub servi à la racine, avec ou sans barre finale', () => {
    expect(isHubPathname('/')).toBe(true);
    expect(isHubPathname('')).toBe(true);
    expect(isHubPathname('/memory/')).toBe(false);
    expect(isHubPathname('/settings')).toBe(false);
  });

  it('suit NEXT_PUBLIC_BASE_PATH (GitHub Pages)', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/mia');

    expect(isHubPathname('/mia/')).toBe(true);
    expect(isHubPathname('/mia')).toBe(true);
    expect(isHubPathname('/')).toBe(false);
    expect(isHubPathname('/mia/memory/')).toBe(false);
  });
});

describe('useAndroidBackButton', () => {
  it('exige un NavigationProvider parent', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      renderHook(() => {
        useAndroidBackButton();
      }),
    ).toThrow('NavigationProvider');
  });

  it('ne fait rien hors de l’APK', () => {
    platform.native = false;

    renderBridge();

    expect(app.addListener).not.toHaveBeenCalled();
  });

  it('route le bouton Retour vers la zone active (onBack)', () => {
    const onBack = vi.fn();
    renderBridge({ onBack });
    expect(app.addListener).toHaveBeenCalledWith('backButton', expect.any(Function));

    pressBack();

    expect(onBack).toHaveBeenCalledOnce();
    expect(app.exitApp).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('quitte Mia depuis le Hub quand rien ne gère Retour', () => {
    renderBridge();

    pressBack();

    expect(app.exitApp).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('reconnaît le Hub sous un basePath', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/mia');
    goTo('/mia/');
    renderBridge();

    pressBack();

    expect(app.exitApp).toHaveBeenCalledOnce();
  });

  it('revient au Hub depuis un autre écran quand rien ne gère Retour', () => {
    goTo('/memory/?level=mem-001');
    renderBridge();

    pressBack();

    expect(router.replace).toHaveBeenCalledWith('/');
    expect(app.exitApp).not.toHaveBeenCalled();
  });

  it('ne piège jamais le joueur : modale imposée → Hub, puis Retour quitte', () => {
    goTo('/memory/');
    const onBack = vi.fn();
    renderBridge({ onBack, trapped: true });

    pressBack();
    expect(onBack).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/');

    goTo('/');
    pressBack();
    expect(app.exitApp).toHaveBeenCalledOnce();
  });

  it('retire l’écouteur au démontage', async () => {
    const { unmount } = renderBridge();

    unmount();

    await waitFor(() => {
      expect(app.remove).toHaveBeenCalledOnce();
    });
  });

  it('journalise un pont indisponible sans casser l’écran', async () => {
    app.addListener.mockRejectedValueOnce(new Error('pont'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { unmount } = renderBridge();

    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        '[Mia]',
        'Bouton Retour Android non branché :',
        expect.any(Error),
      );
    });
    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(app.remove).not.toHaveBeenCalled();
  });
});

describe('useAndroidBackExit', () => {
  it('quitte Mia sans NavigationProvider ni routeur, même hors du Hub', () => {
    goTo('/memory/');
    renderHook(() => {
      useAndroidBackExit();
    });

    pressBack();

    expect(app.exitApp).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('ne fait rien hors de l’APK', () => {
    platform.native = false;

    renderHook(() => {
      useAndroidBackExit();
    });

    expect(app.addListener).not.toHaveBeenCalled();
  });

  it('retire l’écouteur au démontage', async () => {
    const { unmount } = renderHook(() => {
      useAndroidBackExit();
    });

    unmount();

    await waitFor(() => {
      expect(app.remove).toHaveBeenCalledOnce();
    });
  });
});
