import path from 'node:path';
import { promises as fsp } from 'node:fs';

import { pathExists } from '../shared/fs-async.js';
import { readJsonFile } from '../shared/json-utils.js';
import { isPlainObject } from '../shared/object-utils.js';
import {
  getBuiltInSharedTemplateLayerDir,
  isBuiltInSharedTemplateLayerId,
} from './template-builtins.js';
import { listInterpolatedDirectoryOutputs } from './template-render.js';

export const TEMPLATE_LAYER_MANIFEST_FILENAME = 'wp-typia.layers.json';
const TEMPLATE_LAYER_MANIFEST_VERSION = 1 as const;

export interface ExternalTemplateLayerDefinition {
  description?: string;
  extends?: string[];
  path: string;
}

export interface ExternalTemplateLayerManifest {
  layers: Record<string, ExternalTemplateLayerDefinition>;
  version: typeof TEMPLATE_LAYER_MANIFEST_VERSION;
}

export interface ResolvedTemplateLayerEntry {
  dir: string;
  id: string;
  kind: 'built-in' | 'external';
}

export interface ResolvedExternalTemplateLayers {
  entries: ResolvedTemplateLayerEntry[];
  selectedLayerId: string;
}

export interface SelectableExternalTemplateLayer {
  description?: string;
  extends: string[];
  id: string;
}

function resolveLayerPath(sourceRoot: string, relativePath: string): string {
  const targetPath = path.resolve(sourceRoot, relativePath);
  const relativeTarget = path.relative(sourceRoot, targetPath);
  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    throw new Error(
      `Template layer path "${relativePath}" must stay within ${sourceRoot}.`,
    );
  }
  return targetPath;
}

async function assertNoSymlinks(sourceDir: string): Promise<void> {
  const stats = await fsp.lstat(sourceDir);
  if (stats.isSymbolicLink()) {
    throw new Error(
      `Template layer packages may not include symbolic links: ${sourceDir}`,
    );
  }

  if (!stats.isDirectory()) {
    return;
  }

  for (const entry of await fsp.readdir(sourceDir)) {
    await assertNoSymlinks(path.join(sourceDir, entry));
  }
}

function parseLayerDefinition(
	layerId: string,
	value: unknown,
): ExternalTemplateLayerDefinition {
  if (isBuiltInSharedTemplateLayerId(layerId)) {
    throw new Error(
      `Layer "${layerId}" uses a reserved built-in shared layer id and cannot be redefined in ${TEMPLATE_LAYER_MANIFEST_FILENAME}.`,
    );
  }

  if (!isPlainObject(value)) {
    throw new Error(
      `Layer "${layerId}" in ${TEMPLATE_LAYER_MANIFEST_FILENAME} must be an object.`,
    );
  }

  const layerPath = value.path;
  if (typeof layerPath !== 'string' || layerPath.trim().length === 0) {
    throw new Error(
      `Layer "${layerId}" must define a non-empty string "path".`,
    );
  }

  const layerExtends = value.extends;
  if (
		typeof layerExtends !== 'undefined' &&
		(!Array.isArray(layerExtends) ||
			!layerExtends.every(
        (entry) => typeof entry === 'string' && entry.trim().length > 0,
      ))
	) {
    throw new Error(
      `Layer "${layerId}" must define "extends" as an array of non-empty strings when present.`,
    );
  }

  const description = value.description;
  if (
		typeof description !== 'undefined' &&
		(typeof description !== 'string' || description.trim().length === 0)
	) {
    throw new Error(
      `Layer "${layerId}" must define "description" as a non-empty string when present.`,
    );
  }

  return {
    description: typeof description === 'string' ? description : undefined,
    extends: Array.isArray(layerExtends) ? [...layerExtends] : undefined,
    path: layerPath,
  };
}

export async function loadExternalTemplateLayerManifest(
	sourceRoot: string,
): Promise<ExternalTemplateLayerManifest | null> {
  const manifestPath = path.join(sourceRoot, TEMPLATE_LAYER_MANIFEST_FILENAME);
  if (!(await pathExists(manifestPath))) {
    return null;
  }

  const raw = await readJsonFile<Record<string, unknown>>(manifestPath, {
    context: 'template layer manifest',
  });
  if (!isPlainObject(raw)) {
    throw new Error(
      `${TEMPLATE_LAYER_MANIFEST_FILENAME} must export a JSON object.`,
    );
  }

  if (raw.version !== TEMPLATE_LAYER_MANIFEST_VERSION) {
    throw new Error(
      `${TEMPLATE_LAYER_MANIFEST_FILENAME} must declare "version": ${TEMPLATE_LAYER_MANIFEST_VERSION}.`,
    );
  }

  if (!isPlainObject(raw.layers) || Object.keys(raw.layers).length === 0) {
    throw new Error(
      `${TEMPLATE_LAYER_MANIFEST_FILENAME} must define a non-empty "layers" object.`,
    );
  }

  return {
    layers: Object.fromEntries(
      Object.entries(raw.layers).map(([layerId, value]) => [
        layerId,
        parseLayerDefinition(layerId, value),
      ]),
    ),
    version: TEMPLATE_LAYER_MANIFEST_VERSION,
  };
}

function getSelectableExternalLayers(
	manifest: ExternalTemplateLayerManifest,
): SelectableExternalTemplateLayer[] {
  const layerIds = Object.keys(manifest.layers);
  const referencedExternalLayerIds = new Set<string>();
  for (const definition of Object.values(manifest.layers)) {
    for (const ancestorId of definition.extends ?? []) {
      if (ancestorId in manifest.layers) {
        referencedExternalLayerIds.add(ancestorId);
      }
    }
  }

  const publicLayerIds = layerIds.filter(
    (layerId) => !referencedExternalLayerIds.has(layerId),
  );
  return publicLayerIds.map((layerId) => ({
    description: manifest.layers[layerId]?.description,
    extends: [...(manifest.layers[layerId]?.extends ?? [])],
    id: layerId,
  }));
}

function getDefaultExternalLayerId(
	manifest: ExternalTemplateLayerManifest,
): string {
  const selectableLayers = getSelectableExternalLayers(manifest);
  if (selectableLayers.length === 1) {
    return selectableLayers[0].id;
  }
  const layerIds = Object.keys(manifest.layers);

  throw new Error(
    `External layer package defines multiple selectable layers (${layerIds.join(', ')}). Pass an explicit externalLayerId or rerun through the interactive CLI selector.`,
  );
}

export async function listSelectableExternalTemplateLayers(
	sourceRoot: string,
): Promise<SelectableExternalTemplateLayer[]> {
  const manifest = await loadExternalTemplateLayerManifest(sourceRoot);
  if (!manifest) {
    throw new Error(
      `No ${TEMPLATE_LAYER_MANIFEST_FILENAME} manifest found in ${sourceRoot}.`,
    );
  }

  return getSelectableExternalLayers(manifest);
}

export async function resolveExternalTemplateLayers({
	externalLayerId,
	sourceRoot,
}: {
  externalLayerId?: string;
  sourceRoot: string;
}): Promise<ResolvedExternalTemplateLayers> {
  const manifest = await loadExternalTemplateLayerManifest(sourceRoot);
  if (!manifest) {
    throw new Error(
      `No ${TEMPLATE_LAYER_MANIFEST_FILENAME} manifest found in ${sourceRoot}.`,
    );
  }
  const manifestDocument = manifest;

  const selectedLayerId =
		externalLayerId ?? getDefaultExternalLayerId(manifestDocument);
  if (!(selectedLayerId in manifestDocument.layers)) {
    throw new Error(
      `Unknown external layer "${selectedLayerId}". Expected one of: ${Object.keys(manifestDocument.layers).join(', ')}`,
    );
  }

  const entries: ResolvedTemplateLayerEntry[] = [];
  const emittedLayerIds = new Set<string>();
  const visitingLayerIds = new Set<string>();

  async function visitLayer(layerId: string): Promise<void> {
    if (isBuiltInSharedTemplateLayerId(layerId)) {
      if (!emittedLayerIds.has(layerId)) {
        entries.push({
          dir: getBuiltInSharedTemplateLayerDir(layerId),
          id: layerId,
          kind: 'built-in',
        });
        emittedLayerIds.add(layerId);
      }
      return;
    }

    const definition = manifestDocument.layers[layerId];
    if (!definition) {
      throw new Error(
        `Layer "${layerId}" is not defined in ${TEMPLATE_LAYER_MANIFEST_FILENAME}.`,
      );
    }
    if (visitingLayerIds.has(layerId)) {
      throw new Error(
        `Detected a cycle while resolving external layer "${layerId}".`,
      );
    }

    visitingLayerIds.add(layerId);
    for (const ancestorId of definition.extends ?? []) {
      await visitLayer(ancestorId);
    }
    visitingLayerIds.delete(layerId);

    if (emittedLayerIds.has(layerId)) {
      return;
    }

    const layerDir = resolveLayerPath(sourceRoot, definition.path);
    const stats = await fsp.stat(layerDir).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      throw new Error(
        `Layer "${layerId}" points to a missing directory: ${definition.path}`,
      );
    }
    await assertNoSymlinks(layerDir);

    entries.push({
      dir: layerDir,
      id: layerId,
      kind: 'external',
    });
    emittedLayerIds.add(layerId);
  }

  await visitLayer(selectedLayerId);
  return {
    entries,
    selectedLayerId,
  };
}

export async function assertExternalTemplateLayersDoNotWriteProtectedOutputs({
	externalEntries,
	protectedOutputPaths,
	view,
}: {
  externalEntries: readonly ResolvedTemplateLayerEntry[];
  protectedOutputPaths: ReadonlySet<string>;
  view: Record<string, string>;
}): Promise<void> {
  for (const entry of externalEntries) {
    if (entry.kind !== 'external') {
      continue;
    }

    const renderedOutputPaths = await listInterpolatedDirectoryOutputs(
      entry.dir,
      view,
    );
    for (const relativePath of renderedOutputPaths) {
      if (!protectedOutputPaths.has(relativePath)) {
        continue;
      }

      throw new Error(
        `External layer "${entry.id}" writes protected output "${relativePath}".`,
      );
    }
  }
}
