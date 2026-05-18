import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const routingMetadataFile = path.join(
  packageRoot,
  'bin',
  'routing-metadata.generated.js',
);
const routingMetadataTypesFile = path.join(
  packageRoot,
  'bin',
  'routing-metadata.generated.d.ts',
);
const commandOptionMetadataModulePath = path.join(
  packageRoot,
  'src',
  'command-option-metadata.ts',
);
const commandOptionMetadataSiblingModulePaths = [
  'index.ts',
  'types.ts',
  'add.ts',
  'create.ts',
  'doctor.ts',
  'global.ts',
  'init.ts',
  'mcp.ts',
  'migrate.ts',
  'skills.ts',
  'sync.ts',
  'templates.ts',
].map((fileName) =>
  path.join(packageRoot, 'src', 'command-options', fileName),
);
const commandRegistryModulePath = path.join(
  packageRoot,
  'src',
  'command-registry.ts',
);
const addKindIdsModulePath = path.join(packageRoot, 'src', 'add-kind-ids.ts');
const projectToolsAddKindIdsModulePath =
  process.env.WP_TYPIA_PROJECT_TOOLS_ADD_KIND_IDS_SOURCE ??
  path.join(
    packageRoot,
    '..',
    'wp-typia-project-tools',
    'src',
    'runtime',
    'add',
    'cli-add-kind-ids.ts',
  );
const checkOnly = process.argv.includes('--check');
const routingMetadataTempDirPrefix = 'routing-metadata-';
const routingMetadataTempParentDir = path.join(packageRoot, '.cache');

async function readOptionalUtf8(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }

    throw error;
  }
}

async function pruneStaleRoutingMetadataTempDirs() {
  let entries;
  try {
    entries = await fs.readdir(routingMetadataTempParentDir, {
      withFileTypes: true,
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return;
    }

    throw error;
  }

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name.startsWith(routingMetadataTempDirPrefix),
      )
      .map((entry) =>
        fs.rm(path.join(routingMetadataTempParentDir, entry.name), {
          force: true,
          recursive: true,
        }).catch(() => {
          // Stale temp cleanup is best-effort and should not block generation.
        }),
      ),
  );
}

function assertStringArray(value, label) {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'string')
  ) {
    throw new Error(`${label} must export ADD_KIND_IDS as a string array.`);
  }
}

async function resolveProjectToolsAddKindIdsExternalModule() {
  const source = await readOptionalUtf8(projectToolsAddKindIdsModulePath);
  if (source !== null) {
    return {
      modulePath: projectToolsAddKindIdsModulePath,
      source,
      specifier: '@wp-typia/project-tools/cli-add-kind-ids',
    };
  }

  const specifier = '@wp-typia/project-tools/cli-add-kind-ids';
  const namespace = await import(specifier);
  assertStringArray(namespace.ADD_KIND_IDS, specifier);

  return {
    modulePath: specifier,
    source: `export const ADD_KIND_IDS = ${JSON.stringify(
      namespace.ADD_KIND_IDS,
      null,
      2,
    )} as const;\n`,
    specifier,
  };
}

async function importTranspiledTypeScriptModule(
  modulePath,
  siblingModules = [],
  externalModules = [],
) {
  const [
    { default: ts },
    source,
    ...supportingSources
  ] = await Promise.all([
    import('typescript'),
    fs.readFile(modulePath, 'utf8'),
    ...siblingModules.map((siblingPath) => fs.readFile(siblingPath, 'utf8')),
    ...externalModules.map((externalModule) =>
      externalModule.source === undefined
        ? fs.readFile(externalModule.modulePath, 'utf8')
        : externalModule.source,
    ),
  ]);
  const siblingSources = supportingSources.slice(0, siblingModules.length);
  const externalSources = supportingSources.slice(siblingModules.length);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: modulePath,
  });
  await fs.mkdir(routingMetadataTempParentDir, { recursive: true });
  const tempDir = await fs.mkdtemp(
    path.join(routingMetadataTempParentDir, routingMetadataTempDirPrefix),
  );
  const tempFile = path.join(
    tempDir,
    path.basename(modulePath).replace(/\.ts$/u, '.js'),
  );
  const resolveSiblingTempFile = (siblingPath) =>
    path.join(
      tempDir,
      path
        .relative(path.dirname(modulePath), siblingPath)
        .replace(/\.ts$/u, '.js'),
    );

  await Promise.all([
    fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ type: 'commonjs' }),
      'utf8',
    ),
    fs.writeFile(tempFile, transpiled.outputText, 'utf8'),
    ...siblingModules.map(async (siblingPath, index) => {
      const siblingTempFile = resolveSiblingTempFile(siblingPath);

      await fs.mkdir(path.dirname(siblingTempFile), { recursive: true });
      await fs.writeFile(
        siblingTempFile,
        ts.transpileModule(siblingSources[index], {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
          },
          fileName: siblingPath,
        }).outputText,
        'utf8',
      );
    }),
    ...externalModules.map(async (externalModule, index) => {
      const parts = externalModule.specifier.split('/');
      const packageName = externalModule.specifier.startsWith('@')
        ? parts.slice(0, 2).join('/')
        : parts[0];
      const subpathParts = externalModule.specifier.startsWith('@')
        ? parts.slice(2)
        : parts.slice(1);
      const packageDir = path.join(
        tempDir,
        'node_modules',
        ...packageName.split('/'),
      );
      const moduleFile = path.join(
        packageDir,
        ...subpathParts.slice(0, -1),
        `${subpathParts[subpathParts.length - 1]}.js`,
      );

      await fs.mkdir(path.dirname(moduleFile), { recursive: true });
      await Promise.all([
        fs.writeFile(
          path.join(packageDir, 'package.json'),
          JSON.stringify({ type: 'commonjs' }),
          'utf8',
        ),
        fs.writeFile(
          moduleFile,
          ts.transpileModule(externalSources[index], {
            compilerOptions: {
              module: ts.ModuleKind.CommonJS,
              target: ts.ScriptTarget.ES2020,
            },
            fileName: externalModule.modulePath,
          }).outputText,
          'utf8',
        ),
      ]);
    }),
  ]);
  try {
    return require(tempFile);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

function renderRoutingMetadataFiles({
  longValueOptions,
  reservedCommands,
  shortValueOptions,
}) {
  const renderStringArray = (values) => {
    if (values.length === 0) {
      return '[]';
    }

    if (values.length <= 3 && values.every((value) => value.length <= 4)) {
      return `[${values.map((value) => `'${value}'`).join(', ')}]`;
    }

    return `[\n${values.map((value) => `  '${value}',`).join('\n')}\n]`;
  };
const fileContents = `// This file was automatically generated by \`node scripts/generate-routing-metadata.mjs\`.
// Do not edit directly.

export const longValueOptions = Object.freeze(${renderStringArray(
    longValueOptions,
  )});
export const reservedCommands = Object.freeze(${renderStringArray(
    reservedCommands,
  )});
export const shortValueOptions = Object.freeze(${renderStringArray(
    shortValueOptions,
  )});
`;
  const declarationContents = `// This file was automatically generated by \`node scripts/generate-routing-metadata.mjs\`.
// Do not edit directly.

export declare const longValueOptions: readonly string[];
export declare const reservedCommands: readonly string[];
export declare const shortValueOptions: readonly string[];
`;

  return {
    declarationContents,
    fileContents,
  };
}

function failCheck(pathname) {
  console.error(
    `Routing metadata is out of date: ${path.relative(packageRoot, pathname)}. Run \`node scripts/generate-routing-metadata.mjs\` and commit the generated files.`,
  );
  process.exit(1);
}

await pruneStaleRoutingMetadataTempDirs();

const [
  { COMMAND_ROUTING_METADATA },
  projectToolsAddKindIdsExternalModule,
] = await Promise.all([
  importTranspiledTypeScriptModule(
    commandOptionMetadataModulePath,
    commandOptionMetadataSiblingModulePaths,
  ),
  resolveProjectToolsAddKindIdsExternalModule(),
]);

const {
  WP_TYPIA_RESERVED_TOP_LEVEL_COMMAND_NAMES: reservedCommandNames,
} = await importTranspiledTypeScriptModule(
  commandRegistryModulePath,
  [addKindIdsModulePath],
  [projectToolsAddKindIdsExternalModule],
);

const renderedFiles = renderRoutingMetadataFiles({
  longValueOptions: COMMAND_ROUTING_METADATA.longValueOptions,
  reservedCommands: Array.from(reservedCommandNames),
  shortValueOptions: COMMAND_ROUTING_METADATA.shortValueOptions,
});

if (checkOnly) {
  const currentFiles = await Promise.all([
    fs.readFile(routingMetadataFile, 'utf8').catch(() => ''),
    fs.readFile(routingMetadataTypesFile, 'utf8').catch(() => ''),
  ]);

  if (currentFiles[0] !== renderedFiles.fileContents) {
    failCheck(routingMetadataFile);
  }

  if (currentFiles[1] !== renderedFiles.declarationContents) {
    failCheck(routingMetadataTypesFile);
  }

  process.exit(0);
}

await Promise.all([
  fs.writeFile(routingMetadataFile, renderedFiles.fileContents, 'utf8'),
  fs.writeFile(
    routingMetadataTypesFile,
    renderedFiles.declarationContents,
    'utf8',
  ),
]);
