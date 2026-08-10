import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
} from './helpers/scaffold-test-harness.js';
import {
  syncWorkspacePhpEntrypoints,
  WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS,
} from '../src/runtime/workspace/workspace-php-entrypoint-manifests.js';
import { isWorkspacePhpEntrypointManifestValid } from '../src/runtime/doctor/cli-doctor-workspace-shared.js';
import {
  buildLegacyGeneratedGlobArrayLoader,
  buildLegacyGeneratedGlobLoader,
} from '../src/runtime/add/cli-add-workspace-php-loader-migration.js';

describe('workspace PHP entrypoint manifests', () => {
  const tempRoot = createScaffoldTempRoot('wp-typia-php-entrypoints-');

  afterAll(() => {
    cleanupScaffoldTempRoot(tempRoot);
  });

  test('emits sorted literal module includes and detects drift', async () => {
    const projectDir = path.join(tempRoot, 'literal-manifests');
    for (const relativeDirectory of [
      'inc/abilities',
      'inc/admin-views',
      'inc/ai-features',
      'inc/post-meta',
      'inc/rest',
      'src/bindings/example-binding',
      'src/blocks/example-block',
      'src/patterns/collection',
    ]) {
      fs.mkdirSync(path.join(projectDir, relativeDirectory), {
        recursive: true,
      });
    }
    for (const relativePath of [
      'inc/abilities/example.php',
      'inc/admin-views/settings.php',
      'inc/ai-features/summarize.php',
      'inc/post-meta/rating.php',
      'inc/rest/example.php',
      'src/bindings/example-binding/server.php',
      'src/blocks/example-block/server.php',
      'src/patterns/collection/hero.php',
      'src/patterns/grid.php',
    ]) {
      fs.writeFileSync(path.join(projectDir, relativePath), '<?php\n', 'utf8');
    }
    fs.writeFileSync(
      path.join(projectDir, 'src/patterns/read me.txt'),
      'documentation only\n',
      'utf8',
    );

    const firstResult = await syncWorkspacePhpEntrypoints(projectDir);
    expect(firstResult.changed).toHaveLength(8);

    const patternManifest = fs.readFileSync(
      path.join(
        projectDir,
        WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.patterns,
      ),
      'utf8',
    );
    expect(patternManifest).toContain(
      "require __DIR__ . '/collection/hero.php';",
    );
    expect(patternManifest).toContain("require __DIR__ . '/grid.php';");
    expect(patternManifest.indexOf('/collection/hero.php')).toBeLessThan(
      patternManifest.indexOf('/grid.php'),
    );

    for (const manifestRelativePath of Object.values(
      WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS,
    )) {
      const manifestSource = fs.readFileSync(
        path.join(projectDir, manifestRelativePath),
        'utf8',
      );
      expect(manifestSource).not.toMatch(/\bglob\s*\(/u);
      expect(manifestSource).not.toMatch(
        /\b(?:require|require_once|include|include_once)\s+\$/u,
      );
      expect(manifestSource).not.toContain('../');
    }

    await expect(
      syncWorkspacePhpEntrypoints(projectDir, { check: true }),
    ).resolves.toEqual({ changed: [] });

    const restManifestPath = path.join(
      projectDir,
      WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.restResources,
    );
    fs.writeFileSync(
      restManifestPath,
      fs.readFileSync(restManifestPath, 'utf8').replace(/\n/gu, '\r\n'),
      'utf8',
    );
    await expect(
      syncWorkspacePhpEntrypoints(projectDir, { check: true }),
    ).resolves.toEqual({ changed: [] });
    expect(
      fs.readdirSync(path.dirname(restManifestPath)).filter((fileName) =>
        fileName.endsWith('.tmp'),
      ),
    ).toEqual([]);

    fs.writeFileSync(
      path.join(projectDir, 'inc/rest/second.php'),
      '<?php\n',
      'utf8',
    );
    await expect(
      syncWorkspacePhpEntrypoints(projectDir, { check: true }),
    ).rejects.toThrow('inc/rest/wp-typia-modules.php');
    await syncWorkspacePhpEntrypoints(projectDir);
    expect(
      fs.readFileSync(
        path.join(
          projectDir,
          WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.restResources,
        ),
        'utf8',
      ),
    ).toContain("require_once __DIR__ . '/second.php';");

    fs.writeFileSync(
      path.join(
        projectDir,
        WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.abilities,
      ),
      '<?php\n// intentionally stale\n',
      'utf8',
    );
    await syncWorkspacePhpEntrypoints(projectDir, {
      manifestIds: ['restResources'],
    });
    expect(
      fs.readFileSync(
        path.join(
          projectDir,
          WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.abilities,
        ),
        'utf8',
      ),
    ).toBe('<?php\n// intentionally stale\n');
  });

  test('rejects unsafe discovered path segments', async () => {
    const projectDir = path.join(tempRoot, 'unsafe-manifest');
    fs.mkdirSync(path.join(projectDir, 'src/patterns/unsafe name'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(projectDir, 'src/patterns/unsafe name/pattern.php'),
      '<?php\n',
      'utf8',
    );

    await expect(syncWorkspacePhpEntrypoints(projectDir)).rejects.toThrow(
      'unsafe pattern path segment',
    );
  });

  test('preserves nested patterns named like the root manifest', async () => {
    const projectDir = path.join(tempRoot, 'nested-manifest-name');
    fs.mkdirSync(path.join(projectDir, 'src/patterns/collection'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(projectDir, 'src/patterns/collection/wp-typia-modules.php'),
      '<?php\n',
      'utf8',
    );

    await syncWorkspacePhpEntrypoints(projectDir, {
      manifestIds: ['patterns'],
    });
    expect(fs.readFileSync(
      path.join(projectDir, WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.patterns),
      'utf8',
    )).toContain("require __DIR__ . '/collection/wp-typia-modules.php';");
  });

  test('refuses to overwrite an unmanaged root manifest', async () => {
    const projectDir = path.join(tempRoot, 'unmanaged-manifest');
    const manifestPath = path.join(
      projectDir,
      WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.restResources,
    );
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, '<?php\ncustom_bootstrap();\n', 'utf8');

    await expect(syncWorkspacePhpEntrypoints(projectDir, {
      manifestIds: ['restResources'],
    })).rejects.toThrow('Refusing to overwrite unmanaged PHP entrypoint manifest');
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(
      '<?php\ncustom_bootstrap();\n',
    );
  });

  test('validates every manifest before migrating the workspace bootstrap', async () => {
    const projectDir = path.join(tempRoot, 'atomic-bootstrap-migration');
    const packageName = 'atomic-bootstrap-migration';
    fs.mkdirSync(path.join(projectDir, 'src/blocks/example'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(projectDir, 'inc/rest'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      `${JSON.stringify({ name: packageName })}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(projectDir, 'src/blocks/example/server.php'),
      '<?php\n',
      'utf8',
    );
    const bootstrapPath = path.join(projectDir, `${packageName}.php`);
    const legacyBootstrap = `<?php
foreach ( glob( __DIR__ . '/src/blocks/*/server.php' ) ?: array() as $server_module ) {
\trequire_once $server_module;
}
`;
    fs.writeFileSync(bootstrapPath, legacyBootstrap, 'utf8');
    fs.writeFileSync(
      path.join(
        projectDir,
        WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.restResources,
      ),
      '<?php\ncustom_bootstrap();\n',
      'utf8',
    );

    await expect(syncWorkspacePhpEntrypoints(projectDir)).rejects.toThrow(
      'Refusing to overwrite unmanaged PHP entrypoint manifest',
    );
    expect(fs.readFileSync(bootstrapPath, 'utf8')).toBe(legacyBootstrap);
    expect(fs.existsSync(
      path.join(
        projectDir,
        WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.blockServers,
      ),
    )).toBe(false);
  });

  test('recreates empty manifests referenced by the workspace bootstrap', async () => {
    const projectDir = path.join(tempRoot, 'missing-manifest-directory');
    const packageName = 'missing-manifest-directory';
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      `${JSON.stringify({ name: packageName })}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(projectDir, `${packageName}.php`),
      `<?php
require_once __DIR__ . '/inc/rest/wp-typia-modules.php';
`,
      'utf8',
    );

    const result = await syncWorkspacePhpEntrypoints(projectDir, {
      manifestIds: ['restResources'],
    });
    const manifestPath = path.join(
      projectDir,
      WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.restResources,
    );
    expect(result.changed).toEqual([
      WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.restResources,
    ]);
    expect(fs.readFileSync(manifestPath, 'utf8')).toContain(
      'No generated PHP modules are currently registered.',
    );
    await expect(syncWorkspacePhpEntrypoints(projectDir, {
      check: true,
      manifestIds: ['restResources'],
    })).resolves.toEqual({ changed: [] });
  });

  test('migrates the exact generated block server loader', async () => {
    const projectDir = path.join(tempRoot, 'legacy-block-loader');
    fs.mkdirSync(path.join(projectDir, 'src/blocks/example'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      '{"name":"legacy-block-loader"}\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(projectDir, 'src/blocks/example/server.php'),
      '<?php\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(projectDir, 'legacy-block-loader.php'),
      `<?php
foreach ( glob( __DIR__ . '/src/blocks/*/server.php' ) ?: array() as $server_module ) {
\trequire_once $server_module;
}
`,
      'utf8',
    );

    await syncWorkspacePhpEntrypoints(projectDir, {
      manifestIds: ['blockServers'],
    });
    const migratedBootstrap = fs.readFileSync(
      path.join(projectDir, 'legacy-block-loader.php'),
      'utf8',
    );
    expect(migratedBootstrap).toContain(
      "require_once __DIR__ . '/src/blocks/wp-typia-modules.php';",
    );
    expect(migratedBootstrap).not.toMatch(/\bglob\s*\(/u);
    expect(migratedBootstrap).not.toMatch(
      /\brequire_once\s+\$server_module\b/u,
    );
  });

  test('full sync migrates every exact historical workspace PHP loader', async () => {
    const projectDir = path.join(tempRoot, 'legacy-workspace-loaders');
    const phpPrefix = 'legacy_workspace';
    const packageName = 'legacy-workspace-loaders';
    const moduleFiles = [
      'inc/abilities/review.php',
      'inc/admin-views/reports.php',
      'inc/ai-features/summarize.php',
      'inc/post-meta/rating.php',
      'inc/rest/articles.php',
      'src/bindings/featured/server.php',
      'src/blocks/card/server.php',
      'src/patterns/hero.php',
      'src/patterns/group/cta.php',
    ];
    for (const moduleFile of moduleFiles) {
      fs.mkdirSync(path.dirname(path.join(projectDir, moduleFile)), {
        recursive: true,
      });
      fs.writeFileSync(path.join(projectDir, moduleFile), '<?php\n', 'utf8');
    }
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      `${JSON.stringify({
        name: packageName,
        wpTypia: { phpPrefix },
      }, null, 2)}\n`,
      'utf8',
    );
    const loaders = [
      buildLegacyGeneratedGlobLoader({
        functionName: `${phpPrefix}_load_workflow_abilities`,
        globPath: '/inc/abilities/*.php',
        includeKind: 'require_once',
        moduleVariable: 'ability_module',
      }),
      buildLegacyGeneratedGlobLoader({
        functionName: `${phpPrefix}_load_admin_views`,
        globPath: '/inc/admin-views/*.php',
        includeKind: 'require_once',
        moduleVariable: 'admin_view_module',
      }),
      buildLegacyGeneratedGlobLoader({
        functionName: `${phpPrefix}_register_ai_features`,
        globPath: '/inc/ai-features/*.php',
        includeKind: 'require_once',
        moduleVariable: 'ai_feature_module',
      }),
      buildLegacyGeneratedGlobLoader({
        functionName: `${phpPrefix}_register_binding_sources`,
        globPath: '/src/bindings/*/server.php',
        includeKind: 'require_once',
        moduleVariable: 'binding_source_module',
      }),
      buildLegacyGeneratedGlobArrayLoader({
        functionName: `${phpPrefix}_register_patterns`,
        globPaths: ['/src/patterns/*.php', '/src/patterns/*/*.php'],
        includeKind: 'require',
        moduleVariable: 'pattern_module',
        modulesVariable: 'pattern_modules',
      }),
      buildLegacyGeneratedGlobLoader({
        functionName: `${phpPrefix}_register_post_meta_contracts`,
        globPath: '/inc/post-meta/*.php',
        includeKind: 'require_once',
        moduleVariable: 'post_meta_module',
      }),
      buildLegacyGeneratedGlobLoader({
        functionName: `${phpPrefix}_register_rest_resources`,
        globPath: '/inc/rest/*.php',
        includeKind: 'require_once',
        moduleVariable: 'rest_resource_module',
      }),
    ];
    fs.writeFileSync(
      path.join(projectDir, `${packageName}.php`),
      `<?php
function ${phpPrefix}_load_rest_schema_helpers() {
\t$helper_path = __DIR__ . '/inc/rest-schema.php';
\tif ( is_readable( $helper_path ) ) {
\t\trequire_once $helper_path;
\t}
}

${loaders.join('\n\n')}

foreach ( glob( __DIR__ . '/src/blocks/*/server.php' ) ?: array() as $server_module ) {
\trequire_once $server_module;
}
`,
      'utf8',
    );

    const result = await syncWorkspacePhpEntrypoints(projectDir);
    const bootstrap = fs.readFileSync(
      path.join(projectDir, `${packageName}.php`),
      'utf8',
    );

    expect(result.changed).toContain(`${packageName}.php`);
    for (const manifestPath of Object.values(
      WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS,
    )) {
      expect(bootstrap).toContain(`/${manifestPath}`);
    }
    expect(bootstrap).toContain(
      "require_once __DIR__ . '/inc/rest-schema.php';",
    );
    expect(bootstrap).not.toMatch(/\bglob\s*\(/u);
    expect(bootstrap).not.toMatch(
      /\b(?:require|require_once|include|include_once)\s+\$/u,
    );
    await expect(syncWorkspacePhpEntrypoints(projectDir, {
      check: true,
    })).resolves.toEqual({ changed: [] });
  });

  test('rejects symbolic links in generated entrypoint inventories', async () => {
    const projectDir = path.join(tempRoot, 'symlink-manifest');
    const externalPath = path.join(tempRoot, 'external.php');
    fs.mkdirSync(path.join(projectDir, 'inc/rest'), { recursive: true });
    fs.writeFileSync(externalPath, '<?php\n', 'utf8');
    fs.symlinkSync(externalPath, path.join(projectDir, 'inc/rest/linked.php'));

    await expect(syncWorkspacePhpEntrypoints(projectDir)).rejects.toThrow(
      'symbolic link: linked.php',
    );
  });

  test('rejects symbolic source directories and manifest files', async () => {
    const projectDir = path.join(tempRoot, 'symlink-boundaries');
    const externalDirectory = path.join(tempRoot, 'external-rest');
    fs.mkdirSync(path.join(projectDir, 'inc'), { recursive: true });
    fs.mkdirSync(externalDirectory, { recursive: true });
    fs.symlinkSync(externalDirectory, path.join(projectDir, 'inc/rest'));

    await expect(syncWorkspacePhpEntrypoints(projectDir)).rejects.toThrow(
      'symbolic path: inc/rest',
    );

    fs.unlinkSync(path.join(projectDir, 'inc/rest'));
    fs.mkdirSync(path.join(projectDir, 'inc/rest'));
    const externalManifest = path.join(tempRoot, 'external-manifest.php');
    fs.writeFileSync(externalManifest, '<?php\n', 'utf8');
    fs.symlinkSync(
      externalManifest,
      path.join(projectDir, 'inc/rest/wp-typia-modules.php'),
    );

    await expect(syncWorkspacePhpEntrypoints(projectDir)).rejects.toThrow(
      'manifest through a symbolic link',
    );
  });

  test('doctor validation fails closed for unexpected, duplicate, or missing targets', async () => {
    const projectDir = path.join(tempRoot, 'doctor-validation');
    fs.mkdirSync(path.join(projectDir, 'inc/rest'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'inc/rest/example.php'),
      '<?php\n',
      'utf8',
    );
    await syncWorkspacePhpEntrypoints(projectDir, {
      manifestIds: ['restResources'],
    });
    const manifestPath = WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.restResources;
    expect(
      isWorkspacePhpEntrypointManifestValid(projectDir, manifestPath, [
        'example.php',
      ]),
    ).toBe(true);

    fs.appendFileSync(
      path.join(projectDir, manifestPath),
      '// include and require are discussed in this comment.\n',
      'utf8',
    );
    expect(
      isWorkspacePhpEntrypointManifestValid(projectDir, manifestPath, [
        'example.php',
      ]),
    ).toBe(true);
    fs.appendFileSync(
      path.join(projectDir, manifestPath),
      'require_once __DIR__ . $modulePath;\n',
      'utf8',
    );
    expect(
      isWorkspacePhpEntrypointManifestValid(projectDir, manifestPath, [
        'example.php',
      ]),
    ).toBe(false);
    await syncWorkspacePhpEntrypoints(projectDir, {
      manifestIds: ['restResources'],
    });

    fs.writeFileSync(
      path.join(projectDir, 'inc/rest/extra.php'),
      '<?php\n',
      'utf8',
    );
    await syncWorkspacePhpEntrypoints(projectDir, {
      manifestIds: ['restResources'],
    });
    expect(
      isWorkspacePhpEntrypointManifestValid(projectDir, manifestPath, [
        'example.php',
      ]),
    ).toBe(false);

    const absoluteManifestPath = path.join(projectDir, manifestPath);
    fs.writeFileSync(
      absoluteManifestPath,
      `${fs.readFileSync(absoluteManifestPath, 'utf8')}require_once __DIR__ . '/example.php';\n`,
      'utf8',
    );
    expect(
      isWorkspacePhpEntrypointManifestValid(projectDir, manifestPath, [
        'example.php',
        'extra.php',
      ]),
    ).toBe(false);

    fs.unlinkSync(path.join(projectDir, 'inc/rest/extra.php'));
    await syncWorkspacePhpEntrypoints(projectDir, {
      manifestIds: ['restResources'],
    });
    fs.writeFileSync(
      path.join(projectDir, 'inc/rest/rogue.php'),
      '<?php\n',
      'utf8',
    );
    fs.appendFileSync(
      absoluteManifestPath,
      "include __DIR__ . '/rogue.php';\n",
      'utf8',
    );
    expect(
      isWorkspacePhpEntrypointManifestValid(projectDir, manifestPath, [
        'example.php',
      ]),
    ).toBe(false);

    fs.unlinkSync(path.join(projectDir, 'inc/rest/rogue.php'));
    await syncWorkspacePhpEntrypoints(projectDir, {
      manifestIds: ['restResources'],
    });
    fs.appendFileSync(
      absoluteManifestPath,
      'require __DIR__ . "/example.php";\n',
      'utf8',
    );
    expect(
      isWorkspacePhpEntrypointManifestValid(projectDir, manifestPath, [
        'example.php',
      ]),
    ).toBe(false);
    await syncWorkspacePhpEntrypoints(projectDir, {
      manifestIds: ['restResources'],
    });
    fs.writeFileSync(
      path.join(projectDir, 'inc/outside.php'),
      '<?php\n',
      'utf8',
    );
    fs.writeFileSync(
      absoluteManifestPath,
      `<?php
// require __DIR__ . '/example.php';
REQuire __DIR__ . '/../outside.php';
`,
      'utf8',
    );
    expect(
      isWorkspacePhpEntrypointManifestValid(projectDir, manifestPath, [
        'example.php',
      ]),
    ).toBe(false);
    expect(
      isWorkspacePhpEntrypointManifestValid(
        path.join(tempRoot, 'missing-project'),
        manifestPath,
        [],
      ),
    ).toBe(false);
  });
});
