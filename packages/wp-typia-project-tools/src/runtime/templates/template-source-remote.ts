import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import {
  assertExternalTemplateFileSize,
  getExternalTemplatePackageJsonMaxBytes,
} from './external-template-guards.js';
import {
  getBuiltInTemplateLayerDirs,
  isOmittableBuiltInTemplateLayerDir,
} from './template-builtins.js';
import { copyRawDirectory } from './template-render.js';
import { createManagedTempRoot } from '../shared/temp-roots.js';
import { pathExists } from '../shared/fs-async.js';
import {
  readJsonFile,
  readJsonFileSync,
  safeJsonParse,
} from '../shared/json-utils.js';
import {
  quoteTypeScriptString,
  renderTypeScriptPropertyKey,
} from '../shared/ts-string-literals.js';
import { isOfficialWorkspaceTemplateSeedAsync } from './template-source-seeds.js';
import type {
  ResolvedTemplateSource,
  SeedSource,
  TemplateVariableContext,
} from './template-source-contracts.js';

async function cleanupSeedRootPair(
  cleanup: () => Promise<void>,
  seedCleanup?: (() => Promise<void>) | undefined,
): Promise<void> {
  let cleanupError: unknown;

  try {
    await cleanup();
  } catch (error) {
    cleanupError = error;
  }

  try {
    await seedCleanup?.();
  } catch (error) {
    cleanupError ??= error;
  }

  if (cleanupError !== undefined) {
    throw cleanupError;
  }
}

function getDefaultCategoryFromBlockJson(
  blockJson: Record<string, unknown>,
): string {
  return typeof blockJson.category === 'string' &&
    blockJson.category.trim().length > 0
    ? blockJson.category.trim()
    : 'widgets';
}

function readRemoteBlockJson(blockDir: string): Record<string, unknown> {
  const sourceRoot = fs.existsSync(path.join(blockDir, 'src'))
    ? path.join(blockDir, 'src')
    : blockDir;
  for (const candidate of [
    path.join(blockDir, 'block.json'),
    path.join(sourceRoot, 'block.json'),
  ]) {
    if (fs.existsSync(candidate)) {
      return readJsonFileSync<Record<string, unknown>>(candidate, {
        context: 'remote block metadata',
      });
    }
  }

  throw new Error(`Unable to locate block.json in ${blockDir}`);
}

async function readRemoteBlockJsonAsync(
  blockDir: string,
): Promise<Record<string, unknown>> {
  const sourceRoot = await getSeedSourceRoot(blockDir);
  for (const candidate of [
    path.join(blockDir, 'block.json'),
    path.join(sourceRoot, 'block.json'),
  ]) {
    if (await pathExists(candidate)) {
      return readJsonFile<Record<string, unknown>>(candidate, {
        context: 'remote block metadata',
      });
    }
  }

  throw new Error(`Unable to locate block.json in ${blockDir}`);
}

/**
 * Read a remote block source and return its default block category.
 *
 * @deprecated Since 0.22.10. Use `getDefaultCategoryAsync()` from async
 * template-source paths. Removal target: not currently scheduled; this sync
 * compatibility helper remains available until release notes announce a
 * versioned target.
 *
 * @param sourceDir Block source directory that may contain a block.json file.
 * @returns The declared block category, or "widgets" when detection fails.
 */
export function getDefaultCategory(sourceDir: string): string {
  try {
    const blockJson = readRemoteBlockJson(sourceDir);
    return getDefaultCategoryFromBlockJson(blockJson);
  } catch {
    return 'widgets';
  }
}

/**
 * Read a remote block source and return its default block category asynchronously.
 *
 * @param sourceDir Block source directory that may contain a block.json file.
 * @returns The declared block category, or "widgets" when detection fails.
 */
export async function getDefaultCategoryAsync(sourceDir: string): Promise<string> {
  try {
    const blockJson = await readRemoteBlockJsonAsync(sourceDir);
    return getDefaultCategoryFromBlockJson(blockJson);
  } catch {
    return 'widgets';
  }
}

function readTemplatePackageJson(
  sourceDir: string,
): {
  packageJson: { wpTypia?: { projectType?: unknown } };
  sourcePath: string;
} | null {
  for (const candidate of [
    path.join(sourceDir, 'package.json.mustache'),
    path.join(sourceDir, 'package.json'),
  ]) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    try {
      assertExternalTemplateFileSize(candidate, {
        label: `Template metadata file "${candidate}"`,
        maxBytes: getExternalTemplatePackageJsonMaxBytes(),
      });
      return {
        packageJson: safeJsonParse<{
          wpTypia?: { projectType?: unknown };
        }>(fs.readFileSync(candidate, 'utf8'), {
          context: 'template metadata file',
          filePath: candidate,
        }),
        sourcePath: candidate,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown parse failure';
      throw new Error(
        `Failed to parse template metadata file "${candidate}": ${message}`,
      );
    }
  }

  return null;
}

async function readTemplatePackageJsonAsync(
  sourceDir: string,
): Promise<{
  packageJson: { wpTypia?: { projectType?: unknown } };
  sourcePath: string;
} | null> {
  for (const candidate of [
    path.join(sourceDir, 'package.json.mustache'),
    path.join(sourceDir, 'package.json'),
  ]) {
    if (!(await pathExists(candidate))) {
      continue;
    }

    try {
      assertExternalTemplateFileSize(candidate, {
        label: `Template metadata file "${candidate}"`,
        maxBytes: getExternalTemplatePackageJsonMaxBytes(),
      });
      return {
        packageJson: safeJsonParse<{
          wpTypia?: { projectType?: unknown };
        }>(await fsp.readFile(candidate, 'utf8'), {
          context: 'template metadata file',
          filePath: candidate,
        }),
        sourcePath: candidate,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown parse failure';
      throw new Error(
        `Failed to parse template metadata file "${candidate}": ${message}`,
      );
    }
  }

  return null;
}

/**
 * Read `wpTypia.projectType` from a rendered or source template package
 * manifest and return it when present.
 *
 * @deprecated Since 0.22.10. Use `getTemplateProjectTypeAsync()` from async
 * template-source paths. Removal target: not currently scheduled; this sync
 * compatibility helper remains available until release notes announce a
 * versioned target.
 */
export function getTemplateProjectType(sourceDir: string): string | null {
  const packageJsonEntry = readTemplatePackageJson(sourceDir);
  if (!packageJsonEntry) {
    return null;
  }

  const projectType = packageJsonEntry.packageJson.wpTypia?.projectType;
  if (projectType === undefined) {
    return null;
  }
  if (typeof projectType !== 'string' || projectType.trim().length === 0) {
    throw new Error(
      `Template metadata file "${packageJsonEntry.sourcePath}" defines wpTypia.projectType, but it must be a non-empty string.`,
    );
  }

  return projectType;
}

/**
 * Read `wpTypia.projectType` from template metadata asynchronously.
 *
 * @param sourceDir Template source directory to inspect.
 * @returns The project type when present, otherwise `null`.
 */
export async function getTemplateProjectTypeAsync(
  sourceDir: string,
): Promise<string | null> {
  const packageJsonEntry = await readTemplatePackageJsonAsync(sourceDir);
  if (!packageJsonEntry) {
    return null;
  }

  const projectType = packageJsonEntry.packageJson.wpTypia?.projectType;
  if (projectType === undefined) {
    return null;
  }
  if (typeof projectType !== 'string' || projectType.trim().length === 0) {
    throw new Error(
      `Template metadata file "${packageJsonEntry.sourcePath}" defines wpTypia.projectType, but it must be a non-empty string.`,
    );
  }

  return projectType;
}

/**
 * Copy a wp-typia seed into a normalized temporary template directory.
 *
 * @param seed Seed source whose files should be normalized into a temp root.
 * @returns A cloned seed whose cleanup removes the temp root and original seed.
 */
export async function normalizeWpTypiaTemplateSeed(
  seed: SeedSource,
): Promise<SeedSource> {
  const { path: tempRoot, cleanup } = await createManagedTempRoot(
    'wp-typia-template-source-',
  );
  const normalizedDir = path.join(tempRoot, 'template');
  try {
    const isOfficialWorkspaceTemplate =
      await isOfficialWorkspaceTemplateSeedAsync(seed);
    await copyRawDirectory(seed.blockDir, normalizedDir, {
      filter: async (sourcePath, _targetPath, entry) => {
        const relativePath = path.relative(seed.blockDir, sourcePath);
        if (
          isOfficialWorkspaceTemplate &&
          entry.isFile() &&
          relativePath === 'CHANGELOG.md'
        ) {
          return false;
        }
        const mustacheVariantPath = path.join(
          path.dirname(sourcePath),
          `${entry.name}.mustache`,
        );
        return !(
          entry.isFile() &&
          (entry.name === 'package.json' || entry.name === 'README.md') &&
          (await pathExists(mustacheVariantPath))
        );
      },
    });
    if (seed.assetsDir && (await pathExists(seed.assetsDir))) {
      await fsp.cp(seed.assetsDir, path.join(normalizedDir, 'assets'), {
        recursive: true,
        force: true,
      });
    }
  } catch (error) {
    await Promise.allSettled([cleanup(), seed.cleanup?.()]);
    throw error;
  }

  return {
    blockDir: normalizedDir,
    cleanup: async () => cleanupSeedRootPair(cleanup, seed.cleanup),
    rootDir: normalizedDir,
    selectedVariant: seed.selectedVariant,
    warnings: seed.warnings,
  };
}

function renderTypeScriptLiteral(value: unknown): string {
  if (typeof value === 'string') {
    return quoteTypeScriptString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return 'undefined';
}

function renderTagsForAttribute(attribute: Record<string, unknown>): string[] {
  const tags: string[] = [];
  if (
    typeof attribute.default === 'string' ||
    typeof attribute.default === 'number' ||
    typeof attribute.default === 'boolean'
  ) {
    tags.push(`tags.Default<${renderTypeScriptLiteral(attribute.default)}>`);
  }
  return tags;
}

function renderAttributeBaseType(
  attributeName: string,
  attribute: Record<string, unknown>,
): string {
  if (Array.isArray(attribute.enum) && attribute.enum.length > 0) {
    return attribute.enum
      .map((item) => renderTypeScriptLiteral(item))
      .join(' | ');
  }

  switch (attribute.type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'unknown[]';
    case 'object':
      return 'Record<string, unknown>';
    default:
      if (
        typeof attributeName === 'string' &&
        attributeName.toLowerCase().includes('class')
      ) {
        return 'string';
      }
      return 'unknown';
  }
}

function buildRemoteTypesSource(
  blockJson: Record<string, unknown>,
  context: TemplateVariableContext,
): string {
  const attributes = (blockJson.attributes ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const lines = [
    "import { tags } from 'typia';",
    '',
    `export interface ${context.pascalCase}Attributes {`,
  ];

  for (const [name, attribute] of Object.entries(attributes)) {
    const baseType = renderAttributeBaseType(name, attribute);
    const tagList = renderTagsForAttribute(attribute);
    const baseTypeWithGrouping =
      tagList.length > 0 && baseType.includes(' | ')
        ? `(${baseType})`
        : baseType;
    const renderedType = [baseTypeWithGrouping, ...tagList].join(' & ');
    lines.push(`  ${renderTypeScriptPropertyKey(name)}?: ${renderedType};`);
  }

  lines.push('}', '');
  return lines.join('\n');
}

function buildRemoteBlockJsonTemplate(
  blockJson: Record<string, unknown>,
): string {
  const merged: Record<string, unknown> = {
    ...blockJson,
    description: '{{description}}',
    name: '{{namespace}}/{{slug}}',
    textdomain: '{{textDomain}}',
    title: '{{title}}',
  };

  if (!Array.isArray(merged.keywords) || merged.keywords.length === 0) {
    merged.keywords = ['{{keyword}}', 'typia', 'block'];
  }

  return `${JSON.stringify(merged, null, '\t')}\n`;
}

async function rewriteBlockJsonImports(directory: string): Promise<void> {
  const textExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
  const targetBlockJsonPath = path.join(directory, 'block.json');

  async function visit(currentPath: string): Promise<void> {
    const stats = await fsp.stat(currentPath);
    if (stats.isDirectory()) {
      const entries = await fsp.readdir(currentPath);
      for (const entry of entries) {
        await visit(path.join(currentPath, entry));
      }
      return;
    }

    if (!textExtensions.has(path.extname(currentPath))) {
      return;
    }

    const content = await fsp.readFile(currentPath, 'utf8');
    const relativeSpecifier = path
      .relative(path.dirname(currentPath), targetBlockJsonPath)
      .replace(/\\/g, '/');
    const normalizedSpecifier = relativeSpecifier.startsWith('.')
      ? relativeSpecifier
      : `./${relativeSpecifier}`;
    const next = content.replace(
      /(['"])\.{1,2}\/[^'"]*block\.json\1/g,
      `$1${normalizedSpecifier}$1`,
    );
    if (next !== content) {
      await fsp.writeFile(currentPath, next, 'utf8');
    }
  }

  await visit(directory);
}

async function patchRemotePackageJson(
  templateDir: string,
  needsInteractivity: boolean,
): Promise<void> {
  const packageJsonPath = path.join(templateDir, 'package.json.mustache');
  const packageJson = await readJsonFile<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(packageJsonPath, {
    context: 'remote package template manifest',
  });
  const existingDependencies = { ...(packageJson.dependencies ?? {}) };
  const existingDevDependencies = { ...(packageJson.devDependencies ?? {}) };

  delete existingDependencies['@wp-typia/project-tools'];
  delete existingDevDependencies['@wp-typia/project-tools'];

  packageJson.devDependencies = {
    '@wp-typia/block-runtime': '{{blockRuntimePackageVersion}}',
    '@wp-typia/block-types': '{{blockTypesPackageVersion}}',
    ...existingDevDependencies,
  };

  if (needsInteractivity) {
    packageJson.dependencies = {
      ...existingDependencies,
      '@wordpress/interactivity': '^6.29.0',
    };
  } else if (Object.keys(existingDependencies).length > 0) {
    packageJson.dependencies = existingDependencies;
  } else {
    delete packageJson.dependencies;
  }

  await fsp.writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
}

async function getSeedSourceRoot(blockDir: string): Promise<string> {
  return (await pathExists(path.join(blockDir, 'src')))
    ? path.join(blockDir, 'src')
    : blockDir;
}

async function findSeedRenderPhp(seed: SeedSource): Promise<string | null> {
  for (const candidate of [
    path.join(seed.blockDir, 'render.php'),
    path.join(seed.rootDir, 'render.php'),
  ]) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function removeSeedEntryConflicts(templateDir: string): Promise<void> {
  for (const filename of [
    'block.json',
    'block.json.mustache',
    'edit.js',
    'edit.jsx',
    'edit.ts',
    'edit.tsx',
    'edit.tsx.mustache',
    'hooks.ts',
    'hooks.ts.mustache',
    'index.js',
    'index.jsx',
    'index.ts',
    'index.tsx',
    'index.tsx.mustache',
    'save.js',
    'save.jsx',
    'save.ts',
    'save.tsx',
    'save.tsx.mustache',
    'style.css',
    'style.scss',
    'style.scss.mustache',
    'types.ts',
    'types.ts.mustache',
    'validators.ts',
    'validators.ts.mustache',
    'view.js',
    'view.jsx',
    'view.ts',
    'view.tsx',
  ]) {
    await fsp.rm(path.join(templateDir, 'src', filename), { force: true });
  }
}

/**
 * Convert a create-block subset seed into a normalized wp-typia template source.
 *
 * @param seed Seed source produced from a remote create-block subset.
 * @param context Template variable context used for generated artifacts.
 * @returns A normalized template source rooted in a temporary directory.
 */
export async function normalizeCreateBlockSubset(
  seed: SeedSource,
  context: TemplateVariableContext,
): Promise<ResolvedTemplateSource> {
  const { path: tempRoot, cleanup } = await createManagedTempRoot(
    'wp-typia-remote-template-',
  );
  try {
    const templateDir = path.join(tempRoot, 'template');
    const blockJson = await readRemoteBlockJsonAsync(seed.blockDir);
    const sourceRoot = await getSeedSourceRoot(seed.blockDir);

    await fsp.mkdir(templateDir, { recursive: true });
    for (const layerDir of getBuiltInTemplateLayerDirs('basic')) {
      if (!(await pathExists(layerDir))) {
        if (isOmittableBuiltInTemplateLayerDir('basic', layerDir)) {
          continue;
        }
        throw new Error(`Built-in template layer is missing: ${layerDir}`);
      }
      await fsp.cp(layerDir, templateDir, {
        recursive: true,
        force: true,
      });
    }
    await removeSeedEntryConflicts(templateDir);
    await fsp.cp(sourceRoot, path.join(templateDir, 'src'), {
      recursive: true,
      force: true,
    });

    const remoteRenderPath = await findSeedRenderPhp(seed);
    if (remoteRenderPath) {
      await fsp.copyFile(
        remoteRenderPath,
        path.join(templateDir, 'render.php'),
      );
    }

    if (seed.assetsDir && (await pathExists(seed.assetsDir))) {
      await fsp.cp(seed.assetsDir, path.join(templateDir, 'assets'), {
        recursive: true,
        force: true,
      });
    }

    await fsp.writeFile(
      path.join(templateDir, 'src', 'types.ts'),
      buildRemoteTypesSource(blockJson, context),
      'utf8',
    );
    await fsp.writeFile(
      path.join(templateDir, 'src', 'block.json'),
      buildRemoteBlockJsonTemplate(blockJson),
      'utf8',
    );
    await rewriteBlockJsonImports(path.join(templateDir, 'src'));

    const needsInteractivity =
      typeof blockJson.viewScriptModule === 'string' ||
      typeof blockJson.viewScript === 'string' ||
      (
        await Promise.all(
          [
            'view.js',
            'view.jsx',
            'view.ts',
            'view.tsx',
            'interactivity.js',
            'interactivity.ts',
          ].map((filename) =>
            pathExists(path.join(templateDir, 'src', filename)),
          ),
        )
      ).some(Boolean);

    await patchRemotePackageJson(templateDir, needsInteractivity);

    return {
      id: 'remote:create-block-subset',
      defaultCategory: getDefaultCategoryFromBlockJson(blockJson),
      description:
        'A wp-typia scaffold normalized from a create-block subset source',
      features: [
        'Remote source',
        'create-block adapter',
        'Typia metadata pipeline',
      ],
      format: 'create-block-subset',
      selectedVariant: seed.selectedVariant ?? null,
      templateDir,
      warnings: seed.warnings ?? [],
      cleanup: async () => cleanupSeedRootPair(cleanup, seed.cleanup),
    };
  } catch (error) {
    await Promise.allSettled([cleanup(), seed.cleanup?.()]);
    throw error;
  }
}
