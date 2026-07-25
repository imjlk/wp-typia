import { describe, expect, test } from 'bun:test';

import {
  ApiClientConfigurationError,
  createEndpoint,
  createFetchTransport,
  callEndpoint,
  toValidationResult,
  WpTypiaContractError,
} from '../src/index';

describe('@wp-typia/api-client error contracts', () => {
	test('exports a named contract error baseline from the root surface', () => {
		const error = new ApiClientConfigurationError('boom');

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(WpTypiaContractError);
		expect(error.code).toBe('API_CLIENT_CONFIGURATION_ERROR');
	});

	test('throws ApiClientConfigurationError for public configuration faults', async () => {
		const transport = createFetchTransport({
			baseUrl: 'https://example.test',
			fetchFn: async () => new Response('{}'),
		});
		const endpoint = createEndpoint<{ title: string }, { ok: boolean }>({
			method: 'POST',
			path: '/demo',
			validateRequest: (input: unknown) =>
				toValidationResult(
					typeof input === 'object' &&
						input !== null &&
						typeof (input as { title?: unknown }).title === 'string'
						? {
								data: input as { title: string },
								errors: [],
								success: true,
							}
						: {
								errors: [
									{
										expected: '{ title: string }',
										path: '$.title',
										value: undefined,
									},
								],
								success: false,
							},
				),
			validateResponse: (input: unknown) =>
				toValidationResult(
					typeof input === 'object' &&
						input !== null &&
						(input as { ok?: unknown }).ok === true
						? {
								data: input as { ok: boolean },
								errors: [],
								success: true,
							}
						: {
								errors: [{ expected: '{ ok: true }', path: '$.ok', value: undefined }],
								success: false,
							},
				),
		});

		await expect(transport({})).rejects.toBeInstanceOf(ApiClientConfigurationError);
		await expect(callEndpoint(endpoint, { title: 'Hello' })).rejects.toBeInstanceOf(
			ApiClientConfigurationError,
		);
	});
});
