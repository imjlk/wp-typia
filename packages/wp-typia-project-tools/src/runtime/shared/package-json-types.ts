export interface GeneratedPackageJson {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	packageManager?: string;
	scripts?: Record<string, string>;
	wpTypia?: {
		projectType?: string;
		templatePackage?: string;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}
