/**
 * Represent one JSON primitive value.
 *
 * @category Types
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Represent one JSON-compatible value tree.
 *
 * @category Types
 */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/**
 * Enumerate the attribute node kinds supported by the metadata model.
 *
 * @category Types
 */
export type AttributeKind =
	| 'string'
	| 'number'
	| 'boolean'
	| 'array'
	| 'object'
	| 'union';

/**
 * Enumerate the `block.json` attribute kinds supported by the projection layer.
 *
 * @category Types
 */
export type WordPressAttributeKind =
	| 'string'
	| 'number'
	| 'boolean'
	| 'array'
	| 'object';

/**
 * Enumerate supported WordPress extraction sources for string attributes.
 *
 * @category Types
 */
export type WordPressAttributeSource = 'html' | 'text' | 'rich-text';

/**
 * Describe normalized Typia constraint data for one attribute node.
 *
 * @category Types
 */
export interface AttributeConstraints {
  exclusiveMaximum: number | null;
  exclusiveMinimum: number | null;
  format: string | null;
  maxLength: number | null;
  maxItems: number | null;
  maximum: number | null;
  minLength: number | null;
  minItems: number | null;
  minimum: number | null;
  multipleOf: number | null;
  pattern: string | null;
  typeTag: string | null;
}

/**
 * Describe one parsed source attribute in the metadata model tree.
 *
 * @category Types
 */
export interface AttributeNode {
  constraints: AttributeConstraints;
  defaultValue?: JsonValue;
  enumValues: Array<string | number | boolean> | null;
  items?: AttributeNode;
  kind: AttributeKind;
  path: string;
  properties?: Record<string, AttributeNode>;
  /**
   * Marks this node as a recursive-type terminal emitted when a recursive
   * declaration reaches its maximum unrolling depth. Terminal nodes allow any
   * additional properties so deeper data remains valid.
   */
  recursiveTerminal?: boolean;
  required: boolean;
  union?: AttributeUnion | null;
  wp: {
    preserveOnEmpty: boolean;
    selector: string | null;
    secret: boolean;
    secretStateField: string | null;
    source: WordPressAttributeSource | null;
    writeOnly: boolean;
  };
}

/**
 * Describe a discriminated union branch map in the parsed metadata model.
 *
 * @category Types
 */
export interface AttributeUnion {
  branches: Record<string, AttributeNode>;
  discriminator: string;
}

/**
 * Describe one projected `block.json` attribute record.
 *
 * @category Types
 */
export interface BlockJsonAttribute {
  default?: JsonValue;
  enum?: Array<string | number | boolean>;
  selector?: string;
  source?: WordPressAttributeSource;
  type: WordPressAttributeKind;
}

/**
 * Describe one projected manifest attribute record.
 *
 * @category Types
 */
export interface ManifestAttribute {
  typia: {
    constraints: AttributeConstraints;
    defaultValue: JsonValue | null;
    hasDefault: boolean;
  };
  ts: {
    items: ManifestAttribute | null;
    kind: AttributeKind;
    properties: Record<string, ManifestAttribute> | null;
    recursiveTerminal?: boolean;
    required: boolean;
    union: ManifestUnion | null;
  };
  wp: {
    defaultValue: JsonValue | null;
    enum: Array<string | number | boolean> | null;
    hasDefault: boolean;
    preserveOnEmpty?: boolean;
    selector?: string | null;
    secret?: boolean;
    secretStateField?: string | null;
    source?: WordPressAttributeSource | null;
    type: WordPressAttributeKind;
    writeOnly?: boolean;
  };
}

/**
 * Describe a projected manifest union branch map.
 *
 * @category Types
 */
export interface ManifestUnion {
  branches: Record<string, ManifestAttribute>;
  discriminator: string;
}

/**
 * Describe one projected manifest document.
 *
 * @category Types
 */
export interface ManifestDocument {
  attributes: Record<string, ManifestAttribute>;
  manifestVersion: 2;
  sourceType: string;
}

/**
 * Create an empty constraint record for a new attribute node.
 *
 * @returns A constraint object with every supported constraint initialized to `null`.
 * @category Schema
 */
export function defaultAttributeConstraints(): AttributeConstraints {
  return {
    exclusiveMaximum: null,
    exclusiveMinimum: null,
    format: null,
    maxLength: null,
    maxItems: null,
    maximum: null,
    minLength: null,
    minItems: null,
    minimum: null,
    multipleOf: null,
    pattern: null,
    typeTag: null,
  };
}

/**
 * Map one parsed attribute node to its WordPress attribute kind.
 *
 * @param node Parsed metadata node to project into WordPress attribute metadata.
 * @returns The closest supported WordPress attribute kind for the provided node.
 * @category Schema
 */
export function getWordPressKind(node: AttributeNode): WordPressAttributeKind {
  return node.kind === 'union' ? 'object' : node.kind;
}

/**
 * Create a base attribute node with default constraint and extraction metadata.
 *
 * @param kind Parsed attribute kind for the new node.
 * @param pathLabel Human-readable path label used for diagnostics and warnings.
 * @returns A new attribute node initialized with default metadata for the requested kind.
 * @category Schema
 */
export function baseNode(kind: AttributeKind, pathLabel: string): AttributeNode {
  return {
    constraints: defaultAttributeConstraints(),
    enumValues: null,
    kind,
    path: pathLabel,
    required: true,
    union: null,
    wp: {
      preserveOnEmpty: false,
      selector: null,
      secret: false,
      secretStateField: null,
      source: null,
      writeOnly: false,
    },
  };
}

/**
 * Clone one attribute node while overriding its required flag.
 *
 * @param node Attribute node to clone.
 * @param required Required-state override to apply to the cloned node.
 * @returns A cloned node with nested properties, arrays, and unions preserved.
 * @category Schema
 */
export function withRequired(
	node: AttributeNode,
	required: boolean,
): AttributeNode {
  return {
    ...node,
    items: node.items
      ? withRequired(node.items, node.items.required)
      : undefined,
    properties: node.properties ? cloneProperties(node.properties) : undefined,
    required,
    union: node.union ? cloneUnion(node.union) : null,
  };
}

/**
 * Clone one attribute-union descriptor and all nested branches.
 *
 * @param union Union descriptor to clone.
 * @returns A deep-cloned union descriptor with cloned branch nodes.
 * @category Schema
 */
export function cloneUnion(union: AttributeUnion): AttributeUnion {
  return {
    branches: Object.fromEntries(
      Object.entries(union.branches).map(([key, branch]) => [
        key,
        withRequired(branch, branch.required),
      ]),
    ),
    discriminator: union.discriminator,
  };
}

/**
 * Clone one object-property map of attribute nodes.
 *
 * @param properties Object-property map to clone.
 * @returns A cloned property map with each attribute node copied recursively.
 * @category Schema
 */
export function cloneProperties(
	properties: Record<string, AttributeNode>,
): Record<string, AttributeNode> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, node]) => [
      key,
      withRequired(node, node.required),
    ]),
  );
}
