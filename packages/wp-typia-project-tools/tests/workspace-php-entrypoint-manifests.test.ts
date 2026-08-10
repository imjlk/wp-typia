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
    expect(
      isWorkspacePhpEntrypointManifestValid(
        path.join(tempRoot, 'missing-project'),
        manifestPath,
        [],
      ),
    ).toBe(false);
  });
});
