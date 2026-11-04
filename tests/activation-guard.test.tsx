import { AppShell, FocusableButton, ModalDialog } from '@/components/ui';
import {
  ActivationGuardBridge,
  claimHistoryPop,
  END_SCREEN_GUARD_MS,
  guardActivations,
  installActivationGuard,
  isActivationGuarded,
  NavigationProvider,
  useGridNavigation,
  useNavigation,
  useNavigationScope,
  VIEW_CHANGE_GUARD_MS,
} from '@/core/navigation';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let removeGuard: (() => void) | null = null;

function install(): void {
  removeGuard = installActivationGuard();
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function getButton(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

afterEach(() => {
  removeGuard?.();
  removeGuard = null;
  vi.useRealTimers();
});

describe('Garde d’activation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('laisse tout passer tant qu’elle n’est pas installée (composant rendu seul)', () => {
    const onClick = vi.fn();
    render(<FocusableButton onClick={onClick}>Jouer</FocusableButton>);

    guardActivations();
    fireEvent.click(getButton('Jouer'));

    expect(isActivationGuarded()).toBe(false);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('ignore les clics pendant la garde, puis les laisse passer', () => {
    install();
    const onClick = vi.fn();
    render(<FocusableButton onClick={onClick}>Jouer</FocusableButton>);

    guardActivations(600);
    fireEvent.click(getButton('Jouer'));
    advance(599);
    fireEvent.click(getButton('Jouer'));
    expect(onClick).not.toHaveBeenCalled();

    advance(1);
    fireEvent.click(getButton('Jouer'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('une garde plus courte ne raccourcit pas celle en cours', () => {
    install();
    guardActivations(800);
    guardActivations(100);
    advance(700);
    expect(isActivationGuarded()).toBe(true);
    advance(130);
    expect(isActivationGuarded()).toBe(false);
  });

  it('au D-Pad, OK n’appelle pas la zone pendant la garde ; les flèches passent', () => {
    install();
    const onSelect = vi.fn();
    const onDirection = vi.fn();
    function Zone() {
      useNavigationScope({ scopeId: 'zone', onSelect, onDirection });
      return <p>Zone</p>;
    }
    document.documentElement.dataset.tv = 'on';
    render(
      <NavigationProvider>
        <Zone />
      </NavigationProvider>,
    );

    guardActivations();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onDirection).toHaveBeenCalledWith('left', false);

    advance(VIEW_CHANGE_GUARD_MS);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledOnce();
    delete document.documentElement.dataset.tv;
  });

  it('Retour pressé deux fois de suite ne dépile qu’une fois', () => {
    expect(claimHistoryPop()).toBe(true);
    expect(claimHistoryPop()).toBe(true);

    install();
    expect(claimHistoryPop()).toBe(true);
    expect(claimHistoryPop()).toBe(false);
    advance(VIEW_CHANGE_GUARD_MS);
    expect(claimHistoryPop()).toBe(true);
  });
});

describe('Montage dans l’application', () => {
  it('le pont installe la garde le temps de son montage', () => {
    const { unmount } = render(<ActivationGuardBridge />);
    guardActivations();
    expect(isActivationGuarded()).toBe(true);

    unmount();
    expect(isActivationGuarded()).toBe(false);
  });

  it('le layout racine monte la garde et les fournisseurs, dans le bon ordre', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    const order = [
      '<StorageProvider>',
      '<NavigationProvider>',
      '<AndroidBackButtonBridge />',
      '<ActivationGuardBridge />',
      '{children}',
      '</NavigationProvider>',
      '</StorageProvider>',
      '<ServiceWorkerRegistrar />',
    ].map((tag) => layout.indexOf(tag));

    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('Modale et écran gardés', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    install();
  });

  function ConfirmHarness({ onConfirm }: { onConfirm: () => void }) {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <FocusableButton
          onClick={() => {
            setIsOpen(true);
          }}
        >
          Tout effacer
        </FocusableButton>
        <ModalDialog
          isOpen={isOpen}
          title="Confirmer ?"
          onClose={() => {
            setIsOpen(false);
          }}
        >
          <FocusableButton onClick={onConfirm}>Effacer</FocusableButton>
        </ModalDialog>
      </>
    );
  }

  it('le second tap d’un double tap n’atteint pas le bouton apparu sous le doigt', () => {
    const onConfirm = vi.fn();
    render(<ConfirmHarness onConfirm={onConfirm} />);

    fireEvent.click(getButton('Tout effacer'));
    advance(300);
    fireEvent.click(getButton('Effacer'));
    expect(onConfirm).not.toHaveBeenCalled();

    advance(VIEW_CHANGE_GUARD_MS - 300);
    fireEvent.click(getButton('Effacer'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('un écran de fin garde ses boutons plus longtemps (`inputGuardMs`)', () => {
    const onNext = vi.fn();
    render(
      <ModalDialog isOpen title="Étoile gagnée" inputGuardMs={END_SCREEN_GUARD_MS}>
        <FocusableButton onClick={onNext}>Suivante</FocusableButton>
      </ModalDialog>,
    );

    advance(END_SCREEN_GUARD_MS - 1);
    fireEvent.click(getButton('Suivante'));
    expect(onNext).not.toHaveBeenCalled();

    advance(1);
    fireEvent.click(getButton('Suivante'));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('un tap juste après la fermeture n’atteint pas l’écran de dessous', () => {
    const onScreen = vi.fn();
    function Harness() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <>
          <FocusableButton onClick={onScreen}>Carte</FocusableButton>
          <ModalDialog isOpen={isOpen} title="Joueur">
            <FocusableButton
              onClick={() => {
                setIsOpen(false);
              }}
            >
              Choisir
            </FocusableButton>
          </ModalDialog>
        </>
      );
    }
    render(<Harness />);
    advance(VIEW_CHANGE_GUARD_MS);

    fireEvent.click(getButton('Choisir'));
    advance(300);
    fireEvent.click(screen.getByText('Carte'));
    expect(onScreen).not.toHaveBeenCalled();
  });

  it('un écran qui arrive ignore le tap qui l’a ouvert', () => {
    const onBack = vi.fn();
    render(
      <AppShell title="Carte" onBack={onBack}>
        <p>Contenu</p>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(onBack).not.toHaveBeenCalled();

    advance(VIEW_CHANGE_GUARD_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('Modale en train de se fermer', () => {
  function ClosingHarness({
    onConfirm,
    onScreenSelect,
    onScreenBack,
  }: {
    onConfirm?: () => void;
    onScreenSelect?: () => void;
    onScreenBack?: () => void;
  }) {
    const [isOpen, setIsOpen] = useState(true);
    useNavigationScope({
      scopeId: 'ecran',
      onSelect: onScreenSelect,
      onBack: onScreenBack,
    });
    return (
      <>
        <FocusableButton
          onClick={() => {
            setIsOpen(true);
          }}
        >
          Ouvrir
        </FocusableButton>
        <ModalDialog
          isOpen={isOpen}
          title="Supprimer ?"
          onClose={() => {
            setIsOpen(false);
          }}
        >
          <ClosingActions onConfirm={onConfirm} />
        </ModalDialog>
      </>
    );
  }

  function ClosingActions({ onConfirm }: { onConfirm?: () => void }) {
    const zone = useGridNavigation({ scopeId: 'actions', rows: 1, cols: 1, initialIndex: 0 });
    return (
      <FocusableButton
        ref={zone.getItemRef(0)}
        isFocused={zone.isItemFocused(0)}
        onClick={onConfirm}
      >
        Supprimer
      </FocusableButton>
    );
  }

  function BackProbe({ onReady }: { onReady: (dispatchBack: () => boolean) => void }) {
    const { dispatchBack } = useNavigation();
    onReady(dispatchBack);
    return null;
  }

  afterEach(() => {
    delete document.documentElement.dataset.tv;
  });

  it('Échap puis Entrée ne confirme pas ce qui vient d’être annulé', () => {
    document.documentElement.dataset.tv = 'on';
    const onConfirm = vi.fn();
    render(
      <NavigationProvider>
        <ClosingHarness onConfirm={onConfirm} />
      </NavigationProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Supprimer ?' });

    fireEvent.keyDown(dialog, { key: 'Escape' });

    // Animation de sortie en cours : la modale est encore à l'écran, mais fermée.
    expect(dialog).toHaveAttribute('inert');
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('le fond ne referme pas une seconde fois et Retour ne quitte pas l’application', () => {
    let dispatchBack: () => boolean = () => false;
    const onScreenBack = vi.fn();
    render(
      <NavigationProvider>
        <BackProbe
          onReady={(dispatch) => {
            dispatchBack = dispatch;
          }}
        />
        <ClosingHarness onScreenBack={onScreenBack} />
      </NavigationProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Supprimer ?' });
    fireEvent.keyDown(dialog, { key: 'Escape' });

    // Bouton Retour physique pendant la sortie : rien n'est quitté, l'écran dessous reste suspendu.
    expect(dispatchBack()).toBe(true);
    expect(onScreenBack).not.toHaveBeenCalled();
  });

  it('Échap maintenue ne ferme qu’une modale', () => {
    const onClose = vi.fn();
    render(
      <ModalDialog isOpen title="Pause" onClose={onClose}>
        <FocusableButton>Reprendre</FocusableButton>
      </ModalDialog>,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', repeat: true });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('deux modales imbriquées fermées ensemble rendent le focus au déclencheur de la première', () => {
    function Harness() {
      const [step, setStep] = useState(0);
      const cancel = () => {
        setStep(0);
      };
      return (
        <>
          <FocusableButton
            onClick={() => {
              setStep(1);
            }}
          >
            Tout effacer
          </FocusableButton>
          <ModalDialog isOpen={step > 0} title="Réinitialiser ?" onClose={cancel}>
            <FocusableButton
              onClick={() => {
                setStep(2);
              }}
            >
              Continuer
            </FocusableButton>
            <ModalDialog isOpen={step === 2} title="Définitivement ?" onClose={cancel}>
              <FocusableButton onClick={cancel}>Annuler</FocusableButton>
            </ModalDialog>
          </ModalDialog>
        </>
      );
    }
    render(<Harness />);

    getButton('Tout effacer').focus();
    fireEvent.click(getButton('Tout effacer'));
    fireEvent.click(getButton('Continuer'));
    fireEvent.click(getButton('Annuler'));

    // La modale imbriquée se ferme avec sa parente, qui la garde le temps de son animation.
    expect(screen.getByRole('dialog', { name: 'Définitivement ?', hidden: true })).toHaveAttribute(
      'inert',
    );
    expect(getButton('Tout effacer')).toHaveFocus();
  });

  it('rend le focus dès la fermeture, sauf si l’écran l’a déjà placé ailleurs', () => {
    function Harness() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <FocusableButton
            onClick={() => {
              setIsOpen(true);
            }}
          >
            Ouvrir
          </FocusableButton>
          <FocusableButton>Terminé</FocusableButton>
          <ModalDialog isOpen={isOpen} title="Pause">
            <FocusableButton
              onClick={() => {
                setIsOpen(false);
              }}
            >
              Fermer
            </FocusableButton>
            <FocusableButton
              onClick={() => {
                getButton('Terminé').focus();
                setIsOpen(false);
              }}
            >
              Fermer ailleurs
            </FocusableButton>
          </ModalDialog>
        </>
      );
    }
    render(<Harness />);

    getButton('Ouvrir').focus();
    fireEvent.click(getButton('Ouvrir'));
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    // Pas besoin d'attendre la fin de l'animation : le panneau, inerte, perdrait le focus.
    expect(getButton('Ouvrir')).toHaveFocus();

    fireEvent.click(getButton('Ouvrir'));
    fireEvent.click(getButton('Fermer ailleurs'));
    expect(getButton('Terminé')).toHaveFocus();
  });
});

describe('Tap sans clic du navigateur', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    install();
    // jsdom ne fait aucune mise en page : le doigt est toujours sur le bouton touché.
    vi.spyOn(document, 'elementFromPoint').mockImplementation(() =>
      document.querySelector('button'),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function touchDown(target: Element, pointerId: number, x = 10, y = 10): void {
    fireEvent.pointerDown(target, { pointerId, pointerType: 'touch', clientX: x, clientY: y });
  }

  function touchMove(target: Element, pointerId: number, x: number, y: number): void {
    fireEvent.pointerMove(target, { pointerId, pointerType: 'touch', clientX: x, clientY: y });
  }

  function touchUp(target: Element, pointerId: number, x = 10, y = 10): void {
    fireEvent.pointerUp(target, { pointerId, pointerType: 'touch', clientX: x, clientY: y });
  }

  function renderButton() {
    const onClick = vi.fn();
    render(<FocusableButton onClick={onClick}>Stop</FocusableButton>);
    return { onClick, button: getButton('Stop') };
  }

  it('une main posée : le tap du second doigt active le bouton', () => {
    const { onClick, button } = renderButton();

    touchDown(document.body, 1, 300, 600);
    touchDown(button, 2);
    touchUp(button, 2);
    expect(onClick).not.toHaveBeenCalled();

    advance(130);
    expect(onClick).toHaveBeenCalledOnce();
    expect(button).toHaveFocus();
  });

  it('la main posée qui se relève n’active rien, même posée sur un bouton', () => {
    const { onClick, button } = renderButton();

    touchDown(button, 1);
    touchDown(document.body, 2, 300, 600);
    touchUp(document.body, 2, 300, 600);
    touchUp(button, 1);

    advance(130);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('le clic du navigateur reste seul quand il arrive', () => {
    const { onClick, button } = renderButton();

    touchDown(button, 1);
    touchUp(button, 1);
    fireEvent.click(button);
    advance(1000);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('un clic du navigateur en retard n’active pas le bouton une seconde fois', () => {
    const { onClick, button } = renderButton();

    touchDown(button, 1);
    touchUp(button, 1);
    advance(130);
    expect(onClick).toHaveBeenCalledOnce();

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();

    // Plus tard, c'est un autre tap.
    advance(500);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('un appui long (jusqu’à une seconde) active le bouton, pas au-delà', () => {
    const { onClick, button } = renderButton();

    touchDown(button, 1);
    advance(700);
    touchUp(button, 1);
    advance(130);
    expect(onClick).toHaveBeenCalledOnce();

    advance(500);
    touchDown(button, 1);
    advance(1500);
    touchUp(button, 1);
    advance(130);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('un doigt qui glisse n’est pas un tap', () => {
    const { onClick, button } = renderButton();

    touchDown(button, 1);
    touchMove(button, 1, 30, 10);
    touchMove(button, 1, 10, 10);
    touchUp(button, 1);
    advance(130);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('le doigt qui arrête un défilement n’active rien : le navigateur ne clique pas, à raison', () => {
    const { onClick, button } = renderButton();

    // Défilement en cours (lancé du doigt) : un tap l'arrête, sans viser ce qui passe dessous.
    fireEvent.scroll(document.body);
    touchDown(button, 1);
    touchUp(button, 1);
    advance(130);
    expect(onClick).not.toHaveBeenCalled();

    // Défilement fini : un tap redevient un tap.
    advance(200);
    touchDown(button, 1);
    touchUp(button, 1);
    advance(130);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('une main posée : deux taps rapprochés de deux autres doigts partent tous les deux', () => {
    const onKing = vi.fn();
    const onQueen = vi.fn();
    render(
      <>
        <FocusableButton onClick={onKing}>Roi</FocusableButton>
        <FocusableButton onClick={onQueen}>Dame</FocusableButton>
      </>,
    );
    const king = getButton('Roi');
    const queen = getButton('Dame');
    vi.spyOn(document, 'elementFromPoint').mockImplementation((x) => (x < 100 ? king : queen));

    touchDown(document.body, 1, 300, 600);
    touchDown(king, 2, 10, 10);
    touchUp(king, 2, 10, 10);
    advance(40);
    touchDown(queen, 3, 200, 10);
    touchUp(queen, 3, 200, 10);
    advance(130);

    expect(onKing).toHaveBeenCalledOnce();
    expect(onQueen).toHaveBeenCalledOnce();
  });

  it('un pointeur annulé par le système n’active rien', () => {
    const { onClick, button } = renderButton();

    touchDown(button, 1);
    fireEvent.pointerCancel(button, { pointerId: 1, pointerType: 'touch' });
    touchUp(button, 1);
    advance(130);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('la souris et les zones sans bouton ne sont pas concernées', () => {
    const { onClick, button } = renderButton();

    fireEvent.pointerDown(button, { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 });
    fireEvent.pointerUp(button, { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 });
    touchDown(document.body, 2);
    touchUp(document.body, 2);
    advance(130);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('une modale ouverte entre-temps : le bouton n’est plus sous le doigt, rien ne part', () => {
    const { onClick, button } = renderButton();
    vi.spyOn(document, 'elementFromPoint').mockImplementation(() => document.body);

    touchDown(button, 1);
    touchUp(button, 1);
    advance(130);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('la garde s’applique aussi au tap sans clic', () => {
    const { onClick, button } = renderButton();

    guardActivations(600);
    touchDown(button, 1);
    touchUp(button, 1);
    advance(130);
    expect(onClick).not.toHaveBeenCalled();

    advance(500);
    touchDown(button, 1);
    touchUp(button, 1);
    advance(130);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
