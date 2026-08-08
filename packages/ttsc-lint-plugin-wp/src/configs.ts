import type { ITtscLintConfig } from '@ttsc/lint';

import { plugin } from './plugin.js';

const plugins = { wordpress: plugin } as const;

export const configs = {
  custom: {
    plugins,
    rules: {
      'wordpress/no-unsafe-wp-apis': 'error',
    },
  },
  i18n: {
    plugins,
    rules: {
      'wordpress/i18n-text-domain': 'error',
      'wordpress/valid-sprintf': 'error',
    },
  },
  recommended: {
    plugins,
    rules: {
      'wordpress/i18n-text-domain': 'error',
      'wordpress/no-unsafe-wp-apis': 'error',
      'wordpress/valid-sprintf': 'error',
    },
  },
} as const satisfies Record<'custom' | 'i18n' | 'recommended', ITtscLintConfig>;

export const presetCompatibility = {
  custom: {
    coverage: 'partial',
    upstream: '@wordpress/eslint-plugin/custom',
  },
  i18n: {
    coverage: 'partial',
    upstream: '@wordpress/eslint-plugin/i18n',
  },
  recommended: {
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
