import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const packageRoot = path.resolve(import.meta.dir, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const projectToolsRuntimeRoot = path.join(packageRoot, 'src', 'runtime');
const projectToolsRuntimeDomains = [
  'add',
  'cli',
  'doctor',
  'migration',
  'schema',
  'shared',
  'templates',
  'workspace',
] as const;

describe('@wp-typia/project-tools import policy', () => {
  test('exports project orchestration helpers without re-exporting generated runtime helpers', async () => {
    const [
      rootModule,
      aiArtifactsModule,
      typiaLlmModule,
      schemaCoreModule,
      migrationTypesModule,
      metadataCoreModule,
    ] = await Promise.all([
      import('@wp-typia/project-tools'),
      import('@wp-typia/project-tools/ai-artifacts'),
      import('@wp-typia/project-tools/typia-llm'),
      import('@wp-typia/project-tools/schema-core'),
      import('@wp-typia/block-runtime/migration-types'),
      import('@wp-typia/block-runtime/metadata-core'),
    ]);

    expect(typeof rootModule.collectScaffoldAnswers).toBe('function');
    expect(rootModule.BLOCK_GENERATION_TOOL_CONTRACT_VERSION).toBe(1);
    expect(typeof rootModule.BlockGeneratorService).toBe('function');
    expect(typeof rootModule.formatAddHelpText).toBe('function');
    expect(typeof rootModule.formatMigrationHelpText).toBe('function');
    expect(typeof rootModule.getDoctorChecks).toBe('function');
    expect(typeof rootModule.getPackageVersions).toBe('function');
    expect(typeof rootModule.getTemplateById).toBe('function');
    expect(typeof rootModule.inspectBlockGeneration).toBe('function');
    expect(typeof rootModule.listTemplates).toBe('function');
    expect(typeof rootModule.parseMigrationArgs).toBe('function');
    expect(typeof rootModule.projectJsonSchemaDocument).toBe('function');
    expect(typeof rootModule.resolvePackageManagerId).toBe('function');
    expect(typeof rootModule.runAddBlockCommand).toBe('function');
    expect(typeof rootModule.runMigrationCommand).toBe('function');
    expect(typeof rootModule.runScaffoldFlow).toBe('function');
    expect(typeof rootModule.clearPackageVersionsCache).toBe('function');
    expect(typeof rootModule.invalidatePackageVersionsCache).toBe('function');
    expect(typeof aiArtifactsModule.syncWordPressAiArtifacts).toBe('function');
    expect(typeof aiArtifactsModule.projectWordPressAiSchema).toBe('function');
    expect(
      typeof typiaLlmModule.buildTypiaLlmEndpointMethodDescriptors,
    ).toBe('function');
    expect(
      typeof typiaLlmModule.projectTypiaLlmApplicationArtifact,
    ).toBe('function');
    expect(
      typeof typiaLlmModule.projectTypiaLlmApplicationFunction,
    ).toBe('function');
    expect(
      typeof typiaLlmModule.projectTypiaLlmStructuredOutputArtifact,
    ).toBe('function');
    expect(typeof typiaLlmModule.syncTypiaLlmAdapterModule).toBe('function');
    expect(typeof typiaLlmModule.renderTypiaLlmModule).toBe('function');
    expect(typeof schemaCoreModule.normalizeEndpointAuthDefinition).toBe(
      'function',
    );
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
    expect(typeof metadataCoreModule.syncInnerBlocksTemplateModule).toBe(
      'function',
    );

    expect('applyTemplateDefaultsFromManifest' in rootModule).toBe(false);
    expect('buildScaffoldBlockRegistration' in rootModule).toBe(false);
    expect('createAttributeUpdater' in rootModule).toBe(false);
    expect('createEditorModel' in rootModule).toBe(false);
    expect('runSyncBlockMetadata' in rootModule).toBe(false);
  });

  test('does not expose legacy runtime compatibility subpaths', async () => {
    const packageManifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as {
      bin?: Record<string, string>;
      exports?: Record<string, unknown>;
    };

    expect(packageManifest.bin).toBeUndefined();
    expect(packageManifest.exports?.['./cli']).toBeUndefined();
    expect(packageManifest.exports?.['./metadata-core']).toBeUndefined();
    expect(packageManifest.exports?.['./runtime/cli-core']).toBeUndefined();
    expect(packageManifest.exports?.['./runtime/schema-core']).toBeUndefined();

    const importRemovedCli = new Function(
      "return import('@wp-typia/project-tools/cli');",
    ) as () => Promise<unknown>;
    const importRemovedRuntime = new Function(
      "return import('@wp-typia/project-tools/runtime/blocks');",
    ) as () => Promise<unknown>;

    await expect(importRemovedCli()).rejects.toThrow();
    await expect(importRemovedRuntime()).rejects.toThrow();
  });

  test('public docs point to the new canonical package map', () => {
    const projectToolsReadme = fs.readFileSync(
      path.join(packageRoot, 'README.md'),
      'utf8',
    );
    const apiGuide = fs.readFileSync(
      path.join(
        repoRoot,
        'apps',
        'docs',
        'src',
        'content',
        'docs',
        'reference',
        'api.md',
      ),
      'utf8',
    );
    const runtimeSurfaceDoc = fs.readFileSync(
      path.join(
        repoRoot,
        'apps',
        'docs',
        'src',
        'content',
        'docs',
        'architecture',
        'runtime-surface.md',
      ),
      'utf8',
    );
    const blockGeneratorDoc = fs.readFileSync(
      path.join(
        repoRoot,
        'apps',
        'docs',
        'src',
        'content',
        'docs',
        'architecture',
        'block-generator-service.md',
      ),
      'utf8',
    );
    const blockGeneratorArchitectureDoc = fs.readFileSync(
      path.join(
        repoRoot,
        'apps',
        'docs',
        'src',
        'content',
        'docs',
        'architecture',
        'block-generator-architecture.md',
      ),
      'utf8',
    );
    const externalTemplateLayerDoc = fs.readFileSync(
      path.join(
        repoRoot,
        'apps',
        'docs',
        'src',
        'content',
        'docs',
        'architecture',
        'external-template-layer-composition.md',
      ),
      'utf8',
    );
    const importPolicyDoc = fs.readFileSync(
      path.join(
        repoRoot,
        'apps',
        'docs',
        'src',
        'content',
        'docs',
        'architecture',
        'runtime-import-policy.md',
      ),
      'utf8',
    );

    expect(projectToolsReadme).toContain('@wp-typia/project-tools');
    expect(projectToolsReadme).toContain(
      '@wp-typia/project-tools/ai-artifacts',
    );
    expect(projectToolsReadme).toContain(
      '@wp-typia/project-tools/typia-llm',
    );
    expect(projectToolsReadme).toContain('@wp-typia/project-tools/schema-core');
    expect(projectToolsReadme).toContain('BlockGeneratorService');
    expect(projectToolsReadme).toContain('inspectBlockGeneration');
    expect(projectToolsReadme).toContain(
      'docs/block-generator-tool-contract.md',
    );
    expect(projectToolsReadme).toContain('@wp-typia/block-runtime/*');
    expect(projectToolsReadme).toContain(
      '@wp-typia/block-runtime/migration-types',
    );
    expect(projectToolsReadme).toContain('@wp-typia/block-runtime/schema-core');
    expect(projectToolsReadme).not.toContain('@wp-typia/create');
    expect(apiGuide).toContain('@wp-typia/project-tools');
    expect(apiGuide).toContain('@wp-typia/project-tools/ai-artifacts');
    expect(apiGuide).toContain('@wp-typia/project-tools/typia-llm');
    expect(apiGuide).toContain('BlockGeneratorService');
    expect(apiGuide).toContain('inspectBlockGeneration');
    expect(apiGuide).toContain('docs/block-generator-architecture.md');
    expect(apiGuide).toContain('docs/block-generator-tool-contract.md');
    expect(apiGuide).toContain('docs/external-template-layer-composition.md');
    expect(apiGuide).toContain('@wp-typia/project-tools/schema-core');
    expect(apiGuide).toContain('@wp-typia/block-runtime/metadata-core');
    expect(runtimeSurfaceDoc).toContain('@wp-typia/project-tools');
    expect(runtimeSurfaceDoc).toContain('BlockGeneratorService');
    expect(runtimeSurfaceDoc).toContain('inspectBlockGeneration');
    expect(runtimeSurfaceDoc).toContain('docs/block-generator-architecture.md');
    expect(runtimeSurfaceDoc).toContain(
      'docs/block-generator-tool-contract.md',
    );
    expect(runtimeSurfaceDoc).toContain(
      'docs/external-template-layer-composition.md',
    );
    expect(runtimeSurfaceDoc).toContain('@wp-typia/project-tools/schema-core');
    expect(runtimeSurfaceDoc).toContain(
      '@wp-typia/block-runtime/migration-types',
    );
    expect(runtimeSurfaceDoc).toContain('@wp-typia/block-runtime/schema-core');
    expect(runtimeSurfaceDoc).not.toContain('@wp-typia/create');
    expect(runtimeSurfaceDoc).toContain(
      'no longer ship structural, TS/TSX, style, or block-local',
    );
    expect(runtimeSurfaceDoc).toContain('render.php` Mustache files');
    expect(blockGeneratorDoc).toContain(
      'built-in templates no longer ship structural, TS/TSX, style, or block-local',
    );
    expect(blockGeneratorDoc).toContain('docs/block-generator-architecture.md');
    expect(blockGeneratorDoc).toContain(
      'docs/block-generator-tool-contract.md',
    );
    expect(blockGeneratorDoc).toContain(
      'docs/external-template-layer-composition.md',
    );
    expect(blockGeneratorArchitectureDoc).toContain('BlockSpec');
    expect(blockGeneratorArchitectureDoc).toContain('BlockGeneratorService');
    expect(blockGeneratorArchitectureDoc).toContain('Agentica');
    expect(blockGeneratorArchitectureDoc).toContain('MCP');
    expect(blockGeneratorArchitectureDoc).toContain('plan');
    expect(blockGeneratorArchitectureDoc).toContain('validate');
    expect(blockGeneratorArchitectureDoc).toContain('render');
    expect(blockGeneratorArchitectureDoc).toContain('apply');
    expect(blockGeneratorArchitectureDoc).toContain('Phase 1: complete');
    expect(blockGeneratorArchitectureDoc).toContain('Phase 3: complete');
    expect(blockGeneratorArchitectureDoc).toContain('Phase 4: complete');
    expect(blockGeneratorArchitectureDoc).toContain(
      'docs/block-generator-tool-contract.md',
    );
    expect(externalTemplateLayerDoc).toContain('wp-typia.layers.json');
    expect(externalTemplateLayerDoc).toContain('extends');
    expect(externalTemplateLayerDoc).toContain('builtin:shared/base');
    expect(externalTemplateLayerDoc).toContain('protected');
    expect(externalTemplateLayerDoc).toContain('trusted-JS model');
    expect(externalTemplateLayerDoc).toContain(
      '@wp-typia/create-workspace-template',
    );
    expect(externalTemplateLayerDoc).toContain('#268');
    expect(runtimeSurfaceDoc).not.toContain(
      '@wp-typia/project-tools/runtime/*',
    );
    expect(importPolicyDoc).toContain('@wp-typia/project-tools');
    expect(importPolicyDoc).toContain('@wp-typia/project-tools/typia-llm');
    expect(importPolicyDoc).toContain('BlockGeneratorService');
    expect(importPolicyDoc).toContain('inspectBlockGeneration');
    expect(importPolicyDoc).toContain('docs/block-generator-architecture.md');
    expect(importPolicyDoc).toContain('docs/block-generator-tool-contract.md');
    expect(importPolicyDoc).toContain(
      'docs/external-template-layer-composition.md',
    );
    expect(importPolicyDoc).toContain('@wp-typia/project-tools/schema-core');
    expect(importPolicyDoc).toContain(
      '@wp-typia/block-runtime/migration-types',
    );
    expect(importPolicyDoc).toContain('@wp-typia/block-runtime/schema-core');
    expect(importPolicyDoc).toContain('built-in templates no longer ship');
    expect(importPolicyDoc).toContain('structural,');
    expect(importPolicyDoc).toContain('render.php` Mustache files');
    expect(importPolicyDoc).not.toContain('@wp-typia/project-tools/runtime/*');
    expect(fs.existsSync(path.join(repoRoot, 'packages', 'create'))).toBe(
      false,
    );
  });

  test('runtime root keeps stable facades above focused domain folders', () => {
    for (const domain of projectToolsRuntimeDomains) {
      expect(
        fs.statSync(path.join(projectToolsRuntimeRoot, domain)).isDirectory(),
      ).toBe(true);
    }

    const facadeFiles = fs
      .readdirSync(projectToolsRuntimeRoot)
      .filter((entry) => entry.endsWith('.ts') && entry !== 'index.ts')
      .sort();
    const facadeLineCount = facadeFiles.reduce((total, entry) => {
      const source = fs.readFileSync(
        path.join(projectToolsRuntimeRoot, entry),
        'utf8',
      );
      expect(source.trim()).toMatch(
        /^export \* from "\.\/(?:add|cli|doctor|migration|schema|shared|templates|workspace)\//,
      );
      return total + source.trim().split('\n').length;
    }, 0);

    expect(facadeFiles.length).toBeGreaterThan(200);
    expect(facadeLineCount).toBeLessThan(400);
  });

  test('shared migration contracts and workspace template identity have a single owner', () => {
    const blockRuntimePackageManifest = JSON.parse(
      fs.readFileSync(
        path.join(
          repoRoot,
          'packages',
          'wp-typia-block-runtime',
          'package.json',
        ),
        'utf8',
      ),
    ) as { exports?: Record<string, unknown> };
    const migrationTypesSource = fs.readFileSync(
      path.join(projectToolsRuntimeRoot, 'migration', 'migration-types.ts'),
      'utf8',
    );
    const templateRegistrySource = fs.readFileSync(
      path.join(projectToolsRuntimeRoot, 'templates', 'template-registry.ts'),
      'utf8',
    );
    const templateSourceSource = fs.readFileSync(
      path.join(projectToolsRuntimeRoot, 'templates', 'template-source.ts'),
      'utf8',
    );
    const cliScaffoldSource = fs.readFileSync(
      path.join(projectToolsRuntimeRoot, 'templates', 'cli-scaffold.ts'),
      'utf8',
    );
    const scaffoldSource = fs.readFileSync(
      path.join(projectToolsRuntimeRoot, 'templates', 'scaffold.ts'),
      'utf8',
    );

    expect(
      blockRuntimePackageManifest.exports?.['./migration-types'],
    ).toBeDefined();
    expect(migrationTypesSource).toMatch(
      /from\s+['"]@wp-typia\/block-runtime\/migration-types['"]/,
    );
    expect(templateRegistrySource).toMatch(
      /export\s+const\s+OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE\s*=\s*['"]@wp-typia\/create-workspace-template['"]/,
    );
    expect(templateSourceSource).not.toMatch(
      /\bconst\s+OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE\b/,
    );
    expect(cliScaffoldSource).not.toMatch(
      /\bconst\s+OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE\b/,
    );
    expect(scaffoldSource).not.toMatch(
      /\bconst\s+OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE\b/,
    );
  });
});
