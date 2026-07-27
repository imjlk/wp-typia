import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import counterAiResponseSchema from '../../examples/persistence-examples/src/blocks/counter/wordpress-ai/counter-response.ai.schema.json';
import counterLlmApplicationArtifact from '../../examples/api-contract-adapter-poc/src/typia-llm/counter.llm.application.json';
import counterStructuredOutputArtifact from '../../examples/api-contract-adapter-poc/src/typia-llm/counter-response.structured-output.json';
import {
  buildCounterTypiaLlmArtifacts,
  buildCounterTypiaLlmMethodDescriptors,
  COUNTER_LLM_GENERATED_SOURCE_RELATIVE_PATH,
  type ProjectedTypiaLlmApplicationArtifact,
  type ProjectedTypiaStructuredOutputArtifact,
  renderCounterTypiaLlmGeneratedSource,
} from '../../examples/api-contract-adapter-poc/scripts/sync-typia-llm';

const checkedInApplicationArtifact =
	counterLlmApplicationArtifact as ProjectedTypiaLlmApplicationArtifact;
const checkedInStructuredOutputArtifact =
	counterStructuredOutputArtifact as ProjectedTypiaStructuredOutputArtifact;

describe('typia.llm evaluation artifacts', () => {
	test('checked-in generated source matches the rendered manifest-driven module', () => {
		const generatedSource = readFileSync(
			path.join(import.meta.dir, '..', '..', 'examples', 'api-contract-adapter-poc', COUNTER_LLM_GENERATED_SOURCE_RELATIVE_PATH),
			'utf8',
		);

		expect(generatedSource).toBe(renderCounterTypiaLlmGeneratedSource());
	});

	test('emits the expected checked-in typia.llm artifacts for the counter contracts', async () => {
		const liveArtifacts = await buildCounterTypiaLlmArtifacts();

		expect(liveArtifacts.applicationArtifact).toEqual(checkedInApplicationArtifact);
		expect(liveArtifacts.structuredOutputArtifact).toEqual(
			checkedInStructuredOutputArtifact,
		);
	}, 45_000);

	test('projects exactly the two counter endpoints into function-calling tools', () => {
		expect(checkedInApplicationArtifact.functions.map((fn) => fn.name)).toEqual([
			'getPersistenceCounterState',
			'incrementPersistenceCounterState',
		]);
		expect(buildCounterTypiaLlmMethodDescriptors()).toHaveLength(2);
		expect(checkedInApplicationArtifact.generatedFrom.baselineOpenApiPath).toBe(
			'../persistence-examples/src/blocks/counter/api.openapi.json',
		);

		const getTool = checkedInApplicationArtifact.functions[0];
		const postTool = checkedInApplicationArtifact.functions[1];

		expect(getTool?.parameters.properties).toHaveProperty('postId');
		expect(getTool?.parameters.properties).toHaveProperty('resourceKey');
		expect(getTool?.parameters.required).toEqual(['postId', 'resourceKey']);

		expect(postTool?.parameters.properties).toHaveProperty('postId');
		expect(postTool?.parameters.properties).toHaveProperty('publicWriteRequestId');
		expect(postTool?.parameters.properties).toHaveProperty('resourceKey');
		expect(postTool?.parameters.required).toEqual([
			'postId',
			'publicWriteRequestId',
			'resourceKey',
		]);
		expect(postTool?.parameters.properties?.delta).toMatchObject({
			default: 1,
			minimum: 1,
		});
	});

	test('keeps the structured output artifact aligned with the existing AI-safe counter response shape', () => {
		const aiSafeProperties = Object.keys(
			(counterAiResponseSchema.properties as Record<string, unknown>) ?? {},
		).sort();
		const structuredProperties = Object.keys(
			(checkedInStructuredOutputArtifact.parameters.properties as Record<string, unknown>) ?? {},
		).sort();

		expect(structuredProperties).toEqual(aiSafeProperties);
		expect(checkedInStructuredOutputArtifact.parameters.required).toEqual(
			counterAiResponseSchema.required,
		);
		expect(
			(checkedInStructuredOutputArtifact.parameters.properties as Record<string, { enum?: string[] }>)
				.storage?.enum,
		).toEqual(['custom-table']);
	});
});
