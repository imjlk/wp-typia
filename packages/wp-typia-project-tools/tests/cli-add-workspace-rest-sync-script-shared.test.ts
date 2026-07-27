import { expect, test } from 'bun:test';

import {
  buildNoResourcesGuard,
  replaceNoResourcesGuard,
} from '../src/runtime/cli-add-workspace-rest-sync-script-shared.js';

test('sync-rest no-resource guards preserve CRLF output', () => {
  const lineEnding = '\r\n';
  const guard = buildNoResourcesGuard({
    lineEnding,
    subjects: [
      {
        condition: 'restBlocks.length === 0',
        include: true,
        subject: 'REST-enabled workspace blocks',
      },
      {
        condition: 'restResources.length === 0',
        include: true,
        subject: 'plugin-level REST resources',
      },
    ],
  });
  const source = [
    'async function main() {',
    '  if (restBlocks.length === 0) {',
    '    console.log("empty");',
    '    return;',
    '  }',
    '}',
    '',
  ].join(lineEnding);

  const replaced = replaceNoResourcesGuard(
    source,
    guard,
    'testSyncRestGuard',
    'scripts/sync-rest-contracts.ts',
    'REST resources',
  );

  expect(replaced).toContain(
    'restBlocks.length === 0 &&\r\n    restResources.length === 0',
  );
  expect(replaced.replace(/\r\n/gu, '')).not.toContain('\n');
});
