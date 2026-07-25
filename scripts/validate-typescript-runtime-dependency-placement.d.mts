export interface TypeScriptRuntimeDependencyPlacementPackageResult {
  packageDir: string;
  packageName: string;
  packedPlacement: 'dependencies' | 'devDependencies' | 'missing';
  sourcePlacement: 'dependencies' | 'devDependencies' | 'missing';
  typeScriptImportFiles: string[];
  typescriptPlacement: 'dependency' | 'non-runtime';
}

export interface TypeScriptRuntimeDependencyPlacementValidationResult {
  errors: string[];
  packages: TypeScriptRuntimeDependencyPlacementPackageResult[];
  valid: boolean;
}

export interface RunCliOptions {
  cwd?: string;
  stderr?: {
    write(chunk: string): unknown;
  };
  stdout?: {
    write(chunk: string): unknown;
  };
}

export declare function validateTypeScriptRuntimeDependencyPlacement(
	repoRoot: string,
): TypeScriptRuntimeDependencyPlacementValidationResult;

export declare function runCli(options?: RunCliOptions): number;
