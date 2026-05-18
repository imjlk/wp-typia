import {
	CLI_DIAGNOSTIC_CODES,
	createCliCommandError,
	formatDoctorCheckLine,
	formatDoctorSummaryLine,
} from "../cli/cli-diagnostics.js";
import { getEnvironmentDoctorChecks } from "./cli-doctor-environment.js";
import { getWorkspaceDoctorChecks } from "./cli-doctor-workspace.js";

/** Scope bucket used by doctor exit policies and JSON summaries. */
export type DoctorCheckScope = "environment" | "workspace";

/** Policy used to decide which failed checks should fail the process. */
export type DoctorExitPolicy = "strict" | "workspace-only";

/**
 * One doctor check rendered by the CLI diagnostics flow.
 */
export interface DoctorCheck {
	/** Stable machine-readable diagnostic id for structured integrations. */
	code?: string;
	/** Human-readable status detail rendered next to the label. */
	detail: string;
	/** Short label for the dependency, directory, or template check. */
	label: string;
	/** Scope bucket used by machine-readable summaries and exit-code policies. */
	scope?: DoctorCheckScope;
	/** Final pass/fail/warn status for this diagnostic row. */
	status: "pass" | "fail" | "warn";
}

/** One failed row classified against the active doctor exit policy. */
export interface DoctorFailureSummary {
	code?: string;
	label: string;
	scope: DoctorCheckScope | "unknown";
	severity: "advisory" | "error";
}

/** Stable JSON summary for `wp-typia doctor --format json`. */
export interface DoctorRunSummary {
	advisoryFailureCount: number;
	advisoryFailures: DoctorFailureSummary[];
	exitCode: 0 | 1;
	exitFailureCount: number;
	exitFailures: DoctorFailureSummary[];
	exitPolicy: DoctorExitPolicy;
	failed: number;
	passed: number;
	total: number;
	warnings: number;
}

interface RunDoctorOptions {
	exitPolicy?: DoctorExitPolicy;
	renderLine?: (check: DoctorCheck) => void;
	renderSummaryLine?: (summaryLine: string) => void;
}

interface DoctorSummaryOptions {
	exitPolicy?: DoctorExitPolicy;
}

type DoctorLinePrinter = (line: string) => void;

const DEFAULT_DOCTOR_EXIT_POLICY: DoctorExitPolicy = "strict";

const defaultDoctorLinePrinter: DoctorLinePrinter = (line) => {
	process.stdout.write(`${line}\n`);
};

function renderDefaultDoctorCheckLine(check: DoctorCheck): void {
	defaultDoctorLinePrinter(formatDoctorCheckLine(check));
}

function renderDefaultDoctorSummaryLine(summaryLine: string): void {
	defaultDoctorLinePrinter(summaryLine);
}

function annotateDoctorChecks(
	checks: DoctorCheck[],
	scope: DoctorCheckScope,
): DoctorCheck[] {
	return checks.map((check) => ({
		...check,
		scope: check.scope ?? scope,
	}));
}

function resolveDoctorExitPolicy(options: DoctorSummaryOptions): DoctorExitPolicy {
	return options.exitPolicy ?? DEFAULT_DOCTOR_EXIT_POLICY;
}

function doesCheckContributeToExit(
	check: DoctorCheck,
	exitPolicy: DoctorExitPolicy,
): boolean {
	if (check.status !== "fail") {
		return false;
	}
	if (exitPolicy === "strict") {
		return true;
	}
	return check.scope === "workspace";
}

function toFailureSummary(
	check: DoctorCheck,
	severity: DoctorFailureSummary["severity"],
): DoctorFailureSummary {
	return {
		...(check.code ? { code: check.code } : {}),
		label: check.label,
		scope: check.scope ?? "unknown",
		severity,
	};
}

/**
 * Collect all runtime doctor checks for the current environment.
 *
 * The returned array concatenates environment checks (command availability,
 * directory writability, and built-in template assets) followed by
 * workspace checks (package metadata, inventory, blocks, variations,
 * patterns, bindings, and optional migration hints) in display order.
 *
 * @param cwd Working directory to validate for writability.
 * @returns Ordered doctor check rows ready for CLI rendering.
 */
export async function getDoctorChecks(cwd: string): Promise<DoctorCheck[]> {
	return [
		...annotateDoctorChecks(await getEnvironmentDoctorChecks(cwd), "environment"),
		...annotateDoctorChecks(await getWorkspaceDoctorChecks(cwd), "workspace"),
	];
}

/**
 * Return failed rows that contribute to the process exit code for one policy.
 */
export function getDoctorExitFailureChecks(
	checks: readonly DoctorCheck[],
	options: DoctorSummaryOptions = {},
): DoctorCheck[] {
	const exitPolicy = resolveDoctorExitPolicy(options);
	return checks.filter((check) => doesCheckContributeToExit(check, exitPolicy));
}

/**
 * Format only exit-contributing doctor failures for structured diagnostics.
 */
export function getDoctorExitFailureDetailLines(
	checks: readonly DoctorCheck[],
	options: DoctorSummaryOptions = {},
): string[] {
	return getDoctorExitFailureChecks(checks, options).map(
		(check) => `${check.label}: ${check.detail}`,
	);
}

/**
 * Build the stable JSON summary for one doctor run.
 */
export function createDoctorRunSummary(
	checks: readonly DoctorCheck[],
	options: DoctorSummaryOptions = {},
): DoctorRunSummary {
	const exitPolicy = resolveDoctorExitPolicy(options);
	const failedChecks = checks.filter((check) => check.status === "fail");
	const exitFailureChecks = failedChecks.filter((check) =>
		doesCheckContributeToExit(check, exitPolicy),
	);
	const advisoryFailureChecks = failedChecks.filter(
		(check) => !doesCheckContributeToExit(check, exitPolicy),
	);
	const warnings = checks.filter((check) => check.status === "warn").length;

	return {
		advisoryFailureCount: advisoryFailureChecks.length,
		advisoryFailures: advisoryFailureChecks.map((check) =>
			toFailureSummary(check, "advisory"),
		),
		exitCode: exitFailureChecks.length > 0 ? 1 : 0,
		exitFailureCount: exitFailureChecks.length,
		exitFailures: exitFailureChecks.map((check) => toFailureSummary(check, "error")),
		exitPolicy,
		failed: failedChecks.length,
		passed: checks.length - failedChecks.length - warnings,
		total: checks.length,
		warnings,
	};
}

/**
 * Run doctor checks, render each line, and fail when one or more failed checks
 * contribute to the exit code under the active exit policy.
 *
 * The default `strict` policy treats every failed row as exit-contributing.
 * The `workspace-only` policy only fails on workspace-scoped rows so
 * environment/runtime failures remain advisory for CI gates that only care
 * about generated workspace artifacts.
 *
 * @param cwd Working directory to validate.
 * @param options Optional renderer overrides and exit-policy selection.
 * @param options.exitPolicy Policy deciding which failed checks contribute to the process exit code.
 * @param options.renderLine Optional renderer for each check row. Defaults to the stdout line printer.
 * @param options.renderSummaryLine Optional renderer for the summary row. Defaults to the stdout line printer unless a custom `renderLine` suppresses implicit summary output.
 * @returns The completed list of doctor checks.
 * @throws {Error} When one or more failed checks contribute to the exit code under the active policy.
 */
export async function runDoctor(
	cwd: string,
	options: RunDoctorOptions = {},
): Promise<DoctorCheck[]> {
	const exitPolicy = resolveDoctorExitPolicy(options);
	const renderLine = options.renderLine ?? renderDefaultDoctorCheckLine;
	const renderSummaryLine =
		options.renderSummaryLine ??
		(options.renderLine ? () => undefined : renderDefaultDoctorSummaryLine);
	const checks = await getDoctorChecks(cwd);

	for (const check of checks) {
		renderLine(check);
	}

	const exitFailureChecks = getDoctorExitFailureChecks(checks, { exitPolicy });
	renderSummaryLine(formatDoctorSummaryLine(checks, { exitFailureChecks }));

	const failureDetailLines = getDoctorExitFailureDetailLines(checks, { exitPolicy });
	if (failureDetailLines.length > 0) {
		throw createCliCommandError({
			code: CLI_DIAGNOSTIC_CODES.DOCTOR_CHECK_FAILED,
			command: "doctor",
			detailLines: failureDetailLines,
			summary: "One or more doctor checks failed.",
		});
	}

	return checks;
}
