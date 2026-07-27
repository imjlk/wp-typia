import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const EXAMPLE_DIR = path.join(
  import.meta.dir,
  '../../../examples/my-typia-block',
);
const EXAMPLE_NAME = path.basename(EXAMPLE_DIR);

let exampleVerified = false;

export function getExampleShowcaseDir(): string {
  return EXAMPLE_DIR;
}

export function getExampleShowcaseName(): string {
  return EXAMPLE_NAME;
}

export function getExampleShowcaseBuildArtifactCandidates(
	artifact: string,
): string[] {
  return [
    path.join(EXAMPLE_DIR, 'build', artifact),
    path.join(EXAMPLE_DIR, 'build', EXAMPLE_NAME, artifact),
  ];
}

export function findExampleShowcaseBuildArtifact(artifact: string): string {
  for (const candidate of getExampleShowcaseBuildArtifactCandidates(artifact)) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to locate generated artifact "${artifact}" under ${EXAMPLE_DIR}`,
  );
}

export function getExampleShowcaseFixtureRoot(directoryName: string): string {
  return path.join(EXAMPLE_DIR, directoryName);
}

export function ensureExampleShowcaseSynced(): void {
  if (exampleVerified) {
    return;
  }

  execSync('bun run sync --check', {
    cwd: EXAMPLE_DIR,
    stdio: 'inherit',
  });

  exampleVerified = true;
}
