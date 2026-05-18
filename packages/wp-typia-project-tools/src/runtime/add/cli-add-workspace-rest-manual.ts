import { promises as fsp } from "node:fs";
import path from "node:path";

import { ensureBlockConfigCanAddRestManifests } from "./cli-add-block-legacy-validator.js";
import {
	assertValidManualRestContractAuth,
	assertValidManualRestContractHttpMethod,
	assertValidTypeScriptIdentifier,
	collectRestRouteNamedCaptureNames,
	resolveOptionalPhpCallbackReference,
	resolveOptionalPhpClassReference,
	resolveManualRestContractPathPattern,
	rollbackWorkspaceMutation,
	type WorkspaceMutationSnapshot,
	snapshotWorkspaceFiles,
} from "./cli-add-shared.js";
import {
	ensureRestResourceSyncScriptAnchors,
} from "./cli-add-workspace-rest-resource-sync-anchors.js";
import {
	buildManualRestContractApiSource,
	buildManualRestContractConfigEntry,
	buildManualRestContractTypesSource,
	buildManualRestContractValidatorsSource,
} from "./cli-add-workspace-rest-manual-source-emitters.js";
import {
	type ManualRestContractScaffoldOptions,
	type RunAddRestResourceCommandResult,
} from "./cli-add-workspace-rest-types.js";
import { syncManualRestContractArtifacts } from "./rest-resource-artifacts.js";
import { toPascalCase, toTitleCase } from "../shared/string-case.js";
import { appendWorkspaceInventoryEntries } from "../workspace/workspace-inventory.js";

const MANUAL_REST_REQUEST_BODY_FIELD_NAMES = new Set(["payload", "comment"]);
const MANUAL_REST_RESPONSE_FIELD_NAMES = new Set([
	"id",
	"status",
	"message",
	"updatedAt",
]);

function resolveManualRestSecretPreserveOnEmpty(
	value: boolean | undefined,
): boolean {
	return value ?? true;
}

function resolveManualRestSecretStateFieldCandidate(options: {
	secretHasValueFieldName: string | undefined;
	secretMaskedResponseFieldName: string | undefined;
	secretStateFieldName: string | undefined;
}): string | undefined {
	const candidates = [
		options.secretStateFieldName,
		options.secretHasValueFieldName,
		options.secretMaskedResponseFieldName,
	].filter((value): value is string => typeof value === "string");
	const distinct = Array.from(new Set(candidates));
	if (distinct.length > 1) {
		throw new Error(
			"Manual REST contract secret state, has-value, and masked response field flags must match when combined.",
		);
	}

	return distinct[0];
}

function resolveManualRestRoutePathPattern(options: {
	pathPattern: string | undefined;
	restResourceSlug: string;
	routePattern: string | undefined;
}): string {
	const trimmedPathPattern =
		typeof options.pathPattern === "string"
			? options.pathPattern.trim()
			: undefined;
	const trimmedRoutePattern =
		typeof options.routePattern === "string"
			? options.routePattern.trim()
			: undefined;

	if (
		trimmedPathPattern &&
		trimmedRoutePattern &&
		trimmedPathPattern !== trimmedRoutePattern
	) {
		throw new Error(
			"Manual REST contract --path and --route-pattern must match when both are provided. Use one route pattern flag for provider routes.",
		);
	}

	return resolveManualRestContractPathPattern(
		options.restResourceSlug,
		options.pathPattern ?? options.routePattern,
	);
}

/**
 * Scaffold a type-only external REST contract for workspace consumers.
 *
 * @param options Resolved workspace and raw manual-mode command options.
 * @returns Resolved scaffold metadata for the manual REST contract.
 */
export async function scaffoldManualRestContract({
	auth,
	bodyTypeName,
	controllerClass,
	controllerExtends,
	method,
	namespace,
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
}: ManualRestContractScaffoldOptions): Promise<RunAddRestResourceCommandResult> {
	const blockConfigPath = path.join(workspace.projectDir, "scripts", "block-config.ts");
	const syncRestScriptPath = path.join(workspace.projectDir, "scripts", "sync-rest-contracts.ts");
	const restResourceDir = path.join(workspace.projectDir, "src", "rest", restResourceSlug);
	const typesFilePath = path.join(restResourceDir, "api-types.ts");
	const validatorsFilePath = path.join(restResourceDir, "api-validators.ts");
	const apiFilePath = path.join(restResourceDir, "api.ts");
	const pascalCase = toPascalCase(restResourceSlug);
	const resolvedAuth = assertValidManualRestContractAuth(auth);
	const resolvedMethod = assertValidManualRestContractHttpMethod(method);
	const resolvedPathPattern = resolveManualRestRoutePathPattern({
		pathPattern,
		restResourceSlug,
		routePattern,
	});
	const pathParameterNames =
		collectRestRouteNamedCaptureNames(resolvedPathPattern);
	const resolvedPermissionCallback = resolveOptionalPhpCallbackReference(
		"Manual REST contract permission callback",
		permissionCallback,
	);
	const resolvedControllerClass = resolveOptionalPhpClassReference(
		"Manual REST contract controller class",
		controllerClass,
	);
	const resolvedControllerExtends = resolveOptionalPhpClassReference(
		"Manual REST contract controller base class",
		controllerExtends,
	);
	if (resolvedControllerExtends && !resolvedControllerClass) {
		throw new Error(
			"Manual REST contract controller base class requires --controller-class.",
		);
	}
	const resolvedQueryTypeName = assertValidTypeScriptIdentifier(
		"Manual REST contract query type",
		queryTypeName ?? `${pascalCase}Query`,
		"wp-typia add rest-resource <name> --manual [--query-type <ExportedQueryType>]",
	);
	const resolvedResponseTypeName = assertValidTypeScriptIdentifier(
		"Manual REST contract response type",
		responseTypeName ?? `${pascalCase}Response`,
		"wp-typia add rest-resource <name> --manual [--response-type <ExportedResponseType>]",
	);
	const defaultsToBody =
		bodyTypeName == null && ["PATCH", "POST", "PUT"].includes(resolvedMethod);
	const resolvedBodyTypeName =
		bodyTypeName != null || defaultsToBody
			? assertValidTypeScriptIdentifier(
					"Manual REST contract body type",
					bodyTypeName ?? `${pascalCase}Request`,
					"wp-typia add rest-resource <name> --manual [--body-type <ExportedBodyType>]",
				)
			: undefined;
	if (resolvedMethod === "GET" && resolvedBodyTypeName) {
		throw new Error(
			"Manual REST contract GET routes cannot define a body type. Remove --body-type or use POST, PUT, or PATCH.",
		);
	}
	const secretStateFieldCandidate = resolveManualRestSecretStateFieldCandidate({
		secretHasValueFieldName,
		secretMaskedResponseFieldName,
		secretStateFieldName,
	});
	if (secretPreserveOnEmpty !== undefined && !secretFieldName) {
		throw new Error(
			"Manual REST contract --secret-preserve-on-empty requires --secret-field.",
		);
	}
	if (secretStateFieldCandidate !== undefined && !secretFieldName) {
		throw new Error(
			"Manual REST contract secret state, has-value, and masked response field flags require --secret-field.",
		);
	}
	if (secretFieldName && !resolvedBodyTypeName) {
		throw new Error(
			"Manual REST contract secret fields require a request body. Use POST, PUT, or PATCH so a request body is generated.",
		);
	}
	const resolvedSecretFieldName = secretFieldName
		? assertValidTypeScriptIdentifier(
				"Manual REST contract secret field",
				secretFieldName,
				"wp-typia add rest-resource <name> --manual --method POST --secret-field <field>",
			)
		: undefined;
	const resolvedSecretPreserveOnEmpty = resolvedSecretFieldName
		? resolveManualRestSecretPreserveOnEmpty(secretPreserveOnEmpty)
		: undefined;
	const resolvedSecretStateFieldName = resolvedSecretFieldName
		? assertValidTypeScriptIdentifier(
				"Manual REST contract secret state field",
				secretStateFieldCandidate ??
					`has${toPascalCase(resolvedSecretFieldName)}`,
				"wp-typia add rest-resource <name> --manual --method POST --secret-state-field <field>",
			)
		: undefined;
	if (
		resolvedSecretFieldName &&
		MANUAL_REST_REQUEST_BODY_FIELD_NAMES.has(resolvedSecretFieldName)
	) {
		throw new Error(
			`Manual REST contract secret field must not reuse scaffolded request body fields: ${Array.from(
				MANUAL_REST_REQUEST_BODY_FIELD_NAMES,
			).join(", ")}.`,
		);
	}
	if (
		resolvedSecretStateFieldName &&
		MANUAL_REST_RESPONSE_FIELD_NAMES.has(resolvedSecretStateFieldName)
	) {
		throw new Error(
			`Manual REST contract secret state field must not reuse scaffolded response fields: ${Array.from(
				MANUAL_REST_RESPONSE_FIELD_NAMES,
			).join(", ")}.`,
		);
	}
	if (
		resolvedSecretFieldName &&
		resolvedSecretStateFieldName &&
		resolvedSecretFieldName === resolvedSecretStateFieldName
	) {
		throw new Error(
			"Manual REST contract secret state field must be different from the raw secret field.",
		);
	}
	const manualTypeNames = [
		resolvedQueryTypeName,
		resolvedResponseTypeName,
		resolvedBodyTypeName,
	].filter((value): value is string => value != null);
	const duplicateManualTypeNames = manualTypeNames.filter(
		(name, index) => manualTypeNames.indexOf(name) !== index,
	);
	if (duplicateManualTypeNames.length > 0) {
		throw new Error(
			`Manual REST contract type names must be unique: ${Array.from(
				new Set(duplicateManualTypeNames),
			).join(", ")}. Use distinct --query-type, --body-type, and --response-type values.`,
		);
	}
	const mutationSnapshot: WorkspaceMutationSnapshot = {
		fileSources: await snapshotWorkspaceFiles([
			blockConfigPath,
			syncRestScriptPath,
		]),
		snapshotDirs: [],
		targetPaths: [restResourceDir],
	};

	try {
		await fsp.mkdir(restResourceDir, { recursive: true });
		await ensureRestResourceSyncScriptAnchors(workspace);
		await fsp.writeFile(
			typesFilePath,
			buildManualRestContractTypesSource({
				...(resolvedBodyTypeName
					? { bodyTypeName: resolvedBodyTypeName }
					: {}),
				pathParameterNames,
				queryTypeName: resolvedQueryTypeName,
				responseTypeName: resolvedResponseTypeName,
				restResourceSlug,
				...(resolvedSecretFieldName
					? { secretFieldName: resolvedSecretFieldName }
					: {}),
				...(resolvedSecretPreserveOnEmpty !== undefined
					? { secretPreserveOnEmpty: resolvedSecretPreserveOnEmpty }
					: {}),
				...(resolvedSecretStateFieldName
					? { secretStateFieldName: resolvedSecretStateFieldName }
					: {}),
			}),
			"utf8",
		);
		await fsp.writeFile(
			validatorsFilePath,
			buildManualRestContractValidatorsSource({
				...(resolvedBodyTypeName
					? { bodyTypeName: resolvedBodyTypeName }
					: {}),
				queryTypeName: resolvedQueryTypeName,
				responseTypeName: resolvedResponseTypeName,
			}),
			"utf8",
		);
		await fsp.writeFile(
			apiFilePath,
			buildManualRestContractApiSource({
				...(resolvedBodyTypeName
					? { bodyTypeName: resolvedBodyTypeName }
					: {}),
				queryTypeName: resolvedQueryTypeName,
				restResourceSlug,
			}),
			"utf8",
		);
		await syncManualRestContractArtifacts({
			clientFile: `src/rest/${restResourceSlug}/api-client.ts`,
			outputDir: restResourceDir,
			projectDir: workspace.projectDir,
			typesFile: `src/rest/${restResourceSlug}/api-types.ts`,
			validatorsFile: `src/rest/${restResourceSlug}/api-validators.ts`,
			variables: {
				auth: resolvedAuth,
				...(resolvedBodyTypeName
					? { bodyTypeName: resolvedBodyTypeName }
					: {}),
				method: resolvedMethod,
				namespace,
				pascalCase,
				pathPattern: resolvedPathPattern,
				queryTypeName: resolvedQueryTypeName,
				responseTypeName: resolvedResponseTypeName,
				slugKebabCase: restResourceSlug,
				title: toTitleCase(restResourceSlug),
			},
		});
		await appendWorkspaceInventoryEntries(workspace.projectDir, {
			restResourceEntries: [
				buildManualRestContractConfigEntry({
					auth: resolvedAuth,
					...(resolvedBodyTypeName
						? { bodyTypeName: resolvedBodyTypeName }
						: {}),
					...(resolvedControllerClass
						? { controllerClass: resolvedControllerClass }
						: {}),
					...(resolvedControllerExtends
						? { controllerExtends: resolvedControllerExtends }
						: {}),
					method: resolvedMethod,
					namespace,
					pathPattern: resolvedPathPattern,
					...(resolvedPermissionCallback
						? { permissionCallback: resolvedPermissionCallback }
						: {}),
					queryTypeName: resolvedQueryTypeName,
					responseTypeName: resolvedResponseTypeName,
					restResourceSlug,
					...(resolvedSecretFieldName
						? { secretFieldName: resolvedSecretFieldName }
						: {}),
					...(resolvedSecretPreserveOnEmpty !== undefined
						? { secretPreserveOnEmpty: resolvedSecretPreserveOnEmpty }
						: {}),
					...(resolvedSecretStateFieldName
						? { secretStateFieldName: resolvedSecretStateFieldName }
						: {}),
				}),
			],
			transformSource: ensureBlockConfigCanAddRestManifests,
		});

		return {
			auth: resolvedAuth,
			...(resolvedBodyTypeName
				? { bodyTypeName: resolvedBodyTypeName }
				: {}),
			...(resolvedControllerClass
				? { controllerClass: resolvedControllerClass }
				: {}),
			...(resolvedControllerExtends
				? { controllerExtends: resolvedControllerExtends }
				: {}),
			method: resolvedMethod,
			methods: [],
			mode: "manual",
			namespace,
			pathPattern: resolvedPathPattern,
			...(resolvedPermissionCallback
				? { permissionCallback: resolvedPermissionCallback }
				: {}),
			projectDir: workspace.projectDir,
			queryTypeName: resolvedQueryTypeName,
			restResourceSlug,
			responseTypeName: resolvedResponseTypeName,
			...(resolvedSecretFieldName
				? { secretFieldName: resolvedSecretFieldName }
				: {}),
			...(resolvedSecretPreserveOnEmpty !== undefined
				? { secretPreserveOnEmpty: resolvedSecretPreserveOnEmpty }
				: {}),
			...(resolvedSecretStateFieldName
				? { secretStateFieldName: resolvedSecretStateFieldName }
				: {}),
		};
	} catch (error) {
		await rollbackWorkspaceMutation(mutationSnapshot);
		throw error;
	}
}
