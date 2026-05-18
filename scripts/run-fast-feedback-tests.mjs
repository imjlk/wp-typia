#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const FAST_TEST_PATHS = Object.freeze([
  'tests/unit/repo-dx-baseline.test.ts',
  'tests/unit/sampo-changesets.test.ts',
  'tests/unit/package-managers.test.ts',
  'tests/unit/package-versions.test.ts',
  'tests/unit/package-manifest-policy.test.ts',
  'tests/unit/formatting-toolchain-policy.test.ts',
  'tests/unit/maintenance-automation-policy.test.ts',
  'tests/unit/typescript-runtime-dependency-placement.test.ts',
  'tests/unit/typescript-strictness-policy.test.ts',
  'tests/unit/runtime-package-coupling.test.ts',
  'tests/unit/generated-project-smoke-reference-lane.test.ts',
  'tests/unit/wp-scripts-lint-js-compat.test.ts',
  'tests/unit/gutenberg-upstream-watch.test.ts',
  'tests/unit/local-dev-presets.test.ts',
  'tests/unit/scaffold-onboarding.test.ts',
  'tests/unit/template-registry.test.ts',
  'tests/unit/runtime-utils.test.ts',
  'tests/unit/schema-core.test.ts',
  'tests/unit/metadata-projection.test.ts',
  'tests/unit/json-artifact-validation.test.ts',
  'tests/unit/metadata-php-render.test.ts',
  'tests/unit/rest-adapter-conformance.test.ts',
  'tests/unit/validation-runtime.test.ts',
  'tests/unit/blocks-runtime.test.ts',
  'tests/unit/editor-runtime.test.ts',
  'tests/unit/inspector-runtime.test.tsx',
  'tests/unit/starter-manifests.test.ts',
  'tests/unit/error-export-contracts.test.ts',
  'tests/unit/typia-llm-helper.test.ts',
  'tests/unit/wordpress-ai-helper.test.ts',
  'tests/unit/wordpress-ai-projections.test.ts',
  'tests/unit/typia-llm-evaluation.test.ts',
  'tests/unit/block-attributes.contract.test.ts',
  'tests/unit/api-contract-adapter-poc.test.ts',
  'tests/unit/my-typia-block-reference-app.test.tsx',
  'packages/wp-typia-api-client/tests',
  'packages/wp-typia-dataviews/tests/data-form.test.ts',
  'packages/wp-typia-dataviews/tests/define-data-views.test.ts',
  'packages/wp-typia-dataviews/tests/package-contracts.test.ts',
  'packages/wp-typia-dataviews/tests/query-adapter.test.ts',
  'packages/wp-typia-rest/tests/rest.test.ts',
  'packages/wp-typia-rest/tests/resource.test.ts',
  'packages/wp-typia-rest/tests/runtime-primitives.test.ts',
  'packages/wp-typia-block-types/tests/shared-helpers.test.ts',
  'packages/wp-typia-block-types/tests/supports.test.ts',
  'packages/wp-typia-block-types/tests/bindings.test.ts',
  'packages/wp-typia-block-types/tests/compatibility.test.ts',
  'packages/wp-typia-block-types/tests/variations.test.ts',
]);

const HEAVY_TEST_LANE_HINTS = Object.freeze([
  'tests/unit/sync-types.test.ts',
  'tests/unit/sync-types-reporting.test.ts',
  'tests/unit/metadata-core.test.ts',
  'tests/unit/metadata-parser.test.ts',
  'tests/unit/migration.test.ts',
  'tests/unit/validators.test.ts',
  'packages/wp-typia-dataviews/tests/type-contracts.test.ts',
  'packages/wp-typia-rest/tests/package-contracts.test.ts',
  'packages/wp-typia-block-types/tests/package-contracts.test.ts',
  'packages/wp-typia-block-types/tests/type-contracts.test.ts',
]);

const extraBunTestArgs = process.argv.slice(2);

const result = spawnSync(
  'bun',
  ['test', ...FAST_TEST_PATHS, ...extraBunTestArgs],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      WP_TYPIA_FAST_TEST_LANE: '1',
    },
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error('test:repo:fast failed to start:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  if (result.signal) {
    console.error(`test:repo:fast stopped by signal ${result.signal}.`);
  }
  console.error(
    `Broader build, generated artifact, and package-contract coverage remains in test:quick/test:repo/build: ${HEAVY_TEST_LANE_HINTS.join(', ')}`,
  );
  process.exit(result.status ?? 1);
}
