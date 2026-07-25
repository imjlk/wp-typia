import typia from 'typia';
import type {
  PersistenceCounterIncrementRequest,
  PersistenceCounterQuery,
  PersistenceCounterResponse,
} from '../../../persistence-examples/src/blocks/counter/api-types';

export interface CounterRestToolController {
	/**
	 * Read the current counter state.
	 *
	 * REST path: GET /persistence-examples/v1/counter
	 * Auth intent: public
	 * @tag Counter
	 */
  getPersistenceCounterState(input: PersistenceCounterQuery): PersistenceCounterResponse;

	/**
	 * Increment the current counter state.
	 *
	 * REST path: POST /persistence-examples/v1/counter
	 * Auth intent: public-write-protected
	 * WordPress auth: public-signed-token (field: publicWriteToken)
	 * @tag Counter
	 */
  incrementPersistenceCounterState(input: PersistenceCounterIncrementRequest): PersistenceCounterResponse;
}

export const counterLlmApplication =
	typia.llm.application<CounterRestToolController>();

export const counterResponseStructuredOutput =
	typia.llm.structuredOutput<PersistenceCounterResponse>();
