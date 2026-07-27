import { describe, expect, test } from 'bun:test';

import {
  getScaffoldTemplateVariableGroups,
  getTemplateVariables,
} from '../src/runtime/index.js';
import {
  getScaffoldAlternateRenderTargets,
  isCompoundPersistenceEnabled,
} from '../src/runtime/scaffold-template-variable-groups.js';
import {
  buildTemplateVariablesFromBlockSpec,
  createBuiltInBlockSpec,
} from '../src/runtime/block-generator-service-spec.js';

describe('scaffold template variable groups', () => {
  test('persistence scaffolds expose a single-scope persistence group', () => {
    const variables = getTemplateVariables('persistence', {
      author: 'Test Runner',
      description: 'Persistence scaffold',
      namespace: 'demo',
      phpPrefix: 'demo_block',
      slug: 'demo-persistence',
      textDomain: 'demo-persistence',
      title: 'Demo Persistence',
    });
    const groups = getScaffoldTemplateVariableGroups(variables);

    expect(groups.templateFamily).toBe('persistence');
    expect(groups.compound.enabled).toBe(false);
    expect(groups.queryLoop.enabled).toBe(false);
    expect(groups.persistence.enabled).toBe(true);
    if (!groups.persistence.enabled) {
      throw new Error('Expected persistence group to be enabled');
    }
    expect(groups.persistence.scope).toBe('single');
    expect(groups.persistence.policy).toBe('authenticated');
    expect(groups.persistence.auth.isAuthenticated).toBe(true);
  });

  test('compound specs attach compound and alternate render-target groups', () => {
    const spec = createBuiltInBlockSpec({
      alternateRenderTargets: 'email,mjml',
      answers: {
        author: 'Test Runner',
        compoundInnerBlocksPreset: 'horizontal',
        description: 'Compound scaffold',
        namespace: 'demo',
        phpPrefix: 'demo_block',
        slug: 'demo-compound',
        textDomain: 'demo-compound',
        title: 'Demo Compound',
      },
      dataStorageMode: 'custom-table',
      persistencePolicy: 'public',
      templateId: 'compound',
      withMigrationUi: false,
      withTestPreset: false,
      withWpEnv: false,
    });
    const variables = buildTemplateVariablesFromBlockSpec(spec);
    const groups = getScaffoldTemplateVariableGroups(variables);

    expect(groups.templateFamily).toBe('compound');
    expect(groups.compound.enabled).toBe(true);
    if (!groups.compound.enabled) {
      throw new Error('Expected compound group to be enabled');
    }
    expect(groups.compound.persistenceEnabled).toBe(true);
    expect(isCompoundPersistenceEnabled(variables)).toBe(true);
    expect(groups.compound.innerBlocks.preset).toBe('horizontal');
    expect(variables.compoundPersistenceEnabled).toBe('true');
    expect(typeof groups.compound.persistenceEnabled).toBe('boolean');
    expect(groups.alternateRenderTargets.enabled).toBe(true);
    expect(groups.alternateRenderTargets.targets).toEqual(['email', 'mjml']);
    expect(groups.alternateRenderTargets.hasEmail).toBe(true);
    expect(groups.alternateRenderTargets.hasMjml).toBe(true);
    expect(groups.alternateRenderTargets.hasPlainText).toBe(false);
    expect(getScaffoldAlternateRenderTargets(variables).hasEmail).toBe(true);
    expect(variables.hasAlternateEmailRenderTarget).toBe('true');
    expect(typeof groups.alternateRenderTargets.hasEmail).toBe('boolean');
    expect(groups.persistence.enabled).toBe(true);
    if (!groups.persistence.enabled) {
      throw new Error('Expected persistence group to be enabled');
    }
    expect(groups.persistence.scope).toBe('compound-parent');
    expect(groups.persistence.policy).toBe('public');
  });

  test('query loop scaffolds expose the query-loop-specific group', () => {
    const variables = getTemplateVariables('query-loop', {
      author: 'Test Runner',
      description: 'Query loop scaffold',
      namespace: 'demo',
      phpPrefix: 'demo_block',
      queryPostType: 'page',
      slug: 'demo-query-loop',
      textDomain: 'demo-query-loop',
      title: 'Demo Query Loop',
    });
    const groups = getScaffoldTemplateVariableGroups(variables);

    expect(groups.templateFamily).toBe('query-loop');
    expect(groups.queryLoop.enabled).toBe(true);
    if (!groups.queryLoop.enabled) {
      throw new Error('Expected query-loop group to be enabled');
    }
    expect(groups.queryLoop.postType).toBe('page');
    expect(groups.queryLoop.variationNamespace).toBe('demo/demo-query-loop');
    expect(groups.persistence.enabled).toBe(false);
  });

  test('external template variables keep the flat bag and mark the external family', () => {
    const variables = getTemplateVariables('github:demo/example', {
      author: 'Test Runner',
      description: 'External scaffold',
      namespace: 'demo',
      phpPrefix: 'demo_block',
      slug: 'demo-external',
      textDomain: 'demo-external',
      title: 'Demo External',
    });
    const groups = getScaffoldTemplateVariableGroups(variables);

    expect(groups.templateFamily).toBe('external');
    expect(groups.persistence.enabled).toBe(false);
    expect(groups.queryLoop.enabled).toBe(false);
    expect(groups.compound.enabled).toBe(false);
    expect(variables.title).toBe('Demo External');
    expect(variables.slugKebabCase).toBe('demo-external');
  });
});
