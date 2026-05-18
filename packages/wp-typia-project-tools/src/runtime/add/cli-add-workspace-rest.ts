import {
	assertRestResourceDoesNotExist,
	assertValidGeneratedSlug,
	normalizeBlockSlug,
	resolveRestResourceNamespace,
	type RunAddRestResourceCommandOptions,
} from "./cli-add-shared.js";
import { scaffoldGeneratedRestResource } from "./cli-add-workspace-rest-generated.js";
import { scaffoldManualRestContract } from "./cli-add-workspace-rest-manual.js";
import { type RunAddRestResourceCommandResult } from "./cli-add-workspace-rest-types.js";
import { readWorkspaceInventoryAsync } from "../workspace/workspace-inventory.js";
import { resolveWorkspaceProject } from "../workspace/workspace-project.js";

/**
 * Scaffold a workspace-level REST resource and synchronize its generated
 * TypeScript and PHP artifacts.
 *
 * @param options Command options for the REST resource scaffold workflow.
 * @returns Resolved scaffold metadata for the created REST resource.
 */
export async function runAddRestResourceCommand({
	auth,
	bodyTypeName,
	controllerClass,
	controllerExtends,
	cwd = process.cwd(),
	manual,
	method,
	methods,
	namespace,
	permissionCallback,
	pathPattern,
	queryTypeName,
	restResourceName,
	responseTypeName,
	routePattern,
	secretFieldName,
	secretHasValueFieldName,
	secretMaskedResponseFieldName,
	secretPreserveOnEmpty,
	secretStateFieldName,
}: RunAddRestResourceCommandOptions): Promise<RunAddRestResourceCommandResult> {
	const workspace = resolveWorkspaceProject(cwd);
	const restResourceSlug = assertValidGeneratedSlug(
		"REST resource name",
		normalizeBlockSlug(restResourceName),
		"wp-typia add rest-resource <name> [--namespace <vendor/v1>] [--methods <list,read,create>]",
	);
	const resolvedNamespace = resolveRestResourceNamespace(
		workspace.workspace.namespace,
		namespace,
	);

	const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
	assertRestResourceDoesNotExist(workspace.projectDir, restResourceSlug, inventory);

	if (manual) {
		return scaffoldManualRestContract({
			auth,
			bodyTypeName,
			controllerClass,
			controllerExtends,
			method,
			namespace: resolvedNamespace,
			pathPattern,
			permissionCallback,
			queryTypeName,
			responseTypeName,
			restResourceSlug,
			routePattern,
			secretFieldName,
			secretHasValueFieldName,
			secretMaskedResponseFieldName,
			secretPreserveOnEmpty,
			secretStateFieldName,
			workspace,
		});
	}

	return scaffoldGeneratedRestResource({
		controllerClass,
		controllerExtends,
		methods,
		namespace: resolvedNamespace,
		permissionCallback,
		restResourceSlug,
		routePattern,
		workspace,
	});
}
