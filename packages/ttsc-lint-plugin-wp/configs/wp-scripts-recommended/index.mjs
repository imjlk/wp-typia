import { fileURLToPath } from 'node:url';

export default {
  extends: fileURLToPath(new URL('./03.mjs', import.meta.url)),
};
