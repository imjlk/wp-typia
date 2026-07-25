import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  ArtifactSyncExecutionOptions,
  SyncBlockMetadataOptions,
  SyncBlockMetadataResult,
  SyncInnerBlocksTemplateModuleOptions,
  SyncInnerBlocksTemplateModuleResult,
  SyncRestOpenApiOptions,
  SyncRestOpenApiResult,
  SyncTypeSchemaOptions,
  SyncTypeSchemaResult,
} from './metadata-core.js';
import type {
  GeneratedArtifactDriftIssue,
  GeneratedArtifactFile,
} from './metadata-core-artifacts.js';
import {
  reconcileGeneratedArtifacts,
  resolveSyncBlockMetadataPaths,
} from './metadata-core-artifacts.js';
import { normalizeSyncRestOpenApiOptions } from './metadata-core-endpoint-client.js';
import {
  applyBlockNestingMetadata,
  getInnerBlocksTemplatesFromNesting,
  renderInnerBlocksTemplateModule,
  validateInnerBlocksTemplates,
  validateBlockNestingContract,
} from './metadata-core-nesting.js';
import { renderPhpValidator } from './metadata-php-render.js';
import { analyzeSourceType, analyzeSourceTypes } from './metadata-parser.js';
import {
  createBlockJsonAttribute,
  createExampleValue,
  createManifestDocument,
  validateWordPressExtractionAttributes,
} from './metadata-projection.js';
import {
  buildEndpointOpenApiDocument,
  manifestToJsonSchema,
  manifestToOpenApi,
  projectJsonSchemaDocument,
} from './schema-core.js';

export async function syncBlockMetadataArtifacts(
	options: SyncBlockMetadataOptions,
	executionOptions: ArtifactSyncExecutionOptions = {},
): Promise<SyncBlockMetadataResult> {
  const { blockJsonPath, jsonSchemaPath, manifestPath, openApiPath, phpValidatorPath } =
		resolveSyncBlockMetadataPaths(options);
  const { rootNode } = analyzeSourceType(options);

  if (rootNode.kind !== 'object' || rootNode.properties === undefined) {
    throw new Error(
      `Source type "${options.sourceTypeName}" must resolve to an object shape`,
    );
  }
  validateWordPressExtractionAttributes(rootNode.properties);

  const driftIssues: GeneratedArtifactDriftIssue[] = [];
  const lossyProjectionWarnings: string[] = [];
  let blockJsonArtifact: GeneratedArtifactFile | null = null;

  if (fs.existsSync(blockJsonPath)) {
    const blockJson = JSON.parse(
      fs.readFileSync(blockJsonPath, 'utf8'),
    ) as Record<string, unknown>;
    if (options.nesting) {
      validateBlockNestingContract(options.nesting, {
        allowExternalBlockNames: options.allowExternalBlockNames,
        knownBlockNames: options.knownBlockNames,
      });
      if (typeof blockJson.name !== 'string' || blockJson.name.trim() === '') {
        throw new Error(
          `block.json at ${blockJsonPath} must define a string "name" before applying block nesting metadata.`,
        );
      }
      applyBlockNestingMetadata({
        blockJson,
        blockName: blockJson.name,
        nesting: options.nesting,
      });
    }

    blockJson.attributes = Object.fromEntries(
      Object.entries(rootNode.properties).map(([key, node]) => [
        key,
        createBlockJsonAttribute(node, lossyProjectionWarnings),
      ]),
    );
    blockJson.example = {
      attributes: Object.fromEntries(
        Object.entries(rootNode.properties).map(([key, node]) => [
          key,
          createExampleValue(node, key),
        ]),
      ),
    };

    blockJsonArtifact = {
      content: JSON.stringify(blockJson, null, '\t'),
      path: blockJsonPath,
    };
  } else if (executionOptions.check === true) {
    driftIssues.push({
      path: blockJsonPath,
      reason: 'missing',
    });
  } else {
    fs.readFileSync(blockJsonPath, 'utf8');
  }

  if (blockJsonArtifact === null) {
    Object.values(rootNode.properties).forEach((node) => {
      createBlockJsonAttribute(node, lossyProjectionWarnings);
    });
  }

  const manifest = createManifestDocument(
    options.sourceTypeName,
    rootNode.properties,
  );
  const manifestContent = JSON.stringify(manifest, null, '\t');
  const jsonSchemaContent = jsonSchemaPath
    ? JSON.stringify(manifestToJsonSchema(manifest as never), null, '\t')
    : null;
  const openApiContent = openApiPath
    ? JSON.stringify(
        manifestToOpenApi(manifest as never, {
          title: options.sourceTypeName,
        }),
        null,
        '\t',
      )
    : null;
  const phpValidator = renderPhpValidator(manifest);

  reconcileGeneratedArtifacts(
		[
			...(blockJsonArtifact ? [blockJsonArtifact] : []),
			{
				content: manifestContent,
				path: manifestPath,
			},
			...(jsonSchemaContent && jsonSchemaPath
				? [
						{
							content: jsonSchemaContent,
							path: jsonSchemaPath,
						},
					]
				: []),
			...(openApiContent && openApiPath
				? [
						{
							content: openApiContent,
							path: openApiPath,
						},
					]
				: []),
			{
				content: phpValidator.source,
				path: phpValidatorPath,
			},
		],
		executionOptions,
		driftIssues,
	);

  return {
    attributeNames: Object.keys(rootNode.properties),
    blockJsonPath,
    ...(jsonSchemaPath ? { jsonSchemaPath } : {}),
    lossyProjectionWarnings: [...new Set(lossyProjectionWarnings)].sort(),
    manifestPath,
    ...(openApiPath ? { openApiPath } : {}),
    phpGenerationWarnings: [...new Set(phpValidator.warnings)].sort(),
    phpValidatorPath,
  };
}

export async function syncTypeSchemaArtifacts(
	options: SyncTypeSchemaOptions,
	executionOptions: ArtifactSyncExecutionOptions = {},
): Promise<SyncTypeSchemaResult> {
  const { projectRoot, rootNode } = analyzeSourceType(options);
  if (rootNode.kind !== 'object' || rootNode.properties === undefined) {
    throw new Error(
      `Source type "${options.sourceTypeName}" must resolve to an object shape for schema generation`,
    );
  }

  const manifest = createManifestDocument(
    options.sourceTypeName,
    rootNode.properties,
  );

  const jsonSchemaPath = path.resolve(projectRoot, options.jsonSchemaFile);
  const openApiPath = options.openApiFile
    ? path.resolve(projectRoot, options.openApiFile)
    : undefined;
  reconcileGeneratedArtifacts(
		[
			{
				content: JSON.stringify(
					projectJsonSchemaDocument(manifestToJsonSchema(manifest as never), {
						profile: 'rest',
					}),
					null,
					'\t',
				),
				path: jsonSchemaPath,
			},
			...(openApiPath
				? [
						{
							content: JSON.stringify(
								manifestToOpenApi(
									manifest as never,
									options.openApiInfo ?? { title: options.sourceTypeName },
								),
								null,
								'\t',
							),
							path: openApiPath,
						},
					]
				: []),
		],
		executionOptions,
	);

  return {
    jsonSchemaPath,
    openApiPath,
    sourceTypeName: options.sourceTypeName,
  };
}

export async function syncInnerBlocksTemplateModuleArtifacts(
	options: SyncInnerBlocksTemplateModuleOptions,
	executionOptions: ArtifactSyncExecutionOptions = {},
): Promise<SyncInnerBlocksTemplateModuleResult> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const outputPath = path.resolve(projectRoot, options.outputFile);
  validateBlockNestingContract(options.nesting, {
    allowExternalBlockNames: options.allowExternalBlockNames,
    knownBlockNames: options.knownBlockNames,
  });
  const templates =
		options.templates ?? getInnerBlocksTemplatesFromNesting(options.nesting);

  validateInnerBlocksTemplates(templates, {
    allowExternalBlockNames: options.allowExternalBlockNames,
    knownBlockNames: options.knownBlockNames,
    nesting: options.nesting,
  });

  reconcileGeneratedArtifacts(
    [
      {
        content: renderInnerBlocksTemplateModule(templates, {
          exportName: options.exportName,
        }),
        path: outputPath,
      },
    ],
    executionOptions,
  );

  return {
    outputPath,
    templateNames: Object.keys(templates).sort(),
  };
}

export async function syncRestOpenApiArtifacts(
	options: SyncRestOpenApiOptions,
	executionOptions: ArtifactSyncExecutionOptions = {},
): Promise<SyncRestOpenApiResult> {
  const { manifest, openApiPath, projectRoot, typesFile } =
		normalizeSyncRestOpenApiOptions(options);
  const sourceTypeNames = [
		...new Set(
			Object.values(manifest.contracts).map(
				(contract) => contract.sourceTypeName,
			),
		),
	];
  const analyzedTypes = analyzeSourceTypes(
    {
      projectRoot,
      typesFile,
    },
    sourceTypeNames,
  );
  const contracts = Object.fromEntries(
		Object.entries(manifest.contracts).map(([contractKey, contract]) => {
			const rootNode = analyzedTypes[contract.sourceTypeName];
			if (rootNode.kind !== 'object' || rootNode.properties === undefined) {
				throw new Error(
					`Source type "${contract.sourceTypeName}" must resolve to an object shape for REST OpenAPI generation`,
				);
			}

			return [
				contractKey,
				{
					document: createManifestDocument(
						contract.sourceTypeName,
						rootNode.properties,
					),
					...(typeof contract.schemaName === 'string' &&
					contract.schemaName.length > 0
						? { schemaName: contract.schemaName }
						: {}),
				},
			];
		}),
	);
  reconcileGeneratedArtifacts(
    [
      {
        content: JSON.stringify(
          buildEndpointOpenApiDocument({
            contracts,
            endpoints: manifest.endpoints,
            info: manifest.info,
          }),
          null,
          '\t',
        ),
        path: openApiPath,
      },
    ],
    executionOptions,
  );

  return {
    endpointCount: manifest.endpoints.length,
    openApiPath,
    schemaNames: Object.values(manifest.contracts).map(
      (contract) => contract.schemaName ?? contract.sourceTypeName,
    ),
  };
}
