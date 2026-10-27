import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const eslintConfig = defineConfig([
  globalIgnores([
    'out/**',
    '.next/**',
    'coverage/**',
    'android/**',
    'node_modules/**',
    'next-env.d.ts',
  ]),
  js.configs.recommended,
  ...nextVitals,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // eslint-config-next enregistre déjà le plugin jsx-a11y : réutiliser `flatConfigs.strict`
    // tel quel le redéclarerait (« Cannot redefine plugin »). On n'en reprend que les règles.
    name: 'mia/jsx-a11y-strict',
    rules: jsxA11y.flatConfigs.strict.rules,
  },
  {
    name: 'mia/rules',
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    // Les fichiers de configuration JS ne font pas partie du tsconfig : pas de règles typées.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  eslintConfigPrettier,
]);

export default eslintConfig;
