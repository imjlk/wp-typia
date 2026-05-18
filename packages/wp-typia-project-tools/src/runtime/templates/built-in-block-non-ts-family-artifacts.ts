/**
 * Compatibility facade for non-TypeScript built-in block family artifact builders.
 *
 * Re-export these stable builder entrypoints when callers need to resolve a
 * built-in family without depending on the focused implementation modules.
 *
 * @since 0.0.0
 */
export { buildBasicArtifacts } from "./built-in-block-non-ts-basic-artifacts.js";
export { buildCompoundArtifacts } from "./built-in-block-non-ts-compound-artifacts.js";
export { buildInteractivityArtifacts } from "./built-in-block-non-ts-interactivity-artifacts.js";
export { buildPersistenceArtifacts } from "./built-in-block-non-ts-persistence-artifacts.js";
