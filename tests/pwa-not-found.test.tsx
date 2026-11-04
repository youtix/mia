import NotFound, { metadata } from '@/app/not-found';
import { NOT_FOUND_TEXTS } from '@/components/ui/NotFoundScreen';
import { NavigationProvider } from '@/core/navigation';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ replace: vi.fn<(href: string) => void>() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

const getBackToHub = () => screen.getByRole('button', { name: 'Retour à l’accueil' });

/** Touche reçue par l'élément focalisé, comme au clavier ou à la télécommande. */
function press(key: string): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key });
}

function renderPage(): void {
  render(
    <NavigationProvider>
      <NotFound />
    </NavigationProvider>,
  );
}

beforeEach(() => {
  router.replace.mockReset();
});

afterEach(() => {
  delete document.documentElement.dataset.tv;
});

describe('Page d’une adresse inconnue (404.html)', () => {
  it('s’adresse au joueur en français et donne son titre à la page', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cette page n’existe pas');
    expect(screen.getByText('Reviens à l’accueil pour retrouver tes jeux.')).toBeInTheDocument();
    expect(metadata.title).toBe('Page introuvable');
    expect(NOT_FOUND_TEXTS.backToHub).toBe('Retour à l’accueil');
  });

  it('ramène au Hub au doigt, en remplaçant l’adresse inconnue', () => {
    renderPage();

    fireEvent.click(getBackToHub());

    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/');
  });

  it('se pilote à la télécommande : curseur sur le bouton dès l’affichage, puis OK', async () => {
    document.documentElement.dataset.tv = 'on';
    renderPage();

    await waitFor(() => {
      expect(getBackToHub()).toHaveFocus();
    });
    expect(getBackToHub()).toHaveAttribute('data-focused', 'true');

    press('Enter');

    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/');
  });

  it.each(['Escape', 'Backspace'])('ramène aussi au Hub avec Retour (%s)', (key) => {
    renderPage();

    press(key);

    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/');
  });
});
