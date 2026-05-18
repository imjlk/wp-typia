import { promises as fsp } from "node:fs";
import path from "node:path";

import { ensureBlockConfigCanAddRestManifests } from "./cli-add-block-legacy-validator.js";
import {
	assertValidRestResourceMethods,
	getWorkspaceBootstrapPath,
	resolveGeneratedRestResourceRoutePattern,
	resolveOptionalPhpCallbackReference,
	resolveOptionalPhpClassReference,
	rollbackWorkspaceMutation,
	type WorkspaceMutationSnapshot,
	snapshotWorkspaceFiles,
} from "./cli-add-shared.js";
import {
	ensureRestResourceBootstrapAnchors,
	ensureRestSchemaHelperBootstrapAnchors,
} from "./cli-add-workspace-rest-bootstrap-anchors.js";
import {
	ensureRestResourceSyncScriptAnchors,
} from "./cli-add-workspace-rest-resource-sync-anchors.js";
import {
	buildRestResourcePhpSource,
} from "./cli-add-workspace-rest-php-templates.js";
import {
	buildWorkspaceRestSchemaHelperPhpSource,
} from "./cli-add-workspace-rest-schema-helper-php-template.js";
import {
	buildRestResourceApiSource,
	buildRestResourceConfigEntry,
	buildRestResourceDataSource,
	buildRestResourceTypesSource,
	buildRestResourceValidatorsSource,
} from "./cli-add-workspace-rest-generated-source-emitters.js";
import {
	type GeneratedRestResourceScaffoldOptions,
	type RunAddRestResourceCommandResult,
} from "./cli-add-workspace-rest-types.js";
import { hasPhpFunctionDefinition } from "../shared/php-utils.js";
import { syncRestResourceArtifacts } from "./rest-resource-artifacts.js";
import { toPascalCase, toTitleCase } from "../shared/string-case.js";
import { appendWorkspaceInventoryEntries } from "../workspace/workspace-inventory.js";

async function ensureWorkspaceRestSchemaHelperFile(
	helperFilePath: string,
	phpPrefix: string,
): Promise<void> {
	let currentSource: string | null = null;
	try {
		currentSource = await fsp.readFile(helperFilePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}

	if (currentSource === null) {
		await fsp.mkdir(path.dirname(helperFilePath), { recursive: true });
		await fsp.writeFile(
			helperFilePath,
			buildWorkspaceRestSchemaHelperPhpSource(phpPrefix),
			"utf8",
		);
		return;
	}

	const requiredFunctions = [
		`${phpPrefix}_load_rest_schema`,
		`${phpPrefix}_prepare_rest_schema_for_wordpress`,
		`${phpPrefix}_get_wordpress_rest_schema`,
		`${phpPrefix}_validate_and_sanitize_rest_payload`,
	];
	const missingFunctions = requiredFunctions.filter(
		(functionName) => !hasPhpFunctionDefinition(currentSource, functionName),
	);
	if (missingFunctions.length > 0) {
		throw new Error(
			[
				`Existing ${path.relative(process.cwd(), helperFilePath)} is missing generated REST schema helper functions: ${missingFunctions.join(", ")}.`,
				"Restore the generated inc/rest-schema.php helper or add these functions manually before retrying.",
			].join(" "),
		);
	}
}

/**
 * Scaffold generated TypeScript, PHP, schema, and inventory files for a
 * workspace-owned REST resource.
 *
 * @param options Resolved workspace and raw generated-mode command options.
 * @returns Resolved scaffold metadata for the generated REST resource.
 */
export async function scaffoldGeneratedRestResource({
	controllerClass,
	controllerExtends,
	methods,
	namespace,
	permissionCallback,
	restResourceSlug,
	routePattern,
	workspace,
}: GeneratedRestResourceScaffoldOptions): Promise<RunAddRestResourceCommandResult> {
	const blockConfigPath = path.join(workspace.projectDir, "scripts", "block-config.ts");
	const syncRestScriptPath = path.join(workspace.projectDir, "scripts", "sync-rest-contracts.ts");
	const restResourceDir = path.join(workspace.projectDir, "src", "rest", restResourceSlug);
	const typesFilePath = path.join(restResourceDir, "api-types.ts");
	const validatorsFilePath = path.join(restResourceDir, "api-validators.ts");
	const apiFilePath = path.join(restResourceDir, "api.ts");
	const resolvedMethods = assertValidRestResourceMethods(methods);
	const resolvedRoutePattern = resolveGeneratedRestResourceRoutePattern(
		restResourceSlug,
		routePattern,
	);
	const hasCustomRoutePattern =
		typeof routePattern === "string" && routePattern.trim().length > 0;
	const resolvedPermissionCallback = resolveOptionalPhpCallbackReference(
		"Generated REST resource permission callback",
		permissionCallback,
	);
	const resolvedControllerClass = resolveOptionalPhpClassReference(
		"Generated REST resource controller class",
		controllerClass,
	);
	const resolvedControllerExtends = resolveOptionalPhpClassReference(
		"Generated REST resource controller base class",
		controllerExtends,
	);
	if (resolvedControllerExtends && !resolvedControllerClass) {
		throw new Error(
			"Generated REST resource controller base class requires --controller-class.",
		);
	}
	const bootstrapPath = getWorkspaceBootstrapPath(workspace);
	const dataFilePath = path.join(restResourceDir, "data.ts");
	const restSchemaHelperPath = path.join(workspace.projectDir, "inc", "rest-schema.php");
	const phpFilePath = path.join(workspace.projectDir, "inc", "rest", `${restResourceSlug}.php`);
	const mutationSnapshot: WorkspaceMutationSnapshot = {
		fileSources: await snapshotWorkspaceFiles([
			blockConfigPath,
			bootstrapPath,
			restSchemaHelperPath,
			syncRestScriptPath,
		]),
		snapshotDirs: [],
		targetPaths: [restResourceDir, restSchemaHelperPath, phpFilePath],
	};

	try {
		await fsp.mkdir(restResourceDir, { recursive: true });
		await fsp.mkdir(path.dirname(phpFilePath), { recursive: true });
		await ensureWorkspaceRestSchemaHelperFile(
			restSchemaHelperPath,
			workspace.workspace.phpPrefix,
		);
		await ensureRestSchemaHelperBootstrapAnchors(workspace);
		await ensureRestResourceBootstrapAnchors(workspace);
		await ensureRestResourceSyncScriptAnchors(workspace);
		await fsp.writeFile(
			typesFilePath,
			buildRestResourceTypesSource(restResourceSlug, resolvedMethods),
			"utf8",
		);
		await fsp.writeFile(
			validatorsFilePath,
			buildRestResourceValidatorsSource(restResourceSlug, resolvedMethods),
			"utf8",
		);
		await fsp.writeFile(
			apiFilePath,
			buildRestResourceApiSource(restResourceSlug, resolvedMethods),
			"utf8",
		);
		await fsp.writeFile(
			dataFilePath,
			buildRestResourceDataSource(restResourceSlug, resolvedMethods),
			"utf8",
		);
		await fsp.writeFile(
			phpFilePath,
			buildRestResourcePhpSource(
				restResourceSlug,
				namespace,
				workspace.workspace.phpPrefix,
				resolvedMethods,
				{
					...(resolvedControllerClass
						? { controllerClass: resolvedControllerClass }
						: {}),
					...(resolvedControllerExtends
						? { controllerExtends: resolvedControllerExtends }
						: {}),
					...(resolvedPermissionCallback
						? { permissionCallback: resolvedPermissionCallback }
						: {}),
					routePattern: resolvedRoutePattern,
				},
			),
			"utf8",
		);
		await syncRestResourceArtifacts({
			clientFile: `src/rest/${restResourceSlug}/api-client.ts`,
			methods: resolvedMethods,
			outputDir: restResourceDir,
			projectDir: workspace.projectDir,
			typesFile: `src/rest/${restResourceSlug}/api-types.ts`,
			validatorsFile: `src/rest/${restResourceSlug}/api-validators.ts`,
			variables: {
				namespace,
				pascalCase: toPascalCase(restResourceSlug),
				...(hasCustomRoutePattern ? { routePattern: resolvedRoutePattern } : {}),
				slugKebabCase: restResourceSlug,
				title: toTitleCase(restResourceSlug),
			},
		});
		await appendWorkspaceInventoryEntries(workspace.projectDir, {
			restResourceEntries: [
				buildRestResourceConfigEntry({
					...(resolvedControllerClass
						? { controllerClass: resolvedControllerClass }
						: {}),
					...(resolvedControllerExtends
						? { controllerExtends: resolvedControllerExtends }
						: {}),
					methods: resolvedMethods,
					namespace,
					...(resolvedPermissionCallback
						? { permissionCallback: resolvedPermissionCallback }
						: {}),
					restResourceSlug,
					...(hasCustomRoutePattern ? { routePattern: resolvedRoutePattern } : {}),
				}),
			],
			transformSource: ensureBlockConfigCanAddRestManifests,
		});

		return {
			...(resolvedControllerClass
				? { controllerClass: resolvedControllerClass }
				: {}),
			...(resolvedControllerExtends
				? { controllerExtends: resolvedControllerExtends }
				: {}),
			methods: resolvedMethods,
			mode: "generated",
			namespace,
			...(resolvedPermissionCallback
				? { permissionCallback: resolvedPermissionCallback }
				: {}),
			projectDir: workspace.projectDir,
			restResourceSlug,
			...(hasCustomRoutePattern ? { routePattern: resolvedRoutePattern } : {}),
		};
	} catch (error) {
		await rollbackWorkspaceMutation(mutationSnapshot);
		throw error;
	}
}
