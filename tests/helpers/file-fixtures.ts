import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createTempDir(prefix: string, baseDir = os.tmpdir()): string {
  fs.mkdirSync(baseDir, { recursive: true });
  return fs.mkdtempSync(path.join(baseDir, prefix));
}

export function writeTextFile(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

export function writeJsonFile(
	filePath: string,
	value: unknown,
	indentation: number | string = 2,
): void {
  writeTextFile(filePath, `${JSON.stringify(value, null, indentation)}\n`);
}

export function writeFixtureFiles(
	rootDir: string,
	files: Record<string, string>,
): string {
  for (const [relativePath, content] of Object.entries(files)) {
    writeTextFile(path.join(rootDir, relativePath), content);
  }

  return rootDir;
}

export function createTempFixture(
	files: Record<string, string>,
	{
		baseDir,
		prefix = 'fixture-',
	}: {
		baseDir?: string;
		prefix?: string;
	} = {},
): string {
  const fixtureDir = createTempDir(prefix, baseDir);
  return writeFixtureFiles(fixtureDir, files);
}

export function hasPhpBinary(): boolean {
  try {
    execFileSync('php', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
