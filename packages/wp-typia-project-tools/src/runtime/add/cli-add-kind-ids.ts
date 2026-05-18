/**
 * Canonical top-level `wp-typia add` kind ids shared by the CLI command
 * registry, routing metadata generation, and project-tools runtime helpers.
 *
 * Keep this order stable because it drives help output and command metadata.
 */
export const ADD_KIND_IDS = [
	"admin-view",
	"block",
	"integration-env",
	"core-variation",
	"variation",
	"style",
	"transform",
	"pattern",
	"binding-source",
	"contract",
	"rest-resource",
	"post-meta",
	"ability",
	"ai-feature",
	"hooked-block",
	"editor-plugin",
] as const;

/**
 * Union of supported top-level `wp-typia add` kind ids.
 */
export type AddKindId = (typeof ADD_KIND_IDS)[number];
