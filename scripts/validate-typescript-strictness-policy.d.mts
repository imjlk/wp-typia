export interface TypeScriptStrictnessPolicyResult {
  errors: string[];
  valid: boolean;
}

export declare const TYPESCRIPT_STRICTNESS_BASELINE: Readonly<{
  noFallthroughCasesInSwitch: true;
  noImplicitOverride: true;
  strict: true;
  useUnknownInCatchVariables: true;
}>;

export declare const TYPESCRIPT_STRICTNESS_DEFERRED_FLAGS: readonly [
	'exactOptionalPropertyTypes',
	'noImplicitReturns',
	'noPropertyAccessFromIndexSignature',
	'noUncheckedIndexedAccess',
];

export declare const TYPESCRIPT_STRICTNESS_POLICY_EXCEPTIONS: Readonly<
	Record<string, Readonly<Record<string, boolean>>>
>;

export declare function validateTypeScriptStrictnessPolicy(
	repoRoot?: string,
	policy?: {
		baseline?: Record<string, boolean>;
		deferredFlags?: readonly string[];
		exceptions?: Record<string, Record<string, boolean>>;
	},
): TypeScriptStrictnessPolicyResult;

export declare function runCli(options?: {
  cwd?: string;
  stdout?: { write(chunk: string): unknown };
  stderr?: { write(chunk: string): unknown };
}): 0 | 1;
