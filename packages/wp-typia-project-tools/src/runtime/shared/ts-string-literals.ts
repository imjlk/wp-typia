/** Canonical print width for generated TypeScript source. */
export const TYPESCRIPT_PRINT_WIDTH = 80;

/**
 * Quote arbitrary text as a single-quoted TypeScript string literal.
 *
 * The emitter intentionally does not use `JSON.stringify()` because JSON
 * always chooses double quotes, while generated TypeScript is checked by the
 * repository's single-quote formatting policy.
 *
 * @param value Raw string value.
 * @returns A TypeScript string literal that evaluates to `value`.
 */
export function quoteTypeScriptString(value: string): string {
  let escaped = '';

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const character = value[index] ?? '';

    switch (character) {
      case '\\':
        escaped += '\\\\';
        break;
      case "'":
        escaped += "\\'";
        break;
      case '\b':
        escaped += '\\b';
        break;
      case '\f':
        escaped += '\\f';
        break;
      case '\n':
        escaped += '\\n';
        break;
      case '\r':
        escaped += '\\r';
        break;
      case '\t':
        escaped += '\\t';
        break;
      case '\v':
        escaped += '\\v';
        break;
      default:
        if (
          code < 0x20 ||
          (code >= 0x7f && code <= 0x9f) ||
          code === 0x2028 ||
          code === 0x2029 ||
          (code >= 0xd800 && code <= 0xdfff)
        ) {
          escaped += `\\u${code.toString(16).padStart(4, '0')}`;
        } else {
          escaped += character;
        }
    }
  }

  return `'${escaped}'`;
}

/**
 * Render a stable multi-line TypeScript array of string literals.
 *
 * @param values String values to render.
 * @returns `[]` for an empty array, otherwise a two-space indented array.
 */
export function renderTypeScriptStringArray(
  values: readonly string[],
): string {
  if (values.length === 0) {
    return '[]';
  }

  return `[\n${values.map((value) => `  ${quoteTypeScriptString(value)},`).join('\n')}\n]`;
}

/**
 * Render a named TypeScript import using the canonical 80-column layout.
 *
 * @param names Imported binding names in their desired order.
 * @param moduleSpecifier Module specifier to quote.
 * @param options Import rendering options.
 * @returns A compact import when it fits, otherwise one binding per line.
 */
export function renderNamedTypeScriptImport(
  names: readonly string[],
  moduleSpecifier: string,
  options: { typeOnly?: boolean } = {},
): string {
  const importKeyword = options.typeOnly ? 'import type' : 'import';
  const quotedModuleSpecifier = quoteTypeScriptString(moduleSpecifier);
  const compact =
    `${importKeyword} { ${names.join(', ')} } from ${quotedModuleSpecifier};`;
  if (compact.length <= TYPESCRIPT_PRINT_WIDTH) {
    return compact;
  }

  return [
    `${importKeyword} {`,
    ...names.map((name) => `  ${name},`),
    `} from ${quotedModuleSpecifier};`,
  ].join('\n');
}

/**
 * Render a call expression on one line when it fits the generated-source
 * policy, otherwise place each argument on its own indented line.
 */
export function renderTypeScriptCallLine(options: {
  args: readonly string[];
  callee: string;
  indentation: string;
  prefix: string;
  suffix: string;
}): string {
  const compact =
    `${options.indentation}${options.prefix}${options.callee}(${options.args.join(', ')})${options.suffix}`;
  if (compact.length <= TYPESCRIPT_PRINT_WIDTH) {
    return compact;
  }

  return [
    `${options.indentation}${options.prefix}${options.callee}(`,
    ...options.args.map(
      (argument) => `${options.indentation}  ${argument},`,
    ),
    `${options.indentation})${options.suffix}`,
  ].join('\n');
}

/**
 * Render a print-width-aware exported const initialized by a one-argument call.
 */
export function renderTypeScriptConstCall(
  constName: string,
  callee: string,
  argument: string,
): string {
  const compact = `export const ${constName} = ${callee}(${argument});`;
  return compact.length <= TYPESCRIPT_PRINT_WIDTH
    ? compact
    : `export const ${constName} = ${callee}(\n  ${argument},\n);`;
}

const TYPESCRIPT_IDENTIFIER_PATTERN = /^[$A-Z_a-z][$\w]*$/u;

function indentTypeScriptValue(value: string, spaces: number): string {
  const indentation = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => `${indentation}${line}`)
    .join('\n');
}

/**
 * Render JSON-compatible data as a deterministic TypeScript expression.
 *
 * Unlike `JSON.stringify()`, emitted string literals follow the generated
 * project's single-quote policy. Objects and arrays use two-space indentation
 * and trailing commas so the result can be embedded directly in generated
 * modules checked by `ttsc`.
 *
 * @param value JSON-compatible data to render.
 * @returns A TypeScript expression preserving the input value.
 */
export function renderTypeScriptValue(
  value: unknown,
  maxInlineLength = TYPESCRIPT_PRINT_WIDTH,
): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return quoteTypeScriptString(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        'TypeScript value rendering requires finite numbers.',
      );
    }
    return Object.is(value, -0) ? '-0' : String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const renderedEntries = value.map((entry) =>
      renderTypeScriptValue(entry, maxInlineLength),
    );
    const compact = `[${renderedEntries.join(', ')}]`;
    if (
      compact.length <= maxInlineLength &&
      renderedEntries.every((entry) => !entry.includes('\n'))
    ) {
      return compact;
    }
    return `[\n${renderedEntries
      .map((entry) => `${indentTypeScriptValue(entry, 2)},`)
      .join('\n')}\n]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return '{}';
    }
    return `{\n${entries
      .map(([key, entry]) => {
        if (entry === undefined) {
          throw new TypeError(
            'TypeScript value rendering does not accept undefined properties.',
          );
        }
        const renderedKey = TYPESCRIPT_IDENTIFIER_PATTERN.test(key)
          ? key
          : quoteTypeScriptString(key);
        const renderedValue = renderTypeScriptValue(entry, maxInlineLength);
        const [firstLine = '', ...remainingLines] = renderedValue.split('\n');
        const lines = [
          `  ${renderedKey}: ${firstLine}`,
          ...remainingLines.map((line) => `  ${line}`),
        ];
        lines[lines.length - 1] = `${lines[lines.length - 1] ?? ''},`;
        return lines.join('\n');
      })
      .join('\n')}\n}`;
  }

  throw new TypeError(`Unsupported TypeScript value type: ${typeof value}.`);
}
