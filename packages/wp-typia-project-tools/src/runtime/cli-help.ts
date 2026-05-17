import { PACKAGE_MANAGER_IDS } from "./package-managers.js";
import { TEMPLATE_IDS } from "./template-registry.js";

/**
 * Return the canonical CLI usage text for `wp-typia`.
 *
 * The rendered help includes the current built-in template ids and supported
 * package manager ids from the runtime registry.
 *
 * @returns Human-readable help text for CLI usage output.
 */
export function formatHelpText(): string {
	return `Usage:
  wp-typia create <project-dir> [--template <basic|interactivity>] [--external-layer-source <./path|github:owner/repo/path[#ref]|npm-package>] [--external-layer-id <layer-id>] [--namespace <value>] [--text-domain <value>] [--php-prefix <value>] [--with-migration-ui] [--with-wp-env] [--with-test-preset] [--yes] [--dry-run] [--no-install] [--package-manager <id>]
  wp-typia create <project-dir> [--template workspace] [--profile <plugin-qa>] [--namespace <value>] [--text-domain <value>] [--php-prefix <value>] [--with-migration-ui] [--with-wp-env] [--with-test-preset] [--yes] [--dry-run] [--no-install] [--package-manager <id>]
  wp-typia create <project-dir> [--template query-loop] [--external-layer-source <./path|github:owner/repo/path[#ref]|npm-package>] [--external-layer-id <layer-id>] [--query-post-type <post-type>] [--namespace <value>] [--text-domain <value>] [--php-prefix <value>] [--with-migration-ui] [--with-wp-env] [--with-test-preset] [--yes] [--dry-run] [--no-install] [--package-manager <id>]
  wp-typia create <project-dir> [--template <./path|github:owner/repo/path[#ref]>] [--variant <name>] [--namespace <value>] [--text-domain <value>] [--php-prefix <value>] [--with-wp-env] [--with-test-preset] [--yes] [--dry-run] [--no-install] [--package-manager <id>]
  wp-typia create <project-dir> [--template <npm-package>] [--variant <name>] [--namespace <value>] [--text-domain <value>] [--php-prefix <value>] [--with-wp-env] [--with-test-preset] [--yes] [--dry-run] [--no-install] [--package-manager <id>]
  wp-typia create <project-dir> [--template persistence] [--external-layer-source <./path|github:owner/repo/path[#ref]|npm-package>] [--external-layer-id <layer-id>] [--alternate-render-targets <email,mjml,plain-text>] [--data-storage <post-meta|custom-table>] [--persistence-policy <authenticated|public>] [--namespace <value>] [--text-domain <value>] [--php-prefix <value>] [--with-migration-ui] [--with-wp-env] [--with-test-preset] [--yes] [--dry-run] [--no-install] [--package-manager <id>]
  wp-typia create <project-dir> [--template compound] [--external-layer-source <./path|github:owner/repo/path[#ref]|npm-package>] [--external-layer-id <layer-id>] [--inner-blocks-preset <freeform|ordered|horizontal|locked-structure>] [--alternate-render-targets <email,mjml,plain-text>] [--data-storage <post-meta|custom-table>] [--persistence-policy <authenticated|public>] [--namespace <value>] [--text-domain <value>] [--php-prefix <value>] [--with-migration-ui] [--with-wp-env] [--with-test-preset] [--yes] [--dry-run] [--no-install] [--package-manager <id>]
  wp-typia <project-dir> [create flags...]
  wp-typia init [project-dir] [--apply] [--package-manager <id>]
  wp-typia add admin-view <name> [--source <rest-resource:slug|core-data:kind/name>]
  wp-typia add block <name> [--template <basic|interactivity|persistence|compound>] [--external-layer-source <./path|github:owner/repo/path[#ref]|npm-package>] [--external-layer-id <layer-id>] [--inner-blocks-preset <freeform|ordered|horizontal|locked-structure>] [--alternate-render-targets <email,mjml,plain-text>] [--data-storage <post-meta|custom-table>] [--persistence-policy <authenticated|public>]
  wp-typia add integration-env <name> [--wp-env] [--release-zip] [--service <none|docker-compose>]
  wp-typia add core-variation <block-name> <name>
  wp-typia add core-variation <name> --block <namespace/block>
  wp-typia add variation <name> --block <block-slug>
  wp-typia add style <name> --block <block-slug>
  wp-typia add transform <name> --from <namespace/block> --to <block-slug|namespace/block-slug>
  wp-typia add pattern <name> [--scope <full|section>] [--section-role <role>] [--catalog-title <title>] [--tags <tag,...>] [--tag <tag>...] [--thumbnail-url <url>]
  wp-typia add binding-source <name> [--block <block-slug|namespace/block-slug> --attribute <attribute>] [--from-post-meta|--post-meta <post-meta> [--meta-path <field>]]
  wp-typia add rest-resource <name> [--namespace <vendor/v1>] [--methods <method[,method...]>]
  wp-typia add rest-resource <name> --manual [--namespace <vendor/v1>] [--method <GET|POST|PUT|PATCH|DELETE>] [--auth <public|authenticated|public-write-protected>] [--path <route-pattern>|--route-pattern <route-pattern>] [--permission-callback <callback>] [--controller-class <ClassName>] [--controller-extends <BaseClass>] [--query-type <Type>] [--body-type <Type>] [--response-type <Type>] [--secret-field <field>] [--secret-state-field|--secret-has-value-field <field>] [--secret-preserve-on-empty <true|false>]
  wp-typia add post-meta <name> --post-type <post-type> [--type <ExportedTypeName>] [--meta-key <meta-key>] [--hide-from-rest]
  wp-typia add ability <name>
  wp-typia add ai-feature <name> [--namespace <vendor/v1>]
  wp-typia add editor-plugin <name> [--slot <sidebar|document-setting-panel>]
  wp-typia add hooked-block <block-slug> --anchor <anchor-block-name> --position <before|after|firstChild|lastChild>
  wp-typia migrate <init|snapshot|diff|scaffold|verify|doctor|fixtures|fuzz> [...]
  wp-typia templates list
  wp-typia templates inspect <id>
  wp-typia doctor
  wp-typia mcp <list|sync>
  wp-typia skills <list|sync>
  wp-typia completions <bash|zsh|fish|powershell>

Built-in templates: ${TEMPLATE_IDS.join(", ")}
Package managers: ${PACKAGE_MANAGER_IDS.join(", ")}
Output environment:
  WP_TYPIA_ASCII=1 forces ASCII status markers; WP_TYPIA_ASCII=0 opts back into Unicode markers even when NO_COLOR is set.
  A non-empty NO_COLOR requests ASCII-safe markers such as [ok], [dry-run], [!], and [...] when WP_TYPIA_ASCII is not set.
Notes:
  \`wp-typia create\` is the canonical scaffold command.
  \`wp-typia <project-dir>\` remains a backward-compatible alias to \`create\` when \`<project-dir>\` is the only positional argument.
  \`wp-typia init\` previews the minimum retrofit sync surface by default; rerun with \`--apply\` to write package.json updates and generated helper scripts.
  Use \`--template workspace\` as shorthand for \`@wp-typia/create-workspace-template\`, the official empty workspace scaffold behind \`wp-typia add ...\`.
  Use \`--profile plugin-qa\` with \`--template workspace\` when a plugin needs local wp-env smoke checks, \`.env.example\`, and release zip scripts from day one; omit it for the minimal workspace shell.
  Interactive add flows let you choose a template when \`--template\` is omitted; non-interactive runs default to \`basic\`.
  Unknown \`core/*\` targets for \`add core-variation\` warn instead of failing so newer WordPress core blocks remain scaffoldable; third-party namespaces are allowed without local discovery.
  \`add admin-view\` scaffolds an opt-in DataViews-powered WordPress admin screen under \`src/admin-views/\`.
  Pass \`--source rest-resource:<slug>\` to reuse a list-capable REST resource.
  Pass \`--source core-data:postType/post\` or \`--source core-data:taxonomy/category\` to bind a WordPress-owned entity collection.
  Generated admin-view workspaces add \`@wp-typia/dataviews\` and the needed WordPress DataViews packages as opt-in dependencies.
  \`add integration-env\` generates an opt-in local smoke starter under \`scripts/integration-smoke/\`, updates \`.env.example\`, and can add \`@wordpress/env\` plus \`.wp-env.json\` when \`--wp-env\` is passed.
  Pass \`--release-zip\` to add \`release:zip\`, \`release:zip:check\`, and \`qa:check\` scripts for plugin QA packaging.
  Pass \`--service docker-compose\` to include a placeholder local service stack that can be adapted to project-specific dependencies.
  \`query-loop\` is create-only. Use \`wp-typia create <project-dir> --template query-loop\`; \`wp-typia add block\` accepts only basic, interactivity, persistence, and compound families.
  \`add variation\` uses an existing workspace block from \`scripts/block-config.ts\`.
  \`add style\` registers a Block Styles option for an existing generated block.
  \`add transform\` adds a block-to-block transform into an existing generated block.
  \`add pattern\` scaffolds a namespaced PHP pattern shell under \`src/patterns/full/\` or \`src/patterns/sections/\`; pass \`--catalog-title "Hero Photo"\` to override the generated catalog title, pass \`--tags hero,landing\` for a comma-separated tag list, and repeat \`--tag hero --tag landing\` for single tag values.
  \`add binding-source\` scaffolds shared PHP and editor registration under \`src/bindings/\`; pass \`--block\` and \`--attribute\` together to declare a bindable generated-block attribute. Pass \`--from-post-meta\` or \`--post-meta\` to back the source from a typed post-meta contract and \`--meta-path\` to choose its default top-level field.
  \`add rest-resource\` scaffolds plugin-level TypeScript REST contracts under \`src/rest/\` and PHP route glue under \`inc/rest/\`.
  \`add rest-resource --manual\` tracks an external/provider REST route with typed schemas, OpenAPI, clients, and drift checks without generating PHP route/controller files while still allowing route-owner metadata such as permission callbacks and controller classes. Settings contracts can add \`--secret-field\` plus \`--secret-preserve-on-empty\` to model write-only credentials and preserve blank submissions.
  \`add post-meta\` scaffolds typed post meta contracts under \`src/post-meta/\`, emits schema artifacts, and wires generated \`register_post_meta()\` helpers under \`inc/post-meta/\`.
  \`add ability\` scaffolds typed workflow abilities under \`src/abilities/\` and server registration under \`inc/abilities/\`.
  \`add ai-feature\` scaffolds server-owned AI feature endpoints under \`src/ai-features/\` and PHP route glue under \`inc/ai-features/\`.
  \`add editor-plugin\` scaffolds a document-level editor extension under \`src/editor-plugins/\`; legacy aliases \`PluginSidebar\` and \`PluginDocumentSettingPanel\` resolve to \`sidebar\` and \`document-setting-panel\`.
  \`add hooked-block\` patches an existing workspace block's \`block.json\` \`blockHooks\` metadata.
  \`wp-typia doctor\` always checks environment readiness and reports when it only ran environment-level diagnostics; official workspace roots also get inventory, source-tree drift, shared convention checks, and iframe/API v3 compatibility checks.
  \`wp-typia init\` previews or applies the minimum sync/doctor/migration adoption layer for supported existing layouts; pass \`--package-manager <id>\` to pin emitted scripts and next steps.
  \`wp-typia migrate doctor --all\` checks migration target alignment, snapshots, fixtures, and generated migration artifacts.
  \`migrate\` is the canonical migration command; \`migrations\` is no longer supported.`;
}
