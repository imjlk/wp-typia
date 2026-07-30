import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from '@typescript/typescript6';

/**
 * Hold shared compiler state for metadata parsing and symbol resolution.
 *
 * @category Types
 */
export interface AnalysisContext {
  allowedExternalPackages: Set<string>;
  checker: ts.TypeChecker;
  /**
   * Maximum number of times a single recursive type declaration is unrolled
   * before the parser emits a terminal leaf node.
   */
  maxRecursiveDepth: number;
  packageNameCache: Map<string, string | null>;
  projectRoot: string;
  program: ts.Program;
  /**
   * Tracks the current unrolling depth per recursive type declaration key
   * (`${fileName}:${typeName}`). Replaces the former hard-throw presence set.
   */
  recursionDepth: Map<string, number>;
}

interface AnalysisProgramInputs {
  compilerOptions: ts.CompilerOptions;
  configPath: string | null;
  rootNames: string[];
  structureKey: string;
  typiaTagsAugmentationPath: string | null;
}

interface AnalysisProgramCacheEntry {
  checker: ts.TypeChecker;
  dependencyFingerprint: string;
  dependencyPaths: string[];
  program: ts.Program;
}

class LruCache<Key, Value> {
  private readonly entries = new Map<Key, Value>();

  constructor(private readonly maxEntries: number) {}

  get(key: Key): Value | undefined {
    const value = this.entries.get(key);
    if (value === undefined) {
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: Key, value: Value): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    this.entries.set(key, value);
    if (this.entries.size <= this.maxEntries) {
      return;
    }

    const oldestKey = this.entries.keys().next().value;
    if (oldestKey !== undefined) {
      this.entries.delete(oldestKey);
    }
  }
}

const DEFAULT_ALLOWED_EXTERNAL_PACKAGES = ['@wp-typia/block-types'] as const;
const ANALYSIS_PROGRAM_CACHE_MAX_ENTRIES = 20;
/**
 * Default maximum depth to which a recursive type declaration is unrolled
 * before the parser emits a terminal leaf node. Covers typical WordPress
 * block tree structures (nested menus, repeater fields, taxonomies).
 */
const DEFAULT_MAX_RECURSIVE_DEPTH = 5;
const TYPESCRIPT_LIB_DIRECTORY = path.dirname(ts.getDefaultLibFilePath({}));
const RUNTIME_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SYNC_BLOCK_METADATA_FAILURE_CODE = Symbol(
  'sync-block-metadata-failure-code',
);

const analysisProgramCache = new LruCache<string, AnalysisProgramCacheEntry>(
  ANALYSIS_PROGRAM_CACHE_MAX_ENTRIES,
);

type TaggedMetadataAnalysisError = Error & {
  [SYNC_BLOCK_METADATA_FAILURE_CODE]?: 'typescript-diagnostic';
};

function tagMetadataDiagnosticError(error: Error): Error {
  (
		error as TaggedMetadataAnalysisError
	)[SYNC_BLOCK_METADATA_FAILURE_CODE] = 'typescript-diagnostic';
  return error;
}

/**
 * Read the failure code attached to one tagged metadata analysis error.
 *
 * @param error Error returned from metadata analysis or TypeScript diagnostics.
 * @returns The tagged failure code when the error originated from TypeScript diagnostics.
 * @category Schema
 */
export function getTaggedSyncBlockMetadataFailureCode(
	error: Error,
): 'typescript-diagnostic' | undefined {
  return (error as TaggedMetadataAnalysisError)[SYNC_BLOCK_METADATA_FAILURE_CODE];
}

function isProjectLocalSourceFile(
	filePath: string,
	projectRoot: string,
): boolean {
  if (filePath.startsWith(TYPESCRIPT_LIB_DIRECTORY)) {
    return false;
  }
  if (filePath.includes(`${path.sep}node_modules${path.sep}`)) {
    return false;
  }

  return !path.relative(projectRoot, filePath).startsWith('..');
}

function collectSourceFileModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const moduleSpecifiers: string[] = [];

  for (const statement of sourceFile.statements) {
    if (
			(ts.isImportDeclaration(statement) ||
				ts.isExportDeclaration(statement)) &&
			statement.moduleSpecifier &&
			ts.isStringLiteralLike(statement.moduleSpecifier)
		) {
      moduleSpecifiers.push(statement.moduleSpecifier.text);
    }
  }

  ts.forEachChild(sourceFile, (node) => {
		if (
			ts.isImportTypeNode(node) &&
			ts.isLiteralTypeNode(node.argument) &&
			ts.isStringLiteral(node.argument.literal)
		) {
			moduleSpecifiers.push(node.argument.literal.text);
		}
	});

  return moduleSpecifiers;
}

function collectReferencedLocalSourceFiles(
	program: ts.Program,
	entryFilePath: string,
	compilerOptions: ts.CompilerOptions,
	projectRoot: string,
): Set<string> {
  const visited = new Set<string>();
  const queue = [entryFilePath];

  while (queue.length > 0) {
    const filePath = queue.pop();
    if (
			filePath === undefined ||
			visited.has(filePath) ||
			!isProjectLocalSourceFile(filePath, projectRoot)
		) {
      continue;
    }

    visited.add(filePath);
    const sourceFile = program.getSourceFile(filePath);
    if (sourceFile === undefined) {
      continue;
    }

    for (const moduleSpecifier of collectSourceFileModuleSpecifiers(
      sourceFile,
    )) {
      const resolved = ts.resolveModuleName(
        moduleSpecifier,
        filePath,
        compilerOptions,
        ts.sys,
      ).resolvedModule;
      const resolvedFileName = resolved?.resolvedFileName;
      if (
				resolvedFileName &&
				isProjectLocalSourceFile(resolvedFileName, projectRoot)
			) {
        queue.push(resolvedFileName);
      }
    }
  }

  return visited;
}

function stableSerializeAnalysisValue(value: unknown): string {
  if (value === undefined) {
    return '"__undefined__"';
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeAnalysisValue(entry)).join(',')}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(
			([key, entry]) =>
				`${JSON.stringify(key)}:${stableSerializeAnalysisValue(entry)}`,
		)
		.join(',')}}`;
}

function buildAnalysisProgramStructureKey(
	projectRoot: string,
	typesFilePath: string,
	{
		compilerOptions,
		configPath,
		rootNames,
		typiaTagsAugmentationPath,
	}: {
		compilerOptions: ts.CompilerOptions;
		configPath: string | null;
		rootNames: string[];
		typiaTagsAugmentationPath: string | null;
	},
): string {
  return stableSerializeAnalysisValue({
    compilerOptions,
    configPath,
    projectRoot,
    rootNames: [...rootNames].sort(),
    typiaTagsAugmentationPath,
    typesFilePath,
  });
}

function createAnalysisProgramContentFingerprint(
	filePaths: string[],
	onMissingFile: 'hash-missing' | 'return-null' | 'throw' = 'throw',
): string | null {
  const hash = createHash('sha1');
  const fingerprintPaths = [...new Set(filePaths)].sort();

  for (const filePath of fingerprintPaths) {
    const fileContents = ts.sys.readFile(filePath);
    if (fileContents === undefined) {
      if (onMissingFile === 'return-null') {
        return null;
      }
      if (onMissingFile === 'hash-missing') {
        hash.update(filePath);
        hash.update('\0');
        hash.update('__missing__');
        hash.update('\0');
        continue;
      }

      throw new Error(
        `Unable to read metadata analysis dependency: ${filePath}`,
      );
    }

    hash.update(filePath);
    hash.update('\0');
    hash.update(fileContents);
    hash.update('\0');
  }

  return hash.digest('hex');
}

function getAnalysisProgramDependencyPaths(
	program: ts.Program,
	configPath: string | null,
): string[] {
  const sourceFilePaths = program
		.getSourceFiles()
		.map((sourceFile) => sourceFile.fileName)
		.filter((filePath) => !filePath.startsWith(TYPESCRIPT_LIB_DIRECTORY));
  const dependencyPaths = new Set(sourceFilePaths);

  for (const filePath of sourceFilePaths) {
    let currentDir = path.dirname(filePath);
    while (true) {
      dependencyPaths.add(path.join(currentDir, 'package.json'));

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
    }
  }

  if (configPath) {
    dependencyPaths.add(configPath);
  }

  return [...dependencyPaths].sort();
}

function resolveAnalysisProgramInputs(
	projectRoot: string,
	typesFilePath: string,
): AnalysisProgramInputs {
  const configPath = ts.findConfigFile(
    projectRoot,
    ts.sys.fileExists,
    'tsconfig.json',
  );
  const compilerOptions: ts.CompilerOptions = {
    allowJs: false,
    esModuleInterop: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    resolveJsonModule: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
  };

  let rootNames = [typesFilePath];
  const typiaTagsAugmentationPath = resolveTypiaTagsAugmentationPath();

  if (configPath !== undefined) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      throw formatDiagnosticError(configFile.error);
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath),
      compilerOptions,
      configPath,
    );

    if (parsed.errors.length > 0) {
      throw formatDiagnosticError(parsed.errors[0]);
    }

    rootNames = parsed.fileNames.includes(typesFilePath)
      ? parsed.fileNames
      : [...parsed.fileNames, typesFilePath];
    if (
			typiaTagsAugmentationPath &&
			!rootNames.includes(typiaTagsAugmentationPath)
		) {
      rootNames = [...rootNames, typiaTagsAugmentationPath];
    }
    Object.assign(compilerOptions, parsed.options);
  } else if (typiaTagsAugmentationPath) {
    rootNames = [...rootNames, typiaTagsAugmentationPath];
  }

  const structureKey = buildAnalysisProgramStructureKey(
    projectRoot,
    typesFilePath,
    {
      compilerOptions,
      configPath: configPath ?? null,
      rootNames,
      typiaTagsAugmentationPath,
    },
  );

  return {
    compilerOptions,
    configPath: configPath ?? null,
    rootNames,
    structureKey,
    typiaTagsAugmentationPath,
  };
}

/**
 * Create or reuse the compiler analysis context for one metadata source file.
 *
 * @param projectRoot Project root used for module resolution and dependency tracking.
 * @param typesFilePath Absolute path to the source types file being analyzed.
 * @param maxRecursiveDepth Maximum depth to unroll recursive type declarations.
 * @returns An analysis context containing the TypeScript program, checker, and recursion guards.
 * @category Schema
 */
export function createAnalysisContext(
  projectRoot: string,
  typesFilePath: string,
  maxRecursiveDepth: number = DEFAULT_MAX_RECURSIVE_DEPTH,
): AnalysisContext {
  if (!Number.isInteger(maxRecursiveDepth) || maxRecursiveDepth < 1) {
    throw new Error(
      `maxRecursiveDepth must be a positive integer, got ${maxRecursiveDepth}`,
    );
  }
  const analysisInputs = resolveAnalysisProgramInputs(
    projectRoot,
    typesFilePath,
  );
  const cachedAnalysis = analysisProgramCache.get(analysisInputs.structureKey);
  if (cachedAnalysis) {
    const currentDependencyFingerprint = createAnalysisProgramContentFingerprint(
      cachedAnalysis.dependencyPaths,
      'hash-missing',
    );
    if (
			currentDependencyFingerprint !== null &&
			currentDependencyFingerprint === cachedAnalysis.dependencyFingerprint
		) {
      return {
        allowedExternalPackages: new Set(DEFAULT_ALLOWED_EXTERNAL_PACKAGES),
        checker: cachedAnalysis.checker,
        maxRecursiveDepth,
        packageNameCache: new Map(),
        projectRoot,
        program: cachedAnalysis.program,
        recursionDepth: new Map<string, number>(),
      };
    }
  }

  const program = ts.createProgram({
    oldProgram: cachedAnalysis?.program,
    options: analysisInputs.compilerOptions,
    rootNames: analysisInputs.rootNames,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const localSourceFiles = collectReferencedLocalSourceFiles(
    program,
    typesFilePath,
    analysisInputs.compilerOptions,
    projectRoot,
  );
  const blockingDiagnostic = diagnostics.find(
		(diagnostic) =>
			diagnostic.category === ts.DiagnosticCategory.Error &&
			diagnostic.file !== undefined &&
			localSourceFiles.has(diagnostic.file.fileName),
	);
  if (blockingDiagnostic) {
    throw formatDiagnosticError(blockingDiagnostic);
  }

  const checker = program.getTypeChecker();
  const dependencyPaths = getAnalysisProgramDependencyPaths(
    program,
    analysisInputs.configPath,
  );
  const dependencyFingerprint = createAnalysisProgramContentFingerprint(
    dependencyPaths,
    'hash-missing',
  );
  if (dependencyFingerprint === null) {
    throw new Error('Unable to fingerprint metadata analysis dependencies.');
  }

  analysisProgramCache.set(analysisInputs.structureKey, {
    checker,
    dependencyFingerprint,
    dependencyPaths,
    program,
  });

  return {
    allowedExternalPackages: new Set(DEFAULT_ALLOWED_EXTERNAL_PACKAGES),
    checker,
    maxRecursiveDepth,
    packageNameCache: new Map(),
    projectRoot,
    program,
    recursionDepth: new Map<string, number>(),
  };
}

function resolveTypiaTagsAugmentationPath(): string | null {
  const candidates = [
    path.join(RUNTIME_DIRECTORY, 'typia-tags.d.ts'),
    path.join(RUNTIME_DIRECTORY, 'typia-tags.ts'),
  ];

  for (const candidate of candidates) {
    if (ts.sys.fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function formatDiagnosticError(diagnostic: ts.Diagnostic): Error {
  return tagMetadataDiagnosticError(
    new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
  );
}
