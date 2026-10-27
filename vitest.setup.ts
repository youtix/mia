import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sans `globals: true`, Testing Library ne peut pas démonter les rendus automatiquement.
afterEach(() => {
  cleanup();
});
