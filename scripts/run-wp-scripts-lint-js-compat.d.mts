export declare const LINT_CONFIG_FILES: readonly string[];

export declare const DEFAULT_LINT_EXTENSIONS: 'js,jsx,cjs,mjs';

export declare const TYPESCRIPT6_REGISTER_FILE: 'register-typescript6.cjs';

export declare function hasExplicitLintTargets(args: string[]): boolean;

export declare function insertPrettierRuleOverride(args: string[]): string[];

export declare function runWpScriptsLintJsCompat(options?: {
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): number;
