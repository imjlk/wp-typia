import {
	type ParsedBlockPatternBlock,
	validateBlockPatternContentNesting,
} from "@wp-typia/block-runtime/metadata-core";

import type {
	PatternCatalogDiagnostic,
	PatternCatalogEntry,
} from "./pattern-catalog.js";

/**
 * Validates section role slugs used by pattern manifests and content markers.
 */
export const PATTERN_SECTION_ROLE_PATTERN = /^[a-z][a-z0-9-]*$/u;

/**
 * Convention used to discover section role markers in serialized pattern
 * content. Defaults target `core/group` wrappers with a `section` base class,
 * `section--{role}` role class tokens, and `metadata.sectionRole` attributes.
 */
export type PatternCatalogSectionRoleConvention = {
	/**
	 * Serialized block name used as the section wrapper. Defaults to
	 * `core/group`.
	 */
	wrapperBlockName?: string;
	/**
	 * Optional class that marks a wrapper block as section-like even when the
	 * role marker is missing. Defaults to `section`.
	 */
	baseClassName?: string;
	/**
	 * Class token pattern where exactly one `{role}` placeholder is replaced by
	 * the section role slug. Defaults to `section--{role}`.
	 */
	roleClassNamePattern?: string;
	/**
	 * Dot-separated block attribute paths that can carry role slugs. Defaults to
	 * `metadata.sectionRole`.
	 */
	roleAttributePaths?: readonly string[];
	/**
	 * Warn when a full pattern repeats the same section role marker. Defaults to
	 * `false`.
	 */
	requireUniqueFullPatternRoles?: boolean;
};

/**
 * Section wrapper match extracted from a parsed WordPress block tree.
 */
export type PatternCatalogSectionRoleMatch = {
	blockName: string;
	blockPath: string;
	roles: readonly string[];
};

/**
 * Fully resolved section-role marker convention with its compiled class matcher.
 */
export type NormalizedPatternCatalogSectionRoleConvention =
	Required<PatternCatalogSectionRoleConvention> & {
		/**
		 * Compiled matcher for role class tokens produced from `roleClassNamePattern`.
		 */
		roleClassNamePatternRegExp: RegExp;
	};

type LocatedPatternSectionRole = {
	blockPath: string;
	role: string;
};

const DEFAULT_SECTION_ROLE_CONVENTION = {
	baseClassName: "section",
	requireUniqueFullPatternRoles: false,
	roleAttributePaths: ["metadata.sectionRole"],
	roleClassNamePattern: "section--{role}",
	wrapperBlockName: "core/group",
} satisfies Required<PatternCatalogSectionRoleConvention>;

function createPatternCatalogDiagnostic(
	diagnostic: PatternCatalogDiagnostic,
): PatternCatalogDiagnostic {
	return diagnostic;
}

function normalizeSectionRoleConventionInput(
	convention: PatternCatalogSectionRoleConvention = {},
): Required<PatternCatalogSectionRoleConvention> {
	return {
		baseClassName:
			convention.baseClassName ??
			DEFAULT_SECTION_ROLE_CONVENTION.baseClassName,
		requireUniqueFullPatternRoles:
			convention.requireUniqueFullPatternRoles ??
			DEFAULT_SECTION_ROLE_CONVENTION.requireUniqueFullPatternRoles,
		roleAttributePaths:
			convention.roleAttributePaths ??
			DEFAULT_SECTION_ROLE_CONVENTION.roleAttributePaths,
		roleClassNamePattern:
			convention.roleClassNamePattern ??
			DEFAULT_SECTION_ROLE_CONVENTION.roleClassNamePattern,
		wrapperBlockName:
			convention.wrapperBlockName ??
			DEFAULT_SECTION_ROLE_CONVENTION.wrapperBlockName,
	};
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function createRoleClassNamePattern(pattern: string): RegExp {
	const parts = pattern.split("{role}");
	if (parts.length !== 2) {
		throw new Error(
			`roleClassNamePattern must contain exactly one "{role}" placeholder.`,
		);
	}

	return new RegExp(
		`^${escapeRegExp(parts[0] ?? "")}(?<role>\\S*)${escapeRegExp(parts[1] ?? "")}$`,
		"u",
	);
}

/**
 * Resolve a section-role convention and compile its class-token matcher.
 *
 * @param convention Optional marker convention override.
 * @returns A fully populated convention ready for repeated block traversal.
 * @throws When `roleClassNamePattern` does not contain exactly one `{role}` placeholder.
 */
export function normalizePatternCatalogSectionRoleConvention(
	convention: PatternCatalogSectionRoleConvention = {},
): NormalizedPatternCatalogSectionRoleConvention {
	const normalized = normalizeSectionRoleConventionInput(convention);
	return {
		...normalized,
		roleClassNamePatternRegExp: createRoleClassNamePattern(
			normalized.roleClassNamePattern,
		),
	};
}

function getClassNameTokens(attributes: Record<string, unknown>): string[] {
	const className = attributes.className;
	if (typeof className !== "string") {
		return [];
	}

	return className.split(/\s+/u).filter((token) => token.length > 0);
}

function getAttributePathValue(
	attributes: Record<string, unknown>,
	pathName: string,
): unknown {
	return pathName.split(".").reduce<unknown>((current, segment) => {
		if (
			current !== null &&
			typeof current === "object" &&
			!Array.isArray(current) &&
			Object.prototype.hasOwnProperty.call(current, segment)
		) {
			return (current as Record<string, unknown>)[segment];
		}

		return undefined;
	}, attributes);
}

function collectStringValues(value: unknown): string[] {
	if (typeof value === "string") {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === "string");
	}

	return [];
}

function uniqueValues(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function formatRoleList(roles: readonly string[]): string {
	if (roles.length === 0) {
		return "none";
	}

	return roles.map((role) => `"${role}"`).join(", ");
}

function formatBlockPaths(paths: readonly string[]): string {
	return paths.map((blockPath) => `at ${blockPath}`).join(", ");
}

function describeRoleMarkerConvention(
	convention: NormalizedPatternCatalogSectionRoleConvention,
): string {
	return `${convention.wrapperBlockName} wrappers with class "${convention.roleClassNamePattern}" or attributes ${convention.roleAttributePaths.join(", ")}`;
}

function isSectionWrapperCandidate(
	block: ParsedBlockPatternBlock,
	roles: readonly string[],
	convention: NormalizedPatternCatalogSectionRoleConvention,
): boolean {
	if (block.blockName !== convention.wrapperBlockName) {
		return false;
	}
	if (roles.length > 0) {
		return true;
	}

	return getClassNameTokens(block.attributes).includes(convention.baseClassName);
}

function collectSectionRoleMatches(
	blocks: readonly ParsedBlockPatternBlock[],
	convention: NormalizedPatternCatalogSectionRoleConvention,
	pathSegments: readonly string[] = [],
): PatternCatalogSectionRoleMatch[] {
	return blocks.flatMap((block, index) => {
		const blockPathSegments = [
			...pathSegments,
			`${block.blockName}[${index}]`,
		];
		const blockPath = blockPathSegments.join(" > ");
		const roles = extractPatternSectionRolesFromNormalizedAttributes(
			block.attributes,
			convention,
		);
		const matches = isSectionWrapperCandidate(block, roles, convention)
			? [
					{
						blockName: block.blockName,
						blockPath,
						roles,
					},
				]
			: [];

		return [
			...matches,
			...collectSectionRoleMatches(
				block.innerBlocks,
				convention,
				blockPathSegments,
			),
		];
	});
}

function unescapeSerializedBlockCommentJsonQuotes(content: string): string {
	return content.replace(/<!--([\s\S]*?)-->/gu, (comment, body: string) => {
		const source = body.trim();
		if (!source.startsWith("wp:") && !source.startsWith("/wp:")) {
			return comment;
		}

		return `<!--${body.replace(/\\"/gu, '"')}-->`;
	});
}

/**
 * Extract section role slugs from serialized block attributes using the
 * configured class and metadata marker convention.
 *
 * @param attributes Parsed block attributes from serialized pattern content.
 * @param convention Optional marker convention override.
 * @returns Unique role marker values in discovery order.
 */
export function extractPatternSectionRolesFromAttributes(
	attributes: Record<string, unknown>,
	convention: PatternCatalogSectionRoleConvention = {},
): string[] {
	const normalized = normalizePatternCatalogSectionRoleConvention(convention);
	return extractPatternSectionRolesFromNormalizedAttributes(attributes, normalized);
}

function extractPatternSectionRolesFromNormalizedAttributes(
	attributes: Record<string, unknown>,
	normalized: NormalizedPatternCatalogSectionRoleConvention,
): string[] {
	const classRoles = getClassNameTokens(attributes)
		.map((token) => normalized.roleClassNamePatternRegExp.exec(token)?.groups?.role)
		.filter((role): role is string => typeof role === "string");
	const attributeRoles = normalized.roleAttributePaths.flatMap((pathName) =>
		collectStringValues(getAttributePathValue(attributes, pathName)),
	);

	return uniqueValues([...classRoles, ...attributeRoles]);
}

/**
 * Find section wrapper blocks and their role markers in parsed pattern content.
 *
 * @param blocks Parsed block tree returned by `validateBlockPatternContentNesting`.
 * @param convention Optional marker convention override.
 * @returns Section wrapper matches with serialized block paths.
 */
export function extractPatternSectionRoleMatches(
	blocks: readonly ParsedBlockPatternBlock[],
	convention: PatternCatalogSectionRoleConvention = {},
): PatternCatalogSectionRoleMatch[] {
	return collectSectionRoleMatches(
		blocks,
		normalizePatternCatalogSectionRoleConvention(convention),
	);
}

/**
 * Build the known valid section-role set from pattern catalog entries.
 *
 * @param patterns Catalog entries that may declare a `sectionRole`.
 * @returns Valid section role slugs declared by the catalog.
 */
export function collectKnownPatternSectionRoles(
	patterns: readonly Pick<PatternCatalogEntry, "sectionRole">[],
): ReadonlySet<string> {
	return new Set(
		patterns
			.map((pattern) => pattern.sectionRole)
			.filter(
				(sectionRole): sectionRole is string =>
					typeof sectionRole === "string" &&
					PATTERN_SECTION_ROLE_PATTERN.test(sectionRole),
			),
	);
}

/**
 * Validate serialized pattern content against the catalog section-role rules.
 *
 * @param options Pattern content, marker convention, known roles, and diagnostic context.
 * @returns Diagnostics for invalid, missing, mismatched, unknown, or duplicate section-role markers.
 */
export function validatePatternContentSectionRoles({
	content,
	contentFile,
	convention,
	knownSectionRoles,
	label,
	pattern,
}: {
	content: string;
	contentFile: string;
	convention: NormalizedPatternCatalogSectionRoleConvention;
	knownSectionRoles: ReadonlySet<string>;
	label: string;
	pattern: PatternCatalogEntry;
}): PatternCatalogDiagnostic[] {
	const diagnostics: PatternCatalogDiagnostic[] = [];
	const parsed = validateBlockPatternContentNesting(content, {
		allowExternalBlockNames: true,
		nesting: {},
		patternFile: contentFile,
	});
	let matches = collectSectionRoleMatches(parsed.blocks, convention);
	const unescapedContent = unescapeSerializedBlockCommentJsonQuotes(content);
	if (unescapedContent !== content) {
		const unescapedParsed = validateBlockPatternContentNesting(
			unescapedContent,
			{
				allowExternalBlockNames: true,
				nesting: {},
				patternFile: contentFile,
			},
		);
		const unescapedMatches = collectSectionRoleMatches(
			unescapedParsed.blocks,
			convention,
		);
		if (
			unescapedMatches.some((match) => match.roles.length > 0) ||
			matches.length === 0
		) {
			matches = unescapedMatches;
		}
	}
	const locatedRoles = matches.flatMap<LocatedPatternSectionRole>((match) =>
		match.roles.map((role) => ({
			blockPath: match.blockPath,
			role,
		})),
	);
	const invalidRoles = locatedRoles.filter(
		({ role }) => !PATTERN_SECTION_ROLE_PATTERN.test(role),
	);
	for (const invalidRole of uniqueValues(invalidRoles.map(({ role }) => role))) {
		const paths = invalidRoles
			.filter(({ role }) => role === invalidRole)
			.map(({ blockPath }) => blockPath);
		diagnostics.push(
			createPatternCatalogDiagnostic({
				code: "invalid-pattern-section-role-marker",
				message: `${label}: section role marker "${invalidRole}" in ${contentFile} must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens (${formatBlockPaths(paths)}).`,
				patternSlug: pattern.slug,
				severity: "error",
			}),
		);
	}

	const validLocatedRoles = locatedRoles.filter(({ role }) =>
		PATTERN_SECTION_ROLE_PATTERN.test(role),
	);
	const validRoles = validLocatedRoles.map(({ role }) => role);
	const uniqueValidRoles = uniqueValues(validRoles);
	const unknownRoles = uniqueValidRoles.filter(
		(role) => !knownSectionRoles.has(role),
	);
	for (const unknownRole of unknownRoles) {
		const paths = validLocatedRoles
			.filter(({ role }) => role === unknownRole)
			.map(({ blockPath }) => blockPath);
		diagnostics.push(
			createPatternCatalogDiagnostic({
				code: "unknown-pattern-section-role-marker",
				message: `${label}: section role marker "${unknownRole}" in ${contentFile} is not declared by any PATTERNS sectionRole (${formatBlockPaths(paths)}).`,
				patternSlug: pattern.slug,
				severity: "warning",
			}),
		);
	}

	const scope = pattern.scope ?? "full";
	const expectedSectionRole =
		typeof pattern.sectionRole === "string" &&
		PATTERN_SECTION_ROLE_PATTERN.test(pattern.sectionRole)
			? pattern.sectionRole
			: undefined;
	if (scope === "section" && expectedSectionRole) {
		if (validRoles.length === 0) {
			diagnostics.push(
				createPatternCatalogDiagnostic({
					code: "missing-pattern-section-role-marker",
					message: `${label}: section-scoped pattern content in ${contentFile} must include section role marker "${expectedSectionRole}" using ${describeRoleMarkerConvention(convention)}.`,
					patternSlug: pattern.slug,
					severity: "error",
				}),
			);
		} else if (!validRoles.includes(expectedSectionRole)) {
			diagnostics.push(
				createPatternCatalogDiagnostic({
					code: "mismatched-pattern-section-role",
					message: `${label}: manifest sectionRole "${expectedSectionRole}" was not found in ${contentFile}; found ${formatRoleList(uniqueValidRoles)}.`,
					patternSlug: pattern.slug,
					severity: "error",
				}),
			);
		}
	}

	if (scope === "full" && convention.requireUniqueFullPatternRoles) {
		for (const role of uniqueValidRoles) {
			const paths = validLocatedRoles
				.filter((locatedRole) => locatedRole.role === role)
				.map(({ blockPath }) => blockPath);
			if (paths.length <= 1) {
				continue;
			}
			diagnostics.push(
				createPatternCatalogDiagnostic({
					code: "duplicate-pattern-section-role-marker",
					message: `${label}: full pattern content in ${contentFile} repeats section role marker "${role}" (${formatBlockPaths(paths)}).`,
					patternSlug: pattern.slug,
					severity: "warning",
				}),
			);
		}
	}

	return diagnostics;
}
