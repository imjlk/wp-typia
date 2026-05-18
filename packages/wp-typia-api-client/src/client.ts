import {
  isFormDataLike,
  isPlainObject,
  type ValidationResult,
} from './runtime-primitives.js';
import {
  encodeGetLikeRequest,
  joinPathWithQuery,
  joinUrlWithQuery,
  mergeHeaderInputs,
  parseResponsePayload,
} from './client-utils.js';
import { ApiClientConfigurationError } from './errors.js';

export type EndpointMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
export type EndpointAuthIntent =
  | 'authenticated'
  | 'public'
  | 'public-write-protected';
export type EndpointValidationTarget = 'request' | 'response';

export type {
  ValidationError,
  ValidationLike,
  ValidationResult,
} from './runtime-primitives.js';

export interface EndpointRequestValidationResult<
  Req,
> extends ValidationResult<Req> {
  isValid: false;
  validationTarget: 'request';
}

export interface EndpointResponseValidationResult<
  Res,
> extends ValidationResult<Res> {
  validationTarget: 'response';
}

export type EndpointValidationResult<Req, Res> =
  | EndpointRequestValidationResult<Req>
  | EndpointResponseValidationResult<Res>;

/**
 * Request shape consumed by `EndpointTransport`.
 *
 * @remarks
 * Transports may receive either a relative `path` or an absolute `url`.
 * Helpers in this module populate the remaining fields from endpoint metadata.
 *
 * @category Transport
 */
export interface EndpointTransportRequest {
  body?: BodyInit | null;
  headers?: HeadersInit;
  method?: EndpointMethod;
  parse?: boolean;
  path?: string;
  url?: string;
}

/**
 * Transport contract used to execute validated endpoint requests.
 *
 * @remarks
 * Implementations can wrap `fetch`, WordPress-aware clients, or any custom
 * request pipeline so long as they honor the parse toggle.
 *
 * @category Transport
 */
export type EndpointTransport = <T = unknown, Parse extends boolean = true>(
  options: EndpointTransportRequest & { parse?: Parse },
) => Promise<Parse extends false ? Response : T>;

/**
 * Contract definition for one generated endpoint.
 *
 * @remarks
 * Endpoints combine request/response validators with enough metadata to build
 * the final transport request in a transport-neutral way.
 *
 * @category Transport
 */
export interface ApiEndpoint<Req, Res> {
  authIntent?: EndpointAuthIntent;
  authMode?: string;
  buildRequestOptions?: (request: Req) => Partial<EndpointTransportRequest>;
  method: EndpointMethod;
  operationId?: string;
  path: string;
  requestLocation?: 'body' | 'query' | 'query-and-body';
  validateRequest: (input: unknown) => ValidationResult<Req>;
  validateResponse: (input: unknown) => ValidationResult<Res>;
}

/**
 * Optional overrides applied while executing an endpoint contract.
 *
 * @remarks
 * These options let callers swap transports or merge one-off request settings
 * without changing the endpoint definition itself.
 *
 * @category Transport
 */
export interface EndpointCallOptions {
  requestOptions?: Partial<Omit<EndpointTransportRequest, 'parse'>>;
  transport?: EndpointTransport;
}

type ComputedHeadersResolver = (
  request: Readonly<EndpointTransportRequest>,
) => HeadersInit | undefined | Promise<HeadersInit | undefined>;

type HeaderValueResolver =
  | string
  | null
  | undefined
  | ((
      request: Readonly<EndpointTransportRequest>,
    ) => string | null | undefined | Promise<string | null | undefined>);

interface FetchTransportOptions {
  baseUrl: string;
  defaultHeaders?: HeadersInit;
  fetchFn?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
export {
  normalizeValidationError,
  toValidationResult,
} from './runtime-primitives.js';

function resolveRequestUrl(
  options: EndpointTransportRequest,
  baseUrl: string,
): string {
  if (typeof options.url === 'string' && options.url.length > 0) {
    return new URL(options.url, baseUrl).toString();
  }

  if (typeof options.path === 'string' && options.path.length > 0) {
    return new URL(
      options.path.replace(/^\/+/, ''),
      baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    ).toString();
  }

  throw new ApiClientConfigurationError(
    'Transport requests must include either a path or a url.',
  );
}

function createReadonlyTransportRequest(
  request: EndpointTransportRequest,
): Readonly<EndpointTransportRequest> {
  return { ...request };
}

function buildQueryRequestOptions<Req>(
  endpoint: ApiEndpoint<Req, unknown>,
  baseOptions: Partial<EndpointTransportRequest>,
  request: unknown,
): EndpointTransportRequest {
  const query = encodeGetLikeRequest(request);
  const { path: basePath, url: baseUrl, ...transportOptions } = baseOptions;

  return baseUrl
    ? {
        ...transportOptions,
        method: endpoint.method,
        url: joinUrlWithQuery(baseUrl, query),
      }
    : {
        ...transportOptions,
        method: endpoint.method,
        path: joinPathWithQuery(basePath ?? endpoint.path, query),
      };
}

function buildBodyRequestOptions<Req>(
  endpoint: ApiEndpoint<Req, unknown>,
  baseOptions: Partial<EndpointTransportRequest>,
  request: unknown,
): EndpointTransportRequest {
  const { path: basePath, url: baseUrl, ...transportOptions } = baseOptions;
  const locationOptions = baseUrl
    ? { url: baseUrl }
    : { path: basePath ?? endpoint.path };

  if (isFormDataLike(request)) {
    return {
      ...transportOptions,
      body: request,
      method: endpoint.method,
      ...locationOptions,
    };
  }

  const headers = mergeHeaderInputs(
    { 'Content-Type': 'application/json' },
    baseOptions.headers,
  );

  return {
    ...transportOptions,
    body: typeof request === 'string' ? request : JSON.stringify(request),
    method: endpoint.method,
    ...(headers === undefined ? {} : { headers }),
    ...locationOptions,
  };
}

function resolveCombinedRequest(request: unknown): {
  body: unknown;
  query: unknown;
} {
  if (
    !isPlainObject(request) ||
    !Object.prototype.hasOwnProperty.call(request, 'body') ||
    !Object.prototype.hasOwnProperty.call(request, 'query')
  ) {
    throw new ApiClientConfigurationError(
      `Endpoints with requestLocation "query-and-body" require requests shaped like { query, body }.`,
    );
  }

  return {
    body: request.body,
    query: request.query,
  };
}

function buildEndpointRequestOptions<Req>(
  endpoint: ApiEndpoint<Req, unknown>,
  request: Req,
): EndpointTransportRequest {
  const requestLocation =
    endpoint.requestLocation ?? (endpoint.method === 'GET' ? 'query' : 'body');

  if (requestLocation === 'query') {
    const baseOptions = endpoint.buildRequestOptions?.(request) ?? {};
    return buildQueryRequestOptions(endpoint, baseOptions, request);
  }

  if (requestLocation === 'query-and-body') {
    if (endpoint.method === 'GET') {
      throw new ApiClientConfigurationError(
        'requestLocation "query-and-body" is not supported for GET endpoints.',
      );
    }

    const combinedRequest = resolveCombinedRequest(request);
    const baseOptions = endpoint.buildRequestOptions?.(request) ?? {};
    const bodyOptions = buildBodyRequestOptions(
      endpoint,
      baseOptions,
      combinedRequest.body,
    );
    return buildQueryRequestOptions(
      endpoint,
      bodyOptions,
      combinedRequest.query,
    );
  }

  const baseOptions = endpoint.buildRequestOptions?.(request) ?? {};
  return buildBodyRequestOptions(endpoint, baseOptions, request);
}

function mergeTransportOptions(
  baseOptions: EndpointTransportRequest,
  requestOptions?: Partial<EndpointTransportRequest>,
): EndpointTransportRequest {
  if (!requestOptions) {
    return baseOptions;
  }

  const { headers: requestHeaders, ...transportOptions } = requestOptions;
  const headers = mergeHeaderInputs(baseOptions.headers, requestHeaders);

  return {
    ...baseOptions,
    ...transportOptions,
    ...(headers === undefined ? {} : { headers }),
  };
}

/**
 * Create a fetch-backed transport for generated endpoint contracts.
 *
 * @remarks
 * Use this when your client should resolve relative endpoint paths from a
 * fixed API base URL and execute them with the standard Fetch API.
 *
 * @param options - Base URL, default headers, and optional fetch override.
 * @returns A transport compatible with `callEndpoint()` and the header helpers.
 * @example
 * ```ts
 * const transport = createFetchTransport({
 *   baseUrl: "https://example.com/wp-json/",
 * });
 * ```
 * @category Transport
 */
export function createFetchTransport(
  options: FetchTransportOptions,
): EndpointTransport {
  const { baseUrl, defaultHeaders, fetchFn = fetch } = options;
  return async <T = unknown, Parse extends boolean = true>(
    options: EndpointTransportRequest & { parse?: Parse },
  ): Promise<Parse extends false ? Response : T> => {
    const headers = mergeHeaderInputs(defaultHeaders, options.headers);
    const requestInit: RequestInit = {
      method: options.method ?? 'GET',
      ...(options.body === undefined ? {} : { body: options.body }),
      ...(headers === undefined ? {} : { headers }),
    };
    const response = await fetchFn(resolveRequestUrl(options, baseUrl), requestInit);

    if (options.parse === false) {
      return response as Parse extends false ? Response : T;
    }

    return (await parseResponsePayload(response)) as Parse extends false
      ? Response
      : T;
  };
}

/**
 * Add static headers to every request executed by a transport.
 *
 * @param transport - Base transport to wrap.
 * @param headers - Headers that should be merged into each request.
 * @returns A transport that preserves the original behavior plus static headers.
 * @category Transport
 */
export function withHeaders(
  transport: EndpointTransport,
  headers: HeadersInit,
): EndpointTransport {
  return withComputedHeaders(transport, () => headers);
}

/**
 * Add lazily computed headers to every request executed by a transport.
 *
 * @remarks
 * The resolver receives a readonly view of the pending request so it can derive
 * auth or trace headers without mutating the caller input.
 *
 * @param transport - Base transport to wrap.
 * @param resolveHeaders - Async or sync header resolver.
 * @returns A transport that merges computed headers before execution.
 * @category Transport
 */
export function withComputedHeaders(
  transport: EndpointTransport,
  resolveHeaders: ComputedHeadersResolver,
): EndpointTransport {
  return async <T = unknown, Parse extends boolean = true>(
    options: EndpointTransportRequest & { parse?: Parse },
  ): Promise<Parse extends false ? Response : T> => {
    const computedHeaders = await resolveHeaders(
      createReadonlyTransportRequest(options),
    );
    const headers = mergeHeaderInputs(computedHeaders, options.headers);

    return transport<T, Parse>({
      ...options,
      ...(headers === undefined ? {} : { headers }),
    });
  };
}

/**
 * Attach one computed header value to every request executed by a transport.
 *
 * @param transport - Base transport to wrap.
 * @param headerName - Header name to inject.
 * @param resolveValue - Async or sync resolver for the header value.
 * @returns A transport that only adds the header when a value is returned.
 * @category Transport
 */
export function withHeaderValue(
  transport: EndpointTransport,
  headerName: string,
  resolveValue: HeaderValueResolver,
): EndpointTransport {
  return withComputedHeaders(transport, async (request) => {
    const value =
      typeof resolveValue === 'function'
        ? await resolveValue(request)
        : resolveValue;

    return value === undefined || value === null
      ? undefined
      : { [headerName]: value };
  });
}

/**
 * Attach a computed bearer token to the Authorization header.
 *
 * @param transport - Base transport to wrap.
 * @param resolveToken - Async or sync resolver for the bearer token.
 * @returns A transport that injects `Authorization: Bearer ...` when available.
 * @category Transport
 */
export function withBearerToken(
  transport: EndpointTransport,
  resolveToken: HeaderValueResolver,
): EndpointTransport {
  return withHeaderValue(transport, 'Authorization', async (request) => {
    const token =
      typeof resolveToken === 'function'
        ? await resolveToken(request)
        : resolveToken;

    return token === undefined || token === null || token === ''
      ? undefined
      : `Bearer ${token}`;
  });
}

/**
 * Freeze an endpoint configuration as a typed public contract.
 *
 * @param config - Endpoint metadata and validators to expose.
 * @returns The same config, preserved as an `ApiEndpoint`.
 * @example
 * ```ts
 * const endpoint = createEndpoint({
 *   method: "GET",
 *   path: "/wp-typia/v1/items",
 *   validateRequest,
 *   validateResponse,
 * });
 * ```
 * @category Transport
 */
export function createEndpoint<Req, Res>(
  config: ApiEndpoint<Req, Res>,
): ApiEndpoint<Req, Res> {
  return config;
}

function isInvalidValidationResult<Req>(
  validation: ValidationResult<Req>,
): validation is ValidationResult<Req> & { isValid: false } {
  return validation.isValid === false;
}

function toEndpointRequestValidationResult<Req>(
  validation: ValidationResult<Req> & { isValid: false },
): EndpointRequestValidationResult<Req> {
  return {
    ...validation,
    validationTarget: 'request',
  };
}

function toEndpointResponseValidationResult<Res>(
  validation: ValidationResult<Res>,
): EndpointResponseValidationResult<Res> {
  return {
    ...validation,
    validationTarget: 'response',
  };
}

/**
 * Execute an endpoint contract with validated input and validated output.
 *
 * @remarks
 * Request validation runs before transport execution. Invalid requests return
 * a request-targeted validation result without performing a network call.
 *
 * @param endpoint - Contract describing the endpoint method, path, and validators.
 * @param request - Caller input to validate and serialize.
 * @param options - Optional transport and request overrides for this call.
 * @returns A validation result tagged as either a request or response outcome.
 * @example
 * ```ts
 * const result = await callEndpoint(endpoint, { id: "post-1" }, { transport });
 * ```
 * @category Transport
 */
export async function callEndpoint<Req, Res>(
  endpoint: ApiEndpoint<Req, Res>,
  request: Req,
  options: EndpointCallOptions = {},
): Promise<EndpointValidationResult<Req, Res>> {
  const { requestOptions, transport } = options;
  const requestValidation = endpoint.validateRequest(request);
  if (isInvalidValidationResult(requestValidation)) {
    return toEndpointRequestValidationResult(requestValidation);
  }

  if (!transport) {
    throw new ApiClientConfigurationError(
      'A transport is required. Create one with createFetchTransport({ baseUrl }) or supply a custom EndpointTransport.',
    );
  }

  const payload = await transport<unknown, true>({
    ...mergeTransportOptions(
      buildEndpointRequestOptions(endpoint, request),
      requestOptions,
    ),
    parse: true,
  });
  return toEndpointResponseValidationResult(endpoint.validateResponse(payload));
}
