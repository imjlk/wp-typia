# My Typia Block

The kitchen-sink showcase block for `wp-typia`, combining Typia validation, a dynamic `render.php` server boundary, Interactivity API wiring, and snapshot-based migration tooling in one reference app.

## 🚀 Features

- **✅ Typia Validation**: Type-safe attributes with compile-time and runtime validation
- **🧱 Dynamic Rendering**: `render.php` uses the generated `typia-validator.php` at the server boundary
- **⚡ Interactivity API**: Lightweight frontend interactions
- **🎯 Auto-Sync**: Types automatically sync to `block.json` and `typia.manifest.json`
- **🧬 Snapshot Migrations**: Preserve legacy block contracts and scaffold deprecated migrations from Typia manifests
- **🔧 TypeScript**: Full type safety throughout

## 🏗️ Development

```bash
# Install dependencies
bun install

# Development with hot reload
bun run start

# Build for production
bun run build

# Type and WordPress lint checks
bun run check:code

# Sync block metadata manually
bun run sync-types

# Bootstrap migration snapshots for the first release
bun run migration:init

# Compare the current schema with an older snapshot
bun run migration:diff -- --from-migration-version v1

# Run the read-only migration workspace check
bun run migration:doctor

# Scaffold a legacy-to-current migration edge
bun run migration:scaffold -- --from-migration-version v1

# Refresh deterministic fixture cases
bun run migration:fixtures -- --all --force

# Verify generated migration rules against stored fixtures
bun run migration:verify

# Re-run verification with seeded fuzz inputs
bun run migration:fuzz -- --all --iterations 25 --seed 1
```

Migration commands use the workspace-local `wp-typia` bin, so the reference app
tracks the checked-out CLI without needing a manual version pin update on every
release.

## 📝 Type System

Edit `src/types.ts` to define your block attributes:

```typescript
export interface MyTypiaBlockAttributes {
	content: string & tags.MinLength<1> & tags.Default<'Hello World'>;
	isVisible: boolean & tags.Default<true>;
	count: number & tags.Minimum<0> & tags.Maximum<100>;
}
```

**`block.json`, `typia.manifest.json`, and `typia-validator.php` are automatically updated** when you run `bun run start` or `bun run build`.

## 🎨 Styling

- `src/style.scss` - Frontend and editor styles
- Block CSS class: `.wp-block-create-block-my-typia-block`

## ⚡ Interactivity

Frontend interactions are defined in `src/view.ts`:

```typescript
const { state, actions } = store('my-typia-block', {
	state: { isActive: false },
	actions: {
		toggle() {
			state.isActive = !state.isActive;
		},
	},
});
```

## 🛡️ Validator Toolkit

`src/validator-toolkit.ts` mirrors the current scaffold abstraction and keeps
Typia manifest/default wiring in one place. `src/validators.ts` then stays
focused on the example-specific `id` finalization and helper exports.

## 🧱 Server Boundary

The block renders on the server through `render.php`. That file loads the generated `typia-validator.php`, applies defaults, validates the supported subset, and safely returns an empty string when the payload is invalid.

## 🧬 Migration Authoring

Generated rule files now expose both `renameMap` and `transforms`:

```ts
export const renameMap = {
	content: 'headline',
	'settings.label': 'settings.title',
	// "linkTarget.url.href": "cta.href",
};

export const transforms = {
	// "count": (legacyValue) => Number(legacyValue ?? 0),
};
```

Scaffold now does more than leave TODOs behind:

- high-confidence top-level and nested leaf renames are written directly into `renameMap`
- semantic-risk coercions get suggested transform bodies
- edge fixtures are generated at `src/migrations/fixtures/<from>-to-<to>.json`
- `migration:doctor` checks snapshot health, generated artifacts, unresolved markers, and fixture coverage
- `migration:verify` replays every fixture case before it accepts the edge
- `migration:fuzz` keeps fixture replay deterministic, then adds seeded `typia.random()` regression coverage
- `src/migrations/examples/rename-transform-union/` ships a realistic reference pack that does not affect the active migration graph

Recommended flow:

1. update `src/types.ts`
2. run `bun run sync-types`
3. snapshot the release you want to preserve
4. scaffold the legacy edge
5. review auto-applied renames and suggested transforms
6. adjust nested `renameMap` / `transforms` entries if object or union branch leaves changed
7. edit the generated fixture cases if the real legacy payload is richer
8. run `bun run migration:doctor`
9. run `bun run migration:verify`
10. run `bun run migration:fuzz`
11. use the admin dashboard for dry-run previews before batch migration

Example:

```bash
bun run migration:snapshot -- --migration-version v2
bun run migration:scaffold -- --from-migration-version v1
# review auto-applied renameMap entries
# review nested leaf paths like "settings.label" or "linkTarget.url.href"
# fill suggested transforms if needed
bun run migration:doctor
bun run migration:verify
bun run migration:fuzz -- --all --iterations 25 --seed 1
```

The dashboard then shows:

- changed field paths
- union branch matches
- risk summary buckets shared with the CLI diff (`additive`, `rename`, `semanticTransform`, `unionBreaking`)
- unresolved/manual review badges
- dry-run previews before any write happens

## 📦 Generated Files

- `block.json` - WordPress-facing attribute metadata generated from TypeScript types
- `typia.manifest.json` - Manifest v2 with default markers and discriminated union metadata
- `typia-validator.php` - Generated PHP validator for the supported server-side subset
- `render.php` - Dynamic block rendering entrypoint
- `typia-migration-registry.php` - PHP-readable snapshot and edge summary
- `src/migrations/versions/` - Versioned snapshots of legacy block contracts and save implementations
- `src/migrations/rules/` - Per-edge migration rules generated from Typia manifest diffs
- `src/migrations/fixtures/` - Edge fixtures used by `migration:verify`, `migration:fuzz`, and the dashboard preview
- `src/migrations/examples/` - Reference-only migration examples for rename + transform + union authoring
- `src/migrations/generated/` - Generated deprecated array, registry, verification, and fuzz helpers
- `build/` - Compiled JavaScript and CSS
- `src/types.ts` - **Edit this to change block attributes**

---

_Generated with `wp-typia` and Typia validation_
