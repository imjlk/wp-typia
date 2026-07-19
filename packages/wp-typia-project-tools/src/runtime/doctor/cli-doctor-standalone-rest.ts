import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

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

function unwrapStaticExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
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

function isEndpointManifestDefinition(value: StaticExpressionValue): boolean {
  if (!isStaticRecord(value)) {
    return false;
  }
  const contracts = value.contracts;
  const endpoints = value.endpoints;
  if (!contracts || !isStaticRecord(contracts) || !Array.isArray(endpoints)) {
    return false;
  }
  return Object.values(contracts).every(
    (contract) =>
      isStaticRecord(contract) &&
      typeof contract.sourceTypeName === 'string' &&
      contract.sourceTypeName.length > 0 &&
      (contract.schemaName === undefined ||
        typeof contract.schemaName === 'string'),
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
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      if ((element.propertyName ?? element.name).text === importedName) {
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
      ts.isImportEqualsDeclaration(node)
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

function findStaticEndpointManifest(
  sourceFile: ts.SourceFile,
  bindings: ReadonlySet<string>,
): EndpointManifestDefinition | null {
  const manifests: EndpointManifestDefinition[] = [];
  for (const statement of sourceFile.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      !(statement.declarationList.flags & ts.NodeFlags.Const)
    ) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== 'REST_ENDPOINT_MANIFEST' ||
        !declaration.initializer ||
        !ts.isCallExpression(declaration.initializer) ||
        !ts.isIdentifier(declaration.initializer.expression) ||
        !bindings.has(declaration.initializer.expression.text) ||
        declaration.initializer.arguments.length !== 1
      ) {
        continue;
      }
      const parsed = parseStaticExpression(
        declaration.initializer.arguments[0],
      );
      if (parsed.ok && isEndpointManifestDefinition(parsed.value)) {
        manifests.push(parsed.value as unknown as EndpointManifestDefinition);
      }
    }
  }
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
      !(statement.declarationList.flags & ts.NodeFlags.Const)
    ) {
      return;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        ts.isCallExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.expression) &&
        declaration.initializer.expression.text === 'parseCliOptions'
      ) {
        bindings.push({ binding: declaration.name.text, index });
      }
    }
  });
  return bindings.length === 1 ? bindings[0] : null;
}

function hasTopLevelMainInvocation(sourceFile: ts.SourceFile): boolean {
  if (countBindingDeclarations(sourceFile, 'process') !== 0) {
    return false;
  }
  return (
    sourceFile.statements.filter((statement) => {
      if (!ts.isExpressionStatement(statement)) {
        return false;
      }
      const expression = unwrapStaticExpression(statement.expression);
      if (
        !ts.isCallExpression(expression) ||
        !ts.isPropertyAccessExpression(expression.expression) ||
        expression.expression.name.text !== 'catch'
      ) {
        return false;
      }
      const receiver = unwrapStaticExpression(expression.expression.expression);
      if (
        !ts.isCallExpression(receiver) ||
        !ts.isIdentifier(receiver.expression) ||
        receiver.expression.text !== 'main' ||
        receiver.arguments.length !== 0 ||
        expression.arguments.length !== 1
      ) {
        return false;
      }
      const catchHandler = unwrapStaticExpression(expression.arguments[0]);
      if (
        (!ts.isArrowFunction(catchHandler) &&
          !ts.isFunctionExpression(catchHandler)) ||
        !ts.isBlock(catchHandler.body)
      ) {
        return false;
      }
      const finalStatement =
        catchHandler.body.statements[catchHandler.body.statements.length - 1];
      if (
        !finalStatement ||
        !ts.isExpressionStatement(finalStatement) ||
        catchHandler.body.statements
          .slice(0, -1)
          .some(
            (catchStatement) =>
              ts.isReturnStatement(catchStatement) ||
              ts.isThrowStatement(catchStatement),
          )
      ) {
        return false;
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
      );
    }).length === 1
  );
}

function hasCanonicalRestSyncCalls(sourceFile: ts.SourceFile): boolean {
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
    !hasTopLevelMainInvocation(sourceFile)
  ) {
    return false;
  }
  const optionsDeclaration = getMainOptionsBinding(mainBody);
  if (!optionsDeclaration) {
    return false;
  }
  const optionsBinding = optionsDeclaration.binding;

  if (
    !getTopLevelFunctionDeclaration(sourceFile, 'assertTypeArtifactsCurrent') ||
    countBindingDeclarations(sourceFile, 'assertTypeArtifactsCurrent') !== 1
  ) {
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
    optionsDeclaration.index < schemaCallIndex &&
    optionsDeclaration.index < preflightCallIndex &&
    preflightCallIndex < schemaCallIndex &&
    schemaCallIndex < openApiCallIndex &&
    openApiCallIndex < clientCallIndex &&
    !mainBody.statements
      .slice(0, clientCallIndex)
      .some(
        (statement) =>
          ts.isReturnStatement(statement) || ts.isThrowStatement(statement),
      )
  );
}

/** Parse the generated persistence REST contract without executing project code. */
export function parseStandaloneRestConfig(
  projectDir: string,
  requiresRest: boolean,
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
  if (!hasCanonicalRestSyncCalls(sourceFile)) {
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
