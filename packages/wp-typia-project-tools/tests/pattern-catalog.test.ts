import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	extractPatternSectionRoleMatches,
	extractPatternSectionRolesFromAttributes,
	formatPatternCatalogDiagnostics,
	PATTERN_TAG_PATTERN,
	resolvePatternCatalogContentFile,
	validatePatternCatalog,
} from "../src/runtime/pattern-catalog.js";

describe("pattern catalog validation", () => {
	test("keeps section role content validation in a focused runtime module", () => {
		const runtimeRoot = path.join(import.meta.dir, "..", "src", "runtime");
		const catalogSource = fs.readFileSync(
			path.join(runtimeRoot, "pattern-catalog.ts"),
			"utf8",
		);
		const sectionRolesSource = fs.readFileSync(
			path.join(runtimeRoot, "pattern-catalog-section-roles.ts"),
			"utf8",
		);

		expect(catalogSource).toContain(
			'from "./pattern-catalog-section-roles.js"',
		);
		expect(catalogSource).not.toContain("validateBlockPatternContentNesting");
		expect(sectionRolesSource).toContain("validateBlockPatternContentNesting");
		expect(sectionRolesSource).toContain(
			"export function validatePatternContentSectionRoles",
		);
	});

	test("shares one pattern tag validation regex across catalog and add flows", () => {
		const runtimeRoot = path.join(import.meta.dir, "..", "src", "runtime");
		const catalogSource = fs.readFileSync(
			path.join(runtimeRoot, "pattern-catalog.ts"),
			"utf8",
		);
		const addOptionsSource = fs.readFileSync(
			path.join(runtimeRoot, "cli-add-workspace-pattern-options.ts"),
			"utf8",
		);

		expect(PATTERN_TAG_PATTERN.test("hero-2")).toBe(true);
		expect(PATTERN_TAG_PATTERN.test("-hero")).toBe(false);
		expect(catalogSource).toContain("export const PATTERN_TAG_PATTERN");
		expect(addOptionsSource).toContain("PATTERN_TAG_PATTERN");
		expect(addOptionsSource).not.toContain("const PATTERN_TAG_PATTERN");
	});

	test("accepts a typed full and section pattern catalog", () => {
		const projectDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "wp-typia-pattern-catalog-"),
		);
		try {
			fs.mkdirSync(path.join(projectDir, "src", "patterns", "full"), {
				recursive: true,
			});
			fs.mkdirSync(path.join(projectDir, "src", "patterns", "sections"), {
				recursive: true,
			});
			fs.writeFileSync(
				path.join(projectDir, "src", "patterns", "full", "landing.php"),
				'<?php\n<!-- wp:group {"className":"section section--hero"} --><!-- /wp:group -->\n',
				"utf8",
			);
			fs.writeFileSync(
				path.join(projectDir, "src", "patterns", "sections", "hero.php"),
				'<?php\n<!-- wp:group {"className":"section section--hero"} --><!-- /wp:group -->\n',
				"utf8",
			);

			const result = validatePatternCatalog(
				[
					{
						contentFile: "src/patterns/full/landing.php",
						scope: "full",
						slug: "landing",
						tags: ["landing", "classic"],
						thumbnailUrl: "./thumbnails/landing.png",
						title: "Landing",
					},
					{
						contentFile: "src/patterns/sections/hero.php",
						scope: "section",
						sectionRole: "hero",
						slug: "hero",
						tags: ["hero"],
						thumbnailUrl: "https://example.com/hero.png",
						title: "Hero",
					},
				],
				{ projectDir },
			);

			expect(result.diagnostics).toEqual([]);
		} finally {
			fs.rmSync(projectDir, { force: true, recursive: true });
		}
	});

	test("extracts section role markers from class names and metadata", () => {
		expect(
			extractPatternSectionRolesFromAttributes({
				className: "section section--hero",
				metadata: {
					sectionRole: "feature",
				},
			}),
		).toEqual(["hero", "feature"]);

		expect(
			extractPatternSectionRoleMatches([
				{
					attributes: {
						className: "section section--hero",
					},
					blockName: "core/group",
					innerBlocks: [
						{
							attributes: {
								className: "section section--feature",
							},
							blockName: "core/group",
							innerBlocks: [],
						},
					],
				},
			]).map((match) => ({
				blockPath: match.blockPath,
				roles: match.roles,
			})),
		).toEqual([
			{
				blockPath: "core/group[0]",
				roles: ["hero"],
			},
			{
				blockPath: "core/group[0] > core/group[0]",
				roles: ["feature"],
			},
		]);
	});

	test("reports invalid, missing, mismatched, and unknown section role markers", () => {
		const projectDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "wp-typia-pattern-catalog-roles-"),
		);
		try {
			fs.mkdirSync(path.join(projectDir, "src", "patterns", "sections"), {
				recursive: true,
			});
			fs.writeFileSync(
				path.join(projectDir, "src", "patterns", "sections", "missing.php"),
				'<?php\n<!-- wp:group {"className":"section"} --><!-- /wp:group -->\n',
				"utf8",
			);
			fs.writeFileSync(
				path.join(projectDir, "src", "patterns", "sections", "invalid.php"),
				'<?php\n<!-- wp:group {"className":"section section--1hero"} --><!-- /wp:group -->\n',
				"utf8",
			);
			fs.writeFileSync(
				path.join(projectDir, "src", "patterns", "sections", "mismatch.php"),
				'<?php\n<!-- wp:group {"className":"section section--unknown"} --><!-- /wp:group -->\n',
				"utf8",
			);

			const result = validatePatternCatalog(
				[
					{
						contentFile: "src/patterns/sections/missing.php",
						scope: "section",
						sectionRole: "hero",
						slug: "missing",
					},
					{
						contentFile: "src/patterns/sections/invalid.php",
						scope: "section",
						sectionRole: "feature",
						slug: "invalid",
					},
					{
						contentFile: "src/patterns/sections/mismatch.php",
						scope: "section",
						sectionRole: "cta",
						slug: "mismatch",
					},
				],
				{ projectDir },
			);

			expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
				expect.arrayContaining([
					"missing-pattern-section-role-marker",
					"invalid-pattern-section-role-marker",
					"unknown-pattern-section-role-marker",
					"mismatched-pattern-section-role",
				]),
			);
			expect(formatPatternCatalogDiagnostics(result.diagnostics)).toContain(
				"section--{role}",
			);
		} finally {
			fs.rmSync(projectDir, { force: true, recursive: true });
		}
	});

	test("accepts section role markers with PHP-escaped JSON attributes", () => {
		const projectDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "wp-typia-pattern-catalog-escaped-"),
		);
		try {
			fs.mkdirSync(path.join(projectDir, "src", "patterns", "sections"), {
				recursive: true,
			});
			fs.writeFileSync(
				path.join(projectDir, "src", "patterns", "sections", "hero.php"),
				[
					"<?php",
					"register_block_pattern(",
					"\t'demo/hero',",
					"\tarray(",
					'\t\t"content" => "<!-- wp:group {\\"className\\":\\"section section--hero\\"} --><!-- /wp:group -->",',
					"\t)",
					");",
				].join("\n"),
				"utf8",
			);

			const result = validatePatternCatalog(
				[
					{
						contentFile: "src/patterns/sections/hero.php",
						scope: "section",
						sectionRole: "hero",
						slug: "hero",
					},
				],
				{ projectDir },
			);

			expect(result.diagnostics).toEqual([]);
		} finally {
			fs.rmSync(projectDir, { force: true, recursive: true });
		}
	});

	test("warns for duplicate section role markers in full patterns when uniqueness is expected", () => {
		const projectDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "wp-typia-pattern-catalog-full-roles-"),
		);
		try {
			fs.mkdirSync(path.join(projectDir, "src", "patterns", "full"), {
				recursive: true,
			});
			fs.mkdirSync(path.join(projectDir, "src", "patterns", "sections"), {
				recursive: true,
			});
			fs.writeFileSync(
				path.join(projectDir, "src", "patterns", "full", "landing.php"),
				[
					"<?php",
					'<!-- wp:group {"className":"section section--hero"} --><!-- /wp:group -->',
					'<!-- wp:group {"metadata":{"sectionRole":"hero"}} --><!-- /wp:group -->',
				].join("\n"),
				"utf8",
			);
			fs.writeFileSync(
				path.join(projectDir, "src", "patterns", "sections", "hero.php"),
				'<?php\n<!-- wp:group {"metadata":{"sectionRole":"hero"}} --><!-- /wp:group -->\n',
				"utf8",
			);

			const result = validatePatternCatalog(
				[
					{
						contentFile: "src/patterns/full/landing.php",
						scope: "full",
						slug: "landing",
					},
					{
						contentFile: "src/patterns/sections/hero.php",
						scope: "section",
						sectionRole: "hero",
						slug: "hero",
					},
				],
				{
					projectDir,
					sectionRoleConvention: {
						requireUniqueFullPatternRoles: true,
					},
				},
			);

			expect(result.errors).toEqual([]);
			expect(result.warnings.map((diagnostic) => diagnostic.code)).toEqual([
				"duplicate-pattern-section-role-marker",
			]);
		} finally {
			fs.rmSync(projectDir, { force: true, recursive: true });
		}
	});

	test("reports invalid section role conventions without throwing", () => {
		const projectDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "wp-typia-pattern-catalog-convention-"),
		);
		try {
			fs.mkdirSync(path.join(projectDir, "src", "patterns", "sections"), {
				recursive: true,
			});
			fs.writeFileSync(
				path.join(projectDir, "src", "patterns", "sections", "hero.php"),
				'<?php\n<!-- wp:group {"className":"section section--hero"} --><!-- /wp:group -->\n',
				"utf8",
			);

			const result = validatePatternCatalog(
				[
					{
						contentFile: "src/patterns/sections/hero.php",
						scope: "section",
						sectionRole: "hero",
						slug: "hero",
					},
				],
				{
					projectDir,
					sectionRoleConvention: {
						roleClassNamePattern: "section-role",
					},
				},
			);

			expect(result.errors.map((diagnostic) => diagnostic.code)).toEqual([
				"invalid-pattern-section-role-convention",
			]);
		} finally {
			fs.rmSync(projectDir, { force: true, recursive: true });
		}
	});

	test("reports unreadable pattern content files as diagnostics", () => {
		const projectDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "wp-typia-pattern-catalog-unreadable-"),
		);
		try {
			fs.mkdirSync(path.join(projectDir, "src", "patterns", "sections"), {
				recursive: true,
			});
			fs.mkdirSync(
				path.join(projectDir, "src", "patterns", "sections", "hero.php"),
			);

			const result = validatePatternCatalog(
				[
					{
						contentFile: "src/patterns/sections/hero.php",
						scope: "section",
						sectionRole: "hero",
						slug: "hero",
					},
				],
				{ projectDir },
			);

			expect(result.errors.map((diagnostic) => diagnostic.code)).toEqual([
				"invalid-pattern-content-file",
			]);
			expect(result.errors[0]?.message).toContain(
				"failed to read pattern content file",
			);
		} finally {
			fs.rmSync(projectDir, { force: true, recursive: true });
		}
	});

	test("reports duplicate slugs, missing files, and invalid metadata", () => {
		const result = validatePatternCatalog(
			[
				{
					contentFile: "src/patterns/full/hero.php",
					scope: "full",
					slug: "hero",
					tags: ["hero"],
				},
				{
					contentFile: "../outside.php",
					scope: "section",
					slug: "hero",
					tags: ["Hero"],
					thumbnailUrl: "ftp://example.com/hero.png",
				},
				{
					contentFile: "src/patterns/sections/hero/primary.php",
					slug: "deep-hero",
				},
				{
					scope: "detail",
					sectionRole: "1detail",
					slug: "bad_scope",
				},
			],
			{ projectDir: process.cwd() },
		);

		expect(result.errors.map((diagnostic) => diagnostic.code)).toEqual([
			"missing-pattern-content-file",
			"duplicate-pattern-slug",
			"missing-pattern-section-role",
			"invalid-pattern-tag",
			"invalid-pattern-thumbnail-url",
			"invalid-pattern-content-file",
			"invalid-pattern-content-file",
			"invalid-pattern-slug",
			"invalid-pattern-scope",
			"invalid-pattern-section-role",
			"missing-pattern-content-file",
		]);
		expect(formatPatternCatalogDiagnostics(result.errors)).toContain(
			"[duplicate-pattern-slug] hero",
		);
		expect(resolvePatternCatalogContentFile({ file: "legacy.php" })).toBe(
			"legacy.php",
		);
	});
});
