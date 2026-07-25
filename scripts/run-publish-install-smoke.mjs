#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
	findWorkspaceProtocolLeaks,
	getNpmCommand,
	getTarCommand,
	packWorkspacePackageDetailed,
	readPackedPackageManifest,
	repoRoot,
	withTempDir,
} from "./publish-package-utils.mjs";
import {
	PUBLISH_PACKAGE_CHAIN,
	formatPublishPackageFootprintReport,
	validatePublishPackageFootprint,
} from "./lib/publish-package-footprint.mjs";

const GENERATED_PROJECT_OVERRIDE_PACKAGES = [
	"@wp-typia/api-client",
	"@wp-typia/rest",
	"@wp-typia/block-types",
	"@wp-typia/dataviews",
	"@wp-typia/block-runtime",
	"@wp-typia/project-tools",
	"wp-typia",
];
const npmCommand = getNpmCommand();
const tarCommand = getTarCommand();

function run(command, args, options = {}) {
	return execFileSync(command, args, {
		cwd: repoRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		...options,
	});
}

function createNodeOnlyEnv() {
	return {
		...process.env,
		BUN_BIN: path.join(os.tmpdir(), "wp-typia-missing-bun"),
		PATH: path.dirname(process.execPath),
	};
}

function runScript(projectDir, command, fileName, source, args = []) {
	const scriptPath = path.join(projectDir, fileName);
	fs.writeFileSync(scriptPath, source, "utf8");
	return run(command, [scriptPath, ...args], { cwd: projectDir });
}

function writeJson(filePath, value) {
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getInstalledWpTypiaCliPath(projectDir) {
	const installedManifest = readJson(
		path.join(projectDir, "node_modules", "wp-typia", "package.json"),
	);
	const binEntry =
		typeof installedManifest.bin === "string"
			? installedManifest.bin
			: installedManifest.bin?.["wp-typia"] ??
				Object.values(installedManifest.bin ?? {})[0];
	if (typeof binEntry !== "string" || binEntry.length === 0) {
		throw new Error("Unable to resolve wp-typia CLI entry from the installed package manifest.");
	}

	return path.join(projectDir, "node_modules", "wp-typia", binEntry);
}

function runWpTypiaCli(projectDir, cliPath, args, options = {}) {
	return run("node", [cliPath, ...args], { cwd: projectDir, ...options });
}

function materializeTarballDependencies(projectDir, tarballs) {
	const packageJsonPath = path.join(projectDir, "package.json");
	const packageJson = readJson(packageJsonPath);
	const directDependencies = new Set();

	for (const field of ["dependencies", "devDependencies"] ) {
		const section = packageJson[field];
		if (!section || typeof section !== "object") {
			continue;
		}

		for (const packageName of GENERATED_PROJECT_OVERRIDE_PACKAGES) {
			if (typeof section[packageName] !== "string") {
				continue;
			}

			section[packageName] = `file:${tarballs.get(packageName)}`;
			directDependencies.add(packageName);
		}
	}

	packageJson.overrides ??= {};
	for (const packageName of GENERATED_PROJECT_OVERRIDE_PACKAGES) {
		if (directDependencies.has(packageName)) {
			continue;
		}

		packageJson.overrides[packageName] = `file:${tarballs.get(packageName)}`;
	}

	writeJson(packageJsonPath, packageJson);
}

function assertScaffoldDependencyRanges(projectDir, dependencyField, expectations) {
	const packageJson = readJson(path.join(projectDir, "package.json"));

	for (const [packageName, expectedRange] of Object.entries(expectations)) {
		const actualRange = packageJson[dependencyField]?.[packageName];
		if (actualRange !== expectedRange) {
			throw new Error(
				`Generated ${path.basename(projectDir)} package.json expected ${dependencyField}.${packageName}=${expectedRange}, found ${JSON.stringify(actualRange ?? null)}.`,
			);
		}
	}
}

function assertPackagesNotInstalled(projectDir, packageNames) {
	const packageLock = readJson(path.join(projectDir, "package-lock.json"));
	const installPaths = Object.keys(packageLock.packages ?? {});

	for (const packageName of packageNames) {
		const suffix = `node_modules/${packageName}`;
		const matchingPaths = installPaths.filter(
			(installPath) =>
				installPath === suffix || installPath.endsWith(`/${suffix}`),
		);
		if (matchingPaths.length > 0) {
			throw new Error(
				`Default wp-typia install unexpectedly included optional WordPress peer ${packageName} at ${matchingPaths.join(", ")}.`,
			);
		}
	}
}

function getInstalledPackageCount(projectDir) {
	const packageLock = readJson(path.join(projectDir, "package-lock.json"));
	return Object.keys(packageLock.packages ?? {}).filter((installPath) =>
		installPath.includes("node_modules/"),
	).length;
}

function parseJsonOutput(label, output) {
	try {
		return JSON.parse(output);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`${label} did not return valid JSON (${reason}): ${output}`);
	}
}

function assertFilesExist(projectDir, relativePaths) {
	for (const relativePath of relativePaths) {
		if (!fs.existsSync(path.join(projectDir, relativePath))) {
			throw new Error(
				`Expected ${path.basename(projectDir)} to contain ${relativePath}, but it was missing.`,
			);
		}
	}
}

function installGeneratedProject(projectDir, tarballs) {
	materializeTarballDependencies(projectDir, tarballs);
	run(npmCommand, ["install"], { cwd: projectDir });
}

function typecheckGeneratedProject(projectDir) {
	run(npmCommand, ["exec", "--", "ttsc", "--noEmit"], { cwd: projectDir });
}

execFileSync("bun", ["run", "packages:build"], {
	cwd: repoRoot,
	stdio: "inherit",
});

withTempDir("wp-typia-publish-install-smoke-", (tempRoot) => {
	const tarballDir = path.join(tempRoot, "tarballs");
	const projectDir = path.join(tempRoot, "project");
	const defaultCliDir = path.join(tempRoot, "default-cli-install");
	const tarballs = new Map();
	const packedManifests = new Map();
	const footprintResults = [];

	for (const [packageDir, packageName] of PUBLISH_PACKAGE_CHAIN) {
		const { metadata, tarballPath } = packWorkspacePackageDetailed(
			packageDir,
			tarballDir,
		);
		if (metadata.name !== packageName) {
			throw new Error(
				`Packed ${packageDir} as ${JSON.stringify(metadata.name ?? null)} instead of ${packageName}.`,
			);
		}
		footprintResults.push(validatePublishPackageFootprint(metadata));
		tarballs.set(packageName, tarballPath);
		packedManifests.set(packageName, readPackedPackageManifest(tarballPath));

		if (packageName === "@wp-typia/rest") {
			const leaks = findWorkspaceProtocolLeaks(packedManifests.get(packageName));
			if (leaks.length > 0) {
				throw new Error(
					`Packed ${packageName} manifest still contains workspace protocol dependencies: ${leaks.join(", ")}`,
				);
			}
		}

		if (packageName === "wp-typia") {
			const tarballEntries = run(tarCommand, ["-tf", tarballPath]).trim().split("\n");
			if (!tarballEntries.includes("package/dist/cli.js")) {
				throw new Error("Packed wp-typia tarball is missing package/dist/cli.js.");
			}
			if (tarballEntries.some((entry) => entry.startsWith("package/dist-bunli/"))) {
				throw new Error(
					"Packed wp-typia tarball should no longer publish package/dist-bunli artifacts.",
				);
			}
			if (tarballEntries.some((entry) => entry.includes("/.bunli/"))) {
				throw new Error(
					"Packed wp-typia tarball should no longer publish Bunli generated artifacts.",
				);
			}
			if (tarballEntries.includes("package/src/cli.ts")) {
				throw new Error("Packed wp-typia tarball should no longer publish package/src/cli.ts.");
			}
		}
	}

	process.stdout.write(
		[
			"Publish package footprint summary:",
			...footprintResults.map(
				(result) => `- ${formatPublishPackageFootprintReport(result)}`,
			),
		].join("\n") + "\n",
	);
	const footprintErrors = footprintResults.flatMap((result) => result.errors);
	if (footprintErrors.length > 0) {
		throw new Error(
			`Publish package footprint budgets failed:\n${footprintErrors.map((error) => `- ${error}`).join("\n")}`,
		);
	}

	fs.mkdirSync(defaultCliDir, { recursive: true });
	writeJson(path.join(defaultCliDir, "package.json"), {
		dependencies: {
			"wp-typia": `file:${tarballs.get("wp-typia")}`,
		},
		name: "wp-typia-default-cli-install-smoke",
		overrides: Object.fromEntries(
			[...tarballs.entries()]
				.filter(([packageName]) => packageName !== "wp-typia")
				.map(([packageName, tarballPath]) => [
					packageName,
					`file:${tarballPath}`,
				]),
		),
		private: true,
	});
	run(npmCommand, ["install", "--no-audit", "--no-fund"], {
		cwd: defaultCliDir,
	});
	assertPackagesNotInstalled(defaultCliDir, [
		"@types/react",
		"@types/wordpress__block-editor",
		"@types/wordpress__blocks",
		"@wordpress/block-editor",
		"@wordpress/blocks",
	]);
	fs.writeFileSync(
		path.join(defaultCliDir, "block-types-peer-free-smoke.ts"),
		[
			'import { BLOCK_SUPPORT_FEATURES, BLOCK_VARIATION_SCOPES, defineVariation, type BlockAttributes, type BlockVariation } from "@wp-typia/block-types";',
			'import { BLOCK_SUPPORT_FEATURES as blockFeatures, BLOCK_VARIATION_SCOPES as blockScopes, type BlockVariationDefinition } from "@wp-typia/block-types/blocks";',
			"",
			"interface DemoAttributes extends BlockAttributes {",
			"\tclassName: string;",
			"}",
			"",
			"const variation: BlockVariationDefinition<DemoAttributes> = {",
			"\tattributes: { className: 'is-style-demo' },",
			"\tisActive: ['className'],",
			"\tname: 'demo',",
			"\tscope: ['inserter'],",
			"\ttitle: 'Demo',",
			"};",
			"const publicVariation: BlockVariation<DemoAttributes> = {",
			"\tattributes: { className: 'is-style-demo' },",
			"\tname: 'demo',",
			"\ttitle: 'Demo',",
			"};",
			"const defined = defineVariation('core/paragraph', variation);",
			"void [BLOCK_SUPPORT_FEATURES, BLOCK_VARIATION_SCOPES, blockFeatures, blockScopes, defined, publicVariation];",
			"",
		].join("\n"),
		"utf8",
	);
	writeJson(path.join(defaultCliDir, "block-types-peer-free-tsconfig.json"), {
		compilerOptions: {
			lib: ["ES2020"],
			module: "NodeNext",
			moduleResolution: "NodeNext",
			noEmit: true,
			skipLibCheck: false,
			strict: true,
			target: "ES2020",
			types: [],
		},
		include: ["block-types-peer-free-smoke.ts"],
	});
	run(
		npmCommand,
		[
			"exec",
			"--",
			"ttsc",
			"--project",
			"block-types-peer-free-tsconfig.json",
		],
		{ cwd: defaultCliDir },
	);
	runScript(
		defaultCliDir,
		process.execPath,
		"block-types-root-smoke.mjs",
		[
			'import { WORDPRESS_BLOCK_API_COMPATIBILITY } from "@wp-typia/block-types";',
			'import { BLOCK_SUPPORT_FEATURES, BLOCK_VARIATION_SCOPES } from "@wp-typia/block-types/blocks";',
			"",
			'if (!WORDPRESS_BLOCK_API_COMPATIBILITY.blockSupports || !BLOCK_SUPPORT_FEATURES.includes("spacing") || BLOCK_VARIATION_SCOPES.join(",") !== "block,inserter,transform") {',
			'\tthrow new Error("Expected peer-free block-types entrypoints to remain usable.");',
			"}",
			"",
		].join("\n"),
	);
	const defaultCliInstallPackageCount = getInstalledPackageCount(defaultCliDir);
	const defaultCliPath = getInstalledWpTypiaCliPath(defaultCliDir);
	const defaultVersionOutput = runWpTypiaCli(
		defaultCliDir,
		defaultCliPath,
		["--version", "--format", "text"],
		{ env: createNodeOnlyEnv() },
	).trim();
	const expectedDefaultVersionOutput = `wp-typia ${packedManifests.get("wp-typia").version}`;
	if (defaultVersionOutput !== expectedDefaultVersionOutput) {
		throw new Error(
			`Unexpected default-install wp-typia --version output: ${defaultVersionOutput}`,
		);
	}
	const defaultHelpOutput = runWpTypiaCli(
		defaultCliDir,
		defaultCliPath,
		["--help"],
		{ env: createNodeOnlyEnv() },
	);
	if (!defaultHelpOutput.includes("--format <value>")) {
		throw new Error(
			`Default-install wp-typia --help did not expose --format: ${defaultHelpOutput}`,
		);
	}
	if (!defaultHelpOutput.includes("Choices: json, text.")) {
		throw new Error(
			`Default-install wp-typia --help did not expose public format choices: ${defaultHelpOutput}`,
		);
	}
	if (defaultHelpOutput.includes("--id")) {
		throw new Error(
			`Default-install wp-typia --help leaked hidden --id option: ${defaultHelpOutput}`,
		);
	}
	const defaultCreateHelpOutput = runWpTypiaCli(
		defaultCliDir,
		defaultCliPath,
		["create", "--help"],
		{ env: createNodeOnlyEnv() },
	);
	if (
		!defaultCreateHelpOutput.includes("Global flags:") ||
		!defaultCreateHelpOutput.includes("Choices: json, text.")
	) {
		throw new Error(
			`Default-install wp-typia create --help did not expose global format guidance: ${defaultCreateHelpOutput}`,
		);
	}

	const defaultTemplatesOutput = runWpTypiaCli(
		defaultCliDir,
		defaultCliPath,
		["templates", "list", "--format", "json"],
		{ env: createNodeOnlyEnv() },
	).trim();
	const defaultTemplates = parseJsonOutput(
		"Default-install wp-typia templates list --format json",
		defaultTemplatesOutput,
	);
	if (
		!Array.isArray(defaultTemplates.templates) ||
		!defaultTemplates.templates.some((entry) => entry?.id === "basic")
	) {
		throw new Error(
			`Default-install wp-typia templates list did not include basic: ${defaultTemplatesOutput}`,
		);
	}

	const defaultBasicDir = path.join(defaultCliDir, "default-basic");
	const defaultCreateOutput = runWpTypiaCli(
		defaultCliDir,
		defaultCliPath,
		[
			"create",
			"default-basic",
			"--template",
			"basic",
			"--package-manager",
			"npm",
			"--yes",
			"--no-install",
			"--format",
			"json",
		],
		{ env: createNodeOnlyEnv() },
	).trim();
	const defaultCreate = parseJsonOutput(
		"Default-install wp-typia create --format json",
		defaultCreateOutput,
	);
	if (defaultCreate.ok !== true || defaultCreate.data?.command !== "create") {
		throw new Error(
			`Unexpected default-install wp-typia create output: ${defaultCreateOutput}`,
		);
	}
	assertScaffoldDependencyRanges(defaultBasicDir, "devDependencies", {
		"@types/wordpress__blocks": "^12.5.18",
	});
	assertScaffoldDependencyRanges(defaultBasicDir, "dependencies", {
		"@wordpress/blocks": "~15.19.0",
	});

	fs.mkdirSync(projectDir, { recursive: true });
	writeJson(path.join(projectDir, "package.json"), {
		dependencies: {
			"@wp-typia/create-workspace-template": `file:${tarballs.get("@wp-typia/create-workspace-template")}`,
			"@wp-typia/dataviews": `file:${tarballs.get("@wp-typia/dataviews")}`,
			"@wordpress/blocks": "^15.2.0",
			"wp-typia": `file:${tarballs.get("wp-typia")}`,
		},
		name: "wp-typia-publish-install-smoke",
		overrides: Object.fromEntries(
			[...tarballs.entries()].map(([packageName, tarballPath]) => [
				packageName,
				`file:${tarballPath}`,
			]),
		),
		private: true,
		packageManager: "bun@1.3.11",
	});

	run("bun", ["install"], { cwd: projectDir });

	const cliPath = getInstalledWpTypiaCliPath(projectDir);
	const versionOutput = run(process.execPath, [cliPath, "--version", "--format", "text"], {
		cwd: projectDir,
		env: createNodeOnlyEnv(),
	}).trim();
	if (!versionOutput.startsWith("wp-typia ")) {
		throw new Error(`Unexpected human-readable wp-typia --version output: ${versionOutput}`);
	}

	const versionJsonOutput = run(
		process.execPath,
		[cliPath, "--version", "--format", "json"],
		{
			cwd: projectDir,
			env: createNodeOnlyEnv(),
		},
	).trim();
	let parsed;
	try {
		parsed = JSON.parse(versionJsonOutput);
	} catch {
		throw new Error(`wp-typia --version --format json did not return JSON: ${versionJsonOutput}`);
	}

	if (
		!parsed ||
		parsed.ok !== true ||
		parsed.data?.type !== "version" ||
		typeof parsed.data.version !== "string"
	) {
		throw new Error(`Unexpected wp-typia --version --format json output: ${versionJsonOutput}`);
	}

	const completionsOutput = run(process.execPath, [cliPath, "completions", "bash"], {
		cwd: projectDir,
	});
	if (!completionsOutput.includes("# bash completion for wp-typia")) {
		throw new Error(
			`wp-typia completions bash did not return the expected shell output: ${completionsOutput}`,
		);
	}

	runScript(
		projectDir,
		"bun",
		"wrapper-export-smoke.mjs",
		[
			'import "@wp-typia/block-types/blocks/registration";',
			'import { buildScaffoldBlockRegistration, defineScaffoldBlockMetadata, parseScaffoldBlockMetadata } from "@wp-typia/block-runtime/blocks";',
			'import { defineManifestDocument } from "@wp-typia/block-runtime/editor";',
			'import { defineManifestDefaultsDocument, parseManifestDefaultsDocument } from "@wp-typia/block-runtime/defaults";',
			"",
			"for (const [name, value] of Object.entries({",
			"\tbuildScaffoldBlockRegistration,",
			"\tdefineScaffoldBlockMetadata,",
			"\tparseScaffoldBlockMetadata,",
			"\tdefineManifestDocument,",
			"\tdefineManifestDefaultsDocument,",
			"\tparseManifestDefaultsDocument,",
			"})) {",
			'\tif (typeof value !== "function") {',
			'\t\tthrow new Error(`Expected ${name} to be a function export.`);',
			"\t}",
			"}",
			"",
		].join("\n"),
	);

	runScript(
		projectDir,
		"node",
		"dataviews-export-smoke.mjs",
		[
			'import { DATAVIEWS_FIELD_TYPES, DATAVIEWS_LAYOUT_TYPES } from "@wp-typia/dataviews";',
			"",
			'if (!DATAVIEWS_LAYOUT_TYPES.includes("table")) {',
			'\tthrow new Error("Expected @wp-typia/dataviews to publish DataViews layout constants.");',
			"}",
			'if (!DATAVIEWS_FIELD_TYPES.includes("text")) {',
			'\tthrow new Error("Expected @wp-typia/dataviews to publish DataViews field constants.");',
			"}",
			"",
		].join("\n"),
	);

	const blockRuntimeSmokeDir = path.join(projectDir, "block-runtime-smoke");
	fs.mkdirSync(blockRuntimeSmokeDir, { recursive: true });
	fs.writeFileSync(
		path.join(blockRuntimeSmokeDir, "types.ts"),
		[
			"export interface CounterAttributes {",
			'\tlabel: string;',
			"\tcount: number;",
			"}",
			"",
		].join("\n"),
		"utf8",
	);
	fs.writeFileSync(
		path.join(blockRuntimeSmokeDir, "block.json"),
		`${JSON.stringify({ name: "smoke/counter" }, null, 2)}\n`,
		"utf8",
	);
	runScript(
		projectDir,
		"node",
		"block-runtime-smoke.mjs",
		[
			'import fs from "node:fs";',
			'import path from "node:path";',
			'import { runSyncBlockMetadata } from "@wp-typia/block-runtime/metadata-core";',
			"",
			"const projectRoot = path.resolve(process.argv[2]);",
			"const report = await runSyncBlockMetadata(",
			"\t{",
			'\t\tblockJsonFile: "block.json",',
			'\t\tjsonSchemaFile: "schema.json",',
			'\t\tmanifestFile: "manifest.json",',
			'\t\topenApiFile: "openapi.json",',
			'\t\tphpValidatorFile: "validator.php",',
			"\t\tprojectRoot,",
			'\t\tsourceTypeName: "CounterAttributes",',
			'\t\ttypesFile: "types.ts",',
			"\t},",
			");",
			'if (report.status !== "success") {',
			"\tconst warningMessage = [",
			"\t\t...report.lossyProjectionWarnings,",
			"\t\t...report.phpGenerationWarnings,",
			'\t].join("; ");',
			'\tconst detail = report.failure?.message ?? (warningMessage || report.status);',
			'\tthrow new Error(`block-runtime smoke failed: ${detail}`);',
			"}",
			'for (const artifact of ["manifest.json", "schema.json", "openapi.json", "validator.php"]) {',
			"\tif (!fs.existsSync(path.join(projectRoot, artifact))) {",
			'\t\tthrow new Error(`Missing generated artifact: ${artifact}`);',
			"\t}",
			"}",
			"",
		].join("\n"),
		[blockRuntimeSmokeDir],
	);

	const projectToolsSmokeDir = path.join(projectDir, "project-tools-smoke");
	fs.mkdirSync(path.join(projectToolsSmokeDir, "scripts"), { recursive: true });
	fs.writeFileSync(
		path.join(projectToolsSmokeDir, "scripts", "block-config.ts"),
		[
			"export const BLOCKS = [",
			"\t{",
			'\t\tslug: "counter-card",',
			'\t\ttypesFile: "src/blocks/counter-card/types.ts",',
			"\t},",
			"];",
			"",
		].join("\n"),
		"utf8",
	);
	runScript(
		projectDir,
		"node",
		"project-tools-smoke.mjs",
		[
			'import { getWorkspaceBlockSelectOptions, getWorkspaceBlockSelectOptionsAsync } from "@wp-typia/project-tools";',
			'import path from "node:path";',
			"",
			"const projectRoot = path.resolve(process.argv[2]);",
			"const options = getWorkspaceBlockSelectOptions(projectRoot);",
			'if (options.length !== 1 || options[0]?.value !== "counter-card") {',
			'\tthrow new Error(`Unexpected workspace options: ${JSON.stringify(options)}`);',
			"}",
			"const asyncOptions = await getWorkspaceBlockSelectOptionsAsync(projectRoot);",
			"if (JSON.stringify(asyncOptions) !== JSON.stringify(options)) {",
			'\tthrow new Error(`Unexpected async workspace options: ${JSON.stringify(asyncOptions)}`);',
			"}",
			"",
		].join("\n"),
		[projectToolsSmokeDir],
	);

	const expectedRanges = {
		"@wp-typia/block-runtime": `^${packedManifests.get("@wp-typia/block-runtime").version}`,
		"@wp-typia/block-types": `^${packedManifests.get("@wp-typia/block-types").version}`,
	};
	const adminViewExpectedRanges = {
		"@wp-typia/dataviews": `^${packedManifests.get("@wp-typia/dataviews").version}`,
	};

	const basicDir = path.join(projectDir, "demo-basic");
	runWpTypiaCli(projectDir, cliPath, [
		"create",
		"demo-basic",
		"--template",
		"basic",
		"--package-manager",
		"npm",
		"--namespace",
		"smoke-space",
		"--text-domain",
		"smoke-space",
		"--yes",
		"--no-install",
	]);
	assertScaffoldDependencyRanges(basicDir, "devDependencies", {
		...expectedRanges,
		"@types/wordpress__blocks": "^12.5.18",
	});
	assertScaffoldDependencyRanges(basicDir, "dependencies", {
		"@wordpress/blocks": "~15.19.0",
	});
	assertFilesExist(basicDir, [
		"src/block-metadata.ts",
		"src/manifest-document.ts",
		"src/manifest-defaults-document.ts",
	]);
	installGeneratedProject(basicDir, tarballs);
	typecheckGeneratedProject(basicDir);

	const adminViewDir = path.join(projectDir, "demo-admin-view");
	runWpTypiaCli(projectDir, cliPath, [
		"create",
		"demo-admin-view",
		"--template",
		"workspace",
		"--package-manager",
		"npm",
		"--namespace",
		"smoke-space",
		"--text-domain",
		"smoke-space",
		"--yes",
		"--no-install",
	]);
	const adminViewPluginBootstrap = fs.readFileSync(
		path.join(adminViewDir, "demo-admin-view.php"),
		"utf8",
	);
	for (const expectedHeader of [
		"Requires at least: 6.7",
		"Tested up to:      7.0",
		"Requires PHP:      8.0",
	]) {
		if (!adminViewPluginBootstrap.includes(expectedHeader)) {
			throw new Error(
				`Generated workspace plugin header is missing ${JSON.stringify(expectedHeader)}.`,
			);
		}
	}
	runWpTypiaCli(projectDir, cliPath, ["add", "admin-view", "snapshots"], {
		cwd: adminViewDir,
	});
	assertScaffoldDependencyRanges(
		adminViewDir,
		"devDependencies",
		adminViewExpectedRanges,
	);
	const adminViewPackageJson = readJson(path.join(adminViewDir, "package.json"));
	if (typeof adminViewPackageJson.dependencies?.["@wordpress/dataviews"] !== "string") {
		throw new Error("Generated admin-view workspace is missing @wordpress/dataviews.");
	}
	assertFilesExist(adminViewDir, [
		"src/admin-views/snapshots/index.tsx",
		"src/admin-views/snapshots/Screen.tsx",
		"inc/admin-views/snapshots.php",
	]);
	installGeneratedProject(adminViewDir, tarballs);
	typecheckGeneratedProject(adminViewDir);

	const compoundDir = path.join(projectDir, "demo-compound");
	runWpTypiaCli(projectDir, cliPath, [
		"create",
		"demo-compound",
		"--template",
		"compound",
		"--package-manager",
		"npm",
		"--namespace",
		"smoke-space",
		"--text-domain",
		"smoke-space",
		"--yes",
		"--no-install",
	]);
	assertScaffoldDependencyRanges(compoundDir, "devDependencies", expectedRanges);
	installGeneratedProject(compoundDir, tarballs);
	run(npmCommand, ["exec", "--", "ttsx", "scripts/add-compound-child.ts", "--slug", "faq-item", "--title", "FAQ Item"], {
		cwd: compoundDir,
	});
	assertFilesExist(compoundDir, [
		"src/blocks/demo-compound/block-metadata.ts",
		"src/blocks/demo-compound/manifest-document.ts",
		"src/blocks/demo-compound/manifest-defaults-document.ts",
		"src/blocks/demo-compound-faq-item/block-metadata.ts",
		"src/blocks/demo-compound-faq-item/manifest-document.ts",
		"src/blocks/demo-compound-faq-item/manifest-defaults-document.ts",
	]);
	typecheckGeneratedProject(compoundDir);

	process.stdout.write(
		`Verified published-install smoke for wp-typia ${parsed.data.version}, a ${defaultCliInstallPackageCount}-package default CLI install without WordPress registration peers, portable CLI metadata, dataviews exports, runtime wrapper exports, block-runtime metadata sync, project-tools runtime paths, and generated basic/admin-view/compound scaffold installs.\n`,
	);
});

process.exit(0);
