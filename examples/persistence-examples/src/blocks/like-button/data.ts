import {
  useEndpointMutation,
  useEndpointQuery,
  type UseEndpointMutationOptions,
  type UseEndpointQueryOptions,
} from '@wp-typia/rest/react';

import { resolveRestNonce } from '../../shared/rest';
import type {
  PersistenceLikeBootstrapQuery,
  PersistenceLikeBootstrapResponse,
  PersistenceLikeStatusQuery,
  PersistenceLikeStatusResponse,
  PersistenceToggleLikeRequest,
  PersistenceToggleLikeResponse,
} from './api-types';
import {
  likeBootstrapEndpoint,
  likeStatusEndpoint,
  toggleLikeEndpoint,
} from './api';

function buildNonceRequestOptions( restNonce?: string ) {
  const nonce = resolveRestNonce( restNonce );

  return nonce
    ? {
        requestOptions: {
          headers: {
            'X-WP-Nonce': nonce,
          },
        },
      }
    : undefined;
}

interface ToggleLikeMutationContext<Context> {
  bootstrapPrevious: PersistenceLikeBootstrapResponse | undefined;
  previous: PersistenceLikeStatusResponse | undefined;
  userContext: Context | undefined;
}

export interface UsePersistenceLikeStatusQueryOptions<
	Selected = PersistenceLikeStatusResponse,
> extends Omit<
		UseEndpointQueryOptions<
			PersistenceLikeStatusQuery,
			PersistenceLikeStatusResponse,
			Selected
		>,
		'resolveCallOptions'
	> {}

export interface UsePersistenceLikeBootstrapQueryOptions<
	Selected = PersistenceLikeBootstrapResponse,
> extends Omit<
		UseEndpointQueryOptions<
			PersistenceLikeBootstrapQuery,
			PersistenceLikeBootstrapResponse,
			Selected
		>,
		'resolveCallOptions'
	> {}

export interface UseToggleLikeMutationOptions< Context = unknown >
	extends Omit<
		UseEndpointMutationOptions<
			PersistenceToggleLikeRequest,
			PersistenceToggleLikeResponse,
			ToggleLikeMutationContext< Context >
		>,
		| 'invalidate'
		| 'onError'
		| 'onMutate'
		| 'onSuccess'
		| 'resolveCallOptions'
	> {
  onError?: (
		error: unknown,
		request: PersistenceToggleLikeRequest,
		client: import('@wp-typia/rest/react').EndpointDataClient,
		context: Context | undefined,
	) => void | Promise< void >;
  onMutate?: (
		request: PersistenceToggleLikeRequest,
		client: import('@wp-typia/rest/react').EndpointDataClient,
	) => Context | Promise< Context >;
  onSuccess?: (
		data: PersistenceToggleLikeResponse | undefined,
		request: PersistenceToggleLikeRequest,
		validation: import('@wp-typia/rest').ValidationResult< PersistenceToggleLikeResponse >,
		client: import('@wp-typia/rest/react').EndpointDataClient,
		context: Context | undefined,
	) => void | Promise< void >;
  restNonce?: string;
}

export function usePersistenceLikeStatusQuery<
	Selected = PersistenceLikeStatusResponse,
>(
	request: PersistenceLikeStatusQuery,
	options: UsePersistenceLikeStatusQueryOptions< Selected > = {},
) {
  return useEndpointQuery(likeStatusEndpoint, request, {
    ...options,
  });
}

export function usePersistenceLikeBootstrapQuery<
	Selected = PersistenceLikeBootstrapResponse,
>(
	request: PersistenceLikeBootstrapQuery,
	options: UsePersistenceLikeBootstrapQueryOptions< Selected > = {},
) {
  return useEndpointQuery(likeBootstrapEndpoint, request, {
    ...options,
  });
}

export function useToggleLikeMutation< Context = unknown >(
	options: UseToggleLikeMutationOptions< Context > = {},
) {
  const { onError, onMutate, onSuccess, restNonce, ...mutationOptions } =
		options;

  return useEndpointMutation( toggleLikeEndpoint, {
		...mutationOptions,
		invalidate: ( _data, request ) => ( {
			endpoint: likeStatusEndpoint,
			request: {
				postId: request.postId,
				resourceKey: request.resourceKey,
			},
		} ),
		onError: async ( error, request, client, context ) => {
			if ( context?.previous ) {
				client.setData(
					likeStatusEndpoint,
					{
						postId: request.postId,
						resourceKey: request.resourceKey,
					},
					context.previous,
				);
			}
			if ( context?.bootstrapPrevious ) {
				client.setData(
					likeBootstrapEndpoint,
					{
						postId: request.postId,
						resourceKey: request.resourceKey,
					},
					context.bootstrapPrevious,
				);
			}

			await onError?.( error, request, client, context?.userContext );
		},
		onMutate: async ( request, client ) => {
			const queryRequest = {
				postId: request.postId,
				resourceKey: request.resourceKey,
			} satisfies PersistenceLikeStatusQuery;
			const previous = client.getData( likeStatusEndpoint, queryRequest );
			const bootstrapRequest = {
				postId: request.postId,
				resourceKey: request.resourceKey,
			} satisfies PersistenceLikeBootstrapQuery;
			const bootstrapPrevious = client.getData(
				likeBootstrapEndpoint,
				bootstrapRequest,
			);

			if ( previous !== undefined ) {
				client.setData(
					likeStatusEndpoint,
					queryRequest,
					( current ) => {
						if ( ! current || bootstrapPrevious === undefined ) {
							return current;
						}

						const nextLiked =
							! bootstrapPrevious.likedByCurrentUser;
						return {
							...current,
							count: Math.max(
								0,
								current.count + ( nextLiked ? 1 : -1 ),
							),
							likedByCurrentUser: nextLiked,
						};
					},
				);
			}
			if ( bootstrapPrevious !== undefined ) {
				client.setData(
					likeBootstrapEndpoint,
					bootstrapRequest,
					( current ) => {
						if ( ! current ) {
							return current;
						}

						return {
							...current,
							likedByCurrentUser: ! current.likedByCurrentUser,
						};
					},
				);
			}

			let userContext: Context | undefined;
			try {
				userContext = onMutate
					? await onMutate( request, client )
					: undefined;
			} catch ( error ) {
				if ( previous !== undefined ) {
					client.setData(
						likeStatusEndpoint,
						queryRequest,
						previous,
					);
				}
				if ( bootstrapPrevious !== undefined ) {
					client.setData(
						likeBootstrapEndpoint,
						bootstrapRequest,
						bootstrapPrevious,
					);
				}
				throw error;
			}

			return {
				bootstrapPrevious,
				previous,
				userContext,
			};
		},
		onSuccess: async ( data, request, validation, client, context ) => {
			if ( data ) {
				const queryRequest = {
					postId: request.postId,
					resourceKey: request.resourceKey,
				} satisfies PersistenceLikeStatusQuery;

				client.setData(
					likeStatusEndpoint,
					queryRequest,
					( current ) =>
						current
							? {
									...current,
									count: data.count,
									likedByCurrentUser: data.likedByCurrentUser,
							  }
							: current,
				);
				client.setData(
					likeBootstrapEndpoint,
					queryRequest,
					( current ) =>
						current
							? {
									...current,
									likedByCurrentUser: data.likedByCurrentUser,
							  }
							: current,
				);
			}

			await onSuccess?.(
				data,
				request,
				validation,
				client,
				context?.userContext,
			);
		},
		resolveCallOptions: () => buildNonceRequestOptions( restNonce ),
	} );
}
