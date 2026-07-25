import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
  entryPath,
  linkWorkspaceNodeModules,
  runCli,
  workspaceTemplatePackageManifest,
} from './helpers/scaffold-test-harness.js';
import { getWorkspaceBindingDoctorChecks } from '../src/runtime/cli-doctor-workspace-bindings.js';
import { readWorkspaceInventory } from '../src/runtime/workspace-inventory.js';
import { tryResolveWorkspaceProject } from '../src/runtime/workspace-project.js';
import { scaffoldProject } from '../src/runtime/index.js';

describe('cli-doctor workspace bindings category', () => {
	const tempRoot = createScaffoldTempRoot('wp-typia-workspace-doctor-bindings-');

	afterAll(() => {
		cleanupScaffoldTempRoot(tempRoot);
	});

	test('binding category accepts src/bindings/index.js registries', async () => {
		const targetDir = path.join(tempRoot, 'workspace-doctor-bindings-index-js');

		await scaffoldProject({
			projectDir: targetDir,
			templateId: workspaceTemplatePackageManifest.name,
			packageManager: 'npm',
			noInstall: true,
			answers: {
				author: 'Test Runner',
				description: 'Workspace doctor bindings index js',
				namespace: 'demo-space',
				phpPrefix: 'demo_space',
				slug: 'workspace-doctor-bindings-index-js',
				textDomain: 'demo-space',
				title: 'Workspace Doctor Bindings Index Js',
			},
		});

		linkWorkspaceNodeModules(targetDir);
		runCli('node', [entryPath, 'add', 'binding-source', 'hero-data'], {
			cwd: targetDir,
		});

		const bindingsTsPath = path.join(targetDir, 'src', 'bindings', 'index.ts');
		const bindingsJsPath = path.join(targetDir, 'src', 'bindings', 'index.js');
		fs.renameSync(bindingsTsPath, bindingsJsPath);

		const workspace = tryResolveWorkspaceProject(targetDir);
		if (!workspace) {
			throw new Error('Expected generated workspace to resolve for binding doctor test.');
		}

		const checks = getWorkspaceBindingDoctorChecks(
			workspace,
			readWorkspaceInventory(targetDir),
		);
		expect(
			checks.find((check) => check.label === 'Binding sources index')?.status,
		).toBe('pass');
	});
});
