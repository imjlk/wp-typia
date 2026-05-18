#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const PROFILE_OUTPUT_MAX_BUFFER = 64 * 1024 * 1024;

const SUITES = Object.freeze([
  {
    name: 'repo:test:unit',
    command: 'bun',
    args: ['run', 'test:unit'],
    note: 'Baseline unit coverage without package builds.',
  },
  {
    name: 'repo:test:repo:fast',
    command: 'bun',
    args: ['run', 'test:repo:fast'],
    note: 'No-build source and policy lane for lightweight local feedback.',
  },
  {
    name: 'repo:test:quick',
    command: 'bun',
    args: ['run', 'test:quick'],
    note: 'Fast local loop for unit + lighter package suites.',
  },
  {
    name: 'project-tools:test:quick',
    command: 'bun',
    args: ['run', '--filter', '@wp-typia/project-tools', 'test:quick'],
    note: 'Single-build workspace/compound coverage for local CLI iteration.',
  },
  {
    name: 'project-tools:test:scaffold-core',
    command: 'bun',
    args: ['run', '--filter', '@wp-typia/project-tools', 'test:scaffold-core'],
    note: 'TypeScript build plus metadata-core scaffold and sync coverage.',
  },
  {
    name: 'project-tools:test:migration-planning',
    command: 'bun',
    args: [
      'run',
      '--filter',
      '@wp-typia/project-tools',
      'test:migration-planning',
    ],
    note: 'TypeScript build plus migration planning and temp project setup.',
  },
  {
    name: 'project-tools:test:migration-execution',
    command: 'bun',
    args: [
      'run',
      '--filter',
      '@wp-typia/project-tools',
      'test:migration-execution',
    ],
    note: 'TypeScript build plus migration execution, diffing, and filesystem churn.',
  },
  {
    name: 'wp-typia:test',
    command: 'bun',
    args: ['run', '--filter', 'wp-typia', 'test'],
    note: 'CLI wrapper coverage with downstream project-tools build dependency.',
  },
  {
    name: 'block-runtime:test',
    command: 'bun',
    args: ['run', '--filter', '@wp-typia/block-runtime', 'test'],
    note: 'Metadata-core/runtime package coverage without workspace scaffolds.',
  },
]);

function parseArgs(argv) {
  const selectedSuites = [];
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument === '--suite') {
      const suiteName = argv[index + 1];
      if (!suiteName) {
        throw new Error('--suite requires a suite name.');
      }
      selectedSuites.push(suiteName);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return {
    json,
    selectedSuites,
  };
}

function formatSeconds(durationMs) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function pickSuites(selectedSuites) {
  if (selectedSuites.length === 0) {
    return [...SUITES];
  }

  const suites = selectedSuites.map((suiteName) => {
    const suite = SUITES.find((candidate) => candidate.name === suiteName);
    if (!suite) {
      throw new Error(
        `Unknown suite "${suiteName}". Available suites: ${SUITES.map((candidate) => candidate.name).join(', ')}`,
      );
    }
    return suite;
  });

  return suites;
}

function runSuite(suite) {
  const startedAt = performance.now();
  const result = spawnSync(suite.command, suite.args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
    maxBuffer: PROFILE_OUTPUT_MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const durationMs = performance.now() - startedAt;

  if (result.status !== 0) {
    const errorOutput = [result.stdout, result.stderr]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join('\n');
    throw new Error(
      `${suite.name} failed after ${formatSeconds(durationMs)}.\n${errorOutput}`,
    );
  }

  return {
    durationMs,
    name: suite.name,
    note: suite.note,
  };
}

function printTable(results) {
  console.log(`Profiling test feedback paths from ${repoRoot}`);
  console.log(
    'Slower suites usually correlate with TypeScript builds, temporary project setup, metadata/schema generation, and filesystem churn.',
  );

  const longestName = Math.max(
    ...results.map((result) => result.name.length),
    'Suite'.length,
  );

  console.log(`${'Suite'.padEnd(longestName)}  Duration  Notes`);
  console.log(`${'-'.repeat(longestName)}  --------  -----`);

  for (const result of results) {
    console.log(
      `${result.name.padEnd(longestName)}  ${formatSeconds(result.durationMs).padStart(8)}  ${result.note}`,
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const suites = pickSuites(options.selectedSuites);
  const results = suites
    .map((suite) => runSuite(suite))
    .sort((left, right) => right.durationMs - left.durationMs);

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  printTable(results);
}

try {
  main();
} catch (error) {
  console.error(
    'test:profile failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
