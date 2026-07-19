import path from "node:path";

import type { SyncBlockMetadataOptions } from "@wp-typia/block-runtime/metadata-core";

import {
	buildPersistenceRestArtifactPlan,
	type SyncPersistenceRestArtifactsOptions,
} from "../add/persistence-rest-artifacts.js";
import type { BuiltInBlockArtifact } from "./built-in-block-artifacts.js";
import { buildBuiltInBlockArtifacts } from "./built-in-block-artifacts.js";
import type { ScaffoldTemplateVariables } from "./scaffold.js";
import { emitsBuiltInPersistenceArtifacts } from "./scaffold-template-variable-groups.js";
import {
	type BuiltInTemplateId,
	isBuiltInTemplateId,
} from "./template-registry.js";

function normalizeArtifactPath(value: string): string {
	return value.replace(/\\/gu, "/");
}

/**
 * Build the canonical sync options for each typed block in a built-in scaffold.
 */
export function buildBuiltInBlockMetadataSyncOptions(
	projectDir: string,
	templateId: BuiltInTemplateId,
	artifacts: readonly BuiltInBlockArtifact[],
): SyncBlockMetadataOptions[] {
	const emitsSchemaDocuments =
		templateId === "persistence" || templateId === "compound";

	return artifacts.map((artifact) => {
		const sourceTypeName = artifact.manifestDocument.sourceType;
		if (!sourceTypeName) {
			throw new Error(
				`Built-in block artifact at ${artifact.relativeDir} is missing its source type name.`,
			);
		}

		return {
			blockJsonFile: path.join(artifact.relativeDir, "block.json"),
			...(emitsSchemaDocuments
				? {
						jsonSchemaFile: path.join(
							artifact.relativeDir,
							"typia.schema.json",
						),
						openApiFile: path.join(
							artifact.relativeDir,
							"typia.openapi.json",
						),
					}
				: {}),
			manifestFile: path.join(
				artifact.relativeDir,
				"typia.manifest.json",
			),
			phpValidatorFile: path.join(
				artifact.relativeDir,
				"typia-validator.php",
			),
			projectRoot: projectDir,
			sourceTypeName,
			typesFile: path.join(artifact.relativeDir, "types.ts"),
		};
	});
}

/**
 * Resolve the canonical REST sync input for a persistence-enabled scaffold.
 */
export function buildBuiltInPersistenceRestSyncOptions(
	projectDir: string,
	templateId: BuiltInTemplateId,
	variables: ScaffoldTemplateVariables,
): SyncPersistenceRestArtifactsOptions | null {
	if (!emitsBuiltInPersistenceArtifacts(templateId, variables)) {
		return null;
	}

	const outputDir =
		templateId === "persistence"
			? "src"
			: path.join("src", "blocks", variables.slugKebabCase);

	return {
		apiTypesFile: path.join(outputDir, "api-types.ts"),
		outputDir,
		projectDir,
		variables,
	};
}

/**
 * Collect every compiler-derived path without executing the compiler.
 */
export function collectBuiltInCompilerArtifactPaths(
	templateId: string,
	variables: ScaffoldTemplateVariables,
): string[] {
	if (!isBuiltInTemplateId(templateId)) {
		return [];
	}

	const artifacts = buildBuiltInBlockArtifacts({ templateId, variables });
	const blockOptions = buildBuiltInBlockMetadataSyncOptions(
		".",
		templateId,
		artifacts,
	);
	const files = new Set(
		blockOptions.flatMap((options) =>
			[
				options.blockJsonFile,
				options.manifestFile,
				options.phpValidatorFile,
				options.jsonSchemaFile,
				options.openApiFile,
			]
				.filter((value): value is string => value !== undefined)
				.map(normalizeArtifactPath),
		),
	);
	const persistenceOptions = buildBuiltInPersistenceRestSyncOptions(
		".",
		templateId,
		variables,
	);
	if (persistenceOptions) {
		const plan = buildPersistenceRestArtifactPlan(persistenceOptions);
		for (const schema of plan.schemas) {
			files.add(normalizeArtifactPath(schema.jsonSchemaFile));
			files.add(normalizeArtifactPath(schema.openApiFile));
		}
		files.add(normalizeArtifactPath(plan.openApiFile));
		files.add(normalizeArtifactPath(plan.clientFile));
	}

	return [...files];
}
