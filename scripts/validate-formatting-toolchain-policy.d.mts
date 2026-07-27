export interface FormattingToolchainPolicyResult {
  errors: string[];
  valid: boolean;
}

export declare const FORMATTING_TOOLCHAIN_POLICY: Readonly<{
  eslintJsVersion: '9.39.4';
  eslintVersion: '9.39.4';
  eslintConfigPrettierVersion: '10.1.8';
  exampleWpScriptsEslintVersion: '8.57.1';
  exampleWpScriptsLintJsScript: 'node ../../scripts/run-wp-scripts-lint-js-compat.mjs';
  exampleWpScriptsFormatScript: 'ttsc format --singleThreaded && node ../../scripts/run-wp-scripts-lint-js-compat.mjs --fix && prettier --write --no-error-on-unmatched-pattern "**/*.{css,json,md,scss,yaml,yml}" "*.{cjs,js,mjs}" "scripts/**/*.{cjs,js,mjs}"';
  examplePrettierCheckScript: 'prettier --check --no-error-on-unmatched-pattern "*.{cjs,js,mjs}" "scripts/**/*.{cjs,js,mjs}"';
  generatedWpScriptsLintJsScript: 'node scripts/run-wp-scripts-lint-js-compat.mjs';
  generatedWpScriptsFormatScript: 'ttsc format --singleThreaded && node scripts/run-wp-scripts-lint-js-compat.mjs --fix && prettier --write --no-error-on-unmatched-pattern "**/*.{css,json,md,scss,yaml,yml}" "*.{cjs,js,mjs}" "scripts/**/*.{cjs,js,mjs}"';
  generatedPrettierCheckScript: 'prettier --check --no-error-on-unmatched-pattern "*.{cjs,js,mjs}" "scripts/**/*.{cjs,js,mjs}"';
  generatedWpScriptsLintCssScript: 'wp-scripts lint-style --allow-empty-input';
  generatedTtscLintCompatScript: 'node scripts/apply-ttsc-lint-compat.mjs';
  generatedTtscLintCompatCanonicalTemplateRoot: 'packages/wp-typia-project-tools/templates/_shared/base';
  generatedTtscLintCompatTemplatePath: 'scripts/apply-ttsc-lint-compat.mjs.mustache';
  generatedReactDomTypesVersion: '^18.3.7';
  generatedReactDomVersion: '^18.3.1';
  generatedReactTypesVersion: '^18.3.28';
  generatedReactVersion: '^18.3.1';
  generatedTypeScriptImportResolverVersion: '^4.4.5';
  typescript6Version: '6.0.2';
  wpScriptsLintCompatRegisterPath: 'scripts/register-typescript6.cjs';
  wpScriptsLintCompatWrapperPath: 'scripts/run-wp-scripts-lint-js-compat.mjs';
  wpScriptsLintExtensions: 'js,jsx,cjs,mjs';
  prettierVersion: '3.8.2';
  generatedPrettierConfigPath: 'prettier.config.mjs';
  generatedPrettierConfig: Readonly<{
    useTabs: true;
    tabWidth: 4;
    printWidth: 80;
    singleQuote: true;
    trailingComma: 'es5';
    bracketSameLine: false;
    bracketSpacing: true;
    semi: true;
    arrowParens: 'always';
    overrides: readonly Readonly<{
      files: '*.{css,sass,scss}';
      options: Readonly<{
        singleQuote: false;
      }>;
    }>[];
  }>;
  rootFormatCheckScript: 'node scripts/check-repo-format.mjs';
  rootFormatWriteScript: 'ttsc format --singleThreaded && node scripts/check-repo-format.mjs --write';
  rootLintFixScript: 'eslint . --fix --max-warnings=0 && ttsc fix --singleThreaded';
  rootLintScript: 'eslint . --max-warnings=0';
  rootTypecheckScript: 'ttsc --noEmit';
  rootPolicyValidateScript: 'node scripts/validate-formatting-toolchain-policy.mjs';
  ttscLintVersion: '0.22.0';
  ttscVersion: '0.22.0';
  typiaVersion: '13.2.0';
  compatibilityPatches: Readonly<{
    '@ttsc/lint@0.22.0': 'patches/@ttsc%2Flint@0.22.0.patch';
    'typia@13.2.0': 'patches/typia@13.2.0.patch';
  }>;
  generatedPackageManifestPaths: readonly string[];
  generatedWpScriptsStyleLintManifestPaths: readonly string[];
  generatedTtscLintCompatTemplateRoots: readonly string[];
  generatedWpScriptsLintCompatTemplateRoots: readonly string[];
  workspaceExamplePackagePaths: readonly string[];
  wpScriptsExamplePackagePaths: readonly string[];
  ttscLintConfig: Readonly<{
    ignores: readonly string[];
    format: Readonly<{
      severity: 'error';
      printWidth: 80;
      tabWidth: 2;
      useTabs: false;
      semi: true;
      singleQuote: true;
      trailingComma: 'all';
      endOfLine: 'lf';
      sortImports: false;
      jsDoc: false;
    }>;
    rules: Readonly<{
      'no-var': 'error';
      'prefer-const': 'error';
      eqeqeq: 'error';
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
