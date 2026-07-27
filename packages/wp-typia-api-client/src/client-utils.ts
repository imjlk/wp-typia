import { isPlainObject } from './runtime-primitives.js';

export type QueryScalar = boolean | number | string;

export async function parseResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function isQueryScalar(value: unknown): value is QueryScalar {
  return (
		typeof value === 'boolean' ||
		typeof value === 'number' ||
		typeof value === 'string'
	);
}

export function encodeGetLikeRequest(request: unknown): string {
  if (request === undefined || request === null) {
    return '';
  }

  if (request instanceof URLSearchParams) {
    return request.toString();
  }

  if (!isPlainObject(request)) {
    throw new Error(
      'GET/DELETE endpoint requests must be plain objects or URLSearchParams.',
    );
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(request)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isQueryScalar(item)) {
          throw new Error(
            `GET/DELETE endpoint request field "${key}" only supports scalar array items.`,
          );
        }
        params.append(key, String(item));
      }
      continue;
    }
    if (!isQueryScalar(value)) {
      throw new Error(
        `GET/DELETE endpoint request field "${key}" must be a scalar, URLSearchParams, or array of scalars.`,
      );
    }
    params.set(key, String(value));
  }

  return params.toString();
}

export function joinPathWithQuery(path: string, query: string): string {
  if (!query) {
    return path;
  }

  const [pathWithoutHash = '', hash = ''] = path.split('#', 2);
  const nextPath = pathWithoutHash.includes('?')
    ? `${pathWithoutHash}&${query}`
    : `${pathWithoutHash}?${query}`;

  return hash ? `${nextPath}#${hash}` : nextPath;
}

export function joinUrlWithQuery(url: string, query: string): string {
  if (!query) {
    return url;
  }

  const [urlWithoutHash = '', hash = ''] = url.split('#', 2);
  const nextUrl = urlWithoutHash.includes('?')
    ? `${urlWithoutHash}&${query}`
    : `${urlWithoutHash}?${query}`;

  return hash ? `${nextUrl}#${hash}` : nextUrl;
}

export function mergeHeaderInputs(
	baseHeaders?: HeadersInit,
	requestHeaders?: HeadersInit,
): Record<string, string> | undefined {
  if (!baseHeaders && !requestHeaders) {
    return undefined;
  }

  const mergedHeaders = new Headers(baseHeaders);
  const nextHeaders = new Headers(requestHeaders);

  for (const [key, value] of nextHeaders.entries()) {
    mergedHeaders.set(key, value);
  }

  return Object.fromEntries(mergedHeaders.entries());
}
