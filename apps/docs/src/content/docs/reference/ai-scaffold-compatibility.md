---
title: 'AI Scaffold Compatibility'
---

AI-capable scaffolds use an explicit compatibility policy instead of changing
plugin headers ad hoc. The policy keeps the non-AI baseline stable, then lets
each AI feature declare whether it is a hard requirement or an optional runtime
capability.

## Baseline

Generated non-AI projects keep the current hard-floor baseline:

- WordPress `Requires at least: 6.7`
- PHP `Requires PHP: 8.0`

`wp-typia create` targets WordPress 7.0 for generated `Tested up to` plugin
headers by default. Use `--wp-version 6.9` to restore the legacy 6.9 target.
Changing the target does not by itself raise `Requires at least`; required
scaffold capabilities still own the hard floor.

The baseline also applies to optional AI features. Optional features must use
runtime gates and graceful degradation instead of raising the plugin header
floor.

Compatibility floors must use dotted numeric segments, for example `6.7`,
`7.0`, or `8.1.2`. Wildcards and ranges such as `6.x`, `^6.7`, or `>=6.7` are
not accepted. Invalid internal policy values fail fast; malformed existing
plugin header values are replaced with the resolved policy floor and surfaced as
CLI warnings so maintainers can fix the source value deliberately.

## Feature Modes

- `required`: raises the generated plugin header to the highest required
  WordPress/PHP floor across selected features.
- `optional`: records the feature in workspace compatibility metadata, but
  keeps the plugin header at the baseline and requires runtime guards.
- `baseline`: no AI feature selection has been applied.

## Current Matrix

| Feature                     | Mode in generated scaffold             | Version floor               | Runtime gate                                             |
| --------------------------- | -------------------------------------- | --------------------------- | -------------------------------------------------------- |
| WordPress AI Client         | Optional for `wp-typia add ai-feature` | WordPress 7.0 when required | WordPress AI Client availability                         |
| WordPress Abilities API     | Required for `wp-typia add ability`    | WordPress 6.9               | `wp_register_ability` and `wp_register_ability_category` |
| `@wordpress/core-abilities` | Required for `wp-typia add ability`    | WordPress 7.0               | `@wordpress/core-abilities` script package               |
| MCP public metadata         | Optional adapter path                  | No core floor by itself     | MCP adapter availability                                 |

Because the typed ability scaffold requires both the server Abilities API and
the editor/admin discovery client, generated ability projects currently raise
their plugin headers to WordPress 7.0.

Server-only AI feature endpoints stay optional. They keep the baseline header,
register their REST endpoint, and return a runtime error when the WordPress AI
Client or structured text generation support is not available. Generated
projects also surface an admin notice for site managers so the disabled feature
does not look like a broken plugin.

## Generated Inventory Metadata

Workspace entries for AI features and typed abilities include a `compatibility`
object. Tooling can inspect that object to distinguish baseline, optional, and
required feature surfaces without parsing PHP headers.

The generated object records:

- `mode`
- `hardMinimums`
- `optionalFeatures`
- `requiredFeatures`
- `runtimeGates`

That metadata is advisory for tooling and docs. The plugin header remains the
source WordPress uses for installation compatibility.
