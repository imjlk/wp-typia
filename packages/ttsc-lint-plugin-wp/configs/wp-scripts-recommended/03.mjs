import { fileURLToPath } from 'node:url';

const config = {
  files: ['**/*.ts', '**/*.tsx'],
  rules: {
    'no-duplicate-imports': 'off',
    'no-shadow': 'off',
    'typescript/method-signature-style': 'error',
  },
};

export default {
  ...config,
  extends: fileURLToPath(new URL('./02.mjs', import.meta.url)),
};
