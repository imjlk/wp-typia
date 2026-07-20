/** Dependency sections inspected for workspace protocol leaks. */
export type DependencyField =
	| "dependencies"
	| "devDependencies"
	| "optionalDependencies"
	| "peerDependencies";

/** Stable subset of npm pack --json metadata exposed to publish checks. */
export interface NpmPackMetadata {
	filename: string;
	name?: string;
	version?: string;
	entryCount?: number;
	size?: number;
	unpackedSize?: number;
	[key: string]: unknown;
}

/** Tarball location paired with the npm metadata produced for it. */
export interface PackedWorkspacePackage {
	metadata: NpmPackMetadata;
	tarballPath: string;
}

/** Absolute repository root containing the publish scripts. */
export declare const repoRoot: string;

/** Dependency sections inspected for workspace protocol leaks. */
export declare const DEPENDENCY_FIELDS: readonly DependencyField[];

/** Returns the platform-specific npm executable name. */
export declare function getNpmCommand(): string;

/** Returns the platform-specific tar executable name. */
export declare function getTarCommand(): string;

/** Reads and parses a JSON file from disk. */
export declare function readJson(filePath: string): unknown;

/** Resolves a workspace directory relative to the repository root. */
export declare function resolvePackageDir(packageDir: string): string;

/** Packs a workspace and returns both the tarball path and npm pack metadata. */
export declare function packWorkspacePackageDetailed(
	packageDir: string,
	destinationDir: string,
): PackedWorkspacePackage;

/** Packs a workspace and returns only the generated tarball path. */
export declare function packWorkspacePackage(
	packageDir: string,
	destinationDir: string,
): string;

/** Reads the package manifest embedded in an npm tarball. */
export declare function readPackedPackageManifest(
	tarballPath: string,
): unknown;

/** Lists dependency entries that still contain workspace protocol specs. */
export declare function findWorkspaceProtocolLeaks(
	packageJson: Record<string, unknown>,
): string[];

/** Runs a callback with an automatically cleaned temporary directory. */
export declare function withTempDir<T>(
	prefix: string,
	callback: (tempDir: string) => T,
): T;
