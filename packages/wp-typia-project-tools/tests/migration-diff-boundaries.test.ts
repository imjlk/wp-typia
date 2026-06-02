import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sourceRoot = resolve(import.meta.dir, "..", "src", "runtime", "migration");

test("migration-diff keeps rename and transform helpers in dedicated modules", () => {
	const migrationDiffSource = readFileSync(
		resolve(sourceRoot, "migration-diff.ts"),
		"utf8",
	);
	const migrationDiffRenameSource = readFileSync(
		resolve(sourceRoot, "migration-diff-rename.ts"),
		"utf8",
	);
	const migrationDiffTransformSource = readFileSync(
		resolve(sourceRoot, "migration-diff-transform.ts"),
		"utf8",
	);

	expect(migrationDiffSource).toContain('from "./migration-diff-rename.js"');
	expect(migrationDiffSource).toContain('from "./migration-diff-transform.js"');
	expect(migrationDiffSource).not.toContain("function createRenameCandidates(");
	expect(migrationDiffSource).not.toContain("function assessRenameCandidate(");
	expect(migrationDiffSource).not.toContain("function createTransformSuggestions(");
	expect(migrationDiffSource).not.toContain("function buildTransformBodyLines(");
	expect(migrationDiffRenameSource).toContain("export function createRenameCandidates(");
	expect(migrationDiffRenameSource).toContain("export function passesNameSimilarityRule(");
	expect(migrationDiffTransformSource).toContain(
		"export function createTransformSuggestions(",
	);
	expect(migrationDiffTransformSource).toContain(
		"export function describeConstraintChange(",
	);
});
