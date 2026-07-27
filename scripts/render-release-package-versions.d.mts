export interface ReleasePackageVersionChange {
  packageDir: string;
  packageName: string;
  previousVersion: string | null;
  nextVersion: string;
}

export interface CollectReleasePackageVersionsOptions {
  repoRoot?: string;
  baseRef?: string;
}

export function collectReleasePackageVersions(
	options?: CollectReleasePackageVersionsOptions,
): ReleasePackageVersionChange[];

export function renderReleasePackageVersionBlock(
	changes: ReadonlyArray<ReleasePackageVersionChange>,
): string;
