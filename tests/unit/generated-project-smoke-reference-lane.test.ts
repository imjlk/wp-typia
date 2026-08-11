import { afterEach, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';

const repoRoot = join(import.meta.dir, '..', '..');
const tempDirs: string[] = [];

interface GeneratedPhpHelper {
  collectGeneratedProjectPhpFiles: (projectDir: string) => string[];
  lintGeneratedProjectPhp: (
		projectDir: string,
		requiredPhpVersion: string | undefined,
		options?: {
			executePhp?: (args: readonly string[], options: unknown) => string;
		},
	) => string[];
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

function loadGeneratedPhpHelper(): Promise<GeneratedPhpHelper> {
  return import(
		new URL(
			'../../scripts/lib/generated-project-smoke-php.mjs',
			import.meta.url,
		).href
	) as Promise<GeneratedPhpHelper>;
}

function writeFixtureFile(rootDir: string, relativePath: string, source: string) {
  const filePath = join(rootDir, relativePath);
  fs.mkdirSync(dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, 'utf8');
  return filePath;
}

interface GeneratedPackageFixture {
  [key: string]: unknown;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function addGeneratedLintBoundary(
  projectDir: string,
  packageJson: GeneratedPackageFixture,
): GeneratedPackageFixture {
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    '@ttsc/lint': '0.26.1',
    '@types/react': '^18.3.28',
    '@types/react-dom': '^18.3.7',
    react: '^18.3.1',
    'react-dom': '^18.3.1',
  };
  packageJson.scripts = {
    ...packageJson.scripts,
    'check:code': 'ttsc check --noEmit',
    'check:style': 'wp-scripts lint-style --allow-empty-input',
    'check:format': 'prettier --check .',
    check: 'bun run check:code && bun run check:style && bun run check:format',
  };
  writeFixtureFile(
    projectDir,
    'scripts/apply-ttsc-lint-compat.mjs',
    '#!/usr/bin/env node\n',
  );
  writeFixtureFile(
    projectDir,
    '.prettierignore',
    [
      '**/.pnpm-store/**',
      '**/.yarn/**',
      '**/bun.lock',
      '**/bun.lockb',
      '**/npm-shrinkwrap.json',
      '**/package-lock.json',
      '**/pnpm-lock.yaml',
      '**/yarn.lock',
      '',
    ].join('\n'),
  );
  writeFixtureFile(projectDir, 'prettier.config.mjs', 'export default {};\n');
  return packageJson;
}

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
  tempDirs.length = 0;
});

test('generated project smoke script supports a reference example lane', () => {
  const rootPackageJson = JSON.parse(
    fs.readFileSync(join(repoRoot, 'package.json'), 'utf8'),
  ) as { scripts?: Record<string, string> };
  const referenceReadme = fs.readFileSync(
    join(repoRoot, 'examples', 'my-typia-block', 'README.md'),
    'utf8',
  );
  const smokeScript = fs.readFileSync(
    join(repoRoot, 'scripts', 'run-generated-project-smoke.mjs'),
    'utf8',
  );
  const exampleHelper = fs.readFileSync(
    join(repoRoot, 'scripts', 'lib', 'generated-project-smoke-example.mjs'),
    'utf8',
  );
  const assertionHelper = fs.readFileSync(
    join(repoRoot, 'scripts', 'lib', 'generated-project-smoke-assertions.mjs'),
    'utf8',
  );
  const workspaceAssertionHelper = fs.readFileSync(
    join(
      repoRoot,
      'scripts',
      'lib',
      'generated-project-smoke-workspace-assertions.mjs',
    ),
    'utf8',
  );
  const coreHelper = fs.readFileSync(
    join(repoRoot, 'scripts', 'lib', 'generated-project-smoke-core.mjs'),
    'utf8',
  );
  const phpHelper = fs.readFileSync(
    join(repoRoot, 'scripts', 'lib', 'generated-project-smoke-php.mjs'),
    'utf8',
  );

  expect(smokeScript).toContain('exampleProject');
  expect(smokeScript).toContain('--example-project');
  expect(smokeScript).toContain('--php-version');
  expect(smokeScript).toContain('./lib/generated-project-smoke-example.mjs');
  expect(smokeScript).toContain('./lib/generated-project-smoke-assertions.mjs');
  expect(smokeScript).toContain('./lib/generated-project-smoke-php.mjs');
  expect(smokeScript).toContain('runExampleProjectSmoke');
  expect(smokeScript).toContain('assertGeneratedProjectScaffold');
  expect(smokeScript).toContain('assertScaffoldPackageManagerField');
  expect(smokeScript).toContain("packageManager === 'npm'");
  expect(smokeScript).toContain('Expected npm scaffolds to omit packageManager');
  expect(exampleHelper).toContain('ensureCopiedExampleSupportDependencies');
  expect(exampleHelper).toContain('apply-ttsc-lint-compat.mjs.mustache');
  expect(exampleHelper).toContain('formatCopiedExampleConfigFiles');
  expect(exampleHelper).toContain('runExampleProjectSmoke');
  expect(exampleHelper).toContain('shouldRunMigrationSmoke');
  expect(exampleHelper).toContain(
    'lintGeneratedProjectPhp(exampleDir, phpVersion)',
  );
  expect(exampleHelper).toContain('devDependencies["bun-types"]');
  expect(exampleHelper).toContain('devDependencies["@types/node"]');
  expect(exampleHelper).toContain(
    'path.join(workspaceRoot, "types", "assets.d.ts")',
  );
  expect(exampleHelper).toContain('"../../types/assets.d.ts"');
  expect(assertionHelper).toContain('assertExampleProjectScaffold');
  expect(workspaceAssertionHelper).toContain(
    "EDITOR_PLUGIN_SLOT = '${normalizedSlot}'",
  );
  expect(assertionHelper).toContain('collectProjectFilePaths');
  expect(assertionHelper).toContain('PHP lint failed for');
  expect(assertionHelper).toContain('${filePath}');
  expect(assertionHelper).toContain('error?.stderr');
  expect(assertionHelper).toContain('error?.stdout');
  expect(assertionHelper).toContain("exampleProject === 'my-typia-block'");
  expect(assertionHelper).toContain(
    "path.join(projectDir, 'build', 'blocks', blockSlug)",
  );
  expect(coreHelper).toContain(
    'Expected ${configPath} to declare currentMigrationVersion in a supported format',
  );
  expect(coreHelper).toContain('cleanupTemporaryProjectRoot');
  expect(coreHelper).toContain('maxRetries: 5');
  expect(coreHelper).toContain('retryDelay: 100');
  expect(phpHelper).toContain('collectGeneratedProjectPhpFiles');
  expect(smokeScript).toContain(
    'lintGeneratedProjectPhp(projectDir, phpVersion)',
  );
  expect(smokeScript).toContain(
    "if (typeof packageJson.scripts?.check === 'string')",
  );
  expect(exampleHelper).toContain('Missing "check" script in');
  expect(exampleHelper).toContain(
    'path.resolve(repoRoot, "examples", exampleProject)',
  );
  expect(rootPackageJson.scripts?.['examples:typecheck']).toBeUndefined();
  expect(rootPackageJson.scripts?.['examples:check:code']).toContain(
    '--if-present check:code',
  );
  expect(rootPackageJson.scripts?.['examples:check:code']).not.toContain(
    '--if-present typecheck',
  );
  expect(referenceReadme).toContain('bun run check:code');
  expect(referenceReadme).not.toContain('bun run typecheck');
});

test('reference example copies pin and apply the standalone lint repair', async () => {
  const projectDir = fs.mkdtempSync(
    join(os.tmpdir(), 'wp-typia-reference-lint-repair-'),
  );
  tempDirs.push(projectDir);
  fs.writeFileSync(
    join(projectDir, 'package.json'),
    `${JSON.stringify(
      {
        devDependencies: { '@ttsc/lint': '^0.26.1' },
        scripts: {
          postinstall:
            'echo node scripts/apply-ttsc-lint-compat.mjs || true',
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const helper = await import(
    new URL(
      '../../scripts/lib/generated-project-smoke-example.mjs',
      import.meta.url,
    ).href
  );
  helper.ensureCopiedExampleSupportDependencies(projectDir);

  const rootPackageJson = JSON.parse(
    fs.readFileSync(join(repoRoot, 'package.json'), 'utf8'),
  ) as { devDependencies: Record<string, string> };
  const packageJson = JSON.parse(
    fs.readFileSync(join(projectDir, 'package.json'), 'utf8'),
  ) as {
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  expect(packageJson.devDependencies['@ttsc/lint']).toBe(
    rootPackageJson.devDependencies['@ttsc/lint'],
  );
  expect(packageJson.scripts.postinstall).toBe(
    '(echo node scripts/apply-ttsc-lint-compat.mjs || true) && node scripts/apply-ttsc-lint-compat.mjs',
  );
  expect(
    fs.readFileSync(
      join(projectDir, 'scripts', 'apply-ttsc-lint-compat.mjs'),
      'utf8',
    ),
  ).toBe(
    fs.readFileSync(
      join(
        repoRoot,
        'packages',
        'wp-typia-project-tools',
        'templates',
        '_shared',
        'base',
        'scripts',
        'apply-ttsc-lint-compat.mjs.mustache',
      ),
      'utf8',
    ),
  );
});

test('reference example workspaces retain shared asset module declarations', async () => {
  const workspaceRoot = fs.mkdtempSync(
    join(os.tmpdir(), 'wp-typia-reference-assets-'),
  );
  const projectDir = join(workspaceRoot, 'examples', 'reference-example');
  tempDirs.push(workspaceRoot);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    join(projectDir, 'tsconfig.json'),
    `${JSON.stringify({ extends: '../../tsconfig.json' }, null, 2)}\n`,
    'utf8',
  );

  const helper = await import(
    new URL(
      '../../scripts/lib/generated-project-smoke-example.mjs',
      import.meta.url,
    ).href,
  );
  helper.prepareExampleWorkspaceRoot(workspaceRoot);
  helper.rewriteCopiedExampleTsconfig(projectDir);

  expect(
    fs.readFileSync(join(workspaceRoot, 'types', 'assets.d.ts'), 'utf8'),
  ).toBe(fs.readFileSync(join(repoRoot, 'types', 'assets.d.ts'), 'utf8'));
  const tsconfig = JSON.parse(
    fs.readFileSync(join(projectDir, 'tsconfig.json'), 'utf8'),
  ) as {
    compilerOptions?: { allowJs?: boolean; rootDir?: string };
    include?: string[];
  };
  expect(tsconfig.include).toContain('../../types/assets.d.ts');
  expect(tsconfig.include).toContain('*.js');
  expect(tsconfig.include).toContain('*.jsx');
  expect(tsconfig.include).toContain('*.cjs');
  expect(tsconfig.include).toContain('*.mjs');
  expect(tsconfig.compilerOptions?.allowJs).toBe(true);
  expect(tsconfig.compilerOptions?.rootDir).toBe('../..');
});

test('reference example config rewrites are normalized before format checks', async () => {
  const projectDir = fs.mkdtempSync(
    join(os.tmpdir(), 'wp-typia-reference-format-'),
  );
  tempDirs.push(projectDir);
  fs.writeFileSync(
    join(projectDir, 'package.json'),
    '{"scripts":{"check":"ttsc check --noEmit"}}\n',
    'utf8',
  );
  fs.writeFileSync(
    join(projectDir, 'tsconfig.json'),
    '{"compilerOptions":{"types":["node","bun-types"]}}\n',
    'utf8',
  );

  const helper = await import(
    new URL(
      '../../scripts/lib/generated-project-smoke-example.mjs',
      import.meta.url,
    ).href,
  );
  helper.formatCopiedExampleConfigFiles(projectDir);
  const formattedPackageJson = fs.readFileSync(
    join(projectDir, 'package.json'),
    'utf8',
  );
  const formattedTsconfig = fs.readFileSync(
    join(projectDir, 'tsconfig.json'),
    'utf8',
  );
  helper.formatCopiedExampleConfigFiles(projectDir);

  expect(JSON.parse(formattedPackageJson)).toEqual({
    scripts: { check: 'ttsc check --noEmit' },
  });
  expect(JSON.parse(formattedTsconfig)).toEqual({
    compilerOptions: { types: ['node', 'bun-types'] },
  });
  expect(fs.readFileSync(join(projectDir, 'package.json'), 'utf8')).toBe(
    formattedPackageJson,
  );
  expect(fs.readFileSync(join(projectDir, 'tsconfig.json'), 'utf8')).toBe(
    formattedTsconfig,
  );
});

test('CI generated smoke matrix includes the checked-in example lanes', () => {
  const ciWorkflow = fs.readFileSync(
    join(repoRoot, '.github', 'workflows', 'ci.yml'),
    'utf8',
  );
  const generatedSmokeJob = getWorkflowJobBlock(ciWorkflow, 'generated-smoke');

  expect(ciWorkflow).toContain("PHP_VERSION: '8.1'");
  expect(ciWorkflow).toContain("GENERATED_PHP_VERSION: '8.0'");
  expect(ciWorkflow).toContain('example_project: my-typia-block');
  expect(ciWorkflow).toContain('example_project: compound-patterns');
  expect(ciWorkflow).toContain('example_project: persistence-examples');
  expect(ciWorkflow).toContain('smoke-reference-my-typia-block-bun');
  expect(ciWorkflow).toContain('smoke-example-compound-patterns-bun');
  expect(ciWorkflow).toContain('smoke-example-persistence-examples-bun');
  expect(ciWorkflow).toContain(
    'Generated Project Smoke (${{ matrix.project_name || matrix.example_project }})',
  );
  expect(ciWorkflow).toContain(
    'if [ -n "${{ matrix.template || \'\' }}" ]; then',
  );
  expect(ciWorkflow).toContain('args+=(--template "${{ matrix.template }}")');
  expect(ciWorkflow).toContain(
    '--example-project "${{ matrix.example_project }}"',
  );
  expect(generatedSmokeJob).toContain(
    'uses: shivammathur/setup-php@f3e473d116dcccaddc5834248c87452386958240 # v2.37.2',
  );
  expect(generatedSmokeJob).toContain(
    'php-version: ${{ env.GENERATED_PHP_VERSION }}',
  );
  expect(generatedSmokeJob).toContain(
    '--php-version "${{ env.GENERATED_PHP_VERSION }}"',
  );
});

test('generated PHP collection is deterministic and excludes dependencies and symlinks', async () => {
  const projectDir = fs.mkdtempSync(
    join(os.tmpdir(), 'wp-typia-generated-php-collection-'),
  );
  const linkedDir = fs.mkdtempSync(
    join(os.tmpdir(), 'wp-typia-generated-php-linked-'),
  );
  tempDirs.push(projectDir, linkedDir);

  const rootPhp = writeFixtureFile(projectDir, 'alpha.php', '<?php\n');
  const buildPhp = writeFixtureFile(
    projectDir,
    'build/generated.php',
    '<?php\n',
  );
  const nestedPhp = writeFixtureFile(
    projectDir,
    'src/nested/runtime.php',
    '<?php\n',
  );
  writeFixtureFile(projectDir, 'src/nested/readme.txt', 'not PHP\n');
  writeFixtureFile(projectDir, '.git/ignored.php', '<?php\n');
  writeFixtureFile(projectDir, 'node_modules/pkg/ignored.php', '<?php\n');
  writeFixtureFile(projectDir, 'vendor/pkg/ignored.php', '<?php\n');
  writeFixtureFile(linkedDir, 'linked.php', '<?php\n');
  fs.symlinkSync(linkedDir, join(projectDir, 'linked-directory'), 'dir');
  fs.symlinkSync(rootPhp, join(projectDir, 'linked-file.php'), 'file');

  const { collectGeneratedProjectPhpFiles } = await loadGeneratedPhpHelper();

  expect(collectGeneratedProjectPhpFiles(projectDir)).toEqual([
    rootPhp,
    buildPhp,
    nestedPhp,
  ]);
});

test('required generated PHP lint rejects an unavailable runtime', async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), 'wp-typia-generated-php-missing-'),
	);
	tempDirs.push(projectDir);
	const { lintGeneratedProjectPhp } = await loadGeneratedPhpHelper();
	const missingPhpError = Object.assign(new Error('spawn php ENOENT'), {
		code: 'ENOENT',
	});

	expect(() =>
		lintGeneratedProjectPhp(projectDir, '8.0', {
			executePhp() {
				throw missingPhpError;
			},
		}),
	).toThrow(
		'Generated project PHP syntax lint requires PHP 8.0, but the php executable is unavailable or failed to start',
	);
});

test('required generated PHP lint rejects a different major.minor runtime', async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), 'wp-typia-generated-php-version-'),
	);
	tempDirs.push(projectDir);
	const { lintGeneratedProjectPhp } = await loadGeneratedPhpHelper();

	expect(() =>
		lintGeneratedProjectPhp(projectDir, '8.0', {
			executePhp: () => '8.1',
		}),
	).toThrow(
		'Generated project PHP syntax lint requires PHP 8.0, but php resolved to 8.1.',
	);
});

test('required generated PHP lint checks every collected file', async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), 'wp-typia-generated-php-lint-'),
	);
	tempDirs.push(projectDir);
	writeFixtureFile(projectDir, 'src/runtime.php', '<?php\n');
	writeFixtureFile(projectDir, 'build/validator.php', '<?php\n');

	const { collectGeneratedProjectPhpFiles, lintGeneratedProjectPhp } =
		await loadGeneratedPhpHelper();
	const phpFiles = collectGeneratedProjectPhpFiles(projectDir);
	const calls: string[][] = [];

	expect(
		lintGeneratedProjectPhp(projectDir, '8.0', {
			executePhp(args) {
				calls.push([...args]);
				return args[0] === '-r' ? '8.0' : 'No syntax errors detected';
			},
		}),
	).toEqual(phpFiles);
	expect(calls[0]?.[0]).toBe('-r');
	expect(calls.slice(1)).toEqual(
		phpFiles.map((filePath) => ['-l', filePath]),
	);
});

test('generated smoke script forwards run arguments per package manager', async () => {
	const { getRunScriptCommand } = (await import(
		new URL('../../scripts/lib/generated-project-smoke-core.mjs', import.meta.url).href
	)) as {
		getRunScriptCommand: (
			packageManager: 'bun' | 'npm' | 'pnpm' | 'yarn',
			scriptName: string,
			extraArgs?: string[],
		) => [string, string[]];
	};

	expect(getRunScriptCommand('bun', 'sync', ['--check'])).toEqual([
		'bun',
		['run', 'sync', '--check'],
	]);
	expect(getRunScriptCommand('npm', 'sync', ['--check'])).toEqual([
		'npm',
		['run', 'sync', '--', '--check'],
	]);
	expect(getRunScriptCommand('pnpm', 'sync', ['--check'])).toEqual([
		'corepack',
		['pnpm', 'run', 'sync', '--check'],
	]);
	expect(getRunScriptCommand('yarn', 'sync', ['--check'])).toEqual([
		'corepack',
		['yarn', 'run', 'sync', '--check'],
	]);
});

test('workspace dependency rewrite seeds local runtime packages for linked Bun reference examples', async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), 'wp-typia-generated-smoke-reference-'),
	);
	tempDirs.push(projectDir);

	const packageJsonPath = join(projectDir, 'package.json');
	fs.writeFileSync(
		packageJsonPath,
		`${JSON.stringify(
			{
				name: 'my-typia-block',
				private: true,
				devDependencies: {
					'@wp-typia/block-runtime': 'workspace:*',
					'@wp-typia/block-types': 'workspace:*',
					'@wp-typia/rest': 'workspace:*',
					'@wp-typia/ttsc-lint-plugin-wp': 'workspace:*',
					'wp-typia': 'workspace:*',
				},
			},
			null,
			'\t',
		)}\n`,
		'utf8',
	);

	const { rewriteWorkspaceDependencies } = (await import(
		new URL('../../scripts/lib/generated-project-smoke-core.mjs', import.meta.url).href
	)) as {
		rewriteWorkspaceDependencies: (
			projectDir: string,
			packageManager: 'bun' | 'npm' | 'pnpm' | 'yarn',
		) => void;
	};

	rewriteWorkspaceDependencies(projectDir, 'bun');

	const rewrittenPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	const rewrittenPackageJsonSource = fs.readFileSync(packageJsonPath, 'utf8');

	expect(rewrittenPackageJson.packageManager).toBe('bun@1.3.11');
	expect(rewrittenPackageJsonSource).toContain('\n\t"packageManager"');
	expect(rewrittenPackageJson.devDependencies['@wp-typia/api-client']).toContain(
		'packages/wp-typia-api-client',
	);
	expect(rewrittenPackageJson.devDependencies['@wp-typia/block-runtime']).toContain(
		'packages/wp-typia-block-runtime',
	);
	expect(rewrittenPackageJson.devDependencies['@wp-typia/project-tools']).toContain(
		'packages/wp-typia-project-tools',
	);
	expect(rewrittenPackageJson.devDependencies['@wp-typia/rest']).toContain(
		'packages/wp-typia-rest',
	);
	expect(
		rewrittenPackageJson.devDependencies['@wp-typia/ttsc-lint-plugin-wp'],
	).toContain('packages/ttsc-lint-plugin-wp');
	expect(rewrittenPackageJson.devDependencies['wp-typia']).toContain(
		'packages/wp-typia',
	);
	expect(rewrittenPackageJson.overrides['@wp-typia/project-tools']).toContain(
		'packages/wp-typia-project-tools',
	);
	expect(
		rewrittenPackageJson.overrides['@wp-typia/ttsc-lint-plugin-wp'],
	).toContain('packages/ttsc-lint-plugin-wp');
	expect(rewrittenPackageJson.resolutions['@wp-typia/project-tools']).toContain(
		'packages/wp-typia-project-tools',
	);
});

test('workspace dependency rewrite keeps npm project-tools overrides compatible with direct dependencies', async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), 'wp-typia-generated-smoke-npm-overrides-'),
	);
	tempDirs.push(projectDir);

	const packageJsonPath = join(projectDir, 'package.json');
	fs.writeFileSync(
		packageJsonPath,
		`${JSON.stringify(
			{
				name: 'my-typia-block',
				private: true,
				devDependencies: {
					'@wp-typia/project-tools': '^0.20.0',
					'wp-typia': '^0.20.3',
				},
			},
			null,
			2,
		)}\n`,
		'utf8',
	);

	const { rewriteWorkspaceDependencies } = (await import(
		new URL('../../scripts/lib/generated-project-smoke-core.mjs', import.meta.url).href
	)) as {
		rewriteWorkspaceDependencies: (
			projectDir: string,
			packageManager: 'bun' | 'npm' | 'pnpm' | 'yarn',
		) => void;
	};

	rewriteWorkspaceDependencies(projectDir, 'npm');

	const rewrittenPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

	expect(rewrittenPackageJson.packageManager).toBe('npm@11.6.1');
	expect(rewrittenPackageJson.devDependencies['@wp-typia/project-tools']).toContain(
		'packages/wp-typia-project-tools',
	);
	expect(rewrittenPackageJson.devDependencies['wp-typia']).toContain(
		'packages/wp-typia',
	);
	expect(rewrittenPackageJson.overrides['@wp-typia/project-tools']).toBe(
		rewrittenPackageJson.devDependencies['@wp-typia/project-tools'],
	);
	expect(rewrittenPackageJson.pnpm.overrides['@wp-typia/project-tools']).toBe(
		rewrittenPackageJson.devDependencies['@wp-typia/project-tools'],
	);
	expect(rewrittenPackageJson.resolutions['@wp-typia/project-tools']).toBe(
		rewrittenPackageJson.devDependencies['@wp-typia/project-tools'],
	);
});

test('generated project smoke assertions accept local project-tools smoke rewrites', async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), 'wp-typia-generated-smoke-boundary-'),
	);
	tempDirs.push(projectDir);

	fs.writeFileSync(
		join(projectDir, 'package.json'),
		`${JSON.stringify(
			addGeneratedLintBoundary(projectDir, {
				name: 'demo-smoke-boundary',
				private: true,
				devDependencies: {
					'@wp-typia/project-tools': `file:${join(
						repoRoot,
						'packages',
						'wp-typia-project-tools',
					)}`,
				},
				scripts: {
					build: 'wp-scripts build',
				},
			}),
			null,
			2,
		)}\n`,
		'utf8',
	);

	const { assertGeneratedPackageBoundary } = (await import(
		new URL('../../scripts/lib/generated-project-smoke-assertions.mjs', import.meta.url).href
	)) as {
		assertGeneratedPackageBoundary: (projectDir: string) => void;
	};

	expect(() => assertGeneratedPackageBoundary(projectDir)).not.toThrow();
});

test('generated project smoke assertions accept non-Bun aggregate runners', async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), 'wp-typia-generated-smoke-npm-boundary-'),
	);
	tempDirs.push(projectDir);
	const packageJson = addGeneratedLintBoundary(projectDir, {
		name: 'demo-smoke-npm-boundary',
		private: true,
	});
	packageJson.scripts = {
		...packageJson.scripts,
		check:
			'npm run check:code && npm run check:style && npm run check:format',
	};
	fs.writeFileSync(
		join(projectDir, 'package.json'),
		`${JSON.stringify(packageJson, null, 2)}\n`,
		'utf8',
	);

	const { assertGeneratedPackageBoundary } = (await import(
		new URL('../../scripts/lib/generated-project-smoke-assertions.mjs', import.meta.url).href
	)) as {
		assertGeneratedPackageBoundary: (projectDir: string) => void;
	};

	expect(() => assertGeneratedPackageBoundary(projectDir)).not.toThrow();
});

test('generated project smoke assertions allow official workspace CLI helper scripts', async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), 'wp-typia-generated-smoke-workspace-boundary-'),
	);
	tempDirs.push(projectDir);

	fs.writeFileSync(
		join(projectDir, 'package.json'),
		`${JSON.stringify(
			addGeneratedLintBoundary(projectDir, {
				name: 'demo-smoke-workspace-boundary',
				private: true,
				scripts: {
					'wp-typia:add': 'wp-typia add',
					'wp-typia:doctor': 'wp-typia doctor',
					'wp-typia:sync': 'wp-typia sync',
				},
				wpTypia: {
					projectType: 'workspace',
					templatePackage: '@wp-typia/create-workspace-template',
				},
			}),
			null,
			2,
		)}\n`,
		'utf8',
	);

	const { assertGeneratedPackageBoundary } = (await import(
		new URL('../../scripts/lib/generated-project-smoke-assertions.mjs', import.meta.url).href
	)) as {
		assertGeneratedPackageBoundary: (projectDir: string) => void;
	};

	expect(() => assertGeneratedPackageBoundary(projectDir)).not.toThrow();
});

test('generated project smoke assertions reject non-workspace wp-typia scripts', async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), 'wp-typia-generated-smoke-script-boundary-'),
	);
	tempDirs.push(projectDir);

	fs.writeFileSync(
		join(projectDir, 'package.json'),
		`${JSON.stringify(
			addGeneratedLintBoundary(projectDir, {
				name: 'demo-smoke-script-boundary',
				private: true,
				scripts: {
					'wp-typia:sync': 'wp-typia sync',
				},
			}),
			null,
			2,
		)}\n`,
		'utf8',
	);

	const { assertGeneratedPackageBoundary } = (await import(
		new URL('../../scripts/lib/generated-project-smoke-assertions.mjs', import.meta.url).href
	)) as {
		assertGeneratedPackageBoundary: (projectDir: string) => void;
	};

	expect(() => assertGeneratedPackageBoundary(projectDir)).toThrow(
		/Expected generated project script "wp-typia:sync" to avoid wp-typia/,
	);
});

test('generated project smoke assertions still reject published project-tools dependencies', async () => {
	const projectDir = fs.mkdtempSync(
		join(os.tmpdir(), 'wp-typia-generated-smoke-boundary-reject-'),
	);
	tempDirs.push(projectDir);

	fs.writeFileSync(
		join(projectDir, 'package.json'),
		`${JSON.stringify(
			addGeneratedLintBoundary(projectDir, {
				name: 'demo-smoke-boundary-reject',
				private: true,
				devDependencies: {
					'@wp-typia/project-tools': '^0.19.0',
				},
				scripts: {
					build: 'wp-scripts build',
				},
			}),
			null,
			2,
		)}\n`,
		'utf8',
	);

	const { assertGeneratedPackageBoundary } = (await import(
		new URL('../../scripts/lib/generated-project-smoke-assertions.mjs', import.meta.url).href
	)) as {
		assertGeneratedPackageBoundary: (projectDir: string) => void;
	};

	expect(() => assertGeneratedPackageBoundary(projectDir)).toThrow(
		/omit @wp-typia\/project-tools unless smoke rewrites pinned it to the local workspace package/,
	);
});
