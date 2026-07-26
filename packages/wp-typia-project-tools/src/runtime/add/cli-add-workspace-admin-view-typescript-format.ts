import { quoteTsString } from './cli-add-shared.js';
import {
  renderNamedTypeScriptImport,
  TYPESCRIPT_PRINT_WIDTH,
} from '../shared/ts-string-literals.js';

function getTypeScriptLineLength(line: string): number {
  return line.replace(/\t/gu, '  ').length;
}

export function renderNamedTypeScriptTypeImport(
  names: readonly string[],
  moduleSpecifier = './types',
): string {
  return renderNamedTypeScriptImport(names, moduleSpecifier, {
    typeOnly: true,
  });
}

export function renderNamedTypeScriptValueImport(
  names: readonly string[],
  moduleSpecifier: string,
): string {
  return renderNamedTypeScriptImport(names, moduleSpecifier);
}

export function renderTypeScriptConstDeclaration(
  binding: string,
  initializer: string,
): string {
  const compact = `  const ${binding} = ${initializer};`;
  return compact.length <= TYPESCRIPT_PRINT_WIDTH
    ? compact
    : `  const ${binding} =\n    ${initializer};`;
}

export function renderAdminViewQuerySource(options: {
  dataViewsName: string;
  properties: readonly string[];
  queryTypeName: string;
}): string {
  const compact =
    `  const query = ${options.dataViewsName}.toQueryArgs<${options.queryTypeName}>(view, {`;
  if (compact.length <= TYPESCRIPT_PRINT_WIDTH) {
    return [
      compact,
      ...options.properties.map((property) => `    ${property},`),
      '  });',
    ].join('\n');
  }

  return [
    `  const query = ${options.dataViewsName}.toQueryArgs<${options.queryTypeName}>(`,
    '    view,',
    '    {',
    ...options.properties.map((property) => `      ${property},`),
    '    },',
    '  );',
  ].join('\n');
}

export function wrapLongDataViewsDeclaration(
  source: string,
  dataViewsName: string,
  itemTypeName: string,
): string {
  const compact =
    `export const ${dataViewsName} = defineDataViews<${itemTypeName}>({`;
  if (compact.length <= TYPESCRIPT_PRINT_WIDTH) {
    return source;
  }

  const lines = source.split('\n');
  const declarationIndex = lines.indexOf(compact);
  if (declarationIndex < 0) {
    return source;
  }

  lines[declarationIndex] =
    `export const ${dataViewsName} =\n  defineDataViews<${itemTypeName}>({`;
  for (
    let index = declarationIndex + 1;
    index < lines.length;
    index += 1
  ) {
    lines[index] = `  ${lines[index] ?? ''}`;
    if (lines[index]?.trim() === '});') {
      break;
    }
  }
  return lines.join('\n');
}

export function wrapLongTranslationCalls(
  source: string,
  textDomain: string,
): string {
  const quotedTextDomain = quoteTsString(textDomain);
  const callEnd = `, ${quotedTextDomain})`;

  return source
    .split('\n')
    .flatMap((line) => {
      if (getTypeScriptLineLength(line) <= TYPESCRIPT_PRINT_WIDTH) {
        return [line];
      }

      const callStartIndex = line.indexOf('__(');
      const callEndIndex = line.lastIndexOf(callEnd);
      if (callStartIndex < 0 || callEndIndex <= callStartIndex + 3) {
        return [line];
      }

      const prefix = line.slice(0, callStartIndex);
      const indentationMatch = prefix.match(/^[ \t]*/u);
      const rawIndentation = indentationMatch?.[0] ?? '';
      const indentation = rawIndentation.replace(/\t/gu, '  ');
      const normalizedPrefix =
        indentation + prefix.slice(rawIndentation.length);
      const firstArgument = line.slice(callStartIndex + 3, callEndIndex);
      const suffix = line.slice(callEndIndex + callEnd.length);

      return [
        `${normalizedPrefix}__(`,
        `${indentation}  ${firstArgument},`,
        `${indentation}  ${quotedTextDomain},`,
        `${indentation})${suffix}`,
      ];
    })
    .join('\n');
}
