import { promises as fsp } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import { syncBlockMetadata } from "@wp-typia/block-runtime/metadata-core";

import {
	applyGeneratedProjectDxPackageJson,
	applyLocalDevPresetFiles,
} from "./local-dev-presets.js";
import { applyMigrationUiCapability } from "../migration/migration-ui-capability.js";
import {
	syncPersistenceRestArtifacts,
} from "../add/persistence-rest-artifacts.js";
import {
	buildGitignore,
	buildReadme,
	mergeTextLines,
} from "./scaffold-documents.js";
import {
	getStarterManifestFiles,
	stringifyStarterManifest,
} from "./starter-manifests.js";
import {
	formatNonEmptyTargetDirectoryError,
} from "./scaffold-bootstrap.js";
import {
	stringifyBuiltInBlockJsonDocument,
	type BuiltInBlockArtifact,
} from "./built-in-block-artifacts.js";
import type { BuiltInCodeArtifact } from "./built-in-block-code-artifacts.js";
import {
	buildBuiltInBlockMetadataSyncOptions,
	buildBuiltInPersistenceRestSyncOptions,
} from "./scaffold-compiler-artifacts.js";
import {
	type BuiltInTemplateId,
	PROJECT_TOOLS_PACKAGE_ROOT,
} from "./template-registry.js";
import { copyInterpolatedDirectory } from "./template-render.js";
import type { PackageManagerId } from "../shared/package-managers.js";
import {
	formatInstallCommand,
	transformPackageManagerText,
} from "../shared/package-managers.js";
import {
	pathExists,
	readOptionalUtf8File,
} from "../shared/fs-async.js";
import { normalizePackageJson } from "./scaffold-package-manager-files.js";
export {
	applyWorkspaceMigrationCapability,
	isOfficialWorkspaceProject,
} from "./scaffold-bootstrap.js";
import {
	replaceRepositoryReferencePlaceholders,
	resolveScaffoldRepositoryReference,
} from "./scaffold-repository-reference.js";
import type {
	ScaffoldProgressEvent,
	ScaffoldTemplateVariables,
} from "./scaffold.js";
import { isCompoundPersistenceEnabled } from "./scaffold-template-variable-groups.js";
export { buildGitignore, buildReadme, mergeTextLines } from "./scaffold-documents.js";

export interface InstallDependenciesOptions {
	packageManager: PackageManagerId;
	projectDir: string;
}

async function reportScaffoldProgress(
	onProgress:
		| ((event: ScaffoldProgressEvent) => void | Promise<void>)
		| undefined,
	event: ScaffoldProgressEvent,
): Promise<void> {
	await onProgress?.(event);
}

const EPHEMERAL_NODE_MODULES_LINK_TYPE = process.platform === "win32" ? "junction" : "dir";
const LOCKFILES: Record<PackageManagerId, string[]> = {
	bun: ["bun.lock", "bun.lockb"],
	npm: ["package-lock.json"],
	pnpm: ["pnpm-lock.yaml"],
	yarn: ["yarn.lock"],
};

export async function ensureDirectory(targetDir: string, allowExisting = false): Promise<void> {
	await fsp.mkdir(targetDir, { recursive: true });

	if (allowExisting) {
		return;
	}

	const entries = await fsp.readdir(targetDir);
	if (entries.length > 0) {
		throw new Error(formatNonEmptyTargetDirectoryError(targetDir));
	}
}

export async function writeStarterManifestFiles(
	targetDir: string,
	templateId: string,
	variables: ScaffoldTemplateVariables,
	artifacts?: readonly BuiltInBlockArtifact[],
): Promise<void> {
	const manifests = artifacts
		? artifacts.map((artifact) => ({
				document: artifact.manifestDocument,
				relativePath: `${artifact.relativeDir}/typia.manifest.json`,
			}))
		: getStarterManifestFiles(templateId, variables);

	for (const { document, relativePath } of manifests) {
		const destinationPath = path.join(targetDir, relativePath);
		await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
		await fsp.writeFile(destinationPath, stringifyStarterManifest(document), "utf8");
	}
}

async function writeBuiltInStructuralArtifacts(
	targetDir: string,
	artifacts: readonly BuiltInBlockArtifact[],
): Promise<void> {
	for (const artifact of artifacts) {
		const destinationDir = path.join(targetDir, artifact.relativeDir);
		await fsp.mkdir(destinationDir, { recursive: true });
		await fsp.writeFile(
			path.join(destinationDir, "types.ts"),
			artifact.typesSource,
			"utf8",
		);
		await fsp.writeFile(
			path.join(destinationDir, "block.json"),
			stringifyBuiltInBlockJsonDocument(artifact.blockJsonDocument),
			"utf8",
		);
	}
}

async function writeBuiltInCodeArtifacts(
	targetDir: string,
	codeArtifacts: readonly BuiltInCodeArtifact[],
): Promise<void> {
	for (const artifact of codeArtifacts) {
		const destinationPath = path.join(targetDir, artifact.relativePath);
		await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
		await fsp.writeFile(destinationPath, artifact.source, "utf8");
	}
}

async function resolveScaffoldGeneratorNodeModulesPath(): Promise<string | null> {
	const candidates = [
		path.join(PROJECT_TOOLS_PACKAGE_ROOT, "node_modules"),
		path.resolve(PROJECT_TOOLS_PACKAGE_ROOT, "..", ".."),
		path.resolve(PROJECT_TOOLS_PACKAGE_ROOT, "..", "..", "node_modules"),
	];

	for (const candidate of candidates) {
		if (await pathExists(path.join(candidate, "typia", "package.json"))) {
			return candidate;
		}
	}

	return null;
}

async function withEphemeralScaffoldNodeModules(
	targetDir: string,
	callback: () => Promise<void>,
): Promise<void> {
	const targetNodeModulesPath = path.join(targetDir, "node_modules");
	if (await pathExists(targetNodeModulesPath)) {
		await callback();
		return;
	}

	const sourceNodeModulesPath = await resolveScaffoldGeneratorNodeModulesPath();
	if (!sourceNodeModulesPath) {
		throw new Error(
			"Unable to resolve a node_modules directory with typia for scaffold-time artifact generation.",
		);
	}

	await fsp.symlink(sourceNodeModulesPath, targetNodeModulesPath, EPHEMERAL_NODE_MODULES_LINK_TYPE);

	try {
		await callback();
	} finally {
		await fsp.rm(targetNodeModulesPath, { force: true, recursive: true });
	}
}

/**
 * Generate the same canonical block metadata artifacts that the scaffold's
 * checked-in `sync-types` script will verify after dependencies are installed.
 */
export async function seedBuiltInBlockMetadataArtifacts(
	targetDir: string,
	templateId: BuiltInTemplateId,
	artifacts: readonly BuiltInBlockArtifact[],
): Promise<void> {
	const syncOptions = buildBuiltInBlockMetadataSyncOptions(
		targetDir,
		templateId,
		artifacts,
	);
	if (syncOptions.length === 0) {
		return;
	}

	await withEphemeralScaffoldNodeModules(targetDir, async () => {
		for (const options of syncOptions) {
			await syncBlockMetadata(options);
		}
	});
}

/**
 * Seed REST-derived persistence artifacts into a newly scaffolded built-in
 * project before the first manual `sync-rest` run.
 */
export async function seedBuiltInPersistenceArtifacts(
	targetDir: string,
	templateId: BuiltInTemplateId,
	variables: ScaffoldTemplateVariables,
): Promise<void> {
	const syncOptions = buildBuiltInPersistenceRestSyncOptions(
		targetDir,
		templateId,
		variables,
	);
	if (!syncOptions) {
		return;
	}

	await withEphemeralScaffoldNodeModules(targetDir, async () => {
		await syncPersistenceRestArtifacts(syncOptions);
	});
}

export async function normalizePackageManagerFiles(
	targetDir: string,
	packageManagerId: PackageManagerId,
): Promise<void> {
	const yarnRcPath = path.join(targetDir, ".yarnrc.yml");

	if (packageManagerId === "yarn") {
		await fsp.writeFile(yarnRcPath, "nodeLinker: node-modules\n", "utf8");
		return;
	}

	await fsp.rm(yarnRcPath, { force: true });
}

export async function removeQueryLoopPlaceholderFiles(
	projectDir: string,
	templateId: string,
): Promise<void> {
	if (templateId !== "query-loop") {
		return;
	}

	await fsp.rm(path.join(projectDir, "src", "validator-toolkit.ts"), {
		force: true,
	});
}

export async function removeUnexpectedLockfiles(
	targetDir: string,
	packageManagerId: PackageManagerId,
): Promise<void> {
	const keep = new Set(LOCKFILES[packageManagerId] ?? []);
	const allLockfiles = Object.values(LOCKFILES).flat();

	await Promise.all(
		allLockfiles.map(async (filename) => {
			if (keep.has(filename)) {
				return;
			}

			await fsp.rm(path.join(targetDir, filename), { force: true });
		}),
	);
}

/**
 * Recursively normalizes generated text files for the selected package manager
 * and repository reference.
 */
export async function replaceTextRecursively(
	targetDir: string,
	packageManagerId: PackageManagerId,
	{
		repositoryManifestPaths,
		repositoryReference,
	}: {
		repositoryManifestPaths?: readonly string[];
		repositoryReference?: string;
	} = {},
): Promise<void> {
	const textExtensions = new Set([
		".css",
		".js",
		".json",
		".jsx",
		".md",
		".php",
		".scss",
		".ts",
		".tsx",
		".txt",
	]);
	const resolvedRepositoryReference =
		repositoryReference ??
		resolveScaffoldRepositoryReference({
			manifestPaths: repositoryManifestPaths,
		});

	async function visit(currentPath: string): Promise<void> {
		const stats = await fsp.stat(currentPath);
		if (stats.isDirectory()) {
			const entries = await fsp.readdir(currentPath);
			for (const entry of entries) {
				await visit(path.join(currentPath, entry));
			}
			return;
		}

		if (path.basename(currentPath) === "package.json" || !textExtensions.has(path.extname(currentPath))) {
			return;
		}

		const content = await fsp.readFile(currentPath, "utf8");
		const nextContent = replaceRepositoryReferencePlaceholders(
			transformPackageManagerText(content, packageManagerId),
			resolvedRepositoryReference,
		);

		if (nextContent !== content) {
			await fsp.writeFile(currentPath, nextContent, "utf8");
		}
	}

	await visit(targetDir);
}

export async function defaultInstallDependencies({
	projectDir,
	packageManager,
}: InstallDependenciesOptions): Promise<void> {
	execSync(formatInstallCommand(packageManager), {
		cwd: projectDir,
		stdio: "inherit",
	});
}

/**
 * Applies a built-in scaffold into the target directory, including generated
 * code artifacts, starter manifests, preset files, and placeholder rewrites.
 */
export async function applyBuiltInScaffoldProjectFiles({
	projectDir,
	templateDir,
	templateId,
	variables,
	artifacts,
	codeArtifacts,
	readmeContent,
	gitignoreContent,
	allowExistingDir = false,
	packageManager,
	withMigrationUi = false,
	withTestPreset = false,
	withWpEnv = false,
	noInstall = false,
	installDependencies,
	repositoryReference,
	onProgress,
	seedCompilerArtifacts = true,
}: {
	projectDir: string;
	templateDir: string;
	templateId: BuiltInTemplateId;
	variables: ScaffoldTemplateVariables;
	artifacts?: readonly BuiltInBlockArtifact[];
	codeArtifacts?: readonly BuiltInCodeArtifact[];
	readmeContent?: string;
	gitignoreContent?: string;
	allowExistingDir?: boolean;
	packageManager: PackageManagerId;
	withMigrationUi?: boolean;
	withTestPreset?: boolean;
	withWpEnv?: boolean;
	noInstall?: boolean;
	installDependencies?: ((options: InstallDependenciesOptions) => Promise<void>) | undefined;
	repositoryReference?: string;
	onProgress?: ((event: ScaffoldProgressEvent) => void | Promise<void>) | undefined;
	seedCompilerArtifacts?: boolean;
}): Promise<void> {
	await ensureDirectory(projectDir, allowExistingDir);
	await reportScaffoldProgress(onProgress, {
		detail: "Copying built-in template files and writing generated source modules.",
		phase: "generate-files",
		title: "Generating project files",
	});
	await copyInterpolatedDirectory(templateDir, projectDir, variables);
	if (codeArtifacts && codeArtifacts.length > 0) {
		await writeBuiltInCodeArtifacts(projectDir, codeArtifacts);
	}
	if (artifacts && artifacts.length > 0) {
		await writeBuiltInStructuralArtifacts(projectDir, artifacts);
	}
	await reportScaffoldProgress(onProgress, {
		detail: "Writing starter manifests, local presets, and seeded template artifacts.",
		phase: "seed-artifacts",
		title: "Seeding scaffold artifacts",
	});
	await writeStarterManifestFiles(projectDir, templateId, variables, artifacts);
	await applyLocalDevPresetFiles({
		projectDir,
		variables,
		withTestPreset,
		withWpEnv,
	});
	if (withMigrationUi) {
		await applyMigrationUiCapability({
			packageManager,
			projectDir,
			templateId,
			variables,
		});
	}

	await reportScaffoldProgress(onProgress, {
		detail: "Writing README, normalizing package metadata, and aligning package-manager files.",
		phase: "finalize-project",
		title: "Finalizing scaffold output",
	});
	const readmePath = path.join(projectDir, "README.md");
	if (!(await pathExists(readmePath))) {
		await fsp.writeFile(
			readmePath,
			readmeContent ??
				buildReadme(templateId, variables, packageManager, {
					withMigrationUi,
					withTestPreset,
					withWpEnv,
				}),
			"utf8",
		);
	}
	const gitignorePath = path.join(projectDir, ".gitignore");
	const existingGitignore = await readOptionalUtf8File(gitignorePath) ?? "";
	await fsp.writeFile(
		gitignorePath,
		mergeTextLines(gitignoreContent ?? buildGitignore(), existingGitignore),
		"utf8",
	);
	await normalizePackageJson(projectDir, packageManager);
	await applyGeneratedProjectDxPackageJson({
		compoundPersistenceEnabled: isCompoundPersistenceEnabled(variables),
		packageManager,
		projectDir,
		templateId,
		withTestPreset,
		withWpEnv,
	});
	await removeQueryLoopPlaceholderFiles(projectDir, templateId);
	await normalizePackageManagerFiles(projectDir, packageManager);
	await removeUnexpectedLockfiles(projectDir, packageManager);
	await replaceTextRecursively(projectDir, packageManager, {
		repositoryReference,
	});
	if (seedCompilerArtifacts) {
		await seedBuiltInBlockMetadataArtifacts(projectDir, templateId, artifacts ?? []);
		await seedBuiltInPersistenceArtifacts(projectDir, templateId, variables);
	}

	if (!noInstall) {
		await reportScaffoldProgress(onProgress, {
			detail: "Installing project dependencies with the selected package manager.",
			phase: "install-dependencies",
			title: "Installing dependencies",
		});
		const installer = installDependencies ?? defaultInstallDependencies;
		await installer({
			projectDir,
			packageManager,
		});
	}
}
