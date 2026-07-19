import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");
const tempDirs: string[] = [];

afterEach(() => {
	for (const tempDir of tempDirs) {
		fs.rmSync(tempDir, { force: true, recursive: true });
	}
	tempDirs.length = 0;
});

test("generated project smoke script supports a reference example lane", () => {
	const smokeScript = fs.readFileSync(
		join(repoRoot, "scripts", "run-generated-project-smoke.mjs"),
		"utf8",
	);
	const exampleHelper = fs.readFileSync(
		join(repoRoot, "scripts", "lib", "generated-project-smoke-example.mjs"),
		"utf8",
	);
	const assertionHelper = fs.readFileSync(
		join(repoRoot, "scripts", "lib", "generated-project-smoke-assertions.mjs"),
		"utf8",
	);
	const coreHelper = fs.readFileSync(
		join(repoRoot, "scripts", "lib", "generated-project-smoke-core.mjs"),
		"utf8",
	);

	expect(smokeScript).toContain("exampleProject");
	expect(smokeScript).toContain("--example-project");
	expect(smokeScript).toContain('./lib/generated-project-smoke-example.mjs');
	expect(smokeScript).toContain('./lib/generated-project-smoke-assertions.mjs');
	expect(smokeScript).toContain("runExampleProjectSmoke");
	expect(smokeScript).toContain("assertGeneratedProjectScaffold");
	expect(smokeScript).toContain("assertScaffoldPackageManagerField");
	expect(smokeScript).toContain('packageManager === "npm"');
	expect(smokeScript).toContain("Expected npm scaffolds to omit packageManager");
	expect(exampleHelper).toContain("ensureCopiedExampleSupportDependencies");
	expect(exampleHelper).toContain("runExampleProjectSmoke");
	expect(exampleHelper).toContain("shouldRunMigrationSmoke");
	expect(exampleHelper).toContain('devDependencies["bun-types"]');
	expect(exampleHelper).toContain('devDependencies["@types/node"]');
	expect(assertionHelper).toContain("assertExampleProjectScaffold");
	expect(assertionHelper).toContain("collectProjectFilePaths");
	expect(assertionHelper).toContain("PHP lint failed for");
	expect(assertionHelper).toContain("${filePath}");
	expect(assertionHelper).toContain("error?.stderr");
	expect(assertionHelper).toContain("error?.stdout");
	expect(assertionHelper).toContain('exampleProject === "my-typia-block"');
	expect(assertionHelper).toContain('path.join(projectDir, "build", "blocks", blockSlug)');
	expect(coreHelper).toContain(
		'Expected ${configPath} to declare currentMigrationVersion in a supported format'
	);
	expect(coreHelper).toContain("cleanupTemporaryProjectRoot");
	expect(coreHelper).toContain("maxRetries: 5");
	expect(coreHelper).toContain("retryDelay: 100");
	expect(exampleHelper).toContain('Missing "typecheck" script in');
	expect(exampleHelper).toContain('path.resolve(repoRoot, "examples", exampleProject)');
});

test("CI generated smoke matrix includes the checked-in example lanes", () => {
	const ciWorkflow = fs.readFileSync(
		join(repoRoot, ".github", "workflows", "ci.yml"),
		"utf8",
	);

	expect(ciWorkflow).toContain("example_project: my-typia-block");
	expect(ciWorkflow).toContain("example_project: compound-patterns");
	expect(ciWorkflow).toContain("example_project: persistence-examples");
	expect(ciWorkflow).toContain("smoke-reference-my-typia-block-bun");
	expect(ciWorkflow).toContain("smoke-example-compound-patterns-bun");
	expect(ciWorkflow).toContain("smoke-example-persistence-examples-bun");
	expect(ciWorkflow).toContain(
		"Generated Project Smoke (${{ matrix.project_name || matrix.example_project }})",
	);
	expect(ciWorkflow).toContain('if [ -n "${{ matrix.template || \'\' }}" ]; then');
	expect(ciWorkflow).toContain('args+=(--template "${{ matrix.template }}")');
	expect(ciWorkflow).toContain('--example-project "${{ matrix.example_project }}"');
});

test("generated smoke script forwards run arguments per package manager", async () => {
	const { getRunScriptCommand } = (await import(
		new URL("../../scripts/lib/generated-project-smoke-core.mjs", import.meta.url).href
	)) as {
		getRunScriptCommand: (
			packageManager: "bun" | "npm" | "pnpm" | "yarn",
			scriptName: string,
			extraArgs?: string[],
		) => [string, string[]];
	};

	expect(getRunScriptCommand("bun", "sync", ["--check"])).toEqual([
		"bun",
		["run", "sync", "--check"],
	]);
	expect(getRunScriptCommand("npm", "sync", ["--check"])).toEqual([
		"npm",
		["run", "sync", "--", "--check"],
	]);
	expect(getRunScriptCommand("pnpm", "sync", ["--check"])).toEqual([
		"corepack",
		["pnpm", "run", "sync", "--check"],
	]);
	expect(getRunScriptCommand("yarn", "sync", ["--check"])).toEqual([
		"corepack",
		["yarn", "run", "sync", "--check"],
	]);
});

test("workspace dependency rewrite seeds local runtime packages for linked Bun reference examples", async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), "wp-typia-generated-smoke-reference-"),
	);
	tempDirs.push(projectDir);

	const packageJsonPath = join(projectDir, "package.json");
	fs.writeFileSync(
		packageJsonPath,
		`${JSON.stringify(
			{
				name: "my-typia-block",
				private: true,
				devDependencies: {
					"@wp-typia/block-runtime": "workspace:*",
					"@wp-typia/block-types": "workspace:*",
					"@wp-typia/rest": "workspace:*",
					"wp-typia": "workspace:*",
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	const { rewriteWorkspaceDependencies } = (await import(
		new URL("../../scripts/lib/generated-project-smoke-core.mjs", import.meta.url).href
	)) as {
		rewriteWorkspaceDependencies: (
			projectDir: string,
			packageManager: "bun" | "npm" | "pnpm" | "yarn",
		) => void;
	};

	rewriteWorkspaceDependencies(projectDir, "bun");

	const rewrittenPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

	expect(rewrittenPackageJson.packageManager).toBe("bun@1.3.11");
	expect(rewrittenPackageJson.devDependencies["@wp-typia/api-client"]).toContain(
		"packages/wp-typia-api-client",
	);
	expect(rewrittenPackageJson.devDependencies["@wp-typia/block-runtime"]).toContain(
		"packages/wp-typia-block-runtime",
	);
	expect(rewrittenPackageJson.devDependencies["@wp-typia/project-tools"]).toContain(
		"packages/wp-typia-project-tools",
	);
	expect(rewrittenPackageJson.devDependencies["@wp-typia/rest"]).toContain(
		"packages/wp-typia-rest",
	);
	expect(rewrittenPackageJson.devDependencies["wp-typia"]).toContain(
		"packages/wp-typia",
	);
	expect(rewrittenPackageJson.overrides["@wp-typia/project-tools"]).toContain(
		"packages/wp-typia-project-tools",
	);
	expect(rewrittenPackageJson.resolutions["@wp-typia/project-tools"]).toContain(
		"packages/wp-typia-project-tools",
	);
});

test("workspace dependency rewrite keeps npm project-tools overrides compatible with direct dependencies", async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), "wp-typia-generated-smoke-npm-overrides-"),
	);
	tempDirs.push(projectDir);

	const packageJsonPath = join(projectDir, "package.json");
	fs.writeFileSync(
		packageJsonPath,
		`${JSON.stringify(
			{
				name: "my-typia-block",
				private: true,
				devDependencies: {
					"@wp-typia/project-tools": "^0.20.0",
					"wp-typia": "^0.20.3",
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	const { rewriteWorkspaceDependencies } = (await import(
		new URL("../../scripts/lib/generated-project-smoke-core.mjs", import.meta.url).href
	)) as {
		rewriteWorkspaceDependencies: (
			projectDir: string,
			packageManager: "bun" | "npm" | "pnpm" | "yarn",
		) => void;
	};

	rewriteWorkspaceDependencies(projectDir, "npm");

	const rewrittenPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

	expect(rewrittenPackageJson.packageManager).toBe("npm@11.6.1");
	expect(rewrittenPackageJson.devDependencies["@wp-typia/project-tools"]).toContain(
		"packages/wp-typia-project-tools",
	);
	expect(rewrittenPackageJson.devDependencies["wp-typia"]).toContain(
		"packages/wp-typia",
	);
	expect(rewrittenPackageJson.overrides["@wp-typia/project-tools"]).toBe(
		rewrittenPackageJson.devDependencies["@wp-typia/project-tools"],
	);
	expect(rewrittenPackageJson.pnpm.overrides["@wp-typia/project-tools"]).toBe(
		rewrittenPackageJson.devDependencies["@wp-typia/project-tools"],
	);
	expect(rewrittenPackageJson.resolutions["@wp-typia/project-tools"]).toBe(
		rewrittenPackageJson.devDependencies["@wp-typia/project-tools"],
	);
});

test("generated project smoke assertions accept local project-tools smoke rewrites", async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), "wp-typia-generated-smoke-boundary-"),
	);
	tempDirs.push(projectDir);

	fs.writeFileSync(
		join(projectDir, "package.json"),
		`${JSON.stringify(
			{
				name: "demo-smoke-boundary",
				private: true,
				devDependencies: {
					"@wp-typia/project-tools": `file:${join(
						repoRoot,
						"packages",
						"wp-typia-project-tools",
					)}`,
				},
				scripts: {
					build: "wp-scripts build",
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	const { assertGeneratedPackageBoundary } = (await import(
		new URL("../../scripts/lib/generated-project-smoke-assertions.mjs", import.meta.url).href
	)) as {
		assertGeneratedPackageBoundary: (projectDir: string) => void;
	};

	expect(() => assertGeneratedPackageBoundary(projectDir)).not.toThrow();
});

test("generated project smoke assertions allow official workspace CLI helper scripts", async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), "wp-typia-generated-smoke-workspace-boundary-"),
	);
	tempDirs.push(projectDir);

	fs.writeFileSync(
		join(projectDir, "package.json"),
		`${JSON.stringify(
			{
				name: "demo-smoke-workspace-boundary",
				private: true,
				scripts: {
					"wp-typia:add": "wp-typia add",
					"wp-typia:doctor": "wp-typia doctor",
					"wp-typia:sync": "wp-typia sync",
				},
				wpTypia: {
					projectType: "workspace",
					templatePackage: "@wp-typia/create-workspace-template",
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	const { assertGeneratedPackageBoundary } = (await import(
		new URL("../../scripts/lib/generated-project-smoke-assertions.mjs", import.meta.url).href
	)) as {
		assertGeneratedPackageBoundary: (projectDir: string) => void;
	};

	expect(() => assertGeneratedPackageBoundary(projectDir)).not.toThrow();
});

test("generated project smoke assertions reject non-workspace wp-typia scripts", async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), "wp-typia-generated-smoke-script-boundary-"),
	);
	tempDirs.push(projectDir);

	fs.writeFileSync(
		join(projectDir, "package.json"),
		`${JSON.stringify(
			{
				name: "demo-smoke-script-boundary",
				private: true,
				scripts: {
					"wp-typia:sync": "wp-typia sync",
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	const { assertGeneratedPackageBoundary } = (await import(
		new URL("../../scripts/lib/generated-project-smoke-assertions.mjs", import.meta.url).href
	)) as {
		assertGeneratedPackageBoundary: (projectDir: string) => void;
	};

	expect(() => assertGeneratedPackageBoundary(projectDir)).toThrow(
		/Expected generated project script "wp-typia:sync" to avoid wp-typia/,
	);
});

test("generated project smoke assertions still reject published project-tools dependencies", async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), "wp-typia-generated-smoke-boundary-reject-"),
	);
	tempDirs.push(projectDir);

	fs.writeFileSync(
		join(projectDir, "package.json"),
		`${JSON.stringify(
			{
				name: "demo-smoke-boundary-reject",
				private: true,
				devDependencies: {
					"@wp-typia/project-tools": "^0.19.0",
				},
				scripts: {
					build: "wp-scripts build",
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	const { assertGeneratedPackageBoundary } = (await import(
		new URL("../../scripts/lib/generated-project-smoke-assertions.mjs", import.meta.url).href
	)) as {
		assertGeneratedPackageBoundary: (projectDir: string) => void;
	};

	expect(() => assertGeneratedPackageBoundary(projectDir)).toThrow(
		/omit @wp-typia\/project-tools unless smoke rewrites pinned it to the local workspace package/,
	);
});
