import type { CommandOptionMetadataMap } from './types';

/**
 * Shared `wp-typia skills` option metadata.
 */
export const SKILLS_OPTION_METADATA = {
  force: {
    argumentKind: 'flag',
    description: 'Regenerate skill files even when content is unchanged.',
    short: 'f',
    type: 'boolean',
  },
  global: {
    argumentKind: 'flag',
    description: 'Install generated skills into global agent locations.',
    type: 'boolean',
  },
  local: {
    argumentKind: 'flag',
    description: 'Install generated skills into project-local agent locations.',
    type: 'boolean',
  },
} as const satisfies CommandOptionMetadataMap;
