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
export const repoTtsxPath = resolveRepoTtsxBinary();

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
  writeFile(
    path.join(projectDir, 'src', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.content ?? null;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'types.ts'),
    `export interface MigrationAttributes {\n\tcontent: string;\n\tisVisible?: boolean;\n}\n`,
  );
}

export function createMigrationTempRoot(prefix = 'wp-typia-migrations-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanupMigrationTempRoot(tempRoot: string) {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
