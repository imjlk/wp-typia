import type { CommandOptionMetadataMap } from './types';

/**
 * Shared `wp-typia create` option metadata used by the Gunshi runtime parser
 * and help surface.
 */
export const CREATE_OPTION_METADATA = {
  'alternate-render-targets': {
    description:
      'Comma-separated alternate render targets for dynamic block scaffolds (email,mjml,plain-text).',
    type: 'string',
  },
  'data-storage': {
    description: 'Persistence storage mode for persistence-capable templates.',
    type: 'string',
  },
  'dry-run': {
    argumentKind: 'flag',
    description:
      'Preview scaffold output for a logical <project-dir> without writing files to the target directory.',
    type: 'boolean',
  },
  'external-layer-id': {
    description:
      'Explicit layer id when an external layer package exposes multiple selectable layers.',
    type: 'string',
  },
  'external-layer-source': {
    description:
      'Local path, GitHub locator, or npm package that exposes wp-typia.layers.json for built-in templates.',
    type: 'string',
  },
  'inner-blocks-preset': {
    description:
      'Compound-only InnerBlocks preset (freeform, ordered, horizontal, locked-structure).',
    type: 'string',
  },
  namespace: {
    description: 'Override the default block namespace.',
    type: 'string',
  },
  'no-install': {
    argumentKind: 'flag',
    description: 'Skip dependency installation after scaffold.',
    type: 'boolean',
  },
  'package-manager': {
    description: 'Package manager to use for install and scripts.',
    short: 'p',
    type: 'string',
  },
  'persistence-policy': {
    description:
      'Authenticated or public write policy for persistence-capable templates.',
    type: 'string',
  },
  'php-prefix': {
    description: 'Custom PHP symbol prefix.',
    type: 'string',
  },
  profile: {
    description:
      'Opt-in scaffold profile; use plugin-qa with --template workspace for wp-env, smoke, and release zip starters.',
    type: 'string',
  },
  'query-post-type': {
    description: 'Default post type assigned to Query Loop variation scaffolds.',
    type: 'string',
  },
  template: {
    description: 'Template id or external template package.',
    short: 't',
    type: 'string',
  },
  'text-domain': {
    description: 'Custom text domain for the generated project.',
    type: 'string',
  },
  variant: {
    description: 'Optional template variant identifier.',
    type: 'string',
  },
  'with-migration-ui': {
    argumentKind: 'flag',
    description: 'Enable migration UI support when the template supports it.',
    type: 'boolean',
  },
  'with-test-preset': {
    argumentKind: 'flag',
    description: 'Include the Playwright smoke-test preset.',
    type: 'boolean',
  },
  'with-wp-env': {
    argumentKind: 'flag',
    description: 'Include a local wp-env preset.',
    type: 'boolean',
  },
  'wp-version': {
    description:
      'WordPress target for generated plugin headers; one of 6.9 or 7.0. Defaults to 7.0.',
    type: 'string',
  },
  yes: {
    argumentKind: 'flag',
    description: 'Accept defaults without prompt fallbacks.',
    short: 'y',
    type: 'boolean',
  },
} as const satisfies CommandOptionMetadataMap;
