import { fileURLToPath } from 'node:url';

const config = {
  files: ['**/*.ts', '**/*.tsx'],
  rules: {
    'no-duplicate-imports': 'off',
    'typescript/method-signature-style': 'error',
  },
};

export default {
  ...config,
  extends: fileURLToPath(new URL('./04.mjs', import.meta.url)),
};
