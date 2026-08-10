import fs from 'node:fs';
import path from 'node:path';

import {
  MANUAL_REST_CONTRACT_AUTH_IDS,
  MANUAL_REST_CONTRACT_HTTP_METHOD_IDS,
  REST_RESOURCE_METHOD_IDS,
  REST_RESOURCE_NAMESPACE_PATTERN,
  isGeneratedRestResourceRoutePatternCompatible,
} from '../add/cli-add-shared.js';
import {
  checkExistingFiles,
  createDoctorCheck,
  isWorkspacePhpEntrypointManifestValid,
  resolveWorkspacePhpManifestModulePaths,
  resolveWorkspaceBootstrapPath,
  WORKSPACE_REST_RESOURCE_MANIFEST,
  workspaceBootstrapHasLiteralManifestInclude,
} from './cli-doctor-workspace-shared.js';
import { hasPhpFunctionLiteralDirectoryInclude } from '../shared/php-utils.js';

import type { DoctorCheck } from './cli-doctor.js';
import type { WorkspaceInventory } from '../workspace/workspace-inventory.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

function isManualRestResource(
	restResource: WorkspaceInventory['restResources'][number],
): boolean {
  return restResource.mode === 'manual';
}

function getWorkspaceRestResourceRequiredFiles(
	restResource: WorkspaceInventory['restResources'][number],
): string[] {
  const schemaNames = new Set<string>();
  if (isManualRestResource(restResource)) {
    schemaNames.add('query');
    if (restResource.bodyTypeName) {
      schemaNames.add('request');
    }
    schemaNames.add('response');

    return Array.from(
			new Set([
				restResource.apiFile,
				...Array.from(schemaNames, (schemaName) =>
					path.join(
						path.dirname(restResource.typesFile),
						'api-schemas',
						`${schemaName}.schema.json`,
					),
				),
				restResource.clientFile,
				restResource.openApiFile,
				restResource.typesFile,
				restResource.validatorsFile,
			]),
		);
  }

  if (restResource.methods.includes('list')) {
    schemaNames.add('list-query');
    schemaNames.add('list-response');
  }
  if (restResource.methods.includes('read')) {
    schemaNames.add('read-query');
    schemaNames.add('read-response');
  }
  if (restResource.methods.includes('create')) {
    schemaNames.add('create-request');
    schemaNames.add('create-response');
  }
  if (restResource.methods.includes('update')) {
    schemaNames.add('update-query');
    schemaNames.add('update-request');
    schemaNames.add('update-response');
  }
  if (restResource.methods.includes('delete')) {
    schemaNames.add('delete-query');
    schemaNames.add('delete-response');
  }

  return Array.from(
		new Set([
			restResource.apiFile,
			...Array.from(schemaNames, (schemaName) =>
				path.join(
					path.dirname(restResource.typesFile),
					'api-schemas',
					`${schemaName}.schema.json`,
				),
			),
			restResource.clientFile,
			...(restResource.dataFile ? [restResource.dataFile] : []),
			restResource.openApiFile,
			...(restResource.phpFile ? [restResource.phpFile] : []),
			restResource.typesFile,
			restResource.validatorsFile,
		]),
	);
}

function checkWorkspaceRestResourceConfig(
	restResource: WorkspaceInventory['restResources'][number],
): DoctorCheck {
  const hasNamespace = REST_RESOURCE_NAMESPACE_PATTERN.test(
    restResource.namespace,
  );
  if (isManualRestResource(restResource)) {
    const hasAuth =
      restResource.auth === null ||
      restResource.auth === undefined ||
      (MANUAL_REST_CONTRACT_AUTH_IDS as readonly string[]).includes(
        restResource.auth,
      );
    const hasMethod =
			typeof restResource.method === 'string' &&
			(MANUAL_REST_CONTRACT_HTTP_METHOD_IDS as readonly string[]).includes(
        restResource.method,
      );
    const hasPathPattern =
			typeof restResource.pathPattern === 'string' &&
			restResource.pathPattern.startsWith('/') &&
			restResource.pathPattern.length > 1;

    return createDoctorCheck(
      `REST resource config ${restResource.slug}`,
      hasNamespace && hasAuth && hasMethod && hasPathPattern ? 'pass' : 'fail',
      hasNamespace && hasAuth && hasMethod && hasPathPattern
        ? `Manual REST contract ${restResource.method} /${restResource.namespace}${restResource.pathPattern}`
        : 'Manual REST contract namespace, auth, method, or path pattern is invalid',
    );
  }

  const hasMethods =
		restResource.methods.length > 0 &&
		restResource.methods.every((method) =>
      (REST_RESOURCE_METHOD_IDS as readonly string[]).includes(method),
    );
  const hasGeneratedFiles =
		typeof restResource.dataFile === 'string' &&
		restResource.dataFile.length > 0 &&
		typeof restResource.phpFile === 'string' &&
		restResource.phpFile.length > 0;
  const hasRoutePattern =
    restResource.routePattern === null ||
    restResource.routePattern === undefined ||
    (typeof restResource.routePattern === 'string' &&
      restResource.routePattern.startsWith('/') &&
      restResource.routePattern.length > 1 &&
      !/\s/u.test(restResource.routePattern) &&
      isGeneratedRestResourceRoutePatternCompatible(restResource.routePattern));

  return createDoctorCheck(
    `REST resource config ${restResource.slug}`,
    hasNamespace && hasMethods && hasGeneratedFiles && hasRoutePattern
      ? 'pass'
      : 'fail',
    hasNamespace && hasMethods && hasGeneratedFiles && hasRoutePattern
      ? `REST resource namespace ${restResource.namespace} with methods ${restResource.methods.join(', ')}`
      : 'REST resource namespace, methods, dataFile, phpFile, or routePattern are invalid',
  );
}

function checkWorkspaceRestResourceBootstrap(
	projectDir: string,
	packageName: string,
	phpPrefix: string,
	restResources: WorkspaceInventory['restResources'],
): DoctorCheck {
  const bootstrapPath = resolveWorkspaceBootstrapPath(projectDir, packageName);
  if (!fs.existsSync(bootstrapPath)) {
    return createDoctorCheck(
      'REST resource bootstrap',
      'fail',
      `Missing ${path.basename(bootstrapPath)}`,
    );
  }

  const source = fs.readFileSync(bootstrapPath, 'utf8');
  const registerFunctionName = `${phpPrefix}_register_rest_resources`;
  const registerHook = `add_action( 'init', '${registerFunctionName}', 20 );`;
  const hasServerManifest = hasPhpFunctionLiteralDirectoryInclude(
    source,
    registerFunctionName,
    WORKSPACE_REST_RESOURCE_MANIFEST,
    { requirePhpOpenTag: true },
  );
  const expectedManifestTargets = resolveWorkspacePhpManifestModulePaths(
    WORKSPACE_REST_RESOURCE_MANIFEST,
    restResources
      .filter((restResource) => !isManualRestResource(restResource))
      .map((restResource) => restResource.phpFile)
      .filter((phpFile): phpFile is string => phpFile !== undefined),
  );
  const hasValidManifest = isWorkspacePhpEntrypointManifestValid(
    projectDir,
    WORKSPACE_REST_RESOURCE_MANIFEST,
    expectedManifestTargets ?? [],
  );
  const hasRegisterHook = source.includes(registerHook);
  const hasValidBootstrap =
    hasServerManifest &&
    expectedManifestTargets !== null &&
    hasValidManifest &&
    hasRegisterHook;

  return createDoctorCheck(
    'REST resource bootstrap',
    hasValidBootstrap ? 'pass' : 'fail',
    hasValidBootstrap
      ? 'REST resource PHP manifest hook is present'
      : 'Missing or stale REST resource PHP manifest or init hook',
  );
}

/**
 * Collect REST resource workspace doctor checks while preserving existing row order.
 *
 * @param workspace Resolved workspace metadata and filesystem paths.
 * @param restResources REST resources parsed from the workspace inventory.
 * @returns Ordered REST resource doctor checks.
 */
export function getWorkspaceRestResourceDoctorChecks(
	workspace: WorkspaceProject,
	restResources: WorkspaceInventory['restResources'],
): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  const hasGeneratedRestResource = restResources.some(
    (restResource) => !isManualRestResource(restResource),
  );
  const hasRestResourceManifest = fs.existsSync(
    path.join(workspace.projectDir, WORKSPACE_REST_RESOURCE_MANIFEST.slice(1)),
  );
  const bootstrapReferencesRestResourceManifest =
    workspaceBootstrapHasLiteralManifestInclude(
      workspace.projectDir,
      workspace.packageName,
      WORKSPACE_REST_RESOURCE_MANIFEST,
    );
  if (
    hasGeneratedRestResource ||
    hasRestResourceManifest ||
    bootstrapReferencesRestResourceManifest
  ) {
    checks.push(
      checkWorkspaceRestResourceBootstrap(
        workspace.projectDir,
        workspace.packageName,
        workspace.workspace.phpPrefix,
        restResources,
      ),
    );
  }
  for (const restResource of restResources) {
    checks.push(checkWorkspaceRestResourceConfig(restResource));
    checks.push(
      checkExistingFiles(
        workspace.projectDir,
        `REST resource ${restResource.slug}`,
        getWorkspaceRestResourceRequiredFiles(restResource),
      ),
    );
  }

  return checks;
}
