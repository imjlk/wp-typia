export type PhpFunctionRange = {
	end: number;
	source: string;
	start: number;
};

export type PhpFunctionRangeOptions = {
	includeTrailingNewlines?: boolean;
};

export type ReplacePhpFunctionDefinitionOptions = PhpFunctionRangeOptions & {
	trimReplacementStart?: boolean;
};

type PhpFunctionScanMode =
	| "block-comment"
	| "code"
	| "double-quoted"
	| "double-quoted-interpolation"
	| "heredoc"
	| "line-comment"
	| "single-quoted";

type PhpHeredocStart = {
	contentStart: number;
	delimiter: string;
};

type PhpScannerState = {
	heredocDelimiter: string;
	interpolationComment: "" | "block" | "line";
	interpolationDepth: number;
	interpolationQuote: string;
	mode: PhpFunctionScanMode;
};

type PhpScannerAdvanceResult = {
	ambiguous: boolean;
	inCode: boolean;
	index: number;
};

export function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function quotePhpString(value: string): string {
	return `'${value.replace(/\\/gu, "\\\\").replace(/'/gu, "\\'")}'`;
}

export function hasPhpFunctionDefinition(
	source: string,
	functionName: string,
): boolean {
	return new RegExp(`function\\s+${escapeRegex(functionName)}\\s*\\(`, "u").test(source);
}

function isPhpIdentifierStart(character: string | undefined): boolean {
	return /^[A-Za-z_]$/u.test(character ?? "");
}

function isPhpIdentifierPart(character: string | undefined): boolean {
	return /^[A-Za-z0-9_]$/u.test(character ?? "");
}

function isPhpLineStart(source: string, index: number): boolean {
	return index === 0 || source[index - 1] === "\n";
}

function isPhpHorizontalWhitespace(character: string | undefined): boolean {
	return character === " " || character === "\t";
}

function isPhpWhitespace(character: string | undefined): boolean {
	return typeof character === "string" && /\s/u.test(character);
}

function findPhpLineBoundary(
	source: string,
	index: number,
): { contentEnd: number; nextStart: number } {
	const newlineIndex = source.indexOf("\n", index);
	if (newlineIndex === -1) {
		return {
			contentEnd: source.endsWith("\r") ? source.length - 1 : source.length,
			nextStart: source.length,
		};
	}

	return {
		contentEnd: source[newlineIndex - 1] === "\r" ? newlineIndex - 1 : newlineIndex,
		nextStart: newlineIndex + 1,
	};
}

function parsePhpHeredocStart(source: string, index: number): PhpHeredocStart | null {
	if (!source.startsWith("<<<", index)) {
		return null;
	}

	let cursor = index + 3;
	while (isPhpHorizontalWhitespace(source[cursor])) {
		cursor += 1;
	}

	const quote = source[cursor] === "'" || source[cursor] === '"' ? source[cursor] : "";
	if (quote) {
		cursor += 1;
	}

	if (!isPhpIdentifierStart(source[cursor])) {
		return null;
	}

	const delimiterStart = cursor;
	cursor += 1;
	while (isPhpIdentifierPart(source[cursor])) {
		cursor += 1;
	}
	const delimiter = source.slice(delimiterStart, cursor);

	if (quote) {
		if (source[cursor] !== quote) {
			return null;
		}
		cursor += 1;
	}

	const lineBoundary = findPhpLineBoundary(source, cursor);
	if (source.slice(cursor, lineBoundary.contentEnd).trim() !== "") {
		return null;
	}

	return {
		contentStart: lineBoundary.nextStart,
		delimiter,
	};
}

function findPhpHeredocClosingEnd(
	source: string,
	index: number,
	delimiter: string,
): number | null {
	if (!isPhpLineStart(source, index)) {
		return null;
	}

	let cursor = index;
	while (isPhpHorizontalWhitespace(source[cursor])) {
		cursor += 1;
	}

	if (!source.startsWith(delimiter, cursor)) {
		return null;
	}
	cursor += delimiter.length;

	if (isPhpIdentifierPart(source[cursor])) {
		return null;
	}

	let continuationCursor = cursor;
	while (isPhpHorizontalWhitespace(source[continuationCursor])) {
		continuationCursor += 1;
	}
	const continuation = source[continuationCursor];
	if (
		continuationCursor >= source.length ||
		continuation === "\r" ||
		continuation === "\n" ||
		!isPhpIdentifierPart(continuation)
	) {
		return cursor;
	}

	return null;
}

function skipPhpCallTrivia(source: string, index: number): number | null {
	let cursor = index;
	while (cursor < source.length) {
		while (isPhpWhitespace(source[cursor])) {
			cursor += 1;
		}

		if (source[cursor] === "/" && source[cursor + 1] === "*") {
			const commentEnd = source.indexOf("*/", cursor + 2);
			if (commentEnd === -1) {
				return null;
			}
			cursor = commentEnd + 2;
			continue;
		}

		if (source[cursor] === "/" && source[cursor + 1] === "/") {
			cursor = findPhpLineBoundary(source, cursor + 2).nextStart;
			continue;
		}

		if (source[cursor] === "#" && source[cursor + 1] !== "[") {
			cursor = findPhpLineBoundary(source, cursor + 1).nextStart;
			continue;
		}

		return cursor;
	}

	return cursor;
}

function matchesPhpFunctionCallAt(
	source: string,
	index: number,
	functionName: string,
): boolean {
	if (!source.startsWith(functionName, index)) {
		return false;
	}
	if (isPhpIdentifierPart(source[index - 1])) {
		return false;
	}
	let previousCursor = index - 1;
	while (previousCursor >= 0 && /\s/u.test(source[previousCursor] ?? "")) {
		previousCursor -= 1;
	}
	const previousToken = source[previousCursor];
	if (
		(previousToken === ">" && source[previousCursor - 1] === "-") ||
		(previousToken === ":" && source[previousCursor - 1] === ":")
	) {
		return false;
	}

	const cursor = index + functionName.length;
	if (isPhpIdentifierPart(source[cursor])) {
		return false;
	}
	const callStart = skipPhpCallTrivia(source, cursor);

	return callStart !== null && source[callStart] === "(";
}

function parsePhpQuotedStringLiteralAt(
	source: string,
	index: number,
): { end: number; value: string } | null {
	const quote = source[index];
	if (quote !== "'" && quote !== '"') {
		return null;
	}

	let cursor = index + 1;
	let value = "";
	while (cursor < source.length) {
		const character = source[cursor];
		if (character === "\\") {
			const escapedCharacter = source[cursor + 1];
			if (escapedCharacter === undefined) {
				return null;
			}
			value += escapedCharacter;
			cursor += 2;
			continue;
		}

		if (character === quote) {
			return {
				end: cursor + 1,
				value,
			};
		}

		value += character;
		cursor += 1;
	}

	return null;
}

function parsePhpVariableNameAt(
	source: string,
	index: number,
): { end: number; name: string } | null {
	if (source[index] !== "$") {
		return null;
	}

	const nameStart = index + 1;
	if (!isPhpIdentifierStart(source[nameStart])) {
		return null;
	}

	let cursor = nameStart + 1;
	while (isPhpIdentifierPart(source[cursor])) {
		cursor += 1;
	}

	return {
		end: cursor,
		name: source.slice(nameStart, cursor),
	};
}

function getPhpFunctionCallFirstArgumentStart(
	source: string,
	index: number,
	functionName: string,
): number | null {
	const cursor = index + functionName.length;
	const callStart = skipPhpCallTrivia(source, cursor);
	if (callStart === null || source[callStart] !== "(") {
		return null;
	}

	return skipPhpCallTrivia(source, callStart + 1);
}

function createPhpScannerState(): PhpScannerState {
	return {
		heredocDelimiter: "",
		interpolationComment: "",
		interpolationDepth: 0,
		interpolationQuote: "",
		mode: "code",
	};
}

function advancePhpScanner(
	source: string,
	index: number,
	state: PhpScannerState,
): PhpScannerAdvanceResult {
	const character = source[index];

	if (state.mode === "heredoc") {
		const closingEnd = findPhpHeredocClosingEnd(
			source,
			index,
			state.heredocDelimiter,
		);
		if (closingEnd !== null) {
			state.mode = "code";
			state.heredocDelimiter = "";
			return { ambiguous: false, inCode: false, index: closingEnd };
		}

		const nextLineStart = findPhpLineBoundary(source, index).nextStart;
		if (nextLineStart <= index) {
			return { ambiguous: true, inCode: false, index };
		}
		return { ambiguous: false, inCode: false, index: nextLineStart };
	}

	if (state.mode === "single-quoted" || state.mode === "double-quoted") {
		const quote = state.mode === "single-quoted" ? "'" : '"';
		if (character === "\\") {
			return { ambiguous: false, inCode: false, index: index + 2 };
		}
		if (
			state.mode === "double-quoted" &&
			character === "{" &&
			source[index + 1] === "$"
		) {
			state.mode = "double-quoted-interpolation";
			state.interpolationComment = "";
			state.interpolationDepth = 1;
			state.interpolationQuote = "";
			return { ambiguous: false, inCode: false, index: index + 2 };
		}
		if (character === quote) {
			state.mode = "code";
		}
		return { ambiguous: false, inCode: false, index: index + 1 };
	}

	if (state.mode === "double-quoted-interpolation") {
		if (state.interpolationQuote) {
			if (character === "\\") {
				return { ambiguous: false, inCode: false, index: index + 2 };
			}
			if (character === state.interpolationQuote) {
				state.interpolationQuote = "";
			}
			return { ambiguous: false, inCode: false, index: index + 1 };
		}

		if (state.interpolationComment === "line") {
			if (character === "\r" || character === "\n") {
				state.interpolationComment = "";
			}
			return { ambiguous: false, inCode: false, index: index + 1 };
		}
		if (state.interpolationComment === "block") {
			if (character === "*" && source[index + 1] === "/") {
				state.interpolationComment = "";
				return { ambiguous: false, inCode: false, index: index + 2 };
			}
			return { ambiguous: false, inCode: false, index: index + 1 };
		}

		if (character === "/" && source[index + 1] === "/") {
			state.interpolationComment = "line";
			return { ambiguous: false, inCode: false, index: index + 2 };
		}
		if (character === "#" && source[index + 1] !== "[") {
			state.interpolationComment = "line";
			return { ambiguous: false, inCode: false, index: index + 1 };
		}
		if (character === "/" && source[index + 1] === "*") {
			state.interpolationComment = "block";
			return { ambiguous: false, inCode: false, index: index + 2 };
		}
		if (character === "'" || character === '"') {
			state.interpolationQuote = character;
			return { ambiguous: false, inCode: false, index: index + 1 };
		}
		if (character === "{") {
			state.interpolationDepth += 1;
			return { ambiguous: false, inCode: false, index: index + 1 };
		}
		if (character === "}") {
			state.interpolationDepth -= 1;
			if (state.interpolationDepth <= 0) {
				state.interpolationComment = "";
				state.interpolationDepth = 0;
				state.mode = "double-quoted";
			}
			return { ambiguous: false, inCode: false, index: index + 1 };
		}

		return { ambiguous: false, inCode: false, index: index + 1 };
	}

	if (state.mode === "line-comment") {
		if (character === "\r" || character === "\n") {
			state.mode = "code";
		}
		return { ambiguous: false, inCode: false, index: index + 1 };
	}

	if (state.mode === "block-comment") {
		if (character === "*" && source[index + 1] === "/") {
			state.mode = "code";
			return { ambiguous: false, inCode: false, index: index + 2 };
		}
		return { ambiguous: false, inCode: false, index: index + 1 };
	}

	if (character === "'") {
		state.mode = "single-quoted";
		return { ambiguous: false, inCode: false, index: index + 1 };
	}
	if (character === '"') {
		state.mode = "double-quoted";
		return { ambiguous: false, inCode: false, index: index + 1 };
	}
	if (character === "/" && source[index + 1] === "/") {
		state.mode = "line-comment";
		return { ambiguous: false, inCode: false, index: index + 2 };
	}
	if (character === "#" && source[index + 1] !== "[") {
		state.mode = "line-comment";
		return { ambiguous: false, inCode: false, index: index + 1 };
	}
	if (character === "/" && source[index + 1] === "*") {
		state.mode = "block-comment";
		return { ambiguous: false, inCode: false, index: index + 2 };
	}
	if (character === "<") {
		const heredocStart = parsePhpHeredocStart(source, index);
		if (heredocStart) {
			state.mode = "heredoc";
			state.heredocDelimiter = heredocStart.delimiter;
			return {
				ambiguous: false,
				inCode: false,
				index: heredocStart.contentStart,
			};
		}
	}

	return { ambiguous: false, inCode: true, index };
}

/**
 * Detect a PHP function call outside strings, comments, heredoc, and nowdoc blocks.
 *
 * @param source PHP source to scan.
 * @param functionName Literal PHP function identifier to find.
 * @returns Whether `source` contains a code-mode call to `functionName`.
 */
export function hasPhpFunctionCall(source: string, functionName: string): boolean {
	const scanner = createPhpScannerState();
	let index = 0;
	while (index < source.length) {
		const scan = advancePhpScanner(source, index, scanner);
		if (scan.ambiguous) {
			return false;
		}
		if (!scan.inCode) {
			index = scan.index;
			continue;
		}

		if (matchesPhpFunctionCallAt(source, index, functionName)) {
			return true;
		}

		index += 1;
	}

	return false;
}

function isPhpAssignmentOperatorAt(source: string, index: number | null): boolean {
	if (index === null || source[index] !== "=") {
		return false;
	}

	const previousToken = source[index - 1];
	const nextToken = source[index + 1];
	return (
		previousToken !== "=" &&
		previousToken !== "!" &&
		previousToken !== "<" &&
		previousToken !== ">" &&
		previousToken !== "." &&
		nextToken !== "=" &&
		nextToken !== ">"
	);
}

function isSupportedPhpAssignedStringSuffix(
	source: string,
	index: number,
): boolean {
	const nextTokenIndex = skipPhpCallTrivia(source, index);
	const nextToken =
		nextTokenIndex === null ? undefined : source[nextTokenIndex];
	return nextToken === "." || nextToken === ";" || nextToken === undefined;
}

function getPhpFunctionCallFirstVariableArgumentName(
	source: string,
	index: number,
	functionName: string,
): string | undefined {
	const argumentStart = getPhpFunctionCallFirstArgumentStart(
		source,
		index,
		functionName,
	);
	if (argumentStart === null) {
		return undefined;
	}

	const variable = parsePhpVariableNameAt(source, argumentStart);
	if (!variable) {
		return undefined;
	}

	const argumentEnd = skipPhpCallTrivia(source, variable.end);
	const nextToken = argumentEnd === null ? undefined : source[argumentEnd];
	return nextToken === "," || nextToken === ")" || nextToken === undefined
		? variable.name
		: undefined;
}

/**
 * Detect a PHP function call whose first argument is a variable previously
 * assigned from a literal string prefix in executable PHP code.
 */
export function hasPhpFunctionCallWithAssignedStringPrefixArgument(
	source: string,
	functionName: string,
	literalPrefix: string,
): boolean {
	const variablesWithPrefix = new Set<string>();
	const scanner = createPhpScannerState();
	let index = 0;
	while (index < source.length) {
		const scan = advancePhpScanner(source, index, scanner);
		if (scan.ambiguous) {
			return false;
		}
		if (!scan.inCode) {
			index = scan.index;
			continue;
		}

		const variable = parsePhpVariableNameAt(source, index);
		if (variable) {
			const assignmentStart = skipPhpCallTrivia(source, variable.end);
			if (
				assignmentStart !== null &&
				isPhpAssignmentOperatorAt(source, assignmentStart)
			) {
				const literalStart = skipPhpCallTrivia(source, assignmentStart + 1);
				const literal =
					literalStart === null
						? null
						: parsePhpQuotedStringLiteralAt(source, literalStart);
				if (
					literal &&
					literal.value.startsWith(literalPrefix) &&
					isSupportedPhpAssignedStringSuffix(source, literal.end)
				) {
					variablesWithPrefix.add(variable.name);
					index = literal.end;
					continue;
				}
				variablesWithPrefix.delete(variable.name);
			}
		}

		if (matchesPhpFunctionCallAt(source, index, functionName)) {
			const variableArgumentName = getPhpFunctionCallFirstVariableArgumentName(
				source,
				index,
				functionName,
			);
			if (
				variableArgumentName &&
				variablesWithPrefix.has(variableArgumentName)
			) {
				return true;
			}

			index += functionName.length;
			continue;
		}

		index += 1;
	}

	return false;
}

/**
 * Detect a PHP function call whose first argument is a literal string value.
 *
 * This uses the same code-mode scanner as {@link hasPhpFunctionCall}, so
 * comments, quoted strings, heredoc, and nowdoc content cannot create matches.
 */
export function hasPhpFunctionCallWithStringArgument(
	source: string,
	functionName: string,
	literalArgument: string,
): boolean {
	return hasPhpFunctionCallWithStringArgumentMatching(
		source,
		functionName,
		(value) => value === literalArgument,
		{ allowConcatenatedPrefix: false },
	);
}

/**
 * Detect a PHP function call whose first argument starts with a literal string prefix.
 *
 * Concatenated expressions are accepted here so dynamic WordPress hooks such as
 * `'block_bindings_supported_attributes_' . $block_type` remain detectable.
 */
export function hasPhpFunctionCallWithStringArgumentPrefix(
	source: string,
	functionName: string,
	literalPrefix: string,
): boolean {
	return hasPhpFunctionCallWithStringArgumentMatching(
		source,
		functionName,
		(value) => value.startsWith(literalPrefix),
		{ allowConcatenatedPrefix: true },
	);
}

/**
 * Detect a code-mode PHP string literal that starts with a literal prefix.
 *
 * This is useful for dynamic hook names stored in variables before a later
 * global function call consumes the variable.
 */
export function hasPhpCodeStringLiteralPrefix(
	source: string,
	literalPrefix: string,
): boolean {
	let index = 0;
	while (index < source.length) {
		if (source.startsWith("<?php", index)) {
			index += 5;
			continue;
		}

		if (source.startsWith("<?", index) || source.startsWith("?>", index)) {
			index += 2;
			continue;
		}

		if (source[index] === "/" && source[index + 1] === "*") {
			const commentEnd = source.indexOf("*/", index + 2);
			if (commentEnd === -1) {
				return false;
			}
			index = commentEnd + 2;
			continue;
		}

		const literal = parsePhpQuotedStringLiteralAt(source, index);
		if (literal) {
			if (literal.value.startsWith(literalPrefix)) {
				return true;
			}
			index = literal.end;
			continue;
		}

		if (source[index] === "/" && source[index + 1] === "/") {
			index = findPhpLineBoundary(source, index + 2).nextStart;
			continue;
		}

		if (source[index] === "#" && source[index + 1] !== "[") {
			index = findPhpLineBoundary(source, index + 1).nextStart;
			continue;
		}

		const heredoc = parsePhpHeredocStart(source, index);
		if (heredoc) {
			let cursor = heredoc.contentStart;
			let closingEnd: number | null = null;
			while (cursor < source.length) {
				closingEnd = findPhpHeredocClosingEnd(
					source,
					cursor,
					heredoc.delimiter,
				);
				if (closingEnd !== null) {
					break;
				}
				cursor = findPhpLineBoundary(source, cursor).nextStart;
			}

			if (closingEnd === null) {
				return false;
			}

			index = findPhpLineBoundary(source, closingEnd).nextStart;
			continue;
		}

		index += 1;
	}

	return false;
}

function hasPhpFunctionCallWithStringArgumentMatching(
	source: string,
	functionName: string,
	matchesArgument: (value: string) => boolean,
	options: { allowConcatenatedPrefix: boolean },
): boolean {
	const scanner = createPhpScannerState();
	let index = 0;
	while (index < source.length) {
		const scan = advancePhpScanner(source, index, scanner);
		if (scan.ambiguous) {
			return false;
		}
		if (!scan.inCode) {
			index = scan.index;
			continue;
		}

		if (!matchesPhpFunctionCallAt(source, index, functionName)) {
			index += 1;
			continue;
		}

		const argumentStart = getPhpFunctionCallFirstArgumentStart(
			source,
			index,
			functionName,
		);
		if (argumentStart === null) {
			index += functionName.length;
			continue;
		}

		const argument = parsePhpQuotedStringLiteralAt(source, argumentStart);
		if (!argument) {
			index += functionName.length;
			continue;
		}

		const argumentEnd = skipPhpCallTrivia(source, argument.end);
		const nextToken = argumentEnd === null ? undefined : source[argumentEnd];
		const isCompleteLiteralArgument =
			nextToken === "," || nextToken === ")" || nextToken === undefined;
		const isSupportedPrefixExpression =
			options.allowConcatenatedPrefix && nextToken === ".";
		if (
			!isCompleteLiteralArgument &&
			!isSupportedPrefixExpression
		) {
			index += functionName.length;
			continue;
		}

		if (matchesArgument(argument.value)) {
			return true;
		}

		index += functionName.length;
	}

	return false;
}

/**
 * Locate a PHP function body without counting braces in non-code regions.
 *
 * @param source PHP source to scan.
 * @param functionName Literal PHP function identifier to locate.
 * @param options Range options such as trailing newline inclusion.
 * @returns The matched {@link PhpFunctionRange}, or `null` when no safe range exists.
 */
export function findPhpFunctionRange(
	source: string,
	functionName: string,
	options: PhpFunctionRangeOptions = {},
): PhpFunctionRange | null {
	const signaturePattern = new RegExp(
		`function\\s+${escapeRegex(functionName)}\\s*\\([^)]*\\)\\s*(?::\\s*[^{};]+)?\\s*\\{`,
		"u",
	);
	const signatureMatch = signaturePattern.exec(source);
	if (!signatureMatch) {
		return null;
	}

	const functionStart = signatureMatch.index;
	const openBraceOffset = signatureMatch[0].lastIndexOf("{");
	if (openBraceOffset === -1) {
		return null;
	}
	const openBraceIndex = functionStart + openBraceOffset;

	let depth = 0;
	const scanner = createPhpScannerState();
	let index = openBraceIndex;
	while (index < source.length) {
		const scan = advancePhpScanner(source, index, scanner);
		if (scan.ambiguous) {
			return null;
		}
		if (!scan.inCode) {
			index = scan.index;
			continue;
		}

		const character = source[index];

		if (character === "{") {
			depth += 1;
			index += 1;
			continue;
		}
		if (character !== "}") {
			index += 1;
			continue;
		}
		depth -= 1;
		if (depth === 0) {
			let end = index + 1;
			if (options.includeTrailingNewlines ?? true) {
				while (end < source.length && /[\r\n]/u.test(source[end] ?? "")) {
					end += 1;
				}
			}
			return {
				end,
				source: source.slice(functionStart, end),
				start: functionStart,
			};
		}
		index += 1;
	}

	return null;
}

export function replacePhpFunctionDefinition(
	source: string,
	functionName: string,
	replacement: string,
	options: ReplacePhpFunctionDefinitionOptions = {},
): string | null {
	const functionRange = findPhpFunctionRange(source, functionName, options);
	if (!functionRange) {
		return null;
	}

	return [
		source.slice(0, functionRange.start),
		options.trimReplacementStart ? replacement.trimStart() : replacement,
		source.slice(functionRange.end),
	].join("");
}
