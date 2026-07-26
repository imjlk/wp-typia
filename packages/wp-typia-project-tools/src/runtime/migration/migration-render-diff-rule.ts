import path from 'node:path';

import { MIGRATION_TODO_PREFIX } from './migration-constants.js';
import {
  createMigrationRiskSummary,
  formatMigrationRiskSummary,
} from './migration-risk.js';
import { normalizeImportPath } from './migration-render-support.js';
import { renderObjectKey } from './migration-utils.js';
import { quoteTypeScriptString } from '../shared/ts-string-literals.js';
import type {
  MigrationDiff,
  MigrationRuleFileInput,
} from './migration-types.js';

export function formatDiffReport(
	diff: MigrationDiff,
	{ includeRiskSummary = true }: { includeRiskSummary?: boolean } = {},
): string {
  const lines = [
    `Migration diff: ${diff.fromVersion} -> ${diff.toVersion}`,
    `Current type: ${diff.currentTypeName}`,
    `Safe changes: ${diff.summary.auto}`,
    `Manual changes: ${diff.summary.manual}`,
  ];

  if (diff.summary.autoItems.length > 0) {
    lines.push('', 'Safe changes:');
    for (const item of diff.summary.autoItems) {
      lines.push(
        `  - ${item.path}: ${item.kind}${item.detail ? ` (${item.detail})` : ''}`,
      );
    }
  }

  if (diff.summary.manualItems.length > 0) {
    lines.push('', 'Manual review required:');
    for (const item of diff.summary.manualItems) {
      lines.push(
        `  - ${item.path}: ${item.kind}${item.detail ? ` (${item.detail})` : ''}`,
      );
    }
  }

  if (diff.summary.renameCandidates.length > 0) {
    const autoApplied = diff.summary.renameCandidates.filter(
      (item) => item.autoApply,
    );
    const suggested = diff.summary.renameCandidates.filter(
      (item) => !item.autoApply,
    );

    if (autoApplied.length > 0) {
      lines.push('', 'Auto-applied renames:');
      for (const item of autoApplied) {
        lines.push(
          `  - ${item.currentPath} <- ${item.legacyPath} (${item.reason}, score ${item.score.toFixed(2)})`,
        );
      }
    }
    if (suggested.length > 0) {
      lines.push('', 'Suggested renames:');
      for (const item of suggested) {
        lines.push(
          `  - ${item.currentPath} <- ${item.legacyPath} (${item.reason}, score ${item.score.toFixed(2)})`,
        );
      }
    }
  }

  if (diff.summary.transformSuggestions.length > 0) {
    lines.push('', 'Suggested transforms:');
    for (const item of diff.summary.transformSuggestions) {
      lines.push(
        `  - ${item.currentPath}${item.legacyPath ? ` <- ${item.legacyPath}` : ''} (${item.reason})`,
      );
    }
  }

  if (includeRiskSummary) {
    lines.push(
      '',
      `Risk summary: ${formatMigrationRiskSummary(createMigrationRiskSummary(diff))}`,
    );
  }

  return lines.join('\n');
}

export function renderMigrationRuleFile({
	block,
	currentAttributes,
	currentTypeName,
	diff,
	fromVersion,
	projectDir,
	rulePath,
	targetVersion,
}: MigrationRuleFileInput): string {
  const resolvedCurrentTypeName =
    typeof currentTypeName === 'string' && currentTypeName.length > 0
      ? currentTypeName
      : 'Record<string, unknown>';
  const hasNamedCurrentType =
    resolvedCurrentTypeName !== 'Record<string, unknown>';
  const activeRenameCandidates = diff.summary.renameCandidates.filter(
    (candidate) => candidate.autoApply,
  );
  const suggestedRenameCandidates = diff.summary.renameCandidates.filter(
    (candidate) => !candidate.autoApply,
  );
  const lines: string[] = [];
  const ruleDir = path.dirname(rulePath);
  const typesImport = normalizeImportPath(
    path.relative(ruleDir, path.join(projectDir, block.typesFile)),
  );
  const currentManifestImport = normalizeImportPath(
    path.relative(ruleDir, path.join(projectDir, block.manifestFile)),
  );
  const helpersImport = normalizeImportPath(
    path.relative(
      ruleDir,
      path.join(projectDir, 'src', 'migrations', 'helpers.ts'),
    ),
    true,
  );

  if (hasNamedCurrentType) {
    lines.push(
      `import type { ${resolvedCurrentTypeName} } from ${quoteTypeScriptString(typesImport)};`,
    );
  }
  lines.push(
    `import currentManifest from ${quoteTypeScriptString(currentManifestImport)} with { type: 'json' };`,
  );
  lines.push('import {');
  lines.push('  type RenameMap,');
  lines.push('  type TransformMap,');
  lines.push('  resolveMigrationAttribute,');
  lines.push(`} from ${quoteTypeScriptString(helpersImport)};`);
  lines.push('');
  lines.push(
    `export const fromVersion = ${quoteTypeScriptString(fromVersion)} as const;`,
  );
  lines.push(
    `export const toVersion = ${quoteTypeScriptString(targetVersion)} as const;`,
  );
  lines.push('');
  if (
    activeRenameCandidates.length === 0 &&
    suggestedRenameCandidates.length === 0
  ) {
    lines.push('export const renameMap: RenameMap = {};');
  } else {
    lines.push('export const renameMap: RenameMap = {');
    for (const candidate of activeRenameCandidates) {
      lines.push(
        `  ${renderObjectKey(candidate.currentPath)}: ${quoteTypeScriptString(candidate.legacyPath)},`,
      );
    }
    for (const candidate of suggestedRenameCandidates) {
      lines.push(
        `  // ${renderObjectKey(candidate.currentPath)}: ${quoteTypeScriptString(candidate.legacyPath)},`,
      );
    }
    lines.push('};');
  }
  lines.push('');
  if (diff.summary.transformSuggestions.length === 0) {
    lines.push('export const transforms: TransformMap = {};');
  } else {
    lines.push('export const transforms: TransformMap = {');
    for (const suggestion of diff.summary.transformSuggestions) {
      lines.push(
        `  // ${renderObjectKey(suggestion.currentPath)}: (legacyValue, legacyInput) => {`,
      );
      for (const bodyLine of suggestion.bodyLines) {
        lines.push(`  ${bodyLine}`);
      }
      lines.push('  // },');
    }
    lines.push('};');
  }
  lines.push('');
  const unresolvedItems = [
    ...diff.summary.manualItems.map(
      (item) =>
        `${item.path}: ${item.kind}${item.detail ? ` (${item.detail})` : ''}`,
    ),
    ...suggestedRenameCandidates.map(
      (candidate) =>
        `${candidate.currentPath}: rename candidate from ${candidate.legacyPath}`,
    ),
    ...diff.summary.transformSuggestions.map(
      (suggestion) =>
        `${suggestion.currentPath}: transform suggested from ${suggestion.legacyPath ?? suggestion.currentPath}`,
    ),
  ];
  if (unresolvedItems.length === 0) {
    lines.push('export const unresolved = [] as const;');
  } else {
    lines.push('export const unresolved = [');
    for (const item of unresolvedItems) {
      lines.push(`  ${quoteTypeScriptString(item)},`);
    }
    lines.push('] as const;');
  }
  lines.push('');
  lines.push(
    `export function migrate(input: Record<string, unknown>): ${resolvedCurrentTypeName} {`,
  );
  lines.push('  return {');

  for (const key of Object.keys(currentAttributes)) {
    for (const manualItem of diff.summary.manualItems.filter(
      (item) => item.path === key || item.path.startsWith(`${key}.`),
    )) {
      lines.push(
        `    // ${MIGRATION_TODO_PREFIX} ${manualItem.path}: ${manualItem.kind}${manualItem.detail ? ` (${manualItem.detail})` : ''}`,
      );
    }
    for (const renameCandidate of suggestedRenameCandidates.filter(
      (item) => item.currentPath === key || item.currentPath.startsWith(`${key}.`),
    )) {
      lines.push(
        `    // ${MIGRATION_TODO_PREFIX} consider renameMap[${quoteTypeScriptString(renameCandidate.currentPath)}] = ${quoteTypeScriptString(renameCandidate.legacyPath)}`,
      );
    }
    for (const suggestion of diff.summary.transformSuggestions.filter(
      (item) => item.currentPath === key || item.currentPath.startsWith(`${key}.`),
    )) {
      lines.push(
        `    // ${MIGRATION_TODO_PREFIX} review transforms[${quoteTypeScriptString(suggestion.currentPath)}]`,
      );
    }
    lines.push(`    ${key}: resolveMigrationAttribute(`);
    lines.push(`      currentManifest.attributes.${key},`);
    lines.push(`      ${quoteTypeScriptString(key)},`);
    lines.push(`      ${quoteTypeScriptString(key)},`);
    lines.push('      input,');
    lines.push('      renameMap,');
    lines.push('      transforms,');
    lines.push('    ),');
  }

  lines.push(`  } as ${resolvedCurrentTypeName};`);
  lines.push('}');
  return `${lines.join('\n')}\n`;
}
