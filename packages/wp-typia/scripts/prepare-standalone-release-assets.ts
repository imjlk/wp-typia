import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import packageJson from '../package.json';
import {
  getStandaloneArchiveFilename,
  getStandaloneBinaryFilename,
  getStandaloneManifestKey,
  parseStandaloneTargets,
  STANDALONE_CHECKSUMS_FILENAME,
  STANDALONE_MANIFEST_FILENAME,
} from '../src/standalone-distribution';
import { packageRoot } from './runtime-build-dependencies';

const repoRoot = path.resolve(packageRoot, '../..');
const installerSourceDir = path.join(repoRoot, 'scripts');
const standaloneSupportRoot = path.join('.wp-typia', 'share');

function readFlagValue(argv: string[], flagName: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === flagName) {
      return argv[index + 1];
    }

    if (value?.startsWith(`${flagName}=`)) {
      return value.slice(flagName.length + 1);
    }
  }

  return undefined;
}

async function sha256(filePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);
  return createHash('sha256').update(fileBuffer).digest('hex');
}

function runArchiveCommand(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status === 0) {
    return;
  }

  throw new Error(
		`Failed to create standalone archive with ${command} ${args.join(' ')}${
			result.error ? ` (${result.error.message})` : ''
		}.`,
	);
}

async function copyStandaloneSupportTree(targetDir: string) {
  const supportRoot = path.join(targetDir, standaloneSupportRoot);
  await fs.mkdir(supportRoot, { recursive: true });
  await fs.mkdir(path.join(supportRoot, 'wp-typia'), {
    recursive: true,
  });

  await fs.copyFile(
    path.join(repoRoot, 'packages', 'wp-typia', 'package.json'),
    path.join(supportRoot, 'wp-typia', 'package.json'),
  );
  await fs.mkdir(path.join(supportRoot, 'wp-typia-project-tools'), {
    recursive: true,
  });
  await fs.copyFile(
    path.join(repoRoot, 'packages', 'wp-typia-project-tools', 'package.json'),
    path.join(supportRoot, 'wp-typia-project-tools', 'package.json'),
  );
  await fs.cp(
    path.join(repoRoot, 'packages', 'wp-typia-project-tools', 'templates'),
    path.join(supportRoot, 'wp-typia-project-tools', 'templates'),
    { recursive: true },
  );

  await fs.mkdir(path.join(supportRoot, 'wp-typia-block-runtime'), {
    recursive: true,
  });
  await fs.copyFile(
    path.join(repoRoot, 'packages', 'wp-typia-block-runtime', 'package.json'),
    path.join(supportRoot, 'wp-typia-block-runtime', 'package.json'),
  );

  await fs.cp(
    path.join(repoRoot, 'packages', 'create-workspace-template'),
    path.join(supportRoot, 'create-workspace-template'),
    {
      filter: (entry) => !entry.includes(`${path.sep}node_modules${path.sep}`),
      recursive: true,
    },
  );
}

async function prepareStandaloneReleaseAssets() {
  const argv = process.argv.slice(2);
  const resolvedTargets = parseStandaloneTargets(
    readFlagValue(argv, '--targets') ?? 'all',
  );
  const inputDir = path.resolve(
    packageRoot,
    readFlagValue(argv, '--input-dir') ?? './.cache/standalone/raw',
  );
  const outdir = path.resolve(
    packageRoot,
    readFlagValue(argv, '--outdir') ?? './.cache/standalone/release-assets',
  );
  const releaseTag =
		readFlagValue(argv, '--release-tag') ??
		process.env.GITHUB_REF_NAME ??
		'dev-release';

  await fs.rm(outdir, { force: true, recursive: true });
  await fs.mkdir(outdir, { recursive: true });

  const checksumEntries: Array<[string, string]> = [];
  const manifestLines = [
    `PACKAGE_NAME=${packageJson.name}`,
    `PACKAGE_VERSION=${packageJson.version}`,
    `RELEASE_TAG=${releaseTag}`,
    `SUPPORTED_TARGETS=${resolvedTargets.join(',')}`,
  ];

  for (const standaloneTarget of resolvedTargets) {
    const binaryName = getStandaloneBinaryFilename(
      packageJson.name,
      standaloneTarget,
    );
    const archiveName = getStandaloneArchiveFilename(
      packageJson.name,
      packageJson.version,
      standaloneTarget,
    );
    const sourceBinaryPath = path.join(inputDir, standaloneTarget, binaryName);
    const archivePath = path.join(outdir, archiveName);
    const stagingDir = path.join(outdir, `.staging-${standaloneTarget}`);

    await fs.access(sourceBinaryPath);
    await fs.rm(stagingDir, { force: true, recursive: true });
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.copyFile(sourceBinaryPath, path.join(stagingDir, binaryName));
    await copyStandaloneSupportTree(stagingDir);

    if (archiveName.endsWith('.zip')) {
      runArchiveCommand('zip', ['-q', '-r', archivePath, '.'], stagingDir);
    } else {
      runArchiveCommand('tar', ['-czf', archivePath, '.'], stagingDir);
    }

    const archiveChecksum = await sha256(archivePath);
    checksumEntries.push([archiveName, archiveChecksum]);

    const manifestKey = getStandaloneManifestKey(standaloneTarget);
    manifestLines.push(`ASSET_${manifestKey}=${archiveName}`);
    manifestLines.push(`BINARY_${manifestKey}=${binaryName}`);
    manifestLines.push(`SHA256_${manifestKey}=${archiveChecksum}`);

    await fs.rm(stagingDir, { force: true, recursive: true });
  }

  for (const installerFileName of [
    'install-wp-typia.ps1',
    'install-wp-typia.sh',
  ]) {
    const sourcePath = path.join(installerSourceDir, installerFileName);
    const destinationPath = path.join(outdir, installerFileName);
    await fs.copyFile(sourcePath, destinationPath);
    if (installerFileName.endsWith('.sh')) {
      await fs.chmod(destinationPath, 0o755);
    }
    checksumEntries.push([installerFileName, await sha256(destinationPath)]);
  }

  const manifestPath = path.join(outdir, STANDALONE_MANIFEST_FILENAME);
  await fs.writeFile(manifestPath, `${manifestLines.join('\n')}\n`, 'utf8');
  checksumEntries.push([
    STANDALONE_MANIFEST_FILENAME,
    await sha256(manifestPath),
  ]);

  const checksumPath = path.join(outdir, STANDALONE_CHECKSUMS_FILENAME);
  await fs.writeFile(
		checksumPath,
		`${checksumEntries
			.map(([fileName, checksum]) => `${checksum}  ${fileName}`)
			.join('\n')}\n`,
		'utf8',
	);
}

await prepareStandaloneReleaseAssets();
