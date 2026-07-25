import { expect, test } from 'bun:test';

import { buildAiFeaturePhpSource } from '../src/runtime/cli-add-workspace-ai-templates.js';

test('ai feature templates keep representative generated output stable after the split', () => {
  const phpSource = buildAiFeaturePhpSource(
    'brief-suggestions',
    'demo-space/v1',
    'demo_space',
    'demo-space',
  );

  expect(phpSource).toContain(
    'Customization hooks for the Brief Suggestions AI feature:',
  );
  expect(phpSource).toContain(
    "'demo_space_brief_suggestions_ai_feature_permission'",
  );
  expect(phpSource).toContain(
    "'demo_space_brief_suggestions_ai_feature_prompt_payload'",
  );
  expect(phpSource).toContain('register_rest_route(');
  expect(phpSource).toContain("'demo-space/v1'");
  expect(phpSource).toContain('/ai/brief-suggestions');
});
