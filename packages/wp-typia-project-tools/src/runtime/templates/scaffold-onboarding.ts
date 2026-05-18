import {
	formatPackageExecCommand,
	formatRunScript,
} from "../shared/package-managers.js";
import type { PackageManagerId } from "../shared/package-managers.js";
import { getPackageVersions } from "../shared/package-versions.js";
import { getPrimaryDevelopmentScript } from "./local-dev-presets.js";
import {
	OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
	isBuiltInTemplateId,
	normalizeTemplateLookupId,
} from "./template-registry.js";

interface SyncOnboardingOptions {
	availableScripts?: string[];
	compoundPersistenceEnabled?: boolean;
}

interface PhpRestExtensionOptions extends SyncOnboardingOptions {
	slug: string;
}

interface PhpRestSectionOptions {
	apiTypesPath: string;
	extraNote?: string;
	mainPhpPath: string;
	mainPhpScope: string;
	transportPath: string;
}

const INITIAL_COMMIT_COMMANDS = [
	"git init",
	"git add .",
	'git commit -m "Initial scaffold"',
] as const;

function getDoctorVerificationCommand(packageManager: PackageManagerId): string {
	return formatPackageExecCommand(
		packageManager,
		`wp-typia@${getPackageVersions().wpTypiaPackageExactVersion}`,
		"doctor",
	);
}

function templateHasPersistenceSync(
	templateId: string,
	{ compoundPersistenceEnabled = false }: SyncOnboardingOptions = {},
): boolean {
	return templateId === "persistence" || (templateId === "compound" && compoundPersistenceEnabled);
}

/**
 * Returns the optional sync script names to suggest for a template.
 */
export function getOptionalSyncScriptNames(
	templateId: string,
	options: SyncOnboardingOptions = {},
): string[] {
	if (templateId === "query-loop") {
		return [];
	}

	const availableScripts = new Set(options.availableScripts ?? []);
	if (availableScripts.has("sync")) {
		return ["sync"];
	}

	const fallbackScripts = ["sync-types", "sync-rest"].filter((scriptName) =>
		availableScripts.has(scriptName),
	);
	if (fallbackScripts.length > 0) {
		return fallbackScripts;
	}

	if (
		!isBuiltInTemplateId(templateId) &&
		templateId !== OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE
	) {
		return [];
	}

	return ["sync"];
}

/**
 * Formats optional onboarding sync commands for the selected package manager.
 */
export function getOptionalOnboardingSteps(
	packageManager: PackageManagerId,
	templateId: string,
	options: SyncOnboardingOptions = {},
): string[] {
	return getOptionalSyncScriptNames(templateId, options).map((scriptName) =>
		formatRunScript(packageManager, scriptName),
	);
}

/**
 * Returns the quick-start note explaining the scaffold's primary local loop.
 */
export function getQuickStartWorkflowNote(
	packageManager: PackageManagerId,
	templateId = "basic",
	options: SyncOnboardingOptions = {},
): string {
	const doctorCommand = getDoctorVerificationCommand(packageManager);

	if (templateId === "query-loop") {
		return `${formatRunScript(packageManager, "dev")} runs the editor build/watch loop that registers your Query Loop variation in the block editor. This scaffold intentionally skips \`src/types.ts\`, \`block.json\`, and Typia manifests because the source of truth lives in the variation registration flow. Update \`src/index.ts\` for variation defaults, \`src/patterns/*.php\` for richer connected layouts, \`src/query-extension.ts\` for custom query params, and \`inc/query-runtime.php\` for frontend/editor preview parity. Use ${doctorCommand} when you want a quick environment and workspace sanity check.`;
	}

	const developmentScript = getPrimaryDevelopmentScript(templateId);
	const devCommand = formatRunScript(packageManager, developmentScript);
	const startCommand = formatRunScript(packageManager, "start");

	if (developmentScript === "start") {
		return `${startCommand} is the primary local entry point for this template. Use ${doctorCommand} when you want a quick environment and workspace sanity check before build or commit.`;
	}

	if (developmentScript !== "dev") {
		return `${devCommand} is the primary local entry point for this template. Use ${startCommand} for the one-shot startup flow, and ${doctorCommand} when you want a quick verification pass before build or commit.`;
	}

	if (templateHasPersistenceSync(templateId, options)) {
		return `${devCommand} keeps the editor, type-derived artifacts, and REST-derived artifacts moving together during local development. Use ${startCommand} for a one-shot sync plus editor startup, and ${doctorCommand} when you want an explicit verification pass before build or commit.`;
	}

	return `${devCommand} keeps the editor and type-derived artifacts moving together during local development. Use ${startCommand} for a one-shot sync plus editor startup, and ${doctorCommand} when you want an explicit verification pass before build or commit.`;
}

/**
 * Returns the onboarding note explaining when manual sync is optional.
 */
export function getOptionalOnboardingNote(
	packageManager: PackageManagerId,
	templateId = "basic",
	options: SyncOnboardingOptions = {},
): string {
	const doctorCommand = getDoctorVerificationCommand(packageManager);

	if (templateId === "query-loop") {
		return `This scaffold owns a \`core/query\` variation, so it does not generate a \`sync\` script, \`src/types.ts\`, \`block.json\`, or Typia manifests. Edit \`src/index.ts\`, \`src/patterns/*.php\`, \`src/query-extension.ts\`, and \`inc/query-runtime.php\` as needed, then rerun ${formatRunScript(packageManager, "build")}, ${formatRunScript(packageManager, "typecheck")}, or ${doctorCommand}.`;
	}

	const optionalSyncScripts = getOptionalSyncScriptNames(templateId, options);
	const hasUnifiedSync = optionalSyncScripts.includes("sync");
	const syncSteps = optionalSyncScripts.map((scriptName) =>
		formatRunScript(packageManager, scriptName),
	);
	const developmentScript = getPrimaryDevelopmentScript(templateId);
	const syncCommand = formatRunScript(
		packageManager,
		hasUnifiedSync ? "sync" : "sync-types",
	);
	const syncCheckCommand = formatRunScript(
		packageManager,
		hasUnifiedSync ? "sync" : "sync-types",
		"--check",
	);
	const failOnLossySyncCommand = formatRunScript(
		packageManager,
		"sync-types",
		"--fail-on-lossy",
	);
	const syncTypesCommand = formatRunScript(packageManager, "sync-types");
	const syncRestCommand = formatRunScript(packageManager, "sync-rest");
	const typecheckCommand = formatRunScript(packageManager, "typecheck");
	const strictSyncCommand = formatRunScript(
		packageManager,
		"sync-types",
		"--strict --report json",
	);
	const advancedPersistenceNote = templateHasPersistenceSync(templateId, options)
		? ` ${syncRestCommand} remains available for REST-only refreshes after ${syncTypesCommand}.`
		: "";
	const isCustomTemplate =
		!isBuiltInTemplateId(templateId) &&
		templateId !== OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE;
	const fallbackCustomTemplateNote =
		!hasUnifiedSync &&
		syncSteps.length > 0 &&
		isCustomTemplate
			? `Run ${syncSteps.join(" then ")} manually before build, typecheck, or commit. ${syncCheckCommand} verifies the current type-derived artifacts without rewriting them.${optionalSyncScripts.includes("sync-rest") ? ` ${syncRestCommand} remains available for REST-only refreshes after ${syncTypesCommand}.` : ""}`
			: null;

	if (fallbackCustomTemplateNote) {
		return `${fallbackCustomTemplateNote} Use ${doctorCommand} when you want a quick environment and workspace sanity check.`;
	}

	if (isCustomTemplate && syncSteps.length === 0) {
		return `No optional sync command was detected for this custom template. Use ${doctorCommand} for a quick environment and workspace sanity check, then follow the template's own artifact-refresh guidance before build, typecheck, or your first commit.`;
	}

	return `You usually do not need to run ${syncCommand} during a normal ${formatRunScript(packageManager, developmentScript)} session. Run ${syncCommand} before ${formatRunScript(packageManager, "build")}, ${typecheckCommand}, or ${doctorCommand} when you want a reviewable refresh. ${syncTypesCommand} stays warn-only by default; use \`${failOnLossySyncCommand}\` or \`${strictSyncCommand}\` for stricter CI checks.${advancedPersistenceNote} Generated syncs do not create migration history, so refresh before your first commit if this directory is new.`;
}

/**
 * Returns a shorter optional onboarding note suitable for create completion output.
 */
export function getOptionalOnboardingShortNote(
	packageManager: PackageManagerId,
	templateId = "basic",
	options: SyncOnboardingOptions = {},
): string {
	const normalizedTemplateId = normalizeTemplateLookupId(templateId);
	const doctorCommand = getDoctorVerificationCommand(packageManager);

	if (normalizedTemplateId === "query-loop") {
		return `No sync step is generated for this Query Loop scaffold. Edit the variation files directly, then rerun ${formatRunScript(packageManager, "build")}, ${formatRunScript(packageManager, "typecheck")}, or ${doctorCommand} when you want a review pass.`;
	}

	const optionalSyncScripts = getOptionalSyncScriptNames(normalizedTemplateId, options);
	const developmentScript = getPrimaryDevelopmentScript(normalizedTemplateId);
	const devCommand = formatRunScript(packageManager, developmentScript);
	const isCustomTemplate =
		!isBuiltInTemplateId(normalizedTemplateId) &&
		normalizedTemplateId !== OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE;

	if (isCustomTemplate && optionalSyncScripts.length === 0) {
		return `Follow the template's own artifact-refresh guidance, then use ${doctorCommand} for a quick environment and workspace sanity check.`;
	}

	if (isCustomTemplate && optionalSyncScripts.length > 0) {
		const syncSteps = optionalSyncScripts.map((scriptName) =>
			formatRunScript(packageManager, scriptName),
		);
		return `Run ${syncSteps.join(" then ")} before build, typecheck, or ${doctorCommand} when you want a reviewable refresh.`;
	}

	const syncCommand = formatRunScript(
		packageManager,
		optionalSyncScripts.includes("sync") ? "sync" : "sync-types",
	);

	return `Skip ${syncCommand} during normal ${devCommand} work. Re-run it before build, typecheck, or ${doctorCommand} when you want a reviewable refresh.`;
}

/**
 * Returns the recommended version-control commands for a fresh scaffold.
 */
export function getInitialCommitCommands(): string[] {
	return [...INITIAL_COMMIT_COMMANDS];
}

/**
 * Returns the version-control note shown after the initial scaffold.
 */
export function getInitialCommitNote(): string {
	return "Skip `git init` if this directory already lives inside an existing repository. If you want generated artifacts refreshed before the first checkpoint, run your manual sync step first and then create the commit.";
}

/**
 * Returns source-of-truth guidance for generated artifacts by template mode.
 */
export function getTemplateSourceOfTruthNote(
	templateId: string,
	{ compoundPersistenceEnabled = false }: SyncOnboardingOptions = {},
): string {
	if (templateId === "query-loop") {
		return "`src/index.ts` remains the source of truth for the Query Loop variation name, default query attributes, `allowedControls`, and the minimal inline starter `innerBlocks`. This scaffold intentionally does not generate `src/types.ts`, `block.json`, or Typia manifests because those artifacts belong to standalone block families, not `core/query` variation ownership. Use `src/patterns/*.php` for richer connected layout presets that stay tied to the same variation namespace, use `src/query-extension.ts` for custom query seed values or optional editor-only hook registration, and use `inc/query-runtime.php` to keep frontend and editor preview query mapping aligned for those custom keys. The generated plugin bootstrap should stay focused on script registration, pattern loading, and explicit runtime glue for the variation.";
	}

	if (templateId === "compound") {
		const compoundBase =
			"`src/blocks/*/types.ts` files remain the source of truth for each block's `block.json`, `typia.manifest.json`, and `typia-validator.php`. Fresh scaffolds include starter `typia.manifest.json` files so editor imports resolve before the first sync.";

		if (compoundPersistenceEnabled) {
			return `${compoundBase} For persistence-enabled parents, \`src/blocks/*/api-types.ts\` files remain the source of truth for \`src/blocks/*/api-schemas/*\` when you run \`sync\` or \`sync-rest\`, while \`src/blocks/*/transport.ts\` is the first-class transport seam for editor and frontend requests.`;
		}

		return compoundBase;
	}

	if (templateId === "persistence") {
		return "`src/types.ts` remains the source of truth for `block.json`, `typia.manifest.json`, and `typia-validator.php`. Fresh scaffolds include a starter `typia.manifest.json` so editor imports resolve before the first sync. `src/api-types.ts` remains the source of truth for `src/api-schemas/*` when you run `sync` or `sync-rest`, while `src/transport.ts` is the first-class transport seam for editor and frontend requests. This scaffold is intentionally server-rendered: `src/render.php` is the canonical frontend entry, `src/save.tsx` returns `null`, and session-only write data now refreshes through the dedicated `/bootstrap` endpoint after hydration instead of being frozen into markup.";
	}

	return "`src/types.ts` remains the source of truth for `block.json`, `typia.manifest.json`, and `typia-validator.php`. Fresh scaffolds include a starter `typia.manifest.json` so editor imports resolve before the first sync. The basic scaffold stays static by design: `src/render.php` is only an opt-in server placeholder, `src/save.tsx` remains the canonical frontend output, and the generated webpack config keeps the current `@wordpress/scripts` CommonJS baseline unless you intentionally add `render` to `block.json`.";
}

/**
 * Returns the generated-project extension workflow for compound child blocks.
 */
export function getCompoundExtensionWorkflowSection(
	packageManager: PackageManagerId,
	templateId: string,
): string | null {
	if ( templateId !== "compound" ) {
		return null;
	}

return `## Compound Extension Workflow

\`\`\`bash
${ formatRunScript(
		packageManager,
		"add-child",
		'--slug faq-item --title "FAQ Item"'
	) }

${ formatRunScript(
		packageManager,
		"add-child",
		'--slug section --title "Section" --container --inserter visible'
	) }

${ formatRunScript(
		packageManager,
		"add-child",
		'--slug clause --title "Clause" --ancestor section --dry-run'
	) }

${ formatRunScript(
		packageManager,
		"add-child",
		'--slug clause --title "Clause" --ancestor section'
	) }
\`\`\`

This scaffolds additional compound child block types, updates \`scripts/block-config.ts\` and \`src/blocks/*/children.ts\`, and now supports root-level hidden children, visible container children, and nested ancestor chains for richer document-style block hierarchies. Pass \`--dry-run\` when you want a validated child-graph preview and planned write list before the script mutates files.`;
}

function formatPhpRestExtensionPointsSection({
	apiTypesPath,
	extraNote,
	mainPhpPath,
	mainPhpScope,
	transportPath,
}: PhpRestSectionOptions): string {
	const schemaJsonGlob = apiTypesPath.replace(/api-types\.ts$/u, "api-schemas/*.schema.json");
	const perContractOpenApiGlob = apiTypesPath.replace(
		/api-types\.ts$/u,
		"api-schemas/*.openapi.json",
	);
	const aggregateOpenApiPath = apiTypesPath.replace(/api-types\.ts$/u, "api.openapi.json");

	const lines = [
		`- Edit \`${mainPhpPath}\` when you need to ${mainPhpScope}.`,
		"- Edit `inc/rest-auth.php` or `inc/rest-public.php` when you need to customize write permissions or token/request-id/nonce checks for the selected policy.",
		`- Edit \`${transportPath}\` when you need to switch between direct WordPress REST and a contract-compatible proxy or BFF without changing the endpoint contracts.`,
		`- Keep \`${apiTypesPath}\` as the source of truth for request and response contracts, then regenerate \`${schemaJsonGlob}\`, per-contract \`${perContractOpenApiGlob}\`, and \`${aggregateOpenApiPath}\` with \`sync\` (or \`sync-rest\` after \`sync-types\` when you only need the REST layer).`,
		"- Avoid hand-editing generated schema and OpenAPI artifacts unless you are debugging generated output; they are meant to be regenerated from TypeScript contracts.",
	];

	if (typeof extraNote === "string" && extraNote.length > 0) {
		lines.push(`- ${extraNote}`);
	}

	return `## PHP REST Extension Points\n\n${lines.join("\n")}`;
}

/**
 * Returns scaffold-local guidance for the main PHP REST customization points.
 */
export function getPhpRestExtensionPointsSection(
	templateId: string,
	{ compoundPersistenceEnabled = false, slug }: PhpRestExtensionOptions,
): string | null {
	if (templateId === "persistence") {
		return formatPhpRestExtensionPointsSection({
			apiTypesPath: "src/api-types.ts",
			mainPhpPath: `${slug}.php`,
			mainPhpScope: "change storage helpers, route handlers, response shaping, or route registration",
			transportPath: "src/transport.ts",
			extraNote: "Keep durable state on the `/state` endpoints and treat the dedicated `/bootstrap` endpoint as the place to return fresh session-only write access data such as nonces or public write tokens.",
		});
	}

	if (templateId === "compound" && compoundPersistenceEnabled) {
		return formatPhpRestExtensionPointsSection({
			apiTypesPath: `src/blocks/${slug}/api-types.ts`,
			extraNote: "The hidden child block does not own REST routes or storage. Keep durable parent-block state on the `/state` endpoints and return fresh session-only write access data from the dedicated `/bootstrap` endpoint.",
			mainPhpPath: `${slug}.php`,
			mainPhpScope:
				"change parent-block storage helpers, route handlers, response shaping, or route registration",
			transportPath: `src/blocks/${slug}/transport.ts`,
		});
	}

	return null;
}
