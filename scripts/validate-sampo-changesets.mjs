#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	findPublishablePackageIds,
	formatChangesetValidationSuccessMessage,
	parseChangesetFrontmatter,
	validateSampoChangesetCoverage,
	validateSampoChangesets,
} from "./lib/sampo-changesets.mjs";

export {
	findPublishablePackageIds,
	parseChangesetFrontmatter,
	toPosixRelativePath,
	validateSampoChangesetCoverage,
	validateSampoChangesets,
} from "./lib/sampo-changesets.mjs";

function parseCliArgs(argv) {
	let allowVersionBumps = false;
	let baseRef = null;
	const seenArguments = new Set();

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument !== "--allow-version-bumps" && argument !== "--base-ref") {
			throw new Error(`Unknown argument: ${argument}`);
		}
		if (seenArguments.has(argument)) {
			throw new Error(`Duplicate argument: ${argument}`);
		}
		seenArguments.add(argument);

		if (argument === "--allow-version-bumps") {
			allowVersionBumps = true;
			continue;
		}

		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`${argument} requires a git ref value.`);
		}

		baseRef = value;
		index += 1;
	}

	if (allowVersionBumps && baseRef === null) {
		throw new Error("--allow-version-bumps requires --base-ref.");
	}

	return { allowVersionBumps, baseRef };
}

export function runCli({
	cwd = process.cwd(),
	argv = process.argv.slice(2),
	stdout = process.stdout,
	stderr = process.stderr,
} = {}) {
	let options;
	try {
		options = parseCliArgs(argv);
	} catch (error) {
		stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}

	const result = validateSampoChangesets(cwd);

	if (!result.valid) {
		stderr.write("Invalid Sampo changesets detected:\n");
		for (const error of result.errors) {
			stderr.write(`- ${error}\n`);
		}
		return 1;
	}

	stdout.write(`${formatChangesetValidationSuccessMessage(result)}\n`);

	if (options.baseRef !== null) {
		let coverageResult;
		try {
			coverageResult = validateSampoChangesetCoverage(cwd, {
				allowVersionBumps: options.allowVersionBumps,
				baseRef: options.baseRef,
			});
		} catch (error) {
			stderr.write(
				`Unable to validate Sampo changeset coverage: ${error instanceof Error ? error.message : String(error)}\n`,
			);
			return 1;
		}

		if (!coverageResult.valid) {
			stderr.write("Publishable package changes are missing Sampo changesets:\n");
			for (const error of coverageResult.errors) {
				stderr.write(`- ${error}\n`);
			}
			return 1;
		}

		stdout.write(
			`Validated Sampo changeset coverage for ${coverageResult.packages.length} changed publishable package${coverageResult.packages.length === 1 ? "" : "s"}.\n`,
		);
	}

	return 0;
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (invokedPath === currentFilePath) {
	process.exitCode = runCli();
}
