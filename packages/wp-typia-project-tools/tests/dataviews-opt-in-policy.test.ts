import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

const repoRoot = resolve(import.meta.dir, '../../..');
const templateRoot = resolve(
  repoRoot,
  'packages/wp-typia-project-tools/templates',
);
const workspaceTemplateRoot = resolve(
  repoRoot,
  'packages/create-workspace-template',
);

function collectPackageTemplatePaths(root: string): string[] {
  const result: string[] = [];

  function visit(currentDir: string) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (entry.name === 'package.json.mustache') {
        result.push(entryPath);
      }
    }
  }

  visit(root);
  return result.sort();
}

describe('DataViews opt-in scaffold policy', () => {
  test('built-in create and add package templates do not add DataViews dependencies', () => {
    const packageTemplatePaths = [
      ...collectPackageTemplatePaths(templateRoot),
      ...collectPackageTemplatePaths(workspaceTemplateRoot),
    ];

    expect(packageTemplatePaths.length).toBeGreaterThan(0);

    for (const packageTemplatePath of packageTemplatePaths) {
      const source = readFileSync(packageTemplatePath, 'utf8');

      expect(source, packageTemplatePath).not.toContain('@wp-typia/dataviews');
      expect(source, packageTemplatePath).not.toContain('@wordpress/dataviews');
    }
  });
});
