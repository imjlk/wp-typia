import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '../cli/cli-diagnostics.js';
import { toKebabCase, toSnakeCase } from '../shared/string-case.js';

const BLOCK_SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;
const PHP_PREFIX_PATTERN = /^[a-z_][a-z0-9_]*$/;
const PHP_PREFIX_MAX_LENGTH = 50;

export interface ResolvedScaffoldIdentifiers {
  namespace: string;
  phpPrefix: string;
  slug: string;
  textDomain: string;
}

export function validateBlockSlug(input: string): true | string {
  return BLOCK_SLUG_PATTERN.test(
    input,
  ) || 'Use lowercase letters, numbers, and hyphens only';
}

export function validateNamespace(input: string): true | string {
  return BLOCK_SLUG_PATTERN.test(toKebabCase(input))
    ? true
    : 'Use lowercase letters, numbers, and hyphens only';
}

export function validateTextDomain(input: string): true | string {
  return BLOCK_SLUG_PATTERN.test(toKebabCase(input))
    ? true
    : 'Use lowercase letters, numbers, and hyphens only';
}

export function validatePhpPrefix(input: string): true | string {
  const normalizedPrefix = toSnakeCase(input);
  if (normalizedPrefix.length > PHP_PREFIX_MAX_LENGTH) {
    return `Use ${PHP_PREFIX_MAX_LENGTH} characters or fewer to keep generated database identifiers within MySQL limits`;
  }

  return PHP_PREFIX_PATTERN.test(normalizedPrefix)
    ? true
    : 'Use letters, numbers, and underscores only, starting with a letter';
}

export function assertValidIdentifier(
	label: string,
	value: string,
	validate: (value: string) => true | string,
): string {
  const result = validate(value);
  if (result !== true) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      typeof result === 'string' ? `${label}: ${result}` : `${label} is invalid`,
    );
  }

  return value;
}

export function normalizeBlockSlug(input: string): string {
  return toKebabCase(input);
}

/**
 * Normalize one human-entered block slug and reject values that collapse to an
 * empty generated slug.
 *
 * @param options Normalization context for one block-like name.
 * @param options.input Raw user input before kebab-case normalization.
 * @param options.label Human-readable field label used in thrown errors.
 * @param options.usage Example CLI usage shown when the input is blank.
 * @returns A non-empty normalized slug.
 * @throws When the input is blank after trimming.
 * @throws When normalization removes every character from the original input.
 */
export function resolveNonEmptyNormalizedBlockSlug(options: {
  input: string;
  label: string;
  usage: string;
}): string {
  const normalizedSlug = normalizeBlockSlug(options.input);
  if (normalizedSlug.length > 0) {
    return normalizedSlug;
  }

  if (options.input.trim().length === 0) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      `${options.label} is required. Use \`${options.usage}\`.`,
    );
  }

  throw createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
    `${options.label} "${options.input.trim()}" normalizes to an empty slug. Use letters or numbers so wp-typia can generate a block slug.`,
  );
}

export function resolveValidatedBlockSlug(value: string): string {
  return assertValidIdentifier(
    'Block slug',
    normalizeBlockSlug(value),
    validateBlockSlug,
  );
}

export function resolveValidatedNamespace(value: string): string {
  return assertValidIdentifier(
    'Namespace',
    toKebabCase(value),
    validateNamespace,
  );
}

export function resolveValidatedTextDomain(value: string): string {
  return assertValidIdentifier(
    'Text domain',
    toKebabCase(value),
    validateTextDomain,
  );
}

export function resolveValidatedPhpPrefix(value: string): string {
  return assertValidIdentifier(
    'PHP prefix',
    toSnakeCase(value),
    validatePhpPrefix,
  );
}

/**
 * Builds the generated WordPress wrapper CSS class for a scaffolded block.
 *
 * Returns `wp-block-{namespace}-{slug}` when a non-empty namespace is present,
 * or `wp-block-{slug}` when the namespace is empty or undefined. When the
 * normalized namespace equals the normalized slug, appends `-block` so the
 * generated class avoids repeated namespace segments without colliding with the
 * default core wrapper classes. Both inputs are normalized and validated with
 * the same scaffold identifier rules used for block names.
 */
export function buildBlockCssClassName(
	namespace: string | undefined,
	slug: string,
): string {
  const normalizedSlug = resolveValidatedBlockSlug(slug);
  const normalizedNamespace =
		typeof namespace === 'string' && namespace.trim().length > 0
      ? resolveValidatedNamespace(namespace)
      : '';

  if (normalizedNamespace === normalizedSlug) {
    return `wp-block-${normalizedSlug}-block`;
  }

  return normalizedNamespace.length > 0
    ? `wp-block-${normalizedNamespace}-${normalizedSlug}`
    : `wp-block-${normalizedSlug}`;
}

export function buildFrontendCssClassName(blockCssClassName: string): string {
  return `${blockCssClassName}-frontend`;
}

export function resolveScaffoldIdentifiers({
	namespace,
	phpPrefix,
	slug,
	textDomain,
}: {
  namespace: string;
  phpPrefix?: string;
  slug: string;
  textDomain?: string;
}): ResolvedScaffoldIdentifiers {
  const normalizedSlug = resolveValidatedBlockSlug(slug);

  return {
    namespace: resolveValidatedNamespace(namespace),
    phpPrefix: resolveValidatedPhpPrefix(phpPrefix ?? normalizedSlug),
    slug: normalizedSlug,
    textDomain: resolveValidatedTextDomain(textDomain ?? normalizedSlug),
  };
}
