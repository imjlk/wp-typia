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
  excludePattern?: string;
}
