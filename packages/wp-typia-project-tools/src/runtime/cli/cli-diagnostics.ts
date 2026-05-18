/**
 * Shared human-readable diagnostics for non-interactive `wp-typia` CLI flows.
 */
export interface CliDiagnosticMessage {
	code: CliDiagnosticCode;
	command: string;
	detailLines: string[];
	summary: string;
}

export const CLI_DIAGNOSTIC_CODES = {
	COMMAND_EXECUTION: "command-execution",
	CONFIGURATION_MISSING: "configuration-missing",
	DEPENDENCIES_NOT_INSTALLED: "dependencies-not-installed",
	DOCTOR_CHECK_FAILED: "doctor-check-failed",
	INVALID_ARGUMENT: "invalid-argument",
	INVALID_COMMAND: "invalid-command",
	MISSING_ARGUMENT: "missing-argument",
	MISSING_BUILD_ARTIFACT: "missing-build-artifact",
	OUTSIDE_PROJECT_ROOT: "outside-project-root",
	TEMPLATE_SOURCE_TIMEOUT: "template-source-timeout",
	TEMPLATE_SOURCE_TOO_LARGE: "template-source-too-large",
	UNKNOWN_TEMPLATE: "unknown-template",
	UNSUPPORTED_COMMAND: "unsupported-command",
} as const;

export type CliDiagnosticCode =
	(typeof CLI_DIAGNOSTIC_CODES)[keyof typeof CLI_DIAGNOSTIC_CODES];

/**
 * Human-readable guidance attached to one stable CLI diagnostic code.
 */
export interface CliDiagnosticCodeMetadata {
	/** Why this diagnostic code is emitted. */
	cause: string;
	/** The recommended recovery path for users and automation. */
	recovery: string;
}

/**
 * Stable cause and recovery metadata for every supported CLI diagnostic code.
 */
export const CLI_DIAGNOSTIC_CODE_METADATA = {
	[CLI_DIAGNOSTIC_CODES.COMMAND_EXECUTION]: {
		cause: "The command failed after argument parsing and preflight checks completed.",
		recovery:
			"Read the detail lines for the underlying tool failure, rerun with the same command once corrected, and report the full JSON envelope if the recovery is unclear.",
	},
	[CLI_DIAGNOSTIC_CODES.CONFIGURATION_MISSING]: {
		cause: "A command needs configuration that is not present in the current project.",
		recovery:
			"Add the missing wp-typia config section or rerun the scaffold/init flow that creates the expected configuration.",
	},
	[CLI_DIAGNOSTIC_CODES.DEPENDENCIES_NOT_INSTALLED]: {
		cause: "Generated project or workspace dependencies are missing from the local install.",
		recovery:
			"Run the package-manager install command from the reported project root, then rerun the wp-typia command.",
	},
	[CLI_DIAGNOSTIC_CODES.DOCTOR_CHECK_FAILED]: {
		cause: "One or more doctor checks reported a failing environment or workspace row.",
		recovery:
			"Inspect the failed check labels and details, fix the reported drift or missing prerequisite, then rerun `wp-typia doctor`.",
	},
	[CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT]: {
		cause: "An argument was present but did not match the supported value, shape, or project state.",
		recovery:
			"Correct the argument value using command help or the detail lines, then rerun the command.",
	},
	[CLI_DIAGNOSTIC_CODES.INVALID_COMMAND]: {
		cause: "The command or subcommand is not part of the supported wp-typia command tree.",
		recovery:
			"Run `wp-typia --help` or the relevant command help and switch to a supported command/subcommand.",
	},
	[CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT]: {
		cause: "A required positional argument or flag value was omitted.",
		recovery:
			"Provide the missing argument or flag value shown in the detail lines, then rerun the command.",
	},
	[CLI_DIAGNOSTIC_CODES.MISSING_BUILD_ARTIFACT]: {
		cause: "The published or standalone CLI layout is missing bundled build artifacts.",
		recovery:
			"Reinstall the package or standalone binary, or rebuild the workspace before invoking the command again.",
	},
	[CLI_DIAGNOSTIC_CODES.OUTSIDE_PROJECT_ROOT]: {
		cause: "The command was run outside a generated wp-typia project or official workspace root.",
		recovery:
			"Change into the scaffolded project/workspace root, or rerun the scaffold/init workflow that creates the expected root files.",
	},
	[CLI_DIAGNOSTIC_CODES.TEMPLATE_SOURCE_TIMEOUT]: {
		cause: "External template resolution did not complete within the allowed time.",
		recovery:
			"Retry with a reachable template source, use a local path, or cache the template package before rerunning.",
	},
	[CLI_DIAGNOSTIC_CODES.TEMPLATE_SOURCE_TOO_LARGE]: {
		cause: "External template content exceeded the safety size limit.",
		recovery:
			"Reduce the template package size or point wp-typia at a smaller official template layer.",
	},
	[CLI_DIAGNOSTIC_CODES.UNKNOWN_TEMPLATE]: {
		cause: "The requested scaffold template or add-block template id is not registered.",
		recovery:
			"Run `wp-typia templates list` and rerun with one of the listed template ids.",
	},
	[CLI_DIAGNOSTIC_CODES.UNSUPPORTED_COMMAND]: {
		cause: "The requested command exists conceptually but is not supported by the current runtime surface.",
		recovery:
			"Install Bun 1.3.11+ or use the standalone wp-typia binary when the detail lines say the Bun-powered runtime is required.",
	},
} satisfies Record<CliDiagnosticCode, CliDiagnosticCodeMetadata>;

export type CliDiagnosticCodeError<TCode extends CliDiagnosticCode = CliDiagnosticCode> =
	Error & { code: TCode };

type DoctorCheckLike = {
	code?: string;
	detail: string;
	label: string;
	status: "pass" | "fail" | "warn";
};

const DEFAULT_CLI_FAILURE_SUMMARIES: Record<string, string> = {
	add: "Unable to complete the requested add workflow.",
	create: "Unable to complete the requested create workflow.",
	doctor: "One or more doctor checks failed.",
	init: "Unable to preview the requested retrofit init plan.",
	mcp: "Unable to inspect or sync MCP metadata.",
	migrate: "Unable to complete the requested migration command.",
	sync: "Unable to complete the requested sync workflow.",
	templates: "Unable to inspect scaffold templates.",
};

const MIN_CLI_WRAP_COLUMNS = 32;

function parseCliColumns(value: string | undefined): number | null {
	if (typeof value !== "string" || value.trim().length === 0) {
		return null;
	}

	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed >= MIN_CLI_WRAP_COLUMNS ? parsed : null;
}

function resolveCliWrapColumns(streamColumns: number | undefined): number | null {
	return parseCliColumns(process.env.COLUMNS) ??
		(typeof streamColumns === "number" && streamColumns >= MIN_CLI_WRAP_COLUMNS
			? streamColumns
			: null);
}

function wrapCliText(text: string, maxWidth: number): string[] {
	const words = text.trim().split(/\s+/u).filter((word) => word.length > 0);

	if (words.length === 0) {
		return [""];
	}

	const lines: string[] = [];
	let currentLine = words[0] ?? "";

	for (const word of words.slice(1)) {
		const nextLine = `${currentLine} ${word}`;
		if (nextLine.length <= maxWidth) {
			currentLine = nextLine;
			continue;
		}

		lines.push(currentLine);
		currentLine = word;
	}

	lines.push(currentLine);
	return lines;
}

function formatWrappedPrefixedLine(
	prefix: string,
	text: string,
	columns: number | null,
	continuationIndent = "  ",
): string[] {
	const singleLine = `${prefix}${text}`;
	if (columns === null || singleLine.length <= columns) {
		return [singleLine];
	}

	const words = text.trim().split(/\s+/u).filter((word) => word.length > 0);
	if (words.length === 0) {
		return [prefix.trimEnd()];
	}

	const continuationWidth = Math.max(1, columns - continuationIndent.length);
	const firstLineWidth = columns - prefix.length;
	if (firstLineWidth <= 0 || (words[0]?.length ?? 0) > firstLineWidth) {
		return [
			prefix.trimEnd(),
			...wrapCliText(text, continuationWidth).map((line) => `${continuationIndent}${line}`),
		];
	}

	const lines: string[] = [];
	let currentPrefix = prefix;
	let currentWidth = Math.max(1, columns - currentPrefix.length);
	let currentLine = words[0] ?? "";

	for (const word of words.slice(1)) {
		const nextLine = `${currentLine} ${word}`;
		if (nextLine.length <= currentWidth) {
			currentLine = nextLine;
			continue;
		}

		lines.push(`${currentPrefix}${currentLine}`);
		currentPrefix = continuationIndent;
		currentWidth = continuationWidth;
		currentLine = word;
	}

	lines.push(`${currentPrefix}${currentLine}`);
	return lines;
}

function formatCliDiagnosticBlock(message: CliDiagnosticMessage): string {
	const columns = resolveCliWrapColumns(process.stderr.columns);
	const lines = [
		`wp-typia ${message.command} failed`,
		...formatWrappedPrefixedLine("Summary: ", message.summary, columns),
	];

	if (message.detailLines.length > 0) {
		lines.push("Details:");
		for (const detailLine of message.detailLines) {
			lines.push(...formatWrappedPrefixedLine("- ", detailLine, columns));
		}
	}

	return lines.join("\n");
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function normalizeDetailLines(detailLines: Array<string | null | undefined>): string[] {
	return detailLines
		.flatMap((detailLine) =>
			typeof detailLine === "string" ? detailLine.split("\n") : [],
		)
		.map((detailLine) => detailLine.trim())
		.filter((detailLine) => detailLine.length > 0);
}

/**
 * Structured CLI failure carrying a stable summary/detail layout.
 */
export class CliDiagnosticError extends Error {
	readonly code: CliDiagnosticCode;
	readonly command: string;
	readonly detailLines: string[];
	readonly summary: string;

	constructor(message: CliDiagnosticMessage, options?: ErrorOptions) {
		super(formatCliDiagnosticBlock(message), options);
		this.code = message.code;
		this.command = message.command;
		this.detailLines = [...message.detailLines];
		this.name = "CliDiagnosticError";
		this.summary = message.summary;
	}
}

/**
 * Narrow an unknown error to the shared CLI diagnostic error shape.
 */
export function isCliDiagnosticError(error: unknown): error is CliDiagnosticError {
	return error instanceof CliDiagnosticError;
}

function isCliDiagnosticCode(value: unknown): value is CliDiagnosticCode {
	return Object.values(CLI_DIAGNOSTIC_CODES).includes(value as CliDiagnosticCode);
}

function readCliDiagnosticCode(error: unknown): CliDiagnosticCode | null {
	if (isCliDiagnosticError(error)) {
		return error.code;
	}

	if (typeof error === "object" && error !== null && "code" in error) {
		const { code } = error as { code?: unknown };
		if (isCliDiagnosticCode(code)) {
			return code;
		}
	}

	return null;
}

/**
 * Look up cause and recovery guidance for a stable CLI diagnostic code.
 */
export function getCliDiagnosticCodeMetadata(
	code: CliDiagnosticCode,
): CliDiagnosticCodeMetadata {
	return CLI_DIAGNOSTIC_CODE_METADATA[code];
}

/**
 * Tag a user-facing CLI throw site with a stable diagnostic code.
 *
 * Prefer this helper, or `createCliCommandError({ code })`, for new known CLI
 * failures. `inferCliDiagnosticCode()` remains only a compatibility fallback
 * for legacy or untyped errors.
 */
export function createCliDiagnosticCodeError<TCode extends CliDiagnosticCode>(
	code: TCode,
	message: string,
	options?: ErrorOptions,
): CliDiagnosticCodeError<TCode> {
	const error = new Error(message, options) as CliDiagnosticCodeError<TCode>;
	error.code = code;
	return error;
}

/**
 * Compatibility-only fallback for legacy or third-party errors that have not
 * yet been tagged by their throw site.
 *
 * The regexes below intentionally couple this classifier to existing
 * project-tools runtime validation messages. Treat them as compatibility shims:
 * changing a validation message can silently change, downgrade, or remove the
 * inferred diagnostic code. New user-facing runtime validation failures should
 * pass an explicit code through `createCliDiagnosticCodeError()` or
 * `createCliCommandError({ code })` instead of adding new message patterns.
 */
function inferCliDiagnosticCode(options: {
	command: string;
	detailLines: string[];
	error?: unknown;
}): CliDiagnosticCode {
	const inheritedCode = readCliDiagnosticCode(options.error);
	if (inheritedCode) {
		return inheritedCode;
	}

	const haystack = normalizeDetailLines([
		...options.detailLines,
		options.error === undefined ? undefined : getErrorMessage(options.error),
	]).join("\n");

	if (/No MCP schema sources are configured\./u.test(haystack)) {
		return CLI_DIAGNOSTIC_CODES.CONFIGURATION_MISSING;
	}
	if (/Missing bundled build artifacts/u.test(haystack)) {
		return CLI_DIAGNOSTIC_CODES.MISSING_BUILD_ARTIFACT;
	}
	if (/No generated wp-typia project root was found/u.test(haystack)) {
		return CLI_DIAGNOSTIC_CODES.OUTSIDE_PROJECT_ROOT;
	}
	if (/dependencies have not been installed yet/u.test(haystack)) {
		return CLI_DIAGNOSTIC_CODES.DEPENDENCIES_NOT_INSTALLED;
	}
	if (/Timed out while .*external template|Timed out while .*npm template|Timed out while .*GitHub template/u.test(haystack)) {
		return CLI_DIAGNOSTIC_CODES.TEMPLATE_SOURCE_TIMEOUT;
	}
	if (/external template size limit/u.test(haystack)) {
		return CLI_DIAGNOSTIC_CODES.TEMPLATE_SOURCE_TOO_LARGE;
	}
	if (options.command === "doctor") {
		return CLI_DIAGNOSTIC_CODES.DOCTOR_CHECK_FAILED;
	}
	if (/requires <|requires --|requires a value/u.test(haystack)) {
		return CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT;
	}
	if (/Unknown (?:add-block )?template\s+(?:"|\\")/u.test(haystack)) {
		return CLI_DIAGNOSTIC_CODES.UNKNOWN_TEMPLATE;
	}
	if (
		/Unknown .*subcommand|Unknown add kind|removed in favor|does not support|The Bun-free fallback runtime does not support|The positional alias only accepts/u.test(
			haystack,
		)
	) {
		return haystack.includes("does not support") ||
			haystack.includes("The Bun-free fallback runtime does not support")
			? CLI_DIAGNOSTIC_CODES.UNSUPPORTED_COMMAND
			: CLI_DIAGNOSTIC_CODES.INVALID_COMMAND;
	}
	if (
		/Invalid |must start with|cannot hook|cannot nest|cannot use|cannot be|already defines|already exists|Expected one of/u.test(
			haystack,
		)
	) {
		return CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT;
	}

	return CLI_DIAGNOSTIC_CODES.COMMAND_EXECUTION;
}

/**
 * Build a shared diagnostic error for one CLI command failure.
 */
export function createCliCommandError(options: {
	command: string;
	code?: CliDiagnosticCode;
	detailLines?: string[];
	error?: unknown;
	summary?: string;
}): CliDiagnosticError {
	if (isCliDiagnosticError(options.error)) {
		return options.error;
	}

	const summary =
		options.summary ?? DEFAULT_CLI_FAILURE_SUMMARIES[options.command] ?? "Command failed.";
	const detailLines = normalizeDetailLines(
		options.detailLines ?? [options.error === undefined ? undefined : getErrorMessage(options.error)],
	);
	const code =
		options.code ??
		inferCliDiagnosticCode({
			command: options.command,
			detailLines,
			error: options.error,
		});

	return new CliDiagnosticError(
		{
			code,
			command: options.command,
			detailLines,
			summary,
		},
		options.error instanceof Error ? { cause: options.error } : undefined,
	);
}

/**
 * Render a CLI diagnostic block. Non-diagnostic errors fall back to their
 * plain message so existing non-command failures keep working.
 */
export function formatCliDiagnosticError(error: unknown): string {
	if (!isCliDiagnosticError(error)) {
		return getErrorMessage(error);
	}

	return formatCliDiagnosticBlock({
		code: error.code,
		command: error.command,
		detailLines: error.detailLines,
		summary: error.summary,
	});
}

export function serializeCliDiagnosticError(error: unknown): {
	code: CliDiagnosticCode;
	command?: string;
	detailLines?: string[];
	kind: "command-execution";
	message: string;
	name: string;
	summary?: string;
	tag: "CommandExecutionError";
} {
	if (isCliDiagnosticError(error)) {
		return {
			code: error.code,
			command: error.command,
			detailLines: [...error.detailLines],
			kind: "command-execution",
			message: formatCliDiagnosticBlock({
				code: error.code,
				command: error.command,
				detailLines: error.detailLines,
				summary: error.summary,
			}),
			name: error.name,
			summary: error.summary,
			tag: "CommandExecutionError",
		};
	}

	return {
		code: inferCliDiagnosticCode({
			command: "unknown",
			detailLines: [],
			error,
		}),
		kind: "command-execution",
		message: getErrorMessage(error),
		name: error instanceof Error ? error.name : "Error",
		tag: "CommandExecutionError",
	};
}

/**
 * Format one human-readable doctor check row.
 */
export function formatDoctorCheckLine(check: DoctorCheckLike): string {
	const statusLabel =
		check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL";
	return formatWrappedPrefixedLine(
		`${statusLabel} ${check.label}: `,
		check.detail,
		resolveCliWrapColumns(process.stdout.columns),
	).join("\n");
}

/**
 * Return the failing doctor checks from one doctor run.
 */
export function getFailingDoctorChecks<TCheck extends DoctorCheckLike>(
	checks: readonly TCheck[],
): TCheck[] {
	return checks.filter((check) => check.status === "fail");
}

/**
 * Format the final doctor summary row.
 */
export function formatDoctorSummaryLine(
	checks: readonly DoctorCheckLike[],
	options: { exitFailureChecks?: readonly DoctorCheckLike[] } = {},
): string {
	const failedChecks = getFailingDoctorChecks(checks);
	const exitFailureChecks = options.exitFailureChecks ?? failedChecks;
	const advisoryFailureCount = failedChecks.length - exitFailureChecks.length;
	const warningCount = checks.filter((check) => check.status === "warn").length;
	const summaryStatus =
		exitFailureChecks.length > 0
			? "FAIL"
			: advisoryFailureCount > 0 || warningCount > 0
				? "WARN"
				: "PASS";
	return formatWrappedPrefixedLine(
		`${summaryStatus} wp-typia doctor summary: `,
		[
			`${checks.length - failedChecks.length - warningCount}/${checks.length} checks passed`,
			advisoryFailureCount > 0 ? `${advisoryFailureCount} advisory failure(s)` : null,
			warningCount > 0 ? `${warningCount} warning(s)` : null,
		]
			.filter((detail): detail is string => detail !== null)
			.join(", "),
		resolveCliWrapColumns(process.stdout.columns),
	).join("\n");
}

/**
 * Build detail lines for doctor failures so the non-interactive formatter can
 * restate the failed checks after the streaming rows.
 */
export function getDoctorFailureDetailLines(checks: readonly DoctorCheckLike[]): string[] {
	return getFailingDoctorChecks(checks).map((check) => `${check.label}: ${check.detail}`);
}
