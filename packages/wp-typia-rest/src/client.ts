import type { APIFetchOptions, ApiFetch } from '@wordpress/api-fetch';
import type {
  EndpointRequestValidationResult,
  EndpointResponseValidationResult,
  EndpointValidationResult,
} from '@wp-typia/api-client';
import {
  encodeGetLikeRequest,
  joinPathWithQuery,
  joinUrlWithQuery,
  mergeHeaderInputs,
  parseResponsePayload,
} from '@wp-typia/api-client/client-utils';
import {
  isPlainObject,
  isFormDataLike,
  toValidationResult,
  type ValidationLike,
  type ValidationResult,
} from './internal/runtime-primitives.js';
import {
  ApiClientConfigurationError,
  RestConfigurationError,
  RestRootResolutionError,
  RestValidationAssertionError,
} from './errors.js';

export type {
  ValidationError,
  ValidationLike,
  ValidationResult,
} from './internal/runtime-primitives.js';
export {
  isValidationResult,
  normalizeValidationError,
  toValidationResult,
} from './internal/runtime-primitives.js';
export {
  ApiClientConfigurationError,
  RestConfigurationError,
  RestRootResolutionError,
  RestValidationAssertionError,
  WpTypiaContractError,
  WpTypiaValidationAssertionError,
} from './errors.js';
export type {
  EndpointRequestValidationResult,
  EndpointResponseValidationResult,
  EndpointValidationResult,
  EndpointValidationTarget,
} from '@wp-typia/api-client';

/**
 * WordPress-aware fetch helper that validates response payloads.
 *
 * @remarks
 * Each method keeps the original `apiFetch` request shape while exposing
 * either soft validation results or throwing assertion flows.
 *
 * @category Validation
 */
export interface ValidatedFetch<T> {
  assertFetch(options: APIFetchOptions): Promise<T>;
  fetch(options: APIFetchOptions): Promise<ValidationResult<T>>;
  fetchWithResponse(
    options: APIFetchOptions<false>,
  ): Promise<{ response: Response; validation: ValidationResult<T> }>;
  isFetch(options: APIFetchOptions): Promise<T | null>;
}

/**
 * WordPress REST endpoint contract with request and response validators.
 *
 * @remarks
 * Use this contract when integrating with `@wordpress/api-fetch` or the React
 * helpers from `@wp-typia/rest/react`.
 *
 * @category REST
 */
export interface ApiEndpoint<Req, Res> {
  buildRequestOptions?: (request: Req) => Partial<APIFetchOptions>;
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  path: string;
  requestLocation?: 'body' | 'query' | 'query-and-body';
  validateRequest: (input: unknown) => ValidationResult<Req>;
  validateResponse: (input: unknown) => ValidationResult<Res>;
}

/**
 * Optional overrides applied while executing a WordPress REST contract.
 *
 * @category REST
 */
export interface EndpointCallOptions {
  fetchFn?: ApiFetch;
  requestOptions?: Partial<APIFetchOptions>;
}

function getDefaultRestRoot(): string {
  if (typeof window !== 'undefined') {
    const wpApiSettings = (
      window as typeof window & {
        wpApiSettings?: { root?: string };
      }
    ).wpApiSettings;

    if (
      typeof wpApiSettings?.root === 'string' &&
      wpApiSettings.root.length > 0
    ) {
      return wpApiSettings.root;
    }

    if (typeof document !== 'undefined') {
      const apiLink = document.querySelector('link[rel="https://api.w.org/"]');
      const href = apiLink?.getAttribute('href');

      if (typeof href === 'string' && href.length > 0) {
        return new URL(href, window.location.origin).toString();
      }
    }
  }

  throw new RestRootResolutionError(
    'Unable to resolve the WordPress REST root automatically. Provide wpApiSettings.root, an api.w.org discovery link, or an explicit url.',
  );
}

/**
 * Resolve a WordPress REST route into an absolute URL.
 *
 * @remarks
 * The resolver preserves query strings and hash fragments and supports both
 * pretty permalink roots and `rest_route` query-style roots.
 *
 * @param routePath - WordPress REST route such as `/wp-typia/v1/items`.
 * @param root - Explicit REST root. Defaults to automatic WordPress discovery.
 * @returns An absolute URL ready to pass to `fetch()` or `apiFetch`.
 * @example
 * ```ts
 * const url = resolveRestRouteUrl("/wp-typia/v1/items?limit=10");
 * ```
 * @category REST
 */
export function resolveRestRouteUrl(
  routePath: string,
  root = getDefaultRestRoot(),
): string {
  const [pathWithQuery = '', hash = ''] = routePath.split('#', 2);
  const [rawPath = '', rawQuery = ''] = pathWithQuery.split('?', 2);
  const normalizedRoute = `/${rawPath.replace(/^\/+/, '').replace(/\/+$/, '')}/`;
  const queryParams = new URLSearchParams(rawQuery);
  const resolvedRoot =
    typeof window !== 'undefined'
      ? new URL(root, window.location.origin)
      : new URL(root);

  if (resolvedRoot.searchParams.has('rest_route')) {
    resolvedRoot.searchParams.set('rest_route', normalizedRoute);
    for (const [key, value] of queryParams) {
      resolvedRoot.searchParams.append(key, value);
    }
    if (hash) {
      resolvedRoot.hash = hash;
    }
    return resolvedRoot.toString();
  }

  const basePath = resolvedRoot.pathname.endsWith('/')
    ? resolvedRoot.pathname
    : `${resolvedRoot.pathname}/`;
  resolvedRoot.pathname = `${basePath}${normalizedRoute.slice(1)}`;
  for (const [key, value] of queryParams) {
    resolvedRoot.searchParams.append(key, value);
  }
  if (hash) {
    resolvedRoot.hash = hash;
  }
  return resolvedRoot.toString();
}

function resolveFetchUrl(options: APIFetchOptions): string {
  if (typeof options.url === 'string' && options.url.length > 0) {
    return options.url;
  }

  if (typeof options.path === 'string' && options.path.length > 0) {
    return resolveRestRouteUrl(options.path);
  }

  throw new RestConfigurationError(
    'API fetch options must include either a path or a url.',
  );
}

async function defaultFetch<T = unknown, Parse extends boolean = true>(
  options: APIFetchOptions<Parse>,
): Promise<Parse extends false ? Response : T> {
  const requestInit: RequestInit = {
    credentials: 'same-origin',
    method: options.method ?? 'GET',
    ...(options.body === undefined
      ? {}
      : { body: options.body as BodyInit | null }),
    ...(options.headers === undefined
      ? {}
      : { headers: options.headers as HeadersInit }),
  };
  const response = await fetch(resolveFetchUrl(options), requestInit);

  if (options.parse === false) {
    return response as Parse extends false ? Response : T;
  }

  if (response.status === 204) {
    return undefined as Parse extends false ? Response : T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as Parse extends false ? Response : T;
  }

  try {
    return JSON.parse(text) as Parse extends false ? Response : T;
  } catch {
    return text as Parse extends false ? Response : T;
  }
}

function buildQueryRequestOptions<Req>(
  endpoint: ApiEndpoint<Req, unknown>,
  baseOptions: Partial<APIFetchOptions>,
  request: unknown,
): APIFetchOptions {
  const query = encodeGetLikeRequest(request);
  const {
    headers: baseHeaders,
    path: basePath,
    url: baseUrl,
    ...fetchOptions
  } = baseOptions;

  return baseUrl
    ? {
        ...fetchOptions,
        ...(baseHeaders === undefined ? {} : { headers: baseHeaders }),
        method: endpoint.method,
        url: joinUrlWithQuery(baseUrl, query),
      }
    : {
        ...fetchOptions,
        ...(baseHeaders === undefined ? {} : { headers: baseHeaders }),
        method: endpoint.method,
        path: joinPathWithQuery(basePath ?? endpoint.path, query),
      };
}

function buildBodyRequestOptions<Req>(
  endpoint: ApiEndpoint<Req, unknown>,
  baseOptions: Partial<APIFetchOptions>,
  request: unknown,
): APIFetchOptions {
  const {
    headers: baseHeaders,
    path: basePath,
    url: baseUrl,
    ...fetchOptions
  } = baseOptions;
  const locationOptions = baseUrl
    ? { url: baseUrl }
    : { path: basePath ?? endpoint.path };

  if (isFormDataLike(request)) {
    return {
      ...fetchOptions,
      body: request as FormData,
      ...(baseHeaders === undefined ? {} : { headers: baseHeaders }),
      method: endpoint.method,
      ...locationOptions,
    };
  }

  const headers = mergeHeaderInputs(
    { 'Content-Type': 'application/json' },
    baseHeaders as HeadersInit | undefined,
  );

  return {
    ...fetchOptions,
    body: typeof request === 'string' ? request : JSON.stringify(request),
    ...(headers === undefined ? {} : { headers }),
    method: endpoint.method,
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
      'Endpoints with requestLocation "query-and-body" require requests shaped like { query, body }.',
    );
  }

  return {
    body: request.body,
    query: request.query,
  };
}

function buildEndpointFetchOptions<Req>(
  endpoint: ApiEndpoint<Req, unknown>,
  request: Req,
): APIFetchOptions {
  const requestLocation =
    endpoint.requestLocation ??
    (endpoint.method === 'GET' || endpoint.method === 'DELETE'
      ? 'query'
      : 'body');

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

  if (requestLocation === 'body' && endpoint.method === 'GET') {
    throw new ApiClientConfigurationError(
      'requestLocation "body" is not supported for GET endpoints.',
    );
  }

  const baseOptions = endpoint.buildRequestOptions?.(request) ?? {};
  return buildBodyRequestOptions(endpoint, baseOptions, request);
}

function mergeFetchOptions(
  baseOptions: APIFetchOptions,
  requestOptions?: Partial<APIFetchOptions>,
): APIFetchOptions {
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
 * Create a validated WordPress-aware fetch helper.
 *
 * @param validator - Response validator, typically a Typia-generated function.
 * @param fetchFn - Optional `@wordpress/api-fetch` compatible implementation.
 * @returns A helper that can fetch, assert, or soft-check response payloads.
 * @example
 * ```ts
 * const postsFetch = createValidatedFetch(validatePosts);
 * const result = await postsFetch.fetch({ path: "/wp/v2/posts" });
 * ```
 * @category Validation
 */
export function createValidatedFetch<T>(
  validator: (input: unknown) => ValidationLike<T>,
  fetchFn: ApiFetch = defaultFetch as ApiFetch,
): ValidatedFetch<T> {
  return {
    async fetchWithResponse(options: APIFetchOptions<false>) {
      const response = await fetchFn<Response, false>({
        ...options,
        parse: false,
      });
      const payload = await parseResponsePayload(response.clone());
      return {
        response,
        validation: toValidationResult<T>(validator(payload)),
      };
    },
    async fetch(options: APIFetchOptions) {
      if (options.parse === false) {
        const { validation } = await this.fetchWithResponse(
          options as APIFetchOptions<false>,
        );
        return validation;
      }

      const payload = await fetchFn<unknown, true>(
        options as APIFetchOptions<true>,
      );
      return toValidationResult<T>(validator(payload));
    },
    async assertFetch(options: APIFetchOptions) {
      const result = await this.fetch(options);
      if (!result.isValid) {
        throw new RestValidationAssertionError(
          result,
          result.errors[0]
            ? `${result.errors[0].path}: ${result.errors[0].expected}`
            : 'REST response validation failed.',
        );
      }
      return result.data as T;
    },
    async isFetch(options: APIFetchOptions) {
      const result = await this.fetch(options);
      return result.isValid ? (result.data as T) : null;
    },
  };
}

/**
 * Freeze a WordPress REST endpoint definition as a typed public contract.
 *
 * @param config - Endpoint metadata and validators to expose.
 * @returns The same config, preserved as an `ApiEndpoint`.
 * @category REST
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
 * Execute a WordPress REST endpoint contract with validated input and output.
 *
 * @remarks
 * Invalid requests return a request validation result immediately and never
 * reach the network layer.
 *
 * @param endpoint - Contract describing the REST route and validators.
 * @param request - Caller input to validate and serialize.
 * @param options - Optional fetch implementation and request overrides.
 * @returns A validation result tagged as either a request or response outcome.
 * @example
 * ```ts
 * const result = await callEndpoint(endpoint, { slug: "hero-card" });
 * ```
 * @category REST
 */
export async function callEndpoint<Req, Res>(
  endpoint: ApiEndpoint<Req, Res>,
  request: Req,
  options: EndpointCallOptions = {},
): Promise<EndpointValidationResult<Req, Res>> {
  const { fetchFn = defaultFetch as ApiFetch, requestOptions } = options;
  const requestValidation = endpoint.validateRequest(request);
  if (isInvalidValidationResult(requestValidation)) {
    return toEndpointRequestValidationResult(requestValidation);
  }

  const payload = await fetchFn<unknown, true>(
    mergeFetchOptions(
      buildEndpointFetchOptions(endpoint, request),
      requestOptions,
    ) as APIFetchOptions<true>,
  );
  return toEndpointResponseValidationResult(endpoint.validateResponse(payload));
}
