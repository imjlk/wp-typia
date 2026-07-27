import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import {
  encodeGetLikeRequest,
  joinPathWithQuery,
  joinUrlWithQuery,
  parseResponsePayload,
} from '../src/client-utils';

describe('@wp-typia/api-client client-utils', () => {
	test('publishes the supported client-utils subpath', () => {
		const packageJson = JSON.parse(
			readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
		) as {
			exports?: Record<string, unknown>;
		};

		expect(packageJson.exports?.['./client-utils']).toEqual({
			default: './dist/client-utils.js',
			import: './dist/client-utils.js',
			types: './dist/client-utils.d.ts',
		});
	});

	test('rejects non-scalar query values for get-like request encoding', () => {
		expect(() =>
			encodeGetLikeRequest({
				filters: { status: 'open' },
			}),
		).toThrow(
			'GET/DELETE endpoint request field "filters" must be a scalar, URLSearchParams, or array of scalars.',
		);
	});

	test('preserves relative urls and hash fragments when appending queries', () => {
		expect(joinPathWithQuery('/items#details', 'page=2')).toBe('/items?page=2#details');
		expect(joinPathWithQuery('/items?view=grid#details', 'page=2')).toBe(
			'/items?view=grid&page=2#details',
		);
		expect(joinUrlWithQuery('/items#details', 'page=2')).toBe('/items?page=2#details');
	});

	test('parses JSON responses and falls back to raw text', async () => {
		await expect(
			parseResponsePayload(new Response(JSON.stringify({ ok: true }))),
		).resolves.toEqual({ ok: true });
		await expect(parseResponsePayload(new Response('not-json'))).resolves.toBe('not-json');
	});
});
