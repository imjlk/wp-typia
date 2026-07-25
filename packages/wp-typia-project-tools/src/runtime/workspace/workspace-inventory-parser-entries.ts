import ts from '@typescript/typescript6';

import { getPropertyNameText } from '../shared/ts-property-names.js';
import { parseVersionFloorParts } from '../shared/version-floor.js';
import {
  assertParsedInventoryEntry,
  type InventoryEntryFieldValue,
  type InventoryEntryParserDescriptor,
  type InventorySectionDescriptor,
} from './workspace-inventory-parser-validation.js';
import type { ScaffoldCompatibilityConfig } from '../templates/scaffold-compatibility.js';

function findExportedArrayLiteral(
	sourceFile: ts.SourceFile,
	exportName: string,
): {
  array: ts.ArrayLiteralExpression | null;
  found: boolean;
} {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    if (
			!statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
		) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
				!ts.isIdentifier(declaration.name) ||
				declaration.name.text !== exportName
			) {
        continue;
      }
      if (
				declaration.initializer &&
				ts.isArrayLiteralExpression(declaration.initializer)
			) {
        return {
          array: declaration.initializer,
          found: true,
        };
      }
      return {
        array: null,
        found: true,
      };
    }
  }

  return {
    array: null,
    found: false,
  };
}

function getOptionalStringProperty(
	entryName: string,
	elementIndex: number,
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
): string | undefined {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const propertyName = getPropertyNameText(property.name);
    if (propertyName !== key) {
      continue;
    }
    if (ts.isStringLiteralLike(property.initializer)) {
      return property.initializer.text;
    }
    throw new Error(
      `${entryName}[${elementIndex}] must use a string literal for "${key}" in scripts/block-config.ts.`,
    );
  }

  return undefined;
}

function getOptionalStringArrayProperty(
	entryName: string,
	elementIndex: number,
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
): string[] | undefined {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const propertyName = getPropertyNameText(property.name);
    if (propertyName !== key) {
      continue;
    }
    if (!ts.isArrayLiteralExpression(property.initializer)) {
      throw new Error(
        `${entryName}[${elementIndex}] must use an array literal for "${key}" in scripts/block-config.ts.`,
      );
    }

    return property.initializer.elements.map((element, itemIndex) => {
      if (!ts.isStringLiteralLike(element)) {
        throw new Error(
          `${entryName}[${elementIndex}].${key}[${itemIndex}] must use a string literal in scripts/block-config.ts.`,
        );
      }
      return element.text;
    });
  }

  return undefined;
}

function getOptionalBooleanProperty(
	entryName: string,
	elementIndex: number,
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
): boolean | undefined {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const propertyName = getPropertyNameText(property.name);
    if (propertyName !== key) {
      continue;
    }
    if (property.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      return true;
    }
    if (property.initializer.kind === ts.SyntaxKind.FalseKeyword) {
      return false;
    }
    throw new Error(
      `${entryName}[${elementIndex}] must use a boolean literal for "${key}" in scripts/block-config.ts.`,
    );
  }

  return undefined;
}

function findObjectPropertyExpression(
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
): ts.Expression | undefined {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    if (getPropertyNameText(property.name) === key) {
      return property.initializer;
    }
  }

  return undefined;
}

function getRequiredObjectLiteralProperty(
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
	context: string,
): ts.ObjectLiteralExpression {
  const expression = findObjectPropertyExpression(objectLiteral, key);
  if (!expression) {
    throw new Error(
      `${context}.${key} is required in scripts/block-config.ts.`,
    );
  }
  if (!ts.isObjectLiteralExpression(expression)) {
    throw new Error(
      `${context}.${key} must be an object literal in scripts/block-config.ts.`,
    );
  }
  return expression;
}

function getRequiredStringProperty(
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
	context: string,
): string {
  const expression = findObjectPropertyExpression(objectLiteral, key);
  if (!expression) {
    throw new Error(
      `${context}.${key} is required in scripts/block-config.ts.`,
    );
  }
  if (!ts.isStringLiteralLike(expression)) {
    throw new Error(
      `${context}.${key} must be a string literal in scripts/block-config.ts.`,
    );
  }
  return expression.text;
}

function getOptionalNestedStringProperty(
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
	context: string,
): string | undefined {
  const expression = findObjectPropertyExpression(objectLiteral, key);
  if (!expression) {
    return undefined;
  }
  if (!ts.isStringLiteralLike(expression)) {
    throw new Error(
      `${context}.${key} must be a string literal in scripts/block-config.ts.`,
    );
  }
  return expression.text;
}

function getOptionalVersionFloorProperty(
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
	context: string,
): string | undefined {
  const value = getOptionalNestedStringProperty(objectLiteral, key, context);
  if (value === undefined) {
    return undefined;
  }

  try {
    parseVersionFloorParts(value);
  } catch {
    throw new Error(
      `${context}.${key} must be a dotted numeric version such as "6.7" or "8.1.2" in scripts/block-config.ts.`,
    );
  }

  return value;
}

function getRequiredStringArrayProperty(
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
	context: string,
): string[] {
  const expression = findObjectPropertyExpression(objectLiteral, key);
  if (!expression) {
    throw new Error(
      `${context}.${key} is required in scripts/block-config.ts.`,
    );
  }
  if (!ts.isArrayLiteralExpression(expression)) {
    throw new Error(
      `${context}.${key} must be an array literal in scripts/block-config.ts.`,
    );
  }
  return expression.elements.map((element, itemIndex) => {
    if (!ts.isStringLiteralLike(element)) {
      throw new Error(
        `${context}.${key}[${itemIndex}] must be a string literal in scripts/block-config.ts.`,
      );
    }
    return element.text;
  });
}

function parseCompatibilityConfigLiteral(
	objectLiteral: ts.ObjectLiteralExpression,
	context: string,
): ScaffoldCompatibilityConfig {
  const hardMinimumsObject = getRequiredObjectLiteralProperty(
    objectLiteral,
    'hardMinimums',
    context,
  );
  const mode = getRequiredStringProperty(objectLiteral, 'mode', context);
  if (mode !== 'baseline' && mode !== 'optional' && mode !== 'required') {
    throw new Error(
      `${context}.mode must be baseline, optional, or required in scripts/block-config.ts.`,
    );
  }

  const php = getOptionalVersionFloorProperty(
    hardMinimumsObject,
    'php',
    `${context}.hardMinimums`,
  );
  const wordpress = getOptionalVersionFloorProperty(
    hardMinimumsObject,
    'wordpress',
    `${context}.hardMinimums`,
  );

  return {
    hardMinimums: {
      ...(php ? { php } : {}),
      ...(wordpress ? { wordpress } : {}),
    },
    mode,
    optionalFeatureIds: getRequiredStringArrayProperty(
      objectLiteral,
      'optionalFeatureIds',
      context,
    ),
    optionalFeatures: getRequiredStringArrayProperty(
      objectLiteral,
      'optionalFeatures',
      context,
    ),
    requiredFeatureIds: getRequiredStringArrayProperty(
      objectLiteral,
      'requiredFeatureIds',
      context,
    ),
    requiredFeatures: getRequiredStringArrayProperty(
      objectLiteral,
      'requiredFeatures',
      context,
    ),
    runtimeGates: getRequiredStringArrayProperty(
      objectLiteral,
      'runtimeGates',
      context,
    ),
  };
}

function getOptionalCompatibilityConfigProperty(
	entryName: string,
	elementIndex: number,
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
): ScaffoldCompatibilityConfig | undefined {
  const expression = findObjectPropertyExpression(objectLiteral, key);
  if (!expression) {
    return undefined;
  }
  if (!ts.isObjectLiteralExpression(expression)) {
    throw new Error(
      `${entryName}[${elementIndex}].${key} must be an object literal in scripts/block-config.ts.`,
    );
  }
  return parseCompatibilityConfigLiteral(
    expression,
    `${entryName}[${elementIndex}].${key}`,
  );
}

function parseInventoryEntries<T extends object>(
	arrayLiteral: ts.ArrayLiteralExpression,
	descriptor: InventoryEntryParserDescriptor,
): T[] {
  return arrayLiteral.elements.map((element, elementIndex) => {
		if (!ts.isObjectLiteralExpression(element)) {
			throw new Error(
				`${descriptor.entryName}[${elementIndex}] must be an object literal in scripts/block-config.ts.`,
			);
		}

		const entry: Record<string, InventoryEntryFieldValue> = {};
		for (const field of descriptor.fields) {
			const kind = field.kind ?? 'string';
			const value =
				kind === 'stringArray'
					? getOptionalStringArrayProperty(
							descriptor.entryName,
							elementIndex,
							element,
							field.key,
						)
					: kind === 'compatibilityConfig'
						? getOptionalCompatibilityConfigProperty(
								descriptor.entryName,
								elementIndex,
								element,
								field.key,
							)
					: kind === 'boolean'
						? getOptionalBooleanProperty(
								descriptor.entryName,
								elementIndex,
								element,
								field.key,
							)
						: getOptionalStringProperty(
								descriptor.entryName,
								elementIndex,
								element,
								field.key,
							);

			field.validate?.(value, {
				elementIndex,
				entryName: descriptor.entryName,
				key: field.key,
			});
			entry[field.key] = value;
		}

		assertParsedInventoryEntry<T>(entry, descriptor, elementIndex);
		return entry;
	});
}

/**
 * Parse one descriptor-backed inventory section from a TypeScript source file.
 *
 * The generic `T` is the typed entry shape returned in `entries`. The
 * `descriptor` supplies the exported array name, parser field metadata, and
 * whether the section is required; this helper uses `findExportedArrayLiteral`
 * and `parseInventoryEntries` to guarantee object-literal entries and literal
 * field values. It returns parsed entries plus a `found` flag, and throws when
 * required exports are missing, descriptors cannot resolve an export name, or
 * exported values are not array literals.
 */
export function parseInventorySection<T extends object>(
	sourceFile: ts.SourceFile,
	descriptor: InventorySectionDescriptor,
): {
  entries: T[];
  found: boolean;
} {
  if (!descriptor.parse) {
    return {
      entries: [],
      found: false,
    };
  }

  const exportName = descriptor.parse.exportName ?? descriptor.value?.name;
  if (!exportName) {
    throw new Error('Inventory parser descriptor is missing an export name.');
  }

  const exportedArray = findExportedArrayLiteral(sourceFile, exportName);
  if (!exportedArray.found) {
    if (descriptor.parse.required) {
      throw new Error(
        `scripts/block-config.ts must export a ${exportName} array.`,
      );
    }
    return {
      entries: [],
      found: false,
    };
  }
  if (!exportedArray.array) {
    if (descriptor.parse.required) {
      throw new Error(
        `scripts/block-config.ts must export a ${exportName} array.`,
      );
    }
    throw new Error(
      `scripts/block-config.ts must export ${exportName} as an array literal.`,
    );
  }

  return {
    entries: parseInventoryEntries<T>(
      exportedArray.array,
      descriptor.parse.entry,
    ),
    found: true,
  };
}
