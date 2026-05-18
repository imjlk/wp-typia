import { promises as fsp } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

import {
	formatInstallCommand,
	getPackageManager,
	transformPackageManagerText,
} from "../shared/package-managers.js";
import type { PackageManagerId } from "../shared/package-managers.js";
import type { GeneratedPackageJson } from "../shared/package-json-types.js";
import { readOptionalUtf8File } from "../shared/fs-async.js";
import { safeJsonParse } from "../shared/json-utils.js";

const LOCKFILES: Record<PackageManagerId, string[]> = {
	bun: ["bun.lock", "bun.lockb"],
	npm: ["package-lock.json"],
	pnpm: ["pnpm-lock.yaml"],
	yarn: ["yarn.lock"],
};

/**
 * Normalizes scaffolded package-manager specific files for the selected toolchain.
 *
 * @param targetDir Absolute scaffold target directory.
 * @param packageManagerId Selected package manager id.
 * @returns A promise that resolves after any package-manager sidecar files are updated.
 */
export async function normalizePackageManagerFiles(
	targetDir: string,
	packageManagerId: PackageManagerId,
): Promise<void> {
	const yarnRcPath = path.join(targetDir, ".yarnrc.yml");

	if (packageManagerId === "yarn") {
		await fsp.writeFile(yarnRcPath, "nodeLinker: node-modules\n", "utf8");
		return;
	}

	await fsp.rm(yarnRcPath, { force: true });
}

/**
 * Rewrites the generated package.json for the selected package manager.
 *
 * @param targetDir Absolute scaffold target directory.
 * @param packageManagerId Selected package manager id.
 * @returns A promise that resolves after the package.json file is normalized.
 */
export async function normalizePackageJson(
	targetDir: string,
	packageManagerId: PackageManagerId,
): Promise<void> {
	const packageJsonPath = path.join(targetDir, "package.json");
	const packageJsonSource = await readOptionalUtf8File(packageJsonPath);
	if (packageJsonSource === null) {
		return;
	}

	const packageManager = getPackageManager(packageManagerId);
	const packageJson = safeJsonParse<GeneratedPackageJson>(packageJsonSource, {
		context: "generated package manifest",
		filePath: packageJsonPath,
	});
	if (packageManagerId === "npm") {
		delete packageJson.packageManager;
	} else {
		packageJson.packageManager = packageManager.packageManagerField;
	}

	if (packageJson.scripts) {
		for (const [key, value] of Object.entries(packageJson.scripts)) {
			if (typeof value === "string") {
				packageJson.scripts[key] = transformPackageManagerText(value, packageManagerId);
			}
		}
	}

	await fsp.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, "\t")}\n`, "utf8");
}

/**
 * Removes lockfiles that do not match the selected package manager.
 *
 * @param targetDir Absolute scaffold target directory.
 * @param packageManagerId Selected package manager id.
 * @returns A promise that resolves after stale lockfiles are removed.
 */
export async function removeUnexpectedLockfiles(
	targetDir: string,
	packageManagerId: PackageManagerId,
): Promise<void> {
	const keep = new Set(LOCKFILES[packageManagerId] ?? []);
	const allLockfiles = Object.values(LOCKFILES).flat();

	await Promise.all(
		allLockfiles.map(async (filename) => {
			if (keep.has(filename)) {
				return;
			}

			await fsp.rm(path.join(targetDir, filename), { force: true });
		}),
	);
}

/**
 * Installs scaffolded project dependencies with the selected package manager.
 *
 * @param options Absolute target directory and selected package manager id.
 * @returns A promise that resolves after the install command completes.
 */
export async function defaultInstallDependencies({
	projectDir,
	packageManager,
}: {
	projectDir: string;
	packageManager: PackageManagerId;
}): Promise<void> {
	execSync(formatInstallCommand(packageManager), {
		cwd: projectDir,
		stdio: "inherit",
	});
}
