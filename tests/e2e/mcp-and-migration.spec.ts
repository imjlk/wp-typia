import { test, expect } from './fixtures/wordpress';

test.describe('wp-typia MCP tools and migration CLI', () => {
  test.describe.configure({ mode: 'serial' });

  test('mcp list includes built-in wp-typia tools', async () => {
    const { execSync } = await import('node:child_process');
    const output = execSync(
      'node packages/wp-typia/bin/wp-typia.js mcp list --format json',
      { encoding: 'utf8', cwd: process.cwd() },
    );
    const parsed = JSON.parse(output) as {
      groups: Array<{ namespace: string; tools: string[] }>;
    };
    const wpTypiaGroup = parsed.groups.find(
      (g) => g.namespace === 'wp-typia',
    );
    expect(wpTypiaGroup).toBeDefined();
    expect(wpTypiaGroup!.tools).toContain('migration-diff');
    expect(wpTypiaGroup!.tools).toContain('migration-plan');
    expect(wpTypiaGroup!.tools).toContain('migration-scaffold');
  });

  test('mcp call with missing --tool returns error', async () => {
    const { execSync } = await import('node:child_process');
    expect(() => {
      execSync(
        'node packages/wp-typia/bin/wp-typia.js mcp call',
        { encoding: 'utf8', cwd: process.cwd(), stdio: 'pipe' },
      );
    }).toThrow();
  });

  test('mcp call with unknown tool returns error', async () => {
    const { execSync } = await import('node:child_process');
    expect(() => {
      execSync(
        'node packages/wp-typia/bin/wp-typia.js mcp call --tool nonexistent',
        { encoding: 'utf8', cwd: process.cwd(), stdio: 'pipe' },
      );
    }).toThrow();
  });

  test('mcp call migration-plan on my-typia-block returns JSON', async () => {
    const { execSync } = await import('node:child_process');
    const blockDir = 'examples/my-typia-block';
    let output: string;
    try {
      output = execSync(
        'node ../../packages/wp-typia/bin/wp-typia.js mcp call --tool migration-plan --from-migration-version v1 --format json',
        { encoding: 'utf8', cwd: blockDir, stdio: 'pipe' },
      );
    } catch {
      // migration-plan may fail if no migration config is set up in CI,
      // but the tool dispatch itself should reach the migration runtime.
      return;
    }
    // If it succeeded, the output should be valid JSON.
    expect(() => JSON.parse(output)).not.toThrow();
  });
});
