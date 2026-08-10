---
npm/@wp-typia/create-workspace-template: minor
npm/@wp-typia/project-tools: minor
npm/wp-typia: minor
---

Changed: replace generated PHP discovery globs and variable includes with
deterministic local manifests containing validated literal `__DIR__` entrypoints
for workspace blocks, bindings, patterns, abilities, admin views, AI features,
post meta, and REST resources. Project sync now creates and checks these
manifests, add workflows refresh them transactionally, and doctor rejects stale,
unsafe, traversing, or symbolic entrypoint paths.
