import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  createElement,
  createRoot,
  flushSync,
  renderToString,
} from '@wordpress/element';

import {
  defineRestResource,
  createEndpoint,
  RestQueryHookUsageError,
  toValidationResult,
  type ValidationLike,
} from '../src/index';
import {
  EndpointDataProvider,
  createEndpointDataClient,
  useEndpointMutation,
  useEndpointQuery,
  useRestResourceCreateMutation,
  useRestResourceDeleteMutation,
  useRestResourceListQuery,
  useRestResourceReadQuery,
  useRestResourceUpdateMutation,
} from '../src/react';
import type { ApiFetch } from '@wordpress/api-fetch';

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

const domWindow = new Window();
const previousWindow = globalThis.window;
const previousDocument = globalThis.document;
const previousNavigator = globalThis.navigator;
const previousHTMLElement = globalThis.HTMLElement;
const previousHTMLIFrameElement = globalThis.HTMLIFrameElement;
const previousNode = globalThis.Node;
const previousEvent = globalThis.Event;
const previousMutationObserver = globalThis.MutationObserver;

globalThis.window = domWindow as unknown as typeof globalThis.window;
globalThis.document =
  domWindow.document as unknown as typeof globalThis.document;
globalThis.navigator =
  domWindow.navigator as unknown as typeof globalThis.navigator;
globalThis.HTMLElement =
  domWindow.HTMLElement as unknown as typeof globalThis.HTMLElement;
globalThis.HTMLIFrameElement =
  domWindow.HTMLIFrameElement as unknown as typeof globalThis.HTMLIFrameElement;
globalThis.Node = domWindow.Node as unknown as typeof globalThis.Node;
globalThis.Event = domWindow.Event as unknown as typeof globalThis.Event;
globalThis.MutationObserver =
  domWindow.MutationObserver as unknown as typeof globalThis.MutationObserver;

const activeUnmounts = new Set<() => Promise<void>>();

interface HookRenderer<T> {
  client: ReturnType<typeof createEndpointDataClient>;
  current: T;
  rerender(): Promise<void>;
  unmount(): Promise<void>;
}

async function createHookRenderer<T>(
  useValue: () => T,
  client = createEndpointDataClient(),
): Promise<HookRenderer<T>> {
  let current!: T;

  function Harness() {
    current = useValue();
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  async function rerender() {
    flushSync(() => {
      root.render(
        createElement(EndpointDataProvider, { client }, createElement(Harness)),
      );
    });
    await flush();
  }

  async function unmount() {
    activeUnmounts.delete(unmount);
    flushSync(() => {
      root.unmount();
    });
    container.remove();
    await flush();
  }

  activeUnmounts.add(unmount);
  await rerender();

  return {
    client,
    get current() {
      return current;
    },
    rerender,
    unmount,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForAssertion(
  assertion: () => void,
  timeoutMs = 1_000,
): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flush();
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Timed out waiting for assertion to pass.');
}

function isExpectedReactErrorBoundaryNotice(args: readonly unknown[]): boolean {
  return args.some(
    (arg) =>
      typeof arg === 'string' &&
      arg.includes('The above error occurred in the <Harness> component:') &&
      arg.includes(
        'Consider adding an error boundary to your tree to customize error handling behavior.',
      ),
  );
}

async function withExpectedReactErrorBoundaryNoticeSuppressed<T>(
  action: () => Promise<T>,
): Promise<T> {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    if (isExpectedReactErrorBoundaryNotice(args)) {
      return;
    }

    originalError(...args);
  };

  try {
    return await action();
  } finally {
    console.error = originalError;
  }
}

afterEach(() => {
  for (const unmount of [...activeUnmounts]) {
    void unmount();
  }
  document.body.innerHTML = '';
});

describe('@wp-typia/rest/react', () => {
  test('useEndpointQuery throws a named usage error for non-GET endpoints', async () => {
    const endpoint = createEndpoint<{ title: string }, { ok: boolean }>({
      method: 'POST',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { title?: unknown }).title === 'string'
          ? toValidationResult(success(input as { title: string }))
          : toValidationResult(
              failure<{ title: string }>('{ title: string }', '$.title'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        (input as { ok?: unknown }).ok === true
          ? toValidationResult(success(input as { ok: boolean }))
          : toValidationResult(
              failure<{ ok: boolean }>('{ ok: true }', '$.ok'),
            ),
    });

    await withExpectedReactErrorBoundaryNoticeSuppressed(async () => {
      await expect(
        createHookRenderer(() =>
          useEndpointQuery(endpoint, { title: 'Hello' }),
        ),
      ).rejects.toBeInstanceOf(RestQueryHookUsageError);
    });
  });

  test('useEndpointQuery performs the initial fetch and reuses cached data across consumers', async () => {
    let fetchCount = 0;
    const endpoint = createEndpoint<{ page: number }, { count: number }>({
      method: 'GET',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const fetchFn = (async () => {
      fetchCount += 1;
      return { count: fetchCount };
    }) as never;
    const client = createEndpointDataClient();
    const first = await createHookRenderer(
      () =>
        useEndpointQuery(
          endpoint,
          { page: 1 },
          {
            fetchFn,
            staleTime: 10_000,
          },
        ),
      client,
    );

    await flush();
    await flush();

    expect(first.current.data).toEqual({ count: 1 });
    expect(first.current.validation?.isValid).toBe(true);
    expect(fetchCount).toBe(1);

    const second = await createHookRenderer(
      () =>
        useEndpointQuery(
          endpoint,
          { page: 1 },
          {
            fetchFn,
            staleTime: 10_000,
          },
        ),
      client,
    );

    await flush();
    await flush();

    expect(second.current.data).toEqual({ count: 1 });
    expect(fetchCount).toBe(1);

    await first.unmount();
    await second.unmount();
  });

  test('useEndpointQuery reuses cache entries for Object.create(null) requests', async () => {
    let fetchCount = 0;
    let request: { page: number } = { page: 1 };
    const endpoint = createEndpoint<{ page: number }, { count: number }>({
      method: 'GET',
      path: '/demo/v1/plain-object-cache',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const client = createEndpointDataClient();
    const renderer = await createHookRenderer(
      () =>
        useEndpointQuery(endpoint, request, {
          client,
          fetchFn: asApiFetch(async () => {
            fetchCount += 1;
            return { count: fetchCount };
          }),
        }),
      client,
    );

    await waitForAssertion(() => {
      expect(renderer.current.data).toEqual({ count: 1 });
      expect(fetchCount).toBe(1);
    });

    request = Object.assign(Object.create(null), {
      page: 1,
    }) as { page: number };
    await renderer.rerender();

    expect(renderer.current.data).toEqual({ count: 1 });
    expect(fetchCount).toBe(1);

    await renderer.unmount();
  });

  test('useRestResourceListQuery consumes a resource facade through the shared query cache', async () => {
    let fetchCount = 0;
    const resource = defineRestResource({
      endpoints: {
        list: createEndpoint<{ page: number }, { count: number }>({
          method: 'GET',
          path: '/demo/v1/resource-items',
          validateRequest: (input: unknown) =>
            typeof input === 'object' &&
            input !== null &&
            typeof (input as { page?: unknown }).page === 'number'
              ? toValidationResult(success(input as { page: number }))
              : toValidationResult(
                  failure<{ page: number }>('{ page: number }', '$.page'),
                ),
          validateResponse: (input: unknown) =>
            typeof input === 'object' &&
            input !== null &&
            typeof (input as { count?: unknown }).count === 'number'
              ? toValidationResult(success(input as { count: number }))
              : toValidationResult(
                  failure<{ count: number }>('{ count: number }', '$.count'),
                ),
        }),
      },
    });
    const client = createEndpointDataClient();
    const rendered = await createHookRenderer(
      () =>
        useRestResourceListQuery(
          resource,
          { page: 1 },
          {
            client,
            fetchFn: asApiFetch(async () => {
              fetchCount += 1;
              return { count: fetchCount };
            }),
            staleTime: 30_000,
          },
        ),
      client,
    );

    await waitForAssertion(() => {
      expect(rendered.current.data).toEqual({ count: 1 });
      expect(rendered.current.validation?.isValid).toBe(true);
    });

    client.invalidate(resource.endpoints.list, { page: 1 });
    await flush();
    await flush();

    expect(fetchCount).toBe(2);
    expect(rendered.current.data).toEqual({ count: 2 });

    await rendered.unmount();
  });

  test('useRestResourceReadQuery consumes a resource facade through the shared query cache', async () => {
    let fetchCount = 0;
    const resource = defineRestResource({
      endpoints: {
        read: createEndpoint<{ id: number }, { count: number }>({
          method: 'GET',
          path: '/demo/v1/resource-items/(?P<id>\\d+)',
          validateRequest: (input: unknown) =>
            typeof input === 'object' &&
            input !== null &&
            typeof (input as { id?: unknown }).id === 'number'
              ? toValidationResult(success(input as { id: number }))
              : toValidationResult(
                  failure<{ id: number }>('{ id: number }', '$.id'),
                ),
          validateResponse: (input: unknown) =>
            typeof input === 'object' &&
            input !== null &&
            typeof (input as { count?: unknown }).count === 'number'
              ? toValidationResult(success(input as { count: number }))
              : toValidationResult(
                  failure<{ count: number }>('{ count: number }', '$.count'),
                ),
        }),
      },
    });
    const client = createEndpointDataClient();
    const rendered = await createHookRenderer(
      () =>
        useRestResourceReadQuery(
          resource,
          { id: 9 },
          {
            client,
            fetchFn: asApiFetch(async () => {
              fetchCount += 1;
              return { count: fetchCount };
            }),
            staleTime: 30_000,
          },
        ),
      client,
    );

    await waitForAssertion(() => {
      expect(rendered.current.data).toEqual({ count: 1 });
      expect(rendered.current.validation?.isValid).toBe(true);
    });

    client.invalidate(resource.endpoints.read, { id: 9 });
    await flush();
    await flush();

    expect(fetchCount).toBe(2);
    expect(rendered.current.data).toEqual({ count: 2 });

    await rendered.unmount();
  });

  test('resource mutation hooks delegate to their endpoint helpers and invalidate shared queries', async () => {
    let queryCount = 0;
    const seenMethods: string[] = [];
    const resource = defineRestResource({
      endpoints: {
        create: createEndpoint<
          { title: string },
          { action: 'create'; count: number }
        >({
          method: 'POST',
          path: '/demo/v1/resource-items',
          validateRequest: (input: unknown) =>
            typeof input === 'object' &&
            input !== null &&
            typeof (input as { title?: unknown }).title === 'string'
              ? toValidationResult(success(input as { title: string }))
              : toValidationResult(
                  failure<{ title: string }>('{ title: string }', '$.title'),
                ),
          validateResponse: (input: unknown) =>
            typeof input === 'object' &&
            input !== null &&
            (input as { action?: unknown }).action === 'create' &&
            typeof (input as { count?: unknown }).count === 'number'
              ? toValidationResult(
                  success(input as { action: 'create'; count: number }),
                )
              : toValidationResult(
                  failure<{ action: 'create'; count: number }>(
                    "{ action: 'create'; count: number }",
                    '$.action',
                  ),
                ),
        }),
        delete: createEndpoint<
          { id: number },
          { action: 'delete'; count: number }
        >({
          method: 'DELETE',
          path: '/demo/v1/resource-items/(?P<id>\\d+)',
          validateRequest: (input: unknown) =>
            typeof input === 'object' &&
            input !== null &&
            typeof (input as { id?: unknown }).id === 'number'
              ? toValidationResult(success(input as { id: number }))
              : toValidationResult(
                  failure<{ id: number }>('{ id: number }', '$.id'),
                ),
          validateResponse: (input: unknown) =>
            typeof input === 'object' &&
            input !== null &&
            (input as { action?: unknown }).action === 'delete' &&
            typeof (input as { count?: unknown }).count === 'number'
              ? toValidationResult(
                  success(input as { action: 'delete'; count: number }),
                )
              : toValidationResult(
                  failure<{ action: 'delete'; count: number }>(
                    "{ action: 'delete'; count: number }",
                    '$.action',
                  ),
                ),
        }),
        list: createEndpoint<{ page: number }, { count: number }>({
          method: 'GET',
          path: '/demo/v1/resource-items',
          validateRequest: (input: unknown) =>
            typeof input === 'object' &&
            input !== null &&
            typeof (input as { page?: unknown }).page === 'number'
              ? toValidationResult(success(input as { page: number }))
              : toValidationResult(
                  failure<{ page: number }>('{ page: number }', '$.page'),
                ),
          validateResponse: (input: unknown) =>
            typeof input === 'object' &&
            input !== null &&
            typeof (input as { count?: unknown }).count === 'number'
              ? toValidationResult(success(input as { count: number }))
              : toValidationResult(
                  failure<{ count: number }>('{ count: number }', '$.count'),
                ),
        }),
        update: createEndpoint<
          { id: number; title: string },
          { action: 'update'; count: number }
        >({
          method: 'PUT',
          path: '/demo/v1/resource-items/(?P<id>\\d+)',
          validateRequest: (input: unknown) =>
            typeof input === 'object' &&
            input !== null &&
            typeof (input as { id?: unknown }).id === 'number' &&
            typeof (input as { title?: unknown }).title === 'string'
              ? toValidationResult(
                  success(input as { id: number; title: string }),
                )
              : toValidationResult(
                  failure<{ id: number; title: string }>(
                    '{ id: number; title: string }',
                    '$.id',
                  ),
                ),
          validateResponse: (input: unknown) =>
            typeof input === 'object' &&
            input !== null &&
            (input as { action?: unknown }).action === 'update' &&
            typeof (input as { count?: unknown }).count === 'number'
              ? toValidationResult(
                  success(input as { action: 'update'; count: number }),
                )
              : toValidationResult(
                  failure<{ action: 'update'; count: number }>(
                    "{ action: 'update'; count: number }",
                    '$.action',
                  ),
                ),
        }),
      },
    });
    const queryRequest = { page: 1 };
    const fetchFn = asApiFetch(async (options: { method?: string }) => {
      const method = options.method ?? 'GET';
      seenMethods.push(method);

      if (method === 'GET') {
        return { count: queryCount };
      }

      queryCount += 1;
      if (method === 'POST') {
        return { action: 'create', count: queryCount };
      }
      if (method === 'PUT') {
        return { action: 'update', count: queryCount };
      }
      return { action: 'delete', count: queryCount };
    });
    const rendered = await createHookRenderer(() => ({
      create: useRestResourceCreateMutation(resource, {
        fetchFn,
        invalidate: {
          endpoint: resource.endpoints.list,
          request: queryRequest,
        },
      }),
      delete: useRestResourceDeleteMutation(resource, {
        fetchFn,
        invalidate: {
          endpoint: resource.endpoints.list,
          request: queryRequest,
        },
      }),
      list: useRestResourceListQuery(resource, queryRequest, {
        fetchFn,
        staleTime: 30_000,
      }),
      update: useRestResourceUpdateMutation(resource, {
        fetchFn,
        invalidate: {
          endpoint: resource.endpoints.list,
          request: queryRequest,
        },
      }),
    }));

    await waitForAssertion(() => {
      expect(rendered.current.list.data).toEqual({ count: 0 });
      expect(rendered.current.list.validation?.isValid).toBe(true);
    });

    await rendered.current.create.mutateAsync({ title: 'Hero card' });
    await waitForAssertion(() => {
      expect(rendered.current.create.data).toEqual({
        action: 'create',
        count: 1,
      });
      expect(rendered.current.create.validation?.isValid).toBe(true);
      expect(rendered.current.list.data).toEqual({ count: 1 });
    });

    await rendered.current.update.mutateAsync({ id: 9, title: 'Hero v2' });
    await waitForAssertion(() => {
      expect(rendered.current.update.data).toEqual({
        action: 'update',
        count: 2,
      });
      expect(rendered.current.update.validation?.isValid).toBe(true);
      expect(rendered.current.list.data).toEqual({ count: 2 });
    });

    await rendered.current.delete.mutateAsync({ id: 9 });
    await waitForAssertion(() => {
      expect(rendered.current.delete.data).toEqual({
        action: 'delete',
        count: 3,
      });
      expect(rendered.current.delete.validation?.isValid).toBe(true);
      expect(rendered.current.list.data).toEqual({ count: 3 });
    });

    expect(seenMethods).toEqual([
      'GET',
      'POST',
      'GET',
      'PUT',
      'GET',
      'DELETE',
      'GET',
    ]);

    await rendered.unmount();
  });

  test('renderToString also surfaces the named usage error for non-GET endpoints', () => {
    const endpoint = createEndpoint<{ title: string }, { ok: boolean }>({
      method: 'POST',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { title?: unknown }).title === 'string'
          ? toValidationResult(success(input as { title: string }))
          : toValidationResult(
              failure<{ title: string }>('{ title: string }', '$.title'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        (input as { ok?: unknown }).ok === true
          ? toValidationResult(success(input as { ok: boolean }))
          : toValidationResult(
              failure<{ ok: boolean }>('{ ok: true }', '$.ok'),
            ),
    });

    expect(() =>
      renderToString(
        createElement(() => {
          useEndpointQuery(endpoint, { title: 'Hello' });
          return null;
        }),
      ),
    ).toThrow(RestQueryHookUsageError);
  });

  test('invalidate and refetch trigger fresh query execution', async () => {
    let fetchCount = 0;
    const endpoint = createEndpoint<{ page: number }, { count: number }>({
      method: 'GET',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const request = { page: 1 };
    const client = createEndpointDataClient();
    const rendered = await createHookRenderer(
      () =>
        useEndpointQuery(endpoint, request, {
          fetchFn: (async () => {
            fetchCount += 1;
            return { count: fetchCount };
          }) as never,
          staleTime: 30_000,
        }),
      client,
    );

    await flush();
    await flush();
    expect(rendered.current.data).toEqual({ count: 1 });

    client.invalidate(endpoint, request);
    await flush();
    await flush();
    expect(rendered.current.data).toEqual({ count: 2 });

    await client.refetch(endpoint, request);
    await flush();
    expect(rendered.current.data).toEqual({ count: 3 });

    await rendered.unmount();
  });

  test('overlapping forced refetches reuse the in-flight query promise', async () => {
    let fetchCount = 0;
    let resolveFetch!: (value: { count: number }) => void;
    const endpoint = createEndpoint<{ page: number }, { count: number }>({
      method: 'GET',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const request = { page: 1 };
    const client = createEndpointDataClient();
    const rendered = await createHookRenderer(
      () =>
        useEndpointQuery(endpoint, request, {
          fetchFn: (async () => {
            fetchCount += 1;
            return await new Promise<{ count: number }>((resolve) => {
              resolveFetch = resolve;
            });
          }) as never,
          staleTime: 30_000,
        }),
      client,
    );

    await flush();
    expect(fetchCount).toBe(1);

    const firstRefetch = client.refetch(endpoint, request);
    const secondRefetch = client.refetch(endpoint, request);

    await flush();
    expect(fetchCount).toBe(1);

    resolveFetch({ count: 1 });
    await Promise.all([firstRefetch, secondRefetch]);
    await flush();

    expect(fetchCount).toBe(1);
    expect(rendered.current.data).toEqual({ count: 1 });

    await rendered.unmount();
  });

  test('default staleTime avoids same-mount loops but refetches on later mounts', async () => {
    let fetchCount = 0;
    const client = createEndpointDataClient();
    const endpoint = createEndpoint<{ page: number }, { count: number }>({
      method: 'GET',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const rendered = await createHookRenderer(
      () =>
        useEndpointQuery(
          endpoint,
          { page: 1 },
          {
            fetchFn: (async () => {
              fetchCount += 1;
              return { count: fetchCount };
            }) as never,
          },
        ),
      client,
    );

    await flush();
    await flush();

    expect(fetchCount).toBe(1);
    expect(rendered.current.data).toEqual({ count: 1 });

    await rendered.rerender();
    await flush();
    await flush();

    expect(fetchCount).toBe(1);
    expect(rendered.current.data).toEqual({ count: 1 });

    const second = await createHookRenderer(
      () =>
        useEndpointQuery(
          endpoint,
          { page: 1 },
          {
            fetchFn: (async () => {
              fetchCount += 1;
              return { count: fetchCount };
            }) as never,
          },
        ),
      client,
    );

    await flush();
    await flush();

    expect(fetchCount).toBe(2);
    expect(rendered.current.data).toEqual({ count: 2 });
    expect(second.current.data).toEqual({ count: 2 });

    await second.unmount();
    await rendered.unmount();
  });

  test(
    'invalidate triggers a follow-up fetch when an older request resolves late',
    async () => {
      let fetchCount = 0;
      let resolveFirstFetch!: (value: { count: number }) => void;
      const endpoint = createEndpoint<{ page: number }, { count: number }>({
        method: 'GET',
        path: '/demo/v1/items',
        validateRequest: (input: unknown) =>
          typeof input === 'object' &&
          input !== null &&
          typeof (input as { page?: unknown }).page === 'number'
            ? toValidationResult(success(input as { page: number }))
            : toValidationResult(
                failure<{ page: number }>('{ page: number }', '$.page'),
              ),
        validateResponse: (input: unknown) =>
          typeof input === 'object' &&
          input !== null &&
          typeof (input as { count?: unknown }).count === 'number'
            ? toValidationResult(success(input as { count: number }))
            : toValidationResult(
                failure<{ count: number }>('{ count: number }', '$.count'),
              ),
      });
      const request = { page: 1 };
      const client = createEndpointDataClient();
      const rendered = await createHookRenderer(
        () =>
          useEndpointQuery(endpoint, request, {
            fetchFn: (async () => {
              fetchCount += 1;
              if (fetchCount === 1) {
                return await new Promise<{ count: number }>((resolve) => {
                  resolveFirstFetch = resolve;
                });
              }

              return { count: 2 };
            }) as never,
            staleTime: 30_000,
          }),
        client,
      );

      await waitForAssertion(() => {
        expect(fetchCount).toBe(1);
      });

      client.invalidate(endpoint, request);
      await flush();
      resolveFirstFetch({ count: 1 });
      await flush();

      await waitForAssertion(() => {
        expect(fetchCount).toBe(2);
        expect(rendered.current.data).toEqual({ count: 2 });
      }, 10_000);

      await rendered.unmount();
    },
    { timeout: 15_000 },
  );

  test(
    'invalidate preserves follow-up fetches when an older request fails late',
    async () => {
      let fetchCount = 0;
      let rejectFirstFetch!: (error: Error) => void;
      const endpoint = createEndpoint<{ page: number }, { count: number }>({
        method: 'GET',
        path: '/demo/v1/items',
        validateRequest: (input: unknown) =>
          typeof input === 'object' &&
          input !== null &&
          typeof (input as { page?: unknown }).page === 'number'
            ? toValidationResult(success(input as { page: number }))
            : toValidationResult(
                failure<{ page: number }>('{ page: number }', '$.page'),
              ),
        validateResponse: (input: unknown) =>
          typeof input === 'object' &&
          input !== null &&
          typeof (input as { count?: unknown }).count === 'number'
            ? toValidationResult(success(input as { count: number }))
            : toValidationResult(
                failure<{ count: number }>('{ count: number }', '$.count'),
              ),
      });
      const request = { page: 1 };
      const client = createEndpointDataClient();
      const rendered = await createHookRenderer(
        () =>
          useEndpointQuery(endpoint, request, {
            fetchFn: (async () => {
              fetchCount += 1;
              if (fetchCount === 1) {
                return await new Promise<{ count: number }>((_, reject) => {
                  rejectFirstFetch = reject as (error: Error) => void;
                });
              }

              return { count: 2 };
            }) as never,
            staleTime: 30_000,
          }),
        client,
      );

      await waitForAssertion(() => {
        expect(fetchCount).toBe(1);
      });

      client.invalidate(endpoint, request);
      await flush();
      rejectFirstFetch(new Error('offline'));
      await flush();

      await waitForAssertion(() => {
        expect(fetchCount).toBe(2);
        expect(rendered.current.data).toEqual({ count: 2 });
        expect(rendered.current.error).toBeNull();
      }, 10_000);

      await rendered.unmount();
    },
    { timeout: 15_000 },
  );

  test('useEndpointMutation invalidates matching queries after a successful mutation', async () => {
    let serverCount = 0;
    const queryEndpoint = createEndpoint<undefined, { count: number }>({
      method: 'GET',
      path: '/demo/v1/count',
      validateRequest: (input: unknown) =>
        input === undefined
          ? toValidationResult(success(undefined))
          : toValidationResult(failure<undefined>('undefined')),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const mutationEndpoint = createEndpoint<
      { delta: number },
      { count: number }
    >({
      method: 'POST',
      path: '/demo/v1/count',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { delta?: unknown }).delta === 'number'
          ? toValidationResult(success(input as { delta: number }))
          : toValidationResult(
              failure<{ delta: number }>('{ delta: number }', '$.delta'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const fetchFn = (async (options: { method?: string }) => {
      if (options.method === 'GET') {
        return { count: serverCount };
      }

      serverCount += 1;
      return { count: serverCount };
    }) as never;
    const rendered = await createHookRenderer(() => ({
      mutation: useEndpointMutation(mutationEndpoint, {
        fetchFn,
        invalidate: {
          endpoint: queryEndpoint,
          request: undefined,
        },
      }),
      query: useEndpointQuery(queryEndpoint, undefined, {
        fetchFn,
        staleTime: 30_000,
      }),
    }));

    await flush();
    await flush();
    expect(rendered.current.query.data).toEqual({ count: 0 });

    await rendered.current.mutation.mutateAsync({ delta: 1 });
    await flush();
    await flush();

    expect(rendered.current.mutation.validation?.isValid).toBe(true);
    expect(rendered.current.query.data).toEqual({ count: 1 });
  });

  test('onMutate can optimistically update cached data and rollback on error', async () => {
    let rejectMutation!: (error: Error) => void;
    const queryEndpoint = createEndpoint<{ page: number }, { count: number }>({
      method: 'GET',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const mutationEndpoint = createEndpoint<
      { page: number },
      { count: number }
    >({
      method: 'POST',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const fetchFn = (async (options: { method?: string }) => {
      if (options.method === 'GET') {
        return { count: 1 };
      }

      return await new Promise((_, reject) => {
        rejectMutation = reject as (error: Error) => void;
      });
    }) as never;
    const request = { page: 1 };
    const rendered = await createHookRenderer(() => ({
      mutation: useEndpointMutation<
        { page: number },
        { count: number },
        { previous: { count: number } | undefined }
      >(mutationEndpoint, {
        fetchFn,
        onError: (_error, variables, client, context) => {
          if (context?.previous) {
            client.setData(queryEndpoint, variables, context.previous);
          }
        },
        onMutate: (variables, client) => {
          const previous = client.getData(queryEndpoint, variables);
          client.setData(queryEndpoint, variables, { count: 2 });
          return { previous };
        },
      }),
      query: useEndpointQuery(queryEndpoint, request, {
        fetchFn,
        staleTime: 30_000,
      }),
    }));

    await flush();
    await flush();
    expect(rendered.current.query.data).toEqual({ count: 1 });

    const pending = rendered.current.mutation
      .mutateAsync(request)
      .catch(() => undefined);
    await flush();
    expect(rendered.current.query.data).toEqual({ count: 2 });

    rejectMutation(new Error('boom'));
    await pending;
    await flush();

    expect(rendered.current.mutation.error).toBeInstanceOf(Error);
    expect(rendered.current.query.data).toEqual({ count: 1 });
  });

  test('query validation failures surface through validation without setting transport errors', async () => {
    const endpoint = createEndpoint<{ page: number }, { count: number }>({
      method: 'GET',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const rendered = await createHookRenderer(() =>
      useEndpointQuery(
        endpoint,
        { page: 1 },
        {
          fetchFn: (async () => ({ nope: true })) as never,
        },
      ),
    );

    await flush();
    await flush();

    expect(rendered.current.error).toBeNull();
    expect(rendered.current.validation?.isValid).toBe(false);
    expect(rendered.current.validation?.errors[0]?.path).toBe('$.count');
  });

  test('request validation failures surface through query validation without executing transport', async () => {
    let fetchCalled = false;
    const endpoint = createEndpoint<{ page: number }, { count: number }>({
      method: 'GET',
      path: '/demo/v1/items',
      validateRequest: () =>
        toValidationResult(
          failure<{ page: number }>('{ page: number }', '$.page'),
        ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const rendered = await createHookRenderer(() =>
      useEndpointQuery(
        endpoint,
        { page: 1 },
        {
          fetchFn: asApiFetch(async () => {
            fetchCalled = true;
            return { count: 1 };
          }),
          initialData: { count: 999 },
        },
      ),
    );

    await flush();
    await flush();

    expect(fetchCalled).toBe(false);
    expect(rendered.current.error).toBeNull();
    expect(rendered.current.data).toBeUndefined();
    expect(rendered.current.validation?.isValid).toBe(false);
    expect(rendered.current.validation?.validationTarget).toBe('request');
    expect(rendered.current.validation?.errors[0]?.path).toBe('$.page');
  });

  test('useEndpointQuery does not reuse cached validations across endpoint contracts', async () => {
    let countFetches = 0;
    let totalFetches = 0;
    const countEndpoint = createEndpoint<{ page: number }, { count: number }>({
      method: 'GET',
      path: '/demo/v1/shared-cache',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const totalEndpoint = createEndpoint<{ page: number }, { total: number }>({
      method: 'GET',
      path: '/demo/v1/shared-cache',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { total?: unknown }).total === 'number'
          ? toValidationResult(success(input as { total: number }))
          : toValidationResult(
              failure<{ total: number }>('{ total: number }', '$.total'),
            ),
    });
    const client = createEndpointDataClient();
    const countRendered = await createHookRenderer(
      () =>
        useEndpointQuery(
          countEndpoint,
          { page: 1 },
          {
            client,
            fetchFn: asApiFetch(async () => {
              countFetches += 1;
              return { count: 1 };
            }),
            staleTime: 30_000,
          },
        ),
      client,
    );

    await waitForAssertion(() => {
      expect(countRendered.current.data).toEqual({ count: 1 });
    });
    expect(countFetches).toBe(1);

    const totalRendered = await createHookRenderer(
      () =>
        useEndpointQuery(
          totalEndpoint,
          { page: 1 },
          {
            client,
            fetchFn: asApiFetch(async () => {
              totalFetches += 1;
              return { total: 2 };
            }),
            staleTime: 30_000,
          },
        ),
      client,
    );

    await waitForAssertion(() => {
      expect(totalRendered.current.data).toEqual({ total: 2 });
    });

    expect(totalFetches).toBe(1);
    expect(totalRendered.current.validation?.validationTarget).toBe('response');

    await countRendered.unmount();
    await totalRendered.unmount();
  });

  test('request validation failures surface through mutation validation without executing transport', async () => {
    let fetchCalled = false;
    const endpoint = createEndpoint<{ page: number }, { ok: boolean }>({
      method: 'POST',
      path: '/demo/v1/items',
      validateRequest: () =>
        toValidationResult(
          failure<{ page: number }>('{ page: number }', '$.page'),
        ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        (input as { ok?: unknown }).ok === true
          ? toValidationResult(success(input as { ok: boolean }))
          : toValidationResult(
              failure<{ ok: boolean }>('{ ok: true }', '$.ok'),
            ),
    });
    const rendered = await createHookRenderer(() =>
      useEndpointMutation(endpoint, {
        fetchFn: asApiFetch(async () => {
          fetchCalled = true;
          return { ok: true };
        }),
      }),
    );

    const result = await rendered.current.mutateAsync({ page: 1 });
    await flush();

    expect(fetchCalled).toBe(false);
    expect(result.isValid).toBe(false);
    expect(result.validationTarget).toBe('request');
    expect(rendered.current.error).toEqual(result);
    expect(rendered.current.validation?.validationTarget).toBe('request');
  });

  test('query onSuccess runs for successful undefined payloads', async () => {
    let successCount = 0;
    const endpoint = createEndpoint<undefined, undefined>({
      method: 'GET',
      path: '/demo/v1/empty',
      validateRequest: (input: unknown) =>
        input === undefined
          ? toValidationResult(success(undefined))
          : toValidationResult(failure<undefined>('undefined')),
      validateResponse: (input: unknown) =>
        input === undefined
          ? toValidationResult(success(undefined))
          : toValidationResult(failure<undefined>('undefined')),
    });
    const rendered = await createHookRenderer(() =>
      useEndpointQuery(endpoint, undefined, {
        fetchFn: (async () => undefined) as never,
        initialData: 'boot' as never,
        onSuccess: () => {
          successCount += 1;
        },
      }),
    );

    await flush();
    await flush();

    expect(successCount).toBe(1);
    expect(rendered.current.validation?.isValid).toBe(true);
    expect(rendered.current.data).toBeUndefined();

    await rendered.unmount();
  });

  test('query transport errors do not auto-retry until explicitly refetched', async () => {
    let fetchCount = 0;
    const endpoint = createEndpoint<{ page: number }, { count: number }>({
      method: 'GET',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const rendered = await createHookRenderer(() =>
      useEndpointQuery(
        endpoint,
        { page: 1 },
        {
          fetchFn: (async () => {
            fetchCount += 1;
            throw new Error('offline');
          }) as never,
        },
      ),
    );

    await flush();
    await flush();
    await flush();

    expect(fetchCount).toBe(1);
    expect(rendered.current.error).toBeInstanceOf(Error);

    await rendered.current.refetch().catch(() => undefined);
    await flush();

    expect(fetchCount).toBe(2);

    await rendered.unmount();
  });

  test('transport errors surface separately from validation and resolveCallOptions reruns per execution', async () => {
    let shouldThrow = true;
    let seenNonce = '';
    const endpoint = createEndpoint<{ page: number }, { ok: boolean }>({
      method: 'POST',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        (input as { ok?: unknown }).ok === true
          ? toValidationResult(success(input as { ok: boolean }))
          : toValidationResult(
              failure<{ ok: boolean }>('{ ok: true }', '$.ok'),
            ),
    });
    let nonce = 'nonce-a';
    const rendered = await createHookRenderer(() =>
      useEndpointMutation(endpoint, {
        fetchFn: (async (options: { headers?: Record<string, string> }) => {
          seenNonce = options.headers?.['x-wp-nonce'] ?? '';
          if (shouldThrow) {
            throw new Error('offline');
          }
          return { ok: true };
        }) as never,
        resolveCallOptions: () => ({
          requestOptions: {
            headers: {
              'X-WP-Nonce': nonce,
            },
          },
        }),
      }),
    );

    await rendered.current.mutateAsync({ page: 1 }).catch(() => undefined);
    await flush();

    expect(rendered.current.error).toBeInstanceOf(Error);
    expect(rendered.current.validation).toBeNull();
    expect(seenNonce).toBe('nonce-a');

    shouldThrow = false;
    nonce = 'nonce-b';

    await rendered.current.mutateAsync({ page: 2 });
    await flush();

    expect(rendered.current.error).toBeNull();
    expect(rendered.current.validation?.isValid).toBe(true);
    expect(seenNonce).toBe('nonce-b');
  });

  test('transport errors clear stale mutation validation from prior successes', async () => {
    let shouldThrow = false;
    const endpoint = createEndpoint<{ page: number }, { ok: boolean }>({
      method: 'POST',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        (input as { ok?: unknown }).ok === true
          ? toValidationResult(success(input as { ok: boolean }))
          : toValidationResult(
              failure<{ ok: boolean }>('{ ok: true }', '$.ok'),
            ),
    });
    const rendered = await createHookRenderer(() =>
      useEndpointMutation(endpoint, {
        fetchFn: (async () => {
          if (shouldThrow) {
            throw new Error('offline');
          }

          return { ok: true };
        }) as never,
      }),
    );

    await rendered.current.mutateAsync({ page: 1 });
    await flush();

    expect(rendered.current.validation?.isValid).toBe(true);

    shouldThrow = true;
    await rendered.current.mutateAsync({ page: 2 }).catch(() => undefined);
    await flush();

    expect(rendered.current.data).toBeUndefined();
    expect(rendered.current.error).toBeInstanceOf(Error);
    expect(rendered.current.validation).toBeNull();
  });

  test('invalid mutation validations trigger rollback handlers and invalidate dependent queries', async () => {
    let serverCount = 0;
    let onErrorCount = 0;
    let rolledBackToPrevious = false;
    const invalidateCalls: Array<{ endpoint: unknown; request: unknown }> = [];
    const queryEndpoint = createEndpoint<{ page: number }, { count: number }>({
      method: 'GET',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const mutationEndpoint = createEndpoint<
      { page: number },
      { count: number }
    >({
      method: 'POST',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { count?: unknown }).count === 'number'
          ? toValidationResult(success(input as { count: number }))
          : toValidationResult(
              failure<{ count: number }>('{ count: number }', '$.count'),
            ),
    });
    const request = { page: 1 };
    const client = createEndpointDataClient();
    const originalInvalidate = client.invalidate.bind(client);
    client.invalidate = ((endpoint, request) => {
      invalidateCalls.push({ endpoint, request });
      return originalInvalidate(endpoint, request);
    }) as typeof client.invalidate;

    const rendered = await createHookRenderer(
      () => ({
        mutation: useEndpointMutation<
          { page: number },
          { count: number },
          { previous: { count: number } | undefined }
        >(mutationEndpoint, {
          fetchFn: (async (options: { method?: string }) => {
            if (options.method === 'GET') {
              return { count: serverCount };
            }

            serverCount += 1;
            return { nope: true };
          }) as never,
          invalidate: {
            endpoint: queryEndpoint,
            request,
          },
          onError: (error, variables, client, context) => {
            onErrorCount += 1;
            expect((error as { isValid?: boolean }).isValid).toBe(false);
            if (context?.previous) {
              client.setData(queryEndpoint, variables, context.previous);
              rolledBackToPrevious =
                client.getData(queryEndpoint, variables)?.count ===
                context.previous.count;
            }
          },
          onMutate: (variables, client) => {
            const previous = client.getData(queryEndpoint, variables);
            client.setData(queryEndpoint, variables, { count: 999 });
            return { previous };
          },
        }),
        query: useEndpointQuery(queryEndpoint, request, {
          fetchFn: (async (options: { method?: string }) => {
            if (options.method === 'GET') {
              return { count: serverCount };
            }

            serverCount += 1;
            return { nope: true };
          }) as never,
          staleTime: 30_000,
        }),
      }),
      client,
    );

    await flush();
    await flush();
    expect(rendered.current.query.data).toEqual({ count: 0 });

    const result = await rendered.current.mutation.mutateAsync(request);
    await flush();
    await flush();

    expect(result.isValid).toBe(false);
    expect(onErrorCount).toBe(1);
    expect(rolledBackToPrevious).toBe(true);
    expect(
      (rendered.current.mutation.error as { isValid?: boolean })?.isValid,
    ).toBe(false);
    expect(rendered.current.mutation.validation?.isValid).toBe(false);

    for (let index = 0; index < 6; index += 1) {
      await flush();
    }

    const queryCount = rendered.current.query.data?.count;
    expect(queryCount).toBeDefined();
    expect(queryCount).not.toBe(999);
    expect([0, serverCount]).toContain(queryCount as number);
    expect(invalidateCalls).toEqual([
      {
        endpoint: queryEndpoint,
        request,
      },
    ]);
  });

  test('overlapping mutations keep isPending true until the last request settles', async () => {
    const resolvers: Array<(value: { ok: boolean }) => void> = [];
    const endpoint = createEndpoint<{ page: number }, { ok: boolean }>({
      method: 'POST',
      path: '/demo/v1/items',
      validateRequest: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { page?: unknown }).page === 'number'
          ? toValidationResult(success(input as { page: number }))
          : toValidationResult(
              failure<{ page: number }>('{ page: number }', '$.page'),
            ),
      validateResponse: (input: unknown) =>
        typeof input === 'object' &&
        input !== null &&
        (input as { ok?: unknown }).ok === true
          ? toValidationResult(success(input as { ok: boolean }))
          : toValidationResult(
              failure<{ ok: boolean }>('{ ok: true }', '$.ok'),
            ),
    });
    const rendered = await createHookRenderer(() =>
      useEndpointMutation(endpoint, {
        fetchFn: (() =>
          new Promise<{ ok: boolean }>((resolve) => {
            resolvers.push(resolve);
          })) as never,
      }),
    );

    const firstPending = rendered.current.mutateAsync({ page: 1 });
    const secondPending = rendered.current.mutateAsync({ page: 2 });
    await flush();

    expect(rendered.current.isPending).toBe(true);
    expect(resolvers).toHaveLength(2);

    resolvers[0]!({ ok: true });
    await firstPending;
    await flush();

    expect(rendered.current.isPending).toBe(true);

    resolvers[1]!({ ok: true });
    await secondPending;
    await flush();

    expect(rendered.current.isPending).toBe(false);
  });
});

afterAll(() => {
  globalThis.window = previousWindow;
  globalThis.document = previousDocument;
  globalThis.navigator = previousNavigator;
  globalThis.HTMLElement = previousHTMLElement;
  globalThis.HTMLIFrameElement = previousHTMLIFrameElement;
  globalThis.Node = previousNode;
  globalThis.Event = previousEvent;
  globalThis.MutationObserver = previousMutationObserver;
});
