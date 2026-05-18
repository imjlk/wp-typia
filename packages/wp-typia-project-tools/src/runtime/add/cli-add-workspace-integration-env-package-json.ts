import { promises as fsp } from "node:fs";
import path from "node:path";

import type { IntegrationEnvServiceId } from "./cli-add-shared.js";
import { readJsonFile } from "../shared/json-utils.js";
import {
	formatRunScript,
	type PackageManagerId,
} from "../shared/package-managers.js";
import { DEFAULT_WORDPRESS_ENV_VERSION } from "../shared/package-versions.js";

interface IntegrationEnvPackageJson {
	devDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
}

function addScriptIfMissing({
	scriptName,
	scripts,
	scriptValue,
	warnings,
}: {
	scriptName: string;
	scripts: Record<string, string>;
	scriptValue: string;
	warnings: string[];
}) {
	if (scripts[scriptName] === undefined) {
		scripts[scriptName] = scriptValue;
		return;
	}

	if (scripts[scriptName] !== scriptValue) {
		warnings.push(
			`Preserved existing package script "${scriptName}"; add "${scriptValue}" manually if you want the generated integration command.`,
		);
	}
}

/**
 * Read, mutate, and persist a workspace package manifest for integration-env
 * scaffolding.
 *
 * @param projectDir Absolute official workspace project directory.
 * @param mutate Callback that mutates the parsed package manifest.
 * @returns A promise that resolves after `package.json` is written.
 */
export async function mutateIntegrationEnvPackageJson(
	projectDir: string,
	mutate: (packageJson: IntegrationEnvPackageJson) => void,
): Promise<void> {
	const packageJsonPath = path.join(projectDir, "package.json");
	const packageJson = await readJsonFile<IntegrationEnvPackageJson>(
		packageJsonPath,
		{
			context: "integration env package manifest",
		},
	);

	mutate(packageJson);

	await fsp.writeFile(
		packageJsonPath,
		`${JSON.stringify(packageJson, null, "\t")}\n`,
		"utf8",
	);
}

/**
 * Add integration-env dev dependency and package scripts when they are missing,
 * preserving user-defined script values with warnings.
 *
 * @param options Package mutation options.
 * @param options.integrationEnvSlug Normalized integration environment slug.
 * @param options.packageManager Package manager used for generated run scripts.
 * @param options.packageJson Mutable parsed workspace package manifest.
 * @param options.service Selected optional local service starter.
 * @param options.withReleaseZip Whether release zip package scripts should be added.
 * @param options.warnings Mutable warning collection for preserved script values.
 * @param options.withWpEnv Whether wp-env scripts and dependency should be added.
 */
export function addIntegrationEnvPackageJsonEntries({
	integrationEnvSlug,
	packageManager,
	packageJson,
	withReleaseZip,
	service,
	warnings,
	withWpEnv,
}: {
	integrationEnvSlug: string;
	packageManager: PackageManagerId;
	packageJson: IntegrationEnvPackageJson;
	service: IntegrationEnvServiceId;
	withReleaseZip: boolean;
	warnings: string[];
	withWpEnv: boolean;
}): void {
	const devDependencies = {
		...(packageJson.devDependencies ?? {}),
	};
	if (withWpEnv && devDependencies["@wordpress/env"] === undefined) {
		devDependencies["@wordpress/env"] = DEFAULT_WORDPRESS_ENV_VERSION;
	}
	packageJson.devDependencies = devDependencies;
	const scripts = {
		...(packageJson.scripts ?? {}),
	};

	addScriptIfMissing({
		scriptName: `smoke:${integrationEnvSlug}`,
		scriptValue: `node scripts/integration-smoke/${integrationEnvSlug}.mjs`,
		scripts,
		warnings,
	});
	addScriptIfMissing({
		scriptName: "smoke:integration",
		scriptValue: formatRunScript(packageManager, `smoke:${integrationEnvSlug}`),
		scripts,
		warnings,
	});

	if (withWpEnv) {
		addScriptIfMissing({
			scriptName: "wp-env:start",
			scriptValue: "wp-env start",
			scripts,
			warnings,
		});
		addScriptIfMissing({
			scriptName: "wp-env:stop",
			scriptValue: "wp-env stop",
			scripts,
			warnings,
		});
		addScriptIfMissing({
			scriptName: "wp-env:reset",
			scriptValue: "wp-env destroy all && wp-env start",
			scripts,
			warnings,
		});
	}

	if (withReleaseZip) {
		addScriptIfMissing({
			scriptName: "release:zip",
			scriptValue: `${formatRunScript(packageManager, "sync-rest:package")} && ${formatRunScript(packageManager, "build")} && wp-scripts plugin-zip`,
			scripts,
			warnings,
		});
		addScriptIfMissing({
			scriptName: "release:zip:check",
			scriptValue: `${formatRunScript(packageManager, "sync-rest:package:check")} && ${formatRunScript(packageManager, "build")}`,
			scripts,
			warnings,
		});
		addScriptIfMissing({
			scriptName: "qa:check",
			scriptValue: `${formatRunScript(packageManager, "wp-typia:doctor:workspace")} && ${formatRunScript(packageManager, "release:zip:check")}`,
			scripts,
			warnings,
		});
	}

	if (service === "docker-compose") {
		addScriptIfMissing({
			scriptName: "service:start",
			scriptValue: "docker compose -f docker-compose.integration.yml up -d",
			scripts,
			warnings,
		});
		addScriptIfMissing({
			scriptName: "service:stop",
			scriptValue: "docker compose -f docker-compose.integration.yml down",
			scripts,
			warnings,
		});
	}

	packageJson.scripts = scripts;
}
