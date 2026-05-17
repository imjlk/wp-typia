import {
	HOOKED_BLOCK_POSITION_IDS,
} from "./hooked-blocks.js";
import {
	ADD_BLOCK_TEMPLATE_IDS,
	EDITOR_PLUGIN_SLOT_IDS,
	REST_RESOURCE_METHOD_IDS,
} from "./cli-add-types.js";
import {
	WORKSPACE_TEMPLATE_PACKAGE,
} from "./workspace-project.js";

/**
 * Returns help text for the canonical `wp-typia add` subcommands.
 */
export function formatAddHelpText(): string {
	return `Usage:
  wp-typia add admin-view <name> [--source <rest-resource:slug|core-data:kind/name>] [--dry-run]
  wp-typia add block <name> [--template <${ADD_BLOCK_TEMPLATE_IDS.join("|")}>] [--external-layer-source <./path|github:owner/repo/path[#ref]|npm-package>] [--external-layer-id <layer-id>] [--inner-blocks-preset <freeform|ordered|horizontal|locked-structure>] [--alternate-render-targets <email,mjml,plain-text>] [--data-storage <post-meta|custom-table>] [--persistence-policy <authenticated|public>] [--dry-run]
  wp-typia add integration-env <name> [--wp-env] [--release-zip] [--service <none|docker-compose>] [--dry-run]
  wp-typia add core-variation <block-name> <name> [--dry-run]
  wp-typia add core-variation <name> --block <namespace/block> [--dry-run]
	wp-typia add variation <name> --block <block-slug> [--dry-run]
	wp-typia add style <name> --block <block-slug> [--dry-run]
	wp-typia add transform <name> --from <namespace/block> --to <block-slug|namespace/block-slug> [--dry-run]
  wp-typia add pattern <name> [--scope <full|section>] [--section-role <role>] [--catalog-title <title>] [--tags <tag,...>] [--tag <tag>...] [--thumbnail-url <url>] [--dry-run]
  wp-typia add binding-source <name> [--block <block-slug|namespace/block-slug> --attribute <attribute>] [--from-post-meta|--post-meta <post-meta> [--meta-path <field>]] [--dry-run]
  wp-typia add contract <name> [--type <ExportedTypeName>] [--dry-run]
  wp-typia add rest-resource <name> [--namespace <vendor/v1>] [--methods <${REST_RESOURCE_METHOD_IDS.join(",")}>] [--route-pattern <route-pattern>] [--permission-callback <callback>] [--controller-class <ClassName>] [--controller-extends <BaseClass>] [--dry-run]
  wp-typia add rest-resource <name> --manual [--namespace <vendor/v1>] [--method <GET|POST|PUT|PATCH|DELETE>] [--auth <public|authenticated|public-write-protected>] [--path <route-pattern>|--route-pattern <route-pattern>] [--permission-callback <callback>] [--controller-class <ClassName>] [--controller-extends <BaseClass>] [--query-type <Type>] [--body-type <Type>] [--response-type <Type>] [--secret-field <field>] [--secret-state-field|--secret-has-value-field <field>] [--secret-preserve-on-empty <true|false>] [--dry-run]
  wp-typia add post-meta <name> --post-type <post-type> [--type <ExportedTypeName>] [--meta-key <meta-key>] [--hide-from-rest] [--dry-run]
  wp-typia add ability <name> [--dry-run]
  wp-typia add ai-feature <name> [--namespace <vendor/v1>] [--dry-run]
  wp-typia add hooked-block <block-slug> --anchor <anchor-block-name> --position <${HOOKED_BLOCK_POSITION_IDS.join("|")}> [--dry-run]
  wp-typia add editor-plugin <name> [--slot <${EDITOR_PLUGIN_SLOT_IDS.join("|")}>] [--dry-run]

Notes:
  \`wp-typia add\` runs only inside official ${WORKSPACE_TEMPLATE_PACKAGE} workspaces scaffolded via \`wp-typia create <project-dir> --template workspace\`.
  Pass \`--dry-run\` to preview the workspace files that would change without writing them.
  Interactive add flows let you choose a template when \`--template\` is omitted; non-interactive runs default to \`basic\`.
  \`add core-variation\` registers editor-side variations for existing core or external blocks without generating block.json or Typia manifests.
  Unknown \`core/*\` core-variation targets warn instead of failing so newer WordPress core blocks remain scaffoldable; third-party namespaces are allowed without local discovery.
  \`add admin-view\` scaffolds an opt-in DataViews-powered WordPress admin screen under \`src/admin-views/\`.
  Pass \`--source rest-resource:<slug>\` to reuse a list-capable REST resource.
  Pass \`--source core-data:postType/post\` or \`--source core-data:taxonomy/category\` to bind a WordPress-owned entity collection.
  Generated admin-view workspaces add \`@wp-typia/dataviews\` and the needed WordPress DataViews packages as opt-in dependencies.
  \`add integration-env\` generates an opt-in local smoke starter under \`scripts/integration-smoke/\`, updates \`.env.example\`, and can add \`@wordpress/env\` plus \`.wp-env.json\` when \`--wp-env\` is passed.
  Pass \`--release-zip\` to add \`release:zip\`, \`release:zip:check\`, and \`qa:check\` scripts for plugin QA packaging.
  Pass \`--service docker-compose\` to include a placeholder local service stack that can be adapted to project-specific dependencies.
  \`query-loop\` is a create-time scaffold family. Use \`wp-typia create <project-dir> --template query-loop\` instead of \`wp-typia add block\`.
  \`add variation\` targets an existing block slug from \`scripts/block-config.ts\`.
  \`add style\` registers a Block Styles option for an existing generated block.
  \`add transform\` adds a block-to-block transform into an existing generated block.
  \`add pattern\` scaffolds a namespaced PHP pattern shell under \`src/patterns/full/\` or \`src/patterns/sections/\` and records typed catalog metadata in \`PATTERNS\`; pass \`--catalog-title "Hero Photo"\` to override the generated catalog title, pass \`--tags hero,landing\` for a comma-separated tag list, and repeat \`--tag hero --tag landing\` for single tag values.
  \`add binding-source\` scaffolds shared PHP and editor registration under \`src/bindings/\`; pass \`--block\` and \`--attribute\` together to declare an end-to-end bindable attribute on an existing generated block. Pass \`--from-post-meta\` or \`--post-meta\` to generate a source backed by a typed post-meta contract; \`--meta-path\` selects one top-level field as the default binding arg.
  \`add contract\` registers a standalone TypeScript wire contract under \`src/contracts/\` and generates a stable JSON Schema artifact without creating PHP route glue.
  \`add rest-resource\` scaffolds plugin-level TypeScript REST contracts under \`src/rest/\` and PHP route glue under \`inc/rest/\`. Use \`--route-pattern\`, \`--permission-callback\`, \`--controller-class\`, and \`--controller-extends\` when an existing WordPress controller or permission model needs to own part of the generated route surface.
  Pass \`--manual\` with \`add rest-resource\` to track an external/provider REST route with typed schemas, OpenAPI, clients, and drift checks without generating PHP route/controller files. Manual routes may still declare \`--permission-callback\`, \`--controller-class\`, and \`--controller-extends\` as metadata for the route owner. Settings contracts can add \`--secret-field\` with \`--secret-preserve-on-empty\` metadata so generated schemas, clients, and admin forms treat blank secret submissions as preserve-by-default.
  \`add post-meta\` scaffolds a typed post meta contract under \`src/post-meta/\`, generates a schema artifact, and wires \`register_post_meta()\` helpers under \`inc/post-meta/\`.
  \`add ability\` scaffolds typed workflow abilities under \`src/abilities/\` and server registration under \`inc/abilities/\`.
  \`add ai-feature\` scaffolds server-owned AI feature endpoints under \`src/ai-features/\` and PHP route glue under \`inc/ai-features/\`.
  \`add hooked-block\` patches an existing workspace block's \`block.json\` \`blockHooks\` metadata.
  \`add editor-plugin\` scaffolds a document-level editor extension under \`src/editor-plugins/\`; legacy aliases \`PluginSidebar\` and \`PluginDocumentSettingPanel\` resolve to \`sidebar\` and \`document-setting-panel\`.`;
}
