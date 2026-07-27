import fs from "node:fs";
import path from "node:path";

import {
	ensureCorepackPackageManager,
	getInstallCommand,
	getRunCommand,
	getRunScriptCommand,
	repoRoot,
	refreshCurrentMigrationSnapshot,
	rewriteWorkspaceDependencies,
	run,
	runLocalMigrationDoctor,
	runScaffoldRefreshScripts,
} from "./generated-project-smoke-core.mjs";
import {
	assertExampleProjectScaffold,
	shouldRunMigrationSmoke,
} from "./generated-project-smoke-assertions.mjs";
import { lintGeneratedProjectPhp } from "./generated-project-smoke-php.mjs";

export function prepareExampleWorkspaceRoot(workspaceRoot) {
	const packagesLinkPath = path.join(workspaceRoot, "packages");
	const assetTypesSourcePath = path.join(repoRoot, "types", "assets.d.ts");
	const assetTypesTargetPath = path.join(workspaceRoot, "types", "assets.d.ts");

	if (!fs.existsSync(packagesLinkPath)) {
		fs.symlinkSync(path.join(repoRoot, "packages"), packagesLinkPath, "dir");
	}
	if (!fs.existsSync(assetTypesTargetPath)) {
		fs.mkdirSync(path.dirname(assetTypesTargetPath), { recursive: true });
		fs.copyFileSync(assetTypesSourcePath, assetTypesTargetPath);
	}

	for (const configFile of ["tsconfig.json", "tsconfig.base.json"]) {
		const sourcePath = path.join(repoRoot, configFile);
		const targetPath = path.join(workspaceRoot, configFile);
		if (!fs.existsSync(targetPath)) {
			fs.copyFileSync(sourcePath, targetPath);
		}
	}
}

export function rewriteCopiedExampleTsconfig(projectDir) {
	const tsconfigPath = path.join(projectDir, "tsconfig.json");
	if (!fs.existsSync(tsconfigPath)) {
		return;
	}

	const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
	if (tsconfig.extends !== "../../tsconfig.json") {
		return;
	}

	const nextConfig = {
		compilerOptions: {
			jsx: "react-jsx",
			module: "esnext",
			moduleResolution: "bundler",
			noEmit: true,
			rootDir: "../..",
			skipLibCheck: true,
			strict: true,
			target: "es2022",
			types: ["bun-types", "node"],
		},
		exclude: ["node_modules", "build"],
		include: ["src/**/*", "scripts/**/*", "../../types/assets.d.ts"],
	};

	fs.writeFileSync(tsconfigPath, `${JSON.stringify(nextConfig, null, "\t")}\n`, "utf8");
}

export function ensureCopiedExampleSupportDependencies(projectDir) {
	const packageJsonPath = path.join(projectDir, "package.json");
	if (!fs.existsSync(packageJsonPath)) {
		return;
	}

	const repoPackageJson = JSON.parse(
		fs.readFileSync(path.resolve(repoRoot, "package.json"), "utf8"),
	);
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
	const devDependencies = {
		...(packageJson.devDependencies ?? {}),
	};

	if (!devDependencies["bun-types"]) {
		devDependencies["bun-types"] =
			repoPackageJson.devDependencies?.["bun-types"] ?? "^1.3.11";
	}
	if (!devDependencies["@types/node"]) {
		devDependencies["@types/node"] =
			repoPackageJson.devDependencies?.["@types/node"] ?? "^24.0.0";
	}

	packageJson.devDependencies = devDependencies;
	fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

export function prepareExampleProject(exampleProject, projectDir) {
	const sourceDir = path.resolve(repoRoot, "examples", exampleProject);
	if (!fs.existsSync(sourceDir)) {
		throw new Error(`Unknown example project: ${exampleProject}`);
	}

	fs.cpSync(sourceDir, projectDir, {
		dereference: false,
		filter: (sourcePath) => {
			const relativePath = path.relative(sourceDir, sourcePath);
			return !relativePath.split(path.sep).includes("node_modules");
		},
		recursive: true,
	});

	rewriteCopiedExampleTsconfig(projectDir);
	ensureCopiedExampleSupportDependencies(projectDir);
}

function readCurrentMigrationVersion(projectDir) {
	const configPath = path.join(projectDir, "src", "migrations", "config.ts");
	if (!fs.existsSync(configPath)) {
		return null;
	}

	const configSource = fs.readFileSync(configPath, "utf8");
	const versionMatch = configSource.match(
		/currentMigrationVersion:\s*["']([^"']+)["']/,
	);
	return versionMatch?.[1] ?? null;
}

export function runExampleProjectSmoke({
	exampleProject,
	packageManager,
	phpVersion,
	projectDir,
	runtime,
}) {
	const workspaceRoot = path.dirname(projectDir);
	const exampleDir = path.join(workspaceRoot, "examples", exampleProject);

	prepareExampleWorkspaceRoot(workspaceRoot);
	prepareExampleProject(exampleProject, exampleDir);
	rewriteWorkspaceDependencies(exampleDir, packageManager);

	const packageJson = JSON.parse(
		fs.readFileSync(path.join(exampleDir, "package.json"), "utf8"),
	);
	ensureCorepackPackageManager(packageManager);

	const [installCommand, installArgs] = getInstallCommand(packageManager);
	run(installCommand, installArgs, {
		cwd: exampleDir,
		env: {
			...process.env,
			...(packageManager === "yarn"
				? { YARN_ENABLE_IMMUTABLE_INSTALLS: "false" }
				: {}),
		},
	});

	runScaffoldRefreshScripts(exampleDir, packageManager, packageJson);
	if (shouldRunMigrationSmoke(exampleDir, packageJson)) {
		const localSnapshotHelperPath = path.join(
			exampleDir,
			"scripts",
			"store-migration-snapshot.ts",
		);
		const localDoctorHelperPath = path.join(
			exampleDir,
			"scripts",
			"doctor-migration.ts",
		);

		if (
			fs.existsSync(localSnapshotHelperPath) &&
			fs.existsSync(localDoctorHelperPath)
		) {
			refreshCurrentMigrationSnapshot(exampleDir, runtime);
			runLocalMigrationDoctor(exampleDir, runtime);
		} else {
			if (typeof packageJson.scripts?.["migration:snapshot"] === "string") {
				const currentMigrationVersion = readCurrentMigrationVersion(exampleDir);
				const [snapshotCommand, snapshotArgs] = getRunScriptCommand(
					packageManager,
					"migration:snapshot",
					currentMigrationVersion
						? ["--migration-version", currentMigrationVersion]
						: [],
				);
				run(snapshotCommand, snapshotArgs, { cwd: exampleDir });
			}
			if (typeof packageJson.scripts?.["migration:doctor"] === "string") {
				const [doctorCommand, doctorArgs] = getRunScriptCommand(
					packageManager,
					"migration:doctor",
				);
				run(doctorCommand, doctorArgs, { cwd: exampleDir });
			}
		}
	}

	const [buildCommand, buildArgs] = getRunCommand(packageManager);
	run(buildCommand, buildArgs, { cwd: exampleDir });

	if (typeof packageJson.scripts?.typecheck !== "string") {
		throw new Error(
			`Missing "typecheck" script in ${path.join(exampleDir, "package.json")} for example-project smoke`,
		);
	}

	const [typecheckCommand, typecheckArgs] = getRunScriptCommand(
		packageManager,
		"typecheck",
	);
	run(typecheckCommand, typecheckArgs, { cwd: exampleDir });
	lintGeneratedProjectPhp(exampleDir, phpVersion);

	assertExampleProjectScaffold(exampleDir, exampleProject);
}
