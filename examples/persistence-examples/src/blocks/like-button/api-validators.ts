import typia from 'typia';

import {
  toValidationResult,
  type ValidationResult,
} from '@wp-typia/api-client';
import type {
  PersistenceLikeBootstrapQuery,
  PersistenceLikeBootstrapResponse,
  PersistenceLikeStatusQuery,
  PersistenceLikeStatusResponse,
  PersistenceToggleLikeRequest,
  PersistenceToggleLikeResponse,
} from './api-types';

const validateLikeBootstrapQuery =
	typia.createValidate< PersistenceLikeBootstrapQuery >();
const validateLikeStatusQuery =
	typia.createValidate< PersistenceLikeStatusQuery >();
const validateLikeBootstrapResponse =
	typia.createValidate< PersistenceLikeBootstrapResponse >();
const validateToggleLikeRequest =
	typia.createValidate< PersistenceToggleLikeRequest >();
const validateLikeStatusResponse =
	typia.createValidate< PersistenceLikeStatusResponse >();
const validateToggleLikeResponse =
	typia.createValidate< PersistenceToggleLikeResponse >();

export const apiValidators = {
	likeBootstrapQuery: (
		input: unknown,
	): ValidationResult< PersistenceLikeBootstrapQuery > =>
		toValidationResult( validateLikeBootstrapQuery( input ) ),
	likeBootstrapResponse: (
		input: unknown,
	): ValidationResult< PersistenceLikeBootstrapResponse > =>
		toValidationResult( validateLikeBootstrapResponse( input ) ),
	likeStatusQuery: (
		input: unknown,
	): ValidationResult< PersistenceLikeStatusQuery > =>
		toValidationResult( validateLikeStatusQuery( input ) ),
	likeStatusResponse: (
		input: unknown,
	): ValidationResult< PersistenceLikeStatusResponse > =>
		toValidationResult( validateLikeStatusResponse( input ) ),
	toggleLikeResponse: (
		input: unknown,
	): ValidationResult< PersistenceToggleLikeResponse > =>
		toValidationResult( validateToggleLikeResponse( input ) ),
	toggleLikeRequest: (
		input: unknown,
	): ValidationResult< PersistenceToggleLikeRequest > =>
		toValidationResult( validateToggleLikeRequest( input ) ),
};
