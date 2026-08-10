import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const runtimeRoot = path.join(import.meta.dir, '..', 'src', 'runtime', 'add');

function expectSourceToImport(source: string, moduleSpecifier: string): void {
  const escapedModuleSpecifier = moduleSpecifier.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  expect(source).toMatch(
    new RegExp(`from\\s+(['"])${escapedModuleSpecifier}\\1`),
  );
}

test('cli-add-workspace delegates workspace add workflows to focused helpers', () => {
  const addWorkspaceSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace.ts'),
    'utf8',
  );
  const assetsSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-assets.ts'),
    'utf8',
  );
  const contractSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-contract.ts'),
    'utf8',
  );
  const patternSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-pattern.ts'),
    'utf8',
  );
  const patternAnchorsSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-pattern-anchors.ts'),
    'utf8',
  );
  const patternOptionsSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-pattern-options.ts'),
    'utf8',
  );
  const patternSourceEmittersSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-pattern-source-emitters.ts'),
    'utf8',
  );
  const bindingSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-binding-source.ts'),
    'utf8',
  );
  const bindingSourceAnchorsSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-binding-source-anchors.ts'),
    'utf8',
  );
  const bindingSourceEmittersSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-binding-source-source-emitters.ts'),
    'utf8',
  );
  const bindingSourceTypesSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-binding-source-types.ts'),
    'utf8',
  );
  const editorPluginSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-editor-plugin.ts'),
    'utf8',
  );
  const editorPluginAnchorsSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-editor-plugin-anchors.ts'),
    'utf8',
  );
  const editorPluginEmittersSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-editor-plugin-source-emitters.ts'),
    'utf8',
  );
	const restSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-workspace-rest.ts'),
		'utf8',
	);
	const restGeneratedSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-workspace-rest-generated.ts'),
		'utf8',
	);
	const restManualSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-workspace-rest-manual.ts'),
		'utf8',
	);
	const restPhpTemplatesSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-workspace-rest-php-templates.ts'),
		'utf8',
	);
	const restResourcePhpRoutingTemplateSource = fs.readFileSync(
		path.join(
			runtimeRoot,
			'cli-add-workspace-rest-resource-php-routing-template.ts',
		),
		'utf8',
	);
	const restSchemaHelperPhpTemplateSource = fs.readFileSync(
		path.join(
			runtimeRoot,
			'cli-add-workspace-rest-schema-helper-php-template.ts',
		),
		'utf8',
	);
	const restAnchorsSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-workspace-rest-anchors.ts'),
		'utf8',
	);
	const restBootstrapAnchorsSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-workspace-rest-bootstrap-anchors.ts'),
		'utf8',
	);
	const restContractSyncAnchorsSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-workspace-rest-contract-sync-anchors.ts'),
		'utf8',
	);
	const restResourceSyncAnchorsSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-workspace-rest-resource-sync-anchors.ts'),
		'utf8',
	);
	const restSyncScriptSharedSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-workspace-rest-sync-script-shared.ts'),
		'utf8',
	);
	const restSourceEmittersSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-workspace-rest-source-emitters.ts'),
		'utf8',
	);
	const restGeneratedSourceEmittersSource = fs.readFileSync(
		path.join(
			runtimeRoot,
			'cli-add-workspace-rest-generated-source-emitters.ts',
		),
		'utf8',
	);
	const restManualSourceEmittersSource = fs.readFileSync(
		path.join(
			runtimeRoot,
			'cli-add-workspace-rest-manual-source-emitters.ts',
		),
		'utf8',
	);
	const restSourceUtilsSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-workspace-rest-source-utils.ts'),
		'utf8',
	);
	const restTypesSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-workspace-rest-types.ts'),
		'utf8',
	);
  const postMetaSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-post-meta.ts'),
    'utf8',
  );
  const postMetaAnchorsSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-post-meta-anchors.ts'),
    'utf8',
  );
  const postMetaSourceEmittersSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-post-meta-source-emitters.ts'),
    'utf8',
  );
  const aiSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-ai.ts'),
    'utf8',
  );
  const aiAnchorsSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-ai-anchors.ts'),
    'utf8',
  );
  const aiSyncRestAnchorsSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-ai-sync-rest-anchors.ts'),
    'utf8',
  );
  const aiSourceEmittersSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-ai-source-emitters.ts'),
    'utf8',
  );
  const aiSyncScriptSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-ai-sync-script-source.ts'),
    'utf8',
  );
  const aiScaffoldSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-ai-scaffold.ts'),
    'utf8',
  );
  const abilityScaffoldSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-ability-scaffold.ts'),
    'utf8',
  );
  const abilityAnchorsSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-ability-anchors.ts'),
    'utf8',
  );
  const abilityRegistrySource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-ability-registry.ts'),
    'utf8',
  );
  const integrationEnvSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-integration-env.ts'),
    'utf8',
  );
  const integrationEnvFilesSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-integration-env-files.ts'),
    'utf8',
  );
  const integrationEnvPackageJsonSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-integration-env-package-json.ts'),
    'utf8',
  );
  const integrationEnvSourceEmittersSource = fs.readFileSync(
    path.join(
      runtimeRoot,
      'cli-add-workspace-integration-env-source-emitters.ts',
    ),
    'utf8',
  );
  const adminViewSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-admin-view.ts'),
    'utf8',
  );
  const adminViewSourceHelpers = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-admin-view-source.ts'),
    'utf8',
  );
  const adminViewTemplatesSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-admin-view-templates.ts'),
    'utf8',
  );
  const adminViewCoreDataTemplatesSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-admin-view-templates-core-data.ts'),
    'utf8',
  );
  const adminViewDefaultTemplatesSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-admin-view-templates-default.ts'),
    'utf8',
  );
  const adminViewRestTemplatesSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-admin-view-templates-rest.ts'),
    'utf8',
  );
  const adminViewSettingsTemplatesSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-admin-view-templates-settings.ts'),
    'utf8',
  );
  const adminViewSharedTemplatesSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-admin-view-templates-shared.ts'),
    'utf8',
  );
  const adminViewScaffoldSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-admin-view-scaffold.ts'),
    'utf8',
  );
  const mutationSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-mutation.ts'),
    'utf8',
  );
  const variationSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-variation.ts'),
    'utf8',
  );
  const blockStyleSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-block-style.ts'),
    'utf8',
  );
  const blockTransformSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-block-transform.ts'),
    'utf8',
  );
  const hookedBlockSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-hooked-block.ts'),
    'utf8',
  );
  const registrationHooksSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-registration-hooks.ts'),
    'utf8',
  );

  expectSourceToImport(addWorkspaceSource, './cli-add-workspace-ability.js');
  expectSourceToImport(addWorkspaceSource, './cli-add-workspace-admin-view.js');
  expectSourceToImport(addWorkspaceSource, './cli-add-workspace-assets.js');
  expectSourceToImport(addWorkspaceSource, './cli-add-workspace-contract.js');
  expectSourceToImport(addWorkspaceSource, './cli-add-workspace-integration-env.js');
  expectSourceToImport(addWorkspaceSource, './cli-add-workspace-rest.js');
  expectSourceToImport(addWorkspaceSource, './cli-add-workspace-post-meta.js');
  expectSourceToImport(addWorkspaceSource, './cli-add-workspace-ai.js');
  expectSourceToImport(addWorkspaceSource, './cli-add-workspace-variation.js');
  expectSourceToImport(addWorkspaceSource, './cli-add-workspace-block-style.js');
  expectSourceToImport(addWorkspaceSource, './cli-add-workspace-block-transform.js');
  expectSourceToImport(addWorkspaceSource, './cli-add-workspace-hooked-block.js');
  expect(addWorkspaceSource).toContain('runAddAbilityCommand');
  expect(addWorkspaceSource).toContain('runAddAiFeatureCommand');
  expect(addWorkspaceSource).toContain('runAddAdminViewCommand');
  expect(addWorkspaceSource).toContain('runAddBindingSourceCommand');
  expect(addWorkspaceSource).toContain('runAddBlockStyleCommand');
  expect(addWorkspaceSource).toContain('runAddBlockTransformCommand');
  expect(addWorkspaceSource).toContain('runAddContractCommand');
  expect(addWorkspaceSource).toContain('runAddEditorPluginCommand');
  expect(addWorkspaceSource).toContain('runAddHookedBlockCommand');
  expect(addWorkspaceSource).toContain('runAddIntegrationEnvCommand');
  expect(addWorkspaceSource).toContain('runAddPatternCommand');
  expect(addWorkspaceSource).toContain('runAddPostMetaCommand');
  expect(addWorkspaceSource).toContain('runAddRestResourceCommand');
  expect(addWorkspaceSource).toContain('runAddVariationCommand');
  expect(addWorkspaceSource).not.toContain('function buildPatternSource(');
  expect(addWorkspaceSource).not.toContain(
    'function buildAiFeatureTypesSource(',
  );
  expect(addWorkspaceSource).not.toContain(
    'function buildBindingSourceServerSource(',
  );
  expect(addWorkspaceSource).not.toContain(
    'async function ensureAiFeatureBootstrapAnchors(',
  );
  expect(addWorkspaceSource).not.toContain(
    'async function ensureBindingSourceBootstrapAnchors(',
  );
  expect(addWorkspaceSource).not.toContain(
    'async function ensureEditorPluginBootstrapAnchors(',
  );
  expect(addWorkspaceSource).not.toContain(
    'function buildRestResourceTypesSource(',
  );
  expect(addWorkspaceSource).not.toContain('function buildPostMetaTypesSource(');
  expect(addWorkspaceSource).not.toContain(
    'async function ensureRestResourceBootstrapAnchors(',
  );
  expect(addWorkspaceSource).not.toContain(
    'async function ensurePostMetaBootstrapAnchors(',
  );
  expect(addWorkspaceSource).not.toContain(
    'async function ensureAdminViewBootstrapAnchors(',
  );
  expect(addWorkspaceSource).not.toContain(
    'async function ensureAbilityBootstrapAnchors(',
  );
  expect(addWorkspaceSource).not.toContain('function buildVariationSource(');
  expect(addWorkspaceSource).not.toContain('function buildBlockStyleSource(');
  expect(addWorkspaceSource).not.toContain('function buildBlockTransformSource(');
  expect(addWorkspaceSource).not.toContain(
    'async function ensureVariationRegistrationHook(',
  );
  expect(addWorkspaceSource).not.toContain(
    'async function ensureBlockStyleRegistrationHook(',
  );
  expect(addWorkspaceSource).not.toContain(
    'async function ensureBlockTransformRegistrationHook(',
  );
  expect(addWorkspaceSource).not.toMatch(
    /export\s*\{[^}]*ensureAdminViewBootstrapAnchors[^}]*\}/u,
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddAbilityCommand(',
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddAdminViewCommand(',
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddAiFeatureCommand(',
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddContractCommand(',
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddPatternCommand(',
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddIntegrationEnvCommand(',
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddBindingSourceCommand(',
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddEditorPluginCommand(',
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddRestResourceCommand(',
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddPostMetaCommand(',
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddVariationCommand(',
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddBlockStyleCommand(',
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddBlockTransformCommand(',
  );
  expect(addWorkspaceSource).not.toContain(
    'export async function runAddHookedBlockCommand(',
  );
  expectSourceToImport(assetsSource, './cli-add-workspace-binding-source.js');
  expectSourceToImport(assetsSource, './cli-add-workspace-editor-plugin.js');
  expectSourceToImport(assetsSource, './cli-add-workspace-pattern.js');
  expect(assetsSource).not.toContain('function buildPatternSource(');
  expect(assetsSource).not.toContain('function buildBindingSourceServerSource(');
  expect(assetsSource).not.toContain('function buildEditorPluginEntrySource(');
  expectSourceToImport(patternSource, './cli-add-workspace-pattern-anchors.js');
  expectSourceToImport(patternSource, './cli-add-workspace-pattern-options.js');
  expectSourceToImport(patternSource, './cli-add-workspace-pattern-source-emitters.js');
  expect(patternSource).not.toContain('function buildPatternSource(');
  expect(patternSource).not.toContain(
    'async function ensurePatternBootstrapAnchors(',
  );
  expect(patternSource).not.toContain('function resolvePatternCatalogOptions(');
  expect(patternSource).toContain('export async function runAddPatternCommand(');
  expect(patternAnchorsSource).toContain(
    'export async function ensurePatternBootstrapAnchors(',
  );
  expect(patternAnchorsSource).toContain('syncWorkspacePhpEntrypoints(');
  expect(patternAnchorsSource).toContain("manifestIds: ['patterns']");
  expect(patternAnchorsSource).not.toContain(
    'function ensureNestedPatternLoaderSource(',
  );
  expect(patternAnchorsSource).not.toContain('function buildPatternSource(');
  expect(patternOptionsSource).toContain(
    'export function resolvePatternCatalogOptions(',
  );
  expect(patternOptionsSource).toContain('function normalizePatternTags(');
  expect(patternOptionsSource).not.toContain(
    'async function ensurePatternBootstrapAnchors(',
  );
  expect(patternSourceEmittersSource).toContain(
    'export function buildPatternConfigEntry(',
  );
  expect(patternSourceEmittersSource).toContain(
    'export function buildPatternSource(',
  );
  expect(patternSourceEmittersSource).not.toContain(
    'async function ensurePatternBootstrapAnchors(',
  );
  expect(patternSource).not.toContain('function buildBindingSourceServerSource(');
  expect(patternSource).not.toContain('function buildEditorPluginEntrySource(');
  expectSourceToImport(bindingSource, './cli-add-workspace-binding-source-anchors.js');
  expectSourceToImport(bindingSource, './cli-add-workspace-binding-source-source-emitters.js');
  expectSourceToImport(bindingSource, './cli-add-workspace-binding-source-types.js');
  expect(bindingSource).toContain(
    'export async function runAddBindingSourceCommand(',
  );
  expect(bindingSource).toContain('await ensureBindingSourceBootstrapAnchors(');
  expect(bindingSource).toContain('await resolveBindingSourceRegistryPath(');
  expect(bindingSource).toContain('await writeBindingSourceRegistry(');
  expect(bindingSource).not.toContain('function buildBindingSourceServerSource(');
  expect(bindingSource).not.toContain(
    'async function ensureBindingSourceBootstrapAnchors(',
  );
  expect(bindingSource).not.toContain('function buildBindingSourceIndexSource(');
  expect(bindingSource).not.toContain(
    'async function resolveBindingSourceRegistryPath(',
  );
  expect(bindingSource).not.toContain(
    'async function writeBindingSourceRegistry(',
  );
  expect(bindingSourceEmittersSource).toContain(
    'export function buildBindingSourceServerSource(',
  );
  expect(bindingSourceEmittersSource).toContain(
    'export function buildBindingSourceEditorSource(',
  );
  expect(bindingSourceEmittersSource).toContain(
    'export function buildBindingSourceConfigEntry(',
  );
  expect(bindingSourceEmittersSource).not.toContain(
    'async function ensureBindingSourceBootstrapAnchors(',
  );
  expect(bindingSourceAnchorsSource).toContain(
    'export async function ensureBindingSourceBootstrapAnchors(',
  );
  expect(bindingSourceAnchorsSource).toContain(
    'export async function resolveBindingSourceRegistryPath(',
  );
  expect(bindingSourceAnchorsSource).toContain(
    'export async function writeBindingSourceRegistry(',
  );
  expect(bindingSourceAnchorsSource).not.toContain(
    'function buildBindingSourceServerSource(',
  );
  expect(bindingSourceTypesSource).toContain('export type BindingTarget');
  expect(bindingSourceTypesSource).toContain('export type BindingPostMetaSource');
  expect(bindingSource).not.toContain('function buildPatternSource(');
  expect(bindingSource).not.toContain('function buildEditorPluginEntrySource(');
  expectSourceToImport(editorPluginSource, './cli-add-workspace-editor-plugin-anchors.js');
  expectSourceToImport(editorPluginSource, './cli-add-workspace-editor-plugin-source-emitters.js');
  expect(editorPluginSource).toContain('await ensureEditorPluginBootstrapAnchors(');
  expect(editorPluginSource).toContain('await ensureEditorPluginBuildScriptAnchors(');
  expect(editorPluginSource).toContain('await ensureEditorPluginWebpackAnchors(');
  expect(editorPluginSource).toContain('await resolveEditorPluginRegistryPath(');
  expect(editorPluginSource).toContain('await writeEditorPluginRegistry(');
  expect(editorPluginSource).toContain(
    'export async function runAddEditorPluginCommand(',
  );
  expect(editorPluginSource).not.toContain('function buildEditorPluginEntrySource(');
  expect(editorPluginSource).not.toContain(
    'async function ensureEditorPluginBootstrapAnchors(',
  );
  expect(editorPluginSource).not.toContain(
    'async function ensureEditorPluginBuildScriptAnchors(',
  );
  expect(editorPluginSource).not.toContain(
    'async function ensureEditorPluginWebpackAnchors(',
  );
  expect(editorPluginSource).toMatch(
    /export\s*\{[^}]*ensureEditorPluginBootstrapAnchors[^}]*\}\s*from\s+["']\.\/cli-add-workspace-editor-plugin-anchors\.js["']/u,
  );
  expect(editorPluginEmittersSource).toContain(
    'export function buildEditorPluginEntrySource(',
  );
  expect(editorPluginEmittersSource).toContain(
    'export function buildEditorPluginSurfaceSource(',
  );
  expect(editorPluginEmittersSource).toContain(
    'export function buildEditorPluginConfigEntry(',
  );
  expect(editorPluginEmittersSource).not.toContain(
    'async function ensureEditorPluginBootstrapAnchors(',
  );
  expect(editorPluginAnchorsSource).toContain(
    'export async function ensureEditorPluginBootstrapAnchors(',
  );
  expect(editorPluginAnchorsSource).toContain(
    'export async function ensureEditorPluginBuildScriptAnchors(',
  );
  expect(editorPluginAnchorsSource).toContain(
    'export async function ensureEditorPluginWebpackAnchors(',
  );
  expect(editorPluginAnchorsSource).toContain(
    'export async function resolveEditorPluginRegistryPath(',
  );
  expect(editorPluginAnchorsSource).toContain(
    'export async function writeEditorPluginRegistry(',
  );
  expect(editorPluginAnchorsSource).not.toContain(
    'function buildEditorPluginEntrySource(',
  );
  expect(editorPluginSource).not.toContain('function buildPatternSource(');
  expect(editorPluginSource).not.toContain(
    'function buildBindingSourceServerSource(',
  );
	expectSourceToImport(restSource, './cli-add-workspace-rest-generated.js');
	expectSourceToImport(restSource, './cli-add-workspace-rest-manual.js');
	expectSourceToImport(restSource, './cli-add-workspace-rest-types.js');
	expect(restSource).not.toContain('function buildRestResourceTypesSource(');
	expect(restSource).not.toContain('function buildRestResourcePhpSource(');
	expect(restSource).not.toContain(
		'async function ensureRestResourceBootstrapAnchors(',
	);
	expect(restSource).not.toContain('syncManualRestContractArtifacts');
	expect(restSource).not.toContain('syncRestResourceArtifacts');
	expect(restSource).toContain(
		'export async function runAddRestResourceCommand(',
	);
	expect(restGeneratedSource).toContain(
		'export async function scaffoldGeneratedRestResource(',
	);
	expectSourceToImport(restGeneratedSource, './cli-add-workspace-rest-php-templates.js');
	expectSourceToImport(restGeneratedSource, './cli-add-workspace-rest-schema-helper-php-template.js');
	expectSourceToImport(restGeneratedSource, './cli-add-workspace-rest-generated-source-emitters.js');
	expectSourceToImport(restGeneratedSource, './cli-add-workspace-rest-bootstrap-anchors.js');
	expectSourceToImport(restGeneratedSource, './cli-add-workspace-rest-resource-sync-anchors.js');
	expect(restGeneratedSource).toContain('syncRestResourceArtifacts');
	expect(restManualSource).toContain(
		'export async function scaffoldManualRestContract(',
	);
	expectSourceToImport(restManualSource, './cli-add-workspace-rest-manual-source-emitters.js');
	expectSourceToImport(restManualSource, './cli-add-workspace-rest-resource-sync-anchors.js');
	expect(restManualSource).toContain('syncManualRestContractArtifacts');
	expect(restPhpTemplatesSource).toContain(
		'export function buildRestResourcePhpSource(',
	);
	expectSourceToImport(restPhpTemplatesSource, './cli-add-workspace-rest-resource-php-routing-template.js');
	expectSourceToImport(restPhpTemplatesSource, './cli-add-workspace-rest-schema-helper-php-template.js');
	expect(restPhpTemplatesSource).not.toContain(
		'function buildRestResourceRouteRegistrations(',
	);
	expect(restPhpTemplatesSource).not.toContain(
		'function buildRestResourceControllerClassSource(',
	);
	expect(restPhpTemplatesSource).not.toContain(
		'function buildWorkspaceRestSchemaHelperPhpSource(',
	);
	expect(restResourcePhpRoutingTemplateSource).toContain(
		'export function buildRestResourceRouteRegistrations(',
	);
	expect(restResourcePhpRoutingTemplateSource).toContain(
		'export function buildRestResourceControllerClassSource(',
	);
	expect(restResourcePhpRoutingTemplateSource).toContain(
		'export function buildRestResourceControllerBootstrapSource(',
	);
	expect(restResourcePhpRoutingTemplateSource).not.toContain(
		'buildRestResourcePhpSource',
	);
	expect(restSchemaHelperPhpTemplateSource).toContain(
		'export function buildWorkspaceRestSchemaHelperPhpSource(',
	);
	expect(restSchemaHelperPhpTemplateSource).not.toContain(
		'buildRestResourcePhpSource',
	);
	expect(restTypesSource).toContain(
		'export interface RunAddRestResourceCommandResult',
	);
	expectSourceToImport(restSourceEmittersSource, './cli-add-workspace-rest-generated-source-emitters.js');
	expectSourceToImport(restSourceEmittersSource, './cli-add-workspace-rest-manual-source-emitters.js');
	expect(restSourceEmittersSource).not.toContain(
		'function buildRestResourceTypesSource(',
	);
	expect(restSourceEmittersSource).not.toContain(
		'function buildManualRestContractTypesSource(',
	);
	expect(restGeneratedSourceEmittersSource).toContain(
		'export function buildRestResourceTypesSource(',
	);
	expect(restGeneratedSourceEmittersSource).toContain(
		'export function buildRestResourceApiSource(',
	);
	expect(restGeneratedSourceEmittersSource).toContain(
		'export function buildRestResourceDataSource(',
	);
	expect(restGeneratedSourceEmittersSource).not.toContain(
		'buildManualRestContract',
	);
	expect(restManualSourceEmittersSource).toContain(
		'export function buildManualRestContractApiSource(',
	);
	expect(restManualSourceEmittersSource).toContain(
		'export function buildManualRestContractTypesSource(',
	);
	expect(restManualSourceEmittersSource).not.toContain(
		'buildRestResourceTypesSource',
	);
	expect(restSourceUtilsSource).toContain(
		'export function formatResolveRestNonceSource(',
	);
	expect(restSourceUtilsSource).not.toContain('buildRestResource');
	expect(restSourceUtilsSource).not.toContain('buildManualRestContract');
	expectSourceToImport(restAnchorsSource, './cli-add-workspace-rest-bootstrap-anchors.js');
	expectSourceToImport(restAnchorsSource, './cli-add-workspace-rest-contract-sync-anchors.js');
	expectSourceToImport(restAnchorsSource, './cli-add-workspace-rest-resource-sync-anchors.js');
	expect(restAnchorsSource).not.toContain(
		'async function ensureRestResourceBootstrapAnchors(',
	);
	expect(restAnchorsSource).not.toContain(
		'async function ensureRestSchemaHelperBootstrapAnchors(',
	);
	expect(restAnchorsSource).not.toContain(
		'async function ensureContractSyncScriptAnchors(',
	);
	expect(restAnchorsSource).not.toContain(
		'async function ensureRestResourceSyncScriptAnchors(',
	);
	expect(restBootstrapAnchorsSource).toContain(
		'async function ensureRestResourceBootstrapAnchors(',
	);
	expect(restBootstrapAnchorsSource).toContain(
		'async function ensureRestSchemaHelperBootstrapAnchors(',
	);
	expect(restBootstrapAnchorsSource).not.toContain(
		'async function ensureRestResourceSyncScriptAnchors(',
	);
	expect(restContractSyncAnchorsSource).toContain(
		'async function ensureContractSyncScriptAnchors(',
	);
	expectSourceToImport(restContractSyncAnchorsSource, './cli-add-workspace-rest-sync-script-shared.js');
	expect(restContractSyncAnchorsSource).not.toContain(
		'async function ensureRestResourceSyncScriptAnchors(',
	);
	expect(restResourceSyncAnchorsSource).toContain(
		'async function ensureRestResourceSyncScriptAnchors(',
	);
	expectSourceToImport(restResourceSyncAnchorsSource, './cli-add-workspace-rest-sync-script-shared.js');
	expect(restResourceSyncAnchorsSource).not.toContain(
		'async function ensureContractSyncScriptAnchors(',
	);
	expect(restSyncScriptSharedSource).toContain(
		'export function replaceBlockConfigImport(',
	);
	expect(restSyncScriptSharedSource).toContain(
		'export function buildNoResourcesGuard(',
	);
	expect(restSyncScriptSharedSource).not.toContain(
		'async function ensureContractSyncScriptAnchors(',
	);
	expect(restSyncScriptSharedSource).not.toContain(
		'async function ensureRestResourceSyncScriptAnchors(',
	);
  expectSourceToImport(contractSource, './cli-add-workspace-rest-contract-sync-anchors.js');
  expectSourceToImport(postMetaSource, './cli-add-workspace-post-meta-anchors.js');
  expectSourceToImport(postMetaSource, './cli-add-workspace-rest-contract-sync-anchors.js');
  expectSourceToImport(postMetaSource, './cli-add-workspace-post-meta-source-emitters.js');
  expect(postMetaSource).toContain(
    'export async function runAddPostMetaCommand(',
  );
  expect(postMetaSource).not.toContain('function buildPostMetaTypesSource(');
  expect(postMetaSource).not.toContain(
    'async function ensurePostMetaBootstrapAnchors(',
  );
  expect(postMetaSourceEmittersSource).toContain(
    'function buildPostMetaTypesSource(',
  );
  expect(postMetaSourceEmittersSource).toContain(
    'function buildPostMetaPhpSource(',
  );
  expect(postMetaAnchorsSource).toContain(
    'async function ensurePostMetaBootstrapAnchors(',
  );
  expect(postMetaAnchorsSource).toContain(
    'async function ensurePostMetaSyncScriptAnchors(',
  );
  expectSourceToImport(aiScaffoldSource, './cli-add-workspace-ai-anchors.js');
  expectSourceToImport(aiScaffoldSource, './cli-add-workspace-ai-source-emitters.js');
  expectSourceToImport(aiScaffoldSource, './cli-add-workspace-ai-sync-script-source.js');
  expectSourceToImport(aiScaffoldSource, './cli-add-workspace-ai-sync-rest-anchors.js');
  expect(aiScaffoldSource).not.toContain('function buildAiFeatureTypesSource(');
  expect(aiScaffoldSource).not.toContain(
    'async function ensureAiFeatureBootstrapAnchors(',
  );
  expectSourceToImport(aiScaffoldSource, './cli-add-workspace-ai-templates.js');
  expect(aiSource).toContain('export async function runAddAiFeatureCommand(');
  expect(aiSourceEmittersSource).toContain(
    'function buildAiFeatureTypesSource(',
  );
  expect(aiSourceEmittersSource).toContain('function buildAiFeatureApiSource(');
  expect(aiSourceEmittersSource).toContain(
    'function buildAiFeatureDataSource(',
  );
  expectSourceToImport(aiSourceEmittersSource, './cli-add-workspace-ai-sync-script-source.js');
  expect(aiSourceEmittersSource).not.toContain(
    'function buildAiFeatureSyncScriptSource(',
  );
  expect(aiSyncScriptSource).toContain(
    'export function buildAiFeatureSyncScriptSource(',
  );
  expect(aiSyncScriptSource).toContain(
    'projectWordPressAiSchema',
  );
  expect(aiSyncScriptSource).not.toContain('function buildAiFeatureApiSource(');
	expect(aiAnchorsSource).toContain(
		'async function ensureAiFeatureBootstrapAnchors(',
	);
	expect(aiAnchorsSource).toMatch(
		/export\s*\{[^}]*ensureAiFeatureSyncRestAnchors[^}]*\}\s*from\s+["']\.\/cli-add-workspace-ai-sync-rest-anchors\.js["']/u,
	);
	expect(aiAnchorsSource).not.toContain(
		'async function ensureAiFeatureSyncRestAnchors(',
	);
  expect(aiAnchorsSource).not.toContain('function buildAiFeatureNoResourcesGuard(');
  expect(aiSyncRestAnchorsSource).toContain(
    'export async function ensureAiFeatureSyncRestAnchors(',
  );
	expect(aiSyncRestAnchorsSource).toContain(
		'function buildAiFeatureNoResourcesGuard(',
	);
	expect(aiSyncRestAnchorsSource).toContain(
		'feature.restManifest.contracts !== null',
	);
	expect(aiSyncRestAnchorsSource).not.toContain(
		'async function ensureAiFeatureBootstrapAnchors(',
	);
  expectSourceToImport(integrationEnvSource, './cli-add-workspace-integration-env-files.js');
  expectSourceToImport(integrationEnvSource, './cli-add-workspace-integration-env-package-json.js');
  expectSourceToImport(integrationEnvSource, './cli-add-workspace-integration-env-source-emitters.js');
  expect(integrationEnvSource).toContain(
    'export async function runAddIntegrationEnvCommand(',
  );
  expect(integrationEnvSource).not.toContain(
    'function buildIntegrationSmokeScriptSource(',
  );
  expect(integrationEnvSource).not.toContain(
    'function addIntegrationEnvPackageJsonEntries(',
  );
  expect(integrationEnvSource).not.toContain(
    'async function appendMissingLines(',
  );
  expect(integrationEnvSource).not.toContain('DEFAULT_WORDPRESS_ENV_VERSION');
  expect(integrationEnvFilesSource).toContain(
    'export async function appendMissingLines(',
  );
  expect(integrationEnvFilesSource).toContain(
    'export async function writeFileIfAbsent(',
  );
  expect(integrationEnvFilesSource).toContain(
    'export async function writeNewScaffoldFile(',
  );
  expect(integrationEnvFilesSource).not.toContain(
    'function buildIntegrationSmokeScriptSource(',
  );
  expect(integrationEnvPackageJsonSource).toContain(
    'export function addIntegrationEnvPackageJsonEntries(',
  );
  expect(integrationEnvPackageJsonSource).toContain(
    'export async function mutateIntegrationEnvPackageJson(',
  );
  expect(integrationEnvPackageJsonSource).toContain(
    'DEFAULT_WORDPRESS_ENV_VERSION',
  );
  expect(integrationEnvPackageJsonSource).not.toContain(
    'function buildIntegrationSmokeScriptSource(',
  );
  expect(integrationEnvSourceEmittersSource).toContain(
    'export function buildIntegrationSmokeScriptSource(',
  );
  expect(integrationEnvSourceEmittersSource).toContain(
    'export function buildIntegrationEnvReadmeSource(',
  );
  expect(integrationEnvSourceEmittersSource).toContain(
    'export function buildWpEnvConfigSource(',
  );
  expect(integrationEnvSourceEmittersSource).not.toContain(
    'function addIntegrationEnvPackageJsonEntries(',
  );
  expect(adminViewSource).toContain(
    'export async function runAddAdminViewCommand(',
  );
  expect(adminViewSource).toContain(
    "from './cli-add-workspace-admin-view-source.js'",
  );
  expect(adminViewSource).toContain(
    "from './cli-add-workspace-admin-view-scaffold.js'",
  );
  expect(adminViewSource).not.toContain('function buildAdminViewScreenSource(');
  expect(adminViewSource).not.toContain(
    'async function ensureAdminViewBootstrapAnchors(',
  );
  expect(adminViewSourceHelpers).toContain(
    'export function parseAdminViewSource(',
  );
  expect(adminViewSourceHelpers).toContain(
    'export function assertAdminViewPackageAvailability(',
  );
  expect(adminViewScaffoldSource).toContain(
    "from './cli-add-workspace-admin-view-templates.js'",
  );
  expect(adminViewScaffoldSource).toContain("from '../shared/package-versions.js'");
  expect(adminViewScaffoldSource).toContain(
    'async function ensureAdminViewBootstrapAnchors(',
  );
  expect(adminViewScaffoldSource).toContain(
    'export async function scaffoldAdminViewWorkspace(',
  );
  expect(adminViewTemplatesSource).toContain(
    'export function buildAdminViewScreenSource(',
  );
  expect(adminViewTemplatesSource).toContain(
    'export function buildAdminViewPhpSource(',
  );
  expect(adminViewDefaultTemplatesSource).toContain(
    'export function buildDefaultAdminViewDataSource(',
  );
  expect(adminViewRestTemplatesSource).toContain(
    'export function buildRestAdminViewDataSource(',
  );
  expect(adminViewCoreDataTemplatesSource).toContain(
    'export function buildCoreDataAdminViewDataSource(',
  );
  expect(adminViewSettingsTemplatesSource).toContain(
    'export function buildRestSettingsAdminViewScreenSource(',
  );
  expect(adminViewSharedTemplatesSource).toContain(
    'export function buildAdminViewPhpSource(',
  );
  expect(adminViewTemplatesSource).not.toContain(
    'export async function runAddAdminViewCommand(',
  );
  expect(variationSource).toContain('function buildVariationSource(');
  expect(variationSource).toContain(
    'async function ensureVariationRegistrationHook(',
  );
  expect(variationSource).toContain(
    'export async function runAddVariationCommand(',
  );
  expectSourceToImport(variationSource, './cli-add-workspace-registration-hooks.js');
  expect(variationSource).not.toContain('function buildBlockStyleSource(');
  expect(variationSource).not.toContain('function buildBlockTransformSource(');
  expect(blockStyleSource).toContain('function buildBlockStyleSource(');
  expect(blockStyleSource).toContain(
    'async function ensureBlockStyleRegistrationHook(',
  );
  expect(blockStyleSource).toContain(
    'export async function runAddBlockStyleCommand(',
  );
  expectSourceToImport(blockStyleSource, './cli-add-workspace-registration-hooks.js');
  expect(blockStyleSource).not.toContain('function buildVariationSource(');
  expect(blockStyleSource).not.toContain('function buildBlockTransformSource(');
  expect(blockTransformSource).toContain('function buildBlockTransformSource(');
  expect(blockTransformSource).toContain(
    'async function ensureBlockTransformRegistrationHook(',
  );
  expect(blockTransformSource).toContain(
    'export async function runAddBlockTransformCommand(',
  );
  expectSourceToImport(blockTransformSource, './cli-add-workspace-registration-hooks.js');
  expect(blockTransformSource).not.toContain('function buildVariationSource(');
  expect(blockTransformSource).not.toContain('function buildBlockStyleSource(');
  expect(hookedBlockSource).toContain(
    'export async function runAddHookedBlockCommand(',
  );
  expect(hookedBlockSource).not.toContain('function buildVariationSource(');
  expect(hookedBlockSource).not.toContain('function buildBlockStyleSource(');
  expect(hookedBlockSource).not.toContain('function buildBlockTransformSource(');
  expect(registrationHooksSource).toContain(
    'export function findExecutableCallRange(',
  );
  expect(registrationHooksSource).toContain(
    'export async function ensureWorkspaceEntrypointCall(',
  );
  expect(registrationHooksSource).toContain(
    'export async function ensureWorkspaceRegistrationSettingsCall(',
  );
  expectSourceToImport(abilityScaffoldSource, './cli-add-workspace-ability-anchors.js');
  expectSourceToImport(abilityScaffoldSource, './cli-add-workspace-ability-registry.js');
  expect(abilityScaffoldSource).not.toContain(
    'async function ensureAbilityBootstrapAnchors(',
  );
  expect(abilityScaffoldSource).not.toContain(
    'function resolveManagedDependencyVersion(',
  );
  expect(abilityScaffoldSource).not.toContain(
    'async function writeAbilityRegistry(',
  );
  expect(abilityAnchorsSource).toContain(
    'export async function ensureAbilityBootstrapAnchors(',
  );
  expect(abilityAnchorsSource).toContain(
    'export async function ensureAbilityWebpackAnchors(',
  );
  expect(abilityRegistrySource).toContain(
    'export async function resolveAbilityRegistryPath(',
  );
  expect(abilityRegistrySource).toContain(
    'export async function writeAbilityRegistry(',
  );
  for (const scaffoldSource of [
    abilityScaffoldSource,
    adminViewScaffoldSource,
    aiScaffoldSource,
    hookedBlockSource,
    integrationEnvSource,
  ]) {
    expect(scaffoldSource).toContain('executeWorkspaceMutationPlan');
    expect(scaffoldSource).not.toContain('rollbackWorkspaceMutation');
    expect(scaffoldSource).not.toContain('snapshotWorkspaceFiles');
  }
  expect(mutationSource).toContain('insertPhpSnippetBeforeWorkspaceAnchors');
  expect(mutationSource).toContain('appendPhpSnippetBeforeClosingTag');
	for (const bootstrapAnchorSource of [
		abilityAnchorsSource,
		aiAnchorsSource,
		bindingSourceAnchorsSource,
		editorPluginAnchorsSource,
		patternAnchorsSource,
		postMetaAnchorsSource,
		restBootstrapAnchorsSource,
	]) {
    expect(bootstrapAnchorSource).toContain(
      'insertPhpSnippetBeforeWorkspaceAnchors',
    );
    expect(bootstrapAnchorSource).toContain('appendPhpSnippetBeforeClosingTag');
    expect(bootstrapAnchorSource).not.toContain('const insertPhpSnippet');
    expect(bootstrapAnchorSource).not.toContain('const appendPhpSnippet');
  }
});
