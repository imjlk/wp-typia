import { useRef, useState } from '@wordpress/element';

import {
  callEndpoint,
  type ApiEndpoint,
  type EndpointValidationResult,
} from './client.js';
import {
  normalizeInvalidateTargets,
  type UseEndpointMutationOptions,
  type UseEndpointMutationResult,
  useEndpointDataClient,
} from './react-client.js';

/**
 * Execute a non-GET endpoint contract and keep mutation state in React state.
 *
 * @param endpoint - Endpoint contract to execute for each mutation.
 * @param options - Cache invalidation and lifecycle callbacks for the mutation.
 * @returns Mutation state plus `mutate`, `mutateAsync`, and `reset` helpers.
 * @example
 * ```tsx
 * const mutation = useEndpointMutation(saveEndpoint, {
 *   invalidate: [{ endpoint: listEndpoint }],
 * });
 * ```
 * @category React
 */
export function useEndpointMutation<Req, Res, Context = unknown>(
  endpoint: ApiEndpoint<Req, Res>,
  options: UseEndpointMutationOptions<Req, Res, Context> = {},
): UseEndpointMutationResult<Req, Res> {
  const defaultClient = useEndpointDataClient();
  const client = options.client ?? defaultClient;
  const {
    fetchFn,
    invalidate,
    onError,
    onMutate,
    onSettled,
    onSuccess,
    resolveCallOptions,
  } = options;
  const [data, setData] = useState<Res | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [isPending, setIsPending] = useState(false);
  const [validation, setValidation] = useState<EndpointValidationResult<
    Req,
    Res
  > | null>(null);
  const pendingCountRef = useRef(0);
  const latestRef = useRef({
    client,
    endpoint,
    fetchFn,
    invalidate,
    onError,
    onMutate,
    onSettled,
    onSuccess,
    resolveCallOptions,
  });
  latestRef.current = {
    client,
    endpoint,
    fetchFn,
    invalidate,
    onError,
    onMutate,
    onSettled,
    onSuccess,
    resolveCallOptions,
  };

  const mutateAsyncRef =
    useRef<(variables: Req) => Promise<EndpointValidationResult<Req, Res>>>();
  if (!mutateAsyncRef.current) {
    mutateAsyncRef.current = async (variables: Req) => {
      const latest = latestRef.current;
      pendingCountRef.current += 1;
      setIsPending(true);
      setError(null);
      setValidation(null);
      let context: Context | undefined;

      try {
        context = latest.onMutate
          ? await latest.onMutate(variables, latest.client)
          : undefined;
        const callOptions = latest.resolveCallOptions?.(variables);
        const fetchFn = callOptions?.fetchFn ?? latest.fetchFn;
        const requestOptions = callOptions?.requestOptions;
        const result = await callEndpoint(latest.endpoint, variables, {
          ...(fetchFn === undefined ? {} : { fetchFn }),
          ...(requestOptions === undefined ? {} : { requestOptions }),
        });
        setValidation(result);

        if (result.isValid) {
          setData(result.data);
          await latest.onSuccess?.(
            result.data,
            variables,
            result,
            latest.client,
            context,
          );

          const targets = normalizeInvalidateTargets(
            typeof latest.invalidate === 'function'
              ? latest.invalidate(result.data, variables, result)
              : latest.invalidate,
          );
          for (const target of targets) {
            latest.client.invalidate(target.endpoint, target.request);
          }
        } else {
          setData(undefined);
          setError(result);

          await latest.onError?.(result, variables, latest.client, context);

          const targets = normalizeInvalidateTargets(
            typeof latest.invalidate === 'function'
              ? latest.invalidate(undefined, variables, result)
              : latest.invalidate,
          );
          for (const target of targets) {
            latest.client.invalidate(target.endpoint, target.request);
          }
        }

        await latest.onSettled?.(
          {
            data: result.isValid ? result.data : undefined,
            error: result.isValid ? null : result,
            validation: result,
          },
          variables,
          latest.client,
          context,
        );

        return result;
      } catch (nextError) {
        setData(undefined);
        setError(nextError);
        setValidation(null);
        await latest.onError?.(nextError, variables, latest.client, context);
        await latest.onSettled?.(
          {
            data: undefined,
            error: nextError,
            validation: null,
          },
          variables,
          latest.client,
          context,
        );
        throw nextError;
      } finally {
        pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
        setIsPending(pendingCountRef.current > 0);
      }
    };
  }
  const mutateAsync = mutateAsyncRef.current;

  const mutate = (variables: Req) => {
    void mutateAsync(variables).catch(() => {});
  };

  const reset = () => {
    pendingCountRef.current = 0;
    setData(undefined);
    setError(null);
    setIsPending(false);
    setValidation(null);
  };

  return {
    data,
    error,
    isPending,
    mutate,
    mutateAsync,
    reset,
    validation,
  };
}
