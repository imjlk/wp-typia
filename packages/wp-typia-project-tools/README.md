# `@wp-typia/project-tools`

Programmatic project orchestration package for `wp-typia`.

Package roles:

- `wp-typia` owns the CLI, help, TUI, completions, skills, MCP, and bin entry.
- `@wp-typia/project-tools` owns scaffold, add-block, migrate, template, doctor, and schema project helpers.
  It also owns the typed generator boundary via `BlockSpec`, `BlockGeneratorService`,
  and `inspectBlockGeneration(...)`,
  plus the emitter-owned built-in structural/code path where built-in
  templates no longer ship structural, TS/TSX, style, or block-local `render.php`
  Mustache files.
- `@wp-typia/block-runtime/*` owns generated-project runtime helpers.

Supported public imports:

- `@wp-typia/project-tools`
- `@wp-typia/project-tools/schema-core`
- `@wp-typia/project-tools/ai-artifacts`
- `@wp-typia/project-tools/typia-llm`

Implementation note:

- `@wp-typia/project-tools/schema-core` remains the preferred project-tooling
  import path.
- The shared implementation now lives in `@wp-typia/block-runtime/schema-core`.
- Shared manifest/migration contract types now live in
  `@wp-typia/block-runtime/migration-types`.
- `src/runtime/*.ts` files are stable compatibility facades. The implementation
  lives under focused internal ownership folders: `add/`, `cli/`, `doctor/`,
  `migration/`, `schema/`, `shared/`, `templates/`, and `workspace/`.
- The public `doctor` surface still lives on `@wp-typia/project-tools`, while
  environment and workspace checks now sit behind focused helper modules.
- These splits are maintainability refactors behind stable public facades. Keep
  importing the documented `@wp-typia/project-tools` and
  `@wp-typia/project-tools/schema-core` surfaces rather than the focused helper
  files directly.

Example:

```ts
import {
  BlockGeneratorService,
  getTemplateById,
  parseMigrationArgs,
  projectJsonSchemaDocument,
  resolvePackageManagerId,
} from '@wp-typia/project-tools';
```

```ts
import { normalizeEndpointAuthDefinition } from '@wp-typia/project-tools/schema-core';
```

```ts
import {
  syncWordPressAiArtifacts,
  type AbilitySpecCatalog,
} from '@wp-typia/project-tools/ai-artifacts';
```

```ts
import {
  syncTypiaLlmAdapterModule,
  projectTypiaLlmApplicationArtifact,
} from '@wp-typia/project-tools/typia-llm';
```

`BlockGeneratorService` is the additive typed orchestration boundary for built-in
block scaffolds. Built-in templates no longer ship structural, TS/TSX, style,
or block-local `render.php` Mustache files for built-in `types.ts`,
`block.json`, generated scaffold bodies, or block-local non-TS assets; those
files and starter `typia.manifest.json` now come from the emitter path, while
project bootstrap/package-manager files, sync scripts, shared REST helpers, and
the remaining non-block assets still come from Mustache-backed template copy.

Generated projects now consume JSON artifacts through typed wrapper modules
instead of local casts:

- `block-metadata.ts` for `block.json`
- `manifest-document.ts` for editor and migration consumers of
  `typia.manifest.json`
- `manifest-defaults-document.ts` for validator/defaults consumers of
  `typia.manifest.json`

The higher-level generator architecture record, including the current phase map
and the non-mutating `plan -> validate -> render -> apply` tool-facing usage
model, lives in
[`docs/block-generator-architecture.md`](https://imjlk.github.io/wp-typia/architecture/block-generator-architecture/).
The public non-mutating controller/tool contract now lives in
[`docs/block-generator-tool-contract.md`](https://imjlk.github.io/wp-typia/architecture/block-generator-tool-contract/).

Reusable external layer packages on top of the built-in shared scaffold model
are now available through the canonical built-in CLI flags
`wp-typia create --external-layer-source ... [--external-layer-id ...]`,
`wp-typia add block --external-layer-source ... [--external-layer-id ...]`,
and programmatically through `scaffoldProject(...)`, `BlockGeneratorService`,
and `inspectBlockGeneration(...)`. The layer contract record lives in
[`docs/external-template-layer-composition.md`](https://imjlk.github.io/wp-typia/architecture/external-template-layer-composition/).

If you need metadata sync, editor helpers, validation helpers, or other generated-project runtime utilities, import them directly from `@wp-typia/block-runtime/*`.

`@wp-typia/project-tools/typia-llm` is an opt-in build-time adapter target for
downstream TypeScript-first tool/function consumers. It renders the generated
`typia.llm` TypeScript module from endpoint manifests and canonical contract
types, and exposes JSON-friendly projection helpers for compiled
`typia.llm.application(...)` and `typia.llm.structuredOutput(...)` results. It
does not add a generated-project runtime dependency on `typia.llm`.
