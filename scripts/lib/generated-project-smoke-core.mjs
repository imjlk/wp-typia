import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "../..");
const entryPath = path.resolve(repoRoot, "packages/wp-typia/bin/wp-typia.js");

export const PACKAGE_MANAGERS = {
	bun: {
		packageManagerField: "bun@1.3.11",
	},
	npm: {
		packageManagerField: "npm@11.6.1",
	},
	pnpm: {
		packageManagerField: "pnpm@8.3.1",
	},
	yarn: {
		packageManagerField: "yarn@3.2.4",
	},
};

export function normalizeBlockSlug(input) {
	return input
		.trim()
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[^A-Za-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-")
		.toLowerCase();
}

export function run(command, args, options = {}) {
	return execFileSync(command, args, {
		stdio: "inherit",
		...options,
	});
}

export function cleanupTemporaryProjectRoot(tempRoot) {
	fs.rmSync(tempRoot, {
		force: true,
		maxRetries: 5,
		recursive: true,
		retryDelay: 100,
	});
}

export function getPackageManager(packageManager) {
	const manager = PACKAGE_MANAGERS[packageManager];
	if (!manager) {
		throw new Error(`Unknown package manager: ${packageManager}`);
	}

	return manager;
}

export function hasPhpBinary() {
	try {
		execFileSync("php", ["-v"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

export function getRunCommand(packageManager) {
	switch (packageManager) {
		case "bun":
			return ["bun", ["run", "build"]];
		case "npm":
			return ["npm", ["run", "build"]];
		case "pnpm":
			return ["corepack", ["pnpm", "run", "build"]];
		default:
			return ["corepack", ["yarn", "run", "build"]];
	}
}

export function getRunScriptCommand(packageManager, scriptName, extraArgs = []) {
	const scriptArgs = [
		scriptName,
		...(packageManager === "npm" && extraArgs.length > 0 ? ["--"] : []),
		...extraArgs,
	];

	switch (packageManager) {
		case "bun":
			return ["bun", ["run", ...scriptArgs]];
		case "npm":
			return ["npm", ["run", ...scriptArgs]];
		case "pnpm":
			return ["corepack", ["pnpm", "run", ...scriptArgs]];
		default:
			return ["corepack", ["yarn", "run", ...scriptArgs]];
	}
}

export function getInstallCommand(packageManager) {
	switch (packageManager) {
		case "bun":
			return ["bun", ["install"]];
		case "npm":
			return ["npm", ["install"]];
		case "pnpm":
			return ["corepack", ["pnpm", "install"]];
		default:
			return ["corepack", ["yarn", "install"]];
	}
}

export function runScaffoldRefreshScripts(projectDir, packageManager, packageJson) {
	const scriptNames =
		typeof packageJson.scripts?.sync === "string"
			? ["sync", "sync-wordpress-ai", "sync-typia-llm"]
			: ["sync-types", "sync-rest", "sync-wordpress-ai", "sync-typia-llm"];

	for (const scriptName of scriptNames) {
		if (typeof packageJson.scripts?.[scriptName] !== "string") {
			continue;
		}

		const [command, args] = getRunScriptCommand(packageManager, scriptName);
		run(command, args, { cwd: projectDir });
	}
}

export function runFreshScaffoldSyncCheck(projectDir, packageManager, packageJson) {
	if (typeof packageJson.scripts?.sync !== "string") {
		return;
	}

	const [command, args] = getRunScriptCommand(packageManager, "sync", ["--check"]);
	run(command, args, { cwd: projectDir });
}

export function runLocalMigrationDoctor(projectDir, runtime) {
	run(runtime, [entryPath, "migrate", "doctor", "--all"], {
		cwd: projectDir,
	});
}

export function refreshCurrentMigrationSnapshot(projectDir, runtime) {
	const configPath = path.join(projectDir, "src", "migrations", "config.ts");
	if (!fs.existsSync(configPath)) {
		return;
	}

	const configSource = fs.readFileSync(configPath, "utf8");
	const match = configSource.match(/currentMigrationVersion:\s*['"]([^'"]+)['"]/u);
	if (!match?.[1]) {
		throw new Error(
			`Expected ${configPath} to declare currentMigrationVersion in a supported format`,
		);
	}

	run(runtime, [entryPath, "migrate", "snapshot", "--migration-version", match[1]], {
		cwd: projectDir,
	});
}

export function runLocalDoctor(projectDir, runtime) {
	run(runtime, [entryPath, "doctor"], {
		cwd: projectDir,
	});
}

export function ensureCorepackPackageManager(packageManager) {
	if (packageManager !== "pnpm" && packageManager !== "yarn") {
		return;
	}

	run("corepack", ["prepare", getPackageManager(packageManager).packageManagerField, "--activate"]);
}

export function rewriteWorkspaceDependencies(projectDir, packageManager) {
	const packageJsonPath = path.join(projectDir, "package.json");
	const packageJsonSource = fs.readFileSync(packageJsonPath, "utf8");
	const packageJsonIndent = packageJsonSource.match(/\n([ \t]+)"/)?.[1] ?? "  ";
	const packageJson = JSON.parse(packageJsonSource);
	const localApiClientDependency = `file:${path.resolve(repoRoot, "packages/wp-typia-api-client")}`;
	const localBlockRuntimeDependency = `file:${path.resolve(repoRoot, "packages/wp-typia-block-runtime")}`;
	const localBlockTypesDependency = `file:${path.resolve(repoRoot, "packages/wp-typia-block-types")}`;
	const localLintPluginDependency = `file:${path.resolve(repoRoot, "packages/ttsc-lint-plugin-wp")}`;
	const localProjectToolsDependency = `file:${path.resolve(repoRoot, "packages/wp-typia-project-tools")}`;
	const localRestDependency = `file:${path.resolve(repoRoot, "packages/wp-typia-rest")}`;
	const localCliDependency = `file:${path.resolve(repoRoot, "packages/wp-typia")}`;

	packageJson.packageManager = getPackageManager(packageManager).packageManagerField;

	if (packageJson.devDependencies?.["@wp-typia/api-client"]) {
		packageJson.devDependencies["@wp-typia/api-client"] = localApiClientDependency;
	}
	if (packageJson.devDependencies?.["@wp-typia/block-runtime"]) {
		packageJson.devDependencies["@wp-typia/block-runtime"] = localBlockRuntimeDependency;
	}
	if (packageJson.dependencies?.["@wp-typia/api-client"]) {
		packageJson.dependencies["@wp-typia/api-client"] = localApiClientDependency;
	}
	if (packageJson.dependencies?.["@wp-typia/block-runtime"]) {
		packageJson.dependencies["@wp-typia/block-runtime"] = localBlockRuntimeDependency;
	}
	if (packageJson.devDependencies?.["@wp-typia/block-types"]) {
		packageJson.devDependencies["@wp-typia/block-types"] = localBlockTypesDependency;
	}
	if (packageJson.devDependencies?.["@wp-typia/ttsc-lint-plugin-wp"]) {
		packageJson.devDependencies["@wp-typia/ttsc-lint-plugin-wp"] =
			localLintPluginDependency;
	}
	if (packageJson.dependencies?.["@wp-typia/ttsc-lint-plugin-wp"]) {
		packageJson.dependencies["@wp-typia/ttsc-lint-plugin-wp"] =
			localLintPluginDependency;
	}
	if (packageJson.devDependencies?.["@wp-typia/rest"]) {
		packageJson.devDependencies["@wp-typia/rest"] = localRestDependency;
	}
	if (packageJson.dependencies?.["@wp-typia/block-types"]) {
		packageJson.dependencies["@wp-typia/block-types"] = localBlockTypesDependency;
	}
	if (packageJson.dependencies?.["@wp-typia/rest"]) {
		packageJson.dependencies["@wp-typia/rest"] = localRestDependency;
	}
	if (packageJson.devDependencies?.["wp-typia"]) {
		packageJson.devDependencies["wp-typia"] = localCliDependency;
	}
	if (packageJson.dependencies?.["wp-typia"]) {
		packageJson.dependencies["wp-typia"] = localCliDependency;
	}
	if (packageJson.devDependencies?.["@wp-typia/project-tools"]) {
		packageJson.devDependencies["@wp-typia/project-tools"] =
			localProjectToolsDependency;
	}
	if (packageJson.dependencies?.["@wp-typia/project-tools"]) {
		packageJson.dependencies["@wp-typia/project-tools"] =
			localProjectToolsDependency;
	}

	const linkedRuntimePackages = [
		"@wp-typia/block-runtime",
		"@wp-typia/rest",
		"wp-typia",
	];
	const hasProjectToolsDependency =
		packageJson.devDependencies?.["@wp-typia/project-tools"] ||
		packageJson.dependencies?.["@wp-typia/project-tools"];
	const hasApiClientDependency =
		packageJson.devDependencies?.["@wp-typia/api-client"] ||
		packageJson.dependencies?.["@wp-typia/api-client"];
	const shouldSeedProjectToolsInDevDependencies = linkedRuntimePackages.some(
		(packageName) => packageJson.devDependencies?.[packageName],
	);
	const shouldSeedProjectToolsInDependencies = linkedRuntimePackages.some(
		(packageName) => packageJson.dependencies?.[packageName],
	);
	const shouldSeedApiClientInDevDependencies = linkedRuntimePackages.some(
		(packageName) => packageJson.devDependencies?.[packageName],
	);
	const shouldSeedApiClientInDependencies = linkedRuntimePackages.some(
		(packageName) => packageJson.dependencies?.[packageName],
	);

	if (!hasApiClientDependency) {
		if (shouldSeedApiClientInDevDependencies) {
			packageJson.devDependencies = {
				...(packageJson.devDependencies ?? {}),
				"@wp-typia/api-client": localApiClientDependency,
			};
		} else if (shouldSeedApiClientInDependencies) {
			packageJson.dependencies = {
				...(packageJson.dependencies ?? {}),
				"@wp-typia/api-client": localApiClientDependency,
			};
		}
	}

	if (!hasProjectToolsDependency) {
		if (shouldSeedProjectToolsInDevDependencies) {
			packageJson.devDependencies = {
				...(packageJson.devDependencies ?? {}),
				"@wp-typia/project-tools": localProjectToolsDependency,
			};
		} else if (shouldSeedProjectToolsInDependencies) {
			packageJson.dependencies = {
				...(packageJson.dependencies ?? {}),
				"@wp-typia/project-tools": localProjectToolsDependency,
			};
		}
	}

	packageJson.overrides = {
		...(packageJson.overrides ?? {}),
		"@wp-typia/block-runtime": localBlockRuntimeDependency,
		"@wp-typia/api-client": localApiClientDependency,
		"@wp-typia/block-types": localBlockTypesDependency,
		"@wp-typia/ttsc-lint-plugin-wp": localLintPluginDependency,
		"@wp-typia/project-tools": localProjectToolsDependency,
		"@wp-typia/rest": localRestDependency,
		"wp-typia": localCliDependency,
	};
	packageJson.pnpm = {
		...(packageJson.pnpm ?? {}),
		overrides: {
			...(packageJson.pnpm?.overrides ?? {}),
			"@wp-typia/block-runtime": localBlockRuntimeDependency,
			"@wp-typia/api-client": localApiClientDependency,
			"@wp-typia/block-types": localBlockTypesDependency,
			"@wp-typia/ttsc-lint-plugin-wp": localLintPluginDependency,
			"@wp-typia/project-tools": localProjectToolsDependency,
			"@wp-typia/rest": localRestDependency,
			"wp-typia": localCliDependency,
		},
	};
	packageJson.resolutions = {
		...(packageJson.resolutions ?? {}),
		"@wp-typia/block-runtime": localBlockRuntimeDependency,
		"@wp-typia/api-client": localApiClientDependency,
		"@wp-typia/block-types": localBlockTypesDependency,
		"@wp-typia/ttsc-lint-plugin-wp": localLintPluginDependency,
		"@wp-typia/project-tools": localProjectToolsDependency,
		"@wp-typia/rest": localRestDependency,
		"wp-typia": localCliDependency,
	};

	fs.writeFileSync(
		packageJsonPath,
		`${JSON.stringify(packageJson, null, packageJsonIndent)}\n`,
		"utf8",
	);
}
