import { createFetchTransport } from '@wp-typia/api-client';

import {
  getPersistenceCounterState,
  incrementPersistenceCounterState,
} from '../../persistence-examples/src/blocks/counter/api-client';
import type {
  PersistenceCounterIncrementRequest,
  PersistenceCounterQuery,
  PersistenceCounterResponse,
} from '../../persistence-examples/src/blocks/counter/api-types';

export interface CounterPortableClient {
  getCounterState: (
		request: PersistenceCounterQuery,
	) => ReturnType< typeof getPersistenceCounterState >;
  incrementCounterState: (
		request: PersistenceCounterIncrementRequest,
	) => ReturnType< typeof incrementPersistenceCounterState >;
}

export function createCounterPortableClient(
	baseUrl: string,
): CounterPortableClient {
  const transport = createFetchTransport({
    baseUrl,
  });

  return {
		getCounterState: ( request: PersistenceCounterQuery ) =>
			getPersistenceCounterState( request, {
				transport,
			} ),
		incrementCounterState: (
			request: PersistenceCounterIncrementRequest,
		) =>
			incrementPersistenceCounterState( request, {
				transport,
			} ),
	};
}

export type {
  PersistenceCounterIncrementRequest,
  PersistenceCounterQuery,
  PersistenceCounterResponse,
};
