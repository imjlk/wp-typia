/**
 * Shared hooked-block metadata primitives used by add flows, doctor checks,
 * and interactive prompts.
 */
export const HOOKED_BLOCK_POSITION_IDS = ["before", "after", "firstChild", "lastChild"] as const;

/**
 * Union of valid `blockHooks` positions accepted by wp-typia workspace flows.
 */
export type HookedBlockPositionId = (typeof HOOKED_BLOCK_POSITION_IDS)[number];

/**
 * Fast lookup set for validating hooked-block positions across runtime surfaces.
 */
export const HOOKED_BLOCK_POSITION_SET = new Set<string>(HOOKED_BLOCK_POSITION_IDS);

/**
 * Canonical `namespace/slug` block name format required for hooked-block anchors.
 */
export const HOOKED_BLOCK_ANCHOR_PATTERN = /^[a-z0-9-]+\/[a-z0-9-]+$/;
