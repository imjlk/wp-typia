import { describe, expect, test } from 'bun:test';

import {
  CLI_DIAGNOSTIC_CODES,
  type CliDiagnosticCodeError,
} from '../src/runtime/cli-diagnostics.js';
import {
  CREATE_TEMPLATE_SELECTION_HINT,
  validateExplicitCreateTemplateId,
} from '../src/runtime/create-template-validation.js';
import {
  OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
  TEMPLATE_IDS,
} from '../src/runtime/template-registry.js';

function catchTemplateValidationError(templateId: string): CliDiagnosticCodeError {
  try {
    validateExplicitCreateTemplateId(templateId);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return error as CliDiagnosticCodeError;
  }

  throw new Error('Expected template validation to throw.');
}

describe('create template boundary validation', () => {
	test('normalizes supported built-in and workspace template ids', () => {
		for (const templateId of TEMPLATE_IDS) {
			expect(validateExplicitCreateTemplateId(templateId)).toBe(templateId);
		}

		expect(validateExplicitCreateTemplateId('workspace')).toBe(
			OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
		);
		expect(
			validateExplicitCreateTemplateId(OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE),
		).toBe(OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE);
	});

	test('keeps explicit external template locators for downstream resolution', () => {
		const externalTemplateIds = [
			'./templates/custom',
			String.raw`.\templates\custom`,
			'../templates/custom',
			String.raw`..\templates\custom`,
			String.raw`templates\custom`,
			'/tmp/wp-typia-template',
			String.raw`C:\templates\wp-typia-template`,
			'github:owner/repo/templates/basic#main',
			'@scope/create-wp-typia-template',
			'@scope/create-wp-typia-template@^1.2.0',
			'my-create-template',
			'my-create-template@latest',
		];

		for (const templateId of externalTemplateIds) {
			expect(validateExplicitCreateTemplateId(templateId)).toBe(templateId);
		}
	});

	test('rejects mistyped built-in template ids with existing suggestions', () => {
		const error = catchTemplateValidationError('basicc');

		expect(error.code).toBe(CLI_DIAGNOSTIC_CODES.UNKNOWN_TEMPLATE);
		expect(error.message).toContain('Unknown template "basicc". Did you mean "basic"?');
		expect(error.message).toContain('`--template basic`');
	});

	test('rejects non-locator template text with valid alternatives', () => {
		const error = catchTemplateValidationError('bad template');

		expect(error.code).toBe(CLI_DIAGNOSTIC_CODES.UNKNOWN_TEMPLATE);
		expect(error.message).toContain(
			'Unknown template "bad template". Expected one of: basic, interactivity, persistence, compound, query-loop, workspace.',
		);
		expect(error.message).toContain(
			'Pass an explicit external template locator such as `./path`',
		);
		expect(CREATE_TEMPLATE_SELECTION_HINT).toContain('github:owner/repo/path[#ref]');
	});
});
