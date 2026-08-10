import { promises as fsp } from 'node:fs';
import path from 'node:path';

import {
  assertPatternDoesNotExist,
  assertValidGeneratedSlug,
  getWorkspaceBootstrapPath,
  normalizeBlockSlug,
  rollbackWorkspaceMutation,
  type RunAddPatternCommandOptions,
  type WorkspaceMutationSnapshot,
  snapshotWorkspaceFiles,
} from './cli-add-shared.js';
import { ensurePatternBootstrapAnchors } from './cli-add-workspace-pattern-anchors.js';
import { resolvePatternCatalogOptions } from './cli-add-workspace-pattern-options.js';
import {
  buildPatternConfigEntry,
  buildPatternSource,
} from './cli-add-workspace-pattern-source-emitters.js';
import type { PatternCatalogScope } from './pattern-catalog.js';
import {
  appendWorkspaceInventoryEntries,
  readWorkspaceInventoryAsync,
} from '../workspace/workspace-inventory.js';
import { resolveWorkspaceProject } from '../workspace/workspace-project.js';
import { WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS } from '../workspace/workspace-php-entrypoint-manifests.js';

/**
 * Add one PHP block pattern shell to an official workspace project.
 *
 * @param options Command options for the pattern scaffold workflow.
 * @param options.catalogTitle Optional human-readable title. Defaults to the
 * title-cased form of the normalized pattern slug.
 * @param options.contentFile Optional safe relative project path directly
 * under `src/patterns/` or one nested directory under `src/patterns/` for the
 * generated PHP file. Defaults to `src/patterns/full/<slug>.php` or
 * `src/patterns/sections/<slug>.php`.
 * @param options.cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @param options.patternName Human-entered pattern name that will be normalized
 * and validated before files are written.
 * @param options.patternScope Catalog scope (`full` or `section`). Defaults to `full`.
 * @param options.sectionRole Section role slug. Required only when
 * `patternScope` is `section`.
 * @param options.tags Optional pattern tags as a comma-separated string or
 * array. Tags are normalized, deduplicated, and sorted.
 * @param options.thumbnailUrl Optional thumbnail URL or relative asset path
 * recorded in the inventory entry.
 * @returns A promise that resolves with the normalized `patternSlug`, owning
 * `projectDir`, resolved `contentFile`, `patternScope`, `tags`, `title`, and
 * optional `sectionRole` and `thumbnailUrl` after the pattern file and
 * inventory entry have been written successfully.
 * @throws {Error} When the command is run outside an official workspace, when
 * the pattern slug, scope, section-role coupling, tag values, or content file
 * path are invalid, or when a conflicting target file or inventory entry
 * already exists.
 */
export async function runAddPatternCommand({
	catalogTitle,
	contentFile,
	cwd = process.cwd(),
	patternName,
	patternScope,
	sectionRole,
	tags,
	thumbnailUrl,
}: RunAddPatternCommandOptions): Promise<{
  contentFile: string;
  patternSlug: string;
  patternScope: PatternCatalogScope;
  projectDir: string;
  sectionRole?: string;
  tags: string[];
  title: string;
  thumbnailUrl?: string;
}> {
  const workspace = resolveWorkspaceProject(cwd);
  const patternSlug = assertValidGeneratedSlug(
    'Pattern name',
    normalizeBlockSlug(patternName),
    'wp-typia add pattern <name>',
  );
  const patternCatalogOptions = resolvePatternCatalogOptions(patternSlug, {
    catalogTitle,
    contentFile,
    cwd,
    patternName,
    patternScope,
    sectionRole,
    tags,
    thumbnailUrl,
  });

  const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
  assertPatternDoesNotExist(workspace.projectDir, patternSlug, inventory);
  const contentFilePath = path.join(
    workspace.projectDir,
    patternCatalogOptions.contentFile,
  );
  if (
		await fsp.stat(contentFilePath).then(
      () => true,
      (error) => {
        if ((error as { code?: string }).code === 'ENOENT') {
          return false;
        }
        throw error;
      },
    )
	) {
    throw new Error(
      `A pattern already exists at ${patternCatalogOptions.contentFile}. Choose a different name.`,
    );
  }

  const blockConfigPath = path.join(
    workspace.projectDir,
    'scripts',
    'block-config.ts',
  );
  const bootstrapPath = getWorkspaceBootstrapPath(workspace);
  const patternFilePath = contentFilePath;
  const mutationSnapshot: WorkspaceMutationSnapshot = {
    fileSources: await snapshotWorkspaceFiles([
      blockConfigPath,
      bootstrapPath,
      path.join(
        workspace.projectDir,
        WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.patterns,
      ),
    ]),
    snapshotDirs: [],
    targetPaths: [patternFilePath],
  };

  try {
    await fsp.mkdir(path.dirname(patternFilePath), { recursive: true });
    await fsp.writeFile(
      patternFilePath,
      buildPatternSource(
        patternSlug,
        workspace.workspace.namespace,
        patternCatalogOptions.sectionRole,
        workspace.workspace.textDomain,
        patternCatalogOptions.title,
      ),
      'utf8',
    );
    await ensurePatternBootstrapAnchors(workspace);
    await appendWorkspaceInventoryEntries(workspace.projectDir, {
      patternEntries: [
        buildPatternConfigEntry(patternSlug, patternCatalogOptions),
      ],
    });

    return {
			contentFile: patternCatalogOptions.contentFile,
			patternSlug,
			patternScope: patternCatalogOptions.patternScope,
			projectDir: workspace.projectDir,
			...(patternCatalogOptions.sectionRole
				? { sectionRole: patternCatalogOptions.sectionRole }
				: {}),
			tags: patternCatalogOptions.tags,
			title: patternCatalogOptions.title,
			...(patternCatalogOptions.thumbnailUrl
				? { thumbnailUrl: patternCatalogOptions.thumbnailUrl }
				: {}),
		};
  } catch (error) {
    await rollbackWorkspaceMutation(mutationSnapshot);
    throw error;
  }
}
