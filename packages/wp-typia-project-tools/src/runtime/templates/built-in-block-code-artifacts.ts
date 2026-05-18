import type {
	ScaffoldTemplateVariables,
} from "./scaffold.js";
import type {
	BuiltInTemplateId,
} from "./template-registry.js";
import { buildBuiltInNonTsArtifacts } from "./built-in-block-non-ts-artifacts.js";
import {
	BASIC_EDIT_TEMPLATE,
	BASIC_INDEX_TEMPLATE,
	BASIC_SAVE_TEMPLATE,
	BASIC_VALIDATORS_TEMPLATE,
	BLOCK_METADATA_WRAPPER_TEMPLATE,
	COMPOUND_CHILD_EDIT_TEMPLATE,
	COMPOUND_CHILD_INDEX_TEMPLATE,
	COMPOUND_CHILD_SAVE_TEMPLATE,
	COMPOUND_CHILD_VALIDATORS_TEMPLATE,
	COMPOUND_CHILDREN_TEMPLATE,
	COMPOUND_LOCAL_HOOKS_TEMPLATE,
	COMPOUND_PARENT_EDIT_TEMPLATE,
	COMPOUND_PARENT_INDEX_TEMPLATE,
	COMPOUND_PARENT_SAVE_TEMPLATE,
	COMPOUND_PARENT_VALIDATORS_TEMPLATE,
	COMPOUND_PERSISTENCE_PARENT_EDIT_TEMPLATE,
	COMPOUND_PERSISTENCE_PARENT_INTERACTIVITY_TEMPLATE,
	COMPOUND_PERSISTENCE_PARENT_SAVE_TEMPLATE,
	COMPOUND_PERSISTENCE_PARENT_VALIDATORS_TEMPLATE,
	INTERACTIVITY_EDIT_TEMPLATE,
	INTERACTIVITY_INDEX_TEMPLATE,
	INTERACTIVITY_SAVE_TEMPLATE,
	INTERACTIVITY_SCRIPT_TEMPLATE,
	INTERACTIVITY_STORE_TEMPLATE,
	INTERACTIVITY_VALIDATORS_TEMPLATE,
	MANIFEST_DEFAULTS_DOCUMENT_WRAPPER_TEMPLATE,
	MANIFEST_DOCUMENT_WRAPPER_TEMPLATE,
	PERSISTENCE_EDIT_TEMPLATE,
	PERSISTENCE_INDEX_TEMPLATE,
	PERSISTENCE_INTERACTIVITY_TEMPLATE,
	PERSISTENCE_SAVE_TEMPLATE,
	PERSISTENCE_VALIDATORS_TEMPLATE,
	QUERY_LOOP_INDEX_TEMPLATE,
	SHARED_HOOKS_TEMPLATE,
} from "./built-in-block-code-templates.js";
import { getScaffoldTemplateVariableGroups } from "./scaffold-template-variable-groups.js";
import { assertScaffoldTemplateCodeIdentifiers } from "./scaffold-template-assertions.js";
import { renderMustacheTemplateString } from "./template-render.js";

/**
 * Emits built-in scaffold source files from typed block generation inputs.
 *
 * This module is intentionally internal to the runtime boundary: built-in
 * scaffold bodies and adjacent emitted source files are now derived from
 * `ScaffoldTemplateVariables`, but the emitter helpers themselves are not part
 * of the public root export surface.
 */
export interface BuiltInCodeArtifact {
	/**
	 * File path relative to the generated project root.
	 */
	relativePath: string;
	/**
	 * Fully rendered file contents with a trailing newline.
	 */
	source: string;
}

interface BuiltInCodeTemplateSpec {
	relativePath: string;
	template: string;
}

function renderCodeTemplate(
	template: string,
	variables: ScaffoldTemplateVariables,
): string {
	assertScaffoldTemplateCodeIdentifiers(variables);
	const rendered = renderMustacheTemplateString(template, variables);
	return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
}

function createCodeArtifact(
	relativePath: string,
	template: string,
	variables: ScaffoldTemplateVariables,
): BuiltInCodeArtifact {
	return {
		relativePath,
		source: renderCodeTemplate(template, variables),
	};
}

function createCodeArtifacts(
	specs: readonly BuiltInCodeTemplateSpec[],
	variables: ScaffoldTemplateVariables,
): BuiltInCodeArtifact[] {
	return specs.map((spec) =>
		createCodeArtifact(spec.relativePath, spec.template, variables),
	);
}

function createTypedJsonWrapperArtifacts(
	relativeDir: string,
	variables: ScaffoldTemplateVariables,
): BuiltInCodeArtifact[] {
	return [
		createCodeArtifact(
			`${relativeDir}/block-metadata.ts`,
			BLOCK_METADATA_WRAPPER_TEMPLATE,
			variables,
		),
		createCodeArtifact(
			`${relativeDir}/manifest-document.ts`,
			MANIFEST_DOCUMENT_WRAPPER_TEMPLATE,
			variables,
		),
		createCodeArtifact(
			`${relativeDir}/manifest-defaults-document.ts`,
			MANIFEST_DEFAULTS_DOCUMENT_WRAPPER_TEMPLATE,
			variables,
		),
	];
}

function ensureUniqueArtifactPaths(
	artifacts: BuiltInCodeArtifact[],
): BuiltInCodeArtifact[] {
	const seenPaths = new Set<string>();

	for (const artifact of artifacts) {
		if (seenPaths.has(artifact.relativePath)) {
			throw new Error(
				`Duplicate built-in artifact path emitted: ${artifact.relativePath}`,
			);
		}
		seenPaths.add(artifact.relativePath);
	}

	return artifacts;
}

function buildBasicCodeArtifacts(
	variables: ScaffoldTemplateVariables,
): BuiltInCodeArtifact[] {
	return ensureUniqueArtifactPaths([
		...createCodeArtifacts(
			[
				{
					relativePath: "src/hooks.ts",
					template: SHARED_HOOKS_TEMPLATE,
				},
			],
			variables,
		),
		...createTypedJsonWrapperArtifacts("src", variables),
		...createCodeArtifacts(
			[
				{
					relativePath: "src/edit.tsx",
					template: BASIC_EDIT_TEMPLATE,
				},
				{
					relativePath: "src/save.tsx",
					template: BASIC_SAVE_TEMPLATE,
				},
				{
					relativePath: "src/index.tsx",
					template: BASIC_INDEX_TEMPLATE,
				},
				{
					relativePath: "src/validators.ts",
					template: BASIC_VALIDATORS_TEMPLATE,
				},
			],
			variables,
		),
		...buildBuiltInNonTsArtifacts({ templateId: "basic", variables }),
	]);
}

function buildInteractivityCodeArtifacts(
	variables: ScaffoldTemplateVariables,
): BuiltInCodeArtifact[] {
	return ensureUniqueArtifactPaths([
		...createCodeArtifacts(
			[
				{
					relativePath: "src/hooks.ts",
					template: SHARED_HOOKS_TEMPLATE,
				},
			],
			variables,
		),
		...createTypedJsonWrapperArtifacts("src", variables),
		...createCodeArtifacts(
			[
				{
					relativePath: "src/edit.tsx",
					template: INTERACTIVITY_EDIT_TEMPLATE,
				},
				{
					relativePath: "src/save.tsx",
					template: INTERACTIVITY_SAVE_TEMPLATE,
				},
				{
					relativePath: "src/index.tsx",
					template: INTERACTIVITY_INDEX_TEMPLATE,
				},
				{
					relativePath: "src/interactivity.ts",
					template: INTERACTIVITY_SCRIPT_TEMPLATE,
				},
				{
					relativePath: "src/interactivity-store.ts",
					template: INTERACTIVITY_STORE_TEMPLATE,
				},
				{
					relativePath: "src/validators.ts",
					template: INTERACTIVITY_VALIDATORS_TEMPLATE,
				},
			],
			variables,
		),
		...buildBuiltInNonTsArtifacts({ templateId: "interactivity", variables }),
	]);
}

function buildCompoundCodeArtifacts(
	variables: ScaffoldTemplateVariables,
): BuiltInCodeArtifact[] {
	const parentBasePath = `src/blocks/${variables.slugKebabCase}`;
	const childBasePath = `src/blocks/${variables.slugKebabCase}-item`;
	const compoundGroup = getScaffoldTemplateVariableGroups(variables).compound;
	const compoundPersistenceEnabled =
		compoundGroup.enabled && compoundGroup.persistenceEnabled;

	return ensureUniqueArtifactPaths([
		createCodeArtifact("src/hooks.ts", SHARED_HOOKS_TEMPLATE, variables),
		...createTypedJsonWrapperArtifacts(parentBasePath, variables),
		createCodeArtifact(
			`${parentBasePath}/edit.tsx`,
			compoundPersistenceEnabled
				? COMPOUND_PERSISTENCE_PARENT_EDIT_TEMPLATE
				: COMPOUND_PARENT_EDIT_TEMPLATE,
			variables,
		),
		createCodeArtifact(
			`${parentBasePath}/save.tsx`,
			compoundPersistenceEnabled
				? COMPOUND_PERSISTENCE_PARENT_SAVE_TEMPLATE
				: COMPOUND_PARENT_SAVE_TEMPLATE,
			variables,
		),
		createCodeArtifact(
			`${parentBasePath}/index.tsx`,
			COMPOUND_PARENT_INDEX_TEMPLATE,
			variables,
		),
		createCodeArtifact(
			`${parentBasePath}/hooks.ts`,
			COMPOUND_LOCAL_HOOKS_TEMPLATE,
			variables,
		),
		createCodeArtifact(
			`${parentBasePath}/validators.ts`,
			compoundPersistenceEnabled
				? COMPOUND_PERSISTENCE_PARENT_VALIDATORS_TEMPLATE
				: COMPOUND_PARENT_VALIDATORS_TEMPLATE,
			variables,
		),
		createCodeArtifact(
			`${parentBasePath}/children.ts`,
			COMPOUND_CHILDREN_TEMPLATE,
			variables,
		),
		...(compoundPersistenceEnabled
			? [
					createCodeArtifact(
						`${parentBasePath}/interactivity.ts`,
						COMPOUND_PERSISTENCE_PARENT_INTERACTIVITY_TEMPLATE,
						variables,
					),
				]
			: []),
		...createTypedJsonWrapperArtifacts(childBasePath, variables),
		createCodeArtifact(
			`${childBasePath}/edit.tsx`,
			COMPOUND_CHILD_EDIT_TEMPLATE,
			variables,
		),
		createCodeArtifact(
			`${childBasePath}/save.tsx`,
			COMPOUND_CHILD_SAVE_TEMPLATE,
			variables,
		),
		createCodeArtifact(
			`${childBasePath}/index.tsx`,
			COMPOUND_CHILD_INDEX_TEMPLATE,
			variables,
		),
		createCodeArtifact(
			`${childBasePath}/hooks.ts`,
			COMPOUND_LOCAL_HOOKS_TEMPLATE,
			variables,
		),
		createCodeArtifact(
			`${childBasePath}/validators.ts`,
			COMPOUND_CHILD_VALIDATORS_TEMPLATE,
			variables,
		),
		...buildBuiltInNonTsArtifacts({ templateId: "compound", variables }),
	]);
}

function buildPersistenceCodeArtifacts(
	variables: ScaffoldTemplateVariables,
): BuiltInCodeArtifact[] {
	return ensureUniqueArtifactPaths([
		...createCodeArtifacts(
			[
				{
					relativePath: "src/hooks.ts",
					template: SHARED_HOOKS_TEMPLATE,
				},
			],
			variables,
		),
		...createTypedJsonWrapperArtifacts("src", variables),
		...createCodeArtifacts(
			[
				{
					relativePath: "src/edit.tsx",
					template: PERSISTENCE_EDIT_TEMPLATE,
				},
				{
					relativePath: "src/save.tsx",
					template: PERSISTENCE_SAVE_TEMPLATE,
				},
				{
					relativePath: "src/index.tsx",
					template: PERSISTENCE_INDEX_TEMPLATE,
				},
				{
					relativePath: "src/interactivity.ts",
					template: PERSISTENCE_INTERACTIVITY_TEMPLATE,
				},
				{
					relativePath: "src/validators.ts",
					template: PERSISTENCE_VALIDATORS_TEMPLATE,
				},
			],
			variables,
		),
		...buildBuiltInNonTsArtifacts({ templateId: "persistence", variables }),
	]);
}

function buildQueryLoopCodeArtifacts(
	variables: ScaffoldTemplateVariables,
): BuiltInCodeArtifact[] {
	return ensureUniqueArtifactPaths([
		...createCodeArtifacts(
			[
				{
					relativePath: "src/index.ts",
					template: QUERY_LOOP_INDEX_TEMPLATE,
				},
			],
			variables,
		),
		...buildBuiltInNonTsArtifacts({ templateId: "query-loop", variables }),
	]);
}

/**
 * Build the emitter-owned scaffold files for a built-in template family.
 *
 * These artifacts are written after template copy so built-in structural,
 * source, and adjacent generated files always come from the typed generator
 * boundary rather than stale Mustache sources.
 */
export function buildBuiltInCodeArtifacts({
	templateId,
	variables,
}: {
	templateId: BuiltInTemplateId;
	variables: ScaffoldTemplateVariables;
}): BuiltInCodeArtifact[] {
	switch (templateId) {
		case "basic":
			return buildBasicCodeArtifacts(variables);
		case "interactivity":
			return buildInteractivityCodeArtifacts(variables);
		case "persistence":
			return buildPersistenceCodeArtifacts(variables);
		case "compound":
			return buildCompoundCodeArtifacts(variables);
		case "query-loop":
			return buildQueryLoopCodeArtifacts(variables);
		default: {
			const unhandledTemplateId: never = templateId;
			throw new Error(`Unhandled built-in template id: ${unhandledTemplateId}`);
		}
	}
}
