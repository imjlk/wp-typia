import { useEffect, useState } from '@wordpress/element';
import {
  type TypiaValidationError,
  type ValidationResult,
  toValidationState,
} from '@wp-typia/block-runtime/validation';

export type {
  TypiaValidationError,
  ValidationResult,
} from '@wp-typia/block-runtime/validation';

export function useTypiaValidation< T >(
	data: T,
	validator: ( value: T ) => ValidationResult< T >,
) {
  const [ isValid, setIsValid ] = useState( true );
  const [ errors, setErrors ] = useState< TypiaValidationError[] >( [] );
  const [ errorMessages, setErrorMessages ] = useState< string[] >( [] );

  useEffect(() => {
    const result = toValidationState(validator(data));
    setIsValid(result.isValid);
    setErrors(result.errors);
    setErrorMessages(result.errorMessages);
  }, [data, validator]);

  return { isValid, errors, errorMessages };
}
