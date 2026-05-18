import {
	syncTypeSchemas,
} from "@wp-typia/block-runtime/metadata-core";

interface SyncStandaloneContractArtifactsOptions {
	projectDir: string;
	schemaFile: string;
	sourceTypeName: string;
	typesFile: string;
}

/**
 * Generate the JSON Schema artifact for a standalone TypeScript contract.
 *
 * @param options Workspace-relative type/schema paths plus the exported source
 * type name.
 */
export async function syncStandaloneContractArtifacts({
	projectDir,
	schemaFile,
	sourceTypeName,
	typesFile,
}: SyncStandaloneContractArtifactsOptions): Promise<void> {
	await syncTypeSchemas({
		jsonSchemaFile: schemaFile,
		projectRoot: projectDir,
		sourceTypeName,
		typesFile,
	});
}
