import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import packageJson from "../package.json";
import {
	getStandaloneBinaryFilename,
	getStandaloneCompileTarget,
	parseStandaloneTargets,
} from "../src/standalone-distribution";
import {
	ensureRuntimeBuildDependencies,
	packageRoot,
	resolveBunExecutable,
} from "./runtime-build-dependencies";

function readFlagValue(argv: string[], flagName: string): string | undefined {
	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index];
		if (value === flagName) {
			const nextValue = argv[index + 1];
			if (!nextValue || nextValue.startsWith("-")) {
				throw new Error(`Missing value for ${flagName}.`);
			}
			return nextValue;
		}

		if (value?.startsWith(`${flagName}=`)) {
			const inlineValue = value.slice(flagName.length + 1);
			if (!inlineValue) {
				throw new Error(`Missing value for ${flagName}.`);
			}
			return inlineValue;
		}
	}

	return undefined;
}

async function runRoutingGenerate() {
	const bunExecutable = resolveBunExecutable();
	const generateResult = spawnSync(bunExecutable, ["run", "generate"], {
		cwd: packageRoot,
		env: process.env,
		stdio: "inherit",
	});

	if (generateResult.status === 0) {
		return;
	}

	throw new Error(
		`Failed to generate wp-typia command metadata for standalone builds${
			generateResult.error ? ` (${generateResult.error.message})` : ""
		}.`,
	);
}

async function buildStandaloneRuntime() {
	const argv = process.argv.slice(2);
	const resolvedTargets = parseStandaloneTargets(
		readFlagValue(argv, "--targets"),
	);
	const outdir = path.resolve(
		packageRoot,
		readFlagValue(argv, "--outdir") ?? "dist-standalone",
	);
	const entrypoint = path.resolve(packageRoot, "src", "gunshi-cli.ts");

	await runRoutingGenerate();
	await ensureRuntimeBuildDependencies();
	await fs.rm(outdir, { force: true, recursive: true });

	for (const standaloneTarget of resolvedTargets) {
		const targetOutdir = path.join(outdir, standaloneTarget);
		await fs.mkdir(targetOutdir, { recursive: true });
		const outfile = path.join(
			targetOutdir,
			getStandaloneBinaryFilename(packageJson.name, standaloneTarget),
		);

		const buildResult = await Bun.build({
			compile: {
				outfile,
				target: getStandaloneCompileTarget(standaloneTarget),
			},
			entrypoints: [entrypoint],
			minify: false,
			packages: "bundle",
			target: "bun",
		});

		if (!buildResult.success) {
			for (const log of buildResult.logs) {
				console.error(log);
			}
			process.exit(1);
		}

		await fs.access(outfile);
	}
}

await buildStandaloneRuntime();
