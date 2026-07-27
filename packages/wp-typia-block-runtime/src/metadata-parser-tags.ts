import ts from '@typescript/typescript6';

import { cloneJsonValue } from './json-utils.js';
import {
  type AttributeConstraints,
  type AttributeNode,
  type JsonValue,
  type WordPressAttributeSource,
  withRequired,
} from './metadata-model.js';

const SUPPORTED_TAGS = new Set([
  'Default',
  'ExclusiveMaximum',
  'ExclusiveMinimum',
  'Format',
  'MaxLength',
  'MaxItems',
  'Maximum',
  'MinLength',
  'MinItems',
  'Minimum',
  'MultipleOf',
  'Pattern',
  'PreserveOnEmpty',
  'Selector',
  'Secret',
  'Source',
  'Type',
  'WriteOnly',
]);

export function mergePrimitiveIntersection(
	nodes: AttributeNode[],
	pathLabel: string,
): AttributeNode {
  const [first, ...rest] = nodes;

  if (!isPrimitiveCompatibleNode(first)) {
    throw new Error(
      `Unsupported intersection at ${pathLabel}; only primitive-compatible intersections are supported`,
    );
  }

  let merged = withRequired(first, first.required);
  for (const node of rest) {
    if (!isPrimitiveCompatibleNode(node) || node.kind !== merged.kind) {
      throw new Error(
        `Unsupported intersection at ${pathLabel}; only a single primitive kind plus typia tags is supported`,
      );
    }

    merged = {
      ...merged,
      constraints: mergeConstraints(
        merged.constraints,
        node.constraints,
        pathLabel,
      ),
      defaultValue: mergeDefaultValue(
        merged.defaultValue,
        node.defaultValue,
        pathLabel,
      ),
      enumValues: intersectEnumValues(
        merged.enumValues,
        node.enumValues,
        pathLabel,
      ),
      required: merged.required && node.required,
    };
  }

  return merged;
}

function isPrimitiveCompatibleNode(node: AttributeNode): boolean {
  return (
		(node.kind === 'string' ||
			node.kind === 'number' ||
			node.kind === 'boolean') &&
		node.items === undefined &&
		node.properties === undefined &&
		node.union === null
	);
}

function mergeConstraints(
	left: AttributeConstraints,
	right: AttributeConstraints,
	pathLabel: string,
): AttributeConstraints {
  return {
    exclusiveMaximum: mergeMaximumLike(
      left.exclusiveMaximum,
      right.exclusiveMaximum,
    ),
    exclusiveMinimum: mergeMinimumLike(
      left.exclusiveMinimum,
      right.exclusiveMinimum,
    ),
    format: mergeExactLike(left.format, right.format, pathLabel, 'format'),
    maxLength: mergeMaximumLike(left.maxLength, right.maxLength),
    maxItems: mergeMaximumLike(left.maxItems, right.maxItems),
    maximum: mergeMaximumLike(left.maximum, right.maximum),
    minLength: mergeMinimumLike(left.minLength, right.minLength),
    minItems: mergeMinimumLike(left.minItems, right.minItems),
    minimum: mergeMinimumLike(left.minimum, right.minimum),
    multipleOf: mergeExactLike(
      left.multipleOf,
      right.multipleOf,
      pathLabel,
      'multipleOf',
    ),
    pattern: mergeExactLike(left.pattern, right.pattern, pathLabel, 'pattern'),
    typeTag: mergeExactLike(left.typeTag, right.typeTag, pathLabel, 'typeTag'),
  };
}

function mergeMinimumLike(
	left: number | null,
	right: number | null,
): number | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return Math.max(left, right);
}

function mergeMaximumLike(
	left: number | null,
	right: number | null,
): number | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return Math.min(left, right);
}

function mergeExactLike<T extends string | number>(
	left: T | null,
	right: T | null,
	pathLabel: string,
	label: string,
): T | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  if (left !== right) {
    throw new Error(
      `Conflicting ${label} constraints in intersection at ${pathLabel}: ${left} vs ${right}`,
    );
  }
  return left;
}

function mergeDefaultValue(
	left: JsonValue | undefined,
	right: JsonValue | undefined,
	pathLabel: string,
): JsonValue | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  if (!jsonValuesEqual(left, right)) {
    throw new Error(
      `Conflicting default values in intersection at ${pathLabel}`,
    );
  }
  return cloneJsonValue(left);
}

function jsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) {
    return true;
  }
  if (
		left === null ||
		right === null ||
		typeof left !== 'object' ||
		typeof right !== 'object'
	) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }
    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => jsonValuesEqual(value, right[index]));
  }

  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value]) =>
		Object.prototype.hasOwnProperty.call(right, key) &&
		jsonValuesEqual(value, right[key]),
	);
}

function intersectEnumValues(
	left: Array<string | number | boolean> | null,
	right: Array<string | number | boolean> | null,
	pathLabel: string,
): Array<string | number | boolean> | null {
  if (left === null) {
    return right ? [...right] : null;
  }
  if (right === null) {
    return [...left];
  }

  const allowed = new Set(right);
  const intersection = left.filter((value) => allowed.has(value));
  if (intersection.length === 0) {
    throw new Error(`Intersection at ${pathLabel} resolves to an empty enum`);
  }
  return intersection;
}

export function applyTag(
	node: AttributeNode,
	tagNode: ts.TypeReferenceNode,
	pathLabel: string,
): void {
  const tagName = getSupportedTagName(tagNode);
  if (tagName === null) {
    return;
  }

  const [arg] = tagNode.typeArguments ?? [];
  if (arg === undefined) {
    throw new Error(
      `Tag "${tagName}" is missing its generic argument at ${pathLabel}`,
    );
  }

  switch (tagName) {
    case 'Default': {
      const value = parseDefaultValue(arg, pathLabel);
      if (value === undefined) {
        throw new Error(
          `Unsupported Default value at ${pathLabel}: ${arg.getText()}`,
        );
      }
      node.defaultValue = value;
      return;
    }
    case 'Format':
      node.constraints.format = parseStringLikeArgument(
        arg,
        tagName,
        pathLabel,
      );
      return;
    case 'Pattern':
      node.constraints.pattern = parseStringLikeArgument(
        arg,
        tagName,
        pathLabel,
      );
      return;
    case 'PreserveOnEmpty':
      node.wp.preserveOnEmpty = parseBooleanArgument(arg, tagName, pathLabel);
      return;
    case 'Selector':
      node.wp.selector = parseStringLikeArgument(arg, tagName, pathLabel);
      return;
    case 'Secret': {
      const secretStateField = parseStringLikeArgument(arg, tagName, pathLabel);
      if (!secretStateField) {
        throw new Error(
          `Tag "Secret" expects a non-empty masked state field at ${pathLabel}`,
        );
      }
      node.wp.secret = true;
      node.wp.secretStateField = secretStateField;
      node.wp.writeOnly = true;
      return;
    }
    case 'Source':
      node.wp.source = parseWordPressAttributeSource(arg, pathLabel);
      return;
    case 'Type':
      node.constraints.typeTag = parseStringLikeArgument(
        arg,
        tagName,
        pathLabel,
      );
      return;
    case 'MinLength':
      node.constraints.minLength = parseNumericArgument(
        arg,
        tagName,
        pathLabel,
      );
      return;
    case 'MaxLength':
      node.constraints.maxLength = parseNumericArgument(
        arg,
        tagName,
        pathLabel,
      );
      return;
    case 'MinItems':
      node.constraints.minItems = parseNumericArgument(arg, tagName, pathLabel);
      return;
    case 'MaxItems':
      node.constraints.maxItems = parseNumericArgument(arg, tagName, pathLabel);
      return;
    case 'Minimum':
      node.constraints.minimum = parseNumericArgument(arg, tagName, pathLabel);
      return;
    case 'Maximum':
      node.constraints.maximum = parseNumericArgument(arg, tagName, pathLabel);
      return;
    case 'ExclusiveMinimum':
      node.constraints.exclusiveMinimum = parseNumericArgument(
        arg,
        tagName,
        pathLabel,
      );
      return;
    case 'ExclusiveMaximum':
      node.constraints.exclusiveMaximum = parseNumericArgument(
        arg,
        tagName,
        pathLabel,
      );
      return;
    case 'MultipleOf':
      node.constraints.multipleOf = parseNumericArgument(
        arg,
        tagName,
        pathLabel,
      );
      return;
    case 'WriteOnly': {
      const writeOnly = parseBooleanArgument(arg, tagName, pathLabel);
      node.wp.writeOnly = node.wp.secret ? true : writeOnly;
      return;
    }
    default:
      return;
  }
}

function parseDefaultValue(
	node: ts.TypeNode,
	pathLabel: string,
): JsonValue | undefined {
  if (ts.isParenthesizedTypeNode(node)) {
    return parseDefaultValue(node.type, pathLabel);
  }
  if (ts.isLiteralTypeNode(node)) {
    const literal = extractLiteralValue(node);
    return literal === undefined ? undefined : literal;
  }
  if (ts.isTypeLiteralNode(node)) {
    const objectValue: Record<string, JsonValue> = {};
    for (const member of node.members) {
      if (!ts.isPropertySignature(member) || member.type === undefined) {
        throw new Error(`Unsupported object Default value at ${pathLabel}`);
      }
      const propertyName = getPropertyName(member.name);
      const value = parseDefaultValue(
        member.type,
        `${pathLabel}.${propertyName}`,
      );
      if (value === undefined) {
        throw new Error(
          `Unsupported object Default value at ${pathLabel}.${propertyName}`,
        );
      }
      objectValue[propertyName] = value;
    }
    return objectValue;
  }
  if (ts.isTupleTypeNode(node)) {
    return node.elements.map((element, index) => {
      const value = parseDefaultValue(element, `${pathLabel}[${index}]`);
      if (value === undefined) {
        throw new Error(
          `Unsupported array Default value at ${pathLabel}[${index}]`,
        );
      }
      return value;
    });
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }
  return undefined;
}

function parseNumericArgument(
	node: ts.TypeNode,
	tagName: string,
	pathLabel: string,
): number {
  const value = extractLiteralValue(node);
  if (typeof value !== 'number') {
    throw new Error(
      `Tag "${tagName}" expects a numeric literal at ${pathLabel}`,
    );
  }
  return value;
}

function parseStringLikeArgument(
	node: ts.TypeNode,
	tagName: string,
	pathLabel: string,
): string {
  const value = extractLiteralValue(node);
  if (typeof value !== 'string') {
    throw new Error(
      `Tag "${tagName}" expects a string literal at ${pathLabel}`,
    );
  }
  return value;
}

function parseBooleanArgument(
	node: ts.TypeNode,
	tagName: string,
	pathLabel: string,
): boolean {
  const value = extractLiteralValue(node);
  if (typeof value !== 'boolean') {
    throw new Error(
      `Tag "${tagName}" expects a boolean literal at ${pathLabel}`,
    );
  }
  return value;
}

function parseWordPressAttributeSource(
	node: ts.TypeNode,
	pathLabel: string,
): WordPressAttributeSource {
  const value = parseStringLikeArgument(node, 'Source', pathLabel);
  if (value === 'html' || value === 'text' || value === 'rich-text') {
    return value;
  }

  throw new Error(
    `Tag "Source" only supports "html", "text", or "rich-text" at ${pathLabel}`,
  );
}

export function extractLiteralValue(
	node: ts.TypeNode | ts.Node,
): string | number | boolean | undefined {
  if (ts.isParenthesizedTypeNode(node)) {
    return extractLiteralValue(node.type);
  }
  if (ts.isLiteralTypeNode(node)) {
    return extractLiteralValue(node.literal);
  }
  if (
		ts.isPrefixUnaryExpression(node) &&
		node.operator === ts.SyntaxKind.MinusToken &&
		ts.isNumericLiteral(node.operand)
	) {
    return -Number(node.operand.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (ts.isStringLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  return undefined;
}

export function getPropertyName(name: ts.PropertyName): string {
  if (
		ts.isIdentifier(name) ||
		ts.isStringLiteral(name) ||
		ts.isNumericLiteral(name)
	) {
    return name.text;
  }
  throw new Error(`Unsupported property name: ${name.getText()}`);
}

export function getSupportedTagName(node: ts.TypeReferenceNode): string | null {
  const typeName = getEntityNameText(node.typeName);
  const [, tagName] = typeName.split('.');
  if (
		!typeName.startsWith('tags.') ||
		tagName === undefined ||
		!SUPPORTED_TAGS.has(tagName)
	) {
    return null;
  }
  return tagName;
}

function getEntityNameText(name: ts.EntityName): string {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  return `${getEntityNameText(name.left)}.${name.right.text}`;
}
