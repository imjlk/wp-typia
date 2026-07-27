import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

export const packageRoot = path.resolve(import.meta.dir, '..');

const requireFromWpTypia = createRequire(
  path.join(packageRoot, 'package.json'),
);
const projectToolsPackageRoot = path.dirname(
  requireFromWpTypia.resolve('@wp-typia/project-tools/package.json'),
);
const apiClientPackageRoot = path.dirname(
  requireFromWpTypia.resolve('@wp-typia/api-client/package.json'),
);
const requireFromProjectTools = createRequire(
  path.join(projectToolsPackageRoot, 'package.json'),
);
const blockRuntimePackageRoot = path.dirname(
  requireFromProjectTools.resolve('@wp-typia/block-runtime/package.json'),
);
const projectToolsRuntimeDir = path.resolve(
  projectToolsPackageRoot,
  'dist',
  'runtime',
);
const apiClientDistDir = path.resolve(apiClientPackageRoot, 'dist');

export const PROJECT_TOOLS_ALIASES = {
  '@wp-typia/api-client/internal/runtime-primitives': path.join(
    apiClientDistDir,
    'internal',
    'runtime-primitives.js',
  ),
  '@wp-typia/api-client/runtime-primitives': path.join(
    apiClientDistDir,
    'runtime-primitives.js',
  ),
  '@wp-typia/project-tools/cli-add': path.join(
    projectToolsRuntimeDir,
    'cli-add.js',
  ),
  '@wp-typia/project-tools/cli-add-kind-ids': path.join(
    projectToolsRuntimeDir,
    'cli-add-kind-ids.js',
  ),
  '@wp-typia/project-tools/cli-diagnostics': path.join(
    projectToolsRuntimeDir,
    'cli-diagnostics.js',
  ),
  '@wp-typia/project-tools/cli-doctor': path.join(
    projectToolsRuntimeDir,
    'cli-doctor.js',
  ),
  '@wp-typia/project-tools/cli-prompt': path.join(
    projectToolsRuntimeDir,
    'cli-prompt.js',
  ),
  '@wp-typia/project-tools/cli-scaffold': path.join(
    projectToolsRuntimeDir,
    'cli-scaffold.js',
  ),
  '@wp-typia/project-tools/cli-templates': path.join(
    projectToolsRuntimeDir,
    'cli-templates.js',
  ),
  '@wp-typia/project-tools/hooked-blocks': path.join(
    projectToolsRuntimeDir,
    'hooked-blocks.js',
  ),
  '@wp-typia/project-tools/migrations': path.join(
    projectToolsRuntimeDir,
    'migrations.js',
  ),
  '@wp-typia/project-tools/package-managers': path.join(
    projectToolsRuntimeDir,
    'package-managers.js',
  ),
  '@wp-typia/project-tools/workspace-project': path.join(
    projectToolsRuntimeDir,
    'workspace-project.js',
  ),
} as const;

export const WP_TYPIA_EXTERNALS = [
  '@wp-typia/api-client',
  '@wp-typia/api-client/*',
  '@wp-typia/block-runtime',
  '@wp-typia/block-runtime/*',
  '@wp-typia/block-types',
  '@wp-typia/block-types/*',
  '@wp-typia/rest',
  '@wp-typia/rest/*',
] as const;

interface RuntimeDependencyBuildStep {
  cwd: string;
  dependencies: string[];
  label: string;
  outdir: string;
  tsconfig: string;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getRuntimeDependencyBuildSteps(): RuntimeDependencyBuildStep[] {
  return [
    {
      cwd: apiClientPackageRoot,
      dependencies: [],
      label: '@wp-typia/api-client',
      outdir: path.join(apiClientPackageRoot, 'dist'),
      tsconfig: 'tsconfig.build.json',
    },
    {
      cwd: blockRuntimePackageRoot,
      dependencies: ['@wp-typia/api-client'],
      label: '@wp-typia/block-runtime',
      outdir: path.join(blockRuntimePackageRoot, 'dist'),
      tsconfig: 'tsconfig.build.json',
    },
    {
      cwd: projectToolsPackageRoot,
      dependencies: ['@wp-typia/api-client', '@wp-typia/block-runtime'],
      label: '@wp-typia/project-tools',
      outdir: path.join(projectToolsPackageRoot, 'dist'),
      tsconfig: 'tsconfig.runtime.json',
    },
  ];
}

export function resolveBunExecutable(): string {
  if (typeof Bun === 'undefined') {
    throw new Error(
      'wp-typia source checkout recovery requires Bun to be available.',
    );
  }

  const resolvedBunExecutable = Bun.which('bun');
  if (!resolvedBunExecutable) {
    throw new Error(
      'wp-typia source checkout recovery could not locate the `bun` executable.',
    );
  }

  return resolvedBunExecutable;
}

export async function ensureRuntimeBuildDependencies() {
  const requiredArtifacts = [...new Set(Object.values(PROJECT_TOOLS_ALIASES))];
  const missingArtifacts: Array<{
    absolutePath: string;
    relativePath: string;
  }> = [];

  for (const artifactPath of requiredArtifacts) {
    if (!(await fileExists(artifactPath))) {
      missingArtifacts.push({
        absolutePath: artifactPath,
        relativePath: path.relative(packageRoot, artifactPath),
      });
    }
  }

  if (missingArtifacts.length === 0) {
    return;
  }

  const buildSteps = getRuntimeDependencyBuildSteps();
  const buildStepByLabel = new Map(
    buildSteps.map((buildStep) => [buildStep.label, buildStep]),
  );
  const selectedBuildStepLabels = new Set(
		buildSteps
			.filter((buildStep) =>
				missingArtifacts.some(({ absolutePath }) => {
					const relativeToOutdir = path.relative(
						buildStep.outdir,
						absolutePath,
					);
					return (
						relativeToOutdir.length > 0 &&
						!relativeToOutdir.startsWith('..') &&
						!path.isAbsolute(relativeToOutdir)
					);
				}),
			)
			.map((buildStep) => buildStep.label),
	);

  const queue = [...selectedBuildStepLabels];
  while (queue.length > 0) {
    const nextLabel = queue.shift();
    if (!nextLabel) {
      continue;
    }

    const buildStep = buildStepByLabel.get(nextLabel);
    if (!buildStep) {
      continue;
    }

    for (const dependencyLabel of buildStep.dependencies) {
      if (selectedBuildStepLabels.has(dependencyLabel)) {
        continue;
      }

      selectedBuildStepLabels.add(dependencyLabel);
      queue.push(dependencyLabel);
    }
  }

  const stepsToRebuild = buildSteps.filter((buildStep) =>
    selectedBuildStepLabels.has(buildStep.label),
  );
  if (stepsToRebuild.length === 0) {
    throw new Error(
			`Unable to match missing wp-typia runtime alias artifacts to rebuild steps: ${missingArtifacts
				.map(({ relativePath }) => relativePath)
				.join(', ')}`,
		);
  }

  const bunExecutable = resolveBunExecutable();
  for (const buildStep of stepsToRebuild) {
    const tsconfigPath = path.join(buildStep.cwd, buildStep.tsconfig);
    if (!(await fileExists(tsconfigPath))) {
      throw new Error(
        `Missing ${buildStep.tsconfig} for ${buildStep.label} while recovering wp-typia runtime aliases.`,
      );
    }

    await fs.rm(buildStep.outdir, { force: true, recursive: true });
    const buildResult = spawnSync(
      bunExecutable,
      ['x', 'ttsc', '-p', buildStep.tsconfig],
      {
        cwd: buildStep.cwd,
        env: process.env,
        stdio: 'inherit',
      },
    );

    if (buildResult.status === 0) {
      continue;
    }

    throw new Error(
			`Failed to build ${buildStep.label} while recovering wp-typia runtime aliases: ${missingArtifacts
				.map(({ relativePath }) => relativePath)
				.join(', ')}${
				buildResult.error ? ` (${buildResult.error.message})` : ''
			}`,
		);
  }

  const stillMissing: string[] = [];
  for (const artifactPath of requiredArtifacts) {
    if (!(await fileExists(artifactPath))) {
      stillMissing.push(path.relative(packageRoot, artifactPath));
    }
  }

  if (stillMissing.length > 0) {
    throw new Error(
      `wp-typia runtime alias artifacts still missing after rebuild: ${stillMissing.join(', ')}`,
    );
  }
}
