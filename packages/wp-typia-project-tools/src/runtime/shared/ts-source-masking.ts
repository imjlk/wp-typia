/** Original-source range returned from a masked-source pattern match. */
export interface SourceRange {
	end: number;
	start: number;
}

function maskSourceSegment(segment: string): string {
	return segment.replace(/[^\n\r]/gu, " ");
}

function testPattern(source: string, pattern: RegExp): boolean {
	pattern.lastIndex = 0;
	const matched = pattern.test(source);
	pattern.lastIndex = 0;
	return matched;
}

/**
 * Masks TypeScript comments with spaces while preserving newlines and offsets.
 */
export function maskTypeScriptComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//gu, maskSourceSegment)
		.replace(/\/\/[^\n\r]*/gu, maskSourceSegment);
}

/**
 * Masks TypeScript comments and quoted/template literals with spaces while
 * preserving source offsets. This is a lightweight lexer for runtime checks,
 * not a full TypeScript parser, so template interpolation and regex/division
 * ambiguity are intentionally left to callers that need deeper syntax analysis.
 */
export function maskTypeScriptCommentsAndLiterals(source: string): string {
	let maskedSource = "";
	let index = 0;

	while (index < source.length) {
		const current = source[index];
		const next = source[index + 1];

		if (current === "/" && next === "/") {
			const start = index;
			index += 2;

			while (
				index < source.length &&
				source[index] !== "\n" &&
				source[index] !== "\r"
			) {
				index += 1;
			}

			maskedSource += maskSourceSegment(source.slice(start, index));
			continue;
		}

		if (current === "/" && next === "*") {
			const start = index;
			index += 2;

			while (
				index < source.length &&
				!(source[index] === "*" && source[index + 1] === "/")
			) {
				index += 1;
			}

			index = Math.min(index + 2, source.length);
			maskedSource += maskSourceSegment(source.slice(start, index));
			continue;
		}

		if (current === "'" || current === '"' || current === "`") {
			const start = index;
			const quote = current;
			index += 1;

			while (index < source.length) {
				const char = source[index];

				if (char === "\\") {
					index += 2;
					continue;
				}

				index += 1;

				if (char === quote) {
					break;
				}
			}

			maskedSource += maskSourceSegment(source.slice(start, index));
			continue;
		}

		maskedSource += current;
		index += 1;
	}

	return maskedSource;
}

/**
 * Tests for a pattern after hiding comments and quoted/template literals.
 */
export function hasExecutablePattern(source: string, pattern: RegExp): boolean {
	return testPattern(maskTypeScriptCommentsAndLiterals(source), pattern);
}

/**
 * Tests for a pattern after hiding comments while leaving literals intact.
 */
export function hasUncommentedPattern(source: string, pattern: RegExp): boolean {
	return testPattern(maskTypeScriptComments(source), pattern);
}

/**
 * Finds the first masked-source match that maps back to the original source.
 */
export function findExecutablePatternMatch(
	source: string,
	patterns: readonly RegExp[],
): SourceRange | undefined {
	const maskedSource = maskTypeScriptCommentsAndLiterals(source);

	for (const pattern of patterns) {
		pattern.lastIndex = 0;
		const match = pattern.exec(maskedSource);
		pattern.lastIndex = 0;

		if (match && match.index !== undefined) {
			return {
				end: match.index + match[0].length,
				start: match.index,
			};
		}
	}

	return undefined;
}
