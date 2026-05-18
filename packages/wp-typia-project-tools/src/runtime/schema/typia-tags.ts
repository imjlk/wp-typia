/**
 * Compatibility shim that preserves typia tag augmentation for legacy
 * `@wp-typia/project-tools/runtime/*` editor and inspector imports.
 *
 * The canonical declaration now lives in `@wp-typia/block-runtime`, so this
 * module imports that surface for its type side effects.
 */
import type {} from "@wp-typia/block-runtime/metadata-core";

export {};
