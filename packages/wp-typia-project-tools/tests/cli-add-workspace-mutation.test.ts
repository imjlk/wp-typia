import { afterAll, describe, expect, test } from 'bun:test';
import { promises as fsp } from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendPhpSnippetBeforeClosingTag,
  createWorkspaceMutationSnapshot,
  executeWorkspaceMutationPlan,
  insertPhpSnippetBeforeWorkspaceAnchors,
  WorkspaceMutationRollbackError,
} from '../src/runtime/cli-add-workspace-mutation.js';

const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'wp-typia-add-mutation-'),
);

afterAll(() => {
  fs.rmSync(tempRoot, { force: true, recursive: true });
});

describe('workspace add mutation executor', () => {
	test('creates deduplicated snapshots with defensive path copies', async () => {
		const projectDir = path.join(tempRoot, 'snapshot');
		const existingPath = path.join(projectDir, 'existing.txt');
		const snapshotDir = path.join(projectDir, 'snapshot-dir');
		const targetPath = path.join(projectDir, 'target');
		await fsp.mkdir(projectDir, { recursive: true });
		await fsp.writeFile(existingPath, 'before', 'utf8');

		const snapshotDirs = [snapshotDir];
		const targetPaths = [targetPath];
		const mutationSnapshot = await createWorkspaceMutationSnapshot({
			filePaths: [existingPath, existingPath],
			snapshotDirs,
			targetPaths,
		});

		snapshotDirs.push(path.join(projectDir, 'later-snapshot-dir'));
		targetPaths.push(path.join(projectDir, 'later-target'));

		expect(mutationSnapshot).toEqual({
			fileSources: [{ filePath: existingPath, source: 'before' }],
			snapshotDirs: [snapshotDir],
			targetPaths: [targetPath],
		});
	});

	test('defaults optional snapshot path arrays to empty', async () => {
		expect(
			await createWorkspaceMutationSnapshot({ filePaths: [] }),
		).toEqual({
			fileSources: [],
			snapshotDirs: [],
			targetPaths: [],
		});
	});

	test('keeps successful workspace mutation results', async () => {
		const projectDir = path.join(tempRoot, 'success');
		const existingPath = path.join(projectDir, 'existing.txt');
		const createdDir = path.join(projectDir, 'created');
		const createdFile = path.join(createdDir, 'file.txt');
		await fsp.mkdir(projectDir, { recursive: true });
		await fsp.writeFile(existingPath, 'before', 'utf8');

		const result = await executeWorkspaceMutationPlan({
			filePaths: [existingPath, createdFile],
			targetPaths: [createdDir],
			run: async () => {
				await fsp.writeFile(existingPath, 'after', 'utf8');
				await fsp.mkdir(createdDir, { recursive: true });
				await fsp.writeFile(createdFile, 'created', 'utf8');
				return 'ok';
			},
		});

		expect(result).toBe('ok');
		expect(await fsp.readFile(existingPath, 'utf8')).toBe('after');
		expect(await fsp.readFile(createdFile, 'utf8')).toBe('created');
	});

	test('rolls back changed files, missing snapshots, and target paths on failure', async () => {
		const projectDir = path.join(tempRoot, 'rollback');
		const existingPath = path.join(projectDir, 'existing.txt');
		const generatedFilePath = path.join(projectDir, 'generated.txt');
		const targetDir = path.join(projectDir, 'target');
		await fsp.mkdir(projectDir, { recursive: true });
		await fsp.writeFile(existingPath, 'before', 'utf8');

		await expect(
			executeWorkspaceMutationPlan({
				filePaths: [existingPath, generatedFilePath],
				targetPaths: [targetDir],
				run: async () => {
					await fsp.writeFile(existingPath, 'after', 'utf8');
					await fsp.writeFile(generatedFilePath, 'generated', 'utf8');
					await fsp.mkdir(targetDir, { recursive: true });
					await fsp.writeFile(path.join(targetDir, 'file.txt'), 'target', 'utf8');
					throw new Error('boom');
				},
			}),
		).rejects.toThrow('boom');

		expect(await fsp.readFile(existingPath, 'utf8')).toBe('before');
		expect(fs.existsSync(generatedFilePath)).toBe(false);
		expect(fs.existsSync(targetDir)).toBe(false);
	});

	test('preserves mutation and rollback failures together', async () => {
		const projectDir = path.join(tempRoot, 'rollback-failure');
		const nestedDir = path.join(projectDir, 'nested');
		const existingPath = path.join(nestedDir, 'existing.txt');
		await fsp.mkdir(nestedDir, { recursive: true });
		await fsp.writeFile(existingPath, 'before', 'utf8');

		let caughtError: unknown;
		try {
			await executeWorkspaceMutationPlan({
				filePaths: [existingPath],
				run: async () => {
					await fsp.rm(nestedDir, { force: true, recursive: true });
					await fsp.writeFile(nestedDir, 'not a directory', 'utf8');
					throw new Error('mutation failed');
				},
			});
		} catch (error) {
			caughtError = error;
		}

		expect(caughtError).toBeInstanceOf(WorkspaceMutationRollbackError);
		const rollbackError = caughtError as WorkspaceMutationRollbackError;
		expect(rollbackError.message).toBe(
			'Workspace mutation failed and rollback also failed.',
		);
		expect(rollbackError.mutationError).toBeInstanceOf(Error);
		expect((rollbackError.mutationError as Error).message).toBe('mutation failed');
		expect(rollbackError.rollbackError).toBeInstanceOf(Error);
	});
});

describe('workspace PHP snippet helpers', () => {
	test('inserts snippets before textdomain anchors', () => {
		const source = [
			'<?php',
			"add_action( 'init', 'demo_load_textdomain' );",
			"do_action( 'demo_ready' );",
			'',
		].join('\n');

		expect(
			insertPhpSnippetBeforeWorkspaceAnchors(source, 'function demo_load() {}'),
		).toBe(
			[
				'<?php',
				'function demo_load() {}',
				"add_action( 'init', 'demo_load_textdomain' );",
				"do_action( 'demo_ready' );",
				'',
			].join('\n'),
		);
	});

	test('inserts snippets before closing tags when textdomain anchors are absent', () => {
		const source = '<?php\n?>\n';

		expect(
			insertPhpSnippetBeforeWorkspaceAnchors(
				source,
				'function demo_register_rest_resources() {}',
			),
		).toBe('<?php\nfunction demo_register_rest_resources() {}\n?>\n');
	});

	test('appends snippets before closing tags', () => {
		const source = '<?php\n?>\n';

		expect(
			appendPhpSnippetBeforeClosingTag(
				source,
				"add_action( 'plugins_loaded', 'demo_load' );",
			),
		).toBe("<?php\nadd_action( 'plugins_loaded', 'demo_load' );\n?>");
	});
});
