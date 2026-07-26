import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  hasPhpBinary,
  normalizeBlockSlug,
  run,
} from './generated-project-smoke-core.mjs';
import {
  assertBasicTemplateScaffold,
  assertCompoundPersistenceArtifacts,
  assertCompoundRestOpenApi,
  assertCompoundTemplateArtifacts,
  assertPersistenceRestOpenApi,
  assertPersistenceTemplateArtifacts,
} from './generated-project-smoke-template-assertions.mjs';
import {
  assertWorkspaceBindingSourceArtifacts,
  assertWorkspaceBlockArtifacts,
  assertWorkspaceEditorPluginArtifacts,
  assertWorkspaceHookedBlockArtifacts,
  assertWorkspacePatternArtifacts,
  assertWorkspaceTemplateScaffold,
  assertWorkspaceVariationArtifacts,
  isWorkspaceTemplateRequest,
} from './generated-project-smoke-workspace-assertions.mjs';

function listSourceBlockSlugs(projectDir) {
  const sourceBlocksDir = path.join(projectDir, 'src', 'blocks');
  if (!fs.existsSync(sourceBlocksDir)) {
    return [];
  }

  return fs
    .readdirSync(sourceBlocksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function assertBuildArtifacts(projectDir, projectName) {
  const blockSlugs = listSourceBlockSlugs(projectDir);
  if (blockSlugs.length > 0) {
    for (const blockSlug of blockSlugs) {
      const buildDir = path.join(projectDir, 'build', 'blocks', blockSlug);
      for (const artifact of [
        'block.json',
        'typia.manifest.json',
        'typia-validator.php',
      ]) {
        if (!fs.existsSync(path.join(buildDir, artifact))) {
          throw new Error(
            `Expected ${buildDir} to include ${artifact} for example-project smoke`,
          );
        }
      }
    }

    return;
  }

  const candidateDirs = [
    path.join(projectDir, 'build', projectName),
    path.join(projectDir, 'build'),
  ];

  for (const artifact of [
    'block.json',
    'typia.manifest.json',
    'typia-validator.php',
  ]) {
    const found = candidateDirs.some((dir) =>
      fs.existsSync(path.join(dir, artifact)),
    );
    if (!found) {
      throw new Error(
        `Expected ${artifact} in one of: ${candidateDirs.join(', ')}`,
      );
    }
  }
}

export function collectProjectFilePaths(projectDir, fileName) {
  const pending = [projectDir];
  const matchedPaths = [];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) {
      continue;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') {
        continue;
      }

      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === fileName) {
        matchedPaths.push(entryPath);
      }
    }
  }

  return matchedPaths.sort();
}

const blockMetadataFileFields = [
  'editorScript',
  'script',
  'scriptModule',
  'viewScript',
  'viewScriptModule',
  'style',
  'editorStyle',
  'render',
];

function collectBlockMetadataPaths(buildRoot) {
  if (!fs.existsSync(buildRoot)) {
    return [];
  }

  const pending = [buildRoot];
  const blockMetadataPaths = [];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === 'block.json') {
        blockMetadataPaths.push(entryPath);
      }
    }
  }

  return blockMetadataPaths.sort();
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeBlockMetadataFileRefs(value) {
  if (typeof value === 'string') {
    return value.startsWith('file:./') ? [value.slice('file:./'.length)] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeBlockMetadataFileRefs(item));
  }

  return [];
}

function assertBlockMetadataFileReferences(projectDir) {
  const buildRoot = path.join(projectDir, 'build');

  for (const blockMetadataPath of collectBlockMetadataPaths(buildRoot)) {
    const blockMetadata = JSON.parse(
      fs.readFileSync(blockMetadataPath, 'utf8'),
    );
    const blockDir = path.dirname(blockMetadataPath);

    for (const field of blockMetadataFileFields) {
      for (const relativePath of normalizeBlockMetadataFileRefs(
        blockMetadata[field],
      )) {
        const assetPath = path.join(blockDir, relativePath);
        if (!fs.existsSync(assetPath)) {
          throw new Error(
            `Expected ${field} asset ${relativePath} referenced by ${blockMetadataPath} to exist at ${assetPath}`,
          );
        }
      }
    }
  }
}

function assertGeneratedRuntimeImports(projectDir) {
  const pending = [
    path.join(projectDir, 'src'),
    path.join(projectDir, 'scripts'),
    path.join(projectDir, 'webpack.config.js'),
  ];

  while (pending.length > 0) {
    const currentPath = pending.pop();
    if (!currentPath || !fs.existsSync(currentPath)) {
      continue;
    }

    const stat = fs.statSync(currentPath);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(currentPath, {
        withFileTypes: true,
      })) {
        pending.push(path.join(currentPath, entry.name));
      }
      continue;
    }

    if (!/\.(?:[cm]?[jt]sx?|json)$/.test(currentPath)) {
      continue;
    }

    const contents = fs.readFileSync(currentPath, 'utf8');
    if (contents.includes('@wp-typia/project-tools/runtime/')) {
      throw new Error(
        `Found deprecated generated runtime import in ${currentPath}`,
      );
    }
    if (contents.includes('@wp-typia/project-tools/schema-core')) {
      throw new Error(
        `Found deprecated generated schema-core import in ${currentPath}`,
      );
    }
    if (contents.includes('@wp-typia/create/')) {
      throw new Error(
        `Found deprecated legacy create import in ${currentPath}`,
      );
    }
  }
}

function isLocalProjectToolsRewrite(value) {
  return (
    typeof value === 'string' &&
    value.startsWith('file:') &&
    /[\\/]packages[\\/]wp-typia-project-tools(?:$|[\\/])/u.test(value)
  );
}

function isOfficialWorkspaceTemplatePackage(packageJson) {
  return (
    packageJson.wpTypia?.projectType === 'workspace' &&
    packageJson.wpTypia?.templatePackage ===
      '@wp-typia/create-workspace-template'
  );
}

export function assertGeneratedPackageBoundary(projectDir) {
  const packageJsonPath = path.join(projectDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const allowWorkspaceCliHelperScripts =
    isOfficialWorkspaceTemplatePackage(packageJson);
  const expectedLintScript = 'node scripts/run-wp-scripts-lint-js-compat.mjs';

  if (packageJson.scripts?.['lint:js'] !== expectedLintScript) {
    throw new Error(
      `Expected generated project lint:js to use "${expectedLintScript}", found ${JSON.stringify(packageJson.scripts?.['lint:js'] ?? null)}`,
    );
  }
  if (packageJson.devDependencies?.['@typescript/typescript6'] !== '6.0.2') {
    throw new Error(
      `Expected generated project to pin @typescript/typescript6@6.0.2 for WordPress ESLint, found ${JSON.stringify(packageJson.devDependencies?.['@typescript/typescript6'] ?? null)}`,
    );
  }
  for (const [dependencyName, expectedVersion] of [
    ['@types/react', '^18.3.28'],
    ['@types/react-dom', '^18.3.7'],
    ['react', '^18.3.1'],
    ['react-dom', '^18.3.1'],
  ]) {
    if (packageJson.devDependencies?.[dependencyName] !== expectedVersion) {
      throw new Error(
        `Expected generated project to declare ${dependencyName}@${expectedVersion}, found ${JSON.stringify(packageJson.devDependencies?.[dependencyName] ?? null)}`,
      );
    }
  }
  for (const relativePath of [
    'scripts/register-typescript6.cjs',
    'scripts/run-wp-scripts-lint-js-compat.mjs',
  ]) {
    if (!fs.existsSync(path.join(projectDir, relativePath))) {
      throw new Error(`Expected generated project to include ${relativePath}`);
    }
  }

  if (
    packageJson.dependencies?.['@wp-typia/project-tools'] &&
    !isLocalProjectToolsRewrite(
      packageJson.dependencies['@wp-typia/project-tools'],
    )
  ) {
    throw new Error(
      'Expected generated project dependencies to omit @wp-typia/project-tools unless smoke rewrites pinned it to the local workspace package',
    );
  }
  if (
    packageJson.devDependencies?.['@wp-typia/project-tools'] &&
    !isLocalProjectToolsRewrite(
      packageJson.devDependencies['@wp-typia/project-tools'],
    )
  ) {
    throw new Error(
      'Expected generated project devDependencies to omit @wp-typia/project-tools unless smoke rewrites pinned it to the local workspace package',
    );
  }
  for (const [scriptName, scriptValue] of Object.entries(
    packageJson.scripts ?? {},
  )) {
    if (typeof scriptValue !== 'string') {
      continue;
    }
    if (!scriptValue.includes('wp-typia')) {
      continue;
    }
    if (scriptName.startsWith('migration:')) {
      if (!/wp-typia@\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?/u.test(scriptValue)) {
        throw new Error(
          `Expected generated migration script "${scriptName}" to pin wp-typia`,
        );
      }
      continue;
    }
    if (allowWorkspaceCliHelperScripts && scriptName.startsWith('wp-typia:')) {
      continue;
    }
    if (scriptValue.includes('wp-typia')) {
      throw new Error(
        `Expected generated project script "${scriptName}" to avoid wp-typia`,
      );
    }
  }
}

function lintPhpArtifact(filePath) {
  if (!hasPhpBinary()) {
    return;
  }

  try {
    execFileSync('php', ['-l', filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail =
      typeof error?.stderr === 'string' && error.stderr.trim().length > 0
        ? error.stderr.trim()
        : typeof error?.stdout === 'string' && error.stdout.trim().length > 0
          ? error.stdout.trim()
          : error instanceof Error
            ? error.message
            : String(error);
    throw new Error(`PHP lint failed for ${filePath}:\n${detail}`);
  }
}

function assertPluginBootstrapHardening(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');

  for (const expectedSnippet of [
    'Tested up to:',
    'Domain Path:',
    'load_plugin_textdomain(',
  ]) {
    if (!source.includes(expectedSnippet)) {
      throw new Error(`Expected ${filePath} to include "${expectedSnippet}"`);
    }
  }
}

function assertPluginBootstrapExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Expected generated project to include plugin bootstrap: ${filePath}`,
    );
  }
}

function assertNoRawRenderedContentEcho(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (/echo\s*\(?\s*\$content\b/.test(source)) {
    throw new Error(`Expected ${filePath} to avoid raw $content echoes`);
  }
}

export function assertExampleProjectScaffold(projectDir, exampleProject) {
  const packageJson = readJsonFile(path.join(projectDir, 'package.json'));
  const blockJsonPath = path.join(projectDir, 'block.json');
  const pluginBootstrapPath = path.join(projectDir, `${exampleProject}.php`);
  const blockSlugs = listSourceBlockSlugs(projectDir);

  if (blockSlugs.length === 0 && !fs.existsSync(blockJsonPath)) {
    throw new Error(`Expected example project block.json at ${blockJsonPath}`);
  }
  if (!fs.existsSync(pluginBootstrapPath)) {
    throw new Error(
      `Expected example project bootstrap at ${pluginBootstrapPath}`,
    );
  }
  if (
    exampleProject === 'my-typia-block' &&
    typeof packageJson.scripts?.['migration:doctor'] !== 'string'
  ) {
    throw new Error('Expected example project to expose migration:doctor');
  }

  assertPluginBootstrapExists(pluginBootstrapPath);
  assertPluginBootstrapHardening(pluginBootstrapPath);
  for (const renderPath of collectProjectFilePaths(projectDir, 'render.php')) {
    assertNoRawRenderedContentEcho(renderPath);
  }
  assertBuildArtifacts(projectDir, exampleProject);
  assertBlockMetadataFileReferences(projectDir);
  assertGeneratedRuntimeImports(projectDir);
}

export function shouldRunMigrationSmoke(projectDir, packageJson) {
  return (
    typeof packageJson.scripts?.['migration:doctor'] === 'string' ||
    fs.existsSync(path.join(projectDir, 'src', 'migrations', 'config.ts'))
  );
}

export function assertGeneratedProjectScaffold({
  addBindingSourceName,
  addBlockName,
  addEditorPluginName,
  addEditorPluginSlot,
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
}) {
  if (isWorkspaceTemplateRequest(template, packageJson)) {
    assertWorkspaceTemplateScaffold(projectDir);
    assertWorkspaceBlockArtifacts(
      projectDir,
      addTemplate === 'compound'
        ? [
            normalizeBlockSlug(addBlockName ?? ''),
            `${normalizeBlockSlug(addBlockName ?? '')}-item`,
          ].filter(Boolean)
        : addBlockName
          ? [normalizeBlockSlug(addBlockName)]
          : [],
    );
    if (addVariationName && addVariationBlock) {
      assertWorkspaceVariationArtifacts(
        projectDir,
        normalizeBlockSlug(addVariationBlock),
        normalizeBlockSlug(addVariationName),
      );
    }
    if (addPatternName) {
      assertWorkspacePatternArtifacts(
        projectDir,
        normalizeBlockSlug(addPatternName),
      );
    }
    if (addBindingSourceName) {
      assertWorkspaceBindingSourceArtifacts(
        projectDir,
        normalizeBlockSlug(addBindingSourceName),
      );
    }
    if (addEditorPluginName) {
      assertWorkspaceEditorPluginArtifacts(
        projectDir,
        normalizeBlockSlug(addEditorPluginName),
        addEditorPluginSlot ?? 'sidebar',
      );
    }
    if (addHookedBlockSlug && addHookedBlockAnchor && addHookedBlockPosition) {
      assertWorkspaceHookedBlockArtifacts(
        projectDir,
        normalizeBlockSlug(addHookedBlockSlug),
        addHookedBlockAnchor,
        addHookedBlockPosition,
      );
    }
  } else if (template === 'compound') {
    assertCompoundTemplateArtifacts(projectDir, projectName);
  } else {
    assertBuildArtifacts(projectDir, projectName);
  }

  assertBlockMetadataFileReferences(projectDir);
  assertGeneratedRuntimeImports(projectDir);
  assertGeneratedPackageBoundary(projectDir);
  if (template === 'basic') {
    assertBasicTemplateScaffold(projectDir);
  }
  if (template === 'persistence') {
    assertPersistenceTemplateArtifacts(projectDir, projectName);
    assertPersistenceRestOpenApi(
      projectDir,
      projectName,
      namespace ?? normalizeBlockSlug(projectName),
      persistencePolicy ?? 'authenticated',
    );
  }
  if (template === 'compound' && (dataStorage || persistencePolicy)) {
    assertCompoundPersistenceArtifacts(projectDir, projectName);
    assertCompoundRestOpenApi(
      projectDir,
      projectName,
      namespace ?? normalizeBlockSlug(projectName),
      persistencePolicy ?? 'authenticated',
    );
  }

  const pluginBootstrapPath = path.join(projectDir, `${projectName}.php`);
  assertPluginBootstrapExists(pluginBootstrapPath);
  for (const artifact of [
    pluginBootstrapPath,
    path.join(projectDir, 'inc', 'rest-shared.php'),
    path.join(projectDir, 'inc', 'rest-auth.php'),
    path.join(projectDir, 'inc', 'rest-public.php'),
    path.join(projectDir, 'src', 'render.php'),
    path.join(projectDir, 'src', 'blocks', projectName, 'render.php'),
    path.join(projectDir, 'build', projectName, 'typia-validator.php'),
    path.join(projectDir, 'build', projectName, 'render.php'),
    path.join(projectDir, 'build', 'typia-validator.php'),
    path.join(projectDir, 'build', 'render.php'),
    path.join(
      projectDir,
      'build',
      'blocks',
      projectName,
      'typia-validator.php',
    ),
    path.join(projectDir, 'build', 'blocks', projectName, 'render.php'),
    path.join(
      projectDir,
      'build',
      'blocks',
      `${projectName}-item`,
      'typia-validator.php',
    ),
    path.join(
      projectDir,
      'build',
      'blocks',
      `${projectName}-item`,
      'render.php',
    ),
  ]) {
    if (fs.existsSync(artifact)) {
      lintPhpArtifact(artifact);
      if (artifact === path.join(projectDir, `${projectName}.php`)) {
        assertPluginBootstrapHardening(artifact);
      }
      if (artifact.endsWith('render.php')) {
        assertNoRawRenderedContentEcho(artifact);
      }
    }
  }
}
