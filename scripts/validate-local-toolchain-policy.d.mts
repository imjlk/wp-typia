export interface LocalToolchainPolicyResult {
  errors: string[];
  valid: boolean;
}

export declare const LOCAL_TOOLCHAIN_POLICY: Readonly<{
  ciVersions: Readonly<{
    bun: '1.3.11';
    node: '24';
    php: '8.1';
  }>;
  ciWorkflowFile: '.github/workflows/ci.yml';
  configFile: 'mise.toml';
  docs: Readonly<Record<string, readonly string[]>>;
  miseVersions: Readonly<{
    bun: '1.3.11';
    node: '24';
  }>;
  packageManager: 'bun@1.3.11';
  validateScript: 'bun scripts/validate-local-toolchain-policy.mjs';
}>;

export declare function validateLocalToolchainPolicy(
  repoRoot?: string,
): LocalToolchainPolicyResult;

export declare function runCli(options?: {
  cwd?: string;
  stdout?: { write(chunk: string): unknown };
  stderr?: { write(chunk: string): unknown };
}): 0 | 1;
