import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from '@wordpress/element';

import {
  callEndpoint,
  type ApiEndpoint,
  type EndpointValidationResult,
} from './client.js';
import { RestQueryHookUsageError } from './errors.js';
import {
  asInternalClient,
  castEndpointValidationResult,
  createCacheKey,
  isInvalidValidationResult,
  selectEndpointData,
  toEndpointRequestValidationResult,
  type UseEndpointQueryOptions,
  type UseEndpointQueryResult,
  useEndpointDataClient,
} from './react-client.js';

/**
 * Query an endpoint contract and keep the validated result in the shared cache.
 *
 * @remarks
 * Use `select`, `enabled`, and `staleTime` to adapt the hook to UI needs
 * without leaking transport or validation details into components.
 *
 * @param endpoint - GET endpoint contract to execute.
 * @param request - Query input used to build the cache key and request.
 * @param options - Cache, fetch, and lifecycle options for the query.
 * @returns Query state, cached data, validation details, and a refetch helper.
 * @example
 * ```tsx
 * const query = useEndpointQuery(endpoint, { slug: "hero-card" });
 * ```
 * @category React
 */
export function useEndpointQuery<Req, Res, Selected = Res>(
  endpoint: ApiEndpoint<Req, Res>,
  request: Req,
  options: UseEndpointQueryOptions<Req, Res, Selected> = {},
): UseEndpointQueryResult<Res, Selected, Req> {
  if (endpoint.method !== 'GET') {
    throw new RestQueryHookUsageError(
      'useEndpointQuery only supports GET endpoints in v1.',
    );
  }

  const defaultClient = useEndpointDataClient();
  const client = asInternalClient(options.client ?? defaultClient);
  const {
    enabled = true,
    fetchFn,
    initialData,
    onError,
    onSuccess,
    resolveCallOptions,
    select,
    staleTime = 0,
  } = options;
  const prepared = useMemo(
    () => createCacheKey(endpoint, request),
    [endpoint, request],
  );
  const snapshot = useSyncExternalStore(
    (listener) => client.__subscribe(prepared.cacheKey, listener),
    () => client.__getSnapshot(prepared.cacheKey),
    () => client.__getSnapshot(prepared.cacheKey),
  );
  const latestRef = useRef({
    cacheKey: prepared.cacheKey,
    client,
    endpoint,
    fetchFn,
    onError,
    onSuccess,
    request,
    requestValidation: prepared.requestValidation,
    resolveCallOptions,
    select,
    staleTime,
  });
  latestRef.current = {
    cacheKey: prepared.cacheKey,
    client,
    endpoint,
    fetchFn,
    onError,
    onSuccess,
    request,
    requestValidation: prepared.requestValidation,
    resolveCallOptions,
    select,
    staleTime,
  };

  const refetchRef =
    useRef<() => Promise<EndpointValidationResult<Req, Res>>>();
  const executeQueryRef =
    useRef<(force: boolean) => Promise<EndpointValidationResult<Req, Res>>>();
  const hasAutoFetchedZeroStaleRef = useRef(false);
  useEffect(() => {
    hasAutoFetchedZeroStaleRef.current = false;
  }, [enabled, prepared.cacheKey, staleTime]);
  // Keep these callbacks stable while still reading the latest runtime inputs
  // from latestRef.current on each execution.
  if (!executeQueryRef.current) {
    executeQueryRef.current = async (force) => {
      const latest = latestRef.current;
      if (isInvalidValidationResult(latest.requestValidation)) {
        const invalidValidation = toEndpointRequestValidationResult(
          latest.requestValidation,
        );
        latest.client.__publishValidation(latest.cacheKey, invalidValidation);
        return invalidValidation;
      }

      try {
        const callOptions = latest.resolveCallOptions?.();
        const fetchFn = callOptions?.fetchFn ?? latest.fetchFn;
        const requestOptions = callOptions?.requestOptions;
        const validation = await latest.client.__runQuery(
          latest.cacheKey,
          () =>
            callEndpoint(latest.endpoint, latest.request, {
              ...(fetchFn === undefined ? {} : { fetchFn }),
              ...(requestOptions === undefined ? {} : { requestOptions }),
            }),
          { force, staleTime: latest.staleTime },
        );

        if (validation.isValid) {
          const selected = selectEndpointData(validation.data, latest.select);
          await latest.onSuccess?.(selected, validation);
        }

        return validation;
      } catch (error) {
        await latest.onError?.(error);
        throw error;
      }
    };
  }
  const executeQuery = executeQueryRef.current;
  if (!refetchRef.current) {
    refetchRef.current = () => executeQuery(true);
  }
  const refetch = refetchRef.current;

  useEffect(() => {
    return client.__registerRefetcher(prepared.cacheKey, () => refetch());
  }, [client, prepared.cacheKey, refetch]);

  useEffect(() => {
    if (initialData === undefined || snapshot.validation) {
      return;
    }

    client.__seedData(prepared.cacheKey, initialData);
  }, [client, initialData, prepared.cacheKey, snapshot.validation]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (isInvalidValidationResult(prepared.requestValidation)) {
      if (snapshot.validation?.isValid === false) {
        return;
      }

      client.__publishValidation(
        prepared.cacheKey,
        toEndpointRequestValidationResult(prepared.requestValidation),
      );
      return;
    }

    if (snapshot.isFetching) {
      return;
    }

    const shouldFetch =
      snapshot.updatedRevision === 0
        ? initialData === undefined
        : snapshot.invalidatedRevision > snapshot.updatedRevision
          ? true
          : snapshot.error !== null
            ? false
            : staleTime === 0
              ? !hasAutoFetchedZeroStaleRef.current
              : Date.now() - snapshot.updatedAt > staleTime;

    if (!shouldFetch) {
      return;
    }

    if (staleTime === 0) {
      hasAutoFetchedZeroStaleRef.current = true;
    }
    void executeQuery(false).catch(() => {});
  }, [
    client,
    enabled,
    executeQuery,
    initialData,
    prepared.cacheKey,
    prepared.requestValidation.isValid,
    snapshot.isFetching,
    refetch,
    snapshot.invalidatedRevision,
    snapshot.updatedAt,
    snapshot.updatedRevision,
    staleTime,
  ]);

  const data = useMemo(() => {
    const rawData =
      snapshot.data === undefined && snapshot.validation === null
        ? initialData
        : (snapshot.data as Res | undefined);
    if (rawData === undefined) {
      return undefined;
    }

    return selectEndpointData(rawData, select);
  }, [initialData, select, snapshot.data, snapshot.validation]);

  return {
    data,
    error: snapshot.error,
    isFetching: snapshot.isFetching,
    isLoading: snapshot.isFetching && data === undefined,
    refetch,
    validation:
      snapshot.validation === null
        ? null
        : castEndpointValidationResult(snapshot.validation),
  };
}
