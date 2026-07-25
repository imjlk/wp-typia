/* eslint-disable no-console */
import typia from 'typia';
import { generateBlockId } from '@wp-typia/block-runtime/identifiers';
import {
	createNestedAttributeUpdater as createValidatedNestedAttributeUpdater,
	type ValidationResult,
} from '@wp-typia/block-runtime/validation';
import currentManifest from './manifest-defaults-document';
import { MyTypiaBlockAttributes } from './types';
import { createTemplateValidatorToolkit } from './validator-toolkit';

/**
 * Typia validators for the block attributes
 */
const scaffoldValidators =
	createTemplateValidatorToolkit< MyTypiaBlockAttributes >( {
		assert: typia.createAssert< MyTypiaBlockAttributes >(),
		clone: typia.plain.createClone< MyTypiaBlockAttributes >() as (
			value: MyTypiaBlockAttributes
		) => MyTypiaBlockAttributes,
		finalize: ( normalized ) => ( {
			...normalized,
			id:
				normalized.id && normalized.id.length > 0
					? normalized.id
					: generateBlockId(),
		} ),
		is: typia.createIs< MyTypiaBlockAttributes >(),
		manifest: currentManifest,
		prune: typia.plain.createPrune< MyTypiaBlockAttributes >(),
		random: typia.createRandom< MyTypiaBlockAttributes >() as (
			...args: unknown[]
		) => MyTypiaBlockAttributes,
		validate: typia.createValidate< MyTypiaBlockAttributes >(),
	} );

export const validateMyTypiaBlockAttributes = (
	attributes: unknown
): ValidationResult< MyTypiaBlockAttributes > =>
	scaffoldValidators.validateAttributes(
		attributes
	) as ValidationResult< MyTypiaBlockAttributes >;

export const validators = scaffoldValidators.validators;

export function sanitizeMyTypiaBlockAttributes(
	attributes: Partial< MyTypiaBlockAttributes >
): MyTypiaBlockAttributes {
	return scaffoldValidators.sanitizeAttributes(
		attributes
	) as MyTypiaBlockAttributes;
}

/**
 * Create safe attribute updater with validation
 * @param attributes
 * @param setAttributes
 * @param validator
 */
export function createAttributeUpdater(
	attributes: MyTypiaBlockAttributes,
	setAttributes: ( attrs: Partial< MyTypiaBlockAttributes > ) => void,
	validator = validateMyTypiaBlockAttributes
) {
	return scaffoldValidators.createAttributeUpdater(
		attributes,
		setAttributes,
		validator
	);
}

export function createNestedAttributeUpdater(
	attributes: MyTypiaBlockAttributes,
	setAttributes: ( attrs: Partial< MyTypiaBlockAttributes > ) => void,
	validator = validateMyTypiaBlockAttributes
) {
	return createValidatedNestedAttributeUpdater(
		attributes,
		setAttributes,
		validator,
		( validation, path ) => {
			console.error(
				`Validation failed for ${ path }:`,
				validation.errors
			);
		}
	);
}
