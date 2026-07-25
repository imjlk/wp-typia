export interface ParsedChangesetEntry {
  packageId: string;
  releaseType: string;
}

export interface SampoChangesetValidationResult {
  allowedPackageIds: string[];
  errors: string[];
  files: string[];
  valid: boolean;
}

export interface SampoChangesetCoveragePackage {
  baseVersion: string | null;
  covered: boolean;
  coveredByVersionBump: boolean;
  currentVersion: string;
  packageDir: string;
  packageId: string;
  packageName: string;
  pendingReleaseType: string | null;
  releaseRelevantPaths: string[];
  versionChanged: boolean;
}

export interface SampoChangesetCoverageResult {
  baseCommit: string;
  changedPaths: string[];
  errors: string[];
  headCommit: string;
  packages: SampoChangesetCoveragePackage[];
  valid: boolean;
}

export interface RunCliOptions {
  argv?: string[];
  cwd?: string;
  stderr?: {
    write(chunk: string): unknown;
  };
  stdout?: {
    write(chunk: string): unknown;
  };
}

export declare function findPublishablePackageIds(repoRoot: string): string[];
export declare function parseChangesetFrontmatter(
	source: string,
	filePath?: string,
): ParsedChangesetEntry[];
export declare function toPosixRelativePath(
	repoRoot: string,
	targetPath: string,
): string;
export declare function validateSampoChangesets(
	repoRoot: string,
): SampoChangesetValidationResult;
export declare function validateSampoChangesetCoverage(
	repoRoot: string,
	options: {
		allowVersionBumps?: boolean;
		baseRef: string;
	},
): SampoChangesetCoverageResult;
export declare function runCli(options?: RunCliOptions): number;
