import { execFile, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { packageRoot } from './scaffold-test-paths.js';
import { runCli } from './scaffold-test-runtime.js';
import { linkWorkspaceNodeModules } from './scaffold-test-workspace.js';

const TTSC_TEST_CACHE_DIR = path.resolve(
  packageRoot,
  '..',
  '..',
  'node_modules',
  '.cache',
  'ttsc',
);

function getTtscTestEnv() {
  return {
    TTSC_CACHE_DIR: process.env.TTSC_CACHE_DIR ?? TTSC_TEST_CACHE_DIR,
  };
}

export function runGeneratedScript(
	targetDir: string,
	scriptRelativePath: string,
	args: string[] = [],
) {
  linkWorkspaceNodeModules(targetDir);
  return runCli('bun', [path.join(targetDir, scriptRelativePath), ...args], {
    cwd: targetDir,
    env: getTtscTestEnv(),
  });
}

export async function runGeneratedScriptAsync(
	targetDir: string,
	scriptRelativePath: string,
	args: string[] = [],
) {
  linkWorkspaceNodeModules(targetDir);
  const execFileAsync = promisify(execFile);
  const result = await execFileAsync(
    'bun',
    [path.join(targetDir, scriptRelativePath), ...args],
    {
      cwd: targetDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...getTtscTestEnv(),
      },
    },
  );

  return result.stdout;
}

export function typecheckGeneratedProject(targetDir: string) {
  linkWorkspaceNodeModules(targetDir);
  return runCli(
    path.join(targetDir, 'node_modules', '.bin', 'ttsc'),
    ['--noEmit'],
    {
      cwd: targetDir,
      env: getTtscTestEnv(),
    },
  );
}

export function buildGeneratedProject(targetDir: string) {
  linkWorkspaceNodeModules(targetDir);
  const result = spawnSync(
    path.join(targetDir, 'node_modules', '.bin', 'wp-scripts'),
    ['build', '--experimental-modules'],
    {
      cwd: targetDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...getTtscTestEnv(),
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

  if (result.error) {
    const error = new Error(
      output || `Generated project build failed to start for ${targetDir}.`,
      { cause: result.error },
    );
    Object.assign(error, {
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    });
    throw error;
  }
  if (result.status !== 0) {
    const error = new Error(output || 'Generated project build failed.');
    Object.assign(error, {
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    });
    throw error;
  }

  return output;
}

export function replaceGeneratedTransportBaseUrls(
	transportPath: string,
	baseUrl: string,
) {
  let source = fs.readFileSync(transportPath, 'utf8');
  const names = [
    'EDITOR_READ_BASE_URL',
    'EDITOR_WRITE_BASE_URL',
    'FRONTEND_READ_BASE_URL',
    'FRONTEND_WRITE_BASE_URL',
  ] as const;

  for (const name of names) {
    const previousSource = source;
    source = source.replace(
      new RegExp(`const ${name} = '';`, 'u'),
      `const ${name} = ${JSON.stringify(baseUrl)};`,
    );
    if (source === previousSource) {
      throw new Error(`Unable to rewrite ${name} inside ${transportPath}.`);
    }
  }

  fs.writeFileSync(transportPath, source);
}

export function runGeneratedJsonScript(
	targetDir: string,
	scriptName: string,
	scriptSource: string,
) {
  const scriptPath = path.join(targetDir, scriptName);
  fs.writeFileSync(scriptPath, scriptSource);

  try {
    return JSON.parse(runGeneratedScript(targetDir, scriptName));
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

export async function runGeneratedJsonScriptAsync(
	targetDir: string,
	scriptName: string,
	scriptSource: string,
) {
  const scriptPath = path.join(targetDir, scriptName);
  fs.writeFileSync(scriptPath, scriptSource);

  try {
    return JSON.parse(await runGeneratedScriptAsync(targetDir, scriptName));
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}
