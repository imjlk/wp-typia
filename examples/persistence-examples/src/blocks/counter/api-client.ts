import {
  callEndpoint,
  createEndpoint,
  type EndpointCallOptions,
} from '@wp-typia/api-client';
import type {
  PersistenceCounterBootstrapQuery,
  PersistenceCounterBootstrapResponse,
  PersistenceCounterIncrementRequest,
  PersistenceCounterQuery,
  PersistenceCounterResponse,
} from './api-types';
import { apiValidators } from './api-validators';

export const getPersistenceCounterStateEndpoint = createEndpoint<
	PersistenceCounterQuery,
	PersistenceCounterResponse
>({
  authIntent: 'public',
  authMode: 'public-read',
  method: 'GET',
  operationId: 'getPersistenceCounterState',
  path: '/persistence-examples/v1/counter',
  requestLocation: 'query',
  validateRequest: apiValidators.counterQuery,
  validateResponse: apiValidators.counterResponse,
});

export function getPersistenceCounterState(
	request: PersistenceCounterQuery,
	options: EndpointCallOptions,
) {
  return callEndpoint( getPersistenceCounterStateEndpoint, request, options );
}

export const incrementPersistenceCounterStateEndpoint = createEndpoint<
	PersistenceCounterIncrementRequest,
	PersistenceCounterResponse
>({
  authIntent: 'public-write-protected',
  authMode: 'public-signed-token',
  method: 'POST',
  operationId: 'incrementPersistenceCounterState',
  path: '/persistence-examples/v1/counter',
  requestLocation: 'body',
  validateRequest: apiValidators.incrementRequest,
  validateResponse: apiValidators.counterResponse,
});

export function incrementPersistenceCounterState(
	request: PersistenceCounterIncrementRequest,
	options: EndpointCallOptions,
) {
  return callEndpoint(
    incrementPersistenceCounterStateEndpoint,
    request,
    options,
  );
}

export const getPersistenceCounterBootstrapEndpoint = createEndpoint<
	PersistenceCounterBootstrapQuery,
	PersistenceCounterBootstrapResponse
>({
  authIntent: 'public',
  authMode: 'public-read',
  method: 'GET',
  operationId: 'getPersistenceCounterBootstrap',
  path: '/persistence-examples/v1/counter/bootstrap',
  requestLocation: 'query',
  validateRequest: apiValidators.counterBootstrapQuery,
  validateResponse: apiValidators.counterBootstrapResponse,
});

export function getPersistenceCounterBootstrap(
	request: PersistenceCounterBootstrapQuery,
	options: EndpointCallOptions,
) {
  return callEndpoint(getPersistenceCounterBootstrapEndpoint, request, options);
}
