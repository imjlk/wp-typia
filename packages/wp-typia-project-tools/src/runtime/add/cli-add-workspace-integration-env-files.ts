import { promises as fsp } from "node:fs";
import path from "node:path";

import { readOptionalUtf8File } from "../shared/fs-async.js";

/**
 * Append only missing lines to an existing text file, preserving any existing
 * user-managed content.
 *
 * @param filePath Absolute file path to append.
 * @param lines Lines that should be present in the file.
 * @returns A promise that resolves after the file is created or updated.
 */
export async function appendMissingLines(
	filePath: string,
	lines: readonly string[],
): Promise<void> {
	const current = (await readOptionalUtf8File(filePath)) ?? "";
	const existingLines = new Set(current.split(/\r?\n/u));
	const missingLines = lines.filter((line) => !existingLines.has(line));
	if (missingLines.length === 0) {
		return;
	}

	const separator = current.length === 0 || current.endsWith("\n") ? "" : "\n";
	await fsp.mkdir(path.dirname(filePath), { recursive: true });
	await fsp.writeFile(
		filePath,
		`${current}${separator}${missingLines.join("\n")}\n`,
		"utf8",
	);
}

/**
 * Write a generated file only when it is absent, recording a preservation
 * warning when the target already exists.
 *
 * @param options File write options.
 * @param options.filePath Absolute target file path.
 * @param options.source Generated source to write when absent.
 * @param options.warnings Mutable warning collection for preserved files.
 * @returns A promise that resolves after the file is written or preserved.
 */
export async function writeFileIfAbsent({
	filePath,
	source,
	warnings,
}: {
	filePath: string;
	source: string;
	warnings: string[];
}): Promise<void> {
	await fsp.mkdir(path.dirname(filePath), { recursive: true });
	try {
		await fsp.writeFile(filePath, source, { encoding: "utf8", flag: "wx" });
	} catch (error) {
		if ((error as { code?: string }).code === "EEXIST") {
			warnings.push(
				`Preserved existing ${path.basename(filePath)}; review it manually if you need different local integration settings.`,
			);
			return;
		}
		throw error;
	}
}

/**
 * Write a newly generated scaffold file and fail if the target already exists.
 *
 * @param filePath Absolute target file path.
 * @param source Generated source to write.
 * @returns A promise that resolves after the file is written.
 * @throws {Error} When the scaffold target already exists.
 */
export async function writeNewScaffoldFile(
	filePath: string,
	source: string,
): Promise<void> {
	await fsp.mkdir(path.dirname(filePath), { recursive: true });
	try {
		await fsp.writeFile(filePath, source, { encoding: "utf8", flag: "wx" });
	} catch (error) {
		if ((error as { code?: string }).code === "EEXIST") {
			throw new Error(
				`An integration environment scaffold already exists at ${filePath}. Choose a different name.`,
			);
		}
		throw error;
	}
}
