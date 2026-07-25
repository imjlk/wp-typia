import { describe, expect, test } from 'bun:test';
import type { ApiFetch } from '@wordpress/api-fetch';
import {
  createEndpoint as createPortableEndpoint,
  toValidationResult as toPortableValidationResult,
} from '../../wp-typia-api-client/src/index';

import {
  ApiClientConfigurationError,
  RestConfigurationError,
  RestRootResolutionError,
  RestValidationAssertionError,
  callEndpoint,
  createEndpoint,
  createHeadersDecoder,
  createParameterDecoder,
  createQueryDecoder,
  createValidatedFetch,
  resolveRestRouteUrl,
  toValidationResult,
  type ValidationLike,
} from '../src/index';

function success<T>(data: T): ValidationLike<T> {
  return {
    data,
    errors: [],
    success: true,
  };
}

function failure<T>(expected: string, path = '(root)'): ValidationLike<T> {
  return {
    errors: [{ expected, path, value: undefined }],
    success: false,
  };
}

function asApiFetch(fn: (...args: any[]) => Promise<unknown>): ApiFetch {
  return fn as unknown as ApiFetch;
}

describe('@wp-typia/rest', () => {
	test('throws named public runtime errors for configuration and assertion faults', async () => {
		const fetcher = createValidatedFetch<{ count: number }>((input: unknown) =>
			typeof input === 'object' &&
			input !== null &&
			typeof (input as { count?: unknown }).count === 'number'
				? success(input as { count: number })
				: failure<{ count: number }>('{ count: number }', '$.count'),
		);
		const rejectingAssertionFetcher = createValidatedFetch<{ count: number }>(
			() => failure<{ count: number }>('{ count: number }', '$.count'),
			asApiFetch(async () => ({ ok: false }) as never),
		);

		expect(() => resolveRestRouteUrl('/demo')).toThrow(RestRootResolutionError);
		await expect(fetcher.fetch({} as never)).rejects.toBeInstanceOf(
			RestConfigurationError,
		);
		await expect(
			rejectingAssertionFetcher.assertFetch({ path: '/demo' }),
		).rejects.toBeInstanceOf(RestValidationAssertionError);
	});

	test('createValidatedFetch validates parsed responses', async () => {
		const fetcher = createValidatedFetch<{ count: number }>(
			(input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				typeof (input as { count?: unknown }).count === 'number'
					? success(input as { count: number })
					: failure<{ count: number }>('{ count: number }', '$.count'),
			asApiFetch(async () => ({ count: 2 }) as never),
		);

		const result = await fetcher.fetch({ path: '/demo' });

		expect(result.isValid).toBe(true);
		expect(result.data).toEqual({ count: 2 });
	});

	test('createValidatedFetch preserves the raw response for parse:false calls', async () => {
		const fetcher = createValidatedFetch<{ ok: boolean }>(
			(input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? success(input as { ok: boolean })
					: failure<{ ok: boolean }>('{ ok: true }', '$.ok'),
			asApiFetch(async () =>
				new Response(JSON.stringify({ ok: true }), {
					headers: { 'X-WP-TotalPages': '3' },
				}) as never),
		);

		const result = await fetcher.fetchWithResponse({
			parse: false,
			path: '/demo',
		});

		expect(result.response.headers.get('X-WP-TotalPages')).toBe('3');
		expect(result.validation.isValid).toBe(true);
		expect(result.validation.data).toEqual({ ok: true });
		await expect(result.response.text()).resolves.toBe('{"ok":true}');
	});

	test('createValidatedFetch tolerates empty parse:false responses', async () => {
		const fetcher = createValidatedFetch<undefined>(
			(input: unknown) =>
				input === undefined ? success(undefined) : failure<undefined>('undefined'),
			asApiFetch(async () => new Response(null, { status: 204 }) as never),
		);

		const result = await fetcher.fetchWithResponse({
			parse: false,
			path: '/demo',
		});

		expect(result.response.status).toBe(204);
		expect(result.validation.isValid).toBe(true);
		expect(result.validation.data).toBeUndefined();
	});

	test('callEndpoint validates GET requests and appends query parameters', async () => {
		let seenPath = '';
		const endpoint = createEndpoint<{ page: number }, { items: number[] }>({
			method: 'GET',
			path: '/items',
			validateRequest: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				typeof (input as { page?: unknown }).page === 'number'
					? toValidationResult(success(input as { page: number }))
					: toValidationResult(failure<{ page: number }>('{ page: number }', '$.page')),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				Array.isArray((input as { items?: unknown }).items)
					? toValidationResult(success(input as { items: number[] }))
					: toValidationResult(
							failure<{ items: number[] }>('{ items: number[] }', '$.items'),
						),
		});

		const result = await callEndpoint(
			endpoint,
			{ page: 2 },
			{
				fetchFn: asApiFetch(async (options: Record<string, unknown>) => {
					seenPath = String(options.path);
					return { items: [1, 2, 3] } as never;
				}),
			},
		);

		expect(seenPath).toBe('/items?page=2');
		expect(result.isValid).toBe(true);
		expect(result.data).toEqual({ items: [1, 2, 3] });
	});

	test('callEndpoint stringifies JSON bodies for non-GET endpoints', async () => {
		let seenBody = '';
		const endpoint = createEndpoint<{ title: string }, { ok: boolean }>({
			method: 'POST',
			path: '/items',
			validateRequest: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				typeof (input as { title?: unknown }).title === 'string'
					? toValidationResult(success(input as { title: string }))
					: toValidationResult(failure<{ title: string }>('{ title: string }', '$.title')),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		const result = await callEndpoint(
			endpoint,
			{ title: 'Hello' },
			{
				fetchFn: asApiFetch(async (options: Record<string, unknown>) => {
					seenBody = String(options.body);
					return { ok: true } as never;
				}),
			},
		);

		expect(seenBody).toContain('"title":"Hello"');
		expect(result.isValid).toBe(true);
		expect(result.data).toEqual({ ok: true });
	});

	test('callEndpoint preserves request validation targets before fetch execution', async () => {
		let fetchCalled = false;
		const endpoint = createEndpoint<{ title: string }, { ok: boolean }>({
			method: 'POST',
			path: '/items',
			validateRequest: () =>
				toValidationResult(
					failure<{ title: string }>('{ title: string }', '$.title'),
				),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		const result = await callEndpoint(endpoint, { title: 'Hello' }, {
			fetchFn: asApiFetch(async () => {
				fetchCalled = true;
				return { ok: true } as never;
			}),
		});

		expect(fetchCalled).toBe(false);
		expect(result.isValid).toBe(false);
		expect(result.validationTarget).toBe('request');
		expect(result.errors[0]?.path).toBe('$.title');
	});

	test('callEndpoint merges request-level headers', async () => {
		let seenHeaders: Record<string, unknown> | undefined;
		const endpoint = createEndpoint<{ title: string }, { ok: boolean }>({
			method: 'POST',
			path: '/items',
			validateRequest: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				typeof (input as { title?: unknown }).title === 'string'
					? toValidationResult(success(input as { title: string }))
					: toValidationResult(failure<{ title: string }>('{ title: string }', '$.title')),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		await callEndpoint(
			endpoint,
			{ title: 'Hello' },
			{
				fetchFn: asApiFetch(async (options: Record<string, unknown>) => {
					seenHeaders = options.headers as Record<string, unknown> | undefined;
					return { ok: true } as never;
				}),
				requestOptions: {
					headers: {
						'X-WP-Nonce': 'demo',
					},
				},
			},
		);

		expect(seenHeaders).toMatchObject({
			'content-type': 'application/json',
			'x-wp-nonce': 'demo',
		});
	});

	test('callEndpoint preserves Headers instances when merging request-level headers', async () => {
		let seenHeaders: Record<string, string> | undefined;
			const endpoint = createEndpoint<{ title: string }, { ok: boolean }>({
				buildRequestOptions: () => ({
					headers: new Headers({
						Authorization: 'Bearer seed',
					}) as unknown as Record<string, string>,
				}),
			method: 'POST',
			path: '/items',
			validateRequest: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				typeof (input as { title?: unknown }).title === 'string'
					? toValidationResult(success(input as { title: string }))
					: toValidationResult(failure<{ title: string }>('{ title: string }', '$.title')),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		await callEndpoint(
			endpoint,
			{ title: 'Hello' },
			{
				fetchFn: asApiFetch(async (options: Record<string, unknown>) => {
					seenHeaders = options.headers as Record<string, string> | undefined;
					return { ok: true } as never;
					}),
					requestOptions: {
						headers: new Headers({
							'X-WP-Nonce': 'demo',
						}) as unknown as Record<string, string>,
					},
				},
			);

		expect(seenHeaders).toMatchObject({
			authorization: 'Bearer seed',
			'content-type': 'application/json',
			'x-wp-nonce': 'demo',
		});
	});

	test('callEndpoint preserves buildRequestOptions url for non-GET endpoints', async () => {
		let seenUrl = '';
		let seenPath: unknown;
		const endpoint = createEndpoint<{ title: string }, { ok: boolean }>({
			buildRequestOptions: () => ({
				url: 'http://localhost:8889/wp-json/demo/v1/items/',
			}),
			method: 'POST',
			path: '/items',
			validateRequest: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				typeof (input as { title?: unknown }).title === 'string'
					? toValidationResult(success(input as { title: string }))
					: toValidationResult(failure<{ title: string }>('{ title: string }', '$.title')),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		await callEndpoint(
			endpoint,
			{ title: 'Hello' },
			{
				fetchFn: asApiFetch(async (options: Record<string, unknown>) => {
					seenUrl = String(options.url);
					seenPath = options.path;
					return { ok: true } as never;
				}),
			},
		);

		expect(seenUrl).toBe('http://localhost:8889/wp-json/demo/v1/items/');
		expect(seenPath).toBeUndefined();
	});

	test('callEndpoint accepts endpoint objects created by @wp-typia/api-client', async () => {
		let seenUrl = '';
		let seenMethod = '';
		const endpoint = {
			...createPortableEndpoint<{ page: number }, { items: number[] }>({
				method: 'GET',
				operationId: 'getPortableItems',
				path: '/demo/v1/items',
				requestLocation: 'query',
				validateRequest: (input: unknown) =>
					typeof input === 'object' &&
					input !== null &&
					typeof (input as { page?: unknown }).page === 'number'
						? toPortableValidationResult<{ page: number }>({
								data: input as { page: number },
								errors: [],
								success: true,
							})
						: toPortableValidationResult<{ page: number }>({
								errors: [{ expected: '{ page: number }', path: '$.page', value: undefined }],
								success: false,
							}),
				validateResponse: (input: unknown) =>
					typeof input === 'object' &&
					input !== null &&
					Array.isArray((input as { items?: unknown }).items)
						? toPortableValidationResult<{ items: number[] }>({
								data: input as { items: number[] },
								errors: [],
								success: true,
							})
						: toPortableValidationResult<{ items: number[] }>({
								errors: [{ expected: '{ items: number[] }', path: '$.items', value: undefined }],
								success: false,
							}),
			}),
			buildRequestOptions: () => ({
				url: resolveRestRouteUrl('/demo/v1/items', 'http://localhost:8889/wp-json/'),
			}),
		};

		const result = await callEndpoint(endpoint, { page: 3 }, {
			fetchFn: asApiFetch(async (options: Record<string, unknown>) => {
				seenMethod = String(options.method);
				seenUrl = String(options.url);
				return { items: [3] } as never;
			}),
		});

		expect(seenMethod).toBe('GET');
		expect(seenUrl).toBe('http://localhost:8889/wp-json/demo/v1/items/?page=3');
		expect(result.isValid).toBe(true);
		expect(result.data).toEqual({ items: [3] });
	});

	test('callEndpoint preserves query-and-body request locations for portable endpoints', async () => {
		let seenBody = '';
		let seenMethod = '';
		let seenUrl = '';
		const endpoint = {
			...createPortableEndpoint<
				{ body: { title: string }; query: { id: number } },
				{ ok: boolean }
			>({
				method: 'PATCH',
				operationId: 'updatePortableItem',
				path: '/demo/v1/items',
				requestLocation: 'query-and-body',
				validateRequest: (input: unknown) =>
					typeof input === 'object' &&
					input !== null &&
					typeof (input as { query?: { id?: unknown } }).query?.id === 'number' &&
					typeof (input as { body?: { title?: unknown } }).body?.title === 'string'
						? toPortableValidationResult<{
								body: { title: string };
								query: { id: number };
							}>({
								data: input as { body: { title: string }; query: { id: number } },
								errors: [],
								success: true,
							})
						: toPortableValidationResult<{
								body: { title: string };
								query: { id: number };
							}>({
								errors: [
									{
										expected: '{ query: { id: number }, body: { title: string } }',
										path: '$',
										value: input,
									},
								],
								success: false,
							}),
				validateResponse: (input: unknown) =>
					typeof input === 'object' &&
					input !== null &&
					(input as { ok?: unknown }).ok === true
						? toPortableValidationResult<{ ok: boolean }>({
								data: input as { ok: boolean },
								errors: [],
								success: true,
							})
						: toPortableValidationResult<{ ok: boolean }>({
								errors: [{ expected: '{ ok: true }', path: '$.ok', value: undefined }],
								success: false,
							}),
			}),
			buildRequestOptions: () => ({
				url: resolveRestRouteUrl('/demo/v1/items', 'http://localhost:8889/wp-json/'),
			}),
		};

		const result = await callEndpoint(
			endpoint,
			{
				body: { title: 'Updated' },
				query: { id: 7 },
			},
			{
				fetchFn: asApiFetch(async (options: Record<string, unknown>) => {
					seenBody = String(options.body);
					seenMethod = String(options.method);
					seenUrl = String(options.url);
					return { ok: true } as never;
				}),
			},
		);

		expect(seenMethod).toBe('PATCH');
		expect(seenUrl).toBe('http://localhost:8889/wp-json/demo/v1/items/?id=7');
		expect(seenBody).toBe(JSON.stringify({ title: 'Updated' }));
		expect(result.isValid).toBe(true);
		expect(result.data).toEqual({ ok: true });
	});

	test('callEndpoint rejects GET endpoints configured with requestLocation body', async () => {
		const endpoint = {
			...createPortableEndpoint<{ slug: string }, { ok: boolean }>({
				method: 'GET',
				operationId: 'getPortableItemBody',
				path: '/demo/v1/items',
				requestLocation: 'body',
				validateRequest: (input: unknown) =>
					typeof input === 'object' &&
					input !== null &&
					typeof (input as { slug?: unknown }).slug === 'string'
						? toPortableValidationResult<{ slug: string }>({
								data: input as { slug: string },
								errors: [],
								success: true,
							})
						: toPortableValidationResult<{ slug: string }>({
								errors: [{ expected: '{ slug: string }', path: '$.slug', value: undefined }],
								success: false,
							}),
				validateResponse: (input: unknown) =>
					typeof input === 'object' &&
					input !== null &&
					(input as { ok?: unknown }).ok === true
						? toPortableValidationResult<{ ok: boolean }>({
								data: input as { ok: boolean },
								errors: [],
								success: true,
							})
						: toPortableValidationResult<{ ok: boolean }>({
								errors: [{ expected: '{ ok: true }', path: '$.ok', value: undefined }],
								success: false,
							}),
			}),
			buildRequestOptions: () => ({
				url: resolveRestRouteUrl('/demo/v1/items', 'http://localhost:8889/wp-json/'),
			}),
		};

		await expect(
			callEndpoint(endpoint, { slug: 'hero-card' }, {
				fetchFn: asApiFetch(async () => ({ ok: true }) as never),
			}),
		).rejects.toBeInstanceOf(ApiClientConfigurationError);
	});

	test('GET endpoints reject nested query values before invoking api-fetch', async () => {
		let fetchCalled = false;
		const endpoint = createEndpoint<{ filters: { status: string } }, { ok: boolean }>({
			method: 'GET',
			path: '/items',
			validateRequest: (input: unknown) =>
				toValidationResult(success(input as { filters: { status: string } })),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		await expect(
			callEndpoint(endpoint, { filters: { status: 'open' } }, {
				fetchFn: asApiFetch(async () => {
					fetchCalled = true;
					return { ok: true } as never;
				}),
			}),
		).rejects.toThrow(
			'GET/DELETE endpoint request field "filters" must be a scalar, URLSearchParams, or array of scalars.',
		);
		expect(fetchCalled).toBe(false);
	});

	test('resolveRestRouteUrl canonicalizes wp-json roots and route slashes', () => {
		const resolved = resolveRestRouteUrl('/demo/v1/items', 'http://localhost:8889/wp-json/');

		expect(resolved).toBe('http://localhost:8889/wp-json/demo/v1/items/');
	});

	test('resolveRestRouteUrl preserves query strings while canonicalizing routes', () => {
		const resolved = resolveRestRouteUrl('/demo/v1/items?page=2', 'http://localhost:8889/wp-json/');

		expect(resolved).toBe('http://localhost:8889/wp-json/demo/v1/items/?page=2');
	});

	test('resolveRestRouteUrl preserves rest_route roots', () => {
		const resolved = resolveRestRouteUrl('/demo/v1/items', 'http://localhost:8889/index.php?rest_route=/');

		expect(resolved).toBe('http://localhost:8889/index.php?rest_route=%2Fdemo%2Fv1%2Fitems%2F');
	});

	test('resolveRestRouteUrl falls back to the api.w.org link root when wpApiSettings.root is absent', () => {
		const originalWindow = globalThis.window;
		const originalDocument = globalThis.document;

		const fakeWindow = {
			location: {
				origin: 'http://localhost:8889',
			},
			wpApiSettings: undefined,
		} as unknown as Window & typeof globalThis;
		const fakeDocument = {
			querySelector: (selector: string) =>
				selector === 'link[rel="https://api.w.org/"]'
					? {
							getAttribute: (name: string) =>
								name === 'href' ? 'http://localhost:8889/index.php?rest_route=/' : null,
						}
					: null,
		} as unknown as Document;

		globalThis.window = fakeWindow;
		globalThis.document = fakeDocument;

		try {
			const resolved = resolveRestRouteUrl('/demo/v1/items');

			expect(resolved).toBe(
				'http://localhost:8889/index.php?rest_route=%2Fdemo%2Fv1%2Fitems%2F',
			);
		} finally {
			globalThis.window = originalWindow;
			globalThis.document = originalDocument;
		}
	});

	test('resolveRestRouteUrl throws when no REST root or discovery link is available', () => {
		const originalWindow = globalThis.window;
		const originalDocument = globalThis.document;

		globalThis.window = {
			location: {
				origin: 'http://localhost:8889',
			},
			wpApiSettings: undefined,
		} as unknown as Window & typeof globalThis;
		globalThis.document = {
			querySelector: () => null,
		} as unknown as Document;

		try {
			expect(() => resolveRestRouteUrl('/demo/v1/items')).toThrow(
				'Unable to resolve the WordPress REST root automatically.',
			);
		} finally {
			globalThis.window = originalWindow;
			globalThis.document = originalDocument;
		}
	});

	test('createQueryDecoder and createHeadersDecoder accept explicit validation decoders', () => {
		const decodeQuery = createQueryDecoder<{ page: number; search?: string }>((input: string | URLSearchParams) => {
			const params = typeof input === 'string' ? new URLSearchParams(input) : input;
			const page = Number(params.get('page') ?? '0');
			const search = params.get('search') ?? undefined;
			return Number.isFinite(page)
				? success({ page, ...(search ? { search } : {}) })
				: failure<{ page: number; search?: string }>('{ page: number }', '$.page');
		});
		const decodeHeaders = createHeadersDecoder<{ authorization: string }>((headers: Record<string, string | string[] | undefined>) =>
			typeof headers.authorization === 'string'
				? success({ authorization: headers.authorization })
				: failure<{ authorization: string }>('{ authorization: string }', '$.authorization'),
		);

		const queryResult = decodeQuery('page=2&search=blocks');
		const headerResult = decodeHeaders(
			new Headers({
				authorization: 'Bearer demo',
			}),
		);

		expect(queryResult.isValid).toBe(true);
		expect(queryResult.data).toEqual({
			page: 2,
			search: 'blocks',
		});
		expect(headerResult.isValid).toBe(true);
		expect(headerResult.data).toEqual({
			authorization: 'Bearer demo',
		});
	});

	test('createParameterDecoder decodes primitive values', () => {
		const decode = createParameterDecoder<string | number | boolean | bigint | null>();

		expect(decode('true')).toBe(true);
		expect(decode('42')).toBe(42);
		expect(decode('9007199254740993')).toBe(BigInt('9007199254740993'));
		expect(decode('null')).toBeNull();
		expect(decode('slug-value')).toBe('slug-value');
	});
});
