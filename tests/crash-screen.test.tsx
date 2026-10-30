import GlobalError from '@/app/global-error';
import { CRASH_SCREEN_TEXTS, CrashScreen } from '@/components/ui/CrashScreen';
import { NavigationProvider } from '@/core/navigation';
import type { AppRepairResult, AppUpdateStatus } from '@/core/pwa';
import type * as AppUpdate from '@/core/pwa/appUpdate';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** État de la mise à jour simulé : `unsupported` équivaut à l'APK et au développement. */
const update = vi.hoisted((): { status: AppUpdateStatus } => ({ status: 'unsupported' }));

const pwa = vi.hoisted(() => ({
  reloadPage: vi.fn<() => void>(),
  reloadToHub: vi.fn<() => void>(),
  repairApp: vi.fn<() => Promise<AppRepairResult>>(),
}));

/** Plateforme simulée : `true` pour l'APK Capacitor. */
const platform = vi.hoisted(() => ({ native: false }));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => platform.native } }));

/** `@capacitor/app` simulé : écouteur `backButton` et sortie de l'application. */
const app = vi.hoisted(() => ({
  addListener: vi.fn((_event: string, _listener: () => void) =>
    Promise.resolve({ remove: () => Promise.resolve() }),
  ),
  exitApp: vi.fn(() => Promise.resolve()),
}));

vi.mock('@capacitor/app', () => ({ App: { addListener: app.addListener, exitApp: app.exitApp } }));

vi.mock('@/core/pwa/useAppUpdateStatus', () => ({ useAppUpdateStatus: () => update.status }));

vi.mock('@/core/pwa/reloadPage', () => ({
  reloadPage: pwa.reloadPage,
  reloadToHub: pwa.reloadToHub,
}));

vi.mock('@/core/pwa/appUpdate', async (importOriginal) => {
  const actual = await importOriginal<typeof AppUpdate>();
  return { ...actual, repairApp: pwa.repairApp };
});

const SUPPORTED_STATUSES: readonly AppUpdateStatus[] = ['idle', 'downloading', 'ready'];

const getReload = () => screen.getByRole('button', { name: 'Recharger' });
const getRepair = () => screen.getByRole('button', { name: 'Réparer l’application' });

/** Touche reçue par l'élément focalisé, comme au clavier ou à la télécommande. */
function press(key: string): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key });
}

function renderScreen(status: AppUpdateStatus): void {
  update.status = status;
  render(
    <NavigationProvider>
      <CrashScreen />
    </NavigationProvider>,
  );
}

/** Réparation qui dure : le test décide quand et comment elle se termine. */
function holdRepair(): (result: AppRepairResult) => Promise<void> {
  let finish: (result: AppRepairResult) => void = () => undefined;
  pwa.repairApp.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  return (result) =>
    act(async () => {
      finish(result);
      await Promise.resolve();
    });
}

beforeEach(() => {
  pwa.reloadPage.mockReset();
  pwa.reloadToHub.mockReset();
  pwa.repairApp.mockReset();
  platform.native = false;
  app.addListener.mockClear();
  app.exitApp.mockClear();
});

afterEach(() => {
  delete document.documentElement.dataset.tv;
  vi.restoreAllMocks();
});

describe('CrashScreen', () => {
  it('rassure le joueur : titre et note', () => {
    renderScreen('unsupported');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Mia a rencontré un problème',
    );
    expect(
      screen.getByText(
        'Tes profils et tes étoiles ne sont pas touchés. Recharge Mia pour retrouver tes jeux.',
      ),
    ).toBeInTheDocument();
  });

  it('ne propose que « Recharger » sans service worker (APK, développement)', () => {
    renderScreen('unsupported');

    expect(screen.getAllByRole('button')).toEqual([getReload()]);
    expect(screen.queryByText(CRASH_SCREEN_TEXTS.repairNote)).not.toBeInTheDocument();
  });

  it.each(SUPPORTED_STATUSES)(
    'propose aussi « Réparer » et sa note avec un worker (%s)',
    (status) => {
      renderScreen(status);

      expect(screen.getAllByRole('button')).toEqual([getReload(), getRepair()]);
      expect(getReload()).toHaveClass('bg-sky-400');
      expect(getRepair()).toHaveClass('bg-slate-800');
      expect(getRepair().querySelector('svg')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Si le problème revient, répare l’application : Mia retélécharge ses fichiers. Une connexion est nécessaire.',
        ),
      ).toBeInTheDocument();
    },
  );

  it('repart du Hub avec « Recharger » : un plantage propre à une route ne revient pas', () => {
    renderScreen('idle');

    fireEvent.click(getReload());

    expect(pwa.reloadToHub).toHaveBeenCalledOnce();
    expect(pwa.reloadPage).not.toHaveBeenCalled();
    expect(pwa.repairApp).not.toHaveBeenCalled();
  });

  it('quitte l’application au bouton Retour d’Android : sans écouteur, le joueur serait piégé', () => {
    platform.native = true;
    renderScreen('unsupported');

    const [event, listener] = app.addListener.mock.calls.at(-1) ?? [];
    expect(event).toBe('backButton');
    listener?.();

    expect(app.exitApp).toHaveBeenCalledOnce();
  });

  it('n’écoute pas le bouton Retour d’Android hors de l’APK', () => {
    renderScreen('idle');

    expect(app.addListener).not.toHaveBeenCalled();
  });

  it('ne lance qu’une réparation sur un double appui, même une fois la page en rechargement', async () => {
    const finish = holdRepair();
    renderScreen('idle');

    fireEvent.click(getRepair());
    fireEvent.click(getRepair());
    expect(pwa.repairApp).toHaveBeenCalledOnce();

    await finish('reloading');
    fireEvent.click(getRepair());
    expect(pwa.repairApp).toHaveBeenCalledOnce();
  });

  it('garde le bouton focalisable pendant la réparation (verrou, pas `disabled`)', () => {
    holdRepair();
    renderScreen('idle');
    getRepair().focus();

    fireEvent.click(getRepair());

    expect(getRepair()).toBeEnabled();
    expect(getRepair()).toHaveFocus();
  });

  it('annonce le refus sans réseau, puis laisse réessayer', async () => {
    const finish = holdRepair();
    renderScreen('idle');

    fireEvent.click(getRepair());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await finish('unreachable');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Réparation impossible : pas de connexion. Réessaie une fois connecté.',
    );
    expect(pwa.reloadPage).not.toHaveBeenCalled();

    // Le message retiré puis reposé est annoncé de nouveau par les lecteurs d'écran.
    const finishRetry = holdRepair();
    fireEvent.click(getRepair());
    expect(pwa.repairApp).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await finishRetry('reloading');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('n’affiche aucun message quand la réparation recharge la page', async () => {
    const finish = holdRepair();
    renderScreen('ready');

    fireEvent.click(getRepair());
    await finish('reloading');

    expect(pwa.repairApp).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('pose le focus sur « Recharger » dès l’affichage, sans anneau du D-Pad en mode tactile', () => {
    renderScreen('idle');

    expect(getReload()).toHaveFocus();
    expect(getReload()).not.toHaveAttribute('data-focused');
  });

  it('montre le curseur sur « Recharger » dès l’affichage en mode TV', () => {
    document.documentElement.dataset.tv = 'on';
    renderScreen('idle');

    expect(getReload()).toHaveFocus();
    expect(getReload()).toHaveAttribute('data-focused');
    expect(getRepair()).not.toHaveAttribute('data-focused');
  });

  it('déplace le curseur aux flèches dès le premier appui, et s’arrête aux bords', () => {
    renderScreen('idle');

    press('ArrowRight');
    expect(getRepair()).toHaveFocus();
    expect(getRepair()).toHaveAttribute('data-focused');
    expect(getReload()).not.toHaveAttribute('data-focused');

    press('ArrowRight');
    expect(getRepair()).toHaveFocus();

    press('ArrowLeft');
    expect(getReload()).toHaveFocus();
    expect(getReload()).toHaveAttribute('data-focused');

    press('ArrowLeft');
    expect(getReload()).toHaveFocus();
  });

  it('active « Recharger » avec OK dès le premier appui', () => {
    renderScreen('unsupported');

    press('Enter');

    expect(pwa.reloadToHub).toHaveBeenCalledOnce();
  });

  it('active « Réparer » avec OK, une seule fois même sur deux appuis', () => {
    holdRepair();
    renderScreen('idle');

    press('ArrowRight');
    press('Enter');
    press('Enter');

    expect(pwa.repairApp).toHaveBeenCalledOnce();
    expect(pwa.reloadPage).not.toHaveBeenCalled();
  });

  it('reste sur « Recharger » aux flèches quand il est seul', () => {
    renderScreen('unsupported');

    press('ArrowRight');

    expect(getReload()).toHaveFocus();
  });
});

describe('global-error', () => {
  it('rend son propre document, sans les fournisseurs du layout racine', () => {
    update.status = 'unsupported';

    const html = renderToStaticMarkup(<GlobalError error={new Error('Chunk introuvable')} />);

    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<title>Mia</title>');
    expect(html).toContain('content="width=device-width, initial-scale=1, viewport-fit=cover"');
    expect(html).toContain(
      '<body class="min-h-dvh bg-slate-900 font-sans text-slate-50 antialiased">',
    );
    expect(html).toContain(CRASH_SCREEN_TEXTS.title);
  });

  it('journalise l’erreur et guide la télécommande sur un <html> vidé de `data-tv`', () => {
    update.status = 'idle';
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('Chunk introuvable');
    // Posé hors de React (script inline du layout) : React l'efface en prenant possession de <html>.
    document.documentElement.dataset.tv = 'on';
    const root = createRoot(document);

    try {
      act(() => {
        root.render(<GlobalError error={error} />);
      });

      expect(document.documentElement).not.toHaveAttribute('data-tv');
      expect(document.documentElement).toHaveAttribute('lang', 'fr');
      expect(document.title).toBe('Mia');
      expect(log).toHaveBeenCalledWith('[Mia]', error);
      expect(getReload()).toHaveFocus();

      press('ArrowRight');
      expect(getRepair()).toHaveFocus();
    } finally {
      act(() => {
        root.unmount();
      });
    }
  });
});
