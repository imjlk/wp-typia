export interface ManifestAttribute {
  typia: {
    constraints: {
      exclusiveMaximum: number | null;
      exclusiveMinimum: number | null;
      format: string | null;
      maxLength: number | null;
      maxItems: number | null;
      maximum: number | null;
      minLength: number | null;
      minItems: number | null;
      minimum: number | null;
      multipleOf: number | null;
      pattern: string | null;
      typeTag: string | null;
    };
    defaultValue: unknown;
    hasDefault: boolean;
  };
  ts: {
    items: ManifestAttribute | null;
    kind: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'union';
    properties: Record<string, ManifestAttribute> | null;
    required: boolean;
    union: {
      branches: Record<string, ManifestAttribute>;
      discriminator: string;
    } | null;
  };
  wp: {
    defaultValue: unknown;
    enum: string[] | null;
    hasDefault: boolean;
    type: string;
  };
}

export function createManifestAttribute(
	kind: 'string' | 'number' | 'boolean' | 'array' | 'object',
	{
		defaultValue = null,
		required = true,
	}: {
		defaultValue?: unknown;
		required?: boolean;
	} = {},
): ManifestAttribute {
  return {
    typia: {
      constraints: {
        exclusiveMaximum: null,
        exclusiveMinimum: null,
        format: null,
        maxLength: null,
        maxItems: null,
        maximum: null,
        minLength: null,
        minItems: null,
        minimum: null,
        multipleOf: null,
        pattern: null,
        typeTag: null,
      },
      defaultValue,
      hasDefault: defaultValue !== null,
    },
    ts: {
      items: null,
      kind,
      properties: null,
      required,
      union: null,
    },
    wp: {
      defaultValue,
      enum: null,
      hasDefault: defaultValue !== null,
      type: kind,
    },
  };
}

export function createObjectBranchManifestAttribute(
	discriminator: string,
	branchKey: string,
	properties: Record<string, ManifestAttribute>,
	{
		required = true,
	}: {
		required?: boolean;
	} = {},
): ManifestAttribute {
  const branch = createManifestAttribute('object', {
    required,
  });

  branch.ts.properties = {
    [discriminator]: createManifestAttribute('string', {
      defaultValue: branchKey,
      required: true,
    }),
    ...properties,
  };

  return branch;
}

export function createUnionManifestAttribute(
	discriminator: string,
	branches: Record<string, ManifestAttribute>,
) {
  return {
    typia: {
      constraints: {
        exclusiveMaximum: null,
        exclusiveMinimum: null,
        format: null,
        maxLength: null,
        maxItems: null,
        maximum: null,
        minLength: null,
        minItems: null,
        minimum: null,
        multipleOf: null,
        pattern: null,
        typeTag: null,
      },
      defaultValue: null,
      hasDefault: false,
    },
    ts: {
      items: null,
      kind: 'union',
      properties: null,
      required: true,
      union: {
        branches,
        discriminator,
      },
    },
    wp: {
      defaultValue: null,
      enum: null,
      hasDefault: false,
      type: 'object',
    },
  };
}

export const HELPERS_SOURCE = `export type {
\tManifestAttribute,
\tManifestDocument,
} from '@wp-typia/block-runtime/migration-types';

export interface MigrationRiskBucket {
\tcount: number;
\titems: string[];
}

export interface MigrationRiskSummary {
\tadditive: MigrationRiskBucket;
\trename: MigrationRiskBucket;
\tsemanticTransform: MigrationRiskBucket;
\tunionBreaking: MigrationRiskBucket;
}

export type RenameMap = Record<string, string>;
export type TransformMap = Record<string, (legacyValue: unknown, legacyInput: Record<string, unknown>) => unknown>;

function getValueAtPath(input: Record<string, unknown>, path: string): unknown {
\treturn String(path)
\t\t.split(".")
\t\t.reduce((value: any, segment: string) => (value && typeof value === "object" ? value[segment] : undefined), input);
}

function createDefaultValue(attribute: any): unknown {
\tif (attribute?.typia?.hasDefault) {
\t\treturn attribute.typia.defaultValue;
\t}
\tswitch (attribute?.ts?.kind) {
\t\tcase "string":
\t\t\treturn "";
\t\tcase "number":
\t\t\treturn 0;
\t\tcase "boolean":
\t\t\treturn false;
\t\tcase "array":
\t\t\treturn [];
\t\tcase "object":
\t\t\treturn Object.fromEntries(
\t\t\t\tObject.entries(attribute.ts.properties ?? {}).map(([key, property]) => [key, createDefaultValue(property)]),
\t\t\t);
\t\tdefault:
\t\t\treturn null;
\t}
}

function coerceValue(attribute: any, value: unknown): unknown {
\treturn value ?? createDefaultValue(attribute);
}

export function resolveMigrationValue(
\tattribute: any,
\tcurrentKey: string,
\tfallbackPath: string,
\tinput: Record<string, unknown>,
\trenameMap: RenameMap,
\ttransforms: TransformMap,
): unknown {
\tconst sourcePath = renameMap[currentKey] ?? fallbackPath;
\tconst legacyValue = getValueAtPath(input, sourcePath);
\tconst transformedValue = transforms[currentKey] ? transforms[currentKey](legacyValue, input) : legacyValue;
\treturn coerceValue(attribute, transformedValue);
}

export function resolveMigrationAttribute(
\tattribute: any,
\tcurrentPath: string,
\tfallbackPath: string,
\tinput: Record<string, unknown>,
\trenameMap: RenameMap,
\ttransforms: TransformMap,
): unknown {
\tconst sourcePath = renameMap[currentPath] ?? fallbackPath;
\tif (attribute?.ts?.kind === "object") {
\t\treturn Object.fromEntries(
\t\t\tObject.entries(attribute.ts.properties ?? {}).map(([key, property]) => [
\t\t\t\tkey,
\t\t\t\tresolveMigrationAttribute(property, \`\${currentPath}.\${key}\`, \`\${sourcePath}.\${key}\`, input, renameMap, transforms),
\t\t\t]),
\t\t);
\t}
\tif (attribute?.ts?.kind === "union" && attribute?.ts?.union) {
\t\tconst legacyValue = getValueAtPath(input, sourcePath) as Record<string, unknown> | undefined;
\t\tconst branchKey = legacyValue?.[attribute.ts.union.discriminator];
\t\tif (typeof branchKey !== "string" || !(branchKey in attribute.ts.union.branches)) {
\t\t\treturn createDefaultValue(attribute);
\t\t}
\t\tconst branch = attribute.ts.union.branches[branchKey];
\t\treturn {
\t\t\t...Object.fromEntries(
\t\t\t\tObject.entries(branch.ts.properties ?? {})
\t\t\t\t\t.filter(([key]) => key !== attribute.ts.union.discriminator)
\t\t\t\t\t.map(([key, property]) => [
\t\t\t\t\t\tkey,
\t\t\t\t\t\tresolveMigrationAttribute(property, \`\${currentPath}.\${branchKey}.\${key}\`, \`\${sourcePath}.\${key}\`, input, renameMap, transforms),
\t\t\t\t\t]),
\t\t\t),
\t\t\t[attribute.ts.union.discriminator]: branchKey,
\t\t};
\t}
\treturn resolveMigrationValue(attribute, currentPath, fallbackPath, input, renameMap, transforms);
}
`;
