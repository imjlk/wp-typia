import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	findPublishablePackageIds,
	parseChangesetFrontmatter,
	runCli,
	toPosixRelativePath,
	validateSampoChangesetCoverage,
	validateSampoChangesets,
} from "../../scripts/validate-sampo-changesets.mjs";

let tempDirs: string[] = [];

afterEach(() => {
	for (const tempDir of tempDirs) {
		fs.rmSync(tempDir, { force: true, recursive: true });
	}
	tempDirs = [];
});

function createTempRepo() {
	const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wp-typia-sampo-test-"));
	tempDirs.push(repoRoot);
	fs.mkdirSync(path.join(repoRoot, ".sampo", "changesets"), { recursive: true });
	fs.mkdirSync(path.join(repoRoot, "packages", "create"), { recursive: true });
	fs.mkdirSync(path.join(repoRoot, "packages", "rest"), { recursive: true });
	fs.mkdirSync(path.join(repoRoot, "examples", "compound-patterns"), { recursive: true });
	fs.mkdirSync(path.join(repoRoot, "examples", "private-example"), { recursive: true });

	fs.writeFileSync(
		path.join(repoRoot, "packages", "create", "package.json"),
		JSON.stringify({ name: "@wp-typia/project-tools", version: "0.1.0" }, null, 2),
	);
	fs.writeFileSync(
		path.join(repoRoot, "packages", "rest", "package.json"),
		JSON.stringify({ name: "@wp-typia/rest", version: "0.1.0" }, null, 2),
	);
	fs.writeFileSync(
		path.join(repoRoot, "examples", "compound-patterns", "package.json"),
		JSON.stringify({ name: "compound-patterns", version: "0.1.0" }, null, 2),
	);
	fs.writeFileSync(
		path.join(repoRoot, "examples", "private-example", "package.json"),
		JSON.stringify({ name: "private-example", private: true, version: "0.1.0" }, null, 2),
	);

	return repoRoot;
}

function runGit(repoRoot: string, args: string[]) {
	return execFileSync("git", args, {
		cwd: repoRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function createCommittedTempRepo() {
	const repoRoot = createTempRepo();
	fs.mkdirSync(path.join(repoRoot, "packages", "create", "src"), {
		recursive: true,
	});
	fs.writeFileSync(
		path.join(repoRoot, "packages", "create", "src", "index.ts"),
		"export const initial = true;\n",
		"utf8",
	);
	runGit(repoRoot, ["init", "--initial-branch=main"]);
	runGit(repoRoot, ["config", "user.email", "tests@wp-typia.local"]);
	runGit(repoRoot, ["config", "user.name", "wp-typia tests"]);
	runGit(repoRoot, ["add", "."]);
	runGit(repoRoot, ["commit", "-m", "initial"]);
	return repoRoot;
}

function commitAll(repoRoot: string, message: string) {
	runGit(repoRoot, ["add", "."]);
	runGit(repoRoot, ["commit", "-m", message]);
}

describe("validate-sampo-changesets", () => {
	test("findPublishablePackageIds returns canonical npm ids for non-private workspaces", () => {
		const repoRoot = createTempRepo();

		expect(findPublishablePackageIds(repoRoot)).toEqual([
			"npm/@wp-typia/project-tools",
			"npm/@wp-typia/rest",
			"npm/compound-patterns",
		]);
	});

	test("parseChangesetFrontmatter rejects duplicate package ids", () => {
		expect(() =>
			parseChangesetFrontmatter(
				["---", "npm/@wp-typia/project-tools: patch", "npm/@wp-typia/project-tools: minor", "---"].join("\n"),
				"duplicate.md",
			),
		).toThrow('duplicate.md: duplicate package id "npm/@wp-typia/project-tools" in frontmatter');
	});

	test("parseChangesetFrontmatter rejects inherited object keys as release types", () => {
		expect(() =>
			parseChangesetFrontmatter(
				["---", "npm/@wp-typia/project-tools: toString", "---"].join("\n"),
				"invalid-release-type.md",
			),
		).toThrow(
			'invalid-release-type.md: unsupported release type "toString" for "npm/@wp-typia/project-tools"',
		);
	});

	test("toPosixRelativePath normalizes separators for validator output", () => {
		expect(toPosixRelativePath("/repo", "/repo/.sampo/changesets/valid.md")).toBe(
			".sampo/changesets/valid.md",
		);
		expect(toPosixRelativePath("C:\\repo", "C:\\repo\\.sampo\\changesets\\valid.md")).toBe(
			".sampo/changesets/valid.md",
		);
	});

	test("validateSampoChangesets passes for canonical package ids", () => {
		const repoRoot = createTempRepo();

		fs.writeFileSync(
			path.join(repoRoot, ".sampo", "changesets", "valid.md"),
			["---", "npm/@wp-typia/project-tools: patch", "npm/compound-patterns: patch", "---", "", "Valid."].join(
				"\n",
			),
		);

		const result = validateSampoChangesets(repoRoot);

		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	test("validateSampoChangesets fails when the npm prefix is missing", () => {
		const repoRoot = createTempRepo();

		fs.writeFileSync(
			path.join(repoRoot, ".sampo", "changesets", "missing-prefix.md"),
			["---", "@wp-typia/project-tools: patch", "---", "", "Invalid."].join("\n"),
		);

		const result = validateSampoChangesets(repoRoot);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'.sampo/changesets/missing-prefix.md: "@wp-typia/project-tools" must use the canonical npm/<package-name> format',
		);
	});

	test("validateSampoChangesets fails for unknown package ids", () => {
		const repoRoot = createTempRepo();

		fs.writeFileSync(
			path.join(repoRoot, ".sampo", "changesets", "unknown.md"),
			["---", "npm/@wp-typia/unknown: patch", "---", "", "Invalid."].join("\n"),
		);

		const result = validateSampoChangesets(repoRoot);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'.sampo/changesets/unknown.md: "npm/@wp-typia/unknown" does not match a publishable workspace package',
		);
	});

	test("validateSampoChangesets passes when there are no pending changesets", () => {
		const repoRoot = createTempRepo();
		fs.rmSync(path.join(repoRoot, ".sampo", "changesets"), { force: true, recursive: true });

		const result = validateSampoChangesets(repoRoot);

		expect(result.valid).toBe(true);
		expect(result.files).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	test("validateSampoChangesetCoverage rejects changed package release inputs without a changeset", () => {
		const repoRoot = createCommittedTempRepo();
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		fs.writeFileSync(
			path.join(repoRoot, "packages", "create", "src", "index.ts"),
			"export const initial = false;\n",
			"utf8",
		);
		commitAll(repoRoot, "change package source");

		const result = validateSampoChangesetCoverage(repoRoot, { baseRef });

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual([
			`@wp-typia/project-tools has release-relevant changes since ${baseRef}, but remains at 0.1.0 without a pending npm/@wp-typia/project-tools changeset in this diff (packages/create/src/index.ts).`,
		]);
	});

	test("validateSampoChangesetCoverage does not reuse a changeset inherited from the base", () => {
		const repoRoot = createCommittedTempRepo();
		fs.writeFileSync(
			path.join(repoRoot, ".sampo", "changesets", "inherited.md"),
			[
				"---",
				"npm/@wp-typia/project-tools: patch",
				"---",
				"",
				"An earlier change.",
			].join("\n"),
			"utf8",
		);
		commitAll(repoRoot, "add inherited changeset");
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		fs.writeFileSync(
			path.join(repoRoot, "packages", "create", "src", "index.ts"),
			"export const initial = false;\n",
			"utf8",
		);
		commitAll(repoRoot, "change package source");

		const result = validateSampoChangesetCoverage(repoRoot, { baseRef });

		expect(result.valid).toBe(false);
		expect(result.packages[0]?.pendingReleaseType).toBeNull();
	});

	test("validateSampoChangesetCoverage does not reuse a modified changeset inherited from the base", () => {
		const repoRoot = createCommittedTempRepo();
		const changesetPath = path.join(repoRoot, ".sampo", "changesets", "inherited.md");
		fs.writeFileSync(
			changesetPath,
			[
				"---",
				"npm/@wp-typia/project-tools: patch",
				"---",
				"",
				"An earlier change.",
			].join("\n"),
			"utf8",
		);
		commitAll(repoRoot, "add inherited changeset");
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		fs.appendFileSync(changesetPath, "\nEdited in a later change.\n", "utf8");
		fs.writeFileSync(
			path.join(repoRoot, "packages", "create", "src", "index.ts"),
			"export const initial = false;\n",
			"utf8",
		);
		commitAll(repoRoot, "edit inherited changeset and package source");

		const result = validateSampoChangesetCoverage(repoRoot, { baseRef });

		expect(result.valid).toBe(false);
		expect(result.packages[0]?.pendingReleaseType).toBeNull();
	});

	test("validateSampoChangesetCoverage fails closed for a malformed base manifest", () => {
		const repoRoot = createCommittedTempRepo();
		const packageJsonPath = path.join(repoRoot, "packages", "create", "package.json");
		const validPackageJson = fs.readFileSync(packageJsonPath, "utf8");
		fs.writeFileSync(packageJsonPath, "{not-json}\n", "utf8");
		commitAll(repoRoot, "corrupt package manifest");
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		fs.writeFileSync(packageJsonPath, validPackageJson, "utf8");
		fs.writeFileSync(
			path.join(repoRoot, "packages", "create", "src", "index.ts"),
			"export const initial = false;\n",
			"utf8",
		);
		commitAll(repoRoot, "repair manifest and change source");

		expect(() =>
			validateSampoChangesetCoverage(repoRoot, { baseRef }),
		).toThrow();
	});

	test("validateSampoChangesetCoverage fails closed when a base manifest omits its version", () => {
		const repoRoot = createCommittedTempRepo();
		const packageJsonPath = path.join(repoRoot, "packages", "create", "package.json");
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		const validPackageJson = fs.readFileSync(packageJsonPath, "utf8");
		delete packageJson.version;
		fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
		commitAll(repoRoot, "remove package version");
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		fs.writeFileSync(packageJsonPath, validPackageJson, "utf8");
		fs.writeFileSync(
			path.join(repoRoot, "packages", "create", "src", "index.ts"),
			"export const initial = false;\n",
			"utf8",
		);
		commitAll(repoRoot, "restore manifest and change source");

		expect(() =>
			validateSampoChangesetCoverage(repoRoot, { baseRef }),
		).toThrow(/must declare a string version/u);
	});

	test("validateSampoChangesetCoverage rejects deleted package release inputs without a changeset", () => {
		const repoRoot = createCommittedTempRepo();
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		fs.rmSync(path.join(repoRoot, "packages", "create", "src", "index.ts"));
		commitAll(repoRoot, "delete package source");

		const result = validateSampoChangesetCoverage(repoRoot, { baseRef });

		expect(result.valid).toBe(false);
		expect(result.packages[0]?.releaseRelevantPaths).toEqual([
			"packages/create/src/index.ts",
		]);
	});

	test("validateSampoChangesetCoverage accepts changed package inputs with a pending changeset", () => {
		const repoRoot = createCommittedTempRepo();
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		fs.writeFileSync(
			path.join(repoRoot, "packages", "create", "package.json.mustache"),
			'{"name":"generated-project"}\n',
			"utf8",
		);
		fs.writeFileSync(
			path.join(repoRoot, ".sampo", "changesets", "covered.md"),
			[
				"---",
				"npm/@wp-typia/project-tools: patch",
				"---",
				"",
				"Release the changed template.",
			].join("\n"),
			"utf8",
		);
		commitAll(repoRoot, "change package template");

		const result = validateSampoChangesetCoverage(repoRoot, { baseRef });

		expect(result.valid).toBe(true);
		expect(result.packages).toHaveLength(1);
		expect(result.packages[0]).toMatchObject({
			packageName: "@wp-typia/project-tools",
			pendingReleaseType: "patch",
			releaseRelevantPaths: ["packages/create/package.json.mustache"],
		});
	});

	test("validateSampoChangesetCoverage rejects ordinary version-only bumps without pending changesets", () => {
		const repoRoot = createCommittedTempRepo();
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		const packageJsonPath = path.join(repoRoot, "packages", "create", "package.json");
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		packageJson.version = "0.1.1";
		fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
		commitAll(repoRoot, "version package");

		const result = validateSampoChangesetCoverage(repoRoot, { baseRef });

		expect(result.valid).toBe(false);
		expect(result.packages[0]).toMatchObject({
			baseVersion: "0.1.0",
			coveredByVersionBump: false,
			currentVersion: "0.1.1",
			pendingReleaseType: null,
			versionChanged: true,
		});
	});

	test("validateSampoChangesetCoverage accepts authorized release PR version bumps", () => {
		const repoRoot = createCommittedTempRepo();
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		const packageJsonPath = path.join(repoRoot, "packages", "create", "package.json");
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		packageJson.version = "0.1.1";
		fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
		commitAll(repoRoot, "version package");

		const result = validateSampoChangesetCoverage(repoRoot, {
			allowVersionBumps: true,
			baseRef,
		});

		expect(result.valid).toBe(true);
		expect(result.packages[0]?.coveredByVersionBump).toBe(true);
	});

	test("validateSampoChangesetCoverage accepts genuinely new packages", () => {
		const repoRoot = createCommittedTempRepo();
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		const packageDir = path.join(repoRoot, "packages", "new-package");
		fs.mkdirSync(path.join(packageDir, "src"), { recursive: true });
		fs.writeFileSync(
			path.join(packageDir, "package.json"),
			`${JSON.stringify({ name: "@wp-typia/new-package", version: "0.1.0" }, null, 2)}\n`,
			"utf8",
		);
		fs.writeFileSync(path.join(packageDir, "src", "index.ts"), "export {};\n", "utf8");
		commitAll(repoRoot, "add package");

		const result = validateSampoChangesetCoverage(repoRoot, { baseRef });

		expect(result.valid).toBe(true);
		expect(result.packages.find(({ packageName }) => packageName === "@wp-typia/new-package")).toMatchObject({
			baseVersion: null,
			coveredByVersionBump: true,
		});
	});

	test("validateSampoChangesetCoverage fails closed when a new package omits its version", () => {
		const repoRoot = createCommittedTempRepo();
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		const packageDir = path.join(repoRoot, "packages", "new-package");
		fs.mkdirSync(path.join(packageDir, "src"), { recursive: true });
		fs.writeFileSync(
			path.join(packageDir, "package.json"),
			`${JSON.stringify({ name: "@wp-typia/new-package" }, null, 2)}\n`,
			"utf8",
		);
		fs.writeFileSync(path.join(packageDir, "src", "index.ts"), "export {};\n", "utf8");
		commitAll(repoRoot, "add package without version");

		expect(() =>
			validateSampoChangesetCoverage(repoRoot, { baseRef }),
		).toThrow(/must declare a string version/u);
	});

	test("validateSampoChangesetCoverage does not let a source change bypass changesets with a manual version bump", () => {
		const repoRoot = createCommittedTempRepo();
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		const packageJsonPath = path.join(repoRoot, "packages", "create", "package.json");
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		packageJson.version = "0.1.1";
		fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
		fs.writeFileSync(
			path.join(repoRoot, "packages", "create", "src", "index.ts"),
			"export const initial = false;\n",
			"utf8",
		);
		commitAll(repoRoot, "change and version package source");

		const result = validateSampoChangesetCoverage(repoRoot, {
			allowVersionBumps: true,
			baseRef,
		});

		expect(result.valid).toBe(false);
		expect(result.packages[0]).toMatchObject({
			coveredByVersionBump: false,
			versionChanged: true,
		});
	});

	test("runCli requires explicit authorization for release version bumps", () => {
		const repoRoot = createCommittedTempRepo();
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		const packageJsonPath = path.join(repoRoot, "packages", "create", "package.json");
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		packageJson.version = "0.1.1";
		fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
		commitAll(repoRoot, "version package");
		const stderr: string[] = [];
		const stdout: string[] = [];
		const writer = (chunks: string[]) => ({
			write(chunk: string) {
				chunks.push(chunk);
			},
		});

		expect(
			runCli({
				argv: ["--base-ref", baseRef],
				cwd: repoRoot,
				stderr: writer(stderr),
				stdout: writer(stdout),
			}),
		).toBe(1);
		expect(stderr.join("")).toContain("missing Sampo changesets");

		stderr.length = 0;
		stdout.length = 0;
		expect(
			runCli({
				argv: ["--base-ref", baseRef, "--allow-version-bumps"],
				cwd: repoRoot,
				stderr: writer(stderr),
				stdout: writer(stdout),
			}),
		).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout.join("")).toContain("Validated Sampo changeset coverage for 1 changed publishable package.");
	});

	test("validateSampoChangesetCoverage ignores package tests and release documentation", () => {
		const repoRoot = createCommittedTempRepo();
		const baseRef = runGit(repoRoot, ["rev-parse", "HEAD"]);
		fs.mkdirSync(path.join(repoRoot, "packages", "create", "tests"), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(repoRoot, "packages", "create", "tests", "source.test.ts"),
			"export {};\n",
			"utf8",
		);
		fs.writeFileSync(
			path.join(repoRoot, "packages", "create", "README.md"),
			"# Test package\n",
			"utf8",
		);
		fs.writeFileSync(
			path.join(repoRoot, "packages", "create", "CHANGELOG.md"),
			"# Changelog\n",
			"utf8",
		);
		commitAll(repoRoot, "change package tests and docs");

		const result = validateSampoChangesetCoverage(repoRoot, { baseRef });

		expect(result.valid).toBe(true);
		expect(result.packages).toEqual([]);
	});
});
