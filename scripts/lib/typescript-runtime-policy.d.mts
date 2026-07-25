export interface TypeScriptRuntimePackagePolicy {
	packageDir: string;
	packageName: string;
	reason: string;
	requiredTypeScriptImportFiles: string[];
	runtimeSourceRoots: string[];
	typescriptPlacement: "dependency" | "non-runtime";
}

export declare const TYPESCRIPT_COMPILER_API_PACKAGE: "@typescript/typescript6";

export declare const TYPESCRIPT_DEPENDENCY_POLICY: {
	dependency: "dependency";
	nonRuntime: "non-runtime";
};

export declare const TYPESCRIPT_RUNTIME_PACKAGE_POLICIES: TypeScriptRuntimePackagePolicy[];

export declare function collectTypeScriptImportFiles(
	packageDir: string,
	runtimeSourceRoots: string[],
): string[];

export declare function sourceImportsTypeScriptAtRuntime(
	source: string,
	filePath?: string,
): boolean;

export declare function getTypeScriptDependencyPlacement(
	packageJson: Record<string, unknown>,
): "dependencies" | "devDependencies" | "missing";

export declare function evaluateTypeScriptRuntimePackagePolicy(
	policy: TypeScriptRuntimePackagePolicy,
	input: {
		packedManifest: Record<string, unknown>;
		sourceManifest: Record<string, unknown>;
		typeScriptImportFiles: string[];
	},
): {
		errors: string[];
		packedPlacement: "dependencies" | "devDependencies" | "missing";
		sourcePlacement: "dependencies" | "devDependencies" | "missing";
		typeScriptImportFiles: string[];
	};
