import {
  callEndpoint,
  createEndpoint,
  type EndpointCallOptions,
} from '@wp-typia/api-client';
import type {
  PersistenceLikeBootstrapQuery,
  PersistenceLikeBootstrapResponse,
  PersistenceLikeStatusQuery,
  PersistenceLikeStatusResponse,
  PersistenceToggleLikeRequest,
  PersistenceToggleLikeResponse,
} from './api-types';
import { apiValidators } from './api-validators';

export const getPersistenceLikeStatusEndpoint = createEndpoint<
	PersistenceLikeStatusQuery,
	PersistenceLikeStatusResponse
>({
  authIntent: 'public',
  authMode: 'public-read',
  method: 'GET',
  operationId: 'getPersistenceLikeStatus',
  path: '/persistence-examples/v1/likes',
  requestLocation: 'query',
  validateRequest: apiValidators.likeStatusQuery,
  validateResponse: apiValidators.likeStatusResponse,
});

export function getPersistenceLikeStatus(
	request: PersistenceLikeStatusQuery,
	options: EndpointCallOptions,
) {
  return callEndpoint( getPersistenceLikeStatusEndpoint, request, options );
}

export const togglePersistenceLikeStatusEndpoint = createEndpoint<
	PersistenceToggleLikeRequest,
	PersistenceToggleLikeResponse
>({
  authIntent: 'authenticated',
  authMode: 'authenticated-rest-nonce',
  method: 'POST',
  operationId: 'togglePersistenceLikeStatus',
  path: '/persistence-examples/v1/likes',
  requestLocation: 'body',
  validateRequest: apiValidators.toggleLikeRequest,
  validateResponse: apiValidators.toggleLikeResponse,
});

export function togglePersistenceLikeStatus(
	request: PersistenceToggleLikeRequest,
	options: EndpointCallOptions,
) {
  return callEndpoint(togglePersistenceLikeStatusEndpoint, request, options);
}

export const getPersistenceLikeBootstrapEndpoint = createEndpoint<
	PersistenceLikeBootstrapQuery,
	PersistenceLikeBootstrapResponse
>({
  authIntent: 'public',
  authMode: 'public-read',
  method: 'GET',
  operationId: 'getPersistenceLikeBootstrap',
  path: '/persistence-examples/v1/likes/bootstrap',
  requestLocation: 'query',
  validateRequest: apiValidators.likeBootstrapQuery,
  validateResponse: apiValidators.likeBootstrapResponse,
});

export function getPersistenceLikeBootstrap(
	request: PersistenceLikeBootstrapQuery,
	options: EndpointCallOptions,
) {
  return callEndpoint(getPersistenceLikeBootstrapEndpoint, request, options);
}
