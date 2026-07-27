export interface PlannedRuntimePackage {
  currentVersion: string;
  packageName: string;
  pendingReleaseType: 'patch' | 'minor' | 'major' | null;
  plannedVersion: string;
}

export interface RuntimePackageCouplingValidationResult {
  errors: string[];
  packages: PlannedRuntimePackage[];
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

export declare function collectPlannedRuntimePackages(
	repoRoot: string,
): Array<
	PlannedRuntimePackage & {
		absolutePackageDir: string;
		packageDir: string;
		packageId: string;
		packageJsonPath: string;
		version: string;
	}
>;

export declare function validateRuntimePackageCoupling(
	repoRoot: string,
): RuntimePackageCouplingValidationResult;

export declare function runCli(options?: RunCliOptions): number;
