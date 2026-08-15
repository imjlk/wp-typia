import type { ITtscLintPlugin } from '@ttsc/lint';
import { fileURLToPath } from 'node:url';

import packageJson from '../package.json' with { type: 'json' };

export const ruleNames = [
  'components-no-missing-40px-size-prop',
  'components-no-unsafe-button-disabled',
  'data-no-store-string-literals',
  'dependency-group',
  'i18n-ellipsis',
  'i18n-hyphenated-range',
  'i18n-no-collapsible-whitespace',
  'i18n-no-flanking-whitespace',
  'i18n-no-placeholders-only',
  'i18n-no-variables',
  'i18n-text-domain',
  'i18n-translator-comments',
  'no-base-control-with-label-without-id',
  'no-dom-globals-in-constructor',
  'no-dom-globals-in-module-scope',
  'no-dom-globals-in-react-cc-render',
  'no-dom-globals-in-react-fc',
  'no-ds-tokens',
  'no-global-active-element',
  'no-global-get-selection',
  'no-i18n-in-save',
  'no-non-module-stylesheet-imports',
  'no-setting-ds-tokens',
  'no-unguarded-get-range-at',
  'no-unknown-ds-tokens',
  'no-unmerged-classname',
  'no-unsafe-render-order',
  'no-unsafe-wp-apis',
  'no-unused-vars-before-return',
  'no-wp-process-env',
  'react-no-unsafe-timeout',
  'use-import-as',
  'use-recommended-components',
  'valid-sprintf',
  'wp-global-usage',
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
