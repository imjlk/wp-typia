#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const repoRoot = path.resolve(__dirname, "..");

export const DEPENDENCY_FIELDS = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
];

export function getNpmCommand() {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function getTarCommand() {
	return process.platform === "win32" ? "tar.exe" : "tar";
}

export function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function resolvePackageDir(packageDir) {
	return path.isAbsolute(packageDir) ? packageDir : path.join(repoRoot, packageDir);
}

/** Packs a workspace and returns both the tarball path and npm pack metadata. */
export function packWorkspacePackageDetailed(packageDir, destinationDir) {
	const absolutePackageDir = resolvePackageDir(packageDir);
	const absoluteDestinationDir = path.resolve(destinationDir);
	fs.mkdirSync(absoluteDestinationDir, { recursive: true });

	const raw = execFileSync(
		getNpmCommand(),
		["pack", "--json", "--pack-destination", absoluteDestinationDir],
		{
			cwd: absolutePackageDir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		},
	).trim();
	const jsonStart = raw.startsWith("[") ? 0 : raw.lastIndexOf("\n[");
	const jsonSource = (jsonStart >= 0 ? raw.slice(jsonStart === 0 ? 0 : jsonStart + 1) : raw).trim();
	const parsed = JSON.parse(jsonSource);
	const metadata = Array.isArray(parsed) ? parsed[0] : null;
	const filename = metadata?.filename;

	if (typeof filename !== "string" || filename.length === 0) {
		throw new Error(`Unable to resolve packed tarball filename for ${absolutePackageDir}.`);
	}

	return {
		metadata,
		tarballPath: path.join(absoluteDestinationDir, filename),
	};
}

/** Packs a workspace and preserves the legacy tarball-path-only contract. */
export function packWorkspacePackage(packageDir, destinationDir) {
	return packWorkspacePackageDetailed(packageDir, destinationDir).tarballPath;
}

export function readPackedPackageManifest(tarballPath) {
	const manifestSource = execFileSync(
		getTarCommand(),
		["-xOf", tarballPath, "package/package.json"],
		{
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		},
	);

	return JSON.parse(manifestSource);
}

export function findWorkspaceProtocolLeaks(packageJson) {
	const leaks = [];

	for (const field of DEPENDENCY_FIELDS) {
		const section = packageJson[field];
		if (!section || typeof section !== "object") {
			continue;
		}

		for (const [name, spec] of Object.entries(section)) {
			if (typeof spec === "string" && spec.startsWith("workspace:")) {
				leaks.push(`${field}.${name}=${spec}`);
			}
		}
	}

	return leaks;
}

export function withTempDir(prefix, callback) {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	try {
		return callback(tempDir);
	} finally {
		fs.rmSync(tempDir, { force: true, recursive: true });
	}
}
