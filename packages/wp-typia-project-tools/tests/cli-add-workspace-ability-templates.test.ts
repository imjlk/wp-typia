import { expect, test } from 'bun:test';

import {
  buildAbilityConfigSource,
  buildAbilityPhpSource,
  buildAbilitySyncScriptSource,
} from '../src/runtime/cli-add-workspace-ability-templates.js';
import type { WorkspaceProject } from '../src/runtime/workspace-project.js';

const MOCK_WORKSPACE: WorkspaceProject = {
  author: 'Demo Author',
  packageManager: 'npm',
  packageName: 'demo-space',
  projectDir: '/tmp/demo-space',
  workspace: {
    namespace: 'demo-space',
    phpPrefix: 'demo_space',
    projectType: 'workspace',
    templatePackage: '@wp-typia/create-workspace-template',
    textDomain: 'demo-space',
  },
};

test('ability templates keep representative generated output stable after the split', () => {
  const configSource = buildAbilityConfigSource('review-workflow', 'demo-space');
  const phpSource = buildAbilityPhpSource('review-workflow', MOCK_WORKSPACE);
  const syncScriptSource = buildAbilitySyncScriptSource();

  expect(configSource).toContain('"abilityId": "demo-space/review-workflow"');
  expect(configSource).toContain('"slug": "demo-space-workflows"');
  expect(phpSource).toContain('wp_register_ability_category');
  expect(phpSource).toContain('wp_register_ability(');
  expect(phpSource).toContain('demo_space_review_workflow_register_ability');
  expect(phpSource).toContain('input.schema.json');
  expect(syncScriptSource).toContain('syncTypeSchemas');
  expect(syncScriptSource).toContain('Unknown sync-abilities flag');
});
