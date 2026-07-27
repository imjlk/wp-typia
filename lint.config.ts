import type { ITtscLintConfig } from '@ttsc/lint';

export default {
  ignores: [
    '**/*.d.ts',
    '**/build/**',
    '**/coverage/**',
    '**/dist/**',
    '**/dist-bunli/**',
    '**/node_modules/**',
    '**/vendor/**',
  ],
  format: {
    severity: 'error',
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    endOfLine: 'lf',
    sortImports: false,
    jsDoc: false,
  },
  rules: {
    'no-var': 'error',
    'prefer-const': 'error',
    eqeqeq: 'error',
  },
} satisfies ITtscLintConfig;
