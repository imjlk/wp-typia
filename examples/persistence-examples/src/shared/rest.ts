import { resolveRestRouteUrl } from '@wp-typia/rest';

const REST_NAMESPACE = '/persistence-examples/v1';

export function buildRestPath( suffix: string ): string {
  const normalizedSuffix = suffix.startsWith( '/' ) ? suffix : `/${ suffix }`;
  return `${ REST_NAMESPACE }${ normalizedSuffix }`;
}

export function resolveExampleRestRoute( suffix: string ): string {
  return resolveRestRouteUrl( buildRestPath( suffix ) );
}

export function resolveRestNonce( fallback?: string ): string | undefined {
  if ( typeof fallback === 'string' && fallback.length > 0 ) {
    return fallback;
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
}
