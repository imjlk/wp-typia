import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  findMissingProjectToolsPrebuiltFiles,
  PROJECT_TOOLS_PREBUILT_FILES,
  validateProjectToolsPrebuilt,
} from '../../scripts/validate-project-tools-prebuilt';

describe('Project Tools prebuilt workspace validation', () => {
  const testRoots: string[] = [];

  afterEach(() => {
    for (const testRoot of testRoots.splice(0)) {
      fs.rmSync(testRoot, { force: true, recursive: true });
    }
  });

  function createTestRoot(): string {
    const testRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-prebuilt-validation-'),
    );
    testRoots.push(testRoot);
    return testRoot;
  }

  test('reports every required sentinel from an empty workspace', () => {
    const testRoot = createTestRoot();

    expect(findMissingProjectToolsPrebuiltFiles(testRoot)).toEqual([
      ...PROJECT_TOOLS_PREBUILT_FILES,
    ]);
    expect(() => validateProjectToolsPrebuilt(testRoot)).toThrow(
      'Project Tools prebuilt workspace is incomplete',
    );
    expect(() => validateProjectToolsPrebuilt(testRoot)).toThrow(
      'bun run project-tools-prebuilt:prepare',
    );
  });

  test('accepts a workspace containing every regular-file sentinel', () => {
    const testRoot = createTestRoot();
    for (const relativePath of PROJECT_TOOLS_PREBUILT_FILES) {
      const filePath = path.join(testRoot, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, 'export {};\n');
    }

    expect(findMissingProjectToolsPrebuiltFiles(testRoot)).toEqual([]);
    expect(() => validateProjectToolsPrebuilt(testRoot)).not.toThrow();
  });

  test('rejects directories that merely occupy a sentinel path', () => {
    const testRoot = createTestRoot();
    for (const relativePath of PROJECT_TOOLS_PREBUILT_FILES) {
      const filePath = path.join(testRoot, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, 'export {};\n');
    }
    const missingPath = PROJECT_TOOLS_PREBUILT_FILES[0];
    const missingFile = path.join(testRoot, missingPath);
    fs.rmSync(missingFile);
    fs.mkdirSync(missingFile);

    expect(findMissingProjectToolsPrebuiltFiles(testRoot)).toEqual([
      missingPath,
    ]);
    expect(() => validateProjectToolsPrebuilt(testRoot)).toThrow(missingPath);
  });

  test('reports sentinels below a non-directory path as missing', () => {
    const testRoot = createTestRoot();
    fs.writeFileSync(path.join(testRoot, 'packages'), 'not a directory\n');

    expect(findMissingProjectToolsPrebuiltFiles(testRoot)).toEqual([
      ...PROJECT_TOOLS_PREBUILT_FILES,
    ]);
  });
});
