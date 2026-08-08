import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { packageRoot } from './scaffold-test-paths.js';
import {
  ensureDirSymlink,
  ensureFileSymlink,
  runCli,
} from './scaffold-test-runtime.js';

const workspaceNodeModulesPath = path.resolve(
  packageRoot,
  '..',
  '..',
  'node_modules',
);
const workspaceBunNodeModulesPath = path.join(
  workspaceNodeModulesPath,
  '.bun',
  'node_modules',
);

const workspacePackagePaths = {
  '@wp-typia/api-client': path.resolve(packageRoot, '..', 'wp-typia-api-client'),
  '@wp-typia/block-runtime': path.resolve(
    packageRoot,
    '..',
    'wp-typia-block-runtime',
  ),
  '@wp-typia/block-types': path.resolve(
    packageRoot,
    '..',
    'wp-typia-block-types',
  ),
  '@wp-typia/dataviews': path.resolve(packageRoot, '..', 'wp-typia-dataviews'),
  '@wp-typia/project-tools': packageRoot,
  '@wp-typia/rest': path.resolve(packageRoot, '..', 'wp-typia-rest'),
  '@wp-typia/ttsc-lint-plugin-wp': path.resolve(
    packageRoot,
    '..',
    'ttsc-lint-plugin-wp',
  ),
} as const;

const generatedProjectTypecheckSupportPackages = [
  'react',
  'react-dom',
  '@types/react',
  '@types/react-dom',
] as const;

const builtWorkspacePackages = new Set<string>();
const buildLockRoot = path.join(
  os.tmpdir(),
  'wp-typia-project-tools-build-locks',
);

interface WorkspaceBuildLockOwner {
  pid: number;
  token: string;
}

function sleepSync(milliseconds: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ESRCH') {
      return false;
    }
    if (nodeError.code === 'EPERM') {
      return true;
    }
    throw error;
  }
}

function readWorkspaceBuildLockOwner(
	lockPath: string,
): WorkspaceBuildLockOwner | null {
  const rawOwner = fs.readFileSync(lockPath, 'utf8');
  if (rawOwner.length === 0) {
    return null;
  }

  let parsedOwner: Partial<WorkspaceBuildLockOwner>;
  try {
    parsedOwner = JSON.parse(rawOwner) as Partial<WorkspaceBuildLockOwner>;
  } catch {
    return null;
  }
  if (
		typeof parsedOwner.pid !== 'number' ||
		!Number.isInteger(parsedOwner.pid) ||
		typeof parsedOwner.token !== 'string' ||
		parsedOwner.token.length === 0
	) {
    return null;
  }

  return {
    pid: parsedOwner.pid,
    token: parsedOwner.token,
  };
}

function waitForWorkspaceBuildLockRelease(lockPath: string, staleAfterMs: number) {
  for (;;) {
    try {
      const stats = fs.statSync(lockPath);
      if (Date.now() - stats.mtimeMs > staleAfterMs) {
        const owner = readWorkspaceBuildLockOwner(lockPath);
        if (owner === null || !isProcessAlive(owner.pid)) {
          fs.rmSync(lockPath, { force: true });
          return;
        }
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    sleepSync(100);
  }
}

function acquireWorkspaceBuildLock(packagePath: string) {
  fs.mkdirSync(buildLockRoot, { recursive: true });
  const owner: WorkspaceBuildLockOwner = {
    pid: process.pid,
    token: randomUUID(),
  };
  const serializedOwner = JSON.stringify(owner);

  const lockPath = path.join(
    buildLockRoot,
    `${createHash('sha1').update(packagePath).digest('hex')}.lock`,
  );
  const staleAfterMs = 5 * 60 * 1000;

  for (;;) {
    try {
      const fileHandle = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fileHandle, serializedOwner, 'utf8');
      return {
				release() {
					fs.closeSync(fileHandle);
					try {
						const currentOwner = readWorkspaceBuildLockOwner(lockPath);
						if (
							currentOwner?.pid === owner.pid &&
							currentOwner.token === owner.token
						) {
							fs.rmSync(lockPath, { force: true });
						}
					} catch (error) {
						const nodeError = error as NodeJS.ErrnoException;
						if (nodeError.code !== 'ENOENT') {
							throw error;
						}
					}
				},
			};
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'EEXIST') {
        throw error;
      }

      waitForWorkspaceBuildLockRelease(lockPath, staleAfterMs);
    }
  }
}

export function resolveWorkspaceDependencyPath(packageName: string): string | null {
  const directPath = path.join(workspaceNodeModulesPath, packageName);
  if (fs.existsSync(directPath)) {
    return fs.realpathSync(directPath);
  }

  const bunPath = path.join(workspaceBunNodeModulesPath, packageName);
  if (fs.existsSync(bunPath)) {
    return fs.realpathSync(bunPath);
  }

  return null;
}

export function ensureWorkspacePackageBuilt(
	packageName: keyof typeof workspacePackagePaths,
	packagePath: string,
) {
  if (builtWorkspacePackages.has(packageName)) {
    return;
  }

  const distPath = path.join(packagePath, 'dist');
  const lock = acquireWorkspaceBuildLock(packagePath);
  try {
    if (!fs.existsSync(distPath)) {
      if (process.env.WP_TYPIA_PROJECT_TOOLS_REQUIRE_PREBUILT === '1') {
        throw new Error(
					`Expected prebuilt workspace package "${packageName}" at ${distPath}. ` +
						'Run the package build preparation step before executing run-only project-tools tests.',
				);
      }
      runCli('bun', ['run', 'build'], { cwd: packagePath });
    }
    builtWorkspacePackages.add(packageName);
  } finally {
    lock.release();
  }
}

export function ensureWorkspaceBinaryDirectory(targetDir: string) {
  const targetBinDir = path.join(targetDir, 'node_modules', '.bin');
  fs.mkdirSync(targetBinDir, { recursive: true });
}

export function linkPackageBins(
	targetDir: string,
	packageName: string,
	sourcePath: string,
) {
  const packageJsonPath = path.join(sourcePath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    bin?: Record<string, string> | string;
    name?: string;
  };
  const binField = packageJson.bin;
  if (!binField) {
    return;
  }

  const normalizedBins =
		typeof binField === 'string'
			? {
					[(packageJson.name ?? packageName).split('/').slice(-1)[0] ??
					packageName]: binField,
				}
			: binField;

  for (const [binName, relativeBinPath] of Object.entries(normalizedBins)) {
    ensureFileSymlink(
      path.join(targetDir, 'node_modules', '.bin', binName),
      path.join(sourcePath, relativeBinPath),
    );
  }
}

export function linkWorkspaceNodeModules(targetDir: string) {
  const nodeModulesPath = path.join(targetDir, 'node_modules');

  if (!fs.existsSync(nodeModulesPath)) {
    fs.mkdirSync(nodeModulesPath, { recursive: true });
  }

  ensureWorkspaceBinaryDirectory(targetDir);

  const packageJsonPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dependencyNames = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
    ...generatedProjectTypecheckSupportPackages,
  ]);

  const linkedWorkspacePackages = new Set<string>();

  function linkWorkspacePackage(
		packageName: keyof typeof workspacePackagePaths,
	) {
    if (linkedWorkspacePackages.has(packageName)) {
      return;
    }

    const workspacePackagePath = workspacePackagePaths[packageName];
    ensureWorkspacePackageBuilt(packageName, workspacePackagePath);
    ensureDirSymlink(
      path.join(nodeModulesPath, ...packageName.split('/')),
      workspacePackagePath,
    );
    linkPackageBins(targetDir, packageName, workspacePackagePath);
    linkedWorkspacePackages.add(packageName);

    const workspaceManifestPath = path.join(
      workspacePackagePath,
      'package.json',
    );
    if (!fs.existsSync(workspaceManifestPath)) {
      return;
    }

    const workspaceManifest = JSON.parse(
      fs.readFileSync(workspaceManifestPath, 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
    };

    for (const dependencyName of Object.keys(
      workspaceManifest.dependencies ?? {},
    )) {
      if (!(dependencyName in workspacePackagePaths)) {
        continue;
      }

      linkWorkspacePackage(
        dependencyName as keyof typeof workspacePackagePaths,
      );
    }
  }

  for (const packageName of dependencyNames) {
    const workspacePackagePath =
			workspacePackagePaths[packageName as keyof typeof workspacePackagePaths];
    if (workspacePackagePath) {
      linkWorkspacePackage(packageName as keyof typeof workspacePackagePaths);
      continue;
    }

    const sourcePath = resolveWorkspaceDependencyPath(packageName);
    if (!sourcePath) {
      continue;
    }

    ensureDirSymlink(
      path.join(nodeModulesPath, ...packageName.split('/')),
      sourcePath,
    );
    linkPackageBins(targetDir, packageName, sourcePath);
  }
}
