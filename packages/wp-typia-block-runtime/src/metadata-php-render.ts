import type { ManifestAttribute, ManifestDocument } from './metadata-model.js';

const SUPPORTED_PHP_FORMATS = new Set([
  'uuid',
  'email',
  'url',
  'uri',
  'ipv4',
  'ipv6',
  'date-time',
]);

const SUPPORTED_PHP_TYPE_TAGS = new Set([
  'uint32',
  'int32',
  'uint64',
  'float',
  'double',
]);

/**
 * Render a PHP validator class from one manifest document.
 *
 * @param manifest Manifest document describing the block attribute schema and
 * Typia metadata to enforce in PHP.
 * @returns Generated PHP source plus any warn-only coverage gaps discovered
 * while traversing the manifest.
 * @category Schema
 */
export function renderPhpValidator(manifest: ManifestDocument): {
  source: string;
  warnings: string[];
} {
  const warnings: string[] = [];

  for (const [key, attribute] of Object.entries(manifest.attributes)) {
    collectPhpGenerationWarnings(attribute, key, warnings);
  }

  const phpManifest = renderPhpValue(manifest, 2);

  return {
		source: `<?php
declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
\texit;
}

/**
 * Generated from typia.manifest.json. Do not edit manually.
 */
return new class {
\tprivate array $manifest = ${phpManifest};

\tpublic function apply_defaults(array $attributes): array
\t{
\t\treturn $this->applyDefaultsForObject($attributes, $this->manifest['attributes'] ?? []);
\t}

\tpublic function validate(array $attributes): array
\t{
\t\t$normalized = $this->apply_defaults($attributes);
\t\t$errors = [];

\t\tforeach (($this->manifest['attributes'] ?? []) as $name => $attribute) {
\t\t\t$this->validateAttribute(
\t\t\t\tarray_key_exists($name, $normalized),
\t\t\t\t$normalized[$name] ?? null,
\t\t\t\t$attribute,
\t\t\t\t(string) $name,
\t\t\t\t$errors,
\t\t\t);
\t\t}

\t\treturn [
\t\t\t'errors' => $errors,
\t\t\t'valid' => count($errors) === 0,
\t\t];
\t}

\tpublic function is_valid(array $attributes): bool
\t{
\t\treturn $this->validate($attributes)['valid'];
\t}

\tprivate function applyDefaultsForObject(array $attributes, array $schema): array
\t{
\t\t$result = $attributes;

\t\tforeach ($schema as $name => $attribute) {
\t\t\tif (!array_key_exists($name, $result)) {
\t\t\t\t$derivedDefault = $this->deriveDefaultValue($attribute);
\t\t\t\tif ($derivedDefault !== null) {
\t\t\t\t\t$result[$name] = $derivedDefault;
\t\t\t\t}
\t\t\t\tcontinue;
\t\t\t}

\t\t\t$result[$name] = $this->applyDefaultsForNode($result[$name], $attribute);
\t\t}

\t\treturn $result;
\t}

\tprivate function applyDefaultsForNode($value, array $attribute)
\t{
\t\tif ($value === null) {
\t\t\treturn null;
\t\t}

\t\t$kind = $attribute['ts']['kind'] ?? $attribute['wp']['type'] ?? null;
\t\tif ($kind === 'union') {
\t\t\treturn $this->applyDefaultsForUnion($value, $attribute);
\t\t}
\t\tif ($kind === 'object' && is_array($value) && !$this->isListArray($value)) {
\t\t\treturn $this->applyDefaultsForObject($value, $attribute['ts']['properties'] ?? []);
\t\t}
\t\tif (
\t\t\t$kind === 'array' &&
\t\t\tis_array($value) &&
\t\t\t$this->isListArray($value) &&
\t\t\tisset($attribute['ts']['items']) &&
\t\t\tis_array($attribute['ts']['items'])
\t\t) {
\t\t\t$result = [];
\t\t\tforeach ($value as $index => $item) {
\t\t\t\t$result[$index] = $this->applyDefaultsForNode($item, $attribute['ts']['items']);
\t\t\t}
\t\t\treturn $result;
\t\t}

\t\treturn $value;
\t}

\tprivate function deriveDefaultValue(array $attribute)
\t{
\t\tif ($this->hasDefault($attribute)) {
\t\t\treturn $attribute['typia']['defaultValue'];
\t\t}

\t\t$kind = $attribute['ts']['kind'] ?? $attribute['wp']['type'] ?? null;
\t\tif ($kind !== 'object') {
\t\t\treturn null;
\t\t}

\t\t$properties = $attribute['ts']['properties'] ?? null;
\t\tif (!is_array($properties)) {
\t\t\treturn null;
\t\t}

\t\t$derived = [];
\t\tforeach ($properties as $name => $child) {
\t\t\tif (!is_array($child)) {
\t\t\t\tcontinue;
\t\t\t}
\t\t\t$childDefault = $this->deriveDefaultValue($child);
\t\t\tif ($childDefault !== null) {
\t\t\t\t$derived[$name] = $childDefault;
\t\t\t}
\t\t}

\t\treturn count($derived) > 0 ? $derived : null;
\t}

\tprivate function applyDefaultsForUnion($value, array $attribute)
\t{
\t\tif (!is_array($value) || $this->isListArray($value)) {
\t\t\treturn $value;
\t\t}

\t\t$union = $attribute['ts']['union'] ?? null;
\t\tif (!is_array($union)) {
\t\t\treturn $value;
\t\t}

\t\t$discriminator = $union['discriminator'] ?? null;
\t\tif (!is_string($discriminator) || !array_key_exists($discriminator, $value)) {
\t\t\treturn $value;
\t\t}

\t\t$branchKey = $value[$discriminator];
\t\tif (!is_string($branchKey) || !isset($union['branches'][$branchKey]) || !is_array($union['branches'][$branchKey])) {
\t\t\treturn $value;
\t\t}

\t\treturn $this->applyDefaultsForNode($value, $union['branches'][$branchKey]);
\t}

\tprivate function validateAttribute(bool $exists, $value, array $attribute, string $path, array &$errors): void
\t{
\t\tif (!$exists) {
\t\t\tif (($attribute['ts']['required'] ?? false) && !$this->hasDefault($attribute)) {
\t\t\t\t$errors[] = sprintf('%s is required', $path);
\t\t\t}
\t\t\treturn;
\t\t}

\t\t$kind = $attribute['ts']['kind'] ?? $attribute['wp']['type'] ?? null;
\t\tif (!is_string($kind) || $kind === '') {
\t\t\t$errors[] = sprintf('%s has an invalid schema kind', $path);
\t\t\treturn;
\t\t}
\t\tif ($value === null) {
\t\t\t$errors[] = sprintf('%s must be %s', $path, $this->expectedKindLabel($attribute));
\t\t\treturn;
\t\t}

\t\tif (($attribute['wp']['enum'] ?? null) !== null && !$this->valueInEnum($value, $attribute['wp']['enum'])) {
\t\t\t$errors[] = sprintf('%s must be one of %s', $path, implode(', ', $attribute['wp']['enum']));
\t\t}

\t\tswitch ($kind) {
\t\t\tcase 'string':
\t\t\t\tif (!is_string($value)) {
\t\t\t\t\t$errors[] = sprintf('%s must be string', $path);
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\t$this->validateString($value, $attribute, $path, $errors);
\t\t\t\treturn;
\t\t\tcase 'number':
\t\t\t\t$allowsUint64String =
\t\t\t\t\t($attribute['typia']['constraints']['typeTag'] ?? null) === 'uint64' &&
\t\t\t\t\t$this->matchesUint64($value);
\t\t\t\tif (!$this->isNumber($value) && !$allowsUint64String) {
\t\t\t\t\t$errors[] = sprintf('%s must be number', $path);
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\t$this->validateNumber($value, $attribute, $path, $errors);
\t\t\t\treturn;
\t\t\tcase 'boolean':
\t\t\t\tif (!is_bool($value)) {
\t\t\t\t\t$errors[] = sprintf('%s must be boolean', $path);
\t\t\t\t}
\t\t\t\treturn;
\t\t\tcase 'array':
\t\t\t\tif (!is_array($value) || !$this->isListArray($value)) {
\t\t\t\t\t$errors[] = sprintf('%s must be array', $path);
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\t$this->validateArray($value, $attribute, $path, $errors);
\t\t\t\tif (isset($attribute['ts']['items']) && is_array($attribute['ts']['items'])) {
\t\t\t\t\tforeach ($value as $index => $item) {
\t\t\t\t\t\t$this->validateAttribute(true, $item, $attribute['ts']['items'], sprintf('%s[%s]', $path, (string) $index), $errors);
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\treturn;
\t\t\tcase 'object':
\t\t\t\tif (!is_array($value) || $this->isListArray($value)) {
\t\t\t\t\t$errors[] = sprintf('%s must be object', $path);
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\tforeach (($attribute['ts']['properties'] ?? []) as $name => $child) {
\t\t\t\t\t$this->validateAttribute(
\t\t\t\t\t\tarray_key_exists($name, $value),
\t\t\t\t\t\t$value[$name] ?? null,
\t\t\t\t\t\t$child,
\t\t\t\t\t\tsprintf('%s.%s', $path, (string) $name),
\t\t\t\t\t\t$errors,
\t\t\t\t\t);
\t\t\t\t}
\t\t\t\treturn;
\t\t\tcase 'union':
\t\t\t\t$this->validateUnion($value, $attribute, $path, $errors);
\t\t\t\treturn;
\t\t\tdefault:
\t\t\t\t$errors[] = sprintf('%s has unsupported schema kind %s', $path, $kind);
\t\t}
\t}

\tprivate function validateUnion($value, array $attribute, string $path, array &$errors): void
\t{
\t\tif (!is_array($value) || $this->isListArray($value)) {
\t\t\t$errors[] = sprintf('%s must be object', $path);
\t\t\treturn;
\t\t}

\t\t$union = $attribute['ts']['union'] ?? null;
\t\tif (!is_array($union)) {
\t\t\t$errors[] = sprintf('%s has invalid union schema metadata', $path);
\t\t\treturn;
\t\t}

\t\t$discriminator = $union['discriminator'] ?? null;
\t\tif (!is_string($discriminator) || $discriminator === '') {
\t\t\t$errors[] = sprintf('%s has invalid union discriminator metadata', $path);
\t\t\treturn;
\t\t}
\t\tif (!array_key_exists($discriminator, $value)) {
\t\t\t$errors[] = sprintf('%s.%s is required', $path, $discriminator);
\t\t\treturn;
\t\t}

\t\t$branchKey = $value[$discriminator];
\t\tif (!is_string($branchKey)) {
\t\t\t$errors[] = sprintf('%s.%s must be string', $path, $discriminator);
\t\t\treturn;
\t\t}
\t\tif (!isset($union['branches'][$branchKey]) || !is_array($union['branches'][$branchKey])) {
\t\t\t$errors[] = sprintf('%s.%s must be one of %s', $path, $discriminator, implode(', ', array_keys($union['branches'] ?? [])));
\t\t\treturn;
\t\t}

\t\t$this->validateAttribute(true, $value, $union['branches'][$branchKey], $path, $errors);
\t}

\tprivate function validateString(string $value, array $attribute, string $path, array &$errors): void
\t{
\t\t$constraints = $attribute['typia']['constraints'] ?? [];

\t\tif (isset($constraints['minLength']) && is_int($constraints['minLength']) && strlen($value) < $constraints['minLength']) {
\t\t\t$errors[] = sprintf('%s must be at least %d characters', $path, $constraints['minLength']);
\t\t}
\t\tif (isset($constraints['maxLength']) && is_int($constraints['maxLength']) && strlen($value) > $constraints['maxLength']) {
\t\t\t$errors[] = sprintf('%s must be at most %d characters', $path, $constraints['maxLength']);
\t\t}
\t\tif (
\t\t\tisset($constraints['pattern']) &&
\t\t\tis_string($constraints['pattern']) &&
\t\t\t$constraints['pattern'] !== '' &&
\t\t\t!$this->matchesPattern($constraints['pattern'], $value)
\t\t) {
\t\t\t$errors[] = sprintf('%s does not match %s', $path, $constraints['pattern']);
\t\t}
\t\tif (
\t\t\tisset($constraints['format']) &&
\t\t\tis_string($constraints['format']) &&
\t\t\t!$this->matchesFormat($constraints['format'], $value)
\t\t) {
\t\t\t$errors[] = sprintf('%s must match format %s', $path, $constraints['format']);
\t\t}
\t}

\tprivate function validateArray(array $value, array $attribute, string $path, array &$errors): void
\t{
\t\t$constraints = $attribute['typia']['constraints'] ?? [];

\t\tif (isset($constraints['minItems']) && is_int($constraints['minItems']) && count($value) < $constraints['minItems']) {
\t\t\t$errors[] = sprintf('%s must have at least %d items', $path, $constraints['minItems']);
\t\t}
\t\tif (isset($constraints['maxItems']) && is_int($constraints['maxItems']) && count($value) > $constraints['maxItems']) {
\t\t\t$errors[] = sprintf('%s must have at most %d items', $path, $constraints['maxItems']);
\t\t}
\t}

\tprivate function validateNumber($value, array $attribute, string $path, array &$errors): void
\t{
\t\t$constraints = $attribute['typia']['constraints'] ?? [];

\t\tif (isset($constraints['minimum']) && $this->isNumber($constraints['minimum']) && $value < $constraints['minimum']) {
\t\t\t$errors[] = sprintf('%s must be >= %s', $path, (string) $constraints['minimum']);
\t\t}
\t\tif (isset($constraints['maximum']) && $this->isNumber($constraints['maximum']) && $value > $constraints['maximum']) {
\t\t\t$errors[] = sprintf('%s must be <= %s', $path, (string) $constraints['maximum']);
\t\t}
\t\tif (
\t\t\tisset($constraints['exclusiveMinimum']) &&
\t\t\t$this->isNumber($constraints['exclusiveMinimum']) &&
\t\t\t$value <= $constraints['exclusiveMinimum']
\t\t) {
\t\t\t$errors[] = sprintf('%s must be > %s', $path, (string) $constraints['exclusiveMinimum']);
\t\t}
\t\tif (
\t\t\tisset($constraints['exclusiveMaximum']) &&
\t\t\t$this->isNumber($constraints['exclusiveMaximum']) &&
\t\t\t$value >= $constraints['exclusiveMaximum']
\t\t) {
\t\t\t$errors[] = sprintf('%s must be < %s', $path, (string) $constraints['exclusiveMaximum']);
\t\t}
\t\tif (
\t\t\tisset($constraints['multipleOf']) &&
\t\t\t$this->isNumber($constraints['multipleOf']) &&
\t\t\t!$this->matchesMultipleOf($value, $constraints['multipleOf'])
\t\t) {
\t\t\t$errors[] = sprintf('%s must be a multiple of %s', $path, (string) $constraints['multipleOf']);
\t\t}
\t\tif (
\t\t\tisset($constraints['typeTag']) &&
\t\t\tis_string($constraints['typeTag']) &&
\t\t\t!$this->matchesTypeTag($value, $constraints['typeTag'])
\t\t) {
\t\t\t$errors[] = sprintf('%s must be a %s', $path, $constraints['typeTag']);
\t\t}
\t}

\tprivate function hasDefault(array $attribute): bool
\t{
\t\treturn ($attribute['typia']['hasDefault'] ?? false) === true;
\t}

\tprivate function valueInEnum($value, array $enum): bool
\t{
\t\tforeach ($enum as $candidate) {
\t\t\tif ($candidate === $value) {
\t\t\t\treturn true;
\t\t\t}
\t\t}
\t\treturn false;
\t}

\tprivate function matchesPattern(string $pattern, string $value): bool
\t{
\t\t$escapedPattern = str_replace('~', '\\\\~', $pattern);
\t\t$result = @preg_match('~' . $escapedPattern . '~u', $value);
\t\treturn $result === 1;
\t}

\tprivate function matchesFormat(string $format, string $value): bool
\t{
\t\tswitch ($format) {
\t\t\tcase 'uuid':
\t\t\t\treturn preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value) === 1;
\t\t\tcase 'email':
\t\t\t\treturn filter_var($value, FILTER_VALIDATE_EMAIL) !== false;
\t\t\tcase 'url':
\t\t\tcase 'uri':
\t\t\t\treturn filter_var($value, FILTER_VALIDATE_URL) !== false;
\t\t\tcase 'ipv4':
\t\t\t\treturn filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false;
\t\t\tcase 'ipv6':
\t\t\t\treturn filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false;
\t\t\tcase 'date-time':
\t\t\t\treturn preg_match('/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$/', $value) === 1;
\t\t\tdefault:
\t\t\t\treturn true;
\t\t}
\t}

\tprivate function matchesTypeTag($value, string $typeTag): bool
\t{
\t\tswitch ($typeTag) {
\t\t\tcase 'uint32':
\t\t\t\treturn is_int($value) && $value >= 0 && $value <= 4294967295;
\t\t\tcase 'int32':
\t\t\t\treturn is_int($value) && $value >= -2147483648 && $value <= 2147483647;
\t\t\tcase 'uint64':
\t\t\t\treturn $this->matchesUint64($value);
\t\t\tcase 'float':
\t\t\tcase 'double':
\t\t\t\treturn is_int($value) || is_float($value);
\t\t\tdefault:
\t\t\t\treturn true;
\t\t}
\t}

\tprivate function matchesUint64($value): bool
\t{
\t\tif (is_int($value)) {
\t\t\treturn $value >= 0;
\t\t}
\t\tif (!is_string($value) || $value === '' || !ctype_digit($value)) {
\t\t\treturn false;
\t\t}
\t\tif (strlen($value) < 20) {
\t\t\treturn true;
\t\t}
\t\tif (strlen($value) > 20) {
\t\t\treturn false;
\t\t}
\t\treturn strcmp($value, '18446744073709551615') <= 0;
\t}

\tprivate function matchesMultipleOf($value, $multipleOf): bool
\t{
\t\tif ($multipleOf === 0) {
\t\t\treturn true;
\t\t}
\t\tif (is_int($value) && is_int($multipleOf)) {
\t\t\treturn $value % $multipleOf === 0;
\t\t}

\t\t$remainder = fmod((float) $value, (float) $multipleOf);
\t\t$epsilon = 0.000000001;
\t\treturn abs($remainder) < $epsilon || abs(abs((float) $multipleOf) - abs($remainder)) < $epsilon;
\t}

\tprivate function isNumber($value): bool
\t{
\t\treturn is_int($value) || is_float($value);
\t}

\tprivate function isListArray(array $value): bool
\t{
\t\t$expectedKey = 0;
\t\tforeach ($value as $key => $_item) {
\t\t\tif ($key !== $expectedKey) {
\t\t\t\treturn false;
\t\t\t}
\t\t\t$expectedKey += 1;
\t\t}
\t\treturn true;
\t}

\tprivate function expectedKindLabel(array $attribute): string
\t{
\t\t$kind = $attribute['ts']['kind'] ?? $attribute['wp']['type'] ?? 'value';
\t\treturn $kind === 'union' ? 'object' : (string) $kind;
\t}
};
`,
		warnings,
	};
}

/**
 * Collect warn-only PHP validator generation gaps for one manifest branch.
 *
 * @param attribute Manifest attribute metadata to inspect.
 * @param pathLabel Human-readable path used in emitted warning messages.
 * @param warnings Mutable accumulator that receives any discovered warnings.
 * @returns Nothing. Mutates the `warnings` array with any discovered gaps.
 * @category Schema
 */
export function collectPhpGenerationWarnings(
	attribute: ManifestAttribute,
	pathLabel: string,
	warnings: string[],
): void {
  const { format, typeTag } = attribute.typia.constraints;
  if (format !== null && !SUPPORTED_PHP_FORMATS.has(format)) {
    warnings.push(`${pathLabel}: unsupported PHP validator format "${format}"`);
  }
  if (typeTag !== null && !SUPPORTED_PHP_TYPE_TAGS.has(typeTag)) {
    warnings.push(
      `${pathLabel}: unsupported PHP validator type tag "${typeTag}"`,
    );
  }

  if (attribute.ts.items) {
    collectPhpGenerationWarnings(
      attribute.ts.items,
      `${pathLabel}[]`,
      warnings,
    );
  }
  for (const [key, property] of Object.entries(attribute.ts.properties ?? {})) {
    collectPhpGenerationWarnings(property, `${pathLabel}.${key}`, warnings);
  }
  for (const [branchKey, branch] of Object.entries(
    attribute.ts.union?.branches ?? {},
  )) {
    collectPhpGenerationWarnings(
      branch,
      `${pathLabel}<${branchKey}>`,
      warnings,
    );
  }
}

/**
 * Render one JavaScript value into a PHP literal string.
 *
 * @param value JSON-like value to encode for the generated validator manifest.
 * @param indentLevel Current indentation depth, expressed in tab levels.
 * @returns PHP source code representing the provided value.
 * @category Schema
 */
export function renderPhpValue(value: unknown, indentLevel: number): string {
  const indent = '\t'.repeat(indentLevel);
  const nestedIndent = '\t'.repeat(indentLevel + 1);

  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const items = value.map(
      (item) => `${nestedIndent}${renderPhpValue(item, indentLevel + 1)}`,
    );
    return `[\n${items.join(',\n')}\n${indent}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return '[]';
    }
    const items = entries.map(
			([key, item]) =>
				`${nestedIndent}'${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' => ${renderPhpValue(item, indentLevel + 1)}`,
		);
    return `[\n${items.join(',\n')}\n${indent}]`;
  }

  throw new Error(
    `Unable to encode PHP value for manifest node: ${String(value)}`,
  );
}
