---
title: 'Compound Block Tutorial: Scaffolding Parent/Child `InnerBlocks` Patterns with `wp-typia`'
---

This tutorial walks through the `compound` built-in template. It is the starting point for blocks that need one user-facing parent block plus hidden implementation child blocks managed through `InnerBlocks`.

## Prerequisites

- Node.js 24+ installed
- WordPress development environment (wp-env or local server)
- Familiarity with the [Basic Block Tutorial](./basic-block-tutorial.md)

## What is the Compound Template?

The `compound` template scaffolds:

- a top-level parent block
- a hidden child block constrained by `parent`
- a multi-block plugin layout under `src/blocks/*`
- `InnerBlocks` wiring with two default child items

By default it is a pure static compound block. If you also pass `--data-storage` or `--persistence-policy`, the parent block gains the same count-like persistence wiring used by the `persistence` template.

## Step 1: Create a Compound Block

Pure compound scaffold:

```bash
npx wp-typia compound-demo --template compound --package-manager npm --yes --no-install
cd compound-demo
npm install
```

Compound scaffold with parent-only persistence:

```bash
npx wp-typia compound-demo \
  --template compound \
  --persistence-policy authenticated \
  --package-manager npm \
  --yes \
  --no-install
```

The same opt-in local presets are available here too:

- `--with-wp-env` for project-local `wp-env` scripts
- `--with-test-preset` for a test-only `wp-env` config and minimal Playwright smoke test

## Step 2: Understand the Generated Structure

The compound template creates a multi-block plugin layout instead of a single `src/` block root:

```text
compound-demo/
├── src/
│   └── blocks/
│       ├── compound-demo/
│       │   ├── block.json
│       │   ├── children.ts
│       │   ├── edit.tsx
│       │   ├── hooks.ts
│       │   ├── index.tsx
│       │   ├── save.tsx
│       │   ├── style.scss
│       │   ├── types.ts
│       │   └── validators.ts
│       └── compound-demo-item/
│           ├── block.json
│           ├── edit.tsx
│           ├── hooks.ts
│           ├── index.tsx
│           ├── save.tsx
│           ├── types.ts
│           └── validators.ts
├── scripts/
│   ├── add-compound-child.ts
│   ├── block-config.ts
│   ├── sync-project.ts
│   └── sync-types-to-block-json.ts
├── compound-demo.php
├── package.json
└── webpack.config.js
```

Fresh scaffolds already include starter `typia.manifest.json` files in the parent and default child block directories so editor/runtime imports resolve before the first sync. After you run `npm run sync`, `npm run dev`, or `npm run start`, each block directory also gains:

- `typia.manifest.json`
- `typia.schema.json`
- `typia.openapi.json`
- `typia-validator.php`

If persistence is enabled for the parent block, it additionally gains:

- `api.openapi.json`
- `api-types.ts`
- `api-validators.ts`
- `api.ts`
- `interactivity.ts`
- `render.php`
- `api-schemas/*.schema.json`
- `api-schemas/*.openapi.json`

In persistence-enabled compound scaffolds, `src/blocks/<parent>/api.openapi.json` is the canonical REST surface document for the parent block. The `api-schemas/*.schema.json` files remain the runtime contract artifacts, and `api-schemas/*.openapi.json` files remain per-contract compatibility fragments.

## Step 3: Parent and Child Roles

The parent block is the only block users insert directly.

- block name: `create-block/compound-demo`
- editor UI: heading, intro text, and an `InnerBlocks` area
- save behavior: stores the composed child markup

The child block is an internal implementation detail.

- block name: `create-block/compound-demo-item`
- `supports.inserter: false`
- `parent: ['create-block/compound-demo']`
- minimal title/body editing UI

## Step 4: How the Parent Tracks Child Blocks

The parent block now keeps its scaffold-owned child registry in `src/blocks/<parent>/children.ts`:

```tsx
export const DEFAULT_CHILD_BLOCK_NAME = 'create-block/compound-demo-item';

export const ALLOWED_CHILD_BLOCKS = [DEFAULT_CHILD_BLOCK_NAME];

export const DEFAULT_CHILD_TEMPLATE = [
  [
    DEFAULT_CHILD_BLOCK_NAME,
    {
      title: 'First Item',
      body: 'Add supporting details for the first internal item.',
    },
  ],
  [
    DEFAULT_CHILD_BLOCK_NAME,
    {
      title: 'Second Item',
      body: 'Add supporting details for the second internal item.',
    },
  ],
];
```

The parent edit component consumes that registry to drive:

- `allowedBlocks` so only the child block can be inserted inside the parent
- the default seeded child template
- `templateLock={ false }` so users can reorder and add more internal items
- `InnerBlocks.ButtonBlockAppender` so the parent owns the insertion affordance

## Step 5: How the Child Stays Internal

The child `block.json` keeps the block out of the global inserter:

```json
{
  "name": "create-block/compound-demo-item",
  "parent": ["create-block/compound-demo"],
  "supports": {
    "html": false,
    "inserter": false,
    "reusable": false
  }
}
```

This pattern is useful when the child block exists only to structure the parent implementation, not as a reusable standalone block. Parent and child editors still use validated attribute updaters and surface Typia validation errors inside the editor UI.

## Step 6: Add Another Child Block Type

Use the generated extension workflow when the parent needs another hidden child block type:

```bash
npm run add-child -- --slug faq-item --title "FAQ Item"
```

That command:

- creates `src/blocks/compound-demo-faq-item/`
- updates `scripts/block-config.ts`
- updates `src/blocks/compound-demo/children.ts`
- keeps the default seeded template unchanged, so existing content does not churn

After adding the child block type, run:

```bash
npm run sync
```

`npm run sync` is the common-case entrypoint. `npm run sync-types` remains available when you want metadata-only control; it stays warn-only by default, `npm run sync-types -- --fail-on-lossy` fails only on lossy WordPress projection warnings, and `npm run sync-types -- --strict --report json` emits a CI-friendly JSON report while failing on every warning.

## Step 7: Optional Persistence on the Parent

When you pass `--data-storage` or `--persistence-policy`, only the parent block gets persistence wiring.

That means:

- the parent becomes a dynamic block with `render.php`
- the parent gets typed REST contracts and an Interactivity API store
- the child block remains a pure static content container

This is a good fit for patterns like:

- tab sets with a persisted counter or status
- step lists with aggregate interaction tracking
- experiment containers where the top-level block owns state and children own content

## Step 8: Build and Test

Run the normal scaffold lifecycle:

```bash
npm run sync
npm run build
```

If you enabled persistence on the parent block:

```bash
npm run sync-rest
```

Use `npm run sync` for the common-case metadata + REST refresh before `npm run build`, `npm run typecheck`, or commit. `npm run sync-rest` remains available when you only want to refresh the parent REST layer, but it now fails fast when the block metadata artifacts are stale, so run `npm run sync` or `npm run sync-types` first when needed. The generated `dev` workflow watches the relevant sync steps for compound scaffolds, `npm run start` still runs them as one-shot syncs, and both `npm run build` and `npm run typecheck` verify that the checked-in artifacts are already current. They do not create migration history.

Then load the plugin in your WordPress environment and verify:

- the parent block appears in the inserter
- the child block does not appear in the global inserter
- inserting the parent seeds two child items
- save and reopen keeps the block valid
- the frontend renders the parent plus child content

## What's Next?

1. Add custom inspector controls to the parent block
2. Use `npm run add-child -- --slug ... --title ...` when you need another hidden child type
3. Enable persistence on the parent when you need count-like behavior
4. Adapt the pattern for tabs, steps, carousels, or experiment containers

## Additional Resources

- [Basic Block Tutorial](./basic-block-tutorial.md)
- [Persistence Block Tutorial](./persistence-block-tutorial.md)
- [API Reference](../reference/api.md)
- [WordPress Inner Blocks Handbook](https://developer.wordpress.org/block-editor/how-to-guides/block-tutorial/nested-blocks-inner-blocks/)
