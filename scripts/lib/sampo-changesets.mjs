#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { DEPENDENCY_FIELDS } from "../publish-package-utils.mjs";

export const CHANGESET_DIR = path.join(".sampo", "changesets");
export const WORKSPACE_ROOTS = ["packages"];
const WORKSPACE_PACKAGE_MANIFEST_PATTERN = /^packages\/[^/]+\/package\.json$/u;
export const RELEASE_TYPE_PRIORITY = {
	patch: 0,
	minor: 1,
	major: 2,
};
const CHANGESET_COVERAGE_IGNORED_DIRECTORIES = new Set(["coverage", "test", "tests"]);

export function toPosixRelativePath(repoRoot, targetPath) {
	const pathApi =
		repoRoot.includes("\\") || targetPath.includes("\\") ? path.win32 : path;
	return pathApi.relative(repoRoot, targetPath).split(pathApi.sep).join("/");
}

export function findPublishablePackages(repoRoot) {
	const packages = [];

	for (const rootDir of WORKSPACE_ROOTS) {
		const absoluteRoot = path.join(repoRoot, rootDir);
		if (!fs.existsSync(absoluteRoot)) {
			continue;
		}

		for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
			if (!entry.isDirectory()) {
				continue;
			}

			const packageDir = path.posix.join(rootDir, entry.name);
			const packageJsonPath = path.join(repoRoot, packageDir, "package.json");
			if (!fs.existsSync(packageJsonPath)) {
				continue;
			}

			const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
			if (pkg.private || typeof pkg.name !== "string" || pkg.name.length === 0) {
				continue;
			}

			packages.push({
				packageDir,
				packageId: `npm/${pkg.name}`,
				packageJsonPath,
				packageName: pkg.name,
				version: pkg.version,
			});
		}
	}

	return packages.sort((left, right) => left.packageId.localeCompare(right.packageId));
}

export function findPublishablePackageIds(repoRoot) {
	return findPublishablePackages(repoRoot).map(({ packageId }) => packageId);
}

export function parseChangesetFrontmatter(source, filePath = "<changeset>") {
	const lines = source.split(/\r?\n/u);

	if (lines[0] !== "---") {
		throw new Error(`${filePath}: expected frontmatter to start with ---`);
	}

	const entries = [];
	const seen = new Set();
	let closingIndex = -1;

	for (let index = 1; index < lines.length; index += 1) {
		const rawLine = lines[index];
		const line = rawLine.trim();

		if (line === "---") {
			closingIndex = index;
			break;
		}

		if (line === "" || line.startsWith("#")) {
			continue;
		}

		const separatorIndex = rawLine.indexOf(":");
		if (separatorIndex <= 0) {
			throw new Error(`${filePath}: malformed frontmatter line "${rawLine}"`);
		}

		const packageId = rawLine.slice(0, separatorIndex).trim();
		const releaseType = rawLine.slice(separatorIndex + 1).trim();

		if (packageId.length === 0 || releaseType.length === 0) {
			throw new Error(`${filePath}: malformed frontmatter line "${rawLine}"`);
		}

		if (!Object.hasOwn(RELEASE_TYPE_PRIORITY, releaseType)) {
			throw new Error(`${filePath}: unsupported release type "${releaseType}" for "${packageId}"`);
		}

		if (seen.has(packageId)) {
			throw new Error(`${filePath}: duplicate package id "${packageId}" in frontmatter`);
		}

		seen.add(packageId);
		entries.push({ packageId, releaseType });
	}

	if (closingIndex === -1) {
		throw new Error(`${filePath}: missing closing --- for frontmatter`);
	}

	if (entries.length === 0) {
		throw new Error(`${filePath}: frontmatter must declare at least one package id`);
	}

	return entries;
}

export function getChangesetFiles(repoRoot) {
	const absoluteChangesetDir = path.join(repoRoot, CHANGESET_DIR);
	if (!fs.existsSync(absoluteChangesetDir)) {
		return [];
	}

	return fs
		.readdirSync(absoluteChangesetDir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => path.join(absoluteChangesetDir, entry.name))
		.sort();
}

export function readPendingChangesets(repoRoot) {
	return getChangesetFiles(repoRoot).map((filePath) => {
		const relativePath = toPosixRelativePath(repoRoot, filePath);
		return {
			entries: parseChangesetFrontmatter(fs.readFileSync(filePath, "utf8"), relativePath),
			filePath,
			relativePath,
		};
	});
}

export function collectPendingReleaseTypes(repoRoot) {
	const releaseTypes = new Map();

	for (const { entries } of readPendingChangesets(repoRoot)) {
		for (const { packageId, releaseType } of entries) {
			const current = releaseTypes.get(packageId);
			if (
				current === undefined ||
				RELEASE_TYPE_PRIORITY[releaseType] > RELEASE_TYPE_PRIORITY[current]
			) {
				releaseTypes.set(packageId, releaseType);
			}
		}
	}

	return releaseTypes;
}

export function isReleaseRelevantPackagePath(packageDir, changedPath) {
	const normalizedPackageDir = packageDir.replaceAll("\\", "/");
	const normalizedChangedPath = changedPath.replaceAll("\\", "/").replace(/^\.\/+/, "");
	const packagePrefix = `${normalizedPackageDir}/`;

	if (!normalizedChangedPath.startsWith(packagePrefix)) {
		return false;
	}

	const packageRelativePath = normalizedChangedPath.slice(packagePrefix.length);
	const pathSegments = packageRelativePath.split("/");
	const fileName = pathSegments.at(-1) ?? "";

	if (CHANGESET_COVERAGE_IGNORED_DIRECTORIES.has(pathSegments[0])) {
		return false;
	}

	return !/^(?:CHANGELOG|README)(?:\..*)?$/iu.test(fileName);
}

function runGit(repoRoot, args) {
	return execFileSync("git", args, {
		cwd: repoRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function resolveCommit(repoRoot, ref) {
	return runGit(repoRoot, ["rev-parse", "--verify", `${ref}^{commit}`]);
}

function requirePackageVersion(version, packageJsonPath, ref) {
	if (typeof version !== "string" || version.trim() === "") {
		throw new Error(`${packageJsonPath} at ${ref} must declare a string version.`);
	}

	return version;
}

function readWorkspacePackageManifestsAtRef(repoRoot, commit) {
	const manifestOutput = runGit(repoRoot, [
		"ls-tree",
		"-r",
		"--name-only",
		commit,
		"--",
		...WORKSPACE_ROOTS,
	]);
	const manifestPaths = (manifestOutput === "" ? [] : manifestOutput.split(/\r?\n/u)).filter(
		(manifestPath) => WORKSPACE_PACKAGE_MANIFEST_PATTERN.test(manifestPath),
	);

	return manifestPaths.map((packageJsonPath) => ({
		manifest: JSON.parse(runGit(repoRoot, ["show", `${commit}:${packageJsonPath}`])),
		packageDir: path.posix.dirname(packageJsonPath),
		packageJsonPath,
	}));
}

function isPublishableManifest(manifest) {
	return (
		manifest !== null &&
		typeof manifest === "object" &&
		!manifest.private &&
		typeof manifest.name === "string" &&
		manifest.name.length > 0
	);
}

function isStableReleaseVersionBump(baseVersion, currentVersion) {
	const parseVersion = (version) => {
		const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(version);
		return match === null ? null : match.slice(1).map(Number);
	};
	const base = parseVersion(baseVersion);
	const current = parseVersion(currentVersion);
	if (base === null || current === null) {
		return false;
	}

	const [baseMajor, baseMinor, basePatch] = base;
	const [currentMajor, currentMinor, currentPatch] = current;
	return (
		(currentMajor === baseMajor &&
			currentMinor === baseMinor &&
			currentPatch === basePatch + 1) ||
		(currentMajor === baseMajor &&
			currentMinor === baseMinor + 1 &&
			currentPatch === 0) ||
		(currentMajor === baseMajor + 1 && currentMinor === 0 && currentPatch === 0)
	);
}

function normalizeAuthorizedInternalDependencyBumps(
	baseManifest,
	currentManifest,
	versionTransitions,
) {
	for (const field of DEPENDENCY_FIELDS) {
		const baseDependencies = baseManifest[field];
		const currentDependencies = currentManifest[field];
		if (
			baseDependencies === null ||
			typeof baseDependencies !== "object" ||
			currentDependencies === null ||
			typeof currentDependencies !== "object"
		) {
			continue;
		}

		for (const [dependencyName, currentSpec] of Object.entries(currentDependencies)) {
			const baseSpec = baseDependencies[dependencyName];
			if (currentSpec === baseSpec) {
				continue;
			}

			const transition = versionTransitions.get(dependencyName);
			if (
				typeof baseSpec !== "string" ||
				typeof currentSpec !== "string" ||
				transition === undefined
			) {
				continue;
			}
			const rangePrefix = ["", "^", "~"].find(
				(prefix) => baseSpec === `${prefix}${transition.baseVersion}`,
			);
			if (
				rangePrefix === undefined ||
				currentSpec !== `${rangePrefix}${transition.currentVersion}`
			) {
				continue;
			}

			currentDependencies[dependencyName] = baseSpec;
		}
	}
}

function isAuthorizedReleaseManifestChange(
	baseManifest,
	currentManifest,
	versionTransitions,
) {
	const baseVersion = baseManifest.version;
	const currentVersion = currentManifest.version;
	if (!isStableReleaseVersionBump(baseVersion, currentVersion)) {
		return false;
	}

	const normalizedCurrentManifest = structuredClone(currentManifest);
	normalizedCurrentManifest.version = baseVersion;
	normalizeAuthorizedInternalDependencyBumps(
		baseManifest,
		normalizedCurrentManifest,
		versionTransitions,
	);

	return isDeepStrictEqual(baseManifest, normalizedCurrentManifest);
}

function collectAddedChangesetReleaseTypes(repoRoot, baseCommit, headCommit) {
	const diffOutput = runGit(repoRoot, [
		"diff",
		"--name-only",
		"--diff-filter=A",
		`${baseCommit}...${headCommit}`,
	]);
	const addedPathSet = new Set(diffOutput === "" ? [] : diffOutput.split(/\r?\n/u));
	const releaseTypes = new Map();

	for (const { entries, relativePath } of readPendingChangesets(repoRoot)) {
		if (!addedPathSet.has(relativePath)) {
			continue;
		}

		for (const { packageId, releaseType } of entries) {
			const current = releaseTypes.get(packageId);
			if (
				current === undefined ||
				RELEASE_TYPE_PRIORITY[releaseType] > RELEASE_TYPE_PRIORITY[current]
			) {
				releaseTypes.set(packageId, releaseType);
			}
		}
	}

	return releaseTypes;
}

function formatChangedPathSummary(changedPaths, limit = 5) {
	const displayedPaths = changedPaths.slice(0, limit);
	const remainingCount = changedPaths.length - displayedPaths.length;
	return remainingCount > 0
		? `${displayedPaths.join(", ")}, ... ${remainingCount} more`
		: displayedPaths.join(", ");
}

export function validateSampoChangesetCoverage(
	repoRoot,
	{ allowVersionBumps = false, baseRef },
) {
	const baseCommit = resolveCommit(repoRoot, baseRef);
	const headCommit = resolveCommit(repoRoot, "HEAD");
	const diffOutput = runGit(repoRoot, [
		"diff",
		"--name-only",
		"--diff-filter=ACDMRT",
		`${baseCommit}...${headCommit}`,
	]);
	const changedPaths = diffOutput === "" ? [] : diffOutput.split(/\r?\n/u);
	const changedReleaseTypes = collectAddedChangesetReleaseTypes(
		repoRoot,
		baseCommit,
		headCommit,
	);
	const publishablePackages = findPublishablePackages(repoRoot);
	const baseWorkspacePackages = readWorkspacePackageManifestsAtRef(repoRoot, baseCommit);
	const currentPackagesByDir = new Map(
		publishablePackages.map((packageInfo) => [packageInfo.packageDir, packageInfo]),
	);
	const baseManifestsByDir = new Map(
		baseWorkspacePackages.map((packageInfo) => [packageInfo.packageDir, packageInfo.manifest]),
	);
	const versionTransitions = new Map();
	const packages = [];
	const errors = [];

	for (const packageInfo of publishablePackages) {
		const packageJsonRelativePath = toPosixRelativePath(
			repoRoot,
			packageInfo.packageJsonPath,
		);
		const baseManifest = baseManifestsByDir.get(packageInfo.packageDir) ?? null;
		if (baseManifest === null) {
			continue;
		}

		const baseVersion = requirePackageVersion(
			baseManifest.version,
			packageJsonRelativePath,
			baseCommit,
		);
		const currentVersion = requirePackageVersion(
			packageInfo.version,
			packageJsonRelativePath,
			headCommit,
		);
		if (
			baseManifest.name === packageInfo.packageName &&
			isStableReleaseVersionBump(baseVersion, currentVersion)
		) {
			versionTransitions.set(packageInfo.packageName, {
				baseVersion,
				currentVersion,
			});
		}
	}

	for (const basePackage of baseWorkspacePackages) {
		if (!isPublishableManifest(basePackage.manifest)) {
			continue;
		}

		const currentPackage = currentPackagesByDir.get(basePackage.packageDir);
		if (currentPackage?.packageName === basePackage.manifest.name) {
			continue;
		}

		const baseVersion = requirePackageVersion(
			basePackage.manifest.version,
			basePackage.packageJsonPath,
			baseCommit,
		);
		errors.push(
			`${basePackage.manifest.name}@${baseVersion} was publishable at ${baseRef}, but ${basePackage.packageJsonPath} was removed, made private, or renamed. Package removal requires an explicit release migration and cannot bypass Sampo changesets.`,
		);
	}

	for (const packageInfo of publishablePackages) {
		const releaseRelevantPaths = changedPaths.filter((changedPath) =>
			isReleaseRelevantPackagePath(packageInfo.packageDir, changedPath),
		);
		if (releaseRelevantPaths.length === 0) {
			continue;
		}

		const packageJsonRelativePath = toPosixRelativePath(
			repoRoot,
			packageInfo.packageJsonPath,
		);
		const currentVersion = requirePackageVersion(
			packageInfo.version,
			packageJsonRelativePath,
			headCommit,
		);
		const baseManifest = baseManifestsByDir.get(packageInfo.packageDir) ?? null;
		const baseVersion =
			baseManifest === null
				? null
				: requirePackageVersion(
						baseManifest.version,
						packageJsonRelativePath,
						baseCommit,
					);
		const pendingReleaseType = changedReleaseTypes.get(packageInfo.packageId) ?? null;
		const versionChanged = baseVersion === null || baseVersion !== currentVersion;
		const coveredByVersionBump =
			baseVersion === null ||
			(allowVersionBumps &&
				versionChanged &&
				releaseRelevantPaths.every(
					(changedPath) => changedPath === packageJsonRelativePath,
				) &&
				isAuthorizedReleaseManifestChange(
					baseManifest,
					JSON.parse(fs.readFileSync(packageInfo.packageJsonPath, "utf8")),
					versionTransitions,
				));
		const covered = pendingReleaseType !== null || coveredByVersionBump;

		packages.push({
			baseVersion,
			covered,
			coveredByVersionBump,
			currentVersion,
			packageDir: packageInfo.packageDir,
			packageId: packageInfo.packageId,
			packageName: packageInfo.packageName,
			pendingReleaseType,
			releaseRelevantPaths,
			versionChanged,
		});

		if (!covered) {
			errors.push(
				`${packageInfo.packageName} has release-relevant changes since ${baseRef}, but remains at ${currentVersion} without a pending ${packageInfo.packageId} changeset in this diff (${formatChangedPathSummary(releaseRelevantPaths)}).`,
			);
		}
	}

	return {
		baseCommit,
		changedPaths,
		errors,
		headCommit,
		packages,
		valid: errors.length === 0,
	};
}

export function validateSampoChangesets(repoRoot) {
	const allowedPackageIds = new Set(findPublishablePackageIds(repoRoot));
	const files = getChangesetFiles(repoRoot);
	const errors = [];

	for (const filePath of files) {
		const relativePath = toPosixRelativePath(repoRoot, filePath);
		const source = fs.readFileSync(filePath, "utf8");

		try {
			const entries = parseChangesetFrontmatter(source, relativePath);
			for (const { packageId } of entries) {
				if (!packageId.startsWith("npm/")) {
					errors.push(
						`${relativePath}: "${packageId}" must use the canonical npm/<package-name> format`,
					);
					continue;
				}

				if (!allowedPackageIds.has(packageId)) {
					errors.push(
						`${relativePath}: "${packageId}" does not match a publishable workspace package`,
					);
				}
			}
		} catch (error) {
			errors.push(error instanceof Error ? error.message : String(error));
		}
	}

	return {
		allowedPackageIds: [...allowedPackageIds].sort(),
		errors,
		files: files.map((filePath) => toPosixRelativePath(repoRoot, filePath)),
		valid: errors.length === 0,
	};
}

export function formatChangesetValidationSuccessMessage(result) {
	if (result.files.length === 0) {
		return "No pending Sampo changesets to validate.";
	}

	return `Validated ${result.files.length} pending Sampo changeset${result.files.length === 1 ? "" : "s"} against ${result.allowedPackageIds.length} publishable package ids.`;
}
