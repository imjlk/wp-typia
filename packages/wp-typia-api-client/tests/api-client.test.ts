import { describe, expect, test } from 'bun:test';

import {
  callEndpoint,
  createEndpoint,
  createFetchTransport,
  toValidationResult,
  withBearerToken,
  withComputedHeaders,
  withHeaders,
  withHeaderValue,
  type ApiEndpoint,
  type EndpointTransport,
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

function createOkEndpoint<Req>(
	config: Partial<ApiEndpoint<Req, { ok: boolean }>> = {},
): ApiEndpoint<Req, { ok: boolean }> {
  return createEndpoint<Req, { ok: boolean }>({
		method: config.method ?? 'GET',
		path: config.path ?? '/items',
		...(config.requestLocation
			? { requestLocation: config.requestLocation }
			: {}),
		...(config.buildRequestOptions
			? { buildRequestOptions: config.buildRequestOptions }
			: {}),
		validateRequest: config.validateRequest ?? ((input: unknown) => toValidationResult(success(input as Req))),
		validateResponse:
			config.validateResponse ??
			((input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok'))),
	});
}

function createCapturingTransport(
	onRequest: (options: Parameters<EndpointTransport>[0]) => void,
): EndpointTransport {
  return async <T = unknown, Parse extends boolean = true>(
		options: Parameters<EndpointTransport>[0] & { parse?: Parse },
	): Promise<Parse extends false ? Response : T> => {
    onRequest(options);
    return { ok: true } as Parse extends false ? Response : T;
  };
}

describe('@wp-typia/api-client', () => {
	test('createFetchTransport appends query parameters for GET requests', async () => {
		let seenUrl = '';
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async (input) => {
				seenUrl = String(input);
				return new Response(JSON.stringify({ items: [1, 2, 3] }));
			},
		});
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
					: toValidationResult(failure<{ items: number[] }>('{ items: number[] }', '$.items')),
		});

		const result = await callEndpoint(endpoint, { page: 2 }, { transport });

		expect(seenUrl).toBe('https://example.test/api/items?page=2');
		expect(result.isValid).toBe(true);
		expect(result.data).toEqual({ items: [1, 2, 3] });
	});

	test('relative GET endpoint urls keep the configured transport baseUrl host', async () => {
		let seenUrl = '';
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async (input) => {
				seenUrl = String(input);
				return new Response(JSON.stringify({ items: [4, 5] }));
			},
		});
		const endpoint = createEndpoint<{ page: number }, { items: number[] }>({
			buildRequestOptions: () => ({
				url: '/items/search',
			}),
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
					: toValidationResult(failure<{ items: number[] }>('{ items: number[] }', '$.items')),
		});

		const result = await callEndpoint(endpoint, { page: 2 }, { transport });

		expect(seenUrl).toBe('https://example.test/items/search?page=2');
		expect(result.isValid).toBe(true);
		expect(result.data).toEqual({ items: [4, 5] });
	});

	test('createFetchTransport stringifies JSON bodies for non-GET requests', async () => {
		let seenBody = '';
		let seenMethod = '';
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async (_input, init) => {
				seenMethod = String(init?.method);
				seenBody = String(init?.body);
				return new Response(JSON.stringify({ ok: true }));
			},
		});
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

		const result = await callEndpoint(endpoint, { title: 'Hello' }, { transport });

		expect(seenMethod).toBe('POST');
		expect(seenBody).toContain('"title":"Hello"');
		expect(result.isValid).toBe(true);
		expect(result.data).toEqual({ ok: true });
	});

	test('createFetchTransport preserves JSON bodies for DELETE requests', async () => {
		let seenBody = '';
		let seenMethod = '';
		let seenUrl = '';
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async (input, init) => {
				seenMethod = String(init?.method);
				seenUrl = String(input);
				seenBody = String(init?.body);
				return new Response(JSON.stringify({ ok: true }));
			},
		});
		const endpoint = createEndpoint<{ title: string }, { ok: boolean }>({
			method: 'DELETE',
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

		const result = await callEndpoint(endpoint, { title: 'Hello' }, { transport });

		expect(seenMethod).toBe('DELETE');
		expect(seenUrl).toBe('https://example.test/api/items');
		expect(seenBody).toContain('"title":"Hello"');
		expect(result.isValid).toBe(true);
		expect(result.data).toEqual({ ok: true });
	});

	test('callEndpoint returns request validation failures before transport execution', async () => {
		let transportCalled = false;
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async () => {
				transportCalled = true;
				return new Response(JSON.stringify({ ok: true }));
			},
		});
		const endpoint = createEndpoint<{ title: string }, { ok: boolean }>({
			method: 'POST',
			path: '/items',
			validateRequest: () => toValidationResult(failure<{ title: string }>('{ title: string }', '$.title')),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		const result = await callEndpoint(endpoint, { title: 'Hello' }, { transport });

		expect(transportCalled).toBe(false);
		expect(result.isValid).toBe(false);
		expect(result.validationTarget).toBe('request');
		expect(result.errors[0]?.path).toBe('$.title');
	});

	test('callEndpoint returns response validation failures after transport execution', async () => {
		let transportCalled = false;
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async () => {
				transportCalled = true;
				return new Response(JSON.stringify({ ok: 'nope' }));
			},
		});
		const endpoint = createEndpoint<{ title: string }, { ok: boolean }>({
			method: 'POST',
			path: '/items',
			validateRequest: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				typeof (input as { title?: unknown }).title === 'string'
					? toValidationResult(success(input as { title: string }))
					: toValidationResult(failure<{ title: string }>('{ title: string }', '$.title')),
			validateResponse: () => toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		const result = await callEndpoint(endpoint, { title: 'Hello' }, { transport });

		expect(transportCalled).toBe(true);
		expect(result.isValid).toBe(false);
		expect(result.validationTarget).toBe('response');
		expect(result.errors[0]?.path).toBe('$.ok');
	});

	test('createFetchTransport supports parse:false for raw response access', async () => {
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async () =>
				new Response(JSON.stringify({ ok: true }), {
					headers: { 'X-Total-Pages': '3' },
				}),
		});

		const response = await transport<Response, false>({
			parse: false,
			path: '/items',
		});

		expect(response.headers.get('X-Total-Pages')).toBe('3');
		await expect(response.text()).resolves.toBe('{"ok":true}');
	});

	test('callEndpoint forces parsed responses even when requestOptions is cast with parse:false', async () => {
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async () => new Response(JSON.stringify({ ok: true })),
		});
		const endpoint = createEndpoint<undefined, { ok: boolean }>({
			method: 'GET',
			path: '/items',
			validateRequest: () => toValidationResult(success(undefined)),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		const result = await callEndpoint(endpoint, undefined, {
			requestOptions: { parse: false } as never,
			transport,
		});

		expect(result.isValid).toBe(true);
		expect(result.data).toEqual({ ok: true });
	});

	test('createFetchTransport rejects nested query objects instead of stringifying them', async () => {
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async () => new Response(JSON.stringify({ ok: true })),
		});
		const endpoint = createEndpoint<
			{ filters: { status: string } },
			{ ok: boolean }
		>({
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
			callEndpoint(endpoint, { filters: { status: 'open' } }, { transport }),
		).rejects.toThrow(
			'GET/DELETE endpoint request field "filters" must be a scalar, URLSearchParams, or array of scalars.',
		);
	});

	test('DELETE endpoints can serialize query contracts into URL params', async () => {
		let seenMethod = '';
		let seenUrl = '';
		let seenBody: BodyInit | null | undefined;
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async (input, init) => {
				seenMethod = String(init?.method);
				seenUrl = String(input);
				seenBody = init?.body;
				return new Response(JSON.stringify({ ok: true }));
			},
		});
		const endpoint = createEndpoint<{ force: boolean }, { ok: boolean }>({
			method: 'DELETE',
			path: '/items',
			requestLocation: 'query',
			validateRequest: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				typeof (input as { force?: unknown }).force === 'boolean'
					? toValidationResult(success(input as { force: boolean }))
					: toValidationResult(failure<{ force: boolean }>('{ force: boolean }', '$.force')),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		const result = await callEndpoint(endpoint, { force: true }, { transport });

		expect(seenMethod).toBe('DELETE');
		expect(seenUrl).toBe('https://example.test/api/items?force=true');
		expect(seenBody).toBeUndefined();
		expect(result.isValid).toBe(true);
		expect(result.data).toEqual({ ok: true });
	});

	test('query-and-body endpoints serialize query params and JSON bodies together', async () => {
		let seenMethod = '';
		let seenUrl = '';
		let seenBody = '';
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async (input, init) => {
				seenMethod = String(init?.method);
				seenUrl = String(input);
				seenBody = String(init?.body);
				return new Response(JSON.stringify({ ok: true }));
			},
		});
		const endpoint = createEndpoint<
			{ query: { page: number; tag: string[] }; body: { title: string } },
			{ ok: boolean }
		>({
			method: 'POST',
			path: '/items',
			requestLocation: 'query-and-body',
			validateRequest: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				typeof (input as { query?: { page?: unknown } }).query?.page === 'number' &&
				typeof (input as { body?: { title?: unknown } }).body?.title === 'string'
					? toValidationResult(
							success(
								input as {
									query: { page: number; tag: string[] };
									body: { title: string };
								},
							),
						)
					: toValidationResult(
							failure<{
								query: { page: number; tag: string[] };
								body: { title: string };
							}>('{ query, body }'),
						),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		const result = await callEndpoint(
			endpoint,
			{
				body: { title: 'Hello' },
				query: { page: 2, tag: ['a', 'b'] },
			},
			{ transport },
		);

		expect(seenMethod).toBe('POST');
		expect(seenUrl).toBe('https://example.test/api/items?page=2&tag=a&tag=b');
		expect(seenBody).toContain('"title":"Hello"');
		expect(result.isValid).toBe(true);
		expect(result.data).toEqual({ ok: true });
	});

	test('query-and-body endpoints reject malformed envelopes at runtime', async () => {
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async () => new Response(JSON.stringify({ ok: true })),
		});
		const endpoint = createEndpoint<unknown, { ok: boolean }>({
			method: 'POST',
			path: '/items',
			requestLocation: 'query-and-body',
			validateRequest: (input: unknown) => toValidationResult(success(input)),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		await expect(
			callEndpoint(endpoint, { query: { page: 2 } }, { transport }),
		).rejects.toThrow(
			'Endpoints with requestLocation "query-and-body" require requests shaped like { query, body }.',
		);
	});

	test('query-and-body endpoints reject GET methods before transport execution', async () => {
		let transportCalled = false;
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async () => {
				transportCalled = true;
				return new Response(JSON.stringify({ ok: true }));
			},
		});
		const endpoint = createEndpoint<
			{ query: { page: number }; body: { title: string } },
			{ ok: boolean }
		>({
			method: 'GET',
			path: '/items',
			requestLocation: 'query-and-body',
			validateRequest: (input: unknown) =>
				toValidationResult(
					success(
						input as {
							query: { page: number };
							body: { title: string };
						},
					),
				),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		await expect(
			callEndpoint(
				endpoint,
				{
					body: { title: 'Hello' },
					query: { page: 2 },
				},
				{ transport },
			),
		).rejects.toThrow(
			'requestLocation "query-and-body" is not supported for GET endpoints.',
		);
		expect(transportCalled).toBe(false);
	});

	test('query-and-body endpoints validate the envelope before custom request builders run', async () => {
		let builderCalled = false;
		const transport = createFetchTransport({
			baseUrl: 'https://example.test/api/',
			fetchFn: async () => new Response(JSON.stringify({ ok: true })),
		});
		const endpoint = createEndpoint<unknown, { ok: boolean }>({
			buildRequestOptions: (request) => {
				builderCalled = true;
				return {
					path: `/items/${String((request as { query?: { page?: unknown } }).query?.page)}`,
				};
			},
			method: 'POST',
			path: '/items',
			requestLocation: 'query-and-body',
			validateRequest: (input: unknown) => toValidationResult(success(input)),
			validateResponse: (input: unknown) =>
				typeof input === 'object' &&
				input !== null &&
				(input as { ok?: unknown }).ok === true
					? toValidationResult(success(input as { ok: boolean }))
					: toValidationResult(failure<{ ok: boolean }>('{ ok: true }', '$.ok')),
		});

		await expect(
			callEndpoint(endpoint, { query: { page: 2 } }, { transport }),
		).rejects.toThrow(
			'Endpoints with requestLocation "query-and-body" require requests shaped like { query, body }.',
		);
		expect(builderCalled).toBe(false);
	});

	test('withHeaders injects static default headers into transport requests', async () => {
		let seenHeaders: Record<string, string> | undefined;
		const transport = withHeaders(
			createCapturingTransport((options) => {
				seenHeaders = Object.fromEntries(new Headers(options.headers).entries());
			}),
			{ 'X-Client': 'portable' },
		);

		const result = await callEndpoint(
			createOkEndpoint<{ page: number }>({
				validateRequest: (input: unknown) =>
					typeof input === 'object' &&
					input !== null &&
					typeof (input as { page?: unknown }).page === 'number'
						? toValidationResult(success(input as { page: number }))
						: toValidationResult(failure<{ page: number }>('{ page: number }', '$.page')),
			}),
			{ page: 2 },
			{ transport },
		);

		expect(seenHeaders).toMatchObject({
			'x-client': 'portable',
		});
		expect(result.isValid).toBe(true);
	});

	test('withComputedHeaders supports async resolvers and sees the full transport request', async () => {
		let seenRequest: Parameters<ComputedHeadersProbe>[0] | undefined;
		let seenHeaders: Record<string, string> | undefined;
		type ComputedHeadersProbe = (
			request: Readonly<{
				body?: BodyInit | null;
				headers?: HeadersInit;
				method?: string;
				parse?: boolean;
				path?: string;
				url?: string;
			}>,
		) => Promise<HeadersInit | undefined>;

		const transport = withComputedHeaders(
			createCapturingTransport((options) => {
				seenHeaders = Object.fromEntries(new Headers(options.headers).entries());
			}),
			async (request) => {
				seenRequest = request;
				await Promise.resolve();
				return { 'X-Request-Method': String(request.method ?? 'unknown') };
			},
		);

		await callEndpoint(
			createOkEndpoint<{ page: number }>({
				validateRequest: (input: unknown) =>
					typeof input === 'object' &&
					input !== null &&
					typeof (input as { page?: unknown }).page === 'number'
						? toValidationResult(success(input as { page: number }))
						: toValidationResult(failure<{ page: number }>('{ page: number }', '$.page')),
			}),
			{ page: 2 },
			{ transport },
		);

		expect(seenRequest?.method).toBe('GET');
		expect(seenRequest?.path).toBe('/items?page=2');
		expect(seenHeaders).toMatchObject({
			'x-request-method': 'GET',
		});
	});

	test('withHeaderValue injects a single dynamic header', async () => {
		let seenHeaders: Record<string, string> | undefined;
		const transport = withHeaderValue(
			createCapturingTransport((options) => {
				seenHeaders = Object.fromEntries(new Headers(options.headers).entries());
			}),
			'X-Request-Id',
			(request) => `req:${request.method ?? 'unknown'}`,
		);

		await callEndpoint(createOkEndpoint<{ page: number }>(), { page: 2 }, { transport });

		expect(seenHeaders).toMatchObject({
			'x-request-id': 'req:GET',
		});
	});

	test('withHeaderValue skips undefined and null values', async () => {
		const seenHeaders: Array<Record<string, string>> = [];
		const transport = withHeaderValue(
			createCapturingTransport((options) => {
				seenHeaders.push(Object.fromEntries(new Headers(options.headers).entries()));
			}),
			'X-Optional',
			(request) =>
				request.path?.includes('skip-null')
					? null
					: undefined,
		);

		await transport({ method: 'GET', path: '/skip-undefined', parse: true });
		await transport({ method: 'GET', path: '/skip-null', parse: true });

		expect(seenHeaders).toEqual([{}, {}]);
	});

	test('withBearerToken formats Authorization headers and skips empty tokens', async () => {
		const seenHeaders: Array<Record<string, string>> = [];
		const baseTransport = createCapturingTransport((options) => {
			seenHeaders.push(Object.fromEntries(new Headers(options.headers).entries()));
		});
		const withValidToken = withBearerToken(baseTransport, 'demo-token');
		const withEmptyToken = withBearerToken(baseTransport, '');

		await callEndpoint(createOkEndpoint<{ page: number }>(), { page: 2 }, { transport: withValidToken });
		await callEndpoint(createOkEndpoint<{ page: number }>(), { page: 3 }, { transport: withEmptyToken });

		expect(seenHeaders[0]).toMatchObject({
			authorization: 'Bearer demo-token',
		});
		expect(seenHeaders[1]).toEqual({});
	});

	test('transport decorators compose in wrapper order', async () => {
		let seenHeaders: Record<string, string> | undefined;
		const transport = withHeaderValue(
			withHeaders(
				createCapturingTransport((options) => {
					seenHeaders = Object.fromEntries(new Headers(options.headers).entries());
				}),
				{ 'X-Client': 'inner' },
			),
			'X-Client',
			'outer',
		);

		await callEndpoint(createOkEndpoint<{ page: number }>(), { page: 2 }, { transport });

		expect(seenHeaders).toMatchObject({
			'x-client': 'outer',
		});
	});

	test('per-call request headers override helper-injected defaults', async () => {
		let seenHeaders: Record<string, string> | undefined;
		const transport = withHeaders(
			createCapturingTransport((options) => {
				seenHeaders = Object.fromEntries(new Headers(options.headers).entries());
			}),
			{ 'X-Client': 'helper-default' },
		);

		await callEndpoint(
			createOkEndpoint<{ page: number }>(),
			{ page: 2 },
			{
				requestOptions: {
					headers: {
						'X-Client': 'per-call',
					},
				},
				transport,
			},
		);

		expect(seenHeaders).toMatchObject({
			'x-client': 'per-call',
		});
	});

	test('decorator headers override createFetchTransport defaultHeaders', async () => {
		let seenHeaders: Headers | undefined;
		const transport = withHeaders(
			createFetchTransport({
				baseUrl: 'https://example.test/api/',
				defaultHeaders: {
					'X-Client': 'fetch-default',
				},
				fetchFn: async (_input, init) => {
					seenHeaders = new Headers(init?.headers);
					return new Response(JSON.stringify({ ok: true }));
				},
			}),
			{ 'X-Client': 'decorator-default' },
		);

		const result = await callEndpoint(
			createOkEndpoint<{ page: number }>(),
			{ page: 2 },
			{ transport },
		);

		expect(seenHeaders?.get('X-Client')).toBe('decorator-default');
		expect(result.isValid).toBe(true);
	});
});
