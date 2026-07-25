import { callEndpoint, resolveRestRouteUrl } from '@wp-typia/rest';

import { resolveRestNonce } from '../../shared/rest';
import type {
  PersistenceLikeBootstrapQuery,
  PersistenceLikeStatusQuery,
  PersistenceToggleLikeRequest,
} from './api-types';
import {
  getPersistenceLikeBootstrapEndpoint,
  getPersistenceLikeStatusEndpoint,
  togglePersistenceLikeStatusEndpoint,
} from './api-client';

export const likeStatusEndpoint = {
  ...getPersistenceLikeStatusEndpoint,
  buildRequestOptions: () => ({
    url: resolveRestRouteUrl(getPersistenceLikeStatusEndpoint.path),
  }),
};

export const likeBootstrapEndpoint = {
  ...getPersistenceLikeBootstrapEndpoint,
  buildRequestOptions: () => ({
    url: resolveRestRouteUrl(getPersistenceLikeBootstrapEndpoint.path),
  }),
};

export const toggleLikeEndpoint = {
  ...togglePersistenceLikeStatusEndpoint,
  buildRequestOptions: () => ({
    url: resolveRestRouteUrl(togglePersistenceLikeStatusEndpoint.path),
  }),
};

export function fetchLikeStatus( request: PersistenceLikeStatusQuery ) {
  return callEndpoint( likeStatusEndpoint, request );
}

export function fetchLikeBootstrap( request: PersistenceLikeBootstrapQuery ) {
  return callEndpoint( likeBootstrapEndpoint, request );
}

export function toggleLike(
	request: PersistenceToggleLikeRequest,
	restNonce?: string,
) {
  const nonce = resolveRestNonce( restNonce );

  return callEndpoint(toggleLikeEndpoint, request, {
    requestOptions: nonce
      ? {
          headers: {
            'X-WP-Nonce': nonce,
          },
        }
      : undefined,
  });
}
