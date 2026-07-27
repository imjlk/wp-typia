import {
  WpTypiaContractError,
  WpTypiaValidationAssertionError,
  type ValidationResult,
} from '@wp-typia/api-client';

export {
  ApiClientConfigurationError,
  WpTypiaContractError,
  WpTypiaValidationAssertionError,
} from '@wp-typia/api-client';

export class RestConfigurationError extends WpTypiaContractError {
  constructor(message: string) {
    super(message, 'REST_CONFIGURATION_ERROR');
  }
}

export class RestRootResolutionError extends RestConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class RestQueryHookUsageError extends RestConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class RestValidationAssertionError<
  T = unknown,
> extends WpTypiaValidationAssertionError<T> {
  constructor(
		validation: ValidationResult<T>,
		message: string,
	) {
    super(validation, message);
    this.name = new.target.name;
  }
}
