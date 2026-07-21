/** Ordered workspace packages consumed by the packed-install release smoke. */
export const PUBLISH_PACKAGE_CHAIN = Object.freeze([
	Object.freeze(["packages/wp-typia-api-client", "@wp-typia/api-client"]),
	Object.freeze(["packages/wp-typia-rest", "@wp-typia/rest"]),
	Object.freeze(["packages/wp-typia-block-types", "@wp-typia/block-types"]),
	Object.freeze(["packages/wp-typia-dataviews", "@wp-typia/dataviews"]),
	Object.freeze(["packages/wp-typia-block-runtime", "@wp-typia/block-runtime"]),
	Object.freeze([
		"packages/wp-typia-project-tools",
		"@wp-typia/project-tools",
	]),
	Object.freeze([
		"packages/create-workspace-template",
		"@wp-typia/create-workspace-template",
	]),
	Object.freeze(["packages/wp-typia", "wp-typia"]),
]);

/** Maximum installed footprint allowed for each published package. */
export const PUBLISH_PACKAGE_FOOTPRINT_BUDGETS = Object.freeze({
	"@wp-typia/api-client": Object.freeze({
		maxFileCount: 17,
		maxUnpackedBytes: 43_000,
	}),
	"@wp-typia/rest": Object.freeze({
		maxFileCount: 39,
		maxUnpackedBytes: 104_000,
	}),
	"@wp-typia/block-types": Object.freeze({
		maxFileCount: 77,
		maxUnpackedBytes: 191_000,
	}),
	"@wp-typia/dataviews": Object.freeze({
		maxFileCount: 17,
		maxUnpackedBytes: 56_000,
	}),
	"@wp-typia/block-runtime": Object.freeze({
		maxFileCount: 89,
		maxUnpackedBytes: 440_000,
	}),
	"@wp-typia/project-tools": Object.freeze({
		maxFileCount: 1_337,
		maxUnpackedBytes: 3_500_000,
	}),
	"@wp-typia/create-workspace-template": Object.freeze({
		maxFileCount: 24,
		maxUnpackedBytes: 84_000,
	}),
	"wp-typia": Object.freeze({
		maxFileCount: 8,
		maxUnpackedBytes: 320_000,
	}),
});

/** Returns whether npm metadata contains a usable byte or file count. */
function isNonNegativeSafeInteger(value) {
	return Number.isSafeInteger(value) && value >= 0;
}

/** Formats footprint counts consistently for human-readable CI output. */
function formatInteger(value) {
	return value.toLocaleString("en-US");
}

/** Formats an optional measured value without hiding missing metadata. */
function formatMeasuredValue(value) {
	return value === null ? "unknown" : formatInteger(value);
}

/** Formats a configured budget and labels malformed policy values. */
function formatBudgetValue(value) {
	return isNonNegativeSafeInteger(value) ? formatInteger(value) : "invalid";
}

/** Validates npm pack metadata against the configured installed-size budgets. */
export function validatePublishPackageFootprint(
	metadata,
	budgets = PUBLISH_PACKAGE_FOOTPRINT_BUDGETS,
) {
	const packageName =
		typeof metadata?.name === "string" && metadata.name.length > 0
			? metadata.name
			: "<unknown>";
	const budget = budgets[packageName] ?? null;
	const compressedBytes = isNonNegativeSafeInteger(metadata?.size)
		? metadata.size
		: null;
	const unpackedBytes = isNonNegativeSafeInteger(metadata?.unpackedSize)
		? metadata.unpackedSize
		: null;
	const fileCount = isNonNegativeSafeInteger(metadata?.entryCount)
		? metadata.entryCount
		: null;
	const errors = [];
	const hasValidUnpackedBudget =
		budget !== null && isNonNegativeSafeInteger(budget.maxUnpackedBytes);
	const hasValidFileCountBudget =
		budget !== null && isNonNegativeSafeInteger(budget.maxFileCount);

	if (packageName === "<unknown>") {
		errors.push("Packed package metadata is missing a valid package name.");
	}
	if (budget === null) {
		errors.push(`No publish package footprint budget is defined for ${packageName}.`);
	} else {
		if (!hasValidUnpackedBudget) {
			errors.push(
				`${packageName} budget is missing a valid maxUnpackedBytes.`,
			);
		}
		if (!hasValidFileCountBudget) {
			errors.push(`${packageName} budget is missing a valid maxFileCount.`);
		}
	}
	if (unpackedBytes === null) {
		errors.push(`${packageName} pack metadata is missing a valid unpackedSize.`);
	} else if (
		hasValidUnpackedBudget &&
		unpackedBytes > budget.maxUnpackedBytes
	) {
		errors.push(
			`${packageName} unpacked size ${formatInteger(unpackedBytes)} bytes exceeds the ${formatInteger(budget.maxUnpackedBytes)} byte budget.`,
		);
	}
	if (fileCount === null) {
		errors.push(`${packageName} pack metadata is missing a valid entryCount.`);
	} else if (hasValidFileCountBudget && fileCount > budget.maxFileCount) {
		errors.push(
			`${packageName} file count ${formatInteger(fileCount)} exceeds the ${formatInteger(budget.maxFileCount)} file budget.`,
		);
	}

	return {
		budget,
		compressedBytes,
		errors,
		fileCount,
		packageName,
		unpackedBytes,
		valid: errors.length === 0,
	};
}

/** Renders one validation result for the packed-install smoke summary. */
export function formatPublishPackageFootprintReport(result) {
	const budgetSummary =
		result.budget === null
			? "no configured budget"
			: `${formatMeasuredValue(result.unpackedBytes)} / ${formatBudgetValue(result.budget.maxUnpackedBytes)} unpacked bytes; ${formatMeasuredValue(result.fileCount)} / ${formatBudgetValue(result.budget.maxFileCount)} files`;

	return `${result.packageName}: ${budgetSummary}; ${formatMeasuredValue(result.compressedBytes)} compressed bytes (report only)`;
}
