import * as path from 'node:path';

import ts from '@typescript/typescript6';

import {
  type AnalysisContext,
  createAnalysisContext,
  MAX_TOTAL_NODE_COUNT,
} from './metadata-analysis.js';
import {
  type AttributeNode,
  baseNode,
  cloneProperties,
  defaultAttributeConstraints,
  withRequired,
} from './metadata-model.js';
import {
  getReferenceName,
  isSerializableExternalDeclaration,
  resolveIndexedAccessPropertyDeclaration,
  resolveSymbol,
} from './metadata-parser-symbols.js';
import {
  applyTag,
  extractLiteralValue,
  getPropertyName,
  getSupportedTagName,
  mergePrimitiveIntersection,
} from './metadata-parser-tags.js';

/**
 * Analyze one named source type from a TypeScript module.
 *
 * @param options Metadata analysis options including the project root, source
 * type name, types file path, and optional recursive type unrolling depth.
 * @returns The resolved project root plus the parsed root attribute node for
 * the requested source type.
 * @category Schema
 */
export function analyzeSourceType(
	options: {
		maxRecursiveDepth?: number;
		projectRoot?: string;
		sourceTypeName: string;
		typesFile: string;
	},
): { projectRoot: string; rootNode: AttributeNode } {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const rootNodes = analyzeSourceTypes(
    {
      maxRecursiveDepth: options.maxRecursiveDepth,
      projectRoot,
      typesFile: options.typesFile,
    },
    [options.sourceTypeName],
  );

  return {
    projectRoot,
    rootNode: rootNodes[options.sourceTypeName],
  };
}

/**
 * Analyze multiple named source types from a TypeScript module.
 *
 * @param options Metadata analysis options including the optional project root,
 * the relative types file path to parse, and optional recursive type unrolling
 * depth.
 * @param sourceTypeNames Exported type or interface names to resolve from the
 * configured types file.
 * @returns A record keyed by source type name with parsed attribute-node trees
 * for each requested type.
 * @category Schema
 */
export function analyzeSourceTypes(
	options: {
		maxRecursiveDepth?: number;
		projectRoot?: string;
		typesFile: string;
	},
	sourceTypeNames: string[],
): Record<string, AttributeNode> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const typesFilePath = path.resolve(projectRoot, options.typesFile);
  const ctx = createAnalysisContext(
    projectRoot,
    typesFilePath,
    options.maxRecursiveDepth,
  );
  const sourceFile = ctx.program.getSourceFile(typesFilePath);
  if (sourceFile === undefined) {
    throw new Error(`Unable to load types file: ${typesFilePath}`);
  }

  return Object.fromEntries(
    sourceTypeNames.map((sourceTypeName) => {
      const declaration = findNamedDeclaration(sourceFile, sourceTypeName);
      if (declaration === undefined) {
        throw new Error(
          `Unable to find source type "${sourceTypeName}" in ${path.relative(projectRoot, typesFilePath)}`,
        );
      }

      return [
        sourceTypeName,
        parseNamedDeclaration(declaration, ctx, sourceTypeName, true),
      ];
    }),
  );
}

function findNamedDeclaration(
	sourceFile: ts.SourceFile,
	name: string,
): ts.InterfaceDeclaration | ts.TypeAliasDeclaration | undefined {
  for (const statement of sourceFile.statements) {
    if (
			(ts.isInterfaceDeclaration(statement) ||
				ts.isTypeAliasDeclaration(statement)) &&
			statement.name.text === name
		) {
      return statement;
    }
  }
  return undefined;
}

/**
 * Parse an interface or type alias declaration into one attribute-node tree.
 *
 * @param declaration TypeScript declaration node to parse.
 * @param ctx Shared analysis context used for type resolution and recursion
 * detection.
 * @param pathLabel Human-readable path label for diagnostics.
 * @param required Whether the resulting node should be marked as required.
 * @returns The parsed attribute-node representation for the declaration.
 * @category Schema
 */
export function parseNamedDeclaration(
	declaration: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
	ctx: AnalysisContext,
	pathLabel: string,
	required: boolean,
): AttributeNode {
  ctx.totalNodeCount += 1;
  if (ctx.totalNodeCount > MAX_TOTAL_NODE_COUNT) {
    return createRecursiveTerminalNode(pathLabel);
  }
  const recursionKey = `${declaration.getSourceFile().fileName}:${declaration.name.text}`;
  const currentDepth = ctx.recursionDepth.get(recursionKey) ?? 0;

  if (currentDepth >= ctx.maxRecursiveDepth) {
    return createRecursiveTerminalNode(pathLabel);
  }

  ctx.recursionDepth.set(recursionKey, currentDepth + 1);
  try {
    if (ts.isInterfaceDeclaration(declaration)) {
      return parseInterfaceDeclaration(declaration, ctx, pathLabel, required);
    }
    return withRequired(
      parseTypeNode(declaration.type, ctx, pathLabel),
      required,
    );
  } finally {
    if (currentDepth === 0) {
      ctx.recursionDepth.delete(recursionKey);
    } else {
      ctx.recursionDepth.set(recursionKey, currentDepth);
    }
  }
}

/**
 * Create a terminal leaf node for a recursive type that has reached the
 * maximum unrolling depth. The terminal is an optional empty object so every
 * downstream consumer (projection, PHP validator, migration, JSON Schema)
 * treats deeper data as an opaque passthrough without further validation.
 */
function createRecursiveTerminalNode(
	pathLabel: string,
): AttributeNode {
  return {
    constraints: defaultAttributeConstraints(),
    enumValues: null,
    kind: 'object',
    path: `${pathLabel}.__recursive_terminal`,
    properties: {},
    recursiveTerminal: true,
    required: false,
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

function parseInterfaceDeclaration(
	declaration: ts.InterfaceDeclaration,
	ctx: AnalysisContext,
	pathLabel: string,
	required: boolean,
): AttributeNode {
  const properties: Record<string, AttributeNode> = {};

  for (const heritageClause of declaration.heritageClauses ?? []) {
    if (heritageClause.token !== ts.SyntaxKind.ExtendsKeyword) {
      continue;
    }

    for (const baseType of heritageClause.types) {
      const baseNode = parseTypeReference(
        baseType,
        ctx,
        `${pathLabel}<extends>`,
      );
      if (baseNode.kind !== 'object' || baseNode.properties === undefined) {
        throw new Error(
          `Only object-like interface extensions are supported: ${pathLabel}`,
        );
      }
      Object.assign(properties, cloneProperties(baseNode.properties));
    }
  }

  for (const member of declaration.members) {
    if (!ts.isPropertySignature(member) || member.type === undefined) {
      throw new Error(
        `Unsupported member in ${pathLabel}; only typed properties are supported`,
      );
    }

    const propertyName = getPropertyName(member.name);
    properties[propertyName] = withRequired(
      parseTypeNode(member.type, ctx, `${pathLabel}.${propertyName}`),
      member.questionToken === undefined,
    );
  }

  return {
    constraints: defaultAttributeConstraints(),
    enumValues: null,
    kind: 'object',
    path: pathLabel,
    properties,
    required,
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
 * Parse one TypeScript type node into the internal metadata model.
 *
 * @param node TypeScript AST node describing the source type shape.
 * @param ctx Shared analysis context used for symbol and type resolution.
 * @param pathLabel Human-readable path label used in parse errors and warnings.
 * @returns The parsed attribute-node representation of the provided type node.
 * @category Schema
 */
export function parseTypeNode(
	node: ts.TypeNode,
	ctx: AnalysisContext,
	pathLabel: string,
): AttributeNode {
  if (ts.isParenthesizedTypeNode(node)) {
    return parseTypeNode(node.type, ctx, pathLabel);
  }
  if (ts.isIndexedAccessTypeNode(node)) {
    return parseIndexedAccessType(node, ctx, pathLabel);
  }
  if (ts.isIntersectionTypeNode(node)) {
    return parseIntersectionType(node, ctx, pathLabel);
  }
  if (ts.isUnionTypeNode(node)) {
    return parseUnionType(node, ctx, pathLabel);
  }
  if (ts.isTypeLiteralNode(node)) {
    return parseTypeLiteral(node, ctx, pathLabel);
  }
  if (ts.isArrayTypeNode(node)) {
    return {
      constraints: defaultAttributeConstraints(),
      enumValues: null,
      items: withRequired(
        parseTypeNode(node.elementType, ctx, `${pathLabel}[]`),
        true,
      ),
      kind: 'array',
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
  if (ts.isLiteralTypeNode(node)) {
    return parseLiteralType(node, pathLabel);
  }
  if (ts.isTypeReferenceNode(node)) {
    return parseTypeReference(node, ctx, pathLabel);
  }
  if (node.kind === ts.SyntaxKind.StringKeyword) {
    return baseNode('string', pathLabel);
  }
  if (
		node.kind === ts.SyntaxKind.NumberKeyword ||
		node.kind === ts.SyntaxKind.BigIntKeyword
	) {
    return baseNode('number', pathLabel);
  }
  if (node.kind === ts.SyntaxKind.BooleanKeyword) {
    return baseNode('boolean', pathLabel);
  }

  throw new Error(`Unsupported type node at ${pathLabel}: ${node.getText()}`);
}

function parseIntersectionType(
	node: ts.IntersectionTypeNode,
	ctx: AnalysisContext,
	pathLabel: string,
): AttributeNode {
  const tagNodes: ts.TypeReferenceNode[] = [];
  const valueNodes: ts.TypeNode[] = [];

  for (const typeNode of node.types) {
    if (
			ts.isTypeReferenceNode(typeNode) &&
			getSupportedTagName(typeNode) !== null
		) {
      tagNodes.push(typeNode);
    } else {
      valueNodes.push(typeNode);
    }
  }

  if (valueNodes.length === 0) {
    throw new Error(
      `Intersection at ${pathLabel} does not contain a value type`,
    );
  }

  const parsedNodes = valueNodes.map((valueNode) =>
    parseTypeNode(valueNode, ctx, pathLabel),
  );
  const parsed =
		parsedNodes.length === 1
      ? parsedNodes[0]
      : mergePrimitiveIntersection(parsedNodes, pathLabel);
  for (const tagNode of tagNodes) {
    applyTag(parsed, tagNode, pathLabel);
  }

  return parsed;
}

function parseIndexedAccessType(
	node: ts.IndexedAccessTypeNode,
	ctx: AnalysisContext,
	pathLabel: string,
): AttributeNode {
  const keyValue = extractLiteralValue(node.indexType);
  if (typeof keyValue !== 'string' && typeof keyValue !== 'number') {
    throw new Error(
      `Indexed access requires a string or number literal key at ${pathLabel}: ${node.indexType.getText()}`,
    );
  }

  const propertyKey = String(keyValue);
  const propertyDeclaration = resolveIndexedAccessPropertyDeclaration(
    node.objectType,
    propertyKey,
    ctx,
    pathLabel,
  );
  if (propertyDeclaration.type === undefined) {
    throw new Error(
      `Indexed access property "${propertyKey}" is missing an explicit type at ${pathLabel}`,
    );
  }

  return withRequired(
    parseTypeNode(propertyDeclaration.type, ctx, pathLabel),
    propertyDeclaration.questionToken === undefined,
  );
}

function parseUnionType(
	node: ts.UnionTypeNode,
	ctx: AnalysisContext,
	pathLabel: string,
): AttributeNode {
  const literalValues = node.types
		.map((typeNode) => extractLiteralValue(typeNode))
		.filter(
			(value): value is string | number | boolean => value !== undefined,
		);

  if (literalValues.length === node.types.length && literalValues.length > 0) {
    const uniqueKinds = new Set(literalValues.map((value) => typeof value));
    if (uniqueKinds.size !== 1) {
      throw new Error(
        `Mixed primitive enums are not supported at ${pathLabel}`,
      );
    }

    const kind = [...uniqueKinds][0] as 'string' | 'number' | 'boolean';
    return {
      constraints: defaultAttributeConstraints(),
      enumValues: literalValues,
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

  const withoutUndefined = node.types.filter(
		(typeNode) =>
			typeNode.kind !== ts.SyntaxKind.UndefinedKeyword &&
			typeNode.kind !== ts.SyntaxKind.NullKeyword,
	);

  if (withoutUndefined.length === 1) {
    return parseTypeNode(withoutUndefined[0], ctx, pathLabel);
  }

  if (withoutUndefined.length > 1) {
    return parseDiscriminatedUnion(withoutUndefined, ctx, pathLabel);
  }

  throw new Error(`Unsupported union type at ${pathLabel}: ${node.getText()}`);
}

function parseDiscriminatedUnion(
	typeNodes: ts.TypeNode[],
	ctx: AnalysisContext,
	pathLabel: string,
): AttributeNode {
  const branchNodes = typeNodes.map((typeNode, index) => ({
    node: parseTypeNode(typeNode, ctx, `${pathLabel}<branch:${index}>`),
    source: typeNode,
  }));

  for (const branch of branchNodes) {
    if (branch.node.kind !== 'object' || branch.node.properties === undefined) {
      throw new Error(
        `Unsupported union type at ${pathLabel}; only discriminated object unions are supported`,
      );
    }
  }

  const discriminator = findDiscriminatorKey(
    branchNodes.map((branch) => branch.node),
    pathLabel,
  );
  const branches: Record<string, AttributeNode> = {};

  for (const branch of branchNodes) {
    const discriminatorNode = branch.node.properties?.[discriminator];
    const discriminatorValue = discriminatorNode?.enumValues?.[0];

    if (typeof discriminatorValue !== 'string') {
      throw new Error(
        `Discriminated union at ${pathLabel} must use string literal discriminator values`,
      );
    }
    if (branches[discriminatorValue] !== undefined) {
      throw new Error(
        `Discriminated union at ${pathLabel} has duplicate discriminator value "${discriminatorValue}"`,
      );
    }

    branches[discriminatorValue] = withRequired(branch.node, true);
  }

  return {
    constraints: defaultAttributeConstraints(),
    enumValues: null,
    kind: 'union',
    path: pathLabel,
    required: true,
    union: {
      branches,
      discriminator,
    },
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

function findDiscriminatorKey(
	branches: AttributeNode[],
	pathLabel: string,
): string {
  const candidateKeys = new Set(Object.keys(branches[0].properties ?? {}));

  for (const branch of branches.slice(1)) {
    for (const key of [...candidateKeys]) {
      if (!(branch.properties && key in branch.properties)) {
        candidateKeys.delete(key);
      }
    }
  }

  const discriminatorCandidates = [...candidateKeys].filter((key) =>
    branches.every((branch) =>
      isDiscriminatorProperty(branch.properties?.[key]),
    ),
  );

  if (discriminatorCandidates.length !== 1) {
    throw new Error(
      `Unsupported union type at ${pathLabel}; expected exactly one shared discriminator property`,
    );
  }

  return discriminatorCandidates[0];
}

function isDiscriminatorProperty(node: AttributeNode | undefined): boolean {
  return Boolean(
		node &&
		node.required &&
		node.kind === 'string' &&
		node.enumValues !== null &&
		node.enumValues.length === 1 &&
		typeof node.enumValues[0] === 'string',
	);
}

function parseTypeLiteral(
	node: ts.TypeLiteralNode,
	ctx: AnalysisContext,
	pathLabel: string,
): AttributeNode {
  const properties: Record<string, AttributeNode> = {};

  for (const member of node.members) {
    if (!ts.isPropertySignature(member) || member.type === undefined) {
      throw new Error(`Unsupported inline object member at ${pathLabel}`);
    }

    const propertyName = getPropertyName(member.name);
    properties[propertyName] = withRequired(
      parseTypeNode(member.type, ctx, `${pathLabel}.${propertyName}`),
      member.questionToken === undefined,
    );
  }

  return {
    constraints: defaultAttributeConstraints(),
    enumValues: null,
    kind: 'object',
    path: pathLabel,
    properties,
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

function parseLiteralType(
	node: ts.LiteralTypeNode,
	pathLabel: string,
): AttributeNode {
  const literal = extractLiteralValue(node);
  if (literal === undefined) {
    throw new Error(
      `Unsupported literal type at ${pathLabel}: ${node.getText()}`,
    );
  }

  return {
    constraints: defaultAttributeConstraints(),
    enumValues: [literal],
    kind: typeof literal as 'string' | 'number' | 'boolean',
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

function parseTypeReference(
	node: ts.TypeReferenceNode | ts.ExpressionWithTypeArguments,
	ctx: AnalysisContext,
	pathLabel: string,
): AttributeNode {
  const typeName = getReferenceName(node);
  const typeArguments = node.typeArguments ?? [];

  if (typeName === 'Array' || typeName === 'ReadonlyArray') {
    const [itemNode] = typeArguments;
    if (itemNode === undefined) {
      throw new Error(`Array type is missing an item type at ${pathLabel}`);
    }

    return {
      constraints: defaultAttributeConstraints(),
      enumValues: null,
      items: withRequired(parseTypeNode(itemNode, ctx, `${pathLabel}[]`), true),
      kind: 'array',
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
  if (typeArguments.length > 0) {
    // Only treat as a built-in utility type if the name is not shadowed by
    // a user-defined declaration in the project source. If a local symbol
    // exists in a non-lib file, fall through to the generic error.
    const localSymbol = resolveSymbol(node, ctx.checker);
    const isShadowedByUser =
      localSymbol?.declarations?.some((decl) => {
        const fileName = decl.getSourceFile().fileName;
        return (
          !fileName.includes('node_modules') &&
          !fileName.includes('typescript') &&
          !fileName.endsWith('.d.ts')
        );
      }) ?? false;
    if (!isShadowedByUser) {
      const utilityResult = parseUtilityType(
        typeName,
        typeArguments,
        ctx,
        pathLabel,
      );
      if (utilityResult !== null) {
        return utilityResult;
      }
    }
    throw new Error(
      `Generic type references are not supported at ${pathLabel}: ${typeName}`,
    );
  }

  const symbol = resolveSymbol(node, ctx.checker);
  if (symbol === undefined) {
    throw new Error(
      `Unable to resolve type reference "${typeName}" at ${pathLabel}`,
    );
  }

  const declaration = symbol.declarations?.find(
		(candidate) =>
			ts.isInterfaceDeclaration(candidate) ||
			ts.isTypeAliasDeclaration(candidate) ||
			ts.isEnumDeclaration(candidate) ||
			ts.isClassDeclaration(candidate),
	);
  if (declaration === undefined) {
    throw new Error(
      `Unsupported referenced type "${typeName}" at ${pathLabel}`,
    );
  }
  if (!isSerializableExternalDeclaration(declaration, ctx)) {
    throw new Error(
      `External or non-serializable referenced type "${typeName}" is not supported at ${pathLabel}`,
    );
  }
  if (ts.isClassDeclaration(declaration) || ts.isEnumDeclaration(declaration)) {
    throw new Error(
      `Class and enum references are not supported at ${pathLabel}`,
    );
  }
  if ((declaration.typeParameters?.length ?? 0) > 0) {
    throw new Error(
      `Generic type declarations are not supported at ${pathLabel}: ${typeName}`,
    );
  }

  return parseNamedDeclaration(declaration, ctx, pathLabel, true);
}

/**
 * Supported TypeScript utility type names that the parser can resolve at the
 * type level without instantiating a generic declaration.
 */
const UTILITY_TYPE_NAMES = new Set([
  'Partial',
  'Required',
  'Readonly',
  'Pick',
  'Omit',
  'Record',
]);

/**
 * Extract string literal keys from a union of string literal types, e.g.
 * `'a' | 'b'` → `['a', 'b']`. Also resolves named type aliases (e.g.
 * `type Keys = 'a' | 'b'`) via the TypeScript checker. Returns `null` when
 * the node is not a pure union of string literals.
 */
function extractKeyLiterals(
  node: ts.TypeNode,
  ctx?: AnalysisContext,
): string[] | null {
  if (ts.isParenthesizedTypeNode(node)) {
    return extractKeyLiterals(node.type, ctx);
  }
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
    return [node.literal.text];
  }
  if (ts.isUnionTypeNode(node)) {
    const keys: string[][] = [];
    let allValid = true;
    for (const t of node.types) {
      const key = extractKeyLiterals(t, ctx);
      if (key === null) {
        allValid = false;
        break;
      }
      keys.push(key);
    }
    if (allValid) {
      return keys.flat();
    }
  }
  // Resolve named type aliases (e.g. `type Keys = 'a' | 'b'`).
  if (ctx && ts.isTypeReferenceNode(node)) {
    const type = ctx.checker.getTypeFromTypeNode(node);
    if (type.isUnion() && type.types.every((t) => t.isStringLiteral())) {
      return type.types.map((t) => t.value);
    }
    if (type.isStringLiteral()) {
      return [type.value];
    }
  }
  return null;
}

/**
 * Resolve a TypeScript utility type (`Partial`, `Required`, `Readonly`, `Pick`,
 * `Omit`, `Record`) applied to a concrete type argument into an
 * {@link AttributeNode} tree. Returns `null` when the type name is not a
 * recognized utility type so the caller can fall through to the unsupported
 * generic error.
 *
 * @param typeName Name of the utility type (e.g. `Partial`).
 * @param typeArguments Type argument nodes from the type reference.
 * @param ctx Shared analysis context for symbol resolution.
 * @param pathLabel Human-readable path label for diagnostics.
 * @returns The resolved attribute node, or `null` if not a utility type.
 */
function parseUtilityType(
  typeName: string,
  typeArguments: readonly ts.TypeNode[],
  ctx: AnalysisContext,
  pathLabel: string,
): AttributeNode | null {
  if (!UTILITY_TYPE_NAMES.has(typeName)) {
    return null;
  }

  // Readonly<T> is a no-op for serialization — just parse T.
  if (typeName === 'Readonly') {
    const [inner] = typeArguments;
    if (inner === undefined) {
      throw new Error(
        `Readonly requires exactly one type argument at ${pathLabel}`,
      );
    }
    return parseTypeNode(inner, ctx, pathLabel);
  }

  // Record<K, V> → when K is a literal string union, produce concrete
  // properties; otherwise produce an open permissive object.
  if (typeName === 'Record') {
    if (typeArguments.length < 2) {
      throw new Error(`Record requires two type arguments at ${pathLabel}`);
    }
    const [keyNode, valueNode] = typeArguments;
    const keys = extractKeyLiterals(keyNode, ctx);
    if (keys !== null && keys.length > 0) {
      // Concrete keys: produce typed properties for each key.
      const valueResult = parseTypeNode(valueNode, ctx, pathLabel);
      const properties: Record<string, AttributeNode> = {};
      for (const key of keys) {
        properties[key] = withRequired(
          { ...valueResult, path: `${pathLabel}.${key}` },
          true,
        );
      }
      return {
        constraints: defaultAttributeConstraints(),
        enumValues: null,
        kind: 'object',
        path: pathLabel,
        properties,
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
    // Non-literal keys (e.g. Record<string, V>): permissive open object.
    return {
      constraints: defaultAttributeConstraints(),
      enumValues: null,
      kind: 'object',
      path: pathLabel,
      properties: {},
      recursiveTerminal: true,
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

  // Partial<T>, Required<T>, Pick<T, Keys>, Omit<T, Keys> all need T resolved
  // to an object first.
  const [sourceNode, selectorNode] = typeArguments;
  if (sourceNode === undefined) {
    throw new Error(
      `${typeName} requires at least one type argument at ${pathLabel}`,
    );
  }

  // For Pick/Omit, resolve selector keys first so we can skip parsing
  // properties that will be filtered out anyway. This prevents throws from
  // unsupported members that are being excluded.
  let pickOmitKeys: Set<string> | null = null;
  if (typeName === 'Pick' || typeName === 'Omit') {
    if (selectorNode === undefined) {
      throw new Error(
        `${typeName} requires a key selector argument at ${pathLabel}`,
      );
    }
    const keys = extractKeyLiterals(selectorNode, ctx);
    if (keys === null) {
      throw new Error(
        `${typeName} selector must be a union of string literals at ${pathLabel}`,
      );
    }
    pickOmitKeys = new Set(keys);
  }

  // For Pick/Omit, try parsing the source. If it fails (e.g. it has
  // unsupported members), fall back to parsing only the retained properties
  // individually so unsupported excluded members don't cause a throw.
  let sourceResult: AttributeNode;
  try {
    sourceResult = parseTypeNode(sourceNode, ctx, pathLabel);
  } catch {
    if (pickOmitKeys !== null) {
      // Resolve the source declaration and parse only the retained keys.
      const retainedKeys = parseRetainedPropertiesFromSource(
        sourceNode,
        ctx,
        pathLabel,
        typeName,
        pickOmitKeys,
      );
      return {
        constraints: defaultAttributeConstraints(),
        enumValues: null,
        kind: 'object',
        path: pathLabel,
        properties: retainedKeys,
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
    throw new Error(
      `${typeName} source type could not be parsed at ${pathLabel}`,
    );
  }

  // Required<T> can operate on discriminated unions — apply branch-wise,
  // making each branch's properties required.
  if (
    typeName === 'Required' &&
    sourceResult.kind === 'union' &&
    sourceResult.union
  ) {
    const result: AttributeNode = {
      ...sourceResult,
      path: pathLabel,
      union: {
        branches: Object.fromEntries(
          Object.entries(sourceResult.union.branches).map(
            ([key, branch]) => {
              const rb = withRequired(branch, true);
              if (rb.properties) {
                rb.properties = Object.fromEntries(
                  Object.entries(rb.properties).map(([pk, pn]) => [
                    pk,
                    withRequired(pn, true),
                  ]),
                );
              }
              return [key, rb];
            },
          ),
        ),
        discriminator: sourceResult.union.discriminator,
      },
    };
    return result;
  }

  if (sourceResult.kind !== 'object' || !sourceResult.properties) {
    throw new Error(
      `${typeName} can only be applied to object types at ${pathLabel}`,
    );
  }

  let properties = sourceResult.properties;

  if (pickOmitKeys !== null) {
    properties = Object.fromEntries(
      Object.entries(properties).filter(([key]) =>
        typeName === 'Pick' ? pickOmitKeys.has(key) : !pickOmitKeys.has(key),
      ),
    );
  }

  const result: AttributeNode = {
    ...sourceResult,
    path: pathLabel,
    properties,
  };

  if (typeName === 'Partial') {
    result.properties = Object.fromEntries(
      Object.entries(properties).map(([key, node]) => [
        key,
        withRequired(node, false),
      ]),
    );
  } else if (typeName === 'Required') {
    result.properties = Object.fromEntries(
      Object.entries(properties).map(([key, node]) => [
        key,
        withRequired(node, true),
      ]),
    );
  }

  return result;
}

/**
 * Resolve the source type declaration and parse only the properties that
 * survive the Pick/Omit filter, skipping unsupported members. This avoids
 * throws from unsupported members that are being excluded.
 */
function parseRetainedPropertiesFromSource(
  sourceNode: ts.TypeNode,
  ctx: AnalysisContext,
  pathLabel: string,
  typeName: string,
  pickOmitKeys: Set<string>,
): Record<string, AttributeNode> {
  // Resolve the backing interface declaration.
  if (!ts.isTypeReferenceNode(sourceNode)) {
    throw new Error(`${typeName} source must be a named type at ${pathLabel}`);
  }

  const symbol = resolveSymbol(sourceNode, ctx.checker);
  const declaration = symbol?.declarations?.find(
    (d): d is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(d),
  );
  if (declaration === undefined) {
    throw new Error(
      `${typeName} source could not be resolved to an interface at ${pathLabel}`,
    );
  }

  const result: Record<string, AttributeNode> = {};
  for (const member of declaration.members) {
    if (!ts.isPropertySignature(member) || member.type === undefined) {
      continue;
    }
    const propName = getPropertyName(member.name);
    const isRetained =
      typeName === 'Pick'
        ? pickOmitKeys.has(propName)
        : !pickOmitKeys.has(propName);
    if (!isRetained) {
      continue;
    }
    try {
      result[propName] = withRequired(
        parseTypeNode(member.type, ctx, `${pathLabel}.${propName}`),
        member.questionToken === undefined,
      );
    } catch {
      // Skip unsupported retained members.
    }
  }
  return result;
}
