/**
 * Attribute map shared by peer-free block authoring helpers.
 *
 * Registration-specific aliases remain in `blocks/registration`, where the
 * optional WordPress peer contract is explicit. Helpers that only inspect or
 * emit metadata should not pull that peer-backed declaration graph into the
 * package aggregates.
 */
export type BlockAttributes = Record<string, any>;
