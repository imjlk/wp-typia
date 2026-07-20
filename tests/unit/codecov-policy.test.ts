import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '..', '..');

interface CodecovPolicy {
  coverage?: {
    status?: {
      project?: {
        default?: {
          informational?: boolean;
        };
      };
      patch?: {
        default?: {
          informational?: boolean;
          only_pulls?: boolean;
          target?: string;
        };
      };
    };
  };
  comment?: {
    behavior?: string;
    layout?: string;
    require_changes?: boolean;
  };
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

describe('Codecov policy', () => {
  test('keeps changed-line coverage informational and pull-request only', () => {
    const policy = Bun.YAML.parse(
      fs.readFileSync(path.join(repoRoot, 'codecov.yml'), 'utf8'),
    ) as CodecovPolicy;

    expect(policy.coverage?.status?.project?.default).toEqual({
      informational: true,
    });
    expect(policy.coverage?.status?.patch?.default).toEqual({
      informational: true,
      only_pulls: true,
      target: '80%',
    });
    expect(policy.comment).toEqual({
      behavior: 'default',
      layout: 'diff, flags, files',
      require_changes: true,
    });
    expect(JSON.stringify(policy)).not.toContain('after_n_builds');
  });

  test('uploads DataViews coverage without widening Project Tools coverage', () => {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'ci.yml'),
      'utf8',
    );
    const testCore = getWorkflowJobBlock(workflow, 'test-core');
    const projectToolsCoverage = getWorkflowJobBlock(
      workflow,
      'test-project-tools-coverage',
    );

    expect(testCore).toContain(
      './packages/wp-typia-dataviews/coverage/lcov.info',
    );
    expect(projectToolsCoverage).toContain(
      "if: github.event_name == 'push'",
    );
    expect(projectToolsCoverage).not.toContain('pull_request');
  });
});
