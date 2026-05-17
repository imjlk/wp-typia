import { normalizeBlockSlug } from "./scaffold-identifiers.js";

const FULL_BLOCK_NAME_PATTERN = /^[a-z0-9-]+\/[a-z0-9-]+$/u;

/**
 * Caller-owned error messages for full block name validation.
 */
export interface FullBlockNameDiagnostics {
	/**
	 * Message returned when the candidate block name is empty.
	 */
	empty: () => string;
	/**
	 * Message returned when the candidate is not `namespace/block-slug`.
	 */
	invalidFormat: () => string;
}

export interface WorkspaceBlockTargetName {
	blockName: string;
	blockSlug: string;
}

export interface WorkspaceBlockTargetDiagnostics {
	empty: () => string;
	emptySegment: (input: string) => string;
	invalidFormat: (input: string) => string;
	namespaceMismatch: (input: string, actualNamespace: string, expectedNamespace: string) => string;
}

function resolveFullBlockNameDiagnostics(
	diagnostics: string | FullBlockNameDiagnostics,
): FullBlockNameDiagnostics {
	if (typeof diagnostics !== "string") {
		return diagnostics;
	}

	return {
		empty: () => `\`${diagnostics}\` requires a block name.`,
		invalidFormat: () =>
			`\`${diagnostics}\` must use <namespace/block-slug> format.`,
	};
}

/**
 * Validate a full `namespace/block-slug` block name.
 *
 * @param blockName Candidate block name.
 * @param diagnostics CLI flag name or diagnostic builders for caller-owned UX.
 * @returns The trimmed full block name.
 * @throws {Error} When the block name is empty or not a full block name.
 */
export function assertFullBlockName(
	blockName: string,
	diagnostics: string | FullBlockNameDiagnostics,
): string {
	const messages = resolveFullBlockNameDiagnostics(diagnostics);
	const trimmed = blockName.trim();
	if (!trimmed) {
		throw new Error(messages.empty());
	}
	if (!FULL_BLOCK_NAME_PATTERN.test(trimmed)) {
		throw new Error(messages.invalidFormat());
	}

	return trimmed;
}

/**
 * Resolve a workspace block target from either `block-slug` or
 * `namespace/block-slug` input while preserving caller-owned diagnostics.
 *
 * @param blockName Candidate block target.
 * @param namespace Expected workspace namespace.
 * @param diagnostics Error message builders for the caller's UX context.
 * @returns The normalized workspace block target.
 * @throws {Error} When the target is empty, malformed, or references another namespace.
 */
export function resolveWorkspaceBlockTargetName(
	blockName: string,
	namespace: string,
	diagnostics: WorkspaceBlockTargetDiagnostics,
): WorkspaceBlockTargetName {
	const trimmed = blockName.trim();
	if (!trimmed) {
		throw new Error(diagnostics.empty());
	}

	const blockNameSegments = trimmed.split("/");
	if (blockNameSegments.length > 2) {
		throw new Error(diagnostics.invalidFormat(trimmed));
	}
	if (blockNameSegments.some((segment) => segment.trim() === "")) {
		throw new Error(diagnostics.emptySegment(trimmed));
	}

	const [maybeNamespace, maybeSlug] =
		blockNameSegments.length === 2
			? blockNameSegments
			: [undefined, blockNameSegments[0]];
	if (maybeNamespace && maybeNamespace !== namespace) {
		throw new Error(diagnostics.namespaceMismatch(trimmed, maybeNamespace, namespace));
	}

	const blockSlug = normalizeBlockSlug(maybeSlug ?? "");
	return {
		blockName: `${namespace}/${blockSlug}`,
		blockSlug,
	};
}

/**
 * Resolve the standard `--to` style workspace block target used by add flows.
 *
 * @param blockName Candidate block target.
 * @param namespace Expected workspace namespace.
 * @param flagName CLI flag name used in diagnostics.
 * @returns The normalized workspace block target.
 * @throws {Error} When the target is empty, malformed, or references another namespace.
 */
export function resolveWorkspaceTargetBlockName(
	blockName: string,
	namespace: string,
	flagName: string,
): WorkspaceBlockTargetName {
	return resolveWorkspaceBlockTargetName(blockName, namespace, {
		empty: () => `\`${flagName}\` requires <block-slug|namespace/block-slug>.`,
		emptySegment: () =>
			`\`${flagName}\` must use <block-slug|namespace/block-slug> format.`,
		invalidFormat: () =>
			`\`${flagName}\` must use <block-slug|namespace/block-slug> format.`,
		namespaceMismatch: (_input, actualNamespace, expectedNamespace) =>
			`\`${flagName}\` references namespace "${actualNamespace}". Expected "${expectedNamespace}".`,
	});
}
