import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

function escapeMarkdownCell(value) {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function formatCiPhaseDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(2)}s`;
}

export function createCiPhaseTimer({
  now = () => performance.now(),
  output = process.stdout,
  summaryPath = process.env.GITHUB_STEP_SUMMARY,
  title,
}) {
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('CI phase timer title must be a non-empty string.');
  }

  const phases = [];
  let flushed = false;

  function writeOutput(message) {
    try {
      output.write(message);
    } catch {
      // Timing diagnostics must never change the result of the measured work.
    }
  }

  function measureSync(name, callback) {
    const startedAt = now();
    let outcome = 'passed';
    try {
      return callback();
    } catch (error) {
      outcome = 'failed';
      throw error;
    } finally {
      const durationMs = Math.max(0, now() - startedAt);
      phases.push({ durationMs, name, outcome });
      writeOutput(
        `[ci-timing] ${title} / ${name}: ${formatCiPhaseDuration(durationMs)} (${outcome})\n`,
      );
    }
  }

  function flush() {
    if (flushed) {
      return;
    }
    flushed = true;

    if (!summaryPath || phases.length === 0) {
      return;
    }

    try {
      fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
      const rows = phases
        .map(
          ({ durationMs, name, outcome }) =>
            `| ${escapeMarkdownCell(name)} | ${formatCiPhaseDuration(durationMs)} | ${outcome} |`,
        )
        .join('\n');
      fs.appendFileSync(
        summaryPath,
        [
          `### ${escapeMarkdownCell(title)} phase timings`,
          '',
          '| Phase | Duration | Result |',
          '| --- | ---: | --- |',
          rows,
          '',
        ].join('\n'),
        'utf8',
      );
    } catch (error) {
      writeOutput(
        `[ci-timing] Warning: failed to write phase summary for ${title}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  return {
    flush,
    measureSync,
    phases,
  };
}
