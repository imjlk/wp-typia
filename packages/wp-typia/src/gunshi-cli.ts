import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import completion from '@gunshi/plugin-completion';
import { cli, define } from 'gunshi';

import packageJson from '../package.json';
import { WP_TYPIA_COMMAND_REGISTRY } from './command-registry';
import { handleNodeFallbackEntrypointError } from './node-fallback/errors';
import { runNodeCli } from './node-cli';

const PROJECT_TOOLS_PACKAGE_ROOT_ENV = 'WP_TYPIA_PROJECT_TOOLS_PACKAGE_ROOT';

function applyStandaloneSupportRoot(): void {
  if (process.env[PROJECT_TOOLS_PACKAGE_ROOT_ENV]?.trim()) {
    return;
  }

  const supportRoot = path.join(
    path.dirname(process.execPath),
    '.wp-typia',
    'share',
    'wp-typia-project-tools',
  );
  const supportManifest = path.join(supportRoot, 'package.json');
  if (fs.existsSync(supportManifest)) {
    process.env[PROJECT_TOOLS_PACKAGE_ROOT_ENV] = supportRoot;
  }
}

const wpTypiaGunshiCommand = define({
  description: packageJson.description,
  name: 'wp-typia',
  run: async (context) => {
    await runNodeCli(context._);
  },
});

function hasFlagBeforeTerminator(argv: string[], flag: string): boolean {
  for (const arg of argv) {
    if (arg === '--') {
      return false;
    }
    if (arg === flag) {
      return true;
    }
  }
  return false;
}

type RuntimeVersions = {
  bun?: string | undefined;
};

export function shouldUseGunshiCompletion(
  argv: string[],
  versions: RuntimeVersions = process.versions,
): boolean {
  const [command] = argv;
  return (
    typeof versions.bun !== 'string' &&
    command === 'complete' &&
    !hasFlagBeforeTerminator(argv, '--help') &&
    !hasFlagBeforeTerminator(argv, '-h') &&
    !hasFlagBeforeTerminator(argv, '--version') &&
    !hasFlagBeforeTerminator(argv, '-v')
  );
}

function completionEntries() {
  return WP_TYPIA_COMMAND_REGISTRY.map((command) => ({
    description: 'description' in command ? command.description : command.name,
    value: command.name,
  }));
}

function normalizeFallbackShortAliases(argv: string[]): string[] {
  let terminated = false;
  return argv.map((arg) => {
    if (terminated) {
      return arg;
    }
    if (arg === '--') {
      terminated = true;
      return arg;
    }
    if (arg === '-h') {
      return '--help';
    }
    if (arg === '-v') {
      return '--version';
    }
    return arg;
  });
}

export async function runGunshiCli(
  argv = process.argv.slice(2),
): Promise<void> {
  applyStandaloneSupportRoot();

  if (!shouldUseGunshiCompletion(argv)) {
    await runNodeCli(normalizeFallbackShortAliases(argv));
    return;
  }

  await cli(argv, wpTypiaGunshiCommand, {
    fallbackToEntry: true,
    name: 'wp-typia',
    plugins: [
      completion({
        config: {
          entry: {
            handler: completionEntries,
          },
        },
      }),
    ],
    usageSilent: true,
    version: packageJson.version,
  });
}

export async function runGunshiCliEntrypoint(
  argv = process.argv.slice(2),
): Promise<void> {
  try {
    await runGunshiCli(argv);
  } catch (error) {
    await handleNodeFallbackEntrypointError(error, argv);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void runGunshiCliEntrypoint();
}
