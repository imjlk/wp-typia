import {
  HOOKED_BLOCK_ANCHOR_PATTERN,
  HOOKED_BLOCK_POSITION_IDS,
  type HookedBlockPositionId,
} from './hooked-blocks.js';
import {
	toSnakeCase,
} from '../shared/string-case.js';
import { quoteTypeScriptString } from '../shared/ts-string-literals.js';
import {
  ADD_BLOCK_TEMPLATE_IDS,
  type AddBlockTemplateId,
  EDITOR_PLUGIN_SLOT_IDS,
  type EditorPluginSlotId,
  INTEGRATION_ENV_SERVICE_IDS,
  type IntegrationEnvServiceId,
  MANUAL_REST_CONTRACT_AUTH_IDS,
  type ManualRestContractAuthId,
  MANUAL_REST_CONTRACT_HTTP_METHOD_IDS,
  type ManualRestContractHttpMethodId,
  REST_RESOURCE_METHOD_IDS,
  type RestResourceMethodId,
  resolveEditorPluginSlotAlias,
} from './cli-add-types.js';

const WORKSPACE_GENERATED_SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;
const WORDPRESS_POST_TYPE_PATTERN = /^[a-z0-9_][a-z0-9_-]*$/u;
const TYPESCRIPT_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const TYPESCRIPT_RESERVED_IDENTIFIERS = new Set([
  'abstract',
  'any',
  'as',
  'asserts',
  'async',
  'await',
  'bigint',
  'boolean',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'constructor',
  'continue',
  'debugger',
  'declare',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'get',
  'global',
  'if',
  'implements',
  'import',
  'in',
  'infer',
  'instanceof',
  'interface',
  'intrinsic',
  'is',
  'keyof',
  'let',
  'module',
  'namespace',
  'never',
  'new',
  'null',
  'number',
  'object',
  'of',
  'out',
  'override',
  'package',
  'private',
  'protected',
  'public',
  'readonly',
  'require',
  'return',
  'satisfies',
  'set',
  'static',
  'string',
  'super',
  'switch',
  'symbol',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'unique',
  'unknown',
  'using',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);
/**
 * Namespace format accepted by plugin-level REST resources.
 */
export const REST_RESOURCE_NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)+$/u;
const PHP_IDENTIFIER_PATTERN = '[A-Za-z_][A-Za-z0-9_]*';
const PHP_QUALIFIED_NAME_PATTERN = new RegExp(
  `^\\\\?${PHP_IDENTIFIER_PATTERN}(?:\\\\${PHP_IDENTIFIER_PATTERN})*$`,
  'u',
);
const PHP_CALLBACK_REFERENCE_PATTERN = new RegExp(
  `^\\\\?${PHP_IDENTIFIER_PATTERN}(?:\\\\${PHP_IDENTIFIER_PATTERN})*(?:::${PHP_IDENTIFIER_PATTERN})?$`,
  'u',
);
const REST_ROUTE_NAMED_CAPTURE_PATTERN = /\(\?P<([A-Za-z_][A-Za-z0-9_]*)>/gu;
const REST_ROUTE_UNSUPPORTED_CAPTURE_PATTERN =
	/\((?!\?(?:P<[A-Za-z_][A-Za-z0-9_]*>|:))/u;

/**
 * Validate a normalized workspace-generated slug.
 *
 * @param label Human-readable field label used in error messages.
 * @param slug Normalized slug value to validate.
 * @param usage CLI usage hint shown when the slug is empty.
 * @returns The validated slug.
 * @throws {Error} When the slug is empty or contains unsupported characters.
 */
export function assertValidGeneratedSlug(label: string, slug: string, usage: string): string {
  if (!slug) {
    throw new Error(`${label} is required. Use \`${usage}\`.`);
  }
  if (!WORKSPACE_GENERATED_SLUG_PATTERN.test(slug)) {
    throw new Error(
      `${label} must start with a letter and contain only lowercase letters, numbers, and hyphens.`,
    );
  }

  return slug;
}

/**
 * Validate a source type name used by generated schema artifact workflows.
 *
 * @param label Human-readable field label used in error messages.
 * @param value TypeScript identifier candidate from CLI input or defaults.
 * @param usage CLI usage hint shown when the identifier is empty.
 * @returns The trimmed, validated TypeScript identifier.
 * @throws {Error} When the value is empty or not a TypeScript identifier.
 */
export function assertValidTypeScriptIdentifier(
	label: string,
	value: string,
	usage: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required. Use \`${usage}\`.`);
  }
  if (!TYPESCRIPT_IDENTIFIER_PATTERN.test(trimmed)) {
    throw new Error(
      `${label} must be a valid TypeScript identifier, such as ExternalRetrieveResponse.`,
    );
  }
  if (TYPESCRIPT_RESERVED_IDENTIFIERS.has(trimmed)) {
    throw new Error(
      `${label} must not be a reserved TypeScript keyword, such as ${trimmed}.`,
    );
  }

  return trimmed;
}

/**
 * Validate a REST resource namespace.
 *
 * @param namespace Namespace candidate such as `vendor/v1`.
 * @returns The trimmed namespace.
 * @throws {Error} When the namespace is empty or not lowercase slash-separated.
 */
export function assertValidRestResourceNamespace(namespace: string): string {
  const trimmed = namespace.trim();
  if (!trimmed) {
    throw new Error(
      'REST resource namespace is required. Use `--namespace <vendor/v1>` or let the workspace default apply.',
    );
  }
  if (!REST_RESOURCE_NAMESPACE_PATTERN.test(trimmed)) {
    throw new Error(
      'REST resource namespace must use lowercase slash-separated segments like `demo-space/v1`.',
    );
  }

  return trimmed;
}

/**
 * Resolve the effective REST resource namespace for a workspace.
 *
 * @param workspaceNamespace Default workspace namespace prefix.
 * @param namespace Optional explicit namespace from CLI input.
 * @returns A validated namespace, defaulting to `<workspaceNamespace>/v1`.
 * @throws {Error} When the resolved namespace is invalid.
 */
export function resolveRestResourceNamespace(
	workspaceNamespace: string,
	namespace?: string,
): string {
  return assertValidRestResourceNamespace(
    namespace ?? `${workspaceNamespace}/v1`,
  );
}

/**
 * Validate a WordPress post type key used as post-meta scope.
 *
 * @param postType Raw post type key from CLI input.
 * @returns The trimmed post type key.
 * @throws {Error} When the key is empty or contains unsupported characters.
 */
export function assertValidPostMetaPostType(postType: string): string {
  const trimmed = postType.trim();
  if (!trimmed) {
    throw new Error(
      '`wp-typia add post-meta` requires --post-type <post-type>.',
    );
  }
  if (trimmed.length > 20) {
    throw new Error('Post meta post type must be 20 characters or fewer.');
  }
  if (!WORDPRESS_POST_TYPE_PATTERN.test(trimmed)) {
    throw new Error(
      'Post meta post type must use a WordPress post type key such as `post` or `example_post_type`.',
    );
  }

  return trimmed;
}

/**
 * Resolve a post-meta key from explicit input or the workspace slug default.
 *
 * @param options Optional explicit meta key plus workspace prefix and slug.
 * @returns A validated post-meta key.
 * @throws {Error} When the key is empty or contains whitespace/control characters.
 */
export function resolvePostMetaKey({
	metaKey,
	phpPrefix,
	slug,
}: {
  metaKey?: string;
  phpPrefix: string;
  slug: string;
}): string {
  const resolvedMetaKey = metaKey ?? `_${toSnakeCase(`${phpPrefix}_${slug}`)}`;
  const trimmed = resolvedMetaKey.trim();
  if (!trimmed) {
    throw new Error('Post meta key cannot be empty.');
  }
  if (/[\p{Cc}\s]/u.test(trimmed)) {
    throw new Error(
      'Post meta key must not contain whitespace or control characters.',
    );
  }

  return trimmed;
}

/**
 * Parse and validate REST resource method ids from a comma-separated list.
 *
 * @param methods Optional comma-separated method list. Defaults to list, read, and create.
 * @returns Deduplicated canonical REST resource method ids.
 * @throws {Error} When any method is unsupported or the list is empty.
 */
export function assertValidRestResourceMethods(
	methods?: string,
): RestResourceMethodId[] {
  const rawMethods =
		typeof methods === 'string' && methods.trim().length > 0
      ? methods.split(',').map((value) => value.trim()).filter(Boolean)
      : ['list', 'read', 'create'];
  const normalizedMethods = Array.from(new Set(rawMethods));
  const invalidMethods = normalizedMethods.filter(
    (method) => !(REST_RESOURCE_METHOD_IDS as readonly string[]).includes(method),
  );

  if (invalidMethods.length > 0) {
    throw new Error(
      `REST resource methods must be a comma-separated list of: ${REST_RESOURCE_METHOD_IDS.join(', ')}.`,
    );
  }

  if (normalizedMethods.length === 0) {
    throw new Error(
      `REST resource methods must include at least one of: ${REST_RESOURCE_METHOD_IDS.join(', ')}.`,
    );
  }

  return normalizedMethods as RestResourceMethodId[];
}

/**
 * Validate a PHP callable reference supplied to generated REST route metadata.
 *
 * @param label Human-readable field label for errors.
 * @param callback Optional PHP function or `ClassName::method` callback string.
 * @returns The trimmed callback when present.
 * @throws {Error} When the callback cannot be emitted as a safe PHP callable string.
 */
export function resolveOptionalPhpCallbackReference(
	label: string,
	callback?: string | null,
): string | undefined {
  if (callback === undefined || callback === null) {
    return undefined;
  }
  const trimmed = callback.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty.`);
  }
  if (!PHP_CALLBACK_REFERENCE_PATTERN.test(trimmed)) {
    throw new Error(
      `${label} must be a PHP function reference or ClassName::method callback.`,
    );
  }

  return trimmed;
}

/**
 * Validate a PHP class reference used by generated REST controller wrappers.
 *
 * @param label Human-readable field label for errors.
 * @param classReference Optional PHP class name.
 * @returns The trimmed class reference when present.
 * @throws {Error} When the class reference cannot be emitted safely.
 */
export function resolveOptionalPhpClassReference(
	label: string,
	classReference?: string | null,
): string | undefined {
  if (classReference === undefined || classReference === null) {
    return undefined;
  }
  const trimmed = classReference.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty.`);
  }
  if (!PHP_QUALIFIED_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      `${label} must be a PHP class reference such as Demo_Rest_Controller or Vendor\\Plugin\\Controller.`,
    );
  }

  return trimmed;
}

/**
 * Normalize and validate the HTTP method used by a manual REST contract.
 *
 * @param method Optional method input. Defaults to GET.
 * @returns A canonical uppercase HTTP method.
 * @throws {Error} When the method is unsupported.
 */
export function assertValidManualRestContractHttpMethod(
	method = 'GET',
): ManualRestContractHttpMethodId {
  const normalized = method.trim().toUpperCase();
  if (
		(MANUAL_REST_CONTRACT_HTTP_METHOD_IDS as readonly string[]).includes(
      normalized,
    )
	) {
    return normalized as ManualRestContractHttpMethodId;
  }

  throw new Error(
    `Manual REST contract method must be one of: ${MANUAL_REST_CONTRACT_HTTP_METHOD_IDS.join(', ')}.`,
  );
}

/**
 * Normalize and validate the auth intent used by a manual REST contract.
 *
 * @param auth Optional auth intent input. Defaults to public.
 * @returns A canonical auth intent.
 * @throws {Error} When the auth intent is unsupported.
 */
export function assertValidManualRestContractAuth(
	auth = 'public',
): ManualRestContractAuthId {
  const normalized = auth.trim().toLowerCase();
  if ((MANUAL_REST_CONTRACT_AUTH_IDS as readonly string[]).includes(
    normalized,
  )) {
    return normalized as ManualRestContractAuthId;
  }

  throw new Error(
    `Manual REST contract auth must be one of: ${MANUAL_REST_CONTRACT_AUTH_IDS.join(', ')}.`,
  );
}

/**
 * Normalize and validate a manual REST contract route path pattern.
 *
 * @param slug Generated contract slug used for the default route path.
 * @param pathPattern Optional route path pattern, relative to the namespace.
 * @returns A route pattern with a leading slash.
 * @throws {Error} When the path pattern is empty or clearly not a route path.
 */
function resolveRestRoutePathPattern(options: {
  defaultPath: string;
  emptyMessage: string;
  label: string;
  pathPattern?: string;
}): string {
  const explicitPath =
		typeof options.pathPattern === 'string'
      ? options.pathPattern.trim()
      : undefined;
  if (explicitPath === '') {
    throw new Error(options.emptyMessage);
  }
  const trimmed = explicitPath ?? options.defaultPath;
  if (/^https?:\/\//iu.test(trimmed)) {
    throw new Error(
      `${options.label} must be a route pattern relative to the namespace, not an absolute URL.`,
    );
  }
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  if (!withLeadingSlash || withLeadingSlash === '/') {
    throw new Error(options.emptyMessage);
  }
  if (/\s/u.test(withLeadingSlash)) {
    throw new Error(`${options.label} must not contain whitespace.`);
  }

  return withLeadingSlash;
}

/**
 * Check whether a generated REST item route keeps the generated `id` contract aligned.
 *
 * @param routePattern Route pattern relative to the namespace.
 * @returns True when the pattern has no regex groups or uses only `(?P<id>...)`.
 */
export function isGeneratedRestResourceRoutePatternCompatible(
	routePattern: string,
): boolean {
  const namedCaptures = Array.from(
    routePattern.matchAll(REST_ROUTE_NAMED_CAPTURE_PATTERN),
    (match) => match[1],
  );
  const hasRegexGroup = routePattern.includes('(');
  const hasUnsupportedCapture =
		REST_ROUTE_UNSUPPORTED_CAPTURE_PATTERN.test(routePattern);

  return (
		!hasUnsupportedCapture &&
		(!hasRegexGroup || (namedCaptures.length === 1 && namedCaptures[0] === 'id'))
	);
}

/**
 * Collect unique WordPress named capture parameters from a REST route pattern.
 *
 * @param routePattern Route pattern relative to the namespace.
 * @returns Capture names in first-seen order.
 */
export function collectRestRouteNamedCaptureNames(
	routePattern: string,
): string[] {
  return Array.from(
    new Set(
      Array.from(
        routePattern.matchAll(REST_ROUTE_NAMED_CAPTURE_PATTERN),
        (match) => match[1],
      ),
    ),
  );
}

export function resolveManualRestContractPathPattern(
	slug: string,
	pathPattern?: string,
): string {
  return resolveRestRoutePathPattern({
		defaultPath: `/${slug}`,
		emptyMessage:
			'Manual REST contract path is required. Use `--path <route-pattern>` such as `/external-record/(?P<id>[\\d]+)`.',
		label: 'Manual REST contract path',
		pathPattern,
	});
}

/**
 * Normalize and validate a generated REST resource item route pattern.
 *
 * @param slug Generated resource slug used for the default item route path.
 * @param routePattern Optional route path pattern, relative to the namespace.
 * @returns A route pattern with a leading slash.
 * @throws {Error} When the route pattern is empty or clearly not a route path.
 */
export function resolveGeneratedRestResourceRoutePattern(
	slug: string,
	routePattern?: string,
): string {
  const resolvedRoutePattern = resolveRestRoutePathPattern({
		defaultPath: `/${slug}/item`,
		emptyMessage:
			'Generated REST resource route pattern is required. Use `--route-pattern <route-pattern>` such as `/records/(?P<id>[\\d]+)`.',
		label: 'Generated REST resource route pattern',
		pathPattern: routePattern,
	});
  const hasExplicitRoutePattern =
		typeof routePattern === 'string' && routePattern.trim().length > 0;
  if (
		hasExplicitRoutePattern &&
		!isGeneratedRestResourceRoutePatternCompatible(resolvedRoutePattern)
	) {
    throw new Error(
      'Generated REST resource route pattern must use only an `(?P<id>...)` named capture when using regex groups.',
    );
  }

  return resolvedRoutePattern;
}

/**
 * Validate a hooked block insertion position.
 *
 * @param position Position candidate from CLI input.
 * @returns The canonical hooked block position id.
 * @throws {Error} When the position is not supported.
 */
export function assertValidHookedBlockPosition(position: string): HookedBlockPositionId {
  if ((HOOKED_BLOCK_POSITION_IDS as readonly string[]).includes(position)) {
    return position as HookedBlockPositionId;
  }

  throw new Error(
    `Hook position must be one of: ${HOOKED_BLOCK_POSITION_IDS.join(', ')}.`,
  );
}

/**
 * Build a PHP-safe workspace identifier prefix for a generated artifact.
 *
 * @param workspacePhpPrefix Workspace PHP prefix from project metadata.
 * @param slug Generated artifact slug to append.
 * @returns Snake-case PHP prefix for generated identifiers.
 */
export function buildWorkspacePhpPrefix(workspacePhpPrefix: string, slug: string): string {
  return toSnakeCase(`${workspacePhpPrefix}_${slug}`);
}

/**
 * Check whether a value is a supported built-in add block template id.
 *
 * @param value Candidate template id from CLI input.
 * @returns True when the value is an `AddBlockTemplateId`.
 */
export function isAddBlockTemplateId(value: string): value is AddBlockTemplateId {
  return (ADD_BLOCK_TEMPLATE_IDS as readonly string[]).includes(value);
}

/**
 * Quote a value for safe insertion into generated TypeScript source.
 *
 * @param value Raw string value.
 * @returns A single-quoted TypeScript string literal.
 */
export function quoteTsString(value: string): string {
  return quoteTypeScriptString(value);
}

/**
 * Validate a full block name used as a hooked block anchor.
 *
 * @param anchorBlockName Anchor block name from CLI input.
 * @returns The trimmed full block name.
 * @throws {Error} When the anchor is empty or not `namespace/slug`.
 */
export function assertValidHookAnchor(anchorBlockName: string): string {
  const trimmed = anchorBlockName.trim();
  if (!trimmed) {
    throw new Error(
      '`wp-typia add hooked-block` requires --anchor <anchor-block-name>.',
    );
  }
  if (!HOOKED_BLOCK_ANCHOR_PATTERN.test(trimmed)) {
    throw new Error(
      '`wp-typia add hooked-block` requires --anchor <anchor-block-name> to use the full `namespace/slug` block name format.',
    );
  }

  return trimmed;
}

/**
 * Validate and normalize the editor plugin shell slot.
 *
 * @param slot Optional shell slot. Defaults to `sidebar`.
 * @returns The canonical editor plugin slot id.
 * @throws {Error} When the slot is not supported by the workspace scaffold.
 */
export function assertValidEditorPluginSlot(slot = 'sidebar'): EditorPluginSlotId {
  const alias = resolveEditorPluginSlotAlias(slot);
  if (alias) {
    return alias;
  }

  throw new Error(
    `Editor plugin slot must be one of: ${EDITOR_PLUGIN_SLOT_IDS.join(', ')}. Legacy aliases: PluginSidebar, PluginDocumentSettingPanel.`,
  );
}

/**
 * Validate and normalize the optional integration environment service starter.
 *
 * @param service Optional service starter id. Defaults to `none`.
 * @returns The canonical integration environment service id.
 * @throws {Error} When the service starter is unsupported.
 */
export function assertValidIntegrationEnvService(
	service = 'none',
): IntegrationEnvServiceId {
  const trimmed = service.trim();
  if ((INTEGRATION_ENV_SERVICE_IDS as readonly string[]).includes(trimmed)) {
    return trimmed as IntegrationEnvServiceId;
  }

  throw new Error(
    `Integration environment service must be one of: ${INTEGRATION_ENV_SERVICE_IDS.join(', ')}.`,
  );
}
