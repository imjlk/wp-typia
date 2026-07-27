import fs from 'node:fs';
import path from 'node:path';

import type {
	WorkspaceInventory,
} from '../workspace/workspace-inventory.js';

type ScaffoldFilesystemCollision = {
  label: string;
  relativePath: string;
};

type ScaffoldFilesystemCollisionDescriptor<TContext> = {
  label: string;
  relativePath: (context: TContext) => string;
};

type ScaffoldInventoryCollision<TEntry> = {
  entries: readonly TEntry[];
  exists: (entry: TEntry) => boolean;
  message: string;
};

type ScaffoldInventoryCollisionDescriptor<TContext, TEntry> = {
  entries: (inventory: WorkspaceInventory) => readonly TEntry[];
  exists: (entry: TEntry, context: TContext) => boolean;
  message: (context: TContext) => string;
};

type ScaffoldCollisionDescriptor<TContext, TEntry> = {
  filesystemCollisions: readonly ScaffoldFilesystemCollisionDescriptor<TContext>[];
  inventoryCollision?: ScaffoldInventoryCollisionDescriptor<TContext, TEntry>;
};

type BlockChildCollisionContext = {
  blockSlug: string;
  slug: string;
};

type SlugCollisionContext = {
  slug: string;
};

type PostMetaCollisionContext = {
  metaKey: string;
  postType: string;
  slug: string;
};

/**
 * Ensure scaffold targets do not already exist on disk or in workspace inventory.
 *
 * @param options Collision checks to run before writing scaffold files.
 * @throws {Error} When a filesystem path or inventory entry already exists.
 */
export function assertScaffoldDoesNotExist<TEntry>(options: {
  projectDir: string;
  filesystemCollisions: readonly ScaffoldFilesystemCollision[];
  inventoryCollision?: ScaffoldInventoryCollision<TEntry>;
}): void {
  for (const collision of options.filesystemCollisions) {
    const targetPath = path.join(options.projectDir, collision.relativePath);
    if (fs.existsSync(targetPath)) {
      throw new Error(
        `${collision.label} already exists at ${path.relative(options.projectDir, targetPath)}. Choose a different name.`,
      );
    }
  }

  if (
		options.inventoryCollision &&
		options.inventoryCollision.entries.some(options.inventoryCollision.exists)
	) {
    throw new Error(options.inventoryCollision.message);
  }
}

/**
 * Run descriptor-backed add-kind collision checks.
 *
 * Use descriptors when an add kind only needs predictable filesystem and
 * inventory targets. Keep custom checks for add kinds that depend on rendered
 * template outputs, compound scaffolds, or other command-specific state.
 *
 * @param options Descriptor, context, inventory, and project root for the check.
 * @throws {Error} When any descriptor-backed target already exists.
 */
function assertAddKindScaffoldDoesNotExist<TContext, TEntry>(options: {
  projectDir: string;
  inventory: WorkspaceInventory;
  context: TContext;
  descriptor: ScaffoldCollisionDescriptor<TContext, TEntry>;
}): void {
  const inventoryCollision = options.descriptor.inventoryCollision;
  assertScaffoldDoesNotExist({
    filesystemCollisions: options.descriptor.filesystemCollisions.map(
      (collision) => ({
        label: collision.label,
        relativePath: collision.relativePath(options.context),
      }),
    ),
    inventoryCollision: inventoryCollision
      ? {
          entries: inventoryCollision.entries(options.inventory),
          exists: (entry) => inventoryCollision.exists(entry, options.context),
          message: inventoryCollision.message(options.context),
        }
      : undefined,
    projectDir: options.projectDir,
  });
}

const VARIATION_COLLISION_DESCRIPTOR: ScaffoldCollisionDescriptor<
	BlockChildCollisionContext,
	WorkspaceInventory['variations'][number]
> = {
	filesystemCollisions: [
		{
			label: 'A variation',
			relativePath: ({ blockSlug, slug }) =>
				path.join('src', 'blocks', blockSlug, 'variations', `${slug}.ts`),
		},
	],
	inventoryCollision: {
		entries: (inventory) => inventory.variations,
		exists: (entry, { blockSlug, slug }) =>
			entry.block === blockSlug && entry.slug === slug,
		message: ({ blockSlug, slug }) =>
			`A variation inventory entry already exists for ${blockSlug}/${slug}. Choose a different name.`,
	},
};

const BLOCK_STYLE_COLLISION_DESCRIPTOR: ScaffoldCollisionDescriptor<
	BlockChildCollisionContext,
	WorkspaceInventory['blockStyles'][number]
> = {
	filesystemCollisions: [
		{
			label: 'A block style',
			relativePath: ({ blockSlug, slug }) =>
				path.join('src', 'blocks', blockSlug, 'styles', `${slug}.ts`),
		},
	],
	inventoryCollision: {
		entries: (inventory) => inventory.blockStyles,
		exists: (entry, { blockSlug, slug }) =>
			entry.block === blockSlug && entry.slug === slug,
		message: ({ blockSlug, slug }) =>
			`A block style inventory entry already exists for ${blockSlug}/${slug}. Choose a different name.`,
	},
};

const BLOCK_TRANSFORM_COLLISION_DESCRIPTOR: ScaffoldCollisionDescriptor<
	BlockChildCollisionContext,
	WorkspaceInventory['blockTransforms'][number]
> = {
	filesystemCollisions: [
		{
			label: 'A block transform',
			relativePath: ({ blockSlug, slug }) =>
				path.join('src', 'blocks', blockSlug, 'transforms', `${slug}.ts`),
		},
	],
	inventoryCollision: {
		entries: (inventory) => inventory.blockTransforms,
		exists: (entry, { blockSlug, slug }) =>
			entry.block === blockSlug && entry.slug === slug,
		message: ({ blockSlug, slug }) =>
			`A block transform inventory entry already exists for ${blockSlug}/${slug}. Choose a different name.`,
	},
};

const PATTERN_COLLISION_DESCRIPTOR: ScaffoldCollisionDescriptor<
	SlugCollisionContext,
	WorkspaceInventory['patterns'][number]
> = {
	filesystemCollisions: [
		{
			label: 'A pattern',
			relativePath: ({ slug }) => path.join('src', 'patterns', `${slug}.php`),
		},
		{
			label: 'A full pattern',
			relativePath: ({ slug }) =>
				path.join('src', 'patterns', 'full', `${slug}.php`),
		},
		{
			label: 'A section pattern',
			relativePath: ({ slug }) =>
				path.join('src', 'patterns', 'sections', `${slug}.php`),
		},
	],
	inventoryCollision: {
		entries: (inventory) => inventory.patterns,
		exists: (entry, { slug }) => entry.slug === slug,
		message: ({ slug }) =>
			`A pattern inventory entry already exists for ${slug}. Choose a different name.`,
	},
};

const BINDING_SOURCE_COLLISION_DESCRIPTOR: ScaffoldCollisionDescriptor<
	SlugCollisionContext,
	WorkspaceInventory['bindingSources'][number]
> = {
	filesystemCollisions: [
		{
			label: 'A binding source',
			relativePath: ({ slug }) => path.join('src', 'bindings', slug),
		},
	],
	inventoryCollision: {
		entries: (inventory) => inventory.bindingSources,
		exists: (entry, { slug }) => entry.slug === slug,
		message: ({ slug }) =>
			`A binding source inventory entry already exists for ${slug}. Choose a different name.`,
	},
};

const REST_RESOURCE_COLLISION_DESCRIPTOR: ScaffoldCollisionDescriptor<
	SlugCollisionContext,
	WorkspaceInventory['restResources'][number]
> = {
	filesystemCollisions: [
		{
			label: 'A REST resource',
			relativePath: ({ slug }) => path.join('src', 'rest', slug),
		},
		{
			label: 'A REST resource bootstrap',
			relativePath: ({ slug }) => path.join('inc', 'rest', `${slug}.php`),
		},
	],
	inventoryCollision: {
		entries: (inventory) => inventory.restResources,
		exists: (entry, { slug }) => entry.slug === slug,
		message: ({ slug }) =>
			`A REST resource inventory entry already exists for ${slug}. Choose a different name.`,
	},
};

const POST_META_COLLISION_DESCRIPTOR: ScaffoldCollisionDescriptor<
	PostMetaCollisionContext,
	WorkspaceInventory['postMeta'][number]
> = {
	filesystemCollisions: [
		{
			label: 'A post meta contract',
			relativePath: ({ slug }) => path.join('src', 'post-meta', slug),
		},
		{
			label: 'A post meta bootstrap',
			relativePath: ({ slug }) => path.join('inc', 'post-meta', `${slug}.php`),
		},
	],
	inventoryCollision: {
		entries: (inventory) => inventory.postMeta,
		exists: (entry, { slug }) => entry.slug === slug,
		message: ({ slug }) =>
			`A post meta inventory entry already exists for ${slug}. Choose a different name.`,
	},
};

const CONTRACT_COLLISION_DESCRIPTOR: ScaffoldCollisionDescriptor<
	SlugCollisionContext,
	WorkspaceInventory['contracts'][number]
> = {
	filesystemCollisions: [
		{
			label: 'A standalone contract',
			relativePath: ({ slug }) => path.join('src', 'contracts', `${slug}.ts`),
		},
		{
			label: 'A standalone contract schema',
			relativePath: ({ slug }) =>
				path.join('src', 'contracts', `${slug}.schema.json`),
		},
	],
	inventoryCollision: {
		entries: (inventory) => inventory.contracts,
		exists: (entry, { slug }) => entry.slug === slug,
		message: ({ slug }) =>
			`A standalone contract inventory entry already exists for ${slug}. Choose a different name.`,
	},
};

const ADMIN_VIEW_COLLISION_DESCRIPTOR: ScaffoldCollisionDescriptor<
	SlugCollisionContext,
	WorkspaceInventory['adminViews'][number]
> = {
	filesystemCollisions: [
		{
			label: 'An admin view',
			relativePath: ({ slug }) => path.join('src', 'admin-views', slug),
		},
		{
			label: 'An admin view bootstrap',
			relativePath: ({ slug }) =>
				path.join('inc', 'admin-views', `${slug}.php`),
		},
	],
	inventoryCollision: {
		entries: (inventory) => inventory.adminViews,
		exists: (entry, { slug }) => entry.slug === slug,
		message: ({ slug }) =>
			`An admin view inventory entry already exists for ${slug}. Choose a different name.`,
	},
};

const ABILITY_COLLISION_DESCRIPTOR: ScaffoldCollisionDescriptor<
	SlugCollisionContext,
	WorkspaceInventory['abilities'][number]
> = {
	filesystemCollisions: [
		{
			label: 'An ability scaffold',
			relativePath: ({ slug }) => path.join('src', 'abilities', slug),
		},
		{
			label: 'An ability bootstrap',
			relativePath: ({ slug }) => path.join('inc', 'abilities', `${slug}.php`),
		},
	],
	inventoryCollision: {
		entries: (inventory) => inventory.abilities,
		exists: (entry, { slug }) => entry.slug === slug,
		message: ({ slug }) =>
			`An ability inventory entry already exists for ${slug}. Choose a different name.`,
	},
};

const AI_FEATURE_COLLISION_DESCRIPTOR: ScaffoldCollisionDescriptor<
	SlugCollisionContext,
	WorkspaceInventory['aiFeatures'][number]
> = {
	filesystemCollisions: [
		{
			label: 'An AI feature',
			relativePath: ({ slug }) => path.join('src', 'ai-features', slug),
		},
		{
			label: 'An AI feature bootstrap',
			relativePath: ({ slug }) =>
				path.join('inc', 'ai-features', `${slug}.php`),
		},
	],
	inventoryCollision: {
		entries: (inventory) => inventory.aiFeatures,
		exists: (entry, { slug }) => entry.slug === slug,
		message: ({ slug }) =>
			`An AI feature inventory entry already exists for ${slug}. Choose a different name.`,
	},
};

const EDITOR_PLUGIN_COLLISION_DESCRIPTOR: ScaffoldCollisionDescriptor<
	SlugCollisionContext,
	WorkspaceInventory['editorPlugins'][number]
> = {
	filesystemCollisions: [
		{
			label: 'An editor plugin',
			relativePath: ({ slug }) => path.join('src', 'editor-plugins', slug),
		},
	],
	inventoryCollision: {
		entries: (inventory) => inventory.editorPlugins,
		exists: (entry, { slug }) => entry.slug === slug,
		message: ({ slug }) =>
			`An editor plugin inventory entry already exists for ${slug}. Choose a different name.`,
	},
};

/**
 * Ensure a block variation scaffold does not already exist.
 *
 * @param projectDir Absolute workspace root used to resolve scaffold paths.
 * @param blockSlug Existing workspace block slug that owns the variation.
 * @param variationSlug Normalized variation slug that would be created.
 * @param inventory Current workspace inventory used for duplicate detection.
 * @throws {Error} When the variation file or inventory entry already exists.
 */
export function assertVariationDoesNotExist(
	projectDir: string,
	blockSlug: string,
	variationSlug: string,
	inventory: WorkspaceInventory,
): void {
  assertAddKindScaffoldDoesNotExist({
    context: { blockSlug, slug: variationSlug },
    descriptor: VARIATION_COLLISION_DESCRIPTOR,
    inventory,
    projectDir,
  });
}

/**
 * Ensure a block style scaffold does not already exist.
 *
 * @param projectDir Absolute workspace root used to resolve scaffold paths.
 * @param blockSlug Existing workspace block slug that owns the style.
 * @param styleSlug Normalized style slug that would be created.
 * @param inventory Current workspace inventory used for duplicate detection.
 * @throws {Error} When the style file or inventory entry already exists.
 */
export function assertBlockStyleDoesNotExist(
	projectDir: string,
	blockSlug: string,
	styleSlug: string,
	inventory: WorkspaceInventory,
): void {
  assertAddKindScaffoldDoesNotExist({
    context: { blockSlug, slug: styleSlug },
    descriptor: BLOCK_STYLE_COLLISION_DESCRIPTOR,
    inventory,
    projectDir,
  });
}

/**
 * Ensure a block transform scaffold does not already exist.
 *
 * @param projectDir Absolute workspace root used to resolve scaffold paths.
 * @param blockSlug Existing workspace block slug that owns the transform.
 * @param transformSlug Normalized transform slug that would be created.
 * @param inventory Current workspace inventory used for duplicate detection.
 * @throws {Error} When the transform file or inventory entry already exists.
 */
export function assertBlockTransformDoesNotExist(
	projectDir: string,
	blockSlug: string,
	transformSlug: string,
	inventory: WorkspaceInventory,
): void {
  assertAddKindScaffoldDoesNotExist({
    context: { blockSlug, slug: transformSlug },
    descriptor: BLOCK_TRANSFORM_COLLISION_DESCRIPTOR,
    inventory,
    projectDir,
  });
}

/**
 * Ensure a pattern scaffold does not already exist on disk or in inventory.
 *
 * Delegates filesystem and inventory checks to `assertScaffoldDoesNotExist`.
 *
 * @param projectDir Absolute workspace root used to resolve scaffold paths.
 * @param patternSlug Normalized pattern slug that would be created.
 * @param inventory Current workspace inventory used for duplicate detection.
 * @throws {Error} When the pattern file or inventory entry already exists.
 */
export function assertPatternDoesNotExist(
	projectDir: string,
	patternSlug: string,
	inventory: WorkspaceInventory,
): void {
  assertAddKindScaffoldDoesNotExist({
    context: { slug: patternSlug },
    descriptor: PATTERN_COLLISION_DESCRIPTOR,
    inventory,
    projectDir,
  });
}

/**
 * Ensure a binding source scaffold does not already exist on disk or in inventory.
 *
 * Delegates filesystem and inventory checks to `assertScaffoldDoesNotExist`.
 *
 * @param projectDir Absolute workspace root used to resolve scaffold paths.
 * @param bindingSourceSlug Normalized binding source slug that would be created.
 * @param inventory Current workspace inventory used for duplicate detection.
 * @throws {Error} When the binding directory or inventory entry already exists.
 */
export function assertBindingSourceDoesNotExist(
	projectDir: string,
	bindingSourceSlug: string,
	inventory: WorkspaceInventory,
): void {
  assertAddKindScaffoldDoesNotExist({
    context: { slug: bindingSourceSlug },
    descriptor: BINDING_SOURCE_COLLISION_DESCRIPTOR,
    inventory,
    projectDir,
  });
}

/**
 * Ensure a REST resource scaffold does not already exist on disk or in inventory.
 *
 * Delegates filesystem and inventory checks to `assertScaffoldDoesNotExist`.
 *
 * @param projectDir Absolute workspace root used to resolve scaffold paths.
 * @param restResourceSlug Normalized REST resource slug that would be created.
 * @param inventory Current workspace inventory used for duplicate detection.
 * @throws {Error} When REST resource files or inventory entry already exist.
 */
export function assertRestResourceDoesNotExist(
	projectDir: string,
	restResourceSlug: string,
	inventory: WorkspaceInventory,
): void {
  assertAddKindScaffoldDoesNotExist({
    context: { slug: restResourceSlug },
    descriptor: REST_RESOURCE_COLLISION_DESCRIPTOR,
    inventory,
    projectDir,
  });
}

/**
 * Ensure a post-meta contract scaffold does not already exist on disk or in
 * inventory.
 *
 * Also prevents accidentally registering the same meta key for the same post
 * type through a second generated contract.
 *
 * @param projectDir Absolute workspace root used to resolve scaffold paths.
 * @param postMetaSlug Normalized post-meta contract slug.
 * @param postType WordPress post type scope.
 * @param metaKey WordPress meta key.
 * @param inventory Current workspace inventory used for duplicate detection.
 * @throws {Error} When post-meta files or inventory entries already exist.
 */
export function assertPostMetaDoesNotExist(
	projectDir: string,
	postMetaSlug: string,
	postType: string,
	metaKey: string,
	inventory: WorkspaceInventory,
): void {
  assertAddKindScaffoldDoesNotExist({
    context: { metaKey, postType, slug: postMetaSlug },
    descriptor: POST_META_COLLISION_DESCRIPTOR,
    inventory,
    projectDir,
  });

  if (
		inventory.postMeta.some(
      (entry) => entry.postType === postType && entry.metaKey === metaKey,
    )
	) {
    throw new Error(
      `A post meta inventory entry already registers ${metaKey} for ${postType}. Choose a different meta key or post type.`,
    );
  }
}

/**
 * Ensure a standalone contract scaffold does not already exist on disk or in
 * inventory.
 *
 * @param projectDir Absolute workspace root used to resolve scaffold paths.
 * @param contractSlug Normalized contract slug that would be created.
 * @param inventory Current workspace inventory used for duplicate detection.
 * @throws {Error} When contract files or inventory entry already exist.
 */
export function assertContractDoesNotExist(
	projectDir: string,
	contractSlug: string,
	inventory: WorkspaceInventory,
): void {
  assertAddKindScaffoldDoesNotExist({
    context: { slug: contractSlug },
    descriptor: CONTRACT_COLLISION_DESCRIPTOR,
    inventory,
    projectDir,
  });
}

/**
 * Ensure a DataViews admin screen scaffold does not already exist on disk or in
 * the workspace inventory.
 *
 * @param projectDir Workspace root directory.
 * @param adminViewSlug Normalized admin screen slug.
 * @param inventory Parsed workspace inventory.
 * @throws {Error} When the directory, PHP bootstrap, or inventory entry already exists.
 */
export function assertAdminViewDoesNotExist(
	projectDir: string,
	adminViewSlug: string,
	inventory: WorkspaceInventory,
): void {
  assertAddKindScaffoldDoesNotExist({
    context: { slug: adminViewSlug },
    descriptor: ADMIN_VIEW_COLLISION_DESCRIPTOR,
    inventory,
    projectDir,
  });
}

/**
 * Ensure a workflow ability scaffold does not already exist on disk or in the
 * workspace inventory.
 *
 * The check covers the generated `src/abilities/<slug>` directory,
 * `inc/abilities/<slug>.php`, and any matching `inventory.abilities` entry.
 *
 * @param projectDir Workspace root directory.
 * @param abilitySlug Normalized workflow ability slug.
 * @param inventory Parsed workspace inventory.
 * @throws {Error} When the ability directory, PHP bootstrap, or inventory entry already exists.
 */
export function assertAbilityDoesNotExist(
	projectDir: string,
	abilitySlug: string,
	inventory: WorkspaceInventory,
): void {
  assertAddKindScaffoldDoesNotExist({
    context: { slug: abilitySlug },
    descriptor: ABILITY_COLLISION_DESCRIPTOR,
    inventory,
    projectDir,
  });
}

/**
 * Ensure an AI feature scaffold does not already exist on disk or in inventory.
 *
 * Delegates filesystem and inventory checks to `assertScaffoldDoesNotExist`.
 *
 * @param projectDir Absolute workspace root used to resolve scaffold paths.
 * @param aiFeatureSlug Normalized AI feature slug that would be created.
 * @param inventory Current workspace inventory used for duplicate detection.
 * @throws {Error} When AI feature files or inventory entry already exist.
 */
export function assertAiFeatureDoesNotExist(
	projectDir: string,
	aiFeatureSlug: string,
	inventory: WorkspaceInventory,
): void {
  assertAddKindScaffoldDoesNotExist({
    context: { slug: aiFeatureSlug },
    descriptor: AI_FEATURE_COLLISION_DESCRIPTOR,
    inventory,
    projectDir,
  });
}

/**
 * Ensure an editor plugin scaffold does not already exist on disk or in the
 * workspace inventory.
 *
 * @param projectDir Workspace root directory.
 * @param editorPluginSlug Normalized editor plugin slug.
 * @param inventory Parsed workspace inventory.
 * @throws {Error} When the directory or inventory entry already exists.
 */
export function assertEditorPluginDoesNotExist(
	projectDir: string,
	editorPluginSlug: string,
	inventory: WorkspaceInventory,
): void {
  assertAddKindScaffoldDoesNotExist({
    context: { slug: editorPluginSlug },
    descriptor: EDITOR_PLUGIN_COLLISION_DESCRIPTOR,
    inventory,
    projectDir,
  });
}
