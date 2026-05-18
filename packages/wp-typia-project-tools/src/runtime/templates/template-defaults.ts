/**
 * Internal built-in template metadata defaults used by scaffold rendering.
 */
export const BUILTIN_BLOCK_METADATA_VERSION = "0.1.0";

/**
 * Built-in parent block metadata defaults keyed by template id.
 */
export const BUILTIN_TEMPLATE_METADATA_DEFAULTS = Object.freeze({
	basic: Object.freeze({
		category: "text",
		icon: "smiley",
	}),
	interactivity: Object.freeze({
		category: "widgets",
		icon: "smiley",
	}),
	persistence: Object.freeze({
		category: "widgets",
		icon: "database",
	}),
	compound: Object.freeze({
		category: "widgets",
		icon: "screenoptions",
	}),
	"query-loop": Object.freeze({
		category: "widgets",
		icon: "query-pagination",
	}),
});

/**
 * Shared hidden child block metadata defaults for compound scaffolds.
 */
export const COMPOUND_CHILD_BLOCK_METADATA_DEFAULTS = Object.freeze({
	category: "widgets",
	icon: "excerpt-view",
});

/**
 * Legacy built-in template ids that were removed in favor of persistence modes.
 */
export const REMOVED_BUILTIN_TEMPLATE_IDS = ["data", "persisted"] as const;
/**
 * Union of removed built-in template ids accepted by compatibility checks.
 */
export type RemovedBuiltInTemplateId = (typeof REMOVED_BUILTIN_TEMPLATE_IDS)[number];

/**
 * Returns the metadata defaults for a built-in scaffold template id.
 *
 * @param templateId Built-in template id whose metadata defaults should be read.
 * @returns The stable category/icon defaults used by scaffold rendering.
 */
export function getBuiltInTemplateMetadataDefaults(
	templateId: keyof typeof BUILTIN_TEMPLATE_METADATA_DEFAULTS,
) {
	return BUILTIN_TEMPLATE_METADATA_DEFAULTS[templateId];
}

/**
 * Checks whether a template id points at a removed built-in scaffold.
 *
 * @param templateId Template id supplied to scaffold resolution.
 * @returns True when the template id is one of the removed legacy built-ins.
 */
export function isRemovedBuiltInTemplateId(
	templateId: string,
): templateId is RemovedBuiltInTemplateId {
	return (REMOVED_BUILTIN_TEMPLATE_IDS as readonly string[]).includes(templateId);
}

/**
 * Builds the stable recovery guidance shown for removed built-in template ids.
 *
 * @param templateId Removed template id, where `data` maps to the public policy and
 * `persisted` maps to the authenticated policy.
 * @returns A user-facing error string in the form
 * `Built-in template "<id>" was removed. Use --template persistence --persistence-policy <policy> instead.`
 */
export function getRemovedBuiltInTemplateMessage(templateId: RemovedBuiltInTemplateId): string {
	return `Built-in template "${templateId}" was removed. Use --template persistence --persistence-policy ${
		templateId === "data" ? "public" : "authenticated"
	} instead.`;
}
