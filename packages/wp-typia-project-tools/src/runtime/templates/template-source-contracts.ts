import type { UnknownRecord } from '../shared/object-utils.js';

export type TemplateSourceFormat =
  | 'wp-typia'
  | 'create-block-external'
  | 'create-block-subset';

/**
 * Public template variables exposed to external template seeds before wp-typia
 * normalizes them into a scaffold project.
 */
export interface TemplateVariableContext extends UnknownRecord {
  /** Version string for `@wp-typia/api-client` used in generated dependencies. */
  apiClientPackageVersion: string;
  /** Version string for `@wp-typia/block-runtime` used in generated dependencies. */
  blockRuntimePackageVersion: string;
  /** Version string for `@wp-typia/block-types` used in generated dependencies. */
  blockTypesPackageVersion: string;
  /** Version string for `wp-typia` used when templates include the CLI binary locally. */
  wpTypiaPackageVersion: string;
  /** Version string for `@wp-typia/ttsc-lint-plugin-wp` used in generated dependencies. */
  ttscLintPluginWpPackageVersion: string;
  /** PascalCase block type name derived from the scaffold slug. */
  pascalCase: string;
  /** Snake_case PHP symbol prefix used for generated functions, constants, and keys. */
  phpPrefix: string;
  /** Human-readable block title. */
  title: string;
  /** Human-readable project or block description. */
  description: string;
  /** Keyword string derived from the slug for generated block metadata. */
  keyword: string;
  /** Block namespace used in generated block names such as `namespace/slug`. */
  namespace: string;
  /** Kebab-case scaffold slug used for package names, paths, and block slugs. */
  slug: string;
  /** Kebab-case text domain used for generated i18n strings and plugin headers. */
  textDomain: string;
}

export interface ResolvedTemplateSource {
  id: string;
  defaultCategory: string;
  description: string;
  features: string[];
  format: TemplateSourceFormat;
  isOfficialWorkspaceTemplate?: boolean;
  /**
   * True when the resolved template can participate in scaffold migration UI
   * seeding, such as rendered wp-typia workspace templates.
   */
  supportsMigrationUi?: boolean;
  templateDir: string;
  cleanup?: () => Promise<void>;
  selectedVariant?: string | null;
  warnings?: string[];
}

export interface GitHubTemplateLocator {
  owner: string;
  repo: string;
  ref: string | null;
  sourcePath: string;
}

export interface NpmTemplateLocator {
  fetchSpec: string;
  name: string;
  raw: string;
  rawSpec: string;
  type: string;
}

export interface ExternalTemplateConfig<
  TView extends UnknownRecord = TemplateVariableContext,
> {
  assetsPath?: string;
  blockTemplatesPath?: string;
  defaultValues?: Partial<TView>;
  folderName?: string;
  /**
   * Relative template root that renders a fuller wp-typia plugin/workspace
   * scaffold instead of a create-block subset.
   */
  pluginTemplatesPath?: string;
  transformer?: (view: TView) => UnknownRecord | Promise<UnknownRecord>;
  variants?: Record<string, Partial<TView>>;
}

export interface SeedSource {
  assetsDir?: string;
  blockDir: string;
  cleanup?: () => Promise<void>;
  formatHint?: 'create-block-subset' | 'wp-typia';
  rootDir: string;
  selectedVariant?: string | null;
  warnings?: string[];
}

export type RemoteTemplateLocator =
  | { kind: 'github'; locator: GitHubTemplateLocator }
  | { kind: 'npm'; locator: NpmTemplateLocator }
  | { kind: 'path'; templatePath: string };
