export interface FormattingToolchainPolicyResult {
  errors: string[];
  valid: boolean;
}

export declare const FORMATTING_TOOLCHAIN_POLICY: Readonly<{
  eslintJsVersion: '9.39.4';
  eslintVersion: '9.39.4';
  eslintConfigPrettierVersion: '10.1.8';
  exampleCodeCheckScript: 'bun run sync --check && ttsc check --noEmit';
  exampleCheckScript: 'bun run check:code && bun run check:style && bun run check:format';
  exampleStyleCheckScript: 'wp-scripts lint-style';
  exampleFormatCheckScript: 'prettier --check --no-error-on-unmatched-pattern "**/*.{css,json,md,scss,yaml,yml}" "*.{cjs,js,jsx,mjs}" "scripts/**/*.{cjs,js,jsx,mjs}" "src/**/*.{cjs,js,jsx,mjs}"';
  exampleWpScriptsFormatScript: 'ttsc format --singleThreaded && prettier --write --no-error-on-unmatched-pattern "**/*.{css,json,md,scss,yaml,yml}" "*.{cjs,js,jsx,mjs}" "scripts/**/*.{cjs,js,jsx,mjs}" "src/**/*.{cjs,js,jsx,mjs}"';
  generatedCodeCheckScript: 'bun run sync --check && ttsc check --noEmit';
  generatedQueryLoopCodeCheckScript: 'ttsc check --noEmit';
  generatedCheckScript: 'bun run check:code && bun run check:style && bun run check:format';
  generatedStyleCheckScript: 'wp-scripts lint-style --allow-empty-input';
  generatedFormatCheckScript: 'prettier --check --no-error-on-unmatched-pattern "**/*.{css,json,md,scss,yaml,yml}" "*.{cjs,js,jsx,mjs}" "scripts/**/*.{cjs,js,jsx,mjs}" "src/**/*.{cjs,js,jsx,mjs}"';
  generatedWpScriptsFormatScript: 'ttsc format --singleThreaded && prettier --write --no-error-on-unmatched-pattern "**/*.{css,json,md,scss,yaml,yml}" "*.{cjs,js,jsx,mjs}" "scripts/**/*.{cjs,js,jsx,mjs}" "src/**/*.{cjs,js,jsx,mjs}"';
  generatedTtscLintCompatScript: 'node scripts/apply-ttsc-lint-compat.mjs';
  generatedTtscLintCompatCanonicalTemplateRoot: 'packages/wp-typia-project-tools/templates/_shared/base';
  generatedTtscLintCompatTemplatePath: 'scripts/apply-ttsc-lint-compat.mjs.mustache';
  generatedReactDomTypesVersion: '^18.3.7';
  generatedReactDomVersion: '^18.3.1';
  generatedReactTypesVersion: '^18.3.28';
  generatedReactVersion: '^18.3.1';
  typescript6Version: '6.0.2';
  prettierVersion: '3.8.2';
  generatedPrettierConfigPath: 'prettier.config.mjs';
  generatedPrettierIgnorePath: '.prettierignore';
  generatedPrettierIgnorePatterns: readonly string[];
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
  generatedTtscLintFormat: Readonly<{
    severity: 'off';
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
  rootFormatCheckScript: 'node scripts/check-repo-format.mjs';
  rootFormatWriteScript: 'ttsc format --singleThreaded && node scripts/check-repo-format.mjs --write';
  rootLintFixScript: 'eslint . --fix --max-warnings=0 && ttsc fix --singleThreaded';
  rootLintScript: 'eslint . --max-warnings=0';
  rootTypecheckScript: 'ttsc --noEmit';
  rootPolicyValidateScript: 'node scripts/validate-formatting-toolchain-policy.mjs';
  ttscLintVersion: '0.26.1';
  ttscVersion: '0.26.1';
  typiaVersion: '13.2.0';
  compatibilityPatches: Readonly<{
    '@ttsc/lint@0.26.1': 'patches/@ttsc%2Flint@0.26.1.patch';
    'typia@13.2.0': 'patches/typia@13.2.0.patch';
  }>;
  generatedPackageManifestPaths: readonly string[];
  generatedWpScriptsStyleLintManifestPaths: readonly string[];
  generatedTtscLintCompatTemplateRoots: readonly string[];
  generatedWordPressTtscLintConfigPaths: readonly string[];
  generatedWordPressTtscLintPluginVersion: '{{ttscLintPluginWpPackageVersion}}';
  workspaceExamplePackagePaths: readonly string[];
  workspaceExampleStaticLintConfigPaths: readonly string[];
  workspaceWordPressLintConfigPaths: readonly string[];
  workspaceWordPressPrettierConfigPaths: readonly string[];
  workspaceWordPressPrettierIgnorePaths: readonly string[];
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
  workspaceExampleTtscLintConfig: Readonly<{
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
