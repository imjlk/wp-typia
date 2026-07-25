/* eslint-disable no-console */
import typia from 'typia';
import currentManifest from './typia.manifest.json';
import {
  applyTemplateDefaultsFromManifest,
  parseManifestDefaultsDocument,
} from '@wp-typia/block-runtime/defaults';
import { generateResourceKey } from '@wp-typia/block-runtime/identifiers';
import {
  createAttributeUpdater as createValidatedAttributeUpdater,
  type ValidationResult,
  toValidationResult,
} from '@wp-typia/block-runtime/validation';
import type {
  PersistenceLikeButtonAttributes,
  PersistenceLikeButtonValidationResult,
} from './types';

const validate = typia.createValidate< PersistenceLikeButtonAttributes >();
const assert = typia.createAssert< PersistenceLikeButtonAttributes >();
const is = typia.createIs< PersistenceLikeButtonAttributes >();
const random = typia.createRandom< PersistenceLikeButtonAttributes >();
const clone = typia.plain.createClone< PersistenceLikeButtonAttributes >();
const prune = typia.plain.createPrune< PersistenceLikeButtonAttributes >();

export const validatePersistenceLikeButtonAttributes = (
	attributes: unknown,
): PersistenceLikeButtonValidationResult => {
  return toValidationResult( validate( attributes ) );
};

export const validators = {
  assert,
  clone,
  is,
  prune,
  random,
  validate: validatePersistenceLikeButtonAttributes,
};

export const sanitizePersistenceLikeButtonAttributes = (
	attributes: Partial< PersistenceLikeButtonAttributes >,
): PersistenceLikeButtonAttributes => {
  const normalized =
		applyTemplateDefaultsFromManifest< PersistenceLikeButtonAttributes >(
      parseManifestDefaultsDocument(currentManifest),
      attributes,
    );

  return validators.assert( {
		...normalized,
		resourceKey:
			normalized.resourceKey && normalized.resourceKey.length > 0
				? normalized.resourceKey
				: generateResourceKey( 'persistence-like-button' ),
	} );
};

export function createAttributeUpdater(
	attributes: PersistenceLikeButtonAttributes,
	setAttributes: (
		attrs: Partial< PersistenceLikeButtonAttributes >,
	) => void,
	validator = validatePersistenceLikeButtonAttributes,
) {
  return createValidatedAttributeUpdater(
		attributes,
		setAttributes,
		validator as (
			value: PersistenceLikeButtonAttributes,
		) => ValidationResult< PersistenceLikeButtonAttributes >,
		( validation, key ) => {
			console.error(
				`Validation failed for ${ String( key ) }:`,
				validation.errors,
			);
		},
	);
}
