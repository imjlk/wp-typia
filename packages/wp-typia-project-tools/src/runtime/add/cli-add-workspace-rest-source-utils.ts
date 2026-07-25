/**
 * Prefix every line in a multi-line source fragment.
 *
 * @param source Source fragment to indent.
 * @param prefix Prefix to prepend to every line.
 * @returns The source fragment with each line prefixed.
 */
export function indentMultiline(source: string, prefix: string): string {
  return source
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

const RESOLVE_REST_NONCE_SOURCE = `function resolveRestNonce(
  fallback?: string,
): string | undefined {
  if (typeof fallback === 'string' && fallback.length > 0) {
    return fallback;
  }

  if (typeof window === 'undefined') {
    return undefined;
  }

  const wpApiSettings = (
    window as typeof window & {
      wpApiSettings?: { nonce?: string };
    }
  ).wpApiSettings;

  return typeof wpApiSettings?.nonce === 'string' &&
    wpApiSettings.nonce.length > 0
    ? wpApiSettings.nonce
    : undefined;
}`;

/**
 * Render the shared REST nonce helper in the canonical ttsc layout.
 *
 * @returns TypeScript source for the embedded `resolveRestNonce()` helper.
 */
export function formatResolveRestNonceSource(): string {
  return RESOLVE_REST_NONCE_SOURCE;
}
