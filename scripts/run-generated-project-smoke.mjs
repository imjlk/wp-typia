#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertGeneratedProjectScaffold } from './lib/generated-project-smoke-assertions.mjs';
import {
  cleanupTemporaryProjectRoot,
  ensureCorepackPackageManager,
  getInstallCommand,
  getPackageManager,
  getRunCommand,
  getRunScriptCommand,
  refreshCurrentMigrationSnapshot,
  rewriteWorkspaceDependencies,
  run,
  runLocalDoctor,
  runLocalMigrationDoctor,
  runScaffoldRefreshScripts,
  runFreshScaffoldSyncCheck,
} from './lib/generated-project-smoke-core.mjs';
import { runExampleProjectSmoke } from './lib/generated-project-smoke-example.mjs';
import {
  assertPhpMajorMinorVersion,
  lintGeneratedProjectPhp,
} from './lib/generated-project-smoke-php.mjs';
import { createCiPhaseTimer } from './lib/ci-phase-timing.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wpTypiaPackageRoot = path.resolve(__dirname, '../packages/wp-typia');
const entryPath = path.resolve(wpTypiaPackageRoot, 'bin/wp-typia.js');

function parseArgs(argv) {
  const parsed = {
    addBindingSourceName: undefined,
    addBlockName: undefined,
    addDataStorage: undefined,
    addEditorPluginName: undefined,
    addEditorPluginSlot: undefined,
    addHookedBlockAnchor: undefined,
    addHookedBlockPosition: undefined,
    addHookedBlockSlug: undefined,
    addPatternName: undefined,
    addPersistencePolicy: undefined,
    addTemplate: undefined,
    addVariationBlock: undefined,
    addVariationName: undefined,
    dataStorage: undefined,
    exampleProject: undefined,
    namespace: undefined,
    packageManager: undefined,
    persistencePolicy: undefined,
    phpPrefix: undefined,
    phpVersion: undefined,
    projectName: undefined,
    runtime: undefined,
    template: undefined,
    textDomain: undefined,
    variant: undefined,
    withMigrationUi: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--runtime') {
      parsed.runtime = next;
      index += 1;
      continue;
    }
    if (arg === '--add-block-name') {
      parsed.addBlockName = next;
      index += 1;
      continue;
    }
    if (arg === '--add-binding-source-name') {
      parsed.addBindingSourceName = next;
      index += 1;
      continue;
    }
    if (arg === '--add-editor-plugin-name') {
      parsed.addEditorPluginName = next;
      index += 1;
      continue;
    }
    if (arg === '--add-editor-plugin-slot') {
      parsed.addEditorPluginSlot = next;
      index += 1;
      continue;
    }
    if (arg === '--add-hooked-block-slug') {
      parsed.addHookedBlockSlug = next;
      index += 1;
      continue;
    }
    if (arg === '--add-hooked-block-anchor') {
      parsed.addHookedBlockAnchor = next;
      index += 1;
      continue;
    }
    if (arg === '--add-hooked-block-position') {
      parsed.addHookedBlockPosition = next;
      index += 1;
      continue;
    }
    if (arg === '--add-template') {
      parsed.addTemplate = next;
      index += 1;
      continue;
    }
    if (arg === '--add-variation-name') {
      parsed.addVariationName = next;
      index += 1;
      continue;
    }
    if (arg === '--add-variation-block') {
      parsed.addVariationBlock = next;
      index += 1;
      continue;
    }
    if (arg === '--add-pattern-name') {
      parsed.addPatternName = next;
      index += 1;
      continue;
    }
    if (arg === '--add-data-storage') {
      parsed.addDataStorage = next;
      index += 1;
      continue;
    }
    if (arg === '--add-persistence-policy') {
      parsed.addPersistencePolicy = next;
      index += 1;
      continue;
    }
    if (arg === '--template') {
      parsed.template = next;
      index += 1;
      continue;
    }
    if (arg === '--package-manager') {
      parsed.packageManager = next;
      index += 1;
      continue;
    }
    if (arg === '--namespace') {
      parsed.namespace = next;
      index += 1;
      continue;
    }
    if (arg === '--text-domain') {
      parsed.textDomain = next;
      index += 1;
      continue;
    }
    if (arg === '--php-prefix') {
      parsed.phpPrefix = next;
      index += 1;
      continue;
    }
    if (arg === '--php-version') {
      parsed.phpVersion = assertPhpMajorMinorVersion(next);
      index += 1;
      continue;
    }
    if (arg === '--data-storage') {
      parsed.dataStorage = next;
      index += 1;
      continue;
    }
    if (arg === '--example-project') {
      parsed.exampleProject = next;
      index += 1;
      continue;
    }
    if (arg === '--variant') {
      parsed.variant = next;
      index += 1;
      continue;
    }
    if (arg === '--project-name') {
      parsed.projectName = next;
      index += 1;
      continue;
    }
    if (arg === '--persistence-policy') {
      parsed.persistencePolicy = next;
      index += 1;
      continue;
    }
    if (arg === '--with-migration-ui') {
      parsed.withMigrationUi = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function ensureCanonicalCliReady() {
  const projectToolsRuntimeIndexPath = path.resolve(
    __dirname,
    '../packages/wp-typia-project-tools/dist/runtime/index.js',
  );
  const apiClientDistPath = path.resolve(
    __dirname,
    '../packages/wp-typia-api-client/dist/index.js',
  );
  const blockTypesDistPath = path.resolve(
    __dirname,
    '../packages/wp-typia-block-types/dist/index.js',
  );
  const blockRuntimeDistPath = path.resolve(
    __dirname,
    '../packages/wp-typia-block-runtime/dist/index.js',
  );
  const restDistPath = path.resolve(
    __dirname,
    '../packages/wp-typia-rest/dist/index.js',
  );
  const restReactDistPath = path.resolve(
    __dirname,
    '../packages/wp-typia-rest/dist/react.js',
  );
  const restReactDtsPath = path.resolve(
    __dirname,
    '../packages/wp-typia-rest/dist/react.d.ts',
  );
  if (
    fs.existsSync(entryPath) &&
    fs.existsSync(projectToolsRuntimeIndexPath) &&
    fs.existsSync(apiClientDistPath) &&
    fs.existsSync(blockRuntimeDistPath) &&
    fs.existsSync(blockTypesDistPath) &&
    fs.existsSync(restDistPath) &&
    fs.existsSync(restReactDistPath) &&
    fs.existsSync(restReactDtsPath)
  ) {
    return;
  }

  run('bun', ['run', '--filter', '@wp-typia/api-client', 'build'], {
    cwd: path.resolve(__dirname, '..'),
  });
  run('bun', ['run', '--filter', '@wp-typia/block-types', 'build'], {
    cwd: path.resolve(__dirname, '..'),
  });
  run('bun', ['run', '--filter', '@wp-typia/block-runtime', 'build'], {
    cwd: path.resolve(__dirname, '..'),
  });
  run('bun', ['run', '--filter', '@wp-typia/rest', 'build'], {
    cwd: path.resolve(__dirname, '..'),
  });
  run('bun', ['run', '--filter', '@wp-typia/project-tools', 'build'], {
    cwd: path.resolve(__dirname, '..'),
  });
}

function assertScaffoldPackageManagerField(packageJson, packageManager) {
  if (packageManager === 'npm') {
    if (packageJson.packageManager !== undefined) {
      throw new Error(
        `Expected npm scaffolds to omit packageManager, received ${packageJson.packageManager}`,
      );
    }
    return;
  }

  const expectedPackageManager =
    getPackageManager(packageManager).packageManagerField;
  if (packageJson.packageManager !== expectedPackageManager) {
    throw new Error(
      `Expected packageManager ${expectedPackageManager}, received ${packageJson.packageManager}`,
    );
  }
}

function main() {
  const {
    runtime,
    template,
    packageManager,
    projectName,
    variant,
    dataStorage,
    persistencePolicy,
    namespace,
    textDomain,
    phpPrefix,
    phpVersion,
    exampleProject,
    addBlockName,
    addBindingSourceName,
    addDataStorage,
    addEditorPluginName,
    addEditorPluginSlot,
    addHookedBlockAnchor,
    addHookedBlockPosition,
    addHookedBlockSlug,
    addPatternName,
    addPersistencePolicy,
    addTemplate,
    addVariationBlock,
    addVariationName,
    withMigrationUi,
  } = parseArgs(process.argv.slice(2));

  if (
    !runtime ||
    !packageManager ||
    !projectName ||
    (!template && !exampleProject) ||
    (template && exampleProject)
  ) {
    throw new Error(
      'Usage: node scripts/run-generated-project-smoke.mjs --runtime <node|bun> (--template <id> | --example-project <slug>) [--variant <name>] [--namespace <value>] [--text-domain <value>] [--php-prefix <value>] [--php-version <major.minor>] [--data-storage <post-meta|custom-table>] [--persistence-policy <authenticated|public>] [--with-migration-ui] [--add-block-name <name> --add-template <basic|interactivity|persistence|compound> [--add-data-storage <post-meta|custom-table>] [--add-persistence-policy <authenticated|public>]] [--add-variation-name <name> --add-variation-block <block-slug>] [--add-pattern-name <name>] [--add-binding-source-name <name>] [--add-editor-plugin-name <name> [--add-editor-plugin-slot <sidebar|document-setting-panel>]] [--add-hooked-block-slug <block-slug> --add-hooked-block-anchor <anchor-block-name> --add-hooked-block-position <before|after|firstChild|lastChild>] --package-manager <id> --project-name <name>',
    );
  }

  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-generated-smoke-'),
  );
  const projectDir = path.join(tempRoot, projectName);
  let primaryError = null;
  const phaseTimer = createCiPhaseTimer({
    title: `Generated project smoke: ${projectName}`,
  });

  try {
    phaseTimer.measureSync('prepare canonical CLI', ensureCanonicalCliReady);

    if (exampleProject) {
      phaseTimer.measureSync('run checked-in example smoke', () => {
        runExampleProjectSmoke({
          exampleProject,
          packageManager,
          phpVersion,
          projectDir,
          runtime,
        });
      });
      return;
    }

    phaseTimer.measureSync('scaffold project', () => {
      run(runtime, [
        entryPath,
        projectDir,
        '--template',
        template,
        ...(variant ? ['--variant', variant] : []),
        ...(namespace ? ['--namespace', namespace] : []),
        ...(textDomain ? ['--text-domain', textDomain] : []),
        ...(phpPrefix ? ['--php-prefix', phpPrefix] : []),
        ...(dataStorage ? ['--data-storage', dataStorage] : []),
        ...(persistencePolicy
          ? ['--persistence-policy', persistencePolicy]
          : []),
        ...(withMigrationUi ? ['--with-migration-ui'] : []),
        '--yes',
        '--no-install',
        '--package-manager',
        packageManager,
      ]);
    });

    const packageJsonPath = path.join(projectDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    assertScaffoldPackageManagerField(packageJson, packageManager);

    phaseTimer.measureSync('install project dependencies', () => {
      rewriteWorkspaceDependencies(projectDir, packageManager);
      ensureCorepackPackageManager(packageManager);

      const [installCommand, installArgs] = getInstallCommand(packageManager);
      run(installCommand, installArgs, {
        cwd: projectDir,
        env: {
          ...process.env,
          ...(packageManager === 'yarn'
            ? { YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' }
            : {}),
        },
      });
    });

    phaseTimer.measureSync('synchronize generated artifacts', () => {
      if (
        ['basic', 'interactivity', 'persistence', 'compound'].includes(template)
      ) {
        runFreshScaffoldSyncCheck(projectDir, packageManager, packageJson);
      }
      runScaffoldRefreshScripts(projectDir, packageManager, packageJson);
    });

    if (addBlockName) {
      if (!addTemplate) {
        throw new Error(
          '--add-template is required when --add-block-name is provided.',
        );
      }

      run(
        runtime,
        [
          entryPath,
          'add',
          'block',
          addBlockName,
          '--template',
          addTemplate,
          ...(addDataStorage ? ['--data-storage', addDataStorage] : []),
          ...(addPersistencePolicy
            ? ['--persistence-policy', addPersistencePolicy]
            : []),
        ],
        {
          cwd: projectDir,
        },
      );

      runScaffoldRefreshScripts(projectDir, packageManager, packageJson);
    }

    if (addVariationName) {
      if (!addVariationBlock) {
        throw new Error(
          '--add-variation-block is required when --add-variation-name is provided.',
        );
      }

      run(
        runtime,
        [
          entryPath,
          'add',
          'variation',
          addVariationName,
          '--block',
          addVariationBlock,
        ],
        {
          cwd: projectDir,
        },
      );
    }

    if (addPatternName) {
      run(runtime, [entryPath, 'add', 'pattern', addPatternName], {
        cwd: projectDir,
      });
    }

    if (addBindingSourceName) {
      run(runtime, [entryPath, 'add', 'binding-source', addBindingSourceName], {
        cwd: projectDir,
      });
    }

    if (addEditorPluginName) {
      const slotForArgs = addEditorPluginSlot ?? 'sidebar';
      run(
        runtime,
        [
          entryPath,
          'add',
          'editor-plugin',
          addEditorPluginName,
          '--slot',
          slotForArgs,
        ],
        {
          cwd: projectDir,
        },
      );
    }

    if (addHookedBlockSlug || addHookedBlockAnchor || addHookedBlockPosition) {
      if (
        !addHookedBlockSlug ||
        !addHookedBlockAnchor ||
        !addHookedBlockPosition
      ) {
        throw new Error(
          '--add-hooked-block-slug, --add-hooked-block-anchor, and --add-hooked-block-position must be provided together.',
        );
      }

      run(
        runtime,
        [
          entryPath,
          'add',
          'hooked-block',
          addHookedBlockSlug,
          '--anchor',
          addHookedBlockAnchor,
          '--position',
          addHookedBlockPosition,
        ],
        {
          cwd: projectDir,
        },
      );
    }

    const isWorkspaceTemplate =
      template === 'workspace' ||
      template === '@wp-typia/create-workspace-template' ||
      packageJson.wpTypia?.projectType === 'workspace';
    if (isWorkspaceTemplate) {
      runLocalDoctor(projectDir, runtime);
    }

    if (
      withMigrationUi &&
      typeof packageJson.scripts?.['migration:doctor'] === 'string'
    ) {
      refreshCurrentMigrationSnapshot(projectDir, runtime);
      runLocalMigrationDoctor(projectDir, runtime);
    }

    const [buildCommand, buildArgs] = getRunCommand(packageManager);
    phaseTimer.measureSync('build project', () => {
      run(buildCommand, buildArgs, { cwd: projectDir });
    });
    if (typeof packageJson.scripts?.lint === 'string') {
      const [lintCommand, lintArgs] = getRunScriptCommand(
        packageManager,
        'lint',
      );
      phaseTimer.measureSync('lint project', () => {
        run(lintCommand, lintArgs, { cwd: projectDir });
      });
    }
    if (typeof packageJson.scripts?.['format:check'] === 'string') {
      const [formatCheckCommand, formatCheckArgs] = getRunScriptCommand(
        packageManager,
        'format:check',
      );
      phaseTimer.measureSync('check project formatting', () => {
        run(formatCheckCommand, formatCheckArgs, { cwd: projectDir });
      });
    }
    phaseTimer.measureSync('lint generated PHP', () => {
      lintGeneratedProjectPhp(projectDir, phpVersion);
    });

    phaseTimer.measureSync('verify generated artifacts', () => {
      assertGeneratedProjectScaffold({
        addBindingSourceName,
        addBlockName,
        addEditorPluginName,
        addEditorPluginSlot: addEditorPluginName
          ? (addEditorPluginSlot ?? 'sidebar')
          : undefined,
        addHookedBlockAnchor,
        addHookedBlockPosition,
        addHookedBlockSlug,
        addPatternName,
        addTemplate,
        addVariationBlock,
        addVariationName,
        dataStorage,
        namespace,
        packageJson,
        persistencePolicy,
        projectDir,
        projectName,
        template,
      });
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      cleanupTemporaryProjectRoot(tempRoot);
    } catch (cleanupError) {
      if (primaryError) {
        console.warn(
          `Warning: failed to remove temporary smoke directory ${tempRoot}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      } else {
        console.error(
          `Failed to remove temporary smoke directory ${tempRoot}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
        process.exitCode = 1;
      }
    }
    phaseTimer.flush();
  }
}

main();
