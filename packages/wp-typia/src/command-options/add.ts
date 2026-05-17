import type { CommandOptionMetadataMap } from './types';

/**
 * Shared `wp-typia add` option metadata used by both runtime entry paths.
 */
export const ADD_OPTION_METADATA = {
  'alternate-render-targets': {
    description:
      'Comma-separated alternate render targets for dynamic block scaffolds (email,mjml,plain-text).',
    type: 'string',
  },
  anchor: {
    description: 'Anchor block name for hooked-block workflows.',
    type: 'string',
  },
  attribute: {
    description:
      'Target block attribute for end-to-end binding-source workflows.',
    type: 'string',
  },
  auth: {
    description:
      'Auth intent for manual REST contract workflows (public, authenticated, or public-write-protected).',
    type: 'string',
  },
  block: {
    description:
      'Target block slug/name for variation, core-variation, style, and end-to-end binding-source workflows.',
    type: 'string',
  },
  'catalog-title': {
    description:
      'Human-readable title for typed pattern catalog entries; defaults to the pattern slug title.',
    type: 'string',
  },
  'controller-class': {
    description:
      'REST resource controller class used for generated route callbacks or declared manual/provider route ownership.',
    type: 'string',
  },
  'controller-extends': {
    description:
      'Optional base class for generated REST resource controller wrappers or declared manual/provider controller ownership.',
    type: 'string',
  },
  'data-storage': {
    description: 'Persistence storage mode for persistence-capable templates.',
    type: 'string',
  },
  'dry-run': {
    argumentKind: 'flag',
    description:
      'Preview workspace file updates and completion guidance without writing them.',
    type: 'boolean',
  },
  'external-layer-id': {
    description:
      'Explicit layer id when an external layer package exposes multiple selectable layers.',
    type: 'string',
  },
  'external-layer-source': {
    description:
      'Local path, GitHub locator, or npm package that exposes wp-typia.layers.json for built-in block templates.',
    type: 'string',
  },
  from: {
    description:
      'Source full block name (namespace/block) for transform workflows.',
    type: 'string',
  },
  'from-post-meta': {
    description:
      'Alias for --post-meta when backing a binding-source scaffold from a typed post-meta contract.',
    type: 'string',
  },
  'inner-blocks-preset': {
    description:
      'Compound-only InnerBlocks preset (freeform, ordered, horizontal, locked-structure).',
    type: 'string',
  },
  manual: {
    argumentKind: 'flag',
    description:
      'Create a type-only manual REST contract without PHP route/controller files.',
    type: 'boolean',
  },
  'hide-from-rest': {
    argumentKind: 'flag',
    description:
      'Keep a generated post-meta contract out of WordPress REST/editor responses.',
    type: 'boolean',
  },
  'meta-key': {
    description:
      'WordPress meta key for post-meta workflows; defaults to _<phpPrefix>_<name>.',
    type: 'string',
  },
  'meta-path': {
    description:
      'Top-level post-meta field used as the default binding-source field when --post-meta or --from-post-meta is provided.',
    type: 'string',
  },
  method: {
    description:
      'HTTP method for manual REST contract workflows (GET, POST, PUT, PATCH, or DELETE).',
    type: 'string',
  },
  methods: {
    description:
      'Comma-separated REST resource methods for rest-resource workflows.',
    type: 'string',
  },
  namespace: {
    description: 'REST namespace for rest-resource and ai-feature workflows.',
    type: 'string',
  },
  'permission-callback': {
    description:
      'PHP permission callback for generated route registrations or declared manual/provider route ownership.',
    type: 'string',
  },
  'post-type': {
    description: 'WordPress post type key for post-meta workflows.',
    type: 'string',
  },
  'post-meta': {
    description:
      'Typed post-meta contract slug used to back a binding-source scaffold.',
    type: 'string',
  },
  'persistence-policy': {
    description: 'Persistence write policy for persistence-capable templates.',
    type: 'string',
  },
  path: {
    description:
      'Route path pattern for manual REST contract workflows, relative to the REST namespace.',
    type: 'string',
  },
  position: {
    description: 'Hook position for hooked-block workflows.',
    type: 'string',
  },
  'query-type': {
    description:
      'Exported TypeScript query type for manual REST contract workflows.',
    type: 'string',
  },
  'response-type': {
    description:
      'Exported TypeScript response type for manual REST contract workflows.',
    type: 'string',
  },
  'release-zip': {
    argumentKind: 'flag',
    description:
      'Add release zip packaging scripts for integration-env plugin QA workflows.',
    type: 'boolean',
  },
  'route-pattern': {
    description:
      'REST route pattern relative to the namespace; generated resources use it for item routes and manual/provider contracts may use it as an alias for --path.',
    type: 'string',
  },
  scope: {
    description:
      'Pattern catalog scope for pattern workflows; one of full or section.',
    type: 'string',
  },
  'section-role': {
    description:
      'Typed section role for section-scoped pattern catalog entries; requires --scope section.',
    type: 'string',
  },
  'secret-field': {
    description:
      'Write-only request body field for manual settings REST contracts; requires --manual and a request body, typically generated by POST, PUT, or PATCH.',
    type: 'string',
  },
  'secret-has-value-field': {
    description:
      'Alias for --secret-state-field when the manual settings response exposes a safe has-value indicator.',
    type: 'string',
  },
  'secret-masked-response-field': {
    description:
      'Alias for --secret-state-field when the manual settings response exposes masked secret state.',
    type: 'string',
  },
  'secret-preserve-on-empty': {
    description:
      'Whether blank manual settings secret submissions should preserve the stored secret (true by default).',
    type: 'string',
  },
  'secret-state-field': {
    description:
      'Masked response boolean field for --secret-field; defaults to has<SecretField> and may also be provided as --secret-has-value-field.',
    type: 'string',
  },
  service: {
    description:
      'Optional local service starter for integration-env workflows (none or docker-compose).',
    type: 'string',
  },
  slot: {
    description:
      'Document editor shell slot for editor-plugin workflows (sidebar or document-setting-panel).',
    type: 'string',
  },
  source: {
    description:
      'Optional data source locator for admin-view workflows, such as rest-resource:products or core-data:postType/post.',
    type: 'string',
  },
  template: {
    description:
      'Optional built-in block family for the new block; interactive flows let you choose it when omitted and non-interactive runs default to basic.',
    type: 'string',
  },
  'thumbnail-url': {
    description:
      'Optional thumbnail URL or relative path for typed pattern catalog entries.',
    type: 'string',
  },
  tags: {
    description:
      'Comma-separated tags for typed pattern catalog entries; combine with repeatable --tag for single tags.',
    repeatable: true,
    type: 'string',
  },
  tag: {
    description:
      'Repeatable single tag for typed pattern catalog entries; use --tags for comma-separated lists.',
    repeatable: true,
    type: 'string',
  },
  type: {
    description:
      'Exported TypeScript type or interface name for standalone contract workflows.',
    type: 'string',
  },
  'body-type': {
    description:
      'Exported TypeScript body type for manual REST contract workflows.',
    type: 'string',
  },
  to: {
    description:
      'Target workspace block slug or full block name for transform workflows.',
    type: 'string',
  },
  'wp-env': {
    argumentKind: 'flag',
    description:
      'Add a local @wordpress/env preset for integration-env workflows.',
    type: 'boolean',
  },
} as const satisfies CommandOptionMetadataMap;
