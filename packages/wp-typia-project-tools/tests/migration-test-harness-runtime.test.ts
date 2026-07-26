import { afterAll, expect, test } from 'bun:test';
import path from 'node:path';

import {
  cleanupMigrationTempRoot,
  createMigrationTempRoot,
  createProjectShell,
  typecheckMigrationProject,
  writeFile,
} from './helpers/migration-test-harness-runtime.js';

const tempRoot = createMigrationTempRoot('wp-typia-migration-harness-runtime-');

afterAll(() => {
  cleanupMigrationTempRoot(tempRoot);
});

test(
  'migration ttsc failures preserve diagnostics',
  () => {
    const projectDir = path.join(tempRoot, 'diagnostic-project');
    createProjectShell(projectDir);
    writeFile(
      path.join(projectDir, 'src', 'broken.ts'),
      'export const broken: string = 42;\n',
    );

    let failure: unknown;
    try {
      typecheckMigrationProject(projectDir, {
        checkInputs: ['src/broken.ts'],
        formatInputs: [],
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('TS2322');
    expect((failure as Error).message).toContain('stdout:');
    expect((failure as Error).message).toContain('stderr:');
  },
  { timeout: 120_000 },
);
