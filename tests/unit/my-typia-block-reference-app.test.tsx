import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

import { ValidationErrorSummary } from '../../examples/my-typia-block/src/components/ValidationErrorSummary';
import { isNonArrayObject } from '../../examples/my-typia-block/src/migrations/plain-object';

describe('my-typia-block reference app helpers', () => {
  test('reference app package scripts and textdomain follow current CLI conventions', () => {
    const exampleDir = path.join(
      import.meta.dir,
      '../../examples/my-typia-block',
    );
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(exampleDir, 'package.json'), 'utf8'),
    ) as {
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const blockJson = JSON.parse(
      fs.readFileSync(path.join(exampleDir, 'block.json'), 'utf8'),
    ) as {
      textdomain: string;
    };
    const snapshotBlockJson = JSON.parse(
      fs.readFileSync(
        path.join(exampleDir, 'src/migrations/versions/v1/block.json'),
        'utf8',
      ),
    ) as {
      textdomain: string;
    };
    const pluginBootstrap = fs.readFileSync(
      path.join(exampleDir, 'my-typia-block.php'),
      'utf8',
    );
    expect(packageJson.devDependencies['wp-typia']).toBe('workspace:*');
    expect(packageJson.scripts['migration:init']).toBe(
      'wp-typia migrate init --current-migration-version v1',
    );
    expect(packageJson.scripts['migration:scaffold']).toBe(
      'wp-typia migrate scaffold',
    );
    expect(packageJson.scripts['migration:verify']).toBe(
      'wp-typia migrate verify --all',
    );
    expect(packageJson.scripts['migration:doctor']).toBe(
      'wp-typia migrate doctor --all',
    );
    expect(blockJson.textdomain).toBe('my-typia-block');
    expect(snapshotBlockJson.textdomain).toBe('my-typia-block');
    expect(pluginBootstrap).toContain('Text Domain:       my-typia-block');
    expect(pluginBootstrap).toContain("'my-typia-block'");
  });

  test('migration object helper preserves the example semantics', () => {
    class ExampleValue {}

    expect(isNonArrayObject({})).toBe(true);
    expect(isNonArrayObject(Object.create(null))).toBe(true);
    expect(isNonArrayObject(new ExampleValue())).toBe(true);
    expect(isNonArrayObject([])).toBe(false);
    expect(isNonArrayObject(null)).toBe(false);
  });

  test('ValidationErrorSummary renders the shared heading and list items', () => {
    const rendered = renderToStaticMarkup(
      <ValidationErrorSummary
        errors={['content: string', 'padding.top: number']}
      />,
    );

    expect(rendered).toContain('Validation Errors:');
    expect(rendered).toContain('content: string');
    expect(rendered).toContain('padding.top: number');
    expect(rendered).toContain('<ul');
  });

  test('migration-detector keeps the expected facade exports after the module split', () => {
    const migrationDetectorSource = fs.readFileSync(
      path.join(
        import.meta.dir,
        '../../examples/my-typia-block/src/migration-detector.ts',
      ),
      'utf8',
    );

    expect(migrationDetectorSource).toContain('BatchMigrationResult');
    expect(migrationDetectorSource).toContain('BlockScanResult');
    expect(migrationDetectorSource).toContain('MigrationAnalysis');
    expect(migrationDetectorSource).toContain('batchMigrateScanResults');
    expect(migrationDetectorSource).toContain('detectBlockMigration');
    expect(migrationDetectorSource).toContain('generateMigrationReport');
    expect(migrationDetectorSource).toContain('scanSiteForMigrations');
  });

  test('reference app imports the shared runtime identifier helper instead of a local UUID utility', () => {
    const editSource = fs.readFileSync(
      path.join(import.meta.dir, '../../examples/my-typia-block/src/edit.tsx'),
      'utf8',
    );
    const hooksSource = fs.readFileSync(
      path.join(import.meta.dir, '../../examples/my-typia-block/src/hooks.ts'),
      'utf8',
    );
    const validatorsSource = fs.readFileSync(
      path.join(
        import.meta.dir,
        '../../examples/my-typia-block/src/validators.ts',
      ),
      'utf8',
    );

    expect(editSource).toContain('@wp-typia/block-runtime/identifiers');
    expect(hooksSource).toContain('@wp-typia/block-runtime/identifiers');
    expect(validatorsSource).toContain('@wp-typia/block-runtime/identifiers');
    expect(
      fs.existsSync(
        path.join(
          import.meta.dir,
          '../../examples/my-typia-block/src/utils/uuid.ts',
        ),
      ),
    ).toBe(false);
  });

  test('reference app registration uses the generic-preserving scaffold helper without metadata casts', () => {
    const indexSource = fs.readFileSync(
      path.join(import.meta.dir, '../../examples/my-typia-block/src/index.tsx'),
      'utf8',
    );

    expect(indexSource).toContain("import metadata from './block-metadata';");
    expect(indexSource).toContain('buildScaffoldBlockRegistration(');
    expect(indexSource).not.toContain('type ScaffoldBlockMetadata');
    expect(indexSource).not.toContain('metadata as ScaffoldBlockMetadata');
    expect(indexSource).toContain('parseScaffoldBlockMetadata');
    expect(indexSource).toContain('BlockConfiguration');
    expect(indexSource).toContain('registerScaffoldBlockType(');
    expect(indexSource).toContain('registration.name');
    expect(indexSource).toContain('registration.settings');
    expect(indexSource).not.toContain('registerBlockType<');
    expect(indexSource).toContain('registerScaffoldBlockType');
  });

  test('reference app validator wiring uses the current validator toolkit pattern', () => {
    const exampleDir = path.join(
      import.meta.dir,
      '../../examples/my-typia-block/src',
    );
    const validatorToolkitSource = fs.readFileSync(
      path.join(exampleDir, 'validator-toolkit.ts'),
      'utf8',
    );
    const validatorsSource = fs.readFileSync(
      path.join(exampleDir, 'validators.ts'),
      'utf8',
    );
    const fixturesReadme = fs.readFileSync(
      path.join(
        import.meta.dir,
        '../../examples/my-typia-block/src/migrations/fixtures/README.md',
      ),
      'utf8',
    );

    expect(validatorToolkitSource).toContain('createTemplateValidatorToolkit');
    expect(validatorToolkitSource).toContain('parseManifestDefaultsDocument');
    expect(validatorToolkitSource).not.toContain(
      'manifest as ManifestDefaultsDocument',
    );
    expect(validatorsSource).toMatch(/from\s+['"]\.\/validator-toolkit['"]/);
    expect(validatorsSource).toContain('createTemplateValidatorToolkit');
    expect(validatorsSource).not.toContain('applyTemplateDefaultsFromManifest');
    expect(validatorsSource).not.toContain('createScaffoldValidatorToolkit');
    expect(fixturesReadme).toContain('wp-typia migrate verify');
    expect(fixturesReadme).toContain('wp-typia migrate fuzz');
  });

  test('reference app keeps runtime manifest validation helpers while consuming wrapper imports', () => {
    const editSource = fs.readFileSync(
      path.join(import.meta.dir, '../../examples/my-typia-block/src/edit.tsx'),
      'utf8',
    );
    const migrationAnalysisSource = fs.readFileSync(
      path.join(
        import.meta.dir,
        '../../examples/my-typia-block/src/migrations/analysis.ts',
      ),
      'utf8',
    );
    const migrationRegistrySource = fs.readFileSync(
      path.join(
        import.meta.dir,
        '../../examples/my-typia-block/src/migrations/generated/registry.ts',
      ),
      'utf8',
    );

    expect(editSource).toContain("import currentManifest from './manifest-document';");
    expect(editSource).not.toContain('parseManifestDocument');
    expect(editSource).not.toContain('currentManifest as ManifestDocument');
    expect(migrationAnalysisSource).toContain('parseManifestDocument');
    expect(migrationAnalysisSource).not.toContain(
      'migrationRegistry.currentManifest as ManifestDocument',
    );
    expect(migrationRegistrySource).toContain(
      "import currentManifest from '../../manifest-document';",
    );
    expect(migrationRegistrySource).not.toContain('parseManifestDocument');
    expect(migrationRegistrySource).not.toContain(
      'currentManifest as ManifestDocument',
    );
  });

  test('reference app consumes typed JSON wrapper modules instead of local casts', () => {
    const exampleDir = path.join(import.meta.dir, '../../examples/my-typia-block/src');
    const blockMetadataSource = fs.readFileSync(
      path.join(exampleDir, 'block-metadata.ts'),
      'utf8',
    );
    const manifestDocumentSource = fs.readFileSync(
      path.join(exampleDir, 'manifest-document.ts'),
      'utf8',
    );
    const manifestDefaultsSource = fs.readFileSync(
      path.join(exampleDir, 'manifest-defaults-document.ts'),
      'utf8',
    );
    const editSource = fs.readFileSync(path.join(exampleDir, 'edit.tsx'), 'utf8');
    const indexSource = fs.readFileSync(path.join(exampleDir, 'index.tsx'), 'utf8');
    const validatorsSource = fs.readFileSync(
      path.join(exampleDir, 'validators.ts'),
      'utf8',
    );
    const migrationRegistrySource = fs.readFileSync(
      path.join(exampleDir, 'migrations/generated/registry.ts'),
      'utf8',
    );
    const deprecatedSource = fs.readFileSync(
      path.join(exampleDir, 'migrations/generated/deprecated.ts'),
      'utf8',
    );

    expect(blockMetadataSource).toContain('defineScaffoldBlockMetadata');
    expect(manifestDocumentSource).toContain('defineManifestDocument');
    expect(manifestDefaultsSource).toContain('defineManifestDefaultsDocument');
    expect(indexSource).toContain("import metadata from './block-metadata';");
    expect(indexSource).not.toContain('type ScaffoldBlockMetadata');
    expect(indexSource).not.toContain('metadata as ScaffoldBlockMetadata');
    expect(editSource).toContain("import currentManifest from './manifest-document';");
    expect(editSource).not.toContain('as ManifestDocument');
    expect(validatorsSource).toContain(
      "import currentManifest from './manifest-defaults-document';",
    );
    expect(migrationRegistrySource).toContain(
      "import currentManifest from '../../manifest-document';",
    );
    expect(deprecatedSource).toContain(
      "import type { MyTypiaBlockAttributes } from '../../types';",
    );
  });
});
