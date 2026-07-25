import { describe, expect, test } from 'bun:test';

import {
  findCliTemplateMetadata,
  formatTemplateDetails,
  formatTemplateFeatures,
  getCliTemplateMetadata,
  getTemplateById,
  listCliTemplateMetadata,
} from '../src/runtime/cli-templates.js';

describe('@wp-typia/project-tools template discovery formatting', () => {
	test('list output surfaces flag hints for persistence and query-loop templates', () => {
		expect(formatTemplateFeatures(getTemplateById('persistence'))).toContain(
			'Supports: --alternate-render-targets • --data-storage • --persistence-policy • external layers',
		);
		expect(formatTemplateFeatures(getTemplateById('query-loop'))).toContain(
			'Supports: --query-post-type • external layers',
		);
		expect(formatTemplateFeatures(getTemplateById('query-loop'))).toContain(
			'Notes: Create-time variation scaffold only; use `wp-typia create <project-dir> --template query-loop` instead of `wp-typia add block`. • Owns a `core/query` variation, so it does not generate `src/types.ts`, `block.json`, or Typia manifests.',
		);
	});

	test('workspace template discovery surfaces the workspace alias', () => {
		expect(
			formatTemplateFeatures(getTemplateById('@wp-typia/create-workspace-template')),
		).toContain('Alias: workspace (`--template workspace`)');
	});

	test('structured discovery exposes logical sources without internal directories', () => {
		const templates = listCliTemplateMetadata();
		const basic = getCliTemplateMetadata('basic');
		const workspace = getCliTemplateMetadata('workspace');

		expect(templates).toHaveLength(6);
		expect(basic.source).toEqual({ kind: 'built-in', id: 'basic' });
		expect(workspace.source).toEqual({
			kind: 'npm',
			packageName: '@wp-typia/create-workspace-template',
			alias: 'workspace',
		});
		expect(workspace.id).toBe('@wp-typia/create-workspace-template');
		expect(findCliTemplateMetadata('unknown')).toBeUndefined();
		expect(JSON.stringify(templates)).not.toContain('templateDir');
		expect(JSON.stringify(templates)).not.toContain(
			getTemplateById('basic').templateDir,
		);
	});

	test('inspect output prefers logical layer summaries over raw overlay paths', () => {
		const basicDetails = formatTemplateDetails(getTemplateById('basic'));
		const queryLoopDetails = formatTemplateDetails(getTemplateById('query-loop'));
		const workspaceDetails = formatTemplateDetails(
			getTemplateById('workspace'),
		);

		expect(basicDetails).toStartWith('basic\n');
		expect(basicDetails).toContain('Best for:');
		expect(basicDetails).toContain('Identity:');
		expect(basicDetails).toContain('Built-in template id: basic');
		expect(basicDetails).toContain('Logical layers:');
		expect(basicDetails).toContain('shared/base -> basic overlay');
		expect(basicDetails).not.toContain('Overlay path:');
		expect(basicDetails).not.toContain('/templates/basic');
		expect(queryLoopDetails).toContain(
			'Best for: create-time `core/query` variations with connected starter patterns instead of `add block` families',
		);
		expect(queryLoopDetails).toContain('Type: create-time core/query variation scaffold');
		expect(queryLoopDetails).toContain(
			'Output model: variation-only scaffold; does not generate block.json or Typia manifests',
		);
		expect(queryLoopDetails).toContain('Notes:');
		expect(queryLoopDetails).toContain(
			'Create-time variation scaffold only; use `wp-typia create <project-dir> --template query-loop` instead of `wp-typia add block`.',
		);
		expect(queryLoopDetails).toContain(
			'Owns a `core/query` variation, so it does not generate `src/types.ts`, `block.json`, or Typia manifests.',
		);

		expect(workspaceDetails).toStartWith('workspace\n');
		expect(workspaceDetails).toContain('User-facing alias: workspace (`--template workspace`)');
		expect(workspaceDetails).toContain('Official package: @wp-typia/create-workspace-template');
		expect(workspaceDetails).toContain('workspace package scaffold');
		expect(workspaceDetails).not.toContain('Overlay path:');
	});
});
