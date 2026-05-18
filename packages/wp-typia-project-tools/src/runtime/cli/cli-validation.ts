import fs from "node:fs";
import path from "node:path";
import {
	CLI_DIAGNOSTIC_CODES,
	createCliDiagnosticCodeError,
} from "./cli-diagnostics.js";

/**
 * Normalize one optional CLI string flag by trimming whitespace and collapsing
 * empty strings to `undefined`.
 *
 * @param value Raw CLI value before normalization.
 * @returns The trimmed string when present, otherwise `undefined`.
 */
export function normalizeOptionalCliString(value?: string): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function looksLikeLocalCliPath(value: string): boolean {
	return (
		path.isAbsolute(value) ||
		value.startsWith("./") ||
		value.startsWith("../") ||
		value.startsWith(".\\") ||
		value.startsWith("..\\")
	);
}

/**
 * Resolve one CLI path flag relative to the caller when it is expressed as a
 * local filesystem path.
 *
 * Non-local values such as npm package specs or `github:` locators pass
 * through unchanged. Local relative and absolute paths are resolved against the
 * provided `cwd` and must exist on disk.
 *
 * @param options Path resolution inputs for one CLI flag.
 * @param options.cwd Caller working directory used for relative path
 * resolution.
 * @param options.label Human-readable option label used in thrown errors.
 * @param options.value Raw CLI value before trimming and path resolution.
 * @returns The normalized string, or `undefined` when the option was omitted.
 * @throws When a local-looking path resolves to a missing filesystem entry.
 */
export function resolveLocalCliPathOption(options: {
	cwd: string;
	label: string;
	value?: string;
}): string | undefined {
	const normalizedValue = normalizeOptionalCliString(options.value);
	if (!normalizedValue || !looksLikeLocalCliPath(normalizedValue)) {
		return normalizedValue;
	}

	const resolvedPath = path.resolve(options.cwd, normalizedValue);
	if (!fs.existsSync(resolvedPath)) {
		throw createCliDiagnosticCodeError(
			CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
			`\`${options.label}\` path does not exist: ${resolvedPath}. Check the path relative to ${options.cwd}.`,
		);
	}

	return resolvedPath;
}

/**
 * Validate the built-in template composition rule for external layers.
 *
 * @param options External layer CLI options after normalization.
 * @param options.externalLayerId Optional selected layer id.
 * @param options.externalLayerSource Optional layer source locator or path.
 * @throws When `externalLayerId` is provided without `externalLayerSource`.
 */
export function assertExternalLayerCompositionOptions(options: {
	externalLayerId?: string;
	externalLayerSource?: string;
}): void {
	if (options.externalLayerId && !options.externalLayerSource) {
		throw createCliDiagnosticCodeError(
			CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
			"externalLayerId requires externalLayerSource when composing built-in template layers.",
		);
	}
}

/**
 * Build the shared error message used when a built-in template receives a
 * `--variant` override.
 *
 * @param options Built-in template context.
 * @param options.templateId Built-in template id that rejected the variant.
 * @param options.variant User-supplied variant override.
 * @returns The canonical user-facing error message.
 */
export function createBuiltInVariantErrorMessage(options: {
	templateId: string;
	variant: string;
}): string {
	return `--variant is only supported for official external template configs. Received variant "${options.variant}" for built-in template "${options.templateId}".`;
}

/**
 * Reject unsupported `--variant` usage for built-in templates.
 *
 * @param options Built-in template validation context.
 * @param options.templateId Built-in template id being scaffolded.
 * @param options.variant Optional variant override from CLI flags.
 * @throws When a built-in template receives any explicit `--variant` value.
 */
export function assertBuiltInTemplateVariantAllowed(options: {
	templateId: string;
	variant?: string;
}): void {
	if (!options.variant) {
		return;
	}

	throw createCliDiagnosticCodeError(
		CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
		createBuiltInVariantErrorMessage({
			templateId: options.templateId,
			variant: options.variant,
		}),
	);
}
