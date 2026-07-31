import { describe, expect, test } from 'bun:test';

import { buildTypiaLlmToolEndpointPhpSource } from '../src/runtime/add/cli-add-workspace-ai-templates.js';

describe('buildTypiaLlmToolEndpointPhpSource', () => {
  test('generates PHP that loads the llm application artifact', () => {
    const source = buildTypiaLlmToolEndpointPhpSource(
      'counter',
      'persistence-examples/v1',
      'persistence_examples',
      'persistence-examples',
    );

    expect(source).toContain('<?php');
    expect(source).toContain(
      'persistence_examples_counter_load_llm_application',
    );
    expect(source).toContain('counter.llm.application.json');
    expect(source).toContain('typia-llm/counter.llm.application.json');
  });

  test('registers a read-only tools endpoint and a dispatch endpoint', () => {
    const source = buildTypiaLlmToolEndpointPhpSource(
      'counter',
      'persistence-examples/v1',
      'persistence_examples',
      'persistence-examples',
    );

    expect(source).toContain("'/llm-tools/counter'");
    expect(source).toContain("'/llm-tools/counter/dispatch'");
    expect(source).toContain('WP_REST_Server::READABLE');
    expect(source).toContain('WP_REST_Server::CREATABLE');
    expect(source).toContain('rest_api_init');
  });

  test('dispatch handler routes tool calls through wp_execute_ability', () => {
    const source = buildTypiaLlmToolEndpointPhpSource(
      'counter',
      'persistence-examples/v1',
      'persistence_examples',
      'persistence-examples',
    );

    expect(source).toContain('wp_get_ability');
    expect(source).toContain('wp_execute_ability');
    expect(source).toContain('persistence_examples_counter_dispatch_llm_tool');
  });

  test('returns 404 when the artifact is not found', () => {
    const source = buildTypiaLlmToolEndpointPhpSource(
      'counter',
      'persistence-examples/v1',
      'persistence_examples',
      'persistence-examples',
    );

    expect(source).toContain('typia_llm_artifact_not_found');
    expect(source).toContain('404');
  });
});
