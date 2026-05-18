const BLOCK_SLUG_PATTERN = /^[a-z][a-z0-9-]*$/u;
const PHP_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/u;
const PHP_CONSTANT_IDENTIFIER_PATTERN = /^[A-Z_][A-Z0-9_]*$/u;
const JAVASCRIPT_IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/u;
const QUERY_POST_TYPE_PATTERN = /^[a-z0-9_-]{1,20}$/u;

function assertOptionalStringPattern(
	view: Record<string, unknown>,
	key: string,
	pattern: RegExp,
	description: string,
): void {
	const value = view[key];
	if (typeof value === "undefined") {
		return;
	}

	if (typeof value !== "string" || !pattern.test(value)) {
		throw new Error(
			`Unsafe scaffold template variable "${key}" for ${description}: ${JSON.stringify(value)}.`,
		);
	}
}

/**
 * Revalidates target-language identifiers at the built-in template builder
 * boundary so generated PHP and TypeScript never rely only on upstream CLI
 * normalization.
 */
export function assertScaffoldTemplateCodeIdentifiers(
	view: Record<string, unknown>,
): void {
	assertOptionalStringPattern(view, "namespace", BLOCK_SLUG_PATTERN, "block namespace");
	assertOptionalStringPattern(view, "slug", BLOCK_SLUG_PATTERN, "block slug");
	assertOptionalStringPattern(view, "slugKebabCase", BLOCK_SLUG_PATTERN, "block slug");
	assertOptionalStringPattern(view, "textDomain", BLOCK_SLUG_PATTERN, "text domain");
	assertOptionalStringPattern(view, "textdomain", BLOCK_SLUG_PATTERN, "text domain");
	assertOptionalStringPattern(view, "queryPostType", QUERY_POST_TYPE_PATTERN, "query post type");
	assertOptionalStringPattern(view, "phpPrefix", PHP_IDENTIFIER_PATTERN, "PHP identifier");
	assertOptionalStringPattern(view, "slugSnakeCase", PHP_IDENTIFIER_PATTERN, "PHP identifier");
	assertOptionalStringPattern(
		view,
		"phpPrefixUpper",
		PHP_CONSTANT_IDENTIFIER_PATTERN,
		"PHP constant identifier",
	);
	assertOptionalStringPattern(view, "pascalCase", JAVASCRIPT_IDENTIFIER_PATTERN, "JavaScript identifier");
	assertOptionalStringPattern(view, "slugCamelCase", JAVASCRIPT_IDENTIFIER_PATTERN, "JavaScript identifier");
	assertOptionalStringPattern(view, "titleCase", JAVASCRIPT_IDENTIFIER_PATTERN, "JavaScript identifier");
}
