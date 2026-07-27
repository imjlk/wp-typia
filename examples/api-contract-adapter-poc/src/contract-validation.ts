import {
  createGeneratedSchemaValidator,
  createResponseSchemaValidator,
} from '@wp-typia/block-runtime/schema-test';
import type { ValidationResult } from '@wp-typia/api-client';
import counterBootstrapQuerySchema from '../../persistence-examples/src/blocks/counter/api-schemas/counter-bootstrap-query.schema.json';
import counterBootstrapResponseSchema from '../../persistence-examples/src/blocks/counter/api-schemas/counter-bootstrap-response.schema.json';
import counterQuerySchema from '../../persistence-examples/src/blocks/counter/api-schemas/counter-query.schema.json';
import counterResponseSchema from '../../persistence-examples/src/blocks/counter/api-schemas/counter-response.schema.json';
import incrementRequestSchema from '../../persistence-examples/src/blocks/counter/api-schemas/increment-request.schema.json';
import type {
  PersistenceCounterBootstrapQuery,
  PersistenceCounterBootstrapResponse,
  PersistenceCounterIncrementRequest,
  PersistenceCounterQuery,
  PersistenceCounterResponse,
} from '../../persistence-examples/src/blocks/counter/api-types';

const validateCounterQuerySchema =
	createGeneratedSchemaValidator<PersistenceCounterQuery>(counterQuerySchema);
const validateCounterBootstrapQuerySchema =
	createGeneratedSchemaValidator<PersistenceCounterBootstrapQuery>(
    counterBootstrapQuerySchema,
  );
const validateIncrementRequestSchema =
	createGeneratedSchemaValidator<PersistenceCounterIncrementRequest>(
    incrementRequestSchema,
  );
const validateCounterBootstrapResponseSchema =
	createResponseSchemaValidator<PersistenceCounterBootstrapResponse>(
    counterBootstrapResponseSchema,
  );
const validateCounterResponseSchema =
	createResponseSchemaValidator<PersistenceCounterResponse>(
    counterResponseSchema,
  );

export const counterContractValidators = {
	counterBootstrapQuery: (
		input: unknown,
	): ValidationResult<PersistenceCounterBootstrapQuery> =>
		validateCounterBootstrapQuerySchema(input),
	counterBootstrapResponse: (
		input: unknown,
	): ValidationResult<PersistenceCounterBootstrapResponse> =>
		validateCounterBootstrapResponseSchema(input),
	counterQuery: (input: unknown): ValidationResult<PersistenceCounterQuery> =>
		validateCounterQuerySchema(input),
	counterResponse: (
		input: unknown,
	): ValidationResult<PersistenceCounterResponse> =>
		validateCounterResponseSchema(input),
	incrementRequest: (
		input: unknown,
	): ValidationResult<PersistenceCounterIncrementRequest> =>
		validateIncrementRequestSchema(input),
};

export const counterOperationResponseValidators = {
  getPersistenceCounterBootstrap: counterContractValidators.counterBootstrapResponse,
  getPersistenceCounterState: counterContractValidators.counterResponse,
  incrementPersistenceCounterState: counterContractValidators.counterResponse,
} as const;
