import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import ts from '@typescript/typescript6';

import { readOptionalFile } from './cli-add-shared.js';
import { detectSourceLineEnding } from '../shared/ts-source-masking.js';

export const COMPOUND_SHARED_SUPPORT_FILES = [
  'hooks.ts',
  'validator-toolkit.ts',
] as const;
const LEGACY_ASSERT_PATTERN = /assert:\s*typia\.createAssert</u;
const LEGACY_MANIFEST_PATTERN = /\r?\n[ \t]*manifest:\s*currentManifest,/u;
const LEGACY_VALIDATOR_MANIFEST_IMPORT_PATTERN =
	/^[\uFEFF \t]*import\s+currentManifest\s+from\s*["']\.\/typia\.manifest\.json["'];?$/u;
const LEGACY_TOOLKIT_CALL_PATTERN =
	/createTemplateValidatorToolkit<\s*(?<typeName>[A-Za-z0-9_]+)\s*>\s*\(\s*\{/u;
const LEGACY_VALIDATOR_TOOLKIT_IMPORT_PATTERN =
	/from\s*["']\.\.\/\.\.\/validator-toolkit["']/u;
const TYPIA_IMPORT_PATTERN =
	/^[\uFEFF \t]*import\s+typia\s+from\s*["']typia["'];?/mu;
const COMPATIBLE_COMPOUND_TOOLKIT_PATTERNS = [
  /interface\s+TemplateValidatorFunctions\s*<\s*T\s+extends\s+object\s*>\s*\{/u,
  /\bassert\s*:\s*ScaffoldValidatorToolkitOptions\s*<\s*T\s*>\s*\[\s*["']assert["']\s*\]/u,
  /\bclone\s*:\s*ScaffoldValidatorToolkitOptions\s*<\s*T\s*>\s*\[\s*["']clone["']\s*\]/u,
  /\bis\s*:\s*ScaffoldValidatorToolkitOptions\s*<\s*T\s*>\s*\[\s*["']is["']\s*\]/u,
  /\bprune\s*:\s*ScaffoldValidatorToolkitOptions\s*<\s*T\s*>\s*\[\s*["']prune["']\s*\]/u,
  /\brandom\s*:\s*ScaffoldValidatorToolkitOptions\s*<\s*T\s*>\s*\[\s*["']random["']\s*\]/u,
  /\bvalidate\s*:\s*ScaffoldValidatorToolkitOptions\s*<\s*T\s*>\s*\[\s*["']validate["']\s*\]/u,
  /createTemplateValidatorToolkit\s*<\s*T\s+extends\s+object\s*>\s*\(\s*\{/u,
] as const;

const METADATA_CORE_MODULE = '@wp-typia/block-runtime/metadata-core';
const ENDPOINT_MANIFEST_IMPORT = 'defineEndpointManifest';

function getImportedBindingName(binding: ts.ImportSpecifier): string {
  return (binding.propertyName ?? binding.name).text;
}

function isEndpointManifestBinding(binding: ts.ImportSpecifier): boolean {
  return (
    getImportedBindingName(binding) === ENDPOINT_MANIFEST_IMPORT &&
    binding.name.text === ENDPOINT_MANIFEST_IMPORT
  );
}

function bindingNameContainsEndpointManifest(name: ts.BindingName): boolean {
  if (ts.isIdentifier(name)) {
    return name.text === ENDPOINT_MANIFEST_IMPORT;
  }
  if (!ts.isObjectBindingPattern(name) && !ts.isArrayBindingPattern(name)) {
    return false;
  }
  return name.elements.some(
    (element) =>
      !ts.isOmittedExpression(element) &&
      bindingNameContainsEndpointManifest(element.name),
  );
}

function importDeclarationConflictsWithEndpointManifest(
  statement: ts.ImportDeclaration,
): boolean {
  const importClause = statement.importClause;
  if (!importClause) {
    return false;
  }
  if (importClause.name?.text === ENDPOINT_MANIFEST_IMPORT) {
    return true;
  }
  const namedBindings = importClause.namedBindings;
  if (!namedBindings) {
    return false;
  }
  if (ts.isNamespaceImport(namedBindings)) {
    return namedBindings.name.text === ENDPOINT_MANIFEST_IMPORT;
  }
  const isMetadataCoreImport =
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === METADATA_CORE_MODULE;
  // A type-only import alias still produces TS2300 when another import reuses
  // its local name. Only an exact metadata-core binding can be promoted in place.
  return namedBindings.elements.some(
    (binding) =>
      binding.name.text === ENDPOINT_MANIFEST_IMPORT &&
      (!isMetadataCoreImport || !isEndpointManifestBinding(binding)),
  );
}

function statementConflictsWithEndpointManifest(statement: ts.Statement): boolean {
  if (ts.isImportDeclaration(statement)) {
    return importDeclarationConflictsWithEndpointManifest(statement);
  }
  if (ts.isImportEqualsDeclaration(statement)) {
    return statement.name.text === ENDPOINT_MANIFEST_IMPORT;
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.some((declaration) =>
      bindingNameContainsEndpointManifest(declaration.name),
    );
  }
  if (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isModuleDeclaration(statement)
  ) {
    return (
      statement.name !== undefined &&
      ts.isIdentifier(statement.name) &&
      statement.name.text === ENDPOINT_MANIFEST_IMPORT
    );
  }
  return false;
}

function assertEndpointManifestLocalBindingIsAvailable(
  sourceFile: ts.SourceFile,
): void {
  if (!sourceFile.statements.some(statementConflictsWithEndpointManifest)) {
    return;
  }
  throw new Error(
    `Unable to add REST manifest support because the local name "${ENDPOINT_MANIFEST_IMPORT}" is already bound outside the canonical "${METADATA_CORE_MODULE}" import. Rename that local binding before retrying.`,
  );
}

function detectLeadingLineEnding(value: string): string {
  if (value.startsWith('\r\n')) {
    return '\r\n';
  }
  if (value.startsWith('\n')) {
    return '\n';
  }
  return '';
}

function hasCommaOutsideComments(value: string): boolean {
  return value
    .replace(/\/\/[^\r\n]*/gu, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .includes(',');
}

function addEndpointManifestToNamedImport(
	source: string,
	sourceFile: ts.SourceFile,
	namedImports: ts.NamedImports,
): string {
  const openBraceEnd = namedImports.getStart(sourceFile) + 1;
  const closeBraceStart = namedImports.getEnd() - 1;
  const currentBindings = source.slice(openBraceEnd, closeBraceStart);

  if (!currentBindings.includes('\n') && !currentBindings.includes('\r')) {
    if (currentBindings.trim() === '') {
      return `${source.slice(0, openBraceEnd)} ${ENDPOINT_MANIFEST_IMPORT} ${source.slice(closeBraceStart)}`;
    }

    if (namedImports.elements.length === 0) {
      const trailingWhitespace = currentBindings.match(/\s*$/u)?.[0] ?? '';
      const insertionIndex = closeBraceStart - trailingWhitespace.length;
      return `${source.slice(0, insertionIndex)} ${ENDPOINT_MANIFEST_IMPORT}${source.slice(insertionIndex)}`;
    }

    const trailingWhitespace = currentBindings.match(/\s*$/u)?.[0] ?? '';
    const insertionIndex = closeBraceStart - trailingWhitespace.length;
    const lastBinding = namedImports.elements[namedImports.elements.length - 1];
    const trailingBindings = lastBinding
      ? source.slice(lastBinding.getEnd(), closeBraceStart)
      : currentBindings;
    const separator = hasCommaOutsideComments(trailingBindings) ? ' ' : ', ';
    return `${source.slice(0, insertionIndex)}${separator}${ENDPOINT_MANIFEST_IMPORT}${source.slice(insertionIndex)}`;
  }

  const lineEnding = detectSourceLineEnding(source);
  const firstBinding = namedImports.elements[0];
  const lastBinding = namedImports.elements[namedImports.elements.length - 1];
  if (!firstBinding || !lastBinding) {
    const initialLineEnding = detectLeadingLineEnding(currentBindings);
    const contentIndentation = currentBindings.match(
      /(?:\r?\n)([ \t]*)(?=\S)/u,
    )?.[1];
    const closingLineStart = source.lastIndexOf('\n', closeBraceStart - 1) + 1;
    const closingIndentation = source.slice(closingLineStart, closeBraceStart);
    const indentationUnit = closingIndentation.includes('\t') ? '\t' : '  ';
    const indentation =
      contentIndentation ?? `${closingIndentation}${indentationUnit}`;
    const insertionIndex = openBraceEnd + initialLineEnding.length;
    return `${source.slice(0, insertionIndex)}${indentation}${ENDPOINT_MANIFEST_IMPORT},${lineEnding}${source.slice(insertionIndex)}`;
  }

  const lastBindingStart = lastBinding.getStart(sourceFile);
  const bindingLineStart = source.lastIndexOf('\n', lastBindingStart - 1) + 1;
  const candidateIndentation = source.slice(bindingLineStart, lastBindingStart);
  const openBraceLineStart = source.lastIndexOf('\n', openBraceEnd - 1) + 1;
  const importLinePrefix = source.slice(openBraceLineStart, openBraceEnd);
  const importIndentation = importLinePrefix.match(/^[ \t]*/u)?.[0] ?? '';
  const indentation = /^[ \t]*$/u.test(candidateIndentation)
    ? candidateIndentation
    : `${importIndentation}  `;
  const lastBindingEnd = lastBinding.getEnd();
  const trailingBindings = source.slice(lastBindingEnd, closeBraceStart);
  const missingComma = hasCommaOutsideComments(trailingBindings) ? '' : ',';

  if (!trailingBindings.includes('\n') && !trailingBindings.includes('\r')) {
    return `${source.slice(0, lastBindingEnd)}${missingComma}${trailingBindings.trimEnd()}${lineEnding}${indentation}${ENDPOINT_MANIFEST_IMPORT},${lineEnding}${importIndentation}${source.slice(closeBraceStart)}`;
  }

  return `${source.slice(0, lastBindingEnd)}${missingComma}${source.slice(
    lastBindingEnd,
    closeBraceStart,
  )}${indentation}${ENDPOINT_MANIFEST_IMPORT},${lineEnding}${source.slice(
    closeBraceStart,
  )}`;
}

function convertEndpointManifestTypeOnlyBindingToRuntime(
	source: string,
	sourceFile: ts.SourceFile,
	namedImports: ts.NamedImports,
): string {
  const typeOnlyBinding = namedImports.elements.find(
    (element) =>
      element.isTypeOnly && isEndpointManifestBinding(element),
  );
  if (!typeOnlyBinding) {
    return source;
  }

  const importedName = typeOnlyBinding.propertyName ?? typeOnlyBinding.name;
  return `${source.slice(0, typeOnlyBinding.getStart(sourceFile))}${source.slice(
    importedName.getStart(sourceFile),
  )}`;
}

function convertEndpointManifestClauseTypeOnlyBindingToRuntime(
  source: string,
  sourceFile: ts.SourceFile,
  statement: ts.ImportDeclaration,
  namedImports: ts.NamedImports,
): string {
  const typeOnlyBinding = namedImports.elements.find(isEndpointManifestBinding);
  if (!typeOnlyBinding) {
    return source;
  }

  const importClause = statement.importClause;
  if (!importClause) {
    return source;
  }
  if (namedImports.elements.length === 1 && !importClause.name) {
    const importClauseStart = importClause.getStart(sourceFile);
    const namedImportsStart = namedImports.getStart(sourceFile);
    return `${source.slice(0, importClauseStart)}${source.slice(
      namedImportsStart,
    )}`;
  }

  const bindingIndex = namedImports.elements.indexOf(typeOnlyBinding);
  const previousBinding = namedImports.elements[bindingIndex - 1];
  const nextBinding = namedImports.elements[bindingIndex + 1];
  const removingOnlyNamedBinding =
    namedImports.elements.length === 1 && importClause.name !== undefined;
  const removeStart = removingOnlyNamedBinding
    ? importClause.name.getEnd()
    : nextBinding
      ? typeOnlyBinding.getStart(sourceFile)
      : (previousBinding?.getEnd() ?? typeOnlyBinding.getStart(sourceFile));
  const removeEnd = removingOnlyNamedBinding
    ? namedImports.getEnd()
    : nextBinding
      ? nextBinding.getStart(sourceFile)
      : typeOnlyBinding.getEnd();
  const runtimeSpecifier = source.slice(
    typeOnlyBinding.getStart(sourceFile),
    typeOnlyBinding.getEnd(),
  );
  const lineEnding = detectSourceLineEnding(source);
  const runtimeImport =
    `import { ${runtimeSpecifier} } from '${METADATA_CORE_MODULE}';`;
  const remainingSource = `${source.slice(0, removeStart)}${source.slice(
    removeEnd,
  )}`;
  const statementStart = statement.getStart(sourceFile);
  return `${remainingSource.slice(
    0,
    statementStart,
  )}${runtimeImport}${lineEnding}${remainingSource.slice(statementStart)}`;
}

export function ensureBlockConfigCanAddRestManifests(source: string): string {
  const importLine =
		`import { ${ENDPOINT_MANIFEST_IMPORT} } from '${METADATA_CORE_MODULE}';`;
  const sourceFile = ts.createSourceFile(
    'block-config.ts',
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  let mergeCandidate: ts.NamedImports | undefined;
  let typeOnlyCandidate: ts.NamedImports | undefined;
  let clauseTypeOnlyCandidate:
    | { namedImports: ts.NamedImports; statement: ts.ImportDeclaration }
    | undefined;

  assertEndpointManifestLocalBindingIsAvailable(sourceFile);

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== METADATA_CORE_MODULE
    ) {
      continue;
    }

    const importClause = statement.importClause;
    const namedBindings = importClause?.namedBindings;
    if (!importClause || !namedBindings || !ts.isNamedImports(namedBindings)) {
      continue;
    }

    if (importClause.isTypeOnly) {
      if (
        namedBindings.elements.some(isEndpointManifestBinding)
      ) {
        clauseTypeOnlyCandidate ??= { namedImports: namedBindings, statement };
      }
      continue;
    }

    const hasRuntimeBinding = namedBindings.elements.some(
      (element) =>
        !element.isTypeOnly && isEndpointManifestBinding(element),
    );
    if (hasRuntimeBinding) {
      return source;
    }

    const hasTypeOnlyBinding = namedBindings.elements.some(
      isEndpointManifestBinding,
    );
    if (hasTypeOnlyBinding) {
      typeOnlyCandidate ??= namedBindings;
    } else {
      mergeCandidate ??= namedBindings;
    }
  }

  if (typeOnlyCandidate) {
    return convertEndpointManifestTypeOnlyBindingToRuntime(
      source,
      sourceFile,
      typeOnlyCandidate,
    );
  }
  if (clauseTypeOnlyCandidate) {
    return convertEndpointManifestClauseTypeOnlyBindingToRuntime(
      source,
      sourceFile,
      clauseTypeOnlyCandidate.statement,
      clauseTypeOnlyCandidate.namedImports,
    );
  }
  if (mergeCandidate) {
    return addEndpointManifestToNamedImport(source, sourceFile, mergeCandidate);
  }

  const lineEnding = detectSourceLineEnding(source);
  return `${importLine}${lineEnding}${lineEnding}${source}`;
}

function shouldRefreshCompoundValidatorToolkit(source: string | null): boolean {
  return (
		source === null ||
		!COMPATIBLE_COMPOUND_TOOLKIT_PATTERNS.every((pattern) =>
      pattern.test(source),
    )
	);
}

function isLegacyCompoundValidatorSource(source: string | null): source is string {
  return (
		typeof source === 'string' &&
		LEGACY_VALIDATOR_TOOLKIT_IMPORT_PATTERN.test(source) &&
		!LEGACY_ASSERT_PATTERN.test(source)
	);
}

function hasTypiaImport(source: string): boolean {
  return TYPIA_IMPORT_PATTERN.test(source.replace(/\/\*[\s\S]*?\*\//gu, ''));
}

function replaceFirstNonCommentLine(
	source: string,
	pattern: RegExp,
	replacement: string,
): string {
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  let inBlockComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const trimmed = line.trimStart();

    if (inBlockComment) {
      if (trimmed.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith('//')) {
      continue;
    }

    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) {
        inBlockComment = true;
      }
      continue;
    }

    if (!pattern.test(line)) {
      continue;
    }

    lines[index] = replacement;
    return lines.join(lineEnding);
  }

  return source;
}

function normalizeLegacyValidatorImportQuotes(source: string): string {
  const normalizableSpecifiers = new Set([
    '../../validator-toolkit',
    './types',
    'typia',
  ]);
  const sourceFile = ts.createSourceFile(
    'validators.ts',
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  const moduleSpecifierRanges = sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(
      (moduleSpecifier): moduleSpecifier is ts.StringLiteral =>
        ts.isStringLiteral(moduleSpecifier) &&
        normalizableSpecifiers.has(moduleSpecifier.text) &&
        source[moduleSpecifier.getStart(sourceFile)] === '"',
    )
    .map((moduleSpecifier) => ({
      end: moduleSpecifier.getEnd(),
      replacement: `'${moduleSpecifier.text}'`,
      start: moduleSpecifier.getStart(sourceFile),
    }))
    .sort((left, right) => right.start - left.start);

  return moduleSpecifierRanges.reduce(
    (nextSource, range) =>
      nextSource.slice(0, range.start) +
      range.replacement +
      nextSource.slice(range.end),
    source,
  );
}

function upgradeLegacyCompoundValidatorSource(source: string): string {
  const lineEnding = detectSourceLineEnding(source);
  const typeNameMatch = source.match(LEGACY_TOOLKIT_CALL_PATTERN);
  const typeName = typeNameMatch?.groups?.typeName;
  if (!typeName) {
    throw new Error(
      'Unable to upgrade a legacy compound validator without a generated type import.',
    );
  }

  let nextSource = source;
  if (!hasTypiaImport(nextSource)) {
    nextSource = `import typia from 'typia';${lineEnding}${nextSource}`;
  }

  nextSource = replaceFirstNonCommentLine(
    nextSource,
    LEGACY_VALIDATOR_MANIFEST_IMPORT_PATTERN,
    "import currentManifest from './manifest-defaults-document';",
  );

  nextSource = nextSource.replace(
		LEGACY_TOOLKIT_CALL_PATTERN,
		[
			`createTemplateValidatorToolkit< ${typeName} >( {`,
			`\tassert: typia.createAssert< ${typeName} >(),`,
			`\tclone: typia.plain.createClone< ${typeName} >() as (`,
			`\t\tvalue: ${typeName},`,
			`\t) => ${typeName},`,
			`\tis: typia.createIs< ${typeName} >(),`,
		].join(lineEnding) + lineEnding,
	);

  const replacedManifest = nextSource.replace(
		LEGACY_MANIFEST_PATTERN,
		[
			'',
			'\tmanifest: currentManifest,',
			`\tprune: typia.plain.createPrune< ${typeName} >(),`,
			`\trandom: typia.createRandom< ${typeName} >() as (`,
			'\t\t...args: unknown[]',
			`\t) => ${typeName},`,
			`\tvalidate: typia.createValidate< ${typeName} >(),`,
		].join(lineEnding),
	);
  if (replacedManifest === nextSource) {
    throw new Error(
      'Unable to upgrade legacy compound validator: manifest anchor not found.',
    );
  }

  return normalizeLegacyValidatorImportQuotes(replacedManifest);
}

function renderLegacyManifestDefaultsWrapperSource(): string {
  return [
		"import rawCurrentManifest from './typia.manifest.json';",
		"import { defineManifestDefaultsDocument } from '@wp-typia/block-runtime/defaults';",
		'',
		'const currentManifest = defineManifestDefaultsDocument( rawCurrentManifest );',
		'',
		'export default currentManifest;',
		'',
	].join('\n');
}

async function ensureLegacyCompoundValidatorManifestDefaultsWrapper(
	validatorPath: string,
): Promise<void> {
  const validatorDir = path.dirname(validatorPath);
  const wrapperPath = path.join(validatorDir, 'manifest-defaults-document.ts');
  const manifestPath = path.join(validatorDir, 'typia.manifest.json');
  if (fs.existsSync(wrapperPath) || !fs.existsSync(manifestPath)) {
    return;
  }

  await fsp.writeFile(
    wrapperPath,
    renderLegacyManifestDefaultsWrapperSource(),
    'utf8',
  );
}

export async function collectLegacyCompoundValidatorPaths(
	projectDir: string,
): Promise<string[]> {
  const blocksDir = path.join(projectDir, 'src', 'blocks');
  if (!fs.existsSync(blocksDir)) {
    return [];
  }

  const blockEntries = await fsp.readdir(blocksDir, { withFileTypes: true });
  const validatorPaths = await Promise.all(
		blockEntries
			.filter((entry) => entry.isDirectory())
			.map(async (entry) => {
				const validatorPath = path.join(blocksDir, entry.name, 'validators.ts');
				const validatorSource = await readOptionalFile(validatorPath);
				return isLegacyCompoundValidatorSource(validatorSource)
					? validatorPath
					: null;
			}),
	);

  return validatorPaths.filter(
    (validatorPath): validatorPath is string => validatorPath !== null,
  );
}

export async function ensureCompoundWorkspaceSupportFiles(
	projectDir: string,
	tempProjectDir: string,
	legacyValidatorPaths: readonly string[],
): Promise<void> {
  for (const fileName of COMPOUND_SHARED_SUPPORT_FILES) {
    const sourcePath = path.join(tempProjectDir, 'src', fileName);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    const targetPath = path.join(projectDir, 'src', fileName);
    const currentSource = await readOptionalFile(targetPath);
    if (
			fileName === 'validator-toolkit.ts'
        ? shouldRefreshCompoundValidatorToolkit(currentSource)
        : currentSource === null
		) {
      await fsp.mkdir(path.dirname(targetPath), { recursive: true });
      await fsp.copyFile(sourcePath, targetPath);
    }
  }

  for (const validatorPath of legacyValidatorPaths) {
    const currentSource = await readOptionalFile(validatorPath);
    if (!isLegacyCompoundValidatorSource(currentSource)) {
      continue;
    }

    await ensureLegacyCompoundValidatorManifestDefaultsWrapper(validatorPath);
    await fsp.writeFile(
      validatorPath,
      upgradeLegacyCompoundValidatorSource(currentSource),
      'utf8',
    );
  }
}
