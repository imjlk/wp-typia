import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  detectNativeStandaloneTarget,
  getStandaloneArchiveFilename,
  getStandaloneBinaryFilename,
  parseStandaloneTargets,
  STANDALONE_CHECKSUMS_FILENAME,
  STANDALONE_MANIFEST_FILENAME,
  STANDALONE_TARGETS,
} from '../src/standalone-distribution';

import { runUtf8Command } from '../../../tests/helpers/process-utils';

const packageRoot = path.resolve(import.meta.dir, '..');
const repoRoot = path.resolve(packageRoot, '../..');
const packageManifest = JSON.parse(
  fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
);

function extractVersionOutput(output: string): string {
  const trimmed = output.trim();
  if (trimmed === `wp-typia ${packageManifest.version}`) {
    return trimmed;
  }

  if (!trimmed.startsWith('{')) {
    throw new Error(`Unexpected standalone --version output: ${output}`);
  }

  let parsed: {
    data?: {
      version?: string;
    };
    ok?: boolean;
  };
  try {
    parsed = JSON.parse(trimmed) as {
      data?: {
        version?: string;
      };
      ok?: boolean;
    };
  } catch {
    throw new Error(`Unexpected standalone --version output: ${output}`);
  }
  const parsedData = parsed.data;
  if (parsed.ok === true && parsedData && parsedData.version === packageManifest.version) {
    return `wp-typia ${parsedData.version}`;
  }

  throw new Error(`Unexpected standalone --version output: ${output}`);
}

let nativeStandaloneBuildPromise:
	| Promise<{
			binaryPath: string;
			outdir: string;
			target: ReturnType<typeof detectNativeStandaloneTarget>;
	  }>
	| undefined;

function ensureNativeStandaloneBuild() {
  if (!nativeStandaloneBuildPromise) {
    nativeStandaloneBuildPromise = (async () => {
			const outdir = fs.mkdtempSync(
				path.join(os.tmpdir(), 'wp-typia-standalone-build-'),
			);
			const target = detectNativeStandaloneTarget();
			runUtf8Command(
				'bun',
				[
					'scripts/build-standalone-runtime.ts',
					'--targets',
					'native',
					'--outdir',
					outdir,
				],
				{ cwd: packageRoot },
			);

			return {
				binaryPath: path.join(
					outdir,
					target,
					getStandaloneBinaryFilename(packageManifest.name, target),
				),
				outdir,
				target,
			};
		})();
  }

  return nativeStandaloneBuildPromise;
}

describe('wp-typia standalone distribution', () => {
	test('keeps standalone target and asset naming stable', () => {
		expect(STANDALONE_TARGETS).toEqual([
			'darwin-arm64',
			'darwin-x64',
			'linux-arm64',
			'linux-x64',
			'windows-x64',
		]);
		expect(
			getStandaloneBinaryFilename(packageManifest.name, 'windows-x64'),
		).toBe('wp-typia.exe');
		expect(
			getStandaloneBinaryFilename(packageManifest.name, 'darwin-arm64'),
		).toBe('wp-typia');
		expect(
			getStandaloneArchiveFilename(
				packageManifest.name,
				packageManifest.version,
				'linux-x64',
			),
		).toBe(`wp-typia-${packageManifest.version}-linux-x64.tar.gz`);
		expect(
			getStandaloneArchiveFilename(
				packageManifest.name,
				packageManifest.version,
				'windows-x64',
			),
		).toBe(`wp-typia-${packageManifest.version}-windows-x64.zip`);
	});

	test('classifies unsupported standalone targets as invalid arguments', () => {
		expect(() => parseStandaloneTargets('linux-riscv64')).toThrow(
			/Unsupported standalone target/,
		);

		let error: Error | undefined;
		try {
			parseStandaloneTargets('linux-riscv64');
		} catch (caught) {
			error = caught as Error;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as { code?: string } | undefined)?.code).toBe(
			'invalid-argument',
		);
	});

	test('declares standalone build scripts and release asset workflow', () => {
		const workflowSource = fs.readFileSync(
			path.join(
				repoRoot,
				'.github',
				'workflows',
				'release-standalone-assets.yml',
			),
			'utf8',
		);

		expect(packageManifest.scripts['build:standalone']).toBe(
			'bun scripts/build-standalone-runtime.ts --targets native --outdir ./dist-standalone',
		);
		expect(packageManifest.scripts['build:standalone:release']).toBe(
			'bun scripts/build-standalone-runtime.ts --targets darwin-arm64,darwin-x64,linux-arm64,linux-x64,windows-x64 --outdir ./.cache/standalone/raw',
		);
		expect(packageManifest.scripts['standalone:prepare-release-assets']).toBe(
			'bun scripts/prepare-standalone-release-assets.ts --input-dir ./.cache/standalone/raw --outdir ./.cache/standalone/release-assets',
		);
		expect(packageManifest.scripts.clean).toContain('dist-standalone');
		expect(packageManifest.scripts.clean).toContain('.cache/standalone');
		expect(workflowSource).toContain('release:');
		expect(workflowSource).toContain('types: [published]');
		expect(workflowSource).toContain('build:standalone:release');
		expect(workflowSource).toContain('prepare-standalone-release-assets.ts');
		expect(workflowSource).toContain('gh release upload');
	});

	test('builds a native standalone binary that can render version output', async () => {
		const { binaryPath } = await ensureNativeStandaloneBuild();
		expect(fs.existsSync(binaryPath)).toBe(true);

		const versionOutput = extractVersionOutput(
			runUtf8Command(binaryPath, ['--version']),
		);
		expect(versionOutput).toBe(`wp-typia ${packageManifest.version}`);
	});

	test('prepares release assets and installs from the POSIX installer contract', async () => {
		if (process.platform === 'win32') {
			return;
		}

		const standaloneBuild = await ensureNativeStandaloneBuild();
		const stagingRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), 'wp-typia-standalone-release-'),
		);
		const releaseTag = 'test-release';
		const releaseDir = path.join(stagingRoot, releaseTag);
		fs.mkdirSync(releaseDir, { recursive: true });

		runUtf8Command(
			'bun',
			[
				'scripts/prepare-standalone-release-assets.ts',
				'--input-dir',
				standaloneBuild.outdir,
				'--outdir',
				releaseDir,
				'--release-tag',
				releaseTag,
				'--targets',
				standaloneBuild.target,
			],
			{ cwd: packageRoot },
		);

		expect(
			fs.existsSync(path.join(releaseDir, STANDALONE_MANIFEST_FILENAME)),
		).toBe(true);
		expect(
			fs.existsSync(path.join(releaseDir, STANDALONE_CHECKSUMS_FILENAME)),
		).toBe(true);
		expect(
			fs.existsSync(path.join(releaseDir, 'install-wp-typia.sh')),
		).toBe(true);
		expect(
			fs.existsSync(path.join(releaseDir, 'install-wp-typia.ps1')),
		).toBe(true);

		const installDir = path.join(stagingRoot, 'bin');
		runUtf8Command(
			'sh',
			[
				path.join(repoRoot, 'scripts', 'install-wp-typia.sh'),
				'--version',
				releaseTag,
				'--install-dir',
				installDir,
			],
			{
				env: {
					...process.env,
					WP_TYPIA_RELEASE_DOWNLOAD_BASE_URL: `file://${stagingRoot}`,
				},
			},
		);
		runUtf8Command(
			'sh',
			[
				path.join(repoRoot, 'scripts', 'install-wp-typia.sh'),
				'--version',
				releaseTag,
				'--install-dir',
				installDir,
				'--update',
			],
			{
				env: {
					...process.env,
					WP_TYPIA_RELEASE_DOWNLOAD_BASE_URL: `file://${stagingRoot}`,
				},
			},
		);

		const installedBinaryPath = path.join(
			installDir,
			getStandaloneBinaryFilename(packageManifest.name, standaloneBuild.target),
		);
		expect(fs.existsSync(installedBinaryPath)).toBe(true);
		expect(
			extractVersionOutput(runUtf8Command(installedBinaryPath, ['--version'])),
		).toBe(`wp-typia ${packageManifest.version}`);
		const templatesOutput = runUtf8Command(installedBinaryPath, [
			'templates',
			'list',
			'--format',
			'json',
		]);
		expect(templatesOutput).toContain('"basic"');
		expect(templatesOutput).toContain(
			'"@wp-typia/create-workspace-template"',
		);

		const dryRunOutput = runUtf8Command(
			installedBinaryPath,
			[
				'create',
				'demo-basic',
				'--template',
				'basic',
				'--yes',
				'--no-install',
				'--dry-run',
			],
			{ cwd: stagingRoot },
		);
		expect(dryRunOutput).toContain('Dry run for Demo Basic');
		expect(dryRunOutput).toContain('write src/block-metadata.ts');
		expect(dryRunOutput).toContain('write src/manifest-document.ts');
		expect(dryRunOutput).not.toContain('write src/typia-validator.php');

		const createdOutput = runUtf8Command(
			installedBinaryPath,
			[
				'create',
				'demo-basic-created',
				'--template',
				'basic',
				'--yes',
				'--no-install',
			],
			{ cwd: stagingRoot },
		);
		const createdProjectDir = path.join(stagingRoot, 'demo-basic-created');
		expect(createdOutput).toContain('Compiler-derived artifacts were deferred');
		expect(
			fs.existsSync(path.join(createdProjectDir, 'src', 'block.json')),
		).toBe(true);
		expect(
			fs.existsSync(
				path.join(createdProjectDir, 'src', 'typia.manifest.json'),
			),
		).toBe(true);
		expect(fs.existsSync(path.join(createdProjectDir, 'node_modules'))).toBe(
			false,
		);

		const persistenceDryRunOutput = runUtf8Command(
			installedBinaryPath,
			[
				'create',
				'demo-persistence',
				'--template',
				'persistence',
				'--yes',
				'--no-install',
				'--dry-run',
			],
			{ cwd: stagingRoot },
		);
		expect(persistenceDryRunOutput).not.toContain(
			'write src/typia.schema.json',
		);
		expect(persistenceDryRunOutput).not.toContain('write src/api-client.ts');
		expect(persistenceDryRunOutput).not.toContain(
			'write src/api-schemas/state-query.schema.json',
		);
	}, { timeout: 30_000 });

	test('ships a Windows installer contract alongside the POSIX installer', () => {
		const windowsInstallerSource = fs.readFileSync(
			path.join(repoRoot, 'scripts', 'install-wp-typia.ps1'),
			'utf8',
		);
		const posixInstallerSource = fs.readFileSync(
			path.join(repoRoot, 'scripts', 'install-wp-typia.sh'),
			'utf8',
		);

		expect(windowsInstallerSource).toContain('Invoke-RestMethod');
		expect(windowsInstallerSource).toContain('Invoke-WebRequest');
		expect(windowsInstallerSource).toContain('Expand-Archive');
		expect(windowsInstallerSource).toContain('WP_TYPIA_RELEASE_DOWNLOAD_BASE_URL');
		expect(windowsInstallerSource).toContain('standalone-manifest.env');
		expect(posixInstallerSource).toContain('SHA256SUMS');
		expect(posixInstallerSource).toContain('standalone-manifest.env');
		expect(posixInstallerSource).toContain('WP_TYPIA_RELEASE_DOWNLOAD_BASE_URL');
	});
});
