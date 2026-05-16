// ESLint flat config for the web app.
// Keep rules pragmatic for an early-stage MVP — surface the things that
// silently break behavior (hooks, unused vars in source), don't enforce
// taste-level style that the team hasn't agreed on yet.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'node_modules', 'public'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Too many false positives on legitimate prop-sync effects in this codebase.
      'react-hooks/set-state-in-effect': 'off',
      // `Date.now()` / `new Date()` inside render are common for time-window filters
      // (CalendarScreen, ActivityScreen). Strictly impure, but value of flagging
      // doesn't outweigh the noise. Revisit if we add SSR.
      'react-hooks/purity': 'off',
      // Treat exhaustive-deps as warning — intentional partial deps are common in
      // controlled-form components that only re-seed on identity change.
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'off', // PostgREST `any` casts widely used; revisit later
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['test/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['vite.config.ts', 'vitest.config.ts', 'pwa-assets.config.ts', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
