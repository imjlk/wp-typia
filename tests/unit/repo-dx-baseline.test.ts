import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '..', '..');

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, relativePath),
      'utf8',
    ),
  ) as Record<string, unknown>;
}

function getWorkflowJobBlock(workflow: string, jobName: string): string {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  if (start === -1) {
    return '';
  }

  const remainder = workflow.slice(start + marker.length);
  const nextJob = remainder.search(/^  [a-z0-9-]+:\n/m);
  return nextJob === -1 ? remainder : remainder.slice(0, nextJob);
}

describe('repository DX baseline', () => {
  test('root package scripts expose maintainer aggregate commands', () => {
    const packageJson = readJson('package.json');
    const scripts = packageJson.scripts as Record<string, string>;

    expect(scripts['lint:repo']).toBeDefined();
    expect(scripts['lint:fix']).toBeDefined();
    expect(scripts['lint:all']).toBeDefined();
    expect(scripts['format:check']).toBeDefined();
    expect(scripts['format:write']).toBeDefined();
    expect(scripts['maintenance-automation:validate']).toBe(
      'node scripts/validate-maintenance-automation-policy.mjs',
    );
    expect(scripts['formatting-policy:validate']).toBe(
      'node scripts/validate-formatting-toolchain-policy.mjs',
    );
    expect(scripts['samchon-graph:validate']).toBe(
      'bun scripts/validate-samchon-graph-config.mjs',
    );
    expect(scripts['samchon-graph:smoke']).toBe(
      'node scripts/smoke-samchon-graph.mjs',
    );
    expect(scripts['test:repo']).toBe('bun run test');
    expect(scripts['test:all']).toBe('bun run test:repo');
    expect(scripts['test:repo:fast']).toBe(
      'node scripts/run-fast-feedback-tests.mjs',
    );
    expect(scripts['ci:local']).toBeDefined();
    expect(scripts['ci:local']).toContain(
      'bun run maintenance-automation:validate',
    );
    expect(scripts['ci:local']).toContain('bun run formatting-policy:validate');
    expect(scripts['ci:local']).toContain('bun run samchon-graph:validate');
    expect(scripts['ci:local']).toContain('bun run samchon-graph:smoke');
    expect(scripts['ci:local']).toContain('bun run format:check');
    expect(scripts['typescript-runtime:validate']).toBe(
      'node scripts/validate-typescript-runtime-dependency-placement.mjs',
    );
    expect(scripts['examples:build']).toBe(
      'node scripts/run-clean-examples-build.mjs',
    );
    expect(scripts['test:coverage:packages']).toStartWith(
      'bun run packages:build && bun run test:unit:coverage',
    );
    expect(scripts['lint:repo']).toBe('eslint . --max-warnings=0');
    expect(scripts['lint:fix']).toBe(
      'eslint . --fix --max-warnings=0 && ttsc fix --singleThreaded',
    );
    expect(scripts['format:write']).toBe(
      'ttsc format --singleThreaded && node scripts/check-repo-format.mjs --write',
    );
  });

  test('root ESLint scope stays on repo infrastructure while examples keep wp-scripts ownership', () => {
    const packageJson = readJson('package.json');
    const scripts = packageJson.scripts as Record<string, string>;
    const eslintConfig = fs.readFileSync(
      path.join(repoRoot, 'eslint.config.mjs'),
      'utf8',
    );

    expect(eslintConfig).toContain('scripts/**/*');
    expect(eslintConfig).toContain('tests/**/*');
    expect(eslintConfig).toMatch(
      /const repoIgnores = \[[\s\S]*["']examples\/\*\*["']/,
    );
    expect(scripts).toHaveProperty('examples:lint');
    expect(scripts).toHaveProperty('examples:format');
    expect(scripts['examples:lint']).toBe('node scripts/run-examples-lint.mjs');
    expect(scripts['examples:lint']).toContain('scripts/run-examples-lint.mjs');
    expect(scripts['examples:format']).toContain(
      'bun run --filter api-contract-adapter-poc --if-present format',
    );

    expect(
      fs.existsSync(path.join(repoRoot, 'scripts', 'run-examples-lint.mjs')),
    ).toBe(true);
  });

  test('fast repo test lane avoids build-oriented coverage paths', () => {
    const runner = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'run-fast-feedback-tests.mjs'),
      'utf8',
    );
    const fastPathBlock =
      runner.match(
        /const FAST_TEST_PATHS = Object\.freeze\(\[([\s\S]*?)\]\);/,
      )?.[1] ?? '';

    expect(fastPathBlock).toContain('packages/wp-typia-api-client/tests');
    expect(fastPathBlock).toContain(
      'packages/wp-typia-dataviews/tests/query-adapter.test.ts',
    );
    expect(fastPathBlock).toContain('tests/unit/repo-dx-baseline.test.ts');
    expect(fastPathBlock).not.toContain("'tests/unit/sync-types.test.ts',");
    expect(fastPathBlock).not.toContain(
      "'packages/wp-typia-dataviews/tests/type-contracts.test.ts',",
    );
    expect(fastPathBlock).not.toContain(
      "'packages/wp-typia-rest/tests/package-contracts.test.ts',",
    );
    expect(fastPathBlock).not.toContain(
      "'packages/wp-typia-block-types/tests/package-contracts.test.ts',",
    );
    expect(runner).toContain(
      "'--preload',\n    'scripts/preload-fast-feedback-workspace.ts'",
    );

    const restRuntimeTests = fs.readFileSync(
      path.join(repoRoot, 'packages', 'wp-typia-rest', 'tests', 'rest.test.ts'),
      'utf8',
    );
    expect(restRuntimeTests).not.toContain('../dist/');
    expect(
      fs.existsSync(
        path.join(repoRoot, 'scripts', 'preload-fast-feedback-workspace.ts'),
      ),
    ).toBe(true);
  });

  test('project-tools test scripts separate local build wrappers from run-only shards', () => {
    const rootScripts = readJson('package.json').scripts as Record<
      string,
      string
    >;
    const projectToolsScripts = readJson(
      'packages/wp-typia-project-tools/package.json',
    ).scripts as Record<string, string>;
    const shards = [
      'scaffold-core',
      'workspace',
      'compound',
      'migration-planning',
      'migration-execution',
    ];

    expect(rootScripts['project-tools-prebuilt:prepare']).toBe(
      'bun run packages:build && bun run --filter wp-typia build',
    );
    expect(rootScripts['project-tools-prebuilt:validate']).toBe(
      'bun scripts/validate-project-tools-prebuilt.ts',
    );
    expect(rootScripts['test:project-tools']).toBe(
      'bun run project-tools-prebuilt:prepare && bun run test:project-tools:run',
    );
    expect(rootScripts['test:project-tools:run']).toBe(
      'bun scripts/run-project-tools-test-shard.ts all',
    );
    expect(projectToolsScripts['test:project-tools']).toBe(
      'bun run test:scaffold-core && bun run test:workspace && bun run test:compound && bun run test:migration-planning && bun run test:migration-execution',
    );
    for (const shard of shards) {
      expect(rootScripts[`test:project-tools:${shard}:run`]).toBe(
        `bun scripts/run-project-tools-test-shard.ts ${shard}`,
      );
      expect(projectToolsScripts[`test:${shard}`]).toStartWith(
        'bun run build && bun test ',
      );
    }
  });

  test('WordPress example workspaces keep the ESLint 8 compat wrapper', () => {
    for (const relativePath of [
      'examples/my-typia-block/package.json',
      'examples/persistence-examples/package.json',
      'examples/compound-patterns/package.json',
    ]) {
      const examplePackageJson = readJson(relativePath);
      const exampleScripts = examplePackageJson.scripts as Record<
        string,
        string
      >;
      const exampleDevDependencies =
        examplePackageJson.devDependencies as Record<string, string>;

      expect(exampleScripts['lint:js']).toBe(
        'node ../../scripts/run-wp-scripts-lint-js-compat.mjs',
      );
      expect(exampleDevDependencies.eslint).toBe('8.57.1');
    }

    expect(
      fs.existsSync(
        path.join(repoRoot, 'scripts', 'run-wp-scripts-lint-js-compat.mjs'),
      ),
    ).toBe(true);
  });

  test('.vscode workspace baseline exists', () => {
    expect(
      fs.existsSync(path.join(repoRoot, '.vscode', 'extensions.json')),
    ).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, '.vscode', 'settings.json'))).toBe(
      true,
    );
  });

  test('repo meta docs and GitHub templates exist', () => {
    const packageJson = readJson('package.json');
    const licenseContents = fs.readFileSync(
      path.join(repoRoot, 'LICENSE'),
      'utf8',
    );

    expect(packageJson.license).toBe('GPL-2.0-or-later');
    expect(fs.existsSync(path.join(repoRoot, 'LICENSE'))).toBe(true);
    expect(licenseContents).toContain(
      'SPDX-License-Identifier: GPL-2.0-or-later',
    );
    expect(fs.existsSync(path.join(repoRoot, 'UPGRADE.md'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'SECURITY.md'))).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          repoRoot,
          'apps',
          'docs',
          'src',
          'content',
          'docs',
          'maintainers',
          'core-data-adapter-boundary.md',
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          repoRoot,
          'apps',
          'docs',
          'src',
          'content',
          'docs',
          'maintainers',
          'formatting-toolchain-policy.md',
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          repoRoot,
          'apps',
          'docs',
          'src',
          'content',
          'docs',
          'maintainers',
          'maintenance-automation-policy.md',
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          repoRoot,
          'apps',
          'docs',
          'src',
          'content',
          'docs',
          'architecture',
          'block-generator-architecture.md',
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          repoRoot,
          'apps',
          'docs',
          'src',
          'content',
          'docs',
          'architecture',
          'block-generator-tool-contract.md',
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          repoRoot,
          'apps',
          'docs',
          'src',
          'content',
          'docs',
          'architecture',
          'external-template-layer-composition.md',
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(repoRoot, '.github', 'dependabot.yml')),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(repoRoot, '.github', 'workflows', 'dependency-audit.yml'),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          repoRoot,
          '.github',
          'actions',
          'setup-bun-workspace',
          'action.yml',
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(repoRoot, '.github', 'PULL_REQUEST_TEMPLATE.md')),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(repoRoot, '.github', 'ISSUE_TEMPLATE', 'bug-report.yml'),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(repoRoot, '.github', 'ISSUE_TEMPLATE', 'feature-request.yml'),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(repoRoot, '.github', 'ISSUE_TEMPLATE', 'docs-process.yml'),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(repoRoot, '.github', 'ISSUE_TEMPLATE', 'config.yml'),
      ),
    ).toBe(true);
  });

  test('example build cleanliness guard exists', () => {
    const guardScript = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'run-clean-examples-build.mjs'),
      'utf8',
    );

    expect(guardScript).toContain('git');
    expect(guardScript).toContain(
      'Example builds modified files under examples/.',
    );
  });

  test('CI keeps project-tools verification shared and enabled on main pushes', () => {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'ci.yml'),
      'utf8',
    );

    const prepareJob = getWorkflowJobBlock(workflow, 'prepare-project-tools');
    const testJob = getWorkflowJobBlock(workflow, 'test-project-tools');
    const setupAction = fs.readFileSync(
      path.join(
        repoRoot,
        '.github',
        'actions',
        'setup-bun-workspace',
        'action.yml',
      ),
      'utf8',
    );

    expect(prepareJob).toContain('Prepare Project Tools Workspace');
    expect(prepareJob).toContain('timeout-minutes: 15');
    expect(prepareJob).toContain('bun run project-tools-prebuilt:prepare');
    expect(prepareJob).toContain('name: project-tools-workspace-dist');
    expect(prepareJob).toContain('bun run project-tools-prebuilt:validate');
    const ttscPluginCache = [
      'uses: actions/cache@v6',
      'path: .ttsc-cache/plugins',
      'TTSC_CACHE_DIR=$GITHUB_WORKSPACE/.ttsc-cache',
      'TTSC_GO_CACHE_DIR=$RUNNER_TEMP/ttsc-go-cache',
      'ttsc-cache-scope:',
      'default: workspace',
      "hashFiles('bun.lock', 'patches/*.patch', '**/go.mod', '**/go.sum')",
    ];
    for (const cacheContract of ttscPluginCache) {
      expect(setupAction).toContain(cacheContract);
    }
    expect(prepareJob).toContain(
      'run: bun x ttsc prepare --project tsconfig.json',
    );
    expect(prepareJob).toContain('name: ttsc-source-plugins');
    expect(prepareJob).toContain('path: .ttsc-cache/plugins/');
    expect(prepareJob).toContain('include-hidden-files: true');
    expect(prepareJob).toContain('compression-level: 0');
    for (const packagePath of [
      'wp-typia-api-client/dist/',
      'wp-typia-block-types/dist/',
      'wp-typia-block-runtime/dist/',
      'wp-typia-dataviews/dist/',
      'wp-typia-rest/dist/',
      'wp-typia-project-tools/dist/',
      'wp-typia/dist/',
    ]) {
      expect(prepareJob).toContain(`packages/${packagePath}`);
    }
    expect(testJob).toContain('Project Tools: ${{ matrix.label }}');
    expect(testJob).toContain('needs: prepare-project-tools');
    expect(testJob).toContain('name: ttsc-source-plugins');
    expect(testJob).toContain('path: .ttsc-cache/plugins');
    expect(workflow).toContain('uses: ./.github/actions/setup-bun-workspace');
    expect(testJob).toContain(
      'script: test:project-tools:scaffold-core:run',
    );
    expect(testJob).toContain(
      'script: test:project-tools:migration-execution:run',
    );
    expect(testJob).toContain('uses: actions/download-artifact@v8');
    expect(testJob).toContain('path: packages');
    expect(testJob).toContain(
      'PROJECT_TOOLS_TEST_SCRIPT: ${{ matrix.script }}',
    );
    expect(testJob).toContain('run: bun run "$PROJECT_TOOLS_TEST_SCRIPT"');
    expect(testJob).not.toContain('run: ${{ matrix.');
    expect(testJob).toContain("WP_TYPIA_PROJECT_TOOLS_REQUIRE_PREBUILT: '1'");
    expect(testJob).toContain('bun run project-tools-prebuilt:validate');
    expect(workflow).toContain('run: bun run samchon-graph:validate');
    expect(workflow).toContain('run: bun run samchon-graph:smoke');
    expect(workflow).not.toContain('test-project-tools-scaffold-core:');
    expect(workflow).not.toContain('test-project-tools-workspace:');
    expect(workflow).not.toContain('test-project-tools-compound:');
  });

  test('CI keeps post-build smoke gates enabled when push-only coverage skips on pull requests', () => {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'ci.yml'),
      'utf8',
    );
    const coverageJob = getWorkflowJobBlock(
      workflow,
      'test-project-tools-coverage',
    );
    const generatedSmokeJob = getWorkflowJobBlock(workflow, 'generated-smoke');
    const e2eJob = getWorkflowJobBlock(workflow, 'e2e');

    expect(coverageJob).toContain("if: github.event_name == 'push'");
    expect(generatedSmokeJob).toContain(
      'needs: [build, publish-install-smoke]',
    );
    expect(generatedSmokeJob).toContain('!cancelled() &&');
    expect(generatedSmokeJob).not.toContain('always() &&');
    expect(generatedSmokeJob).toContain("needs.build.result == 'success' &&");
    expect(generatedSmokeJob).toContain(
      "needs.publish-install-smoke.result == 'success'",
    );
    expect(e2eJob).toContain('needs: [build]');
    expect(e2eJob).toContain('!cancelled() &&');
    expect(e2eJob).not.toContain('always() &&');
    expect(e2eJob).toContain("needs.build.result == 'success'");
  });

  test('GitHub releases explicitly dispatch standalone asset publishing', () => {
    const createReleaseWorkflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'create-release.yml'),
      'utf8',
    );
    const standaloneWorkflow = fs.readFileSync(
      path.join(
        repoRoot,
        '.github',
        'workflows',
        'release-standalone-assets.yml',
      ),
      'utf8',
    );
    const createReleaseJob = getWorkflowJobBlock(
      createReleaseWorkflow,
      'create-release',
    );

    expect(createReleaseWorkflow).toContain(
      'permissions:\n  actions: write\n  contents: write',
    );
    expect(createReleaseJob).toContain(
      'gh workflow run release-standalone-assets.yml',
    );
    expect(createReleaseJob).toContain(
      'gh release download "$RELEASE_TAG"',
    );
    expect(createReleaseJob).toContain('--pattern SHA256SUMS');
    expect(createReleaseJob).toContain('asset_name="${asset_name#\\*}"');
    expect(createReleaseJob).toContain(
      'asset_name="${asset_name%$\'\\r\'}"',
    );
    expect(createReleaseJob).toContain(
      "if: steps.standalone_assets.outputs.complete != 'true'",
    );
    expect(createReleaseJob).toContain('--ref main');
    expect(createReleaseJob).toContain(
      '--field "release_tag=${RELEASE_TAG}"',
    );
    expect(standaloneWorkflow).toContain('workflow_dispatch:');
    expect(standaloneWorkflow).toContain('release_tag:');
  });

  test('docs explain lint ownership and ci:local guidance', () => {
    const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
    const contributing = fs.readFileSync(
      path.join(repoRoot, 'CONTRIBUTING.md'),
      'utf8',
    );
    const cliReadme = fs.readFileSync(
      path.join(repoRoot, 'packages', 'wp-typia', 'README.md'),
      'utf8',
    );
    const workspaceWebpackTemplate = fs.readFileSync(
      path.join(
        repoRoot,
        'packages',
        'create-workspace-template',
        'webpack.config.js.mustache',
      ),
      'utf8',
    );

    expect(readme).toContain('bun run ci:local');
    expect(readme).toContain('bun run lint:fix');
    expect(readme).toContain('bun run format:write');
    expect(readme).toContain('bun run test:repo:fast');
    expect(readme).toContain(
      '[Block Generator Architecture](https://imjlk.github.io/wp-typia/architecture/block-generator-architecture/)',
    );
    expect(readme).toContain(
      '[Block Generator Tool Contract](https://imjlk.github.io/wp-typia/architecture/block-generator-tool-contract/)',
    );
    expect(readme).toContain(
      '[External Template-Layer Composition RFC](https://imjlk.github.io/wp-typia/architecture/external-template-layer-composition/)',
    );
    expect(readme).toContain(
      'Root ESLint covers JavaScript, CJS, and MJS infrastructure',
    );
    expect(readme).toContain(
      '[Core Data Adapter Boundary](https://imjlk.github.io/wp-typia/maintainers/core-data-adapter-boundary/)',
    );
    expect(readme).toContain(
      '[Formatting Toolchain Policy](https://imjlk.github.io/wp-typia/maintainers/formatting-toolchain-policy/)',
    );
    expect(readme).toContain(
      '[Maintenance Automation Policy](https://imjlk.github.io/wp-typia/maintainers/maintenance-automation-policy/)',
    );
    expect(readme).toContain('Prettier 3.8.2');
    expect(readme).toContain('bun run maintenance-automation:validate');
    expect(readme).toContain('bun run formatting-policy:validate');
    expect(readme).toContain('## Who this is for');
    expect(readme).toContain('[Upgrade Guide](UPGRADE.md)');
    expect(readme).toContain('[License](LICENSE)');
    expect(readme).toContain('[Security Policy](SECURITY.md)');
    expect(contributing).toContain('Linting ownership is intentionally split');
    expect(contributing).toContain('Formatting ownership is also explicit');
    expect(contributing).toContain('bun run lint:fix');
    expect(contributing).toContain('bun run format:write');
    expect(contributing).toContain('bun run test:repo:fast');
    expect(contributing).toContain('Maintenance automation is explicit too');
    expect(contributing).toContain('bun run lint:repo');
    expect(contributing).toContain('bun run maintenance-automation:validate');
    expect(contributing).toContain('bun run formatting-policy:validate');
    expect(contributing).toContain('## Project meta docs');
    expect(contributing).toContain('[`UPGRADE.md`](./UPGRADE.md)');
    expect(contributing).toContain('[`SECURITY.md`](./SECURITY.md)');
    expect(contributing).toContain(
      '[`docs/block-generator-architecture.md`](https://imjlk.github.io/wp-typia/architecture/block-generator-architecture/)',
    );
    expect(contributing).toContain(
      '[`docs/block-generator-tool-contract.md`](https://imjlk.github.io/wp-typia/architecture/block-generator-tool-contract/)',
    );
    expect(contributing).toContain(
      '[`docs/external-template-layer-composition.md`](https://imjlk.github.io/wp-typia/architecture/external-template-layer-composition/)',
    );
    expect(contributing).toContain(
      '[`docs/core-data-adapter-boundary.md`](https://imjlk.github.io/wp-typia/maintainers/core-data-adapter-boundary/)',
    );
    expect(contributing).toContain(
      '[`docs/formatting-toolchain-policy.md`](https://imjlk.github.io/wp-typia/maintainers/formatting-toolchain-policy/)',
    );
    expect(contributing).toContain(
      '[`docs/maintenance-automation-policy.md`](https://imjlk.github.io/wp-typia/maintainers/maintenance-automation-policy/)',
    );
    expect(contributing).toContain('Dependabot');
    expect(contributing).toContain('release/sampo');
    expect(contributing).toContain('## Generated project toolchain matrix');
    expect(contributing).toContain('## TypeScript runtime dependency audit');
    expect(contributing).toContain('`bun run typescript-runtime:validate`');
    expect(contributing).toContain(
      '`@wp-typia/block-runtime` keeps `@typescript/typescript6` in `dependencies`',
    );
    expect(contributing).toContain(
      '`@wp-typia/project-tools` keeps `@typescript/typescript6` in `dependencies`',
    );
    expect(contributing).toContain('`typia` 13.x');
    expect(contributing).toContain('`ttsc` 0.23.x');
    expect(contributing).toContain('`@ttsc/unplugin` 0.23.x');
    expect(contributing).toContain('`@wordpress/scripts` 30.x');
    expect(cliReadme).toMatch(
      /https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\/UPGRADE\.md/,
    );
    expect(cliReadme).toMatch(
      /https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\/SECURITY\.md/,
    );
    expect(workspaceWebpackTemplate).toContain(
      'loadCompatibleTypiaWebpackPlugin',
    );
    expect(workspaceWebpackTemplate).toContain('projectRoot: process.cwd()');
  });
});
