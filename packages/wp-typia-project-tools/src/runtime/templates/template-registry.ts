import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readJsonFileSync } from "../shared/json-utils.js";
import { getBuiltInTemplateMetadataDefaults } from "./template-defaults.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_TOOLS_PACKAGE_ROOT_ENV = "WP_TYPIA_PROJECT_TOOLS_PACKAGE_ROOT";
const PROJECT_TOOLS_PACKAGE_NAME = "@wp-typia/project-tools";

function resolveValidProjectToolsPackageRoot(
	candidateRoot: string,
): string | undefined {
	const packageJsonPath = path.join(candidateRoot, "package.json");
	if (!fs.existsSync(packageJsonPath)) {
		return undefined;
	}

	try {
		const packageJson = readJsonFileSync<{
			name?: string;
		}>(packageJsonPath, {
			context: "project-tools package manifest override",
		});
		return packageJson.name === PROJECT_TOOLS_PACKAGE_NAME
			? candidateRoot
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * Resolve the canonical `@wp-typia/project-tools` package root.
 *
 * When `WP_TYPIA_PROJECT_TOOLS_PACKAGE_ROOT` is set, the override is only
 * accepted if it points at a readable package manifest whose `name` matches
 * `@wp-typia/project-tools`. Invalid or stale overrides are ignored and normal
 * upward package-root discovery continues.
 */
export function resolvePackageRoot(startDir: string): string {
	const overriddenPackageRoot = process.env[PROJECT_TOOLS_PACKAGE_ROOT_ENV]?.trim();
	if (overriddenPackageRoot) {
		const resolvedOverride = path.resolve(overriddenPackageRoot);
		const validOverride = resolveValidProjectToolsPackageRoot(resolvedOverride);
		if (validOverride) {
			return validOverride;
		}
	}

	let currentDir = startDir;

	while (true) {
		const packageJsonPath = path.join(currentDir, "package.json");
		if (fs.existsSync(packageJsonPath)) {
			try {
				const packageJson = readJsonFileSync<{ name?: string }>(packageJsonPath, {
					context: "project-tools package root discovery manifest",
				});
				if (packageJson.name === PROJECT_TOOLS_PACKAGE_NAME) {
					return currentDir;
				}
			} catch {
				// Ignore malformed package.json while walking upward; discovery should
				// keep searching parent directories instead of failing on unrelated files.
			}
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			throw new Error("Unable to resolve the @wp-typia/project-tools package root.");
		}
		currentDir = parentDir;
	}
}

export const PROJECT_TOOLS_PACKAGE_ROOT = resolvePackageRoot(__dirname);
export const TEMPLATE_ROOT = path.join(PROJECT_TOOLS_PACKAGE_ROOT, "templates");
export const SHARED_TEMPLATE_ROOT = path.join(TEMPLATE_ROOT, "_shared");
export const SHARED_BASE_TEMPLATE_ROOT = path.join(SHARED_TEMPLATE_ROOT, "base");
export const SHARED_COMPOUND_TEMPLATE_ROOT = path.join(SHARED_TEMPLATE_ROOT, "compound");
export const SHARED_PERSISTENCE_TEMPLATE_ROOT = path.join(SHARED_TEMPLATE_ROOT, "persistence");
export const SHARED_PRESET_TEMPLATE_ROOT = path.join(SHARED_TEMPLATE_ROOT, "presets");
export const SHARED_REST_HELPER_TEMPLATE_ROOT = path.join(SHARED_TEMPLATE_ROOT, "rest-helpers");
export const SHARED_MIGRATION_UI_TEMPLATE_ROOT = path.join(SHARED_TEMPLATE_ROOT, "migration-ui");
/**
 * Shared workspace template overlay root used by workspace scaffolding flows.
 */
export const SHARED_WORKSPACE_TEMPLATE_ROOT = path.join(SHARED_TEMPLATE_ROOT, "workspace");
export const SHARED_TEST_PRESET_TEMPLATE_ROOT = path.join(SHARED_PRESET_TEMPLATE_ROOT, "test-preset");
export const SHARED_WP_ENV_PRESET_TEMPLATE_ROOT = path.join(SHARED_PRESET_TEMPLATE_ROOT, "wp-env");
export const BUILTIN_TEMPLATE_IDS = [
	"basic",
	"interactivity",
	"persistence",
	"compound",
	"query-loop",
] as const;
export const OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE = "@wp-typia/create-workspace-template";
export const OFFICIAL_WORKSPACE_TEMPLATE_ALIAS = "workspace";
export type BuiltInTemplateId = (typeof BUILTIN_TEMPLATE_IDS)[number];
export type PersistencePolicy = "authenticated" | "public";

export interface TemplateDefinition {
	id: string;
	description: string;
	defaultCategory: string;
	features: string[];
	templateDir: string;
}

export const TEMPLATE_REGISTRY = Object.freeze<TemplateDefinition[]>([
	{
		id: "basic",
		description: "A lightweight WordPress block with Typia validation",
		defaultCategory: getBuiltInTemplateMetadataDefaults("basic").category,
		features: ["Type-safe attributes", "Runtime validation", "Minimal setup"],
		templateDir: path.join(TEMPLATE_ROOT, "basic"),
	},
	{
		id: "interactivity",
		description: "An interactive WordPress block with Typia validation and Interactivity API",
		defaultCategory: getBuiltInTemplateMetadataDefaults("interactivity").category,
		features: ["Interactivity API", "Client-side state", "Event handling"],
		templateDir: path.join(TEMPLATE_ROOT, "interactivity"),
	},
	{
		id: "persistence",
		description: "A persistence-aware WordPress block with Typia validation, typed REST contracts, and selectable public or authenticated write policies",
		defaultCategory: getBuiltInTemplateMetadataDefaults("persistence").category,
		features: ["Interactivity API", "Typed REST client", "Schema sync", "Persistence policies"],
		templateDir: path.join(TEMPLATE_ROOT, "persistence"),
	},
	{
		id: "compound",
		description: "A parent-and-child WordPress block scaffold with InnerBlocks, optional persistence wiring, and hidden implementation child blocks",
		defaultCategory: getBuiltInTemplateMetadataDefaults("compound").category,
		features: ["InnerBlocks", "Hidden child blocks", "Optional persistence layer"],
		templateDir: path.join(TEMPLATE_ROOT, "compound"),
	},
	{
		id: "query-loop",
		description: "A Query Loop block variation scaffold with stable namespace-based identity, inline starter layout, connected pattern presets, custom query seams, and runtime parity hooks",
		defaultCategory: getBuiltInTemplateMetadataDefaults("query-loop").category,
		features: ["core/query variation", "Default innerBlocks", "Connected patterns", "Custom query hooks", "Runtime parity hooks", "Allowed controls"],
		templateDir: path.join(TEMPLATE_ROOT, "query-loop"),
	},
	{
		id: OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
		description: "The official empty workspace template that powers `wp-typia add ...` workflows",
		defaultCategory: "workspace",
		features: ["Workspace inventory", "Add block workflows", "Workspace doctor and migrate"],
		templateDir: path.resolve(PROJECT_TOOLS_PACKAGE_ROOT, "..", "create-workspace-template"),
	},
]);

export const TEMPLATE_IDS = [...BUILTIN_TEMPLATE_IDS] as BuiltInTemplateId[];

export function isBuiltInTemplateId(templateId: string): templateId is BuiltInTemplateId {
	return (BUILTIN_TEMPLATE_IDS as readonly string[]).includes(templateId);
}

/**
 * Returns whether a template id matches the user-facing official workspace alias.
 *
 * @param templateId Template id or alias supplied by a caller.
 * @returns `true` when the id is the `workspace` alias.
 */
export function isOfficialWorkspaceTemplateAlias(templateId: string): boolean {
	return templateId === OFFICIAL_WORKSPACE_TEMPLATE_ALIAS;
}

/**
 * Converts user-facing template aliases into the registry lookup id.
 *
 * @param templateId Template id or alias supplied by a caller.
 * @returns The registry id used for template resolution.
 */
export function normalizeTemplateLookupId(templateId: string): string {
	return isOfficialWorkspaceTemplateAlias(templateId)
		? OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE
		: templateId;
}

/**
 * Converts internal template ids into the id shown in human-facing output.
 *
 * @param templateId Template id stored in the registry.
 * @returns The user-facing template id or alias for display.
 */
export function getUserFacingTemplateId(templateId: string): string {
	return templateId === OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE
		? OFFICIAL_WORKSPACE_TEMPLATE_ALIAS
		: templateId;
}

export function listTemplates(): readonly TemplateDefinition[] {
	return TEMPLATE_REGISTRY;
}

export function getTemplateById(templateId: string): TemplateDefinition {
	const normalizedTemplateId = normalizeTemplateLookupId(templateId);
	const template = TEMPLATE_REGISTRY.find((entry) => entry.id === normalizedTemplateId);
	if (!template) {
		throw new Error(
			`Unknown template "${templateId}". Expected one of: ${[
				...TEMPLATE_IDS,
				OFFICIAL_WORKSPACE_TEMPLATE_ALIAS,
				OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
			].join(", ")}`,
		);
	}
	return template;
}

export function getTemplateSelectOptions(): Array<{
	label: string;
	value: string;
	hint: string;
}> {
	return TEMPLATE_REGISTRY.map((template) => ({
		label: getUserFacingTemplateId(template.id),
		value: getUserFacingTemplateId(template.id),
		hint: template.features.join(", "),
	}));
}
