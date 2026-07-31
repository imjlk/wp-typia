import { describe, expect, test } from 'bun:test';

import { getBuiltinWpTypiaToolGroup } from '../src/mcp';
import type { MCPTool } from '../src/mcp';

describe('getBuiltinWpTypiaToolGroup', () => {
  const group = getBuiltinWpTypiaToolGroup();

  test('uses wp-typia as the namespace', () => {
    expect(group.namespace).toBe('wp-typia');
  });

  test('exposes migration-diff, migration-plan, and migration-scaffold tools', () => {
    const toolNames = group.tools.map((tool) => tool.name);
    expect(toolNames).toContain('migration-diff');
    expect(toolNames).toContain('migration-plan');
    expect(toolNames).toContain('migration-scaffold');
  });

  test('migration-diff requires from-migration-version', () => {
    const diffTool = group.tools.find(
      (tool) => tool.name === 'migration-diff',
    ) as MCPTool | undefined;
    expect(diffTool).toBeDefined();
    expect(diffTool!.inputSchema?.required).toContain(
      'from-migration-version',
    );
  });

  test('migration-scaffold requires from-migration-version', () => {
    const scaffoldTool = group.tools.find(
      (tool) => tool.name === 'migration-scaffold',
    ) as MCPTool | undefined;
    expect(scaffoldTool).toBeDefined();
    expect(scaffoldTool!.inputSchema?.required).toContain(
      'from-migration-version',
    );
  });

  test('every tool has a description', () => {
    for (const tool of group.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description!.length).toBeGreaterThan(10);
    }
  });

  test('every tool input schema is typed as object', () => {
    for (const tool of group.tools) {
      expect(tool.inputSchema?.type).toBe('object');
    }
  });

  test('migration-plan requires from-migration-version', () => {
    const planTool = group.tools.find(
      (tool) => tool.name === 'migration-plan',
    ) as MCPTool | undefined;
    expect(planTool).toBeDefined();
    expect(planTool!.inputSchema?.required).toContain(
      'from-migration-version',
    );
  });

  test('no tool exposes block-key (unsupported flag)', () => {
    for (const tool of group.tools) {
      const props = tool.inputSchema?.properties ?? {};
      expect(props).not.toHaveProperty('block-key');
    }
  });

  test('migration-plan exposes to-migration-version', () => {
    const planTool = group.tools.find(
      (tool) => tool.name === 'migration-plan',
    ) as MCPTool | undefined;
    expect(planTool).toBeDefined();
    expect(planTool!.inputSchema?.properties).toHaveProperty(
      'to-migration-version',
    );
  });
});
