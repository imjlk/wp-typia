import { promises as fsp } from 'node:fs';
import path from 'node:path';

import {
	syncBlockMetadata,
} from '@wp-typia/block-runtime/metadata-core';
import ts from '@typescript/typescript6';

import { resolveWorkspaceProject } from '../workspace/workspace-project.js';
import {
  appendWorkspaceInventoryEntries,
  readWorkspaceInventoryAsync,
  type WorkspaceInventory,
} from '../workspace/workspace-inventory.js';
import {
  assertBindingSourceDoesNotExist,
  assertValidGeneratedSlug,
  getWorkspaceBootstrapPath,
  normalizeBlockSlug,
  resolveWorkspaceBlock,
  rollbackWorkspaceMutation,
  type RunAddBindingSourceCommandOptions,
  type WorkspaceMutationSnapshot,
  snapshotWorkspaceFiles,
} from './cli-add-shared.js';
import {
  ensureBindingSourceBootstrapAnchors,
  resolveBindingSourceRegistryPath,
  writeBindingSourceRegistry,
} from './cli-add-workspace-binding-source-anchors.js';
import {
  buildBindingSourceConfigEntry,
  buildBindingSourceEditorSource,
  buildBindingSourceServerSource,
} from './cli-add-workspace-binding-source-source-emitters.js';
import type {
  BindingPostMetaSource,
  BindingTarget,
} from './cli-add-workspace-binding-source-types.js';
import { resolveWorkspaceBlockTargetName } from './block-targets.js';
import { normalizeOptionalCliString } from '../cli/cli-validation.js';
import { getPropertyNameText } from '../shared/ts-property-names.js';
import {
  assertPostMetaBindingPath,
  loadPostMetaBindingFields,
} from './post-meta-binding-fields.js';
import type { WorkspacePostMetaInventoryEntry } from '../workspace/workspace-inventory-types.js';

const BINDING_ATTRIBUTE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/u;

function assertValidBindingAttributeName(attributeName: string): string {
  const trimmed = attributeName.trim();
  if (!trimmed) {
    throw new Error(
      '`wp-typia add binding-source` requires --attribute <attribute> to include a value when --block is provided.',
    );
  }
  if (!BINDING_ATTRIBUTE_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      `Binding attribute "${trimmed}" must start with a letter and use only letters, numbers, underscores, or hyphens.`,
    );
  }

  return trimmed;
}

function resolveBindingTarget(
	options: Pick<RunAddBindingSourceCommandOptions, 'attributeName' | 'blockName'>,
	namespace: string,
): BindingTarget | undefined {
  const blockName = normalizeOptionalCliString(options.blockName);
  const attributeName = normalizeOptionalCliString(options.attributeName);
  const hasBlock = blockName !== undefined;
  const hasAttribute = attributeName !== undefined;
  if (!hasBlock && !hasAttribute) {
    return undefined;
  }
  if (!hasBlock || !hasAttribute) {
    throw new Error(
      '`wp-typia add binding-source` requires --block and --attribute to be provided together.',
    );
  }

  const targetBlock = resolveWorkspaceBlockTargetName(blockName ?? '', namespace, {
		empty: () =>
			'`wp-typia add binding-source` requires --block <block-slug|namespace/block-slug> to include a value when --attribute is provided.',
		emptySegment: (input) =>
			`Binding target block "${input}" must use <block-slug> or <namespace/block-slug> format without empty path segments.`,
		invalidFormat: (input) =>
			`Binding target block "${input}" must use <block-slug> or <namespace/block-slug> format.`,
		namespaceMismatch: (input, actualNamespace, expectedNamespace) =>
			`Binding target block "${input}" uses namespace "${actualNamespace}". Expected "${expectedNamespace}".`,
	});

  return {
    attributeName: assertValidBindingAttributeName(attributeName ?? ''),
    blockSlug: targetBlock.blockSlug,
  };
}

function resolvePostMetaInventoryEntry(
	inventory: WorkspaceInventory,
	postMetaName: string,
): WorkspacePostMetaInventoryEntry {
  const postMetaSlug = assertValidGeneratedSlug(
    'Post meta source',
    normalizeBlockSlug(postMetaName),
    'wp-typia add binding-source <name> --from-post-meta <post-meta> [--meta-path <field>]',
  );
  const postMeta = inventory.postMeta.find(
    (entry) => entry.slug === postMetaSlug,
  );
  if (!postMeta) {
    throw new Error(
      `Post meta contract "${postMetaSlug}" does not exist in scripts/block-config.ts. Run \`wp-typia add post-meta ${postMetaSlug} --post-type <post-type>\` first, then retry \`wp-typia add binding-source\`.`,
    );
  }

  return postMeta;
}

async function resolveBindingPostMetaSource(
	projectDir: string,
	inventory: WorkspaceInventory,
	options: Pick<RunAddBindingSourceCommandOptions, 'metaPath' | 'postMetaName'>,
): Promise<BindingPostMetaSource | undefined> {
  const postMetaName = normalizeOptionalCliString(options.postMetaName);
  const metaPath = normalizeOptionalCliString(options.metaPath);
  if (!postMetaName && !metaPath) {
    return undefined;
  }
  if (!postMetaName) {
    throw new Error(
      '`wp-typia add binding-source` requires --from-post-meta <post-meta> or --post-meta <post-meta> when --meta-path is provided.',
    );
  }

  const postMeta = resolvePostMetaInventoryEntry(inventory, postMetaName);
  const fields = await loadPostMetaBindingFields(projectDir, postMeta);
  const selectedField = metaPath
    ? assertPostMetaBindingPath(fields, postMeta.slug, metaPath)
    : fields[0];
  if (!selectedField) {
    throw new Error(
      `Post meta contract "${postMeta.slug}" does not expose a top-level field for binding-source defaults.`,
    );
  }

  return {
    fields,
    metaKey: postMeta.metaKey,
    metaPath: selectedField.name,
    postMetaSlug: postMeta.slug,
    postType: postMeta.postType,
    schemaFile: postMeta.schemaFile,
    sourceTypeName: postMeta.sourceTypeName,
  };
}

function resolveBindingAttributeTsType(schemaType: string): string {
  switch (schemaType) {
    case 'array':
      return 'unknown[]';
    case 'boolean':
      return 'boolean';
    case 'integer':
    case 'number':
      return 'number';
    case 'object':
      return 'Record<string, unknown>';
    default:
      return 'string';
  }
}

function formatBindingAttributeTypeMember(
	attributeName: string,
	schemaType = 'string',
): string {
  const propertyName = /^[A-Za-z_$][\w$]*$/u.test(attributeName)
    ? attributeName
    : JSON.stringify(attributeName);
  const tsType = resolveBindingAttributeTsType(schemaType);
  return [
		'  /**',
		`   * Starter ${tsType} attribute declared for WordPress Block Bindings.`,
		'   */',
		`  ${propertyName}?: ${tsType};`,
	].join('\n');
}

function getInterfaceDeclaration(
	source: string,
	interfaceName: string,
): {
  declaration: ts.InterfaceDeclaration;
  sourceFile: ts.SourceFile;
} | undefined {
  const sourceFile = ts.createSourceFile(
    'types.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let declaration: ts.InterfaceDeclaration | undefined;

  const visit = (node: ts.Node): boolean => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      declaration = node;
      return true;
    }
    return ts.forEachChild(node, (child) => (visit(child)
      ? true
      : undefined)) ?? false;
  };
  visit(sourceFile);

  return declaration ? { declaration, sourceFile } : undefined;
}

function interfaceHasAttributeMember(
	declaration: ts.InterfaceDeclaration,
	attributeName: string,
): boolean {
  return declaration.members.some(
		(member) =>
			ts.isPropertySignature(member) &&
			member.name !== undefined &&
			getPropertyNameText(member.name) === attributeName,
	);
}

function insertBindingAttributeTypeMember(
	source: string,
	declaration: ts.InterfaceDeclaration,
	attributeName: string,
	schemaType = 'string',
): string {
  let closeBracePosition = declaration.end - 1;
  while (closeBracePosition > declaration.pos && source[closeBracePosition] !== '}') {
    closeBracePosition -= 1;
  }
  if (source[closeBracePosition] !== '}') {
    throw new Error('Unable to locate the target interface closing brace.');
  }

  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  const beforeCloseBrace = source.slice(0, closeBracePosition);
  const afterCloseBrace = source.slice(closeBracePosition);
  const memberSource = formatBindingAttributeTypeMember(attributeName, schemaType)
		.split('\n')
		.join(lineEnding);
  const prefix = beforeCloseBrace.endsWith(lineEnding) ? '' : lineEnding;

  return `${beforeCloseBrace}${prefix}${memberSource}${lineEnding}${afterCloseBrace}`;
}

async function ensureBindingTargetBlockAttributeType(
	projectDir: string,
	block: WorkspaceInventory['blocks'][number],
	target: BindingTarget,
	schemaType = 'string',
): Promise<void> {
  if (!block.attributeTypeName) {
    throw new Error(
      `Workspace block "${block.slug}" must include attributeTypeName in scripts/block-config.ts before it can receive binding-source targets.`,
    );
  }

  const typesPath = path.join(projectDir, block.typesFile);
  const source = await fsp.readFile(typesPath, 'utf8');
  const targetInterface = getInterfaceDeclaration(
    source,
    block.attributeTypeName,
  );
  if (!targetInterface) {
    throw new Error(
      `Unable to locate interface ${block.attributeTypeName} in ${block.typesFile}.`,
    );
  }

  let nextSource = source;
  if (!interfaceHasAttributeMember(
    targetInterface.declaration,
    target.attributeName,
  )) {
    nextSource = insertBindingAttributeTypeMember(
      source,
      targetInterface.declaration,
      target.attributeName,
      schemaType,
    );
    await fsp.writeFile(typesPath, nextSource, 'utf8');
  }

  await syncBlockMetadata({
    blockJsonFile: path.join('src', 'blocks', block.slug, 'block.json'),
    jsonSchemaFile: path.join('src', 'blocks', block.slug, 'typia.schema.json'),
    manifestFile: path.join('src', 'blocks', block.slug, 'typia.manifest.json'),
    openApiFile: path.join('src', 'blocks', block.slug, 'typia.openapi.json'),
    projectRoot: projectDir,
    sourceTypeName: block.attributeTypeName,
    typesFile: block.typesFile,
  });
}

/**
 * Add one block binding source scaffold to an official workspace project.
 *
 * @param options Command options for the binding-source scaffold workflow.
 * @param options.attributeName Optional generated block attribute to declare as
 * bindable. Must be provided together with `blockName`.
 * @param options.blockName Optional generated block slug or full block name to
 * receive the bindable attribute wiring. Must be provided together with
 * `attributeName`.
 * @param options.bindingSourceName Human-entered binding source name that will
 * be normalized and validated before files are written.
 * @param options.cwd Working directory used to resolve the nearest official
 * workspace. Defaults to `process.cwd()`.
 * @param options.metaPath Optional top-level post-meta field used as the
 * binding source's default `field` arg. Requires `postMetaName`.
 * @param options.postMetaName Optional generated post-meta contract slug used
 * to back the binding source with `get_post_meta()`.
 * @returns A promise that resolves with the normalized `bindingSourceSlug` and
 * owning `projectDir` after the server/editor files, optional target block
 * metadata, and inventory entry have been written successfully. Post-meta
 * backed results additionally include `metaKey`, `metaPath`, `postMetaSlug`,
 * `postType`, and `schemaFile`.
 * @throws {Error} When the command is run outside an official workspace, when
 * the slug is invalid, when a binding target is incomplete or unknown, or when
 * a conflicting file or inventory entry exists. Post-meta backed runs also
 * throw when the referenced contract or requested top-level field cannot be
 * resolved.
 */
export async function runAddBindingSourceCommand({
	attributeName,
	bindingSourceName,
	blockName,
	cwd = process.cwd(),
	metaPath,
	postMetaName,
}: RunAddBindingSourceCommandOptions): Promise<{
  attributeName?: string;
  bindingSourceSlug: string;
  blockSlug?: string;
  metaKey?: string;
  metaPath?: string;
  postMetaSlug?: string;
  postType?: string;
  projectDir: string;
  schemaFile?: string;
}> {
  const workspace = resolveWorkspaceProject(cwd);
  const bindingSourceSlug = assertValidGeneratedSlug(
    'Binding source name',
    normalizeBlockSlug(bindingSourceName),
    'wp-typia add binding-source <name> [--block <block-slug|namespace/block-slug> --attribute <attribute>] [--from-post-meta <post-meta> --meta-path <field>]',
  );

  const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
  assertBindingSourceDoesNotExist(
    workspace.projectDir,
    bindingSourceSlug,
    inventory,
  );
  const target = resolveBindingTarget(
    {
      attributeName,
      blockName,
    },
    workspace.workspace.namespace,
  );
  const targetBlock = target
    ? resolveWorkspaceBlock(inventory, target.blockSlug)
    : undefined;
  const postMeta = await resolveBindingPostMetaSource(
    workspace.projectDir,
    inventory,
    {
      metaPath,
      postMetaName,
    },
  );

  const blockConfigPath = path.join(
    workspace.projectDir,
    'scripts',
    'block-config.ts',
  );
  const bootstrapPath = getWorkspaceBootstrapPath(workspace);
  const bindingsIndexPath = await resolveBindingSourceRegistryPath(
    workspace.projectDir,
  );
  const bindingSourceDir = path.join(
    workspace.projectDir,
    'src',
    'bindings',
    bindingSourceSlug,
  );
  const serverFilePath = path.join(bindingSourceDir, 'server.php');
  const editorFilePath = path.join(bindingSourceDir, 'editor.ts');
  const blockJsonPath = target
    ? path.join(
        workspace.projectDir,
        'src',
        'blocks',
        target.blockSlug,
        'block.json',
      )
    : undefined;
  const targetGeneratedMetadataPaths = target
    ? [
        path.join(
          workspace.projectDir,
          'src',
          'blocks',
          target.blockSlug,
          'typia.manifest.json',
        ),
        path.join(
          workspace.projectDir,
          'src',
          'blocks',
          target.blockSlug,
          'typia.openapi.json',
        ),
        path.join(
          workspace.projectDir,
          'src',
          'blocks',
          target.blockSlug,
          'typia.schema.json',
        ),
        path.join(
          workspace.projectDir,
          'src',
          'blocks',
          target.blockSlug,
          'typia-validator.php',
        ),
      ]
    : [];
  const mutationSnapshot: WorkspaceMutationSnapshot = {
		fileSources: await snapshotWorkspaceFiles([
			blockConfigPath,
			bootstrapPath,
			bindingsIndexPath,
			...(blockJsonPath ? [blockJsonPath] : []),
			...(targetBlock ? [path.join(workspace.projectDir, targetBlock.typesFile)] : []),
			...targetGeneratedMetadataPaths,
		]),
		snapshotDirs: [],
		targetPaths: [bindingSourceDir],
	};

  try {
    await fsp.mkdir(bindingSourceDir, { recursive: true });
    await ensureBindingSourceBootstrapAnchors(workspace);
    await fsp.writeFile(
      serverFilePath,
      buildBindingSourceServerSource(
        bindingSourceSlug,
        workspace.workspace.phpPrefix,
        workspace.workspace.namespace,
        workspace.workspace.textDomain,
        target,
        postMeta,
      ),
      'utf8',
    );
    await fsp.writeFile(
      editorFilePath,
      buildBindingSourceEditorSource(
        bindingSourceSlug,
        workspace.workspace.namespace,
        workspace.workspace.textDomain,
        target,
        postMeta,
      ),
      'utf8',
    );
    if (target && targetBlock) {
      const targetSchemaType =
				postMeta?.fields.find(
          (field) => field.name === postMeta.metaPath,
        )?.schemaType ??
				'string';
      await ensureBindingTargetBlockAttributeType(
        workspace.projectDir,
        targetBlock,
        target,
        targetSchemaType,
      );
    }
    await writeBindingSourceRegistry(workspace.projectDir, bindingSourceSlug);
    await appendWorkspaceInventoryEntries(workspace.projectDir, {
      bindingSourceEntries: [
        buildBindingSourceConfigEntry(bindingSourceSlug, target, postMeta),
      ],
    });

    return {
			...(target ? { attributeName: target.attributeName, blockSlug: target.blockSlug } : {}),
			bindingSourceSlug,
			...(postMeta
				? {
						metaKey: postMeta.metaKey,
						metaPath: postMeta.metaPath,
						postMetaSlug: postMeta.postMetaSlug,
						postType: postMeta.postType,
						schemaFile: postMeta.schemaFile,
					}
				: {}),
			projectDir: workspace.projectDir,
		};
  } catch (error) {
    await rollbackWorkspaceMutation(mutationSnapshot);
    throw error;
  }
}
