import { quoteTsString } from "./cli-add-shared.js";
import type { ResolvedPatternCatalogOptions } from "./cli-add-workspace-pattern-options.js";

/**
 * Render the block-config inventory entry for a generated pattern.
 *
 * @param patternSlug Normalized and validated pattern slug.
 * @param options Resolved pattern catalog metadata.
 * @returns A TypeScript object literal snippet for the workspace inventory.
 */
export function buildPatternConfigEntry(
	patternSlug: string,
	options: ResolvedPatternCatalogOptions,
): string {
	const lines = [
		"\t{",
		`\t\tcontentFile: ${quoteTsString(options.contentFile)},`,
		`\t\tfile: ${quoteTsString(options.contentFile)},`,
		`\t\tscope: ${quoteTsString(options.patternScope)},`,
		...(options.sectionRole
			? [`\t\tsectionRole: ${quoteTsString(options.sectionRole)},`]
			: []),
		`\t\tslug: ${quoteTsString(patternSlug)},`,
		`\t\ttags: [${options.tags.map((tag) => quoteTsString(tag)).join(", ")}],`,
		...(options.thumbnailUrl
			? [`\t\tthumbnailUrl: ${quoteTsString(options.thumbnailUrl)},`]
			: []),
		`\t\ttitle: ${quoteTsString(options.title)},`,
		"\t},",
	];

	return lines.join("\n");
}

/**
 * Render the PHP pattern module registered by the workspace add command.
 *
 * @param patternSlug Normalized and validated pattern slug.
 * @param namespace WordPress block namespace for the workspace.
 * @param sectionRole Optional section role for section-scoped patterns.
 * @param textDomain Translation text domain for generated labels.
 * @param title Human-readable pattern title.
 * @returns PHP source for a single generated block pattern module.
 */
export function buildPatternSource(
	patternSlug: string,
	namespace: string,
	sectionRole: string | undefined,
	textDomain: string,
	title: string,
): string {
	const content = sectionRole
		? `'<!-- wp:group {"className":"section section--${sectionRole}"} --><div class="wp-block-group section section--${sectionRole}"><!-- wp:paragraph --><p>' . esc_html__( 'Describe this section pattern here.', '${textDomain}' ) . '</p><!-- /wp:paragraph --></div><!-- /wp:group -->'`
		: `'<!-- wp:paragraph --><p>' . esc_html__( 'Describe this pattern here.', '${textDomain}' ) . '</p><!-- /wp:paragraph -->'`;

	return `<?php
if ( ! defined( 'ABSPATH' ) ) {
	return;
}

register_block_pattern(
	'${namespace}/${patternSlug}',
	array(
		'title'       => __( ${JSON.stringify(title)}, '${textDomain}' ),
		'description' => __( ${JSON.stringify(`A starter pattern for ${title}.`)}, '${textDomain}' ),
		'categories'  => array( '${namespace}' ),
		'content'     => ${content},
	)
);
`;
}
