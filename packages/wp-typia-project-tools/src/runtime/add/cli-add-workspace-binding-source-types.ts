import type { PostMetaBindingField } from "./post-meta-binding-fields.js";

/**
 * Target block attribute that should receive generated binding-source wiring.
 */
export type BindingTarget = {
	attributeName: string;
	blockSlug: string;
};

/**
 * Resolved post-meta contract data used to generate a binding source.
 */
export type BindingPostMetaSource = {
	fields: PostMetaBindingField[];
	metaKey: string;
	metaPath: string;
	postMetaSlug: string;
	postType: string;
	schemaFile: string;
	sourceTypeName: string;
};
