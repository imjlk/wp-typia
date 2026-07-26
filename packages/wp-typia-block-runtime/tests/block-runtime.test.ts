import { describe, expect, test } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { toValidatorAccessExpression } from '../src/metadata-core-endpoint-client.js';

const importModule = (specifier: string) => import(specifier);

function writeMockPackage(projectRoot: string, packageName: string, version: string) {
  const packageDir = resolve(
    projectRoot,
    'node_modules',
    ...packageName.split('/'),
  );
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    resolve(packageDir, 'package.json'),
    JSON.stringify({ name: packageName, version }, null, 2),
    'utf8',
  );
}

describe('@wp-typia/block-runtime', () => {
	test('supported self imports resolve through the published entrypoints', async () => {
		const [
			rootModule,
			blocksModule,
			schemaCoreModule,
			schemaTestModule,
			migrationTypesModule,
			metadataCoreModule,
			defaultsModule,
			editorModule,
			identifiersModule,
			inspectorModule,
			validationModule,
		] = await Promise.all([
			import('@wp-typia/block-runtime'),
			import('@wp-typia/block-runtime/blocks'),
			import('@wp-typia/block-runtime/schema-core'),
			import('@wp-typia/block-runtime/schema-test'),
			import('@wp-typia/block-runtime/migration-types'),
			import('@wp-typia/block-runtime/metadata-core'),
			import('@wp-typia/block-runtime/defaults'),
			import('@wp-typia/block-runtime/editor'),
			import('@wp-typia/block-runtime/identifiers'),
			import('@wp-typia/block-runtime/inspector'),
			import('@wp-typia/block-runtime/validation'),
		]);

		expect(typeof rootModule.buildScaffoldBlockRegistration).toBe('function');
		expect(typeof rootModule.assertManifestDefaultsDocument).toBe('function');
		expect(typeof rootModule.assertManifestDocument).toBe('function');
		expect(typeof rootModule.assertScaffoldBlockMetadata).toBe('function');
		expect(typeof rootModule.applyTemplateDefaultsFromManifest).toBe('function');
		expect(typeof rootModule.createEditorModel).toBe('function');
		expect(typeof rootModule.parseManifestDefaultsDocument).toBe('function');
		expect(typeof rootModule.parseManifestDocument).toBe('function');
		expect(typeof rootModule.parseScaffoldBlockMetadata).toBe('function');
		expect(typeof rootModule.createAttributeUpdater).toBe('function');
		expect(typeof rootModule.createNestedAttributeUpdater).toBe('function');
		expect(typeof blocksModule.createTypiaWebpackConfig).toBe('function');
		expect(typeof blocksModule.buildScaffoldBlockRegistration).toBe('function');
		expect(typeof blocksModule.defineScaffoldBlockMetadata).toBe('function');
		expect(typeof blocksModule.assertScaffoldBlockMetadata).toBe('function');
		expect(typeof blocksModule.parseScaffoldBlockMetadata).toBe('function');
		expect(typeof schemaCoreModule.manifestToJsonSchema).toBe('function');
		expect(typeof schemaCoreModule.manifestToOpenApi).toBe('function');
		expect(typeof schemaCoreModule.normalizeEndpointAuthDefinition).toBe('function');
		expect(typeof schemaTestModule.assertResponseMatchesSchema).toBe('function');
		expect(typeof schemaTestModule.createResponseSchemaValidator).toBe('function');
		expect(Object.keys(migrationTypesModule)).toEqual([]);
		expect(typeof metadataCoreModule.defineBlockNesting).toBe('function');
		expect(typeof metadataCoreModule.defineInnerBlocksTemplates).toBe('function');
		expect(typeof metadataCoreModule.defineEndpointManifest).toBe('function');
		expect(typeof metadataCoreModule.validateBlockPatternContentNesting).toBe(
			'function',
		);
		expect(
			typeof metadataCoreModule.formatBlockPatternContentNestingDiagnostics,
		).toBe('function');
		expect(typeof metadataCoreModule.syncInnerBlocksTemplateModule).toBe('function');
		expect(typeof metadataCoreModule.runSyncBlockMetadata).toBe('function');
		expect(typeof metadataCoreModule.resolveSyncBlockMetadataPaths).toBe(
			'function',
		);
		expect(typeof metadataCoreModule.syncEndpointClient).toBe('function');
		expect(typeof metadataCoreModule.syncRestOpenApi).toBe('function');
		expect(typeof defaultsModule.applyTemplateDefaultsFromManifest).toBe('function');
		expect(typeof defaultsModule.defineManifestDefaultsDocument).toBe('function');
		expect(typeof defaultsModule.assertManifestDefaultsDocument).toBe('function');
		expect(typeof defaultsModule.parseManifestDefaultsDocument).toBe('function');
		expect(typeof editorModule.createEditorModel).toBe('function');
		expect(typeof editorModule.defineManifestDocument).toBe('function');
		expect(typeof editorModule.assertManifestDocument).toBe('function');
		expect(typeof editorModule.parseManifestDocument).toBe('function');
		expect(typeof identifiersModule.collectPersistentBlockIdentityRepairs).toBe(
			'function',
		);
		expect(typeof identifiersModule.ensurePersistentBlockIdentity).toBe(
			'function',
		);
		expect(typeof identifiersModule.generateBlockId).toBe('function');
		expect(typeof identifiersModule.generatePublicWriteRequestId).toBe('function');
		expect(typeof inspectorModule.useEditorFields).toBe('function');
		expect(typeof inspectorModule.usePersistentBlockIdentity).toBe('function');
		expect(typeof inspectorModule.parseManifestDocument).toBe('function');
		expect(typeof validationModule.toValidationResult).toBe('function');
		expect(typeof blocksModule.assertTypiaWebpackCompatibility).toBe('function');
		expect(typeof blocksModule.loadCompatibleTypiaWebpackPlugin).toBe('function');

		expect('generateBlockId' in rootModule).toBe(false);
		expect('manifestToOpenApi' in rootModule).toBe(false);
		expect('syncRestOpenApi' in rootModule).toBe(false);
	});

	test('unsupported subpaths are not exported', async () => {
		await expect(importModule('@wp-typia/block-runtime/runtime')).rejects.toThrow();
	});

	test('built root entry preserves ESM-safe .js re-export specifiers', () => {
		const packageRoot = resolve(import.meta.dir, '..');
		const builtIndexJs = readFileSync(resolve(packageRoot, 'dist/index.js'), 'utf8');
		const builtIndexDts = readFileSync(resolve(packageRoot, 'dist/index.d.ts'), 'utf8');
		const builtBlocksJs = readFileSync(resolve(packageRoot, 'dist/blocks.js'), 'utf8');
		const builtBlocksDts = readFileSync(resolve(packageRoot, 'dist/blocks.d.ts'), 'utf8');

		expect(builtIndexJs).toContain("export * from './blocks.js';");
		expect(builtIndexJs).toContain("export * from './defaults.js';");
		expect(builtIndexJs).toContain("export * from './editor.js';");
		expect(builtIndexJs).toContain("export * from './validation.js';");
		expect(builtIndexDts).toContain("export * from './blocks.js';");
		expect(builtIndexDts).toContain("export * from './defaults.js';");
		expect(builtIndexDts).toContain("export * from './editor.js';");
		expect(builtIndexDts).toContain("export * from './validation.js';");
		expect(builtBlocksJs).toContain("export * from './blocks-registration.js';");
		expect(builtBlocksJs).toContain("export * from './blocks-webpack.js';");
		expect(builtBlocksDts).toContain("export * from './blocks-registration.js';");
		expect(builtBlocksDts).toContain("export * from './blocks-webpack.js';");
	});

	test('endpoint client generation supports optional named route captures', async () => {
		const { defineEndpointManifest, syncEndpointClient } = await import(
			'@wp-typia/block-runtime/metadata-core'
		);
		const projectRoot = mkdtempSync(resolve(tmpdir(), 'wp-typia-client-path-'));

		try {
			writeFileSync(
				resolve(projectRoot, 'api-types.ts'),
				[
					'export interface OptionalItemQuery {',
					'\tid?: string;',
					'\tslug?: string;',
					'}',
					'',
					'export interface OptionalItemResponse {',
					'\tok: boolean;',
					'}',
					'',
				].join('\n'),
				'utf8',
			);
			writeFileSync(
				resolve(projectRoot, 'api-validators.ts'),
				[
					'import type { OptionalItemQuery, OptionalItemResponse } from "./api-types.js";',
					'',
					'export const apiValidators = {',
					'\tquery: (input: unknown) => ({ data: input as OptionalItemQuery, errors: [], isValid: true }),',
					'\tresponse: (input: unknown) => ({ data: input as OptionalItemResponse, errors: [], isValid: true }),',
					'};',
					'',
				].join('\n'),
				'utf8',
			);

			await syncEndpointClient({
				clientFile: 'api-client.ts',
				manifest: defineEndpointManifest({
					contracts: {
						query: {
							sourceTypeName: 'OptionalItemQuery',
						},
						response: {
							sourceTypeName: 'OptionalItemResponse',
						},
					},
					endpoints: [
						{
							auth: 'public',
							method: 'GET',
							operationId: 'listOptionalPreviewItems',
							path: '/items(?:/preview)?',
							responseContract: 'response',
							tags: ['Items'],
						},
						{
							auth: 'public',
							method: 'GET',
							operationId: 'fetchOptionalItem',
							path: '/items(?:/(?P<id>[\\d]+(?:-[\\d]+)*)/(?P<slug>[a-z]+))?',
							queryContract: 'query',
							responseContract: 'response',
							tags: ['Items'],
						},
						{
							auth: 'public',
							method: 'GET',
							operationId: 'fetchOptionalItemWithNestedSlug',
							path: '/items(?:/(?P<id>[\\d]+)(?:/(?P<slug>[a-z]+))?)?',
							queryContract: 'query',
							responseContract: 'response',
							tags: ['Items'],
						},
						{
							auth: 'public',
							method: 'GET',
							operationId: 'fetchOptionalItemAlternative',
							path: '/items(?:/(?P<id>[\\d]+)|/(?P<slug>[a-z]+))?',
							queryContract: 'query',
							responseContract: 'response',
							tags: ['Items'],
						},
						{
							auth: 'public',
							method: 'GET',
							operationId: 'fetchLatestOrOptionalItem',
							path: '/items(?:/latest|/(?P<id>[\\d]+))?',
							queryContract: 'query',
							responseContract: 'response',
							tags: ['Items'],
						},
					],
				}),
				projectRoot,
				typesFile: 'api-types.ts',
				validatorsFile: 'api-validators.ts',
			});

			const clientSource = readFileSync(
				resolve(projectRoot, 'api-client.ts'),
				'utf8',
			);
			expect(clientSource).toContain('const rawPathParams = request as unknown;');
			expect(clientSource).not.toContain('Missing path parameter "id"');
			expect(clientSource).not.toContain('Missing path parameter "slug"');
			expect(clientSource).toContain('buildRequestOptions: () => {');
			expect(clientSource).toContain('path: `/items`,');
			expect(clientSource).toContain(
				"path: `/items${pathParam0 !== undefined && pathParam0 !== null && pathParam0 !== '' && pathParam1 !== undefined && pathParam1 !== null && pathParam1 !== '' ? `/${encodeURIComponent( String( pathParam0 ) )}/${encodeURIComponent( String( pathParam1 ) )}` : ''}`,",
			);
			expect(clientSource).toContain(
				"path: `/items${pathParam0 !== undefined && pathParam0 !== null && pathParam0 !== '' ? `/${encodeURIComponent( String( pathParam0 ) )}${pathParam1 !== undefined && pathParam1 !== null && pathParam1 !== '' ? `/${encodeURIComponent( String( pathParam1 ) )}` : ''}` : ''}`,",
			);
			expect(clientSource).toContain(
				"path: `/items${pathParam0 !== undefined && pathParam0 !== null && pathParam0 !== '' ? `/${encodeURIComponent( String( pathParam0 ) )}` : pathParam1 !== undefined && pathParam1 !== null && pathParam1 !== '' ? `/${encodeURIComponent( String( pathParam1 ) )}` : ''}`,",
			);
			expect(clientSource).toContain(
				"path: `/items${pathParam0 !== undefined && pathParam0 !== null && pathParam0 !== '' ? `/${encodeURIComponent( String( pathParam0 ) )}` : `/latest`}`,",
			);
			await expect(
				syncEndpointClient({
					clientFile: 'path-only-client.ts',
					manifest: defineEndpointManifest({
						contracts: {
							response: {
								sourceTypeName: 'OptionalItemResponse',
							},
						},
						endpoints: [
							{
								auth: 'public',
								method: 'GET',
								operationId: 'fetchPathOnlyItem',
								path: '/items/(?P<id>[\\d]+)',
								responseContract: 'response',
								tags: ['Items'],
							},
						],
					}),
					projectRoot,
					typesFile: 'api-types.ts',
					validatorsFile: 'api-validators.ts',
				}),
			).rejects.toThrow(
				'uses named path captures but does not define a query or body contract',
			);
		} finally {
			rmSync(projectRoot, { force: true, recursive: true });
		}
	});

	test('endpoint validator access strips trailing contract separators', () => {
		const seenPropertyNames = new Map<string, string>();
		expect(toValidatorAccessExpression('state-query', seenPropertyNames)).toBe(
			'apiValidators.stateQuery',
		);
		expect(() =>
			toValidatorAccessExpression('state-query-', seenPropertyNames),
		).toThrow(
			'Contract keys "state-query" and "state-query-" both normalize to apiValidators[\'stateQuery\']',
		);
	});

	test('Typia/Webpack compatibility preflight accepts the supported matrix', async () => {
		const blocksModule = await import('@wp-typia/block-runtime/blocks');
		const projectRoot = mkdtempSync(resolve(tmpdir(), 'wp-typia-compat-ok-'));

		try {
			writeFileSync(
				resolve(projectRoot, 'package.json'),
				JSON.stringify({ name: 'compat-ok', private: true }, null, 2),
				'utf8',
			);
			writeMockPackage(projectRoot, 'typia', '13.2.0');
			writeMockPackage(projectRoot, 'ttsc', '0.22.0');
			writeMockPackage(projectRoot, 'typescript', '7.0.2');
			writeMockPackage(projectRoot, '@ttsc/unplugin', '0.22.0');
			writeMockPackage(projectRoot, '@wordpress/scripts', '30.22.0');
			writeMockPackage(projectRoot, 'webpack', '5.106.0');

			await expect(
				blocksModule.assertTypiaWebpackCompatibility({ projectRoot }),
			).resolves.toEqual(
				expect.objectContaining({
					'@ttsc/unplugin': '0.22.0',
					'@wordpress/scripts': '30.22.0',
					ttsc: '0.22.0',
					typescript: '7.0.2',
					typia: '13.2.0',
					webpack: '5.106.0',
				}),
			);
		} finally {
			rmSync(projectRoot, { force: true, recursive: true });
		}
	});

	test('Typia/Webpack compatibility preflight explains unsupported tuples', async () => {
		const blocksModule = await import('@wp-typia/block-runtime/blocks');
		const projectRoot = mkdtempSync(resolve(tmpdir(), 'wp-typia-compat-bad-'));

		try {
			writeFileSync(
				resolve(projectRoot, 'package.json'),
				JSON.stringify({ name: 'compat-bad', private: true }, null, 2),
				'utf8',
			);
			writeMockPackage(projectRoot, 'typia', '11.0.0');
			writeMockPackage(projectRoot, 'ttsc', '0.22.0');
			writeMockPackage(projectRoot, 'typescript', '7.0.2');
			writeMockPackage(projectRoot, '@ttsc/unplugin', '0.22.0');
			writeMockPackage(projectRoot, '@wordpress/scripts', '30.22.0');
			writeMockPackage(projectRoot, 'webpack', '5.106.0');

			await expect(
				blocksModule.assertTypiaWebpackCompatibility({ projectRoot }),
			).rejects.toThrow(
				/Installed versions: typia=11\.0\.0, ttsc=0\.22\.0, typescript=7\.0\.2, @ttsc\/unplugin=0\.22\.0, @wordpress\/scripts=30\.22\.0, webpack=5\.106\.0\..*Supported matrix: typia 13\.x, ttsc 0\.22\.x, TypeScript 7\.x, @ttsc\/unplugin 0\.22\.x, @wordpress\/scripts 30\.x with webpack 5\.x\./s,
			);
		} finally {
			rmSync(projectRoot, { force: true, recursive: true });
		}
	});

	test('Typia/Webpack compatibility preflight prefers webpack resolved from @wordpress/scripts', async () => {
		const blocksModule = await import('@wp-typia/block-runtime/blocks');
		const projectRoot = mkdtempSync(resolve(tmpdir(), 'wp-typia-compat-nested-'));

		try {
			writeFileSync(
				resolve(projectRoot, 'package.json'),
				JSON.stringify({ name: 'compat-nested', private: true }, null, 2),
				'utf8',
			);
			writeMockPackage(projectRoot, 'typia', '13.2.0');
			writeMockPackage(projectRoot, 'ttsc', '0.22.0');
			writeMockPackage(projectRoot, 'typescript', '7.0.2');
			writeMockPackage(projectRoot, '@ttsc/unplugin', '0.22.0');
			writeMockPackage(projectRoot, '@wordpress/scripts', '30.22.0');
			writeMockPackage(projectRoot, 'webpack', '4.47.0');

			const wordpressScriptsNodeModules = resolve(
				projectRoot,
				'node_modules',
				'@wordpress',
				'scripts',
				'node_modules',
			);
			mkdirSync(resolve(wordpressScriptsNodeModules, 'webpack'), {
				recursive: true,
			});
			writeFileSync(
				resolve(wordpressScriptsNodeModules, 'webpack', 'package.json'),
				JSON.stringify({ name: 'webpack', version: '5.106.0' }, null, 2),
				'utf8',
			);

			await expect(
				blocksModule.assertTypiaWebpackCompatibility({ projectRoot }),
			).resolves.toEqual(
				expect.objectContaining({
					webpack: '5.106.0',
				}),
			);
		} finally {
			rmSync(projectRoot, { force: true, recursive: true });
		}
	});

	test('REST schemas and OpenAPI document write-only secret fields', async () => {
		const { defineEndpointManifest, syncRestOpenApi, syncTypeSchemas } =
			await import('@wp-typia/block-runtime/metadata-core');
		const packageRoot = resolve(import.meta.dir, '..');
		const projectRoot = mkdtempSync(resolve(packageRoot, '.tmp-secret-schema-'));

		try {
			writeFileSync(
				resolve(projectRoot, 'api-types.ts'),
				[
					"import type { tags } from '@wp-typia/block-runtime/typia-tags';",
					'',
					'export interface SettingsUpdateRequest {',
					"\tapiKey?: string & tags.MinLength< 1 > & tags.Secret< 'hasApiKey' > & tags.PreserveOnEmpty< true >;",
					'\twebhookSecret?: string & tags.WriteOnly< true >;',
					'}',
					'',
					'export interface SettingsResponse {',
					'\thasApiKey: boolean;',
					'\twebhookConfigured: boolean;',
					'}',
					'',
				].join('\n'),
				'utf8',
			);

			await syncTypeSchemas({
				jsonSchemaFile: 'request.schema.json',
				openApiFile: 'request.openapi.json',
				projectRoot,
				sourceTypeName: 'SettingsUpdateRequest',
				typesFile: 'api-types.ts',
			});
			await syncTypeSchemas({
				jsonSchemaFile: 'response.schema.json',
				projectRoot,
				sourceTypeName: 'SettingsResponse',
				typesFile: 'api-types.ts',
			});
			await syncRestOpenApi({
				manifest: defineEndpointManifest({
					contracts: {
						request: {
							sourceTypeName: 'SettingsUpdateRequest',
						},
						response: {
							sourceTypeName: 'SettingsResponse',
						},
					},
					endpoints: [
						{
							auth: 'authenticated',
							bodyContract: 'request',
							method: 'POST',
							operationId: 'updateSettings',
							path: '/demo/v1/settings',
							responseContract: 'response',
							tags: ['Settings'],
							wordpressAuth: {
								mechanism: 'rest-nonce',
							},
						},
					],
				}),
				openApiFile: 'api.openapi.json',
				projectRoot,
				typesFile: 'api-types.ts',
			});

			const requestSchema = JSON.parse(
				readFileSync(resolve(projectRoot, 'request.schema.json'), 'utf8'),
			) as {
				properties: Record<string, Record<string, unknown>>;
			};
			const responseSchema = JSON.parse(
				readFileSync(resolve(projectRoot, 'response.schema.json'), 'utf8'),
			) as {
				properties: Record<string, unknown>;
			};
			const openApi = JSON.parse(
				readFileSync(resolve(projectRoot, 'api.openapi.json'), 'utf8'),
			) as {
				components: {
					schemas: Record<string, { properties: Record<string, Record<string, unknown>> }>;
				};
			};

			expect(requestSchema.properties.apiKey).toMatchObject({
				description:
					'Write-only secret value. Responses should expose only masked state.',
				writeOnly: true,
				'x-wp-typia-preserveOnEmpty': true,
				'x-wp-typia-secret': true,
				'x-wp-typia-secretStateField': 'hasApiKey',
			});
			expect(requestSchema.properties.webhookSecret).toMatchObject({
				writeOnly: true,
			});
			expect(responseSchema.properties).not.toHaveProperty('apiKey');
			expect(responseSchema.properties).toHaveProperty('hasApiKey');
			expect(
				openApi.components.schemas.SettingsUpdateRequest.properties.apiKey,
			).toMatchObject({
				writeOnly: true,
				'x-wp-typia-preserveOnEmpty': true,
				'x-wp-typia-secret': true,
				'x-wp-typia-secretStateField': 'hasApiKey',
			});
			expect(
				openApi.components.schemas.SettingsResponse.properties,
			).not.toHaveProperty('apiKey');
		} finally {
			rmSync(projectRoot, { force: true, recursive: true });
		}
	});
});
