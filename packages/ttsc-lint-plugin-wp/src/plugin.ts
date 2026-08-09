import type { ITtscLintPlugin } from '@ttsc/lint';
import { fileURLToPath } from 'node:url';

import packageJson from '../package.json' with { type: 'json' };

export const ruleNames = [
  'i18n-ellipsis',
  'i18n-hyphenated-range',
  'i18n-no-collapsible-whitespace',
  'i18n-no-flanking-whitespace',
  'i18n-no-placeholders-only',
  'i18n-no-variables',
  'i18n-text-domain',
  'i18n-translator-comments',
  'no-unsafe-wp-apis',
  'valid-sprintf',
] as const;

export const plugin = {
  meta: {
    name: packageJson.name,
    namespace: 'wordpress',
    version: packageJson.version,
  },
  rules: ruleNames,
  source: fileURLToPath(new URL('../rules', import.meta.url)),
} satisfies ITtscLintPlugin;

export default plugin;
