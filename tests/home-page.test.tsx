import HomePage from '@/app/page';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('HomePage', () => {
  it('affiche le titre et le sous-titre', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Mia' })).toBeInTheDocument();
    expect(
      screen.getByText('Entraînement cérébral pour Mobile, Tablette & TV'),
    ).toBeInTheDocument();
  });

  it('liste les 5 paliers cognitifs dans l’ordre', () => {
    render(<HomePage />);

    const list = screen.getByRole('list', { name: 'Les 5 paliers cognitifs' });
    const items = within(list).getAllByRole('listitem');

    expect(items).toHaveLength(5);
    expect(items.map((item) => item.textContent)).toEqual([
      '1. Très FacileÉveil',
      '2. FacileInitié',
      '3. MoyenConfirmé',
      '4. DifficileExpert',
      '5. Très DifficileMaître',
    ]);
  });

  it('décore chaque palier d’une icône masquée aux lecteurs d’écran', () => {
    render(<HomePage />);

    const items = within(screen.getByRole('list')).getAllByRole('listitem');

    for (const item of items) {
      expect(item.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
