import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '@wp-typia/project-tools/cli-diagnostics';

import type { WpTypiaSchemaSource } from './config';

export type JSONSchema7Type =
  | 'array'
  | 'boolean'
  | 'integer'
  | 'null'
  | 'number'
  | 'object'
  | 'string';

export type JSONSchema7 = {
  additionalProperties?: boolean | JSONSchema7;
  allOf?: JSONSchema7[];
  anyOf?: JSONSchema7[];
  const?: unknown;
  default?: unknown;
  definitions?: Record<string, JSONSchema7>;
  description?: string;
  enum?: Array<boolean | null | number | string>;
  exclusiveMaximum?: number;
  exclusiveMinimum?: number;
  format?: string;
  items?: JSONSchema7 | JSONSchema7[];
  maxItems?: number;
  maxLength?: number;
  maximum?: number;
  minItems?: number;
  minLength?: number;
  minimum?: number;
  multipleOf?: number;
  not?: JSONSchema7;
  oneOf?: JSONSchema7[];
  pattern?: string;
  properties?: Record<string, JSONSchema7>;
  required?: string[];
  type?: JSONSchema7Type | JSONSchema7Type[];
  uniqueItems?: boolean;
};

export type MCPToolInputSchema = {
  additionalProperties?: boolean;
  properties?: Record<string, JSONSchema7>;
  required?: string[];
  type: 'object';
};

export type MCPTool = {
  description?: string;
  inputSchema?: MCPToolInputSchema;
  name: string;
};

export type MCPToolGroup = {
  namespace: string;
  tools: MCPTool[];
};

export type MCPCommandMetadata = {
  description?: string;
  name: string;
  namespace?: string;
  options: Record<
    string,
    {
      default?: unknown;
      description?: string;
      enumValues?: Array<number | string>;
      hasDefault?: boolean;
      maximum?: number;
      minimum?: number;
      required: boolean;
      short?: string;
      type: string;
    }
  >;
  toolName: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonSchema(value: unknown): value is JSONSchema7 {
  return isObject(value);
}

function isToolInputSchema(value: unknown): value is MCPToolInputSchema {
  return (
    isObject(value) &&
    value.type === 'object' &&
    (value.properties === undefined ||
      (isObject(value.properties) &&
        Object.values(value.properties).every(isJsonSchema))) &&
    (value.required === undefined ||
      (Array.isArray(value.required) &&
        value.required.every((entry) => typeof entry === 'string')))
  );
}

function isTool(value: unknown): value is MCPTool {
  return (
    isObject(value) &&
    typeof value.name === 'string' &&
    (value.description === undefined || typeof value.description === 'string') &&
    (value.inputSchema === undefined || isToolInputSchema(value.inputSchema))
  );
}

function isToolGroup(value: unknown): value is MCPToolGroup {
  return (
    isObject(value) &&
    typeof value.namespace === 'string' &&
    Array.isArray(value.tools) &&
    value.tools.every(isTool)
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorCauseOptions(error: unknown): ErrorOptions | undefined {
  return error instanceof Error ? { cause: error } : undefined;
}

export function toKebabCase(value: string): string {
  return value
    .replace(/_/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

export function toCommandName(toolName: string, namespace?: string): string {
  const commandName = toKebabCase(toolName);
  return namespace ? `${namespace}:${commandName}` : commandName;
}

export function toFlagName(propertyName: string): string {
  return toKebabCase(propertyName);
}

export function toPascalCase(value: string): string {
  return value
    .split(/[-:_]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join('');
}

export function escapeString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

async function readSchemaSource(
  cwd: string,
  source: WpTypiaSchemaSource,
): Promise<MCPToolGroup> {
  const schemaPath = path.resolve(cwd, source.path);
  const raw = await fs.readFile(schemaPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      `Schema source "${source.path}" must contain valid JSON. ${getErrorMessage(error)}`,
      getErrorCauseOptions(error),
    );
  }

  if (isToolGroup(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed) && parsed.every(isTool)) {
    return {
      namespace: source.namespace,
      tools: parsed,
    };
  }

  throw createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
    `Schema source "${source.path}" must contain either one MCPToolGroup object or an array of MCP tools.`,
  );
}

export async function loadMcpToolGroups(
  cwd: string,
  schemaSources: WpTypiaSchemaSource[],
): Promise<MCPToolGroup[]> {
  return Promise.all(schemaSources.map((source) => readSchemaSource(cwd, source)));
}

export function extractCommandMetadata(
  tool: MCPTool,
  namespace?: string,
  flagNameTransform: (name: string) => string = toFlagName,
): MCPCommandMetadata {
  const requiredFields = new Set(tool.inputSchema?.required ?? []);
  const options: MCPCommandMetadata['options'] = {};

  for (const [propertyName, schema] of Object.entries(
    tool.inputSchema?.properties ?? {},
  )) {
    const flagName = flagNameTransform(propertyName);
    const schemaType = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    const shortMatch = schema.description?.match(/^\[-([a-zA-Z])\]\s*/u);
    const short = shortMatch?.[1];
    const description = shortMatch
      ? schema.description?.slice(shortMatch[0].length)
      : schema.description;

    options[flagName] = {
      default: schema.default,
      description,
      enumValues: schema.enum?.filter(
        (value): value is number | string =>
          typeof value === 'string' || typeof value === 'number',
      ),
      hasDefault: schema.default !== undefined,
      maximum: schema.maximum,
      minimum: schema.minimum,
      required:
        requiredFields.has(propertyName) && schema.default === undefined,
      short,
      type: schemaType ?? 'unknown',
    };
  }

  return {
    description: tool.description,
    name: toCommandName(tool.name, namespace),
    namespace,
    options,
    toolName: tool.name,
  };
}

function jsonSchemaTypeToTypeScript(
  type: string,
  enumValues?: Array<number | string>,
): string {
  if (enumValues && enumValues.length > 0) {
    return enumValues
      .map((value) =>
        typeof value === 'string' ? `'${escapeString(value)}'` : String(value),
      )
      .join(' | ');
  }

  switch (type) {
    case 'array':
      return 'unknown[]';
    case 'boolean':
      return 'boolean';
    case 'integer':
    case 'number':
      return 'number';
    case 'null':
      return 'null';
    case 'object':
      return 'Record<string, unknown>';
    case 'string':
      return 'string';
    default:
      return 'unknown';
  }
}

function zodSchemaForOption(
  option: MCPCommandMetadata['options'][string],
): string {
  let schema: string;
  if (option.enumValues && option.enumValues.length > 0) {
    if (option.enumValues.every((value) => typeof value === 'string')) {
      schema = `z.enum([${option.enumValues
        .map((value) => `'${escapeString(String(value))}'`)
        .join(', ')}])`;
    } else {
      schema = `z.union([${option.enumValues
        .map((value) =>
          typeof value === 'string'
            ? `z.literal('${escapeString(value)}')`
            : `z.literal(${value})`,
        )
        .join(', ')}])`;
    }
  } else {
    switch (option.type) {
      case 'array':
        schema = 'z.array(z.unknown())';
        break;
      case 'boolean':
        schema = 'z.boolean()';
        break;
      case 'integer':
        schema = 'z.coerce.number().int()';
        break;
      case 'number':
        schema = 'z.coerce.number()';
        break;
      case 'object':
        schema = 'z.record(z.string(), z.unknown())';
        break;
      case 'string':
        schema = 'z.string()';
        break;
      default:
        schema = 'z.unknown()';
        break;
    }
  }

  if (option.minimum !== undefined) {
    schema += `.min(${option.minimum})`;
  }
  if (option.maximum !== undefined) {
    schema += `.max(${option.maximum})`;
  }
  if (option.hasDefault && option.default !== undefined) {
    const defaultValue =
      typeof option.default === 'string'
        ? `'${escapeString(option.default)}'`
        : JSON.stringify(option.default);
    schema += `.default(${defaultValue})`;
  }
  if (!option.required && !option.hasDefault) {
    schema += '.optional()';
  }

  return schema;
}

function generateCommandSchema(command: MCPCommandMetadata): string {
  const baseName = toPascalCase(command.name);
  const lines = [
    `// ${command.description || command.toolName}`,
    `export const ${baseName}Schema = z.object({`,
  ];

  for (const [flagName, option] of Object.entries(command.options)) {
    lines.push(`  '${flagName}': ${zodSchemaForOption(option)},`);
  }

  lines.push('})', '');
  lines.push(`export type ${baseName}Flags = {`);
  for (const [flagName, option] of Object.entries(command.options)) {
    const optional = option.required ? '' : '?';
    lines.push(
      `  '${flagName}'${optional}: ${jsonSchemaTypeToTypeScript(
        option.type,
        option.enumValues,
      )}`,
    );
  }
  lines.push('}');

  return lines.join('\n');
}

function generateNamespaceTypes(namespace: string, tools: MCPTool[]): string {
  const metadata = tools.map((tool) => extractCommandMetadata(tool, namespace));
  const lines = [
    '// This file was automatically generated by wp-typia.',
    '// DO NOT EDIT - changes will be overwritten.',
    '',
    "import { z } from 'zod';",
    '',
  ];

  for (const command of metadata) {
    lines.push(generateCommandSchema(command), '');
  }

  lines.push('export const commands = [');
  for (const command of metadata) {
    lines.push(
      `  ${JSON.stringify(
        {
          description: command.description,
          name: command.name,
          namespace: command.namespace,
          toolName: command.toolName,
        },
        null,
        2,
      )
        .split('\n')
        .join('\n  ')},`,
    );
  }
  lines.push('] as const;', '');

  return lines.join('\n');
}

function generateIndexFile(toolGroups: MCPToolGroup[]): string {
  const lines = [
    '// This file was automatically generated by wp-typia.',
    '// DO NOT EDIT - changes will be overwritten.',
    '',
  ];

  for (const group of toolGroups) {
    if (group.namespace && group.tools.length > 0) {
      lines.push(`export * from './mcp-${group.namespace}.gen.js';`);
    }
  }

  return lines.join('\n');
}

async function generateMcpTypes(
  groups: MCPToolGroup[],
  outputDir: string,
): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  for (const group of groups) {
    if (group.tools.length === 0) {
      continue;
    }
    await fs.writeFile(
      path.join(outputDir, `mcp-${group.namespace}.gen.ts`),
      generateNamespaceTypes(group.namespace, group.tools),
      'utf8',
    );
  }
  await fs.writeFile(
    path.join(outputDir, 'mcp-index.gen.ts'),
    generateIndexFile(groups),
    'utf8',
  );
}

export async function syncMcpSchemas(
  cwd: string,
  schemaSources: WpTypiaSchemaSource[],
  outputDir = path.join(cwd, '.wp-typia', 'mcp'),
): Promise<{
  commandCount: number;
  groups: MCPToolGroup[];
  outputDir: string;
}> {
  const groups = await loadMcpToolGroups(cwd, schemaSources);
  await generateMcpTypes(groups, outputDir);

  const registry = groups.map((group) => ({
    namespace: group.namespace,
    tools: group.tools.map((tool) => extractCommandMetadata(tool, group.namespace)),
  }));

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'registry.json'),
    `${JSON.stringify(registry, null, 2)}\n`,
    'utf8',
  );

  return {
    commandCount: registry.reduce(
      (count, group) => count + group.tools.length,
      0,
    ),
    groups,
    outputDir,
  };
}
