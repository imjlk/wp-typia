import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EXCLUDED_DIRECTORIES = new Set([".git", "node_modules", "vendor"]);
const PHP_MAJOR_MINOR_PATTERN = /^\d+\.\d+$/u;
const PHP_VERSION_ARGS = [
	"-r",
	'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;',
];

function compareStrings(left, right) {
	if (left < right) {
		return -1;
	}
	if (left > right) {
		return 1;
	}
	return 0;
}

function defaultExecutePhp(args, options) {
	return execFileSync("php", args, options);
}

function formatProcessError(error) {
	if (typeof error?.stderr === "string" && error.stderr.trim().length > 0) {
		return error.stderr.trim();
	}
	if (typeof error?.stdout === "string" && error.stdout.trim().length > 0) {
		return error.stdout.trim();
	}
	return error instanceof Error ? error.message : String(error);
}

export function assertPhpMajorMinorVersion(phpVersion) {
	if (
		typeof phpVersion !== "string" ||
		!PHP_MAJOR_MINOR_PATTERN.test(phpVersion)
	) {
		throw new Error(
			`--php-version must be a PHP major.minor value such as 8.0, received ${JSON.stringify(phpVersion)}.`,
		);
	}

	return phpVersion;
}

export function collectGeneratedProjectPhpFiles(projectDir) {
	const projectRoot = path.resolve(projectDir);
	const phpFiles = [];

	function visitDirectory(directoryPath) {
		const entries = fs
			.readdirSync(directoryPath, { withFileTypes: true })
			.sort((left, right) => compareStrings(left.name, right.name));

		for (const entry of entries) {
			if (entry.isSymbolicLink()) {
				continue;
			}

			const entryPath = path.join(directoryPath, entry.name);
			if (entry.isDirectory()) {
				if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
					visitDirectory(entryPath);
				}
				continue;
			}

			if (entry.isFile() && entry.name.endsWith(".php")) {
				phpFiles.push(entryPath);
			}
		}
	}

	visitDirectory(projectRoot);
	return phpFiles.sort(compareStrings);
}

export function lintGeneratedProjectPhp(
	projectDir,
	requiredPhpVersion,
	{ executePhp = defaultExecutePhp } = {},
) {
	if (requiredPhpVersion === undefined) {
		return [];
	}

	const expectedVersion = assertPhpMajorMinorVersion(requiredPhpVersion);
	const executeOptions = {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	};

	let actualVersion;
	try {
		actualVersion = String(
			executePhp(PHP_VERSION_ARGS, executeOptions),
		).trim();
	} catch (error) {
		throw new Error(
			`Generated project PHP syntax lint requires PHP ${expectedVersion}, but the php executable is unavailable or failed to start: ${formatProcessError(error)}`,
			{ cause: error },
		);
	}

	if (!PHP_MAJOR_MINOR_PATTERN.test(actualVersion)) {
		throw new Error(
			`Generated project PHP syntax lint expected php to report a major.minor version, received ${JSON.stringify(actualVersion)}.`,
		);
	}
	if (actualVersion !== expectedVersion) {
		throw new Error(
			`Generated project PHP syntax lint requires PHP ${expectedVersion}, but php resolved to ${actualVersion}.`,
		);
	}

	const phpFiles = collectGeneratedProjectPhpFiles(projectDir);
	for (const filePath of phpFiles) {
		try {
			executePhp(["-l", filePath], executeOptions);
		} catch (error) {
			throw new Error(
				`PHP ${expectedVersion} syntax lint failed for ${filePath}:\n${formatProcessError(error)}`,
				{ cause: error },
			);
		}
	}

	return phpFiles;
}
