import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PACKAGE_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

function getPublishRuntimeMapPaths(packageRoot) {
	const backupRoot = path.join(packageRoot, ".pack-backup", "runtime-maps");

	return {
		backupRoot,
		distRoot: path.join(packageRoot, "dist"),
		manifestPath: path.join(backupRoot, "manifest.json"),
	};
}

function collectSourceMapRelativePaths(rootDir, currentDir = rootDir) {
	if (!fs.existsSync(currentDir)) {
		return [];
	}

	const relativePaths = [];
	for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
		const absolutePath = path.join(currentDir, entry.name);
		if (entry.isDirectory()) {
			relativePaths.push(...collectSourceMapRelativePaths(rootDir, absolutePath));
			continue;
		}
		if (!entry.name.endsWith(".map")) {
			continue;
		}

		relativePaths.push(path.relative(rootDir, absolutePath));
	}

	return relativePaths.sort((left, right) => left.localeCompare(right));
}

export function preparePublishedRuntimeMaps(packageRoot = DEFAULT_PACKAGE_ROOT) {
	const { backupRoot, distRoot, manifestPath } = getPublishRuntimeMapPaths(packageRoot);
	if (!fs.existsSync(distRoot) || !fs.statSync(distRoot).isDirectory()) {
		throw new Error(`Cannot prepare runtime source maps: missing ${distRoot}`);
	}

	const relativePaths = collectSourceMapRelativePaths(distRoot);
	if (relativePaths.length === 0) {
		return;
	}

	fs.rmSync(backupRoot, { force: true, recursive: true });
	for (const relativePath of relativePaths) {
		const sourcePath = path.join(distRoot, relativePath);
		const backupPath = path.join(backupRoot, relativePath);
		fs.mkdirSync(path.dirname(backupPath), { recursive: true });
		fs.renameSync(sourcePath, backupPath);
	}

	fs.writeFileSync(
		manifestPath,
		`${JSON.stringify({ files: relativePaths }, null, 2)}\n`,
		"utf8",
	);
}

export function restorePublishedRuntimeMaps(packageRoot = DEFAULT_PACKAGE_ROOT) {
	if (process.env.WP_TYPIA_SKIP_POSTPACK_RESTORE === "1") {
		return;
	}

	const { backupRoot, distRoot, manifestPath } = getPublishRuntimeMapPaths(packageRoot);
	if (!fs.existsSync(manifestPath)) {
		return;
	}

	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	const relativePaths = Array.isArray(manifest.files)
		? manifest.files.filter((value) => typeof value === "string")
		: [];

	for (const relativePath of relativePaths) {
		const backupPath = path.join(backupRoot, relativePath);
		const destinationPath = path.join(distRoot, relativePath);
		if (!fs.existsSync(backupPath)) {
			if (fs.existsSync(destinationPath)) {
				continue;
			}
			throw new Error(`Missing runtime source map backup: ${relativePath}`);
		}

		fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
		fs.renameSync(backupPath, destinationPath);
	}

	fs.rmSync(backupRoot, { force: true, recursive: true });
}

export function runPublishRuntimeMapsCli({
	argv = process.argv,
	packageRoot = DEFAULT_PACKAGE_ROOT,
} = {}) {
	const mode = argv[2];

	if (mode === "prepare") {
		preparePublishedRuntimeMaps(packageRoot);
		return 0;
	}

	if (mode === "restore") {
		restorePublishedRuntimeMaps(packageRoot);
		return 0;
	}

	throw new Error(`Unknown publish-runtime-maps mode: ${mode ?? "(missing)"}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exitCode = runPublishRuntimeMapsCli();
}
