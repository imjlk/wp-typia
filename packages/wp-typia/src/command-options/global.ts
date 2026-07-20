import type { CommandOptionMetadataMap } from './types';

export const PUBLIC_CLI_OUTPUT_FORMATS = ['json', 'text'] as const;

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
    choices: PUBLIC_CLI_OUTPUT_FORMATS,
    description:
      'Output format for supported commands (`json` or `text`); defaults to `json` in detected AI-agent environments and `text` otherwise.',
    type: 'string',
  },
  id: {
    description: 'Template id for top-level `templates inspect` convenience.',
    hidden: true,
    type: 'string',
  },
} as const satisfies CommandOptionMetadataMap;
