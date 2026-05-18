// Keep this list fixed so generated slugs and file paths do not drift when
// project config changes. Domain-specific acronyms should use separators.
const COMMON_ACRONYM_PREFIXES = [
  'HTML',
  'HTTP',
  'JSON',
  'REST',
  'UUID',
  'AJAX',
  'API',
  'CPT',
  'CSS',
  'CTA',
  'DOM',
  'PHP',
  'SQL',
  'SVG',
  'URL',
  'XML',
  'ID',
  'JS',
  'UI',
  'WP',
] as const;

// Keep lowercase suffix splitting narrow so naturalized words such as
// `RESTful` remain stable while WordPress slug terms like `URLslug` read well.
const COMMON_ACRONYM_LOWERCASE_SUFFIXES = ['slug'] as const;

function capitalizeSegment(segment: string): string {
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function findCommonAcronymPrefix(segment: string): string | undefined {
  return COMMON_ACRONYM_PREFIXES.find((prefix) => segment.startsWith(prefix));
}

function isCommonAcronymLowercaseSuffix(suffix: string): boolean {
  return COMMON_ACRONYM_LOWERCASE_SUFFIXES.includes(
    suffix as (typeof COMMON_ACRONYM_LOWERCASE_SUFFIXES)[number],
  );
}

function splitKnownAcronymSegment(segment: string): string {
  const prefixes: string[] = [];
  let remaining = segment;

  while (remaining.length > 0) {
    const prefix = findCommonAcronymPrefix(remaining);
    if (!prefix) {
      break;
    }
    const suffix = remaining.slice(prefix.length);
    if (/^[A-Z][a-z]/.test(suffix)) {
      return [...prefixes, prefix, suffix].join('-');
    }
    if (/^[a-z]+$/.test(suffix) && isCommonAcronymLowercaseSuffix(suffix)) {
      return [...prefixes, prefix, suffix].join('-');
    }

    if (!findCommonAcronymPrefix(suffix)) {
      break;
    }

    prefixes.push(prefix);
    remaining = suffix;
  }

  return segment;
}

function splitAcronymBoundary(value: string): string {
  return value.replace(/[A-Z]{2,}[a-z]+/g, splitKnownAcronymSegment);
}

/**
 * Normalize arbitrary text into a kebab-case identifier.
 * Common acronym runs stay grouped, with a boundary before the next
 * capitalized word or before a narrow allow-list of lowercase WordPress slug
 * terms. Naturalized words such as `RESTful` intentionally stay as one word.
 *
 * @param input Raw text that may contain spaces, punctuation, or camelCase.
 * @returns A lowercase kebab-case string with collapsed separators.
 */
export function toKebabCase(input: string): string {
  return splitAcronymBoundary(input.trim())
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .toLowerCase();
}

/**
 * Normalize arbitrary text into a snake_case identifier.
 *
 * @param input Raw text that may contain spaces, punctuation, or camelCase.
 * @returns A lowercase snake_case string derived from the kebab-case form.
 */
export function toSnakeCase(input: string): string {
  return toKebabCase(input).replace(/-/g, '_');
}

/**
 * Normalize arbitrary text into a PascalCase identifier.
 *
 * @param input Raw text that may contain spaces, punctuation, or camelCase.
 * @returns A PascalCase string derived from the normalized kebab-case form.
 */
export function toPascalCase(input: string): string {
  return toKebabCase(input)
    .split('-')
    .filter(Boolean)
    .map(capitalizeSegment)
    .join('');
}

/**
 * Normalize arbitrary text into a camelCase identifier.
 *
 * @param input Raw text that may contain spaces, punctuation, or camelCase.
 * @returns A camelCase string derived from the normalized PascalCase form.
 */
export function toCamelCase(input: string): string {
  const pascalCase = toPascalCase(input);
  return `${pascalCase.charAt(0).toLowerCase()}${pascalCase.slice(1)}`;
}

/**
 * Convert delimited text to PascalCase while preserving each segment's
 * existing internal casing.
 *
 * @param input Raw text split on non-alphanumeric boundaries.
 * @returns A PascalCase string that preserves acronyms inside segments.
 */
export function toSegmentPascalCase(input: string): string {
  return input
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(capitalizeSegment)
    .join('');
}

/**
 * Normalize arbitrary text into a human-readable title.
 *
 * @param input Raw text that may contain spaces, punctuation, or camelCase.
 * @returns A title-cased string derived from the normalized kebab-case form.
 */
export function toTitleCase(input: string): string {
  return toKebabCase(input)
    .split('-')
    .filter(Boolean)
    .map(capitalizeSegment)
    .join(' ');
}
