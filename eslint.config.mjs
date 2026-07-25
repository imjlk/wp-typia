import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

const repoJsFiles = [
  '*.{js,mjs,cjs}',
  'scripts/**/*.{js,mjs,cjs}',
  'tests/**/*.{js,mjs,cjs}',
  'packages/*/*.{js,mjs,cjs}',
  'packages/*/src/**/*.{js,mjs,cjs}',
  'packages/*/tests/**/*.{js,mjs,cjs}',
  'packages/*/scripts/**/*.{js,mjs,cjs}',
  'packages/*/bin/**/*.{js,mjs,cjs}',
];

const repoIgnores = [
  '**/*.d.ts',
  '.git/**',
  '.sampo/**',
  'build/**',
  'coverage/**',
  'dist/**',
  'examples/**',
  'node_modules/**',
  'packages/**/dist/**',
  'packages/create/templates/**',
  'packages/create/tests/fixtures/**',
  'packages/wp-typia-project-tools/tests/fixtures/**',
  'playwright-report/**',
  'test-results/**',
  'vendor/**',
];

export default [
  {
    ignores: repoIgnores,
  },
  {
    ...js.configs.recommended,
    files: repoJsFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.node,
      },
      sourceType: 'module',
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.node,
      },
      sourceType: 'commonjs',
    },
  },
  eslintConfigPrettier,
];
