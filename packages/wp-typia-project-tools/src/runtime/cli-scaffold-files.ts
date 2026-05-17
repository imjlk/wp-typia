import { promises as fsp } from "node:fs";
import path from "node:path";

import { formatNonEmptyTargetDirectoryError } from "./scaffold-bootstrap.js";
import { pathExists } from "./fs-async.js";
import { readJsonFile } from "./json-utils.js";

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
