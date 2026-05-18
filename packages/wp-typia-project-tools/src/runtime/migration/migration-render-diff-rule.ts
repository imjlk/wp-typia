import path from "node:path";

import { MIGRATION_TODO_PREFIX } from "./migration-constants.js";
import { createMigrationRiskSummary, formatMigrationRiskSummary } from "./migration-risk.js";
import { normalizeImportPath } from "./migration-render-support.js";
import { escapeForCode, renderObjectKey } from "./migration-utils.js";
import type { MigrationDiff, MigrationRuleFileInput } from "./migration-types.js";

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
		lines.push("", "Safe changes:");
		for (const item of diff.summary.autoItems) {
			lines.push(`  - ${item.path}: ${item.kind}${item.detail ? ` (${item.detail})` : ""}`);
		}
	}

	if (diff.summary.manualItems.length > 0) {
		lines.push("", "Manual review required:");
		for (const item of diff.summary.manualItems) {
			lines.push(`  - ${item.path}: ${item.kind}${item.detail ? ` (${item.detail})` : ""}`);
		}
	}

	if (diff.summary.renameCandidates.length > 0) {
		const autoApplied = diff.summary.renameCandidates.filter((item) => item.autoApply);
		const suggested = diff.summary.renameCandidates.filter((item) => !item.autoApply);

		if (autoApplied.length > 0) {
			lines.push("", "Auto-applied renames:");
			for (const item of autoApplied) {
				lines.push(
					`  - ${item.currentPath} <- ${item.legacyPath} (${item.reason}, score ${item.score.toFixed(2)})`,
				);
			}
		}
		if (suggested.length > 0) {
			lines.push("", "Suggested renames:");
			for (const item of suggested) {
				lines.push(
					`  - ${item.currentPath} <- ${item.legacyPath} (${item.reason}, score ${item.score.toFixed(2)})`,
				);
			}
		}
	}

	if (diff.summary.transformSuggestions.length > 0) {
		lines.push("", "Suggested transforms:");
		for (const item of diff.summary.transformSuggestions) {
			lines.push(`  - ${item.currentPath}${item.legacyPath ? ` <- ${item.legacyPath}` : ""} (${item.reason})`);
		}
	}

	if (includeRiskSummary) {
		lines.push("", `Risk summary: ${formatMigrationRiskSummary(createMigrationRiskSummary(diff))}`);
	}

	return lines.join("\n");
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
	const activeRenameCandidates = diff.summary.renameCandidates.filter((candidate) => candidate.autoApply);
	const suggestedRenameCandidates = diff.summary.renameCandidates.filter((candidate) => !candidate.autoApply);
	const lines: string[] = [];
	const ruleDir = path.dirname(rulePath);
	const typesImport = normalizeImportPath(path.relative(ruleDir, path.join(projectDir, block.typesFile)));
	const currentManifestImport = normalizeImportPath(
		path.relative(ruleDir, path.join(projectDir, block.manifestFile)),
	);
	const helpersImport = normalizeImportPath(
		path.relative(ruleDir, path.join(projectDir, "src", "migrations", "helpers.ts")),
		true,
	);

	lines.push(`import type { ${currentTypeName} } from "${typesImport}";`);
	lines.push(`import currentManifest from "${currentManifestImport}";`);
	lines.push(`import {`);
	lines.push(`\ttype RenameMap,`);
	lines.push(`\ttype TransformMap,`);
	lines.push(`\tresolveMigrationAttribute,`);
	lines.push(`} from "${helpersImport}";`);
	lines.push("");
	lines.push(`export const fromVersion = "${fromVersion}" as const;`);
	lines.push(`export const toVersion = "${targetVersion}" as const;`);
	lines.push("");
	lines.push("export const renameMap: RenameMap = {");
	for (const candidate of activeRenameCandidates) {
		lines.push(`\t${renderObjectKey(candidate.currentPath)}: "${escapeForCode(candidate.legacyPath)}",`);
	}
	for (const candidate of suggestedRenameCandidates) {
		lines.push(`\t// ${renderObjectKey(candidate.currentPath)}: "${escapeForCode(candidate.legacyPath)}",`);
	}
	lines.push("};");
	lines.push("");
	lines.push("export const transforms: TransformMap = {");
	for (const suggestion of diff.summary.transformSuggestions) {
		lines.push(`\t// ${renderObjectKey(suggestion.currentPath)}: (legacyValue, legacyInput) => {`);
		for (const bodyLine of suggestion.bodyLines) {
			lines.push(`\t${bodyLine}`);
		}
		lines.push(`\t// },`);
	}
	lines.push("};");
	lines.push("");
	lines.push("export const unresolved = [");
	for (const item of diff.summary.manualItems) {
		lines.push(
			`\t"${item.path}: ${item.kind}${item.detail ? ` (${escapeForCode(item.detail)})` : ""}",`,
		);
	}
	for (const candidate of suggestedRenameCandidates) {
		lines.push(`\t"${candidate.currentPath}: rename candidate from ${candidate.legacyPath}",`);
	}
	for (const suggestion of diff.summary.transformSuggestions) {
		lines.push(
			`\t"${suggestion.currentPath}: transform suggested from ${suggestion.legacyPath ?? suggestion.currentPath}",`,
		);
	}
	lines.push("] as const;");
	lines.push("");
	lines.push(`export function migrate(input: Record<string, unknown>): ${currentTypeName} {`);
	lines.push(`\treturn {`);

	for (const key of Object.keys(currentAttributes)) {
		for (const manualItem of diff.summary.manualItems.filter(
			(item) => item.path === key || item.path.startsWith(`${key}.`),
		)) {
			lines.push(
				`\t\t// ${MIGRATION_TODO_PREFIX} ${manualItem.path}: ${manualItem.kind}${manualItem.detail ? ` (${manualItem.detail})` : ""}`,
			);
		}
		for (const renameCandidate of suggestedRenameCandidates.filter(
			(item) => item.currentPath === key || item.currentPath.startsWith(`${key}.`),
		)) {
			lines.push(
				`\t\t// ${MIGRATION_TODO_PREFIX} consider renameMap[${JSON.stringify(renameCandidate.currentPath)}] = "${renameCandidate.legacyPath}"`,
			);
		}
		for (const suggestion of diff.summary.transformSuggestions.filter(
			(item) => item.currentPath === key || item.currentPath.startsWith(`${key}.`),
		)) {
			lines.push(`\t\t// ${MIGRATION_TODO_PREFIX} review transforms[${JSON.stringify(suggestion.currentPath)}]`);
		}
		lines.push(
			`\t\t${key}: resolveMigrationAttribute(currentManifest.attributes.${key}, "${key}", "${key}", input, renameMap, transforms),`,
		);
	}

	lines.push(`\t} as ${currentTypeName};`);
	lines.push("}");
	lines.push("");
	return `${lines.join("\n")}\n`;
}
