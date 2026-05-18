import type { BuiltInCodeArtifact } from "./built-in-block-code-artifacts.js";
import {
	buildAlternateRenderEntryArtifact,
	renderArtifact,
} from "./built-in-block-non-ts-render-utils.js";
import {
	PERSISTENCE_RENDER_TARGETS_TEMPLATE,
	PERSISTENCE_RENDER_TEMPLATE,
	PERSISTENCE_STYLE_TEMPLATE,
} from "./built-in-block-non-ts-persistence-templates.js";
import type { ScaffoldTemplateVariables } from "./scaffold.js";
import { getScaffoldAlternateRenderTargets } from "./scaffold-template-variable-groups.js";

/**
 * Builds the persistence family non-TypeScript scaffold artifacts.
 *
 * @param variables Scaffold template variables used to render the artifact set.
 * @returns The persistence SCSS and PHP artifacts for the selected render targets.
 */
export function buildPersistenceArtifacts(
	variables: ScaffoldTemplateVariables,
): BuiltInCodeArtifact[] {
	const alternateRenderTargets = getScaffoldAlternateRenderTargets(variables);
	if (!alternateRenderTargets.enabled) {
		return [
			renderArtifact("src/style.scss", PERSISTENCE_STYLE_TEMPLATE, variables),
			renderArtifact("src/render.php", PERSISTENCE_RENDER_TEMPLATE, variables),
		];
	}

	const artifacts = [
		renderArtifact("src/style.scss", PERSISTENCE_STYLE_TEMPLATE, variables),
		renderArtifact(
			"src/render-targets.php",
			PERSISTENCE_RENDER_TARGETS_TEMPLATE,
			variables,
		),
		buildAlternateRenderEntryArtifact("src/render.php", "web", variables),
	];

	if (alternateRenderTargets.hasEmail) {
		artifacts.push(
			buildAlternateRenderEntryArtifact("src/render-email.php", "email", variables),
		);
	}
	if (alternateRenderTargets.hasMjml) {
		artifacts.push(
			buildAlternateRenderEntryArtifact("src/render-mjml.php", "mjml", variables),
		);
	}
	if (alternateRenderTargets.hasPlainText) {
		artifacts.push(
			buildAlternateRenderEntryArtifact(
				"src/render-text.php",
				"plain-text",
				variables,
			),
		);
	}

	return artifacts;
}
