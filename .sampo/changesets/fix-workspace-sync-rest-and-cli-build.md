---
npm/@wp-typia/block-types: patch
npm/@wp-typia/project-tools: patch
npm/wp-typia: patch
---

Fix 123 workspace test failures caused by two issues in the `wp-typia add` command chain.

The block-config import patterns in `cli-add-workspace-rest-sync-script-shared.ts` and `cli-add-workspace-ai-sync-rest-anchors.ts` previously used `(?:[^\r\n]*\r?\n)+` for the import member lines, which greedily backtracked across multiple import statements — swallowing the `import * as workspaceConfig from './block-config';` namespace import between the block-runtime and block-config named imports, so generated `sync-rest-contracts.ts` scripts failed with `workspaceConfig is not defined`. The patterns now require each member line to start with indentation followed by a non-whitespace character (`(?:[ \t]+[^\s][^\r\n]*\r?\n)+`), which both prevents the cross-import backtracking and keeps the pattern ReDoS-safe.

The `wp-typia` CLI build used `packages: 'external'`, keeping all npm dependencies external. Since Bun's lockfile stores them in `node_modules/.bun/node_modules/` rather than the root `node_modules/`, spawned Node.js subprocesses could not resolve `mustache` (used by project-tools templates at runtime). The build now bundles npm dependencies (`mustache`, `gunshi`, `zod`, `@gunshi/plugin-completion`) and externalizes only the `@wp-typia/*` workspace packages. The `BlockConfiguration` type now omits `name` alongside `attributes` and `example`, fixing TS1360 errors in type contract tests after the `@wordpress/blocks` 15.27 upgrade made the property required.
