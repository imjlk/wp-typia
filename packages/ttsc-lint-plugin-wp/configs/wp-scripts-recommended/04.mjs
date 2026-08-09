import { fileURLToPath } from 'node:url';

const config = {
  ignores: ['**/*.d.ts'],
  rules: {},
};

export default {
  ...config,
  extends: fileURLToPath(new URL('./03.mjs', import.meta.url)),
};
