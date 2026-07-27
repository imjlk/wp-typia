import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createCiPhaseTimer,
  formatCiPhaseDuration,
} from '../../scripts/lib/ci-phase-timing.mjs';

const repoRoot = path.resolve(import.meta.dir, '..', '..');
const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

describe('CI phase timing', () => {
  test('records successful and failed synchronous phases', () => {
    const timestamps = [100, 350, 400, 900];
    const output: string[] = [];
    const timer = createCiPhaseTimer({
      now: () => timestamps.shift() ?? 900,
      output: { write: (message: string) => output.push(message) },
      summaryPath: '',
      title: 'Generated smoke',
    });

    expect(timer.measureSync('install', () => 'installed')).toBe('installed');
    expect(() =>
      timer.measureSync('build', () => {
        throw new Error('build failed');
      }),
    ).toThrow('build failed');

    expect(timer.phases).toEqual([
      { durationMs: 250, name: 'install', outcome: 'passed' },
      { durationMs: 500, name: 'build', outcome: 'failed' },
    ]);
    expect(output.join('')).toContain(
      '[ci-timing] Generated smoke / install: 0.25s (passed)',
    );
    expect(output.join('')).toContain(
      '[ci-timing] Generated smoke / build: 0.50s (failed)',
    );
  });

  test('writes an idempotent GitHub step summary', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-phase-timing-'));
    tempDirs.push(tempDir);
    const summaryPath = path.join(tempDir, 'summary.md');
    const timestamps = [0, 1234];
    const timer = createCiPhaseTimer({
      now: () => timestamps.shift() ?? 1234,
      output: { write: () => true },
      summaryPath,
      title: 'Generated | smoke',
    });

    timer.measureSync('install | dependencies', () => undefined);
    timer.flush();
    timer.flush();

    const summary = fs.readFileSync(summaryPath, 'utf8');
    expect(summary).toContain('### Generated \\| smoke phase timings');
    expect(summary).toContain(
      '| install \\| dependencies | 1.23s | passed |',
    );
    expect(summary.match(/phase timings/g)).toHaveLength(1);
  });

  test('keeps timing output best-effort', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-phase-timing-'));
    tempDirs.push(tempDir);
    const output: string[] = [];
    const timer = createCiPhaseTimer({
      now: () => 0,
      output: { write: (message: string) => output.push(message) },
      summaryPath: tempDir,
      title: 'Generated smoke',
    });

    expect(timer.measureSync('build', () => 'built')).toBe('built');
    expect(() => timer.flush()).not.toThrow();
    expect(output.join('')).toContain(
      '[ci-timing] Warning: failed to write phase summary',
    );

    const timerWithBrokenOutput = createCiPhaseTimer({
      now: () => 0,
      output: {
        write: () => {
          throw new Error('closed output');
        },
      },
      summaryPath: '',
      title: 'Generated smoke',
    });
    expect(timerWithBrokenOutput.measureSync('build', () => 'built')).toBe(
      'built',
    );
  });

  test('formats durations consistently', () => {
    expect(formatCiPhaseDuration(0)).toBe('0.00s');
    expect(formatCiPhaseDuration(12_345)).toBe('12.35s');
  });

  test('keeps long smoke lanes instrumented by phase', () => {
    const generatedSmoke = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'run-generated-project-smoke.mjs'),
      'utf8',
    );
    const publishInstallSmoke = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'run-publish-install-smoke.mjs'),
      'utf8',
    );
    const expectMeasuredPhase = (source: string, phase: string) => {
      expect(
        source.includes(`measureSync('${phase}'`) ||
          source.includes(`measureSync("${phase}"`),
      ).toBe(true);
    };

    for (const phase of [
      'install project dependencies',
      'synchronize generated artifacts',
      'build project',
      'lint project',
      'check project formatting',
    ]) {
      expectMeasuredPhase(generatedSmoke, phase);
    }
    for (const phase of [
      'build workspace packages',
      'pack publishable workspaces',
      'install default CLI package',
      'install packed workspace consumer',
      'install and typecheck basic scaffold',
      'install and typecheck admin-view scaffold',
      'install and typecheck compound scaffold',
    ]) {
      expectMeasuredPhase(publishInstallSmoke, phase);
    }
  });
});
