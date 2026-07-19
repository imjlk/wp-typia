import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import type { EndpointManifestDefinition } from '@wp-typia/block-runtime/metadata-core';

const STANDALONE_SYNC_REST_SCRIPT = path.join(
  'scripts',
  'sync-rest-contracts.ts',
);
const STANDALONE_REST_OPEN_API_FILE = path.join('src', 'api.openapi.json');
const STANDALONE_REST_CLIENT_FILE = path.join('src', 'api-client.ts');

/** Parsed persistence REST metadata and any integrity problem found in its sync helper. */
export interface ParsedStandaloneRestConfig {
  artifactPaths: string[];
  manifest: EndpointManifestDefinition | null;
  problem: string | null;
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
  let manifest: EndpointManifestDefinition | null = null;

  function visit(node: ts.Node): void {
    if (manifest) {
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'REST_ENDPOINT_MANIFEST' &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      bindings.has(node.initializer.expression.text) &&
      node.initializer.arguments.length === 1
    ) {
      const parsed = parseStaticExpression(node.initializer.arguments[0]);
      if (parsed.ok && isEndpointManifestDefinition(parsed.value)) {
        manifest = parsed.value as unknown as EndpointManifestDefinition;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return manifest;
}

function hasCanonicalRestSyncCalls(sourceFile: ts.SourceFile): boolean {
  const requiredImports = [
    'syncEndpointClient',
    'syncRestOpenApi',
    'syncTypeSchemas',
  ] as const;
  return requiredImports.every((importedName) => {
    const bindings = getNamedImportBindings(sourceFile, importedName);
    if (bindings.size === 0 || hasShadowedImportBinding(sourceFile, bindings)) {
      return false;
    }
    let found = false;
    function visit(node: ts.Node): void {
      if (found) {
        return;
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        bindings.has(node.expression.text)
      ) {
        found = true;
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return found;
  });
}

/** Parse the generated persistence REST contract without executing project code. */
export function parseStandaloneRestConfig(
  projectDir: string,
): ParsedStandaloneRestConfig {
  const syncRestPath = path.join(projectDir, STANDALONE_SYNC_REST_SCRIPT);
  if (!fs.existsSync(syncRestPath)) {
    return { artifactPaths: [], manifest: null, problem: null };
  }

  let source: string;
  try {
    source = fs.readFileSync(syncRestPath, 'utf8');
  } catch {
    return {
      artifactPaths: [],
      manifest: null,
      problem: `Unable to read generated helper ${STANDALONE_SYNC_REST_SCRIPT}`,
    };
  }
  if (hasTypeScriptSyntaxErrors(source, syncRestPath)) {
    return {
      artifactPaths: [],
      manifest: null,
      problem: `${STANDALONE_SYNC_REST_SCRIPT} contains TypeScript syntax errors.`,
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
    };
  }
  if (!hasCanonicalRestSyncCalls(sourceFile)) {
    return {
      artifactPaths: [],
      manifest: null,
      problem:
        `${STANDALONE_SYNC_REST_SCRIPT} must call syncTypeSchemas(), ` +
        'syncRestOpenApi(), and syncEndpointClient() through canonical metadata-core imports.',
    };
  }
  const manifest = findStaticEndpointManifest(sourceFile, manifestBindings);
  if (!manifest) {
    return {
      artifactPaths: [],
      manifest: null,
      problem:
        `${STANDALONE_SYNC_REST_SCRIPT} must define a static endpoint ` +
        'manifest through defineEndpointManifest().',
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
    };
  }
  return {
    artifactPaths: relativeArtifactPaths.map((artifactPath) =>
      path.resolve(projectDir, artifactPath),
    ),
    manifest,
    problem: null,
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
