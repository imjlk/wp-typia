import { afterAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  blockTypesPackageVersion,
  buildGeneratedProject,
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
  typecheckGeneratedProject,
  wpTypiaPackageManifest,
} from './helpers/scaffold-test-harness.js';
import { scaffoldProject } from '../src/runtime/index.js';

describe('@wp-typia/project-tools scaffold query-loop', () => {
	const tempRoot = createScaffoldTempRoot('wp-typia-scaffold-query-loop-');

	afterAll(() => {
		cleanupScaffoldTempRoot(tempRoot);
	});

	test(
		'scaffoldProject creates a Query Loop variation scaffold with a stable variation namespace',
		async () => {
			const targetDir = path.join(tempRoot, 'demo-query-loop');

			await scaffoldProject({
				projectDir: targetDir,
				templateId: 'query-loop',
				packageManager: 'npm',
				noInstall: true,
				answers: {
					author: 'Test Runner',
					description: 'Demo Query Loop variation',
					namespace: 'demo-space',
					phpPrefix: 'demo_space',
					queryPostType: 'book',
					slug: 'demo-query-loop',
					textDomain: 'demo-query-loop',
					title: 'Demo Query Loop',
				},
			});

			const packageJson = JSON.parse(
				fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
			);
			const readme = fs.readFileSync(path.join(targetDir, 'README.md'), 'utf8');
			const variationSource = fs.readFileSync(
				path.join(targetDir, 'src', 'index.ts'),
				'utf8',
			);
			const queryExtensionSource = fs.readFileSync(
				path.join(targetDir, 'src', 'query-extension.ts'),
				'utf8',
			);
			const queryRuntimeSource = fs.readFileSync(
				path.join(targetDir, 'inc', 'query-runtime.php'),
				'utf8',
			);
			const pluginBootstrap = fs.readFileSync(
				path.join(targetDir, 'demo-query-loop.php'),
				'utf8',
			);
			const gridPatternSource = fs.readFileSync(
				path.join(targetDir, 'src', 'patterns', 'grid.php'),
				'utf8',
			);
			const listPatternSource = fs.readFileSync(
				path.join(targetDir, 'src', 'patterns', 'list.php'),
				'utf8',
			);

			expect(packageJson.devDependencies['@wp-typia/block-types']).toBe(
				blockTypesPackageVersion,
			);
			expect(packageJson.devDependencies['@wp-typia/block-runtime']).toBeUndefined();
			expect(packageJson.scripts.sync).toBeUndefined();
			expect(packageJson.scripts['watch:sync-types']).toBeUndefined();
			expect(packageJson.scripts.start).toBe('wp-scripts start --experimental-modules');
			expect(packageJson.scripts.dev).toBe('wp-scripts start --experimental-modules');
			expect(packageJson.scripts.typecheck).toBe('ttsc --noEmit');
			expect(packageJson.packageManager).toBeUndefined();
			expect(fs.existsSync(path.join(targetDir, 'src', 'block.json'))).toBe(false);
			expect(fs.existsSync(path.join(targetDir, 'src', 'typia.manifest.json'))).toBe(false);
			expect(
				fs.existsSync(path.join(targetDir, 'src', 'validator-toolkit.ts')),
			).toBe(false);
			expect(
				fs.existsSync(
					path.join(targetDir, 'scripts', 'register-typescript6.cjs'),
				),
			).toBe(true);
			expect(
				fs.existsSync(
					path.join(
						targetDir,
						'scripts',
						'run-wp-scripts-lint-js-compat.mjs',
					),
				),
			).toBe(true);
			for (const staleScript of [
				'block-config.ts',
				'sync-project.ts',
				'sync-types-to-block-json.ts',
			]) {
				expect(
					fs.existsSync(path.join(targetDir, 'scripts', staleScript)),
				).toBe(false);
			}
			expect(variationSource).toMatch(
				/registerBlockVariation\('core\/query', queryLoopVariation\);/,
			);
			expect(variationSource).toContain("from './query-extension'");
			expect(variationSource).toMatch(
				/const VARIATION_NAME = ["']demo-space\/demo-query-loop["'];/,
			);
			expect(variationSource).toMatch(/namespace:\s*VARIATION_NAME/);
			expect(variationSource).toMatch(/postType:\s*["']book["']/);
			expect(variationSource).toContain(
				'const customQuerySeed = getQueryLoopCustomQuerySeed();',
			);
			expect(variationSource).toContain('...customQuerySeed');
			expect(variationSource).toContain('wpTypiaVariation: VARIATION_NAME');
			expect(variationSource).toContain('registerQueryLoopEditorExtensions({ variationName: VARIATION_NAME })');
			expect(variationSource).toContain('allowedControls:');
			expect(variationSource).toMatch(/isActive:\s*\[\s*['"]namespace['"]\s*\]/);
			expect(variationSource).toMatch(/['"]core\/post-template['"]/);
			expect(queryExtensionSource).toContain('export function getQueryLoopCustomQuerySeed()');
			expect(queryExtensionSource).toContain(
				'export function registerQueryLoopEditorExtensions',
			);
			expect(queryRuntimeSource).toContain('function demo_space_filter_query_loop_block_query_vars');
			expect(queryRuntimeSource).toContain('function demo_space_filter_query_loop_editor_preview_query_vars');
			expect(queryRuntimeSource).toContain('wpTypiaVariation');
			expect(pluginBootstrap).toMatch(/enqueue_block_editor_assets/);
			expect(pluginBootstrap).toMatch(/wp_register_script\s*\(/);
			expect(pluginBootstrap).toContain('register_block_pattern_category');
			expect(pluginBootstrap).toContain('/src/patterns/*.php');
			expect(pluginBootstrap).toMatch(/require_once\s+__DIR__\s*\.\s*['"]\/inc\/query-runtime\.php['"]/);
			expect(pluginBootstrap).toMatch(
				/add_filter\(\s*'query_loop_block_query_vars',\s*'demo_space_filter_query_loop_block_query_vars',\s*10,\s*3\s*\);/,
			);
			expect(pluginBootstrap).toMatch(
				/add_filter\(\s*'rest_book_query',\s*'demo_space_filter_query_loop_editor_preview_query_vars',\s*10,\s*2\s*\);/,
			);
			expect(pluginBootstrap).not.toContain('register_block_type');
			expect(gridPatternSource).toContain('demo-space/demo-query-loop-grid');
			expect(gridPatternSource).toContain('"namespace":"demo-space/demo-query-loop"');
			expect(gridPatternSource).toContain('"postType":"book"');
			expect(gridPatternSource).toContain('"wpTypiaVariation":"demo-space/demo-query-loop"');
			expect(listPatternSource).toContain('demo-space/demo-query-loop-list');
			expect(listPatternSource).toContain('"namespace":"demo-space/demo-query-loop"');
			expect(listPatternSource).toContain('"wpTypiaVariation":"demo-space/demo-query-loop"');
			expect(readme).toContain('## Build and Verify');
			expect(readme).toContain('- Family: query-loop');
			expect(readme).toContain('- Type: create-time core/query variation scaffold');
			expect(readme).toContain(
				`npx --yes wp-typia@${wpTypiaPackageManifest.version} doctor`,
			);
			expect(readme).toContain('## Variation Workflow');
			expect(readme).toContain(
				'This scaffold owns a `core/query` variation, so it does not generate a `sync` script, `src/types.ts`, `block.json`, or Typia manifests.',
			);
			expect(readme).toContain(
				'`src/index.ts` remains the source of truth for the Query Loop variation name',
			);
			expect(readme).toContain(
				'Edit `src/index.ts`, `src/patterns/*.php`, `src/query-extension.ts`, and `inc/query-runtime.php` as needed',
			);
			expect(readme).toContain('Use `src/patterns/*.php` for richer connected layout presets');
			expect(readme).toContain('use `src/query-extension.ts` for custom query seed values');
			expect(readme).toContain('use `inc/query-runtime.php` to keep frontend and editor preview query mapping aligned');
			expect(readme).toContain('npm run dev');
			execFileSync('php', ['-l', path.join(targetDir, 'demo-query-loop.php')], {
				stdio: 'ignore',
			});
			execFileSync('php', ['-l', path.join(targetDir, 'src', 'patterns', 'grid.php')], {
				stdio: 'ignore',
			});
			execFileSync('php', ['-l', path.join(targetDir, 'src', 'patterns', 'list.php')], {
				stdio: 'ignore',
			});
			execFileSync('php', ['-l', path.join(targetDir, 'inc', 'query-runtime.php')], {
				stdio: 'ignore',
			});

			typecheckGeneratedProject(targetDir);
			buildGeneratedProject(targetDir);

			expect(fs.existsSync(path.join(targetDir, 'build', 'index.js'))).toBe(true);
			expect(fs.existsSync(path.join(targetDir, 'build', 'index.asset.php'))).toBe(
				true,
			);
		},
		{ timeout: 40_000 },
	);
});
