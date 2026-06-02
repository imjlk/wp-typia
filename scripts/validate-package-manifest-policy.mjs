#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findPublishablePackages } from "./lib/sampo-changesets.mjs";
import {
	RUNTIME_PACKAGE_NAMES,
	RUNTIME_PACKAGE_COUPLINGS,
	WORKSPACE_PROTOCOL_POLICY_EXCEPTIONS,
	renderPolicySpec,
} from "./lib/runtime-package-policy.mjs";
import { DEPENDENCY_FIELDS, readJson } from "./publish-package-utils.mjs";

export const ENGINE_BASELINE = Object.freeze({
	bun: ">=1.3.11",
	node: ">=20.0.0",
	npm: ">=10.0.0",
});
export const PACKAGE_MANAGER_BASELINE = "bun@1.3.11";
export const UNUSED_DEV_DEPENDENCIES = Object.freeze({
	"@wp-typia/project-tools": ["react-devtools-core", "ws"],
});
export const BLOCK_TYPES_REGISTRATION_PEER_BASELINE = Object.freeze({
	"@types/wordpress__blocks": "^12.5.18",
	"@wordpress/blocks": "^15.2.0",
});
const REMOVED_CLI_RUNTIME_CONFIG_FILES = Object.freeze([
	"bunli.config.cjs",
	"bunli.config.js",
	"bunli.config.mjs",
	"bunli.config.ts",
	"opentui.config.cjs",
	"opentui.config.js",
	"opentui.config.mjs",
	"opentui.config.ts",
]);
const SHARED_PUBLISH_MANIFEST_HELPER_PATTERN = /runPublishManifestCli\s*\(/;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");

function listMonorepoManifests(repoRoot) {
	const manifestPaths = [path.join(repoRoot, "package.json")];
	const packagesRoot = path.join(repoRoot, "packages");

	for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}

		const manifestPath = path.join(packagesRoot, entry.name, "package.json");
		if (fs.existsSync(manifestPath)) {
			manifestPaths.push(manifestPath);
		}
	}

	return manifestPaths.sort();
}

function toRelativePath(repoRoot, targetPath) {
	return path.relative(repoRoot, targetPath).split(path.sep).join("/");
}

function getRuntimePackageInfo(repoRoot) {
	const packages = findPublishablePackages(repoRoot);
	return new Map(
		packages
			.filter((packageInfo) => RUNTIME_PACKAGE_NAMES.includes(packageInfo.packageName))
			.map((packageInfo) => [
				packageInfo.packageName,
				{
					...packageInfo,
					manifest: readJson(packageInfo.packageJsonPath),
				},
			]),
	);
}

function validateEngineBaseline(repoRoot, manifestPaths, errors) {
	for (const manifestPath of manifestPaths) {
		const manifest = readJson(manifestPath);
		const relativePath = toRelativePath(repoRoot, manifestPath);

		for (const [field, expectedValue] of Object.entries(ENGINE_BASELINE)) {
			const actualValue = manifest.engines?.[field];
			if (actualValue !== expectedValue) {
					errors.push(
						`${relativePath} must declare engines.${field}="${expectedValue}", found ${JSON.stringify(actualValue ?? null)}.`,
					);
			}
		}

		if (
			typeof manifest.packageManager === "string" &&
			manifest.packageManager !== PACKAGE_MANAGER_BASELINE
		) {
				errors.push(
					`${relativePath} must declare packageManager="${PACKAGE_MANAGER_BASELINE}" when the field is present, found ${JSON.stringify(manifest.packageManager)}.`,
				);
		}
	}
}

function validateUnusedDevDependencyPolicy(runtimePackages, errors) {
	for (const [packageName, dependencyNames] of Object.entries(UNUSED_DEV_DEPENDENCIES)) {
		const packageInfo = runtimePackages.get(packageName);
		if (!packageInfo) {
			continue;
		}

		for (const dependencyName of dependencyNames) {
			if (typeof packageInfo.manifest.devDependencies?.[dependencyName] === "string") {
				errors.push(
					`${packageInfo.packageName} should not keep unused devDependencies.${dependencyName}.`,
				);
			}
		}
	}
}

function validateBlockTypesRegistrationPeerPolicy(repoRoot, runtimePackages, errors) {
	const packageInfo = runtimePackages.get("@wp-typia/block-types");
	if (!packageInfo) {
		return;
	}

	const relativePath = toRelativePath(repoRoot, packageInfo.packageJsonPath);

	for (const [dependencyName, expectedSpec] of Object.entries(
		BLOCK_TYPES_REGISTRATION_PEER_BASELINE,
	)) {
		const actualSpec = packageInfo.manifest.peerDependencies?.[dependencyName];
		if (actualSpec !== expectedSpec) {
			errors.push(
				`${relativePath} must declare peerDependencies.${dependencyName}=${JSON.stringify(expectedSpec)} to match the owned block registration facade baseline, found ${JSON.stringify(actualSpec ?? null)}.`,
			);
		}
	}
}

function isRemovedCliRuntimeDependency(dependencyName) {
	return (
		dependencyName === "bunli" ||
		dependencyName.startsWith("@bunli/") ||
		dependencyName.startsWith("@opentui/")
	);
}

function validateRemovedCliRuntimePolicy(repoRoot, errors) {
	for (const packageInfo of findPublishablePackages(repoRoot)) {
		const packageRoot = path.join(repoRoot, packageInfo.packageDir);

		for (const configFileName of REMOVED_CLI_RUNTIME_CONFIG_FILES) {
			const configPath = path.join(packageRoot, configFileName);
			if (fs.existsSync(configPath)) {
				errors.push(
					`${toRelativePath(repoRoot, configPath)} should not exist; publishable packages must not keep Bunli/OpenTUI runtime config files.`,
				);
			}
		}

		const manifest = readJson(packageInfo.packageJsonPath);
		const relativeManifestPath = toRelativePath(repoRoot, packageInfo.packageJsonPath);

		for (const field of DEPENDENCY_FIELDS) {
			const section = manifest[field];
			if (!section || typeof section !== "object") {
				continue;
			}

			for (const dependencyName of Object.keys(section)) {
				if (!isRemovedCliRuntimeDependency(dependencyName)) {
					continue;
				}

				errors.push(
					`${relativeManifestPath} must not declare ${field}.${dependencyName}; Bunli/OpenTUI runtime packages were removed from publishable packages.`,
				);
			}
		}
	}
}

function validateRuntimeDependencyPolicy(repoRoot, runtimePackages, errors) {
	const exceptionSet = new Set(
		WORKSPACE_PROTOCOL_POLICY_EXCEPTIONS.map(
			({ dependencyName, dependentName }) => `${dependentName}->${dependencyName}`,
		),
	);

	for (const { dependencyName, dependentName, rangePolicy } of RUNTIME_PACKAGE_COUPLINGS) {
		const dependencyInfo = runtimePackages.get(dependencyName);
		const dependentInfo = runtimePackages.get(dependentName);
		if (!dependencyInfo || !dependentInfo) {
			continue;
		}

		const spec = dependentInfo.manifest.dependencies?.[dependencyName];
		const key = `${dependentName}->${dependencyName}`;
		const relativePath = toRelativePath(repoRoot, dependentInfo.packageJsonPath);

		if (exceptionSet.has(key)) {
			if (spec !== "workspace:*") {
					errors.push(
						`${relativePath} must use dependencies.${dependencyName}="workspace:*" for the sanctioned local-development exception, found ${JSON.stringify(spec ?? null)}.`,
					);
			}

			const prepack = dependentInfo.manifest.scripts?.prepack;
			const postpack = dependentInfo.manifest.scripts?.postpack;
			const publishManifestPath = path.join(
				repoRoot,
				dependentInfo.packageDir,
				"scripts",
				"publish-manifest.mjs",
			);
			const publishManifestSource = fs.existsSync(publishManifestPath)
				? fs.readFileSync(publishManifestPath, "utf8")
				: null;

			if (prepack !== "bun run build && node ./scripts/publish-manifest.mjs prepare") {
				errors.push(
					`${relativePath} must rewrite workspace protocol dependencies during prepack.`,
				);
			}
			if (postpack !== "node ./scripts/publish-manifest.mjs restore") {
				errors.push(
					`${relativePath} must restore its source manifest during postpack.`,
				);
			}
			if (publishManifestSource == null) {
				errors.push(
					`${relativePath} depends on workspace protocol rewriting but is missing scripts/publish-manifest.mjs.`,
				);
			} else if (!SHARED_PUBLISH_MANIFEST_HELPER_PATTERN.test(publishManifestSource)) {
				errors.push(
					`${relativePath} depends on workspace protocol rewriting but scripts/publish-manifest.mjs does not delegate to the shared publish-manifest helper.`,
				);
			}

			continue;
		}

		const expectedSpec = renderPolicySpec(rangePolicy, dependencyInfo.version);
		if (spec !== expectedSpec) {
			errors.push(
				`${relativePath} must use dependencies.${dependencyName}=${JSON.stringify(expectedSpec)} to match the ${rangePolicy} runtime package policy, found ${JSON.stringify(spec ?? null)}.`,
			);
		}
	}

	for (const packageInfo of runtimePackages.values()) {
		for (const field of DEPENDENCY_FIELDS) {
			const section = packageInfo.manifest[field];
			if (!section || typeof section !== "object") {
				continue;
			}

			for (const [dependencyName, spec] of Object.entries(section)) {
				if (typeof spec !== "string" || !spec.startsWith("workspace:")) {
					continue;
				}

				if (!runtimePackages.has(dependencyName)) {
					continue;
				}

				const key = `${packageInfo.packageName}->${dependencyName}`;
				if (!exceptionSet.has(key) || field !== "dependencies") {
					errors.push(
						`${toRelativePath(repoRoot, packageInfo.packageJsonPath)} contains unsupported ${field}.${dependencyName}=${JSON.stringify(spec)}.`,
					);
				}
			}
		}
	}
}

export function validatePackageManifestPolicy(repoRoot = DEFAULT_REPO_ROOT) {
	const errors = [];
	const manifestPaths = listMonorepoManifests(repoRoot);
	const runtimePackages = getRuntimePackageInfo(repoRoot);

	validateEngineBaseline(repoRoot, manifestPaths, errors);
	validateRuntimeDependencyPolicy(repoRoot, runtimePackages, errors);
	validateUnusedDevDependencyPolicy(runtimePackages, errors);
	validateBlockTypesRegistrationPeerPolicy(repoRoot, runtimePackages, errors);
	validateRemovedCliRuntimePolicy(repoRoot, errors);

	return {
		errors,
		valid: errors.length === 0,
	};
}

export function runCli({
	cwd = process.cwd(),
	stdout = process.stdout,
	stderr = process.stderr,
} = {}) {
	const result = validatePackageManifestPolicy(cwd);

	if (!result.valid) {
		stderr.write("Invalid package manifest policy detected:\n");
		for (const error of result.errors) {
			stderr.write(`- ${error}\n`);
		}
		return 1;
	}

	stdout.write("Validated package manifest policy.\n");
	return 0;
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (invokedPath === currentFilePath) {
	process.exitCode = runCli();
}
