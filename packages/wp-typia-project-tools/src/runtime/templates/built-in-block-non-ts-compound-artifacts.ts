import type { BuiltInCodeArtifact } from "./built-in-block-code-artifacts.js";
import {
	buildAlternateRenderEntryArtifact,
	renderArtifact,
	toPhpSingleQuotedString,
} from "./built-in-block-non-ts-render-utils.js";
import {
	COMPOUND_PERSISTENCE_RENDER_TARGETS_TEMPLATE,
	COMPOUND_PERSISTENCE_RENDER_TEMPLATE,
	COMPOUND_STYLE_TEMPLATE,
} from "./built-in-block-non-ts-compound-templates.js";
import type { ScaffoldTemplateVariables } from "./scaffold.js";
import {
	getScaffoldAlternateRenderTargets,
	isCompoundPersistenceEnabled,
} from "./scaffold-template-variable-groups.js";

/**
 * Builds the compound family non-TypeScript scaffold artifacts.
 *
 * @param variables Scaffold template variables used to render the artifact set.
 * @returns The compound SCSS and PHP artifacts, including persistence variants when enabled.
 */
export function buildCompoundArtifacts(
	variables: ScaffoldTemplateVariables,
): BuiltInCodeArtifact[] {
	const alternateRenderTargets = getScaffoldAlternateRenderTargets(variables);
	const artifacts = [
		renderArtifact(
			`src/blocks/${variables.slugKebabCase}/style.scss`,
			COMPOUND_STYLE_TEMPLATE,
			variables,
		),
	];

	if (isCompoundPersistenceEnabled(variables)) {
		const renderView = {
			...variables,
			titlePhpLiteral: toPhpSingleQuotedString(variables.title),
		};
		if (alternateRenderTargets.enabled) {
			artifacts.push(
				renderArtifact(
					`src/blocks/${variables.slugKebabCase}/render-targets.php`,
					COMPOUND_PERSISTENCE_RENDER_TARGETS_TEMPLATE,
					renderView,
				),
				buildAlternateRenderEntryArtifact(
					`src/blocks/${variables.slugKebabCase}/render.php`,
					"web",
					variables,
				),
			);
			if (alternateRenderTargets.hasEmail) {
				artifacts.push(
					buildAlternateRenderEntryArtifact(
						`src/blocks/${variables.slugKebabCase}/render-email.php`,
						"email",
						variables,
					),
				);
			}
			if (alternateRenderTargets.hasMjml) {
				artifacts.push(
					buildAlternateRenderEntryArtifact(
						`src/blocks/${variables.slugKebabCase}/render-mjml.php`,
						"mjml",
						variables,
					),
				);
			}
			if (alternateRenderTargets.hasPlainText) {
				artifacts.push(
					buildAlternateRenderEntryArtifact(
						`src/blocks/${variables.slugKebabCase}/render-text.php`,
						"plain-text",
						variables,
					),
				);
			}
			return artifacts;
		}
		artifacts.push(
			renderArtifact(
				`src/blocks/${variables.slugKebabCase}/render.php`,
				COMPOUND_PERSISTENCE_RENDER_TEMPLATE,
				renderView,
			),
		);
	}

	return artifacts;
}
