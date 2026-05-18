import ts from "typescript";

/**
 * Extract the literal text for TypeScript property names this runtime supports.
 *
 * Computed property names are intentionally not resolved because their runtime
 * values are not statically knowable from the syntax node alone.
 *
 * @param name TypeScript property name node.
 * @returns Identifier, string-literal, or numeric-literal text; otherwise `null`.
 */
export function getPropertyNameText(name: ts.PropertyName): string | null {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
		return name.text;
	}

	return null;
}
