import type { ApiEndpoint, ValidationResult } from './client.js';

import { isPlainObject } from './internal/runtime-primitives.js';
import type { CacheKeyResult } from './react-client-types.js';

const endpointIdentityIds = new WeakMap<object, number>();
let nextEndpointIdentityId = 0;

function getStableEndpointIdentity(value: object): number {
  const existing = endpointIdentityIds.get(value);
  if (existing !== undefined) {
    return existing;
  }

  const created = nextEndpointIdentityId;
  nextEndpointIdentityId += 1;
  endpointIdentityIds.set(value, created);
  return created;
}

function normalizeCacheValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return { __bigint: String(value) };
  }

  if (value instanceof URLSearchParams) {
    return {
      __urlSearchParams: [...value.entries()].sort(
        ([leftKey, leftValue], [rightKey, rightValue]) =>
          leftKey === rightKey
            ? leftValue.localeCompare(rightValue)
            : leftKey.localeCompare(rightKey),
      ),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeCacheValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, item]) => [key, normalizeCacheValue(item)]),
    );
  }

  if (value instanceof Date) {
    return { __date: value.toISOString() };
  }

  return String(value);
}

function createEndpointPrefix<Req, Res>(
  endpoint: ApiEndpoint<Req, Res>,
): string {
  const requestValidatorId = getStableEndpointIdentity(
    endpoint.validateRequest as object,
  );
  const responseValidatorId = getStableEndpointIdentity(
    endpoint.validateResponse as object,
  );
  const requestBuilderId =
    endpoint.buildRequestOptions !== undefined
      ? getStableEndpointIdentity(endpoint.buildRequestOptions as object)
      : -1;

  return [
    endpoint.method,
    endpoint.path,
    `request:${requestValidatorId}`,
    `response:${responseValidatorId}`,
    `builder:${requestBuilderId}`,
  ].join(' ');
}

export function getEndpointCachePrefix<Req, Res>(
  endpoint: ApiEndpoint<Req, Res>,
): string {
  return createEndpointPrefix(endpoint);
}

/**
 * Build the normalized cache key for one endpoint request pair.
 *
 * @param endpoint - Endpoint contract used to namespace cache entries.
 * @param request - Request payload used to derive the stable cache key.
 * @returns The normalized cache key plus the request validation result.
 * @category React
 */
export function createCacheKey<Req, Res>(
  endpoint: ApiEndpoint<Req, Res>,
  request: Req,
): CacheKeyResult<Req> {
  const requestValidation = endpoint.validateRequest(
    request,
  ) as ValidationResult<Req>;
  const normalizedRequest = requestValidation.isValid
    ? (requestValidation.data ?? request)
    : request;

  return {
    cacheKey: `${createEndpointPrefix(endpoint)}::${JSON.stringify(
      normalizeCacheValue(normalizedRequest),
    )}`,
    requestValidation,
  };
}
