import { expect, test } from 'bun:test';

import {
  buildAbilityConfigEntry,
  buildAbilityConfigSource,
  buildAbilityDataSource,
  buildAbilityPhpSource,
  buildAbilitySyncScriptSource,
  buildAbilityTypesSource,
} from '../src/runtime/cli-add-workspace-ability-templates.js';
import {
  REQUIRED_WORKSPACE_ABILITY_COMPATIBILITY,
  resolveScaffoldCompatibilityPolicy,
} from '../src/runtime/templates/scaffold-compatibility.js';
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
  const configEntry = buildAbilityConfigEntry(
    'review-workflow',
    resolveScaffoldCompatibilityPolicy(REQUIRED_WORKSPACE_ABILITY_COMPATIBILITY),
  );
  const configSource = buildAbilityConfigSource('review-workflow', 'demo-space');
  const dataSource = buildAbilityDataSource('review-workflow');
  const phpSource = buildAbilityPhpSource('review-workflow', MOCK_WORKSPACE);
  const syncScriptSource = buildAbilitySyncScriptSource();
  const typesSource = buildAbilityTypesSource('review-workflow');

  expect(configEntry).toContain('    compatibility: {\n      hardMinimums: {');
  expect(configEntry).toContain(
    "    inputTypeName: 'ReviewWorkflowAbilityInput'",
  );
  expect(configSource).toContain('"abilityId": "demo-space/review-workflow"');
  expect(configSource).toContain('"slug": "demo-space-workflows"');
  expect(dataSource).toContain(
    "import type {\n  ReviewWorkflowAbilityInput,\n  ReviewWorkflowAbilityOutput,\n} from './types';",
  );
  expect(dataSource).toContain(
    'export type { ReviewWorkflowAbilityInput, ReviewWorkflowAbilityOutput };',
  );
  expect(phpSource).toContain('wp_register_ability_category');
  expect(phpSource).toContain('wp_register_ability(');
  expect(phpSource).toContain('demo_space_review_workflow_register_ability');
  expect(phpSource).toContain('input.schema.json');
  expect(syncScriptSource).toContain('syncTypeSchemas');
  expect(syncScriptSource).toContain('Unknown sync-abilities flag');
  expect(typesSource).toContain('export interface ReviewWorkflowAbilityInput');
  expect(typesSource).toContain('export interface ReviewWorkflowAbilityOutput');
});

test('ability type clauses wrap when generated names exceed print width', () => {
  const dataSource = buildAbilityDataSource(
    'extraordinarily-long-review-workflow',
  );

  expect(dataSource).toContain(
    'export type {\n  ExtraordinarilyLongReviewWorkflowAbilityInput,\n  ExtraordinarilyLongReviewWorkflowAbilityOutput,\n};',
  );
});
