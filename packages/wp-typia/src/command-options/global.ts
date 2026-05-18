import type { CommandOptionMetadataMap } from './types';

/**
 * Global option metadata used by portable CLI parsing before command dispatch.
 */
export const GLOBAL_OPTION_METADATA = {
  config: {
    description: 'Config override file path.',
    short: 'c',
    type: 'string',
  },
  format: {
    description: 'Output format for supported commands (`json` or `text`).',
    type: 'string',
  },
  id: {
    description: 'Template id for top-level `templates inspect` convenience.',
    type: 'string',
  },
} as const satisfies CommandOptionMetadataMap;
