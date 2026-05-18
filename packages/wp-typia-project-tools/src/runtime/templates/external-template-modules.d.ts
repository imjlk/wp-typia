declare module "mustache" {
	interface MustacheStatic {
		escape: (value: string) => string;
		render(template: string, view?: Record<string, unknown>): string;
	}

	const Mustache: MustacheStatic;
	export default Mustache;
}

declare module "npm-package-arg" {
	interface Result {
		fetchSpec?: string;
		name?: string;
		raw: string;
		registry?: boolean;
		type: string;
	}

	function npa(spec: string): Result;

	export default npa;
}

declare module "semver" {
	interface SemVer {
		version: string;
	}

	interface SemVerModule {
		gte(version: string | SemVer, other: string | SemVer): boolean;
		maxSatisfying(versions: readonly string[], range: string): string | null;
		minVersion(range: string): SemVer | null;
	}

	const semver: SemVerModule;
	export default semver;
}
