export interface I18nTextDomainOptions {
  allowedTextDomain?: string | readonly string[];
}

export type NoUnsafeWpApisOptions = Readonly<
  Record<`@wordpress/${string}`, readonly string[] | undefined>
>;

export interface NoUnsafeRenderOrderOptions {
  checkLocalImports?: boolean;
}

/** Dependency docblock grouping mode for wordpress/dependency-group. */
export type DependencyGroupOptions = 'always' | 'never';

/** Maps a module source to the required rename map for its imports: the inner
 * record keys are imported names and the values are the required local names. */
export type UseImportAsOptions = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

/** Shared options for the @wordpress/components usage rules. */
export interface WpComponentsRuleOptions {
  checkLocalImports?: boolean;
}

export interface NoUnusedVarsBeforeReturnOptions {
  /**
   * Go RE2 pattern matched against initializer call names. JavaScript-only
   * lookarounds and backreferences are not supported.
   */
  excludePattern?: string;
}
