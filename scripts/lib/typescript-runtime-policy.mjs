import fs from "node:fs";
import path from "node:path";

import ts from "@typescript/typescript6";

export const TYPESCRIPT_COMPILER_API_PACKAGE = "@typescript/typescript6";

export const TYPESCRIPT_DEPENDENCY_POLICY = {
	dependency: "dependency",
	nonRuntime: "non-runtime",
};

export const TYPESCRIPT_RUNTIME_PACKAGE_POLICIES = [
	{
		packageDir: "packages/wp-typia-block-runtime",
		packageName: "@wp-typia/block-runtime",
		reason:
			"metadata parser/analysis/core public metadata sync paths use the TypeScript compiler API at runtime",
		requiredTypeScriptImportFiles: [
			"src/metadata-analysis.ts",
			"src/metadata-parser.ts",
			"src/metadata-parser-symbols.ts",
			"src/metadata-parser-tags.ts",
		],
		runtimeSourceRoots: ["src"],
		typescriptPlacement: TYPESCRIPT_DEPENDENCY_POLICY.dependency,
	},
	{
		packageDir: "packages/wp-typia-project-tools",
		packageName: "@wp-typia/project-tools",
		reason:
			"workspace inventory, standalone doctor sync parsing, and generated workspace asset helpers used by add/doctor/migrations and exported workspace selection flows use the TypeScript compiler API at runtime",
		requiredTypeScriptImportFiles: [
			"src/runtime/add/cli-add-workspace-binding-source.ts",
			"src/runtime/cli/cli-init-plan.ts",
			"src/runtime/doctor/cli-doctor-standalone-control-flow.ts",
			"src/runtime/doctor/cli-doctor-standalone-rest.ts",
			"src/runtime/doctor/cli-doctor-standalone-shared.ts",
			"src/runtime/doctor/cli-doctor-standalone.ts",
			"src/runtime/shared/ts-property-names.ts",
			"src/runtime/workspace/workspace-inventory-parser-entries.ts",
			"src/runtime/workspace/workspace-inventory-parser.ts",
		],
		runtimeSourceRoots: ["src/runtime"],
		typescriptPlacement: TYPESCRIPT_DEPENDENCY_POLICY.dependency,
	},
	{
		packageDir: "packages/wp-typia",
		packageName: "wp-typia",
		reason:
			"the published CLI does not import the TypeScript compiler API in shipped runtime sources",
		requiredTypeScriptImportFiles: [],
		runtimeSourceRoots: ["src"],
		typescriptPlacement: TYPESCRIPT_DEPENDENCY_POLICY.nonRuntime,
	},
	{
		packageDir: "packages/wp-typia-rest",
		packageName: "@wp-typia/rest",
		reason:
			"the published REST client helpers do not import the TypeScript compiler API in shipped runtime sources",
		requiredTypeScriptImportFiles: [],
		runtimeSourceRoots: ["src"],
		typescriptPlacement: TYPESCRIPT_DEPENDENCY_POLICY.nonRuntime,
	},
	{
		packageDir: "packages/wp-typia-api-client",
		packageName: "@wp-typia/api-client",
		reason:
			"the published transport-neutral client helpers do not import the TypeScript compiler API in shipped runtime sources",
		requiredTypeScriptImportFiles: [],
		runtimeSourceRoots: ["src"],
		typescriptPlacement: TYPESCRIPT_DEPENDENCY_POLICY.nonRuntime,
	},
	{
		packageDir: "packages/wp-typia-block-types",
		packageName: "@wp-typia/block-types",
		reason:
			"the published semantic type package ships declarations and runtime shims without the TypeScript compiler API",
		requiredTypeScriptImportFiles: [],
		runtimeSourceRoots: ["src"],
		typescriptPlacement: TYPESCRIPT_DEPENDENCY_POLICY.nonRuntime,
	},
];

function toPosixRelativePath(basePath, targetPath) {
	return path.relative(basePath, targetPath).split(path.sep).join("/");
}

function walkFiles(rootDir) {
	if (!fs.existsSync(rootDir)) {
		return [];
	}

	const files = [];
	const stack = [rootDir];
	while (stack.length > 0) {
		const currentPath = stack.pop();
		if (!currentPath) {
			continue;
		}

		for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
			const absolutePath = path.join(currentPath, entry.name);
			if (entry.isDirectory()) {
				stack.push(absolutePath);
				continue;
			}

			if (
				entry.isFile() &&
				/\.(?:c|m)?tsx?$/u.test(entry.name) &&
				!/\.d\.(?:c|m)?ts$/u.test(entry.name)
			) {
				files.push(absolutePath);
			}
		}
	}

	return files.sort((left, right) => left.localeCompare(right));
}

function importClauseHasRuntimeBindings(importClause) {
	if (importClause === undefined) {
		return true;
	}

	if (importClause.isTypeOnly) {
		return false;
	}

	if (importClause.name) {
		return true;
	}

	if (importClause.namedBindings === undefined) {
		return false;
	}

	if (ts.isNamespaceImport(importClause.namedBindings)) {
		return true;
	}

	if (ts.isNamedImports(importClause.namedBindings)) {
		return (
			importClause.namedBindings.elements.length === 0 ||
			importClause.namedBindings.elements.some(
				(element) => element.isTypeOnly !== true,
			)
		);
	}

	return false;
}

function exportDeclarationHasRuntimeBindings(node) {
	if (node.isTypeOnly) {
		return false;
	}

	if (node.exportClause === undefined) {
		return true;
	}

	if (ts.isNamespaceExport(node.exportClause)) {
		return true;
	}

	if (ts.isNamedExports(node.exportClause)) {
		return (
			node.exportClause.elements.length === 0 ||
			node.exportClause.elements.some((element) => element.isTypeOnly !== true)
		);
	}

	return true;
}

export function sourceImportsTypeScriptAtRuntime(source, filePath = "source.ts") {
	let found = false;
	const sourceFile = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);

	const visit = (node) => {
		if (found) {
			return;
		}

		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteralLike(node.moduleSpecifier) &&
			node.moduleSpecifier.text === TYPESCRIPT_COMPILER_API_PACKAGE
		) {
			if (importClauseHasRuntimeBindings(node.importClause)) {
				found = true;
				return;
			}
		}

		if (
			ts.isExportDeclaration(node) &&
			node.moduleSpecifier &&
			ts.isStringLiteralLike(node.moduleSpecifier) &&
			node.moduleSpecifier.text === TYPESCRIPT_COMPILER_API_PACKAGE &&
			exportDeclarationHasRuntimeBindings(node)
		) {
			found = true;
			return;
		}

		if (
			ts.isImportEqualsDeclaration(node) &&
			node.isTypeOnly !== true &&
			ts.isExternalModuleReference(node.moduleReference) &&
			node.moduleReference.expression &&
			ts.isStringLiteralLike(node.moduleReference.expression) &&
			node.moduleReference.expression.text === TYPESCRIPT_COMPILER_API_PACKAGE
		) {
			found = true;
			return;
		}

		if (ts.isCallExpression(node) && node.arguments.length === 1) {
			const [argument] = node.arguments;
			if (
				ts.isStringLiteralLike(argument) &&
				argument.text === TYPESCRIPT_COMPILER_API_PACKAGE
			) {
				if (
					(ts.isIdentifier(node.expression) && node.expression.text === "require") ||
					node.expression.kind === ts.SyntaxKind.ImportKeyword
				) {
					found = true;
					return;
				}
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return found;
}

export function collectTypeScriptImportFiles(packageDir, runtimeSourceRoots) {
	const absolutePackageDir = path.resolve(packageDir);
	const files = new Set();

	for (const root of runtimeSourceRoots) {
		const absoluteRoot = path.join(absolutePackageDir, root);
		for (const filePath of walkFiles(absoluteRoot)) {
			const source = fs.readFileSync(filePath, "utf8");
			if (sourceImportsTypeScriptAtRuntime(source, filePath)) {
				files.add(toPosixRelativePath(absolutePackageDir, filePath));
			}
		}
	}

	return [...files].sort((left, right) => left.localeCompare(right));
}

export function getTypeScriptDependencyPlacement(packageJson) {
	if (
		typeof packageJson?.dependencies?.[TYPESCRIPT_COMPILER_API_PACKAGE] ===
		"string"
	) {
		return "dependencies";
	}

	if (
		typeof packageJson?.devDependencies?.[TYPESCRIPT_COMPILER_API_PACKAGE] ===
		"string"
	) {
		return "devDependencies";
	}

	return "missing";
}

export function evaluateTypeScriptRuntimePackagePolicy(
	policy,
	{
		packedManifest,
		sourceManifest,
		typeScriptImportFiles,
	},
) {
	const errors = [];
	const sourcePlacement = getTypeScriptDependencyPlacement(sourceManifest);
	const packedPlacement = getTypeScriptDependencyPlacement(packedManifest);
	const sortedImportFiles = [...typeScriptImportFiles].sort((left, right) =>
		left.localeCompare(right),
	);

	if (policy.typescriptPlacement === TYPESCRIPT_DEPENDENCY_POLICY.dependency) {
		if (sourcePlacement !== "dependencies") {
			errors.push(
				`${policy.packageName} must keep ${TYPESCRIPT_COMPILER_API_PACKAGE} in dependencies because ${policy.reason}. Found ${sourcePlacement} in source package.json.`,
			);
		}

		if (packedPlacement !== "dependencies") {
			errors.push(
				`Packed ${policy.packageName} manifest must keep ${TYPESCRIPT_COMPILER_API_PACKAGE} in dependencies because ${policy.reason}. Found ${packedPlacement}.`,
			);
		}

		const expectedImportFiles = [...policy.requiredTypeScriptImportFiles].sort(
			(left, right) => left.localeCompare(right),
		);
		const missingRequiredFiles = expectedImportFiles.filter(
			(filePath) => !sortedImportFiles.includes(filePath),
		);
		const unexpectedImportFiles = sortedImportFiles.filter(
			(filePath) => !expectedImportFiles.includes(filePath),
		);
		if (missingRequiredFiles.length > 0) {
			errors.push(
				`${policy.packageName} audit is stale: expected shipped runtime sources to import ${TYPESCRIPT_COMPILER_API_PACKAGE} from ${missingRequiredFiles.join(", ")}.`,
			);
		}
		if (unexpectedImportFiles.length > 0) {
			errors.push(
				`${policy.packageName} audit is stale: found additional shipped runtime sources importing ${TYPESCRIPT_COMPILER_API_PACKAGE} from ${unexpectedImportFiles.join(", ")}.`,
			);
		}
	} else {
		if (sourcePlacement === "dependencies") {
			errors.push(
				`${policy.packageName} must not list ${TYPESCRIPT_COMPILER_API_PACKAGE} in dependencies because ${policy.reason}.`,
			);
		}

		if (packedPlacement === "dependencies") {
			errors.push(
				`Packed ${policy.packageName} manifest must not list ${TYPESCRIPT_COMPILER_API_PACKAGE} in dependencies because ${policy.reason}.`,
			);
		}

		if (sortedImportFiles.length > 0) {
			errors.push(
				`${policy.packageName} must not import the TypeScript compiler API in shipped runtime sources; found ${sortedImportFiles.join(", ")}.`,
			);
		}
	}

	return {
		errors,
		packedPlacement,
		sourcePlacement,
		typeScriptImportFiles: sortedImportFiles,
	};
}
