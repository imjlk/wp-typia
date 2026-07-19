import fs from "node:fs";
import path from "node:path";

import {
	CLI_DIAGNOSTIC_CODES,
	createCliDiagnosticCodeError,
} from "./cli-diagnostics.js";
import {
	getPackageManager,
	transformPackageManagerText,
	type PackageManagerId,
} from "../shared/package-managers.js";
import {
	DEFAULT_WORDPRESS_BLOCKS_VERSION,
	getPackageVersions,
} from "../shared/package-versions.js";
import { readJsonFileSync } from "../shared/json-utils.js";
import type {
	InitDependencyChange,
	InitPackageManagerFieldChange,
	InitScriptChange,
	ProjectPackageJson,
	RetrofitInitPlan,
} from "./cli-init-types.js";
import { parseWorkspacePackageManagerId } from "../workspace/workspace-project.js";

const BASE_RETROFIT_SCRIPTS = {
	sync: "tsx scripts/sync-project.ts",
	"sync-types": "tsx scripts/sync-types-to-block-json.ts",
	typecheck: "bun run sync --check && tsc --noEmit",
} as const;

const BASE_RETROFIT_DEV_DEPENDENCIES = [
	"@typia/unplugin",
	"@wordpress/blocks",
	"@wp-typia/block-runtime",
	"@wp-typia/block-types",
	"tsx",
	"typescript",
	"typia",
] as const;

export function readProjectPackageJson(
	projectDir: string,
): ProjectPackageJson | null {
	const packageJsonPath = path.join(projectDir, "package.json");
	if (!fs.existsSync(packageJsonPath)) {
		return null;
	}

	try {
		return readJsonFileSync<ProjectPackageJson>(packageJsonPath, {
			context: "project package manifest",
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw createCliDiagnosticCodeError(
			CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
			`Unable to parse ${packageJsonPath}: ${message}`,
			error instanceof Error ? { cause: error } : undefined,
		);
	}
}

function inferInitPackageManager(
	projectDir: string,
	packageJson: ProjectPackageJson | null,
): PackageManagerId {
	if (packageJson?.packageManager) {
		return parseWorkspacePackageManagerId(packageJson.packageManager);
	}

	if (
		fs.existsSync(path.join(projectDir, "bun.lock")) ||
		fs.existsSync(path.join(projectDir, "bun.lockb"))
	) {
		return "bun";
	}
	if (fs.existsSync(path.join(projectDir, "pnpm-lock.yaml"))) {
		return "pnpm";
	}
	if (
		fs.existsSync(path.join(projectDir, "yarn.lock")) ||
		fs.existsSync(path.join(projectDir, ".yarnrc.yml"))
	) {
		return "yarn";
	}

	return "npm";
}

export function resolveInitPackageManager(
	projectDir: string,
	packageJson: ProjectPackageJson | null,
	override?: string,
): PackageManagerId {
	if (!override) {
		return inferInitPackageManager(projectDir, packageJson);
	}

	if (
		override !== "bun" &&
		override !== "npm" &&
		override !== "pnpm" &&
		override !== "yarn"
	) {
		throw createCliDiagnosticCodeError(
			CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
			`Unknown package manager "${override}". Expected one of: bun, npm, pnpm, yarn.`,
		);
	}

	return override;
}

export function getWpTypiaCliSpecifier(): string {
	const versions = getPackageVersions();
	return versions.wpTypiaPackageExactVersion === "0.0.0"
		? "wp-typia"
		: `wp-typia@${versions.wpTypiaPackageExactVersion}`;
}

function buildRequiredDevDependencyMap(): Record<string, string> {
	const versions = getPackageVersions();
	return {
		"@typia/unplugin": versions.typiaUnpluginPackageVersion,
		"@wordpress/blocks": DEFAULT_WORDPRESS_BLOCKS_VERSION,
		"@wp-typia/block-runtime": versions.blockRuntimePackageVersion,
		"@wp-typia/block-types": versions.blockTypesPackageVersion,
		tsx: versions.tsxPackageVersion,
		typescript: versions.typescriptPackageVersion,
		typia: versions.typiaPackageVersion,
	};
}

function getExistingDependencyVersion(
	packageJson: ProjectPackageJson | null,
	name: string,
): string | undefined {
	return packageJson?.devDependencies?.[name] ?? packageJson?.dependencies?.[name];
}

export function buildDependencyChanges(
	packageJson: ProjectPackageJson | null,
): InitDependencyChange[] {
	const requiredDependencies = buildRequiredDevDependencyMap();
	return BASE_RETROFIT_DEV_DEPENDENCIES.flatMap((name) => {
		const requiredValue = requiredDependencies[name];
		const currentValue = getExistingDependencyVersion(packageJson, name);

		if (currentValue === requiredValue) {
			return [];
		}

		return [
			{
				action: currentValue ? "update" : "add",
				...(currentValue ? { currentValue } : {}),
				name,
				requiredValue,
			} satisfies InitDependencyChange,
		];
	});
}

export function buildScriptChanges(
	packageJson: ProjectPackageJson | null,
	packageManager: PackageManagerId,
): InitScriptChange[] {
	const scripts = packageJson?.scripts ?? {};

	return Object.entries(BASE_RETROFIT_SCRIPTS).flatMap(
		([name, commandSource]) => {
			const requiredValue = transformPackageManagerText(
				commandSource,
				packageManager,
			);
			const currentValue = scripts[name];
			if (currentValue === requiredValue) {
				return [];
			}

			return [
				{
					action: typeof currentValue === "string" ? "update" : "add",
					...(typeof currentValue === "string" ? { currentValue } : {}),
					name,
					requiredValue,
				} satisfies InitScriptChange,
			];
		},
	);
}

export function buildPackageManagerFieldChange(
	packageJson: ProjectPackageJson | null,
	packageManager: PackageManagerId,
	options: {
		persistExplicitOverride?: boolean;
	} = {},
): InitPackageManagerFieldChange | undefined {
	if (!options.persistExplicitOverride && packageManager === "npm") {
		return undefined;
	}

	const requiredValue = getPackageManager(packageManager).packageManagerField;
	const currentValue = packageJson?.packageManager;
	if (currentValue === requiredValue) {
		return undefined;
	}

	return {
		action: typeof currentValue === "string" ? "update" : "add",
		...(typeof currentValue === "string" ? { currentValue } : {}),
		requiredValue,
	};
}

export function hasExistingWpTypiaProjectSurface(
	projectDir: string,
	packageJson: ProjectPackageJson | null,
): boolean {
	const scripts = packageJson?.scripts ?? {};
	const hasSyncSurface =
		typeof scripts.sync === "string" || typeof scripts["sync-types"] === "string";
	const hasHelperFiles = [
		path.join("scripts", "block-config.ts"),
		path.join("scripts", "sync-project.ts"),
		path.join("scripts", "sync-types-to-block-json.ts"),
	].every((relativePath) => fs.existsSync(path.join(projectDir, relativePath)));
	const hasRuntimeDeps =
		typeof getExistingDependencyVersion(packageJson, "@wp-typia/block-runtime") ===
			"string" &&
		typeof getExistingDependencyVersion(packageJson, "@wp-typia/block-types") ===
			"string";

	return hasSyncSurface && hasHelperFiles && hasRuntimeDeps;
}

export function buildRequiredDevDependencyMapEntries(): string[] {
	return Object.entries(buildRequiredDevDependencyMap()).map(
		([name, version]) => `${name}@${version.replace(/^workspace:/u, "")}`,
	);
}

function setDependencyVersion(
	packageJson: ProjectPackageJson,
	name: string,
	requiredValue: string,
): void {
	if (packageJson.devDependencies?.[name] !== undefined) {
		packageJson.devDependencies[name] = requiredValue;
		return;
	}
	if (packageJson.dependencies?.[name] !== undefined) {
		packageJson.dependencies[name] = requiredValue;
		return;
	}

	packageJson.devDependencies ??= {};
	packageJson.devDependencies[name] = requiredValue;
}

export function buildNextProjectPackageJson(options: {
	packageChanges: RetrofitInitPlan["packageChanges"];
	packageJson: ProjectPackageJson | null;
	packageManager: PackageManagerId;
	projectName: string;
}): ProjectPackageJson {
	const nextPackageJson: ProjectPackageJson = options.packageJson
		? JSON.parse(JSON.stringify(options.packageJson))
		: {
				name: options.projectName,
				private: true,
		  };

	nextPackageJson.devDependencies ??= {};
	nextPackageJson.scripts ??= {};

	for (const dependencyChange of options.packageChanges.addDevDependencies) {
		setDependencyVersion(
			nextPackageJson,
			dependencyChange.name,
			dependencyChange.requiredValue,
		);
	}

	if (options.packageChanges.packageManagerField) {
		nextPackageJson.packageManager =
			options.packageChanges.packageManagerField.requiredValue;
	} else if (
		!nextPackageJson.packageManager &&
		options.packageManager !== "npm"
	) {
		nextPackageJson.packageManager =
			getPackageManager(options.packageManager).packageManagerField;
	}

	for (const scriptChange of options.packageChanges.scripts) {
		nextPackageJson.scripts[scriptChange.name] = scriptChange.requiredValue;
	}

	return nextPackageJson;
}

export function buildProjectPackageJsonSource(
	packageJson: ProjectPackageJson,
): string {
	return `${JSON.stringify(packageJson, null, 2)}\n`;
}
