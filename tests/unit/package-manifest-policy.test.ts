import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { validatePackageManifestPolicy } from "../../scripts/validate-package-manifest-policy.mjs";

function writeJson(filePath: string, value: unknown) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const PUBLISH_MANIFEST_WRAPPER_SOURCE = `#!/usr/bin/env node

import { runPublishManifestCli } from "../../../scripts/lib/publish-manifest-workspace-protocol.mjs";

process.exitCode = runPublishManifestCli({
	packageRoot: process.cwd(),
});
`;

function createManifestRepo() {
	const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wp-typia-manifest-policy-"));

	writeJson(path.join(repoRoot, "package.json"), {
		devDependencies: {
			"@wp-typia/api-client": "workspace:*",
		},
		engines: {
			bun: ">=1.3.11",
			node: ">=20.0.0",
			npm: ">=10.0.0",
		},
		name: "@wp-typia/repo",
		packageManager: "bun@1.3.11",
		private: true,
		version: "1.0.0",
	});
	writeJson(path.join(repoRoot, "packages/wp-typia-api-client/package.json"), {
		dependencies: {},
		engines: {
			bun: ">=1.3.11",
			node: ">=20.0.0",
			npm: ">=10.0.0",
		},
		name: "@wp-typia/api-client",
		version: "0.4.3",
	});
	writeJson(path.join(repoRoot, "packages/wp-typia-block-types/package.json"), {
		dependencies: {},
		engines: {
			bun: ">=1.3.11",
			node: ">=20.0.0",
			npm: ">=10.0.0",
		},
		name: "@wp-typia/block-types",
		peerDependencies: {
			"@types/wordpress__blocks": "^12.5.18",
			"@wordpress/blocks": "^15.2.0",
		},
		version: "0.2.1",
	});
	writeJson(path.join(repoRoot, "packages/wp-typia-block-runtime/package.json"), {
		dependencies: {
			"@wp-typia/api-client": "^0.4.3",
		},
		engines: {
			bun: ">=1.3.11",
			node: ">=20.0.0",
			npm: ">=10.0.0",
		},
		name: "@wp-typia/block-runtime",
		version: "0.4.6",
	});
	writeJson(path.join(repoRoot, "packages/wp-typia-rest/package.json"), {
		dependencies: {
			"@wp-typia/api-client": "workspace:*",
		},
		engines: {
			bun: ">=1.3.11",
			node: ">=20.0.0",
			npm: ">=10.0.0",
		},
		name: "@wp-typia/rest",
		scripts: {
			postpack: "node ./scripts/publish-manifest.mjs restore",
			prepack: "bun run build && node ./scripts/publish-manifest.mjs prepare",
		},
		version: "0.3.6",
	});
	writeJson(path.join(repoRoot, "packages/wp-typia-project-tools/package.json"), {
		dependencies: {
			"@wp-typia/api-client": "^0.4.3",
			"@wp-typia/block-runtime": "workspace:*",
			"@wp-typia/block-types": "workspace:*",
			"@wp-typia/rest": "^0.3.6",
		},
		devDependencies: {
			react: "^19.2.0",
		},
		engines: {
			bun: ">=1.3.11",
			node: ">=20.0.0",
			npm: ">=10.0.0",
		},
		name: "@wp-typia/project-tools",
		scripts: {
			postpack: "node ./scripts/publish-manifest.mjs restore",
			prepack: "bun run build && node ./scripts/publish-manifest.mjs prepare",
		},
		version: "0.16.6",
	});
	writeJson(path.join(repoRoot, "packages/wp-typia/package.json"), {
		dependencies: {
			"@wp-typia/api-client": "^0.4.3",
			"@wp-typia/project-tools": "0.16.6",
		},
		engines: {
			bun: ">=1.3.11",
			node: ">=20.0.0",
			npm: ">=10.0.0",
		},
		name: "wp-typia",
		packageManager: "bun@1.3.11",
		version: "0.16.7",
	});

	fs.mkdirSync(path.join(repoRoot, "packages/wp-typia-rest/scripts"), { recursive: true });
	fs.writeFileSync(
		path.join(repoRoot, "packages/wp-typia-rest/scripts/publish-manifest.mjs"),
		PUBLISH_MANIFEST_WRAPPER_SOURCE,
		"utf8",
	);
	fs.mkdirSync(path.join(repoRoot, "packages/wp-typia-project-tools/scripts"), {
		recursive: true,
	});
	fs.writeFileSync(
		path.join(repoRoot, "packages/wp-typia-project-tools/scripts/publish-manifest.mjs"),
		PUBLISH_MANIFEST_WRAPPER_SOURCE,
		"utf8",
	);

	return repoRoot;
}

describe("validatePackageManifestPolicy", () => {
	test("passes when the repo follows the documented manifest policy", () => {
		const repoRoot = createManifestRepo();

		expect(validatePackageManifestPolicy(repoRoot)).toEqual({
			errors: [],
			valid: true,
		});
	});

	test("fails when a runtime package keeps an unsanctioned workspace protocol dependency", () => {
		const repoRoot = createManifestRepo();
		const packageJsonPath = path.join(
			repoRoot,
			"packages/wp-typia-block-runtime/package.json",
		);
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		packageJson.dependencies["@wp-typia/api-client"] = "workspace:*";
		writeJson(packageJsonPath, packageJson);

		const result = validatePackageManifestPolicy(repoRoot);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'packages/wp-typia-block-runtime/package.json must use dependencies.@wp-typia/api-client="^0.4.3" to match the caret runtime package policy, found "workspace:*".',
		);
	});

	test("fails when engines drift or project-tools keeps removed devDependencies", () => {
		const repoRoot = createManifestRepo();
		const rootPackageJsonPath = path.join(repoRoot, "package.json");
		const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf8"));
		rootPackageJson.engines.node = ">=24.0.0";
		writeJson(rootPackageJsonPath, rootPackageJson);

		const projectToolsPackageJsonPath = path.join(
			repoRoot,
			"packages/wp-typia-project-tools/package.json",
		);
		const projectToolsPackageJson = JSON.parse(
			fs.readFileSync(projectToolsPackageJsonPath, "utf8"),
		);
		projectToolsPackageJson.devDependencies["react-devtools-core"] = "^7.0.1";
		writeJson(projectToolsPackageJsonPath, projectToolsPackageJson);

		const result = validatePackageManifestPolicy(repoRoot);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'package.json must declare engines.node=">=20.0.0", found ">=24.0.0".',
		);
		expect(result.errors).toContain(
			"@wp-typia/project-tools should not keep unused devDependencies.react-devtools-core.",
		);
	});

	test("fails when block-types registration facade peers drift from the documented baseline", () => {
		const repoRoot = createManifestRepo();
		const packageJsonPath = path.join(
			repoRoot,
			"packages/wp-typia-block-types/package.json",
		);
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		delete packageJson.peerDependencies["@wordpress/blocks"];
		writeJson(packageJsonPath, packageJson);

		const result = validatePackageManifestPolicy(repoRoot);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'packages/wp-typia-block-types/package.json must declare peerDependencies.@wordpress/blocks="^15.2.0" to match the owned block registration facade baseline, found null.',
		);
	});

	test("fails when publishable packages keep removed Bunli/OpenTUI runtime leftovers", () => {
		const repoRoot = createManifestRepo();
		const cliPackageJsonPath = path.join(repoRoot, "packages/wp-typia/package.json");
		const cliPackageJson = JSON.parse(fs.readFileSync(cliPackageJsonPath, "utf8"));
		cliPackageJson.dependencies["@bunli/core"] = "^0.8.0";
		cliPackageJson.devDependencies = {
			"@opentui/core": "^0.1.0",
		};
		writeJson(cliPackageJsonPath, cliPackageJson);

		const restConfigPath = path.join(repoRoot, "packages/wp-typia-rest/bunli.config.ts");
		fs.writeFileSync(restConfigPath, "export default {};\n", "utf8");

		const result = validatePackageManifestPolicy(repoRoot);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"packages/wp-typia-rest/bunli.config.ts should not exist; publishable packages must not keep Bunli/OpenTUI runtime config files.",
		);
		expect(result.errors).toContain(
			"packages/wp-typia/package.json must not declare dependencies.@bunli/core; Bunli/OpenTUI runtime packages were removed from publishable packages.",
		);
		expect(result.errors).toContain(
			"packages/wp-typia/package.json must not declare devDependencies.@opentui/core; Bunli/OpenTUI runtime packages were removed from publishable packages.",
		);
	});

	test("fails when a sanctioned workspace protocol wrapper is a no-op", () => {
		const repoRoot = createManifestRepo();
		const publishManifestPath = path.join(
			repoRoot,
			"packages/wp-typia-rest/scripts/publish-manifest.mjs",
		);
		fs.writeFileSync(publishManifestPath, "export {};\n", "utf8");

		const result = validatePackageManifestPolicy(repoRoot);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"packages/wp-typia-rest/package.json depends on workspace protocol rewriting but scripts/publish-manifest.mjs does not delegate to the shared publish-manifest helper.",
		);
	});
});
