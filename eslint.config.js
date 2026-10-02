import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Layer boundaries from "Dependency rules" in docs/TECH.md.
const NO_PHASER = {
  regex: '^phaser(/|$)',
  message: 'src/core and src/data are pure TypeScript: no Phaser.',
};
const CORE_STAYS_IN_CORE = {
  regex: '(^|/)(data|systems|scenes|ui|debug)(/|$)',
  message: 'src/core must not import other layers. Pass content in as arguments instead.',
};
const DATA_ONLY_USES_CORE = {
  regex: '(^|/)(systems|scenes|ui|debug)(/|$)',
  message: 'src/data may only import from src/core.',
};

export default defineConfig([
  globalIgnores([
    'dist/',
    'dist-*/',
    'coverage/',
    'playwright-report/',
    'test-results/',
    'assets-src/',
    'public/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_PHASER, CORE_STAYS_IN_CORE] }],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in src/core/rng.ts.' },
        {
          object: 'Date',
          property: 'now',
          message: 'Pass the time in; core must be deterministic.',
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'performance'],
    },
  },
  {
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_PHASER, DATA_ONLY_USES_CORE] }],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  prettier,
]);
