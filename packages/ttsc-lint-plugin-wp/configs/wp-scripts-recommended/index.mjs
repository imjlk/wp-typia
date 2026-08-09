import { fileURLToPath } from 'node:url';

export default {
  extends: fileURLToPath(new URL('./05.mjs', import.meta.url)),
};
