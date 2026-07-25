import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
} from './helpers/scaffold-test-harness.js';
import { stableJsonStringify } from '../src/runtime/object-utils.js';
import {
  copyInterpolatedDirectory,
  copyRenderedDirectory,
  listInterpolatedDirectoryOutputs,
  pathExistsSync,
  renderMustacheTemplateString,
} from '../src/runtime/template-render.js';

describe('template render internals', () => {
	const tempRoot = createScaffoldTempRoot('wp-typia-template-render-');

	afterAll(() => {
		cleanupScaffoldTempRoot(tempRoot);
	});

	test('renderMustacheTemplateString leaves scaffold values unescaped', () => {
		expect(
			renderMustacheTemplateString('{{value}} :: {{{value}}}', {
				value: '<demo>&',
			}),
		).toBe('<demo>& :: <demo>&');
	});

	test('pathExistsSync keeps the template renderer sync helper explicit', () => {
		const targetPath = path.join(tempRoot, 'path-exists-sync.txt');
		fs.writeFileSync(targetPath, 'ok', 'utf8');

		expect(pathExistsSync(targetPath)).toBe(true);
		expect(pathExistsSync(path.join(tempRoot, 'missing-path.txt'))).toBe(false);
	});

	test('copyRenderedDirectory and interpolation mode keep their semantics explicit', async () => {
		const templateRoot = fs.mkdtempSync(
			path.join(tempRoot, 'template-render-strategy-'),
		);
		const mustacheTarget = fs.mkdtempSync(
			path.join(tempRoot, 'template-render-mustache-'),
		);
		const interpolatedTarget = fs.mkdtempSync(
			path.join(tempRoot, 'template-render-interpolated-'),
		);

		fs.mkdirSync(path.join(templateRoot, 'dir-{{variant}}'), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(
				templateRoot,
				'dir-{{variant}}',
				'message-{{variant}}.txt.mustache',
			),
			'{{#show}}Hello {{name}}{{/show}}',
			'utf8',
		);

		await copyRenderedDirectory(templateRoot, mustacheTarget, {
			name: 'A&B',
			show: true,
			variant: 'hero',
		});
		await copyInterpolatedDirectory(templateRoot, interpolatedTarget, {
			name: 'A&B',
			show: 'true',
			variant: 'hero',
		});

		expect(
			fs.readFileSync(
				path.join(mustacheTarget, 'dir-hero', 'message-hero.txt'),
				'utf8',
			),
		).toBe('Hello A&B');
		expect(
			fs.readFileSync(
				path.join(interpolatedTarget, 'dir-hero', 'message-hero.txt'),
				'utf8',
			),
		).toBe('{{#show}}Hello A&B{{/show}}');
	});

	test('copyInterpolatedDirectory replaces placeholders in a single pass', async () => {
		const templateRoot = fs.mkdtempSync(
			path.join(tempRoot, 'template-render-single-pass-'),
		);
		const targetDir = fs.mkdtempSync(
			path.join(tempRoot, 'template-render-single-pass-target-'),
		);

		fs.writeFileSync(
			path.join(templateRoot, 'single-pass.txt.mustache'),
			'{{price}} :: {{alias}}',
			'utf8',
		);

		await copyInterpolatedDirectory(templateRoot, targetDir, {
			alias: '{{name}}',
			name: 'hero',
			price: '$&',
		});

		expect(
			fs.readFileSync(
				path.join(targetDir, 'single-pass.txt'),
				'utf8',
			),
		).toBe('$& :: {{name}}');
	});

	test('listInterpolatedDirectoryOutputs matches interpolation traversal rules', async () => {
		const templateRoot = fs.mkdtempSync(
			path.join(tempRoot, 'template-render-list-'),
		);
		const targetDir = fs.mkdtempSync(
			path.join(tempRoot, 'template-render-list-target-'),
		);

		fs.mkdirSync(path.join(templateRoot, 'docs-{{variant}}'), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(templateRoot, 'README-{{variant}}.md.mustache'),
			'hello',
			'utf8',
		);
		fs.writeFileSync(
			path.join(templateRoot, 'docs-{{variant}}', 'note-{{variant}}.txt'),
			'world',
			'utf8',
		);

		const view = { variant: 'hero' };
		await copyInterpolatedDirectory(templateRoot, targetDir, view);
		const listedOutputs = await listInterpolatedDirectoryOutputs(
			templateRoot,
			view,
		);

		expect(listedOutputs).toEqual([
			'docs-hero/note-hero.txt',
			'README-hero.md',
		]);
		expect(
			fs.existsSync(path.join(targetDir, 'README-hero.md')),
		).toBe(true);
		expect(
			fs.existsSync(path.join(targetDir, 'docs-hero', 'note-hero.txt')),
		).toBe(true);
	});

	test('stableJsonStringify sorts nested plain-object keys deterministically', () => {
		const accentNfc = '\u00E9';
		const accentNfd = 'e\u0301';
		const left = {
			alpha: {
				delta: 4,
				charlie: 3,
			},
			bravo: [3, { zebra: 'z', alpha: 'a' }],
		};
		const right = {
			bravo: [3, { alpha: 'a', zebra: 'z' }],
			alpha: {
				charlie: 3,
				delta: 4,
			},
		};

		expect(stableJsonStringify(left)).toBe(stableJsonStringify(right));
		expect(
			stableJsonStringify({
				items: [{ second: 2, first: 1 }, { beta: true, alpha: false }],
			}),
		).toBe(
			'{"items":[{"first":1,"second":2},{"alpha":false,"beta":true}]}',
		);
		expect(
			stableJsonStringify({
				[accentNfc]: 'nfc',
				[accentNfd]: 'nfd',
			}),
		).toBe(
			stableJsonStringify({
				[accentNfd]: 'nfd',
				[accentNfc]: 'nfc',
			}),
		);
	});
});
