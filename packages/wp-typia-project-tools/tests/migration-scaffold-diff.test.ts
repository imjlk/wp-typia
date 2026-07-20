import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { cleanupMigrationTempRoot, createAmbiguousRenameProject, createMigrationTempRoot, createMultiBlockMigrationProject, createNestedRenameProject, createRenameCandidateProject, createTypeCoercionProject, createUnionProject, createVersionedMigrationProject, entryPath, runCli } from "./helpers/migration-test-harness.js";
import { createMigrationDiff } from "../src/runtime/migration-diff.js";
import { loadMigrationProject } from "../src/runtime/migration-project.js";
import { createMigrationRiskSummary } from "../src/runtime/migration-risk.js";

describe("wp-typia migrate scaffold and diff", () => {
  const tempRoot = createMigrationTempRoot("wp-typia-migration-exec-");

  afterAll(() => {
    cleanupMigrationTempRoot(tempRoot);
  });

test("scaffold and verify generate auto-migration artifacts for additive schema changes", () => {
	const projectDir = path.join(tempRoot, "verify-project");
	createVersionedMigrationProject(projectDir);

	const diffOutput = runCli("node", [entryPath, "migrate", "diff", "--from-migration-version", "v1"], {
		cwd: projectDir,
	});
	expect(diffOutput).toContain("Migration diff: v1 -> v3");
	expect(diffOutput).toContain("add-default");

	runCli("node", [entryPath, "migrate", "scaffold", "--from-migration-version", "v1"], {
		cwd: projectDir,
	});

	const rulePath = path.join(projectDir, "src", "migrations", "rules", "v1-to-v3.ts");
	const deprecatedPath = path.join(projectDir, "src", "migrations", "generated", "deprecated.ts");
	const fixturePath = path.join(projectDir, "src", "migrations", "fixtures", "v1-to-v3.json");
	const phpRegistryPath = path.join(projectDir, "typia-migration-registry.php");

	expect(fs.existsSync(rulePath)).toBe(true);
	expect(fs.existsSync(deprecatedPath)).toBe(true);
	expect(fs.existsSync(fixturePath)).toBe(true);
	expect(fs.existsSync(phpRegistryPath)).toBe(true);

	const ruleSource = fs.readFileSync(rulePath, "utf8");
	const deprecatedSource = fs.readFileSync(deprecatedPath, "utf8");
	const fixtureSource = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
	const phpRegistrySource = fs.readFileSync(phpRegistryPath, "utf8");
	expect(ruleSource).not.toContain("TODO MIGRATION:");
	expect(ruleSource).toContain("isVisible");
	expect(deprecatedSource).toContain("deprecated_0");
	expect(Array.isArray(fixtureSource.cases)).toBe(true);
	expect(fixtureSource.cases[0].name).toBe("default");
	expect(phpRegistrySource).toContain("if ( ! defined( 'ABSPATH' ) ) {\n\texit;\n}");
	expect(phpRegistrySource).toContain("'currentMigrationVersion' => 'v3'");
	expect(phpRegistrySource).toContain("'legacyMigrationVersions' =>");
	expect(phpRegistrySource).toContain("'v1'");

	const verifyOutput = runCli("node", [entryPath, "migrate", "verify", "--all"], {
		cwd: projectDir,
	});
	expect(verifyOutput).toContain("Verified v1 -> v3");
	expect(verifyOutput).toContain("Migration verification passed for create-block/migration-smoke");
}, { timeout: 30_000 });

test("scaffold exposes renameMap and transforms helpers for rename candidates", () => {
	const projectDir = path.join(tempRoot, "rename-project");
	createRenameCandidateProject(projectDir);

	const diffOutput = runCli("node", [entryPath, "migrate", "diff", "--from-migration-version", "v1"], {
		cwd: projectDir,
	});
	expect(diffOutput).toContain("Auto-applied renames:");
	expect(diffOutput).toContain("content <- headline");

	runCli("node", [entryPath, "migrate", "scaffold", "--from-migration-version", "v1"], {
		cwd: projectDir,
	});

	const rulePath = path.join(projectDir, "src", "migrations", "rules", "v1-to-v3.ts");
	const fixturePath = path.join(projectDir, "src", "migrations", "fixtures", "v1-to-v3.json");
	const ruleSource = fs.readFileSync(rulePath, "utf8");
	const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

	expect(ruleSource).toContain("export const renameMap");
	expect(ruleSource).toContain('"content": "headline"');
	expect(ruleSource).toContain("export const transforms");
	expect(ruleSource).not.toContain('content: rename candidate from headline');
	expect(ruleSource).toContain('resolveMigrationAttribute(currentManifest.attributes.content, "content", "content", input, renameMap, transforms)');
	expect(fixture.cases.some((entry: { name: string }) => entry.name === "rename:headline->content")).toBe(true);

	const verifyOutput = runCli("node", [entryPath, "migrate", "verify", "--all"], {
		cwd: projectDir,
	});
	expect(verifyOutput).toContain("Verified v1 -> v3");
});

test("scaffold auto-applies nested leaf rename candidates", () => {
	const projectDir = path.join(tempRoot, "nested-rename-project");
	createNestedRenameProject(projectDir);

	const diffOutput = runCli("node", [entryPath, "migrate", "diff", "--from-migration-version", "v1"], {
		cwd: projectDir,
	});
	expect(diffOutput).toContain("settings.label <- settings.title");

	runCli("node", [entryPath, "migrate", "scaffold", "--from-migration-version", "v1"], {
		cwd: projectDir,
	});

	const rulePath = path.join(projectDir, "src", "migrations", "rules", "v1-to-v3.ts");
	const fixturePath = path.join(projectDir, "src", "migrations", "fixtures", "v1-to-v3.json");
	const ruleSource = fs.readFileSync(rulePath, "utf8");
	const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

	expect(ruleSource).toContain('"settings.label": "settings.title"');
	expect(ruleSource).toContain('resolveMigrationAttribute(currentManifest.attributes.settings, "settings", "settings", input, renameMap, transforms)');
	expect(
		fixture.cases.some((entry: { name: string }) => entry.name === "rename:settings.title->settings.label"),
	).toBe(true);

	const verifyOutput = runCli("node", [entryPath, "migrate", "verify", "--all"], {
		cwd: projectDir,
	});
	expect(verifyOutput).toContain("Verified v1 -> v3");
});

test("ambiguous rename candidates stay unresolved", () => {
	const projectDir = path.join(tempRoot, "ambiguous-rename-project");
	createAmbiguousRenameProject(projectDir);

	runCli("node", [entryPath, "migrate", "scaffold", "--from-migration-version", "v1"], {
		cwd: projectDir,
	});

	const rulePath = path.join(projectDir, "src", "migrations", "rules", "v1-to-v3.ts");
	const ruleSource = fs.readFileSync(rulePath, "utf8");

	expect(ruleSource).toContain('// "content": "headline",');
	expect(ruleSource).toContain("rename candidate from");
});

test("scaffold suggests transform bodies for semantic coercion", () => {
	const projectDir = path.join(tempRoot, "coercion-project");
	createTypeCoercionProject(projectDir);

	runCli("node", [entryPath, "migrate", "scaffold", "--from-migration-version", "v1"], {
		cwd: projectDir,
	});

	const rulePath = path.join(projectDir, "src", "migrations", "rules", "v1-to-v3.ts");
	const ruleSource = fs.readFileSync(rulePath, "utf8");

	expect(ruleSource).toContain("export const transforms");
	expect(ruleSource).toContain('// "clickCount": (legacyValue, legacyInput) => {');
	expect(ruleSource).toContain("// const numericValue = typeof legacyValue === \"number\" ? legacyValue : Number(legacyValue ?? 0);");
	expect(ruleSource).toContain("clickCount: transform suggested from clickCount");
});

test("union diff distinguishes additive and removal changes", () => {
	const additiveProjectDir = path.join(tempRoot, "union-additive-project");
	createUnionProject(additiveProjectDir, { removeBranch: false });
	const additiveOutput = runCli("node", [entryPath, "migrate", "diff", "--from-migration-version", "v1"], {
		cwd: additiveProjectDir,
	});
	expect(additiveOutput).toContain("union-branch-addition");

	const removalProjectDir = path.join(tempRoot, "union-removal-project");
	createUnionProject(removalProjectDir, { removeBranch: true });
	const removalOutput = runCli("node", [entryPath, "migrate", "diff", "--from-migration-version", "v1"], {
		cwd: removalProjectDir,
	});
	expect(removalOutput).toContain("union-branch-removal");
});

test("risk summary classifies additive, rename, transform, and union-breaking edges", () => {
	const additiveProjectDir = path.join(tempRoot, "risk-additive-project");
	createVersionedMigrationProject(additiveProjectDir);
	const additiveSummary = createMigrationRiskSummary(
		createMigrationDiff(loadMigrationProject(additiveProjectDir), "v1", "v3"),
	);
	expect(additiveSummary.additive.count).toBeGreaterThan(0);

	const renameProjectDir = path.join(tempRoot, "risk-rename-project");
	createRenameCandidateProject(renameProjectDir);
	const renameSummary = createMigrationRiskSummary(
		createMigrationDiff(loadMigrationProject(renameProjectDir), "v1", "v3"),
	);
	expect(renameSummary.rename.count).toBeGreaterThan(0);

	const transformProjectDir = path.join(tempRoot, "risk-transform-project");
	createTypeCoercionProject(transformProjectDir);
	const transformSummary = createMigrationRiskSummary(
		createMigrationDiff(loadMigrationProject(transformProjectDir), "v1", "v3"),
	);
	expect(transformSummary.semanticTransform.count).toBeGreaterThan(0);

	const unionProjectDir = path.join(tempRoot, "risk-union-project");
	createUnionProject(unionProjectDir, { removeBranch: true });
	const unionSummary = createMigrationRiskSummary(
		createMigrationDiff(loadMigrationProject(unionProjectDir), "v1", "v3"),
	);
	expect(unionSummary.unionBreaking.count).toBeGreaterThan(0);
});

test("multi-block configs load and scaffold per-target migration artifacts", () => {
	const projectDir = path.join(tempRoot, "multi-block-project");
	createMultiBlockMigrationProject(projectDir, { includeLegacyChild: true });

	const state = loadMigrationProject(projectDir);
	expect(state.blocks).toHaveLength(2);
	expect(state.blocks.map((block) => block.key)).toEqual([
		"multi-parent",
		"multi-parent-item",
	]);

	runCli("node", [entryPath, "migrate", "scaffold", "--from-migration-version", "v1"], {
		cwd: projectDir,
	});

	expect(
		fs.existsSync(
			path.join(projectDir, "src", "migrations", "rules", "multi-parent", "v1-to-v3.ts"),
		),
	).toBe(true);
	expect(
		fs.existsSync(
			path.join(projectDir, "src", "migrations", "rules", "multi-parent-item", "v1-to-v3.ts"),
		),
	).toBe(true);
	expect(
		fs.existsSync(
			path.join(projectDir, "src", "migrations", "generated", "multi-parent", "registry.ts"),
		),
	).toBe(true);
	expect(
		fs.existsSync(
			path.join(projectDir, "src", "migrations", "generated", "multi-parent-item", "registry.ts"),
		),
	).toBe(true);
	expect(
		fs.existsSync(path.join(projectDir, "src", "migrations", "generated", "index.ts")),
	).toBe(true);
	const phpRegistry = fs.readFileSync(
		path.join(projectDir, "typia-migration-registry.php"),
		"utf8",
	);
	expect(phpRegistry).toContain("'blocks' =>");
	expect(phpRegistry).toContain("'multi-parent'");
	expect(phpRegistry).toContain("'multi-parent-item'");
});

test("createMigrationDiff requires an explicit block key for multi-block projects", () => {
	const projectDir = path.join(tempRoot, "multi-block-diff-project");
	createMultiBlockMigrationProject(projectDir, { includeLegacyChild: true });
	const state = loadMigrationProject(projectDir);

	expect(() =>
		createMigrationDiff(state, "v1", "v3"),
	).toThrow(/block key is required/i);
	expect(() =>
		createMigrationDiff(
			state,
			{ key: "missing-block" } as any,
			"v1",
			"v3",
		),
	).toThrow(/Unknown migration block key: missing-block/);
});

test("plan, diff, and scaffold reject same-version migration edges early", () => {
	const projectDir = path.join(tempRoot, "same-version-edge-project");
	createVersionedMigrationProject(projectDir);

	expect(() =>
		runCli("node", [entryPath, "migrate", "plan", "--from-migration-version", "v3"], {
			cwd: projectDir,
		}),
	).toThrow(/migrate plan` requires different source and target migration versions[\s\S]*v3/);

	expect(() =>
		runCli("node", [entryPath, "migrate", "diff", "--from-migration-version", "v3"], {
			cwd: projectDir,
		}),
	).toThrow(/migrate diff` requires different source and target migration versions[\s\S]*v3/);

	expect(() =>
		runCli("node", [entryPath, "migrate", "scaffold", "--from-migration-version", "v1", "--to-migration-version", "v1"], {
			cwd: projectDir,
		}),
	).toThrow(/migrate scaffold` requires different source and target migration versions[\s\S]*v1/);
});
});
