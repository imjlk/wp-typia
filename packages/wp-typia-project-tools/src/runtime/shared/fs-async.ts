import { promises as fsp } from "node:fs";

/**
 * Return whether a filesystem path exists without blocking the event loop.
 *
 * @param filePath Absolute or relative path to check.
 * @returns `true` when the path can be accessed, otherwise `false`.
 */
export async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fsp.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Read a UTF-8 file when it exists and otherwise return `null`.
 *
 * @param filePath Absolute or relative file path to read.
 * @returns The UTF-8 source, or `null` when the file is missing.
 */
export async function readOptionalUtf8File(filePath: string): Promise<string | null> {
	try {
		return await fsp.readFile(filePath, "utf8");
	} catch (error) {
		if (isFileNotFoundError(error)) {
			return null;
		}
		throw error;
	}
}

/**
 * Extract a Node.js error code from an unknown thrown value.
 *
 * @param error Unknown error value.
 * @returns The string error code, or an empty string when unavailable.
 */
export function getNodeErrorCode(error: unknown): string {
	return getOptionalNodeErrorCode(error) ?? "";
}

/**
 * Extract a Node.js error code from an unknown thrown value when available.
 *
 * @param error Unknown error value.
 * @returns The string error code, or `undefined` when unavailable.
 */
export function getOptionalNodeErrorCode(error: unknown): string | undefined {
	return typeof error === "object" && error !== null && "code" in error
		? String((error as { code: unknown }).code)
		: undefined;
}

/**
 * Return whether an unknown error represents a missing filesystem path.
 *
 * @param error Unknown error value.
 * @returns `true` when the error has Node.js code `ENOENT`.
 */
export function isFileNotFoundError(error: unknown): boolean {
	return getOptionalNodeErrorCode(error) === "ENOENT";
}
