export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ManifestTsKind = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'union';

export interface ManifestConstraints {
  exclusiveMaximum?: number | null;
  exclusiveMinimum?: number | null;
  format?: string | null;
  maxLength?: number | null;
  maxItems?: number | null;
  maximum?: number | null;
  minLength?: number | null;
  minItems?: number | null;
  minimum?: number | null;
  multipleOf?: number | null;
  pattern?: string | null;
  typeTag?: string | null;
}

export interface ManifestUnionMetadata {
  discriminator: string;
  branches: Record<string, ManifestAttribute>;
}

export interface ManifestTsMetadata {
  items?: ManifestAttribute | null;
  kind: ManifestTsKind;
  properties?: Record<string, ManifestAttribute> | null;
  required?: boolean;
  union?: ManifestUnionMetadata | null;
}

export interface ManifestTypiaMetadata {
  constraints: ManifestConstraints;
  defaultValue?: JsonValue | null;
  hasDefault?: boolean;
}

export interface ManifestWpMetadata {
  defaultValue?: JsonValue | null;
  enum?: JsonValue[] | null;
  hasDefault?: boolean;
	/**
	 * Indicates blank or empty secret submissions should preserve any stored
	 * value instead of clearing it.
	 */
  preserveOnEmpty?: boolean;
  selector?: string | null;
	/**
	 * Marks a field as containing sensitive data such as an API key or token.
	 * Secret fields are normally paired with `writeOnly` and excluded from
	 * response contracts.
	 */
  secret?: boolean;
	/**
	 * Optional companion response field that exposes masked state for a secret,
	 * for example `hasApiKey`, without returning the raw value.
	 */
  secretStateField?: string | null;
  source?: 'html' | 'text' | 'rich-text' | null;
  type?: string | null;
	/**
	 * Marks a field as accepted in writes but not returned to clients. When
	 * combined with `secret`, generated schemas describe the field as sensitive
	 * and write-only.
	 */
  writeOnly?: boolean;
}

export interface ManifestAttribute {
  ts: ManifestTsMetadata;
  typia: ManifestTypiaMetadata;
  wp: ManifestWpMetadata;
}

export interface ManifestDocument {
  attributes?: Record<string, ManifestAttribute>;
  manifestVersion?: number | null;
  sourceType?: string | null;
}

export interface MigrationRiskBucket {
  count: number;
  items: string[];
}

export interface MigrationRiskSummary {
  additive: MigrationRiskBucket;
  removal: MigrationRiskBucket;
  rename: MigrationRiskBucket;
  semanticTransform: MigrationRiskBucket;
  unionBreaking: MigrationRiskBucket;
}
