import fs, { promises as fsp } from 'node:fs';
import path from 'node:path';

import { assertFullBlockName } from './block-targets.js';
import {
  assertValidGeneratedSlug,
  normalizeBlockSlug,
  quoteTsString,
  rollbackWorkspaceMutation,
  type RunAddCoreVariationCommandOptions,
  type WorkspaceMutationSnapshot,
  snapshotWorkspaceFiles,
} from './cli-add-shared.js';
import {
  ensureEditorPluginBootstrapAnchors,
  ensureEditorPluginBuildScriptAnchors,
  ensureEditorPluginWebpackAnchors,
  resolveEditorPluginRegistryPath,
  writeEditorPluginRegistry,
} from './cli-add-workspace-editor-plugin.js';
import {
  collectGeneratedTypeScriptModulePaths,
  collectWorkspaceTypeScriptFilePaths,
  isGeneratedTypeScriptModuleFilename,
  resolveAndMigrateGeneratedExportedConstName,
} from './cli-add-workspace-generated-exports.js';
import { pathExists } from '../shared/fs-async.js';
import {
  toCollisionSafeCamelCase,
  toCollisionSafePascalCase,
  toKebabCase,
  toPascalCase,
  toTitleCase,
} from '../shared/string-case.js';
import {
  renderNamedTypeScriptImport,
  TYPESCRIPT_PRINT_WIDTH,
} from '../shared/ts-string-literals.js';
import { resolveWorkspaceProject } from '../workspace/workspace-project.js';

const CORE_VARIATIONS_EDITOR_PLUGIN_SLUG = 'core-variations';
const CORE_VARIATION_USAGE =
	'wp-typia add core-variation <block-name> <name> or wp-typia add core-variation <name> --block <namespace/block>';
const KNOWN_CORE_VARIATION_TARGETS = new Set([
  'core/archives',
  'core/audio',
  'core/avatar',
  'core/block',
  'core/button',
  'core/buttons',
  'core/calendar',
  'core/categories',
  'core/code',
  'core/column',
  'core/columns',
  'core/comment-author-name',
  'core/comment-content',
  'core/comment-date',
  'core/comment-edit-link',
  'core/comment-reply-link',
  'core/comment-template',
  'core/comments',
  'core/comments-pagination',
  'core/comments-pagination-next',
  'core/comments-pagination-numbers',
  'core/comments-pagination-previous',
  'core/comments-title',
  'core/cover',
  'core/details',
  'core/embed',
  'core/file',
  'core/footnotes',
  'core/freeform',
  'core/gallery',
  'core/group',
  'core/heading',
  'core/home-link',
  'core/html',
  'core/image',
  'core/latest-comments',
  'core/latest-posts',
  'core/legacy-widget',
  'core/list',
  'core/list-item',
  'core/loginout',
  'core/media-text',
  'core/missing',
  'core/more',
  'core/navigation',
  'core/navigation-link',
  'core/navigation-submenu',
  'core/nextpage',
  'core/page-list',
  'core/paragraph',
  'core/pattern',
  'core/post-author',
  'core/post-author-biography',
  'core/post-author-name',
  'core/post-comments',
  'core/post-comments-form',
  'core/post-content',
  'core/post-date',
  'core/post-excerpt',
  'core/post-featured-image',
  'core/post-navigation-link',
  'core/post-terms',
  'core/post-template',
  'core/post-title',
  'core/preformatted',
  'core/pullquote',
  'core/query',
  'core/query-no-results',
  'core/query-pagination',
  'core/query-pagination-next',
  'core/query-pagination-numbers',
  'core/query-pagination-previous',
  'core/query-title',
  'core/quote',
  'core/read-more',
  'core/rss',
  'core/search',
  'core/separator',
  'core/shortcode',
  'core/site-logo',
  'core/site-tagline',
  'core/site-title',
  'core/social-link',
  'core/social-links',
  'core/spacer',
  'core/table',
  'core/table-of-contents',
  'core/tag-cloud',
  'core/template-part',
  'core/term-description',
  'core/text-columns',
  'core/verse',
  'core/video',
]);
const CORE_VARIATION_SIMPLE_CONTAINER_BLOCKS = new Set([
  'core/column',
  'core/cover',
  'core/group',
  'core/media-text',
]);

interface CoreVariationModuleRef {
  targetBlockName: string;
  variationSlug: string;
}

function getCoreVariationRootDir(projectDir: string): string {
  return path.join(
    projectDir,
    'src',
    'editor-plugins',
    CORE_VARIATIONS_EDITOR_PLUGIN_SLUG,
  );
}

function getCoreVariationBlockDir(projectDir: string, targetBlockName: string): string {
  const [namespace, blockSlug] = targetBlockName.split('/');
  return path.join(
    getCoreVariationRootDir(projectDir),
    namespace ?? '',
    blockSlug ?? '',
  );
}

function getCoreVariationFilePath(
	projectDir: string,
	targetBlockName: string,
	variationSlug: string,
): string {
  return path.join(
    getCoreVariationBlockDir(projectDir, targetBlockName),
    `${variationSlug}.ts`,
  );
}

function getCoreVariationIndexPath(projectDir: string): string {
  return path.join(getCoreVariationRootDir(projectDir), 'index.ts');
}

function buildCoreVariationIdentifier(targetBlockName: string, variationSlug: string): string {
  return toKebabCase(`${targetBlockName}-${variationSlug}`)
		.split('-')
		.filter(Boolean)
		.join('_');
}

function buildCoreVariationPascalIdentifier(
	targetBlockName: string,
	variationSlug: string,
): string {
  return toCollisionSafePascalCase(`${targetBlockName}-${variationSlug}`);
}

function buildCoreVariationCamelIdentifier(
	targetBlockName: string,
	variationSlug: string,
): string {
  return toCollisionSafeCamelCase(`${targetBlockName}-${variationSlug}`);
}

function buildCoreVariationConstName(
	targetBlockName: string,
	variationSlug: string,
): string {
  return `coreVariation${buildCoreVariationPascalIdentifier(targetBlockName, variationSlug)}`;
}

function buildCoreVariationBlockConstName(
	targetBlockName: string,
	variationSlug: string,
): string {
  return `${buildCoreVariationIdentifier(targetBlockName, variationSlug).toUpperCase()}_BLOCK_NAME`;
}

function buildCoreVariationAttributesTypeName(
	targetBlockName: string,
	variationSlug: string,
): string {
  return `${toPascalCase(`${targetBlockName}-${variationSlug}`)}Attributes`;
}

function buildCoreVariationAttributesConstName(
	targetBlockName: string,
	variationSlug: string,
): string {
  return `${buildCoreVariationCamelIdentifier(targetBlockName, variationSlug)}Attributes`;
}

function buildCoreVariationInnerBlocksConstName(
	targetBlockName: string,
	variationSlug: string,
): string {
  return `${buildCoreVariationCamelIdentifier(targetBlockName, variationSlug)}InnerBlocks`;
}

function buildCoreVariationImportPath(ref: CoreVariationModuleRef): string {
  return `./${ref.targetBlockName}/${ref.variationSlug}`;
}

function formatCoreVariationTitle(variationSlug: string): string {
  return toTitleCase(variationSlug);
}

function buildCoreVariationTranslationCall(
	message: string,
	textDomain: string,
): string {
  return `__(${quoteTsString(message)}, ${quoteTsString(textDomain)})`;
}

function buildCoreVariationTranslationProperty(options: {
  indentation: string;
  message: string;
  propertyName: string;
  textDomain: string;
}): string {
  const compact = `${options.indentation}${options.propertyName}: ${buildCoreVariationTranslationCall(
    options.message,
    options.textDomain,
  )},`;
  if (compact.length <= TYPESCRIPT_PRINT_WIDTH) {
    return compact;
  }

  return [
    `${options.indentation}${options.propertyName}: __(`,
    `${options.indentation}  ${quoteTsString(options.message)},`,
    `${options.indentation}  ${quoteTsString(options.textDomain)},`,
    `${options.indentation}),`,
  ].join('\n');
}

function buildCoreVariationKeywordsSource(options: {
  textDomain: string;
  variationTitle: string;
}): string {
  const messages = ['variation', options.variationTitle];
  const calls = messages.map((message) =>
    buildCoreVariationTranslationCall(message, options.textDomain),
  );
  const compact = `  keywords: [${calls.join(', ')}],`;
  if (compact.length <= TYPESCRIPT_PRINT_WIDTH) {
    return compact;
  }

  return [
    '  keywords: [',
    ...messages.flatMap((message) => {
      const call = `    ${buildCoreVariationTranslationCall(
        message,
        options.textDomain,
      )},`;
      return call.length <= TYPESCRIPT_PRINT_WIDTH
        ? [call]
        : [
            '    __(',
            `      ${quoteTsString(message)},`,
            `      ${quoteTsString(options.textDomain)},`,
            '    ),',
          ];
    }),
    '  ],',
  ].join('\n');
}

function getUnknownCoreVariationTargetWarning(
	targetBlockName: string,
): string | undefined {
  if (
		!targetBlockName.startsWith('core/') ||
		KNOWN_CORE_VARIATION_TARGETS.has(targetBlockName)
	) {
    return undefined;
  }

  return `Target block "${targetBlockName}" uses the WordPress core namespace but is not in wp-typia's known core block list. The variation was generated for forward compatibility; verify the block name or update wp-typia if this is a newer core block.`;
}

function assertCoreVariationDoesNotExist(
	projectDir: string,
	targetBlockName: string,
	variationSlug: string,
): void {
  const variationFilePath = getCoreVariationFilePath(
    projectDir,
    targetBlockName,
    variationSlug,
  );
  if (fs.existsSync(variationFilePath)) {
    throw new Error(
      `A core block variation already exists at ${path.relative(projectDir, variationFilePath)}. Choose a different name.`,
    );
  }
}

function assertCoreVariationSlugIsNotRegistryIndex(variationSlug: string): void {
  if (variationSlug === 'index') {
    throw new Error(
      'Core variation name must not normalize to `index`. Choose a different name so the variation module can be registered.',
    );
  }
}

function buildCoreVariationInnerBlocksSource(options: {
  constName: string;
  targetBlockName: string;
  textDomain: string;
}): string {
  if (options.targetBlockName === 'core/columns') {
    return `export const ${options.constName} = [
  [
    'core/column',
    {},
    [
      [
        'core/heading',
        {
          level: 2,
${buildCoreVariationTranslationProperty({
  indentation: '          ',
  message: 'Add a section heading',
  propertyName: 'placeholder',
  textDomain: options.textDomain,
})}
        },
      ],
      [
        'core/paragraph',
        {
${buildCoreVariationTranslationProperty({
  indentation: '          ',
  message: 'Add supporting copy',
  propertyName: 'placeholder',
  textDomain: options.textDomain,
})}
        },
      ],
    ],
  ],
] satisfies BlockTemplate;`;
  }

  if (CORE_VARIATION_SIMPLE_CONTAINER_BLOCKS.has(options.targetBlockName)) {
    return `export const ${options.constName} = [
  [
    'core/heading',
    {
      level: 2,
${buildCoreVariationTranslationProperty({
  indentation: '      ',
  message: 'Add a section heading',
  propertyName: 'placeholder',
  textDomain: options.textDomain,
})}
    },
  ],
  [
    'core/paragraph',
    {
${buildCoreVariationTranslationProperty({
  indentation: '      ',
  message: 'Add supporting copy',
  propertyName: 'placeholder',
  textDomain: options.textDomain,
})}
    },
  ],
] satisfies BlockTemplate;`;
  }

  return `// Non-container core blocks can keep this empty or replace it with a
// block-supported InnerBlocks template when the target block accepts children.
export const ${options.constName} = [] satisfies BlockTemplate;`;
}

function buildCoreVariationSource(options: {
  targetBlockName: string;
  textDomain: string;
  variationSlug: string;
}): string {
  const attributesTypeName = buildCoreVariationAttributesTypeName(
    options.targetBlockName,
    options.variationSlug,
  );
  const blockConstName = buildCoreVariationBlockConstName(
    options.targetBlockName,
    options.variationSlug,
  );
  const attributesConstName = buildCoreVariationAttributesConstName(
    options.targetBlockName,
    options.variationSlug,
  );
  const innerBlocksConstName = buildCoreVariationInnerBlocksConstName(
    options.targetBlockName,
    options.variationSlug,
  );
  const variationConstName = buildCoreVariationConstName(
    options.targetBlockName,
    options.variationSlug,
  );
  const variationTitle = formatCoreVariationTitle(options.variationSlug);
  const variationClassName = `is-${options.variationSlug}`;

  return `import type {
  BlockTemplate,
  BlockVariation,
} from '@wp-typia/block-types/blocks/registration';
import { __ } from '@wordpress/i18n';

export const ${blockConstName} = ${quoteTsString(options.targetBlockName)};

export interface ${attributesTypeName} {
  className?: string;
  metadata?: {
    name?: string;
  };
  [key: string]: unknown;
}

export const ${attributesConstName} = {
  className: ${quoteTsString(variationClassName)},
  metadata: {
    name: ${quoteTsString(variationTitle)},
  },
} satisfies ${attributesTypeName};

${buildCoreVariationInnerBlocksSource({
	constName: innerBlocksConstName,
	targetBlockName: options.targetBlockName,
	textDomain: options.textDomain,
})}

export const ${variationConstName} = {
  name: ${quoteTsString(options.variationSlug)},
${buildCoreVariationTranslationProperty({
  indentation: '  ',
  message: variationTitle,
  propertyName: 'title',
  textDomain: options.textDomain,
})}
${buildCoreVariationTranslationProperty({
  indentation: '  ',
  message: `A starter ${options.targetBlockName} variation for ${variationTitle}.`,
  propertyName: 'description',
  textDomain: options.textDomain,
})}
  category: 'design',
  icon: 'layout',
${buildCoreVariationKeywordsSource({
  textDomain: options.textDomain,
  variationTitle,
})}
  attributes: ${attributesConstName},
  innerBlocks: ${innerBlocksConstName},
  isActive: ['className'],
  scope: ['block', 'inserter', 'transform'],
} satisfies BlockVariation<${attributesTypeName}>;
`;
}

async function readCoreVariationModuleRefs(
	coreVariationsDir: string,
): Promise<CoreVariationModuleRef[]> {
  if (!(await pathExists(coreVariationsDir))) {
    return [];
  }

  const refs: CoreVariationModuleRef[] = [];
  const namespaceEntries = await fsp.readdir(coreVariationsDir, {
    withFileTypes: true,
  });
  for (const namespaceEntry of namespaceEntries) {
    if (!namespaceEntry.isDirectory()) {
      continue;
    }

    const namespaceDir = path.join(coreVariationsDir, namespaceEntry.name);
    const blockEntries = await fsp.readdir(namespaceDir, {
      withFileTypes: true,
    });
    for (const blockEntry of blockEntries) {
      if (!blockEntry.isDirectory()) {
        continue;
      }

      const blockDir = path.join(namespaceDir, blockEntry.name);
      const variationEntries = await fsp.readdir(blockDir, {
        withFileTypes: true,
      });
      for (const variationEntry of variationEntries) {
        if (
          !variationEntry.isFile() ||
          !isGeneratedTypeScriptModuleFilename(variationEntry.name)
        ) {
          continue;
        }
        const variationSlug = variationEntry.name.replace(/\.ts$/u, '');

        refs.push({
          targetBlockName: `${namespaceEntry.name}/${blockEntry.name}`,
          variationSlug,
        });
      }
    }
  }

  return refs.sort((left, right) => {
    const leftKey = `${left.targetBlockName}/${left.variationSlug}`;
    const rightKey = `${right.targetBlockName}/${right.variationSlug}`;
    return leftKey.localeCompare(rightKey);
  });
}

async function buildCoreVariationIndexSource(
	projectDir: string,
	refs: readonly CoreVariationModuleRef[],
): Promise<string> {
  // Rename migrations write workspace files, so keep them sequential to
  // prevent a later failure from racing the command-level rollback.
  const bindings: Array<{
    ref: CoreVariationModuleRef;
    variationConstName: string;
  }> = [];
  for (const ref of refs) {
    bindings.push({
      ref,
      variationConstName: await resolveAndMigrateGeneratedExportedConstName(
        getCoreVariationFilePath(
          projectDir,
          ref.targetBlockName,
          ref.variationSlug,
        ),
        [
          buildCoreVariationConstName(ref.targetBlockName, ref.variationSlug),
          `coreVariation_${buildCoreVariationIdentifier(
            ref.targetBlockName,
            ref.variationSlug,
          )}`,
        ],
        projectDir,
      ),
    });
  }
  const importLines = bindings
		.map(({ ref, variationConstName }, index) => {
			const blockConstName = buildCoreVariationBlockConstName(
				ref.targetBlockName,
				ref.variationSlug,
			);
			return renderNamedTypeScriptImport(
				[
					`${blockConstName} as CORE_VARIATION_BLOCK_${index}`,
					`${variationConstName} as coreVariationEntry${index}`,
				],
				buildCoreVariationImportPath(ref),
			);
		})
		.join('\n');
  const entryLines = bindings
		.map((_, index) => {
			return `  {
    blockName: CORE_VARIATION_BLOCK_${index},
    variation: coreVariationEntry${index},
  },`;
		})
		.join('\n');

  return `import { registerBlockVariation } from '@wordpress/blocks';
${importLines ? `\n${importLines}\n` : ''}
const WORKSPACE_CORE_VARIATIONS = [
${entryLines}
] as const;

export function registerWorkspaceCoreVariations() {
  for (const { blockName, variation } of WORKSPACE_CORE_VARIATIONS) {
    registerBlockVariation(blockName, variation);
  }
}

registerWorkspaceCoreVariations();
`;
}

async function writeCoreVariationRegistry(
	projectDir: string,
	targetBlockName: string,
	textDomain: string,
	variationSlug: string,
): Promise<void> {
  const coreVariationsDir = getCoreVariationRootDir(projectDir);
  const targetBlockDir = getCoreVariationBlockDir(projectDir, targetBlockName);
  const variationFilePath = getCoreVariationFilePath(
    projectDir,
    targetBlockName,
    variationSlug,
  );
  await fsp.mkdir(targetBlockDir, { recursive: true });
  await fsp.writeFile(
    variationFilePath,
    buildCoreVariationSource({
      targetBlockName,
      textDomain,
      variationSlug,
    }),
    'utf8',
  );
  const refs = await readCoreVariationModuleRefs(coreVariationsDir);
  await fsp.writeFile(
    getCoreVariationIndexPath(projectDir),
    await buildCoreVariationIndexSource(projectDir, refs),
    'utf8',
  );
}

/**
 * Add one editor-side variation registration for an existing core or external block.
 *
 * @param options Command options for the core-variation scaffold workflow.
 * @param options.cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @param options.targetBlockName Full `namespace/block` name that receives the variation.
 * @param options.variationName Human-entered variation name normalized into the generated slug.
 * @returns The normalized variation metadata, owning workspace directory, and
 * optional warnings for suspicious but forward-compatible targets.
 * @throws {Error} When the command is run outside an official workspace, the
 * target block name is not full `namespace/block` form, or the generated file
 * already exists.
 */
export async function runAddCoreVariationCommand({
	cwd = process.cwd(),
	targetBlockName,
	targetBlockNameDiagnostics = 'core-variation target',
	variationName,
}: RunAddCoreVariationCommandOptions): Promise<{
  projectDir: string;
  targetBlockName: string;
  variationFile: string;
  variationSlug: string;
  warnings?: string[];
}> {
  const workspace = resolveWorkspaceProject(cwd);
  const resolvedTargetBlockName = assertFullBlockName(
    targetBlockName,
    targetBlockNameDiagnostics,
  );
  const variationSlug = assertValidGeneratedSlug(
    'Core variation name',
    normalizeBlockSlug(variationName),
    CORE_VARIATION_USAGE,
  );
  const unknownCoreTargetWarning =
		getUnknownCoreVariationTargetWarning(resolvedTargetBlockName);
  assertCoreVariationSlugIsNotRegistryIndex(variationSlug);

  assertCoreVariationDoesNotExist(
    workspace.projectDir,
    resolvedTargetBlockName,
    variationSlug,
  );

  const bootstrapPath = path.join(
    workspace.projectDir,
    `${workspace.packageName.split('/').pop() ?? workspace.packageName}.php`,
  );
  const buildScriptPath = path.join(
    workspace.projectDir,
    'scripts',
    'build-workspace.mjs',
  );
  const webpackConfigPath = path.join(
    workspace.projectDir,
    'webpack.config.js',
  );
  const editorPluginsIndexPath = await resolveEditorPluginRegistryPath(
    workspace.projectDir,
  );
  const coreVariationsDir = getCoreVariationRootDir(workspace.projectDir);
  const targetNamespaceDir = path.join(
    coreVariationsDir,
    resolvedTargetBlockName.split('/')[0] ?? '',
  );
  const targetBlockDir = getCoreVariationBlockDir(
    workspace.projectDir,
    resolvedTargetBlockName,
  );
  const variationFilePath = getCoreVariationFilePath(
    workspace.projectDir,
    resolvedTargetBlockName,
    variationSlug,
  );
  const coreVariationsIndexPath = getCoreVariationIndexPath(
    workspace.projectDir,
  );
  const shouldRemoveCoreVariationsDir = !(await pathExists(coreVariationsDir));
  const shouldRemoveTargetNamespaceDir =
		!shouldRemoveCoreVariationsDir && !(await pathExists(targetNamespaceDir));
  const shouldRemoveTargetBlockDir =
		!shouldRemoveCoreVariationsDir &&
		!shouldRemoveTargetNamespaceDir &&
		!(await pathExists(targetBlockDir));
  const existingCoreVariationModulePaths =
    await collectGeneratedTypeScriptModulePaths(coreVariationsDir, true);
  const workspaceTypeScriptFilePaths =
    await collectWorkspaceTypeScriptFilePaths(workspace.projectDir);
  const mutationSnapshot: WorkspaceMutationSnapshot = {
		fileSources: await snapshotWorkspaceFiles([
			bootstrapPath,
			buildScriptPath,
			editorPluginsIndexPath,
			webpackConfigPath,
			coreVariationsIndexPath,
			...existingCoreVariationModulePaths,
			...workspaceTypeScriptFilePaths,
		]),
		snapshotDirs: [],
		targetPaths: [
			variationFilePath,
			...(shouldRemoveCoreVariationsDir ? [coreVariationsDir] : []),
			...(shouldRemoveTargetNamespaceDir ? [targetNamespaceDir] : []),
			...(shouldRemoveTargetBlockDir ? [targetBlockDir] : []),
		],
	};

  try {
    await ensureEditorPluginBootstrapAnchors(workspace);
    await ensureEditorPluginBuildScriptAnchors(workspace);
    await ensureEditorPluginWebpackAnchors(workspace);
    await writeCoreVariationRegistry(
      workspace.projectDir,
      resolvedTargetBlockName,
      workspace.workspace.textDomain,
      variationSlug,
    );
    await writeEditorPluginRegistry(
      workspace.projectDir,
      CORE_VARIATIONS_EDITOR_PLUGIN_SLUG,
    );

    return {
			projectDir: workspace.projectDir,
			targetBlockName: resolvedTargetBlockName,
			variationFile: path.relative(workspace.projectDir, variationFilePath),
			variationSlug,
			...(unknownCoreTargetWarning
				? { warnings: [unknownCoreTargetWarning] }
				: {}),
		};
  } catch (error) {
    await rollbackWorkspaceMutation(mutationSnapshot);
    throw error;
  }
}
