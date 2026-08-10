import path from 'node:path';

import {
  findPhpFunctionRange,
  hasPhpLiteralDirectoryInclude,
  replacePhpFunctionDefinition,
} from '../shared/php-utils.js';

function normalizeGeneratedPhp(source: string): string {
  let normalized = '';
  let quote = '';
  let index = 0;
  while (index < source.length) {
    const character = source[index] ?? '';
    if (quote) {
      normalized += character;
      if (character === '\\') {
        normalized += source[index + 1] ?? '';
        index += 2;
        continue;
      }
      if (character === quote) {
        quote = '';
      }
      index += 1;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      normalized += character;
      index += 1;
      continue;
    }
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    normalized += character;
    index += 1;
  }
  return normalized;
}

/** Compare generated PHP while allowing formatting-only whitespace changes. */
export function isEquivalentGeneratedPhp(
  source: string,
  expected: string,
): boolean {
  return normalizeGeneratedPhp(source) === normalizeGeneratedPhp(expected);
}

/** Build the historical wp-typia glob loader for safe migration matching. */
export function buildLegacyGeneratedGlobLoader(options: {
  functionName: string;
  globPath: string;
  includeKind: 'require' | 'require_once';
  moduleVariable: string;
}): string {
  return `function ${options.functionName}() {
\tforeach ( glob( __DIR__ . '${options.globPath}' ) ?: array() as $${options.moduleVariable} ) {
\t\t${options.includeKind} $${options.moduleVariable};
\t}
}`;
}

/** Build a historical loader that assigned one or more globs before loading. */
export function buildLegacyGeneratedGlobArrayLoader(options: {
  functionName: string;
  globPaths: readonly string[];
  includeKind: 'require' | 'require_once';
  moduleVariable: string;
  modulesVariable: string;
}): string {
  const globExpressions = options.globPaths.map(
    (globPath) => `glob( __DIR__ . '${globPath}' ) ?: array()`,
  );
  const assignment = globExpressions.length === 1
    ? `$${options.modulesVariable} = ${globExpressions[0]};`
    : [
        `$${options.modulesVariable} = array_merge(`,
        ...globExpressions.map(
          (expression, index) =>
            `\t${expression}${index < globExpressions.length - 1 ? ',' : ''}`,
        ),
        ');',
      ].join('\n\t');
  return `function ${options.functionName}() {
\t${assignment}
\tforeach ( $${options.modulesVariable} as $${options.moduleVariable} ) {
\t\t${options.includeKind} $${options.moduleVariable};
\t}
}`;
}

/** Reconstruct the former generated `$asset_path` include shape. */
export function buildLegacyGeneratedVariableAssetEnqueue(options: {
  assetPath: string;
  currentFunction: string;
  scriptPath: string;
}): string {
  return options.currentFunction
    .replace(
      `\t$script_path = __DIR__ . '/${options.scriptPath}';\n`,
      `\t$script_path = __DIR__ . '/${options.scriptPath}';\n\t$asset_path  = __DIR__ . '/${options.assetPath}';\n`,
    )
    .replace(
      `file_exists( __DIR__ . '/${options.assetPath}' )`,
      'file_exists( $asset_path )',
    )
    .replace(
      `require __DIR__ . '/${options.assetPath}'`,
      'require $asset_path',
    );
}

/** Build the generated and historical REST schema helper loader shapes. */
export function buildRestSchemaHelperCompatibilityFunctions(options: {
  functionName: string;
  helperPath: string;
}): {
  currentFunctions: string[];
  legacyFunctions: string[];
  replacement: string;
} {
  const directFunction = `function ${options.functionName}() {
\tif ( is_readable( __DIR__ . '${options.helperPath}' ) ) {
\t\trequire_once __DIR__ . '${options.helperPath}';
\t}
}`;
  const generatedTemplateFunction = `function ${options.functionName}() {
\t$helper_path = __DIR__ . '${options.helperPath}';
\tif ( is_readable( $helper_path ) ) {
\t\trequire_once __DIR__ . '${options.helperPath}';
\t}
}`;
  const legacyFunction = `function ${options.functionName}() {
\t$helper_path = __DIR__ . '${options.helperPath}';
\tif ( is_readable( $helper_path ) ) {
\t\trequire_once $helper_path;
\t}
}`;
  return {
    currentFunctions: [directFunction, generatedTemplateFunction],
    legacyFunctions: [legacyFunction],
    replacement: `\n\n${directFunction}\n`,
  };
}

type GeneratedPhpFunctionMigrationOptions = {
  bootstrapPath: string;
  functionName: string;
  isCurrent?: (functionSource: string) => boolean;
  legacyFunctions: readonly string[];
  mismatchMessage: string;
  replacement: string;
  source: string;
};

function applyGeneratedPhpFunctionMigration(
  options: GeneratedPhpFunctionMigrationOptions,
): string {
  const functionRange = findPhpFunctionRange(
    options.source,
    options.functionName,
  );
  if (!functionRange) {
    throw new Error(
      `Unable to parse ${options.functionName}() in ${path.basename(options.bootstrapPath)}.`,
    );
  }
  if (options.isCurrent?.(functionRange.source)) {
    return options.source;
  }
  if (!options.legacyFunctions.some((legacyFunction) =>
    isEquivalentGeneratedPhp(functionRange.source, legacyFunction),
  )) {
    throw new Error(options.mismatchMessage);
  }
  const replacedSource = replacePhpFunctionDefinition(
    options.source,
    options.functionName,
    options.replacement,
    { trimReplacementStart: true },
  );
  if (!replacedSource) {
    throw new Error(
      `Unable to repair ${path.basename(options.bootstrapPath)} for ${options.functionName}.`,
    );
  }
  return replacedSource;
}

/** Replace a function only when its current body is a known generated shape. */
export function replaceLegacyGeneratedPhpFunction(options: {
  bootstrapPath: string;
  functionName: string;
  legacyFunctions: readonly string[];
  replacement: string;
  source: string;
}): string {
  return applyGeneratedPhpFunctionMigration({
    ...options,
    mismatchMessage:
      `Unable to migrate customized ${options.functionName}() in ${path.basename(options.bootstrapPath)}. Preserve the custom function and wire the generated assets manually.`,
  });
}

/**
 * Replace a generated legacy loader with a literal manifest include.
 * Customized functions are never overwritten.
 */
export function migrateGeneratedPhpLoaderFunction(options: {
  bootstrapPath: string;
  functionName: string;
  legacyFunctions: readonly string[];
  manifestPath: string;
  replacement: string;
  source: string;
}): string {
  return applyGeneratedPhpFunctionMigration({
    ...options,
    isCurrent: (functionSource) => hasPhpLiteralDirectoryInclude(
      functionSource,
      options.manifestPath,
    ),
    mismatchMessage:
      `Unable to migrate customized ${options.functionName}() in ${path.basename(options.bootstrapPath)}. Restore the generated loader or wire ${options.manifestPath} manually.`,
  });
}
