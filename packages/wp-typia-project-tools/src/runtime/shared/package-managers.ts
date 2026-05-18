import fs from "node:fs";
import path from "node:path";

import { readJsonFileSync } from "./json-utils.js";

export type PackageManagerId = "bun" | "npm" | "pnpm" | "yarn";

export interface PackageManagerDefinition {
	id: PackageManagerId;
	label: string;
	packageManagerField: string;
	installCommand: string;
	frozenInstallCommand: string;
}

const PACKAGE_MANAGER_DATA: PackageManagerDefinition[] = [
	{
		id: "bun",
		label: "Bun",
		packageManagerField: "bun@1.3.11",
		installCommand: "bun install",
		frozenInstallCommand: "bun install --frozen-lockfile",
	},
	{
		id: "npm",
		label: "npm",
		packageManagerField: "npm@11.6.1",
		installCommand: "npm install --no-audit",
		frozenInstallCommand: "npm ci",
	},
	{
		id: "pnpm",
		label: "pnpm",
		packageManagerField: "pnpm@8.3.1",
		installCommand: "pnpm install",
		frozenInstallCommand: "pnpm install --frozen-lockfile",
	},
	{
		id: "yarn",
		label: "Yarn",
		packageManagerField: "yarn@3.2.4",
		installCommand: "yarn install",
		frozenInstallCommand: "yarn install --frozen-lockfile",
	},
];

const PACKAGE_MANAGER_LOCKFILE_SIGNALS = [
	{ id: "bun", filenames: ["bun.lock", "bun.lockb"] },
	{ id: "pnpm", filenames: ["pnpm-lock.yaml"] },
	{
		id: "yarn",
		filenames: ["yarn.lock", ".pnp.cjs", ".pnp.loader.mjs", ".yarnrc.yml"],
	},
	{ id: "npm", filenames: ["package-lock.json", "npm-shrinkwrap.json"] },
] as const satisfies Array<{
	filenames: string[];
	id: PackageManagerId;
}>;

export const PACKAGE_MANAGER_IDS = PACKAGE_MANAGER_DATA.map((manager) => manager.id) as PackageManagerId[];
export const PACKAGE_MANAGERS = Object.freeze(
	Object.fromEntries(
		PACKAGE_MANAGER_DATA.map((manager) => [manager.id, manager]),
	) as Record<PackageManagerId, PackageManagerDefinition>,
);

const DEV_INSTALL_FLAGS = {
	bun: "add -d",
	npm: "install --save-dev",
	pnpm: "add -D",
	yarn: "add -D",
};

const STOP_CHARS = new Set(["\n", "\r", "`", "\"", "'", ")", "]", "}", "!", ",", "."]);

export function getPackageManager(id: string): PackageManagerDefinition {
	const manager = PACKAGE_MANAGERS[id as PackageManagerId];
	if (!manager) {
		throw new Error(
			`Unknown package manager "${id}". Expected one of: ${PACKAGE_MANAGER_IDS.join(", ")}`,
		);
	}
	return manager;
}

/**
 * Parse a normalized package-manager id from a package.json `packageManager` field.
 *
 * @param packageManagerField Raw field value such as `pnpm@8.3.1`.
 * @returns A supported package manager id, or null when the field is missing or unsupported.
 */
export function parsePackageManagerField(
	packageManagerField: string | undefined,
): PackageManagerId | null {
	const packageManagerId = packageManagerField?.split("@", 1)[0];
	return PACKAGE_MANAGER_IDS.includes(packageManagerId as PackageManagerId)
		? (packageManagerId as PackageManagerId)
		: null;
}

function readPackageManagerField(projectDir: string): string | undefined {
	try {
		const packageJsonPath = path.join(projectDir, "package.json");
		if (!fs.existsSync(packageJsonPath)) {
			return undefined;
		}

		const manifest = readJsonFileSync<{
			packageManager?: unknown;
		}>(packageJsonPath, {
			context: "package manager manifest",
		});
		return typeof manifest.packageManager === "string"
			? manifest.packageManager
			: undefined;
	} catch {
		// Package manager inference intentionally falls back to lockfile signals
		// when package.json is absent or malformed.
		return undefined;
	}
}

/**
 * Infer the package manager used by a project from package.json and lockfile signals.
 *
 * `packageManager` fields take precedence over lockfiles, then lockfile and PnP
 * markers are checked in Bun, pnpm, Yarn, npm order. npm remains the fallback so
 * generated projects without explicit metadata keep the historical CLI default.
 *
 * @param projectDir Project root to inspect.
 * @param packageManagerField Optional already-read package.json field.
 * @returns The inferred package manager id.
 */
export function inferPackageManagerId(
	projectDir: string,
	packageManagerField?: string,
): PackageManagerId {
	const fieldPackageManager =
		parsePackageManagerField(packageManagerField) ??
		parsePackageManagerField(readPackageManagerField(projectDir));
	if (fieldPackageManager) {
		return fieldPackageManager;
	}

	for (const signal of PACKAGE_MANAGER_LOCKFILE_SIGNALS) {
		if (
			signal.filenames.some((filename) =>
				fs.existsSync(path.join(projectDir, filename)),
			)
		) {
			return signal.id;
		}
	}

	return "npm";
}

export function getPackageManagerSelectOptions(): Array<{
	label: string;
	value: PackageManagerId;
	hint: string;
}> {
	return PACKAGE_MANAGER_DATA.map((manager) => ({
		label: manager.label,
		value: manager.id,
		hint: manager.installCommand,
	}));
}

export function formatRunScript(packageManagerId: PackageManagerId, scriptName: string, extraArgs = ""): string {
	const args = extraArgs.trim();

	if (packageManagerId === "bun") {
		return args ? `bun run ${scriptName} ${args}` : `bun run ${scriptName}`;
	}
	if (packageManagerId === "npm") {
		return args ? `npm run ${scriptName} -- ${args}` : `npm run ${scriptName}`;
	}
	if (packageManagerId === "pnpm") {
		return args ? `pnpm run ${scriptName} ${args}` : `pnpm run ${scriptName}`;
	}

	return args ? `yarn run ${scriptName} ${args}` : `yarn run ${scriptName}`;
}

export function formatInstallCommand(packageManagerId: PackageManagerId): string {
	return getPackageManager(packageManagerId).installCommand;
}

/**
 * Format a package-manager-specific devDependency install command.
 *
 * @param packageManagerId Package manager identifier.
 * @param packages Package specifiers to add as devDependencies.
 * @returns Command string suitable for shell execution.
 */
export function formatAddDevDependenciesCommand(
	packageManagerId: PackageManagerId,
	packages: string[],
): string {
	if (packages.length === 0) {
		return formatInstallCommand(packageManagerId);
	}

	return `${packageManagerId} ${DEV_INSTALL_FLAGS[packageManagerId]} ${packages.join(" ")}`;
}

/**
 * Format a package-manager-specific one-off package execution command.
 *
 * @param packageManagerId Package manager identifier.
 * @param packageName Executable package name.
 * @param extraArgs Optional extra CLI arguments appended after the package name.
 * @returns Command string suitable for shell execution.
 */
export function formatPackageExecCommand(
	packageManagerId: PackageManagerId,
	packageName: string,
	extraArgs = "",
): string {
	const args = extraArgs.trim();

	if (packageManagerId === "bun") {
		return args ? `bunx ${packageName} ${args}` : `bunx ${packageName}`;
	}
	if (packageManagerId === "npm") {
		return args ? `npx --yes ${packageName} ${args}` : `npx --yes ${packageName}`;
	}
	if (packageManagerId === "pnpm") {
		return args ? `pnpm dlx ${packageName} ${args}` : `pnpm dlx ${packageName}`;
	}

	return args ? `yarn dlx ${packageName} ${args}` : `yarn dlx ${packageName}`;
}

function consumeCommandArguments(content: string, startIndex: number): {
	args: string;
	cursor: number;
} {
	let cursor = startIndex;
	let args = "";

	while (cursor < content.length) {
		const current = content[cursor];
		if (
			STOP_CHARS.has(current) ||
			content.startsWith("&&", cursor) ||
			content.startsWith("||", cursor) ||
			current === ";"
		) {
			break;
		}

		args += current;
		cursor += 1;
	}

	return {
		args: args.trim(),
		cursor,
	};
}

function replaceBunRunCommands(content: string, packageManagerId: PackageManagerId): string {
	const marker = "bun run ";
	let result = "";
	let cursor = 0;

	while (cursor < content.length) {
		const index = content.indexOf(marker, cursor);
		if (index === -1) {
			result += content.slice(cursor);
			break;
		}

		if (index > 0 && /[A-Za-z0-9_-]/.test(content[index - 1])) {
			result += content.slice(cursor, index + marker.length);
			cursor = index + marker.length;
			continue;
		}

		result += content.slice(cursor, index);
		const scriptNameStart = index + marker.length;
		const scriptNameMatch = /^[A-Za-z0-9:_-]+/.exec(content.slice(scriptNameStart));
		if (!scriptNameMatch) {
			result += marker;
			cursor = scriptNameStart;
			continue;
		}

		const scriptName = scriptNameMatch[0];
		const argsStart = scriptNameStart + scriptName.length;
		const { args, cursor: nextCursor } = consumeCommandArguments(content, argsStart);
		result += formatRunScript(packageManagerId, scriptName, args);
		cursor = nextCursor;
	}

	return result;
}

function replaceDevDependencyInstalls(content: string, packageManagerId: PackageManagerId): string {
	return content.replace(/\bbun add -d ([^\s&|;`"'()]+)\b/g, (_, packageName) => {
		if (packageManagerId === "bun") {
			return `bun add -d ${packageName}`;
		}

		return `${packageManagerId} ${DEV_INSTALL_FLAGS[packageManagerId]} ${packageName}`;
	});
}

export function transformPackageManagerText(content: string, packageManagerId: PackageManagerId): string {
	const manager = getPackageManager(packageManagerId);

	return replaceDevDependencyInstalls(
		replaceBunRunCommands(
			content
				.replace(/\bbun install --frozen-lockfile\b/g, manager.frozenInstallCommand)
				.replace(/\bbun install\b/g, manager.installCommand),
			packageManagerId,
		),
		packageManagerId,
	)
		.replace(/\s*&&\s*/g, " && ")
		.replace(/\s*\|\|\s*/g, " || ");
}
