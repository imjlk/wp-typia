export interface I18nTextDomainOptions {
  allowedTextDomain?: string | readonly string[];
}

export type NoUnsafeWpApisOptions = Readonly<
  Record<`@wordpress/${string}`, readonly string[] | undefined>
>;

export interface NoUnsafeRenderOrderOptions {
  checkLocalImports?: boolean;
}

export interface NoUnusedVarsBeforeReturnOptions {
  /**
   * Go RE2 pattern matched against initializer call names. JavaScript-only
   * lookarounds and backreferences are not supported.
   */
  excludePattern?: string;
}
