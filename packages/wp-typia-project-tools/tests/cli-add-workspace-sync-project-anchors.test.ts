import { afterEach, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ensureAbilitySyncProjectAnchors } from '../src/runtime/cli-add-workspace-ability-anchors.js';
import { ensureAiFeatureSyncProjectAnchors } from '../src/runtime/cli-add-workspace-ai-anchors.js';
import type { WorkspaceProject } from '../src/runtime/workspace-project.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
  tempDirs.length = 0;
});

function createWorkspace(): WorkspaceProject {
  const projectDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-sync-project-anchors-'),
  );
  tempDirs.push(projectDir);
  fs.mkdirSync(path.join(projectDir, 'scripts'), { recursive: true });

  return {
    author: 'Test Runner',
    packageManager: 'npm',
    packageName: 'demo-space',
    projectDir,
    workspace: {
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      projectType: 'workspace',
      templatePackage: '@wp-typia/create-workspace-template',
      textDomain: 'demo-space',
    },
  };
}

test('sync-project anchors ignore comments and preserve CRLF, quotes, and tabs', async () => {
  const workspace = createWorkspace();
  const syncProjectPath = path.join(
    workspace.projectDir,
    'scripts',
    'sync-project.ts',
  );
  fs.writeFileSync(
    syncProjectPath,
    [
      'const syncRestScriptPath = path.join("scripts", "sync-rest-contracts.ts");',
      '// const syncAbilitiesScriptPath = path.join("scripts", "sync-abilities.ts");',
      '// const syncAiScriptPath = path.join("scripts", "sync-ai-features.ts");',
      'const abilityCallExample = "runSyncScript(syncAbilitiesScriptPath, options);";',
      'const aiCallExample = "runSyncScript(syncAiScriptPath, options);";',
      '',
      'async function main() {',
      '\tif (fs.existsSync(path.resolve(process.cwd(), syncRestScriptPath))) {',
      '\t\trunSyncScript(syncRestScriptPath, options);',
      '\t}',
      '}',
      '',
    ].join('\r\n'),
    'utf8',
  );

  await ensureAbilitySyncProjectAnchors(workspace);
  await ensureAbilitySyncProjectAnchors(workspace);
  await ensureAiFeatureSyncProjectAnchors(workspace);
  await ensureAiFeatureSyncProjectAnchors(workspace);

  const source = fs.readFileSync(syncProjectPath, 'utf8');
  expect(
    source.match(/^const syncAbilitiesScriptPath\b/gmu)?.length,
  ).toBe(1);
  expect(source.match(/^const syncAiScriptPath\b/gmu)?.length).toBe(1);
  expect(source).toContain(
    'const syncAbilitiesScriptPath = path.join("scripts", "sync-abilities.ts");',
  );
  expect(source).toContain(
    'const syncAiScriptPath = path.join("scripts", "sync-ai-features.ts");',
  );
  expect(
    source.match(
      /^\t\trunSyncScript\(syncAbilitiesScriptPath, options\);\r?$/gmu,
    )?.length,
  ).toBe(1);
  expect(
    source.match(
      /^\t\trunSyncScript\(syncAiScriptPath, options\);\r?$/gmu,
    )?.length,
  ).toBe(1);
  expect(source).not.toContain('\t  runSyncScript');
  expect(source.replace(/\r\n/gu, '')).not.toContain('\n');
});
