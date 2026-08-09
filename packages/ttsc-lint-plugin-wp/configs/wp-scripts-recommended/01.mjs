import { fileURLToPath } from 'node:url';

const config = {
  files: ['**/*.test.js', '**/test/*.js'],
  rules: {
    'wordpress/no-global-active-element': 'off',
    'wordpress/no-global-get-selection': 'off',
  },
};

export default {
  ...config,
  extends: fileURLToPath(new URL('./00.mjs', import.meta.url)),
};
