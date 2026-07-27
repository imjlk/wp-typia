import {
  OFFICIAL_WORKSPACE_TEMPLATE_ALIAS,
  OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
  getUserFacingTemplateId,
  getTemplateById,
  getTemplateSelectOptions,
  isBuiltInTemplateId,
  listTemplates,
  normalizeTemplateLookupId,
} from './template-registry.js';
import type { TemplateDefinition } from './template-registry.js';

/**
 * Stable logical source metadata exposed by structured template discovery.
 *
 * Filesystem paths remain an internal implementation detail used to render a
 * template. CLI consumers receive a built-in id or official package locator
 * instead, so output is reproducible across npm caches and worktrees.
 */
export type CliTemplateSource =
	| {
			kind: 'built-in';
			id: string;
	  }
	| {
			kind: 'npm';
			packageName: string;
			alias: string;
	  };

/** Public template metadata returned by `templates ... --format json`. */
export interface CliTemplateMetadata {
  id: string;
  description: string;
  defaultCategory: string;
  features: string[];
  source: CliTemplateSource;
}

/**
 * Converts internal template registry metadata into a portable CLI payload.
 *
 * @param template Internal template definition used for scaffold resolution.
 * @returns Stable public metadata without the installation-local template directory.
 */
export function toCliTemplateMetadata(
	template: TemplateDefinition,
): CliTemplateMetadata {
  return {
    id: template.id,
    description: template.description,
    defaultCategory: template.defaultCategory,
    features: [...template.features],
    source: isBuiltInTemplateId(template.id)
      ? {
          kind: 'built-in',
          id: template.id,
        }
      : {
          kind: 'npm',
          packageName: OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
          alias: OFFICIAL_WORKSPACE_TEMPLATE_ALIAS,
        },
  };
}

/** Returns all registered templates as portable structured-output metadata. */
export function listCliTemplateMetadata(): readonly CliTemplateMetadata[] {
  return listTemplates().map(toCliTemplateMetadata);
}

/**
 * Finds one registered template as portable structured-output metadata.
 *
 * @param templateId Built-in id, official package name, or workspace alias.
 * @returns Stable public metadata, or `undefined` when the id is not registered.
 */
export function findCliTemplateMetadata(
	templateId: string,
): CliTemplateMetadata | undefined {
  const normalizedTemplateId = normalizeTemplateLookupId(templateId);
  const template = listTemplates().find(
    (entry) => entry.id === normalizedTemplateId,
  );
  return template ? toCliTemplateMetadata(template) : undefined;
}

/**
 * Resolves one registered template as portable structured-output metadata.
 *
 * @param templateId Built-in id, official package name, or workspace alias.
 * @returns Stable public metadata for the requested template.
 * @throws {Error} When the id does not match a registered template or alias.
 */
export function getCliTemplateMetadata(templateId: string): CliTemplateMetadata {
  return toCliTemplateMetadata(getTemplateById(templateId));
}

/**
 * Format one line of template list output for a built-in template.
 *
 * @param template Template metadata including `id` and `description`.
 * @returns One-line summary text for `templates list`.
 */
export function formatTemplateSummary(template: TemplateDefinition): string {
  return `${getUserFacingTemplateId(template.id).padEnd(14)} ${template.description}`;
}

/**
 * Format the feature and capability hint lines shown under a template summary.
 *
 * @param template Template metadata including the `features` list.
 * @returns Indented feature and capability text for CLI list output.
 */
export function formatTemplateFeatures(template: TemplateDefinition): string {
  const lines = [`  Features: ${template.features.join(' • ')}`];
  const bestForHint = getTemplateBestForHint(template);
  if (bestForHint) {
    lines.push(`  Best for: ${bestForHint}`);
  }
  const capabilityHints = getTemplateCapabilityHints(template);
  if (capabilityHints.length > 0) {
    lines.push(`  Supports: ${capabilityHints.join(' • ')}`);
  }
  const specialNotes = getTemplateSpecialNotes(template);
  if (specialNotes.length > 0) {
    lines.push(`  Notes: ${specialNotes.join(' • ')}`);
  }
  if (template.id === OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE) {
    lines.push(
      `  Alias: ${OFFICIAL_WORKSPACE_TEMPLATE_ALIAS} (\`--template ${OFFICIAL_WORKSPACE_TEMPLATE_ALIAS}\`)`,
    );
  }
  return lines.join('\n');
}

/**
 * Format the detailed template description for `templates inspect`.
 *
 * This expands special layer combinations for the `persistence` and `compound`
 * templates and returns a multi-line block centered on human-facing identity,
 * capabilities, and logical layer composition.
 *
 * @param template Template metadata including `id`, `defaultCategory`,
 * `templateDir`, and `features`.
 * @returns Multi-line template details text for CLI output.
 */
export function formatTemplateDetails(template: TemplateDefinition): string {
  const detailLines = [
    getUserFacingTemplateId(template.id),
    `Summary: ${template.description}`,
    `Best for: ${getTemplateBestForHint(template)}`,
    ...getTemplateIdentityLines(template),
    `Category: ${template.defaultCategory}`,
  ];
  const capabilityHints = getTemplateCapabilityHints(template);
  if (capabilityHints.length > 0) {
    detailLines.push('Capabilities:');
    for (const capabilityHint of capabilityHints) {
      detailLines.push(`  - ${capabilityHint}`);
    }
  }
  const specialNotes = getTemplateSpecialNotes(template);
  if (specialNotes.length > 0) {
    detailLines.push('Notes:');
    for (const specialNote of specialNotes) {
      detailLines.push(`  - ${specialNote}`);
    }
  }
  detailLines.push('Logical layers:');
  for (const logicalLayer of getTemplateLogicalLayerSummaries(template)) {
    detailLines.push(`  - ${logicalLayer}`);
  }
  detailLines.push(`Features: ${template.features.join(', ')}`);

  return detailLines.join('\n');
}

function getTemplateBestForHint(template: TemplateDefinition): string {
  if (template.id === 'basic') {
    return 'minimal static-first block scaffolds with Typia validation and the lightest default surface';
  }
  if (template.id === 'interactivity') {
    return 'interactive single-block experiences that keep client-side state and actions inside one scaffold';
  }
  if (template.id === 'persistence') {
    return 'typed REST-backed blocks that need persistence-aware reads, writes, and schema refresh workflows';
  }
  if (template.id === 'compound') {
    return 'parent-and-child block families that own nested authoring conventions and optional persistence wiring';
  }
  if (template.id === 'query-loop') {
    return 'create-time `core/query` variations with connected starter patterns instead of `add block` families';
  }

  return 'official multi-block workspaces that extend through `wp-typia add ...` and workspace doctor flows';
}

function getTemplateCapabilityHints(template: TemplateDefinition): string[] {
  if (template.id === 'persistence' || template.id === 'compound') {
    return [
      '--alternate-render-targets',
      '--data-storage',
      '--persistence-policy',
      'external layers',
    ];
  }
  if (template.id === 'query-loop') {
    return ['--query-post-type', 'external layers'];
  }
  if (isBuiltInTemplateId(template.id)) {
    return ['external layers'];
  }

  return [];
}

function getTemplateSpecialNotes(template: TemplateDefinition): string[] {
  if (template.id === 'query-loop') {
    return [
      'Create-time variation scaffold only; use `wp-typia create <project-dir> --template query-loop` instead of `wp-typia add block`.',
      'Owns a `core/query` variation, so it does not generate `src/types.ts`, `block.json`, or Typia manifests.',
    ];
  }

  return [];
}

function getTemplateIdentityLines(template: TemplateDefinition): string[] {
  if (template.id === OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE) {
    return [
      'Identity:',
      `  - User-facing alias: ${OFFICIAL_WORKSPACE_TEMPLATE_ALIAS} (\`--template ${OFFICIAL_WORKSPACE_TEMPLATE_ALIAS}\`)`,
      `  - Official package: ${OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE}`,
      'Type: official workspace scaffold',
    ];
  }

  if (template.id === 'query-loop') {
    return [
      'Identity:',
      '  - Built-in template id: query-loop',
      'Type: create-time core/query variation scaffold',
      'Output model: variation-only scaffold; does not generate block.json or Typia manifests',
    ];
  }

  return [
    'Identity:',
    `  - Built-in template id: ${template.id}`,
    'Type: built-in block scaffold',
  ];
}

function getTemplateLogicalLayerSummaries(template: TemplateDefinition): string[] {
  if (!isBuiltInTemplateId(template.id)) {
    return ['workspace package scaffold'];
  }

  if (template.id === 'persistence') {
    return [
      'authenticated write policy: shared/base -> rest helpers (shared) -> persistence core -> authenticated write policy -> persistence overlay',
      'public write policy: shared/base -> rest helpers (shared) -> persistence core -> public write policy -> persistence overlay',
    ];
  }

  if (template.id === 'compound') {
    return [
      'pure block family: shared/base -> compound core -> compound overlay',
      'authenticated persistence: shared/base -> compound core -> rest helpers (shared) -> compound persistence core -> authenticated write policy -> compound overlay',
      'public persistence: shared/base -> compound core -> rest helpers (shared) -> compound persistence core -> public write policy -> compound overlay',
    ];
  }

  const overlayName = template.id === 'query-loop'
    ? 'query-loop overlay'
    : `${template.id} overlay`;
  return [`shared/base -> ${overlayName}`];
}

export { getTemplateById, getTemplateSelectOptions, listTemplates };
export { isBuiltInTemplateId };
