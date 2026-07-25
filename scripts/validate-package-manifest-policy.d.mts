export interface PackageManifestPolicyResult {
  errors: string[];
  valid: boolean;
}

export declare const ENGINE_BASELINE: Readonly<{
  bun: string;
  node: string;
  npm: string;
}>;

export declare const PACKAGE_MANAGER_BASELINE: string;

export declare const UNUSED_DEV_DEPENDENCIES: Readonly<
	Record<string, readonly string[]>
>;

export declare function validatePackageManifestPolicy(
	repoRoot?: string,
): PackageManifestPolicyResult;

export declare function runCli(options?: {
  cwd?: string;
  stdout?: { write(chunk: string): unknown };
  stderr?: { write(chunk: string): unknown };
}): number;
