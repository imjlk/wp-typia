import { promises as fsp } from 'node:fs';
import path from 'node:path';

import {
  assertEditorPluginDoesNotExist,
  assertValidEditorPluginSlot,
  assertValidGeneratedSlug,
  getWorkspaceBootstrapPath,
  normalizeBlockSlug,
  rollbackWorkspaceMutation,
  type RunAddEditorPluginCommandOptions,
  type WorkspaceMutationSnapshot,
  snapshotWorkspaceFiles,
} from './cli-add-shared.js';
import {
  ensureEditorPluginBootstrapAnchors,
  ensureEditorPluginBuildScriptAnchors,
  ensureEditorPluginWebpackAnchors,
  resolveEditorPluginRegistryPath,
  writeEditorPluginRegistry,
} from './cli-add-workspace-editor-plugin-anchors.js';
import {
  buildEditorPluginConfigEntry,
  buildEditorPluginDataSource,
  buildEditorPluginEntrySource,
  buildEditorPluginStyleSource,
  buildEditorPluginSurfaceSource,
  buildEditorPluginTypesSource,
} from './cli-add-workspace-editor-plugin-source-emitters.js';
import {
  appendWorkspaceInventoryEntries,
  readWorkspaceInventoryAsync,
} from '../workspace/workspace-inventory.js';
import { resolveWorkspaceProject } from '../workspace/workspace-project.js';

export {
  ensureEditorPluginBootstrapAnchors,
  ensureEditorPluginBuildScriptAnchors,
  ensureEditorPluginWebpackAnchors,
  resolveEditorPluginRegistryPath,
  writeEditorPluginRegistry,
} from './cli-add-workspace-editor-plugin-anchors.js';

/**
 * Add one document-level editor plugin scaffold to an official workspace project.
 *
 * @param options Command options for the editor-plugin scaffold workflow.
 * @param options.cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @param options.editorPluginName Human-entered editor-plugin name that will be
 * normalized and validated before files are written.
 * @param options.slot Optional editor plugin shell slot. Defaults to `sidebar`.
 * @returns A promise that resolves with the normalized `editorPluginSlug`, chosen
 * `slot`, and owning `projectDir` after the scaffold files and inventory entry
 * are written successfully.
 * @throws {Error} When the command is run outside an official workspace, when the
 * slug or slot is invalid, or when a conflicting file or inventory entry exists.
 */
export async function runAddEditorPluginCommand({
	cwd = process.cwd(),
	editorPluginName,
	slot,
}: RunAddEditorPluginCommandOptions): Promise<{
  editorPluginSlug: string;
  projectDir: string;
  slot: string;
}> {
  const workspace = resolveWorkspaceProject(cwd);
  const editorPluginSlug = assertValidGeneratedSlug(
    'Editor plugin name',
    normalizeBlockSlug(editorPluginName),
    'wp-typia add editor-plugin <name> [--slot <sidebar|document-setting-panel>]',
  );
  const resolvedSlot = assertValidEditorPluginSlot(slot);

  const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
  assertEditorPluginDoesNotExist(
    workspace.projectDir,
    editorPluginSlug,
    inventory,
  );

  const blockConfigPath = path.join(
    workspace.projectDir,
    'scripts',
    'block-config.ts',
  );
  const bootstrapPath = getWorkspaceBootstrapPath(workspace);
  const buildScriptPath = path.join(
    workspace.projectDir,
    'scripts',
    'build-workspace.mjs',
  );
  const editorPluginsIndexPath = await resolveEditorPluginRegistryPath(
    workspace.projectDir,
  );
  const webpackConfigPath = path.join(
    workspace.projectDir,
    'webpack.config.js',
  );
  const editorPluginDir = path.join(
    workspace.projectDir,
    'src',
    'editor-plugins',
    editorPluginSlug,
  );
  const entryFilePath = path.join(editorPluginDir, 'index.tsx');
  const surfaceFilePath = path.join(editorPluginDir, 'Surface.tsx');
  const dataFilePath = path.join(editorPluginDir, 'data.ts');
  const typesFilePath = path.join(editorPluginDir, 'types.ts');
  const styleFilePath = path.join(editorPluginDir, 'style.scss');
  const mutationSnapshot: WorkspaceMutationSnapshot = {
		fileSources: await snapshotWorkspaceFiles([
			blockConfigPath,
			bootstrapPath,
			buildScriptPath,
			editorPluginsIndexPath,
			webpackConfigPath,
		]),
		snapshotDirs: [],
		targetPaths: [editorPluginDir],
	};

  try {
    await fsp.mkdir(editorPluginDir, { recursive: true });
    await ensureEditorPluginBootstrapAnchors(workspace);
    await ensureEditorPluginBuildScriptAnchors(workspace);
    await ensureEditorPluginWebpackAnchors(workspace);
    await fsp.writeFile(
      entryFilePath,
      buildEditorPluginEntrySource(
        editorPluginSlug,
        workspace.workspace.namespace,
        workspace.workspace.textDomain,
      ),
      'utf8',
    );
    await fsp.writeFile(
      surfaceFilePath,
      buildEditorPluginSurfaceSource(
        editorPluginSlug,
        resolvedSlot,
        workspace.workspace.textDomain,
      ),
      'utf8',
    );
    await fsp.writeFile(
      dataFilePath,
      buildEditorPluginDataSource(editorPluginSlug, resolvedSlot),
      'utf8',
    );
    await fsp.writeFile(
      typesFilePath,
      buildEditorPluginTypesSource(editorPluginSlug),
      'utf8',
    );
    await fsp.writeFile(styleFilePath, buildEditorPluginStyleSource(), 'utf8');
    await writeEditorPluginRegistry(workspace.projectDir, editorPluginSlug);
    await appendWorkspaceInventoryEntries(workspace.projectDir, {
      editorPluginEntries: [
        buildEditorPluginConfigEntry(editorPluginSlug, resolvedSlot),
      ],
    });

    return {
      editorPluginSlug,
      projectDir: workspace.projectDir,
      slot: resolvedSlot,
    };
  } catch (error) {
    await rollbackWorkspaceMutation(mutationSnapshot);
    throw error;
  }
}
