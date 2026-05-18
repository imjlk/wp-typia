import { promises as fsp } from "node:fs";
import path from "node:path";

import { formatNonEmptyTargetDirectoryError } from "./scaffold-bootstrap.js";
import { pathExists } from "../shared/fs-async.js";
import { readJsonFile } from "../shared/json-utils.js";

/**
 * List every file emitted under a scaffold project using POSIX-style paths.
 *
 * @param rootDir Root project directory to scan recursively.
 * @returns Sorted relative file paths suitable for dry-run preview output.
 */
export async function listRelativeProjectFiles(
	rootDir: string,
): Promise<string[]> {
	const relativeFiles: string[] = [];

	async function visit(currentDir: string): Promise<void> {
		const entries = await fsp.readdir(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const absolutePath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await visit(absolutePath);
				continue;
			}

			relativeFiles.push(
				path
					.relative(rootDir, absolutePath)
					.replace(path.sep === "\\" ? /\\/gu : /\//gu, "/"),
			);
		}
	}

	await visit(rootDir);
	return relativeFiles.sort((left, right) => left.localeCompare(right));
}

/**
 * Ensure a dry-run target would be legal before rendering into a temp preview.
 *
 * @param projectDir Real target project directory requested by the user.
 * @param allowExistingDir Whether existing target directories are allowed.
 * @throws Error when the target exists, is non-empty, and is not allowed.
 */
export async function assertDryRunTargetDirectoryReady(
	projectDir: string,
	allowExistingDir: boolean,
): Promise<void> {
	if (!(await pathExists(projectDir)) || allowExistingDir) {
		return;
	}

	const entries = await fsp.readdir(projectDir);
	if (entries.length > 0) {
		throw new Error(formatNonEmptyTargetDirectoryError(projectDir));
	}
}

/**
 * Read script names from the package manifest emitted by a scaffold run.
 *
 * @param projectDir Generated project directory containing package.json.
 * @returns Script names, or undefined when the manifest is absent or invalid.
 */
export async function readGeneratedPackageScripts(
	projectDir: string,
): Promise<string[] | undefined> {
	try {
		const parsedPackageJson = await readJsonFile<{
			scripts?: unknown;
		}>(path.join(projectDir, "package.json"), {
			context: "generated package manifest",
		});
		const scripts =
			parsedPackageJson.scripts &&
			typeof parsedPackageJson.scripts === "object" &&
			!Array.isArray(parsedPackageJson.scripts)
				? parsedPackageJson.scripts
				: {};
		return Object.entries(scripts)
			.filter(([, value]) => typeof value === "string")
			.map(([scriptName]) => scriptName);
	} catch {
		return undefined;
	}
}
