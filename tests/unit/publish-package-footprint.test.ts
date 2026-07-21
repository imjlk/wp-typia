import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import {
	PUBLISH_PACKAGE_CHAIN,
	PUBLISH_PACKAGE_FOOTPRINT_BUDGETS,
	formatPublishPackageFootprintReport,
	validatePublishPackageFootprint,
} from "../../scripts/lib/publish-package-footprint.mjs";
import {
	packWorkspacePackage,
	packWorkspacePackageDetailed,
	withTempDir,
} from "../../scripts/publish-package-utils.mjs";

const PACKAGE_NAME = "@wp-typia/api-client";
const BUDGET = PUBLISH_PACKAGE_FOOTPRINT_BUDGETS[PACKAGE_NAME];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Creates valid pack metadata with optional per-test overrides. */
function createPackMetadata(overrides: Record<string, unknown> = {}) {
	return {
		entryCount: BUDGET.maxFileCount,
		name: PACKAGE_NAME,
		size: 9_999_999,
		unpackedSize: BUDGET.maxUnpackedBytes,
		...overrides,
	};
}

/** Reads the declaration shim to keep its package keys aligned with runtime. */
function readDeclaredBudgetPackageNames(): string[] {
	const declarationPath = path.join(
		repoRoot,
		"scripts/lib/publish-package-footprint.d.mts",
	);
	const sourceFile = ts.createSourceFile(
		declarationPath,
		fs.readFileSync(declarationPath, "utf8"),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const declaration = sourceFile.statements.find(
		(statement): statement is ts.InterfaceDeclaration =>
			ts.isInterfaceDeclaration(statement) &&
			statement.name.text === "PublishPackageFootprintBudgetMap",
	);
	if (!declaration) {
		throw new Error("Missing PublishPackageFootprintBudgetMap declaration.");
	}

	return declaration.members
		.map((member) => {
			if (
				!ts.isPropertySignature(member) ||
				!ts.isStringLiteral(member.name)
			) {
				throw new Error(
					"Budget map must contain only string-literal properties.",
				);
			}
			return member.name.text;
		})
		.sort();
}

describe("publish package footprint policy", () => {
	test("returns npm pack metadata without changing the tarball-only wrapper", () => {
		withTempDir("wp-typia-pack-metadata-", (tempRoot) => {
			const packageDir = path.join(tempRoot, "package");
			const detailedDestination = path.join(tempRoot, "detailed");
			fs.mkdirSync(packageDir, { recursive: true });
			fs.writeFileSync(
				path.join(packageDir, "package.json"),
				JSON.stringify({
					files: ["index.js"],
					name: "wp-typia-pack-fixture",
					version: "1.0.0",
				}),
			);
			fs.writeFileSync(path.join(packageDir, "index.js"), "export {};\n");

			const detailed = packWorkspacePackageDetailed(
				packageDir,
				detailedDestination,
			);

			expect(detailed.metadata.name).toBe("wp-typia-pack-fixture");
			expect(detailed.metadata.filename).toBe(
				"wp-typia-pack-fixture-1.0.0.tgz",
			);
			expect(detailed.tarballPath).toBe(
				path.join(detailedDestination, detailed.metadata.filename),
			);
			expect(fs.existsSync(detailed.tarballPath)).toBe(true);

			const wrappedTarballPath = packWorkspacePackage(
				packageDir,
				path.join(tempRoot, "wrapped"),
			);
			expect(path.basename(wrappedTarballPath)).toBe(
				"wp-typia-pack-fixture-1.0.0.tgz",
			);
			expect(fs.existsSync(wrappedTarballPath)).toBe(true);
		});
	});

	test("passes exact unpacked byte and file-count boundaries", () => {
		const result = validatePublishPackageFootprint(createPackMetadata());

		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
		expect(formatPublishPackageFootprintReport(result)).toContain(
			"9,999,999 compressed bytes (report only)",
		);
	});

	test("fails when unpacked bytes exceed the budget by one", () => {
		const result = validatePublishPackageFootprint(
			createPackMetadata({ unpackedSize: BUDGET.maxUnpackedBytes + 1 }),
		);

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual([
			`${PACKAGE_NAME} unpacked size 43,001 bytes exceeds the 43,000 byte budget.`,
		]);
	});

	test("fails when file count exceeds the budget by one", () => {
		const result = validatePublishPackageFootprint(
			createPackMetadata({ entryCount: BUDGET.maxFileCount + 1 }),
		);

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual([
			`${PACKAGE_NAME} file count 18 exceeds the 17 file budget.`,
		]);
	});

	test("fails closed when a configured budget is malformed", () => {
		const malformedBudgets = {
			[PACKAGE_NAME]: {
				maxFileCount: undefined,
				maxUnpackedBytes: undefined,
			},
		} as unknown as typeof PUBLISH_PACKAGE_FOOTPRINT_BUDGETS;
		const result = validatePublishPackageFootprint(
			createPackMetadata(),
			malformedBudgets,
		);

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual([
			`${PACKAGE_NAME} budget is missing a valid maxUnpackedBytes.`,
			`${PACKAGE_NAME} budget is missing a valid maxFileCount.`,
		]);
		expect(formatPublishPackageFootprintReport(result)).toContain(
			"43,000 / invalid unpacked bytes; 17 / invalid files",
		);
	});

	test("rejects missing identity and unknown package budgets", () => {
		const missingName = validatePublishPackageFootprint(
			createPackMetadata({ name: "" }),
		);
		const unknownPackage = validatePublishPackageFootprint(
			createPackMetadata({ name: "@wp-typia/unknown" }),
		);

		expect(missingName.valid).toBe(false);
		expect(missingName.errors).toEqual([
			"Packed package metadata is missing a valid package name.",
			"No publish package footprint budget is defined for <unknown>.",
		]);
		expect(unknownPackage.valid).toBe(false);
		expect(unknownPackage.errors).toEqual([
			"No publish package footprint budget is defined for @wp-typia/unknown.",
		]);
		expect(formatPublishPackageFootprintReport(unknownPackage)).toContain(
			"no configured budget",
		);
	});

	test("requires installed footprint metadata but treats compressed size as report only", () => {
		const missingInstalledFootprint = validatePublishPackageFootprint(
			createPackMetadata({ entryCount: undefined, unpackedSize: undefined }),
		);
		const missingCompressedSize = validatePublishPackageFootprint(
			createPackMetadata({ size: undefined }),
		);

		expect(missingInstalledFootprint.valid).toBe(false);
		expect(missingInstalledFootprint.errors).toEqual([
			`${PACKAGE_NAME} pack metadata is missing a valid unpackedSize.`,
			`${PACKAGE_NAME} pack metadata is missing a valid entryCount.`,
		]);
		expect(missingCompressedSize.valid).toBe(true);
		expect(missingCompressedSize.compressedBytes).toBeNull();
		expect(formatPublishPackageFootprintReport(missingCompressedSize)).toContain(
			"unknown compressed bytes (report only)",
		);
	});

	test("covers every current release package in both the pack chain and budgets", () => {
		const releasePackageNames = fs
			.readdirSync(path.join(repoRoot, "packages"), { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => path.join(repoRoot, "packages", entry.name, "package.json"))
			.filter((manifestPath) => fs.existsSync(manifestPath))
			.map((manifestPath) => JSON.parse(fs.readFileSync(manifestPath, "utf8")))
			.filter(
				(manifest) =>
					manifest.private !== true &&
					typeof manifest.name === "string" &&
					manifest.name.length > 0,
			)
			.map((manifest) => manifest.name as string)
			.sort();
		const budgetPackageNames = Object.keys(
			PUBLISH_PACKAGE_FOOTPRINT_BUDGETS,
		).sort();
		const chainPackageNames: string[] = PUBLISH_PACKAGE_CHAIN.map(
			([packageDir, packageName]) => {
				const manifest = JSON.parse(
					fs.readFileSync(path.join(repoRoot, packageDir, "package.json"), "utf8"),
				);
				expect(manifest.private).not.toBe(true);
				expect(manifest.name).toBe(packageName);
				return packageName;
			},
		).sort();

		expect(new Set(chainPackageNames).size).toBe(chainPackageNames.length);
		expect(chainPackageNames).toEqual(releasePackageNames);
		expect(budgetPackageNames).toEqual(releasePackageNames);
		expect(readDeclaredBudgetPackageNames()).toEqual(budgetPackageNames);
	});
});
