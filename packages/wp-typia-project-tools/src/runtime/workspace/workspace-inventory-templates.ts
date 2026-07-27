export const BLOCK_CONFIG_ENTRY_MARKER = '  // wp-typia add block entries';
export const VARIATION_CONFIG_ENTRY_MARKER =
  '  // wp-typia add variation entries';
export const BLOCK_STYLE_CONFIG_ENTRY_MARKER =
  '  // wp-typia add style entries';
export const BLOCK_TRANSFORM_CONFIG_ENTRY_MARKER =
  '  // wp-typia add transform entries';
export const PATTERN_CONFIG_ENTRY_MARKER = '  // wp-typia add pattern entries';
export const BINDING_SOURCE_CONFIG_ENTRY_MARKER =
  '  // wp-typia add binding-source entries';
export const CONTRACT_CONFIG_ENTRY_MARKER =
  '  // wp-typia add contract entries';
export const REST_RESOURCE_CONFIG_ENTRY_MARKER =
  '  // wp-typia add rest-resource entries';
/**
 * Marker used to append generated post-meta entries into `POST_META`.
 */
export const POST_META_CONFIG_ENTRY_MARKER =
  '  // wp-typia add post-meta entries';
export const ABILITY_CONFIG_ENTRY_MARKER = '  // wp-typia add ability entries';
export const AI_FEATURE_CONFIG_ENTRY_MARKER =
  '  // wp-typia add ai-feature entries';
export const ADMIN_VIEW_CONFIG_ENTRY_MARKER =
  '  // wp-typia add admin-view entries';
/**
 * Marker used to append generated editor-plugin entries into `EDITOR_PLUGINS`.
 */
export const EDITOR_PLUGIN_CONFIG_ENTRY_MARKER =
  '  // wp-typia add editor-plugin entries';

export const VARIATIONS_INTERFACE_SECTION = `

export interface WorkspaceVariationConfig {
  block: string;
  file: string;
  slug: string;
}
`;

export const VARIATIONS_CONST_SECTION = `

export const VARIATIONS: WorkspaceVariationConfig[] = [
  // wp-typia add variation entries
];
`;

export const BLOCK_STYLES_INTERFACE_SECTION = `

export interface WorkspaceBlockStyleConfig {
  block: string;
  file: string;
  slug: string;
}
`;

export const BLOCK_STYLES_CONST_SECTION = `

export const BLOCK_STYLES: WorkspaceBlockStyleConfig[] = [
  // wp-typia add style entries
];
`;

export const BLOCK_TRANSFORMS_INTERFACE_SECTION = `

export interface WorkspaceBlockTransformConfig {
  block: string;
  file: string;
  from: string;
  slug: string;
  to: string;
}
`;

export const BLOCK_TRANSFORMS_CONST_SECTION = `

export const BLOCK_TRANSFORMS: WorkspaceBlockTransformConfig[] = [
  // wp-typia add transform entries
];
`;

export const PATTERNS_INTERFACE_SECTION = `

export interface WorkspacePatternConfig {
  contentFile?: string;
  file?: string;
  scope?: 'full' | 'section';
  sectionRole?: string;
  slug: string;
  tags?: string[];
  thumbnailUrl?: string;
  title?: string;
}
`;

export const PATTERNS_CONST_SECTION = `

export const PATTERNS: WorkspacePatternConfig[] = [
  // wp-typia add pattern entries
];
`;

export const BINDING_SOURCES_INTERFACE_SECTION = `

export interface WorkspaceBindingSourceConfig {
  attribute?: string;
  block?: string;
  editorFile: string;
  metaPath?: string;
  postMeta?: string;
  serverFile: string;
  slug: string;
}
`;

export const BINDING_SOURCES_CONST_SECTION = `

export const BINDING_SOURCES: WorkspaceBindingSourceConfig[] = [
  // wp-typia add binding-source entries
];
`;

export const CONTRACTS_INTERFACE_SECTION = `

export interface WorkspaceContractConfig {
  schemaFile: string;
  slug: string;
  sourceTypeName: string;
  typesFile: string;
}
`;

export const CONTRACTS_CONST_SECTION = `

export const CONTRACTS: WorkspaceContractConfig[] = [
  // wp-typia add contract entries
];
`;

export const REST_RESOURCES_INTERFACE_SECTION = `

export interface WorkspaceRestResourceBaseConfig {
  apiFile: string;
  auth?: 'authenticated' | 'public' | 'public-write-protected';
  bodyTypeName?: string;
  clientFile: string;
  controllerClass?: string;
  controllerExtends?: string;
  namespace: string;
  openApiFile: string;
  permissionCallback?: string;
  restManifest?: ReturnType<
    typeof import('@wp-typia/block-runtime/metadata-core').defineEndpointManifest
  >;
  secretFieldName?: string;
  secretPreserveOnEmpty?: boolean;
  secretStateFieldName?: string;
  slug: string;
  typesFile: string;
  validatorsFile: string;
}

export interface GeneratedWorkspaceRestResourceConfig extends WorkspaceRestResourceBaseConfig {
  dataFile: string;
  methods: Array<'list' | 'read' | 'create' | 'update' | 'delete'>;
  mode?: 'generated';
  phpFile: string;
  routePattern?: string;
}

export interface ManualWorkspaceRestResourceConfig extends WorkspaceRestResourceBaseConfig {
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  methods: [];
  mode: 'manual';
  pathPattern: string;
  queryTypeName: string;
  responseTypeName: string;
}

export type WorkspaceRestResourceConfig =
  | GeneratedWorkspaceRestResourceConfig
  | ManualWorkspaceRestResourceConfig;
`;

export const REST_RESOURCES_CONST_SECTION = `

export const REST_RESOURCES: WorkspaceRestResourceConfig[] = [
  // wp-typia add rest-resource entries
];
`;

/**
 * Template inserted when repairing `WorkspacePostMetaConfig` in block-config.
 */
export const POST_META_INTERFACE_SECTION = `

export interface WorkspacePostMetaConfig {
  metaKey: string;
  phpFile: string;
  postType: string;
  schemaFile: string;
  showInRest: boolean;
  slug: string;
  sourceTypeName: string;
  typesFile: string;
}
`;

/**
 * Template inserted when repairing the `POST_META` inventory array.
 */
export const POST_META_CONST_SECTION = `

export const POST_META: WorkspacePostMetaConfig[] = [
  // wp-typia add post-meta entries
];
`;

export const WORKSPACE_COMPATIBILITY_CONFIG_FIELD = `  compatibility?: {
    hardMinimums: {
      php?: string;
      wordpress?: string;
    };
    mode: 'baseline' | 'optional' | 'required';
    optionalFeatureIds: string[];
    optionalFeatures: string[];
    requiredFeatureIds: string[];
    requiredFeatures: string[];
    runtimeGates: string[];
  };
`;

export const ABILITIES_INTERFACE_SECTION = `

export interface WorkspaceAbilityConfig {
  clientFile: string;
${WORKSPACE_COMPATIBILITY_CONFIG_FIELD}  configFile: string;
  dataFile: string;
  inputSchemaFile: string;
  inputTypeName: string;
  outputSchemaFile: string;
  outputTypeName: string;
  phpFile: string;
  slug: string;
  typesFile: string;
}
`;

export const ABILITIES_CONST_SECTION = `

export const ABILITIES: WorkspaceAbilityConfig[] = [
  // wp-typia add ability entries
];
`;

export const AI_FEATURES_INTERFACE_SECTION = `

export interface WorkspaceAiFeatureConfig {
  aiSchemaFile: string;
  apiFile: string;
  clientFile: string;
${WORKSPACE_COMPATIBILITY_CONFIG_FIELD}  dataFile: string;
  namespace: string;
  openApiFile: string;
  phpFile: string;
  restManifest?: ReturnType<
    typeof import('@wp-typia/block-runtime/metadata-core').defineEndpointManifest
  >;
  slug: string;
  typesFile: string;
  validatorsFile: string;
}
`;

export const AI_FEATURES_CONST_SECTION = `

export const AI_FEATURES: WorkspaceAiFeatureConfig[] = [
  // wp-typia add ai-feature entries
];
`;

export const ADMIN_VIEWS_INTERFACE_SECTION = `

export interface WorkspaceAdminViewConfig {
  file: string;
  phpFile: string;
  slug: string;
  source?: string;
}
`;

export const ADMIN_VIEWS_CONST_SECTION = `

export const ADMIN_VIEWS: WorkspaceAdminViewConfig[] = [
  // wp-typia add admin-view entries
];
`;

export const EDITOR_PLUGINS_INTERFACE_SECTION = `

export interface WorkspaceEditorPluginConfig {
  file: string;
  slug: string;
  slot: string;
}
`;

export const EDITOR_PLUGINS_CONST_SECTION = `

export const EDITOR_PLUGINS: WorkspaceEditorPluginConfig[] = [
  // wp-typia add editor-plugin entries
];
`;
