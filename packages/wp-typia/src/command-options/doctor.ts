import type { CommandOptionMetadataMap } from './types';

/**
 * Shared `wp-typia doctor` option metadata.
 */
export const DOCTOR_OPTION_METADATA = {
  format: {
    description:
      'Use `json` for machine-readable doctor check output or `text` for human-readable output.',
    type: 'string',
  },
  'workspace-only': {
    argumentKind: 'flag',
    description:
      'Fail only on workspace-scoped doctor checks; environment/runtime failures remain advisory in JSON summaries.',
    type: 'boolean',
  },
  'wp-version-check': {
    argumentKind: 'flag',
    description:
      'Check generated WordPress feature floors against plugin bootstrap headers and the current scaffold target.',
    type: 'boolean',
  },
} as const satisfies CommandOptionMetadataMap;
