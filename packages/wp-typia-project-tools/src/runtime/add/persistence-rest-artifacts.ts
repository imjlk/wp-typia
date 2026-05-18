import path from "node:path";

import {
	defineEndpointManifest,
	syncEndpointClient,
	syncRestOpenApi,
	syncTypeSchemas,
} from "@wp-typia/block-runtime/metadata-core";

interface PersistenceTemplateVariablesLike {
	namespace: string;
	pascalCase: string;
	restWriteAuthIntent: "authenticated" | "public-write-protected";
	restWriteAuthMechanism: "public-signed-token" | "rest-nonce";
	slugKebabCase: string;
	title: string;
}

interface SyncPersistenceRestArtifactsOptions {
	apiTypesFile: string;
	outputDir: string;
	projectDir: string;
	variables: PersistenceTemplateVariablesLike;
}

/**
 * Build the canonical persistence REST endpoint manifest for scaffold-time
 * schema, OpenAPI, and client generation.
 *
 * @param variables Persistence template naming and auth metadata.
 * @returns Endpoint manifest covering bootstrap, state read, and state write operations.
 */
export function buildPersistenceEndpointManifest(
	variables: PersistenceTemplateVariablesLike,
) {
	return defineEndpointManifest({
		contracts: {
			"bootstrap-query": {
				sourceTypeName: `${variables.pascalCase}BootstrapQuery`,
			},
			"bootstrap-response": {
				sourceTypeName: `${variables.pascalCase}BootstrapResponse`,
			},
			"state-query": {
				sourceTypeName: `${variables.pascalCase}StateQuery`,
			},
			"state-response": {
				sourceTypeName: `${variables.pascalCase}StateResponse`,
			},
			"write-state-request": {
				sourceTypeName: `${variables.pascalCase}WriteStateRequest`,
			},
		},
		endpoints: [
			{
				auth: "public",
				method: "GET",
				operationId: `get${variables.pascalCase}State`,
				path: `/${variables.namespace}/v1/${variables.slugKebabCase}/state`,
				queryContract: "state-query",
				responseContract: "state-response",
				summary: "Read the current persisted state.",
				tags: [variables.title],
			},
			{
				auth: variables.restWriteAuthIntent,
				bodyContract: "write-state-request",
				method: "POST",
				operationId: `write${variables.pascalCase}State`,
				path: `/${variables.namespace}/v1/${variables.slugKebabCase}/state`,
				responseContract: "state-response",
				summary: "Write the current persisted state.",
				tags: [variables.title],
				wordpressAuth: {
					mechanism: variables.restWriteAuthMechanism,
				},
			},
			{
				auth: "public",
				method: "GET",
				operationId: `get${variables.pascalCase}Bootstrap`,
				path: `/${variables.namespace}/v1/${variables.slugKebabCase}/bootstrap`,
				queryContract: "bootstrap-query",
				responseContract: "bootstrap-response",
				summary: "Read fresh session bootstrap state for the current viewer.",
				tags: [variables.title],
			},
		],
		info: {
			title: `${variables.title} REST API`,
			version: "1.0.0",
		},
	});
}

/**
 * Generate the REST-derived persistence artifacts for a scaffolded block.
 *
 * @param options Scaffold output paths plus persistence template variables.
 * @returns A promise that resolves after schema, OpenAPI, and client files are written.
 */
export async function syncPersistenceRestArtifacts({
	apiTypesFile,
	outputDir,
	projectDir,
	variables,
}: SyncPersistenceRestArtifactsOptions): Promise<void> {
	const manifest = buildPersistenceEndpointManifest(variables);

	for (const [baseName, contract] of Object.entries(manifest.contracts) as Array<
		[string, { sourceTypeName: string }]
	>) {
		await syncTypeSchemas(
			{
				jsonSchemaFile: path.join(outputDir, "api-schemas", `${baseName}.schema.json`),
				openApiFile: path.join(outputDir, "api-schemas", `${baseName}.openapi.json`),
				projectRoot: projectDir,
				sourceTypeName: contract.sourceTypeName,
				typesFile: apiTypesFile,
			},
		);
	}

	await syncRestOpenApi(
		{
			manifest,
			openApiFile: path.join(outputDir, "api.openapi.json"),
			projectRoot: projectDir,
			typesFile: apiTypesFile,
		},
	);

	await syncEndpointClient(
		{
			clientFile: path.join(outputDir, "api-client.ts"),
			manifest,
			projectRoot: projectDir,
			typesFile: apiTypesFile,
		},
	);
}
