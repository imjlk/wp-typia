import path from "node:path";

import {
	defineEndpointManifest,
	syncEndpointClient,
	syncRestOpenApi,
	syncTypeSchemas,
} from "@wp-typia/block-runtime/metadata-core";

import type {
	ManualRestContractAuthId,
	ManualRestContractHttpMethodId,
	RestResourceMethodId,
} from "./cli-add-shared.js";

interface RestResourceTemplateVariablesLike {
	namespace: string;
	pascalCase: string;
	routePattern?: string;
	slugKebabCase: string;
	title: string;
}

interface SyncRestResourceArtifactsOptions {
	clientFile: string;
	methods: RestResourceMethodId[];
	outputDir: string;
	projectDir: string;
	typesFile: string;
	validatorsFile: string;
	variables: RestResourceTemplateVariablesLike;
}

interface ManualRestContractTemplateVariablesLike {
	auth: ManualRestContractAuthId;
	bodyTypeName?: string;
	method: ManualRestContractHttpMethodId;
	namespace: string;
	pascalCase: string;
	pathPattern: string;
	queryTypeName: string;
	responseTypeName: string;
	slugKebabCase: string;
	title: string;
}

interface SyncManualRestContractArtifactsOptions {
	clientFile: string;
	outputDir: string;
	projectDir: string;
	typesFile: string;
	validatorsFile: string;
	variables: ManualRestContractTemplateVariablesLike;
}

type RestResourceEndpointDefinition = Parameters<
	typeof defineEndpointManifest
>[0]["endpoints"][number];

function resolveManualRestContractWordPressAuth(auth: ManualRestContractAuthId) {
	if (auth === "authenticated") {
		return {
			mechanism: "rest-nonce" as const,
		};
	}
	if (auth === "public-write-protected") {
		return {
			mechanism: "public-signed-token" as const,
		};
	}

	return undefined;
}

/**
 * Build the endpoint manifest for a workspace-level REST resource scaffold.
 *
 * @param variables Template naming data used for contract names, routes, and OpenAPI info.
 * @param methods Enabled REST methods for the generated resource.
 * @returns Endpoint manifest consumed by schema, OpenAPI, and client generators.
 */
export function buildRestResourceEndpointManifest(
	variables: RestResourceTemplateVariablesLike,
	methods: RestResourceMethodId[],
) {
	const basePath = `/${variables.namespace}/${variables.slugKebabCase}`;
	const routePattern =
		variables.routePattern == null
			? `/${variables.slugKebabCase}/item`
			: variables.routePattern.startsWith("/")
				? variables.routePattern
				: `/${variables.routePattern}`;
	const itemPath = `/${variables.namespace}${routePattern}`;
	const contracts: Record<string, { sourceTypeName: string }> = {};
	const endpoints: RestResourceEndpointDefinition[] = [];

	if (methods.includes("list")) {
		contracts["list-query"] = {
			sourceTypeName: `${variables.pascalCase}ListQuery`,
		};
		contracts["list-response"] = {
			sourceTypeName: `${variables.pascalCase}ListResponse`,
		};
		endpoints.push({
			auth: "public",
			method: "GET",
			operationId: `list${variables.pascalCase}Resources`,
			path: basePath,
			queryContract: "list-query",
			responseContract: "list-response",
			summary: `List ${variables.title} resources.`,
			tags: [variables.title],
		});
	}

	if (methods.includes("read")) {
		contracts["read-query"] = {
			sourceTypeName: `${variables.pascalCase}ReadQuery`,
		};
		contracts["read-response"] = {
			sourceTypeName: `${variables.pascalCase}ReadResponse`,
		};
		endpoints.push({
			auth: "public",
			method: "GET",
			operationId: `read${variables.pascalCase}Resource`,
			path: itemPath,
			queryContract: "read-query",
			responseContract: "read-response",
			summary: `Read one ${variables.title} resource.`,
			tags: [variables.title],
		});
	}

	if (methods.includes("create")) {
		contracts["create-request"] = {
			sourceTypeName: `${variables.pascalCase}CreateRequest`,
		};
		contracts["create-response"] = {
			sourceTypeName: `${variables.pascalCase}CreateResponse`,
		};
		endpoints.push({
			auth: "authenticated",
			bodyContract: "create-request",
			method: "POST",
			operationId: `create${variables.pascalCase}Resource`,
			path: basePath,
			responseContract: "create-response",
			summary: `Create one ${variables.title} resource.`,
			tags: [variables.title],
			wordpressAuth: {
				mechanism: "rest-nonce",
			},
		});
	}

	if (methods.includes("update")) {
		contracts["update-query"] = {
			sourceTypeName: `${variables.pascalCase}UpdateQuery`,
		};
		contracts["update-request"] = {
			sourceTypeName: `${variables.pascalCase}UpdateRequest`,
		};
		contracts["update-response"] = {
			sourceTypeName: `${variables.pascalCase}UpdateResponse`,
		};
		endpoints.push({
			auth: "authenticated",
			bodyContract: "update-request",
			method: "POST",
			operationId: `update${variables.pascalCase}Resource`,
			path: itemPath,
			queryContract: "update-query",
			responseContract: "update-response",
			summary: `Update one ${variables.title} resource.`,
			tags: [variables.title],
			wordpressAuth: {
				mechanism: "rest-nonce",
			},
		});
	}

	if (methods.includes("delete")) {
		contracts["delete-query"] = {
			sourceTypeName: `${variables.pascalCase}DeleteQuery`,
		};
		contracts["delete-response"] = {
			sourceTypeName: `${variables.pascalCase}DeleteResponse`,
		};
		endpoints.push({
			auth: "authenticated",
			method: "DELETE",
			operationId: `delete${variables.pascalCase}Resource`,
			path: itemPath,
			queryContract: "delete-query",
			responseContract: "delete-response",
			summary: `Delete one ${variables.title} resource.`,
			tags: [variables.title],
			wordpressAuth: {
				mechanism: "rest-nonce",
			},
		});
	}

	return defineEndpointManifest({
		contracts,
		endpoints,
		info: {
			title: `${variables.title} REST API`,
			version: "1.0.0",
		},
	});
}

/**
 * Build the endpoint manifest for a type-only manual REST contract. Manual
 * contracts describe routes owned by another integration without generating PHP
 * route glue in the workspace.
 *
 * @param variables Template naming data used for contract names, route path,
 * and OpenAPI info.
 * @returns Endpoint manifest consumed by schema, OpenAPI, and client generators.
 */
export function buildManualRestContractEndpointManifest(
	variables: ManualRestContractTemplateVariablesLike,
) {
	const contracts: Record<string, { sourceTypeName: string }> = {
		query: {
			sourceTypeName: variables.queryTypeName,
		},
		response: {
			sourceTypeName: variables.responseTypeName,
		},
	};
	if (variables.bodyTypeName) {
		contracts.request = {
			sourceTypeName: variables.bodyTypeName,
		};
	}
	const wordpressAuth = resolveManualRestContractWordPressAuth(variables.auth);

	return defineEndpointManifest({
		contracts,
		endpoints: [
			{
				auth: variables.auth,
				...(variables.bodyTypeName ? { bodyContract: "request" } : {}),
				method: variables.method,
				operationId: `call${variables.pascalCase}ManualRestContract`,
				path: `/${variables.namespace}${variables.pathPattern}`,
				queryContract: "query",
				responseContract: "response",
				summary: `Call external ${variables.title} REST route.`,
				tags: [variables.title],
				...(wordpressAuth ? { wordpressAuth } : {}),
			},
		],
		info: {
			title: `${variables.title} Manual REST Contract`,
			version: "1.0.0",
		},
	});
}

/**
 * Synchronize generated schemas, OpenAPI output, and endpoint client code for
 * a workspace-level REST resource scaffold.
 *
 * @param options Resource file paths, enabled methods, and naming variables.
 * @returns A promise that resolves after every generated REST artifact has been refreshed.
 */
export async function syncRestResourceArtifacts({
	clientFile,
	methods,
	outputDir,
	projectDir,
	typesFile,
	validatorsFile,
	variables,
}: SyncRestResourceArtifactsOptions): Promise<void> {
	const manifest = buildRestResourceEndpointManifest(variables, methods);

	for (const [baseName, contract] of Object.entries(manifest.contracts) as Array<
		[string, { sourceTypeName: string }]
	>) {
		await syncTypeSchemas(
			{
				jsonSchemaFile: path.join(outputDir, "api-schemas", `${baseName}.schema.json`),
				openApiFile: path.join(outputDir, "api-schemas", `${baseName}.openapi.json`),
				projectRoot: projectDir,
				sourceTypeName: contract.sourceTypeName,
				typesFile,
			},
		);
	}

	await syncRestOpenApi(
		{
			manifest,
			openApiFile: path.join(outputDir, "api.openapi.json"),
			projectRoot: projectDir,
			typesFile,
		},
	);

	await syncEndpointClient(
		{
			clientFile,
			manifest,
			projectRoot: projectDir,
			typesFile,
			validatorsFile,
		},
	);
}

/**
 * Synchronize generated schemas, OpenAPI output, and endpoint client code for a
 * type-only manual REST contract.
 *
 * @param options Contract file paths and naming variables.
 * @returns A promise that resolves after every generated artifact has refreshed.
 */
export async function syncManualRestContractArtifacts({
	clientFile,
	outputDir,
	projectDir,
	typesFile,
	validatorsFile,
	variables,
}: SyncManualRestContractArtifactsOptions): Promise<void> {
	const manifest = buildManualRestContractEndpointManifest(variables);

	for (const [baseName, contract] of Object.entries(manifest.contracts) as Array<
		[string, { sourceTypeName: string }]
	>) {
		await syncTypeSchemas(
			{
				jsonSchemaFile: path.join(outputDir, "api-schemas", `${baseName}.schema.json`),
				openApiFile: path.join(outputDir, "api-schemas", `${baseName}.openapi.json`),
				projectRoot: projectDir,
				sourceTypeName: contract.sourceTypeName,
				typesFile,
			},
		);
	}

	await syncRestOpenApi(
		{
			manifest,
			openApiFile: path.join(outputDir, "api.openapi.json"),
			projectRoot: projectDir,
			typesFile,
		},
	);

	await syncEndpointClient(
		{
			clientFile,
			manifest,
			projectRoot: projectDir,
			typesFile,
			validatorsFile,
		},
	);
}
