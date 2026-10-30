import {
  AppShell,
  DEFAULT_REMOTE_HINTS,
  describeStars,
  DifficultyPill,
  FocusableButton,
  FocusableCard,
  ModalDialog,
  StarBadge,
  type FocusableButtonVariant,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { DIFFICULTY_TIERS } from '@/types/mia';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { createRef, useRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/** Indicateur de focus imposé par FEAT-03 §3.2. */
const FOCUS_RING = [
  'ring-4',
  'ring-sky-400',
  'ring-offset-2',
  'ring-offset-slate-950',
  'scale-[1.04]',
  'shadow-lg',
  'shadow-sky-500/30',
];

describe('cn', () => {
  it('combine les classes conditionnelles et résout les conflits Tailwind', () => {
    expect(
      cn('px-2 py-1', false, undefined, ['text-sm', { 'font-bold': true, italic: false }]),
    ).toBe('px-2 py-1 text-sm font-bold');
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('md:px-8', 'tv:px-4', 'tv:px-8')).toBe('md:px-8 tv:px-8');
  });

  it('distingue les tailles fluides des couleurs de texte', () => {
    expect(cn('text-slate-50', 'text-fluid-lg')).toBe('text-slate-50 text-fluid-lg');
    expect(cn('text-fluid-sm', 'text-fluid-lg')).toBe('text-fluid-lg');
    expect(cn('text-lg', 'text-fluid-xl')).toBe('text-fluid-xl');
  });
});

describe('FocusableButton', () => {
  it('rend un bouton natif de type "button" avec une cible tactile de 48 px (56 px sur TV)', () => {
    render(<FocusableButton>Jouer</FocusableButton>);

    const button = screen.getByRole('button', { name: 'Jouer' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('min-h-12', 'min-w-12', 'tv:min-h-14', 'bg-sky-400');
  });

  it('applique l’anneau de focus haute visibilité quand le moteur D-Pad le cible', () => {
    const { rerender } = render(<FocusableButton>Jouer</FocusableButton>);
    const button = screen.getByRole('button', { name: 'Jouer' });

    expect(button).not.toHaveAttribute('data-focused');
    expect(button).toHaveClass('focus-visible:ring-4', 'focus-visible:ring-sky-400');
    expect(button).not.toHaveClass('ring-4');

    rerender(<FocusableButton isFocused>Jouer</FocusableButton>);

    expect(button).toHaveAttribute('data-focused', 'true');
    expect(button).toHaveClass(...FOCUS_RING);
  });

  it.each<[FocusableButtonVariant, string]>([
    ['primary', 'bg-sky-400'],
    ['secondary', 'bg-slate-800'],
    ['ghost', 'bg-transparent'],
    ['danger', 'bg-rose-400'],
    ['success', 'bg-emerald-400'],
  ])('applique la variante %s', (variant, expectedClass) => {
    render(<FocusableButton variant={variant}>Action</FocusableButton>);

    expect(screen.getByRole('button', { name: 'Action' })).toHaveClass(expectedClass);
  });

  it('garde la taille "tv" comme format le plus grand, y compris en mode TV', () => {
    render(<FocusableButton size="tv">Commencer</FocusableButton>);

    const button = screen.getByRole('button', { name: 'Commencer' });
    expect(button).toHaveClass('min-h-16', 'tv:min-h-16', 'text-fluid-xl');
    expect(button).not.toHaveClass('tv:min-h-14');
  });

  it('affiche le raccourci télécommande en mode TV uniquement, masqué des lecteurs d’écran', () => {
    render(<FocusableButton tvHint="OK">Valider</FocusableButton>);

    const button = screen.getByRole('button', { name: 'Valider' });
    const hint = within(button).getByText('OK');
    expect(hint.tagName).toBe('KBD');
    expect(hint).toHaveAttribute('aria-hidden', 'true');
    expect(hint).toHaveClass('hidden', 'tv:inline-flex');
  });

  it('décore les icônes sans altérer le nom accessible', () => {
    render(
      <FocusableButton
        leftIcon={<svg data-testid="left" />}
        rightIcon={<svg data-testid="right" />}
      >
        Suivant
      </FocusableButton>,
    );

    expect(screen.getByRole('button', { name: 'Suivant' })).toBeInTheDocument();
    expect(screen.getByTestId('left').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('right').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('transmet les attributs natifs, la ref et fusionne les classes', () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <FocusableButton ref={ref} type="submit" className="px-10" onClick={onClick}>
        Envoyer
      </FocusableButton>,
    );

    const button = screen.getByRole('button', { name: 'Envoyer' });
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledOnce();
    expect(ref.current).toBe(button);
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveClass('px-10');
    expect(button).not.toHaveClass('px-5');
  });

  it('ne déclenche pas onClick lorsqu’il est désactivé', () => {
    const onClick = vi.fn();
    render(
      <FocusableButton disabled onClick={onClick}>
        Indisponible
      </FocusableButton>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Indisponible' }));

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('FocusableCard', () => {
  it('rend un bouton natif (Entrée / Espace) qui appelle onSelect', () => {
    const onSelect = vi.fn();
    render(<FocusableCard onSelect={onSelect}>Memory</FocusableCard>);

    const card = screen.getByRole('button', { name: 'Memory' });
    fireEvent.click(card);

    expect(card).toHaveAttribute('type', 'button');
    expect(card).not.toHaveAttribute('aria-disabled');
    expect(card).not.toHaveAttribute('aria-current');
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('reste cliquable sans onSelect', () => {
    render(<FocusableCard>Tuile</FocusableCard>);

    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Tuile' }));
    }).not.toThrow();
  });

  it('verrouillée : reste focalisable mais n’appelle jamais onSelect', () => {
    const onSelect = vi.fn();
    render(
      <FocusableCard isLocked onSelect={onSelect}>
        Étoile #5
      </FocusableCard>,
    );

    const card = screen.getByRole('button', { name: 'Étoile #5, verrouillé' });
    card.focus();
    fireEvent.click(card);

    expect(card).toHaveFocus();
    expect(card).not.toBeDisabled();
    expect(card).toHaveAttribute('aria-disabled', 'true');
    expect(card).toHaveClass('opacity-60');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('verrouillée : signale l’activation par onLockedSelect (ex: expliquer le déblocage)', () => {
    const onSelect = vi.fn();
    const onLockedSelect = vi.fn();
    const { rerender } = render(
      <FocusableCard isLocked onSelect={onSelect} onLockedSelect={onLockedSelect}>
        Étoile #9
      </FocusableCard>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Étoile #9, verrouillé' }));
    expect(onLockedSelect).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();

    rerender(
      <FocusableCard onSelect={onSelect} onLockedSelect={onLockedSelect}>
        Étoile #9
      </FocusableCard>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Étoile #9' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onLockedSelect).toHaveBeenCalledOnce();
  });

  it('active : annoncée comme élément courant avec un indice non coloré', () => {
    render(<FocusableCard isActive>Joueur 1</FocusableCard>);

    const card = screen.getByRole('button', { name: 'Joueur 1' });
    expect(card).toHaveAttribute('aria-current', 'true');
    expect(card).toHaveClass('border-emerald-400');
    expect(card.querySelector('svg')).toBeInTheDocument();
  });

  it('applique l’anneau de focus quand le moteur D-Pad la cible et transmet la ref', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <FocusableCard ref={ref} isFocused>
        Traffic Jam
      </FocusableCard>,
    );

    const card = screen.getByRole('button', { name: 'Traffic Jam' });
    expect(card).toHaveAttribute('data-focused', 'true');
    expect(card).toHaveClass(...FOCUS_RING);
    expect(ref.current).toBe(card);
  });
});

describe('StarBadge', () => {
  it.each([
    [0, 20, false, '0 étoile sur 20'],
    [1, undefined, false, '1 étoile'],
    [12, 20, false, '12 étoiles sur 20'],
    [4, 4, true, '4 étoiles sur 4, parfait'],
  ])('décrit %i étoile(s) sur %s (parfait : %s)', (earned, total, isPerfect, expected) => {
    expect(describeStars(earned, total, isPerfect)).toBe(expected);
  });

  it('affiche le compteur acquis / total avec un libellé vocalisé', () => {
    render(<StarBadge earned={12} total={20} />);

    const badge = screen.getByRole('img', { name: '12 étoiles sur 20' });
    expect(badge).toHaveTextContent('12 / 20');
    expect(badge).not.toHaveAttribute('data-perfect');
    expect(badge.querySelectorAll('svg')).toHaveLength(1);
  });

  it('affiche seulement les étoiles acquises sans total', () => {
    render(<StarBadge earned={7} size="sm" />);

    const badge = screen.getByRole('img', { name: '7 étoiles' });
    expect(badge).toHaveTextContent(/^7$/);
    expect(badge).toHaveClass('text-fluid-sm');
  });

  it('ajoute une couronne et un halo doré quand le score est parfait', () => {
    render(<StarBadge earned={4} total={4} isPerfect size="lg" />);

    const badge = screen.getByRole('img', { name: '4 étoiles sur 4, parfait' });
    expect(badge).toHaveAttribute('data-perfect', 'true');
    expect(badge).toHaveClass('ring-amber-300/60', 'text-fluid-xl');
    expect(badge.querySelectorAll('svg')).toHaveLength(2);
  });
});

describe('DifficultyPill', () => {
  it.each(Object.values(DIFFICULTY_TIERS))(
    'affiche « $label » avec $order barre(s) pleine(s) sur 5',
    (meta) => {
      const { container } = render(<DifficultyPill tier={meta.id} />);

      const pill = container.firstElementChild;
      const bars = container.querySelectorAll('[data-filled]');
      expect(pill).toHaveClass(...meta.colorClass.split(' '), ...meta.badgeBgClass.split(' '));
      expect(pill).toHaveTextContent(`${meta.label}, palier ${String(meta.order)} sur 5`);
      expect(screen.getByText(meta.label)).toBeInTheDocument();
      expect(bars).toHaveLength(5);
      expect(container.querySelectorAll('[data-filled="true"]')).toHaveLength(meta.order);
      expect(bars[0]?.parentElement).toHaveAttribute('aria-hidden', 'true');
    },
  );

  it('dessine des barres croissantes et peut afficher le sous-titre', () => {
    const { container } = render(<DifficultyPill tier="medium" showSubtitle size="lg" />);

    const bars = container.querySelectorAll<HTMLElement>('[data-filled]');
    expect(bars[0]?.style.height).toBe('20%');
    expect(bars[4]?.style.height).toBe('100%');
    expect(container.firstElementChild).toHaveTextContent('Moyen · Confirmé, palier 3 sur 5');
    expect(container.firstElementChild).toHaveClass('text-fluid-lg');
  });

  it('masque le sous-titre par défaut', () => {
    render(<DifficultyPill tier="very_easy" />);

    expect(screen.queryByText(/Éveil/)).not.toBeInTheDocument();
  });
});

describe('AppShell', () => {
  it('structure l’écran : zone de sécurité, titre, contenu principal', () => {
    const { container } = render(
      <AppShell title="Memory">
        <p>Plateau</p>
      </AppShell>,
    );

    expect(container.firstElementChild).toHaveClass('tv-safe-container', 'h-dvh');
    expect(screen.getByRole('heading', { level: 1, name: 'Memory' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText('Plateau')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('flex-1', 'flex', 'flex-col', 'overflow-y-auto');
    expect(screen.queryByRole('button', { name: 'Retour' })).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('affiche le bouton Retour, le profil actif et le compteur d’étoiles global', () => {
    const onBack = vi.fn();
    render(
      <AppShell
        title="Carte des Étoiles"
        onBack={onBack}
        isBackFocused
        profile={<span>Joueur 1</span>}
        stars={{ earned: 5, total: 40 }}
      >
        <p>Contenu</p>
      </AppShell>,
    );

    const header = screen.getByRole('banner');
    const back = within(header).getByRole('button', { name: 'Retour' });
    fireEvent.click(back);

    expect(onBack).toHaveBeenCalledOnce();
    expect(back).toHaveAttribute('data-focused', 'true');
    expect(within(header).getByText('Joueur 1')).toBeInTheDocument();
    expect(within(header).getByRole('img', { name: '5 étoiles sur 40' })).toBeInTheDocument();
  });

  it('expose le bouton Retour au moteur D-Pad : ref et activation au focus', () => {
    const ref = createRef<HTMLButtonElement>();
    const onBackFocus = vi.fn();
    render(
      <AppShell title="Memory" onBack={vi.fn()} backButtonRef={ref} onBackFocus={onBackFocus}>
        <p>Carte</p>
      </AppShell>,
    );

    const back = screen.getByRole('button', { name: 'Retour' });
    expect(ref.current).toBe(back);
    back.focus();
    expect(onBackFocus).toHaveBeenCalledOnce();
  });

  it('réserve le titre et « Retour » aux lecteurs d’écran sur un écran sans texte (FEAT-21)', () => {
    const onBack = vi.fn();
    render(
      <AppShell title="Suites Logiques" isTextless onBack={onBack} stars={{ earned: 1, total: 20 }}>
        <p>Plateau</p>
      </AppShell>,
    );

    const header = screen.getByRole('banner');
    const heading = within(header).getByRole('heading', { level: 1, name: 'Suites Logiques' });
    const back = within(header).getByRole('button', { name: 'Retour' });
    fireEvent.click(back);

    expect(heading).toHaveClass('sr-only');
    expect(within(back).getByText('Retour')).toHaveClass('sr-only');
    // Rien ne réaffiche le libellé sur un grand écran.
    expect(within(back).getByText('Retour')).not.toHaveClass('sm:not-sr-only');
    expect(onBack).toHaveBeenCalledOnce();
    // Seuls les textes à lire disparaissent : le reste de l'en-tête et le contenu restent affichés.
    expect(within(header).getByRole('img', { name: '1 étoile sur 20' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText('Plateau')).toBeInTheDocument();
  });

  it('garde par défaut un titre affiché et « Retour » dès les écrans moyens', () => {
    render(
      <AppShell title="Memory" onBack={vi.fn()}>
        <p>Plateau</p>
      </AppShell>,
    );

    const heading = screen.getByRole('heading', { level: 1, name: 'Memory' });
    const label = within(screen.getByRole('button', { name: 'Retour' })).getByText('Retour');

    expect(heading).not.toHaveClass('sr-only');
    expect(heading).toHaveClass('flex-1', 'truncate', 'text-fluid-2xl');
    expect(label).toHaveClass('sr-only', 'sm:not-sr-only');
  });

  it('affiche les aides de la télécommande en pied de page, en mode TV uniquement', () => {
    render(
      <AppShell title="Hub" footerHints={DEFAULT_REMOTE_HINTS}>
        <p>Jeux</p>
      </AppShell>,
    );

    const footer = screen.getByRole('contentinfo');
    const hints = within(footer).getAllByRole('listitem');
    expect(footer).toHaveClass('hidden', 'tv:flex');
    expect(within(footer).getByRole('list', { name: 'Commandes de la télécommande' })).toBe(
      hints[0]?.parentElement,
    );
    expect(hints.map((hint) => hint.textContent.trim())).toEqual([
      'Naviguer',
      'OK Sélectionner',
      'Retour',
    ]);
  });

  it('n’affiche pas de pied de page sans aide', () => {
    render(
      <AppShell title="Hub" footerHints={[]}>
        <p>Jeux</p>
      </AppShell>,
    );

    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('montre le titre et le libellé de Retour par défaut, dès le palier sm', () => {
    render(
      <AppShell title="Memory" onBack={vi.fn()}>
        <p>Carte</p>
      </AppShell>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Memory' })).not.toHaveClass('sr-only');
    expect(within(screen.getByRole('button', { name: 'Retour' })).getByText('Retour')).toHaveClass(
      'sr-only',
      'sm:not-sr-only',
    );
  });
});

describe('ModalDialog', () => {
  // Animations instantanées : la sortie (AnimatePresence) se termine sans attendre 200 ms.
  beforeAll(() => {
    MotionGlobalConfig.skipAnimations = true;
  });

  afterAll(() => {
    MotionGlobalConfig.skipAnimations = false;
  });

  const windowKeyDown = vi.fn();

  beforeAll(() => {
    window.addEventListener('keydown', windowKeyDown);
  });

  afterAll(() => {
    window.removeEventListener('keydown', windowKeyDown);
  });

  afterEach(() => {
    windowKeyDown.mockClear();
  });

  function PauseHarness({
    onClose,
    restoreFocus,
  }: {
    onClose?: () => void;
    restoreFocus?: boolean;
  }) {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
          }}
        >
          Pause
        </button>
        <ModalDialog
          isOpen={isOpen}
          title="Jeu en pause"
          restoreFocus={restoreFocus}
          onClose={() => {
            setIsOpen(false);
            onClose?.();
          }}
        >
          <FocusableButton>Reprendre</FocusableButton>
        </ModalDialog>
      </>
    );
  }

  function getBackdrop(): HTMLElement {
    const backdrop = document.querySelector<HTMLElement>('[role="presentation"]');
    if (!backdrop) throw new Error('Fond de la modale introuvable');
    return backdrop;
  }

  function InitialFocusHarness() {
    const resumeRef = useRef<HTMLButtonElement>(null);
    return (
      <ModalDialog isOpen title="Pause" initialFocusRef={resumeRef}>
        <FocusableButton>Quitter</FocusableButton>
        <FocusableButton ref={resumeRef}>Reprendre</FocusableButton>
      </ModalDialog>
    );
  }

  it('ne rend rien lorsqu’elle est fermée', () => {
    render(
      <ModalDialog isOpen={false} title="Pause">
        <p>Contenu</p>
      </ModalDialog>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ne rend rien au pré-rendu statique (aucun document côté serveur)', () => {
    const html = renderToString(
      <ModalDialog isOpen title="Pause">
        <p>Contenu</p>
      </ModalDialog>,
    );

    expect(html).toBe('');
  });

  it('s’ouvre dans un portail, nommée par son titre et décrite par son sous-titre', () => {
    const { container } = render(
      <ModalDialog isOpen title="Bravo !" subtitle="Étoile #3 gagnée">
        <p>Contenu</p>
      </ModalDialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Bravo !' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Étoile #3 gagnée');
    expect(container).not.toContainElement(dialog);
    expect(dialog).toHaveFocus();
  });

  it('réserve ses titres aux lecteurs d’écran dans une modale sans texte (FEAT-21)', () => {
    render(
      <ModalDialog isOpen isTextless title="Bravo !" subtitle="Étoile #3 gagnée">
        <p>Contenu</p>
      </ModalDialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Bravo !' });
    const heading = within(dialog).getByRole('heading', { level: 2, name: 'Bravo !' });
    const subtitle = within(dialog).getByText('Étoile #3 gagnée');

    // Le titre et le sous-titre sont masqués ensemble, par leur conteneur.
    expect(heading.parentElement).toHaveClass('sr-only');
    expect(subtitle.parentElement).toBe(heading.parentElement);
    // Toujours nommée et décrite, par les mêmes éléments.
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    expect(dialog).toHaveAttribute('aria-describedby', subtitle.id);
    expect(dialog).toHaveAccessibleName('Bravo !');
    expect(dialog).toHaveAccessibleDescription('Étoile #3 gagnée');
    // Le contenu de la modale, lui, reste affiché.
    expect(within(dialog).getByText('Contenu').closest('.sr-only')).toBeNull();
  });

  it('garde ses titres affichés par défaut', () => {
    render(
      <ModalDialog isOpen title="Bravo !" subtitle="Étoile #3 gagnée">
        <p>Contenu</p>
      </ModalDialog>,
    );

    const heading = screen.getByRole('heading', { level: 2, name: 'Bravo !' });

    expect(heading.parentElement).not.toHaveClass('sr-only');
    expect(heading.parentElement).toHaveClass('flex', 'flex-col', 'text-center');
  });

  it('impose un choix sans onClose : ni bouton Fermer, ni fermeture, Échap remonte au D-Pad', () => {
    render(
      <ModalDialog isOpen title="Victoire">
        <FocusableButton>Étoile suivante</FocusableButton>
      </ModalDialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Victoire' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(getBackdrop());

    expect(dialog).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('button', { name: 'Fermer' })).not.toBeInTheDocument();
    expect(windowKeyDown).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog', { name: 'Victoire' })).toBeInTheDocument();
  });

  it('se ferme avec Échap sans propager l’événement au moteur D-Pad', () => {
    const onClose = vi.fn();
    render(
      <ModalDialog isOpen title="Pause" onClose={onClose}>
        <p>Contenu</p>
      </ModalDialog>,
    );

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Pause' }), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
    expect(windowKeyDown).not.toHaveBeenCalled();
  });

  it('se ferme avec le bouton Fermer ou un tap sur le fond, sans perdre le focus', () => {
    const onClose = vi.fn();
    render(
      <ModalDialog isOpen title="Pause" onClose={onClose}>
        <p>Contenu</p>
      </ModalDialog>,
    );

    const backdrop = getBackdrop();
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(fireEvent.mouseDown(backdrop)).toBe(false);
    fireEvent.click(backdrop);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('focalise initialFocusRef à l’ouverture', () => {
    render(<InitialFocusHarness />);

    expect(screen.getByRole('button', { name: 'Reprendre' })).toHaveFocus();
  });

  it('piège Tab et Maj+Tab dans la boîte de dialogue', () => {
    render(
      <ModalDialog isOpen title="Pause" onClose={vi.fn()}>
        <FocusableButton>Reprendre</FocusableButton>
        <FocusableButton>Quitter</FocusableButton>
      </ModalDialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Pause' });
    const first = screen.getByRole('button', { name: 'Reprendre' });
    const last = screen.getByRole('button', { name: 'Fermer' });

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    // Au milieu de la boucle, Tab (et toute autre touche) garde son comportement natif.
    const middle = screen.getByRole('button', { name: 'Quitter' });
    middle.focus();
    expect(fireEvent.keyDown(middle, { key: 'Tab' })).toBe(true);
    expect(fireEvent.keyDown(middle, { key: 'Enter' })).toBe(true);
  });

  it('garde le focus sur la boîte de dialogue quand elle ne contient rien de focalisable', () => {
    render(
      <ModalDialog isOpen title="Chargement">
        <p>Un instant…</p>
      </ModalDialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Chargement' });

    expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(false);
    expect(dialog).toHaveFocus();
  });

  it('rend le focus à l’élément déclencheur après la fermeture', async () => {
    const onClose = vi.fn();
    render(<PauseHarness onClose={onClose} />);

    const opener = screen.getByRole('button', { name: 'Pause' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Jeu en pause' });
    expect(dialog).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      // Le focus est rendu au nettoyage des effets, dans une tâche distincte du retrait du DOM.
      expect(opener).toHaveFocus();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('laisse l’écran placer le focus à la fermeture avec restoreFocus à faux', async () => {
    render(<PauseHarness restoreFocus={false} />);

    const opener = screen.getByRole('button', { name: 'Pause' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Jeu en pause' }), { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(opener).not.toHaveFocus();
  });
});
