import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sans `globals: true`, Testing Library ne peut pas démonter les rendus automatiquement.
afterEach(() => {
  cleanup();
});

// jsdom n'implémente pas scrollIntoView, appelé par le moteur D-Pad (FEAT-04) : sans mise en page,
// défiler n'a pas de sens, une fonction vide suffit (les tests peuvent l'espionner). Garde : les
// tests de configuration tournent dans l'environnement `node`, sans DOM.
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    // Aucun défilement dans jsdom.
  };
}
