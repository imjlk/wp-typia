import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { runUtf8Command } from '../../../../tests/helpers/process-utils';
import {
  writeJsonFile,
  writeTextFile,
} from '../../../../tests/helpers/file-fixtures';

export const packageRoot = resolvePackageRoot();
export const entryPath = resolveCliEntryPath();
export const repoTtscPath = resolveRepoTtscBinary();
export const repoTtsxPath = resolveRepoTtsxBinary();
export const repoTypeScriptPath = resolveRepoTypeScriptPackage();
const repoRoot = path.resolve(packageRoot, '../..');
const repoToolchainVersions = readRepoToolchainVersions(repoRoot);

export function runCli(
	command: string,
	args: string[],
	options: Parameters<typeof runUtf8Command>[2] = {},
) {
  return runUtf8Command(command, args, options);
}

export function writeFile(filePath: string, contents: string) {
  writeTextFile(filePath, contents);
}

export function writeJson(filePath: string, value: unknown) {
  writeJsonFile(filePath, value, '\t');
}

export function resolveRepoTtsxBinary() {
  const bunTtsxCandidates = [packageRoot, path.resolve(packageRoot, '../..')].flatMap(
    (rootPath) => {
      const bunDirectory = path.resolve(rootPath, 'node_modules', '.bun');
      if (!fs.existsSync(bunDirectory)) {
        return [];
      }

      const bunTtsxEntry = fs.readdirSync(bunDirectory).find((entry) =>
        entry.startsWith('ttsc@'),
      );
      return bunTtsxEntry
        ? [
            path.resolve(
              bunDirectory,
              bunTtsxEntry,
              'node_modules',
              '.bin',
              'ttsx',
            ),
          ]
        : [];
    },
  );

  const candidates = [
    path.resolve(packageRoot, 'node_modules/.bin/ttsx'),
    ...bunTtsxCandidates,
    path.resolve(packageRoot, '../../node_modules/.bin/ttsx'),
  ];

  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) {
    throw new Error(
      'Unable to locate a repo ttsx binary for migration verification tests.',
    );
  }

  return resolved;
}

export function resolveRepoTtscBinary() {
  const candidates = [
    path.resolve(packageRoot, 'node_modules/.bin/ttsc'),
    path.resolve(packageRoot, '../../node_modules/.bin/ttsc'),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) {
    throw new Error(
      'Unable to locate a repo ttsc binary for migration verification tests.',
    );
  }

  return resolved;
}

export function resolveRepoTypeScriptPackage() {
  const candidates = [
    path.resolve(packageRoot, 'node_modules/typescript'),
    path.resolve(packageRoot, '../../node_modules/typescript'),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) {
    throw new Error(
      'Unable to locate the repo TypeScript package for migration verification tests.',
    );
  }

  return fs.realpathSync(resolved);
}

export function resolvePackageRoot() {
  const cwd = process.cwd();
  const directPackageRoot = path.join(cwd, 'package.json');
  if (
    fs.existsSync(directPackageRoot) &&
    fs.existsSync(path.join(cwd, 'src', 'runtime'))
  ) {
    return cwd;
  }

  const nestedPackageRoot = path.join(
    cwd,
    'packages',
    'wp-typia-project-tools',
  );
  if (
    fs.existsSync(path.join(nestedPackageRoot, 'package.json')) &&
    fs.existsSync(path.join(nestedPackageRoot, 'src', 'runtime'))
  ) {
    return nestedPackageRoot;
  }

  throw new Error(
    'Unable to resolve the @wp-typia/project-tools package root for migration tests.',
  );
}

export function resolveCliEntryPath() {
  const cliPath = path.resolve(
    packageRoot,
    '..',
    'wp-typia',
    'bin',
    'wp-typia.js',
  );
  const createRuntimeIndexPath = path.join(
    packageRoot,
    'dist',
    'runtime',
    'index.js',
  );
  if (fs.existsSync(cliPath) && fs.existsSync(createRuntimeIndexPath)) {
    return cliPath;
  }

  execFileSync('bun', ['run', 'build'], {
    cwd: packageRoot,
    stdio: 'inherit',
  });

  if (!fs.existsSync(cliPath) || !fs.existsSync(createRuntimeIndexPath)) {
    throw new Error(
      'Unable to resolve the canonical wp-typia bin for migration tests.',
    );
  }

  return cliPath;
}

export function createProjectShell(projectDir: string) {
  writeJson(path.join(projectDir, 'package.json'), {
    name: 'migration-smoke',
    packageManager: 'bun@1.3.11',
    private: true,
    scripts: {},
    type: 'module',
    version: '0.1.0',
  });
  installMigrationCompilerFixture(projectDir);
  writeFile(
    path.join(projectDir, 'src', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.content ?? null;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'types.ts'),
    `export interface MigrationAttributes {\n\tcontent: string;\n\tisVisible?: boolean;\n}\n`,
  );
}

export function installMigrationCompilerFixture(projectDir: string) {
  writeFile(
    path.join(projectDir, 'lint.config.ts'),
    `export default {
  format: {
    severity: 'error',
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    endOfLine: 'lf',
  },
  rules: {
    'no-var': 'error',
    'prefer-const': 'error',
    eqeqeq: 'error',
  },
};
`,
  );
  writeJson(path.join(projectDir, 'tsconfig.json'), {
    compilerOptions: {
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      isolatedModules: true,
      jsx: 'react-jsx',
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      noEmit: true,
      resolveJsonModule: true,
      rootDir: '.',
      skipLibCheck: true,
      strict: true,
      target: 'ES2020',
      types: ['node'],
    },
    include: ['src/**/*'],
  });

  const nodeModulesDir = path.join(projectDir, 'node_modules');
  fs.mkdirSync(nodeModulesDir, { recursive: true });

  const packageLinks = [
    {
      source: path.join(repoRoot, 'node_modules', '@ttsc', 'lint'),
      target: path.join(nodeModulesDir, '@ttsc', 'lint'),
    },
    {
      source: repoTypeScriptPath,
      target: path.join(nodeModulesDir, 'typescript'),
    },
    {
      source: path.join(repoRoot, 'node_modules', '@types', 'node'),
      target: path.join(nodeModulesDir, '@types', 'node'),
    },
    {
      source: path.join(repoRoot, 'packages', 'wp-typia-block-runtime'),
      target: path.join(nodeModulesDir, '@wp-typia', 'block-runtime'),
    },
    {
      source: path.join(repoRoot, 'packages', 'wp-typia-block-types'),
      target: path.join(nodeModulesDir, '@wp-typia', 'block-types'),
    },
  ] as const;

  for (const { source, target } of packageLinks) {
    if (!fs.existsSync(source)) {
      throw new Error(
        `Migration fixture dependency is missing at ${source}. Run the repository install before executing migration tests.`,
      );
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) {
      fs.symlinkSync(fs.realpathSync(source), target, 'junction');
    }
  }
}

const DEFAULT_MIGRATION_FIXTURE_FORMAT_INPUTS = [
  'src/save.tsx',
  'src/types.ts',
  'src/validators.ts',
  'src/blocks/**/save.tsx',
  'src/blocks/**/types.ts',
  'src/blocks/**/validators.ts',
  'src/migrations/config.ts',
  'src/migrations/helpers.ts',
  'src/migrations/versions/**/save.tsx',
];

function readRepoToolchainVersions(repoRoot: string) {
  const manifestPath = path.join(repoRoot, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const getVersion = (packageName: string): string => {
    const version =
      manifest.devDependencies?.[packageName] ??
      manifest.dependencies?.[packageName];
    if (!version) {
      throw new Error(
        `Repository package.json must declare ${packageName} for migration fixture verification.`,
      );
    }
    if (!/^\d+\.\d+\.\d+$/u.test(version)) {
      throw new Error(
        `Repository package.json must declare an exact stable version for ${packageName}, found ${JSON.stringify(version)}.`,
      );
    }
    return version;
  };

  return {
    ttsc: getVersion('ttsc'),
    ttscLint: getVersion('@ttsc/lint'),
    typescript: getVersion('typescript'),
  };
}

function runMigrationTtsc(
  projectDir: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): void {
  try {
    execFileSync(repoTtscPath, args, {
      cwd: projectDir,
      encoding: 'utf8',
      env,
      stdio: 'pipe',
    });
  } catch (error) {
    const commandError =
      error && typeof error === 'object'
        ? (error as { stderr?: unknown; stdout?: unknown })
        : {};
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `ttsc ${args.join(' ')} failed in ${projectDir}: ${detail}`,
        `stdout:\n${String(commandError.stdout ?? '').trimEnd()}`,
        `stderr:\n${String(commandError.stderr ?? '').trimEnd()}`,
      ].join('\n'),
    );
  }
}

export function typecheckMigrationProject(
  projectDir: string,
  {
    checkInputs,
    formatInputs = DEFAULT_MIGRATION_FIXTURE_FORMAT_INPUTS,
  }: {
    checkInputs?: string[];
    formatInputs?: string[];
  } = {},
) {
  const packageJsonPath = path.join(projectDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    devDependencies?: Record<string, string>;
  };
  writeJson(packageJsonPath, {
    ...packageJson,
    devDependencies: {
      ...packageJson.devDependencies,
      '@ttsc/lint': repoToolchainVersions.ttscLint,
      ttsc: repoToolchainVersions.ttsc,
      typescript: repoToolchainVersions.typescript,
    },
  });

  const ttscCacheDir =
    process.env.TTSC_CACHE_DIR ??
    path.join(repoRoot, 'node_modules', '.cache', 'ttsc');
  fs.mkdirSync(ttscCacheDir, { recursive: true });
  const env = {
    ...process.env,
    TTSC_CACHE_DIR: ttscCacheDir,
  };
  if (formatInputs.length > 0) {
    const formatConfigPath = path.join(
      projectDir,
      'tsconfig.fixture-format.json',
    );
    writeJson(formatConfigPath, {
      extends: './tsconfig.json',
      include: formatInputs,
    });
    runMigrationTtsc(
      projectDir,
      ['format', '--project', formatConfigPath, '--singleThreaded'],
      env,
    );
  }

  let checkConfigPath: string | undefined;
  if (checkInputs && checkInputs.length > 0) {
    checkConfigPath = path.join(projectDir, 'tsconfig.migration-check.json');
    writeJson(checkConfigPath, {
      extends: './tsconfig.json',
      include: checkInputs,
    });
  }
  const checkArgs = ['--noEmit', '--singleThreaded'];
  if (checkConfigPath) {
    checkArgs.push('--project', checkConfigPath);
  }
  runMigrationTtsc(projectDir, checkArgs, env);
}

export function createMigrationTempRoot(prefix = 'wp-typia-migrations-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanupMigrationTempRoot(tempRoot: string) {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
