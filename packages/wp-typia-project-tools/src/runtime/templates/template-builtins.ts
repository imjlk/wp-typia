import path from 'node:path';
import { promises as fsp } from 'node:fs';

import { pathExists } from '../shared/fs-async.js';
import { createManagedTempRoot } from '../shared/temp-roots.js';
import {
  getTemplateById,
  SHARED_BASE_TEMPLATE_ROOT,
  SHARED_COMPOUND_TEMPLATE_ROOT,
  SHARED_MIGRATION_UI_TEMPLATE_ROOT,
  SHARED_PERSISTENCE_TEMPLATE_ROOT,
  SHARED_PRESET_TEMPLATE_ROOT,
  SHARED_REST_HELPER_TEMPLATE_ROOT,
  SHARED_WORKSPACE_TEMPLATE_ROOT,
  type BuiltInTemplateId,
} from './template-registry.js';

/**
 * Controls which persistence layer is applied when materializing the built-in
 * `persistence` template.
 */
export type BuiltInPersistencePolicy = 'authenticated' | 'public';

export interface BuiltInTemplateVariantOptions {
  persistenceEnabled?: boolean;
  persistencePolicy?: BuiltInPersistencePolicy;
}

export interface MaterializedBuiltInTemplateSource {
  id: BuiltInTemplateId;
  defaultCategory: string;
  description: string;
  features: string[];
  format: 'wp-typia';
  templateDir: string;
  cleanup?: () => Promise<void>;
  selectedVariant?: string | null;
  warnings?: string[];
}

export interface BuiltInSharedTemplateLayer {
  dir: string;
  id: string;
}

const BUILT_IN_SHARED_TEMPLATE_LAYERS = Object.freeze<BuiltInSharedTemplateLayer[]>(
  [
    {
      dir: SHARED_BASE_TEMPLATE_ROOT,
      id: 'builtin:shared/base',
    },
    {
      dir: path.join(SHARED_REST_HELPER_TEMPLATE_ROOT, 'shared'),
      id: 'builtin:shared/rest-helpers/shared',
    },
    {
      dir: path.join(SHARED_REST_HELPER_TEMPLATE_ROOT, 'public'),
      id: 'builtin:shared/rest-helpers/public',
    },
    {
      dir: path.join(SHARED_REST_HELPER_TEMPLATE_ROOT, 'auth'),
      id: 'builtin:shared/rest-helpers/auth',
    },
    {
      dir: path.join(SHARED_PERSISTENCE_TEMPLATE_ROOT, 'core'),
      id: 'builtin:shared/persistence/core',
    },
    {
      dir: path.join(SHARED_PERSISTENCE_TEMPLATE_ROOT, 'public'),
      id: 'builtin:shared/persistence/public',
    },
    {
      dir: path.join(SHARED_PERSISTENCE_TEMPLATE_ROOT, 'auth'),
      id: 'builtin:shared/persistence/auth',
    },
    {
      dir: path.join(SHARED_COMPOUND_TEMPLATE_ROOT, 'core'),
      id: 'builtin:shared/compound/core',
    },
    {
      dir: path.join(SHARED_COMPOUND_TEMPLATE_ROOT, 'persistence'),
      id: 'builtin:shared/compound/persistence',
    },
    {
      dir: path.join(SHARED_COMPOUND_TEMPLATE_ROOT, 'persistence-public'),
      id: 'builtin:shared/compound/persistence-public',
    },
    {
      dir: path.join(SHARED_COMPOUND_TEMPLATE_ROOT, 'persistence-auth'),
      id: 'builtin:shared/compound/persistence-auth',
    },
    {
      dir: path.join(SHARED_MIGRATION_UI_TEMPLATE_ROOT, 'common'),
      id: 'builtin:shared/migration-ui/common',
    },
    {
      dir: path.join(SHARED_PRESET_TEMPLATE_ROOT, 'wp-env'),
      id: 'builtin:shared/presets/wp-env',
    },
    {
      dir: path.join(SHARED_PRESET_TEMPLATE_ROOT, 'test-preset'),
      id: 'builtin:shared/presets/test-preset',
    },
    {
      dir: path.join(SHARED_WORKSPACE_TEMPLATE_ROOT, 'persistence-public'),
      id: 'builtin:shared/workspace/persistence-public',
    },
    {
      dir: path.join(SHARED_WORKSPACE_TEMPLATE_ROOT, 'persistence-auth'),
      id: 'builtin:shared/workspace/persistence-auth',
    },
  ],
);

const BUILT_IN_SHARED_TEMPLATE_LAYER_DIRS = new Map(
  BUILT_IN_SHARED_TEMPLATE_LAYERS.map((layer) => [layer.id, layer.dir] as const),
);

const OMITTABLE_BUILT_IN_OVERLAY_TEMPLATE_IDS = new Set<BuiltInTemplateId>([
  'basic',
  'persistence',
  'compound',
]);

export function listBuiltInSharedTemplateLayers(): readonly BuiltInSharedTemplateLayer[] {
  return BUILT_IN_SHARED_TEMPLATE_LAYERS;
}

export function isBuiltInSharedTemplateLayerId(layerId: string): boolean {
  return BUILT_IN_SHARED_TEMPLATE_LAYER_DIRS.has(layerId);
}

export function getBuiltInSharedTemplateLayerDir(layerId: string): string {
  const layerDir = BUILT_IN_SHARED_TEMPLATE_LAYER_DIRS.get(layerId);
  if (!layerDir) {
    throw new Error(`Unknown built-in shared template layer id: ${layerId}`);
  }
  return layerDir;
}

export function getBuiltInTemplateOverlayDir(templateId: BuiltInTemplateId): string {
  return getTemplateById(templateId).templateDir;
}

export function getBuiltInTemplateSharedLayerDirs(
	templateId: BuiltInTemplateId,
	{
		persistenceEnabled = false,
		persistencePolicy = 'authenticated',
	}: BuiltInTemplateVariantOptions = {},
): string[] {
  if (templateId === 'persistence') {
    return [
      SHARED_BASE_TEMPLATE_ROOT,
      path.join(SHARED_REST_HELPER_TEMPLATE_ROOT, 'shared'),
      path.join(SHARED_PERSISTENCE_TEMPLATE_ROOT, 'core'),
      path.join(
        SHARED_REST_HELPER_TEMPLATE_ROOT,
        persistencePolicy === 'public' ? 'public' : 'auth',
      ),
      path.join(
        SHARED_PERSISTENCE_TEMPLATE_ROOT,
        persistencePolicy === 'public' ? 'public' : 'auth',
      ),
    ];
  }

  if (templateId === 'compound') {
    const layers = [
      SHARED_BASE_TEMPLATE_ROOT,
      path.join(SHARED_COMPOUND_TEMPLATE_ROOT, 'core'),
    ];

    if (persistenceEnabled) {
      layers.push(
        path.join(SHARED_REST_HELPER_TEMPLATE_ROOT, 'shared'),
        path.join(SHARED_COMPOUND_TEMPLATE_ROOT, 'persistence'),
        path.join(
          SHARED_REST_HELPER_TEMPLATE_ROOT,
          persistencePolicy === 'public' ? 'public' : 'auth',
        ),
        path.join(
          SHARED_COMPOUND_TEMPLATE_ROOT,
          persistencePolicy === 'public'
            ? 'persistence-public'
            : 'persistence-auth',
        ),
      );
    }

    return layers;
  }

  return [SHARED_BASE_TEMPLATE_ROOT];
}

/**
 * Returns the ordered overlay directories for a built-in template.
 *
 * Persistence templates include the shared base, the persistence core layer,
 * the selected policy layer, and the thin template overlay. All other built-ins
 * resolve to the shared base plus their own template directory.
 */
export function getBuiltInTemplateLayerDirs(
	templateId: BuiltInTemplateId,
	options: BuiltInTemplateVariantOptions = {},
): string[] {
  return [
    ...getBuiltInTemplateSharedLayerDirs(templateId, options),
    getBuiltInTemplateOverlayDir(templateId),
  ];
}

/**
 * Returns whether a missing built-in overlay directory is expected because the
 * template family no longer ships any Mustache assets in that layer.
 *
 * @param templateId Built-in template family being resolved.
 * @param layerDir Candidate overlay directory for that family.
 * @returns True when the missing layer can be skipped safely.
 */
export function isOmittableBuiltInTemplateLayerDir(
	templateId: BuiltInTemplateId,
	layerDir: string,
): boolean {
  return (
		OMITTABLE_BUILT_IN_OVERLAY_TEMPLATE_IDS.has(templateId) &&
		layerDir === getTemplateById(templateId).templateDir
	);
}

async function resolveMaterializedTemplateLayerDirs(
	templateId: BuiltInTemplateId,
	layerDirs: readonly string[],
): Promise<string[]> {
  const materializedLayerDirs: string[] = [];
  for (const layerDir of layerDirs) {
    if (await pathExists(layerDir)) {
      materializedLayerDirs.push(layerDir);
      continue;
    }

    if (isOmittableBuiltInTemplateLayerDir(templateId, layerDir)) {
      continue;
    }

    throw new Error(`Built-in template layer is missing: ${layerDir}`);
  }
  return materializedLayerDirs;
}

async function materializeBuiltInTemplateSource(
	templateId: BuiltInTemplateId,
	layerDirs: readonly string[],
): Promise<MaterializedBuiltInTemplateSource> {
  const template = getTemplateById(templateId);
  const materializedLayerDirs = await resolveMaterializedTemplateLayerDirs(
    templateId,
    layerDirs,
  );
  const { path: tempRoot, cleanup } = await createManagedTempRoot(
    'wp-typia-template-',
  );
  const templateDir = path.join(tempRoot, templateId);

  try {
    await fsp.mkdir(templateDir, { recursive: true });

    for (const layerDir of materializedLayerDirs) {
      await fsp.cp(layerDir, templateDir, {
        recursive: true,
        force: true,
      });
    }
  } catch (error) {
    await cleanup();
    throw error;
  }

  return {
    id: templateId,
    defaultCategory: template.defaultCategory,
    description: template.description,
    features: template.features,
    format: 'wp-typia',
    templateDir,
    cleanup,
  };
}

export async function resolveBuiltInTemplateSourceFromLayerDirs(
	templateId: BuiltInTemplateId,
	layerDirs: readonly string[],
): Promise<MaterializedBuiltInTemplateSource> {
  return materializeBuiltInTemplateSource(templateId, layerDirs);
}

/**
 * Materializes a built-in template into a temporary directory by copying each
 * resolved layer in order.
 *
 * Callers should invoke the returned `cleanup` function when they no longer
 * need the materialized directory. If copying fails, the temporary directory is
 * removed before the error is rethrown.
 */
export async function resolveBuiltInTemplateSource(
	templateId: BuiltInTemplateId,
	options: BuiltInTemplateVariantOptions = {},
): Promise<MaterializedBuiltInTemplateSource> {
  return materializeBuiltInTemplateSource(
    templateId,
    getBuiltInTemplateLayerDirs(templateId, options),
  );
}
