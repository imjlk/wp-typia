import type { ITtscLintConfig } from '@ttsc/lint';
import { fileURLToPath } from 'node:url';

import { plugin } from './plugin.js';

const plugins = { wordpress: plugin } as const;
const wpScriptsRecommendedConfigPath = fileURLToPath(
  new URL('../configs/wp-scripts-recommended/index.mjs', import.meta.url),
);

export const configs = {
  custom: {
    plugins,
    rules: {
      'wordpress/no-base-control-with-label-without-id': 'error',
      'wordpress/no-global-active-element': 'error',
      'wordpress/no-global-get-selection': 'error',
      'wordpress/no-setting-ds-tokens': 'error',
      'wordpress/no-unguarded-get-range-at': 'error',
      'wordpress/no-unknown-ds-tokens': 'error',
      'wordpress/no-unsafe-render-order': 'error',
      'wordpress/no-unsafe-wp-apis': 'error',
      'wordpress/no-unused-vars-before-return': 'error',
      'wordpress/no-wp-process-env': 'error',
    },
  },
  i18n: {
    plugins,
    rules: {
      'wordpress/i18n-ellipsis': 'error',
      'wordpress/i18n-hyphenated-range': 'error',
      'wordpress/i18n-no-collapsible-whitespace': 'error',
      'wordpress/i18n-no-flanking-whitespace': 'error',
      'wordpress/i18n-no-placeholders-only': 'error',
      'wordpress/i18n-no-variables': 'error',
      'wordpress/i18n-text-domain': 'error',
      'wordpress/i18n-translator-comments': 'error',
      'wordpress/valid-sprintf': 'error',
    },
  },
  recommended: {
    plugins,
    rules: {
      'wordpress/i18n-ellipsis': 'error',
      'wordpress/i18n-hyphenated-range': 'error',
      'wordpress/i18n-no-collapsible-whitespace': 'error',
      'wordpress/i18n-no-flanking-whitespace': 'error',
      'wordpress/i18n-no-placeholders-only': 'error',
      'wordpress/i18n-no-variables': 'error',
      'wordpress/i18n-text-domain': 'error',
      'wordpress/i18n-translator-comments': 'error',
      'wordpress/no-base-control-with-label-without-id': 'error',
      'wordpress/no-global-active-element': 'error',
      'wordpress/no-global-get-selection': 'error',
      'wordpress/no-setting-ds-tokens': 'error',
      'wordpress/no-unguarded-get-range-at': 'error',
      'wordpress/no-unknown-ds-tokens': 'error',
      'wordpress/no-unsafe-render-order': 'error',
      'wordpress/no-unsafe-wp-apis': 'error',
      'wordpress/no-unused-vars-before-return': [
        'error',
        { excludePattern: '^use' },
      ],
      'wordpress/no-wp-process-env': 'error',
      'wordpress/valid-sprintf': 'error',
    },
  },
  wpScriptsRecommended: {
    extends: wpScriptsRecommendedConfigPath,
    plugins,
  },
} as const satisfies Record<
  'custom' | 'i18n' | 'recommended' | 'wpScriptsRecommended',
  ITtscLintConfig
>;

export const presetCompatibility = {
  custom: {
    coverage: 'partial',
    upstream: '@wordpress/eslint-plugin/custom',
  },
  i18n: {
    coverage: 'full',
    upstream: '@wordpress/eslint-plugin/i18n',
  },
  recommended: {
    coverage: 'partial',
    upstream: '@wordpress/eslint-plugin/recommended',
  },
  wpScriptsRecommended: {
    coverage: 'partial',
    upstream: '@wordpress/eslint-plugin/recommended',
  },
} as const satisfies Record<
  keyof typeof configs,
  {
    coverage: 'full' | 'none' | 'partial';
    upstream: string;
  }
>;
