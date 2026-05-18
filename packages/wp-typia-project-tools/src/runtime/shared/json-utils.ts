import fs from "node:fs";
import { promises as fsp } from "node:fs";

/**
 * JSON helpers shared by project-tools runtime modules.
 *
 * File-backed runtime JSON readers should use `safeJsonParse`,
 * `readJsonFileSync`, or `readJsonFile` so malformed JSON reports the file path
 * and operation context. Raw `JSON.parse` remains intentional for trusted
 * in-memory clones, subprocess output, test fixtures, and generated workspace
 * script templates that embed their own path-aware parse handling.
 *
 * This module keeps `cloneJsonValue` local instead of re-exporting the
 * block-runtime helper so Bunli CLI bundles that only need project-tools JSON
 * readers do not need to resolve the block-runtime subpath at runtime.
 *
 * @module
 */

/**
 * Create a deep clone of a JSON-serializable value.
 *
 * @remarks
 * Values that are not JSON-serializable, such as functions, `undefined`,
 * `BigInt`, class instances, and `Date` objects, are not preserved faithfully.
 *
 * @param value JSON-compatible data to clone.
 * @returns A deep-cloned copy created with `JSON.parse(JSON.stringify(...))`.
 */
export function cloneJsonValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Optional metadata used to enrich JSON parse errors.
 */
export interface SafeJsonParseOptions {
	/** Human-readable operation label included in parse failures. */
	context?: string;
	/** Source file path included in parse failures when available. */
	filePath?: string;
}

function formatJsonParseTarget({ context, filePath }: SafeJsonParseOptions): string {
	const operation = context?.trim() || "JSON";
	return filePath ? `${operation} at ${filePath}` : operation;
}

/**
 * Parse JSON and include operation/file context when decoding fails.
 *
 * @param source Raw JSON source text.
 * @param options Optional file path and human-readable operation context.
 * @returns Parsed JSON value cast to the caller-specified type.
 * @throws {Error} When the source is malformed JSON.
 */
export function safeJsonParse<T = unknown>(
	source: string,
	options: SafeJsonParseOptions = {},
): T {
	try {
		return JSON.parse(source) as T;
	} catch (error) {
		throw new Error(
			`Failed to parse ${formatJsonParseTarget(options)}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

/**
 * Read and parse a JSON file synchronously with path-aware parse errors.
 *
 * @param filePath JSON file path to read.
 * @param options Optional parse context. `filePath` is always set from the
 * reader argument.
 * @returns Parsed JSON value cast to the caller-specified type.
 */
export function readJsonFileSync<T = unknown>(
	filePath: string,
	options: Omit<SafeJsonParseOptions, "filePath"> = {},
): T {
	return safeJsonParse<T>(fs.readFileSync(filePath, "utf8"), {
		...options,
		filePath,
	});
}

/**
 * Read and parse a JSON file asynchronously with path-aware parse errors.
 *
 * @param filePath JSON file path to read.
 * @param options Optional parse context. `filePath` is always set from the
 * reader argument.
 * @returns Parsed JSON value cast to the caller-specified type.
 */
export async function readJsonFile<T = unknown>(
	filePath: string,
	options: Omit<SafeJsonParseOptions, "filePath"> = {},
): Promise<T> {
	return safeJsonParse<T>(await fsp.readFile(filePath, "utf8"), {
		...options,
		filePath,
	});
}
