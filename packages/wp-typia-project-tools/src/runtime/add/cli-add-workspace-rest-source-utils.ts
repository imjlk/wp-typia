/**
 * Prefix every line in a multi-line source fragment.
 *
 * @param source Source fragment to indent.
 * @param prefix Prefix to prepend to every line.
 * @returns The source fragment with each line prefixed.
 */
export function indentMultiline(source: string, prefix: string): string {
	return source
		.split("\n")
		.map((line) => `${prefix}${line}`)
		.join("\n");
}

const RESOLVE_REST_NONCE_SOURCE = `function resolveRestNonce( fallback?: string ): string | undefined {
\tif ( typeof fallback === 'string' && fallback.length > 0 ) {
\t\treturn fallback;
\t}

\tif ( typeof window === 'undefined' ) {
\t\treturn undefined;
\t}

\tconst wpApiSettings = (
\t\twindow as typeof window & {
\t\t\twpApiSettings?: { nonce?: string };
\t\t}
\t).wpApiSettings;

\treturn typeof wpApiSettings?.nonce === 'string' &&
\t\twpApiSettings.nonce.length > 0
\t\t? wpApiSettings.nonce
\t\t: undefined;
}`;

/**
 * Render the shared REST nonce helper in the formatting style expected by a
 * generated source file.
 *
 * @param style Compact output is used by manual-contract shims; spaced output
 * matches generated REST resource shims.
 * @returns TypeScript source for the embedded `resolveRestNonce()` helper.
 */
export function formatResolveRestNonceSource(
	style: "compact" | "spaced",
): string {
	if (style === "spaced") {
		return RESOLVE_REST_NONCE_SOURCE;
	}

	return RESOLVE_REST_NONCE_SOURCE
		.replace(
			"function resolveRestNonce( fallback?: string ): string | undefined {",
			"function resolveRestNonce(fallback?: string): string | undefined {",
		)
		.replace(
			"\tif ( typeof fallback === 'string' && fallback.length > 0 ) {",
			"\tif (typeof fallback === 'string' && fallback.length > 0) {",
		)
		.replace(
			"\tif ( typeof window === 'undefined' ) {",
			"\tif (typeof window === 'undefined') {",
		);
}
