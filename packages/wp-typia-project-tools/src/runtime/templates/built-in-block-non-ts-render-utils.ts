import type { BuiltInCodeArtifact } from "./built-in-block-code-artifacts.js";
import type { ScaffoldTemplateVariables } from "./scaffold.js";
import { assertScaffoldTemplateCodeIdentifiers } from "./scaffold-template-assertions.js";
import { renderMustacheTemplateString } from "./template-render.js";

/**
 * Renders a non-TypeScript artifact and normalizes the output to a trailing newline.
 *
 * @param relativePath Relative output path for the generated artifact.
 * @param template Mustache template source to render.
 * @param view Template view data passed to the Mustache renderer.
 * @returns A built-in code artifact with normalized source text.
 */
export function renderArtifact(
	relativePath: string,
	template: string,
	view: Record<string, unknown>,
): BuiltInCodeArtifact {
	assertScaffoldTemplateCodeIdentifiers(view);
	const source = renderMustacheTemplateString(template, view);
	return {
		relativePath,
		source: source.endsWith("\n") ? source : `${source}\n`,
	};
}

/**
 * Builds a PHP entrypoint for a specific alternate render target.
 *
 * @param relativePath Relative output path for the generated PHP file.
 * @param target Alternate render target identifier to dispatch.
 * @param variables Scaffold template variables used to render the entrypoint.
 * @returns A built-in code artifact for the requested alternate render target.
 */
export function buildAlternateRenderEntryArtifact(
	relativePath: string,
	target: "email" | "mjml" | "plain-text" | "web",
	variables: ScaffoldTemplateVariables,
): BuiltInCodeArtifact {
	const template = `<?php
/**
 * Alternate ${target} render entry for {{title}}.
 *
 * @package {{pascalCase}}
 */

if ( ! defined( 'ABSPATH' ) ) {
\texit;
}

require_once __DIR__ . '/render-targets.php';

return {{phpPrefix}}_{{slugSnakeCase}}_render_target( '${target}', $attributes, $content ?? '', $block ?? null );
`;

	return renderArtifact(relativePath, template, variables);
}

/**
 * Escapes a string for safe embedding in a PHP single-quoted literal.
 *
 * @param value Source string to escape.
 * @returns A PHP single-quoted string literal.
 */
export function toPhpSingleQuotedString(value: string): string {
	return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
