import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/types/**',
        'src/app/layout.tsx',
        // Mince enveloppe qui rend <html>, impossible à imbriquer dans un conteneur de test jsdom.
        'src/app/global-error.tsx',
        // Glue du service worker (FEAT-17), exécutée uniquement dans le contexte service worker.
        'src/core/pwa/sw/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // Moteur pur de Memory (FEAT-09) : 90 % exigés, hors composants d'interface (FEAT-10).
        'src/games/memory/*.ts': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        // Moteur pur de Traffic Jam (FEAT-12) : 90 % exigés, hors composants d'interface (FEAT-13).
        'src/games/traffic-jam/*.ts': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        // Moteur pur de Suites Logiques (FEAT-21) : 90 % exigés, hors composants d'interface.
        'src/games/patterns/*.ts': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        // Moteur pur d'Attrape-Piège (FEAT-23) : 90 % exigés, hors composants d'interface (FEAT-24).
        'src/games/bear-sort/*.ts': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
});
