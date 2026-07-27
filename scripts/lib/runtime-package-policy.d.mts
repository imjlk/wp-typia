export interface RuntimePackageCoupling {
  dependencyName: string;
  dependentName: string;
  rangePolicy: string;
}

export declare const VERSION_POLICY_PRIORITY: Record<string, number>;
export declare const RANGE_POLICY: {
  caret: 'caret';
  exact: 'exact';
};
export declare const RUNTIME_PACKAGE_COUPLINGS: RuntimePackageCoupling[];
export declare const RUNTIME_PACKAGE_NAMES: string[];

export declare function compareVersions(left: string, right: string): number;
export declare function bumpVersion(
	version: string,
	releaseType: 'patch' | 'minor' | 'major',
): string;
export declare function renderPolicySpec(rangePolicy: string, version: string): string;
export declare function isPolicySpec(rangePolicy: string, spec: string): boolean;
export declare function specAllowsVersion(
	spec: string,
	version: string,
	rangePolicy: string,
): boolean;
export declare function getRequiredDependentReleaseType(
	dependencyCurrentVersion: string,
	dependencyNextVersion: string,
	rangePolicy: string,
): 'patch' | null;
