import typia from 'typia';

import {
  toValidationResult,
  type ValidationResult,
} from '@wp-typia/api-client';
import type {
  PersistenceCounterBootstrapQuery,
  PersistenceCounterBootstrapResponse,
  PersistenceCounterIncrementRequest,
  PersistenceCounterQuery,
  PersistenceCounterResponse,
} from './api-types';

const validateCounterQuery = typia.createValidate< PersistenceCounterQuery >();
const validateCounterBootstrapQuery =
	typia.createValidate< PersistenceCounterBootstrapQuery >();
const validateIncrementRequest =
	typia.createValidate< PersistenceCounterIncrementRequest >();
const validateCounterBootstrapResponse =
	typia.createValidate< PersistenceCounterBootstrapResponse >();
const validateCounterResponse =
	typia.createValidate< PersistenceCounterResponse >();

export const apiValidators = {
	counterBootstrapQuery: (
		input: unknown,
	): ValidationResult< PersistenceCounterBootstrapQuery > =>
		toValidationResult( validateCounterBootstrapQuery( input ) ),
	counterBootstrapResponse: (
		input: unknown,
	): ValidationResult< PersistenceCounterBootstrapResponse > =>
		toValidationResult( validateCounterBootstrapResponse( input ) ),
	counterQuery: (
		input: unknown,
	): ValidationResult< PersistenceCounterQuery > =>
		toValidationResult( validateCounterQuery( input ) ),
	counterResponse: (
		input: unknown,
	): ValidationResult< PersistenceCounterResponse > =>
		toValidationResult( validateCounterResponse( input ) ),
	incrementRequest: (
		input: unknown,
	): ValidationResult< PersistenceCounterIncrementRequest > =>
		toValidationResult( validateIncrementRequest( input ) ),
};
