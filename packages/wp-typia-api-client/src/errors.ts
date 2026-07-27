import type { ValidationResult } from './runtime-primitives.js';

export class WpTypiaContractError extends Error {
  readonly code: string;

  constructor(message: string, code = 'WP_TYPIA_CONTRACT_ERROR') {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ApiClientConfigurationError extends WpTypiaContractError {
  constructor(message: string) {
    super(message, 'API_CLIENT_CONFIGURATION_ERROR');
  }
}

export class WpTypiaValidationAssertionError<T = unknown> extends Error {
  readonly code = 'WP_TYPIA_VALIDATION_ASSERTION_ERROR';
  readonly validation: ValidationResult<T>;

  constructor(
		validation: ValidationResult<T>,
		message: string,
	) {
    super(message);
    this.name = new.target.name;
    this.validation = validation;
  }
}
