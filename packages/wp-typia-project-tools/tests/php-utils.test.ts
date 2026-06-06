import { expect, test } from "bun:test";

import {
	escapeRegex,
	findPhpFunctionRange,
	hasPhpFunctionCall,
	hasPhpFunctionCallWithStringArgument,
	hasPhpFunctionCallWithStringArgumentPrefix,
	hasPhpFunctionDefinition,
	quotePhpString,
	replacePhpFunctionDefinition,
} from "../src/runtime/php-utils.js";

test("quotePhpString escapes single quotes and backslashes for generated PHP", () => {
	expect(quotePhpString("Bob's \\ path")).toBe("'Bob\\'s \\\\ path'");
});

test("escapeRegex produces a literal-safe regular expression fragment", () => {
	const literal = "feature.value[1](draft)?";
	const pattern = new RegExp(`^${escapeRegex(literal)}$`, "u");

	expect(pattern.test(literal)).toBe(true);
	expect(pattern.test("featureXvalue[1](draft)?")).toBe(false);
});

test("findPhpFunctionRange locates a complete PHP function with nested braces", () => {
	const source = `<?php
function keep_me() {
\treturn true;
}

function wp_typia_demo() {
\tif ( true ) {
\t\treturn array( 'ok' => true );
\t}

\treturn array();
}

add_action( 'init', 'wp_typia_demo' );
`;

	const range = findPhpFunctionRange(source, "wp_typia_demo");

	expect(range?.source).toContain("function wp_typia_demo()");
	expect(range?.source).toContain("return array( 'ok' => true );");
	expect(range?.source).not.toContain("add_action");
});

test("findPhpFunctionRange supports return types without spilling into later functions", () => {
	const source = `<?php
function malformed()

function wp_typia_typed() : array {
\treturn array();
}
`;

	expect(findPhpFunctionRange(source, "malformed")).toBeNull();
	expect(findPhpFunctionRange(source, "wp_typia_typed")?.source).toContain(
		"function wp_typia_typed() : array",
	);
});

test("findPhpFunctionRange ignores braces inside PHP string literals", () => {
	const source = `<?php
function wp_typia_demo() {
\t$json = '{"key": {"nested": true}}';
\t$template = "Hello {name}";
\tif ( true ) {
\t\treturn array( 'ok' => true );
\t}
}

function keep_me() {
\treturn true;
}
`;

	const range = findPhpFunctionRange(source, "wp_typia_demo");

	expect(range).not.toBeNull();
	expect(range?.source).toContain(`$json = '{"key": {"nested": true}}';`);
	expect(range?.source).toContain('$template = "Hello {name}";');
	expect(range?.source).not.toContain("function keep_me()");
});

test("PHP scanner keeps double-quoted interpolation blocks in string mode", () => {
	const source = `<?php
function wp_typia_demo() {
\t$name = 'Reader';
\t$message = "Hello {$name}";
\t$value = "Value: {$object->property}";
\t$quoted = "Quoted: {$object->labels["wp_enqueue_script_module("]}";
\t$brace = "Brace: {$object->labels["}"]}";
\t$commented = "Comment: {$object/* " } wp_enqueue_script_module( */->property}";
\treturn array( $message, $value, $quoted, $brace, $commented );
}

function keep_me() {
\twp_enqueue_script_module( 'real-call', 'url', array(), null );
}
`;

	const range = findPhpFunctionRange(source, "wp_typia_demo");

	expect(range).not.toBeNull();
	expect(range?.source).toContain('$message = "Hello {$name}";');
	expect(range?.source).toContain('$value = "Value: {$object->property}";');
	expect(range?.source).toContain(
		'$quoted = "Quoted: {$object->labels["wp_enqueue_script_module("]}";',
	);
	expect(range?.source).toContain('$brace = "Brace: {$object->labels["}"]}";');
	expect(range?.source).toContain(
		'$commented = "Comment: {$object/* " } wp_enqueue_script_module( */->property}";',
	);
	expect(range?.source).not.toContain("function keep_me()");
	expect(hasPhpFunctionCall(range?.source ?? "", "wp_enqueue_script_module")).toBe(
		false,
	);
});

test("findPhpFunctionRange ignores braces inside heredoc and nowdoc content", () => {
	const source = `<?php
function wp_typia_demo() {
\t$json = <<<JSON
{
\t"query": {"postType": "page"}
}
\tJSON;
\t$raw = <<<'NOWDOC'
{
\t"literal": "{$notInterpolated}"
}
\tNOWDOC;
\treturn array();
}

function keep_me() {
\treturn true;
}
`;

	const range = findPhpFunctionRange(source, "wp_typia_demo");

	expect(range).not.toBeNull();
	expect(range?.source).toContain("<<<JSON");
	expect(range?.source).toContain("<<<'NOWDOC'");
	expect(range?.source).not.toContain("function keep_me()");
});

test("findPhpFunctionRange accepts heredoc expression continuations", () => {
	const source = `<?php
function wp_typia_demo() {
\t$values = array(
\t\t<<<JSON
{
\t"query": {"postType": "page"}
}
\t\tJSON,
\t);
\t$trimmed = trim( <<<TEXT
{
\t"label": "demo"
}
\tTEXT );
\t$nonEmpty = <<<TEXT
demo
\tTEXT !== '';

\treturn array( $values, $trimmed, $nonEmpty );
}

function keep_me() {
\treturn true;
}
`;

	const range = findPhpFunctionRange(source, "wp_typia_demo");

	expect(range).not.toBeNull();
	expect(range?.source).toContain("JSON,");
	expect(range?.source).toContain("TEXT );");
	expect(range?.source).toContain("TEXT !== '';");
	expect(range?.source).toContain("return array( $values, $trimmed, $nonEmpty );");
	expect(range?.source).not.toContain("function keep_me()");
});

test("findPhpFunctionRange preserves PHP 8 attributes instead of treating them as comments", () => {
	const source = `<?php
function wp_typia_demo() {
\t#[ExampleAttribute] class LocalThing {
\t\tpublic function value() {
\t\t\treturn true;
\t\t}
\t}

\treturn array();
}

function keep_me() {
\treturn true;
}
`;

	const range = findPhpFunctionRange(source, "wp_typia_demo");

	expect(range).not.toBeNull();
	expect(range?.source).toContain("#[ExampleAttribute] class LocalThing");
	expect(range?.source).toContain("return array();");
	expect(range?.source).not.toContain("function keep_me()");
});

test("findPhpFunctionRange returns null for unterminated heredoc content", () => {
	const source = `<?php
function wp_typia_demo() {
\t$json = <<<JSON
{
\t"query": {"postType": "page"}
}

function keep_me() {
\treturn true;
}
`;

	expect(findPhpFunctionRange(source, "wp_typia_demo")).toBeNull();
});

test("hasPhpFunctionCall ignores comments, strings, heredoc, and nowdoc", () => {
	const source = `<?php
function wp_typia_demo() {
\t// wp_enqueue_script_module(
\t$single = 'wp_enqueue_script_module(';
\t$double = "wp_enqueue_script_module(";
\t$heredoc = <<<TEXT
wp_enqueue_script_module(
TEXT;
\treturn true;
}
`;

	expect(hasPhpFunctionCall(source, "wp_enqueue_script_module")).toBe(false);
	expect(
		hasPhpFunctionCall(
			`${source}\nwp_enqueue_script_module( 'demo', 'url', array(), null );\n`,
			"wp_enqueue_script_module",
		),
	).toBe(true);
	expect(
		hasPhpFunctionCall(
			`${source}\nwp_enqueue_script_module/* reason */( 'demo', 'url', array(), null );\n`,
			"wp_enqueue_script_module",
		),
	).toBe(true);
	expect(
		hasPhpFunctionCall(
			`${source}\nwp_enqueue_script_module // reason\n( 'demo', 'url', array(), null );\n`,
			"wp_enqueue_script_module",
		),
	).toBe(true);
	expect(
		hasPhpFunctionCall(
			`${source}\n$scripts->wp_enqueue_script_module( 'demo', 'url', array(), null );\n`,
			"wp_enqueue_script_module",
		),
	).toBe(false);
	expect(
		hasPhpFunctionCall(
			`${source}\nScripts::wp_enqueue_script_module( 'demo', 'url', array(), null );\n`,
			"wp_enqueue_script_module",
		),
	).toBe(false);
});

test("hasPhpFunctionCallWithStringArgument matches only code-mode literal first arguments", () => {
	const filterName = "block_bindings_supported_attributes_demo-space/card";
	const source = `<?php
// add_filter( '${filterName}', 'ignored_comment' );
$single = "add_filter( '${filterName}', 'ignored_string' )";
$double = '${filterName}';
add_filter(
\t'other_filter',
\t'demo_space_other'
);
add_filter(
\t/* generated binding floor */
\t'${filterName}',
\t'demo_space_supported_attributes'
);
add_filter(
\t"${filterName}",
\t'demo_space_double_quoted_supported_attributes'
);
add_filter(
\t'${filterName}' . '_suffix',
\t'demo_space_concatenated_supported_attributes'
);
`;

	expect(
		hasPhpFunctionCallWithStringArgument(source, "add_filter", filterName),
	).toBe(true);
	expect(
		hasPhpFunctionCallWithStringArgument(
			`<?php\nadd_filter( '${filterName}' . '_suffix', 'ignored' );\n`,
			"add_filter",
			filterName,
		),
	).toBe(false);
	expect(
		hasPhpFunctionCallWithStringArgument(
			`<?php\n$filters->add_filter( '${filterName}', 'ignored' );\n`,
			"add_filter",
			filterName,
		),
	).toBe(false);
	expect(
		hasPhpFunctionCallWithStringArgument(
			`<?php\nFilters::add_filter( '${filterName}', 'ignored' );\n`,
			"add_filter",
			filterName,
		),
	).toBe(false);
	expect(
		hasPhpFunctionCallWithStringArgument(source, "add_filter", "other_filter"),
	).toBe(true);
	expect(
		hasPhpFunctionCallWithStringArgument(source, "add_filter", "missing_filter"),
	).toBe(false);
});

test("hasPhpFunctionCallWithStringArgument ignores comments, strings, heredoc, and non-first arguments", () => {
	const filterName = "block_bindings_supported_attributes_demo-space/card";
	const source = `<?php
// add_filter( '${filterName}', 'ignored_comment' );
$single = 'add_filter( "${filterName}", "ignored_string" )';
$double = "${filterName}";
$heredoc = <<<TEXT
add_filter( '${filterName}', 'ignored_heredoc' )
TEXT;
add_filter( 'other_filter', '${filterName}' );
`;

	expect(
		hasPhpFunctionCallWithStringArgument(source, "add_filter", filterName),
	).toBe(false);
});

test("hasPhpFunctionCallWithStringArgumentPrefix matches code-mode literal first argument prefixes", () => {
	const prefix = "block_bindings_supported_attributes_";
	const source = `<?php
// add_filter( 'block_bindings_supported_attributes_demo/comment', 'ignored_comment' );
$fake = 'block_bindings_supported_attributes_demo/string';
add_filter(
\t'block_bindings_supported_attributes_core/paragraph',
\t'demo_space_supported_attributes'
);
add_filter(
\t"block_bindings_supported_attributes_" . $block_type,
\t'demo_space_dynamic_supported_attributes'
);
`;

	expect(
		hasPhpFunctionCallWithStringArgumentPrefix(source, "add_filter", prefix),
	).toBe(true);
	expect(
		hasPhpFunctionCallWithStringArgumentPrefix(
			source,
			"add_filter",
			"block_bindings_supported_attributes_missing/",
		),
	).toBe(false);
	expect(
		hasPhpFunctionCallWithStringArgumentPrefix(
			`<?php\n$filters->add_filter( 'block_bindings_supported_attributes_core/paragraph', 'ignored' );\n`,
			"add_filter",
			prefix,
		),
	).toBe(false);
	expect(
		hasPhpFunctionCallWithStringArgumentPrefix(
			`<?php\nFilters::add_filter( 'block_bindings_supported_attributes_core/paragraph', 'ignored' );\n`,
			"add_filter",
			prefix,
		),
	).toBe(false);
});

test("PHP scanner transitions agree between range and call helpers", () => {
	const scenarios = [
		{
			body: "\t$fake = 'wp_enqueue_script_module({';\n\treturn true;",
			hasCall: false,
			label: "single-quoted string",
		},
		{
			body: '\t$fake = "wp_enqueue_script_module({";\n\treturn true;',
			hasCall: false,
			label: "double-quoted string",
		},
		{
			body: "\t// wp_enqueue_script_module({\n\treturn true;",
			hasCall: false,
			label: "line comment",
		},
		{
			body: "\t# wp_enqueue_script_module({\n\treturn true;",
			hasCall: false,
			label: "hash comment",
		},
		{
			body: "\t/* wp_enqueue_script_module({ */\n\treturn true;",
			hasCall: false,
			label: "block comment",
		},
		{
			body: `\t$fake = <<<TEXT
wp_enqueue_script_module({
TEXT;
\treturn true;`,
			hasCall: false,
			label: "heredoc",
		},
		{
			body: `\t$fake = <<<'TEXT'
wp_enqueue_script_module({
TEXT;
\treturn true;`,
			hasCall: false,
			label: "nowdoc",
		},
		{
			body: "\twp_enqueue_script_module( 'demo', 'url', array(), null );\n\treturn true;",
			hasCall: true,
			label: "code call",
		},
	];

	for (const scenario of scenarios) {
		const source = `<?php
function wp_typia_demo() {
${scenario.body}
}

function keep_me() {
\treturn true;
}
`;
		const range = findPhpFunctionRange(source, "wp_typia_demo");
		if (!range) {
			throw new Error(`Expected PHP function range for ${scenario.label}`);
		}

		expect(range.source).not.toContain("function keep_me()");
		expect(hasPhpFunctionCall(range.source, "wp_enqueue_script_module")).toBe(
			scenario.hasCall,
		);
	}
});

test("PHP scanner stays conservative when heredoc state is unterminated", () => {
	const source = `<?php
function wp_typia_demo() {
\t$fake = <<<TEXT
wp_enqueue_script_module(
`;

	expect(findPhpFunctionRange(source, "wp_typia_demo")).toBeNull();
	expect(hasPhpFunctionCall(source, "wp_enqueue_script_module")).toBe(false);
});

test("replacePhpFunctionDefinition replaces only the targeted PHP function", () => {
	const source = `<?php
function wp_typia_demo() {
\tif ( true ) {
\t\treturn array( 'old' => true );
\t}
}

function keep_me() {
\treturn true;
}
`;

	const replaced = replacePhpFunctionDefinition(
		source,
		"wp_typia_demo",
		`
function wp_typia_demo() {
\treturn array( 'new' => true );
}
`,
		{ trimReplacementStart: true },
	);

	expect(replaced).not.toBeNull();
	expect(replaced).toContain("return array( 'new' => true );");
	expect(replaced).not.toContain("return array( 'old' => true );");
	expect(replaced).toContain("function keep_me()");
});

test("hasPhpFunctionDefinition treats function names as literal identifiers", () => {
	const source = `<?php
function wp_typia_feature_value() {
\treturn true;
}
`;

	expect(hasPhpFunctionDefinition(source, "wp_typia_feature_value")).toBe(true);
	expect(hasPhpFunctionDefinition(source, "wp_typia_feature.value")).toBe(false);
});
