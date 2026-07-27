/**
 * Scaffold-time starter manifest builders for generated projects.
 *
 * These helpers now reuse the Phase 2 built-in artifact model so generated
 * `types.ts`, `block.json`, and starter `typia.manifest.json` all share the
 * same attribute metadata source of truth.
 */
import type { ManifestDocument } from '../migration/migration-types.js';
import type { ScaffoldTemplateVariables } from './scaffold.js';

import {
  buildBuiltInBlockArtifacts,
  buildCompoundChildStarterManifestDocument as buildCompoundChildStarterManifestFromArtifacts,
} from './built-in-block-artifacts.js';

/**
 * Builds the starter manifest used by generated compound child blocks.
 */
export function buildCompoundChildStarterManifestDocument(
	childTypeName: string,
	childTitle: string,
	bodyPlaceholder?: string,
): ManifestDocument {
  return buildCompoundChildStarterManifestFromArtifacts(
    childTypeName,
    childTitle,
    bodyPlaceholder,
  );
}

/**
 * Returns the starter manifest files that should be seeded for a built-in
 * template before the first sync.
 */
export function getStarterManifestFiles(
	templateId: string,
	variables: ScaffoldTemplateVariables,
): Array<{
  document: ManifestDocument;
  relativePath: string;
}> {
  if (
		templateId !== 'basic' &&
		templateId !== 'interactivity' &&
		templateId !== 'persistence' &&
		templateId !== 'compound'
	) {
    return [];
  }

  return buildBuiltInBlockArtifacts({
		templateId,
		variables,
	}).map((artifact) => ({
		document: artifact.manifestDocument,
		relativePath: `${artifact.relativeDir}/typia.manifest.json`,
	}));
}

/**
 * Serializes a starter manifest using the generated-project JSON formatting
 * convention.
 */
export function stringifyStarterManifest(document: ManifestDocument): string {
  return JSON.stringify(document, null, '\t');
}
