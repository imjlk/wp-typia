import type { WordPressBlockApiCompatibilityEvaluation } from './compatibility.js';
import {
  createBindingSourceRegistrationPlan,
  type BindingSourceField,
  type BindingSourceRegistrationEntry,
  type DefinedBindingSource,
  type DefinedBlockBindingSourceMetadata,
} from './bindings-core.js';
import { normalizeStaticRegistrationValue } from './shared/static-registration.js';

export interface CreatePhpBindingSourceRegistrationSourceOptions {
  readonly functionName?: string;
  readonly hook?: string;
  readonly includeOpeningTag?: boolean;
  readonly textDomain?: string;
}

export interface CreateEditorBindingSourceRegistrationSourceOptions {
  readonly functionName?: string;
  readonly importSource?: string;
}

function getBindingEvaluation(
  metadata: DefinedBlockBindingSourceMetadata,
  feature: string,
): WordPressBlockApiCompatibilityEvaluation | undefined {
  return metadata.manifest.evaluations.find(
    (evaluation) =>
      evaluation.area === 'blockBindings' && evaluation.feature === feature,
  );
}

function shouldGenerateFeature(
  metadata: DefinedBlockBindingSourceMetadata,
  feature: string,
): boolean {
  const evaluation = getBindingEvaluation(metadata, feature);

  return evaluation?.action === 'generate';
}

function asSourceList(
  sources: DefinedBindingSource | readonly DefinedBindingSource[],
): readonly DefinedBindingSource[] {
  if (Array.isArray(sources)) {
    return sources;
  }

  return [sources as DefinedBindingSource];
}

function escapePhpSingleQuotedString(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'");
}

function phpString(value: string): string {
  return `'${escapePhpSingleQuotedString(value)}'`;
}

function phpStringArray(values: readonly string[]): string {
  return values.length === 0
    ? 'array()'
    : `array( ${values.map((value) => phpString(value)).join(', ')} )`;
}

const PHP_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

function sanitizePhpIdentifier(value: string): string {
  if (PHP_IDENTIFIER_PATTERN.test(value)) {
    return value;
  }

  const sanitized = value.replace(/[^A-Za-z0-9_]/gu, '_').replace(/_+/gu, '_');

  return /^[A-Za-z_]/u.test(sanitized) ? sanitized : `wp_typia_${sanitized}`;
}

function createPhpIdentifierHash(value: string): string {
  let hash = 0x811c9dc5;

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(36);
}

function createPhpSourceProperties(
  source: DefinedBindingSource,
  options: CreatePhpBindingSourceRegistrationSourceOptions,
): string[] {
  const properties: string[] = [];

  if (source.label) {
    const label = options.textDomain
      ? `__( ${phpString(source.label)}, ${phpString(options.textDomain)} )`
      : phpString(source.label);
    properties.push(`'label' => ${label}`);
  }
  if (source.usesContext && source.usesContext.length > 0) {
    properties.push(`'uses_context' => ${phpStringArray(source.usesContext)}`);
  }
  if (source.getValueCallback) {
    properties.push(
      `'get_value_callback' => ${phpString(source.getValueCallback)}`,
    );
  }

  return properties;
}

function createPhpBindableAttributeFilterSource(
  entries: readonly BindingSourceRegistrationEntry[],
  functionName: string,
): string[] {
  const lines: string[] = [];
  const targets = entries.flatMap((entry) =>
    (entry.source.bindableAttributes ?? []).map((target, index) => ({
      index,
      metadata: entry.metadata,
      sourceName: entry.source.name,
      target,
    })),
  );

  if (targets.length === 0) {
    return lines;
  }

  lines.push('');
  lines.push(
    "if ( function_exists( 'get_block_bindings_supported_attributes' ) ) {",
  );
  for (const [targetIndex, target] of targets.entries()) {
    if (!shouldGenerateFeature(target.metadata, 'supportedAttributesFilter')) {
      lines.push(
        `\t// block_bindings_supported_attributes requires WordPress 6.9+ for ${target.target.blockName}.`,
      );
      continue;
    }

    const callbackSeed = [
      functionName,
      target.sourceName,
      target.target.blockName,
      String(target.index),
      String(targetIndex),
    ].join('\0');
    const callbackName = sanitizePhpIdentifier(
      `${functionName}_${target.sourceName}_${target.target.blockName}_${target.index}_${targetIndex}_${createPhpIdentifierHash(
        callbackSeed,
      )}_supported_attributes`,
    );
    lines.push(
      `\tadd_filter( ${phpString(
        `block_bindings_supported_attributes_${target.target.blockName}`,
      )}, ${phpString(callbackName)} );`,
    );
    lines.push(`\tfunction ${callbackName}( $supported_attributes ) {`);
    lines.push(
      `\t\treturn array_values( array_unique( array_merge( $supported_attributes, ${phpStringArray(
        target.target.attributes,
      )} ) ) );`,
    );
    lines.push('\t}');
  }
  lines.push('}');

  return lines;
}

export function createPhpBindingSourceRegistrationSource(
  sources: DefinedBindingSource | readonly DefinedBindingSource[],
  options: CreatePhpBindingSourceRegistrationSourceOptions = {},
): string {
  const functionName = sanitizePhpIdentifier(
    options.functionName ?? 'wp_typia_register_block_binding_sources',
  );
  const hook = options.hook ?? 'init';
  const entries = createBindingSourceRegistrationPlan(asSourceList(sources));
  const lines: string[] = [];

  if (options.includeOpeningTag ?? false) {
    lines.push('<?php');
    lines.push('');
  }

  lines.push(`function ${functionName}() {`);
  lines.push(
    "\tif ( ! function_exists( 'register_block_bindings_source' ) ) {",
  );
  lines.push('\t\treturn;');
  lines.push('\t}');
  lines.push('');

  for (const entry of entries) {
    if (!shouldGenerateFeature(entry.metadata, 'serverRegistration')) {
      lines.push(
        `\t// register_block_bindings_source() requires WordPress 6.5+ for ${entry.source.name}.`,
      );
      continue;
    }

    const properties = createPhpSourceProperties(entry.source, options);
    lines.push(
      `\tregister_block_bindings_source( ${phpString(entry.source.name)}, array(`,
    );
    for (const property of properties) {
      lines.push(`\t\t${property},`);
    }
    lines.push('\t) );');
  }

  lines.push('}');
  lines.push(`add_action( ${phpString(hook)}, ${phpString(functionName)} );`);
  lines.push(...createPhpBindableAttributeFilterSource(entries, functionName));
  lines.push('');

  return lines.join('\n');
}

function createEditorRegistrationEntries(
  entries: readonly BindingSourceRegistrationEntry[],
): {
  readonly fields: Readonly<Record<string, readonly BindingSourceField[]>>;
  readonly sources: readonly unknown[];
  readonly skipped: readonly string[];
  readonly skippedFields: readonly string[];
} {
  const fields: Record<string, readonly BindingSourceField[]> = {};
  const skipped: string[] = [];
  const skippedFields: string[] = [];
  const sources: unknown[] = [];

  for (const entry of entries) {
    const editorEvaluation = getBindingEvaluation(
      entry.metadata,
      'editorRegistration',
    );

    if (editorEvaluation === undefined) {
      continue;
    }
    if (editorEvaluation.action !== 'generate') {
      skipped.push(entry.source.name);
      continue;
    }

    sources.push(
      normalizeStaticRegistrationValue(
        {
          label: entry.source.label,
          name: entry.source.name,
          usesContext: entry.source.usesContext,
        },
        `sources.${entry.source.name}`,
        { description: 'binding source' },
      ),
    );

    if ((entry.source.fields?.length ?? 0) === 0) {
      continue;
    }
    if (!shouldGenerateFeature(entry.metadata, 'editorFieldsList')) {
      skippedFields.push(entry.source.name);
      continue;
    }

    fields[entry.source.name] = normalizeStaticRegistrationValue(
      entry.source.fields,
      `fields.${entry.source.name}`,
      { description: 'binding source' },
    ) as readonly BindingSourceField[];
  }

  return {
    fields,
    skipped,
    skippedFields,
    sources,
  };
}

export function createEditorBindingSourceRegistrationSource(
  sources: DefinedBindingSource | readonly DefinedBindingSource[],
  options: CreateEditorBindingSourceRegistrationSourceOptions = {},
): string {
  const importSource = options.importSource ?? '@wordpress/blocks';
  const functionName = options.functionName ?? 'registerWpTypiaBindingSources';
  const entries = createBindingSourceRegistrationPlan(asSourceList(sources));
  const registration = createEditorRegistrationEntries(entries);
  if (registration.sources.length === 0) {
    return [
      '// No editor block binding sources were generated.',
      ...(registration.skipped.length > 0
        ? [
            `// Skipped editor registration for ${registration.skipped.join(
              ', ',
            )}; registerBlockBindingsSource() requires WordPress 6.7+.`,
          ]
        : []),
      '',
    ].join('\n');
  }

  const serializedSources = JSON.stringify(registration.sources, null, 2);
  const serializedFields = JSON.stringify(registration.fields, null, 2);
  const hasGeneratedFields = Object.keys(registration.fields).length > 0;
  const lines = [
    `import { registerBlockBindingsSource } from ${JSON.stringify(importSource)};`,
    '',
    `const sources = ${serializedSources};`,
    ...(hasGeneratedFields ? [`const fieldsBySource = ${serializedFields};`] : []),
    '',
    `export function ${functionName}() {`,
    '  if (typeof registerBlockBindingsSource !== "function") {',
    '    return;',
    '  }',
    '  for (const source of sources) {',
    ...(hasGeneratedFields
      ? [
          '    const fields = fieldsBySource[source.name];',
          '    registerBlockBindingsSource({',
          '      ...source,',
          '      ...(fields ? { getFieldsList: () => fields } : {}),',
          '    });',
        ]
      : ['    registerBlockBindingsSource(source);']),
    '  }',
    '}',
  ];

  if (registration.skipped.length > 0) {
    lines.push(
      '',
      `// Skipped editor registration for ${registration.skipped.join(
        ', ',
      )}; registerBlockBindingsSource() requires WordPress 6.7+.`,
    );
  }
  if (registration.skippedFields.length > 0) {
    lines.push(
      '',
      `// Skipped getFieldsList() for ${registration.skippedFields.join(
        ', ',
      )}; getFieldsList() requires WordPress 6.9+.`,
    );
  }
  lines.push('');

  return lines.join('\n');
}
