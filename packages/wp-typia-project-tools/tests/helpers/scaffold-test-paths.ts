import * as fs from 'node:fs';
import * as path from 'node:path';

export const packageRoot = path.resolve(import.meta.dir, '../..');
export const entryPath = path.resolve(
  packageRoot,
  '..',
  'wp-typia',
  'bin',
  'wp-typia.js',
);
export const createBlockExternalFixturePath = path.join(
  packageRoot,
  'tests',
  'fixtures',
  'create-block-external',
);
export const createBlockSubsetFixturePath = path.join(
  packageRoot,
  'tests',
  'fixtures',
  'create-block-subset',
);
export const templateLayerFixturePath = path.join(
  packageRoot,
  'tests',
  'fixtures',
  'wp-typia-layer-package',
);
export const templateLayerWorkspaceFixturePath = path.join(
  packageRoot,
  'tests',
  'fixtures',
  'wp-typia-layer-workspace-package',
);
export const templateLayerWorkspaceAmbiguousFixturePath = path.join(
  packageRoot,
  'tests',
  'fixtures',
  'wp-typia-layer-workspace-ambiguous',
);
export const templateLayerAmbiguousFixturePath = path.join(
  packageRoot,
  'tests',
  'fixtures',
  'wp-typia-layer-ambiguous',
);
export const templateLayerConflictFixturePath = path.join(
  packageRoot,
  'tests',
  'fixtures',
  'wp-typia-layer-conflict',
);
export const templateLayerCycleFixturePath = path.join(
  packageRoot,
  'tests',
  'fixtures',
  'wp-typia-layer-cycle',
);

const createPackageManifest = JSON.parse(
  fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
);

export const workspaceTemplatePackageManifest = JSON.parse(
	fs.readFileSync(
		path.resolve(
			packageRoot,
			'..',
			'create-workspace-template',
			'package.json',
		),
		'utf8',
	),
);

export const wpTypiaPackageManifest = JSON.parse(
  fs.readFileSync(
    path.resolve(packageRoot, '..', 'wp-typia', 'package.json'),
    'utf8',
  ),
);

export const apiClientPackageVersion =
	createPackageManifest.dependencies['@wp-typia/api-client'];

export const blockRuntimePackageManifest = JSON.parse(
  fs.readFileSync(
    path.resolve(packageRoot, '..', 'wp-typia-block-runtime', 'package.json'),
    'utf8',
  ),
);

export const blockRuntimePackageVersion = blockRuntimePackageManifest.version;

if (
	typeof blockRuntimePackageVersion !== 'string' ||
	blockRuntimePackageVersion.length === 0
) {
  throw new Error(
    'Expected "packages/wp-typia-block-runtime/package.json" to define a version.',
  );
}

export const normalizedBlockRuntimePackageVersion = `^${blockRuntimePackageVersion}`;
export const blockTypesPackageManifest = JSON.parse(
  fs.readFileSync(
    path.resolve(packageRoot, '..', 'wp-typia-block-types', 'package.json'),
    'utf8',
  ),
);

export const blockTypesPackageManifestVersion = blockTypesPackageManifest.version;

if (
	typeof blockTypesPackageManifestVersion !== 'string' ||
	blockTypesPackageManifestVersion.length === 0
) {
  throw new Error(
    'Expected "packages/wp-typia-block-types/package.json" to define a version.',
  );
}

export const blockTypesPackageVersion = `^${blockTypesPackageManifestVersion}`;
export const restPackageVersion =
	createPackageManifest.dependencies['@wp-typia/rest'];
