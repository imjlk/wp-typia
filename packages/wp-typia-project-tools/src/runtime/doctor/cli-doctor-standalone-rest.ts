import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import {
  containsCompletion,
  hasEarlierAbruptCompletion,
  isAllowedSyncHelperTopLevelStatement,
  unwrapStaticExpression,
} from './cli-doctor-standalone-control-flow.js';

import type { EndpointManifestDefinition } from '@wp-typia/block-runtime/metadata-core';
import type { GeneratedPackageJson } from '../shared/package-json-types.js';

const STANDALONE_SYNC_REST_SCRIPT = path.join(
  'scripts',
  'sync-rest-contracts.ts',
);
const STANDALONE_REST_OPEN_API_FILE = path.join('src', 'api.openapi.json');
const STANDALONE_REST_CLIENT_FILE = path.join('src', 'api-client.ts');
const STANDALONE_REST_SURFACE_PATHS = [
  path.join('src', 'api-types.ts'),
  path.join('src', 'api-schemas'),
  STANDALONE_REST_OPEN_API_FILE,
  STANDALONE_REST_CLIENT_FILE,
] as const;
const ENDPOINT_AUTH_INTENTS = new Set([
  'authenticated',
  'public',
  'public-write-protected',
]);
const ENDPOINT_AUTH_MODES = new Set([
  'authenticated-rest-nonce',
  'public-read',
  'public-signed-token',
]);
const ENDPOINT_METHODS = new Set(['DELETE', 'GET', 'PATCH', 'POST', 'PUT']);
const ENDPOINT_WORDPRESS_AUTH_MECHANISMS = new Set([
  'public-signed-token',
  'rest-nonce',
]);

/** Parsed persistence REST metadata and any integrity problem found in its sync helper. */
export interface ParsedStandaloneRestConfig {
  artifactPaths: string[];
  manifest: EndpointManifestDefinition | null;
  problem: string | null;
  requiresRest: boolean;
}

type StandaloneMetadataCoreRestModule = Pick<
  typeof import('@wp-typia/block-runtime/metadata-core'),
  'syncEndpointClient' | 'syncRestOpenApi' | 'syncTypeSchemas'
>;

type StaticExpressionValue =
  | boolean
  | null
  | number
  | string
  | StaticExpressionValue[]
  | { [key: string]: StaticExpressionValue };

type StaticExpressionResult =
  | { ok: true; value: StaticExpressionValue }
  | { ok: false };

function hasTypeScriptSyntaxErrors(source: string, fileName: string): boolean {
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.Latest },
    fileName,
    reportDiagnostics: true,
  });
  return (result.diagnostics ?? []).some(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
}

function isProjectLocalRelativePath(relativePath: string): boolean {
  return (
    relativePath.length > 0 &&
    !relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== '..' &&
    !path.isAbsolute(relativePath)
  );
}

function isSafeProjectRelativePath(
  projectDir: string,
  filePath: string,
): boolean {
  if (path.isAbsolute(filePath)) {
    return false;
  }
  return isProjectLocalRelativePath(
    path.relative(projectDir, path.resolve(projectDir, filePath)),
  );
}

function getStandaloneRestContractArtifactPaths(baseName: string): {
  jsonSchemaFile: string;
  openApiFile: string;
} {
  return {
    jsonSchemaFile: path.join(
      'src',
      'api-schemas',
      `${baseName}.schema.json`,
    ),
    openApiFile: path.join(
      'src',
      'api-schemas',
      `${baseName}.openapi.json`,
    ),
  };
}

function getStandaloneRestArtifactPaths(
  manifest: EndpointManifestDefinition,
): string[] {
  return [
    ...Object.keys(manifest.contracts).flatMap((baseName) => {
      const { jsonSchemaFile, openApiFile } =
        getStandaloneRestContractArtifactPaths(baseName);
      return [jsonSchemaFile, openApiFile];
    }),
    STANDALONE_REST_OPEN_API_FILE,
    STANDALONE_REST_CLIENT_FILE,
  ];
}

/** Detect whether a damaged project still exposes the generated REST surface. */
export function standaloneProjectRequiresRest(
  projectDir: string,
  packageJson: Pick<
    GeneratedPackageJson,
    'dependencies' | 'devDependencies' | 'scripts'
  >,
): boolean {
  return (
    fs.existsSync(path.join(projectDir, STANDALONE_SYNC_REST_SCRIPT)) ||
    STANDALONE_REST_SURFACE_PATHS.some((relativePath) =>
      fs.existsSync(path.join(projectDir, relativePath)),
    ) ||
    typeof packageJson.scripts?.['sync-rest'] === 'string' ||
    ['@wp-typia/rest', '@wp-typia/api-client'].some(
      (packageName) =>
        typeof packageJson.dependencies?.[packageName] === 'string' ||
        typeof packageJson.devDependencies?.[packageName] === 'string',
    )
  );
}

function getStaticPropertyName(name: ts.PropertyName): string | null {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteralLike(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return null;
}

function parseStaticExpression(
  rawExpression: ts.Expression,
): StaticExpressionResult {
  const expression = unwrapStaticExpression(rawExpression);
  if (ts.isStringLiteralLike(expression)) {
    return { ok: true, value: expression.text };
  }
  if (ts.isNumericLiteral(expression)) {
    return { ok: true, value: Number(expression.text) };
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return { ok: true, value: true };
  }
  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return { ok: true, value: false };
  }
  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return { ok: true, value: null };
  }
  if (
    ts.isPrefixUnaryExpression(expression) &&
    (expression.operator === ts.SyntaxKind.PlusToken ||
      expression.operator === ts.SyntaxKind.MinusToken) &&
    ts.isNumericLiteral(expression.operand)
  ) {
    const value = Number(expression.operand.text);
    return {
      ok: true,
      value:
        expression.operator === ts.SyntaxKind.MinusToken ? -value : value,
    };
  }
  if (ts.isArrayLiteralExpression(expression)) {
    const values: StaticExpressionValue[] = [];
    for (const element of expression.elements) {
      if (ts.isSpreadElement(element)) {
        return { ok: false };
      }
      const parsed = parseStaticExpression(element);
      if (!parsed.ok) {
        return parsed;
      }
      values.push(parsed.value);
    }
    return { ok: true, value: values };
  }
  if (ts.isObjectLiteralExpression(expression)) {
    const value: { [key: string]: StaticExpressionValue } = {};
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) {
        return { ok: false };
      }
      const propertyName = getStaticPropertyName(property.name);
      if (propertyName === null) {
        return { ok: false };
      }
      const parsed = parseStaticExpression(property.initializer);
      if (!parsed.ok) {
        return parsed;
      }
      value[propertyName] = parsed.value;
    }
    return { ok: true, value };
  }
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = parseStaticExpression(expression.left);
    const right = parseStaticExpression(expression.right);
    if (!left.ok || !right.ok) {
      return { ok: false };
    }
    if (
      (typeof left.value === 'string' || typeof left.value === 'number') &&
      (typeof right.value === 'string' || typeof right.value === 'number')
    ) {
      return {
        ok: true,
        value:
          typeof left.value === 'string' || typeof right.value === 'string'
            ? String(left.value) + String(right.value)
            : left.value + right.value,
      };
    }
  }
  return { ok: false };
}

function isStaticRecord(
  value: StaticExpressionValue,
): value is { [key: string]: StaticExpressionValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOptionalStaticString(
  value: { [key: string]: StaticExpressionValue },
  propertyName: string,
): boolean {
  return (
    value[propertyName] === undefined ||
    typeof value[propertyName] === 'string'
  );
}

function isStaticWordPressAuthDefinition(
  value: StaticExpressionValue,
): boolean {
  return (
    isStaticRecord(value) &&
    typeof value.mechanism === 'string' &&
    ENDPOINT_WORDPRESS_AUTH_MECHANISMS.has(value.mechanism) &&
    hasOptionalStaticString(value, 'publicTokenField')
  );
}

function isStaticEndpointDefinition(value: StaticExpressionValue): boolean {
  if (!isStaticRecord(value)) {
    return false;
  }
  const auth = value.auth;
  const authMode = value.authMode;
  const tags = value.tags;
  return (
    typeof value.method === 'string' &&
    ENDPOINT_METHODS.has(value.method) &&
    typeof value.operationId === 'string' &&
    value.operationId.length > 0 &&
    typeof value.path === 'string' &&
    value.path.startsWith('/') &&
    typeof value.responseContract === 'string' &&
    value.responseContract.length > 0 &&
    Array.isArray(tags) &&
    tags.every((tag) => typeof tag === 'string') &&
    (auth !== undefined || authMode !== undefined) &&
    (auth === undefined ||
      (typeof auth === 'string' && ENDPOINT_AUTH_INTENTS.has(auth))) &&
    (authMode === undefined ||
      (typeof authMode === 'string' && ENDPOINT_AUTH_MODES.has(authMode))) &&
    hasOptionalStaticString(value, 'bodyContract') &&
    hasOptionalStaticString(value, 'queryContract') &&
    hasOptionalStaticString(value, 'summary') &&
    (value.wordpressAuth === undefined ||
      isStaticWordPressAuthDefinition(value.wordpressAuth))
  );
}

function isStaticOpenApiInfo(value: StaticExpressionValue): boolean {
  return (
    isStaticRecord(value) &&
    hasOptionalStaticString(value, 'description') &&
    hasOptionalStaticString(value, 'title') &&
    hasOptionalStaticString(value, 'version')
  );
}

function isEndpointManifestDefinition(value: StaticExpressionValue): boolean {
  if (!isStaticRecord(value)) {
    return false;
  }
  const contracts = value.contracts;
  const endpoints = value.endpoints;
  if (!contracts || !isStaticRecord(contracts) || !Array.isArray(endpoints)) {
    return false;
  }
  return (
    Object.values(contracts).every(
      (contract) =>
        isStaticRecord(contract) &&
        typeof contract.sourceTypeName === 'string' &&
        contract.sourceTypeName.length > 0 &&
        (contract.schemaName === undefined ||
          typeof contract.schemaName === 'string'),
    ) &&
    endpoints.every(isStaticEndpointDefinition) &&
    (value.info === undefined || isStaticOpenApiInfo(value.info))
  );
}

function getNamedImportBindings(
  sourceFile: ts.SourceFile,
  importedName: string,
): Set<string> {
  const bindings = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !==
        '@wp-typia/block-runtime/metadata-core' ||
      statement.importClause?.isTypeOnly ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      if (
        !element.isTypeOnly &&
        (element.propertyName ?? element.name).text === importedName
      ) {
        bindings.add(element.name.text);
      }
    }
  }
  return bindings;
}

function bindingNameContains(
  name: ts.BindingName | undefined,
  bindings: ReadonlySet<string>,
): boolean {
  if (!name) {
    return false;
  }
  if (ts.isIdentifier(name)) {
    return bindings.has(name.text);
  }
  return name.elements.some(
    (element) =>
      !ts.isOmittedExpression(element) &&
      bindingNameContains(element.name, bindings),
  );
}

function hasShadowedImportBinding(
  sourceFile: ts.SourceFile,
  bindings: ReadonlySet<string>,
): boolean {
  let shadowed = false;

  function visit(node: ts.Node): void {
    if (shadowed || ts.isImportDeclaration(node)) {
      return;
    }
    let declaredName: ts.BindingName | undefined;
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      declaredName = node.name;
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isClassDeclaration(node) ||
      ts.isClassExpression(node) ||
      ts.isEnumDeclaration(node) ||
      (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly)
    ) {
      declaredName = node.name;
    }
    if (bindingNameContains(declaredName, bindings)) {
      shadowed = true;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return shadowed;
}

function hasImportedBinding(
  sourceFile: ts.SourceFile,
  bindingName: string,
): boolean {
  return sourceFile.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause ||
      statement.importClause.isTypeOnly
    ) {
      return false;
    }
    const { name, namedBindings } = statement.importClause;
    if (name?.text === bindingName) {
      return true;
    }
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      return namedBindings.name.text === bindingName;
    }
    return (
      namedBindings !== undefined &&
      ts.isNamedImports(namedBindings) &&
      namedBindings.elements.some(
        (element) =>
          !element.isTypeOnly && element.name.text === bindingName,
      )
    );
  });
}

function getStaticEndpointManifestInitializer(
  statement: ts.Statement,
  bindings: ReadonlySet<string>,
): ts.Expression | null {
  if (
    !ts.isVariableStatement(statement) ||
    !(statement.declarationList.flags & ts.NodeFlags.Const) ||
    statement.declarationList.declarations.length !== 1
  ) {
    return null;
  }
  const declaration = statement.declarationList.declarations[0];
  if (
    !ts.isIdentifier(declaration.name) ||
    declaration.name.text !== 'REST_ENDPOINT_MANIFEST' ||
    !declaration.initializer ||
    !ts.isCallExpression(declaration.initializer) ||
    !ts.isIdentifier(declaration.initializer.expression) ||
    !bindings.has(declaration.initializer.expression.text) ||
    declaration.initializer.arguments.length !== 1
  ) {
    return null;
  }
  return declaration.initializer.arguments[0];
}

function parseStaticEndpointManifestDeclaration(
  statement: ts.Statement,
  bindings: ReadonlySet<string>,
): EndpointManifestDefinition | null {
  const initializer = getStaticEndpointManifestInitializer(
    statement,
    bindings,
  );
  if (!initializer) {
    return null;
  }
  const parsed = parseStaticExpression(initializer);
  return parsed.ok && isEndpointManifestDefinition(parsed.value)
    ? (parsed.value as unknown as EndpointManifestDefinition)
    : null;
}

function findStaticEndpointManifest(
  sourceFile: ts.SourceFile,
  bindings: ReadonlySet<string>,
): EndpointManifestDefinition | null {
  const manifests = sourceFile.statements.flatMap((statement) => {
    const manifest = parseStaticEndpointManifestDeclaration(
      statement,
      bindings,
    );
    return manifest ? [manifest] : [];
  });
  return manifests.length === 1 ? manifests[0] : null;
}

function countBindingDeclarations(
  sourceFile: ts.SourceFile,
  bindingName: string,
): number {
  const bindings = new Set([bindingName]);
  let count = 0;
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) return;
    let declaredName: ts.BindingName | undefined;
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      declaredName = node.name;
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isClassDeclaration(node) ||
      ts.isClassExpression(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isImportEqualsDeclaration(node)
    ) {
      declaredName = node.name;
    }
    if (bindingNameContains(declaredName, bindings)) count += 1;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return count;
}

function getTopLevelFunctionDeclaration(
  sourceFile: ts.SourceFile,
  functionName: string,
): ts.FunctionDeclaration | null {
  const declarations = sourceFile.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === functionName &&
      statement.body !== undefined,
  );
  return declarations.length === 1 ? declarations[0] : null;
}

function getDirectAwaitedCall(
  statement: ts.Statement,
): ts.CallExpression | null {
  if (!ts.isExpressionStatement(statement)) {
    return null;
  }
  const expression = unwrapStaticExpression(statement.expression);
  if (!ts.isAwaitExpression(expression)) {
    return null;
  }
  const awaitedExpression = unwrapStaticExpression(expression.expression);
  return ts.isCallExpression(awaitedExpression) ? awaitedExpression : null;
}

function isNonCheckArgumentGuard(
  node: ts.Node,
  argumentBinding: string,
): node is ts.IfStatement {
  if (
    !ts.isIfStatement(node) ||
    node.elseStatement ||
    !ts.isBinaryExpression(node.expression) ||
    node.expression.operatorToken.kind !==
      ts.SyntaxKind.EqualsEqualsEqualsToken
  ) {
    return false;
  }
  const { left, right } = node.expression;
  return (
    ((ts.isIdentifier(left) &&
      left.text === argumentBinding &&
      ts.isStringLiteralLike(right) &&
      right.text !== '--check') ||
      (ts.isStringLiteralLike(left) &&
        left.text !== '--check' &&
        ts.isIdentifier(right) &&
        right.text === argumentBinding))
  );
}

type ParserControlFlowCheck = 'outer-break-or-return' | 'unsafe-continue';

function isLoopStatement(node: ts.Node): boolean {
  return (
    ts.isDoStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isWhileStatement(node)
  );
}

function labelsLoop(statement: ts.Statement): boolean {
  let target = statement;
  while (ts.isLabeledStatement(target)) {
    target = target.statement;
  }
  return isLoopStatement(target);
}

function containsParserControlFlow(
  node: ts.Node,
  argumentBinding: string,
  check: ParserControlFlowCheck,
  breakableDepth = 0,
  loopDepth = 0,
  outerContinueIsSafe = false,
  activeLabels: ReadonlyMap<string, boolean> = new Map(),
): boolean {
  if (ts.isFunctionLike(node)) {
    return false;
  }
  if (check === 'outer-break-or-return') {
    if (ts.isReturnStatement(node)) {
      return true;
    }
    if (ts.isBreakStatement(node)) {
      return node.label
        ? !activeLabels.has(node.label.text)
        : breakableDepth === 0;
    }
  } else if (ts.isContinueStatement(node)) {
    return node.label
      ? activeLabels.get(node.label.text) !== true
      : loopDepth === 0 && !outerContinueIsSafe;
  }

  if (
    check === 'unsafe-continue' &&
    isNonCheckArgumentGuard(node, argumentBinding)
  ) {
    return containsParserControlFlow(
      node.thenStatement,
      argumentBinding,
      check,
      breakableDepth,
      loopDepth,
      true,
      activeLabels,
    );
  }

  if (ts.isLabeledStatement(node)) {
    const nestedLabels = new Map(activeLabels);
    nestedLabels.set(node.label.text, labelsLoop(node.statement));
    return containsParserControlFlow(
      node.statement,
      argumentBinding,
      check,
      breakableDepth,
      loopDepth,
      outerContinueIsSafe,
      nestedLabels,
    );
  }

  const nextBreakableDepth =
    breakableDepth +
    (isLoopStatement(node) || ts.isSwitchStatement(node) ? 1 : 0);
  const nextLoopDepth = loopDepth + (isLoopStatement(node) ? 1 : 0);
  let found = false;
  ts.forEachChild(node, (child) => {
    if (
      !found &&
      containsParserControlFlow(
        child,
        argumentBinding,
        check,
        nextBreakableDepth,
        nextLoopDepth,
        outerContinueIsSafe,
        activeLabels,
      )
    ) {
      found = true;
    }
  });
  return found;
}

function getObjectLiteralProperties(
  expression: ts.Expression,
): Map<string, ts.Expression> | null {
  const objectLiteral = unwrapStaticExpression(expression);
  if (!ts.isObjectLiteralExpression(objectLiteral)) {
    return null;
  }
  const properties = new Map<string, ts.Expression>();
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) {
      return null;
    }
    const propertyName = getStaticPropertyName(property.name);
    if (propertyName === null || properties.has(propertyName)) {
      return null;
    }
    properties.set(propertyName, unwrapStaticExpression(property.initializer));
  }
  return properties;
}

function isIdentifierPropertyAccess(
  expression: ts.Expression | undefined,
  objectName: string,
  propertyName: string,
): boolean {
  return (
    expression !== undefined &&
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === objectName &&
    expression.name.text === propertyName
  );
}

function isStringValue(
  expression: ts.Expression | undefined,
  expected: string,
): boolean {
  return (
    expression !== undefined &&
    ts.isStringLiteralLike(expression) &&
    expression.text === expected
  );
}

function isIdentifierValue(
  expression: ts.Expression | undefined,
  expected: string,
): boolean {
  return (
    expression !== undefined &&
    ts.isIdentifier(expression) &&
    expression.text === expected
  );
}

function isTemplatePathValue(
  expression: ts.Expression | undefined,
  bindingName: string,
  suffix: string,
): boolean {
  if (!expression || !ts.isTemplateExpression(expression)) {
    return false;
  }
  return (
    expression.head.text === 'src/api-schemas/' &&
    expression.templateSpans.length === 1 &&
    ts.isIdentifier(expression.templateSpans[0].expression) &&
    expression.templateSpans[0].expression.text === bindingName &&
    expression.templateSpans[0].literal.text === suffix
  );
}

function isContractTitleTemplate(
  expression: ts.Expression | undefined,
  contractBinding: string,
): boolean {
  return (
    expression !== undefined &&
    ts.isTemplateExpression(expression) &&
    expression.head.text === '' &&
    expression.templateSpans.length === 1 &&
    isIdentifierPropertyAccess(
      expression.templateSpans[0].expression,
      contractBinding,
      'sourceTypeName',
    ) &&
    expression.templateSpans[0].literal.text === ''
  );
}

function hasCanonicalOpenApiInfo(
  expression: ts.Expression | undefined,
  contractBinding: string,
): boolean {
  if (!expression) return false;
  const properties = getObjectLiteralProperties(expression);
  return (
    properties?.size === 2 &&
    isContractTitleTemplate(properties.get('title'), contractBinding) &&
    isStringValue(properties.get('version'), '1.0.0')
  );
}

function hasCanonicalCheckOptions(
  expression: ts.Expression,
  optionsBinding: string,
): boolean {
  const properties = getObjectLiteralProperties(expression);
  return (
    properties?.size === 1 &&
    isIdentifierPropertyAccess(properties.get('check'), optionsBinding, 'check')
  );
}

function getDirectAwaitedVariableCall(
  statement: ts.Statement,
): { binding: string; call: ts.CallExpression } | null {
  if (
    !ts.isVariableStatement(statement) ||
    !(statement.declarationList.flags & ts.NodeFlags.Const) ||
    statement.declarationList.declarations.length !== 1
  ) {
    return null;
  }
  const declaration = statement.declarationList.declarations[0];
  if (
    !ts.isIdentifier(declaration.name) ||
    !declaration.initializer ||
    !ts.isAwaitExpression(declaration.initializer)
  ) {
    return null;
  }
  const awaited = unwrapStaticExpression(declaration.initializer.expression);
  return ts.isCallExpression(awaited)
    ? { binding: declaration.name.text, call: awaited }
    : null;
}

function hasCanonicalTrueCheck(expression: ts.Expression): boolean {
  const properties = getObjectLiteralProperties(expression);
  return (
    properties?.size === 1 &&
    properties.get('check')?.kind === ts.SyntaxKind.TrueKeyword
  );
}

function hasDirectThrowingBlock(statement: ts.Statement): boolean {
  if (
    !ts.isIfStatement(statement) ||
    statement.elseStatement ||
    !ts.isBlock(statement.thenStatement)
  ) {
    return false;
  }
  const statements = statement.thenStatement.statements;
  const finalStatement = statements[statements.length - 1];
  return (
    finalStatement !== undefined &&
    ts.isThrowStatement(finalStatement) &&
    !hasEarlierAbruptCompletion(statements, statements.length - 1)
  );
}

function isStaleArtifactFailureGuard(
  statement: ts.Statement,
  reportBinding: string,
): boolean {
  if (
    !hasDirectThrowingBlock(statement) ||
    !ts.isIfStatement(statement) ||
    !ts.isBinaryExpression(statement.expression) ||
    statement.expression.operatorToken.kind !==
      ts.SyntaxKind.EqualsEqualsEqualsToken ||
    !ts.isPropertyAccessExpression(statement.expression.left) ||
    statement.expression.left.name.text !== 'code' ||
    !isIdentifierPropertyAccess(
      statement.expression.left.expression,
      reportBinding,
      'failure',
    ) ||
    !ts.isStringLiteralLike(statement.expression.right)
  ) {
    return false;
  }
  return statement.expression.right.text === 'stale-generated-artifact';
}

function isCatchAllFailureGuard(
  statement: ts.Statement,
  reportBinding: string,
): boolean {
  return (
    hasDirectThrowingBlock(statement) &&
    ts.isIfStatement(statement) &&
    isIdentifierPropertyAccess(
      statement.expression,
      reportBinding,
      'failure',
    )
  );
}

function hasCanonicalTypeArtifactPreflight(
  sourceFile: ts.SourceFile,
  sourceTypeName: string | null,
): boolean {
  const declaration = getTopLevelFunctionDeclaration(
    sourceFile,
    'assertTypeArtifactsCurrent',
  );
  const syncBindings = getNamedImportBindings(
    sourceFile,
    'runSyncBlockMetadata',
  );
  if (
    !declaration?.body ||
    declaration.parameters.length !== 0 ||
    declaration.asteriskToken !== undefined ||
    !declaration.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
    ) ||
    declaration.body.statements.length !== 3 ||
    countBindingDeclarations(sourceFile, 'assertTypeArtifactsCurrent') !== 1 ||
    syncBindings.size === 0 ||
    hasShadowedImportBinding(sourceFile, syncBindings)
  ) {
    return false;
  }
  const invocation = getDirectAwaitedVariableCall(
    declaration.body.statements[0],
  );
  if (
    !invocation ||
    !ts.isIdentifier(invocation.call.expression) ||
    !syncBindings.has(invocation.call.expression.text) ||
    invocation.call.arguments.length !== 2 ||
    !hasCanonicalTrueCheck(invocation.call.arguments[1])
  ) {
    return false;
  }
  const input = getObjectLiteralProperties(invocation.call.arguments[0]);
  const preflightSourceTypeName = input?.get('sourceTypeName');
  if (
    input?.size !== 6 ||
    !isStringValue(input.get('blockJsonFile'), 'src/block.json') ||
    !isStringValue(input.get('jsonSchemaFile'), 'src/typia.schema.json') ||
    !isStringValue(input.get('manifestFile'), 'src/typia.manifest.json') ||
    !isStringValue(input.get('openApiFile'), 'src/typia.openapi.json') ||
    !isStringValue(input.get('typesFile'), 'src/types.ts') ||
    preflightSourceTypeName === undefined ||
    !ts.isStringLiteralLike(preflightSourceTypeName) ||
    (sourceTypeName !== null && preflightSourceTypeName.text !== sourceTypeName)
  ) {
    return false;
  }
  return (
    isStaleArtifactFailureGuard(
      declaration.body.statements[1],
      invocation.binding,
    ) &&
    isCatchAllFailureGuard(
      declaration.body.statements[2],
      invocation.binding,
    )
  );
}

function isCanonicalRestSyncCall(
  call: ts.CallExpression | null,
  bindings: ReadonlySet<string>,
  optionsBinding: string,
  validateInput: (properties: ReadonlyMap<string, ts.Expression>) => boolean,
): boolean {
  if (
    call === null ||
    !ts.isIdentifier(call.expression) ||
    !bindings.has(call.expression.text) ||
    call.arguments.length !== 2 ||
    !hasCanonicalCheckOptions(call.arguments[1], optionsBinding)
  ) {
    return false;
  }
  const inputProperties = getObjectLiteralProperties(call.arguments[0]);
  return inputProperties !== null && validateInput(inputProperties);
}

function getRestContractsLoopBindings(
  statement: ts.Statement,
): { baseName: string; contract: string } | null {
  if (!ts.isForOfStatement(statement)) {
    return null;
  }
  const expression = unwrapStaticExpression(statement.expression);
  if (
    !ts.isCallExpression(expression) ||
    !ts.isPropertyAccessExpression(expression.expression) ||
    !ts.isIdentifier(expression.expression.expression) ||
    expression.expression.expression.text !== 'Object' ||
    expression.expression.name.text !== 'entries' ||
    expression.arguments.length !== 1
  ) {
    return null;
  }
  const entriesTarget = unwrapStaticExpression(expression.arguments[0]);
  if (
    !ts.isPropertyAccessExpression(entriesTarget) ||
    !ts.isIdentifier(entriesTarget.expression) ||
    entriesTarget.expression.text !== 'REST_ENDPOINT_MANIFEST' ||
    entriesTarget.name.text !== 'contracts' ||
    !ts.isVariableDeclarationList(statement.initializer) ||
    statement.initializer.declarations.length !== 1
  ) {
    return null;
  }
  const loopBinding = statement.initializer.declarations[0].name;
  if (
    !ts.isArrayBindingPattern(loopBinding) ||
    loopBinding.elements.length !== 2 ||
    loopBinding.elements.some(
      (element) =>
        ts.isOmittedExpression(element) || !ts.isIdentifier(element.name),
    )
  ) {
    return null;
  }
  return {
    baseName: (loopBinding.elements[0] as ts.BindingElement).name.getText(),
    contract: (loopBinding.elements[1] as ts.BindingElement).name.getText(),
  };
}

function getMainOptionsBinding(
  mainBody: ts.Block,
): { binding: string; index: number } | null {
  const bindings: Array<{ binding: string; index: number }> = [];
  mainBody.statements.forEach((statement, index) => {
    if (
      !ts.isVariableStatement(statement) ||
      !(statement.declarationList.flags & ts.NodeFlags.Const) ||
      statement.declarationList.declarations.length !== 1
    ) {
      return;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        isCanonicalRestParseCall(declaration.initializer)
      ) {
        bindings.push({ binding: declaration.name.text, index });
      }
    }
  });
  return bindings.length === 1 ? bindings[0] : null;
}

function isCanonicalRestParseCall(expression: ts.Expression): boolean {
  if (
    !ts.isCallExpression(expression) ||
    !ts.isIdentifier(expression.expression) ||
    expression.expression.text !== 'parseCliOptions' ||
    expression.arguments.length !== 1
  ) {
    return false;
  }
  const argvSlice = unwrapStaticExpression(expression.arguments[0]);
  return (
    ts.isCallExpression(argvSlice) &&
    ts.isPropertyAccessExpression(argvSlice.expression) &&
    argvSlice.expression.name.text === 'slice' &&
    ts.isPropertyAccessExpression(argvSlice.expression.expression) &&
    ts.isIdentifier(argvSlice.expression.expression.expression) &&
    argvSlice.expression.expression.expression.text === 'process' &&
    argvSlice.expression.expression.name.text === 'argv' &&
    argvSlice.arguments.length === 1 &&
    ts.isNumericLiteral(argvSlice.arguments[0]) &&
    argvSlice.arguments[0].text === '2'
  );
}

function countIdentifierOccurrences(node: ts.Node, binding: string): number {
  let count = 0;
  function visit(candidate: ts.Node): void {
    if (ts.isIdentifier(candidate) && candidate.text === binding) {
      count += 1;
    }
    ts.forEachChild(candidate, visit);
  }
  visit(node);
  return count;
}

function hasCanonicalRestCheckParser(sourceFile: ts.SourceFile): boolean {
  const parser = getTopLevelFunctionDeclaration(sourceFile, 'parseCliOptions');
  if (
    !parser?.body ||
    parser.parameters.length !== 1 ||
    !ts.isIdentifier(parser.parameters[0].name) ||
    parser.parameters[0].dotDotDotToken !== undefined ||
    parser.parameters[0].initializer !== undefined ||
    parser.asteriskToken !== undefined ||
    parser.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
    ) ||
    parser.body.statements.length !== 3 ||
    countBindingDeclarations(sourceFile, 'parseCliOptions') !== 1
  ) {
    return false;
  }
  const optionsStatement = parser.body.statements[0];
  if (
    !ts.isVariableStatement(optionsStatement) ||
    !(optionsStatement.declarationList.flags & ts.NodeFlags.Const) ||
    optionsStatement.declarationList.declarations.length !== 1
  ) {
    return false;
  }
  const optionsDeclaration = optionsStatement.declarationList.declarations[0];
  if (
    !ts.isIdentifier(optionsDeclaration.name) ||
    !optionsDeclaration.initializer
  ) {
    return false;
  }
  const optionsBinding = optionsDeclaration.name.text;
  const options = getObjectLiteralProperties(optionsDeclaration.initializer);
  if (
    !options ||
    options.size !== 1 ||
    options.get('check')?.kind !== ts.SyntaxKind.FalseKeyword
  ) {
    return false;
  }

  const loop = parser.body.statements[1];
  if (
    !ts.isForOfStatement(loop) ||
    !ts.isIdentifier(loop.expression) ||
    loop.expression.text !== parser.parameters[0].name.text ||
    !ts.isVariableDeclarationList(loop.initializer) ||
    !(loop.initializer.flags & ts.NodeFlags.Const) ||
    loop.initializer.declarations.length !== 1 ||
    !ts.isIdentifier(loop.initializer.declarations[0].name) ||
    !ts.isBlock(loop.statement)
  ) {
    return false;
  }
  const argumentBinding = loop.initializer.declarations[0].name.text;
  const guardIndexes = loop.statement.statements.flatMap(
    (statement, index) => {
      if (
        !ts.isIfStatement(statement) ||
        statement.elseStatement ||
        !ts.isBinaryExpression(statement.expression) ||
        statement.expression.operatorToken.kind !==
          ts.SyntaxKind.EqualsEqualsEqualsToken ||
        !ts.isIdentifier(statement.expression.left) ||
        statement.expression.left.text !== argumentBinding ||
        !ts.isStringLiteralLike(statement.expression.right) ||
        statement.expression.right.text !== '--check' ||
        !ts.isBlock(statement.thenStatement) ||
        statement.thenStatement.statements.length !== 2
      ) {
        return [];
      }
      const assignment = statement.thenStatement.statements[0];
      const expression = ts.isExpressionStatement(assignment)
        ? assignment.expression
        : null;
      return expression &&
        ts.isBinaryExpression(expression) &&
        expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        isIdentifierPropertyAccess(
          expression.left,
          optionsBinding,
          'check',
        ) &&
        expression.right.kind === ts.SyntaxKind.TrueKeyword &&
        ts.isContinueStatement(statement.thenStatement.statements[1])
        ? [index]
        : [];
    },
  );
  if (
    guardIndexes.length !== 1 ||
    countIdentifierOccurrences(loop.statement, optionsBinding) !== 1 ||
    hasEarlierAbruptCompletion(
      loop.statement.statements,
      guardIndexes[0],
    ) ||
    containsParserControlFlow(
      loop.statement,
      argumentBinding,
      'outer-break-or-return',
    ) ||
    loop.statement.statements
      .slice(0, guardIndexes[0])
      .some((statement) =>
        containsParserControlFlow(
          statement,
          argumentBinding,
          'unsafe-continue',
        ),
      )
  ) {
    return false;
  }
  const returnStatement = parser.body.statements[2];
  return (
    ts.isReturnStatement(returnStatement) &&
    returnStatement.expression !== undefined &&
    ts.isIdentifier(returnStatement.expression) &&
    returnStatement.expression.text === optionsBinding
  );
}

function hasTopLevelMainInvocation(sourceFile: ts.SourceFile): boolean {
  const main = getTopLevelFunctionDeclaration(sourceFile, 'main');
  const processBindings = new Set(['process']);
  const manifestBindings = getNamedImportBindings(
    sourceFile,
    'defineEndpointManifest',
  );
  if (
    !main?.body ||
    main.parameters.length !== 0 ||
    main.asteriskToken !== undefined ||
    !main.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
    ) ||
    countBindingDeclarations(sourceFile, 'main') !== 1 ||
    hasImportedBinding(sourceFile, 'process') ||
    hasShadowedImportBinding(sourceFile, processBindings)
  ) {
    return false;
  }
  const invocationIndexes = sourceFile.statements.flatMap(
    (statement, statementIndex) => {
      if (!ts.isExpressionStatement(statement)) {
        return [];
      }
      const expression = unwrapStaticExpression(statement.expression);
      if (
        !ts.isCallExpression(expression) ||
        !ts.isPropertyAccessExpression(expression.expression) ||
        expression.expression.name.text !== 'catch'
      ) {
        return [];
      }
      const receiver = unwrapStaticExpression(expression.expression.expression);
      if (
        !ts.isCallExpression(receiver) ||
        !ts.isIdentifier(receiver.expression) ||
        receiver.expression.text !== 'main' ||
        receiver.arguments.length !== 0 ||
        expression.arguments.length !== 1
      ) {
        return [];
      }
      const catchHandler = unwrapStaticExpression(expression.arguments[0]);
      if (
        (!ts.isArrowFunction(catchHandler) &&
          !ts.isFunctionExpression(catchHandler)) ||
        !ts.isBlock(catchHandler.body)
      ) {
        return [];
      }
      const finalStatement =
        catchHandler.body.statements[catchHandler.body.statements.length - 1];
      if (
        !finalStatement ||
        !ts.isExpressionStatement(finalStatement) ||
        hasEarlierAbruptCompletion(
          catchHandler.body.statements,
          catchHandler.body.statements.length - 1,
        )
      ) {
        return [];
      }
      const exitCall = unwrapStaticExpression(finalStatement.expression);
      return (
        ts.isCallExpression(exitCall) &&
        ts.isPropertyAccessExpression(exitCall.expression) &&
        ts.isIdentifier(exitCall.expression.expression) &&
        exitCall.expression.expression.text === 'process' &&
        exitCall.expression.name.text === 'exit' &&
        exitCall.arguments.length === 1 &&
        ts.isNumericLiteral(exitCall.arguments[0]) &&
        exitCall.arguments[0].text === '1'
      )
        ? [statementIndex]
        : [];
    },
  );
  if (invocationIndexes.length !== 1) {
    return false;
  }
  const [invocationIndex] = invocationIndexes;
  const hasEarlierMainCall = sourceFile.statements
    .slice(0, invocationIndex)
    .some((statement) =>
      containsCompletion(statement, (candidate) => {
        if (!ts.isCallExpression(candidate)) {
          return false;
        }
        const target = unwrapStaticExpression(candidate.expression);
        return ts.isIdentifier(target) && target.text === 'main';
      }),
    );
  return (
    invocationIndex === sourceFile.statements.length - 1 &&
    sourceFile.statements
      .slice(0, invocationIndex)
      .every((statement) =>
        isAllowedSyncHelperTopLevelStatement(
          statement,
          new Set(['@wp-typia/block-runtime/metadata-core']),
          (variableStatement) => {
            const initializer = getStaticEndpointManifestInitializer(
              variableStatement,
              manifestBindings,
            );
            return (
              initializer !== null && parseStaticExpression(initializer).ok
            );
          },
        ),
      ) &&
    !hasEarlierAbruptCompletion(sourceFile.statements, invocationIndex) &&
    !hasEarlierMainCall
  );
}

function hasCanonicalRestCompletionLog(
  statement: ts.Statement | undefined,
  optionsBinding: string,
): boolean {
  if (!statement || !ts.isExpressionStatement(statement)) {
    return false;
  }
  const call = unwrapStaticExpression(statement.expression);
  if (
    !ts.isCallExpression(call) ||
    !ts.isPropertyAccessExpression(call.expression) ||
    !ts.isIdentifier(call.expression.expression) ||
    call.expression.expression.text !== 'console' ||
    call.expression.name.text !== 'log' ||
    call.arguments.length !== 1
  ) {
    return false;
  }
  const message = unwrapStaticExpression(call.arguments[0]);
  if (
    !ts.isConditionalExpression(message) ||
    !isIdentifierPropertyAccess(message.condition, optionsBinding, 'check')
  ) {
    return false;
  }
  const whenTrue = unwrapStaticExpression(message.whenTrue);
  const whenFalse = unwrapStaticExpression(message.whenFalse);
  return (
    ts.isStringLiteralLike(whenTrue) &&
    ts.isStringLiteralLike(whenFalse)
  );
}

function hasCanonicalRestSyncCalls(
  sourceFile: ts.SourceFile,
  sourceTypeName: string | null,
): boolean {
  const syncTypeBindings = getNamedImportBindings(
    sourceFile,
    'syncTypeSchemas',
  );
  const syncOpenApiBindings = getNamedImportBindings(
    sourceFile,
    'syncRestOpenApi',
  );
  const syncClientBindings = getNamedImportBindings(
    sourceFile,
    'syncEndpointClient',
  );
  const bindingGroups = [
    syncTypeBindings,
    syncOpenApiBindings,
    syncClientBindings,
  ];
  if (
    bindingGroups.some(
      (bindings) =>
        bindings.size === 0 || hasShadowedImportBinding(sourceFile, bindings),
    )
  ) {
    return false;
  }

  const mainDeclaration = getTopLevelFunctionDeclaration(sourceFile, 'main');
  const mainBody = mainDeclaration?.body;
  if (
    !mainBody ||
    !mainDeclaration.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
    ) ||
    hasImportedBinding(sourceFile, 'console') ||
    hasShadowedImportBinding(sourceFile, new Set(['console'])) ||
    !hasCanonicalRestCheckParser(sourceFile) ||
    !hasTopLevelMainInvocation(sourceFile)
  ) {
    return false;
  }
  const optionsDeclaration = getMainOptionsBinding(mainBody);
  if (!optionsDeclaration) {
    return false;
  }
  const optionsBinding = optionsDeclaration.binding;

  if (!hasCanonicalTypeArtifactPreflight(sourceFile, sourceTypeName)) {
    return false;
  }
  const preflightCallIndexes = mainBody.statements.flatMap(
    (statement, index) => {
      const call = getDirectAwaitedCall(statement);
      return call &&
        ts.isIdentifier(call.expression) &&
        call.expression.text === 'assertTypeArtifactsCurrent' &&
        call.arguments.length === 0
        ? [index]
        : [];
    },
  );
  if (preflightCallIndexes.length !== 1) {
    return false;
  }
  const [preflightCallIndex] = preflightCallIndexes;

  const schemaCallIndexes: number[] = [];
  mainBody.statements.forEach((statement, index) => {
    const loopBindings = getRestContractsLoopBindings(statement);
    if (!loopBindings || !ts.isForOfStatement(statement)) return;
    const loopStatements = ts.isBlock(statement.statement)
      ? statement.statement.statements
      : [statement.statement];
    if (loopStatements.length !== 1) return;
    const matchingCallIndexes = loopStatements.flatMap(
      (loopStatement, loopStatementIndex) =>
        isCanonicalRestSyncCall(
          getDirectAwaitedCall(loopStatement),
          syncTypeBindings,
          optionsBinding,
          (properties) =>
            properties.size === 5 &&
            isTemplatePathValue(
              properties.get('jsonSchemaFile'),
              loopBindings.baseName,
              '.schema.json',
            ) &&
            isTemplatePathValue(
              properties.get('openApiFile'),
              loopBindings.baseName,
              '.openapi.json',
            ) &&
            hasCanonicalOpenApiInfo(
              properties.get('openApiInfo'),
              loopBindings.contract,
            ) &&
            isIdentifierPropertyAccess(
              properties.get('sourceTypeName'),
              loopBindings.contract,
              'sourceTypeName',
            ) &&
            isStringValue(properties.get('typesFile'), 'src/api-types.ts'),
        )
          ? [loopStatementIndex]
          : [],
    );
    if (matchingCallIndexes.length === 1) schemaCallIndexes.push(index);
  });
  const openApiCallIndexes: number[] = [];
  const clientCallIndexes: number[] = [];
  mainBody.statements.forEach((statement, index) => {
    const call = getDirectAwaitedCall(statement);
    if (
      isCanonicalRestSyncCall(
        call,
        syncOpenApiBindings,
        optionsBinding,
        (properties) =>
          properties.size === 3 &&
          isIdentifierValue(
            properties.get('manifest'),
            'REST_ENDPOINT_MANIFEST',
          ) &&
          isStringValue(
            properties.get('openApiFile'),
            'src/api.openapi.json',
          ) &&
          isStringValue(properties.get('typesFile'), 'src/api-types.ts'),
      )
    ) {
      openApiCallIndexes.push(index);
    }
    if (
      isCanonicalRestSyncCall(
        call,
        syncClientBindings,
        optionsBinding,
        (properties) =>
          properties.size === 3 &&
          isIdentifierValue(
            properties.get('manifest'),
            'REST_ENDPOINT_MANIFEST',
          ) &&
          isStringValue(properties.get('clientFile'), 'src/api-client.ts') &&
          isStringValue(properties.get('typesFile'), 'src/api-types.ts'),
      )
    ) {
      clientCallIndexes.push(index);
    }
  });
  if (
    schemaCallIndexes.length !== 1 ||
    openApiCallIndexes.length !== 1 ||
    clientCallIndexes.length !== 1
  ) {
    return false;
  }
  const [schemaCallIndex] = schemaCallIndexes;
  const [openApiCallIndex] = openApiCallIndexes;
  const [clientCallIndex] = clientCallIndexes;
  return (
    optionsDeclaration.index === 0 &&
    preflightCallIndex === 1 &&
    schemaCallIndex === 2 &&
    openApiCallIndex === 3 &&
    clientCallIndex === 4 &&
    mainBody.statements.length === 6 &&
    hasCanonicalRestCompletionLog(
      mainBody.statements[clientCallIndex + 1],
      optionsBinding,
    ) &&
    !hasEarlierAbruptCompletion(mainBody.statements, clientCallIndex)
  );
}

/** Parse the generated persistence REST contract without executing project code. */
export function parseStandaloneRestConfig(
  projectDir: string,
  requiresRest: boolean,
  sourceTypeName: string | null,
): ParsedStandaloneRestConfig {
  const syncRestPath = path.join(projectDir, STANDALONE_SYNC_REST_SCRIPT);
  if (!fs.existsSync(syncRestPath)) {
    return {
      artifactPaths: [],
      manifest: null,
      problem: requiresRest
        ? `Missing generated helper ${STANDALONE_SYNC_REST_SCRIPT}`
        : null,
      requiresRest,
    };
  }

  let source: string;
  try {
    source = fs.readFileSync(syncRestPath, 'utf8');
  } catch {
    return {
      artifactPaths: [],
      manifest: null,
      problem: `Unable to read generated helper ${STANDALONE_SYNC_REST_SCRIPT}`,
      requiresRest,
    };
  }
  if (hasTypeScriptSyntaxErrors(source, syncRestPath)) {
    return {
      artifactPaths: [],
      manifest: null,
      problem: `${STANDALONE_SYNC_REST_SCRIPT} contains TypeScript syntax errors.`,
      requiresRest,
    };
  }
  const sourceFile = ts.createSourceFile(
    syncRestPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const manifestBindings = getNamedImportBindings(
    sourceFile,
    'defineEndpointManifest',
  );
  if (
    manifestBindings.size === 0 ||
    hasShadowedImportBinding(sourceFile, manifestBindings)
  ) {
    return {
      artifactPaths: [],
      manifest: null,
      problem:
        `${STANDALONE_SYNC_REST_SCRIPT} must not shadow its canonical ` +
        'defineEndpointManifest() import binding.',
      requiresRest,
    };
  }
  if (!hasCanonicalRestSyncCalls(sourceFile, sourceTypeName)) {
    return {
      artifactPaths: [],
      manifest: null,
      problem:
        `${STANDALONE_SYNC_REST_SCRIPT} must call syncTypeSchemas(), ` +
        'syncRestOpenApi(), and syncEndpointClient() through canonical metadata-core imports.',
      requiresRest,
    };
  }
  const manifest = findStaticEndpointManifest(sourceFile, manifestBindings);
  if (
    !manifest ||
    countBindingDeclarations(sourceFile, 'REST_ENDPOINT_MANIFEST') !== 1
  ) {
    return {
      artifactPaths: [],
      manifest: null,
      problem:
        `${STANDALONE_SYNC_REST_SCRIPT} must define a static endpoint ` +
        'manifest through defineEndpointManifest().',
      requiresRest,
    };
  }

  const relativeArtifactPaths = getStandaloneRestArtifactPaths(manifest);
  const unsafeArtifactPath = relativeArtifactPaths.find(
    (artifactPath) => !isSafeProjectRelativePath(projectDir, artifactPath),
  );
  if (unsafeArtifactPath) {
    return {
      artifactPaths: [],
      manifest: null,
      problem: `${STANDALONE_SYNC_REST_SCRIPT} references an unsafe REST contract name.`,
      requiresRest,
    };
  }
  return {
    artifactPaths: relativeArtifactPaths.map((artifactPath) =>
      path.resolve(projectDir, artifactPath),
    ),
    manifest,
    problem: null,
    requiresRest,
  };
}

/** Check every persistence REST artifact through the installed project runtime. */
export async function checkStandaloneRestArtifacts(
  projectDir: string,
  config: ParsedStandaloneRestConfig,
  metadataCore: StandaloneMetadataCoreRestModule,
): Promise<void> {
  if (!config.manifest) {
    return;
  }

  for (const [baseName, contract] of Object.entries(
    config.manifest.contracts,
  )) {
    const { jsonSchemaFile, openApiFile } =
      getStandaloneRestContractArtifactPaths(baseName);
    await metadataCore.syncTypeSchemas(
      {
        jsonSchemaFile,
        openApiFile,
        openApiInfo: {
          title: contract.sourceTypeName,
          version: '1.0.0',
        },
        projectRoot: projectDir,
        sourceTypeName: contract.sourceTypeName,
        typesFile: 'src/api-types.ts',
      },
      { check: true },
    );
  }
  await metadataCore.syncRestOpenApi(
    {
      manifest: config.manifest,
      openApiFile: STANDALONE_REST_OPEN_API_FILE,
      projectRoot: projectDir,
      typesFile: 'src/api-types.ts',
    },
    { check: true },
  );
  await metadataCore.syncEndpointClient(
    {
      clientFile: STANDALONE_REST_CLIENT_FILE,
      manifest: config.manifest,
      projectRoot: projectDir,
      typesFile: 'src/api-types.ts',
    },
    { check: true },
  );
}
