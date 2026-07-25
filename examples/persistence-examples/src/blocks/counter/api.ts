import { callEndpoint, resolveRestRouteUrl } from '@wp-typia/rest';

import type {
  PersistenceCounterBootstrapQuery,
  PersistenceCounterIncrementRequest,
  PersistenceCounterQuery,
} from './api-types';
import {
  getPersistenceCounterBootstrapEndpoint,
  getPersistenceCounterStateEndpoint,
  incrementPersistenceCounterStateEndpoint,
} from './api-client';

export const counterBootstrapEndpoint = {
  ...getPersistenceCounterBootstrapEndpoint,
  buildRequestOptions: () => ({
    url: resolveRestRouteUrl(getPersistenceCounterBootstrapEndpoint.path),
  }),
};

export const counterEndpoint = {
  ...getPersistenceCounterStateEndpoint,
  buildRequestOptions: () => ({
    url: resolveRestRouteUrl(getPersistenceCounterStateEndpoint.path),
  }),
};

export const incrementCounterEndpoint = {
  ...incrementPersistenceCounterStateEndpoint,
  buildRequestOptions: () => ({
    url: resolveRestRouteUrl(incrementPersistenceCounterStateEndpoint.path),
  }),
};

export function fetchCounter( request: PersistenceCounterQuery ) {
  return callEndpoint( counterEndpoint, request );
}

export function fetchCounterBootstrap(
	request: PersistenceCounterBootstrapQuery,
) {
  return callEndpoint( counterBootstrapEndpoint, request );
}

export function incrementCounter(
	request: PersistenceCounterIncrementRequest,
) {
  return callEndpoint( incrementCounterEndpoint, request );
}
