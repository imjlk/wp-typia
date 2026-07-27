import { cloneJsonValue } from './json-utils.js';
import {
  type AttributeNode,
  type BlockJsonAttribute,
  type JsonValue,
  type ManifestAttribute,
  type ManifestDocument,
  getWordPressKind,
} from './metadata-model.js';

/**
 * Project one parsed attribute node into its `block.json` attribute shape.
 *
 * @param node Parsed attribute node to project.
 * @param warnings Mutable warning list that receives unsupported projection features.
 * @returns A `block.json`-compatible attribute record for the provided node.
 * @category Schema
 */
export function createBlockJsonAttribute(
	node: AttributeNode,
	warnings: string[],
): BlockJsonAttribute {
  const attribute: BlockJsonAttribute = {
    type: getWordPressKind(node),
  };

  if (node.defaultValue !== undefined) {
    attribute.default = cloneJsonValue(node.defaultValue);
  }
  if (node.enumValues !== null && node.enumValues.length > 0) {
    attribute.enum = [...node.enumValues];
  }
  if (node.wp.source !== null) {
    attribute.source = node.wp.source;
  }
  if (node.wp.selector !== null) {
    attribute.selector = node.wp.selector;
  }

  const reasons: string[] = [];
  if (node.constraints.exclusiveMaximum !== null)
		reasons.push('exclusiveMaximum');
  if (node.constraints.exclusiveMinimum !== null)
		reasons.push('exclusiveMinimum');
  if (node.constraints.format !== null) reasons.push('format');
  if (node.constraints.maxLength !== null) reasons.push('maxLength');
  if (node.constraints.maxItems !== null) reasons.push('maxItems');
  if (node.constraints.maximum !== null) reasons.push('maximum');
  if (node.constraints.minLength !== null) reasons.push('minLength');
  if (node.constraints.minItems !== null) reasons.push('minItems');
  if (node.constraints.minimum !== null) reasons.push('minimum');
  if (node.constraints.multipleOf !== null) reasons.push('multipleOf');
  if (node.constraints.pattern !== null) reasons.push('pattern');
  if (node.constraints.typeTag !== null) reasons.push('typeTag');
  if (node.wp.preserveOnEmpty) reasons.push('preserveOnEmpty');
  if (node.wp.secret) reasons.push('secret');
  if (node.wp.writeOnly) reasons.push('writeOnly');
  if (node.kind === 'array' && node.items !== undefined) reasons.push('items');
  if (node.kind === 'object' && node.properties !== undefined)
		reasons.push('properties');
  if (node.kind === 'union' && node.union !== null) reasons.push('union');

  if (reasons.length > 0) {
    warnings.push(`${node.path}: ${reasons.join(', ')}`);
  }

  return attribute;
}

/**
 * Project one parsed attribute node into its manifest attribute shape.
 *
 * @param node Parsed attribute node to project into manifest metadata.
 * @returns A manifest attribute record with Typia, TypeScript, and WordPress metadata.
 * @category Schema
 */
export function createManifestAttribute(node: AttributeNode): ManifestAttribute {
  return {
		typia: {
			constraints: { ...node.constraints },
			defaultValue:
				node.defaultValue === undefined ? null : cloneJsonValue(node.defaultValue),
			hasDefault: node.defaultValue !== undefined,
		},
		ts: {
			items: node.items ? createManifestAttribute(node.items) : null,
			kind: node.kind,
			properties: node.properties
				? Object.fromEntries(
						Object.entries(node.properties).map(([key, property]) => [
							key,
							createManifestAttribute(property),
						]),
				  )
				: null,
			required: node.required,
			union: node.union
				? {
						branches: Object.fromEntries(
							Object.entries(node.union.branches).map(([key, branch]) => [
								key,
								createManifestAttribute(branch),
							]),
						),
						discriminator: node.union.discriminator,
				  }
				: null,
		},
		wp: {
			defaultValue:
				node.defaultValue === undefined ? null : cloneJsonValue(node.defaultValue),
			enum: node.enumValues ? [...node.enumValues] : null,
			hasDefault: node.defaultValue !== undefined,
			...(node.wp.preserveOnEmpty ? { preserveOnEmpty: true } : {}),
			...(node.wp.selector !== null ? { selector: node.wp.selector } : {}),
			...(node.wp.secret ? { secret: true } : {}),
			...(node.wp.secretStateField !== null
				? { secretStateField: node.wp.secretStateField }
				: {}),
			...(node.wp.source !== null ? { source: node.wp.source } : {}),
			type: getWordPressKind(node),
			...(node.wp.writeOnly ? { writeOnly: true } : {}),
		},
	};
}

/**
 * Create one manifest document from parsed attribute nodes.
 *
 * @param sourceTypeName Source type name that produced the parsed attribute tree.
 * @param attributes Parsed top-level attribute nodes keyed by attribute name.
 * @returns A manifest document ready for JSON serialization or downstream rendering.
 * @category Schema
 */
export function createManifestDocument(
	sourceTypeName: string,
	attributes: Record<string, AttributeNode>,
): ManifestDocument {
  return {
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([key, node]) => [
        key,
        createManifestAttribute(node),
      ]),
    ),
    manifestVersion: 2,
    sourceType: sourceTypeName,
  };
}

/**
 * Validate that top-level attributes use supported WordPress extraction tags.
 *
 * @param attributes Parsed top-level attribute nodes to validate.
 * @returns Nothing. Throws when an unsupported extraction shape is detected.
 * @category Schema
 */
export function validateWordPressExtractionAttributes(
	attributes: Record<string, AttributeNode>,
): void {
  for (const attribute of Object.values(attributes)) {
    validateWordPressExtractionAttribute(attribute, true);
  }
}

/**
 * Validate one attribute node for WordPress extraction compatibility.
 *
 * @param node Parsed attribute node to inspect.
 * @param isTopLevel Whether the current node is a top-level block attribute.
 * @returns Nothing. Throws when the attribute uses unsupported extraction metadata.
 * @category Schema
 */
export function validateWordPressExtractionAttribute(
	node: AttributeNode,
	isTopLevel = false,
): void {
  const hasSelector = node.wp.selector !== null;
  const hasSource = node.wp.source !== null;

  if (hasSelector || hasSource) {
    if (!isTopLevel) {
      throw new Error(
        `WordPress extraction tags are only supported on top-level block attributes at ${node.path}`,
      );
    }
    if (!hasSelector || !hasSource) {
      throw new Error(
        `WordPress extraction tags require both Source and Selector at ${node.path}`,
      );
    }
    if (node.kind !== 'string') {
      throw new Error(
        `WordPress extraction tags are only supported on string attributes at ${node.path}`,
      );
    }
  }

  if (node.items !== undefined) {
    validateWordPressExtractionAttribute(node.items, false);
  }
  if (node.properties !== undefined) {
    for (const property of Object.values(node.properties)) {
      validateWordPressExtractionAttribute(property, false);
    }
  }
  if (node.union?.branches) {
    for (const branch of Object.values(node.union.branches)) {
      validateWordPressExtractionAttribute(branch, false);
    }
  }
}

/**
 * Create a sample JSON value for one parsed attribute node.
 *
 * @param node Parsed attribute node to sample from.
 * @param key Attribute key used when deriving fallback example strings.
 * @returns A JSON-compatible example value for docs, previews, or generated artifacts.
 * @category Schema
 */
export function createExampleValue(node: AttributeNode, key: string): JsonValue {
  if (node.defaultValue !== undefined) {
    return cloneJsonValue(node.defaultValue);
  }
  if (node.enumValues !== null && node.enumValues.length > 0) {
    return cloneJsonValue(node.enumValues[0]);
  }

  switch (node.kind) {
    case 'string':
      return fitStringExampleToConstraints(
        createFormattedStringExample(node.constraints.format, key),
        node.constraints,
      );
    case 'number':
      return createNumericExample(node);
    case 'boolean':
      return true;
    case 'array':
      return createArrayExample(node, key);
    case 'object':
      return Object.fromEntries(
        Object.entries(node.properties ?? {}).map(
          ([propertyKey, propertyNode]) => [
            propertyKey,
            createExampleValue(propertyNode, propertyKey),
          ],
        ),
      );
    case 'union': {
      const firstBranch = node.union
        ? Object.values(node.union.branches)[0]
        : undefined;
      if (!firstBranch || firstBranch.kind !== 'object') {
        return {};
      }
      return Object.fromEntries(
        Object.entries(firstBranch.properties ?? {}).map(
          ([propertyKey, propertyNode]) => [
            propertyKey,
            createExampleValue(propertyNode, propertyKey),
          ],
        ),
      );
    }
  }
}

function createFormattedStringExample(
	format: AttributeNode['constraints']['format'],
	key: string,
): string {
  switch (format) {
    case 'uuid':
      return '00000000-0000-4000-8000-000000000000';
    case 'email':
      return 'example@example.com';
    case 'url':
    case 'uri':
      return 'https://example.com';
    case 'ipv4':
      return '127.0.0.1';
    case 'ipv6':
      return '::1';
    case 'date-time':
      return '2024-01-01T00:00:00Z';
    default:
      return `Example ${key}`;
  }
}

function fitStringExampleToConstraints(
	value: string,
	constraints: AttributeNode['constraints'],
): string {
  let nextValue = value;

  if (
		constraints.maxLength !== null &&
		nextValue.length > constraints.maxLength
	) {
    nextValue = nextValue.slice(0, constraints.maxLength);
  }
  if (
		constraints.minLength !== null &&
		nextValue.length < constraints.minLength
	) {
    nextValue = nextValue.padEnd(constraints.minLength, 'x');
  }

  return nextValue;
}

function createNumericExample(node: AttributeNode): number {
  const {
		exclusiveMaximum,
		exclusiveMinimum,
		maximum,
		minimum,
		multipleOf,
	} = node.constraints;
  const step = multipleOf && multipleOf !== 0 ? multipleOf : 1;
  const minCandidate =
		minimum ?? (exclusiveMinimum !== null ? exclusiveMinimum + step : null);
  const maxCandidate =
		maximum ?? (exclusiveMaximum !== null ? exclusiveMaximum - step : null);

  let candidate =
		multipleOf && multipleOf !== 0
      ? minCandidate !== null
        ? Math.ceil(minCandidate / multipleOf) * multipleOf
        : maxCandidate !== null
          ? Math.floor(maxCandidate / multipleOf) * multipleOf
          : multipleOf
      : (minCandidate ?? maxCandidate ?? 42);

  if (maxCandidate !== null && candidate > maxCandidate) {
    candidate =
			multipleOf && multipleOf !== 0
        ? Math.floor(maxCandidate / multipleOf) * multipleOf
        : maxCandidate;
  }
  if (minCandidate !== null && candidate < minCandidate) {
    candidate =
			multipleOf && multipleOf !== 0
        ? Math.ceil(minCandidate / multipleOf) * multipleOf
        : minCandidate;
  }

  return candidate;
}

function createArrayExample(node: AttributeNode, key: string): JsonValue[] {
  const minimumItems = Math.max(node.constraints.minItems ?? 0, 0);
  if (minimumItems === 0 || node.items === undefined) {
    return [];
  }

  return Array.from({ length: minimumItems }, (_value, index) =>
    createExampleValue(node.items!, `${key}${index + 1}`),
  );
}
