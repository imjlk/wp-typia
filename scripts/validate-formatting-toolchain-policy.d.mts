export interface FormattingToolchainPolicyResult {
  errors: string[];
  valid: boolean;
}

export declare const FORMATTING_TOOLCHAIN_POLICY: Readonly<{
  eslintJsVersion: "9.39.4";
  eslintVersion: "9.39.4";
  eslintConfigPrettierVersion: "10.1.8";
  exampleWpScriptsEslintVersion: "8.57.1";
  exampleWpScriptsLintJsScript: "node ../../scripts/run-wp-scripts-lint-js-compat.mjs";
  prettierVersion: "3.8.2";
  rootFormatCheckScript: "node scripts/check-repo-format.mjs";
  rootFormatWriteScript: "ttsc format --singleThreaded && node scripts/check-repo-format.mjs --write";
  rootLintFixScript: "eslint . --fix --max-warnings=0 && ttsc fix --singleThreaded";
  rootLintScript: "eslint . --max-warnings=0";
  rootTypecheckScript: "ttsc --noEmit";
  rootPolicyValidateScript: "node scripts/validate-formatting-toolchain-policy.mjs";
  ttscLintVersion: "0.21.0";
  ttscVersion: "0.21.0";
  generatedPackageManifestPaths: readonly string[];
  workspaceExamplePackagePaths: readonly string[];
  wpScriptsExamplePackagePaths: readonly string[];
  ttscLintConfig: Readonly<{
    ignores: readonly string[];
    format: Readonly<{
      severity: "error";
      printWidth: 80;
      tabWidth: 2;
      useTabs: false;
      semi: true;
      singleQuote: true;
      trailingComma: "all";
      endOfLine: "lf";
      sortImports: false;
      jsDoc: false;
    }>;
    rules: Readonly<{
      "no-var": "error";
      "prefer-const": "error";
      eqeqeq: "error";
    }>;
  }>;
}>;

export declare function validateFormattingToolchainPolicy(
  repoRoot?: string,
): FormattingToolchainPolicyResult;

export declare function runCli(options?: {
  cwd?: string;
  stdout?: { write(chunk: string): unknown };
  stderr?: { write(chunk: string): unknown };
}): 0 | 1;
