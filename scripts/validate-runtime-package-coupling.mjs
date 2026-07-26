#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	collectPendingReleaseTypes,
	findPublishablePackages,
} from "./lib/sampo-changesets.mjs";
import {
	RANGE_POLICY,
	RUNTIME_PACKAGE_COUPLINGS,
	RUNTIME_PACKAGE_NAMES,
	WORKSPACE_PROTOCOL_POLICY_EXCEPTIONS,
	bumpVersion,
	getRequiredDependentReleaseType,
	isPolicySpec,
	renderPolicySpec,
	specAllowsVersion,
} from "./lib/runtime-package-policy.mjs";
import {
	findWorkspaceProtocolLeaks,
	readJson,
} from "./publish-package-utils.mjs";

function getPackageId(packageName) {
	return `npm/${packageName}`;
}

function readPolicyManifest(packageInfo, plannedByName) {
	const sourceManifest = readJson(packageInfo.packageJsonPath);

	if (findWorkspaceProtocolLeaks(sourceManifest).length === 0) {
		return sourceManifest;
	}

	const materializedManifest = JSON.parse(JSON.stringify(sourceManifest));

	for (const exception of WORKSPACE_PROTOCOL_POLICY_EXCEPTIONS) {
		if (exception.dependentName !== packageInfo.packageName) {
			continue;
		}

		const dependencyInfo = plannedByName.get(exception.dependencyName);
		if (!dependencyInfo) {
			continue;
		}

		const currentSpec = materializedManifest.dependencies?.[exception.dependencyName];
		if (currentSpec === "workspace:*") {
			materializedManifest.dependencies[exception.dependencyName] = renderPolicySpec(
				exception.rangePolicy,
				dependencyInfo.plannedVersion,
			);
		}
	}

	return materializedManifest;
}

export function collectPlannedRuntimePackages(repoRoot) {
	const publishablePackages = findPublishablePackages(repoRoot);
	const publishableByName = new Map(
		publishablePackages.map((packageInfo) => [
			packageInfo.packageName,
			{
				...packageInfo,
				absolutePackageDir: path.join(repoRoot, packageInfo.packageDir),
			},
		]),
	);
	const pendingReleaseTypes = collectPendingReleaseTypes(repoRoot);
	const plannedPackages = [];

	for (const packageName of RUNTIME_PACKAGE_NAMES) {
		const packageInfo = publishableByName.get(packageName);
		if (!packageInfo) {
			throw new Error(
				`Runtime package policy references ${packageName}, but no publishable workspace package with that name was found.`,
			);
		}

		const pendingReleaseType = pendingReleaseTypes.get(getPackageId(packageName)) ?? null;
		plannedPackages.push({
			...packageInfo,
			currentVersion: packageInfo.version,
			pendingReleaseType,
			plannedVersion:
				pendingReleaseType === null
					? packageInfo.version
					: bumpVersion(packageInfo.version, pendingReleaseType),
		});
	}

	return plannedPackages;
}

export function validateRuntimePackageCoupling(repoRoot) {
	const plannedPackages = collectPlannedRuntimePackages(repoRoot);
	const plannedByName = new Map(plannedPackages.map((packageInfo) => [packageInfo.packageName, packageInfo]));
	const errors = [];

	for (const packageInfo of plannedPackages) {
		packageInfo.policyManifest = readPolicyManifest(packageInfo, plannedByName);
	}

	for (const coupling of RUNTIME_PACKAGE_COUPLINGS) {
		const dependencyInfo = plannedByName.get(coupling.dependencyName);
		const dependentInfo = plannedByName.get(coupling.dependentName);
		if (!dependencyInfo || !dependentInfo) {
			continue;
		}

		const dependencySection = dependentInfo.policyManifest.dependencies ?? {};
		const peerSection = dependentInfo.policyManifest.peerDependencies ?? {};
		const spec = dependencySection[coupling.dependencyName];
		const peerSpec = peerSection[coupling.dependencyName];
		const requiredDependentReleaseType = getRequiredDependentReleaseType(
			dependencyInfo.currentVersion,
			dependencyInfo.plannedVersion,
			coupling.rangePolicy,
		);

		if (typeof spec !== "string") {
			if (typeof peerSpec === "string") {
				errors.push(
					`${coupling.dependentName} must declare ${coupling.dependencyName} in dependencies, not peerDependencies (${peerSpec}).`,
				);
				continue;
			}

			errors.push(
				`${coupling.dependentName} is missing dependencies.${coupling.dependencyName} in its policy manifest.`,
			);
			continue;
		}

		if (typeof peerSpec === "string") {
			errors.push(
				`${coupling.dependentName} must declare ${coupling.dependencyName} only in dependencies, not peerDependencies (${peerSpec}).`,
			);
			continue;
		}

		if (!isPolicySpec(coupling.rangePolicy, spec)) {
			errors.push(
				`${coupling.dependentName} must use a ${coupling.rangePolicy} dependency spec for ${coupling.dependencyName}, found "${spec}".`,
			);
			continue;
		}

		const allowsCurrentVersion = specAllowsVersion(
			spec,
			dependencyInfo.currentVersion,
			coupling.rangePolicy,
		);
		const allowsPlannedVersion = specAllowsVersion(
			spec,
			dependencyInfo.plannedVersion,
			coupling.rangePolicy,
		);
		const allowsSourceSpecUntilRelease =
			dependentInfo.pendingReleaseType !== null &&
			dependencyInfo.currentVersion !== dependencyInfo.plannedVersion &&
			allowsCurrentVersion;

		if (!allowsPlannedVersion && !allowsSourceSpecUntilRelease) {
			if (dependentInfo.pendingReleaseType !== null) {
				errors.push(
					`${coupling.dependentName} has a pending ${dependentInfo.pendingReleaseType} changeset, but dependencies.${coupling.dependencyName}="${spec}" still does not allow planned ${coupling.dependencyName}@${dependencyInfo.plannedVersion}.`,
				);
			} else if (requiredDependentReleaseType !== null) {
				errors.push(
					`${coupling.dependencyName} is planned for ${dependencyInfo.currentVersion} -> ${dependencyInfo.plannedVersion}; ${coupling.dependentName} must add a pending changeset and update dependencies.${coupling.dependencyName}.`,
				);
			} else {
				errors.push(
					`${coupling.dependentName} dependencies.${coupling.dependencyName}="${spec}" does not satisfy current/planned ${coupling.dependencyName}@${dependencyInfo.plannedVersion}.`,
				);
			}
			continue;
		}

		if (requiredDependentReleaseType !== null && dependentInfo.pendingReleaseType === null) {
			errors.push(
				`${coupling.dependencyName} is planned for ${dependencyInfo.currentVersion} -> ${dependencyInfo.plannedVersion}; ${coupling.dependentName} must also receive a pending changeset because its ${coupling.rangePolicy} policy requires a dependency update.`,
			);
		}
	}

	return {
		errors,
		packages: plannedPackages.map(
			({ currentVersion, packageName, pendingReleaseType, plannedVersion }) => ({
				currentVersion,
				packageName,
				pendingReleaseType,
				plannedVersion,
			}),
		),
		valid: errors.length === 0,
	};
}

export function runCli({
	cwd = process.cwd(),
	stdout = process.stdout,
	stderr = process.stderr,
} = {}) {
	const result = validateRuntimePackageCoupling(cwd);

	if (!result.valid) {
		stderr.write("Invalid runtime package coupling detected:\n");
		for (const error of result.errors) {
			stderr.write(`- ${error}\n`);
		}
		return 1;
	}

	stdout.write(
		`Validated runtime package coupling for ${result.packages.length} policy-targeted packages.\n`,
	);
	return 0;
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (invokedPath === currentFilePath) {
	process.exitCode = runCli();
}
