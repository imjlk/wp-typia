import path from "node:path";

import {
	normalizeBlockSlug,
	type RunAddPatternCommandOptions,
} from "./cli-add-shared.js";
import {
	isValidPatternThumbnailUrl,
	PATTERN_CATALOG_SCOPE_IDS,
	PATTERN_SECTION_ROLE_PATTERN,
	PATTERN_TAG_PATTERN,
	type PatternCatalogScope,
} from "./pattern-catalog.js";
import { toTitleCase } from "./string-case.js";

export type ResolvedPatternCatalogOptions = {
	contentFile: string;
	patternScope: PatternCatalogScope;
	sectionRole?: string;
	tags: string[];
	thumbnailUrl?: string;
	title: string;
};

const PATTERN_CONTENT_FILE_ROOT = "src/patterns/";

function assertValidPatternRelativePath(
	label: string,
	value: string,
	usage: string,
): string {
	const normalizedPath = value.trim().replace(/\\/gu, "/");
	if (
		normalizedPath.length === 0 ||
		path.isAbsolute(normalizedPath) ||
		normalizedPath.split("/").includes("..") ||
		/[<>:"|?*\u0000-\u001F]/u.test(normalizedPath)
	) {
		throw new Error(
			`${label} must be a safe relative project path. Use \`${usage}\`.`,
		);
	}

	return normalizedPath;
}

function assertValidPatternContentFile(value: string, usage: string): string {
	const normalizedPath = assertValidPatternRelativePath(
		"Pattern content file",
		value,
		usage,
	);
	if (!isLoadablePatternContentFilePath(normalizedPath)) {
		throw new Error(
			"Pattern content file must live directly under `src/patterns/` or one nested directory under `src/patterns/` and end in `.php` so the generated PHP loader can require it.",
		);
	}

	return normalizedPath;
}

function isLoadablePatternContentFilePath(normalizedPath: string): boolean {
	if (
		!normalizedPath.startsWith(PATTERN_CONTENT_FILE_ROOT) ||
		!normalizedPath.endsWith(".php")
	) {
		return false;
	}

	const patternRelativePath = normalizedPath.slice(PATTERN_CONTENT_FILE_ROOT.length);
	const segments = patternRelativePath.split("/");
	return (
		(segments.length === 1 || segments.length === 2) &&
		segments.every((segment) => segment.length > 0)
	);
}

function resolvePatternScope(scope: string | undefined): PatternCatalogScope {
	if (scope === undefined || scope.trim() === "") {
		return "full";
	}
	const normalizedScope = scope.trim();
	if (
		(PATTERN_CATALOG_SCOPE_IDS as readonly string[]).includes(normalizedScope)
	) {
		return normalizedScope as PatternCatalogScope;
	}
	throw new Error(
		`Pattern scope must be one of: ${PATTERN_CATALOG_SCOPE_IDS.join(", ")}.`,
	);
}

/**
 * Normalize and validate a raw pattern section role before catalog generation.
 * Non-empty values are normalized with normalizeBlockSlug; valid roles start
 * with a lowercase letter and then use lowercase letters, numbers, or hyphens.
 *
 * @param value Raw section-role input from CLI or programmatic callers.
 * @returns Normalized role slug, or undefined when the input is empty.
 * @throws When the normalized role does not match the shared section-role pattern.
 */
function normalizePatternSectionRole(value: string | undefined): string | undefined {
	if (value === undefined || value.trim() === "") {
		return undefined;
	}
	const sectionRole = normalizeBlockSlug(value);
	if (!PATTERN_SECTION_ROLE_PATTERN.test(sectionRole)) {
		throw new Error(
			"Pattern section role must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens. Section roles apply only with `--scope section`.",
		);
	}
	return sectionRole;
}

function normalizePatternTags(tags: readonly string[] | string | undefined): string[] {
	const rawTags =
		typeof tags === "string"
			? tags.split(",")
			: Array.isArray(tags)
				? tags.flatMap((tag) => tag.split(","))
				: [];
	const normalizedTags = rawTags
		.map((tag) => normalizeBlockSlug(tag))
		.filter((tag) => tag.length > 0);

	for (const tag of normalizedTags) {
		if (!PATTERN_TAG_PATTERN.test(tag)) {
			throw new Error(
				`Pattern tag "${tag}" must contain only lowercase letters, numbers, and hyphens.`,
			);
		}
	}

	return [...new Set(normalizedTags)].sort();
}

function normalizePatternThumbnailUrl(value: string | undefined): string | undefined {
	if (value === undefined || value.trim() === "") {
		return undefined;
	}
	const thumbnailUrl = value.trim();
	if (!isValidPatternThumbnailUrl(thumbnailUrl)) {
		throw new Error(
			"Pattern thumbnail URL must be an http(s) URL or safe relative project path.",
		);
	}

	return thumbnailUrl;
}

function resolvePatternContentFile(
	patternSlug: string,
	patternScope: PatternCatalogScope,
	contentFile: string | undefined,
): string {
	if (contentFile && contentFile.trim() !== "") {
		return assertValidPatternContentFile(
			contentFile,
			"wp-typia add pattern <name> [--scope <full|section>]",
		);
	}

	const scopeDirectory = patternScope === "section" ? "sections" : "full";
	return path.posix.join("src", "patterns", scopeDirectory, `${patternSlug}.php`);
}

/**
 * Resolve and validate catalog metadata for a generated workspace pattern.
 *
 * @param patternSlug Normalized and validated pattern slug.
 * @param options Raw add-pattern command options from the CLI layer.
 * @returns Resolved catalog metadata and safe relative content path.
 * @throws {Error} When scope, section-role coupling, tags, thumbnail URL, or
 * content file paths are invalid.
 */
export function resolvePatternCatalogOptions(
	patternSlug: string,
	options: RunAddPatternCommandOptions,
): ResolvedPatternCatalogOptions {
	const patternScope = resolvePatternScope(options.patternScope);
	const sectionRole = normalizePatternSectionRole(options.sectionRole);
	if (patternScope === "section" && !sectionRole) {
		throw new Error(
			"`wp-typia add pattern --scope section` requires --section-role <role> because section-scoped patterns need a typed catalog section role.",
		);
	}
	if (patternScope !== "section" && sectionRole) {
		throw new Error(
			"`--section-role` only applies with `--scope section`. Use `--scope section --section-role <role>` or omit `--section-role` for full patterns.",
		);
	}

	const title =
		options.catalogTitle && options.catalogTitle.trim() !== ""
			? options.catalogTitle.trim()
			: toTitleCase(patternSlug);
	const thumbnailUrl = normalizePatternThumbnailUrl(options.thumbnailUrl);

	return {
		contentFile: resolvePatternContentFile(
			patternSlug,
			patternScope,
			options.contentFile,
		),
		patternScope,
		...(sectionRole ? { sectionRole } : {}),
		tags: normalizePatternTags(options.tags),
		...(thumbnailUrl ? { thumbnailUrl } : {}),
		title,
	};
}
