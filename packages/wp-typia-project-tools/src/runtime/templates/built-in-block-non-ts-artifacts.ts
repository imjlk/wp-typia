import type { BuiltInCodeArtifact } from "./built-in-block-code-artifacts.js";
import {
	buildBasicArtifacts,
	buildCompoundArtifacts,
	buildInteractivityArtifacts,
	buildPersistenceArtifacts,
} from "./built-in-block-non-ts-family-artifacts.js";
import type { ScaffoldTemplateVariables } from "./scaffold.js";
import type { BuiltInTemplateId } from "./template-registry.js";

/**
 * Builds non-TypeScript scaffold artifacts for built-in block templates.
 *
 * @param options Build options for the selected built-in template family.
 * @param options.templateId Built-in template identifier that controls which
 * non-TS files should be emitted.
 * @param options.variables Scaffold template variables used to render the
 * generated sources.
 * @returns An array of emitter-owned SCSS and PHP artifacts for the selected
 * built-in template family.
 */
export function buildBuiltInNonTsArtifacts({
	templateId,
	variables,
}: {
	templateId: BuiltInTemplateId;
	variables: ScaffoldTemplateVariables;
}): BuiltInCodeArtifact[] {
	switch (templateId) {
		case "basic":
			return buildBasicArtifacts(variables);
		case "interactivity":
			return buildInteractivityArtifacts(variables);
		case "persistence":
			return buildPersistenceArtifacts(variables);
		case "compound":
			return buildCompoundArtifacts(variables);
		case "query-loop":
			return [];
		default: {
			const unhandledTemplateId: never = templateId;
			throw new Error(`Unhandled built-in template id: ${unhandledTemplateId}`);
		}
	}
}
