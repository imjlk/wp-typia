/** Installed-size limits enforced for one published package. */
export interface PublishPackageFootprintBudget {
  maxFileCount: number;
  maxUnpackedBytes: number;
}

/** Package-name keyed footprint policy for the complete release set. */
export interface PublishPackageFootprintBudgetMap {
  readonly '@wp-typia/api-client': Readonly<PublishPackageFootprintBudget>;
  readonly '@wp-typia/block-runtime': Readonly<PublishPackageFootprintBudget>;
  readonly '@wp-typia/block-types': Readonly<PublishPackageFootprintBudget>;
  readonly '@wp-typia/create-workspace-template': Readonly<PublishPackageFootprintBudget>;
  readonly '@wp-typia/dataviews': Readonly<PublishPackageFootprintBudget>;
  readonly '@wp-typia/project-tools': Readonly<PublishPackageFootprintBudget>;
  readonly '@wp-typia/rest': Readonly<PublishPackageFootprintBudget>;
  readonly '@wp-typia/ttsc-lint-plugin-wp': Readonly<PublishPackageFootprintBudget>;
  readonly 'wp-typia': Readonly<PublishPackageFootprintBudget>;
}

/** Name of a package covered by the publish footprint policy. */
export type PublishPackageName = keyof PublishPackageFootprintBudgetMap;

/** Workspace directory and expected package-name pair used while packing. */
export type PublishPackageChainEntry = readonly [
	packageDir: string,
	packageName: PublishPackageName,
];

/** npm pack metadata fields consumed by footprint validation. */
export interface PublishPackagePackMetadata {
  entryCount?: unknown;
  name?: unknown;
  size?: unknown;
  unpackedSize?: unknown;
  [key: string]: unknown;
}

/** Normalized footprint measurements, policy, and validation errors. */
export interface PublishPackageFootprintValidationResult {
  budget: Readonly<PublishPackageFootprintBudget> | null;
  compressedBytes: number | null;
  errors: string[];
  fileCount: number | null;
  packageName: string;
  unpackedBytes: number | null;
  valid: boolean;
}

/** Ordered workspace packages consumed by the packed-install release smoke. */
export declare const PUBLISH_PACKAGE_CHAIN: readonly PublishPackageChainEntry[];

/** Maximum installed footprint allowed for each published package. */
export declare const PUBLISH_PACKAGE_FOOTPRINT_BUDGETS: Readonly<PublishPackageFootprintBudgetMap>;

/** Validates npm pack metadata against the configured installed-size budgets. */
export declare function validatePublishPackageFootprint(
	metadata: PublishPackagePackMetadata,
	budgets?: Readonly<
		Partial<Record<string, Readonly<PublishPackageFootprintBudget>>>
	>,
): PublishPackageFootprintValidationResult;

/** Renders one validation result for the packed-install smoke summary. */
export declare function formatPublishPackageFootprintReport(
	result: PublishPackageFootprintValidationResult,
): string;
