import type { BuiltInCodeArtifact } from "./built-in-block-code-artifacts.js";
import { renderArtifact } from "./built-in-block-non-ts-render-utils.js";
import type { ScaffoldTemplateVariables } from "./scaffold.js";

const BASIC_STYLE_TEMPLATE = `/**
 * {{title}} Block Styles
 */

.{{cssClassName}} {
	padding: 20px;
	border: 1px solid #ddd;
	border-radius: 4px;
	background-color: #fff;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

	&.is-hidden {
		display: none;
	}

	&__content {
		font-size: 16px;
		line-height: 1.6;
		color: #333;

		// Alignment styles
		&[data-align="center"] {
			text-align: center;
		}

		&[data-align="right"] {
			text-align: right;
		}

		&[data-align="justify"] {
			text-align: justify;
		}
	}

	// Hover state
	&:hover {
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
		transition: box-shadow 0.2s ease;
	}
}
`;

const BASIC_EDITOR_STYLE_TEMPLATE = `/**
 * {{title}} Block Editor Styles
 */

.{{cssClassName}} {
	outline: 1px dashed #ddd;
	outline-offset: -1px;
}
`;

const BASIC_RENDER_TEMPLATE = `<?php
/**
 * Optional server render placeholder for {{title}}.
 *
 * The basic scaffold stays static by default. Keep \`src/save.tsx\` as the
 * canonical frontend output unless you intentionally convert this block into a
 * dynamic render path and add \`render\` to \`block.json\`.
 *
 * @package {{slug}}
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

?>
<div class="{{cssClassName}}__server-placeholder" hidden>
	<?php esc_html_e( 'Server render placeholder.', '{{textDomain}}' ); ?>
</div>
`;

/**
 * Builds the basic family non-TypeScript scaffold artifacts.
 *
 * @param variables Scaffold template variables used to render the artifact set.
 * @returns The SCSS and PHP artifacts owned by the basic template family.
 */
export function buildBasicArtifacts(
	variables: ScaffoldTemplateVariables,
): BuiltInCodeArtifact[] {
	return [
		renderArtifact("src/editor.scss", BASIC_EDITOR_STYLE_TEMPLATE, variables),
		renderArtifact("src/style.scss", BASIC_STYLE_TEMPLATE, variables),
		renderArtifact("src/render.php", BASIC_RENDER_TEMPLATE, variables),
	];
}
