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

/** Inputs used to plan and sync one persistence scaffold's REST artifacts. */
export interface SyncPersistenceRestArtifactsOptions {
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
			"state-query": {
				sourceTypeName: `${variables.pascalCase}StateQuery`,
			},
			"bootstrap-query": {
				sourceTypeName: `${variables.pascalCase}BootstrapQuery`,
			},
			"write-state-request": {
				sourceTypeName: `${variables.pascalCase}WriteStateRequest`,
			},
			"bootstrap-response": {
				sourceTypeName: `${variables.pascalCase}BootstrapResponse`,
			},
			"state-response": {
				sourceTypeName: `${variables.pascalCase}StateResponse`,
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

/** Output paths and metadata for one persistence REST contract schema. */
export interface PersistenceRestArtifactSchemaPlan {
	jsonSchemaFile: string;
	openApiFile: string;
	openApiInfo: {
		title: string;
		version: string;
	};
	sourceTypeName: string;
}

/** Complete compiler-derived output plan for one persistence REST surface. */
export interface PersistenceRestArtifactPlan {
	clientFile: string;
	manifest: ReturnType<typeof buildPersistenceEndpointManifest>;
	openApiFile: string;
	schemas: PersistenceRestArtifactSchemaPlan[];
}

/**
 * Build the canonical output plan shared by scaffold generation and previews.
 *
 * @param options Scaffold output paths plus persistence template variables.
 * @returns REST schema, aggregate OpenAPI, and client output paths.
 */
export function buildPersistenceRestArtifactPlan(
	options: SyncPersistenceRestArtifactsOptions,
): PersistenceRestArtifactPlan {
	const manifest = buildPersistenceEndpointManifest(options.variables);

	return {
		clientFile: path.join(options.outputDir, "api-client.ts"),
		manifest,
		openApiFile: path.join(options.outputDir, "api.openapi.json"),
		schemas: Object.entries(manifest.contracts).map(([baseName, contract]) => ({
			jsonSchemaFile: path.join(
				options.outputDir,
				"api-schemas",
				`${baseName}.schema.json`,
			),
			openApiFile: path.join(
				options.outputDir,
				"api-schemas",
				`${baseName}.openapi.json`,
			),
			openApiInfo: {
				title: contract.sourceTypeName,
				version: "1.0.0",
			},
			sourceTypeName: contract.sourceTypeName,
		})),
	};
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
	const plan = buildPersistenceRestArtifactPlan({
		apiTypesFile,
		outputDir,
		projectDir,
		variables,
	});

	for (const schema of plan.schemas) {
		await syncTypeSchemas(
			{
				...schema,
				projectRoot: projectDir,
				typesFile: apiTypesFile,
			},
		);
	}

	await syncRestOpenApi(
		{
			manifest: plan.manifest,
			openApiFile: plan.openApiFile,
			projectRoot: projectDir,
			typesFile: apiTypesFile,
		},
	);

	await syncEndpointClient(
		{
			clientFile: plan.clientFile,
			manifest: plan.manifest,
			projectRoot: projectDir,
			typesFile: apiTypesFile,
		},
	);
}
